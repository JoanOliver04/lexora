-- LEX-5.9 — Atomic review commit (ADR-006).
--
-- `public.commit_review(...)` writes the new learning_state and the
-- review_log in one transaction. FSRS maths stay in the application
-- (LEX-5.8); this function only checks identity, expected revision,
-- idempotency and column CHECKs, then writes.
--
-- SECURITY INVOKER (same as complete_onboarding / ADR-005): runs as the
-- caller so LEX-5.5 policies still apply. search_path is pinned empty.
-- revoke EXECUTE from public and anon; grant to authenticated.

create function public.commit_review(
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
  v_uid     uuid := (select auth.uid());
  v_state   public.learning_states%rowtype;
  v_log_id  uuid;
begin
  if v_uid is null then
    raise exception 'commit_review requires an authenticated session'
      using errcode = '28000';
  end if;

  select id into v_log_id
    from public.review_logs
   where owner_id = v_uid
     and idempotency_key = p_idempotency_key;

  if found then
    select * into v_state
      from public.learning_states
     where owner_id = v_uid
       and practice_item_id = p_practice_item_id;
    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'revision', v_state.revision
    );
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

comment on function public.commit_review(
  uuid, integer, text, public.review_rating, timestamptz,
  timestamptz, double precision, double precision, integer, integer, integer, integer,
  public.memory_phase, timestamptz, text, text, jsonb, jsonb, timestamptz, timestamptz,
  uuid, integer
) is
  'LEX-5.9 / ADR-006. Atomically updates learning_states and appends review_logs. SECURITY INVOKER. FSRS numbers are supplied by the application.';

revoke execute on function public.commit_review(
  uuid, integer, text, public.review_rating, timestamptz,
  timestamptz, double precision, double precision, integer, integer, integer, integer,
  public.memory_phase, timestamptz, text, text, jsonb, jsonb, timestamptz, timestamptz,
  uuid, integer
) from public, anon;

grant execute on function public.commit_review(
  uuid, integer, text, public.review_rating, timestamptz,
  timestamptz, double precision, double precision, integer, integer, integer, integer,
  public.memory_phase, timestamptz, text, text, jsonb, jsonb, timestamptz, timestamptz,
  uuid, integer
) to authenticated;
