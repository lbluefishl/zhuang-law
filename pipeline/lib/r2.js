import { S3Client, PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';

export function createR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

export async function uploadToR2(client, key, body, contentType) {
  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
    // Every key is a fresh UUID (index.js) — nothing already uploaded is
    // ever overwritten in place, so "cache this forever" is always safe,
    // not just usually. Without this, browsers fall back to heuristic
    // caching (roughly 10% of the file's age since Last-Modified), which is
    // far shorter than it needs to be for content that provably never
    // changes — a relative reopening the site later re-downloads photos
    // they already viewed instead of getting them instantly from cache.
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

// Batched (up to 1000 keys per S3 DeleteObjects call) — used both by one-off
// cleanup scripts and to actually scrub R2 after an admin deletes a media
// row from the website (the browser never holds R2 credentials, so that
// path only removes the Supabase row itself; this is what a follow-up sweep
// uses to catch up on the actual files).
export async function deleteFromR2(client, keys) {
  const nonEmpty = keys.filter(Boolean);
  if (!nonEmpty.length) return;
  await client.send(new DeleteObjectsCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Delete: { Objects: nonEmpty.map((Key) => ({ Key })) },
  }));
}
