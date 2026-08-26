import 'dotenv/config';
import { createSupabaseAdmin } from './lib/supabase.js';
import { createR2Client, deleteFromR2 } from './lib/r2.js';

// Sweeps up whatever admin deletes on the website have queued (see
// supabase/add-r2-delete-queue.sql) -- those only remove the `media` row,
// since the browser never holds R2 credentials. This is what actually
// deletes the leftover objects from R2 and clears the queue afterward. Safe
// to run any time, including against an empty queue -- run it whenever
// convenient (e.g. alongside a local media reconciliation pass).

const supabase = createSupabaseAdmin();

const { data: pending, error } = await supabase
  .from('pending_r2_deletions')
  .select('id, r2_key, thumb_key');
if (error) throw new Error(`Failed to read pending_r2_deletions: ${error.message}`);

if (pending.length === 0) {
  console.log('Nothing to clean up.');
  process.exit(0);
}

const r2 = createR2Client();
const keys = pending.flatMap((row) => [row.r2_key, row.thumb_key]);
await deleteFromR2(r2, keys);

// Only clear the rows once the R2 delete has actually succeeded -- if
// deleteFromR2 throws above, these stay queued for the next run instead of
// being silently forgotten.
const ids = pending.map((row) => row.id);
const { error: clearError } = await supabase.from('pending_r2_deletions').delete().in('id', ids);
if (clearError) {
  throw new Error(`R2 objects were deleted, but failed to clear the queue: ${clearError.message}`);
}

console.log(`Cleaned up ${pending.length} deleted item(s) -- ${keys.filter(Boolean).length} R2 object(s) removed.`);
