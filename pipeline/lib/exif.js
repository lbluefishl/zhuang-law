import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Bundled binary lives at the repo root (gitignored) — see build_status memory.
// EXIFTOOL_PATH lets this be overridden on a machine where it's on PATH instead.
const DEFAULT_EXIFTOOL_PATH = path.join(__dirname, '..', '..', 'exiftool-13.59_64', 'exiftool.exe');
const EXIFTOOL_PATH = process.env.EXIFTOOL_PATH || DEFAULT_EXIFTOOL_PATH;

// -ee: read embedded/track metadata — required for video dates (§8), harmless for photos.
// -n: numeric output, so Duration comes back in seconds rather than "0:01:23".
export async function readMetadata(filePath) {
  const args = [
    '-j', '-ee', '-n',
    '-DateTimeOriginal', '-CreationDate', '-CreateDate', '-MediaCreateDate',
    '-ImageWidth', '-ImageHeight', '-Duration', '-ContentIdentifier',
    filePath,
  ];
  const { stdout } = await execFileAsync(EXIFTOOL_PATH, args, { maxBuffer: 10 * 1024 * 1024 });
  const [tags] = JSON.parse(stdout);
  return tags;
}

function parseExifDate(raw) {
  if (!raw) return null;
  const match = String(raw).trim().match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Video date tags in the order §8 specifies; photos just use DateTimeOriginal.
export function resolveDateTaken(tags, isVideo) {
  const candidates = isVideo
    ? [tags.CreationDate, tags.CreateDate, tags.MediaCreateDate]
    : [tags.DateTimeOriginal];
  for (const candidate of candidates) {
    const parsed = parseExifDate(candidate);
    if (parsed) return parsed;
  }
  return null;
}
