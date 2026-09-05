-- LEX-4.3 — import_jobs and import_job_errors.
--
-- The delimited parser (LEX-4.2) returns rows and issues but persists nothing.
-- This migration creates where a run is recorded: `import_jobs` (one import
-- attempt: destination, mapping, status, counters) and `import_job_errors`
-- (the per-row failures). Structure, checks, enums, RLS and query indexes —
-- same shape as LEX-3.2 + LEX-3.3 for the library, done in one migration here
-- because these two tables are small and always ship together.
--
-- MASTER_SPEC §13.14 and §16.2–16.3. The repository / use case that writes
-- these rows is LEX-4.4+; real validation and sanitisation of the filename,
-- message and row sample is LEX-4.5 — the columns here only store the result.
--
-- Ownership is structural, same as the library: `owner_id` is denormalised on
-- both tables and a composite foreign key `(x_id, owner_id) -> parent
-- (id, owner_id)` makes a cross-user row impossible to insert. `import_jobs`
-- has no standalone `owner_id -> profiles` FK, for the same reason the library
-- tables do not: the composite to `courses` already forces `owner_id` to a
-- real profile, and the profile-delete cascade reaches these rows through
-- `courses`.
--
-- RETENTION: §13.14 — "the full file will not be kept indefinitely". For V1 it
-- is not stored at all: there is no content column, only `content_hash`.
--
-- Threat model unchanged from LEX-2.3 / LEX-3.3: no application path connects
-- as the table owner; `postgres` has BYPASSRLS, so `force row level security`
-- is NOT enabled. `(select auth.uid())` is wrapped so it is an InitPlan.

-- ---------------------------------------------------------------------------
-- Enums for closed value sets.
-- ---------------------------------------------------------------------------

-- Lifecycle of an import run, following the flow of §9.7:
--   pending    row created, file chosen, nothing parsed yet
--   mapping    separator/header detected, preview shown, columns being mapped
--   importing  the batch is running
--   completed  finished, counters final
--   failed     aborted before completion (not the same as "finished with some
--              failed rows" — that is `completed` with rows_failed > 0)
create type public.import_status as enum (
  'pending',
  'mapping',
  'importing',
  'completed',
  'failed'
);

-- Per-row error codes. The four structural ones come from the parser's domain
-- (LEX-4.2, src/modules/importing/domain/row.ts). LEX-4.5 adds validation
-- codes with `alter type ... add value`.
create type public.import_error_code as enum (
  'too_few_columns',
  'too_many_columns',
  'front_empty',
  'back_empty'
);

-- ---------------------------------------------------------------------------
-- import_jobs — one import attempt.
--
-- `deck_id` is nullable: the destination deck is chosen partway through the
-- flow (§9.7 step 5), and if that deck is later deleted the job record
-- survives with `deck_id` null (history). The composite FK to `decks` still
-- forces same-owner while it is set. `import_jobs (id, owner_id)` is unique so
-- `import_job_errors` can point a composite FK at it.
-- ---------------------------------------------------------------------------

create table public.import_jobs (
  id                 uuid primary key default gen_random_uuid(),
  course_id          uuid not null,
  owner_id           uuid not null,
  deck_id            uuid,
  original_filename  text not null,
  content_hash       text not null,
  mapping_config     jsonb not null default '{}'::jsonb,
  status             public.import_status not null default 'pending',
  rows_total         integer not null default 0,
  rows_created       integer not null default 0,
  rows_skipped       integer not null default 0,
  rows_duplicate     integer not null default 0,
  rows_failed        integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint import_jobs_course_owner_fk
    foreign key (course_id, owner_id)
    references public.courses (id, owner_id)
    on delete cascade,
  -- A deleted destination deck nulls the pointer, it does not delete the job.
  -- The column list is required in PostgreSQL 15+ (here 17) or it would try to
  -- null the whole key.
  constraint import_jobs_deck_owner_fk
    foreign key (deck_id, owner_id)
    references public.decks (id, owner_id)
    on delete set null (deck_id),
  constraint import_jobs_id_owner_unique unique (id, owner_id),
  -- Sanitisation is LEX-4.5; the length cap is the last guard.
  constraint import_jobs_original_filename_length
    check (char_length(btrim(original_filename)) between 1 and 255),
  -- A hex digest (sha-256 = 64 chars); bounded so a bogus value cannot be huge.
  constraint import_jobs_content_hash_length
    check (char_length(content_hash) between 1 and 128),
  constraint import_jobs_mapping_config_is_object
    check (jsonb_typeof(mapping_config) = 'object'),
  constraint import_jobs_counters_non_negative
    check (
      rows_total >= 0
      and rows_created >= 0
      and rows_skipped >= 0
      and rows_duplicate >= 0
      and rows_failed >= 0
    )
);

comment on table public.import_jobs is
  'One import attempt: destination, mapping config, status and counters. No file content is stored (MASTER_SPEC §13.14). Owner-only RLS.';

comment on column public.import_jobs.content_hash is
  'Hash of the uploaded content. The file itself is never stored (retention, §13.14).';

-- Backs import_jobs_course_owner_fk for the courses-delete cascade (course_id
-- is not a primary key here).
create index import_jobs_course_id_idx on public.import_jobs (course_id);
-- The RLS predicate filters by owner_id on every read.
create index import_jobs_owner_id_idx on public.import_jobs (owner_id);

create trigger import_jobs_set_updated_at
  before update on public.import_jobs
  for each row execute function public.set_updated_at();

alter table public.import_jobs enable row level security;

-- ---------------------------------------------------------------------------
-- import_job_errors — the per-row failures of one job.
--
-- Same denormalised-owner_id pattern as deck_concepts / concept_tags. Written
-- once during the import and never edited, so no `updated_at` and no trigger
-- (and no UPDATE policy). Deleted only by the cascade when its job is deleted.
-- ---------------------------------------------------------------------------

create table public.import_job_errors (
  id             uuid primary key default gen_random_uuid(),
  import_job_id  uuid not null,
  owner_id       uuid not null,
  row_number     integer not null,
  code           public.import_error_code not null,
  message        text not null,
  row_sample     text,
  created_at     timestamptz not null default now(),

  constraint import_job_errors_job_owner_fk
    foreign key (import_job_id, owner_id)
    references public.import_jobs (id, owner_id)
    on delete cascade,
  constraint import_job_errors_row_number_positive
    check (row_number >= 1),
  -- Safe message: short, no secrets, no full query (§16.3). Bounded here.
  constraint import_job_errors_message_length
    check (char_length(btrim(message)) between 1 and 500),
  -- Bounded and truncated sample of the offending row (§13.14); may be absent.
  constraint import_job_errors_row_sample_length
    check (row_sample is null or char_length(row_sample) <= 500)
);

comment on table public.import_job_errors is
  'Per-row failures of one import job. Safe message and a bounded, sanitised row sample (MASTER_SPEC §13.14, §16.3). Owner-only RLS.';

create index import_job_errors_owner_id_idx on public.import_job_errors (owner_id);
-- Listing the errors of one job.
create index import_job_errors_import_job_id_idx on public.import_job_errors (import_job_id);

alter table public.import_job_errors enable row level security;

-- ---------------------------------------------------------------------------
-- RLS — owner-only, per operation. Same pattern as LEX-3.3.
--
-- import_jobs: all four operations (status transitions are UPDATE, cleanup is
-- DELETE). import_job_errors: SELECT / INSERT / DELETE only — the row is never
-- edited, same as concept_tags.
-- ---------------------------------------------------------------------------

create policy import_jobs_select_own on public.import_jobs
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy import_jobs_insert_own on public.import_jobs
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy import_jobs_update_own on public.import_jobs
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy import_jobs_delete_own on public.import_jobs
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

create policy import_job_errors_select_own on public.import_job_errors
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy import_job_errors_insert_own on public.import_job_errors
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy import_job_errors_delete_own on public.import_job_errors
  for delete to authenticated
  using ((select auth.uid()) = owner_id);
