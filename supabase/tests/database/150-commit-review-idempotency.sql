-- LEX-5.10 — End-to-end idempotency of public.commit_review.
--
-- Same (owner, idempotency_key) returns the original result and a single
-- log. Two owners may reuse a key. A retry with a stale expected
-- revision (lost response / double-click) replays instead of conflicting.
-- A reused key on another item of the same owner does not write a second
-- log. Self-contained fixtures, like 140.

begin;
select plan(14);

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
  ('b1000000-0000-4000-8000-00000000000c',
   'c1000000-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   'basic_recall', 'house', 'casa', '{"mode":"basic_recall"}'::jsonb),
  ('b1000000-0000-4000-8000-00000000000b',
   'c1000000-0000-4000-8000-00000000000b', 'b0b0b000-0000-4000-8000-000000000002',
   'basic_recognition', 'house', 'casa', '{"mode":"basic_recognition"}'::jsonb);
insert into public.learning_states
  (id, owner_id, practice_item_id, due_at, scheduler_version, config_version) values
  ('57a7e000-0000-4000-8000-00000000000a',
   'a11ce000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-00000000000a',
   '2026-09-11T10:00:00Z', '5.4.2', 'v1'),
  ('57a7e000-0000-4000-8000-00000000000c',
   'a11ce000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-00000000000c',
   '2026-09-11T10:00:00Z', '5.4.2', 'v1'),
  ('57a7e000-0000-4000-8000-00000000000b',
   'b0b0b000-0000-4000-8000-000000000002',
   'b1000000-0000-4000-8000-00000000000b',
   '2026-09-11T10:00:00Z', '5.4.2', 'v1');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a11ce000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select auth.uid())::text, 'a11ce000-0000-4000-8000-000000000001',
  'auth.uid() resuelve a A');

select is(
  (select public.commit_review(
     'b1000000-0000-4000-8000-00000000000a', 1, 'idem-shared', 'good',
     '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
     2.3065, 2.1, 0, 1, 1, 0, 'learning', '2026-09-11T10:00:00Z',
     '5.4.2', 'v1',
     '{"phase":"new"}'::jsonb, '{"phase":"learning"}'::jsonb,
     '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
     null, 1500
   )->>'ok'),
  'true',
  'A confirma el primer envío'
);

select is(
  (select public.commit_review(
     'b1000000-0000-4000-8000-00000000000a', 1, 'idem-shared', 'again',
     '2026-09-11T10:00:00Z', '2026-09-11T10:01:00Z',
     1, 1, 0, 0, 2, 1, 'learning', '2026-09-11T10:00:00Z',
     '5.4.2', 'v1',
     '{"phase":"new"}'::jsonb, '{"phase":"learning"}'::jsonb,
     '2026-09-11T10:00:00Z', '2026-09-11T10:01:00Z',
     null, 99
   )->>'replayed'),
  'true',
  'el reintento de red (misma clave, revision obsoleta) se reexpide'
);

select is(
  (select rating::text from public.review_logs
    where owner_id = 'a11ce000-0000-4000-8000-000000000001'
      and idempotency_key = 'idem-shared'),
  'good',
  'el reintento no sustituye la valoración original'
);
select is(
  (select due_at from public.learning_states
    where id = '57a7e000-0000-4000-8000-00000000000a'),
  '2026-09-11T10:10:00Z'::timestamptz,
  'el reintento no cambia el vencimiento original'
);
select is(
  (select count(*)::int from public.review_logs
    where owner_id = 'a11ce000-0000-4000-8000-000000000001'),
  1,
  'un solo log para A tras el reintento'
);
select is(
  (select revision from public.learning_states
    where id = '57a7e000-0000-4000-8000-00000000000a'),
  2,
  'revision de A sigue en 2'
);

select is(
  (select public.commit_review(
     'b1000000-0000-4000-8000-00000000000c', 1, 'idem-shared', 'easy',
     '2026-09-11T11:00:00Z', '2026-09-19T10:00:00Z',
     8, 2, 8, 0, 1, 0, 'review', '2026-09-11T11:00:00Z',
     '5.4.2', 'v1',
     '{"phase":"new"}'::jsonb, '{"phase":"review"}'::jsonb,
     '2026-09-11T10:00:00Z', '2026-09-19T10:00:00Z',
     null, null
   )->>'replayed'),
  'true',
  'reutilizar la clave en otro ítem del mismo dueño no escribe'
);
select is(
  (select revision from public.learning_states
    where id = '57a7e000-0000-4000-8000-00000000000c'),
  1,
  'el segundo ítem de A sigue en revision 1'
);
select is(
  (select count(*)::int from public.review_logs
    where owner_id = 'a11ce000-0000-4000-8000-000000000001'),
  1,
  'sigue habiendo un solo log de A'
);

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b0b0b000-0000-4000-8000-000000000002","role":"authenticated"}';

select is((select auth.uid())::text, 'b0b0b000-0000-4000-8000-000000000002',
  'auth.uid() resuelve a B');

select is(
  (select public.commit_review(
     'b1000000-0000-4000-8000-00000000000b', 1, 'idem-shared', 'good',
     '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
     2.3065, 2.1, 0, 1, 1, 0, 'learning', '2026-09-11T10:00:00Z',
     '5.4.2', 'v1',
     '{"phase":"new"}'::jsonb, '{"phase":"learning"}'::jsonb,
     '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
     null, 1500
   )->>'replayed'),
  'false',
  'B puede usar la misma clave que A: no colisionan'
);
select is(
  (select count(*)::int from public.review_logs
    where owner_id = 'b0b0b000-0000-4000-8000-000000000002'),
  1,
  'B tiene su propio log'
);

reset role;
select is(
  (select count(*)::int from public.review_logs
    where owner_id = 'a11ce000-0000-4000-8000-000000000001'),
  1,
  'el envío de B no toca el historial de A'
);

select * from finish();
rollback;
