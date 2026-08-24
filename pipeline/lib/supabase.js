import { createClient } from '@supabase/supabase-js';

export function createSupabaseAdmin() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
}

export async function getCollectionId(supabase, slug) {
  const { data, error } = await supabase.from('collections').select('id').eq('slug', slug).single();
  if (error) throw new Error(`Collection lookup failed for "${slug}": ${error.message}`);
  return data.id;
}

// Loaded once per run into memory (media stays in the low thousands of rows) —
// this is what makes re-runs safe per §8 step 6.
//
// content_identifier is keyed together with media_type because a Live Photo's
// still and video legitimately SHARE one content_identifier by design (that's
// how pairLivePhotos finds them) — deduping on content_identifier alone would
// wrongly treat the second half of a pair as a repeat of the first.
export async function fetchExistingKeys(supabase) {
  const { data, error } = await supabase.from('media').select('content_identifier, media_type, source_filename');
  if (error) throw new Error(`Failed to fetch existing media: ${error.message}`);
  return {
    contentIds: new Set(
      data.filter((r) => r.content_identifier).map((r) => `${r.content_identifier}:${r.media_type}`)
    ),
    filenames: new Set(data.map((r) => r.source_filename).filter(Boolean)),
  };
}

export async function insertMedia(supabase, row) {
  const { error } = await supabase.from('media').insert(row);
  if (error) throw new Error(`Insert failed: ${error.message}`);
}
