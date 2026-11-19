begin;
select plan(17);
select has_table('public','account_export_requests','Cooldown is persisted');
select is((select prosecdef from pg_proc where oid='public.export_account_data()'::regprocedure),false,'Export is INVOKER');
select is((select prosecdef from pg_proc where oid='public.guard_export_request()'::regprocedure),false,'Cooldown guard is INVOKER');
select ok(not has_function_privilege('anon','public.export_account_data()','execute'),'Anonymous cannot export');
select ok(has_function_privilege('authenticated','public.export_account_data()','execute'),'Authenticated export passes RLS');
select ok(not has_table_privilege('authenticated','public.account_export_requests','delete'),'A caller cannot remove cooldown');
select ok(not has_table_privilege('anon','public.account_export_requests','select'),'Anonymous cannot read quota');
select ok(not has_table_privilege('anon','public.account_export_requests','insert'),'Anonymous cannot insert quota');
select ok((select relrowsecurity from pg_class where oid='public.account_export_requests'::regclass),'Quota has RLS');
select ok(not has_function_privilege('anon','public.restore_account_backup(jsonb)','execute'),'Anonymous cannot restore');
select ok(not has_function_privilege('authenticated','private.apply_account_restore(jsonb,uuid)','execute'),'Caller cannot invoke the apply helper');
select ok(not has_table_privilege('authenticated','private.account_restore_uploads','select'),'Upload metadata is private');
select ok(not has_table_privilege('authenticated','private.account_restore_chunks','select'),'Backup payload is private');
select ok(not has_table_privilege('authenticated','private.account_restore_chunks','insert'),'Caller cannot forge staged chunks');
set local role authenticated;
select throws_ok($$select public.export_account_data()$$,'28000','authentication required','Role without JWT subject cannot export');
select throws_ok($$select public.restore_account_backup('{"action":"begin","id":"78443064-d55b-497d-abae-30c9e8f4e3d8"}')$$,
  '28000','authentication required','Restore also requires a JWT subject');
reset role;
insert into auth.users(id) values ('a11ce000-0000-4000-8000-000000000041');
insert into public.profiles(id) values ('a11ce000-0000-4000-8000-000000000041');
set local role authenticated;
set local request.jwt.claims to '{"sub":"a11ce000-0000-4000-8000-000000000041","role":"authenticated"}';
select throws_ok($$select public.restore_account_backup('{"action":"begin","id":"78443064-d55b-497d-abae-30c9e8f4e3d8"}')$$,
  'PT401','recent authentication required','Identity without a recent live session cannot begin a restore');
select * from finish();
rollback;
