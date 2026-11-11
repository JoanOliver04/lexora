-- Bounded read models: aggregates stay inside PostgreSQL, not PostgREST's row cap.
create function public.count_library_deck_concepts(p_owner_id uuid, p_deck_ids uuid[])
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_owner_id is distinct from v_uid then return '{}'::jsonb; end if;
  if p_deck_ids is null or cardinality(p_deck_ids) > 100 then
    raise exception 'invalid deck selection' using errcode = '22023';
  end if;
  select coalesce(jsonb_object_agg(id, total),'{}'::jsonb) into v_result from (
    select d.id, count(c.id)::integer as total from public.decks d
    left join public.deck_concepts dc on dc.deck_id = d.id and dc.owner_id = v_uid
    left join public.concepts c on c.id = dc.concept_id and c.owner_id = v_uid and c.archived_at is null
    where d.owner_id = v_uid and d.id = any(p_deck_ids)
    group by d.id
  ) counts;
  return v_result;
end;
$$;
revoke all on function public.count_library_deck_concepts(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.count_library_deck_concepts(uuid,uuid[]) to authenticated;

create function public.read_library_deck_detail(
  p_owner_id uuid, p_course_id uuid, p_deck_id uuid,
  p_member_search text default '', p_available_search text default '',
  p_member_offset integer default 0, p_available_offset integer default 0,
  p_limit integer default 20
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with parameters as (
    select (select auth.uid()) as uid, greatest(1,least(coalesce(p_limit,20),100)) as page_size,
      left(btrim(coalesce(p_member_search,'')),200) as member_search,
      left(btrim(coalesce(p_available_search,'')),200) as available_search
  ), owned_deck as materialized (
    select d.* from public.decks d, parameters p
    where d.id = p_deck_id and d.course_id = p_course_id and d.owner_id = p.uid and p_owner_id = p.uid
  ), linked as materialized (
    select c.id, c.title, dc.position, dc.created_at
    from owned_deck d join public.deck_concepts dc on dc.deck_id = d.id and dc.owner_id = d.owner_id
    join public.concepts c on c.id = dc.concept_id and c.owner_id = d.owner_id and c.archived_at is null
  ), filtered_members as materialized (
    select l.* from linked l, parameters p
    where p.member_search = '' or l.title ilike '%' || p.member_search || '%'
  ), available as materialized (
    select c.id, c.title from owned_deck d join public.concepts c
      on c.course_id = d.course_id and c.owner_id = d.owner_id and c.archived_at is null
    cross join parameters p
    where not exists(select 1 from public.deck_concepts dc
      where dc.deck_id = d.id and dc.concept_id = c.id and dc.owner_id = d.owner_id)
      and (p.available_search = '' or c.title ilike '%' || p.available_search || '%')
  ), totals as (
    select (select count(*)::integer from linked) as member_count,
      (select count(*)::integer from filtered_members) as member_total,
      (select count(*)::integer from available) as available_total
  ), offsets as (
    select t.*,p.page_size,
      least(greatest(coalesce(p_member_offset,0),0),greatest((t.member_total-1)/p.page_size,0)*p.page_size) as member_offset,
      least(greatest(coalesce(p_available_offset,0),0),greatest((t.available_total-1)/p.page_size,0)*p.page_size) as available_offset
    from totals t, parameters p
  ) select jsonb_build_object(
    'deck',jsonb_build_object('id',d.id,'courseId',d.course_id,'ownerId',d.owner_id,
      'title',d.title,'description',d.description,'cefrLevel',d.cefr_level,'category',d.category,
      'position',d.position,'archivedAt',d.archived_at,'createdAt',d.created_at,'updatedAt',d.updated_at),
    'memberCount',o.member_count,'pageSize',o.page_size,
    'members',jsonb_build_object('total',o.member_total,'offset',o.member_offset,'items',
      coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title) order by position nulls last,created_at,id)
        from (select * from filtered_members order by position nulls last,created_at,id
          limit o.page_size offset o.member_offset) page),'[]'::jsonb)),
    'available',jsonb_build_object('total',o.available_total,'offset',o.available_offset,'items',
      coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title) order by title,id)
        from (select * from available order by title,id
          limit o.page_size offset o.available_offset) page),'[]'::jsonb))
  ) from owned_deck d cross join offsets o;
$$;
revoke all on function public.read_library_deck_detail(uuid,uuid,uuid,text,text,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.read_library_deck_detail(uuid,uuid,uuid,text,text,integer,integer,integer) to authenticated;

-- Lookup, create and attach are one transaction, including a unique-name race.
create function public.attach_library_tag(
  p_owner_id uuid, p_course_id uuid, p_concept_id uuid,
  p_display_name text, p_normalized_name text
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_tag_id uuid;
begin
  if v_uid is null or p_owner_id is distinct from v_uid then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_display_name,''))) not between 1 and 200 or
     char_length(btrim(coalesce(p_normalized_name,''))) not between 1 and 200 or
     p_normalized_name ~ '(^|::)(::|$)' then
    raise exception 'invalid tag' using errcode = '22023';
  end if;
  perform 1 from public.concepts where id=p_concept_id and owner_id=v_uid and course_id=p_course_id;
  if not found then raise exception 'concept unavailable' using errcode = '23503'; end if;
  insert into public.tags(course_id,owner_id,display_name,normalized_name)
    values(p_course_id,v_uid,p_display_name,p_normalized_name)
    on conflict(course_id,normalized_name) do nothing;
  select id into v_tag_id from public.tags where course_id=p_course_id and owner_id=v_uid and normalized_name=p_normalized_name;
  if v_tag_id is null then raise exception 'tag unavailable' using errcode = '23503'; end if;
  insert into public.concept_tags(concept_id,tag_id,owner_id)
    values(p_concept_id,v_tag_id,v_uid) on conflict(concept_id,tag_id) do nothing;
  return v_tag_id;
end;
$$;
revoke all on function public.attach_library_tag(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.attach_library_tag(uuid,uuid,uuid,text,text) to authenticated;
