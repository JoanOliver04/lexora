-- LEX-2.3 — Owner / non-owner isolation for the identity and course tables.
--
-- LEX-2.1 enabled RLS with no policies (deny-all); LEX-2.3 adds the explicit
-- per-operation policies. This file proves them functionally: it becomes a
-- given role, with a given `auth.uid()`, and checks what that role can read,
-- write and — above all — cannot reach.
--
-- **Self-contained**, like 020: it builds its own synthetic `zz` languages and
-- two users instead of leaning on `seed.sql`. `zz` is ISO 639 private-use, so
-- it never collides with the real seed rows that `db:reset` also loads.
--
-- Why the identity assertion in every role block matters: if the JWT claim
-- failed to wire through to `auth.uid()`, it would return NULL, every policy
-- would deny everything, and every "A cannot see B" line below would pass
-- while silently also meaning "A cannot see A". So each block first pins
-- `auth.uid()`, and every deny is paired with the matching allow.

begin;
select plan(36);

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
   'Curso de A', '20000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000000'),
  ('c0a75e00-0000-4000-8000-00000000000b', 'b0b0b000-0000-4000-8000-000000000002',
   'Curso de B', '20000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000000');

insert into public.course_settings (course_id, user_id) values
  ('c0a75e00-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001'),
  ('c0a75e00-0000-4000-8000-00000000000b', 'b0b0b000-0000-4000-8000-000000000002');

-- ===========================================================================
-- Block 0 — the policy set is exactly what the migration declares.
--
-- `bag_eq` on `pg_policies` states it positively: these policies and no
-- others. In particular `profiles` must have no DELETE policy, and
-- `languages` must have only the read-only SELECT.
-- ===========================================================================

select bag_eq(
  $$ select policyname from pg_policies
      where schemaname = 'public' and tablename = 'languages' $$,
  $$ values ('languages_select_all') $$,
  'languages exposes exactly one policy: read-only SELECT'
);

select bag_eq(
  $$ select policyname from pg_policies
      where schemaname = 'public' and tablename = 'profiles' $$,
  $$ values ('profiles_select_own'), ('profiles_insert_own'), ('profiles_update_own') $$,
  'profiles exposes SELECT/INSERT/UPDATE owner policies and deliberately no DELETE'
);

select bag_eq(
  $$ select policyname from pg_policies
      where schemaname = 'public' and tablename = 'courses' $$,
  $$ values ('courses_select_own'), ('courses_insert_own'),
            ('courses_update_own'), ('courses_delete_own') $$,
  'courses exposes the four owner policies'
);

select bag_eq(
  $$ select policyname from pg_policies
      where schemaname = 'public' and tablename = 'course_settings' $$,
  $$ values ('course_settings_select_own'), ('course_settings_insert_own'),
            ('course_settings_update_own'), ('course_settings_delete_own') $$,
  'course_settings exposes the four owner policies'
);

-- ===========================================================================
-- Block A — become user A.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a11ce000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select auth.uid())::text,
  'a11ce000-0000-4000-8000-000000000001',
  'auth.uid() resolves to A inside the authenticated role'
);

-- --- SELECT: A reaches only its own rows -----------------------------------

select is(
  (select count(*)::int from public.profiles),
  1,
  'A sees exactly one profile'
);

select is(
  (select count(*)::int from public.profiles where id = 'b0b0b000-0000-4000-8000-000000000002'),
  0,
  'A cannot see B''s profile'
);

select is(
  (select id::text from public.profiles),
  'a11ce000-0000-4000-8000-000000000001',
  'the single profile A sees is its own'
);

select is(
  (select count(*)::int from public.courses),
  1,
  'A sees exactly its own course'
);

select is(
  (select count(*)::int from public.courses where owner_id = 'b0b0b000-0000-4000-8000-000000000002'),
  0,
  'A cannot see B''s course even filtering by B''s owner_id'
);

select is(
  (select count(*)::int from public.course_settings),
  1,
  'A sees exactly its own course_settings'
);

select is(
  (select count(*)::int from public.course_settings
    where course_id = 'c0a75e00-0000-4000-8000-00000000000b'),
  0,
  'A cannot reach B''s course_settings through a known course UUID'
);

select is(
  (select count(*)::int from public.languages where code = 'zz'),
  2,
  'A can read the languages catalogue'
);

-- --- Mutations A is allowed to make on its own rows ----------------------

select lives_ok(
  $$ update public.profiles set display_name = 'A'
      where id = 'a11ce000-0000-4000-8000-000000000001' $$,
  'A can update its own profile'
);

select lives_ok(
  $$ update public.courses set title = 'Curso de A (editado)'
      where owner_id = 'a11ce000-0000-4000-8000-000000000001' $$,
  'A can update its own course'
);

select lives_ok(
  $$ insert into public.courses (id, owner_id, title, source_language_id, target_language_id)
     values ('c0a75e00-0000-4000-8000-00000000000d',
             'a11ce000-0000-4000-8000-000000000001', 'Curso nuevo de A',
             '20000000-0000-4000-8000-000000000000',
             '30000000-0000-4000-8000-000000000000') $$,
  'A can insert a course it owns'
);

select lives_ok(
  $$ delete from public.courses where id = 'c0a75e00-0000-4000-8000-00000000000d' $$,
  'A can delete its own course'
);

-- --- Mutations A must not be able to make against B --------------------

select throws_ok(
  $$ insert into public.courses (owner_id, title, source_language_id, target_language_id)
     values ('b0b0b000-0000-4000-8000-000000000002', 'secuestro',
             '20000000-0000-4000-8000-000000000000',
             '30000000-0000-4000-8000-000000000000') $$,
  '42501',
  null,
  'A cannot insert a course owned by B (WITH CHECK)'
);

with u as (
  update public.courses set title = 'secuestro'
   where owner_id = 'b0b0b000-0000-4000-8000-000000000002'
  returning 1
)
select is(
  (select count(*)::int from u),
  0,
  'A''s UPDATE aimed at B''s course affects zero rows'
);

with d as (
  delete from public.profiles
   where id = 'b0b0b000-0000-4000-8000-000000000002'
  returning 1
)
select is(
  (select count(*)::int from d),
  0,
  'A''s DELETE aimed at B''s profile affects zero rows (no DELETE policy at all)'
);

with d as (
  delete from public.courses
   where owner_id = 'b0b0b000-0000-4000-8000-000000000002'
  returning 1
)
select is(
  (select count(*)::int from d),
  0,
  'A''s DELETE aimed at B''s course affects zero rows'
);

-- ===========================================================================
-- Block B — become user B; confirm A's writes were real and B's rows intact.
-- ===========================================================================

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b0b0b000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select auth.uid())::text,
  'b0b0b000-0000-4000-8000-000000000002',
  'auth.uid() resolves to B inside the authenticated role'
);

select is(
  (select count(*)::int from public.courses),
  1,
  'B sees exactly its own course'
);

select is(
  (select title from public.courses),
  'Curso de B',
  'B''s course title is untouched by A''s hijack attempts'
);

select is(
  (select display_name from public.profiles),
  null,
  'B''s profile is untouched by A''s update'
);

select is(
  (select count(*)::int from public.courses
    where owner_id = 'a11ce000-0000-4000-8000-000000000001'),
  0,
  'B cannot see A''s course'
);

-- ===========================================================================
-- Block anon — an unauthenticated visitor reaches no private row.
-- ===========================================================================

reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is(
  (select count(*)::int from public.profiles),
  0,
  'anon sees no profiles'
);

select is(
  (select count(*)::int from public.courses),
  0,
  'anon sees no courses'
);

select is(
  (select count(*)::int from public.course_settings),
  0,
  'anon sees no course_settings'
);

select is(
  (select count(*)::int from public.languages where code = 'zz'),
  2,
  'anon can read the languages catalogue'
);

select throws_ok(
  $$ insert into public.languages (code, locale, name_key)
     values ('zz', 'zz-XX', 'language.hack') $$,
  '42501',
  null,
  'anon cannot write the languages catalogue'
);

select throws_ok(
  $$ insert into public.courses (owner_id, title, source_language_id, target_language_id)
     values ('a11ce000-0000-4000-8000-000000000001', 'anon',
             '20000000-0000-4000-8000-000000000000',
             '30000000-0000-4000-8000-000000000000') $$,
  '42501',
  null,
  'anon cannot insert a course'
);

-- ===========================================================================
-- Block authenticated vs languages — the catalogue is read-only for users.
-- ===========================================================================

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a11ce000-0000-4000-8000-000000000001","role":"authenticated"}';

with u as (
  update public.languages set active = false where code = 'zz' returning 1
)
select is(
  (select count(*)::int from u),
  0,
  'an authenticated user''s UPDATE of the languages catalogue affects zero rows'
);

select throws_ok(
  $$ insert into public.languages (code, locale, name_key)
     values ('zz', 'zz-YY', 'language.nope') $$,
  '42501',
  null,
  'an authenticated user cannot insert into the languages catalogue'
);

with d as (
  delete from public.languages where code = 'zz' returning 1
)
select is(
  (select count(*)::int from d),
  0,
  'an authenticated user''s DELETE of the languages catalogue affects zero rows'
);

-- ===========================================================================
-- Block service_role — documents that it bypasses RLS on purpose.
-- This is why it must never reach the browser or a bundle (LEX-1.8).
-- ===========================================================================

reset role;
set local role service_role;

select ok(
  (select count(*)::int from public.profiles) >= 2,
  'service_role bypasses RLS and sees every profile'
);

reset role;

select * from finish();
rollback;
