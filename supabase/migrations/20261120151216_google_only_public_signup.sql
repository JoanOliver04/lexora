-- Supabase calls this hook only for new users. App metadata is assigned by
-- Auth, unlike user metadata supplied by the signup request.
create function private.google_only_public_signup(event jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when event #>> '{user,app_metadata,provider}' = 'google' then '{}'::jsonb
    else jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Create your Lexora account with Google.'
      )
    )
  end;
$$;

grant usage on schema private to supabase_auth_admin;
revoke all on function private.google_only_public_signup(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.google_only_public_signup(jsonb) to supabase_auth_admin;
