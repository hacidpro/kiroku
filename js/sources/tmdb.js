// TMDB : base pour les K-dramas. Nécessite une clé gratuite, collée dans les réglages du site.
import { cacheGet, cacheSet } from '../util.js';
import { store } from '../store.js';

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';
const DAY = 24 * 3600e3;
// Animation, actualités, téléréalité, talk-shows : pas des dramas.
const NOT_DRAMA = [16, 10763, 10764, 10767];
const AIRING = {
  Ended: 'Terminé', 'Returning Series': 'En cours', Canceled: 'Annulé', 'In Production': 'En production', Planned: 'À venir', Pilot: 'Pilote',
};

export const hasTmdbKey = () => !!store.settings.tmdbKey;

async function get(path, params = {}, { signal, key, language = 'fr-FR' } = {}) {
  const k = String(key ?? store.settings.tmdbKey ?? '').trim();
  if (!k) throw new Error('Clé TMDB manquante : ajoute-la dans les réglages.');
  const url = new URL(BASE + path);
  url.searchParams.set('language', language);
  for (const [name, v] of Object.entries(params)) if (v !== '' && v != null) url.searchParams.set(name, v);
  const headers = { Accept: 'application/json' };
  // Jeton v4 (long, commence par eyJ) : envoyé en en-tête. Clé v3 : paramètre standard de TMDB.
  if (k.startsWith('eyJ')) headers.Authorization = `Bearer ${k}`;
  else url.searchParams.set('api_key', k);
  let res;
  try {
    res = await fetch(url, { headers, signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('TMDB est injoignable.');
  }
  if (res.status === 401) throw new Error('Clé TMDB refusée : vérifie-la dans les réglages.');
  if (res.status === 404) throw new Error('Fiche introuvable sur TMDB.');
  if (!res.ok) throw new Error(`TMDB a répondu ${res.status}.`);
  return res.json();
}

export async function testTmdbKey(key) {
  await get('/configuration', {}, { key });
  return true;
}

async function genreMap(opts) {
  const cached = cacheGet('tmdb.genres.v1', 30 * DAY);
  if (cached) return cached.d;
  const json = await get('/genre/tv/list', {}, opts);
  const map = {};
  for (const g of json.genres || []) map[g.id] = g.name;
  cacheSet('tmdb.genres.v1', map);
  return map;
}

function fromTmdb(t, genres = {}) {
  const ids = t.genre_ids || (t.genres || []).map((g) => g.id) || [];
  const names = t.genres ? t.genres.map((g) => g.name) : ids.map((id) => genres[id]).filter(Boolean);
  const title = t.name || t.original_name || 'Sans titre';
  return {
    key: `tmdb:${t.id}`,
    source: 'tmdb',
    id: t.id,
    category: 'kdrama',
    kind: 'drama',
    title,
    titleAlt: t.original_name && t.original_name !== title ? t.original_name : '',
    titles: [t.name, t.original_name].filter(Boolean),
    cover: t.poster_path ? `${IMG}w500${t.poster_path}` : '',
    banner: t.backdrop_path ? `${IMG}w1280${t.backdrop_path}` : '',
    color: '',
    year: t.first_air_date ? Number(t.first_air_date.slice(0, 4)) || null : null,
    format: 'Drama',
    country: (t.origin_country || [])[0] || '',
    lang: t.original_language || '',
    genres: names,
    genreIds: ids,
    episodes: t.number_of_episodes || null,
    avgScore: t.vote_average ? Math.round(t.vote_average * 10) : null,
    popularity: t.popularity || 0,
    adult: !!t.adult,
    url: `https://www.themoviedb.org/tv/${t.id}`,
  };
}

const isKorean = (m) => m.lang === 'ko' || m.country === 'KR';
const isDrama = (m) => !(m.genreIds || []).some((id) => NOT_DRAMA.includes(id));

// Garde les dramas coréens ; `all` élargit aux dramas des autres pays.
function keep(list, all) {
  const dramas = list.filter(isDrama);
  if (all) return [...dramas.filter(isKorean), ...dramas.filter((m) => !isKorean(m))];
  return dramas.filter(isKorean);
}

export async function searchTmdb(q, { all = false, signal } = {}) {
  const [json, genres] = await Promise.all([get('/search/tv', { query: q, include_adult: 'false' }, { signal }), genreMap({ signal })]);
  return keep((json.results || []).map((t) => fromTmdb(t, genres)), all);
}

export async function tmdbDetails(id, { signal } = {}) {
  const [t, genres] = await Promise.all([get(`/tv/${id}`, { append_to_response: 'recommendations' }, { signal }), genreMap({ signal })]);
  const base = fromTmdb(t, genres);
  let description = t.overview || '';
  if (!description) {
    // Pas de résumé français : on se rabat sur l'anglais.
    const en = await get(`/tv/${id}`, {}, { signal, language: 'en-US' }).catch(() => null);
    description = en?.overview || '';
  }
  return {
    ...base,
    description,
    studios: (t.networks || []).map((n) => n.name).slice(0, 2),
    tags: [],
    seasons: t.number_of_seasons || null,
    airing: AIRING[t.status] || t.status || '',
    related: [],
    similar: keep((t.recommendations?.results || []).map((r) => fromTmdb(r, genres)), store.settings.dramaAll).slice(0, 14),
  };
}

export async function tmdbRecs(id, { signal } = {}) {
  const [json, genres] = await Promise.all([get(`/tv/${id}/recommendations`, {}, { signal }), genreMap({ signal })]);
  return keep((json.results || []).map((t) => fromTmdb(t, genres)), store.settings.dramaAll);
}

async function discover(params, { signal } = {}) {
  const [json, genres] = await Promise.all([
    get(
      '/discover/tv',
      { with_origin_country: 'KR', with_original_language: 'ko', without_genres: NOT_DRAMA.join(','), include_adult: 'false', ...params },
      { signal },
    ),
    genreMap({ signal }),
  ]);
  return (json.results || []).map((t) => fromTmdb(t, genres));
}

// Dramas coréens bien notés dans les genres préférés.
export const tmdbDiscover = (genreIds = [], opts) =>
  discover({ with_genres: genreIds.join('|'), sort_by: 'vote_average.desc', 'vote_count.gte': 150 }, opts);

// Dramas coréens populaires en ce moment, gardés 6 h en cache.
export async function tmdbPopular(opts) {
  const cached = cacheGet('tmdb.popular.v1', 6 * 3600e3);
  if (cached) return cached.d;
  const out = await discover({ sort_by: 'popularity.desc', 'vote_count.gte': 40 }, opts);
  cacheSet('tmdb.popular.v1', out);
  return out;
}
