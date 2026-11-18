-- C1 persists through onboarding and library writes under the caller's RLS.
begin;
select plan(16);

select enum_has_labels('public', 'cefr_level', array['A1','A2','B1','B2','C1','C2'],
  'supported levels retain order and include C2');
select throws_ok($$select 'C3'::public.cefr_level$$, '22P02', null,
  'unsupported C3 is rejected by the database');

insert into auth.users (id) values
  ('a5e16001-0000-4000-8000-000000000001'),
  ('a5e16002-0000-4000-8000-000000000002');
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a5e16001-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.profiles (id) values ('a5e16001-0000-4000-8000-000000000001');

select lives_ok($$select public.complete_onboarding('en','C1','C1',5)$$,
  'the authenticated owner can start at C1');
select is((select declared_level::text from public.courses where owner_id=auth.uid()),
  'C1', 'declared C1 is stored without coercion');
select is((select start_level::text from public.courses where owner_id=auth.uid()),
  'C1', 'initial C1 is stored without coercion');
select lives_ok($$
  insert into public.decks (course_id,owner_id,title,cefr_level)
    select id,auth.uid(),'Synthetic C1 deck','C1' from public.courses where owner_id=auth.uid();
  insert into public.concepts (course_id,owner_id,kind,title,summary,cefr_level)
    select id,auth.uid(),'vocabulary','Synthetic advanced term','Synthetic summary','C1'
      from public.courses where owner_id=auth.uid();
$$, 'C1 deck and concept writes pass the existing constraints and policies');
select is((select count(*)::int from public.decks where cefr_level='C1'),1,
  'the owner can read the C1 deck');
select is((select count(*)::int from public.concepts where cefr_level='C1'),1,
  'the owner can read the C1 concept');

set local request.jwt.claims to
  '{"sub":"a5e16002-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.courses where declared_level='C1'),0,
  'another account cannot read the C1 course');
select is((select count(*)::int from public.decks where cefr_level='C1'),0,
  'another account cannot read the C1 deck');
select is((select count(*)::int from public.concepts where cefr_level='C1'),0,
  'another account cannot read the C1 concept');
insert into public.profiles (id) values ('a5e16002-0000-4000-8000-000000000002');
select lives_ok($$select public.complete_onboarding('en','C2','C2',5)$$,
  'the authenticated owner can start at C2');
select is((select declared_level::text from public.courses where owner_id=auth.uid()),
  'C2', 'declared C2 is stored without coercion');
select is((select start_level::text from public.courses where owner_id=auth.uid()),
  'C2', 'initial C2 is stored without coercion');
select lives_ok($$
  insert into public.decks (course_id,owner_id,title,cefr_level)
    select id,auth.uid(),'Synthetic C2 deck','C2' from public.courses where owner_id=auth.uid();
  insert into public.concepts (course_id,owner_id,kind,title,summary,cefr_level)
    select id,auth.uid(),'vocabulary','Synthetic proficiency term','Synthetic summary','C2'
      from public.courses where owner_id=auth.uid();
$$, 'C2 deck and concept writes pass the existing constraints and policies');
select is((select count(*)::int from public.decks where cefr_level='C2') +
  (select count(*)::int from public.concepts where cefr_level='C2'),2,
  'the owner can read both C2 entries');
select * from finish();
rollback;
