// Admin-only phone upload (docs/upload.html) needs to PUT large files (a
// multi-hundred-MB iPhone video) straight into R2 -- routing that much data
// through an Edge Function's own request body would risk hitting its size/
// time limits for no reason. This function's only job is the one thing the
// browser genuinely cannot do safely: sign an R2 upload URL, since that
// requires the R2 secret key, which must never reach client JS (same reason
// the browser-side admin delete only ever removes the Supabase row -- see
// action-bar.js). Once it hands back a signed URL, the browser uploads
// directly to R2 and then inserts the `media` row itself, the same
// RLS-permitted way admin delete already works -- no need for this function
// to touch the database at all.
//
// Uses aws4fetch, not the full @aws-sdk/client-s3 + s3-request-presigner --
// those are heavy, Node-oriented packages that are known to be unreliable
// inside Deno's edge runtime via esm.sh (this is what was actually causing
// the function to crash before ever sending a response, which showed up in
// the browser as an opaque CORS error rather than a real error message).
// aws4fetch is a few KB, built specifically for signing AWS/R2 requests in
// Workers/Deno-style runtimes, with no Node dependencies at all.
//
// Deploy: paste this file into the Supabase dashboard (Edge Functions ->
// New function -> name it "get-upload-url") or `supabase functions deploy
// get-upload-url`. Turn OFF "Enforce JWT Verification" for this function --
// it does its own admin check below, and the platform's default check
// rejects requests (including the CORS preflight) in a way that doesn't
// carry proper CORS headers back to the browser.
//
// Secrets needed first (Edge Functions -> get-upload-url -> Secrets, or
// `supabase secrets set`): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME (same values as pipeline/.env).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// Also needs CORS enabled on the R2 bucket for browser-direct PUTs -- see
// the R2 dashboard's bucket Settings -> CORS Policy.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // admin-gated below; not worth pinning to one origin
  // supabase-js's functions.invoke() always attaches apikey and x-client-info
  // alongside authorization/content-type -- CORS requires every header the
  // browser's preflight asks for to be explicitly allowed, or it silently
  // blocks the real request (surfaces in the browser as a generic "Failed to
  // send a request", not a CORS error message, which is what made this one
  // non-obvious).
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
    if (!token) return json({ error: 'Missing auth' }, 401);

    // Service role client, same as the local pipeline -- this function
    // stands in for a trusted admin action, not a plain user request, so it
    // needs to read is_admin without being subject to RLS itself.
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: 'Invalid session' }, 401);

    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single();
    if (profileError || !profile?.is_admin) return json({ error: 'Admin only' }, 403);

    const { kind, ext, contentType } = await req.json();
    if (kind !== 'media' && kind !== 'thumbnail') return json({ error: 'Invalid kind' }, 400);
    if (typeof contentType !== 'string' || !contentType) return json({ error: 'Missing contentType' }, 400);

    // Same key layout as the local pipeline (index.js) -- media.html etc.
    // don't care how a row's files got there, only that r2_key/thumb_key
    // point somewhere real.
    const id = crypto.randomUUID();
    const key = kind === 'thumbnail' ? `thumbnails/${id}.jpg` : `media/${id}${ext || ''}`;

    const r2 = new AwsClient({
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      service: 's3',
      region: 'auto',
    });

    const bucket = Deno.env.get('R2_BUCKET_NAME')!;
    const endpoint = `https://${Deno.env.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`;
    const target = new URL(`${endpoint}/${bucket}/${key}`);
    target.searchParams.set('X-Amz-Expires', '600'); // 10 minutes -- long enough for a slow phone upload, short enough not to matter much if a URL ever leaked

    // Cache-Control matches pipeline/lib/r2.js's uploadToR2 -- every key
    // here is a fresh UUID too, so "cache this forever" is just as safe.
    // Passed as real headers here (not query params), so aws4fetch includes
    // them in X-Amz-SignedHeaders -- meaning the browser's actual PUT must
    // send these exact values back or R2 rejects the signature, which is
    // also why upload.html asks this function for the headers to use
    // rather than guessing them itself.
    const uploadHeaders = {
      'content-type': contentType,
      'cache-control': 'public, max-age=31536000, immutable',
    };
    const signedRequest = await r2.sign(
      new Request(target, { method: 'PUT', headers: uploadHeaders }),
      { aws: { signQuery: true } }
    );

    return json({ key, uploadUrl: signedRequest.url, headers: uploadHeaders });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
