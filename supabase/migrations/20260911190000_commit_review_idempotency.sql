-- LEX-5.10 — End-to-end idempotency of `commit_review`.
--
-- LEX-5.9 looked up the log *before* locking the learning_state. A retry
-- that arrived after the first write (double-click, lost response) could
-- miss the log, take the row lock, see a new revision and return
-- `revision-conflict` instead of replaying.
--
-- Same owner + same key now take an advisory transaction lock first,
-- then re-read the log. Concurrent retries serialize; the second sees
-- the row and returns the original result. Two owners may share a key:
-- the unique constraint is `(owner_id, idempotency_key)`.
--
-- Signature unchanged. Privileges from LEX-5.9 are kept by REPLACE.

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
  'LEX-5.9 / LEX-5.10 / ADR-006. Atomic state+log write. Same (owner, idempotency_key) replays. Advisory lock serializes retries.';
