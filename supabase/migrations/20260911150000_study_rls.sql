-- LEX-5.5 — RLS policies, owner indexes and query indexes for study.
--
-- LEX-5.4 created `learning_states`, `study_sessions` and `review_logs` with
-- RLS enabled and no policies (deny-all) — the same two-phase shape as
-- LEX-2.1 → LEX-2.3 and LEX-3.2 → LEX-3.3. This migration adds the explicit
-- per-operation policies and the indexes the `owner_id` predicate, the daily
-- queue and the review history need. Uniqueness of one state per item and of
-- the idempotency key per owner already landed in LEX-5.4.
--
-- Threat model unchanged from LEX-2.3 / LEX-3.3: no application path connects
-- as the table owner; the browser and SSR clients act as `anon` /
-- `authenticated`; `postgres` (migrations, seed, db:test) has BYPASSRLS, so
-- `force row level security` is NOT enabled. `(select auth.uid())` is wrapped
-- in a scalar subquery so PostgreSQL evaluates it once per statement as an
-- InitPlan.
--
-- Every table is owner-only through its denormalised `owner_id`. The composite
-- FKs from LEX-5.4 already force `owner_id` to equal the parent owner, so a
-- single-column check needs no join and indirect access through a relation is
-- closed too: a child row for content you do not own cannot exist.
--
-- `review_logs` has no UPDATE policy: the row is append-only in normal
-- operation (MASTER_SPEC §13.13). Changing a review is out of V1; account
-- deletion still uses DELETE.

-- ---------------------------------------------------------------------------
-- learning_states — owner-only, four operations (revision bumps on review).
-- ---------------------------------------------------------------------------

create policy learning_states_select_own on public.learning_states
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy learning_states_insert_own on public.learning_states
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy learning_states_update_own on public.learning_states
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy learning_states_delete_own on public.learning_states
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- study_sessions — owner-only, four operations (status / counters / ended_at).
-- ---------------------------------------------------------------------------

create policy study_sessions_select_own on public.study_sessions
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy study_sessions_insert_own on public.study_sessions
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy study_sessions_update_own on public.study_sessions
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy study_sessions_delete_own on public.study_sessions
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- review_logs — owner-only, three operations. No UPDATE: append-only.
-- ---------------------------------------------------------------------------

create policy review_logs_select_own on public.review_logs
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy review_logs_insert_own on public.review_logs
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy review_logs_delete_own on public.review_logs
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- Indexes for the `owner_id` predicate every RLS-filtered query carries,
-- plus the queue (due_at) and history (reviewed_at) lookups of LEX-5.7+.
-- LEX-5.4 already indexed the FK-backing columns.
-- ---------------------------------------------------------------------------

create index learning_states_owner_id_idx on public.learning_states (owner_id);
create index study_sessions_owner_id_idx  on public.study_sessions (owner_id);
create index review_logs_owner_id_idx     on public.review_logs (owner_id);

-- Daily queue: items due for this owner, oldest first (LEX-5.7).
create index learning_states_owner_due_at_idx
  on public.learning_states (owner_id, due_at);

-- Session list for this owner, newest first.
create index study_sessions_owner_started_at_idx
  on public.study_sessions (owner_id, started_at desc);

-- Review history for this owner, newest first; and per-item history.
create index review_logs_owner_reviewed_at_idx
  on public.review_logs (owner_id, reviewed_at desc);

create index review_logs_owner_item_reviewed_at_idx
  on public.review_logs (owner_id, practice_item_id, reviewed_at desc);
