begin;
select plan(12);
set local statement_timeout='100s';
insert into auth.users(id) values('fec0a000-0000-4000-8000-000000000325');
insert into public.profiles(id) values('fec0a000-0000-4000-8000-000000000325');
insert into auth.sessions(id,user_id,created_at) values('fec0a000-0000-4000-8000-000000000326','fec0a000-0000-4000-8000-000000000325',now());
insert into public.languages(id,code,locale,name_key) values
 ('fec0a000-0000-4000-8000-000000000321','zz','zz','language.zz'),('fec0a000-0000-4000-8000-000000000322','zz','zz-ZZ','language.zz_zz');
insert into public.courses(id,owner_id,title,source_language_id,target_language_id)
 values('fec0a000-0000-4000-8000-000000000323','fec0a000-0000-4000-8000-000000000325','Archive example','fec0a000-0000-4000-8000-000000000321','fec0a000-0000-4000-8000-000000000322');
insert into public.tags(course_id,owner_id,normalized_name,display_name)
 select 'fec0a000-0000-4000-8000-000000000323','fec0a000-0000-4000-8000-000000000325','sample-'||i,'sample-'||i from generate_series(1,42546)i;
analyze public.tags;
set local role authenticated;
set local request.jwt.claims='{"sub":"fec0a000-0000-4000-8000-000000000325","session_id":"fec0a000-0000-4000-8000-000000000326","role":"authenticated","aal":"aal1"}';
select ok(not has_function_privilege('anon','public.start_account_archive()','execute'),'Anonymous cannot start an archive');
select ok(not has_table_privilege('authenticated','private.account_archive_parts','select'),'Staged bytes are private');
create temporary table archive_test as select private.account_archive_manifest()||'{"audio":[]}'::jsonb m;
create temporary view archive_size as select sum((p->>'rows')::int)::int rows,
  sum((p->>'bytes')::int)+82+octet_length(replace(replace(m::text,', ',','),': ',':')) archive_bytes from archive_test,jsonb_array_elements(m->'pages') p group by m;
select is((select rows from archive_size),42550,'Snapshot includes all 42,550 synthetic rows');
select ok((select archive_bytes between 10485760 and 16777216 from archive_size),'Baseline file fits the older 16 MiB ceiling');
select diag('Baseline fixture: '||rows||' rows, '||archive_bytes||' bytes in the portable file with its compact UTF-8 manifest') from archive_size;
insert into public.tags(course_id,owner_id,normalized_name,display_name) select
 'fec0a000-0000-4000-8000-000000000323','fec0a000-0000-4000-8000-000000000325','sample-'||i,'long-'||repeat('x',120)||i from generate_series(42547,55000)i;
update archive_test set m=public.start_account_archive()||'{"audio":[]}'::jsonb;
select ok((select rows>50000 and archive_bytes>16777216 from archive_size),'Larger account crosses both previous limits');
select diag('Larger fixture: '||rows||' rows, '||archive_bytes||' bytes in the portable file with its compact UTF-8 manifest') from archive_size;
select is((select public.restore_account_archive(jsonb_build_object('action','begin','id','fec0a000-0000-4000-8000-000000000327','manifest',m))->>'state' from archive_test),'uploading','Begin large restore');
do $$
declare
  p record; cursor_key uuid[]; encoded text; sequence int:=0; bytes int; result jsonb;
begin
  for p in select value spec,ordinality-1 idx from archive_test,jsonb_array_elements(m->'pages') with ordinality loop
    cursor_key:='{}';
    if jsonb_typeof(p.spec->'after')='array' then select array_agg(v::uuid order by ord) into cursor_key
      from jsonb_array_elements_text(p.spec->'after') with ordinality k(v,ord); end if;
    bytes:=(p.spec->>'bytes')::int;
    for n in 0..((bytes-1)/262144) loop
      encoded:=public.read_account_archive_page(p.spec->>'entity',cursor_key,(p.spec->>'rows')::int,n*262144);
      result:=public.restore_account_archive(jsonb_build_object('action','append','id','fec0a000-0000-4000-8000-000000000327',
        'page',p.idx,'part',n,'sequence',sequence,'body',replace(encoded,chr(10),'')));
      sequence:=sequence+1;
      if (result->>'next')::int<>sequence then raise exception 'incorrect next part'; end if;
    end loop;
  end loop;
end $$;
delete from public.tags where normalized_name='sample-1';
create temp table archive_result as select public.restore_account_archive('{"action":"commit","id":"fec0a000-0000-4000-8000-000000000327","confirmation":"RESTORE"}') r;
select is((select r->>'state' from archive_result),'restored','Atomic commit succeeds after live data changed');
select is((select count(*)::integer from public.tags),55000,'Restored every synthetic tag');
select is((select public.restore_account_archive('{"action":"commit","id":"fec0a000-0000-4000-8000-000000000327","confirmation":"RESTORE"}')->>'state'),'restored','Lost commit response is safe to retry');
select is((select public.restore_account_archive(jsonb_build_object('action','begin','id','fec0a000-0000-4000-8000-000000000327','manifest',m))->>'state' from archive_test),'restored','Retry after a lost response recognizes the same manifest');
reset role;
select ok((select not (manifest ? 'pages') and not (manifest ? 'audio') from private.account_archive_restores where owner_id='fec0a000-0000-4000-8000-000000000325'),'Finished jobs retain just a fingerprint and receipt');
set local role authenticated;
set local request.jwt.claims='{"sub":"fec0a000-0000-4000-8000-000000000329","role":"authenticated"}';
select throws_ok($$select public.read_account_archive_page('tags','{}',256,0)$$,'PT409','archive expired','Another owner cannot read pages from this export');
select * from finish();
rollback;
