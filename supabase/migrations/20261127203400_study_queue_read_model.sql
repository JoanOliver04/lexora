-- One row per eligible practice item, including new items without a learning state.
-- SECURITY INVOKER keeps the same owner/course constraints and RLS as normal study.
create or replace function public.study_queue_items(p_owner_id uuid, p_course_id uuid, p_deck_ids uuid[] default null)
returns table(item_id uuid, state_id uuid, phase public.memory_phase, due_at timestamptz,
  revision integer, lapses integer, stability double precision, last_reviewed_at timestamptz,
  scheduler_version text, config_version text)
language sql stable security invoker set search_path = '' as $$
  select i.id, s.id, s.phase, date_trunc('milliseconds', s.due_at), s.revision, s.lapses, s.stability,
         s.last_reviewed_at, s.scheduler_version, s.config_version
  from public.practice_items i
  join public.concepts c on c.id = i.concept_id and c.owner_id = i.owner_id
  left join public.learning_states s on s.practice_item_id = i.id and s.owner_id = i.owner_id
  where i.owner_id = p_owner_id and p_owner_id = (select auth.uid()) and c.course_id = p_course_id
    and i.enabled and i.archived_at is null and c.archived_at is null
    and (i.mode in ('basic_recognition', 'basic_recall', 'cloze') or i.config->'exercise' is not null)
    and exists (
      select 1 from public.deck_concepts dc join public.decks d
        on d.id = dc.deck_id and d.owner_id = dc.owner_id
      where dc.concept_id = c.id and dc.owner_id = c.owner_id and d.course_id = p_course_id
        and d.archived_at is null and (p_deck_ids is null or d.id = any(p_deck_ids))
    );
$$;

create or replace function public.study_queue_counts(p_owner_id uuid, p_course_id uuid, p_now timestamptz,
  p_deck_ids uuid[] default null, p_include_difficulty boolean default false)
returns table(learning_due bigint, reviews_due bigint, new_items bigint, difficult_items bigint,
  next_due timestamptz, next_learning_due timestamptz)
language sql stable security invoker set search_path = '' as $$
  select count(*) filter (where i.phase in ('learning','relearning') and i.due_at <= p_now),
    count(*) filter (where i.phase = 'review' and i.due_at <= p_now),
    count(*) filter (where i.phase is null or i.phase = 'new'),
    count(*) filter (where case when not p_include_difficulty or i.state_id is null then false
      when i.lapses >= 3 then true else (
        select count(*) filter (where recent.rating = 'again') >= 2 from (
          select r.rating from public.review_logs r
          where r.owner_id = p_owner_id and r.practice_item_id = i.item_id and r.reviewed_at <= p_now
          order by r.reviewed_at desc, r.id desc limit 3
        ) recent
      ) end),
    min(i.due_at) filter (where i.phase in ('learning','relearning','review') and i.due_at > p_now),
    min(i.due_at) filter (where i.phase in ('learning','relearning') and i.due_at > p_now)
  from public.study_queue_items(p_owner_id, p_course_id, p_deck_ids) i;
$$;

create or replace function public.study_day_activity(p_owner_id uuid, p_course_id uuid, p_start timestamptz, p_end timestamptz)
returns table(new_introduced bigint, reviews_done bigint)
language sql stable security invoker set search_path = '' as $$
  select count(distinct r.practice_item_id) filter (where r.state_before->>'phase' = 'new'),
         count(*) filter (where r.state_before->>'phase' = 'review')
    from public.review_logs r
    join public.practice_items i on i.id = r.practice_item_id and i.owner_id = r.owner_id
    join public.concepts c on c.id = i.concept_id and c.owner_id = i.owner_id
   where r.owner_id = p_owner_id and p_owner_id = (select auth.uid()) and c.course_id = p_course_id
     and r.reviewed_at >= p_start and r.reviewed_at < p_end;
$$;

revoke all on function public.study_queue_items(uuid, uuid, uuid[]),
  public.study_queue_counts(uuid, uuid, timestamptz, uuid[], boolean),
  public.study_day_activity(uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.study_queue_items(uuid, uuid, uuid[]),
  public.study_queue_counts(uuid, uuid, timestamptz, uuid[], boolean),
  public.study_day_activity(uuid, uuid, timestamptz, timestamptz) to authenticated;

-- When the review cap is binding, ask ts-fsrs to evaluate distinct inputs.
-- IDs and state details stay in PostgreSQL until their queue slots have been selected.
create or replace function public.study_review_priority_inputs(p_owner_id uuid, p_course_id uuid,
  p_now timestamptz, p_reference timestamptz, p_scheduler text, p_config text, p_deck_ids uuid[] default null)
returns table(stability double precision, elapsed_days integer)
language sql stable security invoker set search_path = '' as $$
  select distinct i.stability,
    floor(extract(epoch from p_reference - date_trunc('milliseconds', i.last_reviewed_at)) / 86400)::integer
  from public.study_queue_items(p_owner_id, p_course_id, p_deck_ids) i
  where i.phase = 'review' and i.due_at <= p_now and i.scheduler_version = p_scheduler
    and i.config_version = p_config and i.stability > 0 and i.stability < 'Infinity'::float8
    and date_trunc('milliseconds', i.last_reviewed_at) <= p_reference
  order by 1,2;
$$;

create or replace function public.study_ranked_reviews(p_owner_id uuid, p_course_id uuid,
  p_now timestamptz, p_reference timestamptz, p_scheduler text, p_config text,
  p_limit integer, p_scores jsonb, p_deck_ids uuid[] default null)
returns table(slot bigint, item_id uuid, state_id uuid, phase public.memory_phase, due_at timestamptz, revision integer)
language sql stable security invoker set search_path = '' as $$
  with scores as (
    select * from jsonb_to_recordset(p_scores) as x(stability float8, elapsed_days integer, recall float8)
  ), scored as materialized (
    select i.item_id, i.state_id, i.phase, i.due_at, i.revision, s.recall
    from public.study_queue_items(p_owner_id, p_course_id, p_deck_ids) i
    left join scores s on s.stability = i.stability and s.elapsed_days =
      floor(extract(epoch from p_reference - date_trunc('milliseconds', i.last_reviewed_at)) / 86400)
      and i.scheduler_version = p_scheduler and i.config_version = p_config
    where i.phase = 'review' and i.due_at <= p_now
  ), earliest as (
    select * from scored order by due_at, item_id limit greatest(p_limit, 0)
  ), slots as (
    select e.*, row_number() over w as slot, count(recall) over w as scored_slot
    from earliest e window w as (order by due_at, item_id)
  ), ranked as (
    select s.*, row_number() over (order by s.recall, s.due_at, s.item_id) as n
    from scored s where s.recall is not null order by s.recall, s.due_at, s.item_id
    limit greatest(p_limit, 0)
  )
  select e.slot, coalesce(r.item_id,e.item_id), coalesce(r.state_id,e.state_id), e.phase,
    coalesce(r.due_at,e.due_at), coalesce(r.revision,e.revision)
  from slots e left join ranked r on e.recall is not null and r.n = e.scored_slot
  order by e.slot;
$$;
revoke all on function public.study_review_priority_inputs(uuid,uuid,timestamptz,timestamptz,text,text,uuid[]),
  public.study_ranked_reviews(uuid,uuid,timestamptz,timestamptz,text,text,integer,jsonb,uuid[]) from public, anon;
grant execute on function public.study_review_priority_inputs(uuid,uuid,timestamptz,timestamptz,text,text,uuid[]),
  public.study_ranked_reviews(uuid,uuid,timestamptz,timestamptz,text,text,integer,jsonb,uuid[]) to authenticated;
