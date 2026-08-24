import { loadComments, postComment, softDeleteComment, buildCommentTree } from './comments.js';
import { createAvatarElement } from './avatar.js';

// Wires a comment list + post form to a given media item. `getMediaId` is a
// function, not a fixed id, so a single shared drawer (like reel.html's) can
// be re-pointed at whichever item is currently in view rather than needing
// one drawer instance per item. `dict`/`t` are the loaded i18n dictionary and
// its lookup helper (from js/i18n.js) — used for all the surrounding UI
// chrome (buttons, placeholders, empty state). Comment *bodies* themselves
// (c.body) are never touched — those stay exactly as the author typed them.
export function createCommentThread({ supabaseClient, listEl, formEl, bodyInputEl, myId, getMediaId, onCountChange, dict, t }) {
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
    authorLine.textContent = `${c.profiles?.display_name ?? t(dict, 'comments.someone')}${relationship} · ${formatDate(c.created_at)}`;
    content.appendChild(authorLine);

    const body = document.createElement('p');
    body.className = 'comment-body';
    if (c.deleted_at) {
      body.textContent = t(dict, 'comments.deleted');
      body.classList.add('comment-deleted');
    } else {
      body.textContent = c.body; // the author's own words — never translated
    }
    content.appendChild(body);

    if (!c.deleted_at) {
      const actions = document.createElement('div');
      actions.className = 'comment-actions';

      if (!isReply) {
        const replyBtn = document.createElement('button');
        replyBtn.type = 'button';
        replyBtn.textContent = t(dict, 'comments.reply');
        replyBtn.addEventListener('click', () => toggleReplyForm(content, c.id));
        actions.appendChild(replyBtn);
      }

      if (c.user_id === myId) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.textContent = t(dict, 'comments.delete');
        deleteBtn.addEventListener('click', async () => {
          if (!confirm(t(dict, 'comments.confirm_delete'))) return;
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
    textarea.placeholder = t(dict, 'comments.reply_placeholder');
    textarea.required = true;
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = t(dict, 'comments.reply');
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
      empty.textContent = t(dict, 'comments.empty');
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
