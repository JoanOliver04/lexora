-- The course, its default settings and selection commit together. Existing
-- courses and everything already linked to them keep their original IDs.
set local lock_timeout = '5s';

insert into public.languages (id, code, locale, name_key, active) values
  ('5eeda001-0000-4000-8000-000000000004', 'fr', 'fr', 'language.fr', true),
  ('5eeda001-0000-4000-8000-000000000005', 'de', 'de', 'language.de', true),
  ('5eeda001-0000-4000-8000-000000000006', 'it', 'it', 'language.it', true)
on conflict (code, locale) do nothing;

create function public.create_language_course(
  p_title text, p_target_locale text, p_profile_version timestamptz
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_source uuid;
  v_target uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 120 then
    raise exception 'invalid course title' using errcode = '22023';
  end if;
  select * into v_profile from public.profiles where id = v_uid for update;
  if not found or v_profile.onboarding_completed_at is null then
    raise exception 'profile unavailable' using errcode = 'P0002';
  end if;
  if p_profile_version is distinct from v_profile.updated_at then
    raise exception 'profile changed' using errcode = 'PT409';
  end if;
  if (select count(*) from public.courses where owner_id = v_uid and active) >= 200 then
    raise exception 'course limit reached' using errcode = 'PT422';
  end if;

  select id into v_source from public.languages where code = 'es' and locale = 'es' and active;
  if v_source is null then raise exception 'source language unavailable' using errcode = 'P0002'; end if;
  select id into v_target from public.languages where locale = p_target_locale and code <> 'es' and active;
  if v_target is null then raise exception 'invalid target language' using errcode = '22023'; end if;

  insert into public.courses (owner_id, title, source_language_id, target_language_id, target_locale)
    values (v_uid, btrim(p_title), v_source, v_target, p_target_locale) returning id into v_id;
  insert into public.course_settings (course_id, user_id) values (v_id, v_uid);
  update public.profiles set active_course_id = v_id where id = v_uid;
  return v_id;
end;
$$;

revoke execute on function public.create_language_course(text,text,timestamptz) from public, anon;
grant execute on function public.create_language_course(text,text,timestamptz) to authenticated;

-- Ownership FKs already validate both endpoints. Reject a relationship between
-- two courses of the same owner before it can pollute a deck or session summary.
create function private.check_deck_concept_course()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists (
    select 1 from public.decks d, public.concepts c
    where d.id = new.deck_id and c.id = new.concept_id
      and d.owner_id = new.owner_id and c.owner_id = new.owner_id
      and d.course_id <> c.course_id
  ) then
    raise exception 'deck and concept must belong to the same course' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger deck_concepts_check_course
  before insert or update of deck_id, concept_id, owner_id on public.deck_concepts
  for each row execute function private.check_deck_concept_course();

create function private.check_review_session_course()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.study_session_id is not null and exists (
    select 1 from public.study_sessions s
    join public.practice_items i on i.id = new.practice_item_id and i.owner_id = new.owner_id
    join public.concepts c on c.id = i.concept_id and c.owner_id = i.owner_id
    where s.id = new.study_session_id and s.owner_id = new.owner_id and s.course_id <> c.course_id
  ) then
    raise exception 'review and session must belong to the same course' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger review_logs_check_session_course
  before insert on public.review_logs
  for each row execute function private.check_review_session_course();

revoke execute on function private.check_deck_concept_course() from public, anon, authenticated;
revoke execute on function private.check_review_session_course() from public, anon, authenticated;
