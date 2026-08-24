import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

const required = [
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error('Missing env vars:', missing.join(', '));
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const { data, error } = await supabase.from('collections').select('slug, name_en, reference_date');
if (error) {
  console.error('Supabase query failed:', error.message);
} else {
  console.log('Supabase connected. collections table:', data);
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
try {
  await r2.send(new HeadBucketCommand({ Bucket: process.env.R2_BUCKET_NAME }));
  console.log('R2 connected. Bucket reachable:', process.env.R2_BUCKET_NAME);
} catch (err) {
  console.error('R2 HeadBucket failed:', err.message);
}
