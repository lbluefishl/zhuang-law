import { wireReactionButton } from './reaction-button.js';
import { loadLikeState, setLiked, loadVisibleCommentCount } from './comments.js';
import { isFavorited, setFavorited } from './favorites.js';
import { heartIcon, starIcon, commentIcon, trashIcon } from './icons.js';

// Deletes the media row itself — RLS (media_write) already restricts this
// to is_admin() at the database level, so this is a normal client call, not
// a privileged RPC. Cascades to comments/likes/favorites/tags for this item
// automatically (all `on delete cascade` in schema.sql). This does NOT
// touch the underlying R2 files (original + thumbnail) — the browser never
// holds R2 credentials, only the pipeline does — so a deleted item is fully
// gone from the site immediately, but its files become orphaned in storage
// until a separate cleanup pass (see pipeline's find-orphaned-rows-style
// scripts) sweeps them.
export async function deleteMedia(supabaseClient, mediaId) {
  const { error } = await supabaseClient.from('media').delete().eq('id', mediaId);
  if (error) throw error;
}

// The right-side TikTok-style action column: favorite, like, comment-count
// (tapping it opens the caller's comment drawer), and — admin only — delete.
// Shared between media.html and reel.html so the two don't drift out of
// sync with each other. `dict`/`t` are only needed for the delete
// confirm/error text; omit `isAdmin` (or pass false) and neither is required.
export async function createActionBar({ supabaseClient, mediaId, userId, onOpenComments, isAdmin = false, onDeleted, dict, t }) {
  const bar = document.createElement('div');
  bar.className = 'action-bar';
  // Reel's slide has its own click handler (tap-to-toggle-mute) on the
  // whole slide, and this bar sits inside it — without this, every button
  // here (comments included) bubbles up and toggles mute as a side effect.
  bar.addEventListener('click', (e) => e.stopPropagation());

  const favoriteBtn = document.createElement('button');
  favoriteBtn.type = 'button';
  favoriteBtn.className = 'action-btn';
  favoriteBtn.setAttribute('aria-label', 'Favorite');
  bar.appendChild(favoriteBtn);

  const likeBtn = document.createElement('button');
  likeBtn.type = 'button';
  likeBtn.className = 'action-btn';
  likeBtn.setAttribute('aria-label', 'Like');
  bar.appendChild(likeBtn);

  const commentBtn = document.createElement('button');
  commentBtn.type = 'button';
  commentBtn.className = 'action-btn';
  commentBtn.setAttribute('aria-label', 'Comments');
  bar.appendChild(commentBtn);

  const [favorited, likeState, commentCount] = await Promise.all([
    isFavorited(supabaseClient, mediaId, userId),
    loadLikeState(supabaseClient, mediaId, userId),
    loadVisibleCommentCount(supabaseClient, mediaId),
  ]);

  wireReactionButton(favoriteBtn, {
    getInitial: () => ({ active: favorited }),
    onToggle: (active) => setFavorited(supabaseClient, mediaId, userId, active),
    render: (btn, state) => {
      btn.innerHTML = '';
      const icon = document.createElement('span');
      icon.className = 'action-icon';
      icon.innerHTML = starIcon(state.active);
      btn.appendChild(icon);
      // No count line under this one (favorites are private, no count to
      // show) — a blank spacer the same height as a count line keeps all
      // three icons sitting at the same visual height across the row,
      // instead of this one floating higher than heart/comment.
      const spacer = document.createElement('span');
      spacer.className = 'action-count action-count-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      spacer.textContent = ' '; // non-breaking space — reserves a real line height
      btn.appendChild(spacer);
      btn.classList.toggle('action-active', state.active);
    },
  });

  wireReactionButton(likeBtn, {
    getInitial: () => ({ active: likeState.likedByMe, count: likeState.count }),
    onToggle: (active) => setLiked(supabaseClient, mediaId, userId, active),
    render: (btn, state) => {
      btn.innerHTML = '';
      const icon = document.createElement('span');
      icon.className = 'action-icon';
      icon.innerHTML = heartIcon(state.active);
      btn.appendChild(icon);
      const count = document.createElement('span');
      count.className = 'action-count';
      count.textContent = state.count;
      btn.appendChild(count);
      btn.classList.toggle('action-active', state.active);
    },
  });

  function renderCommentCount(count) {
    commentBtn.innerHTML = '';
    const icon = document.createElement('span');
    icon.className = 'action-icon';
    icon.innerHTML = commentIcon();
    commentBtn.appendChild(icon);
    const countEl = document.createElement('span');
    countEl.className = 'action-count';
    countEl.textContent = count;
    commentBtn.appendChild(countEl);
  }
  renderCommentCount(commentCount);
  commentBtn.addEventListener('click', onOpenComments);

  if (isAdmin) {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'action-btn action-btn-delete';
    deleteBtn.setAttribute('aria-label', 'Delete');
    const icon = document.createElement('span');
    icon.className = 'action-icon';
    icon.innerHTML = trashIcon();
    deleteBtn.appendChild(icon);
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(t(dict, 'media.confirm_delete'))) return;
      try {
        await deleteMedia(supabaseClient, mediaId);
        onDeleted?.();
      } catch {
        alert(t(dict, 'media.delete_error'));
      }
    });
    bar.appendChild(deleteBtn);
  }

  return {
    element: bar,
    setCommentCount: renderCommentCount,
    async refreshCommentCount() {
      renderCommentCount(await loadVisibleCommentCount(supabaseClient, mediaId));
    },
  };
}
