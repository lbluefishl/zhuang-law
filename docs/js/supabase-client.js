// Project URL and publishable (anon) key are meant to be public — see §4/§10 of
// family-site-spec.md. RLS policies (supabase/policies.sql) are what actually
// gate access, not secrecy of these two values.
const SUPABASE_URL = 'https://fohjcljqkbautxkofbyx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_QkChml8uq_En7JoZOUv9JQ_KeNTOJ7K';

// window.supabase comes from the CDN <script> tag loaded before this module in
// every page's <head> — captured here before we shadow the name with our own export.
const { createClient } = window.supabase;

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Public base URL for the R2 bucket (also not secret — see build_status memory).
export const R2_PUBLIC_URL = 'https://pub-0c7dce75c90b4ee49f3096b18877488d.r2.dev';
