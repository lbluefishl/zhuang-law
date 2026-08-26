-- Admin delete (docs/js/action-bar.js) only removes the `media` row itself --
-- the browser never holds R2 credentials, so the actual photo/video and its
-- thumbnail stay in the bucket (see pipeline/lib/r2.js). This queues the keys
-- at the moment of deletion, since they're gone from `media` a moment later
-- and there'd be nothing else to look at; pipeline/flush-r2-deletions.js is
-- the follow-up sweep that actually deletes the objects from R2 and clears
-- the queue. Run that script occasionally (e.g. alongside a local media
-- reconciliation pass) -- nothing here runs it automatically.

create table pending_r2_deletions (
  id bigint generated always as identity primary key,
  r2_key text,
  thumb_key text,
  deleted_at timestamptz not null default now()
);

-- No client -- including admins -- talks to this table directly. Only the
-- security definer trigger below (which bypasses RLS the same way
-- increment_view_count does) and the pipeline script (via the service key,
-- which bypasses RLS entirely) ever touch it.
alter table pending_r2_deletions enable row level security;

create or replace function public.queue_r2_cleanup() returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into pending_r2_deletions (r2_key, thumb_key) values (old.r2_key, old.thumb_key);
  return old;
end;
$$;

create trigger media_queue_r2_cleanup
  after delete on media
  for each row execute function public.queue_r2_cleanup();
