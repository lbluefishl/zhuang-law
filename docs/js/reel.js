// Every non-Live-Photo video across every collection is reel-eligible — no
// curation step exists (or is needed) per the owner's direction. Order is a
// weighted random shuffle favoring videos with more likes, recomputed fresh
// on every load — a real feed, not a fixed playlist, but popular videos
// surface more often without it being strictly "sorted by likes".
export async function loadReelVideos(supabaseClient) {
  const { data: videos, error } = await supabaseClient
    .from('media')
    .select('id, r2_key, thumb_key, width, height')
    .eq('media_type', 'video')
    .eq('is_live_photo_video', false);
  if (error) throw error;
  if (videos.length === 0) return [];

  const { data: likeRows, error: likeError } = await supabaseClient
    .from('likes')
    .select('media_id')
    .in('media_id', videos.map((v) => v.id));
  if (likeError) throw likeError;

  const likeCounts = new Map();
  for (const row of likeRows) likeCounts.set(row.media_id, (likeCounts.get(row.media_id) || 0) + 1);

  return weightedShuffle(videos, (v) => 1 + (likeCounts.get(v.id) || 0));
}

// Weighted sampling without replacement — every item can appear anywhere,
// but a higher weight makes earlier placement more likely on average. Simple
// O(n²) approach; the reel is a family video collection, not millions of
// rows, so this is plenty fast and easy to follow.
function weightedShuffle(items, weightFn) {
  const pool = items.map((item) => ({ item, weight: weightFn(item) }));
  const result = [];
  while (pool.length > 0) {
    const total = pool.reduce((sum, p) => sum + p.weight, 0);
    let r = Math.random() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) {
      r -= pool[i].weight;
      if (r <= 0) break;
    }
    result.push(pool.splice(i, 1)[0].item);
  }
  return result;
}
