-- LEX-16.1: additive expansion, compatible with existing A1-B2 rows.
-- The new value is used only after this migration's transaction commits.
set lock_timeout = '5s';
alter type public.cefr_level add value if not exists 'C1';
reset lock_timeout;
