// Likes ---------------------------------------------------------------

export async function loadLikeState(supabaseClient, mediaId, currentUserId) {
  const { count } = await supabaseClient
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('media_id', mediaId);

  const { data: mine } = await supabaseClient
    .from('likes')
    .select('media_id')
    .eq('media_id', mediaId)
    .eq('user_id', currentUserId)
    .maybeSingle();

  return { count: count ?? 0, likedByMe: !!mine };
}

export async function setLiked(supabaseClient, mediaId, currentUserId, liked) {
  if (liked) {
    const { error } = await supabaseClient.from('likes').insert({ media_id: mediaId, user_id: currentUserId });
    if (error) throw error;
  } else {
    const { error } = await supabaseClient.from('likes').delete().eq('media_id', mediaId).eq('user_id', currentUserId);
    if (error) throw error;
  }
}

// Comments --------------------------------------------------------------

// Non-deleted count, for the action-bar badge — matches what's actually
// visible, not the raw row count (soft-deleted rows still exist).
export async function loadVisibleCommentCount(supabaseClient, mediaId) {
  const { count, error } = await supabaseClient
    .from('comments')
    .select('*', { count: 'exact', head: true })
    .eq('media_id', mediaId)
    .is('deleted_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function loadComments(supabaseClient, mediaId) {
  const { data, error } = await supabaseClient
    .from('comments')
    .select('id, body, created_at, user_id, parent_comment_id, deleted_at, profiles(display_name, relationship, avatar_data_url)')
    .eq('media_id', mediaId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function postComment(supabaseClient, { mediaId, userId, body, parentCommentId = null }) {
  const { error } = await supabaseClient.from('comments').insert({
    media_id: mediaId,
    user_id: userId,
    body,
    parent_comment_id: parentCommentId,
  });
  if (error) throw error;
}

// Soft delete — see schema.sql/add-comment-replies.sql for why this is an
// UPDATE, not a real DELETE.
export async function softDeleteComment(supabaseClient, commentId) {
  const { error } = await supabaseClient
    .from('comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', commentId);
  if (error) throw error;
}

// One level of nesting: top-level comments in order, each with its ordered
// replies attached. Enforced here in the UI layer, not the schema.
export function buildCommentTree(comments) {
  const topLevel = [];
  const repliesByParent = new Map();
  for (const c of comments) {
    if (c.parent_comment_id) {
      if (!repliesByParent.has(c.parent_comment_id)) repliesByParent.set(c.parent_comment_id, []);
      repliesByParent.get(c.parent_comment_id).push(c);
    } else {
      topLevel.push(c);
    }
  }
  return topLevel.map((c) => ({ ...c, replies: repliesByParent.get(c.id) || [] }));
}
