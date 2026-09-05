-- LEX-4.3 — import_jobs / import_job_errors: structure, constraints, RLS.
--
-- Self-contained, like 040 / 090: builds its own synthetic `zz` languages and
-- two users. Proves the migration (enums, checks, composite FKs, cascade,
-- set-null) as the BYPASSRLS test role, then the policies functionally by
-- becoming user A and user B. Every deny is paired with the matching allow so
-- a JWT claim that failed to wire through (auth.uid() NULL → deny-all) does
-- not pass silently.

begin;
select plan(42);

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

insert into public.decks (id, course_id, owner_id, title) values
  ('d0000000-0000-4000-8000-00000000000a',
   'c0a75e00-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001', 'Mazo de A'),
  ('d0000000-0000-4000-8000-00000000000b',
   'c0a75e00-0000-4000-8000-00000000000b', 'b0b0b000-0000-4000-8000-000000000002', 'Mazo de B');

-- A's job, pointing at A's deck, with one row error.
insert into public.import_jobs (id, course_id, owner_id, deck_id, original_filename, content_hash) values
  ('1000d0b0-0000-4000-8000-00000000000a',
   'c0a75e00-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-00000000000a', 'mazo-a.txt', 'abc123');
insert into public.import_job_errors (id, import_job_id, owner_id, row_number, code, message) values
  ('e2200000-0000-4000-8000-00000000000a',
   '1000d0b0-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   3, 'too_few_columns', 'La fila 3 tiene menos de tres columnas.');

-- B's job.
insert into public.import_jobs (id, course_id, owner_id, original_filename, content_hash) values
  ('1000d0b0-0000-4000-8000-00000000000b',
   'c0a75e00-0000-4000-8000-00000000000b', 'b0b0b000-0000-4000-8000-000000000002',
   'mazo-b.txt', 'def456');

-- ===========================================================================
-- Block 0 — structure and constraints (as the BYPASSRLS role).
-- ===========================================================================

select has_table('public', 'import_jobs', 'import_jobs exists');
select has_table('public', 'import_job_errors', 'import_job_errors exists');
select hasnt_column('public', 'import_jobs', 'content',
  'import_jobs has no file-content column: the file is never stored (§13.14)');

select enum_has_labels('public', 'import_status',
  ARRAY['pending', 'mapping', 'importing', 'completed', 'failed'],
  'import_status has the five lifecycle labels');
select enum_has_labels('public', 'import_error_code',
  ARRAY['too_few_columns', 'too_many_columns', 'front_empty', 'back_empty'],
  'import_error_code has the four structural labels from the parser domain (LEX-4.2)');

select col_default_is('public', 'import_jobs', 'status', 'pending',
  'a new import_jobs row starts pending');

select has_trigger('public', 'import_jobs', 'import_jobs_set_updated_at',
  'import_jobs bumps updated_at on write');

-- --- CHECK constraints reject bad values ---------------------------------

select throws_ok(
  $$ insert into public.import_jobs (course_id, owner_id, original_filename, content_hash, rows_failed)
     values ('c0a75e00-0000-4000-8000-00000000000a',
             'a11ce000-0000-4000-8000-000000000001', 'x.txt', 'h', -1) $$,
  '23514', null, 'a negative counter is rejected');
select throws_ok(
  $$ insert into public.import_jobs (course_id, owner_id, original_filename, content_hash, mapping_config)
     values ('c0a75e00-0000-4000-8000-00000000000a',
             'a11ce000-0000-4000-8000-000000000001', 'x.txt', 'h', '[]'::jsonb) $$,
  '23514', null, 'mapping_config must be a JSON object, not an array');
select throws_ok(
  $$ insert into public.import_jobs (course_id, owner_id, original_filename, content_hash)
     values ('c0a75e00-0000-4000-8000-00000000000a',
             'a11ce000-0000-4000-8000-000000000001', '   ', 'h') $$,
  '23514', null, 'a blank filename is rejected');
select throws_ok(
  $$ insert into public.import_jobs (course_id, owner_id, original_filename, content_hash)
     values ('c0a75e00-0000-4000-8000-00000000000a',
             'a11ce000-0000-4000-8000-000000000001', 'x.txt', repeat('h', 129)) $$,
  '23514', null, 'an over-long content_hash is rejected');

select throws_ok(
  $$ insert into public.import_job_errors (import_job_id, owner_id, row_number, code, message)
     values ('1000d0b0-0000-4000-8000-00000000000a',
             'a11ce000-0000-4000-8000-000000000001', 0, 'front_empty', 'm') $$,
  '23514', null, 'row_number must be >= 1');
select throws_ok(
  $$ insert into public.import_job_errors (import_job_id, owner_id, row_number, code, message)
     values ('1000d0b0-0000-4000-8000-00000000000a',
             'a11ce000-0000-4000-8000-000000000001', 1, 'front_empty', repeat('m', 501)) $$,
  '23514', null, 'an over-long message is rejected');
select throws_ok(
  $$ insert into public.import_job_errors (import_job_id, owner_id, row_number, code, message, row_sample)
     values ('1000d0b0-0000-4000-8000-00000000000a',
             'a11ce000-0000-4000-8000-000000000001', 1, 'front_empty', 'm', repeat('s', 501)) $$,
  '23514', null, 'an over-long row_sample is rejected');

-- --- Composite FK: ownership is structural -----------------------------

select throws_ok(
  $$ insert into public.import_jobs (course_id, owner_id, original_filename, content_hash)
     values ('c0a75e00-0000-4000-8000-00000000000b',
             'a11ce000-0000-4000-8000-000000000001', 'x.txt', 'h') $$,
  '23503', null, 'A cannot open an import job against B''s course');
select throws_ok(
  $$ insert into public.import_job_errors (import_job_id, owner_id, row_number, code, message)
     values ('1000d0b0-0000-4000-8000-00000000000b',
             'a11ce000-0000-4000-8000-000000000001', 1, 'front_empty', 'm') $$,
  '23503', null, 'A cannot attach an error to B''s job');

-- --- Cascade and set-null ---------------------------------------------

select lives_ok(
  $$ insert into public.import_jobs (id, course_id, owner_id, deck_id, original_filename, content_hash)
     values ('1000d0b0-0000-4000-8000-0000000000ca',
             'c0a75e00-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-00000000000a', 'cascade.txt', 'h') $$,
  'fixture: a second job for A');
select lives_ok(
  $$ insert into public.import_job_errors (import_job_id, owner_id, row_number, code, message)
     values ('1000d0b0-0000-4000-8000-0000000000ca',
             'a11ce000-0000-4000-8000-000000000001', 1, 'back_empty', 'm') $$,
  'fixture: an error on that job');
select lives_ok(
  $$ delete from public.import_jobs where id = '1000d0b0-0000-4000-8000-0000000000ca' $$,
  'deleting a job succeeds');
select is(
  (select count(*)::int from public.import_job_errors
    where import_job_id = '1000d0b0-0000-4000-8000-0000000000ca'),
  0, 'deleting a job cascades its errors away');

select lives_ok(
  $$ delete from public.decks where id = 'd0000000-0000-4000-8000-00000000000a' $$,
  'deleting a destination deck succeeds');
select is(
  (select deck_id from public.import_jobs where id = '1000d0b0-0000-4000-8000-00000000000a'),
  null, 'the job survives the deck delete with deck_id nulled (history)');

-- --- Policy set is exactly what the migration declares ---------------

select bag_eq(
  $$ select policyname from pg_policies where schemaname = 'public' and tablename = 'import_jobs' $$,
  $$ values ('import_jobs_select_own'), ('import_jobs_insert_own'),
            ('import_jobs_update_own'), ('import_jobs_delete_own') $$,
  'import_jobs exposes the four owner policies');
select bag_eq(
  $$ select policyname from pg_policies where schemaname = 'public' and tablename = 'import_job_errors' $$,
  $$ values ('import_job_errors_select_own'), ('import_job_errors_insert_own'),
            ('import_job_errors_delete_own') $$,
  'import_job_errors exposes SELECT/INSERT/DELETE and deliberately no UPDATE');
select is_empty(
  $$ select c.relname
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in ('import_jobs', 'import_job_errors')
        and not exists (
          select 1 from pg_policies p
           where p.schemaname = 'public' and p.tablename = c.relname
        ) $$,
  'both import tables have at least one policy');

-- ===========================================================================
-- Block A — become user A.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a11ce000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select auth.uid())::text, 'a11ce000-0000-4000-8000-000000000001',
  'auth.uid() resolves to A');

select is((select count(*)::int from public.import_jobs), 1, 'A sees exactly its own job');
select is(
  (select count(*)::int from public.import_jobs where owner_id = 'b0b0b000-0000-4000-8000-000000000002'),
  0, 'A cannot see B''s job even filtering by B''s owner_id');
select is((select count(*)::int from public.import_job_errors), 1, 'A sees exactly its own row error');
select is(
  (select count(*)::int from public.import_jobs where id = '1000d0b0-0000-4000-8000-00000000000b'),
  0, 'A cannot reach B''s job through a known UUID');

select lives_ok(
  $$ update public.import_jobs set status = 'completed', rows_total = 10, rows_created = 9, rows_failed = 1
      where id = '1000d0b0-0000-4000-8000-00000000000a' $$,
  'A can advance the status and counters of its own job');
select lives_ok(
  $$ insert into public.import_job_errors (import_job_id, owner_id, row_number, code, message)
     values ('1000d0b0-0000-4000-8000-00000000000a',
             'a11ce000-0000-4000-8000-000000000001', 7, 'too_many_columns', 'La fila 7 tiene columnas de más.') $$,
  'A can record a row error on its own job');

select throws_ok(
  $$ insert into public.import_jobs (course_id, owner_id, original_filename, content_hash)
     values ('c0a75e00-0000-4000-8000-00000000000b',
             'b0b0b000-0000-4000-8000-000000000002', 'x.txt', 'h') $$,
  '42501', null, 'A cannot insert a job owned by B');
-- RLS filters B''s job out of USING before the write, so the UPDATE matches
-- zero rows and raises no error. That it changed nothing is confirmed in
-- Block B ("B''s job is still pending").
select lives_ok(
  $$ update public.import_jobs set status = 'failed'
      where id = '1000d0b0-0000-4000-8000-00000000000b' $$,
  'A''s UPDATE aimed at B''s job is a silent no-op, not an error');

-- ===========================================================================
-- Block B — become user B; A''s attempts left B untouched.
-- ===========================================================================

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b0b0b000-0000-4000-8000-000000000002","role":"authenticated"}';

select is((select auth.uid())::text, 'b0b0b000-0000-4000-8000-000000000002',
  'auth.uid() resolves to B');
select is((select count(*)::int from public.import_jobs), 1, 'B sees exactly its own job');
select is((select status::text from public.import_jobs), 'pending',
  'B''s job is still pending: A''s UPDATE did nothing');
select is((select count(*)::int from public.import_job_errors), 0, 'B has no row errors');
select is(
  (select count(*)::int from public.import_jobs where owner_id = 'a11ce000-0000-4000-8000-000000000001'),
  0, 'B cannot see A''s job');

-- ===========================================================================
-- Block anon.
-- ===========================================================================

reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is((select count(*)::int from public.import_jobs), 0, 'anon sees no import jobs');
select is((select count(*)::int from public.import_job_errors), 0, 'anon sees no row errors');
select throws_ok(
  $$ insert into public.import_jobs (course_id, owner_id, original_filename, content_hash)
     values ('c0a75e00-0000-4000-8000-00000000000a',
             'a11ce000-0000-4000-8000-000000000001', 'anon.txt', 'h') $$,
  '42501', null, 'anon cannot insert an import job');

reset role;

select * from finish();
rollback;
