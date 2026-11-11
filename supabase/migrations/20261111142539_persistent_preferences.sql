-- Additive account theme and atomic, owner-only preference updates.
alter table public.profiles add column theme_preference text not null default 'system'
  constraint profiles_theme_preference_check check (theme_preference in ('light', 'dark', 'system'));

create function public.save_preferences(
  p_course_id uuid, p_profile_version timestamptz, p_settings_version timestamptz,
  p_ui_locale public.ui_locale, p_theme text, p_timezone text,
  p_daily_new_limit integer, p_maximum_reviews integer default null, p_show_intervals boolean default true
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_settings public.course_settings%rowtype;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_ui_locale is null or p_theme is null or p_theme not in ('light', 'dark', 'system')
    or p_timezone is null or char_length(p_timezone) > 100
    or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
    or p_daily_new_limit is null or p_daily_new_limit not between 0 and 100
    or (p_maximum_reviews is not null and p_maximum_reviews not between 0 and 2000)
    or p_show_intervals is null then
    raise exception 'invalid preferences' using errcode = '22023';
  end if;
  -- Same lock order in both operations. Versions retain database microseconds.
  select * into v_profile from public.profiles where id = v_uid for update;
  if not found then raise exception 'profile unavailable' using errcode = 'P0002'; end if;
  if p_profile_version is null or v_profile.updated_at <> p_profile_version then
    raise exception 'preferences changed' using errcode = 'PT409';
  end if;
  perform 1 from public.courses where id = p_course_id and owner_id = v_uid and active;
  if not found then raise exception 'course unavailable' using errcode = 'P0002'; end if;
  select * into v_settings from public.course_settings
    where course_id = p_course_id and user_id = v_uid for update;
  if not found then raise exception 'settings unavailable' using errcode = 'P0002'; end if;
  if p_settings_version is null or v_settings.updated_at <> p_settings_version then
    raise exception 'preferences changed' using errcode = 'PT409';
  end if;
  update public.profiles set ui_locale = p_ui_locale, theme_preference = p_theme, timezone = p_timezone
    where id = v_uid;
  update public.course_settings set daily_new_limit = p_daily_new_limit,
    maximum_reviews_per_day = p_maximum_reviews, show_interval_preview = p_show_intervals
    where course_id = p_course_id and user_id = v_uid;
end;
$$;

create function public.set_active_course(p_course_id uuid, p_profile_version timestamptz)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_version timestamptz;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select updated_at into v_version from public.profiles where id = v_uid for update;
  if not found then raise exception 'profile unavailable' using errcode = 'P0002'; end if;
  if p_profile_version is null or v_version <> p_profile_version then
    raise exception 'preferences changed' using errcode = 'PT409';
  end if;
  perform 1 from public.courses c join public.course_settings s on s.course_id = c.id
    where c.id = p_course_id and c.owner_id = v_uid and s.user_id = v_uid and c.active;
  if not found then raise exception 'course unavailable' using errcode = 'P0002'; end if;
  update public.profiles set active_course_id = p_course_id where id = v_uid;
end;
$$;

revoke execute on function public.save_preferences(uuid,timestamptz,timestamptz,public.ui_locale,text,text,integer,integer,boolean) from public, anon;
grant execute on function public.save_preferences(uuid,timestamptz,timestamptz,public.ui_locale,text,text,integer,integer,boolean) to authenticated;
revoke execute on function public.set_active_course(uuid,timestamptz) from public, anon;
grant execute on function public.set_active_course(uuid,timestamptz) to authenticated;
