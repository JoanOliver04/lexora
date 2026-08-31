-- LEX-2.7 — Onboarding: the idempotent "create my course" operation.
--
-- MASTER_SPEC §9.3 step 7 ("crear el curso y los mazos base vacíos"): the last
-- onboarding step provisions the study course and its settings. This migration
-- adds `public.complete_onboarding(...)`, a single SQL function that does the
-- whole write atomically:
--
--   1. resolves the reference language pair from the catalogue (es/es → en/en);
--   2. creates the caller's course, or updates it if one already exists;
--   3. upserts the matching `course_settings` row;
--   4. records `ui_locale` and `onboarding_completed_at` on the profile.
--
-- Why a function and not four round trips from the application: ADR-002 puts
-- "complex atomic operations in tested SQL/RPC functions". Four separate
-- PostgREST calls could half-apply if the request is dropped between them and
-- leave a course with no settings; here it is one transaction.
--
-- **SECURITY INVOKER** (the default — no `security definer` here). The function
-- runs as the caller, so every write still passes the LEX-2.3 policies:
-- `courses_insert_own` / `courses_update_own` (owner_id = auth.uid()),
-- `course_settings_insert_own` / `_update_own` (user_id = auth.uid()),
-- `profiles_update_own` (id = auth.uid()) and the `languages_select_all` read.
-- A caller cannot use it to touch another user's rows. This also means the
-- pgTAP coverage (060) must exercise it as `authenticated` with `auth.uid()`
-- pinned: run as `postgres` it would pass while being broken for real users
-- (BYPASSRLS), the same vacuous-green shape 040/050 already guard against.
--
-- `search_path` is pinned empty and every reference is schema-qualified, like
-- `set_updated_at` and `profiles_assert_iana_timezone`: the function cannot be
-- captured by a caller's search_path (roadmap gate §12.3).
--
-- Deferred on purpose: decks. `decks` does not exist until FASE 3, so step 7's
-- "mazos base vacíos" and the "importar material" branch are out of scope here;
-- this function delivers course + settings only. Screens are LEX-2.8.

create function public.complete_onboarding(
  p_ui_locale       public.ui_locale,
  p_declared_level  public.cefr_level,
  p_start_level     public.cefr_level,
  p_daily_new_limit integer
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_source_id uuid;
  v_target_id uuid;
  v_course_id uuid;
begin
  if v_uid is null then
    raise exception 'complete_onboarding requires an authenticated session'
      using errcode = '28000';
  end if;

  -- The "curso de referencia" (seed.sql, DATA_MODEL §6.3): support language is
  -- the es/es catalogue row, studied language the en/en row. Resolved by
  -- (code, locale) so the seed UUIDs never reach the application. A database
  -- seeded without the pair fails loudly here instead of inserting a course
  -- with a null language.
  select id into v_source_id
    from public.languages where code = 'es' and locale = 'es';
  select id into v_target_id
    from public.languages where code = 'en' and locale = 'en';

  if v_source_id is null or v_target_id is null then
    raise exception 'language catalogue is missing the reference pair (es/es, en/en)'
      using errcode = 'P0002';
  end if;

  -- Idempotency. `courses` has no unique constraint on `owner_id` on purpose
  -- (DATA_MODEL §6.3 keeps a second course pair possible for later phases), so
  -- the rule is stated here rather than delegated to an index: onboarding
  -- deterministically targets the caller's oldest course. A user who repeats
  -- onboarding updates that course; they never end up with two.
  select id into v_course_id
    from public.courses
    where owner_id = v_uid
    order by created_at asc, id asc
    limit 1;

  if v_course_id is null then
    -- `title` is the only user-visible string this function writes; pick it in
    -- the caller's interface language so an `en` user does not get a row
    -- labelled "Inglés". Only on insert: a repeat must not churn the title.
    insert into public.courses (
      owner_id, title,
      source_language_id, target_language_id, target_locale,
      declared_level, start_level
    )
    values (
      v_uid,
      case p_ui_locale when 'en' then 'English' else 'Inglés' end,
      v_source_id, v_target_id, 'en-GB',
      p_declared_level, p_start_level
    )
    returning id into v_course_id;
  else
    -- Postcondition: the caller has an *active* reference course. No
    -- deactivation path exists yet (FASE 3+), so `active = true` is latent
    -- today, but stamping it here keeps the guarantee honest.
    update public.courses
      set source_language_id = v_source_id,
          target_language_id = v_target_id,
          target_locale      = 'en-GB',
          declared_level     = p_declared_level,
          start_level        = p_start_level,
          active             = true
      where id = v_course_id;
  end if;

  -- One settings row per course. The composite FK (course_id, user_id) ->
  -- courses (id, owner_id) already forces user_id to equal the course owner.
  insert into public.course_settings (course_id, user_id, daily_new_limit)
  values (v_course_id, v_uid, p_daily_new_limit)
  on conflict (course_id) do update
    set daily_new_limit = excluded.daily_new_limit;

  -- Profile: interface language is a free choice at step 1; onboarding closes
  -- here. `onboarding_completed_at` is set once and not overwritten on a
  -- repeat — the first completion is the one that matters.
  update public.profiles
    set ui_locale = p_ui_locale,
        onboarding_completed_at = coalesce(public.profiles.onboarding_completed_at, now())
    where id = v_uid;

  return v_course_id;
end;
$$;

comment on function public.complete_onboarding(
  public.ui_locale, public.cefr_level, public.cefr_level, integer
) is
  'LEX-2.7. Idempotently provisions the caller''s course + course_settings and '
  'marks onboarding done. SECURITY INVOKER: every write passes the caller''s '
  'RLS policies. Range of p_daily_new_limit is enforced by '
  'course_settings_daily_new_limit_range (0..100).';

-- Least privilege (gate §12.3). A new function is EXECUTE-able by PUBLIC by
-- default, and Supabase additionally grants EXECUTE on every new `public`
-- function to `anon`, `authenticated` and `service_role` through default
-- privileges — so `revoke ... from public` alone would leave `anon` able to
-- call it. Revoke both, then grant only `authenticated`: onboarding needs a
-- session (`auth.uid()`), an anonymous caller has nothing to provision.
revoke execute on function public.complete_onboarding(
  public.ui_locale, public.cefr_level, public.cefr_level, integer
) from public, anon;

grant execute on function public.complete_onboarding(
  public.ui_locale, public.cefr_level, public.cefr_level, integer
) to authenticated;
