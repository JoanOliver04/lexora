-- NULL preserves independently assigned tags and pre-existing associations.
alter table public.concept_tags add column eoi_managed boolean;
-- A manual tag explicitly keeps this association even if an imported pack drops it.
create function private.keep_manual_tag(p_concept uuid,p_tag uuid) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if not exists(select 1 from public.concepts c join public.tags t on t.course_id=c.course_id
   where c.id=p_concept and t.id=p_tag and t.owner_id=uid and c.owner_id=uid) then raise exception 'unknown-association'; end if;
 insert into public.concept_tags(owner_id,concept_id,tag_id,eoi_managed) values(uid,p_concept,p_tag,false)
 on conflict(concept_id,tag_id) do update set eoi_managed=false;
end; $$;
revoke all on function private.keep_manual_tag(uuid,uuid) from public,anon,authenticated;
grant execute on function private.keep_manual_tag(uuid,uuid) to authenticated;
create function public.keep_manual_tag(p_concept uuid,p_tag uuid) returns void
language sql security invoker set search_path='' as $$
 select private.keep_manual_tag(p_concept,p_tag)
$$;
revoke all on function public.keep_manual_tag(uuid,uuid) from public,anon;
grant execute on function public.keep_manual_tag(uuid,uuid) to authenticated;
create table private.eoi_media_leases (
 owner_id uuid not null references auth.users(id) on delete cascade,
 course_id uuid not null references public.courses(id) on delete cascade,
 hash text not null check(hash ~ '^[0-9a-f]{64}$'),
 deleting boolean not null, expires_at timestamptz not null,
 primary key(course_id,hash)
);
alter table private.eoi_media_leases enable row level security;
revoke all on private.eoi_media_leases from public,anon,authenticated;
create function private.eoi_media_busy(p_course uuid,p_hash text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.eoi_media_leases where owner_id=auth.uid() and course_id=p_course
 and hash=p_hash and deleting and expires_at>clock_timestamp())
$$;
revoke all on function private.eoi_media_busy(uuid,text) from public,anon,authenticated;
grant execute on function private.eoi_media_busy(uuid,text) to authenticated;
create function public.eoi_media_busy(p_course uuid,p_hash text) returns boolean
language sql stable security invoker set search_path='' as $$
 select private.eoi_media_busy(p_course,p_hash)
$$;
create function private.eoi_audio_lease(p_course uuid,p_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_hash !~ '^[0-9a-f]{64}$' then return false; end if;
 perform 1 from public.courses where id=p_course and owner_id=auth.uid() for update;
 if not found or public.eoi_media_busy(p_course,p_hash) then return false; end if;
 insert into private.eoi_media_leases values(auth.uid(),p_course,p_hash,false,now()+interval '1 day')
 on conflict(course_id,hash) do update set deleting=false,expires_at=excluded.expires_at;
 return true;
end; $$;
revoke all on function private.eoi_audio_lease(uuid,text) from public,anon,authenticated;
grant execute on function private.eoi_audio_lease(uuid,text) to authenticated;
create function public.eoi_audio_lease(p_course uuid,p_hash text) returns boolean
language sql security invoker set search_path='' as $$
 select private.eoi_audio_lease(p_course,p_hash)
$$;
create function private.eoi_collect_audio(p_course uuid) returns table(hash text)
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 perform 1 from public.courses where id=p_course and owner_id=uid for update;
 if not found then return; end if;
 delete from private.eoi_media_leases l where l.course_id=p_course and l.expires_at<now();
 return query
 with candidates as (
  select split_part(o.name,'/',3) as h from storage.objects o
  where o.bucket_id='study-audio' and o.name like uid::text||'/'||p_course::text||'/%'
  and o.created_at < now()-interval '1 day' and split_part(o.name,'/',3) ~ '^[0-9a-f]{64}$'
  and not private.archive_audio_authorized(uid,p_course::text,split_part(o.name,'/',3))
  and not exists (select 1 from private.eoi_media_leases l where l.course_id=p_course and l.hash=split_part(o.name,'/',3))
  and not exists(select 1 from public.courses c cross join lateral jsonb_each(c.eoi_sources) s
    where c.id=p_course and s.value->>'hash'=split_part(o.name,'/',3))
  order by o.created_at,o.name limit 100
 )
 insert into private.eoi_media_leases as l select uid,p_course,h,true,now()+interval '10 minutes' from candidates
 on conflict do nothing returning l.hash;
end; $$;
revoke all on function private.eoi_collect_audio(uuid) from public,anon,authenticated;
grant execute on function private.eoi_collect_audio(uuid) to authenticated;
create function public.eoi_collect_audio(p_course uuid) returns table(hash text)
language sql security invoker set search_path='' as $$
 select * from private.eoi_collect_audio(p_course)
$$;

create or replace function public.eoi_save_pack(p_course uuid,p_pack jsonb,p_media jsonb,p_apply boolean,p_preview text default null)
returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='25s' as $$
declare
 uid uuid:=auth.uid(); d public.decks%rowtype; src jsonb; sources jsonb; proposed jsonb; manifest jsonb;
 bindings jsonb; entry jsonb; slot text; cid uuid; m public.practice_mode; category public.deck_category;
 tag text; s jsonb; def text; combined text; primary_item uuid; reverse_item uuid; term text; nextpos int;
 new_count int:=0; linked_count int:=0; updated_count int:=0; variants jsonb:='[]'; plan jsonb:='[]'; digest text; media_hash text;
 other_senses text[]; base_sense text; match_count int; old_binding jsonb; v_config jsonb; pos int;
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
     if p_apply and public.eoi_media_busy(p_course,media_hash) then raise exception 'media-busy'; end if;
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
   term:=regexp_replace(lower(btrim(regexp_replace(entry->>'prompt','\s+',' ','g'))),'\s+/[^/]+/$','');
   if old_binding is not null then
     select c.summary into strict def from public.concepts c where c.id=cid and c.course_id=p_course and c.owner_id=uid and c.archived_at is null;
     if category='vocabulary' and not exists(select 1 from public.concepts c where c.id=cid and c.kind='vocabulary' and regexp_replace(c.canonical_key,'\s+/[^/]+/$','')=term) then raise exception 'linked-word-changed'; end if;
     updated_count:=updated_count+1;
   elsif category='vocabulary' then
     select (array_agg(c.id order by c.created_at,c.id))[1],(array_agg(c.summary order by c.created_at,c.id))[1],count(*)
       into cid,def,match_count from public.concepts c where c.course_id=p_course and c.owner_id=uid and c.archived_at is null
       and c.kind='vocabulary' and regexp_replace(c.canonical_key,'\s+/[^/]+/$','')=term
       and not exists(select 1 from public.practice_items i where i.concept_id=c.id and i.config ? 'exercise')
       and (not exists(select 1 from public.deck_concepts dc where dc.concept_id=c.id) or exists(select 1 from public.deck_concepts dc join public.decks vd on vd.id=dc.deck_id where dc.concept_id=c.id and (vd.category='vocabulary' or vd.category is null)));
     if match_count>1 then raise exception 'ambiguous-word: %',slot; end if;
     if cid is not null then linked_count:=linked_count+1; end if;
   end if;
   combined:=entry->>'answer';
   base_sense:=null;
   if category='vocabulary' and cid is not null then
     -- Keep the original answer of a classic concept and each live pack's own sense separately.
     select (array_agg(b.value->>'baseline' order by x.created_at,x.id))[1] into base_sense
       from public.decks x cross join lateral jsonb_each(x.eoi_bindings) b
       where x.course_id=p_course and x.owner_id=uid and b.value->>'concept'=cid::text and b.value ? 'baseline';
     if not exists(select 1 from public.decks x cross join lateral jsonb_each(x.eoi_bindings) b
       where x.course_id=p_course and x.owner_id=uid and b.value->>'concept'=cid::text) then base_sense:=def; end if;
     select array_agg(b.value->>'answer' order by x.created_at,x.id) into other_senses
       from public.decks x cross join lateral jsonb_each(x.eoi_bindings) b
       where x.course_id=p_course and x.owner_id=uid and x.id is distinct from d.id and b.value->>'concept'=cid::text
       and exists(select 1 from jsonb_array_elements(x.eoi_manifest->'cards') q where q->>'key'=b.key);
     select string_agg(sense,' · ' order by array_position(string_to_array(def,' · '),sense) nulls last, first_pos) into combined from (
       select sense,min(ord) first_pos from unnest(array[base_sense]||coalesce(other_senses,array[]::text[])||array[entry->>'answer']) with ordinality u(sense,ord)
       where sense is not null group by sense) senses;
     if def is distinct from combined then variants:=variants||jsonb_build_array(jsonb_build_object('front',entry->>'prompt','current',coalesce(def,''),'incoming',entry->>'answer')); end if;
     if char_length(combined)>500 then raise exception 'review-meanings: %',slot; end if;
   end if;
   if cid is null then new_count:=new_count+1; end if;
   plan:=plan||jsonb_build_array(jsonb_build_object('card',entry,'concept',cid,'existingAnswer',def,'baseline',base_sense,'answer',combined));
 end loop;
 manifest:=jsonb_set(p_pack,'{sources}',coalesce((select jsonb_agg(value->>'key' order by idx) from jsonb_array_elements(p_pack->'sources') with ordinality x(value,idx)),'[]'));
 digest:=md5(jsonb_build_array(d.id,d.eoi_manifest,bindings,plan,proposed,manifest)::text);
 if not p_apply then return jsonb_build_object('restored',(select count(*) from jsonb_array_elements(p_pack->'cards') cr
 where bindings ? (cr->>'key') and not exists(select 1 from jsonb_array_elements(d.eoi_manifest->'cards') old where old->>'key'=cr->>'key')),
 'new',new_count,'linked',linked_count,'updated',updated_count,'removed',(select count(*) from jsonb_array_elements(coalesce(d.eoi_manifest->'cards','[]')) old where not exists(select 1 from jsonb_array_elements(p_pack->'cards') incoming where incoming->>'key'=old->>'key')),'variants',variants,'token',digest); end if;
 if digest is distinct from p_preview then raise exception 'preview-changed'; end if;
 if d.id is null then
   select coalesce(max(position),-1)+1 into nextpos from public.decks where owner_id=uid and course_id=p_course;
   insert into public.decks(owner_id,course_id,title,category,cefr_level,position,eoi_manifest)
   values(uid,p_course,p_pack->>'title',category,'B1',nextpos,manifest) returning * into d;
 end if;
 select coalesce(jsonb_object_agg(k,v),'{}'::jsonb) into proposed
 from jsonb_each(proposed) resource(k,v)
 where manifest->'sources' ? k or exists (
   select 1 from public.decks other where other.course_id=p_course and other.id<>d.id and other.eoi_manifest->'sources' ? k
 ) or exists (
   select 1 from public.practice_items i join public.concepts c on c.id=i.concept_id
   join public.deck_concepts dc on dc.concept_id=c.id
   where c.course_id=p_course and dc.deck_id<>d.id and i.config->'exercise'->>'source'=k
 );
 update public.courses set eoi_sources=proposed where id=p_course and owner_id=uid and proposed is distinct from sources;
 -- Removing a managed exercise detaches it from this deck. Its history and other memberships survive.
 for slot,old_binding in select * from jsonb_each(bindings) loop
   if not exists(select 1 from jsonb_array_elements(p_pack->'cards') cr where cr->>'key'=slot) then
     delete from public.deck_concepts where deck_id=d.id and owner_id=uid and concept_id=(old_binding->>'concept')::uuid;
     -- Retain stable bindings while removing a retired word's contribution to other decks.
     if category='vocabulary' and exists(select 1 from jsonb_array_elements(d.eoi_manifest->'cards') old where old->>'key'=slot) then
       cid:=(old_binding->>'concept')::uuid;
       select string_agg(sense,' · ' order by seq,sense) into combined from (
         select sense,min(seq) seq from (
           select old_binding->>'baseline' sense,0 seq
           union all
           select b.value->>'answer',1 from public.decks x cross join lateral jsonb_each(x.eoi_bindings) b
           where x.owner_id=uid and x.course_id=p_course and x.id<>d.id and b.value->>'concept'=cid::text
           and exists(select 1 from jsonb_array_elements(x.eoi_manifest->'cards') q where q->>'key'=b.key)
         ) live where sense is not null group by sense
       ) senses;
       if combined is not null then
         update public.concepts set summary=combined where id=cid and owner_id=uid;
         update public.practice_items set answer_text=combined where id=(old_binding->>'item')::uuid and owner_id=uid;
         update public.practice_items set prompt_text=combined where concept_id=cid and owner_id=uid and mode='basic_recall' and enabled and archived_at is null;
       end if;
     end if;
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
   else update public.practice_items set mode=m,prompt_text=term,answer_text=combined,config=case when category='vocabulary' then practice_items.config else v_config end where id=primary_item and concept_id=cid and owner_id=uid and archived_at is null and enabled;
     if not found then raise exception 'item-changed'; end if;
   end if;
   if category='vocabulary' then
     select id into reverse_item from public.practice_items where concept_id=cid and owner_id=uid and mode='basic_recall' and enabled and archived_at is null order by created_at,id limit 1;
     if reverse_item is null then insert into public.practice_items(concept_id,owner_id,mode,prompt_text,answer_text,config) values(cid,uid,'basic_recall',combined,term,'{"mode":"basic_recall"}');
     else update public.practice_items set prompt_text=combined,answer_text=term where id=reverse_item and owner_id=uid; end if;
   end if;
   bindings:=jsonb_set(bindings,array[slot],jsonb_build_object('concept',cid,'item',primary_item,'baseline',s->'baseline','answer',entry->>'answer'));
   for tag in select distinct lower(btrim(value)) from jsonb_array_elements_text(coalesce(entry->'tags','[]')||jsonb_build_array('level::b1',category::text)) loop
     insert into public.tags(owner_id,course_id,normalized_name,display_name) values(uid,p_course,tag,tag) on conflict(course_id,normalized_name) do nothing;
     insert into public.concept_tags(owner_id,concept_id,tag_id,eoi_managed) select uid,cid,id,true from public.tags where course_id=p_course and owner_id=uid and normalized_name=tag on conflict do nothing;
   end loop;
 end loop;
 update public.decks set title=p_pack->>'title',eoi_manifest=manifest,eoi_bindings=bindings where id=d.id and owner_id=uid;
 -- Reconcile only tags added by the importer, across all surviving card contributions.
 delete from public.concept_tags ct using public.tags t
 where t.id=ct.tag_id and ct.owner_id=uid and ct.eoi_managed is true
 and ct.concept_id in (select (b.value->>'concept')::uuid from jsonb_each(bindings) b)
 and not exists (
  select 1 from public.decks x cross join lateral jsonb_array_elements(x.eoi_manifest->'cards') q
  where x.course_id=p_course and x.eoi_bindings->(q->>'key')->>'concept'=ct.concept_id::text
  and (t.normalized_name in ('level::b1',x.category::text) or exists
   (select 1 from jsonb_array_elements_text(q->'tags') e(tag_name) where lower(btrim(e.tag_name))=t.normalized_name))
 );
 return jsonb_build_object('deck',d.id);
end;
$$;

-- The version captured when the editor opened closes the gap before preview.
create function public.eoi_save_versioned(p_course uuid,p_pack jsonb,p_media jsonb,p_apply boolean,
 p_preview text default null,p_version timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare current_version timestamptz; output jsonb;
begin
 perform 1 from public.courses where id=p_course and owner_id=auth.uid() for update;
 if not found then raise exception 'course-changed'; end if;
 select updated_at into current_version from public.decks where course_id=p_course and owner_id=auth.uid()
 and eoi_manifest->>'key'=p_pack->>'key';
 if p_version is not null and current_version is distinct from p_version then raise exception 'editor-conflict'; end if;
 output:=public.eoi_save_pack(p_course,p_pack,p_media,p_apply,p_preview);
 if p_apply then select updated_at into strict current_version from public.decks where id=(output->>'deck')::uuid;
   output:=output||jsonb_build_object('version',current_version); end if;
 return output;
end; $$;
revoke all on function public.eoi_save_versioned(uuid,jsonb,jsonb,boolean,text,timestamptz),
 public.eoi_audio_lease(uuid,text),public.eoi_media_busy(uuid,text),public.eoi_collect_audio(uuid) from public,anon;
grant execute on function public.eoi_save_versioned(uuid,jsonb,jsonb,boolean,text,timestamptz),
 public.eoi_audio_lease(uuid,text),public.eoi_media_busy(uuid,text),public.eoi_collect_audio(uuid) to authenticated;
create or replace function public.attach_library_tag(
  p_owner_id uuid, p_course_id uuid, p_concept_id uuid,
  p_display_name text, p_normalized_name text
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_tag_id uuid;
begin
  if v_uid is null or p_owner_id is distinct from v_uid then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_display_name,''))) not between 1 and 200 or
     char_length(btrim(coalesce(p_normalized_name,''))) not between 1 and 200 or
     p_normalized_name ~ '(^|::)(::|$)' then
    raise exception 'invalid tag' using errcode = '22023';
  end if;
  perform 1 from public.concepts where id=p_concept_id and owner_id=v_uid and course_id=p_course_id;
  if not found then raise exception 'concept unavailable' using errcode = '23503'; end if;
  insert into public.tags(course_id,owner_id,display_name,normalized_name)
    values(p_course_id,v_uid,p_display_name,p_normalized_name)
    on conflict(course_id,normalized_name) do nothing;
  select id into v_tag_id from public.tags where course_id=p_course_id and owner_id=v_uid and normalized_name=p_normalized_name;
  if v_tag_id is null then raise exception 'tag unavailable' using errcode = '23503'; end if;
  perform public.keep_manual_tag(p_concept_id,v_tag_id);
  return v_tag_id;
end;
$$;

-- A restore begun while Storage is physically deleting a hash can safely retry.
create function private.check_archive_audio_claims() returns trigger language plpgsql
security definer set search_path='' as $$
begin
 perform 1 from public.courses c where c.owner_id=new.owner_id and exists(
 select 1 from jsonb_array_elements(new.manifest->'audio') a where a->>'course'=c.id::text
 ) order by c.id for update;
 if exists(select 1 from private.eoi_media_leases l join lateral jsonb_array_elements(new.manifest->'audio') a
 on a->>'course'=l.course_id::text and a->>'hash'=l.hash
 where l.owner_id=new.owner_id and l.deleting and l.expires_at>now()) then raise exception 'media busy' using errcode='PT409'; end if;
 return new;
end; $$;
revoke all on function private.check_archive_audio_claims() from public,anon,authenticated;
create trigger check_archive_audio_claims before insert on private.account_archive_restores
 for each row execute function private.check_archive_audio_claims();

-- Return only labels for the picker. Fetch the selected content with eoi_read_sources.
create function public.eoi_find_sources(p_course uuid,p_filter text default '') returns table(key text,title text)
language sql stable security invoker set search_path='' as $$
 select s.key,s.value->>'title' from public.courses c cross join lateral jsonb_each(c.eoi_sources) s
 where c.id=p_course and c.owner_id=auth.uid() and position(lower(left(coalesce(p_filter,''),160))
 in lower(s.key||' '||coalesce(s.value->>'title','')))>0
 order by lower(s.value->>'title'),s.key limit 40
$$;
create function private.eoi_finish_audio_gc(p_course uuid,p_hashes text[]) returns void
language sql security definer set search_path='' as $$
 delete from private.eoi_media_leases l where l.owner_id=auth.uid() and l.course_id=p_course and l.deleting
 and l.hash=any(p_hashes) and not exists(select 1 from storage.objects o where o.bucket_id='study-audio'
 and o.name=l.owner_id::text||'/'||l.course_id::text||'/'||l.hash)
$$;
revoke all on function private.eoi_finish_audio_gc(uuid,text[]) from public,anon,authenticated;
grant execute on function private.eoi_finish_audio_gc(uuid,text[]) to authenticated;
create function public.eoi_finish_audio_gc(p_course uuid,p_hashes text[]) returns void
language sql security invoker set search_path='' as $$
 select private.eoi_finish_audio_gc(p_course,p_hashes)
$$;
revoke all on function public.eoi_find_sources(uuid,text),public.eoi_finish_audio_gc(uuid,text[]) from public,anon;
grant execute on function public.eoi_find_sources(uuid,text),public.eoi_finish_audio_gc(uuid,text[]) to authenticated;
