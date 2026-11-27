begin;
select plan(12);
insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000002151','del-google@example.com'),
  ('00000000-0000-4000-8000-000000002152','del-other@example.com');
insert into auth.identities(provider_id,user_id,identity_data,provider)
values('test-google-sub','00000000-0000-4000-8000-000000002151','{"sub":"test-google-sub","email":"del-google@example.com"}','google');
insert into auth.sessions(id,user_id,created_at) values('00000000-0000-4000-8000-000000002153','00000000-0000-4000-8000-000000002151',now());
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000002151","session_id":"00000000-0000-4000-8000-000000002153","aal":"aal1","amr":[{"method":"oauth"}]}';
select throws_ok($$select public.delete_own_account('del-google@example.com','DELETE')$$,'PT401','recent authentication required','Google-only login without the fresh verification cannot confirm');
create temp table google_deletion_fixture as select public.begin_own_deletion_google() as nonce;
select is(public.confirm_own_deletion_google(nonce),false,'The original browser session is insufficient') from google_deletion_fixture;
reset role;
insert into auth.sessions(id,user_id,created_at) values
 ('00000000-0000-4000-8000-000000002154','00000000-0000-4000-8000-000000002151',clock_timestamp()),
 ('00000000-0000-4000-8000-000000002155','00000000-0000-4000-8000-000000002152',clock_timestamp());
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000002152","session_id":"00000000-0000-4000-8000-000000002155","aal":"aal1","amr":[{"method":"oauth"}]}';
select is(public.confirm_own_deletion_google(nonce),false,'Choosing a different Google identity rejects the original challenge') from google_deletion_fixture;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000002151","session_id":"00000000-0000-4000-8000-000000002154","aal":"aal1","amr":[{"method":"password"}]}';
select is(public.confirm_own_deletion_google(nonce),false,'A new non-OAuth session cannot satisfy Google verification') from google_deletion_fixture;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000002151","session_id":"00000000-0000-4000-8000-000000002154","aal":"aal1","amr":[{"method":"oauth"}]}';
select is(public.confirm_own_deletion_google(gen_random_uuid()),false,'The returned challenge must match');
select is(public.confirm_own_deletion_google(nonce),true,'Fresh return with the same linked Google identity verifies') from google_deletion_fixture;
select is(public.confirm_own_deletion_google(nonce),false,'A challenge is single use') from google_deletion_fixture;
select ok(public.own_deletion_google_verified(),'The current OAuth session carries verification');
reset role;
update private.account_deletion_google_challenges set started_at=clock_timestamp()-interval '6 minutes';
set local role authenticated;
select is(public.own_deletion_google_verified(),false,'Google proof expires');
reset role;
update private.account_deletion_google_challenges set started_at=clock_timestamp();
insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at) values
 ('00000000-0000-4000-8000-000000002156','00000000-0000-4000-8000-000000002151','totp','verified','synthetic',now(),now());
set local role authenticated;
select throws_ok($$select public.delete_own_account('del-google@example.com','DELETE')$$,'PT403','second factor required','Verified Google identity still requires the enrolled MFA');
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000002151","session_id":"00000000-0000-4000-8000-000000002154","aal":"aal2","amr":[{"method":"oauth"},{"method":"totp"}]}';
select is(public.delete_own_account('del-google@example.com','DELETE'),true,'Verified owner with MFA can confirm');
reset role;
select is((select count(*) from auth.users where id='00000000-0000-4000-8000-000000002152'),1::bigint,'Other account survives');
select * from finish();
rollback;
