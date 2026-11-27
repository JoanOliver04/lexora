begin;
select plan(25);

insert into auth.users(id) values('a11ce000-0000-4000-8000-000000000001');
insert into public.profiles(id) values('a11ce000-0000-4000-8000-000000000001');
insert into public.languages(id,code,locale,name_key) values
  ('20000000-0000-4000-8000-000000000000','zz','zz','language.zz'),
  ('30000000-0000-4000-8000-000000000000','zz','zz-ZZ','language.zz_zz');
insert into public.courses(id,owner_id,title,source_language_id,target_language_id) values
  ('c0a75e00-0000-4000-8000-00000000000a','a11ce000-0000-4000-8000-000000000001','Synthetic course','20000000-0000-4000-8000-000000000000','30000000-0000-4000-8000-000000000000');

set local role authenticated;
set local request.jwt.claims='{"sub":"a11ce000-0000-4000-8000-000000000001","role":"authenticated"}';
create temp table eoi_case as select 'c0a75e00-0000-4000-8000-00000000000a'::uuid course,
'{"format":"lexora-eoi/1","key":"reading-test","title":"Example","level":"B1","skill":"reading","sources":[{"key":"s1","title":"Notice","text":"Lunch begins at noon."}],"cards":[{"key":"q1","source":"s1","type":"short","prompt":"When is lunch?","answer":"Noon","evidence":"Lunch begins at noon."},{"key":"q2","source":"s1","type":"choice","prompt":"Which meal?","answer":"Lunch","options":["Lunch","Dinner"]}]}'::jsonb pack;
create temp table eoi_preview as select public.eoi_save_pack(course,pack,'{}',false) p from eoi_case;
select is((select (p->>'new')::int from eoi_preview),2,'preview reports two new cards');
select is((select count(*)::int from public.decks),0,'preview has no side effects');
select lives_ok($$select public.eoi_save_pack(course,pack,'{}',true,p->>'token') from eoi_case,eoi_preview$$,'import atomically');
select is((select count(*)::int from public.deck_concepts),2,'two memberships');
select is((select count(*)::int from public.practice_items),2,'one direction per reading question');
select is((select public.eoi_read_sources(course,array['s1'])->'s1'->>'text' from eoi_case),'Lunch begins at noon.','shared source');
create temp table item_snapshot as select array_agg(id order by id) ids from public.practice_items;
select lives_ok($$select public.eoi_save_pack(course,pack,'{}',true,public.eoi_save_pack(course,pack,'{}',false)->>'token') from eoi_case$$,'repeat import');
select is((select array_agg(id order by id) from public.practice_items),(select ids from item_snapshot),'repeat keeps item identity');
create temp table vocab_cases as select course,
'{"format":"lexora-eoi/1","key":"words-a","title":"Words A","level":"B1","skill":"vocabulary","sources":[],"cards":[{"key":"w","type":"word","prompt":"bridge","answer":"puente","tags":["theme::one"]}]}'::jsonb first_pack from eoi_case;
select lives_ok($$select public.eoi_save_pack(course,first_pack,'{}',true,public.eoi_save_pack(course,first_pack,'{}',false)->>'token') from vocab_cases$$,'vocabulary saves two directions');
create temp table second_vocab as select course,jsonb_set(first_pack||'{"key":"words-b","title":"Words B"}','{cards,0,answer}','"puente de mando"') pack from vocab_cases;
select is((select (public.eoi_save_pack(course,pack,'{}',false)->>'linked')::int from second_vocab),1,'second deck previews existing word');
select lives_ok($$select public.eoi_save_pack(course,pack,'{}',true,public.eoi_save_pack(course,pack,'{}',false)->>'token') from second_vocab$$,'link with another meaning');
select is((select count(*)::int from public.concepts where title='bridge'),1,'one active word');
select is((select count(*)::int from public.practice_items i join public.concepts c on c.id=i.concept_id where c.title='bridge'),2,'two shared practice items');
select is((select i.prompt_text from public.practice_items i join public.concepts c on c.id=i.concept_id where c.title='bridge' and i.mode='basic_recall'),'puente · puente de mando','merged reverse and both senses');
select is((select count(*)::int from public.deck_concepts m join public.concepts c on c.id=m.concept_id where c.title='bridge'),2,'both memberships');
select throws_ok($$select public.eoi_save_pack(course,pack,'{}',true,'stale') from second_vocab$$,'P0001','preview-changed','stale preview refused');
select is((select count(*)::int from public.review_logs),0,'imports never review a card');
create temp table collision as select course,jsonb_set(first_pack||'{"key":"words-c","title":"Words C"}','{cards,0,prompt}','"When is lunch?"') pack from vocab_cases;
select is((select (public.eoi_save_pack(course,pack,'{}',false)->>'linked')::int from collision),0,'unrelated reading question is never a linked word');
select lives_ok($$select public.eoi_save_pack(course,pack,'{}',true,public.eoi_save_pack(course,pack,'{}',false)->>'token') from collision$$,'new word can coexist with reading prompt');
update vocab_cases set first_pack=jsonb_set(first_pack,'{cards,0,answer}','"pasarela"');
select lives_ok($$select public.eoi_save_pack(course,first_pack,'{}',true,public.eoi_save_pack(course,first_pack,'{}',false)->>'token') from vocab_cases$$,'correct own sense');
select ok((select summary like '%pasarela%' and summary like '%puente de mando%' and not ('puente'=any(string_to_array(summary,' · '))) from public.concepts where title='bridge'),'correction replaces own previous meaning and retains other deck meaning');
update collision set pack=jsonb_set(jsonb_set(pack||'{"key":"words-phonetic","title":"Words D"}','{cards,0,prompt}','"bridge /brídj/"'),'{cards,0,answer}','"pasarela"');
select is((select (public.eoi_save_pack(course,pack,'{}',false)->>'linked')::int from collision),1,'alternate pronunciation spelling links to the same vocabulary concept');
select ok(not has_function_privilege('anon','public.eoi_save_pack(uuid,jsonb,jsonb,boolean,text)','EXECUTE'),'anonymous role cannot import');
set local request.jwt.claims='{"sub":"b11ce000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(public.eoi_read_sources('c0a75e00-0000-4000-8000-00000000000a',array['s1']),'{}'::jsonb,'other account cannot read sources');
select throws_ok($$select public.eoi_save_pack(course,pack,'{}',false) from eoi_case$$,'P0002','query returned no rows','other account cannot import');
select * from finish();
rollback;
