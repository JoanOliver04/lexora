set local lock_timeout = '5s';

-- The name belongs to the owner's course. Catalogue entries stay read-only.
-- 'und' is the BCP 47 tag for a language with no assigned tag here.
alter table public.courses
  add column target_language_name text,
  alter column target_language_id drop not null,
  add constraint courses_target_language_choice check (
    (target_locale <> 'und' and target_language_id is not null and target_language_name is null)
    or
    (target_locale = 'und' and target_language_id is null and target_language_name is not null
      and target_language_name = btrim(target_language_name)
      and char_length(target_language_name) between 1 and 80
      and target_language_name ~ '[[:alpha:]]'
      and target_language_name !~ '[[:cntrl:]]')
  );

create function public.create_study_course(
  p_title text, p_target_locale text, p_profile_version timestamptz,
  p_target_language_name text default null
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_source uuid;
  v_target uuid;
  v_name text := btrim(p_target_language_name);
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
  if p_target_locale = 'und' and v_name is not null then
    if char_length(v_name) not between 1 and 80 or v_name !~ '[[:alpha:]]' or v_name ~ '[[:cntrl:]]' then
      raise exception 'invalid target language name' using errcode = '22023';
    end if;
  else
    select id into v_target from public.languages
      where locale = p_target_locale and code not in ('es', 'und') and active;
    if v_target is null or v_name is not null then
      raise exception 'invalid target language' using errcode = '22023';
    end if;
  end if;

  insert into public.courses (owner_id, title, source_language_id, target_language_id, target_locale, target_language_name)
    values (v_uid, btrim(p_title), v_source, v_target, p_target_locale, v_name) returning id into v_id;
  insert into public.course_settings (course_id, user_id) values (v_id, v_uid);
  update public.profiles set active_course_id = v_id where id = v_uid;
  return v_id;
end;
$$;

revoke execute on function public.create_study_course(text,text,timestamptz,text) from public, anon;
grant execute on function public.create_study_course(text,text,timestamptz,text) to authenticated;

-- Keep the old entry point usable during deployment and for existing clients.
create or replace function public.create_language_course(
  p_title text, p_target_locale text, p_profile_version timestamptz
)
returns uuid language sql security invoker set search_path = '' as $$
  select public.create_study_course(p_title, p_target_locale, p_profile_version);
$$;
