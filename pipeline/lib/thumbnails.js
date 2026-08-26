import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const execFileAsync = promisify(execFile);
const THUMB_WIDTH = 480;

export async function makeImageThumbnail(filePath) {
  // .rotate() with no args auto-orients from EXIF so sideways phone photos come out upright.
  return sharp(filePath)
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function grabFrame(filePath, tmpFile, seekTime) {
  await execFileAsync(ffmpegPath, [
    '-y', '-ss', seekTime, '-i', filePath, '-frames:v', '1', '-vf', `scale=${THUMB_WIDTH}:-1`, tmpFile,
  ]);
}

export async function makeVideoThumbnail(filePath) {
  const tmpFile = path.join(os.tmpdir(), `thumb-${crypto.randomUUID()}.jpg`);
  try {
    try {
      // True first frame, not 0.5s in — this is also exactly the frame a
      // <video> shows the instant playback starts (currentTime 0), so the
      // thumbnail/poster overlay (reel.html) hands off to real playback
      // with no visible content jump. Only falls back to 0.5s if frame 0
      // itself fails to grab (e.g. a genuinely zero-length stream) — better
      // to get a slightly-off thumbnail than no thumbnail at all.
      await grabFrame(filePath, tmpFile, '00:00:00.0');
    } catch {
      await grabFrame(filePath, tmpFile, '00:00:00.5');
    }
    const buffer = await fs.readFile(tmpFile);
    return sharp(buffer).jpeg({ quality: 80 }).toBuffer();
  } finally {
    await fs.rm(tmpFile, { force: true });
  }
}
