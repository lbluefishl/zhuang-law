import { loadComments, postComment, softDeleteComment, buildCommentTree } from './comments.js';
import { createAvatarElement } from './avatar.js';

// Wires a comment list + post form to a given media item. `getMediaId` is a
// function, not a fixed id, so a single shared drawer (like reel.html's) can
// be re-pointed at whichever item is currently in view rather than needing
// one drawer instance per item.
export function createCommentThread({ supabaseClient, listEl, formEl, bodyInputEl, myId, getMediaId, onCountChange }) {
  function formatDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function renderComment(c, { isReply }) {
    const wrap = document.createElement('div');
    wrap.className = isReply ? 'comment comment-reply' : 'comment';

    wrap.appendChild(createAvatarElement(c.profiles?.display_name, c.profiles?.avatar_data_url, 'avatar-sm'));

    const content = document.createElement('div');
    content.className = 'comment-content';

    const authorLine = document.createElement('div');
    authorLine.className = 'comment-author';
    const relationship = c.profiles?.relationship ? ` (${c.profiles.relationship})` : '';
    authorLine.textContent = `${c.profiles?.display_name ?? 'Someone'}${relationship} · ${formatDate(c.created_at)}`;
    content.appendChild(authorLine);

    const body = document.createElement('p');
    body.className = 'comment-body';
    if (c.deleted_at) {
      body.textContent = 'Comment deleted';
      body.classList.add('comment-deleted');
    } else {
      body.textContent = c.body;
    }
    content.appendChild(body);

    if (!c.deleted_at) {
      const actions = document.createElement('div');
      actions.className = 'comment-actions';

      if (!isReply) {
        const replyBtn = document.createElement('button');
        replyBtn.type = 'button';
        replyBtn.textContent = 'Reply';
        replyBtn.addEventListener('click', () => toggleReplyForm(content, c.id));
        actions.appendChild(replyBtn);
      }

      if (c.user_id === myId) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async () => {
          if (!confirm('Delete this comment?')) return;
          await softDeleteComment(supabaseClient, c.id);
          await refresh();
        });
        actions.appendChild(deleteBtn);
      }

      if (actions.childElementCount > 0) content.appendChild(actions);
    }

    wrap.appendChild(content);
    return wrap;
  }

  function toggleReplyForm(parentContent, parentCommentId) {
    const existing = parentContent.querySelector('.reply-form');
    if (existing) { existing.remove(); return; }

    const form = document.createElement('form');
    form.className = 'reply-form';
    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Write a reply…';
    textarea.required = true;
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Reply';
    form.append(textarea, submit);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await postComment(supabaseClient, { mediaId: getMediaId(), userId: myId, body: textarea.value.trim(), parentCommentId });
      await refresh();
    });

    parentContent.appendChild(form);
    textarea.focus();
  }

  async function refresh() {
    const mediaId = getMediaId();
    const flat = await loadComments(supabaseClient, mediaId);
    const tree = buildCommentTree(flat);

    listEl.innerHTML = '';
    if (tree.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No comments yet.';
      listEl.appendChild(empty);
    } else {
      for (const c of tree) {
        const node = renderComment(c, { isReply: false });
        const content = node.querySelector(':scope > .comment-content');
        for (const reply of c.replies) {
          content.appendChild(renderComment(reply, { isReply: true }));
        }
        listEl.appendChild(node);
      }
    }
    if (onCountChange) onCountChange(tree.reduce((n, c) => n + 1 + c.replies.length, 0));
  }

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = bodyInputEl.value.trim();
    if (!body) return;
    await postComment(supabaseClient, { mediaId: getMediaId(), userId: myId, body });
    bodyInputEl.value = '';
    await refresh();
  });

  return { refresh };
}
