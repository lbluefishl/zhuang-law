import { fetchAllRows } from './fetch-all.js';

// Replicates gallery.html's (date desc) or timeline.html's (date asc)
// exact ordering, so the viewer's "Next" button advances through whichever
// list the visitor actually came from, not some third, different order.
// Returns full rows — every field media.html's own render needs, not just
// ids — so two things can skip a second Supabase round trip entirely: the
// caller can prefetch a neighboring item's actual file without looking up
// its r2_key separately, and (via the sessionStorage cache media.html keeps
// from this) a Prev/Next hop can render its target instantly instead of
// re-querying for a row this same list already had.
export async function loadOrderedItems(supabaseClient, from) {
  const { data: collection, error: collectionError } = await supabaseClient
    .from('collections').select('id').eq('slug', 'baby').single();
  if (collectionError) throw collectionError;

  // Supabase/PostgREST caps a single response at 1000 rows -- see
  // fetch-all.js. Without paging here, Prev/Next near the newest (from
  // gallery) or oldest (from timeline) end of a large-enough collection
  // would silently run off a truncated list.
  return fetchAllRows(() => supabaseClient
    .from('media')
    .select('id, r2_key, thumb_key, media_type, date_taken')
    .eq('collection_id', collection.id)
    .eq('is_live_photo_video', false)
    .order('date_taken', { ascending: from === 'timeline' }));
}
