import 'dotenv/config';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import { makeVideoThumbnail } from './lib/thumbnails.js';
import { createR2Client, uploadToR2 } from './lib/r2.js';
import { createSupabaseAdmin } from './lib/supabase.js';

// One-off backfill for the thumbnails.js fix (grab the true first frame,
// not 0.5s in) — regenerates every already-uploaded video's thumbnail from
// its original file. Uploads each new thumbnail under a FRESH key rather
// than overwriting thumb_key in place: every R2 object is uploaded as
// immutable/cache-forever (see r2.js), so overwriting an existing key would
// just keep serving the stale cached copy to anyone whose browser (or the
// CDN) already has it cached. The old thumbnail objects are left behind as
// orphans in R2 — small JPEGs, cheap to leave, and cleanable later the same
// way admin-deleted media is (flush-r2-deletions.js) if it's ever worth it.
//
// Usage: node fix-video-thumbnails.js [--limit N] [--dry-run]

// Same constant as docs/js/supabase-client.js's R2_PUBLIC_URL — not secret
// (see that file's own comment), just duplicated here since this is a
// separate, non-bundled Node script.
const R2_PUBLIC_URL = 'https://pub-0c7dce75c90b4ee49f3096b18877488d.r2.dev';

function parseArgs(argv) {
  const limitFlag = argv.indexOf('--limit');
  const limit = limitFlag !== -1 ? Number(argv[limitFlag + 1]) : null;
  const dryRun = argv.includes('--dry-run');
  return { limit, dryRun };
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

async function main() {
  const { limit, dryRun } = parseArgs(process.argv.slice(2));

  const supabase = createSupabaseAdmin();
  const r2 = createR2Client();

  const { data: allVideos, error } = await supabase
    .from('media')
    .select('id, r2_key, thumb_key')
    .eq('media_type', 'video');
  if (error) throw new Error(`Failed to list videos: ${error.message}`);

  const videos = limit ? allVideos.slice(0, limit) : allVideos;
  console.log(`Regenerating thumbnails for ${videos.length} of ${allVideos.length} video(s)${dryRun ? ' (dry run — no uploads or DB writes)' : ''}...\n`);

  let updated = 0;
  let failed = 0;
  for (const row of videos) {
    const ext = path.extname(row.r2_key) || '.mp4';
    const tmpVideo = path.join(os.tmpdir(), `thumb-backfill-${crypto.randomUUID()}${ext}`);
    try {
      await downloadFile(`${R2_PUBLIC_URL}/${row.r2_key}`, tmpVideo);
      const thumbBuffer = await makeVideoThumbnail(tmpVideo);

      if (dryRun) {
        console.log(`OK (dry run): ${row.r2_key} — new thumbnail generated, not uploaded`);
      } else {
        const newThumbKey = `thumbnails/${crypto.randomUUID()}.jpg`;
        await uploadToR2(r2, newThumbKey, thumbBuffer, 'image/jpeg');

        const { error: updateError } = await supabase
          .from('media')
          .update({ thumb_key: newThumbKey })
          .eq('id', row.id);
        if (updateError) throw new Error(updateError.message);

        console.log(`OK: ${row.r2_key} -> ${newThumbKey} (was ${row.thumb_key})`);
      }
      updated++;
    } catch (err) {
      failed++;
      console.error(`FAILED: ${row.r2_key} — ${err.message}`);
    } finally {
      await fs.rm(tmpVideo, { force: true });
    }
  }

  console.log('\n--- Summary ---');
  console.log(`${dryRun ? 'Would update' : 'Updated'}: ${updated}`);
  console.log(`Failed: ${failed}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
