set lock_timeout = '5s';

-- One bounded, resumable upload per owner. Clients have no table privileges.
create table private.account_restore_uploads (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  id uuid not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes integer not null check (bytes between 1 and 16777216),
  received integer not null default 0 check (received between 0 and bytes),
  next_chunk integer not null default 0 check (next_chunk between 0 and 128),
  state text not null default 'uploading' check (state in ('uploading', 'restored', 'cancelled')),
  rows_restored integer not null default 0 check (rows_restored between 0 and 50000),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '30 minutes'
);
create table private.account_restore_chunks (
  owner_id uuid not null references private.account_restore_uploads(owner_id) on delete cascade,
  chunk_index integer not null check (chunk_index between 0 and 127),
  body text not null check (octet_length(body) between 1 and 1048576),
  primary key (owner_id, chunk_index)
);
alter table private.account_restore_uploads enable row level security;
alter table private.account_restore_chunks enable row level security;
alter table private.account_restore_uploads owner to postgres;
alter table private.account_restore_chunks owner to postgres;
revoke all on private.account_restore_uploads, private.account_restore_chunks
  from public, anon, authenticated;

-- This helper is callable only by the restore entry point. All mutable entities
-- are validated against the authenticated owner before any delete or insert.
create function private.apply_account_restore(p_payload jsonb, p_owner uuid)
returns integer language plpgsql set search_path = '' as $$
declare
  v_entities constant text[] := array[
    'profiles','languages','courses','course_settings','decks','concepts',
    'deck_concepts','practice_items','tags','concept_tags','learning_states',
    'review_logs','study_sessions','import_jobs','import_job_errors'
  ];
  v_entity text;
  v_rows jsonb;
  v_column text;
  v_count integer := 0;
  v_profile public.profiles;
begin
  if p_owner is null or p_owner is distinct from (select auth.uid()) then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or
     (select count(*) from jsonb_object_keys(p_payload)) <> cardinality(v_entities) then
    raise exception 'invalid backup' using errcode = '22023';
  end if;
  foreach v_entity in array v_entities loop
    v_rows := p_payload->v_entity;
    if jsonb_typeof(v_rows) is distinct from 'array' then
      raise exception 'invalid backup rows' using errcode = '22023';
    end if;
    v_count := v_count + jsonb_array_length(v_rows);
    if v_count > 50000 then raise exception 'backup too large' using errcode = 'PT413'; end if;
    if exists (select 1 from jsonb_array_elements(v_rows) r where jsonb_typeof(r) <> 'object') then
      raise exception 'invalid backup row' using errcode = '22023';
    end if;
    if v_entity <> 'languages' then
      v_column := case v_entity when 'profiles' then 'id' when 'course_settings' then 'user_id' else 'owner_id' end;
      if exists (select 1 from jsonb_array_elements(v_rows) r
        where r->>v_column is distinct from p_owner::text) then
        raise exception 'backup belongs to another account' using errcode = 'PT403';
      end if;
    end if;
  end loop;
  if jsonb_array_length(p_payload->'profiles') <> 1 then
    raise exception 'invalid backup profile' using errcode = '22023';
  end if;
  select * into strict v_profile
    from jsonb_populate_record(null::public.profiles, p_payload->'profiles'->0);

  -- The course cascade removes only this owner's portable rows. One database
  -- transaction holds both the removal and the FK-checked reconstruction.
  delete from public.courses where owner_id = p_owner;
  insert into public.courses
    select * from jsonb_populate_recordset(null::public.courses, p_payload->'courses');
  insert into public.course_settings
    select * from jsonb_populate_recordset(null::public.course_settings, p_payload->'course_settings');
  insert into public.decks
    select * from jsonb_populate_recordset(null::public.decks, p_payload->'decks');
  insert into public.concepts
    (id,course_id,owner_id,kind,title,summary,explanation,example,cefr_level,source_reference,metadata,archived_at,created_at,updated_at)
    select id,course_id,owner_id,kind,title,summary,explanation,example,cefr_level,source_reference,metadata,archived_at,created_at,updated_at
      from jsonb_populate_recordset(null::public.concepts, p_payload->'concepts');
  insert into public.deck_concepts
    select * from jsonb_populate_recordset(null::public.deck_concepts, p_payload->'deck_concepts');
  insert into public.practice_items
    select * from jsonb_populate_recordset(null::public.practice_items, p_payload->'practice_items');
  insert into public.tags
    select * from jsonb_populate_recordset(null::public.tags, p_payload->'tags');
  insert into public.concept_tags
    select * from jsonb_populate_recordset(null::public.concept_tags, p_payload->'concept_tags');
  insert into public.learning_states
    select * from jsonb_populate_recordset(null::public.learning_states, p_payload->'learning_states');
  insert into public.study_sessions
    select * from jsonb_populate_recordset(null::public.study_sessions, p_payload->'study_sessions');
  insert into public.review_logs
    select * from jsonb_populate_recordset(null::public.review_logs, p_payload->'review_logs');

  -- Completed import metadata is portable. Partial browser transfers need the
  -- original local file and receipts, so restore them as stopped jobs.
  insert into public.import_jobs
    select * from jsonb_populate_recordset(null::public.import_jobs, (
      select coalesce(jsonb_agg(r || jsonb_build_object(
        'request_fingerprint', null,
        'processed_rows', coalesce(r->'processed_rows', '0'),
        'last_source_row', coalesce(r->'last_source_row', '0'),
        'status', case when r->>'status' = 'importing' then 'failed' else r->>'status' end,
        'rows_created', case when r->>'status' = 'importing' and r->'mapping_config'->>'deckMode' = 'replace'
          then 0 else (r->>'rows_created')::integer end,
        'rows_skipped', (r->>'rows_skipped')::integer +
          case when r->>'status' = 'importing' and r->'mapping_config'->>'deckMode' = 'replace'
          then (r->>'rows_created')::integer else 0 end
      )), '[]') from jsonb_array_elements(p_payload->'import_jobs') r
    ));
  update public.import_jobs j set request_fingerprint = r.request_fingerprint
    from jsonb_populate_recordset(null::public.import_jobs, p_payload->'import_jobs') r
    where j.owner_id = p_owner and j.id = r.id and r.request_fingerprint is not null;
  insert into public.import_job_errors
    select * from jsonb_populate_recordset(null::public.import_job_errors, p_payload->'import_job_errors');

  update public.profiles set
    active_course_id = v_profile.active_course_id,
    created_at = v_profile.created_at,
    display_name = v_profile.display_name,
    onboarding_completed_at = v_profile.onboarding_completed_at,
    theme_preference = v_profile.theme_preference,
    timezone = v_profile.timezone,
    ui_locale = v_profile.ui_locale
    where id = p_owner;
  return v_count - jsonb_array_length(p_payload->'languages');
end;
$$;
alter function private.apply_account_restore(jsonb,uuid) owner to postgres;
revoke all on function private.apply_account_restore(jsonb,uuid) from public, anon, authenticated;

create function private.restore_own_backup(p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := (select auth.uid());
  v_action text := p_request->>'action';
  v_id uuid := (p_request->>'id')::uuid;
  v_job private.account_restore_uploads;
  v_text text;
  v_bytes integer;
  v_index integer;
  v_session uuid;
  v_now timestamptz := clock_timestamp();
  v_sha text;
  v_rows integer;
begin
  if v_owner is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if v_id is null or coalesce(v_action, '') not in ('begin','append','commit','cancel') then
    raise exception 'invalid restore request' using errcode = '22023';
  end if;
  -- Consistent lock order for starts, repeated requests and finalization.
  perform 1 from public.profiles where id = v_owner for update;
  if not found then raise exception 'profile unavailable' using errcode = '28000'; end if;
  select * into v_job from private.account_restore_uploads where owner_id = v_owner for update;

  if (v_action = 'begin' and (
      v_job.id is distinct from v_id or v_job.state <> 'restored' or v_job.expires_at <= v_now
     )) or
     (v_action = 'commit' and v_job.id = v_id and v_job.state = 'uploading') then
    begin
      v_session := ((select auth.jwt())->>'session_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'recent authentication required' using errcode = 'PT401';
    end;
    if not exists (select 1 from auth.sessions s where s.id=v_session and s.user_id=v_owner
      and s.created_at >= v_now - interval '10 minutes' and s.created_at <= v_now + interval '5 seconds'
      and (s.not_after is null or s.not_after > v_now)) or
      (exists (select 1 from auth.mfa_factors f where f.user_id=v_owner and f.status='verified')
        and (select auth.jwt())->>'aal' is distinct from 'aal2') then
      raise exception 'recent authentication required' using errcode = 'PT401';
    end if;
  end if;

  if v_action = 'begin' then
    v_bytes := (p_request->>'bytes')::integer;
    v_sha := p_request->>'sha256';
    if v_bytes is null or v_bytes not between 1 and 16777216 or
       v_sha is null or v_sha !~ '^[0-9a-f]{64}$' then
      raise exception 'invalid restore size or checksum' using errcode = '22023';
    end if;
    if v_job.id is distinct from v_id or v_job.expires_at <= v_now then
      if v_job.created_at > v_now - interval '2 seconds' then
        raise exception 'restore cooldown' using errcode = 'PT429';
      end if;
      delete from private.account_restore_uploads where owner_id = v_owner;
      insert into private.account_restore_uploads(owner_id,id,sha256,bytes)
        values(v_owner,v_id,v_sha,v_bytes) returning * into v_job;
    elsif v_job.sha256 is distinct from v_sha or v_job.bytes is distinct from v_bytes then
      raise exception 'restore file changed' using errcode = 'PT409';
    end if;
  elsif v_job.id is distinct from v_id or v_job.expires_at <= v_now then
    raise exception 'restore unavailable' using errcode = 'PT409';
  elsif v_action = 'cancel' and v_job.state = 'uploading' then
    delete from private.account_restore_chunks where owner_id = v_owner;
    update private.account_restore_uploads set state='cancelled', received=0, next_chunk=0
      where owner_id = v_owner returning * into v_job;
  elsif v_action = 'append' and v_job.state = 'uploading' then
    v_index := (p_request->>'index')::integer;
    v_text := p_request->>'text';
    v_bytes := octet_length(v_text);
    if v_index is null or v_index not between 0 and 127 or
       jsonb_typeof(p_request->'text') is distinct from 'string' or
       v_bytes not between 1 and 1048576 then
      raise exception 'invalid backup part' using errcode = '22023';
    end if;
    if v_index < v_job.next_chunk then
      if not exists (select 1 from private.account_restore_chunks
        where owner_id = v_owner and chunk_index = v_index and body = v_text) then
        raise exception 'restore retry differs' using errcode = 'PT409';
      end if;
    elsif v_index = v_job.next_chunk and v_job.received + v_bytes <= v_job.bytes then
      insert into private.account_restore_chunks values(v_owner,v_index,v_text);
      update private.account_restore_uploads set received=received+v_bytes, next_chunk=next_chunk+1
        where owner_id=v_owner returning * into v_job;
    else
      raise exception 'restore position changed' using errcode = 'PT409';
    end if;
  elsif v_action = 'commit' and v_job.state = 'uploading' then
    if p_request->>'confirmation' is distinct from 'RESTORE' or v_job.received <> v_job.bytes then
      raise exception 'restore is incomplete or unconfirmed' using errcode = '22023';
    end if;
    select string_agg(body,'' order by chunk_index) into v_text
      from private.account_restore_chunks where owner_id=v_owner;
    if v_text is null or octet_length(v_text) <> v_job.bytes or
      encode(sha256(convert_to(v_text,'UTF8')),'hex') is distinct from v_job.sha256 then
      raise exception 'backup checksum differs' using errcode = 'PT422';
    end if;
    v_rows := private.apply_account_restore(v_text::jsonb, v_owner);
    delete from private.account_restore_chunks where owner_id=v_owner;
    update private.account_restore_uploads set state='restored', rows_restored=v_rows
      where owner_id=v_owner returning * into v_job;
  end if;
  return jsonb_build_object('state',v_job.state,'next',v_job.next_chunk,'rows',v_job.rows_restored);
end;
$$;
alter function private.restore_own_backup(jsonb) owner to postgres;
revoke all on function private.restore_own_backup(jsonb) from public, anon, authenticated;
grant execute on function private.restore_own_backup(jsonb) to authenticated;

create function public.restore_account_backup(p_request jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.restore_own_backup(p_request);
$$;
revoke all on function public.restore_account_backup(jsonb) from public, anon, authenticated;
grant execute on function public.restore_account_backup(jsonb) to authenticated;
comment on function public.restore_account_backup(jsonb) is
  'Restore only the authenticated account from a bounded, confirmed, checksum-verified backup. Commit requires a recent live session.';
reset lock_timeout;
