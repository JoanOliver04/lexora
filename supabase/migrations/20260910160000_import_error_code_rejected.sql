-- LEX-4.7 — persist-time rejection code on import_error_code.
--
-- Parser/validation codes already exist (LEX-4.2 / LEX-4.5). A row that
-- passes the file gates but fails library rules (concept title 200,
-- item answer 500, unexpected persist error) is `rejected`. ADD VALUE
-- inside a transaction is allowed on PostgreSQL 17.

alter type public.import_error_code add value if not exists 'rejected';
