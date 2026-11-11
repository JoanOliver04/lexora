-- Read-only aggregate. Invoker permissions and the original table RLS apply.
-- No owner argument and no privileged key: identity comes from the JWT.
create or replace function public.study_statistics(
  p_course_id uuid,
  p_days integer,
  p_now timestamptz,
  p_timezone text,
  p_deck_id uuid default null
) returns jsonb
language plpgsql stable security invoker
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_owner uuid := auth.uid();
  v_start timestamptz;
  v_today date;
  v_result jsonb;
begin
  if v_owner is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  if p_days is null or p_days not in (7, 30, 90) or p_now is null or not isfinite(p_now)
     or p_now > now() + interval '1 minute' or p_timezone is null
     or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise invalid_parameter_value using message = 'Invalid statistics period';
  end if;
  if not exists (select 1 from public.courses where id = p_course_id and owner_id = v_owner)
    or (p_deck_id is not null and not exists (
      select 1 from public.decks where id = p_deck_id and owner_id = v_owner and course_id = p_course_id
    )) then raise insufficient_privilege using message = 'Course or deck unavailable'; end if;
  v_today := (p_now at time zone p_timezone)::date;
  v_start := (v_today - (p_days - 1))::timestamp at time zone p_timezone;

  with period_logs as materialized (
    select r.id, r.rating, r.reviewed_at, r.duration_ms,
      c.kind::text as kind, coalesce(c.cefr_level::text, 'unassigned') as level
    from public.review_logs r
    join public.practice_items i on i.id = r.practice_item_id and i.owner_id = v_owner
    join public.concepts c on c.id = i.concept_id and c.owner_id = v_owner
    where r.owner_id = v_owner and c.course_id = p_course_id
      and r.reviewed_at >= least(v_start, p_now - interval '30 days') and r.reviewed_at <= p_now
      and (p_deck_id is null or exists (
        select 1 from public.deck_concepts dc where dc.concept_id = c.id and dc.deck_id = p_deck_id and dc.owner_id = v_owner
      ))
  ), activity as (
    select (reviewed_at at time zone p_timezone)::date as day, rating,
      count(*)::integer as count,
      coalesce(sum(duration_ms), 0)::bigint as duration_ms,
      count(duration_ms)::integer as measured
    from period_logs where reviewed_at >= v_start group by day, rating
  ), eligible as materialized (
    select i.id, i.concept_id, i.mode, c.title,
      c.kind::text as kind, coalesce(c.cefr_level::text, 'unassigned') as level,
      coalesce(s.phase, 'new'::public.memory_phase) as phase, s.due_at,
      coalesce(s.lapses, 0) as lapses
    from public.practice_items i
    join public.concepts c on c.id = i.concept_id and c.owner_id = v_owner
    left join public.learning_states s on s.practice_item_id = i.id and s.owner_id = v_owner
    where i.owner_id = v_owner and c.course_id = p_course_id
      and i.enabled and i.archived_at is null and c.archived_at is null
      and i.mode in ('basic_recognition', 'basic_recall', 'cloze')
      and exists (
        select 1 from public.deck_concepts dc
        join public.decks d on d.id = dc.deck_id and d.owner_id = v_owner
        where dc.owner_id = v_owner and dc.concept_id = c.id and d.archived_at is null
          and (p_deck_id is null or d.id = p_deck_id)
      )
  ), signals as (
    select e.*, (
      select count(*)::integer from (
        select r.rating from public.review_logs r
        where r.owner_id = v_owner and r.practice_item_id = e.id and r.reviewed_at <= p_now
        order by r.reviewed_at desc, r.id desc limit 3
      ) recent where recent.rating = 'again'
    ) as recent_again from eligible e
  ), difficult as materialized (
    select id, concept_id, mode, title, lapses, recent_again from signals
    where lapses >= 3 or recent_again >= 2
  ), forecast as (
    select (due_at at time zone p_timezone)::date as day, count(*)::integer as count
    from eligible where phase <> 'new' and due_at > p_now
      and due_at < ((v_today + 7)::timestamp at time zone p_timezone)
    group by day
  ), kind_states as (
    select kind as key, jsonb_build_object(
      'new', count(*) filter (where phase = 'new'),
      'learning', count(*) filter (where phase = 'learning'),
      'review', count(*) filter (where phase = 'review'),
      'relearning', count(*) filter (where phase = 'relearning')) as states
    from eligible group by kind
  ), level_states as (
    select level as key, jsonb_build_object(
      'new', count(*) filter (where phase = 'new'),
      'learning', count(*) filter (where phase = 'learning'),
      'review', count(*) filter (where phase = 'review'),
      'relearning', count(*) filter (where phase = 'relearning')) as states
    from eligible group by level
  ), kind_activity as (
    select kind as key, count(*) as reviews from period_logs
    where reviewed_at >= v_start group by kind
  ), level_activity as (
    select level as key, count(*) as reviews from period_logs
    where reviewed_at >= v_start group by level
  ), by_kind as (
    select coalesce(s.key, a.key) as key,
      coalesce(s.states, '{"new":0,"learning":0,"review":0,"relearning":0}'::jsonb) as states,
      coalesce(a.reviews, 0) as reviews
    from kind_states s full outer join kind_activity a on a.key = s.key
  ), by_level as (
    select coalesce(s.key, a.key) as key,
      coalesce(s.states, '{"new":0,"learning":0,"review":0,"relearning":0}'::jsonb) as states,
      coalesce(a.reviews, 0) as reviews
    from level_states s full outer join level_activity a on a.key = s.key
  ), phases as (
    select phase, count(*)::integer as count from eligible group by phase
  )
  select jsonb_build_object(
    'by_kind', coalesce((select jsonb_agg(to_jsonb(k) order by key) from by_kind k), '[]'::jsonb),
    'by_level', coalesce((select jsonb_agg(to_jsonb(l) order by key) from by_level l), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(to_jsonb(a) order by day, rating) from activity a), '[]'::jsonb),
    'states', coalesce((select jsonb_agg(to_jsonb(s)) from phases s), '[]'::jsonb),
    'lapses', coalesce((select sum(lapses) from eligible), 0),
    'overdue', (select count(*) from eligible where phase <> 'new' and due_at <= p_now),
    'forecast', coalesce((select jsonb_agg(to_jsonb(f) order by day) from forecast f), '[]'::jsonb),
    'difficult', coalesce((select jsonb_agg(to_jsonb(d) order by lapses desc, recent_again desc, id) from (
      select * from difficult order by lapses desc, recent_again desc, id limit 20
    ) d), '[]'::jsonb),
    'difficult_total', (select count(*) from difficult),
    'durations', coalesce((select jsonb_agg(duration_ms) from (
      select duration_ms from period_logs where duration_ms > 0
        and reviewed_at >= p_now - interval '30 days'
      order by reviewed_at desc, id desc limit 100
    ) durations), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.study_statistics(uuid, integer, timestamptz, text, uuid) from public, anon;
grant execute on function public.study_statistics(uuid, integer, timestamptz, text, uuid) to authenticated;
comment on function public.study_statistics is 'Read-only, RLS-protected period aggregates and current eligible memory states. No CEFR or retrievability claim.';
