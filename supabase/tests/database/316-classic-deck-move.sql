begin;
select plan(4);
select ok(not has_function_privilege('anon','public.move_library_deck(uuid,uuid,uuid,text)','execute'),
  'Anonymous callers cannot move decks');
insert into auth.users(id) values('a11ce000-0000-4000-8000-000000000001');
insert into public.profiles(id) values('a11ce000-0000-4000-8000-000000000001');
insert into public.courses(id,owner_id,title,source_language_id,target_language_id)
select 'c0a75e00-0000-4000-8000-00000000000a','a11ce000-0000-4000-8000-000000000001',
  'Order fixture',s.id,t.id from public.languages s, public.languages t where s.locale='es' and t.locale='en';
insert into public.decks(id,owner_id,course_id,title,position) values
  ('d0000000-0000-4000-8000-000000000001','a11ce000-0000-4000-8000-000000000001','c0a75e00-0000-4000-8000-00000000000a','A',0),
  ('d0000000-0000-4000-8000-000000000002','a11ce000-0000-4000-8000-000000000001','c0a75e00-0000-4000-8000-00000000000a','B',1);
create function pg_temp.fail_deck_move() returns trigger language plpgsql as $$
begin raise exception 'Synthetic failure after reordering'; end;
$$;
create trigger fail_deck_move after update of position on public.decks
  for each statement execute function pg_temp.fail_deck_move();
set local role authenticated;
set local request.jwt.claims='{"sub":"a11ce000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$select public.move_library_deck('a11ce000-0000-4000-8000-000000000001',
  'c0a75e00-0000-4000-8000-00000000000a','d0000000-0000-4000-8000-000000000002','up')$$,
  'P0001','Synthetic failure after reordering','A failed update aborts the move');
select is((select position from public.decks where title='A'),0,'First position rolls back');
select is((select position from public.decks where title='B'),1,'Second position rolls back');
select * from finish();
rollback;
