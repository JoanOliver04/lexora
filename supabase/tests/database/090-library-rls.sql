-- LEX-3.3 — Owner / non-owner isolation for the library tables.
--
-- LEX-3.2 enabled RLS with no policies (deny-all); LEX-3.3 adds the explicit
-- per-operation policies, the owner indexes and the per-course uniqueness of
-- `tags.normalized_name`. This file proves the policies functionally: it
-- becomes a role, with a given `auth.uid()`, and checks what that role can
-- read, write and — above all — cannot reach.
--
-- **Self-contained**, like 040: it builds its own synthetic `zz` languages and
-- two users instead of leaning on `seed.sql`.
--
-- Two kinds of denial are distinguished on purpose:
--   * `42501` — a policy WITH CHECK rejected the row (INSERT as another user).
--   * zero rows — RLS filtered the target out of USING before the write
--     (UPDATE / DELETE aimed at another user's row), no error raised.
--   * `23503` — a composite FK rejected the row. FK validation bypasses RLS,
--     so those assertions prove the *schema* (LEX-3.2), not the policy.
--
-- Every role block pins `auth.uid()` first: a JWT claim that failed to wire
-- through would make `auth.uid()` NULL, every policy would deny everything,
-- and every "A cannot see B" line would pass while also, silently, meaning
-- "A cannot see A". So each deny is paired with the matching allow.

begin;
select plan(48);

-- ===========================================================================
-- Fixture (as the migration/test role: BYPASSRLS, so these all succeed).
-- ===========================================================================

insert into auth.users (id) values
  ('a11ce000-0000-4000-8000-000000000001'),   -- user A
  ('b0b0b000-0000-4000-8000-000000000002');   -- user B

insert into public.profiles (id) values
  ('a11ce000-0000-4000-8000-000000000001'),
  ('b0b0b000-0000-4000-8000-000000000002');

insert into public.languages (id, code, locale, name_key) values
  ('20000000-0000-4000-8000-000000000000', 'zz', 'zz',    'language.zz'),
  ('30000000-0000-4000-8000-000000000000', 'zz', 'zz-ZZ', 'language.zz_zz');

insert into public.courses (id, owner_id, title, source_language_id, target_language_id) values
  ('c0a75e00-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   'Curso A-1', '20000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000000'),
  ('c0a75e00-0000-4000-8000-00000000000c', 'a11ce000-0000-4000-8000-000000000001',
   'Curso A-2', '20000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000000'),
  ('c0a75e00-0000-4000-8000-00000000000b', 'b0b0b000-0000-4000-8000-000000000002',
   'Curso B',   '20000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000000');

-- A's library (course A-1).
insert into public.decks (id, course_id, owner_id, title) values
  ('d0000000-0000-4000-8000-00000000000a',
   'c0a75e00-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001', 'Mazo de A');
insert into public.concepts (id, course_id, owner_id, kind, title, summary) values
  ('c1000000-0000-4000-8000-00000000000a',
   'c0a75e00-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   'vocabulary', 'casa', 'vivienda'),
  ('c1000000-0000-4000-8000-00000000000d',
   'c0a75e00-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   'vocabulary', 'perro', 'animal');
insert into public.practice_items (id, concept_id, owner_id, mode, prompt_text, answer_text, config) values
  ('b1000000-0000-4000-8000-00000000000a',
   'c1000000-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   'basic_recognition', 'casa', 'house', '{"mode":"basic_recognition"}'::jsonb);
insert into public.tags (id, course_id, owner_id, normalized_name, display_name) values
  ('7a600000-0000-4000-8000-00000000000a',
   'c0a75e00-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   'nivel::a1', 'Nivel::A1');
insert into public.deck_concepts (deck_id, concept_id, owner_id) values
  ('d0000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-00000000000a',
   'a11ce000-0000-4000-8000-000000000001');
insert into public.concept_tags (concept_id, tag_id, owner_id) values
  ('c1000000-0000-4000-8000-00000000000a', '7a600000-0000-4000-8000-00000000000a',
   'a11ce000-0000-4000-8000-000000000001');

-- B's library (course B).
insert into public.decks (id, course_id, owner_id, title) values
  ('d0000000-0000-4000-8000-00000000000b',
   'c0a75e00-0000-4000-8000-00000000000b', 'b0b0b000-0000-4000-8000-000000000002', 'Mazo de B');
insert into public.concepts (id, course_id, owner_id, kind, title, summary) values
  ('c1000000-0000-4000-8000-00000000000b',
   'c0a75e00-0000-4000-8000-00000000000b', 'b0b0b000-0000-4000-8000-000000000002',
   'vocabulary', 'gato', 'animal');
insert into public.practice_items (id, concept_id, owner_id, mode, prompt_text, answer_text, config) values
  ('b1000000-0000-4000-8000-00000000000b',
   'c1000000-0000-4000-8000-00000000000b', 'b0b0b000-0000-4000-8000-000000000002',
   'basic_recognition', 'gato', 'cat', '{"mode":"basic_recognition"}'::jsonb);
insert into public.tags (id, course_id, owner_id, normalized_name, display_name) values
  ('7a600000-0000-4000-8000-00000000000b',
   'c0a75e00-0000-4000-8000-00000000000b', 'b0b0b000-0000-4000-8000-000000000002',
   'nivel::a1', 'Nivel::A1');
insert into public.deck_concepts (deck_id, concept_id, owner_id) values
  ('d0000000-0000-4000-8000-00000000000b', 'c1000000-0000-4000-8000-00000000000b',
   'b0b0b000-0000-4000-8000-000000000002');
insert into public.concept_tags (concept_id, tag_id, owner_id) values
  ('c1000000-0000-4000-8000-00000000000b', '7a600000-0000-4000-8000-00000000000b',
   'b0b0b000-0000-4000-8000-000000000002');

-- ===========================================================================
-- Block 0 — the policy set is exactly what the migration declares.
-- ===========================================================================

select bag_eq(
  $$ select policyname from pg_policies where schemaname = 'public' and tablename = 'decks' $$,
  $$ values ('decks_select_own'), ('decks_insert_own'), ('decks_update_own'), ('decks_delete_own') $$,
  'decks exposes the four owner policies'
);
select bag_eq(
  $$ select policyname from pg_policies where schemaname = 'public' and tablename = 'concepts' $$,
  $$ values ('concepts_select_own'), ('concepts_insert_own'), ('concepts_update_own'), ('concepts_delete_own') $$,
  'concepts exposes the four owner policies'
);
select bag_eq(
  $$ select policyname from pg_policies where schemaname = 'public' and tablename = 'practice_items' $$,
  $$ values ('practice_items_select_own'), ('practice_items_insert_own'), ('practice_items_update_own'), ('practice_items_delete_own') $$,
  'practice_items exposes the four owner policies'
);
select bag_eq(
  $$ select policyname from pg_policies where schemaname = 'public' and tablename = 'tags' $$,
  $$ values ('tags_select_own'), ('tags_insert_own'), ('tags_update_own'), ('tags_delete_own') $$,
  'tags exposes the four owner policies'
);
select bag_eq(
  $$ select policyname from pg_policies where schemaname = 'public' and tablename = 'deck_concepts' $$,
  $$ values ('deck_concepts_select_own'), ('deck_concepts_insert_own'), ('deck_concepts_update_own'), ('deck_concepts_delete_own') $$,
  'deck_concepts exposes the four owner policies'
);
select bag_eq(
  $$ select policyname from pg_policies where schemaname = 'public' and tablename = 'concept_tags' $$,
  $$ values ('concept_tags_select_own'), ('concept_tags_insert_own'), ('concept_tags_delete_own') $$,
  'concept_tags exposes SELECT/INSERT/DELETE and deliberately no UPDATE'
);

-- Scoped ">=1 policy" invariant — kept here instead of extending
-- 010-rls-enabled.sql, so the LEX-2.1 / LEX-3.2 two-phase pattern stays legal
-- for the FASE 4 / FASE 5 tables.
select is_empty(
  $$ select c.relname
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in ('decks','concepts','deck_concepts','practice_items','tags','concept_tags')
        and not exists (
          select 1 from pg_policies p
           where p.schemaname = 'public' and p.tablename = c.relname
        ) $$,
  'las seis tablas de biblioteca tienen al menos una política'
);

-- (La comprobación estructural de los índices —tipo y existencia— vive en
-- 080-library-schema.sql; aquí su efecto funcional: unicidad por curso más
-- abajo, en el bloque A.)

-- ===========================================================================
-- Block A — become user A.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a11ce000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select auth.uid())::text, 'a11ce000-0000-4000-8000-000000000001',
  'auth.uid() resolves to A inside the authenticated role');

-- --- SELECT: A reaches only its own rows ---------------------------------

select is((select count(*)::int from public.decks), 1, 'A sees exactly its own deck');
select is((select count(*)::int from public.decks where owner_id = 'b0b0b000-0000-4000-8000-000000000002'),
  0, 'A cannot see B''s deck even filtering by B''s owner_id');
select is((select count(*)::int from public.concepts), 2, 'A sees exactly its two concepts');
select is((select count(*)::int from public.concepts where id = 'c1000000-0000-4000-8000-00000000000b'),
  0, 'A cannot reach B''s concept through a known UUID');
select is((select count(*)::int from public.practice_items), 1, 'A sees exactly its own practice_item');
select is((select count(*)::int from public.tags), 1, 'A sees exactly its own tag');
select is((select count(*)::int from public.deck_concepts), 1, 'A sees exactly its own deck_concepts link');
select is((select count(*)::int from public.concept_tags), 1, 'A sees exactly its own concept_tags link');

-- --- Mutations A is allowed to make on its own rows --------------------

select lives_ok(
  $$ update public.decks set title = 'Mazo de A (editado)'
      where id = 'd0000000-0000-4000-8000-00000000000a' $$,
  'A can update its own deck');
select lives_ok(
  $$ insert into public.concepts (course_id, owner_id, kind, title, summary)
     values ('c0a75e00-0000-4000-8000-00000000000a',
             'a11ce000-0000-4000-8000-000000000001', 'vocabulary', 'árbol', 'planta') $$,
  'A can insert a concept it owns');
select lives_ok(
  $$ delete from public.concepts where title = 'árbol'
      and owner_id = 'a11ce000-0000-4000-8000-000000000001' $$,
  'A can delete its own concept');
select lives_ok(
  $$ update public.deck_concepts set position = 3
      where deck_id = 'd0000000-0000-4000-8000-00000000000a' $$,
  'A can update the position on its own deck_concepts link');
select lives_ok(
  $$ insert into public.practice_items (concept_id, owner_id, mode, prompt_text, answer_text, config)
     values ('c1000000-0000-4000-8000-00000000000a',
             'a11ce000-0000-4000-8000-000000000001', 'basic_recall',
             'house', 'casa', '{"mode":"basic_recall"}'::jsonb) $$,
  'A can insert a practice_item on its own concept');

-- --- tags.normalized_name uniqueness is per course ---------------------

select lives_ok(
  $$ insert into public.tags (course_id, owner_id, normalized_name, display_name)
     values ('c0a75e00-0000-4000-8000-00000000000c',
             'a11ce000-0000-4000-8000-000000000001', 'nivel::a1', 'Nivel::A1') $$,
  'A can reuse a tag name in a different course of its own');
select throws_ok(
  $$ insert into public.tags (course_id, owner_id, normalized_name, display_name)
     values ('c0a75e00-0000-4000-8000-00000000000a',
             'a11ce000-0000-4000-8000-000000000001', 'nivel::a1', 'nivel :: a1') $$,
  '23505', null,
  'A cannot create a second equivalent tag in the same course');

-- --- Mutations A must not be able to make against B ------------------

select throws_ok(
  $$ insert into public.decks (course_id, owner_id, title)
     values ('c0a75e00-0000-4000-8000-00000000000b',
             'b0b0b000-0000-4000-8000-000000000002', 'secuestro') $$,
  '42501', null,
  'A cannot insert a deck owned by B (WITH CHECK)');
select throws_ok(
  $$ insert into public.deck_concepts (deck_id, concept_id, owner_id)
     values ('d0000000-0000-4000-8000-00000000000b',
             'c1000000-0000-4000-8000-00000000000b',
             'b0b0b000-0000-4000-8000-000000000002') $$,
  '42501', null,
  'A cannot insert a deck_concepts row owned by B (WITH CHECK)');
select throws_ok(
  $$ insert into public.deck_concepts (deck_id, concept_id, owner_id)
     values ('d0000000-0000-4000-8000-00000000000b',
             'c1000000-0000-4000-8000-00000000000a',
             'a11ce000-0000-4000-8000-000000000001') $$,
  '23503', null,
  'A linking its own concept to B''s deck fails at the composite FK (schema, not policy)');

with u as (
  update public.decks set title = 'secuestro'
   where owner_id = 'b0b0b000-0000-4000-8000-000000000002'
  returning 1
)
select is((select count(*)::int from u), 0,
  'A''s UPDATE aimed at B''s deck affects zero rows');

with d as (
  delete from public.concepts
   where owner_id = 'b0b0b000-0000-4000-8000-000000000002'
  returning 1
)
select is((select count(*)::int from d), 0,
  'A''s DELETE aimed at B''s concept affects zero rows');

with d as (
  delete from public.deck_concepts
   where owner_id = 'b0b0b000-0000-4000-8000-000000000002'
  returning 1
)
select is((select count(*)::int from d), 0,
  'A''s DELETE aimed at B''s deck_concepts link affects zero rows');

with d as (
  delete from public.concept_tags
   where owner_id = 'b0b0b000-0000-4000-8000-000000000002'
  returning 1
)
select is((select count(*)::int from d), 0,
  'A''s DELETE aimed at B''s concept_tags link affects zero rows');

with u as (
  update public.practice_items set answer_text = 'hijacked'
   where owner_id = 'b0b0b000-0000-4000-8000-000000000002'
  returning 1
)
select is((select count(*)::int from u), 0,
  'A''s UPDATE aimed at B''s practice_item affects zero rows');

-- ===========================================================================
-- Block B — become user B; confirm A's writes were real and B's rows intact.
-- ===========================================================================

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b0b0b000-0000-4000-8000-000000000002","role":"authenticated"}';

select is((select auth.uid())::text, 'b0b0b000-0000-4000-8000-000000000002',
  'auth.uid() resolves to B inside the authenticated role');

select is((select count(*)::int from public.decks), 1, 'B sees exactly its own deck');
select is((select title from public.decks), 'Mazo de B',
  'B''s deck title is untouched by A''s hijack attempts');
select is((select count(*)::int from public.concepts), 1,
  'B still has its concept: A''s DELETE did nothing');
select is((select answer_text from public.practice_items), 'cat',
  'B''s practice_item is untouched by A''s update');
select is((select count(*)::int from public.deck_concepts), 1,
  'B still has its deck_concepts link');
select is((select count(*)::int from public.concept_tags), 1,
  'B still has its concept_tags link');
select is((select count(*)::int from public.decks where owner_id = 'a11ce000-0000-4000-8000-000000000001'),
  0, 'B cannot see A''s deck');

-- ===========================================================================
-- Block anon — an unauthenticated visitor reaches no library row.
-- ===========================================================================

reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is((select count(*)::int from public.decks), 0, 'anon sees no decks');
select is((select count(*)::int from public.concepts), 0, 'anon sees no concepts');
select is((select count(*)::int from public.practice_items), 0, 'anon sees no practice_items');
select is((select count(*)::int from public.tags), 0, 'anon sees no tags');
select is((select count(*)::int from public.deck_concepts), 0, 'anon sees no deck_concepts');
select is((select count(*)::int from public.concept_tags), 0, 'anon sees no concept_tags');

select throws_ok(
  $$ insert into public.decks (course_id, owner_id, title)
     values ('c0a75e00-0000-4000-8000-00000000000a',
             'a11ce000-0000-4000-8000-000000000001', 'anon') $$,
  '42501', null,
  'anon cannot insert a deck');

-- ===========================================================================
-- Block service_role — documents that it bypasses RLS on purpose.
-- ===========================================================================

reset role;
set local role service_role;

select ok((select count(*)::int from public.decks) >= 2,
  'service_role bypasses RLS and sees every deck');
select ok((select count(*)::int from public.concepts) >= 2,
  'service_role bypasses RLS and sees every concept');

reset role;

select * from finish();
rollback;
