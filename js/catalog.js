// Catalogue : interroge toutes les sources, fusionne les résultats et garde les fiches en mémoire.
import { norm } from './util.js';
import { store } from './store.js';
import { searchAnilist, anilistDetails } from './sources/anilist.js';
import { searchKitsu, kitsuDetails } from './sources/kitsu.js';
import { searchTmdb, tmdbDetails } from './sources/tmdb.js';

const catalog = new Map();

export function remember(media) {
  if (!media) return media;
  if (Array.isArray(media)) {
    media.forEach(remember);
    return media;
  }
  if (!media.key) return media;
  catalog.set(media.key, { ...catalog.get(media.key), ...media });
  (media.similar || []).forEach(remember);
  (media.related || []).forEach((r) => remember(r.media));
  return media;
}

export const lookup = (key) => catalog.get(key) || store.get(key) || null;

const broad = (m) => (m.kind === 'anime' ? 'anime' : m.kind === 'drama' ? 'drama' : 'print');

// Retire des résultats Kitsu ce qu'AniList a déjà trouvé (même titre, même type d'œuvre).
function withoutDuplicates(primary, extra) {
  const seen = { anime: new Set(), print: new Set(), drama: new Set() };
  for (const m of primary) for (const t of m.titles || [m.title]) seen[broad(m)].add(norm(t));
  const out = [];
  for (const m of extra) {
    const names = (m.titles || [m.title]).map(norm).filter(Boolean);
    if (names.some((n) => seen[broad(m)].has(n))) continue;
    names.forEach((n) => seen[broad(m)].add(n));
    out.push(m);
  }
  return out;
}

const inScope = (m, scope) => {
  if (scope === 'all') return true;
  if (scope === 'anime') return m.kind === 'anime';
  if (scope === 'manga') return m.kind === 'manga' || m.kind === 'novel';
  if (scope === 'manhwa') return m.category === 'manhwa';
  if (scope === 'kdrama') return m.category === 'kdrama';
  return true;
};

export async function search(q, scope = 'all', { signal } = {}) {
  const s = store.settings;
  const jobs = [];
  const wantsDrama = scope === 'all' || scope === 'kdrama';

  if (scope !== 'kdrama') {
    jobs.push(['AniList', 'anilist', searchAnilist(q, scope, { adult: s.adult, signal })]);
    if (scope === 'all' || scope === 'anime') jobs.push(['Kitsu', 'kitsu', searchKitsu(q, 'anime', { signal })]);
    if (scope !== 'anime') {
      jobs.push(['Kitsu', 'kitsu', searchKitsu(q, 'manga', { signal, subtype: scope === 'manhwa' ? 'manhwa,manhua' : '' })]);
    }
  }
  if (wantsDrama && s.tmdbKey) jobs.push(['TMDB', 'tmdb', searchTmdb(q, { all: s.dramaAll, signal })]);

  const settled = await Promise.allSettled(jobs.map((j) => j[2]));
  if (signal?.aborted) throw new DOMException('Recherche annulée', 'AbortError');

  const bySource = { anilist: [], kitsu: [], tmdb: [] };
  const errors = [];
  settled.forEach((r, i) => {
    const [label, source] = jobs[i];
    if (r.status === 'fulfilled') bySource[source].push(...r.value);
    else if (r.reason?.name !== 'AbortError' && !errors.some((e) => e.startsWith(label))) errors.push(`${label} : ${r.reason?.message || 'erreur inconnue'}`);
  });

  const main = bySource.anilist.filter((m) => inScope(m, scope));
  const extra = withoutDuplicates(main, bySource.kitsu.filter((m) => inScope(m, scope)));
  const items = [...main, ...extra, ...bySource.tmdb];
  remember(items);

  if (!items.length && jobs.length && settled.every((r) => r.status === 'rejected')) {
    throw new Error(errors[0] || 'Les bases de données sont injoignables.');
  }
  return { items, errors, needsTmdb: wantsDrama && !s.tmdbKey };
}

export async function details(key, { signal } = {}) {
  const i = key.indexOf(':');
  const source = key.slice(0, i);
  const id = key.slice(i + 1);
  if (source === 'anilist') return remember(await anilistDetails(Number(id), { signal }));
  if (source === 'kitsu') {
    const [type, kid] = id.split('-');
    return remember(await kitsuDetails(type, kid, { signal }));
  }
  if (source === 'tmdb') return remember(await tmdbDetails(Number(id), { signal }));
  const local = lookup(key);
  if (!local) throw new Error('Cette fiche n’existe pas (ou plus).');
  return local;
}
