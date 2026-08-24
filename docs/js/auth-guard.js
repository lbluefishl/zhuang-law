import { supabaseClient } from './supabase-client.js';

// Every protected page calls this first. There's no server here to enforce
// this — RLS is the real boundary (§9) — this just gets a logged-out visitor
// to the login screen instead of an empty, broken page.
export async function requireAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  return session;
}

export async function signOut() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}

// Wires up any element with [data-sign-out] on the page to the sign-out flow.
export function initSignOutButtons() {
  document.querySelectorAll('[data-sign-out]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      signOut();
    });
  });
}
