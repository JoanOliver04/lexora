-- LEX-2.1 — Identity and course schema.
--
-- Creates the four tables that phase 2 builds on: `profiles`, `languages`,
-- `courses` and `course_settings`. This migration defines structure only:
-- columns, keys, checks, enums, timestamps and the timezone guard.
--
-- Row Level Security is ENABLED on every table here, which denies all access
-- to `anon` / `authenticated` until a policy grants it. The explicit per-
-- operation policies and the owner/non-owner isolation tests are LEX-2.3.
--
-- Why enabling RLS now already matters: on this project `anon`,
-- `authenticated` and `service_role` receive full DML on new `public` tables
-- by default (verified against the local stack), so RLS is the only barrier.
-- A table created without it would be world-readable and world-writable.

-- ---------------------------------------------------------------------------
-- Enums for closed value sets (DATA_MODEL.md: "enums for closed states").
-- ---------------------------------------------------------------------------

create type public.ui_locale as enum ('es', 'en');

create type public.cefr_level as enum ('A1', 'A2', 'B1', 'B2');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep `updated_at` honest.
--
-- Not SECURITY DEFINER. `search_path` is pinned empty and every reference is
-- schema-qualified so the function cannot be captured by a caller's path.
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one-to-one extension of auth.users.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  display_name             text,
  ui_locale                public.ui_locale not null default 'es',
  timezone                 text not null default 'Europe/Madrid',
  onboarding_completed_at  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint profiles_display_name_length
    check (display_name is null or char_length(btrim(display_name)) between 1 and 80)
);

comment on table public.profiles is
  'Per-user profile. id equals auth.users.id. RLS policies land in LEX-2.3.';

-- Timezone must be a real IANA name. `pg_timezone_names` is a set-returning
-- function over the OS tz database, not a table, so this cannot be a CHECK
-- (an IMMUTABLE wrapper would be lying — the tz database changes). A BEFORE
-- trigger is the honest place. Volume here is one row per user; the scan cost
-- is irrelevant.
create function public.profiles_assert_iana_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = new.timezone
  ) then
    raise exception 'invalid IANA timezone: %', new.timezone
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_assert_iana_timezone
  before insert or update of timezone on public.profiles
  for each row execute function public.profiles_assert_iana_timezone();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------------
-- languages — reference catalogue. Seed rows arrive in LEX-2.2.
--
-- `locale` is NOT NULL and carries the full tag: a base language stores
-- locale = code ('es'/'es'), a regional variant stores 'en'/'en-GB'. This
-- keeps (code, locale) a plain NOT NULL unique key and makes it structurally
-- hard to blur "language" and "regional variant" — the mistake DATA_MODEL.md
-- calls the fast path to a model that cannot take a second language pair.
-- ---------------------------------------------------------------------------

create table public.languages (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  locale      text not null,
  name_key    text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint languages_code_format   check (code ~ '^[a-z]{2,3}$'),
  constraint languages_locale_format check (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  constraint languages_locale_base_or_variant
    check (locale = code or locale like code || '-%'),
  constraint languages_name_key_present check (char_length(btrim(name_key)) > 0),
  constraint languages_code_locale_unique unique (code, locale)
);

comment on table public.languages is
  'Reference catalogue of languages and regional variants. Read-only policy in LEX-2.3.';

create trigger languages_set_updated_at
  before update on public.languages
  for each row execute function public.set_updated_at();

alter table public.languages enable row level security;

-- ---------------------------------------------------------------------------
-- courses — a source→target pair owned by one user.
-- ---------------------------------------------------------------------------

create table public.courses (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles (id) on delete cascade,
  title               text not null,
  source_language_id  uuid not null references public.languages (id),
  target_language_id  uuid not null references public.languages (id),
  target_locale       text not null default 'en-GB',
  declared_level      public.cefr_level,
  start_level         public.cefr_level,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint courses_title_length
    check (char_length(btrim(title)) between 1 and 120),
  constraint courses_target_locale_format
    check (target_locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  constraint courses_source_target_distinct
    check (source_language_id <> target_language_id),
  -- Referenced by the composite FK from course_settings below.
  constraint courses_id_owner_unique unique (id, owner_id)
);

comment on table public.courses is
  'A study course owned by one user. Owner-only RLS policies in LEX-2.3.';

create index courses_owner_id_idx on public.courses (owner_id);

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

alter table public.courses enable row level security;

-- ---------------------------------------------------------------------------
-- course_settings — one row per course.
--
-- `user_id` is denormalised (it always equals courses.owner_id) because it
-- makes the LEX-2.3 policies a single-column check. The composite FK
-- (course_id, user_id) -> courses (id, owner_id) makes that equality
-- structural: a settings row for someone other than the course owner cannot
-- be inserted at all.
-- ---------------------------------------------------------------------------

create table public.course_settings (
  course_id                 uuid primary key,
  user_id                   uuid not null,
  daily_new_limit           integer not null default 5,
  maximum_reviews_per_day   integer,
  requested_retention       numeric(3, 2),
  show_interval_preview     boolean not null default true,
  scheduler_config_version  integer not null default 1,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint course_settings_course_owner_fk
    foreign key (course_id, user_id)
    references public.courses (id, owner_id)
    on delete cascade,
  constraint course_settings_daily_new_limit_range
    check (daily_new_limit between 0 and 100),
  constraint course_settings_max_reviews_range
    check (maximum_reviews_per_day is null or maximum_reviews_per_day between 0 and 2000),
  constraint course_settings_requested_retention_range
    check (requested_retention is null or requested_retention between 0.70 and 0.97),
  constraint course_settings_scheduler_config_version_positive
    check (scheduler_config_version >= 1)
);

comment on table public.course_settings is
  'Per-course study preferences. FSRS parameter ranges are validated here. RLS policies in LEX-2.3.';

create trigger course_settings_set_updated_at
  before update on public.course_settings
  for each row execute function public.set_updated_at();

alter table public.course_settings enable row level security;
