// La collection de l'utilisateur, sauvegardée dans le navigateur (localStorage).
import { clamp, safeUrl, safeColor } from './util.js';

const LIB_KEY = 'kiroku.library.v1';
const SET_KEY = 'kiroku.settings.v1';

export const STATUS_IDS = ['completed', 'watching', 'planned', 'paused', 'dropped'];
export const CATEGORY_IDS = ['anime', 'manhwa', 'kdrama'];
const KINDS = ['anime', 'manga', 'manhwa', 'manhua', 'novel', 'drama'];

// Champs copiés depuis la fiche d'une œuvre pour l'afficher sans rappeler l'API.
const SNAPSHOT = [
  'key', 'source', 'id', 'category', 'kind', 'title', 'titleAlt', 'cover', 'banner', 'color',
  'year', 'format', 'country', 'genres', 'genreIds', 'episodes', 'chapters', 'volumes', 'avgScore', 'url',
];

function load(k, fallback) {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? fallback;
  } catch {
    return fallback;
  }
}

let items = load(LIB_KEY, {});
if (!items || typeof items !== 'object' || Array.isArray(items)) items = {};
let settings = { tmdbKey: '', adult: false, dramaAll: false, ...load(SET_KEY, {}) };
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}
const emit = (type, key) => listeners.forEach((fn) => fn({ type, key }));

function snapshotOf(media) {
  const snap = {};
  for (const f of SNAPSHOT) if (media[f] !== undefined && media[f] !== null && media[f] !== '') snap[f] = media[f];
  return snap;
}

function cleanScore(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? clamp(n, 0, 100) : null;
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

// Valide une entrée venue d'un fichier importé : on ne garde que des champs sûrs.
function sanitizeEntry(e) {
  if (!e || typeof e !== 'object' || typeof e.key !== 'string' || !e.key || typeof e.title !== 'string' || !e.title.trim()) return null;
  const now = Date.now();
  return {
    key: e.key.slice(0, 80),
    source: ['anilist', 'kitsu', 'tmdb', 'custom'].includes(e.source) ? e.source : 'custom',
    id: typeof e.id === 'number' || typeof e.id === 'string' ? e.id : e.key,
    category: CATEGORY_IDS.includes(e.category) ? e.category : 'anime',
    categoryLocked: !!e.categoryLocked,
    kind: KINDS.includes(e.kind) ? e.kind : 'anime',
    title: e.title.trim().slice(0, 300),
    titleAlt: str(e.titleAlt, 300),
    cover: safeUrl(e.cover),
    banner: safeUrl(e.banner),
    color: safeColor(e.color),
    year: num(e.year),
    format: str(e.format, 40),
    country: str(e.country, 4),
    genres: Array.isArray(e.genres) ? e.genres.filter((g) => typeof g === 'string').slice(0, 20).map((g) => g.slice(0, 40)) : [],
    genreIds: Array.isArray(e.genreIds) ? e.genreIds.filter((g) => Number.isFinite(g)).slice(0, 20) : [],
    episodes: num(e.episodes),
    chapters: num(e.chapters),
    volumes: num(e.volumes),
    avgScore: num(e.avgScore),
    url: safeUrl(e.url),
    status: STATUS_IDS.includes(e.status) ? e.status : 'planned',
    score: cleanScore(e.score),
    review: str(e.review, 2000),
    progress: Math.max(0, Math.round(num(e.progress) || 0)),
    addedAt: num(e.addedAt) || now,
    updatedAt: num(e.updatedAt) || now,
    finishedAt: num(e.finishedAt),
  };
}

export const store = {
  all: () => Object.values(items),
  get: (key) => items[key] || null,
  has: (key) => key in items,
  count: () => Object.keys(items).length,

  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // Ajoute une œuvre (ou met à jour l'existante) avec les changements donnés.
  save(media, patch = {}) {
    const now = Date.now();
    const prev = items[media.key];
    const snap = snapshotOf(media);
    if (prev?.categoryLocked) delete snap.category;
    const next = {
      status: 'planned',
      score: null,
      review: '',
      progress: 0,
      addedAt: now,
      ...prev,
      ...snap,
      ...patch,
      updatedAt: now,
    };
    if ('score' in patch) next.score = cleanScore(patch.score);
    if (!STATUS_IDS.includes(next.status)) next.status = 'planned';
    const total = next.episodes || next.chapters || null;
    if (next.status === 'completed' && prev?.status !== 'completed') {
      next.finishedAt = now;
      if (total) next.progress = total;
    }
    items[media.key] = next;
    const ok = persist();
    emit(prev ? 'update' : 'add', media.key);
    return ok;
  },

  update(key, patch) {
    if (!items[key]) return false;
    return this.save(items[key], patch);
  },

  // Rafraîchit la fiche (bannière, genres…) sans toucher aux données de l'utilisateur.
  refreshSnapshot(media) {
    const prev = items[media?.key];
    if (!prev) return;
    const snap = snapshotOf(media);
    if (prev.categoryLocked) delete snap.category;
    items[media.key] = { ...prev, ...snap };
    persist();
  },

  remove(key) {
    if (!items[key]) return;
    delete items[key];
    persist();
    emit('remove', key);
  },

  clear() {
    items = {};
    persist();
    emit('clear');
  },

  get settings() {
    return settings;
  },
  setSetting(k, v) {
    settings = { ...settings, [k]: v };
    try {
      localStorage.setItem(SET_KEY, JSON.stringify(settings));
    } catch {
      /* rien */
    }
    emit('settings', k);
  },

  exportData() {
    return { app: 'kiroku', version: 1, exportedAt: new Date().toISOString(), items: Object.values(items) };
  },

  // Fusionne un export : pour un même titre, la version modifiée le plus récemment gagne.
  importData(data) {
    const list = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(list)) throw new Error('Ce fichier ne ressemble pas à un export Kiroku.');
    let added = 0;
    let updated = 0;
    let skipped = 0;
    for (const rawEntry of list.slice(0, 20000)) {
      const e = sanitizeEntry(rawEntry);
      if (!e) {
        skipped++;
        continue;
      }
      const prev = items[e.key];
      if (!prev) {
        items[e.key] = e;
        added++;
      } else if ((e.updatedAt || 0) > (prev.updatedAt || 0)) {
        items[e.key] = e;
        updated++;
      }
    }
    if (!persist()) throw new Error('Le navigateur a refusé d’enregistrer (stockage plein ?).');
    emit('import');
    return { added, updated, skipped };
  },
};
