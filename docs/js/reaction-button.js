// Optimistic toggle for a like/favorite-style button: the UI updates
// instantly on click (so it never feels unresponsive), the actual database
// write happens in the background, and the UI only rolls back if that write
// genuinely fails. `count` is optional — favorites don't show one, likes do.
export function wireReactionButton(button, { getInitial, onToggle, render }) {
  let state = getInitial();
  render(button, state);

  button.addEventListener('click', async () => {
    const previous = state;
    const active = !state.active;
    const count = state.count === undefined ? undefined : state.count + (active ? 1 : -1);
    state = { active, count };
    render(button, state); // instant — before the network call, not after

    // Small bounce on the icon itself on every press, not just when turning
    // on — restart the animation even on rapid re-clicks by removing the
    // class and forcing a reflow before re-adding it.
    const icon = button.querySelector('.action-icon');
    if (icon) {
      icon.classList.remove('icon-bounce');
      void icon.offsetWidth;
      icon.classList.add('icon-bounce');
    }

    try {
      await onToggle(active);
    } catch (err) {
      state = previous;
      render(button, state); // roll back only on real failure
    }
  });

  return {
    set(newState) { state = newState; render(button, state); },
  };
}
