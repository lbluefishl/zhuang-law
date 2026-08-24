// Replicates gallery.html's (date desc) or timeline.html's (date asc)
// exact ordering, so the viewer's "Next" button advances through whichever
// list the visitor actually came from, not some third, different order.
// Returns full rows (not just ids) so the caller can prefetch a neighboring
// item's actual file without a second round trip to find its r2_key.
export async function loadOrderedItems(supabaseClient, from) {
  const { data: collection, error: collectionError } = await supabaseClient
    .from('collections').select('id').eq('slug', 'baby').single();
  if (collectionError) throw collectionError;

  const { data, error } = await supabaseClient
    .from('media')
    .select('id, r2_key, media_type')
    .eq('collection_id', collection.id)
    .eq('is_live_photo_video', false)
    .order('date_taken', { ascending: from === 'timeline' });
  if (error) throw error;
  return data;
}
