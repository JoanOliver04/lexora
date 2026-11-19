set lock_timeout = '5s';

-- Existing jobs retain their original descriptor and course-wide behavior.
alter table public.import_jobs add constraint import_jobs_deck_mode_check
  check (request_fingerprint is null or not (mapping_config ? 'deckMode') or (
    mapping_config->>'deckMode' in ('append','replace') and mapping_config->>'strategy' = 'skip'
  ) is true) not valid;

-- A replacement stages validated rows in immutable receipts until it completes.
-- The BEFORE trigger overwrites this column. Completion and stop clear it.
alter table public.import_job_batches
  add column replacement_rows jsonb,
  add constraint import_batch_replacement_rows_check
    check (replacement_rows is null or (
      jsonb_typeof(replacement_rows) = 'array' and
      jsonb_array_length(replacement_rows) between 1 and 250 and
      octet_length(replacement_rows::text) <= 524288
    )) not valid;

create or replace function public.persist_import_batch()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_job public.import_jobs;
  v_existing public.import_job_batches; v_row jsonb; v_tag jsonb;
  v_valid jsonb := '[]'::jsonb; v_last integer; v_number integer;
  v_position integer; v_nulls integer; v_payload_hash text;
  v_mode text;
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
  new.replacement_rows := null;
  if new.kind = 'stop' then new.request_payload := null; return new; end if;
  new.row_count := jsonb_array_length(new.request_payload);
  if v_job.processed_rows + new.row_count > v_job.rows_total or v_job.deck_id is null then
    raise exception 'invalid import extent' using errcode = '22023';
  end if;
  v_mode := v_job.mapping_config->>'deckMode';
  if v_mode in ('append','replace') then
    -- Serialize a targeted batch with changes that reference this deck.
    perform 1 from public.decks where id = v_job.deck_id and owner_id = v_uid
      and course_id = v_job.course_id and archived_at is null for update;
    if not found then raise exception 'import destination unavailable' using errcode = 'PT404'; end if;
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
  ), staged as materialized (
    select value->>'canonical' as canonical
    from public.import_job_batches b cross join lateral jsonb_array_elements(b.replacement_rows)
    where v_mode = 'replace' and b.import_job_id = v_job.id and b.owner_id = v_uid
      and b.replacement_rows is not null
  ), ranked as (
    select *, row_number() over(partition by canonical order by number) > 1 or case
      when v_mode = 'replace' then source.canonical in (select staged.canonical from staged)
      else exists (
        select 1 from public.concepts c where c.owner_id = v_uid and c.course_id = v_job.course_id
          and c.canonical_key = source.canonical and (
            (v_mode is distinct from 'append' and c.archived_at is null) or
            (v_mode = 'append' and exists (
              select 1 from public.deck_concepts m where m.deck_id = v_job.deck_id
                and m.concept_id = c.id and m.owner_id = v_uid
            ))
          )
      )
    end as duplicate from source
  ) select coalesce(jsonb_agg(item || jsonb_build_object(
    'id',gen_random_uuid(),'canonical',canonical,'duplicate',duplicate,
    'skip',duplicate and v_job.mapping_config->>'strategy' = 'skip'
  ) order by number),'[]'::jsonb) into v_valid from ranked;
  select count(*) filter(where not (value->>'skip')::boolean),
    count(*) filter(where (value->>'skip')::boolean),
    count(*) filter(where (value->>'duplicate')::boolean)
    into new.rows_created,new.rows_skipped,new.rows_duplicate from jsonb_array_elements(v_valid);

  if v_mode = 'replace' then
    select jsonb_agg(value order by (value->>'rowNumber')::integer) into new.replacement_rows
      from jsonb_array_elements(v_valid) where not (value->>'skip')::boolean;
    if v_job.processed_rows + new.row_count < v_job.rows_total then
      v_valid := '[]'::jsonb;
    else
      select coalesce(jsonb_agg(value order by (value->>'rowNumber')::integer),'[]'::jsonb)
        into v_valid
        from (
          select value from public.import_job_batches b
            cross join lateral jsonb_array_elements(b.replacement_rows)
            where b.import_job_id = v_job.id and b.owner_id = v_uid and b.replacement_rows is not null
          union all
          select value from jsonb_array_elements(new.replacement_rows)
        ) rows;
      if jsonb_array_length(v_valid) = 0 then
        raise exception 'replacement needs a valid entry' using errcode = '22023';
      end if;
      -- Replace membership only. Shared concepts, cards and review data remain.
      delete from public.deck_concepts where deck_id = v_job.deck_id and owner_id = v_uid;
      new.replacement_rows := null;
    end if;
  end if;

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
  if jsonb_array_length(v_valid) > 0 then
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
  -- Discard the incoming payload. Only unfinished replacements stage content.
  new.request_payload := null;
  return new;
end;
$$;

create or replace function private.advance_import_progress()
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
    rows_created = case when new.kind = 'stop' and mapping_config->>'deckMode' = 'replace'
      then 0 else rows_created + new.rows_created end,
    rows_skipped = rows_skipped + new.rows_skipped + case
      when new.kind = 'stop' and mapping_config->>'deckMode' = 'replace' then rows_created
      else 0 end,
    rows_duplicate = rows_duplicate + new.rows_duplicate, rows_failed = rows_failed + new.rows_failed,
    status = case when new.kind = 'stop' then 'failed'::public.import_status
      when processed_rows + new.row_count = rows_total then 'completed'::public.import_status
      else 'importing'::public.import_status end
    where id = v_job.id and owner_id = v_uid;
  if v_job.mapping_config->>'deckMode' = 'replace' and
     (new.kind = 'stop' or v_job.processed_rows + new.row_count = v_job.rows_total) then
    update public.import_job_batches set replacement_rows = null
      where import_job_id = v_job.id and owner_id = v_uid and replacement_rows is not null;
  end if;
  return null;
end;
$$;

create function public.preview_deck_import_duplicates(
  p_course_id uuid,p_deck_id uuid,p_mode text,p_rows jsonb
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_mode is null or p_mode not in ('append','replace') then
    raise exception 'invalid destination mode' using errcode = '22023';
  end if;
  perform 1 from public.decks where id = p_deck_id and owner_id = v_uid
    and course_id = p_course_id and archived_at is null;
  if not found then raise exception 'import destination unavailable' using errcode = 'PT404'; end if;
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
        select c.title from public.concepts c where p_mode = 'append'
          and c.owner_id = v_uid and c.course_id = p_course_id
          and c.canonical_key = lower(btrim(regexp_replace(r->>'front','\s+',' ','g')))
          and exists (
            select 1 from public.deck_concepts m where m.deck_id = p_deck_id
              and m.concept_id = c.id and m.owner_id = v_uid
          )
          order by c.title,c.id limit 3
      ) c
    ) hits;
  return v_result;
end;
$$;

revoke all on function public.preview_deck_import_duplicates(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.preview_deck_import_duplicates(uuid,uuid,text,jsonb) to authenticated;

comment on table public.import_job_batches is
  'Owner-only immutable retry receipts. Replacement rows are staged after confirmation, then discarded after completion or stop.';
comment on function private.advance_import_progress() is
  'Private authenticated receipt trigger. Advances protected progress and clears replacement staging. Does not write learning content or Auth.';

reset lock_timeout;
