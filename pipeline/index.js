import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

import { discoverFiles } from './lib/discover.js';
import { readMetadata, resolveDateTaken } from './lib/exif.js';
import { pairLivePhotos } from './lib/livePhotos.js';
import { makeImageThumbnail, makeVideoThumbnail } from './lib/thumbnails.js';
import { createR2Client, uploadToR2 } from './lib/r2.js';
import { createSupabaseAdmin, getCollectionId, fetchExistingKeys, insertMedia } from './lib/supabase.js';

const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const VIDEO_EXTENSIONS = new Set(['.mov', '.mp4']);
const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
};

// v1 has one collection. Revisit when the cats collection (§12 Phase 5) shows up.
const COLLECTION_SLUG = 'baby';

function parseArgs(argv) {
  const [inputDir, ...rest] = argv;
  const limitFlag = rest.indexOf('--limit');
  const limit = limitFlag !== -1 ? Number(rest[limitFlag + 1]) : null;
  const allowMissingDate = rest.includes('--allow-missing-date');
  return { inputDir, limit, allowMissingDate };
}

function classify(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (PHOTO_EXTENSIONS.has(ext)) return { ext, mediaType: 'photo' };
  if (VIDEO_EXTENSIONS.has(ext)) return { ext, mediaType: 'video' };
  return null;
}

async function buildRecords(items, { fallbackDate } = {}) {
  const records = [];
  const failures = [];
  for (const item of items) {
    try {
      const tags = await readMetadata(item.filePath);
      const exifDate = resolveDateTaken(tags, item.mediaType === 'video');
      records.push({
        ...item,
        fileName: path.basename(item.filePath),
        contentIdentifier: tags.ContentIdentifier || null,
        // Real EXIF date wins; fallbackDate (--allow-missing-date) is a last
        // resort so the upload run itself never silently invents a date —
        // it's the same fixed timestamp for every fallback file in this run,
        // which doubles as a way to find them again later (see README note).
        dateTaken: exifDate || fallbackDate || null,
        usedFallbackDate: !exifDate && !!fallbackDate,
        width: tags.ImageWidth ?? null,
        height: tags.ImageHeight ?? null,
        durationSeconds: tags.Duration ?? null,
        isLivePhotoVideo: false,
      });
    } catch (err) {
      failures.push({ file: item.filePath, reason: `exiftool: ${err.message}` });
    }
  }
  return { records, failures };
}

async function processRecord(record, ctx) {
  const { fileName, filePath, ext, mediaType, contentIdentifier } = record;
  const contentKey = contentIdentifier ? `${contentIdentifier}:${mediaType}` : null;

  if (contentKey && ctx.existingContentIds.has(contentKey)) {
    return { status: 'skipped', reason: 'duplicate content_identifier' };
  }
  if (!contentIdentifier && ctx.existingFilenames.has(fileName)) {
    return { status: 'skipped', reason: 'duplicate filename' };
  }
  if (!record.dateTaken) {
    return { status: 'failed', reason: 'no usable date found in EXIF' };
  }

  const id = crypto.randomUUID();
  const r2Key = `media/${id}${ext}`;
  const thumbKey = `thumbnails/${id}.jpg`;

  const fileBuffer = await fs.readFile(filePath);
  await uploadToR2(ctx.r2, r2Key, fileBuffer, CONTENT_TYPES[ext]);

  const thumbBuffer = mediaType === 'photo'
    ? await makeImageThumbnail(filePath)
    : await makeVideoThumbnail(filePath);
  await uploadToR2(ctx.r2, thumbKey, thumbBuffer, 'image/jpeg');

  await insertMedia(ctx.supabase, {
    id,
    collection_id: ctx.collectionId,
    r2_key: r2Key,
    thumb_key: thumbKey,
    media_type: mediaType,
    date_taken: record.dateTaken.toISOString(),
    width: record.width,
    height: record.height,
    duration_seconds: record.durationSeconds,
    content_identifier: contentIdentifier,
    is_live_photo_video: record.isLivePhotoVideo,
    source_filename: fileName,
  });

  if (contentKey) ctx.existingContentIds.add(contentKey);
  ctx.existingFilenames.add(fileName);

  return { status: 'uploaded', r2Key };
}

async function main() {
  const { inputDir, limit, allowMissingDate } = parseArgs(process.argv.slice(2));
  if (!inputDir) {
    console.error('Usage: node index.js <folder> [--limit N] [--allow-missing-date]');
    process.exit(1);
  }
  // Captured once per run, not per file — every fallback-dated file in this
  // run shares the exact same timestamp, which makes them easy to find again
  // later (SELECT * FROM media WHERE date_taken = '<that timestamp>').
  const fallbackDate = allowMissingDate ? new Date() : null;
  if (allowMissingDate) {
    console.log(`--allow-missing-date is on: files with no usable EXIF date will be uploaded anyway, dated ${fallbackDate.toISOString()} (today) as a placeholder.\n`);
  }

  const supabase = createSupabaseAdmin();
  const r2 = createR2Client();
  const collectionId = await getCollectionId(supabase, COLLECTION_SLUG);
  const { contentIds: existingContentIds, filenames: existingFilenames } = await fetchExistingKeys(supabase);

  const allFiles = await discoverFiles(inputDir);
  const candidates = [];
  const unsupported = [];
  for (const filePath of allFiles) {
    const classified = classify(filePath);
    if (classified) candidates.push({ filePath, ...classified });
    else unsupported.push(filePath);
  }

  if (unsupported.length) {
    console.log(`Skipping ${unsupported.length} file(s) with an unrecognized extension (includes HEIC/HEIF — not currently converted):`);
    unsupported.forEach((f) => console.log(`  - ${f}`));
  }

  const items = limit ? candidates.slice(0, limit) : candidates;
  console.log(`\nProcessing ${items.length} file(s) from ${inputDir}${limit ? ` (--limit ${limit})` : ''}\n`);

  const { records, failures: exifFailures } = await buildRecords(items, { fallbackDate });
  pairLivePhotos(records);

  const summary = { uploaded: 0, skipped: 0, failed: 0, failures: [...exifFailures], fallbackDated: [] };
  const ctx = { supabase, r2, collectionId, existingContentIds, existingFilenames };

  for (const record of records) {
    try {
      const result = await processRecord(record, ctx);
      if (result.status === 'uploaded') {
        summary.uploaded++;
        if (record.usedFallbackDate) summary.fallbackDated.push(record.fileName);
        console.log(`OK: ${record.fileName} -> ${result.r2Key}${record.usedFallbackDate ? ' (fallback date — no EXIF)' : ''}`);
      } else if (result.status === 'skipped') {
        summary.skipped++;
        console.log(`SKIP (${result.reason}): ${record.fileName}`);
      } else {
        summary.failed++;
        summary.failures.push({ file: record.fileName, reason: result.reason });
        console.error(`FAILED: ${record.fileName} — ${result.reason}`);
      }
    } catch (err) {
      summary.failed++;
      summary.failures.push({ file: record.fileName, reason: err.message });
      console.error(`FAILED: ${record.fileName} — ${err.message}`);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Uploaded: ${summary.uploaded}`);
  console.log(`Skipped (duplicates): ${summary.skipped}`);
  console.log(`Failed: ${summary.failed}`);
  if (summary.failures.length) {
    console.log('Failures:');
    summary.failures.forEach((f) => console.log(`  - ${f.file}: ${f.reason}`));
  }
  if (summary.fallbackDated.length) {
    console.log(`\nUploaded with a placeholder date (${fallbackDate.toISOString()}) — fix these once real dates are known:`);
    summary.fallbackDated.forEach((f) => console.log(`  - ${f}`));
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
