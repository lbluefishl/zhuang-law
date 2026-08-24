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
      await grabFrame(filePath, tmpFile, '00:00:00.5');
    } catch {
      // Very short clips can have nothing at 0.5s — fall back to the first frame.
      await grabFrame(filePath, tmpFile, '00:00:00.0');
    }
    const buffer = await fs.readFile(tmpFile);
    return sharp(buffer).jpeg({ quality: 80 }).toBuffer();
  } finally {
    await fs.rm(tmpFile, { force: true });
  }
}
