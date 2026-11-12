// AniList : base principale pour les anime, mangas, manhwa et manhua (gratuite, sans clé).
import { cacheGet, cacheSet, sleep } from '../util.js';

const ENDPOINT = 'https://graphql.anilist.co';
const HOUR = 3600e3;

const FIELDS = `id type format countryOfOrigin isAdult title{romaji english native} synonyms coverImage{extraLarge large color} bannerImage genres averageScore popularity startDate{year} episodes duration chapters volumes status`;

const FORMAT = {
  TV: 'Série TV', TV_SHORT: 'Format court', MOVIE: 'Film', SPECIAL: 'Spécial', OVA: 'OVA', ONA: 'ONA',
  MUSIC: 'Clip', MANGA: 'Manga', NOVEL: 'Light novel', ONE_SHOT: 'One-shot',
};
const AIRING = { FINISHED: 'Terminé', RELEASING: 'En cours', NOT_YET_RELEASED: 'À venir', CANCELLED: 'Annulé', HIATUS: 'En pause' };
const RELATION = {
  PREQUEL: 'Préquelle', SEQUEL: 'Suite', ADAPTATION: 'Adaptation', SOURCE: 'Œuvre d’origine', SIDE_STORY: 'Histoire parallèle',
  SPIN_OFF: 'Spin-off', ALTERNATIVE: 'Version alternative', PARENT: 'Série principale', SUMMARY: 'Résumé',
  CHARACTER: 'Personnages communs', COMPILATION: 'Compilation', CONTAINS: 'Contient', OTHER: 'Lié',
};
export const ANILIST_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music',
  'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller',
];

async function gql(query, variables = {}, { signal, retry = true } = {}) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('AniList est injoignable (vérifie ta connexion).');
  }
  if (res.status === 429) {
    if (retry) {
      await sleep(2500);
      return gql(query, variables, { signal, retry: false });
    }
    throw new Error('AniList limite le nombre de recherches : réessaie dans une minute.');
  }
  const json = await res.json().catch(() => null);
  if (!json || !json.data || (json.errors && Object.values(json.data).every((v) => v == null))) {
    throw new Error(json?.errors?.[0]?.message || `AniList a répondu ${res.status}.`);
  }
  return json.data;
}

export function fromAnilist(m) {
  if (!m) return null;
  const isAnime = m.type === 'ANIME';
  const c = m.countryOfOrigin || '';
  let kind = 'anime';
  if (!isAnime) kind = c === 'KR' ? 'manhwa' : c === 'CN' || c === 'TW' ? 'manhua' : m.format === 'NOVEL' ? 'novel' : 'manga';
  const title = m.title?.english || m.title?.romaji || m.title?.native || 'Sans titre';
  const titleAlt = [m.title?.romaji, m.title?.native].find((t) => t && t !== title) || '';
  let format = FORMAT[m.format] || (isAnime ? 'Anime' : 'Manga');
  if (m.format === 'MANGA' && kind === 'manhwa') format = 'Manhwa';
  if (m.format === 'MANGA' && kind === 'manhua') format = 'Manhua';
  return {
    key: `anilist:${m.id}`,
    source: 'anilist',
    id: m.id,
    category: kind === 'manhwa' || kind === 'manhua' ? 'manhwa' : 'anime',
    kind,
    title,
    titleAlt,
    titles: [m.title?.romaji, m.title?.english, m.title?.native, ...(m.synonyms || [])].filter(Boolean),
    cover: m.coverImage?.extraLarge || m.coverImage?.large || '',
    banner: m.bannerImage || '',
    color: m.coverImage?.color || '',
    year: m.startDate?.year || null,
    format,
    fmt: m.format || '',
    duration: m.duration || null,
    country: c,
    genres: m.genres || [],
    episodes: m.episodes || null,
    chapters: m.chapters || null,
    volumes: m.volumes || null,
    airing: AIRING[m.status] || '',
    avgScore: m.averageScore || null,
    popularity: m.popularity || 0,
    adult: !!m.isAdult,
    url: `https://anilist.co/${isAnime ? 'anime' : 'manga'}/${m.id}`,
  };
}

const list = (page) => (page?.media || []).map(fromAnilist).filter(Boolean);

export async function searchAnilist(q, scope, { adult = false, signal } = {}) {
  const adultArg = adult ? '' : ', isAdult: false';
  const page = (alias, extra, n) =>
    `${alias}: Page(perPage: ${n}) { media(search: $s${extra}${adultArg}, sort: SEARCH_MATCH) { ${FIELDS} } }`;
  let body;
  if (scope === 'anime') body = page('a', ', type: ANIME', 50);
  else if (scope === 'manga') body = page('a', ', type: MANGA', 36);
  else if (scope === 'manhwa') body = page('a', ', type: MANGA, countryOfOrigin: "KR"', 24) + page('b', ', type: MANGA, countryOfOrigin: "CN"', 12);
  else body = page('a', ', type: ANIME', 50) + page('b', ', type: MANGA', 30);
  const data = await gql(`query ($s: String) { ${body} }`, { s: q }, { signal });
  return [...list(data.a), ...list(data.b)];
}

// Tendances du moment, gardées 6 h en cache.
export async function trending() {
  const cached = cacheGet('trending.v1', 6 * HOUR);
  if (cached) return cached.d;
  const page = (alias, args) => `${alias}: Page(perPage: 18) { media(${args}, sort: TRENDING_DESC, isAdult: false) { ${FIELDS} } }`;
  const data = await gql(`{
    ${page('anime', 'type: ANIME')}
    ${page('manga', 'type: MANGA, countryOfOrigin: "JP"')}
    ${page('manhwa', 'type: MANGA, countryOfOrigin: "KR"')}
  }`);
  const out = { anime: list(data.anime), manga: list(data.manga), manhwa: list(data.manhwa) };
  cacheSet('trending.v1', out);
  return out;
}

export async function anilistDetails(id, { signal } = {}) {
  const data = await gql(
    `query ($id: Int) { Media(id: $id) {
      ${FIELDS}
      description(asHtml: false) siteUrl
      endDate { year }
      studios(isMain: true) { nodes { name } }
      tags { name rank isMediaSpoiler isGeneralSpoiler }
      relations { edges { relationType node { ${FIELDS} } } }
      recommendations(sort: RATING_DESC, perPage: 14) { nodes { rating mediaRecommendation { ${FIELDS} } } }
    } }`,
    { id },
    { signal },
  );
  const m = data.Media;
  if (!m) throw new Error('Fiche introuvable sur AniList.');
  const base = fromAnilist(m);
  const related = (m.relations?.edges || [])
    .filter((e) => e.node && e.node.type && !e.node.isAdult)
    .map((e) => ({ label: RELATION[e.relationType] || 'Lié', media: fromAnilist(e.node) }));
  const similar = (m.recommendations?.nodes || [])
    .filter((n) => n.mediaRecommendation && n.rating > 0 && !n.mediaRecommendation.isAdult)
    .map((n) => fromAnilist(n.mediaRecommendation));
  return {
    ...base,
    description: m.description || '',
    studios: (m.studios?.nodes || []).map((s) => s.name),
    tags: (m.tags || []).filter((t) => !t.isMediaSpoiler && !t.isGeneralSpoiler && t.rank >= 60).slice(0, 8).map((t) => t.name),
    duration: m.duration || null,
    endYear: m.endDate?.year || null,
    url: m.siteUrl || base.url,
    related,
    similar,
  };
}

// Recommandations de la communauté pour plusieurs œuvres en une seule requête.
export async function anilistRecs(ids, { signal } = {}) {
  if (!ids.length) return [];
  const data = await gql(
    `query ($ids: [Int]) { Page(perPage: 30) { media(id_in: $ids) { id
      recommendations(sort: RATING_DESC, perPage: 10) { nodes { rating mediaRecommendation { ${FIELDS} } } }
    } } }`,
    { ids },
    { signal },
  );
  return (data.Page?.media || []).map((m) => ({
    seedId: m.id,
    recs: (m.recommendations?.nodes || [])
      .filter((n) => n.mediaRecommendation && n.rating > 0)
      .map((n) => ({ rating: n.rating, media: fromAnilist(n.mediaRecommendation) })),
  }));
}

// Découverte par genres : les œuvres les mieux notées dans les genres préférés.
export async function anilistDiscover(wants, excludeIds = [], { signal } = {}) {
  const ARGS = {
    anime: 'type: ANIME, popularity_greater: 20000',
    manga: 'type: MANGA, countryOfOrigin: "JP", popularity_greater: 8000',
    manhwa: 'type: MANGA, countryOfOrigin: "KR", popularity_greater: 3000',
  };
  const parts = wants
    .filter((w) => ARGS[w.section] && w.genres.length)
    .map(
      (w) =>
        `${w.section}: Page(perPage: 24) { media(${ARGS[w.section]}, genre_in: ${JSON.stringify(w.genres)}, averageScore_greater: 74, isAdult: false, id_not_in: $ex, sort: SCORE_DESC) { ${FIELDS} } }`,
    );
  if (!parts.length) return {};
  const data = await gql(`query ($ex: [Int]) { ${parts.join('\n')} }`, { ex: excludeIds.length ? excludeIds : [0] }, { signal });
  const out = {};
  for (const k of Object.keys(data)) out[k] = list(data[k]);
  return out;
}
