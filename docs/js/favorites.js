// Private per-user bookmark — no count, no "who favorited this" (see
// add-favorites.sql). Distinct from the public likes table in comments.js.

export async function isFavorited(supabaseClient, mediaId, userId) {
  const { data } = await supabaseClient
    .from('favorites').select('media_id').eq('media_id', mediaId).eq('user_id', userId).maybeSingle();
  return !!data;
}

export async function setFavorited(supabaseClient, mediaId, userId, favorited) {
  if (favorited) {
    const { error } = await supabaseClient.from('favorites').insert({ media_id: mediaId, user_id: userId });
    if (error) throw error;
  } else {
    const { error } = await supabaseClient.from('favorites').delete().eq('media_id', mediaId).eq('user_id', userId);
    if (error) throw error;
  }
}

// All of the current user's favorited media ids — used by the gallery filter.
export async function loadMyFavoriteIds(supabaseClient, userId) {
  const { data, error } = await supabaseClient.from('favorites').select('media_id').eq('user_id', userId);
  if (error) throw error;
  return new Set(data.map((r) => r.media_id));
}
