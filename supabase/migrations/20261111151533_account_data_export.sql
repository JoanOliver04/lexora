-- A bounded read of the caller's account. No temporary copies or privileged key.
create table public.account_export_requests (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now()
);
alter table public.account_export_requests enable row level security;
revoke all on public.account_export_requests from public, anon, authenticated;
grant select, insert, update on public.account_export_requests to authenticated;
create policy account_export_select on public.account_export_requests for select to authenticated using (owner_id = (select auth.uid()));
create policy account_export_insert on public.account_export_requests for insert to authenticated with check (owner_id = (select auth.uid()));
create policy account_export_update on public.account_export_requests for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Clients cannot backdate the cooldown, delete its row or race two first claims.
create function public.guard_export_request()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_now timestamptz;
begin
  if new.owner_id is distinct from (select auth.uid()) then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  perform 1 from public.profiles where id = new.owner_id for update;
  if not found then raise exception 'profile unavailable' using errcode = 'P0002'; end if;
  v_now := clock_timestamp();
  if tg_op = 'UPDATE' and old.requested_at > v_now - interval '60 seconds' then
    raise exception 'export cooldown' using errcode = 'PT429';
  end if;
  new.requested_at := v_now;
  return new;
end;
$$;
revoke execute on function public.guard_export_request() from public, anon, authenticated;
create trigger account_export_request_guard before insert or update on public.account_export_requests for each row execute function public.guard_export_request();

create function public.export_account_data()
returns jsonb language plpgsql security invoker set search_path = '' set timezone = 'UTC' as $$
declare v_uid uuid := (select auth.uid()); v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  insert into public.account_export_requests(owner_id) values(v_uid)
    on conflict(owner_id) do update set requested_at = excluded.requested_at;
  -- One SELECT snapshot for all entities, including archived content and logs.
  -- The bounded materialization is checked before building the final aggregate.
  with owned as (
    select 'profiles' as entity, to_jsonb(t) as value from public.profiles t where id = v_uid
    union all select 'languages', to_jsonb(t) from public.languages t where id in (select source_language_id from public.courses where owner_id=v_uid union select target_language_id from public.courses where owner_id=v_uid)
    union all select 'courses', to_jsonb(t) from public.courses t where owner_id=v_uid
    union all select 'course_settings', to_jsonb(t) from public.course_settings t where user_id=v_uid
    union all select 'decks', to_jsonb(t) from public.decks t where owner_id=v_uid
    union all select 'concepts', to_jsonb(t) from public.concepts t where owner_id=v_uid
    union all select 'deck_concepts', to_jsonb(t) from public.deck_concepts t where owner_id=v_uid
    union all select 'practice_items', to_jsonb(t) from public.practice_items t where owner_id=v_uid
    union all select 'tags', to_jsonb(t) from public.tags t where owner_id=v_uid
    union all select 'concept_tags', to_jsonb(t) from public.concept_tags t where owner_id=v_uid
    union all select 'learning_states', to_jsonb(t) from public.learning_states t where owner_id=v_uid
    union all select 'review_logs', to_jsonb(t) from public.review_logs t where owner_id=v_uid
    union all select 'study_sessions', to_jsonb(t) from public.study_sessions t where owner_id=v_uid
    union all select 'import_jobs', to_jsonb(t) from public.import_jobs t where owner_id=v_uid
    union all select 'import_job_errors', to_jsonb(t) from public.import_job_errors t where owner_id=v_uid
  ), bounded as materialized (select * from owned limit 50001),
  size as (select count(*) as rows, coalesce(sum(octet_length(value::text)),0) as bytes from bounded)
  select case when size.rows > 50000 or size.bytes > 16777216 then
    jsonb_build_object('ok',false,'reason','too-large')
  else jsonb_build_object('ok',true,'exportedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'rows',size.rows,
    'payloadText', ('{"profiles":[],"languages":[],"courses":[],"course_settings":[],"decks":[],"concepts":[],"deck_concepts":[],"practice_items":[],"tags":[],"concept_tags":[],"learning_states":[],"review_logs":[],"study_sessions":[],"import_jobs":[],"import_job_errors":[]}'::jsonb ||
      coalesce((select jsonb_object_agg(entity, records) from (
        select entity, jsonb_agg(value order by value->>'id',value->>'deck_id',value->>'concept_id',value->>'tag_id',value::text) as records
        from bounded group by entity
      ) grouped),'{}'::jsonb))::text) end into v_result from size;
  -- Text avoids the SDK parsing JSONB numbers into lossy IEEE-754 values.
  if v_result->>'ok' = 'true' and octet_length(v_result->>'payloadText') > 16777216 then
    return jsonb_build_object('ok',false,'reason','too-large');
  end if;
  -- Returning a refusal commits the claim too, preventing repeated expensive reads.
  return v_result;
end;
$$;
revoke execute on function public.export_account_data() from public, anon;
grant execute on function public.export_account_data() to authenticated;
