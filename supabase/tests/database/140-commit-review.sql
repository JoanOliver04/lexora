-- LEX-5.9 — public.commit_review: atomic state update + log append.
--
-- Exercised as `authenticated` with auth.uid() pinned (SECURITY INVOKER).
-- Self-contained synthetic users, like 130.

begin;
select plan(16);

insert into auth.users (id) values
  ('a11ce000-0000-4000-8000-000000000001'),
  ('b0b0b000-0000-4000-8000-000000000002');
insert into public.profiles (id) values
  ('a11ce000-0000-4000-8000-000000000001'),
  ('b0b0b000-0000-4000-8000-000000000002');
insert into public.languages (id, code, locale, name_key) values
  ('20000000-0000-4000-8000-000000000000', 'zz', 'zz', 'language.zz'),
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

select is(
  (select prosecdef from pg_proc where proname = 'commit_review'),
  false,
  'commit_review es SECURITY INVOKER'
);
select ok(
  (select array_to_string(proconfig, ',') like '%search_path=%'
     from pg_proc where proname = 'commit_review'),
  'commit_review fija search_path'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a11ce000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select auth.uid())::text, 'a11ce000-0000-4000-8000-000000000001',
  'auth.uid() resuelve a A');

select is(
  (select public.commit_review(
     'b1000000-0000-4000-8000-00000000000a', 1, 'idem-a-1', 'good',
     '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
     2.3065, 2.1, 0, 1, 1, 0, 'learning', '2026-09-11T10:00:00Z',
     '5.4.2', 'v1',
     '{"phase":"new"}'::jsonb, '{"phase":"learning"}'::jsonb,
     '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
     null, 1500
   )->>'ok'),
  'true',
  'A confirma un repaso'
);
select is(
  (select revision from public.learning_states
    where id = '57a7e000-0000-4000-8000-00000000000a'),
  2,
  'revision pasa a 2'
);
select is(
  (select count(*)::int from public.review_logs
    where owner_id = 'a11ce000-0000-4000-8000-000000000001'),
  1,
  'se escribe un solo log'
);
select is(
  (select phase::text from public.learning_states
    where id = '57a7e000-0000-4000-8000-00000000000a'),
  'learning',
  'el estado queda en learning'
);

select is(
  (select public.commit_review(
     'b1000000-0000-4000-8000-00000000000a', 1, 'idem-a-1', 'again',
     '2026-09-11T10:00:00Z', '2026-09-11T10:01:00Z',
     1, 1, 0, 0, 2, 1, 'learning', '2026-09-11T10:00:00Z',
     '5.4.2', 'v1',
     '{"phase":"learning"}'::jsonb, '{"phase":"learning"}'::jsonb,
     '2026-09-11T10:10:00Z', '2026-09-11T10:11:00Z',
     null, null
   )->>'replayed'),
  'true',
  'la misma clave de idempotencia se reexpide'
);
select is(
  (select count(*)::int from public.review_logs
    where owner_id = 'a11ce000-0000-4000-8000-000000000001'),
  1,
  'el reenvío no duplica el log'
);
select is(
  (select revision from public.learning_states
    where id = '57a7e000-0000-4000-8000-00000000000a'),
  2,
  'el reenvío no vuelve a incrementar revision'
);

select is(
  (select public.commit_review(
     'b1000000-0000-4000-8000-00000000000a', 1, 'idem-a-2', 'hard',
     '2026-09-11T10:20:00Z', '2026-09-11T10:26:00Z',
     2, 2, 0, 1, 2, 0, 'learning', '2026-09-11T10:20:00Z',
     '5.4.2', 'v1',
     '{"phase":"learning"}'::jsonb, '{"phase":"learning"}'::jsonb,
     '2026-09-11T10:10:00Z', '2026-09-11T10:26:00Z',
     null, null
   )->>'reason'),
  'revision-conflict',
  'una revision esperada obsoleta no escribe'
);
select is(
  (select count(*)::int from public.review_logs
    where owner_id = 'a11ce000-0000-4000-8000-000000000001'),
  1,
  'el conflicto no añade un log'
);

select is(
  (select public.commit_review(
     'b1000000-0000-4000-8000-00000000000b', 1, 'idem-cross', 'good',
     '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
     2, 2, 0, 1, 1, 0, 'learning', '2026-09-11T10:00:00Z',
     '5.4.2', 'v1',
     '{"phase":"new"}'::jsonb, '{"phase":"learning"}'::jsonb,
     '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
     null, null
   )->>'reason'),
  'not-found',
  'A no confirma el ítem de B'
);

reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$ select public.commit_review(
       'b1000000-0000-4000-8000-00000000000a', 1, 'anon', 'good',
       '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
       2, 2, 0, 1, 1, 0, 'learning', '2026-09-11T10:00:00Z',
       '5.4.2', 'v1',
       '{}'::jsonb, '{}'::jsonb,
       '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
       null, null
     ) $$,
  '42501',
  null,
  'anon no tiene EXECUTE sobre commit_review'
);

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b0b0b000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select revision from public.learning_states
    where id = '57a7e000-0000-4000-8000-00000000000b'),
  1,
  'el estado de B sigue en revision 1'
);
select is(
  (select count(*)::int from public.review_logs
    where owner_id = 'b0b0b000-0000-4000-8000-000000000002'),
  0,
  'B no tiene logs: A no escribió en su historial'
);

reset role;
select * from finish();
rollback;
