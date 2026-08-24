-- Favorites: a PRIVATE personal bookmark, distinct from the public `likes`
-- table. Nobody but the owner of a favorite can see it — no "who favorited
-- this" list, no count shown to others. Sets up cleanly for a future
-- "export a selection to a photo book" feature (spec §6 later phases) and a
-- "sort gallery by my favorites" filter.

create table favorites (
  media_id uuid not null references media(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (media_id, user_id)
);

alter table favorites enable row level security;

-- Unlike likes (visible to everyone), favorites are select-own only.
create policy "favorites_select_own" on favorites for select to authenticated using (user_id = auth.uid());
create policy "favorites_insert_own" on favorites for insert to authenticated with check (user_id = auth.uid());
create policy "favorites_delete_own" on favorites for delete to authenticated using (user_id = auth.uid());
