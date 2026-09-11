-- LEX-5.4 — Study schema.
--
-- Creates the three tables of the study module: `learning_states`,
-- `study_sessions` and `review_logs`. Structure only: columns, keys, checks,
-- enums, timestamps and the integrity constraints that make cross-user linking
-- impossible.
--
-- Row Level Security is ENABLED on every table (same reason as LEX-2.1 / 3.2:
-- on this project `anon` / `authenticated` / `service_role` get full DML on
-- new `public` tables by default, so a table without RLS is world-writable).
-- The explicit per-operation policies, the owner/non-owner isolation tests and
-- the query indexes (owner, due-date queue, history) are LEX-5.5. The indexes
-- created here exist only to back unique business keys and foreign keys whose
-- parent side is not already covered by a primary key, so a cascade delete
-- does not sequential-scan the child.
--
-- Mirrors the library pattern: `owner_id` is denormalised on every table and a
-- composite foreign key `(x_id, owner_id) -> parent (id, owner_id)` makes
-- ownership structural. A row that links study data across two users cannot
-- be inserted at all. No standalone `owner_id -> profiles` foreign key: the
-- composite already forces `owner_id` to a real profile transitively, and the
-- profile-delete cascade reaches these rows through `courses` /
-- `practice_items`.
--
-- Mapping is field-by-field from `LearningState` (LEX-5.2) plus persistence
-- columns. The application MUST NOT serialise a `ts-fsrs` `Card`. Two
-- documented deviations from MASTER_SPEC §13.11:
--   * `elapsed_days` is omitted. ts-fsrs 5.4.2 marks it deprecated; it is
--     removed in 6.0; the domain snapshot has no such field (`docs/FSRS.md`).
--   * `learning_step` is included. The domain snapshot has it (library
--     `learning_steps`); §13.11 listed the other Card fields and missed this
--     one. Without the column the adapter cannot round-trip a Learning card.
-- Column `phase` is §13.11 `state`; `owner_id` is §13.11 `user_id`;
-- `last_reviewed_at` is §13.11 `last_review_at`. Same vocabulary as the
-- domain, not a silent rename of the SQL.

-- `practice_items (id, owner_id)` was not unique in LEX-3.2 (nothing needed
-- to point a composite FK at an item). Study tables do, so the unique is
-- added here. `id` is already the PK; the extra unique is only so a
-- composite `(id, owner_id)` can be the FK target.

alter table public.practice_items
  add constraint practice_items_id_owner_unique unique (id, owner_id);

-- ---------------------------------------------------------------------------
-- Enums for closed value sets. Reflect src/modules/study/domain/memory.ts
-- (LEX-5.2). `Rating.Manual` is not a user grade and is not in `review_rating`.
-- ---------------------------------------------------------------------------

create type public.memory_phase as enum (
  'new',
  'learning',
  'review',
  'relearning'
);

create type public.study_session_status as enum (
  'active',
  'paused',
  'completed',
  'abandoned'
);

create type public.review_rating as enum (
  'again',
  'hard',
  'good',
  'easy'
);

-- ---------------------------------------------------------------------------
-- learning_states — one memory snapshot per (owner, practice item).
--
-- This is the persisted form of `LearningState` plus ownership, item, the
-- scheduler/config versions that produced the numbers, and `revision` for
-- optimistic concurrency (LEX-5.11). `learning_states (id, owner_id)` is
-- unique so a later table can point a composite FK at it if needed.
-- ---------------------------------------------------------------------------

create table public.learning_states (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null,
  practice_item_id    uuid not null,
  due_at              timestamptz not null,
  stability           double precision not null default 0,
  difficulty          double precision not null default 0,
  scheduled_days      integer not null default 0,
  learning_step       integer not null default 0,
  reps                integer not null default 0,
  lapses              integer not null default 0,
  phase               public.memory_phase not null default 'new',
  last_reviewed_at    timestamptz,
  scheduler_version   text not null,
  config_version      text not null,
  revision            integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint learning_states_item_owner_fk
    foreign key (practice_item_id, owner_id)
    references public.practice_items (id, owner_id)
    on delete cascade,
  constraint learning_states_id_owner_unique unique (id, owner_id),
  constraint learning_states_owner_item_key unique (owner_id, practice_item_id),
  constraint learning_states_stability_non_negative
    check (stability >= 0),
  constraint learning_states_difficulty_non_negative
    check (difficulty >= 0),
  constraint learning_states_scheduled_days_non_negative
    check (scheduled_days >= 0),
  constraint learning_states_learning_step_non_negative
    check (learning_step >= 0),
  constraint learning_states_reps_non_negative
    check (reps >= 0),
  constraint learning_states_lapses_non_negative
    check (lapses >= 0),
  constraint learning_states_revision_positive
    check (revision >= 1),
  constraint learning_states_scheduler_version_length
    check (char_length(btrim(scheduler_version)) between 1 and 64),
  constraint learning_states_config_version_length
    check (char_length(btrim(config_version)) between 1 and 64)
);

comment on table public.learning_states is
  'One FSRS memory snapshot per (owner, practice item). Field-by-field map of LearningState; not a serialised ts-fsrs Card. elapsed_days is omitted (deprecated). RLS policies and queue indexes in LEX-5.5.';

comment on column public.learning_states.phase is
  'Memory phase (MASTER_SPEC §13.11 `state`). new / learning / review / relearning.';

comment on column public.learning_states.learning_step is
  'Index into the current learning/relearning steps. Present on the domain snapshot; omitted from §13.11; required to round-trip a Learning card.';

comment on column public.learning_states.scheduler_version is
  'Package version that computed this snapshot (e.g. 5.4.2). Not a live read of the installed package.';

comment on column public.learning_states.config_version is
  'Product config version that computed this snapshot (e.g. v1).';

comment on column public.learning_states.revision is
  'Optimistic concurrency token. Incremented on every confirmed review (LEX-5.11).';

-- Backs learning_states_item_owner_fk for the practice_items-delete cascade
-- (practice_item_id is not a primary key here). The unique (owner_id,
-- practice_item_id) does not lead with practice_item_id.
create index learning_states_practice_item_id_idx
  on public.learning_states (practice_item_id);

create trigger learning_states_set_updated_at
  before update on public.learning_states
  for each row execute function public.set_updated_at();

alter table public.learning_states enable row level security;

-- ---------------------------------------------------------------------------
-- study_sessions — groups reviews for a summary. Does not persist the queue.
--
-- `scope` is the filter that was selected (decks, include-new, …), not the
-- list of items. `study_sessions (id, owner_id)` is unique so `review_logs`
-- can point a composite FK at it.
-- ---------------------------------------------------------------------------

create table public.study_sessions (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null,
  course_id       uuid not null,
  scope           jsonb not null default '{}'::jsonb,
  status          public.study_session_status not null default 'active',
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  reviews_count   integer not null default 0,
  new_count       integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint study_sessions_course_owner_fk
    foreign key (course_id, owner_id)
    references public.courses (id, owner_id)
    on delete cascade,
  constraint study_sessions_id_owner_unique unique (id, owner_id),
  constraint study_sessions_scope_is_object
    check (jsonb_typeof(scope) = 'object'),
  constraint study_sessions_counters_non_negative
    check (reviews_count >= 0 and new_count >= 0),
  constraint study_sessions_ended_at_matches_status
    check (
      (status in ('active', 'paused') and ended_at is null)
      or (status in ('completed', 'abandoned') and ended_at is not null)
    ),
  constraint study_sessions_ended_after_start
    check (ended_at is null or ended_at >= started_at)
);

comment on table public.study_sessions is
  'Groups reviews so a session can be summarised. Does not persist the daily queue. RLS in LEX-5.5.';

comment on column public.study_sessions.scope is
  'Selected filter (decks, include-new, …). Not the queue itself.';

create index study_sessions_course_id_idx on public.study_sessions (course_id);

create trigger study_sessions_set_updated_at
  before update on public.study_sessions
  for each row execute function public.set_updated_at();

alter table public.study_sessions enable row level security;

-- ---------------------------------------------------------------------------
-- review_logs — append-only history of one confirmed review.
--
-- Written once, never edited by the user (no UPDATE policy in LEX-5.5; no
-- `updated_at`). "Append-only" is the normal operation; an account-deletion
-- request still removes these rows with the rest of the owner's data.
-- `idempotency_key` is unique per owner so a double submit cannot insert two
-- reviews (LEX-5.10). Two owners may reuse the same key.
--
-- `study_session_id` is optional: a review can exist outside a named session.
-- Deleting the session nulls the pointer (history survives). The column list
-- on `set null` is required (PostgreSQL 15+, here 17).
-- ---------------------------------------------------------------------------

create table public.review_logs (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null,
  practice_item_id    uuid not null,
  study_session_id    uuid,
  idempotency_key     text not null,
  rating              public.review_rating not null,
  reviewed_at         timestamptz not null,
  duration_ms         integer,
  state_before        jsonb not null,
  state_after         jsonb not null,
  due_before          timestamptz not null,
  due_after           timestamptz not null,
  scheduler_version   text not null,
  config_version      text not null,
  client_occurred_at  timestamptz,
  created_at          timestamptz not null default now(),

  constraint review_logs_item_owner_fk
    foreign key (practice_item_id, owner_id)
    references public.practice_items (id, owner_id)
    on delete cascade,
  constraint review_logs_session_owner_fk
    foreign key (study_session_id, owner_id)
    references public.study_sessions (id, owner_id)
    on delete set null (study_session_id),
  constraint review_logs_owner_idempotency_key
    unique (owner_id, idempotency_key),
  constraint review_logs_idempotency_key_length
    check (char_length(btrim(idempotency_key)) between 1 and 128),
  constraint review_logs_duration_ms_bounded
    check (duration_ms is null or (duration_ms >= 0 and duration_ms <= 3600000)),
  constraint review_logs_state_before_is_object
    check (jsonb_typeof(state_before) = 'object'),
  constraint review_logs_state_after_is_object
    check (jsonb_typeof(state_after) = 'object'),
  constraint review_logs_scheduler_version_length
    check (char_length(btrim(scheduler_version)) between 1 and 64),
  constraint review_logs_config_version_length
    check (char_length(btrim(config_version)) between 1 and 64)
);

comment on table public.review_logs is
  'Append-only history of one confirmed review: rating, authoritative reviewed_at, and state/due snapshots. No updated_at. User cannot UPDATE these rows (LEX-5.5). Account deletion still removes them.';

comment on column public.review_logs.idempotency_key is
  'Client-supplied key, unique per owner. A retry with the same key must not insert a second review (LEX-5.10).';

comment on column public.review_logs.reviewed_at is
  'Authoritative review instant (server clock). client_occurred_at is diagnostic only.';

comment on column public.review_logs.client_occurred_at is
  'Optional client timestamp for diagnostics. Never the authoritative clock in V1.';

comment on column public.review_logs.state_before is
  'JSON object snapshot of LearningState before the review. Shape versioned with scheduler_version / config_version (LEX-5.13).';

comment on column public.review_logs.state_after is
  'JSON object snapshot of LearningState after the review.';

-- Backs the two FKs for cascade / set-null. The unique (owner_id,
-- idempotency_key) does not lead with either parent id.
create index review_logs_practice_item_id_idx
  on public.review_logs (practice_item_id);
create index review_logs_study_session_id_idx
  on public.review_logs (study_session_id);

alter table public.review_logs enable row level security;
