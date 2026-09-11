-- LEX-5.11 — Optimistic concurrency on public.commit_review.
--
-- Two reviews of the same item with the same expected revision: one
-- writes, the other gets revision-conflict. The winner's due_at is
-- intact (no lost update). Distinct idempotency keys, unlike 150.
--
-- Overlapping backends cannot share this transaction's uncommitted
-- fixtures; FOR UPDATE in commit_review serializes them and the waiter
-- then sees the new revision. This file proves that outcome, and that
-- the function still locks the row after LEX-5.10's REPLACE.

begin;
select plan(8);

insert into auth.users (id) values
  ('a11ce000-0000-4000-8000-000000000001');
insert into public.profiles (id) values
  ('a11ce000-0000-4000-8000-000000000001');
insert into public.languages (id, code, locale, name_key) values
  ('20000000-0000-4000-8000-000000000000', 'zz', 'zz', 'language.zz'),
  ('30000000-0000-4000-8000-000000000000', 'zz', 'zz-ZZ', 'language.zz_zz');
insert into public.courses (id, owner_id, title, source_language_id, target_language_id) values
  ('c0a75e00-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   'Curso A', '20000000-0000-4000-8000-000000000000', '30000000-0000-4000-8000-000000000000');
insert into public.concepts (id, course_id, owner_id, kind, title, summary) values
  ('c1000000-0000-4000-8000-00000000000a',
   'c0a75e00-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   'vocabulary', 'casa', 'vivienda');
insert into public.practice_items
  (id, concept_id, owner_id, mode, prompt_text, answer_text, config) values
  ('b1000000-0000-4000-8000-00000000000a',
   'c1000000-0000-4000-8000-00000000000a', 'a11ce000-0000-4000-8000-000000000001',
   'basic_recognition', 'casa', 'house', '{"mode":"basic_recognition"}'::jsonb);
insert into public.learning_states
  (id, owner_id, practice_item_id, due_at, scheduler_version, config_version) values
  ('57a7e000-0000-4000-8000-00000000000a',
   'a11ce000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-00000000000a',
   '2026-09-11T10:00:00Z', '5.4.2', 'v1');

select ok(
  (select prosrc ilike '%for update%' from pg_proc where proname = 'commit_review'),
  'commit_review bloquea la fila con FOR UPDATE'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a11ce000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select public.commit_review(
     'b1000000-0000-4000-8000-00000000000a', 1, 'device-a', 'good',
     '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
     2.3065, 2.1, 0, 1, 1, 0, 'learning', '2026-09-11T10:00:00Z',
     '5.4.2', 'v1',
     '{"phase":"new"}'::jsonb, '{"phase":"learning"}'::jsonb,
     '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
     null, 1500
   )->>'ok'),
  'true',
  'el primer dispositivo confirma'
);

select is(
  (select public.commit_review(
     'b1000000-0000-4000-8000-00000000000a', 1, 'device-b', 'again',
     '2026-09-11T10:00:00Z', '2026-09-11T10:01:00Z',
     1, 1, 0, 0, 2, 1, 'learning', '2026-09-11T10:00:00Z',
     '5.4.2', 'v1',
     '{"phase":"new"}'::jsonb, '{"phase":"relearning"}'::jsonb,
     '2026-09-11T10:00:00Z', '2026-09-11T10:01:00Z',
     null, 800
   )->>'reason'),
  'revision-conflict',
  'el segundo dispositivo, misma revision, recibe conflicto'
);

select is(
  (select revision from public.learning_states
    where id = '57a7e000-0000-4000-8000-00000000000a'),
  2,
  'revision queda en 2: no hay lost update'
);
select is(
  (select due_at from public.learning_states
    where id = '57a7e000-0000-4000-8000-00000000000a'),
  '2026-09-11T10:10:00Z'::timestamptz,
  'el vencimiento del ganador se conserva'
);
select is(
  (select phase::text from public.learning_states
    where id = '57a7e000-0000-4000-8000-00000000000a'),
  'learning',
  'la fase del ganador se conserva'
);
select is(
  (select count(*)::int from public.review_logs
    where owner_id = 'a11ce000-0000-4000-8000-000000000001'),
  1,
  'el perdedor no escribe un segundo log'
);
select is(
  (select rating::text from public.review_logs
    where owner_id = 'a11ce000-0000-4000-8000-000000000001'),
  'good',
  'el log es el del ganador'
);

reset role;
select * from finish();
rollback;
