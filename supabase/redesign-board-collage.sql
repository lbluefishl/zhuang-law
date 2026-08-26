-- Board redesign: drop the fixed-grid/slot-picking model in favor of a
-- collage — one button to add a note (no location to choose), laid out via
-- CSS multi-column masonry and sized to each note's own content instead of
-- a uniform grid cell. See board.js/board.html/board.css for the matching
-- UI change. Also folded into schema.sql directly.
--
-- Dropping board_messages.slot_index also drops the unique(board_id,
-- slot_index) constraint that depended on it — Postgres does this
-- automatically on DROP COLUMN, since the constraint can't exist without
-- the column it's defined over. unique(board_id, user_id) (one message per
-- person) is untouched, still enforced.
alter table board_messages drop column slot_index;
alter table boards drop column slot_count;
