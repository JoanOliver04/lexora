-- LEX-3.2 — Library schema.
--
-- Creates the six tables of the library module: `decks`, `concepts`,
-- `deck_concepts`, `practice_items`, `tags` and `concept_tags`. Structure only:
-- columns, keys, checks, enums, generated columns, timestamps and the
-- integrity constraints that make cross-user linking impossible.
--
-- Row Level Security is ENABLED on every table (same reason as LEX-2.1: on this
-- project `anon` / `authenticated` / `service_role` get full DML on new
-- `public` tables by default, so a table without RLS is world-writable). The
-- explicit per-operation policies, the owner/non-owner isolation tests and the
-- query indexes (owner, course, search, `canonical_key`, `normalized_name`
-- uniqueness) are LEX-3.3. The indexes created here exist only to back foreign
-- keys whose parent side is not already covered by a primary key, so a cascade
-- delete does not sequential-scan the child.
--
-- Mirrors the LEX-2.1 pattern: `owner_id` is denormalised on every table and a
-- composite foreign key `(x_id, owner_id) -> parent (id, owner_id)` makes
-- ownership structural, exactly as `course_settings (course_id, user_id) ->
-- courses (id, owner_id)` does. A row that links content across two users
-- cannot be inserted at all. No standalone `owner_id -> profiles` foreign key,
-- for the same reason `course_settings` has none: the composite already forces
-- `owner_id` to a real profile transitively, and the profile-delete cascade
-- reaches these rows through `courses`.
--
-- Q-005 (open): §9.5 lists "profesional" under both level and category; §13.6
-- names the column `cefr_level` (MCER bands only). This migration ships the
-- recommendation registered in docs/OPEN_QUESTIONS.md — `professional` is a
-- `deck_category` value and `decks.cefr_level` reuses `public.cefr_level`
-- (A1–B2, nullable). If the owner decides otherwise, `deck_category` and this
-- migration change.

-- ---------------------------------------------------------------------------
-- Enums for closed value sets. Reflect src/modules/library/domain/taxonomy.ts,
-- which is the source in the domain (LEX-3.1). `cefr_level` already exists
-- (LEX-2.1) and is reused, not redefined.
-- ---------------------------------------------------------------------------

create type public.deck_category as enum (
  'vocabulary',
  'grammar',
  'communicative_function',
  'pronunciation',
  'professional',
  'mixed'
);

create type public.concept_kind as enum (
  'vocabulary',
  'collocation',
  'phrase',
  'grammar',
  'communicative_function',
  'pronunciation',
  'other'
);

-- All seven modes of §13.9 are reserved in the type. Only `basic_recognition`,
-- `basic_recall` and `cloze` can be activated in V1; that gate lives in
-- `validatePracticeItemDraft` (LEX-3.1), not in a CHECK here — a CHECK would
-- have to be dropped in FASE 6 when the other modes ship.
create type public.practice_mode as enum (
  'basic_recognition',
  'basic_recall',
  'cloze',
  'listening_dictation',
  'guided_production',
  'free_production',
  'pronunciation'
);

-- ---------------------------------------------------------------------------
-- decks — organisational grouping of concepts inside one course.
--
-- Does not own progress: it only selects what to study. The composite FK ties
-- every deck to the owner of its course. `decks (id, owner_id)` is unique so
-- `deck_concepts` can point a composite FK at it.
-- ---------------------------------------------------------------------------

create table public.decks (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null,
  owner_id     uuid not null,
  title        text not null,
  description  text,
  cefr_level   public.cefr_level,
  category     public.deck_category,
  position     integer not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint decks_course_owner_fk
    foreign key (course_id, owner_id)
    references public.courses (id, owner_id)
    on delete cascade,
  constraint decks_id_owner_unique unique (id, owner_id),
  -- Length limits are >= the domain limits in taxonomy.ts (TITLE 200,
  -- SHORT 500); the database is the last guard, the domain message comes first.
  constraint decks_title_length
    check (char_length(btrim(title)) between 1 and 200),
  constraint decks_description_length
    check (description is null or char_length(description) <= 500),
  constraint decks_position_non_negative
    check (position >= 0)
);

comment on table public.decks is
  'Organisational grouping of concepts in one course. Owner-only RLS policies and query indexes in LEX-3.3.';

-- Backs decks_course_owner_fk for the courses-delete cascade (course_id is not
-- a primary key here, unlike course_settings).
create index decks_course_id_idx on public.decks (course_id);

create trigger decks_set_updated_at
  before update on public.decks
  for each row execute function public.set_updated_at();

alter table public.decks enable row level security;

-- ---------------------------------------------------------------------------
-- concepts — the unit of knowledge. May belong to several decks without
-- duplicating progress.
--
-- `canonical_key` is a GENERATED column: it cannot drift from `title`. The
-- expression matches `canonicalKey` in library/domain/concept.ts
-- (normalizeWhitespace + lowercase): collapse every whitespace run to one
-- space, trim, lowercase. It is used to SUGGEST duplicates (§13.7), never to
-- merge them, so there is no unique constraint on it. Changing the expression
-- later needs a migration.
-- ---------------------------------------------------------------------------

create table public.concepts (
  id                uuid primary key default gen_random_uuid(),
  course_id         uuid not null,
  owner_id          uuid not null,
  kind              public.concept_kind not null,
  title             text not null,
  canonical_key     text generated always as
                      (lower(btrim(regexp_replace(title, '\s+', ' ', 'g')))) stored,
  summary           text not null,
  explanation       text,
  example           text,
  cefr_level        public.cefr_level,
  source_reference  text,
  -- JSONB is allowed here per §13.7: a small, validated extension bag. Kept an
  -- object so it can never be a scalar or JSON null.
  metadata          jsonb not null default '{}'::jsonb,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint concepts_course_owner_fk
    foreign key (course_id, owner_id)
    references public.courses (id, owner_id)
    on delete cascade,
  constraint concepts_id_owner_unique unique (id, owner_id),
  constraint concepts_title_length
    check (char_length(btrim(title)) between 1 and 200),
  constraint concepts_summary_length
    check (char_length(btrim(summary)) between 1 and 500),
  constraint concepts_explanation_length
    check (explanation is null or char_length(explanation) <= 4000),
  constraint concepts_example_length
    check (example is null or char_length(example) <= 500),
  constraint concepts_source_reference_length
    check (source_reference is null or char_length(source_reference) <= 500),
  constraint concepts_metadata_is_object
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.concepts is
  'Unit of knowledge in one course. canonical_key is generated from title and only suggests duplicates. RLS and search indexes in LEX-3.3.';

create index concepts_course_id_idx on public.concepts (course_id);

create trigger concepts_set_updated_at
  before update on public.concepts
  for each row execute function public.set_updated_at();

alter table public.concepts enable row level security;

-- ---------------------------------------------------------------------------
-- deck_concepts — many-to-many between decks and concepts.
--
-- `owner_id` is denormalised and BOTH composite FKs use it, so a deck and a
-- concept can only be linked when they belong to the same user. The pair is
-- the primary key: a concept appears in a deck at most once. Same-course (not
-- just same-owner) is a data-hygiene rule left to LEX-3.3.
-- ---------------------------------------------------------------------------

create table public.deck_concepts (
  deck_id     uuid not null,
  concept_id  uuid not null,
  owner_id    uuid not null,
  position    integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  primary key (deck_id, concept_id),
  constraint deck_concepts_deck_owner_fk
    foreign key (deck_id, owner_id)
    references public.decks (id, owner_id)
    on delete cascade,
  constraint deck_concepts_concept_owner_fk
    foreign key (concept_id, owner_id)
    references public.concepts (id, owner_id)
    on delete cascade,
  constraint deck_concepts_position_non_negative
    check (position is null or position >= 0)
);

comment on table public.deck_concepts is
  'Links a concept to a deck (same owner enforced by the shared owner_id in both composite FKs). RLS in LEX-3.3.';

-- The PK (deck_id, concept_id) already backs the deck-side cascade; this backs
-- the concept-side one.
create index deck_concepts_concept_id_idx on public.deck_concepts (concept_id);

create trigger deck_concepts_set_updated_at
  before update on public.deck_concepts
  for each row execute function public.set_updated_at();

alter table public.deck_concepts enable row level security;

-- ---------------------------------------------------------------------------
-- practice_items — a programmable competence over one concept.
--
-- Each item gets its own FSRS state (FASE 5): recognition and production are
-- different skills. `config` is JSONB discriminated by `mode` (§13.9): the
-- CHECK forces `config->>'mode'` to equal `mode`, and rejects `{}` because a
-- missing key makes `config ? 'mode'` false. No default on `config` — the
-- caller must supply `{"mode": ...}`; a default of `'{}'` would always fail
-- the CHECK.
-- ---------------------------------------------------------------------------

create table public.practice_items (
  id           uuid primary key default gen_random_uuid(),
  concept_id   uuid not null,
  owner_id     uuid not null,
  mode         public.practice_mode not null,
  prompt_text  text not null,
  answer_text  text not null,
  hint_text    text,
  config       jsonb not null,
  enabled      boolean not null default true,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint practice_items_concept_owner_fk
    foreign key (concept_id, owner_id)
    references public.concepts (id, owner_id)
    on delete cascade,
  constraint practice_items_prompt_text_length
    check (char_length(btrim(prompt_text)) between 1 and 4000),
  constraint practice_items_answer_text_length
    check (char_length(btrim(answer_text)) between 1 and 500),
  constraint practice_items_hint_text_length
    check (hint_text is null or char_length(hint_text) <= 500),
  constraint practice_items_config_is_object
    check (jsonb_typeof(config) = 'object'),
  constraint practice_items_config_mode_matches
    check (config ? 'mode' and (config ->> 'mode') = mode::text)
);

comment on table public.practice_items is
  'A programmable competence over one concept. config is JSONB discriminated by mode. RLS in LEX-3.3.';

create index practice_items_concept_id_idx on public.practice_items (concept_id);

create trigger practice_items_set_updated_at
  before update on public.practice_items
  for each row execute function public.set_updated_at();

alter table public.practice_items enable row level security;

-- ---------------------------------------------------------------------------
-- tags — the user's own tags inside one course.
--
-- Stores a display name and a normalised name. The `::` hierarchy from an Anki
-- import is kept verbatim (§13.10), not turned into a tree. An empty segment
-- (`a::`, `::b`, `a::::b`, `::`) is rejected. The per-course uniqueness of
-- `normalized_name` (no equivalent duplicates) is LEX-3.3.
-- ---------------------------------------------------------------------------

create table public.tags (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null,
  owner_id         uuid not null,
  normalized_name  text not null,
  display_name     text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint tags_course_owner_fk
    foreign key (course_id, owner_id)
    references public.courses (id, owner_id)
    on delete cascade,
  constraint tags_id_owner_unique unique (id, owner_id),
  constraint tags_normalized_name_length
    check (char_length(normalized_name) between 1 and 200),
  constraint tags_display_name_length
    check (char_length(btrim(display_name)) between 1 and 200),
  -- No empty segment: '::' at either end or doubled. Matches
  -- validateTagDraft's tag.name.emptySegment (LEX-3.1).
  constraint tags_no_empty_segment
    check (normalized_name !~ '(^|::)(::|$)')
);

comment on table public.tags is
  'A user tag inside one course. normalized_name uniqueness per course is LEX-3.3.';

create index tags_course_id_idx on public.tags (course_id);

create trigger tags_set_updated_at
  before update on public.tags
  for each row execute function public.set_updated_at();

alter table public.tags enable row level security;

-- ---------------------------------------------------------------------------
-- concept_tags — many-to-many between concepts and tags.
--
-- Same shared-owner_id pattern as deck_concepts. No mutable payload, so no
-- `updated_at` and no trigger.
-- ---------------------------------------------------------------------------

create table public.concept_tags (
  concept_id  uuid not null,
  tag_id      uuid not null,
  owner_id    uuid not null,
  created_at  timestamptz not null default now(),

  primary key (concept_id, tag_id),
  constraint concept_tags_concept_owner_fk
    foreign key (concept_id, owner_id)
    references public.concepts (id, owner_id)
    on delete cascade,
  constraint concept_tags_tag_owner_fk
    foreign key (tag_id, owner_id)
    references public.tags (id, owner_id)
    on delete cascade
);

comment on table public.concept_tags is
  'Links a tag to a concept (same owner enforced by the shared owner_id in both composite FKs). RLS in LEX-3.3.';

-- The PK (concept_id, tag_id) backs the concept-side cascade; this backs the
-- tag-side one.
create index concept_tags_tag_id_idx on public.concept_tags (tag_id);

alter table public.concept_tags enable row level security;
