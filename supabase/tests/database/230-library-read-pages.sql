begin;
select plan(18);
select is((select prosecdef from pg_proc where oid='public.count_library_deck_concepts(uuid,uuid[])'::regprocedure),false,'Counts use caller RLS');
select is((select prosecdef from pg_proc where oid='public.read_library_deck_detail(uuid,uuid,uuid,text,text,integer,integer,integer)'::regprocedure),false,'Deck read uses caller RLS');
select is((select prosecdef from pg_proc where oid='public.attach_library_tag(uuid,uuid,uuid,text,text)'::regprocedure),false,'Tag association uses caller RLS');
select ok(not has_function_privilege('anon','public.count_library_deck_concepts(uuid,uuid[])','execute'),'Anonymous cannot count private decks');
select ok(not has_function_privilege('anon','public.read_library_deck_detail(uuid,uuid,uuid,text,text,integer,integer,integer)','execute'),'Anonymous cannot read deck detail');
select ok(not has_function_privilege('anon','public.attach_library_tag(uuid,uuid,uuid,text,text)','execute'),'Anonymous cannot attach tags');
select ok(has_function_privilege('authenticated','public.count_library_deck_concepts(uuid,uuid[])','execute'),'Authenticated counts are available');
select ok(has_function_privilege('authenticated','public.read_library_deck_detail(uuid,uuid,uuid,text,text,integer,integer,integer)','execute'),'Authenticated deck pages are available');
select ok(has_function_privilege('authenticated','public.attach_library_tag(uuid,uuid,uuid,text,text)','execute'),'Authenticated tag association is available');
set local role authenticated;
set local request.jwt.claims='{}';
select throws_ok($$select public.count_library_deck_concepts('a11ce000-0000-4000-8000-000000000001','{}')$$,'28000','authentication required','A role without a JWT cannot count');
select throws_ok($$select public.attach_library_tag('a11ce000-0000-4000-8000-000000000001','c0a75e00-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-00000000000a','Synthetic','synthetic')$$,'42501','authentication required','A role without a JWT cannot attach');
set local role postgres;
insert into auth.users(id) values('a11ce000-0000-4000-8000-000000000001');
insert into public.profiles(id) values('a11ce000-0000-4000-8000-000000000001');
insert into public.languages(id,code,locale,name_key) values
  ('20000000-0000-4000-8000-000000000000','zz','zz','language.zz'),
  ('30000000-0000-4000-8000-000000000000','zz','zz-ZZ','language.zz_zz');
insert into public.courses(id,owner_id,title,source_language_id,target_language_id) values
  ('c0a75e00-0000-4000-8000-00000000000a','a11ce000-0000-4000-8000-000000000001','Synthetic course','20000000-0000-4000-8000-000000000000','30000000-0000-4000-8000-000000000000');
insert into public.decks(id,owner_id,course_id,title) values
  ('d0000000-0000-4000-8000-00000000000a','a11ce000-0000-4000-8000-000000000001','c0a75e00-0000-4000-8000-00000000000a','Synthetic deck');
insert into public.concepts(id,owner_id,course_id,kind,title,summary) values
  ('c1000000-0000-4000-8000-00000000000a','a11ce000-0000-4000-8000-000000000001','c0a75e00-0000-4000-8000-00000000000a','vocabulary','Synthetic concept','Synthetic meaning');
-- Inject a late failure only for this transaction's synthetic fixture owner.
create function pg_temp.reject_synthetic_tag_link() returns trigger language plpgsql as $$
begin
  if new.owner_id='a11ce000-0000-4000-8000-000000000001'::uuid then
    raise exception 'synthetic association failure';
  end if;
  return new;
end;
$$;
create trigger synthetic_tag_link_failure after insert on public.concept_tags
  for each row execute function pg_temp.reject_synthetic_tag_link();
set local role authenticated;
set local request.jwt.claims='{"sub":"a11ce000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(public.read_library_deck_detail('a11ce000-0000-4000-8000-000000000001','c0a75e00-0000-4000-8000-00000000000a','d0000000-0000-4000-8000-00000000000a')->'deck'->>'id','d0000000-0000-4000-8000-00000000000a','The owner can read its deck');
select is(public.count_library_deck_concepts('a11ce000-0000-4000-8000-000000000001',array['d0000000-0000-4000-8000-00000000000a'::uuid])->>'d0000000-0000-4000-8000-00000000000a','0','An empty owned deck counts zero');
select is(public.read_library_deck_detail('b0b0b000-0000-4000-8000-000000000002','c0a75e00-0000-4000-8000-00000000000a','d0000000-0000-4000-8000-00000000000a'),null::jsonb,'Forged owner context returns no deck');
select throws_ok($$select public.attach_library_tag('a11ce000-0000-4000-8000-000000000001','c0a75e00-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-00000000000a','Rollback tag','rollback tag')$$,'P0001','synthetic association failure','A failure after the link insert rolls back the transaction');
select is((select count(*)::integer from public.tags where normalized_name='rollback tag'),0,'The failed association leaves no orphan tag');
select is((select count(*)::integer from public.concept_tags),0,'The failed association leaves no link');
set local request.jwt.claims='{"sub":"b0b0b000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(public.read_library_deck_detail('b0b0b000-0000-4000-8000-000000000002','c0a75e00-0000-4000-8000-00000000000a','d0000000-0000-4000-8000-00000000000a'),null::jsonb,'Another JWT cannot read the owner deck');
select * from finish();
rollback;
