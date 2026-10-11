-- Production reference data, not local/demo seed data.
-- Onboarding resolves languages by (code, locale), never by these UUIDs.
-- Reuse the local catalogue IDs when inserting missing rows, while preserving
-- existing IDs, translations, activation flags and timestamps on natural-key
-- conflicts. An unrelated primary-key collision fails instead of overwriting.
-- No users, courses, study content, schema changes or policy changes.
-- Once referenced by courses, retain these rows; do not roll back by deletion.

insert into public.languages (id, code, locale, name_key, active) values
  ('5eeda001-0000-4000-8000-000000000001', 'es', 'es',    'language.es',    true),
  ('5eeda001-0000-4000-8000-000000000002', 'en', 'en',    'language.en',    true),
  ('5eeda001-0000-4000-8000-000000000003', 'en', 'en-GB', 'language.en_gb', true)
on conflict (code, locale) do nothing;
