-- Family media site — initial data
-- name_zh / name_yue are placeholders; §7 leaves the two-language question open.

insert into collections (slug, name_en, name_zh, name_yue, display_order, reference_date)
values ('baby', 'Baby', '寶寶', '寶寶', 0, '2026-03-26');

insert into boards (slug, title, subtitle, slot_count)
values ('ashley-birthday-2026', 'Happy Birthday, Ashley! 🎉', 'A little note from everyone who loves you', 30);
