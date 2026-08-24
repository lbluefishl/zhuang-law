// Language resolution per §7: manual toggle (persisted locally) → English
// fallback. Once a profile exists, the login page can't know its
// preferred_language yet (not signed in) — that lookup only matters post-login,
// which is out of scope until Phase 4 rolls this out past login/signup.
const STORAGE_KEY = 'preferred_language';
const SUPPORTED = ['en', 'zh', 'yue'];
const FALLBACK = 'en';
const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'yue', label: '廣東話' },
];

export function getStoredLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED.includes(stored) ? stored : FALLBACK;
  } catch {
    return FALLBACK; // private browsing / storage blocked — just don't persist
  }
}

export function setStoredLanguage(lang) {
  try {
    if (SUPPORTED.includes(lang)) localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // no-op — language just won't persist this session
  }
}

export async function loadDictionary(lang) {
  const res = await fetch(`i18n/${lang}.json`);
  return res.json();
}

// §7's intended resolution order is profile → local toggle → English. Call
// this right after a successful login so a second device picks up the same
// language the account was set up with, rather than defaulting to English
// until someone re-taps the toggle there too. Silently no-ops on any failure
// (missing profile, network hiccup) — falls back to whatever's already stored.
export async function syncLanguageFromProfile(supabaseClient, userId) {
  const { data } = await supabaseClient.from('profiles').select('preferred_language').eq('id', userId).maybeSingle();
  if (data?.preferred_language) setStoredLanguage(data.preferred_language);
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
}

// Looks up `path` in `dict` and substitutes `{key}` placeholders from `vars`
// — e.g. t(dict, 'age.week', { n: 3 }) with age.week = "Week {n}" -> "Week 3".
// Falls back to `path` itself if the key is missing, so a translation gap
// shows up as a visible dotted string instead of silently rendering blank.
export function t(dict, path, vars = {}) {
  const raw = getPath(dict, path);
  if (typeof raw !== 'string') return path;
  return raw.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? vars[key] : `{${key}}`));
}

// The common case for every page past login/signup: no visible toggle UI,
// just render whatever language the profile/localStorage already says.
// Returns the dictionary for callers that also need it for JS-driven text
// (error messages, dynamically-built elements, etc).
export async function applyStoredLanguage() {
  const dict = await loadDictionary(getStoredLanguage());
  applyTranslations(dict);
  return dict;
}

export function applyTranslations(dict) {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const value = getPath(dict, el.dataset.i18n);
    if (value) el.textContent = value;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const value = getPath(dict, el.dataset.i18nPlaceholder);
    if (value) el.placeholder = value;
  });
}

// Renders the toggle into `container`, applies the stored (or default)
// language immediately, and re-applies + persists on every click. Returns the
// dictionary currently in effect so callers can use it for their own JS-driven
// text (e.g. error messages that don't map to a static [data-i18n] element).
export async function initLanguageToggle(container) {
  const current = getStoredLanguage();
  container.innerHTML = '';

  for (const { code, label } of LANGS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.className = 'lang-toggle-btn';
    if (code === current) btn.setAttribute('aria-current', 'true');
    btn.addEventListener('click', async () => {
      setStoredLanguage(code);
      container.querySelectorAll('button').forEach((b) => b.removeAttribute('aria-current'));
      btn.setAttribute('aria-current', 'true');
      applyTranslations(await loadDictionary(code));
    });
    container.appendChild(btn);
  }

  const dict = await loadDictionary(current);
  applyTranslations(dict);
  return dict;
}
