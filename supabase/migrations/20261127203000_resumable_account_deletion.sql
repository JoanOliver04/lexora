-- A confirmed account with pending Storage work has no application profile.
-- Its remaining Auth identity lets its owner resume through the Storage API.
create table private.pending_account_deletions (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  confirmed_at timestamptz not null default clock_timestamp()
);
create table private.account_deletion_google_challenges (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  nonce uuid not null,
  original_session uuid not null,
  started_at timestamptz not null,
  verified_session uuid
);
revoke all on private.pending_account_deletions, private.account_deletion_google_challenges
  from public, anon, authenticated, service_role;

create function private.begin_own_deletion_google() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  sid uuid := (auth.jwt()->>'session_id')::uuid;
  challenge uuid := gen_random_uuid();
begin
  if not exists(select 1 from auth.identities where user_id=uid and provider='google')
    or not exists(select 1 from auth.sessions where user_id=uid and id=sid
      and (not_after is null or not_after>now())) then
    raise exception 'Google identity required' using errcode='PT401';
  end if;
  insert into private.account_deletion_google_challenges values(uid, challenge, sid, clock_timestamp(), null)
  on conflict(owner_id) do update set nonce=excluded.nonce, original_session=excluded.original_session,
    started_at=excluded.started_at, verified_session=null;
  return challenge;
end;
$$;

create function private.confirm_own_deletion_google(p_nonce uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  sid uuid := (auth.jwt()->>'session_id')::uuid;
begin
  update private.account_deletion_google_challenges ch set verified_session=sid
  where ch.owner_id=uid and ch.nonce=p_nonce and ch.original_session<>sid
    and ch.verified_session is null and ch.started_at>=clock_timestamp()-interval '5 minutes'
    and exists(select 1 from auth.identities i where i.user_id=uid and i.provider='google')
    and (auth.jwt()->'amr') @> '[{"method":"oauth"}]'::jsonb
    and exists(select 1 from auth.sessions s where s.user_id=uid and s.id=sid and s.created_at>=ch.started_at
      and (s.not_after is null or s.not_after>clock_timestamp()));
  return found;
end;
$$;

create function private.own_deletion_google_verified() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.account_deletion_google_challenges
    where owner_id=auth.uid() and verified_session=(auth.jwt()->>'session_id')::uuid
      and started_at>=now()-interval '5 minutes');
$$;

create function private.own_account_deletion_pending() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.pending_account_deletions where owner_id=auth.uid());
$$;

create function private.guard_deleting_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Let RLS reject a foreign insert without inspecting or locking its owner.
  if auth.uid() is not null and auth.uid() <> new.id then return new; end if;
  -- Serialize first-time profile creation against confirmation and finalization.
  perform 1 from auth.users where id=new.id for key share;
  if exists(select 1 from private.pending_account_deletions where owner_id=new.id) then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_deleting_profile() from public, anon, authenticated, service_role;
create trigger guard_deleting_profile before insert on public.profiles
for each row execute function private.guard_deleting_profile();

-- Hold the course lock until the Storage insert finishes. Deletion then sees
-- every committed upload after the course cascade, including in-flight uploads.
create function private.owns_audio_course(p_name text) returns boolean
language sql volatile security invoker set search_path = '' as $$
  select exists(select 1 from public.courses where owner_id=auth.uid()
    and id::text=split_part(p_name,'/',2) for key share);
$$;
revoke all on function private.owns_audio_course(text) from public, anon;
grant execute on function private.owns_audio_course(text) to authenticated;
alter policy eoi_audio_write on storage.objects with check (
  bucket_id='study-audio' and split_part(name,'/',1)=(select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}$' and private.owns_audio_course(name)
);

create function private.pending_own_account_audio() returns text[]
language sql stable security definer set search_path = '' as $$
  select array(select name from storage.objects where private.own_account_deletion_pending()
    and bucket_id='study-audio' and name like auth.uid()::text || '/%' order by name limit 100);
$$;

create function private.finish_own_account_deletion() returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication required' using errcode='PT401'; end if;
  perform 1 from auth.users where id=uid for update;
  if not found then return true; end if;
  if not private.own_account_deletion_pending() then
    raise exception 'confirmation required' using errcode='22023';
  end if;
  if exists(select 1 from storage.objects where bucket_id='study-audio' and name like uid::text || '/%') then
    return false;
  end if;
  delete from auth.users where id=uid;
  return true;
end;
$$;
create or replace function private.delete_own_account(p_email text, p_confirmation text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_jwt jsonb := (select auth.jwt());
  v_email text;
  v_session uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_uid is null then raise exception 'authentication required' using errcode = 'PT401'; end if;
  if p_confirmation is distinct from 'DELETE' or p_email is null or length(p_email) > 254 then
    raise exception 'confirmation required' using errcode = '22023';
  end if;
  select email into v_email from auth.users where id = v_uid for update;
  -- Safe retry of an already committed deletion using the old, still signed JWT.
  if not found then return true; end if;
  if lower(btrim(p_email)) is distinct from lower(v_email) then
    raise exception 'confirmation required' using errcode = '22023';
  end if;
  begin
    v_session := (v_jwt->>'session_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'recent authentication required' using errcode = 'PT401';
  end;
  -- A token refresh changes iat, not session.created_at. Old refreshed sessions
  -- must not qualify as recent reauthentication. A revoked session cannot delete.
  if not exists (select 1 from auth.sessions s where s.id = v_session and s.user_id = v_uid
    and s.created_at >= v_now - interval '5 minutes' and s.created_at <= v_now + interval '5 seconds'
    and (s.not_after is null or s.not_after > v_now)) then
    raise exception 'recent authentication required' using errcode = 'PT401';
  end if;
  if exists (select 1 from auth.mfa_factors f where f.user_id = v_uid and f.status = 'verified')
    and v_jwt->>'aal' is distinct from 'aal2' then
    raise exception 'second factor required' using errcode = 'PT403';
  end if;
  if (((v_jwt->'amr') @> '[{"method":"oauth"}]'::jsonb) or
      exists(select 1 from auth.users u where u.id=v_uid and nullif(u.encrypted_password,'') is null
        and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')))
    and not private.own_deletion_google_verified() then
    raise exception 'recent authentication required' using errcode = 'PT401';
  end if;
  insert into private.pending_account_deletions(owner_id) values(v_uid) on conflict do nothing;
  delete from public.profiles where id=v_uid;
  return private.finish_own_account_deletion();
end;
$$;

create function public.begin_own_deletion_google() returns uuid
language sql security invoker set search_path = '' as $$ select private.begin_own_deletion_google(); $$;
revoke all on function private.begin_own_deletion_google() from public, anon, service_role;
grant execute on function private.begin_own_deletion_google() to authenticated;
revoke all on function public.begin_own_deletion_google() from public, anon, service_role;
grant execute on function public.begin_own_deletion_google() to authenticated;

create function public.confirm_own_deletion_google(p_nonce uuid) returns boolean
language sql security invoker set search_path = '' as $$ select private.confirm_own_deletion_google(p_nonce); $$;
revoke all on function private.confirm_own_deletion_google(uuid) from public, anon, service_role;
grant execute on function private.confirm_own_deletion_google(uuid) to authenticated;
revoke all on function public.confirm_own_deletion_google(uuid) from public, anon, service_role;
grant execute on function public.confirm_own_deletion_google(uuid) to authenticated;

create function public.own_deletion_google_verified() returns boolean
language sql security invoker set search_path = '' as $$ select private.own_deletion_google_verified(); $$;
revoke all on function private.own_deletion_google_verified() from public, anon, service_role;
grant execute on function private.own_deletion_google_verified() to authenticated;
revoke all on function public.own_deletion_google_verified() from public, anon, service_role;
grant execute on function public.own_deletion_google_verified() to authenticated;

create function public.own_account_deletion_pending() returns boolean
language sql security invoker set search_path = '' as $$ select private.own_account_deletion_pending(); $$;
revoke all on function private.own_account_deletion_pending() from public, anon, service_role;
grant execute on function private.own_account_deletion_pending() to authenticated;
revoke all on function public.own_account_deletion_pending() from public, anon, service_role;
grant execute on function public.own_account_deletion_pending() to authenticated;

create function public.pending_own_account_audio() returns text[]
language sql security invoker set search_path = '' as $$ select private.pending_own_account_audio(); $$;
revoke all on function private.pending_own_account_audio() from public, anon, service_role;
grant execute on function private.pending_own_account_audio() to authenticated;
revoke all on function public.pending_own_account_audio() from public, anon, service_role;
grant execute on function public.pending_own_account_audio() to authenticated;

create function public.finish_own_account_deletion() returns boolean
language sql security invoker set search_path = '' as $$ select private.finish_own_account_deletion(); $$;
revoke all on function private.finish_own_account_deletion() from public, anon, service_role;
grant execute on function private.finish_own_account_deletion() to authenticated;
revoke all on function public.finish_own_account_deletion() from public, anon, service_role;
grant execute on function public.finish_own_account_deletion() to authenticated;

comment on function public.delete_own_account(text,text) is 'Explicit recent owner confirmation. True means Auth and media cleanup are complete. False means app data deletion committed and physical media cleanup is pending.';
