// Shared between settings.html's preview and media.html's comment list.
export function createAvatarElement(displayName, avatarDataUrl, sizeClass = '') {
  if (avatarDataUrl) {
    const img = document.createElement('img');
    img.src = avatarDataUrl;
    img.alt = '';
    img.className = `avatar ${sizeClass}`.trim();
    return img;
  }
  const div = document.createElement('div');
  div.className = `avatar avatar-placeholder ${sizeClass}`.trim();
  div.textContent = (displayName || '?').trim().charAt(0).toUpperCase();
  return div;
}
