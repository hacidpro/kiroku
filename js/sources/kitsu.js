// Kitsu : seconde base, utile pour les titres rares absents d'AniList (gratuite, sans clé).
const BASE = 'https://kitsu.app/api/edge';

const FORMAT = {
  tv: 'Série TV', movie: 'Film', ova: 'OVA', ona: 'ONA', special: 'Spécial', music: 'Clip',
  manga: 'Manga', manhwa: 'Manhwa', manhua: 'Manhua', novel: 'Light novel', oneshot: 'One-shot', doujin: 'Doujin', oel: 'Webcomic',
};
// Format ramené à la nomenclature d'AniList, pour trier les résultats de la même façon.
const FMT = { tv: 'TV', movie: 'MOVIE', ova: 'OVA', ona: 'ONA', special: 'SPECIAL', music: 'MUSIC', oneshot: 'ONE_SHOT', doujin: 'DOUJIN', novel: 'NOVEL' };
const AIRING = { current: 'En cours', finished: 'Terminé', tba: 'À annoncer', unreleased: 'À venir', upcoming: 'À venir' };

async function get(path, params, { signal } = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params || {})) if (v !== '' && v != null) url.searchParams.set(k, v);
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/vnd.api+json' }, signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('Kitsu est injoignable.');
  }
  if (!res.ok) throw new Error(`Kitsu a répondu ${res.status}.`);
  return res.json();
}

function fromKitsu(node, included = []) {
  const a = node.attributes || {};
  const type = node.type === 'anime' ? 'anime' : 'manga';
  const sub = String(a.subtype || '').toLowerCase();
  let kind = 'anime';
  if (type === 'manga') kind = sub === 'manhwa' ? 'manhwa' : sub === 'manhua' ? 'manhua' : sub === 'novel' ? 'novel' : 'manga';
  const all = [a.titles?.en, a.canonicalTitle, a.titles?.en_jp, a.titles?.en_us, ...Object.values(a.titles || {}), ...(a.abbreviatedTitles || [])].filter(Boolean);
  const title = a.titles?.en || a.canonicalTitle || all[0] || 'Sans titre';
  const titleAlt = [a.canonicalTitle, a.titles?.en_jp, a.titles?.ja_jp, a.titles?.ko_kr].find((t) => t && t !== title) || '';
  const catIds = new Set((node.relationships?.categories?.data || []).map((c) => c.id));
  const genres = included.filter((i) => i.type === 'categories' && catIds.has(i.id)).map((i) => i.attributes?.title).filter(Boolean);
  const rating = Number(a.averageRating);
  return {
    key: `kitsu:${type}-${node.id}`,
    source: 'kitsu',
    id: `${type}-${node.id}`,
    category: kind === 'manhwa' || kind === 'manhua' ? 'manhwa' : 'anime',
    kind,
    title,
    titleAlt,
    titles: [...new Set(all)],
    cover: a.posterImage?.large || a.posterImage?.original || a.posterImage?.medium || '',
    banner: a.coverImage?.large || a.coverImage?.original || '',
    color: '',
    year: a.startDate ? Number(String(a.startDate).slice(0, 4)) || null : null,
    format: FORMAT[sub] || (type === 'anime' ? 'Anime' : 'Manga'),
    fmt: FMT[sub] || (type === 'anime' ? '' : 'MANGA'),
    duration: a.episodeLength || null,
    country: '',
    genres: genres.slice(0, 8),
    episodes: a.episodeCount || null,
    chapters: a.chapterCount || null,
    volumes: a.volumeCount || null,
    airing: AIRING[a.status] || '',
    avgScore: Number.isFinite(rating) && rating > 0 ? Math.round(rating) : null,
    popularity: a.userCount || 0,
    adult: a.ageRating === 'R18',
    url: a.slug ? `https://kitsu.app/${type}/${a.slug}` : '',
    description: a.synopsis || a.description || '',
  };
}

export async function searchKitsu(q, type, { signal, subtype = '' } = {}) {
  const json = await get(
    `/${type}`,
    { 'filter[text]': q, 'filter[subtype]': subtype, 'page[limit]': 12, include: 'categories', 'fields[categories]': 'title' },
    { signal },
  );
  return (json.data || []).map((n) => fromKitsu(n, json.included)).filter((m) => !m.adult);
}

export async function kitsuDetails(type, id, { signal } = {}) {
  const json = await get(`/${type === 'anime' ? 'anime' : 'manga'}/${encodeURIComponent(id)}`, { include: 'categories', 'fields[categories]': 'title' }, { signal });
  if (!json.data) throw new Error('Fiche introuvable sur Kitsu.');
  return { ...fromKitsu(json.data, json.included), studios: [], tags: [], related: [], similar: [] };
}
