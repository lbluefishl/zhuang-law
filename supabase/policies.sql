-- Family media site — row-level security
-- Matches family-site-spec.md §9. Run after schema.sql, before any real content.

alter table collections enable row level security;
alter table media enable row level security;
alter table tags enable row level security;
alter table media_tags enable row level security;
alter table people enable row level security;
alter table media_people enable row level security;
alter table profiles enable row level security;
alter table comments enable row level security;
alter table likes enable row level security;
alter table boards enable row level security;
alter table board_messages enable row level security;
alter table favorites enable row level security;

-- security definer so profile policies can check is_admin without recursing into
-- profiles' own RLS.
create function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

-- collections / media / tags / media_tags / people / media_people:
-- read for any authenticated user, writes admin-only.
create policy "collections_select" on collections for select to authenticated using (true);
create policy "collections_write" on collections for all to authenticated using (is_admin()) with check (is_admin());

create policy "media_select" on media for select to authenticated using (true);
create policy "media_write" on media for all to authenticated using (is_admin()) with check (is_admin());

create policy "tags_select" on tags for select to authenticated using (true);
create policy "tags_write" on tags for all to authenticated using (is_admin()) with check (is_admin());

create policy "media_tags_select" on media_tags for select to authenticated using (true);
create policy "media_tags_write" on media_tags for all to authenticated using (is_admin()) with check (is_admin());

create policy "people_select" on people for select to authenticated using (true);
create policy "people_write" on people for all to authenticated using (is_admin()) with check (is_admin());

create policy "media_people_select" on media_people for select to authenticated using (true);
create policy "media_people_write" on media_people for all to authenticated using (is_admin()) with check (is_admin());

-- profiles: everyone authenticated can see everyone's display fields (needed to
-- render comment/like authorship); each user updates only their own row.
create policy "profiles_select" on profiles for select to authenticated using (true);
create policy "profiles_update_own" on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- comments: read for authenticated; write/own-delete for the author; admin may delete any.
create policy "comments_select" on comments for select to authenticated using (true);
create policy "comments_insert_own" on comments for insert to authenticated with check (user_id = auth.uid());
create policy "comments_update_own" on comments for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "comments_delete_own_or_admin" on comments for delete to authenticated using (user_id = auth.uid() or is_admin());

-- likes: one per person per item, enforced by the composite primary key.
create policy "likes_select" on likes for select to authenticated using (true);
create policy "likes_insert_own" on likes for insert to authenticated with check (user_id = auth.uid());
create policy "likes_delete_own" on likes for delete to authenticated using (user_id = auth.uid());

-- boards: content configured by the owner (like collections); board_messages
-- follow the same own-row pattern as comments.
create policy "boards_select" on boards for select to authenticated using (true);
create policy "boards_write" on boards for all to authenticated using (is_admin()) with check (is_admin());

create policy "board_messages_select" on board_messages for select to authenticated using (true);
create policy "board_messages_insert_own" on board_messages for insert to authenticated with check (user_id = auth.uid());
create policy "board_messages_update_own_or_admin" on board_messages for update to authenticated using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());
create policy "board_messages_delete_own_or_admin" on board_messages for delete to authenticated using (user_id = auth.uid() or is_admin());

-- favorites: private, select-own only (not "select for authenticated" like
-- everything else) — nobody sees anyone else's favorites, by design.
create policy "favorites_select_own" on favorites for select to authenticated using (user_id = auth.uid());
create policy "favorites_insert_own" on favorites for insert to authenticated with check (user_id = auth.uid());
create policy "favorites_delete_own" on favorites for delete to authenticated using (user_id = auth.uid());
