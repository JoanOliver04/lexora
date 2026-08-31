-- LEX-2.3 — Row Level Security policies for the identity and course tables.
--
-- LEX-2.1 enabled RLS on `profiles`, `languages`, `courses` and
-- `course_settings` without any policy, so today every table denies all access
-- to `anon` and `authenticated`. This migration adds the explicit per-operation
-- policies. Everything not granted here stays denied by default (MASTER_SPEC
-- §15.2, roadmap gate §12.3).
--
-- Threat model (LEX-1.8): no application path connects as the table owner.
-- The browser and the SSR clients authenticate with the publishable key and
-- act as `anon` or `authenticated`; identity comes from the session cookie and
-- permissions come from RLS. `postgres` (migrations, seed, db:test) has
-- BYPASSRLS, so `force row level security` is NOT enabled: it would only
-- constrain a connection shape this project does not have, while adding a
-- surface for future maintenance mistakes. Recorded as a deliberate technical
-- decision, not a Q-nnn.
--
-- `(select auth.uid())` is wrapped in a scalar subquery on purpose: PostgreSQL
-- caches it as an InitPlan and evaluates it once per statement instead of once
-- per row. It is a performance idiom, not a style choice.

-- ---------------------------------------------------------------------------
-- languages — reference catalogue, read-only for everyone.
--
-- SELECT is granted with `using (true)` rather than `using (active)`:
-- `courses.source_language_id` / `target_language_id` are FKs into this table,
-- so hiding a row by `active` would blank out the language name on any course
-- that still points at it. Filtering retired entries is a query-layer concern.
-- The catalogue holds no personal data. No INSERT/UPDATE/DELETE policy exists,
-- so writes are denied for `anon` and `authenticated`; only `postgres` (seed,
-- migrations) can populate it.
-- ---------------------------------------------------------------------------

create policy languages_select_all
  on public.languages
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- profiles — a user reaches only their own row.
--
-- No DELETE policy: a profile's lifecycle is tied to `auth.users`
-- (`id references auth.users (id) on delete cascade`). Account deletion is
-- FASE 8; when it lands it removes the `auth.users` row and the cascade takes
-- the profile with it. A direct `delete from public.profiles` by the user is
-- not a supported operation and stays denied.
-- ---------------------------------------------------------------------------

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- courses — owner-only for every operation (MASTER_SPEC §13.4).
-- ---------------------------------------------------------------------------

create policy courses_select_own
  on public.courses
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy courses_insert_own
  on public.courses
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy courses_update_own
  on public.courses
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy courses_delete_own
  on public.courses
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- course_settings — owner-only via `user_id`.
--
-- `user_id` is the denormalised owner (the composite FK
-- (course_id, user_id) -> courses (id, owner_id) makes it always equal to the
-- course owner), so a single-column check is enough and does not need to join
-- `courses`. Indirect access through the relation is therefore closed too: a
-- settings row for a course you do not own cannot exist in the first place.
-- ---------------------------------------------------------------------------

create policy course_settings_select_own
  on public.course_settings
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy course_settings_insert_own
  on public.course_settings
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy course_settings_update_own
  on public.course_settings
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy course_settings_delete_own
  on public.course_settings
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
