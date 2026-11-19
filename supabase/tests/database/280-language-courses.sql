begin;
select plan(16);

insert into auth.users (id) values
  ('ddef0000-0000-4000-8000-000000000001'), ('ddef0000-0000-4000-8000-000000000002');
insert into public.profiles (id) values
  ('ddef0000-0000-4000-8000-000000000001'), ('ddef0000-0000-4000-8000-000000000002');

select ok(not has_function_privilege('anon', 'public.create_language_course(text,text,timestamptz)', 'execute'),
  'course creation requires an authenticated account');

set local role authenticated;
set local request.jwt.claims to '{"sub":"ddef0000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*) from public.languages where locale in ('de', 'en-GB', 'fr', 'it') and active),
  4::bigint, 'all four supported language choices are active');

select set_config('lexora_test.english', public.complete_onboarding('es', 'A1', 'A1', 17)::text, true);
insert into public.decks (id, owner_id, course_id, title) values
  ('ddefd000-0000-4000-8000-000000000001', auth.uid(), current_setting('lexora_test.english')::uuid, 'English deck');
insert into public.concepts (id, owner_id, course_id, kind, title, summary) values
  ('ddefc000-0000-4000-8000-000000000001', auth.uid(), current_setting('lexora_test.english')::uuid, 'vocabulary', 'English concept', 'fixture');
insert into public.practice_items (id, owner_id, concept_id, mode, prompt_text, answer_text, config) values
  ('ddefe000-0000-4000-8000-000000000001', auth.uid(), 'ddefc000-0000-4000-8000-000000000001', 'basic_recall', 'Question', 'Answer', '{"mode":"basic_recall"}');

select lives_ok($$select set_config('lexora_test.french', public.create_language_course('  Français  ', 'fr',
  (select updated_at from public.profiles where id = auth.uid()))::text, true)$$,
  'creates and activates another course in one call');
select is((select active_course_id from public.profiles where id = auth.uid()),
  current_setting('lexora_test.french')::uuid, 'profile points to the new course');
select is((select title || ':' || target_locale from public.courses where id = current_setting('lexora_test.french')::uuid),
  'Français:fr', 'course stores the requested name and catalogue locale');
select is((select daily_new_limit from public.course_settings where course_id = current_setting('lexora_test.french')::uuid),
  5, 'new course receives independent default settings');
select is((select daily_new_limit from public.course_settings where course_id = current_setting('lexora_test.english')::uuid),
  17, 'original English settings keep their values');
select is((select count(*) from public.decks where course_id = current_setting('lexora_test.french')::uuid),
  0::bigint, 'a new course comes without decks or content');
select throws_ok($$select public.create_language_course('Stale draft', 'it', '2000-01-01T00:00:00Z')$$,
  'PT409', null, 'stale form versions do not create another course');
select throws_ok($$select public.create_language_course('Invalid language', 'zzz',
  (select updated_at from public.profiles where id = auth.uid()))$$,
  '22023', null, 'invalid catalogue keys cannot create a course');

insert into public.concepts (id, owner_id, course_id, kind, title, summary) values
  ('ddefc000-0000-4000-8000-000000000002', auth.uid(), current_setting('lexora_test.french')::uuid, 'vocabulary', 'French concept', 'fixture');
insert into public.study_sessions (id, owner_id, course_id) values
  ('ddef5000-0000-4000-8000-000000000002', auth.uid(), current_setting('lexora_test.french')::uuid);
select throws_ok($$insert into public.deck_concepts (owner_id, deck_id, concept_id)
  values (auth.uid(), 'ddefd000-0000-4000-8000-000000000001', 'ddefc000-0000-4000-8000-000000000002')$$,
  '23514', null, 'a deck cannot contain a concept from another course of the owner');
select throws_ok($$insert into public.review_logs (owner_id, practice_item_id, study_session_id, idempotency_key,
  rating, reviewed_at, duration_ms, state_before, state_after, due_before, due_after, scheduler_version, config_version)
  values (auth.uid(), 'ddefe000-0000-4000-8000-000000000001', 'ddef5000-0000-4000-8000-000000000002',
    'cross-course', 'good', now(), 2500, '{}', '{}', now(), now(), '1', '1')$$,
  '23514', null, 'a review cannot count in a session from another course of the owner');

insert into public.review_logs (owner_id, practice_item_id, idempotency_key,
  rating, reviewed_at, duration_ms, state_before, state_after, due_before, due_after, scheduler_version, config_version)
select auth.uid(), 'ddefe000-0000-4000-8000-000000000001'::uuid, logs.key,
  'good', now(), logs.ms, '{}', '{}', now(), now(), '1', '1'
from (values ('one', 35000), ('two', 35000), ('zero', 0), ('unknown', null)) as logs(key, ms);

select is((public.study_statistics(current_setting('lexora_test.english')::uuid, 7, now(), 'UTC')
  #>> '{activity,0,duration_ms}')::bigint, 70000::bigint, 'short reviews sum in milliseconds');
select is((public.study_statistics(current_setting('lexora_test.english')::uuid, 7, now(), 'UTC')
  #>> '{activity,0,measured}')::integer, 3, 'zero counts as measured and null does not');
select is(jsonb_array_length(public.study_statistics(current_setting('lexora_test.french')::uuid, 7, now(), 'UTC')
  -> 'activity'), 0, 'the other course does not gain any recorded time');

set local request.jwt.claims to '{"sub":"ddef0000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.set_active_course(current_setting('lexora_test.french')::uuid,
  (select updated_at from public.profiles where id = auth.uid()))$$,
  'P0002', null, 'another account cannot select the new course');

select * from finish();
rollback;
