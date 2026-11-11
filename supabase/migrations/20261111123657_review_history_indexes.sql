-- Additive indexes only. Existing append-only RLS and ownership constraints stay in force.
create index review_logs_owner_reviewed_id_idx
  on public.review_logs (owner_id, reviewed_at desc, id desc);
create index review_logs_owner_item_reviewed_id_idx
  on public.review_logs (owner_id, practice_item_id, reviewed_at desc, id desc);
