// Client-side media prep for the phone-upload page (upload.html) — turns a
// raw File from an iPhone's photo/video picker into exactly what the local
// pipeline (pipeline/index.js) would have produced: a thumbnail, a
// best-effort date_taken, and dimensions/duration — all without ffmpeg,
// exiftool, or sharp, none of which can run in a browser. Every step here
// has a real fallback since a browser can't always answer these accurately
// (a screenshot with no EXIF, a video with no embedded creation date,
// etc.) — "close enough, uploaded now" beats blocking the upload entirely.

import * as exifr from 'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.esm.mjs';

const THUMB_WIDTH = 480;

export function classifyFile(file) {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'photo';
  // Some browsers don't set a MIME type for HEIC — fall back to extension.
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (['mov', 'mp4'].includes(ext)) return 'video';
  if (['jpg', 'jpeg', 'png', 'heic', 'heif'].includes(ext)) return 'photo';
  return null;
}

function canvasToJpegBlob(canvas, quality = 0.8) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

// HEIC never displays reliably outside Safari/iOS — every other page on
// this site assumes r2_key is universally viewable (the local pipeline only
// ever accepts jpg/png for exactly this reason — see index.js's
// PHOTO_EXTENSIONS). Converting through canvas once here keeps that
// guarantee true regardless of upload source. Only re-encodes when it
// actually has to — an already-JPEG/PNG file uploads byte-for-byte
// untouched, same as the local pipeline. Also returns the decoded bitmap so
// the thumbnail step below doesn't have to decode the same image twice.
async function toUniversalPhoto(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const isAlreadyUniversal = file.type === 'image/jpeg' || file.type === 'image/png' || ['jpg', 'jpeg', 'png'].includes(ext);
  const bitmap = await createImageBitmap(file);

  if (isAlreadyUniversal) {
    return { blob: file, contentType: file.type || 'image/jpeg', ext: `.${ext || 'jpg'}`, bitmap };
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  const blob = await canvasToJpegBlob(canvas, 0.9);
  return { blob, contentType: 'image/jpeg', ext: '.jpg', bitmap };
}

function makePhotoThumbnail(bitmap) {
  const scale = THUMB_WIDTH / bitmap.width;
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_WIDTH;
  canvas.height = Math.round(bitmap.height * Math.min(scale, 1));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvasToJpegBlob(canvas);
}

// Mirrors pipeline/lib/thumbnails.js's makeVideoThumbnail: the true first
// frame, via <video> + <canvas> instead of ffmpeg — no ffmpeg here, but the
// same "what does the video look like at 0:00" question has a
// browser-native answer. Also the only place video width/height/duration
// come from, same as ffprobe would have supplied on the desktop pipeline.
function makeVideoThumbnailAndMeta(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    // iOS Safari specifically won't reliably load/decode a <video> that
    // isn't actually in the document -- on desktop browsers a detached
    // element still fires loadeddata/seeked fine, but on an iPhone this
    // silently never fires either event at all, which is what turned into
    // an indefinite "Preparing previews…" hang with no error. Hidden the
    // same way the media viewer's preload elements are (see media.html) --
    // real enough for iOS to actually process it, invisible either way.
    video.style.cssText = 'position:absolute; width:1px; height:1px; opacity:0; pointer-events:none;';
    document.body.appendChild(video);
    video.src = URL.createObjectURL(file);

    // Belt-and-suspenders: if something else entirely stalls this (a file
    // the browser just can't decode, some other platform quirk), fail
    // loudly after a while instead of leaving the admin staring at
    // "Preparing…" forever with nothing to go on.
    const timeoutId = setTimeout(() => cleanupAndReject(new Error('Timed out reading video — try a different file')), 30000);

    function cleanupAndResolve(result) {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(video.src);
      video.remove();
      resolve(result);
    }
    function cleanupAndReject(err) {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(video.src);
      video.remove();
      reject(err);
    }

    video.addEventListener('loadeddata', () => {
      // Some browsers already land on frame 0 on load; explicitly seeking
      // guarantees it rather than relying on that.
      video.currentTime = 0;
    });
    video.addEventListener('seeked', async () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = THUMB_WIDTH / video.videoWidth;
        canvas.width = THUMB_WIDTH;
        canvas.height = Math.round(video.videoHeight * Math.min(scale, 1));
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        const thumbBlob = await canvasToJpegBlob(canvas);
        cleanupAndResolve({
          thumbBlob,
          width: video.videoWidth,
          height: video.videoHeight,
          durationSeconds: Number.isFinite(video.duration) ? video.duration : null,
        });
      } catch (err) {
        cleanupAndReject(err);
      }
    });
    video.addEventListener('error', () => cleanupAndReject(new Error('Could not read video')));
  });
}

// Real EXIF/QuickTime date wins (exifr reads both); file.lastModified (iOS
// generally preserves this as the capture/export time) is the fallback,
// then "now" as the last resort — always SOME date, never a blocked upload
// over a missing one. Returns `source` too so upload.html can flag a guess
// for the admin to check/correct rather than silently trusting it — a file
// with no real EXIF (a screenshot, a downloaded image) can land on a
// misleading date otherwise (see build_status: "redheart.png" landing on
// its download date instead of anything meaningful).
async function resolveDateTaken(file) {
  try {
    const tags = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
    const raw = tags?.DateTimeOriginal || tags?.CreateDate;
    if (raw instanceof Date && !isNaN(raw)) return { date: raw, source: 'exif' };
  } catch {
    // Not every file has parseable metadata (exifr throws on some
    // containers it doesn't fully understand) — fall through to the file's
    // own timestamp instead of failing the whole upload over this.
  }
  if (file.lastModified) return { date: new Date(file.lastModified), source: 'file' };
  return { date: new Date(), source: 'none' };
}

// The one entry point upload.html calls per file — returns everything
// needed to ask get-upload-url for two upload slots (media + thumbnail) and
// then insert the media row directly, or throws with a message safe to
// show the admin as-is.
export async function prepareUpload(file) {
  const mediaType = classifyFile(file);
  if (!mediaType) throw new Error(`Unsupported file type: ${file.name}`);

  if (mediaType === 'photo') {
    const [{ blob, contentType, ext, bitmap }, { date: dateTaken, source: dateSource }] = await Promise.all([
      toUniversalPhoto(file),
      resolveDateTaken(file),
    ]);
    const thumbBlob = await makePhotoThumbnail(bitmap);
    return {
      mediaType, blob, contentType, ext, thumbBlob, dateTaken, dateSource,
      width: bitmap.width, height: bitmap.height, durationSeconds: null,
    };
  }

  const [{ thumbBlob, width, height, durationSeconds }, { date: dateTaken, source: dateSource }] = await Promise.all([
    makeVideoThumbnailAndMeta(file),
    resolveDateTaken(file),
  ]);
  const ext = `.${(file.name.split('.').pop() || 'mp4').toLowerCase()}`;
  return {
    mediaType, blob: file, contentType: file.type || 'video/mp4', ext, thumbBlob, dateTaken, dateSource,
    width, height, durationSeconds,
  };
}
