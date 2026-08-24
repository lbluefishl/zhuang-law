-- Adds reply-threading and soft-delete to the existing comments table.
-- See schema.sql for the full reasoning (also duplicated here for anyone
-- reading just this file, since it explains a non-obvious RLS/cascade choice).
--
-- parent_comment_id: one level of nesting only, enforced in the UI not here.
-- deleted_at: user-facing "delete" is a soft delete (UPDATE, not DELETE) —
-- reuses the existing comments_update_own RLS policy, and avoids a real DELETE
-- cascading into a reply someone ELSE owns, which RLS could legitimately block
-- mid-transaction since the deleting user doesn't own that cascaded row.

alter table comments add column parent_comment_id uuid references comments(id) on delete cascade;
alter table comments add column deleted_at timestamptz;

create index comments_media_id_idx on comments (media_id);
create index comments_parent_comment_id_idx on comments (parent_comment_id);
