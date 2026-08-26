// heart.png/redheart.png/chat.png are the owner's own icon files
// (docs/icons/), both heart states at matching 512×512 so they can't
// mismatch in size the way the earlier ♡/♥ Unicode pair did.
//
// heart.png's fill is transparent (only the outline stroke is opaque) — with
// no filter it'd be a near-invisible thin line against a dark video backdrop,
// so it gets inverted to white (.icon-img-outline). chat.png is different:
// its fill is opaque WHITE, which already reads fine against a dark backdrop
// on its own — inverting it flattened that fill and its black dots to the
// same color, destroying the contrast between them. Left unfiltered instead.
export const heartIcon = (filled) => filled
  ? '<img src="icons/redheart.png" class="icon-img" alt="Liked">'
  : '<img src="icons/heart.png" class="icon-img icon-img-outline" alt="Not liked">';

export const commentIcon = () => '<img src="icons/chat.png" class="icon-img" alt="Comments">';

// No custom asset supplied for favorite — still the SVG-path approach (see
// build_status memory for why: two different Unicode glyphs, ☆/★, don't
// share the same drawn size in most fonts, so one path with a fill toggle).
const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';
export const starIcon = (filled) =>
  `<svg viewBox="0 0 24 24" width="26" height="26" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="${STAR_PATH}"/></svg>`;

// Admin-only delete action — same outline-SVG-path approach as the star,
// since there's no supplied icon asset for this one either.
const TRASH_PATH = 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9.5 4h5a1 1 0 011 1v2h-7V5a1 1 0 011-1zM4 7h16';
export const trashIcon = () =>
  `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${TRASH_PATH}"/></svg>`;
