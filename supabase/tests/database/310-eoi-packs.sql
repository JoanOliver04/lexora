begin;
select plan(37);

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
-- A draft opened before another edit must not overwrite that edit during preview.
select throws_ok($$select public.eoi_save_versioned(course,pack,'{}',false,null,'2001-01-01') from eoi_case$$,'P0001','editor-conflict','stale editor rejected before preview');
select ok((select public.eoi_save_versioned(course,pack,'{}',false,null,d.updated_at) ? 'token'
 from eoi_case e join public.decks d on d.eoi_manifest->>'key'=e.pack->>'key'),'fresh revision opens normally');
update eoi_case set pack=jsonb_set(pack,'{cards,0,tags}','["retired-tag","manual-tag"]');
select public.eoi_save_pack(course,pack,'{}',true,public.eoi_save_pack(course,pack,'{}',false)->>'token') from eoi_case;
select public.attach_library_tag(c.owner_id,c.course_id,c.id,'manual-tag','manual-tag') from public.concepts c where title='When is lunch?';
update eoi_case set pack=pack #- '{cards,0,tags}';
select public.eoi_save_pack(course,pack,'{}',true,public.eoi_save_pack(course,pack,'{}',false)->>'token') from eoi_case;
select ok(not exists(select 1 from public.concept_tags ct join public.tags t on ct.tag_id=t.id where t.normalized_name='retired-tag'),'retired import tag removed');
select ok(exists(select 1 from public.concept_tags ct join public.tags t on ct.tag_id=t.id where t.normalized_name='manual-tag'),'explicit manual tag survives');
create temp table saved_card as select pack->'cards'->1 q from eoi_case;
update eoi_case set pack=pack #- '{cards,1}';
select public.eoi_save_pack(course,pack,'{}',true,public.eoi_save_pack(course,pack,'{}',false)->>'token') from eoi_case;
select is((select (public.eoi_save_pack(course,jsonb_set(pack,'{cards}',(pack->'cards')||q),'{}',false)->>'restored')::int from eoi_case,saved_card),1,'restoring a retired ID requires explicit UI confirmation');
select is((select (public.eoi_save_pack(course,jsonb_set(pack,'{cards}',(pack->'cards')||(q||'{"key":"q-fresh"}')),'{}',false)->>'new')::int from eoi_case,saved_card),1,'a fresh key creates an unstudied question');
update eoi_case set pack=jsonb_set(pack,'{sources}',(pack->'sources')||'{"key":"unused-source","title":"Extra"}');
select public.eoi_save_pack(course,pack,'{}',true,public.eoi_save_pack(course,pack,'{}',false)->>'token') from eoi_case;
update eoi_case set pack=pack #- '{sources,1}';
select public.eoi_save_pack(course,pack,'{}',true,public.eoi_save_pack(course,pack,'{}',false)->>'token') from eoi_case;
select ok((select not(eoi_sources ? 'unused-source') and eoi_sources ? 's1' from public.courses limit 1),'unused source pruned and live source retained');
select is((select count(*)::int from eoi_case e cross join lateral public.eoi_find_sources(e.course,'notice')),1,'existing sources offered by title');
reset role;
insert into storage.objects(bucket_id,name,created_at)
 select 'study-audio','a11ce000-0000-4000-8000-000000000001/c0a75e00-0000-4000-8000-00000000000a/'||repeat(h,64),now()-interval '2 days'
 from (values('a'),('b'),('c')) hashes(h);
update public.courses set eoi_sources=jsonb_set(eoi_sources,'{s1,hash}',to_jsonb(repeat('a',64))) where id='c0a75e00-0000-4000-8000-00000000000a';
set local role authenticated;
select ok((select public.eoi_audio_lease(course,repeat('b',64)) from eoi_case),'new upload protected until saved');
select is((select string_agg(h.hash,',') from eoi_case e cross join lateral public.eoi_collect_audio(e.course) h),repeat('c',64),'only old unreferenced, unleased bytes eligible for cleanup');
select ok((select not public.eoi_audio_lease(course,repeat('c',64)) from eoi_case),'new upload waits for physical deletion already in progress');
select public.eoi_finish_audio_gc(course,array[repeat('c',64)]) from eoi_case;
select ok((select public.eoi_media_busy(course,repeat('c',64)) from eoi_case),'failed physical deletion retains its claim');
select ok(not has_function_privilege('anon','public.eoi_save_pack(uuid,jsonb,jsonb,boolean,text)','EXECUTE'),'anonymous role cannot import');
set local request.jwt.claims='{"sub":"b11ce000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(public.eoi_read_sources('c0a75e00-0000-4000-8000-00000000000a',array['s1']),'{}'::jsonb,'other account cannot read sources');
select throws_ok($$select public.eoi_save_pack(course,pack,'{}',false) from eoi_case$$,'P0002','query returned no rows','other account cannot import');
select * from finish();
rollback;
