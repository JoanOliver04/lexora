-- LEX-3.3 — RLS policies, owner indexes and tag uniqueness for the library.
--
-- LEX-3.2 created `decks`, `concepts`, `deck_concepts`, `practice_items`,
-- `tags` and `concept_tags` with RLS enabled and no policies (deny-all) — the
-- same two-phase shape as LEX-2.1 → LEX-2.3. This migration adds the explicit
-- per-operation policies, the indexes the `owner_id` predicate and the
-- duplicate-suggestion lookup need, and the per-course uniqueness of
-- `tags.normalized_name`.
--
-- Threat model unchanged from LEX-2.3: no application path connects as the
-- table owner; the browser and SSR clients act as `anon` / `authenticated`;
-- `postgres` (migrations, seed, db:test) has BYPASSRLS, so `force row level
-- security` is NOT enabled — it would only constrain a connection shape this
-- project does not have. `(select auth.uid())` is wrapped in a scalar subquery
-- so PostgreSQL evaluates it once per statement as an InitPlan.
--
-- Every table is owner-only through its denormalised `owner_id`. The composite
-- FKs from LEX-3.2 already force `owner_id` to equal the course/parent owner,
-- so a single-column check needs no join and indirect access through a
-- relation is closed too: a child row for content you do not own cannot exist.
--
-- Why `010-rls-enabled.sql` is NOT extended to "RLS + >=1 policy" here: that
-- assertion would turn the deliberate LEX-2.1 / LEX-3.2 two-phase pattern
-- (enable RLS in the schema migration, add policies in the next one) into a
-- red suite for the FASE 4 / FASE 5 tables that will follow it. The
-- ">=1 policy" check lives in `090-library-rls.sql`, scoped to these six
-- tables. (Debt noted in `evidence/LEX-2.3.md` §7; the reason it stayed
-- deferred still holds.)

-- ---------------------------------------------------------------------------
-- decks — owner-only, four operations.
-- ---------------------------------------------------------------------------

create policy decks_select_own on public.decks
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy decks_insert_own on public.decks
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy decks_update_own on public.decks
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy decks_delete_own on public.decks
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- concepts — owner-only, four operations.
-- ---------------------------------------------------------------------------

create policy concepts_select_own on public.concepts
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy concepts_insert_own on public.concepts
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy concepts_update_own on public.concepts
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy concepts_delete_own on public.concepts
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- practice_items — owner-only, four operations.
-- ---------------------------------------------------------------------------

create policy practice_items_select_own on public.practice_items
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy practice_items_insert_own on public.practice_items
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy practice_items_update_own on public.practice_items
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy practice_items_delete_own on public.practice_items
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- tags — owner-only, four operations.
-- ---------------------------------------------------------------------------

create policy tags_select_own on public.tags
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy tags_insert_own on public.tags
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy tags_update_own on public.tags
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy tags_delete_own on public.tags
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- deck_concepts — owner-only. UPDATE is included: `position` is mutable.
-- ---------------------------------------------------------------------------

create policy deck_concepts_select_own on public.deck_concepts
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy deck_concepts_insert_own on public.deck_concepts
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy deck_concepts_update_own on public.deck_concepts
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy deck_concepts_delete_own on public.deck_concepts
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- concept_tags — owner-only, three operations. No UPDATE: the row is its
-- whole primary key plus `owner_id`, with nothing to modify; changing a
-- tagging is a delete followed by an insert.
-- ---------------------------------------------------------------------------

create policy concept_tags_select_own on public.concept_tags
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy concept_tags_insert_own on public.concept_tags
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy concept_tags_delete_own on public.concept_tags
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- Indexes for the `owner_id` predicate every RLS-filtered query carries.
-- LEX-3.2 already indexed the FK-backing columns (`course_id` / `concept_id`
-- / `tag_id`); these add the owner scan, mirroring `courses_owner_id_idx`.
-- ---------------------------------------------------------------------------

create index decks_owner_id_idx          on public.decks (owner_id);
create index concepts_owner_id_idx       on public.concepts (owner_id);
create index practice_items_owner_id_idx on public.practice_items (owner_id);
create index tags_owner_id_idx           on public.tags (owner_id);
create index deck_concepts_owner_id_idx  on public.deck_concepts (owner_id);
create index concept_tags_owner_id_idx   on public.concept_tags (owner_id);

-- Duplicate-suggestion lookup (LEX-3.10): "my concepts whose canonical_key
-- matches this one". `owner_id` first so the index is usable under RLS.
-- Full-text / trigram search over `title` waits for LEX-3.9, which decides
-- whether `pg_trgm` is worth adding once the query shape is real.
create index concepts_owner_canonical_key_idx
  on public.concepts (owner_id, canonical_key);

-- ---------------------------------------------------------------------------
-- tags — no equivalent duplicate within a course (MASTER_SPEC §13.10).
-- `normalized_name` already collapses case, whitespace and the spacing around
-- `::` (LEX-3.1 `normalizeTagName`), so equality on it is equivalence. Scoped
-- to `course_id`: the same tag name in two courses is two tags.
-- ---------------------------------------------------------------------------

create unique index tags_course_normalized_name_key
  on public.tags (course_id, normalized_name);
