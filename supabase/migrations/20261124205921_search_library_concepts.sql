create function public.search_library_concepts(
  p_course_id uuid,
  p_search text,
  p_include_archived boolean default false
)
returns setof public.concepts
language sql stable security invoker set search_path = '' as $$
  with input as (
    select (select auth.uid()) as owner_id, lower(btrim(p_search)) as term
  )
  select c.*
  from public.concepts c cross join input
  where c.owner_id = input.owner_id
    and c.course_id = p_course_id
    and (p_include_archived or c.archived_at is null)
    and char_length(input.term) between 1 and 200
    and (
      strpos(lower(c.title), input.term) > 0
      or exists (
        select 1 from public.practice_items i
        where i.concept_id = c.id and i.owner_id = c.owner_id
          and (p_include_archived or i.archived_at is null)
          and (strpos(lower(i.prompt_text), input.term) > 0 or strpos(lower(i.answer_text), input.term) > 0)
      )
      or exists (
        select 1 from public.concept_tags ct
        join public.tags t on t.id = ct.tag_id and t.owner_id = ct.owner_id
        where ct.concept_id = c.id and ct.owner_id = c.owner_id and t.course_id = c.course_id
          and strpos(lower(t.display_name), input.term) > 0
      )
    );
$$;

revoke all on function public.search_library_concepts(uuid, text, boolean) from public, anon;
grant execute on function public.search_library_concepts(uuid, text, boolean) to authenticated;
