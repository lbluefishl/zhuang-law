-- View tracking, needed for "sort by views" in the gallery. A simple raw
-- counter (every open counts, not just unique viewers — more meaningful as
-- an engagement signal at this scale, similar to how a view count works on
-- most platforms), incremented only when a photo/video is actually opened
-- in media.html, not just when its thumbnail appears in a grid.
--
-- Non-admin users can't UPDATE media directly (see policies.sql), so a
-- narrow SECURITY DEFINER function does only this one safe thing — it can't
-- be used to tamper with anything else on the row.
alter table media add column view_count int not null default 0;

create or replace function public.increment_view_count(target_media_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update media set view_count = view_count + 1 where id = target_media_id;
end;
$$;

grant execute on function public.increment_view_count(uuid) to authenticated;
revoke execute on function public.increment_view_count(uuid) from anon, public;
