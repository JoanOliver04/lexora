create table private.account_archive_restores (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  id uuid not null, manifest jsonb not null, state text not null default 'uploading' check(state in ('uploading','restored','cancelled')),
  next_part integer not null default 0, restored_rows integer not null default 0,
  created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default clock_timestamp()+interval '1 hour'
);
create table private.account_archive_parts (
  owner_id uuid not null references private.account_archive_restores(owner_id) on delete cascade,
  page_index integer not null check(page_index between 0 and 4095),
  part_index integer not null check(part_index between 0 and 31),
  body bytea not null check(octet_length(body) between 1 and 262144),
  primary key(owner_id,page_index,part_index)
);
alter table private.account_archive_restores enable row level security;
alter table private.account_archive_parts enable row level security;
revoke all on private.account_archive_restores,private.account_archive_parts from public,anon,authenticated;

create function private.archive_audio_authorized(p_owner uuid,p_course text,p_hash text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_owner=auth.uid() and exists(select 1 from private.account_archive_restores j
   where j.owner_id=p_owner and j.state='uploading' and j.expires_at>statement_timestamp()
   and (j.manifest->'audio') @> jsonb_build_array(jsonb_build_object('course',p_course,'hash',p_hash)));
$$;
revoke all on function private.archive_audio_authorized(uuid,text,text) from public,anon,authenticated;
grant execute on function private.archive_audio_authorized(uuid,text,text) to authenticated;
-- Serialize an archive upload with account deletion, even if its course does not yet exist.
create function private.archive_audio_insert_allowed(p_course text,p_hash text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  perform 1 from public.profiles where id=uid for key share;
  return found and private.archive_audio_authorized(uid,p_course,p_hash);
end; $$;
revoke all on function private.archive_audio_insert_allowed(text,text) from public,anon,authenticated;
grant execute on function private.archive_audio_insert_allowed(text,text) to authenticated;
create policy account_archive_audio_write on storage.objects for insert to authenticated with check (
  bucket_id='study-audio' and split_part(name,'/',1)=(select auth.uid())::text and
  name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}$' and
  private.archive_audio_insert_allowed(split_part(name,'/',2),split_part(name,'/',3)));

create function private.check_archive_session(p_owner uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is distinct from p_owner or not exists(select 1 from auth.sessions s
    where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=p_owner
    and s.created_at between clock_timestamp()-interval '10 minutes' and clock_timestamp()+interval '5 seconds'
    and (s.not_after is null or s.not_after>clock_timestamp())) or
    (exists(select 1 from auth.mfa_factors f where f.user_id=p_owner and f.status='verified') and
     auth.jwt()->>'aal' is distinct from 'aal2') then
    raise exception 'recent authentication required' using errcode='PT401';
  end if;
end; $$;
revoke all on function private.check_archive_session(uuid) from public,anon,authenticated;

create function private.check_archive_manifest(m jsonb,uid uuid)
returns void language plpgsql immutable set search_path='' as $$
declare p jsonb; rows_total bigint:=0; bytes_total bigint:=0; profiles int:=0; n integer; b integer;
begin
  if m->>'format' is distinct from 'lexora-account-archive/1' or m->>'owner' is distinct from uid::text
    or jsonb_typeof(m->'pages') is distinct from 'array' or jsonb_typeof(m->'audio') is distinct from 'array'
    or octet_length(m::text)>2097152 then raise exception 'invalid manifest' using errcode='22023'; end if;
  if jsonb_array_length(m->'pages') not between 1 and 4096 or jsonb_array_length(m->'audio')>1024 then
    raise exception 'archive too large' using errcode='PT413'; end if;
  for p in select value from jsonb_array_elements(m->'pages') loop
    n:=(p->>'rows')::int; b:=(p->>'bytes')::int;
    if coalesce(p->>'entity','') not in ('profiles','languages','courses','course_settings','decks','concepts','deck_concepts',
      'practice_items','tags','concept_tags','learning_states','review_logs','study_sessions','import_jobs','import_job_errors')
      or coalesce(n,0) not between 1 and 256 or coalesce(b,0) not between 1 and 8388608
      or coalesce(p->>'sha256','') !~ '^[0-9a-f]{64}$' then raise exception 'invalid page' using errcode='22023'; end if;
    if p->>'entity'='profiles' then profiles:=profiles+n; end if;
    rows_total:=rows_total+n; bytes_total:=bytes_total+b;
  end loop;
  if profiles<>1 then raise exception 'invalid profile count' using errcode='22023'; end if;
  if rows_total>200000 or bytes_total>67108864 then raise exception 'archive too large' using errcode='PT413'; end if;
  bytes_total:=0;
  for p in select value from jsonb_array_elements(m->'audio') loop
    b:=(p->>'bytes')::int;
    if coalesce(b,0) not between 1 and 4194304 or coalesce(p->>'hash','') !~ '^[0-9a-f]{64}$'
      or coalesce(p->>'course','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' or
      coalesce(p->>'type','') not in ('audio/wav','audio/mpeg','audio/mp4','audio/ogg','audio/webm') then
      raise exception 'invalid audio' using errcode='22023'; end if;
    bytes_total:=bytes_total+b;
  end loop;
  if bytes_total>134217728 then raise exception 'archive too large' using errcode='PT413'; end if;
  if exists(select 1 from jsonb_array_elements(m->'audio') a group by a->>'course',a->>'hash' having count(*)>1) then
    raise exception 'duplicate audio' using errcode='22023'; end if;
end; $$;
revoke all on function private.check_archive_manifest(jsonb,uuid) from public,anon,authenticated;

-- Reconstruct each page separately. The enclosing transaction still replaces
-- the complete account atomically and retains all foreign-key constraints.
create function private.apply_account_archive(uid uuid,m jsonb)
returns integer language plpgsql set search_path='' as $$
declare
  entity text; row_owner text; p record; data bytea; rows jsonb; count_written integer:=0;
  profile public.profiles; item jsonb; path text;
begin
  if auth.uid() is distinct from uid or uid is null then raise exception 'authentication required' using errcode='28000'; end if;
  for item in select value from jsonb_array_elements(m->'audio') loop
    path:=uid::text||'/'||(item->>'course')||'/'||(item->>'hash');
    perform 1 from storage.objects o where o.bucket_id='study-audio' and o.name=path
      and (o.metadata->>'size')::bigint=(item->>'bytes')::bigint for key share;
    if not found then raise exception 'audio unavailable' using errcode='PT422'; end if;
  end loop;
  delete from public.courses where owner_id=uid;
  foreach entity in array array['profiles','languages','courses','course_settings','decks','concepts','deck_concepts','practice_items',
    'tags','concept_tags','learning_states','study_sessions','review_logs','import_jobs','import_job_errors'] loop
    for p in select value spec,ordinality-1 idx from jsonb_array_elements(m->'pages') with ordinality where value->>'entity'=entity loop
      select string_agg(b.body,''::bytea order by part_index) into data from private.account_archive_parts b
        where owner_id=uid and page_index=p.idx;
      if octet_length(data) is distinct from (p.spec->>'bytes')::int or
        encode(sha256(data),'hex') is distinct from p.spec->>'sha256' then raise exception 'page checksum differs' using errcode='PT422'; end if;
      rows:=convert_from(data,'UTF8')::jsonb;
      if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows)<>(p.spec->>'rows')::int or
         exists(select 1 from jsonb_array_elements(rows) r where jsonb_typeof(r)<>'object') then
        raise exception 'invalid archive rows' using errcode='22023'; end if;
      row_owner:=case entity when 'profiles' then 'id' when 'course_settings' then 'user_id' else 'owner_id' end;
      if entity<>'languages' and exists(select 1 from jsonb_array_elements(rows) r where r->>row_owner is distinct from uid::text) then
        raise exception 'wrong account' using errcode='PT403'; end if;
      if entity='languages' then continue; end if;
      count_written:=count_written+jsonb_array_length(rows);
      if entity='profiles' then
        select * into strict profile from jsonb_populate_recordset(null::public.profiles,rows);
      elsif entity='concepts' then
        insert into public.concepts(id,course_id,owner_id,kind,title,summary,explanation,example,cefr_level,source_reference,metadata,archived_at,created_at,updated_at)
          select id,course_id,owner_id,kind,title,summary,explanation,example,cefr_level,source_reference,metadata,archived_at,created_at,updated_at
          from jsonb_populate_recordset(null::public.concepts,rows);
      elsif entity='import_jobs' then
        insert into public.import_jobs select * from jsonb_populate_recordset(null::public.import_jobs,(
          select jsonb_agg(r||jsonb_build_object('request_fingerprint',null,'processed_rows',coalesce(r->'processed_rows','0'),
            'last_source_row',coalesce(r->'last_source_row','0'),'status',case when r->>'status'='importing' then 'failed' else r->>'status' end,
            'rows_created',case when r->>'status'='importing' and r->'mapping_config'->>'deckMode'='replace' then 0 else (r->>'rows_created')::int end,
            'rows_skipped',(r->>'rows_skipped')::int+case when r->>'status'='importing' and r->'mapping_config'->>'deckMode'='replace'
              then (r->>'rows_created')::int else 0 end)) from jsonb_array_elements(rows) r));
        update public.import_jobs j set request_fingerprint=r.request_fingerprint
          from jsonb_populate_recordset(null::public.import_jobs,rows) r
          where j.owner_id=uid and j.id=r.id and r.request_fingerprint is not null;
      else
        execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1)',entity,entity) using rows;
      end if;
    end loop;
  end loop;
  if exists(select 1 from public.courses c cross join lateral jsonb_each(c.eoi_sources) src
    where c.owner_id=uid and src.value ? 'audio' and not ((m->'audio') @> jsonb_build_array(jsonb_build_object('course',c.id::text,'hash',src.value->>'hash')))) then
    raise exception 'missing referenced audio' using errcode='PT422'; end if;
  if exists(select a->>'course',a->>'hash' from jsonb_array_elements(m->'audio') a
    except select c.id::text,src.value->>'hash' from public.courses c cross join lateral jsonb_each(c.eoi_sources) src
      where c.owner_id=uid and src.value ? 'audio') then raise exception 'unreferenced audio' using errcode='PT422'; end if;
  update public.profiles set active_course_id=profile.active_course_id,created_at=profile.created_at,display_name=profile.display_name,
    onboarding_completed_at=profile.onboarding_completed_at,theme_preference=profile.theme_preference,timezone=profile.timezone,
    ui_locale=profile.ui_locale where id=uid;
  return count_written;
end; $$;
revoke all on function private.apply_account_archive(uuid,jsonb) from public,anon,authenticated;

create function private.restore_account_archive(req jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=auth.uid(); job private.account_archive_restores; id_in uuid:=(req->>'id')::uuid; action text:=req->>'action';
  pg_idx int; part_idx int; seq int; body bytea; spec jsonb; target_parts int; expected int; restored int;
begin
  if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
  if id_in is null or coalesce(action,'') not in ('begin','append','commit','cancel') then raise exception 'invalid request' using errcode='22023'; end if;
  perform 1 from public.profiles where id=uid for update;
  if not found then raise exception 'missing profile' using errcode='28000'; end if;
  select * into job from private.account_archive_restores where owner_id=uid for update;
  if action='begin' then
    if job.id=id_in and job.expires_at>clock_timestamp() then
      if (job.state='uploading' and job.manifest is distinct from req->'manifest') or
        (job.state<>'uploading' and job.manifest->>'fingerprint' is distinct from encode(sha256(convert_to((req->'manifest')::text,'UTF8')),'hex')) then
        raise exception 'archive changed' using errcode='PT409'; end if;
    else
      perform private.check_archive_session(uid);
      if job.created_at>clock_timestamp()-interval '2 seconds' then raise exception 'restore cooldown' using errcode='PT429'; end if;
      perform private.check_archive_manifest(req->'manifest',uid);
      -- Opportunistically release abandoned staged parts without a scheduler or a paid service.
      delete from private.account_archive_restores j using
        (select owner_id from private.account_archive_restores where owner_id<>uid and expires_at<clock_timestamp()
         order by expires_at limit 4 for update skip locked) stale where j.owner_id=stale.owner_id;
      delete from private.account_archive_restores where owner_id=uid;
      insert into private.account_archive_restores(owner_id,id,manifest) values(uid,id_in,req->'manifest') returning * into job;
    end if;
  elsif job.id is distinct from id_in or job.expires_at<=clock_timestamp() then raise exception 'restore expired' using errcode='PT409';
  elsif job.state='uploading' then
    if action='cancel' then
      delete from private.account_archive_parts where owner_id=uid;
      update private.account_archive_restores set state='cancelled',next_part=0,
        manifest=jsonb_build_object('fingerprint',encode(sha256(convert_to(manifest::text,'UTF8')),'hex')) where owner_id=uid returning * into job;
    elsif action='append' then
      pg_idx:=(req->>'page')::int; part_idx:=(req->>'part')::int; seq:=(req->>'sequence')::int;
      if coalesce(pg_idx,-1) not between 0 and jsonb_array_length(job.manifest->'pages')-1 or
        coalesce(part_idx,-1) not between 0 and 31 or coalesce(seq,-1) not between 0 and job.next_part or
        coalesce(length(req->>'body'),0) not between 4 and 349528 then raise exception 'invalid part' using errcode='22023'; end if;
      spec:=job.manifest->'pages'->pg_idx;
      expected:=least(262144,(spec->>'bytes')::int-part_idx*262144);
      body:=decode(req->>'body','base64');
      if expected<1 or octet_length(body)<>expected then raise exception 'invalid part size' using errcode='22023'; end if;
      if seq=job.next_part then
        insert into private.account_archive_parts values(uid,pg_idx,part_idx,body);
        update private.account_archive_restores set next_part=next_part+1 where owner_id=uid returning * into job;
      elsif not exists(select 1 from private.account_archive_parts b where b.owner_id=uid and
        b.page_index=pg_idx and b.part_index=part_idx and b.body=decode(req->>'body','base64')) then raise exception 'retry differs' using errcode='PT409';
      end if;
    elsif action='commit' then
      perform private.check_archive_session(uid);
      select sum(((p->>'bytes')::int+262143)/262144) into target_parts from jsonb_array_elements(job.manifest->'pages') p;
      if req->>'confirmation' is distinct from 'RESTORE' or job.next_part<>target_parts then raise exception 'incomplete backup' using errcode='22023'; end if;
      restored:=private.apply_account_archive(uid,job.manifest);
      delete from private.account_archive_parts where owner_id=uid;
      update private.account_archive_restores set state='restored',restored_rows=restored,
        manifest=jsonb_build_object('fingerprint',encode(sha256(convert_to(manifest::text,'UTF8')),'hex')) where owner_id=uid returning * into job;
    end if;
  end if;
  return jsonb_build_object('state',job.state,'next',job.next_part,'rows',job.restored_rows);
end; $$;
revoke all on function private.restore_account_archive(jsonb) from public,anon,authenticated;
grant execute on function private.restore_account_archive(jsonb) to authenticated;
create function public.restore_account_archive(p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$
  select private.restore_account_archive(p_request);
$$;
revoke all on function public.restore_account_archive(jsonb) from public,anon,authenticated;
grant execute on function public.restore_account_archive(jsonb) to authenticated;
