-- Course-owned sources and stable card bindings travel with existing JSON/CSV backups.
alter table public.courses add column eoi_sources jsonb check (eoi_sources is null or
  (jsonb_typeof(eoi_sources)='object' and octet_length(eoi_sources::text)<=4194304));
alter table public.decks add column eoi_manifest jsonb, add column eoi_bindings jsonb;
create unique index decks_eoi_course_key on public.decks(course_id,(eoi_manifest->>'key')) where eoi_manifest is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('study-audio','study-audio',false,4194304,array['audio/mpeg','audio/ogg','audio/mp4','audio/wav','audio/webm'])
on conflict(id) do nothing;
create policy eoi_audio_read on storage.objects for select to authenticated using (
 bucket_id='study-audio' and split_part(name,'/',1)=(select auth.uid())::text);
create policy eoi_audio_remove on storage.objects for delete to authenticated using (
 bucket_id='study-audio' and split_part(name,'/',1)=(select auth.uid())::text);
create policy eoi_audio_write on storage.objects for insert to authenticated with check (
 bucket_id='study-audio' and split_part(name,'/',1)=(select auth.uid())::text and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}$'
 and exists(select 1 from public.courses c where c.owner_id=(select auth.uid()) and c.id::text=split_part(name,'/',2)));

create function public.eoi_read_sources(p_course uuid,p_keys text[]) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_object_agg(k, c.eoi_sources->k) filter(where c.eoi_sources ? k),'{}'::jsonb)
 from public.courses c cross join unnest(p_keys) k where c.id=p_course and c.owner_id=(select auth.uid());
$$;
create function public.eoi_save_pack(p_course uuid,p_pack jsonb,p_media jsonb,p_apply boolean,p_preview text default null)
returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='25s' as $$
declare
 uid uuid:=auth.uid(); d public.decks%rowtype; src jsonb; sources jsonb; proposed jsonb; manifest jsonb;
 bindings jsonb; entry jsonb; slot text; cid uuid; m public.practice_mode; category public.deck_category;
 tag text; s jsonb; def text; combined text; primary_item uuid; reverse_item uuid; term text; nextpos int;
 new_count int:=0; linked_count int:=0; updated_count int:=0; variants jsonb:='[]'; plan jsonb:='[]'; digest text; media_hash text;
 old_binding jsonb; v_config jsonb; pos int;
begin
 if uid is null or p_pack->>'format' is distinct from 'lexora-eoi/1' or p_pack->>'level' is distinct from 'B1'
 or coalesce(p_pack->>'key','') !~ '^[a-z0-9][a-z0-9_-]{0,63}$' or jsonb_typeof(p_pack->'cards') is distinct from 'array'
 or jsonb_array_length(p_pack->'cards') not between 1 and 500 or jsonb_typeof(p_pack->'sources') is distinct from 'array'
 or jsonb_array_length(p_pack->'sources')>80 or octet_length(p_pack::text)>1700000 then raise exception 'invalid-pack'; end if;
 category:=(p_pack->>'skill')::public.deck_category;
 if category::text not in ('vocabulary','grammar','reading','writing','speaking','listening','mediation','pronunciation') then raise exception 'invalid-skill'; end if;
 select coalesce(c.eoi_sources,'{}') into strict sources from public.courses c where c.id=p_course and c.owner_id=uid for update;
 select * into d from public.decks where owner_id=uid and course_id=p_course and eoi_manifest->>'key'=p_pack->>'key';
 if d.archived_at is not null or (d.id is not null and d.category<>category) then raise exception 'deck-conflict'; end if;
 if exists(select 1 from public.decks where course_id=p_course and owner_id=uid and lower(title)=lower(p_pack->>'title') and id is distinct from d.id) then raise exception 'title-in-use'; end if;
 bindings:=coalesce(d.eoi_bindings,'{}'); proposed:=sources;
 for src in select value from jsonb_array_elements(p_pack->'sources') loop
   slot:=src->>'key';
   if coalesce(slot,'') !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then raise exception 'invalid-source'; end if;
   if src ? 'audio' then
     media_hash:=p_media->>(src->>'audio');
     if media_hash is null and sources->slot->>'audio'=src->>'audio' then media_hash:=sources->slot->>'hash'; end if;
     if coalesce(media_hash,'') !~ '^[a-f0-9]{64}$' then raise exception 'missing-audio: %',src->>'audio'; end if;
     if p_apply and not exists(select 1 from storage.objects o where o.bucket_id='study-audio' and o.name=uid::text||'/'||p_course::text||'/'||media_hash) then raise exception 'missing-audio: %',src->>'audio'; end if;
     src:=src||jsonb_build_object('hash',media_hash);
   end if;
   if sources ? slot and sources->slot<>src and exists(select 1 from public.decks x where x.course_id=p_course and x.owner_id=uid and x.id is distinct from d.id and x.eoi_manifest->'sources' ? slot) then raise exception 'shared-source-changed: %',slot; end if;
   proposed:=jsonb_set(proposed,array[slot],src);
 end loop;
 if (select count(distinct value->>'key') from jsonb_array_elements(p_pack->'cards'))<>jsonb_array_length(p_pack->'cards') or
 (select count(distinct value->>'key') from jsonb_array_elements(p_pack->'sources'))<>jsonb_array_length(p_pack->'sources') then raise exception 'duplicate-key'; end if;
 for entry in select value from jsonb_array_elements(p_pack->'cards') loop
   slot:=entry->>'key'; old_binding:=bindings->slot; cid:=(old_binding->>'concept')::uuid; def:=null;
   if coalesce(slot,'') !~ '^[a-z0-9][a-z0-9_-]{0,63}$' or char_length(btrim(coalesce(entry->>'prompt',''))) not between 1 and 200 or char_length(btrim(coalesce(entry->>'answer',''))) not between 1 and 500 then raise exception 'invalid-card'; end if;
   if entry ? 'source' and not exists(select 1 from jsonb_array_elements(p_pack->'sources') sr where sr->>'key'=entry->>'source') then raise exception 'missing-source'; end if;
   if (entry->>'type'='word') is distinct from (category='vocabulary') then raise exception 'invalid-direction'; end if;
   if old_binding is not null then
     select c.summary into strict def from public.concepts c where c.id=cid and c.course_id=p_course and c.owner_id=uid and c.archived_at is null;
     if category='vocabulary' and not exists(select 1 from public.concepts c where c.id=cid and c.canonical_key=lower(btrim(regexp_replace(entry->>'prompt','\s+',' ','g')))) then raise exception 'linked-word-changed'; end if;
     updated_count:=updated_count+1;
   elsif category='vocabulary' then
     term:=lower(btrim(regexp_replace(entry->>'prompt','\s+',' ','g')));
     select c.id,c.summary into cid,def from public.concepts c where c.course_id=p_course and c.owner_id=uid and c.archived_at is null and c.canonical_key=term order by c.created_at,c.id limit 1;
     if cid is not null then linked_count:=linked_count+1; end if;
   end if;
   combined:=entry->>'answer';
   if category='vocabulary' and def is not null and def<>combined then
     if coalesce(old_binding->>'answer','')=combined or combined=any(string_to_array(def,' · ')) then combined:=def;
     else variants:=variants||jsonb_build_array(jsonb_build_object('front',entry->>'prompt','current',def,'incoming',combined)); combined:=def||' · '||combined; end if;
     if char_length(combined)>500 then raise exception 'review-meanings: %',slot; end if;
   end if;
   if cid is null then new_count:=new_count+1; end if;
   plan:=plan||jsonb_build_array(jsonb_build_object('card',entry,'concept',cid,'existingAnswer',def,'answer',combined));
 end loop;
 manifest:=jsonb_set(p_pack,'{sources}',coalesce((select jsonb_agg(value->>'key' order by idx) from jsonb_array_elements(p_pack->'sources') with ordinality x(value,idx)),'[]'));
 digest:=md5(jsonb_build_array(d.id,d.eoi_manifest,bindings,plan,proposed,manifest)::text);
 if not p_apply then return jsonb_build_object('new',new_count,'linked',linked_count,'updated',updated_count,'removed',(select count(*) from jsonb_array_elements(coalesce(d.eoi_manifest->'cards','[]')) old where not exists(select 1 from jsonb_array_elements(p_pack->'cards') incoming where incoming->>'key'=old->>'key')),'variants',variants,'token',digest); end if;
 if digest is distinct from p_preview then raise exception 'preview-changed'; end if;
 if d.id is null then
   select coalesce(max(position),-1)+1 into nextpos from public.decks where owner_id=uid and course_id=p_course;
   insert into public.decks(owner_id,course_id,title,category,cefr_level,position,eoi_manifest)
   values(uid,p_course,p_pack->>'title',category,'B1',nextpos,manifest) returning * into d;
 end if;
 update public.courses set eoi_sources=proposed where id=p_course and owner_id=uid and proposed is distinct from sources;
 -- Removing a managed exercise detaches it from this deck. Its history and other memberships survive.
 for slot,old_binding in select * from jsonb_each(bindings) loop
   if not exists(select 1 from jsonb_array_elements(p_pack->'cards') cr where cr->>'key'=slot) then
     delete from public.deck_concepts where deck_id=d.id and owner_id=uid and concept_id=(old_binding->>'concept')::uuid;
     -- Keep the stable identity if the author restores this question later.
   end if;
 end loop;
 pos:=-1;
 for s in select value from jsonb_array_elements(plan) loop
   pos:=pos+1; entry:=s->'card'; slot:=entry->>'key'; cid:=(s->>'concept')::uuid; combined:=s->>'answer';
   if cid is null then
     insert into public.concepts(course_id,owner_id,kind,title,summary,cefr_level)
     values(p_course,uid,(case category when 'vocabulary' then 'vocabulary' when 'grammar' then 'grammar' when 'pronunciation' then 'pronunciation' else 'communicative_function' end)::public.concept_kind,entry->>'prompt',combined,'B1') returning id into cid;
   else
     update public.concepts set summary=combined,title=case when category='vocabulary' then title else entry->>'prompt' end where id=cid and owner_id=uid and (summary<>combined or (category<>'vocabulary' and title<>entry->>'prompt'));
   end if;
   select c.title into term from public.concepts c where c.id=cid;
   insert into public.deck_concepts(owner_id,deck_id,concept_id,position) values(uid,d.id,cid,pos) on conflict(deck_id,concept_id) do update set position=excluded.position where deck_concepts.position is distinct from excluded.position;
   m:=(case when category='pronunciation' then 'pronunciation' when category='listening' then 'listening_dictation' when entry->>'type'='oral' then 'guided_production' when entry->>'type'='written' then 'free_production' else 'basic_recognition' end)::public.practice_mode;
   v_config:=jsonb_build_object('mode',m);
   if category<>'vocabulary' then v_config:=v_config||jsonb_build_object('exercise',entry-'prompt'-'answer','pack',p_pack->>'key'); end if;
   primary_item:=(bindings->slot->>'item')::uuid;
   if primary_item is null and category='vocabulary' then select id into primary_item from public.practice_items where concept_id=cid and owner_id=uid and mode='basic_recognition' and enabled and archived_at is null order by created_at,id limit 1; end if;
   if primary_item is null then insert into public.practice_items(concept_id,owner_id,mode,prompt_text,answer_text,config) values(cid,uid,m,term,combined,v_config) returning id into primary_item;
   else update public.practice_items set mode=m,prompt_text=term,answer_text=combined,config=v_config where id=primary_item and concept_id=cid and owner_id=uid and archived_at is null and enabled;
     if not found then raise exception 'item-changed'; end if;
   end if;
   if category='vocabulary' then
     select id into reverse_item from public.practice_items where concept_id=cid and owner_id=uid and mode='basic_recall' and enabled and archived_at is null order by created_at,id limit 1;
     if reverse_item is null then insert into public.practice_items(concept_id,owner_id,mode,prompt_text,answer_text,config) values(cid,uid,'basic_recall',combined,term,'{"mode":"basic_recall"}');
     else update public.practice_items set prompt_text=combined,answer_text=term where id=reverse_item and owner_id=uid; end if;
   end if;
   bindings:=jsonb_set(bindings,array[slot],jsonb_build_object('concept',cid,'item',primary_item,'answer',entry->>'answer'));
   for tag in select distinct lower(btrim(value)) from jsonb_array_elements_text(coalesce(entry->'tags','[]')||jsonb_build_array('level::b1',category::text)) loop
     insert into public.tags(owner_id,course_id,normalized_name,display_name) values(uid,p_course,tag,tag) on conflict(course_id,normalized_name) do nothing;
     insert into public.concept_tags(owner_id,concept_id,tag_id) select uid,cid,id from public.tags where course_id=p_course and owner_id=uid and normalized_name=tag on conflict do nothing;
   end loop;
 end loop;
 update public.decks set title=p_pack->>'title',eoi_manifest=manifest,eoi_bindings=bindings where id=d.id and owner_id=uid;
 return jsonb_build_object('deck',d.id);
end;
$$;
revoke all on function public.eoi_read_sources(uuid,text[]),public.eoi_save_pack(uuid,jsonb,jsonb,boolean,text) from public,anon;
grant execute on function public.eoi_read_sources(uuid,text[]),public.eoi_save_pack(uuid,jsonb,jsonb,boolean,text) to authenticated;
