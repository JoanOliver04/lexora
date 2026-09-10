-- LEX-4.5 — validation error codes on import_error_code.
--
-- LEX-4.3 created the enum with the four structural parser codes
-- (too_few_columns / too_many_columns / front_empty / back_empty). Field
-- length failures are new domain codes; they are added with ALTER TYPE …
-- ADD VALUE so existing rows keep their values. PostgreSQL 12+ allows ADD
-- VALUE inside a transaction (this project: 17).
--
-- IF NOT EXISTS keeps the migration re-runnable against a database that
-- already has the labels (db reset from empty does not need it, but a
-- partial apply should not fail).

alter type public.import_error_code add value if not exists 'front_too_long';
alter type public.import_error_code add value if not exists 'back_too_long';
alter type public.import_error_code add value if not exists 'tags_too_long';
