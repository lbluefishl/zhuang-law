// Supabase/PostgREST caps a single response at 1000 rows by default. That's
// invisible while a table is small, then one day it silently truncates --
// no error, just a quietly incomplete result -- which is exactly what
// happened to Timeline once `media` crossed 1000 rows: sorted oldest-first,
// so the newest uploads were the ones silently cut off, while Gallery
// (sorted newest-first) looked fine purely because the newest rows happen
// to sort first there instead.
//
// Paginates with .range() until a page comes back short of a full page, so
// callers just get everything regardless of how large a table has grown.
// Takes a FACTORY (a function that builds a fresh query), not a query
// itself -- a supabase-js query builder is consumed once awaited, so each
// page needs its own fresh `.from(...).select(...)...` chain to append
// `.range()` onto.
const PAGE_SIZE = 1000;

export async function fetchAllRows(queryFactory) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await queryFactory().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}
