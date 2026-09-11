-- LEX-5.5 — Owner / non-owner isolation for the study tables.
--
-- LEX-5.4 enabled RLS with no policies (deny-all); LEX-5.5 adds the explicit
-- per-operation policies, the owner indexes and the queue/history indexes.
-- This file proves the policies functionally: it becomes a role, with a given
-- `auth.uid()`, and checks what that role can read, write and — above all —
-- cannot reach. `review_logs` has no UPDATE even for the owner.
--
-- **Self-contained**, like 090 / 110: it builds its own synthetic `zz`
-- languages and two users instead of leaning on `seed.sql`.
--
-- Two kinds of denial are distinguished on purpose:
--   * `42501` — a policy WITH CHECK rejected the row (INSERT as another user),
--     or no UPDATE policy exists at all (append-only logs).
--   * zero rows — RLS filtered the target out of USING before the write
--     (UPDATE / DELETE aimed at another user's row), no error raised.
--   * `23503` — a composite FK rejected the row. FK validation bypasses RLS,
--     so those assertions prove the *schema* (LEX-5.4), not the policy.
--
-- Every role block pins `auth.uid()` first: a JWT claim that failed to wire
-- through would make `auth.uid()` NULL, every policy would deny everything,
-- and every "A cannot see B" line would pass while also, silently, meaning
-- "A cannot see A". So each deny is paired with the matching allow.

begin;
select plan(45);

-- ===========================================================================
-- Fixture (as the migration/test role: BYPASSRLS).
-- ===========================================================================

insert into auth.users (id) values
  ('a11ce000-0000-4000-8000-000000000001'),
  ('b0b0b000-0000-4000-8000-000000000002');

insert into public.profiles (id) values
  ('a11ce000-0000-4000-8000-000000000001'),
  ('b0b0b000-0000-4000-8000-000000000002');

insert into public.languages (id, code, locale, name_key) values
  ('20000000-0000-4000-8000-000000000000', 'zz', 'zz',    'language.zz'),
  ('30000000-0000-4000-8000-000000000000', 'zz', 'zz-ZZ', 'language.zz_zz');

insert into public.courses (id, owner_id, title, source_language_id, target_language_id) values
  ('c0a75e00-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   'Curso A', '20000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000000'),
  ('c0a75e00-0000-4000-8000-00000000000b', 'b0b0b000-0000-4000-8000-000000000002',
   'Curso B', '20000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000000');

insert into public.concepts (id, course_id, owner_id, kind, title, summary) values
  ('c1000000-0000-4000-8000-00000000000a',
   'c0a75e00-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   'vocabulary', 'casa', 'vivienda'),
  ('c1000000-0000-4000-8000-00000000000b',
   'c0a75e00-0000-4000-8000-00000000000b', 'b0b0b000-0000-4000-8000-000000000002',
   'vocabulary', 'house', 'dwelling');

insert into public.practice_items
  (id, concept_id, owner_id, mode, prompt_text, answer_text, config) values
  ('b1000000-0000-4000-8000-00000000000a',
   'c1000000-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   'basic_recognition', 'casa', 'house', '{"mode":"basic_recognition"}'::jsonb),
  ('b1000000-0000-4000-8000-00000000000b',
   'c1000000-0000-4000-8000-00000000000b', 'b0b0b000-0000-4000-8000-000000000002',
   'basic_recognition', 'house', 'casa', '{"mode":"basic_recognition"}'::jsonb);

insert into public.learning_states
  (id, owner_id, practice_item_id, due_at, scheduler_version, config_version) values
  ('57a7e000-0000-4000-8000-00000000000a',
   'a11ce000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-00000000000a',
   '2026-09-11T10:00:00Z', '5.4.2', 'v1'),
  ('57a7e000-0000-4000-8000-00000000000b',
   'b0b0b000-0000-4000-8000-000000000002',
   'b1000000-0000-4000-8000-00000000000b',
   '2026-09-11T10:00:00Z', '5.4.2', 'v1');

insert into public.study_sessions (id, owner_id, course_id) values
  ('5e551000-0000-4000-8000-00000000000a',
   'a11ce000-0000-4000-8000-000000000001',
   'c0a75e00-0000-4000-8000-00000000000a'),
  ('5e551000-0000-4000-8000-00000000000b',
   'b0b0b000-0000-4000-8000-000000000002',
   'c0a75e00-0000-4000-8000-00000000000b');

insert into public.review_logs
  (id, owner_id, practice_item_id, study_session_id, idempotency_key,
   rating, reviewed_at, state_before, state_after, due_before, due_after,
   scheduler_version, config_version) values
  ('10c00000-0000-4000-8000-00000000000a',
   'a11ce000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-00000000000a',
   '5e551000-0000-4000-8000-00000000000a',
   'idem-a-1', 'good', '2026-09-11T10:00:00Z',
   '{"phase":"new"}'::jsonb, '{"phase":"learning"}'::jsonb,
   '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
   '5.4.2', 'v1'),
  ('10c00000-0000-4000-8000-00000000000b',
   'b0b0b000-0000-4000-8000-000000000002',
   'b1000000-0000-4000-8000-00000000000b',
   '5e551000-0000-4000-8000-00000000000b',
   'idem-b-1', 'good', '2026-09-11T10:00:00Z',
   '{"phase":"new"}'::jsonb, '{"phase":"learning"}'::jsonb,
   '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
   '5.4.2', 'v1');

-- ===========================================================================
-- Block 0 — the policy set is exactly what the migration declares.
-- ===========================================================================

select bag_eq(
  $$ select policyname from pg_policies
      where schemaname = 'public' and tablename = 'learning_states' $$,
  $$ values ('learning_states_select_own'), ('learning_states_insert_own'),
            ('learning_states_update_own'), ('learning_states_delete_own') $$,
  'learning_states exposes the four owner policies'
);
select bag_eq(
  $$ select policyname from pg_policies
      where schemaname = 'public' and tablename = 'study_sessions' $$,
  $$ values ('study_sessions_select_own'), ('study_sessions_insert_own'),
            ('study_sessions_update_own'), ('study_sessions_delete_own') $$,
  'study_sessions exposes the four owner policies'
);
select bag_eq(
  $$ select policyname from pg_policies
      where schemaname = 'public' and tablename = 'review_logs' $$,
  $$ values ('review_logs_select_own'), ('review_logs_insert_own'),
            ('review_logs_delete_own') $$,
  'review_logs exposes SELECT/INSERT/DELETE and deliberately no UPDATE'
);

select is_empty(
  $$ select c.relname
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in ('learning_states', 'study_sessions', 'review_logs')
        and not exists (
          select 1 from pg_policies p
           where p.schemaname = 'public' and p.tablename = c.relname
        ) $$,
  'the three study tables have at least one policy'
);

select has_index('public', 'learning_states', 'learning_states_owner_id_idx',
  'learning_states has the owner_id RLS index');
select has_index('public', 'learning_states', 'learning_states_owner_due_at_idx',
  'learning_states has the (owner_id, due_at) queue index');
select has_index('public', 'study_sessions', 'study_sessions_owner_id_idx',
  'study_sessions has the owner_id RLS index');
select has_index('public', 'study_sessions', 'study_sessions_owner_started_at_idx',
  'study_sessions has the (owner_id, started_at) list index');
select has_index('public', 'review_logs', 'review_logs_owner_id_idx',
  'review_logs has the owner_id RLS index');
select has_index('public', 'review_logs', 'review_logs_owner_reviewed_at_idx',
  'review_logs has the (owner_id, reviewed_at) history index');
select has_index('public', 'review_logs', 'review_logs_owner_item_reviewed_at_idx',
  'review_logs has the per-item history index');

-- ===========================================================================
-- Block A — become user A.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a11ce000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select auth.uid())::text, 'a11ce000-0000-4000-8000-000000000001',
  'auth.uid() resolves to A inside the authenticated role');

select is((select count(*)::int from public.learning_states), 1,
  'A sees exactly its own learning_state');
select is(
  (select count(*)::int from public.learning_states
    where owner_id = 'b0b0b000-0000-4000-8000-000000000002'),
  0, 'A cannot see B''s learning_state even filtering by B''s owner_id');
select is(
  (select count(*)::int from public.learning_states
    where id = '57a7e000-0000-4000-8000-00000000000b'),
  0, 'A cannot reach B''s learning_state through a known UUID');

select is((select count(*)::int from public.study_sessions), 1,
  'A sees exactly its own study_session');
select is(
  (select count(*)::int from public.study_sessions
    where id = '5e551000-0000-4000-8000-00000000000b'),
  0, 'A cannot reach B''s study_session through a known UUID');

select is((select count(*)::int from public.review_logs), 1,
  'A sees exactly its own review_log');
select is(
  (select count(*)::int from public.review_logs
    where id = '10c00000-0000-4000-8000-00000000000b'),
  0, 'A cannot reach B''s review_log through a known UUID');

-- --- Mutations A is allowed to make on its own rows --------------------

select lives_ok(
  $$ update public.learning_states set revision = 2, phase = 'learning'
      where id = '57a7e000-0000-4000-8000-00000000000a' $$,
  'A can update its own learning_state');
select lives_ok(
  $$ update public.study_sessions set reviews_count = 1
      where id = '5e551000-0000-4000-8000-00000000000a' $$,
  'A can update its own study_session');
select lives_ok(
  $$ insert into public.review_logs
       (owner_id, practice_item_id, study_session_id, idempotency_key,
        rating, reviewed_at, state_before, state_after, due_before, due_after,
        scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a',
             '5e551000-0000-4000-8000-00000000000a',
             'idem-a-2', 'hard', '2026-09-11T10:20:00Z',
             '{"phase":"learning"}'::jsonb, '{"phase":"learning"}'::jsonb,
             '2026-09-11T10:10:00Z', '2026-09-11T10:26:00Z',
             '5.4.2', 'v1') $$,
  'A can append a review_log on its own item');

-- Append-only: no UPDATE policy, so USING matches nothing — even the
-- owner's own row. Silent zero-row, same shape as a hijack UPDATE.
with u as (
  update public.review_logs set rating = 'again'
   where id = '10c00000-0000-4000-8000-00000000000a'
  returning 1
)
select is((select count(*)::int from u), 0,
  'A cannot UPDATE its own review_log (append-only: zero rows, no error)');

-- --- Mutations A must not be able to make against B ------------------

select throws_ok(
  $$ insert into public.learning_states
       (owner_id, practice_item_id, due_at, scheduler_version, config_version)
     values ('b0b0b000-0000-4000-8000-000000000002',
             'b1000000-0000-4000-8000-00000000000b',
             '2026-09-11T10:00:00Z', '5.4.2', 'v1') $$,
  '42501', null,
  'A cannot insert a learning_state owned by B (WITH CHECK)'
);
select throws_ok(
  $$ insert into public.study_sessions (owner_id, course_id)
     values ('b0b0b000-0000-4000-8000-000000000002',
             'c0a75e00-0000-4000-8000-00000000000b') $$,
  '42501', null,
  'A cannot insert a study_session owned by B (WITH CHECK)'
);
select throws_ok(
  $$ insert into public.review_logs
       (owner_id, practice_item_id, idempotency_key,
        rating, reviewed_at, state_before, state_after,
        due_before, due_after, scheduler_version, config_version)
     values ('b0b0b000-0000-4000-8000-000000000002',
             'b1000000-0000-4000-8000-00000000000b', 'hijack',
             'easy', '2026-09-11T10:00:00Z',
             '{}'::jsonb, '{}'::jsonb,
             '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
             '5.4.2', 'v1') $$,
  '42501', null,
  'A cannot insert a review_log owned by B (WITH CHECK)'
);

-- Linking A's owner_id to B's item fails at the composite FK (schema, 5.4).
select throws_ok(
  $$ insert into public.learning_states
       (owner_id, practice_item_id, due_at, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000b',
             '2026-09-11T10:00:00Z', '5.4.2', 'v1') $$,
  '23503', null,
  'A hanging a state on B''s item fails at the composite FK (schema, not policy)'
);

with u as (
  update public.learning_states set revision = 99
   where owner_id = 'b0b0b000-0000-4000-8000-000000000002'
  returning 1
)
select is((select count(*)::int from u), 0,
  'A''s UPDATE aimed at B''s learning_state affects zero rows');

with u as (
  update public.study_sessions set reviews_count = 99
   where owner_id = 'b0b0b000-0000-4000-8000-000000000002'
  returning 1
)
select is((select count(*)::int from u), 0,
  'A''s UPDATE aimed at B''s study_session affects zero rows');

with d as (
  delete from public.review_logs
   where owner_id = 'b0b0b000-0000-4000-8000-000000000002'
  returning 1
)
select is((select count(*)::int from d), 0,
  'A''s DELETE aimed at B''s review_log affects zero rows');

with d as (
  delete from public.learning_states
   where owner_id = 'b0b0b000-0000-4000-8000-000000000002'
  returning 1
)
select is((select count(*)::int from d), 0,
  'A''s DELETE aimed at B''s learning_state affects zero rows');

-- ===========================================================================
-- Block B — become user B; confirm A's writes were real and B's rows intact.
-- ===========================================================================

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b0b0b000-0000-4000-8000-000000000002","role":"authenticated"}';

select is((select auth.uid())::text, 'b0b0b000-0000-4000-8000-000000000002',
  'auth.uid() resolves to B inside the authenticated role');

select is((select count(*)::int from public.learning_states), 1,
  'B sees exactly its own learning_state');
select is((select revision from public.learning_states), 1,
  'B''s learning_state revision is untouched by A''s hijack attempts');
select is((select count(*)::int from public.study_sessions), 1,
  'B still has its study_session');
select is((select reviews_count from public.study_sessions), 0,
  'B''s session counters are untouched');
select is((select count(*)::int from public.review_logs), 1,
  'B still has its review_log: A''s DELETE did nothing');
select is((select rating::text from public.review_logs), 'good',
  'B''s review_log rating is untouched');
select is(
  (select count(*)::int from public.learning_states
    where owner_id = 'a11ce000-0000-4000-8000-000000000001'),
  0, 'B cannot see A''s learning_state');

-- ===========================================================================
-- Block anon — an unauthenticated visitor reaches no study row.
-- ===========================================================================

reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is((select count(*)::int from public.learning_states), 0,
  'anon sees no learning_states');
select is((select count(*)::int from public.study_sessions), 0,
  'anon sees no study_sessions');
select is((select count(*)::int from public.review_logs), 0,
  'anon sees no review_logs');
select throws_ok(
  $$ insert into public.learning_states
       (owner_id, practice_item_id, due_at, scheduler_version, config_version)
     values ('a11ce000-0000-4000-8000-000000000001',
             'b1000000-0000-4000-8000-00000000000a',
             '2026-09-11T10:00:00Z', '5.4.2', 'v1') $$,
  '42501', null,
  'anon cannot insert a learning_state'
);

-- ===========================================================================
-- Block service_role — documents that it bypasses RLS on purpose.
-- ===========================================================================

reset role;
set local role service_role;

select ok((select count(*)::int from public.learning_states) >= 2,
  'service_role bypasses RLS and sees every learning_state');
select ok((select count(*)::int from public.review_logs) >= 2,
  'service_role bypasses RLS and sees every review_log');

reset role;

select * from finish();
rollback;
