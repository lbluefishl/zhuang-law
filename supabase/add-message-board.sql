-- Collaborative "birthday poster" board. Designed generalized (like
-- collections) so a future occasion is a new boards row, not new code.

create table boards (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  subtitle text,
  -- Fixed count of numbered spots — see chat: a responsive CSS grid reflows
  -- columns per screen size, but the spot claims themselves stay stable and
  -- collision-proof regardless of layout.
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
  -- One message per person per board, one occupant per spot — both enforced
  -- here, not just in the UI, so a race condition can't create either.
  unique (board_id, user_id),
  unique (board_id, slot_index)
);

create index board_messages_board_id_idx on board_messages (board_id);

alter table boards enable row level security;
alter table board_messages enable row level security;

create policy "boards_select" on boards for select to authenticated using (true);
create policy "boards_write" on boards for all to authenticated using (is_admin()) with check (is_admin());

create policy "board_messages_select" on board_messages for select to authenticated using (true);
create policy "board_messages_insert_own" on board_messages for insert to authenticated with check (user_id = auth.uid());
create policy "board_messages_update_own_or_admin" on board_messages for update to authenticated using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());
create policy "board_messages_delete_own_or_admin" on board_messages for delete to authenticated using (user_id = auth.uid() or is_admin());

-- Seed: Ashley's birthday board. Adjust title/slot_count freely — it's just data.
insert into boards (slug, title, subtitle, slot_count)
values ('ashley-birthday-2026', 'Happy Birthday, Ashley! 🎉', 'A little note from everyone who loves you', 30);
