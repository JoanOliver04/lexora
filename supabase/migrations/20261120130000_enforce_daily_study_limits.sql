-- LEX-22.11: apply daily limits to scheduled reviews in their write transaction.
-- Existing data, RPC signature, INVOKER privileges and replay behavior are preserved.
-- Rollback: restore the definition from 20261016120000_session_commit_guard.sql.

create or replace function public.commit_review(
  p_practice_item_id   uuid,
  p_expected_revision  integer,
  p_idempotency_key    text,
  p_rating             public.review_rating,
  p_reviewed_at        timestamptz,
  p_due_at             timestamptz,
  p_stability          double precision,
  p_difficulty         double precision,
  p_scheduled_days     integer,
  p_learning_step      integer,
  p_reps               integer,
  p_lapses             integer,
  p_phase              public.memory_phase,
  p_last_reviewed_at   timestamptz,
  p_scheduler_version  text,
  p_config_version     text,
  p_state_before       jsonb,
  p_state_after        jsonb,
  p_due_before         timestamptz,
  p_due_after          timestamptz,
  p_study_session_id   uuid default null,
  p_duration_ms        integer default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_state  public.learning_states%rowtype;
  v_log    public.review_logs%rowtype;
  v_session_status public.study_session_status;
  v_course_id uuid;
  v_limit integer;
  v_time_zone text;
  v_local_day date;
  v_utc_midnight timestamptz;
  v_consumed bigint;
begin
  if v_uid is null then
    raise exception 'commit_review requires an authenticated session'
      using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_uid::text),
    hashtext(p_idempotency_key)
  );

  select * into v_log
    from public.review_logs
   where owner_id = v_uid
     and idempotency_key = p_idempotency_key;

  if found then
    select * into v_state
      from public.learning_states
     where owner_id = v_uid
       and practice_item_id = v_log.practice_item_id;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'not-found');
    end if;
    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'revision', v_state.revision
    );
  end if;

  -- Serialize a fresh review with pause/close. Receipt replay above remains valid.
  -- A conditional UPDATE of study_sessions takes the same row lock.
  if p_study_session_id is not null then
    select status, course_id into v_session_status, v_course_id
      from public.study_sessions
     where id = p_study_session_id and owner_id = v_uid
     for update;
    if not found or v_session_status <> 'active' then
      -- Existing payload vocabulary keeps older application versions compatible.
      return jsonb_build_object('ok', false, 'reason', 'not-found');
    end if;
  end if;

  select * into v_state
    from public.learning_states
   where owner_id = v_uid
     and practice_item_id = p_practice_item_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not-found');
  end if;

  if v_state.revision is distinct from p_expected_revision then
    return jsonb_build_object('ok', false, 'reason', 'revision-conflict');
  end if;

  if v_course_id is not null and v_state.phase in ('new', 'review') then
    -- Lock the settings row shared by all sessions of this course. The count
    -- runs after acquisition so it sees the preceding committed review.
    select case v_state.phase
             when 'new' then daily_new_limit
             else maximum_reviews_per_day
           end into v_limit
      from public.course_settings
     where course_id = v_course_id and user_id = v_uid
     for update;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'not-found');
    end if;

    if v_limit is not null then
      select timezone into v_time_zone from public.profiles where id = v_uid;
      v_local_day := (p_reviewed_at at time zone v_time_zone)::date;
      v_utc_midnight := v_local_day::timestamp at time zone 'UTC';

      -- Bound the scan using the owner/timestamp index, then use the local date
      -- itself to include both sides of an overlap or a day with no midnight.
      select case v_state.phase
               when 'new' then count(distinct r.practice_item_id)
               else count(*)
             end into v_consumed
        from public.review_logs r
        join public.practice_items i
          on i.id = r.practice_item_id and i.owner_id = r.owner_id
        join public.concepts c
          on c.id = i.concept_id and c.owner_id = i.owner_id
       where r.owner_id = v_uid
         and c.course_id = v_course_id
         and r.reviewed_at >= v_utc_midnight - interval '24 hours'
         and r.reviewed_at < v_utc_midnight + interval '48 hours'
         and (r.reviewed_at at time zone v_time_zone)::date = v_local_day
         and r.state_before->>'phase' = v_state.phase::text;

      if v_consumed >= v_limit then
        -- Older app versions already handle this conflict by refreshing.
        return jsonb_build_object('ok', false, 'reason', 'revision-conflict', 'daily_limit', true);
      end if;
    end if;
  end if;

  update public.learning_states
     set due_at = p_due_at,
         stability = p_stability,
         difficulty = p_difficulty,
         scheduled_days = p_scheduled_days,
         learning_step = p_learning_step,
         reps = p_reps,
         lapses = p_lapses,
         phase = p_phase,
         last_reviewed_at = p_last_reviewed_at,
         scheduler_version = p_scheduler_version,
         config_version = p_config_version,
         revision = revision + 1
   where id = v_state.id
     and owner_id = v_uid
     and revision = p_expected_revision
  returning * into v_state;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'revision-conflict');
  end if;

  insert into public.review_logs (
    owner_id, practice_item_id, study_session_id, idempotency_key,
    rating, reviewed_at, duration_ms,
    state_before, state_after, due_before, due_after,
    scheduler_version, config_version
  ) values (
    v_uid, p_practice_item_id, p_study_session_id, p_idempotency_key,
    p_rating, p_reviewed_at, p_duration_ms,
    p_state_before, p_state_after, p_due_before, p_due_after,
    p_scheduler_version, p_config_version
  );

  return jsonb_build_object(
    'ok', true,
    'replayed', false,
    'revision', v_state.revision
  );
end;
$$;
