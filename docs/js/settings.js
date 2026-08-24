export const AVATAR_SIZE = 128; // px, square — deliberately small (see schema.sql)

export async function loadProfile(supabaseClient, userId) {
  const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

export async function updateProfile(supabaseClient, userId, fields) {
  const { error } = await supabaseClient.from('profiles').update(fields).eq('id', userId);
  if (error) throw error;
}

// Verifies the current PIN by re-authenticating with it (Supabase has no
// separate "check password" call) before allowing a change — protects against
// someone grabbing an already-unlocked device, not just typos.
export async function changePin(supabaseClient, email, currentPin, newPin) {
  const { error: reauthError } = await supabaseClient.auth.signInWithPassword({ email, password: currentPin });
  if (reauthError) throw new Error('WRONG_CURRENT_PIN');

  const { error } = await supabaseClient.auth.updateUser({ password: newPin });
  if (error) throw error;
}

export async function deleteAllMyComments(supabaseClient, userId) {
  const { error } = await supabaseClient
    .from('comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (error) throw error;
}

// See add-avatar-and-account-deletion.sql for exactly what this does and does
// not do (does not disable the login itself).
export async function deleteMyAccount(supabaseClient) {
  const { error } = await supabaseClient.rpc('delete_my_account');
  if (error) throw error;
}

// Validates + decodes a chosen file into an <img>, ready to hand to
// avatar-crop.js's openAvatarCropper() — no upload endpoint involved either
// way, the eventual cropped result is a data URI stored directly in
// profiles.avatar_data_url. Caller owns objectUrl and must revoke it once
// the crop dialog is done with it (can't revoke it here — the image needs
// to stay loadable while the crop dialog is open).
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 15 * 1024 * 1024) {
      reject(new Error('FILE_TOO_LARGE'));
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => resolve({ img, objectUrl });
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('NOT_AN_IMAGE'));
    };
    img.src = objectUrl;
  });
}
