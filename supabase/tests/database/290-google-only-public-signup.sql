begin;
select plan(8);

select ok(not has_function_privilege('anon', 'private.google_only_public_signup(jsonb)', 'execute'),
  'anonymous callers cannot execute the hook');
select ok(not has_function_privilege('authenticated', 'private.google_only_public_signup(jsonb)', 'execute'),
  'signed-in users cannot execute the hook');
select ok(not has_function_privilege('service_role', 'private.google_only_public_signup(jsonb)', 'execute'),
  'the service role cannot execute the hook');
select ok(has_schema_privilege('supabase_auth_admin', 'private', 'usage')
  and has_function_privilege('supabase_auth_admin', 'private.google_only_public_signup(jsonb)', 'execute'),
  'Supabase Auth can resolve and invoke the hook');

select is(private.google_only_public_signup('{"user":{"app_metadata":{"provider":"google"}}}'),
  '{}'::jsonb, 'Auth can approve a Google signup');
select is(private.google_only_public_signup('{"user":{"app_metadata":{"provider":"email"}}}') #>> '{error,http_code}',
  '403', 'Auth rejects new email accounts');
select is(private.google_only_public_signup('{"user":{"app_metadata":{"provider":"email"},"user_metadata":{"provider":"google"}}}') #>> '{error,http_code}',
  '403', 'user metadata does not determine the provider');
select is(private.google_only_public_signup('{}') #>> '{error,http_code}',
  '403', 'Auth denies a signup with an unknown provider');
select * from finish();
rollback;
