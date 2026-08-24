// Simple drag-to-reposition + zoom crop. The stage is a fixed circular
// window sized exactly like the avatar it produces — what you see during
// cropping is what you get, no separate preview step needed.
const MIN_ZOOM = 1; // image just covers the stage — can't zoom out further
                     // without revealing empty space at the edges
const MAX_ZOOM = 3;

// `img`/`objectUrl` come from settings.js's loadImageFile() — this function
// only reads img, it doesn't revoke objectUrl (the caller owns that).
// Resolves with a data URL on "Use photo", or null on Cancel/Escape/backdrop
// dismiss — never rejects, a cancelled crop isn't an error.
export function openAvatarCropper({ dialog, stage, imgEl, zoomInput, useBtn, cancelBtn, img, outputSize = 128 }) {
  return new Promise((resolve) => {
    let settled = false;
    let zoom = 1;
    let offsetX = 0;
    let offsetY = 0;

    // Re-read on every use — .crop-stage is `width: min(260px, 100%)`, so
    // this can differ on a narrow phone vs. a monitor, and the crop math
    // below has to match whatever actually rendered, not an assumed 260.
    const stageSize = stage.clientWidth;
    const baseScale = stageSize / Math.min(img.naturalWidth, img.naturalHeight);

    function displayedSize() {
      const s = baseScale * zoom;
      return { w: img.naturalWidth * s, h: img.naturalHeight * s, s };
    }

    // Offsets are always <= 0 (the image's top-left can't move past the
    // stage's) and >= stageSize - displayedSize (its bottom-right can't be
    // pulled in past the stage's, which would reveal empty space).
    function clampOffsets() {
      const { w, h } = displayedSize();
      offsetX = Math.min(0, Math.max(stageSize - w, offsetX));
      offsetY = Math.min(0, Math.max(stageSize - h, offsetY));
    }

    function render() {
      const { w, h } = displayedSize();
      imgEl.style.width = `${w}px`;
      imgEl.style.height = `${h}px`;
      imgEl.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    }

    imgEl.src = img.src;
    zoom = 1;
    zoomInput.value = '1';
    {
      const { w, h } = displayedSize();
      offsetX = (stageSize - w) / 2;
      offsetY = (stageSize - h) / 2;
    }
    render();

    let dragging = false;
    let startX = 0, startY = 0, startOffsetX = 0, startOffsetY = 0;

    function onPointerDown(e) {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startOffsetX = offsetX;
      startOffsetY = offsetY;
      stage.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e) {
      if (!dragging) return;
      offsetX = startOffsetX + (e.clientX - startX);
      offsetY = startOffsetY + (e.clientY - startY);
      clampOffsets();
      render();
    }
    function onPointerUp(e) {
      dragging = false;
      try { stage.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    }
    function onZoomInput() {
      zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(zoomInput.value)));
      clampOffsets();
      render();
    }

    function cleanup() {
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', onPointerUp);
      stage.removeEventListener('pointercancel', onPointerUp);
      zoomInput.removeEventListener('input', onZoomInput);
      useBtn.removeEventListener('click', onUse);
      cancelBtn.removeEventListener('click', onCancel);
      dialog.removeEventListener('close', onCancel);
    }

    function onUse() {
      if (settled) return;
      settled = true;
      const { s } = displayedSize();
      // Map the stage's visible circular window back into the source
      // image's own natural pixel coordinates.
      const cropX = -offsetX / s;
      const cropY = -offsetY / s;
      const cropSize = stageSize / s;

      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      canvas.getContext('2d').drawImage(img, cropX, cropY, cropSize, cropSize, 0, 0, outputSize, outputSize);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      cleanup();
      dialog.close();
      resolve(dataUrl);
    }
    function onCancel() {
      if (settled) return;
      settled = true;
      cleanup();
      dialog.close();
      resolve(null);
    }

    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onPointerMove);
    stage.addEventListener('pointerup', onPointerUp);
    stage.addEventListener('pointercancel', onPointerUp);
    zoomInput.addEventListener('input', onZoomInput);
    useBtn.addEventListener('click', onUse);
    cancelBtn.addEventListener('click', onCancel);
    // Covers Escape and any other native way the dialog closes without
    // either button being clicked.
    dialog.addEventListener('close', onCancel);

    dialog.showModal();
  });
}
