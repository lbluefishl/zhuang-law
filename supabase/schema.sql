-- Family media site — schema
-- Matches family-site-spec.md §5. Run in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table collections (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_en text not null,
  name_zh text not null,
  name_yue text not null,
  display_order int not null default 0,
  -- Birth date for "baby", adoption date for future collections — drives Timeline age grouping.
  reference_date date
);

create table media (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  r2_key text not null,
  thumb_key text,
  media_type text not null check (media_type in ('photo', 'video')),
  date_taken timestamptz not null,
  width int,
  height int,
  duration_seconds numeric,
  content_identifier text,
  is_live_photo_video boolean not null default false,
  featured_in_reel boolean not null default false,
  reel_order int,
  created_at timestamptz not null default now(),
  -- Secondary dedup key for the upload script's re-run safety, for files with no
  -- content_identifier (i.e. anything that isn't half of a Live Photo pair).
  source_filename text,
  -- Raw open count (not unique viewers) — only incremented when actually
  -- opened in media.html, via the increment_view_count() function below, not
  -- writable through a plain UPDATE (see policies.sql: media writes are
  -- admin-only otherwise).
  view_count int not null default 0
);

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

create index media_content_identifier_idx on media (content_identifier);
create index media_collection_id_idx on media (collection_id);
create index media_date_taken_idx on media (date_taken);
create index media_source_filename_idx on media (source_filename);

create table tags (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_en text not null,
  name_zh text not null,
  name_yue text not null
);

create table media_tags (
  media_id uuid not null references media(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (media_id, tag_id)
);

create table people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  display_order int not null default 0
);

create table media_people (
  media_id uuid not null references media(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  primary key (media_id, person_id)
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  relationship text,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'zh', 'yue')),
  -- Small (client-resized before upload) avatar as a data URI directly on the
  -- row — avatars here are tiny and the userbase is a handful of people, so a
  -- whole separate storage bucket + its own RLS would be infrastructure this
  -- doesn't need. Reuses the already-verified profiles_update_own policy.
  avatar_data_url text,
  is_admin boolean not null default false
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references media(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  -- One level of nesting only (a reply, not a reply-to-a-reply) — enforced in
  -- the UI (no "Reply" button on a reply itself), not the schema, so it's not
  -- a hard limit if that ever needs to change.
  parent_comment_id uuid references comments(id) on delete cascade,
  body text not null,
  -- Soft delete: an owner deleting their comment sets this instead of a real
  -- DELETE, via the existing comments_update_own RLS policy — avoids a real
  -- delete cascading into a reply someone ELSE owns, which RLS would block
  -- mid-transaction. Replies stay intact; the UI shows "Comment deleted".
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index comments_media_id_idx on comments (media_id);
create index comments_parent_comment_id_idx on comments (parent_comment_id);

create table likes (
  media_id uuid not null references media(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (media_id, user_id)
);

-- Collaborative message board (e.g. a birthday poster). Generalized like
-- collections — a future occasion is a new boards row, not new code.
create table boards (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  subtitle text,
  -- Fixed count of numbered spots — a responsive CSS grid reflows columns per
  -- screen size, but spot claims stay stable and collision-proof regardless.
  slot_count int not null,
  created_at timestamptz not null default now()
);

create table board_messages (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  slot_index int not null,
  body text not null,
  font text not null default 'default',
  note_color text not null default 'yellow',
  border_style text not null default 'solid',
  decoration text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One message per person per board, one occupant per spot — enforced here,
  -- not just the UI, so a race condition can't create either.
  unique (board_id, user_id),
  unique (board_id, slot_index)
);

create index board_messages_board_id_idx on board_messages (board_id);

-- Private personal bookmark — distinct from the public `likes` table above.
-- Nobody but the owner can see their own favorites (enforced via RLS, not
-- just UI — see policies.sql).
create table favorites (
  media_id uuid not null references media(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (media_id, user_id)
);
