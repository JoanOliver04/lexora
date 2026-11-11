-- LEX-6.10: fresh session commits stop after pause/close, receipts still replay.
begin;
select plan(12);

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

insert into auth.users(id) values ('b0b0b000-0000-4000-8000-000000000002');
insert into public.profiles(id) values ('b0b0b000-0000-4000-8000-000000000002');
insert into public.study_sessions(id, owner_id, course_id, started_at) values
  ('51000000-0000-4000-8000-000000000001', 'a11ce000-0000-4000-8000-000000000001',
   'c0a75e00-0000-4000-8000-00000000000a', '2026-09-11T10:00:00Z');

create function pg_temp.session_review(p_session uuid, p_key text, p_revision integer default 1)
returns jsonb language sql as $$
  select public.commit_review(
    'b1000000-0000-4000-8000-00000000000a', p_revision, p_key, 'good',
    '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z',
    2.3065, 2.1, 0, 1, 1, 0, 'learning', '2026-09-11T10:00:00Z',
    '5.4.2', 'v1', '{"phase":"new"}'::jsonb, '{"phase":"learning"}'::jsonb,
    '2026-09-11T10:00:00Z', '2026-09-11T10:10:00Z', p_session, 1500
  );
$$;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a11ce000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(pg_temp.session_review('51000000-0000-4000-8000-000000000001', 'original')->>'ok', 'true', 'active session commits');
update public.study_sessions set status = 'paused' where id = '51000000-0000-4000-8000-000000000001';
select is(pg_temp.session_review('51000000-0000-4000-8000-000000000001', 'original')->>'replayed', 'true', 'receipt replays after pause');
select is(pg_temp.session_review('51000000-0000-4000-8000-000000000001', 'paused-fresh', 2)->>'reason', 'not-found', 'fresh intent cannot commit in paused session');
update public.study_sessions set status = 'completed', ended_at = '2026-09-11T10:01:00Z' where id = '51000000-0000-4000-8000-000000000001';
select is(pg_temp.session_review('51000000-0000-4000-8000-000000000001', 'completed-fresh', 2)->>'reason', 'not-found', 'fresh intent cannot commit in completed session');
-- Direct owner updates are fixture preparation, not application transitions.
update public.study_sessions set status = 'abandoned' where id = '51000000-0000-4000-8000-000000000001';
select is(pg_temp.session_review('51000000-0000-4000-8000-000000000001', 'abandoned-fresh', 2)->>'reason', 'not-found', 'fresh intent cannot commit in abandoned session');
select is(pg_temp.session_review('51000000-0000-4000-8000-000000000002', 'missing-fresh', 2)->>'reason', 'not-found', 'unknown session cannot commit');
select is((select revision from public.learning_states where id = '57a7e000-0000-4000-8000-00000000000a'), 2, 'rejected intents preserve memory revision');
select is((select count(*)::int from public.review_logs), 1, 'one durable log only');
set local request.jwt.claims to '{"sub":"b0b0b000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(pg_temp.session_review('51000000-0000-4000-8000-000000000001', 'foreign-fresh')->>'reason', 'not-found', 'B cannot commit in A session');
with changed as (update public.study_sessions set status='active', ended_at=null where id='51000000-0000-4000-8000-000000000001' returning id)
select is((select count(*)::int from changed), 0, 'B cannot reopen A session');
reset role;
select ok(not has_function_privilege('anon', (select oid from pg_proc where proname='commit_review' and pronamespace='public'::regnamespace), 'EXECUTE'), 'anon has no execute privilege');
select ok((select not prosecdef from pg_proc where proname='commit_review' and pronamespace='public'::regnamespace), 'commit remains SECURITY INVOKER');
select * from finish();
rollback;
