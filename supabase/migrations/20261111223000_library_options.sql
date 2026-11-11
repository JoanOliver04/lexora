-- Bounded library options; aggregates never cross PostgREST's row limit.
create function public.read_library_concept_options(
  p_owner_id uuid, p_course_id uuid, p_concept_id uuid,
  p_tag_offset integer default 0, p_item_offset integer default 0
) returns jsonb language sql stable security invoker set search_path = '' as $$
  with owned as (
    select id, owner_id from public.concepts
    where id=p_concept_id and course_id=p_course_id and owner_id=(select auth.uid()) and owner_id=p_owner_id
  ), tags as materialized (
    select t.id,t.display_name from owned c
    join public.concept_tags ct on ct.concept_id=c.id and ct.owner_id=c.owner_id
    join public.tags t on t.id=ct.tag_id and t.owner_id=c.owner_id
  ), items as materialized (
    select i.id,i.mode,i.prompt_text,i.answer_text,i.archived_at,i.created_at
    from owned c join public.practice_items i on i.concept_id=c.id and i.owner_id=c.owner_id
  ), totals as (
    select (select count(*)::integer from tags) as tag_total,(select count(*)::integer from items) as item_total
  ), bounds as (
    select *,least(greatest(coalesce(p_tag_offset,0),0)/20*20,greatest((tag_total-1)/20,0)*20) as tag_offset,
      least(greatest(coalesce(p_item_offset,0),0)/20*20,greatest((item_total-1)/20,0)*20) as item_offset from totals
  ) select jsonb_build_object(
    'tags',jsonb_build_object('total',b.tag_total,'offset',b.tag_offset,'items',coalesce((
      select jsonb_agg(jsonb_build_object('id',id,'displayName',display_name) order by display_name,id)
      from(select * from tags order by display_name,id limit 20 offset b.tag_offset) page),'[]'::jsonb)),
    'items',jsonb_build_object('total',b.item_total,'offset',b.item_offset,'items',coalesce((
      select jsonb_agg(jsonb_build_object('id',id,'mode',mode,'promptText',prompt_text,'answerText',answer_text,'archivedAt',archived_at) order by created_at,id)
      from(select * from items order by created_at,id limit 20 offset b.item_offset) page),'[]'::jsonb))
  ) from owned cross join bounds b;
$$;
revoke all on function public.read_library_concept_options(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.read_library_concept_options(uuid,uuid,uuid,integer,integer) to authenticated;

create function public.read_library_tag_previews(p_owner_id uuid,p_concept_ids uuid[])
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_result jsonb;
begin
  if v_uid is null or p_owner_id is distinct from v_uid then return '[]'::jsonb; end if;
  if p_concept_ids is null or cardinality(p_concept_ids)>20 then raise exception 'invalid selection' using errcode='22023'; end if;
  with ranked as (
    select ct.concept_id,t.id,t.display_name,
      row_number() over(partition by ct.concept_id order by t.display_name,t.id) as position,
      count(*) over(partition by ct.concept_id)::integer as total
    from public.concept_tags ct join public.tags t on t.id=ct.tag_id and t.owner_id=v_uid
    join public.concepts c on c.id=ct.concept_id and c.owner_id=v_uid
    where ct.owner_id=v_uid and ct.concept_id=any(p_concept_ids)
  ), previews as (
    select concept_id,max(total) as total,jsonb_agg(jsonb_build_object('id',id,'displayName',display_name) order by position) as items
    from ranked where position<=3 group by concept_id
  ) select coalesce(jsonb_agg(jsonb_build_object('conceptId',concept_id,'total',total,'items',items)),'[]'::jsonb) into v_result from previews;
  return v_result;
end;
$$;
revoke all on function public.read_library_tag_previews(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.read_library_tag_previews(uuid,uuid[]) to authenticated;

create function public.read_library_deck_options(
  p_owner_id uuid,p_course_id uuid,p_search text default '',p_offset integer default 0,p_selected_id uuid default null
) returns jsonb language sql stable security invoker set search_path = '' as $$
  with owned as materialized (
    select id,title,position,created_at from public.decks
    where owner_id=(select auth.uid()) and owner_id=p_owner_id and course_id=p_course_id and archived_at is null
  ), filtered as materialized (
    select * from owned where coalesce(p_search,'')='' or title ilike '%'||left(btrim(p_search),200)||'%'
  ), totals as (select count(*)::integer as total from filtered), bounds as (
    select total,least(greatest(coalesce(p_offset,0),0)/20*20,greatest((total-1)/20,0)*20) as offset from totals
  ) select jsonb_build_object('total',b.total,'offset',b.offset,'items',coalesce((
    select jsonb_agg(jsonb_build_object('id',id,'title',title) order by position,created_at,id)
    from(select * from filtered order by position,created_at,id limit 20 offset b.offset) page),'[]'::jsonb),
    'selected',(select jsonb_build_object('id',id,'title',title) from owned where id=p_selected_id)) from bounds b;
$$;
revoke all on function public.read_library_deck_options(uuid,uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.read_library_deck_options(uuid,uuid,text,integer,uuid) to authenticated;
