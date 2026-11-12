// Outils partagés : gabarits HTML échappés, icônes, cache, petites fonctions.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
export const raw = (s) => ({ __raw: String(s ?? '') });

function toHtml(v) {
  if (v == null || v === false || v === true) return '';
  if (Array.isArray(v)) return v.map(toHtml).join('');
  if (typeof v === 'object' && '__raw' in v) return v.__raw;
  return esc(v);
}

// html`...` échappe toute valeur interpolée, sauf celles passées par raw() ou un autre html`...`.
export function html(strings, ...vals) {
  let s = '';
  for (let i = 0; i < strings.length; i++) {
    s += strings[i];
    if (i < vals.length) s += toHtml(vals[i]);
  }
  return raw(s);
}

export function render(el, tpl) {
  if (el) el.innerHTML = tpl && tpl.__raw !== undefined ? tpl.__raw : '';
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function debounce(fn, ms = 300) {
  let t;
  const d = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}

// Normalise un titre pour comparer deux sources entre elles.
export const norm = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9぀-ヿ一-鿿가-힯]+/g, '');

export function safeUrl(u) {
  if (!u || typeof u !== 'string') return '';
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '';
  } catch {
    return '';
  }
}

export const safeColor = (c) => (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : '');

// Transforme une description venue d'une API (qui peut contenir du HTML) en texte brut.
export function plainText(s) {
  if (!s) return '';
  const doc = new DOMParser().parseFromString(String(s).replace(/<br\s*\/?>/gi, '\n'), 'text/html');
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

export function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* ---------- cache local (réponses d'API) ---------- */
const CP = 'kiroku.cache.';
export function cacheGet(key, maxAge) {
  try {
    const v = JSON.parse(localStorage.getItem(CP + key));
    if (!v || typeof v.t !== 'number') return null;
    if (maxAge && Date.now() - v.t > maxAge) return null;
    return v;
  } catch {
    return null;
  }
}
export function cacheSet(key, d) {
  try {
    localStorage.setItem(CP + key, JSON.stringify({ t: Date.now(), d }));
  } catch {
    /* stockage plein : on se passe du cache */
  }
}
export function cacheClear() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(CP))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* rien */
  }
}

/* ---------- genres ---------- */
const GENRE_FR = {
  Action: 'Action',
  Adventure: 'Aventure',
  Comedy: 'Comédie',
  Drama: 'Drame',
  Ecchi: 'Ecchi',
  Fantasy: 'Fantasy',
  Horror: 'Horreur',
  'Mahou Shoujo': 'Magical girl',
  Mecha: 'Mecha',
  Music: 'Musique',
  Mystery: 'Mystère',
  Psychological: 'Psychologique',
  Romance: 'Romance',
  'Sci-Fi': 'Science-fiction',
  'Science Fiction': 'Science-fiction',
  'Slice of Life': 'Tranche de vie',
  Sports: 'Sport',
  Supernatural: 'Surnaturel',
  Thriller: 'Thriller',
  Historical: 'Historique',
  School: 'École',
  'School Life': 'Vie scolaire',
  Violence: 'Violence',
  Demon: 'Démons',
  Magic: 'Magie',
  Isekai: 'Isekai',
  'Martial Arts': 'Arts martiaux',
  Military: 'Militaire',
  Seinen: 'Seinen',
  Shounen: 'Shōnen',
  Shoujo: 'Shōjo',
  Josei: 'Josei',
  Crime: 'Crime',
  War: 'Guerre',
  Family: 'Famille',
  Friendship: 'Amitié',
};
export const genreFr = (g) => GENRE_FR[g] || g;

/* ---------- note sur 100 ---------- */
export function verdict(score) {
  if (score == null) return 'Pas encore noté';
  if (score >= 95) return 'Chef-d’œuvre absolu';
  if (score >= 90) return 'Chef-d’œuvre';
  if (score >= 80) return 'Excellent';
  if (score >= 70) return 'Très bon';
  if (score >= 60) return 'Bon';
  if (score >= 50) return 'Correct';
  if (score >= 35) return 'Décevant';
  return 'À fuir';
}

/* ---------- icônes ---------- */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  play: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="m10 8 5 3-5 3z"/><path d="M8 21h8"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5A2.5 2.5 0 0 0 6.5 22H20v-3"/>',
  tv: '<rect x="2" y="7" width="20" height="13" rx="2"/><path d="m8 2 4 5 4-5"/>',
  spark: '<path d="m12 3 1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9z"/><path d="M19 3v4M17 5h4M5 17v3M3.5 18.5h3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  bookmark: '<path d="M6 3h12v18l-6-4.5L6 21z"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  download: '<path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M4 20h16"/>',
  upload: '<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 20h16"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 5v3h3M4 13a8 8 0 0 0 14.9 3M20 19v-3h-3"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/>',
};
export const icon = (name, size = 20) =>
  raw(
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`,
  );

/* ---------- notifications ---------- */
export function toast(message, { action, onAction, tone = '' } = {}) {
  const host = $('#toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${tone ? `toast--${tone}` : ''}`;
  el.setAttribute('role', 'status');
  const span = document.createElement('span');
  span.textContent = message;
  el.append(span);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action;
    b.addEventListener('click', () => {
      onAction?.();
      el.remove();
    });
    el.append(b);
  }
  host.append(el);
  while (host.children.length > 3) host.firstChild.remove();
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 320);
  }, action ? 5200 : 3200);
}
