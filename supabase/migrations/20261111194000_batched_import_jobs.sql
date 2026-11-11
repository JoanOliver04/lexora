-- Bounded, resumable imports. Ordinary content writes still run as the caller
-- under RLS. Only the private AFTER trigger advances protected job metadata.
alter table public.import_jobs
  add column request_fingerprint text,
  add column processed_rows integer not null default 0,
  add column last_source_row integer not null default 0,
  add constraint import_jobs_fingerprint_format check
    (request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint import_jobs_tracked_counters check (
    request_fingerprint is null or (
      rows_total between 1 and 10000 and processed_rows between 0 and rows_total
      and rows_created + rows_skipped + rows_failed = processed_rows
      and rows_duplicate <= rows_created + rows_skipped
      and (status <> 'completed' or processed_rows = rows_total)
      and last_source_row >= 0
    )
  );

create unique index import_jobs_one_running_course
  on public.import_jobs(owner_id, course_id)
  where request_fingerprint is not null and status = 'importing';

create table public.import_rate_limits (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  window_date date not null default (clock_timestamp() at time zone 'UTC')::date,
  attempts integer not null default 0,
  claimed_rows integer not null default 0,
  requested_rows integer not null,
  requested_at timestamptz not null default clock_timestamp(),
  constraint import_rate_limits_bounds check (
    attempts between 1 and 50 and claimed_rows between 1 and 100000
    and requested_rows between 1 and 10000
  )
);
alter table public.import_rate_limits enable row level security;
revoke all on public.import_rate_limits from public, anon, authenticated;
grant select, insert, update on public.import_rate_limits to authenticated;
create policy import_limits_select_own on public.import_rate_limits for select
  to authenticated using(owner_id = (select auth.uid()));
create policy import_limits_insert_own on public.import_rate_limits for insert
  to authenticated with check(owner_id = (select auth.uid()));
create policy import_limits_update_own on public.import_rate_limits for update
  to authenticated using(owner_id = (select auth.uid()))
  with check(owner_id = (select auth.uid()));

create function public.guard_import_rate_limit()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_now timestamptz := clock_timestamp(); v_date date;
begin
  if new.owner_id is distinct from (select auth.uid()) or
     (tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id) then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if new.requested_rows is null or new.requested_rows not between 1 and 10000 then
    raise exception 'invalid import size' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and old.requested_at > v_now - interval '2 seconds' then
    raise exception 'import cooldown' using errcode = 'PT429';
  end if;
  v_date := (v_now at time zone 'UTC')::date;
  if tg_op = 'UPDATE' and old.window_date = v_date then
    new.attempts := old.attempts + 1;
    new.claimed_rows := old.claimed_rows + new.requested_rows;
  else
    new.attempts := 1; new.claimed_rows := new.requested_rows;
  end if;
  if new.attempts > 50 or new.claimed_rows > 100000 then
    raise exception 'daily import limit' using errcode = 'PT429';
  end if;
  new.window_date := v_date; new.requested_at := v_now;
  return new;
end;
$$;
revoke execute on function public.guard_import_rate_limit() from public, anon, authenticated;
create trigger import_rate_limit_guard before insert or update on public.import_rate_limits
  for each row execute function public.guard_import_rate_limit();

create function public.guard_tracked_import_job()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if tg_op = 'DELETE' then
    if old.request_fingerprint is not null and current_user <> 'postgres' then
      raise exception 'tracked imports cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if (old.request_fingerprint is not null or
        new.request_fingerprint is distinct from old.request_fingerprint)
       and current_user <> 'postgres' then
      raise exception 'tracked import metadata is protected' using errcode = '42501';
    end if;
    return new;
  end if;
  -- Legacy receipts remain readable and retain their previous contract. Only
  -- tracked jobs can use the new batch API; a null fingerprint cannot enter it.
  if new.request_fingerprint is null then return new; end if;
  if v_uid is null or new.owner_id is distinct from v_uid then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if new.rows_total not between 1 and 10000 or
     new.content_hash !~ '^[0-9a-f]{64}$' or
     jsonb_typeof(new.mapping_config) <> 'object' or
     octet_length(new.mapping_config::text) > 4096 or
     coalesce(new.mapping_config->>'strategy','') not in ('skip','copy') or
     jsonb_typeof(new.mapping_config->'createReverse') is distinct from 'boolean' or
     jsonb_typeof(new.mapping_config->'originalBytes') is distinct from 'number' or
     (new.mapping_config->>'originalBytes')::bigint not between 1 and 5242880 then
    raise exception 'invalid import descriptor' using errcode = '22023';
  end if;
  perform 1 from public.decks where id = new.deck_id and owner_id = v_uid
    and course_id = new.course_id and archived_at is null;
  if not found then raise exception 'import destination unavailable' using errcode = 'PT404'; end if;
  new.request_fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'course',new.course_id,'deck',new.deck_id,'filename',new.original_filename,
    'hash',new.content_hash,'rows',new.rows_total,'mapping',new.mapping_config
  )::text,'UTF8')),'hex');
  new.processed_rows := 0; new.last_source_row := 0;
  new.rows_created := 0; new.rows_skipped := 0;
  new.rows_duplicate := 0; new.rows_failed := 0; new.status := 'importing';
  insert into public.import_rate_limits(owner_id, requested_rows)
    values(v_uid,new.rows_total)
    on conflict(owner_id) do update set requested_rows = excluded.requested_rows;
  return new;
end;
$$;
revoke execute on function public.guard_tracked_import_job() from public, anon, authenticated;
create trigger import_jobs_track_guard before insert or update or delete on public.import_jobs
  for each row execute function public.guard_tracked_import_job();

create table public.import_job_batches (
  import_job_id uuid not null,
  owner_id uuid not null,
  batch_offset integer not null,
  kind text not null default 'append' check(kind in ('append','stop')),
  request_payload jsonb,
  fingerprint text not null default '',
  row_count integer not null default 0,
  rows_created integer not null default 0,
  rows_skipped integer not null default 0,
  rows_duplicate integer not null default 0,
  rows_failed integer not null default 0,
  last_source_row integer not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  primary key(import_job_id,batch_offset),
  foreign key(import_job_id,owner_id) references public.import_jobs(id,owner_id) on delete cascade,
  constraint import_batches_derived check(
    batch_offset between 0 and 10000 and fingerprint ~ '^[0-9a-f]{64}$'
    and request_payload is null and row_count between 0 and 250
    and rows_created >= 0 and rows_skipped >= 0 and rows_failed >= 0
    and rows_duplicate between 0 and rows_created + rows_skipped
    and rows_created + rows_skipped + rows_failed = row_count
  )
);
create index import_job_batches_owner_idx on public.import_job_batches(owner_id);
alter table public.import_job_batches enable row level security;
revoke all on public.import_job_batches from public, anon, authenticated;
grant select, insert on public.import_job_batches to authenticated;
create policy import_batches_select_own on public.import_job_batches for select
  to authenticated using(owner_id = (select auth.uid()));
create policy import_batches_insert_own on public.import_job_batches for insert
  to authenticated with check(owner_id = (select auth.uid()));

create function public.persist_import_batch()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_job public.import_jobs;
  v_existing public.import_job_batches; v_row jsonb; v_tag jsonb;
  v_valid jsonb := '[]'::jsonb; v_last integer; v_number integer;
  v_position integer; v_nulls integer; v_payload_hash text;
begin
  if v_uid is null or new.owner_id is distinct from v_uid then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_job from public.import_jobs
    where id = new.import_job_id and owner_id = v_uid for update;
  if not found or v_job.request_fingerprint is null then
    raise exception 'import unavailable' using errcode = 'PT404';
  end if;
  if new.kind not in ('append','stop') or
     (new.kind = 'append' and (
       jsonb_typeof(new.request_payload) is distinct from 'array' or
       jsonb_array_length(new.request_payload) not between 1 and 250 or
       octet_length(new.request_payload::text) > 262144
     )) then raise exception 'invalid import batch' using errcode = '22023'; end if;
  -- Localized error messages do not alter retry identity.
  select encode(sha256(convert_to(coalesce(jsonb_agg(value - 'message' order by ordinality),
    '[]'::jsonb)::text || ':' || new.kind,'UTF8')),'hex') into v_payload_hash
    from jsonb_array_elements(case when new.kind = 'append' then new.request_payload else '[]'::jsonb end)
      with ordinality;
  select * into v_existing from public.import_job_batches
    where import_job_id = new.import_job_id and batch_offset = new.batch_offset and owner_id = v_uid;
  if found then
    if v_existing.fingerprint = v_payload_hash then return null; end if;
    raise exception 'import retry differs' using errcode = 'PT409';
  end if;
  if v_job.status <> 'importing' or new.batch_offset <> v_job.processed_rows then
    raise exception 'import position changed' using errcode = 'PT409';
  end if;
  new.fingerprint := v_payload_hash; new.created_at := clock_timestamp();
  new.row_count := 0; new.rows_created := 0; new.rows_skipped := 0;
  new.rows_duplicate := 0; new.rows_failed := 0; new.last_source_row := v_job.last_source_row;
  if new.kind = 'stop' then new.request_payload := null; return new; end if;
  new.row_count := jsonb_array_length(new.request_payload);
  if v_job.processed_rows + new.row_count > v_job.rows_total or v_job.deck_id is null then
    raise exception 'invalid import extent' using errcode = '22023';
  end if;
  v_last := v_job.last_source_row;
  for v_row in select value from jsonb_array_elements(new.request_payload) loop
    v_number := (v_row->>'rowNumber')::integer;
    if v_number is null or v_number <= v_last or
       coalesce(v_row->>'kind','') not in ('valid','error') then
      raise exception 'invalid import row' using errcode = '22023';
    end if;
    v_last := v_number;
    if v_row->>'kind' = 'error' then
      perform (v_row->>'code')::public.import_error_code;
      if char_length(btrim(coalesce(v_row->>'message',''))) not between 1 and 500 or
         char_length(coalesce(v_row->>'sample','')) > 200 then
        raise exception 'invalid import diagnostic' using errcode = '22023';
      end if;
      new.rows_failed := new.rows_failed + 1;
    else
      if jsonb_typeof(v_row->'front') is distinct from 'string' or
         jsonb_typeof(v_row->'back') is distinct from 'string' or
         char_length(btrim(v_row->>'front')) not between 1 and 200 or
         char_length(btrim(v_row->>'back')) not between 1 and 500 or
         jsonb_typeof(v_row->'tags') is distinct from 'array' or
         jsonb_array_length(v_row->'tags') > 1000 then
        raise exception 'invalid import content' using errcode = '22023';
      end if;
      for v_tag in select value from jsonb_array_elements(v_row->'tags') loop
        if jsonb_typeof(v_tag->'displayName') is distinct from 'string' or
           jsonb_typeof(v_tag->'normalizedName') is distinct from 'string' or
           char_length(btrim(v_tag->>'displayName')) not between 1 and 200 or
           char_length(v_tag->>'normalizedName') not between 1 and 200 or
           v_tag->>'normalizedName' ~ '(^|::)(::|$)' then
          raise exception 'invalid import tag' using errcode = '22023';
        end if;
      end loop;
    end if;
  end loop;
  new.last_source_row := v_last;
  with source as (
    select value as item, (value->>'rowNumber')::integer as number,
      lower(btrim(regexp_replace(value->>'front','\s+',' ','g'))) as canonical
    from jsonb_array_elements(new.request_payload) where value->>'kind' = 'valid'
  ), ranked as (
    select *, row_number() over(partition by canonical order by number) > 1 or exists(
      select 1 from public.concepts c where c.owner_id = v_uid and c.course_id = v_job.course_id
        and c.canonical_key = source.canonical and c.archived_at is null
    ) as duplicate from source
  ) select coalesce(jsonb_agg(item || jsonb_build_object(
    'id',gen_random_uuid(),'duplicate',duplicate,
    'skip',duplicate and v_job.mapping_config->>'strategy' = 'skip'
  ) order by number),'[]'::jsonb) into v_valid from ranked;
  select count(*) filter(where not (value->>'skip')::boolean),
    count(*) filter(where (value->>'skip')::boolean),
    count(*) filter(where (value->>'duplicate')::boolean)
    into new.rows_created,new.rows_skipped,new.rows_duplicate from jsonb_array_elements(v_valid);

  insert into public.concepts(id,course_id,owner_id,kind,title,summary)
    select (value->>'id')::uuid,v_job.course_id,v_uid,'vocabulary',value->>'front',value->>'back'
    from jsonb_array_elements(v_valid) where not (value->>'skip')::boolean;
  insert into public.practice_items(concept_id,owner_id,mode,prompt_text,answer_text,config)
    select (value->>'id')::uuid,v_uid,'basic_recognition',value->>'front',value->>'back',
      '{"mode":"basic_recognition"}'::jsonb from jsonb_array_elements(v_valid)
      where not (value->>'skip')::boolean;
  if (v_job.mapping_config->>'createReverse')::boolean then
    insert into public.practice_items(concept_id,owner_id,mode,prompt_text,answer_text,config)
      select (value->>'id')::uuid,v_uid,'basic_recall',value->>'back',value->>'front',
        '{"mode":"basic_recall"}'::jsonb from jsonb_array_elements(v_valid)
        where not (value->>'skip')::boolean;
  end if;
  if new.rows_created > 0 then
    select coalesce(max(position),-1) into v_position from public.deck_concepts
      where deck_id = v_job.deck_id and owner_id = v_uid;
    -- Preserve the old NULL-position ordering, then append the new file order.
    with pending as (
      select concept_id,row_number() over(order by created_at,concept_id)::integer as position
      from public.deck_concepts where deck_id = v_job.deck_id and owner_id = v_uid and position is null
    ) update public.deck_concepts d set position = v_position + p.position
      from pending p where d.deck_id = v_job.deck_id and d.owner_id = v_uid and d.concept_id = p.concept_id;
    get diagnostics v_nulls = row_count;
    v_position := v_position + v_nulls;
    insert into public.deck_concepts(deck_id,concept_id,owner_id,position)
      select v_job.deck_id,(value->>'id')::uuid,v_uid,
        v_position + row_number() over(order by (value->>'rowNumber')::integer)::integer
      from jsonb_array_elements(v_valid) where not (value->>'skip')::boolean;
    insert into public.tags(course_id,owner_id,normalized_name,display_name)
      select distinct on(tag->>'normalizedName') v_job.course_id,v_uid,
        tag->>'normalizedName',tag->>'displayName'
      from jsonb_array_elements(v_valid) r, lateral jsonb_array_elements(r.value->'tags') tag
      where not (r.value->>'skip')::boolean
      order by tag->>'normalizedName',(r.value->>'rowNumber')::integer
      on conflict(course_id,normalized_name) do nothing;
    insert into public.concept_tags(concept_id,tag_id,owner_id)
      select distinct (r.value->>'id')::uuid,t.id,v_uid
      from jsonb_array_elements(v_valid) r, lateral jsonb_array_elements(r.value->'tags') tag
      join public.tags t on t.course_id = v_job.course_id and t.owner_id = v_uid
        and t.normalized_name = tag->>'normalizedName'
      where not (r.value->>'skip')::boolean on conflict(concept_id,tag_id) do nothing;
  end if;
  insert into public.import_job_errors(import_job_id,owner_id,row_number,code,message,row_sample)
    select v_job.id,v_uid,(value->>'rowNumber')::integer,
      (value->>'code')::public.import_error_code,value->>'message',nullif(value->>'sample','')
    from jsonb_array_elements(new.request_payload) where value->>'kind' = 'error';
  -- No original file or batch content remains in the receipt.
  new.request_payload := null;
  return new;
end;
$$;
revoke execute on function public.persist_import_batch() from public, anon, authenticated;
create trigger import_batch_persist before insert on public.import_job_batches
  for each row execute function public.persist_import_batch();

-- A table-bound, non-callable metadata trigger is the only privileged operation.
-- It cannot write concepts/items/tags or accept arbitrary arguments (ADR-010).
create function private.advance_import_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_job public.import_jobs;
begin
  if tg_op <> 'INSERT' or tg_table_schema <> 'public' or tg_table_name <> 'import_job_batches'
     or new.owner_id is distinct from v_uid then
    raise exception 'invalid import receipt context' using errcode = '42501';
  end if;
  select * into v_job from public.import_jobs where id = new.import_job_id and owner_id = v_uid for update;
  if not found or v_job.status <> 'importing' or v_job.processed_rows <> new.batch_offset then
    raise exception 'import position changed' using errcode = 'PT409';
  end if;
  update public.import_jobs set
    processed_rows = processed_rows + new.row_count,
    last_source_row = new.last_source_row,
    rows_created = rows_created + new.rows_created, rows_skipped = rows_skipped + new.rows_skipped,
    rows_duplicate = rows_duplicate + new.rows_duplicate, rows_failed = rows_failed + new.rows_failed,
    status = case when new.kind = 'stop' then 'failed'::public.import_status
      when processed_rows + new.row_count = rows_total then 'completed'::public.import_status
      else 'importing'::public.import_status end
    where id = v_job.id and owner_id = v_uid;
  return null;
end;
$$;
alter function private.advance_import_progress() owner to postgres;
revoke all on function private.advance_import_progress() from public, anon, authenticated;
create trigger import_batch_advance after insert on public.import_job_batches
  for each row execute function private.advance_import_progress();

create function public.begin_import_job(p_id uuid,p_course_id uuid,p_deck_id uuid,
  p_filename text,p_file_hash text,p_total_rows integer,p_mapping jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_job public.import_jobs;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  perform 1 from public.profiles where id = v_uid for no key update;
  if not found then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_job from public.import_jobs where owner_id = v_uid and
    (id = p_id or (course_id = p_course_id and status = 'importing' and request_fingerprint is not null))
    order by (id = p_id) desc limit 1 for update;
  if found then
    if v_job.request_fingerprint is null or v_job.course_id is distinct from p_course_id or
       v_job.deck_id is distinct from p_deck_id or v_job.original_filename is distinct from p_filename or
       v_job.content_hash is distinct from p_file_hash or v_job.rows_total is distinct from p_total_rows or
       v_job.mapping_config is distinct from p_mapping then
      raise exception 'import descriptor differs' using errcode = 'PT409';
    end if;
    return to_jsonb(v_job);
  end if;
  insert into public.import_jobs(id,course_id,owner_id,deck_id,original_filename,content_hash,
    rows_total,mapping_config,request_fingerprint)
    values(p_id,p_course_id,v_uid,p_deck_id,p_filename,p_file_hash,p_total_rows,p_mapping,repeat('0',64))
    on conflict(id) do nothing returning * into v_job;
  if not found then raise exception 'import unavailable' using errcode = 'PT409'; end if;
  return to_jsonb(v_job);
end;
$$;

create function public.commit_import_batch(p_job_id uuid,p_offset integer,p_records jsonb,p_stop boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_job public.import_jobs;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_job from public.import_jobs where id = p_job_id and owner_id = v_uid for update;
  if not found or v_job.request_fingerprint is null then
    raise exception 'import unavailable' using errcode = 'PT404';
  end if;
  if p_stop and v_job.status <> 'importing' then return to_jsonb(v_job); end if;
  insert into public.import_job_batches(import_job_id,owner_id,batch_offset,kind,request_payload)
    values(p_job_id,v_uid,case when p_stop then v_job.processed_rows else p_offset end,
      case when p_stop then 'stop' else 'append' end,p_records)
    on conflict(import_job_id,batch_offset) do nothing;
  select * into v_job from public.import_jobs where id = p_job_id and owner_id = v_uid;
  return to_jsonb(v_job);
end;
$$;
revoke all on function public.begin_import_job(uuid,uuid,uuid,text,text,integer,jsonb) from public, anon, authenticated;
revoke all on function public.commit_import_batch(uuid,integer,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.begin_import_job(uuid,uuid,uuid,text,text,integer,jsonb) to authenticated;
grant execute on function public.commit_import_batch(uuid,integer,jsonb,boolean) to authenticated;

comment on table public.import_job_batches is
  'Owner-only immutable retry receipts. Payload consumed before insert; only derived counts/hash remain. Content writes use caller RLS.';
comment on function private.advance_import_progress() is
  'Private table-bound metadata-only trigger; no direct EXECUTE privilege. Does not write learning content or Auth.';

create index concepts_import_key_idx on public.concepts(owner_id,course_id,canonical_key)
  where archived_at is null;
create index import_errors_job_row_idx on public.import_job_errors(import_job_id,row_number,id);

create function public.preview_import_duplicates(p_course_id uuid,p_rows jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 250 or
     octet_length(p_rows::text) > 262144 then
    raise exception 'invalid duplicate request' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where
    jsonb_typeof(r->'front') is distinct from 'string' or char_length(r->>'front') > 200 or
    jsonb_typeof(r->'rowNumber') is distinct from 'number' or (r->>'rowNumber')::integer < 1
  ) then raise exception 'invalid duplicate request' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('rowNumber',(r->>'rowNumber')::integer,
    'canonicalKey',lower(btrim(regexp_replace(r->>'front','\s+',' ','g'))),
    'existingTitles',hits.titles) order by (r->>'rowNumber')::integer),'[]'::jsonb)
    into v_result
    from jsonb_array_elements(p_rows) r
    cross join lateral (
      select coalesce(jsonb_agg(c.title),'[]'::jsonb) as titles from (
        select title from public.concepts where owner_id = v_uid and course_id = p_course_id
          and archived_at is null and canonical_key = lower(btrim(regexp_replace(r->>'front','\s+',' ','g')))
          order by title,id limit 3
      ) c
    ) hits;
  return v_result;
end;
$$;
revoke all on function public.preview_import_duplicates(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.preview_import_duplicates(uuid,jsonb) to authenticated;
