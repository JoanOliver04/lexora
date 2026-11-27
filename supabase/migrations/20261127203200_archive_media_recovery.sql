-- The course can be absent when a restore uploads its first byte. Keep the
-- receipt with the owner until Storage confirms the object is gone or live.
create table private.account_archive_media (
 owner_id uuid not null references public.profiles(id) on delete cascade,
 course_id uuid not null, hash text not null check(hash ~ '^[0-9a-f]{64}$'),
 restore_id uuid not null, ready_at timestamptz not null,
 claim uuid, claim_until timestamptz,
 primary key(owner_id,course_id,hash)
);
alter table private.account_archive_media enable row level security;
revoke all on private.account_archive_media from public,anon,authenticated;

create function private.archive_course_uses(uid uuid,cid uuid,h text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.courses c cross join lateral jsonb_each(c.eoi_sources) s
  where c.owner_id=uid and c.id=cid and s.value->>'hash'=h);
$$;
revoke all on function private.archive_course_uses(uuid,uuid,text) from public,anon,authenticated;

-- New (or legacy) course restores and editor saves may not bind a pathname
-- while a Storage delete for that archive-owned object is outstanding.
create function private.archive_check_course_media() returns trigger
language plpgsql security definer set search_path='' as $$
declare media record;
begin
 for media in select a.claim from private.account_archive_media a where a.owner_id=new.owner_id and a.course_id=new.id
   and exists(select 1 from jsonb_each(new.eoi_sources) s where s.value->>'hash'=a.hash) order by a.hash for update of a loop
   if media.claim is not null then raise exception 'audio cleanup pending' using errcode='PT409'; end if;
 end loop;
 return new;
end; $$;
revoke all on function private.archive_check_course_media() from public,anon,authenticated;
create trigger archive_check_course_media before insert or update of eoi_sources on public.courses
 for each row when (new.eoi_sources is not null) execute function private.archive_check_course_media();

create function private.archive_check_restore_media() returns trigger
language plpgsql security definer set search_path='' as $$
declare media record;
begin
 for media in select a.claim from private.account_archive_media a where a.owner_id=new.owner_id
   and (new.manifest->'audio') @> jsonb_build_array(jsonb_build_object('course',a.course_id::text,'hash',a.hash))
   order by a.course_id,a.hash for update of a loop
   if media.claim is not null then raise exception 'audio cleanup pending' using errcode='PT409'; end if;
 end loop;
 return new;
end; $$;
revoke all on function private.archive_check_restore_media() from public,anon,authenticated;
create trigger verify_archive_restore_media before insert on private.account_archive_restores
 for each row execute function private.archive_check_restore_media();

create or replace function public.eoi_media_busy(p_course uuid,p_hash text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.eoi_media_leases where owner_id=auth.uid() and course_id=p_course
 and hash=p_hash and deleting and expires_at>clock_timestamp()) or exists(
 select 1 from private.account_archive_media where owner_id=auth.uid() and course_id=p_course and hash=p_hash and claim is not null);
$$;

create function private.archive_storage_allowed(p_name text,p_write boolean) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=auth.uid(); cid uuid; h text:=split_part(p_name,'/',3); media private.account_archive_media;
begin
 if split_part(p_name,'/',1) is distinct from uid::text or split_part(p_name,'/',2) !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return true; end if;
 cid:=split_part(p_name,'/',2)::uuid;
 select * into media from private.account_archive_media where owner_id=uid and course_id=cid and hash=h for update;
 if not found then return true; end if;
 if p_write then return media.claim is null and (private.archive_audio_authorized(uid,cid::text,h) or
   exists(select 1 from private.eoi_media_leases where owner_id=uid and course_id=cid and hash=h and not deleting and expires_at>clock_timestamp())); end if;
 return not private.archive_audio_authorized(uid,cid::text,h) and not private.archive_course_uses(uid,cid,h);
end; $$;
revoke all on function private.archive_storage_allowed(text,boolean) from public,anon,authenticated;
grant execute on function private.archive_storage_allowed(text,boolean) to authenticated;
create policy archive_media_insert_guard on storage.objects as restrictive for insert to authenticated
 with check (bucket_id<>'study-audio' or private.archive_storage_allowed(name,true));
create policy archive_media_delete_guard on storage.objects as restrictive for delete to authenticated
 using (bucket_id<>'study-audio' or private.archive_storage_allowed(name,false));

create function private.manage_account_archive_media(req jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); action text:=req->>'action'; rid uuid:=(req->>'id')::uuid;
 cid uuid:=(req->>'course')::uuid; h text:=req->>'hash'; item private.account_archive_media;
 claimed text[]:='{}'; path text; inspected int:=0; blocked boolean; wake_at timestamptz;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 if rid is null or coalesce(action,'') not in ('reserve','settle','claim','finish') then raise exception 'invalid media request' using errcode='22023'; end if;
 perform 1 from public.profiles where id=uid for update;
 if not found then raise exception 'profile unavailable' using errcode='28000'; end if;
 if action in ('reserve','settle') then
   if cid is null or coalesce(h,'') !~ '^[0-9a-f]{64}$' then raise exception 'invalid audio' using errcode='22023'; end if;
   if action='settle' then
     update private.account_archive_media set ready_at=clock_timestamp()
       where owner_id=uid and course_id=cid and hash=h and restore_id=rid and claim is null;
     return 'true';
   end if;
   if not exists(select 1 from private.account_archive_restores where owner_id=uid and id=rid and state='uploading' and expires_at>clock_timestamp()
     and (manifest->'audio') @> jsonb_build_array(jsonb_build_object('course',cid::text,'hash',h))) then
     raise exception 'inactive audio transfer' using errcode='PT409'; end if;
   perform 1 from public.courses where id=cid and owner_id=uid for update;
   if public.eoi_media_busy(cid,h) then raise exception 'audio cleanup pending' using errcode='PT409'; end if;
   -- Existing untracked objects belong to the live library or another editor.
   -- Only an upload that can introduce a new object acquires a cleanup receipt.
   path:=uid::text||'/'||cid::text||'/'||h;
   update private.account_archive_media set restore_id=rid,ready_at=clock_timestamp()+interval '2 minutes'
     where owner_id=uid and course_id=cid and hash=h;
   if not found and not exists(select 1 from storage.objects where bucket_id='study-audio' and name=path) then
     insert into private.account_archive_media values(uid,cid,h,rid,clock_timestamp()+interval '2 minutes',null,null);
   end if;
   return 'true';
 elsif action='claim' then
   for item in select a.* from private.account_archive_media a where a.owner_id=uid and a.ready_at<=clock_timestamp()
     and (a.claim is null or a.claim_until<clock_timestamp() or a.claim=rid)
     and not private.archive_audio_authorized(uid,a.course_id::text,a.hash)
     and not exists(select 1 from private.eoi_media_leases e where e.owner_id=uid and e.course_id=a.course_id
       and e.hash=a.hash and e.expires_at>clock_timestamp())
     order by a.course_id,a.hash limit 16 loop
     inspected:=inspected+1;
     perform 1 from public.courses where id=item.course_id and owner_id=uid for update;
     perform 1 from private.account_archive_media where owner_id=uid and course_id=item.course_id and hash=item.hash for update;
     if private.archive_course_uses(uid,item.course_id,item.hash) then
       delete from private.account_archive_media where owner_id=uid and course_id=item.course_id and hash=item.hash;
       continue;
     end if;
     if exists(select 1 from private.eoi_media_leases e where e.owner_id=uid and e.course_id=item.course_id and e.hash=item.hash and e.expires_at>clock_timestamp())
       then continue; end if;
     path:=uid::text||'/'||item.course_id::text||'/'||item.hash;
     if not exists(select 1 from storage.objects where bucket_id='study-audio' and name=path) then
       delete from private.account_archive_media where owner_id=uid and course_id=item.course_id and hash=item.hash;
     else
       update private.account_archive_media set claim=rid,claim_until=clock_timestamp()+interval '2 minutes'
         where owner_id=uid and course_id=item.course_id and hash=item.hash;
       claimed:=array_append(claimed,path);
     end if;
   end loop;
   select min(greatest(a.ready_at,a.claim_until,j.expires_at,e.expires_at)) into wake_at
     from private.account_archive_media a left join private.account_archive_restores j
       on j.owner_id=a.owner_id and j.state='uploading' and (j.manifest->'audio') @> jsonb_build_array(jsonb_build_object('course',a.course_id::text,'hash',a.hash))
     left join private.eoi_media_leases e on e.owner_id=a.owner_id and e.course_id=a.course_id and e.hash=a.hash
     where a.owner_id=uid;
   return jsonb_build_object('paths',to_jsonb(claimed),'more',inspected=16,'retryAfter',
     case when wake_at is not null then greatest(1,least(3600,ceil(extract(epoch from (wake_at-clock_timestamp())))::int)) end);
 else
   delete from private.account_archive_media a where a.owner_id=uid and a.claim=rid and not exists(
     select 1 from storage.objects o where o.bucket_id='study-audio' and o.name=uid::text||'/'||a.course_id::text||'/'||a.hash);
   select exists(select 1 from private.account_archive_media where owner_id=uid and claim=rid) into blocked;
   if blocked then
     update private.account_archive_media set claim_until=clock_timestamp()+interval '5 seconds' where owner_id=uid and claim=rid;
   end if;
   return to_jsonb(not blocked);
 end if;
end; $$;
revoke all on function private.manage_account_archive_media(jsonb) from public,anon,authenticated;
grant execute on function private.manage_account_archive_media(jsonb) to authenticated;
create function public.manage_account_archive_media(p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select private.manage_account_archive_media(p_request);
$$;
revoke all on function public.manage_account_archive_media(jsonb) from public,anon,authenticated;
grant execute on function public.manage_account_archive_media(jsonb) to authenticated;
