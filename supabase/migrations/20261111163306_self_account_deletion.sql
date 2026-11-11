-- The only privileged operation is deleting the JWT owner's Auth row. No owner
-- parameter, dynamic SQL, administrative key, or grant on Auth tables to clients.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create function private.delete_own_account(p_email text, p_confirmation text)
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
  delete from auth.users where id = v_uid;
  return true;
end;
$$;
revoke execute on function private.delete_own_account(text,text) from public, anon;
grant execute on function private.delete_own_account(text,text) to authenticated;

create function public.delete_own_account(p_email text, p_confirmation text)
returns boolean language sql security invoker set search_path = '' as $$
  select private.delete_own_account(p_email, p_confirmation);
$$;
revoke execute on function public.delete_own_account(text,text) from public, anon;
grant execute on function public.delete_own_account(text,text) to authenticated;
comment on function public.delete_own_account(text,text) is
  'Self-only Auth and app cascade deletion. Requires explicit confirmation, matching email and a live Auth session created within five minutes. MFA accounts require aal2.';
