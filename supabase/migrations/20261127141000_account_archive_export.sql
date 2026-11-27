-- Each archive page is identified by its entity, primary-key cursor and digest.
-- Only the small manifest is retained by the browser. No server-side export copy.
create function private.account_archive_page(p_entity text,p_after uuid[],p_rows integer)
returns jsonb language plpgsql stable security invoker set search_path='' set timezone='UTC' as $$
declare
  uid uuid := auth.uid();
  names constant text[] := array['profiles','languages','courses','course_settings','decks','concepts','deck_concepts',
    'practice_items','tags','concept_tags','learning_states','review_logs','study_sessions','import_jobs','import_job_errors'];
  keys text; cursor_filter text; order_by text; owner_filter text; result jsonb;
begin
  if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_entity is null or not (p_entity=any(names)) or p_rows is null or p_rows not between 1 and 256 then
    raise exception 'invalid archive page' using errcode='22023';
  end if;
  order_by := case p_entity when 'course_settings' then 'course_id' when 'deck_concepts' then 'deck_id,concept_id'
    when 'concept_tags' then 'concept_id,tag_id' else 'id' end;
  keys := 'array['||order_by||']';
  cursor_filter := case when strpos(order_by,',')>0 then '('||order_by||') > (($2)[1],($2)[2])'
    else order_by||' > ($2)[1]' end;
  owner_filter := case p_entity when 'profiles' then 'id=$1' when 'course_settings' then 'user_id=$1'
    when 'languages' then 'id in (select source_language_id from public.courses where owner_id=$1 union select target_language_id from public.courses where owner_id=$1)'
    else 'owner_id=$1' end;
  execute format('select jsonb_build_object(''body'',''[''||coalesce(string_agg(body,'','' order by k),'''')||'']'',
    ''last'',(array_agg(to_jsonb(k) order by k desc))[1],''rows'',count(*)) from
    (select %s k,to_jsonb(t)::text body from public.%I t where %s and ($2 is null or %s)
     order by %s limit $3) p',keys,p_entity,owner_filter,cursor_filter,order_by)
    into result using uid,p_after,p_rows;
  return result;
end; $$;
revoke all on function private.account_archive_page(text,uuid[],integer) from public,anon,authenticated;
grant execute on function private.account_archive_page(text,uuid[],integer) to authenticated;

create function private.account_archive_manifest()
returns jsonb language plpgsql stable security invoker set search_path='' set timezone='UTC' as $$
declare
  entity text; cursor_key uuid[]; page jsonb; pages jsonb[] := '{}'; batch integer; bytes integer;
  row_count integer := 0; total_bytes bigint := 0; uid uuid := auth.uid();
begin
  foreach entity in array array['profiles','languages','courses','course_settings','decks','concepts','deck_concepts',
    'practice_items','tags','concept_tags','learning_states','review_logs','study_sessions','import_jobs','import_job_errors'] loop
    cursor_key := null;
    batch := case entity when 'courses' then 1 when 'decks' then 16 else 256 end;
    loop
      page := private.account_archive_page(entity,cursor_key,batch);
      exit when (page->>'rows')::int=0;
      bytes := octet_length(page->>'body');
      if bytes>524288 and batch>1 then batch:=greatest(1,batch/2); continue; end if;
      total_bytes:=total_bytes+bytes; row_count:=row_count+(page->>'rows')::int;
      if bytes>8388608 or total_bytes>67108864 or row_count>200000 or cardinality(pages)>=4096 then
        return jsonb_build_object('error','too-large');
      end if;
      pages := array_append(pages,jsonb_build_object('entity',entity,'after',cursor_key,'rows',page->'rows',
        'bytes',bytes,'sha256',encode(sha256(convert_to(page->>'body','UTF8')),'hex')));
      select array_agg(v::uuid order by ord) into cursor_key from jsonb_array_elements_text(page->'last') with ordinality x(v,ord);
      exit when (page->>'rows')::int<batch;
    end loop;
  end loop;
  return jsonb_build_object('format','lexora-account-archive/1','owner',uid,'exportedAtUtc',
    to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'pages',to_jsonb(pages));
end; $$;
revoke all on function private.account_archive_manifest() from public,anon,authenticated;

-- The start wrapper owns the cooldown; the STABLE manifest helper reads all pages
-- against the same statement snapshot. Later page reads must match its SHA-256.
grant execute on function private.account_archive_manifest() to authenticated;
create function private.start_account_archive()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
  insert into public.account_export_requests(owner_id) values(uid)
    on conflict(owner_id) do update set requested_at=excluded.requested_at;
  return private.account_archive_manifest();
end; $$;
revoke all on function private.start_account_archive() from public,anon,authenticated;
grant execute on function private.start_account_archive() to authenticated;
create function public.start_account_archive() returns jsonb language sql security invoker set search_path='' as $$
  select private.start_account_archive();
$$;
revoke all on function public.start_account_archive() from public,anon,authenticated;
grant execute on function public.start_account_archive() to authenticated;

create function public.read_account_archive_page(p_entity text,p_after uuid[],p_rows integer,p_offset integer)
returns text language plpgsql stable security invoker set search_path='' as $$
declare page jsonb;
begin
  if p_offset is null or p_offset not between 0 and 8388607 or cardinality(p_after)>2 then
    raise exception 'invalid archive offset' using errcode='22023';
  end if;
  if not exists(select 1 from public.account_export_requests where owner_id=auth.uid()
      and requested_at>=statement_timestamp()-interval '1 hour') then
    raise exception 'archive expired' using errcode='PT409';
  end if;
  page:=private.account_archive_page(p_entity,nullif(p_after,'{}'::uuid[]),p_rows);
  return encode(substring(convert_to(page->>'body','UTF8') from p_offset+1 for 262144),'base64');
end; $$;
revoke all on function public.read_account_archive_page(text,uuid[],integer,integer) from public,anon,authenticated;
grant execute on function public.read_account_archive_page(text,uuid[],integer,integer) to authenticated;
