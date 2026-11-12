// Recommandations : part des titres que tu as bien notés, croise les suggestions de la
// communauté (AniList, TMDB) et tes genres préférés, puis écarte ce qui est déjà dans ta liste.
import { cacheGet, cacheSet, hash, genreFr, norm } from './util.js';
import { store } from './store.js';
import { remember } from './catalog.js';
import { anilistRecs, anilistDiscover, ANILIST_GENRES } from './sources/anilist.js';
import { tmdbRecs, tmdbDiscover } from './sources/tmdb.js';

const DAY = 24 * 3600e3;
const CACHE = 'reco.v1';
export const SECTIONS = ['anime', 'manga', 'manhwa', 'kdrama'];

export const sectionOf = (m) => (m.category === 'kdrama' ? 'kdrama' : m.category === 'manhwa' ? 'manhwa' : m.kind === 'anime' ? 'anime' : 'manga');

function signature(lib) {
  const s = store.settings;
  const body = lib.map((e) => `${e.key}:${e.score ?? ''}:${e.status}`).sort().join('|');
  return hash(`${body}#${s.tmdbKey ? 1 : 0}${s.adult ? 1 : 0}${s.dramaAll ? 1 : 0}`);
}

// Un titre « graine » : noté 70 ou plus, ou terminé/en cours sans note.
function seedsOf(lib) {
  return lib
    .filter((e) => e.status !== 'dropped')
    .filter((e) => (e.score != null ? e.score >= 70 : e.status === 'completed' || e.status === 'watching'))
    .map((e) => ({ entry: e, weight: e.score != null ? (e.score - 50) / 50 : 0.45 }))
    .sort((a, b) => b.weight - a.weight || (b.entry.updatedAt || 0) - (a.entry.updatedAt || 0));
}

// Affinité par genre, entre -1 (tu n'aimes pas) et 1 (tu adores).
function genreAffinity(lib) {
  const sum = {};
  for (const e of lib) {
    const w = e.score != null ? (e.score - 60) / 40 : e.status === 'dropped' ? -0.5 : e.status === 'completed' ? 0.25 : 0.1;
    for (const g of e.genres || []) sum[g] = (sum[g] || 0) + w;
  }
  const max = Math.max(0.0001, ...Object.values(sum).map(Math.abs));
  const aff = {};
  for (const g of Object.keys(sum)) aff[g] = sum[g] / max;
  return aff;
}

const topGenres = (aff, allowed, n = 3) =>
  Object.entries(aff)
    .filter(([g, v]) => v > 0 && (!allowed || allowed.includes(g)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([g]) => g);

const affinityPct = (score) => Math.max(40, Math.min(99, Math.round(100 * (1 - Math.exp(-1.6 * score)))));

function becauseText(titles) {
  if (!titles.length) return '';
  if (titles.length === 1) return `Parce que tu as aimé ${titles[0]}`;
  return `Parce que tu as aimé ${titles[0]} et ${titles[1]}`;
}

async function compute(lib) {
  const settings = store.settings;
  const seeds = seedsOf(lib);
  const out = { sections: { anime: [], manga: [], manhwa: [], kdrama: [] }, seedCount: seeds.length, notes: [] };
  if (!seeds.length) return out;

  const owned = new Set(lib.map((e) => e.key));
  // Même titre déjà dans la liste (l'anime d'un manga lu, par exemple) : pas une découverte.
  const ownedTitles = new Set(lib.map((e) => norm(e.title)));
  const aff = genreAffinity(lib);
  const cands = new Map();
  const add = (media, contrib, why) => {
    if (!media || owned.has(media.key) || ownedTitles.has(norm(media.title)) || (media.adult && !settings.adult)) return;
    const c = cands.get(media.key) || { media, score: 0, why: new Map() };
    c.score += contrib;
    c.why.set(why, (c.why.get(why) || 0) + contrib);
    cands.set(media.key, c);
  };

  // 1. Anime, mangas, manhwa : « ceux qui ont aimé X ont aussi aimé Y » (AniList).
  const alSeeds = seeds.filter((s) => s.entry.source === 'anilist').slice(0, 24);
  if (alSeeds.length) {
    try {
      const byId = new Map(alSeeds.map((s) => [Number(s.entry.id), s]));
      for (const res of await anilistRecs(alSeeds.map((s) => Number(s.entry.id)))) {
        const seed = byId.get(res.seedId);
        if (!seed) continue;
        const top = Math.max(1, ...res.recs.map((r) => r.rating));
        for (const r of res.recs) add(r.media, seed.weight * Math.sqrt(r.rating / top), seed.entry.title);
      }
    } catch (e) {
      out.notes.push(e.message);
    }
  }

  // 2. K-dramas : recommandations TMDB pour tes dramas préférés.
  const dramaSeeds = seeds.filter((s) => s.entry.source === 'tmdb').slice(0, 8);
  if (settings.tmdbKey && dramaSeeds.length) {
    const results = await Promise.allSettled(dramaSeeds.map((s) => tmdbRecs(s.entry.id)));
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      r.value.forEach((m, rank) => add(m, dramaSeeds[i].weight * (1 - (rank / Math.max(1, r.value.length)) * 0.7), dramaSeeds[i].entry.title));
    });
    if (results.every((r) => r.status === 'rejected')) out.notes.push(results[0].reason?.message || 'TMDB est injoignable.');
  }

  // 3. Score final : suggestions de la communauté + affinité de genres + qualité générale.
  for (const c of cands.values()) {
    const g = c.media.genres || [];
    const taste = g.length ? g.reduce((t, x) => t + (aff[x] || 0), 0) / g.length : 0;
    const total = c.score + taste * 0.3 + ((c.media.avgScore || 60) / 100) * 0.2;
    const why = [...c.why.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    out.sections[sectionOf(c.media)].push({ media: c.media, score: total, affinity: affinityPct(total), because: becauseText(why), via: 'similar' });
  }

  // 4. Sections trop maigres : on complète avec les mieux notés de tes genres préférés.
  const libBySection = (sec) => lib.filter((e) => sectionOf(e) === sec);
  const wants = [];
  for (const sec of ['anime', 'manga', 'manhwa']) {
    if (out.sections[sec].length >= 8) continue;
    const local = topGenres(genreAffinity(libBySection(sec)), ANILIST_GENRES);
    const genres = local.length ? local : topGenres(aff, ANILIST_GENRES);
    if (genres.length) wants.push({ section: sec, genres });
  }
  if (wants.length) {
    try {
      const exclude = lib.filter((e) => e.source === 'anilist').map((e) => Number(e.id));
      const found = await anilistDiscover(wants, exclude);
      for (const w of wants) {
        const have = new Set(out.sections[w.section].map((r) => r.media.key));
        for (const m of found[w.section] || []) {
          if (have.has(m.key) || owned.has(m.key) || ownedTitles.has(norm(m.title))) continue;
          const shared = (m.genres || []).filter((g) => w.genres.includes(g));
          const score = 0.25 + shared.length * 0.12 + ((m.avgScore || 70) / 100) * 0.2;
          out.sections[w.section].push({ media: m, score, affinity: affinityPct(score), because: `Tes genres : ${w.genres.map(genreFr).join(', ')}`, via: 'genres' });
        }
      }
    } catch (e) {
      if (!out.notes.includes(e.message)) out.notes.push(e.message);
    }
  }
  if (settings.tmdbKey && out.sections.kdrama.length < 8) {
    const dramas = libBySection('kdrama');
    const ids = {};
    for (const e of dramas) {
      const w = e.score != null ? (e.score - 60) / 40 : 0.2;
      for (const id of e.genreIds || []) ids[id] = (ids[id] || 0) + w;
    }
    const best = Object.entries(ids).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => Number(id));
    if (best.length) {
      try {
        const have = new Set(out.sections.kdrama.map((r) => r.media.key));
        for (const m of await tmdbDiscover(best)) {
          if (have.has(m.key) || owned.has(m.key)) continue;
          const score = 0.25 + ((m.avgScore || 70) / 100) * 0.3;
          out.sections.kdrama.push({ media: m, score, affinity: affinityPct(score), because: 'Dans tes genres de dramas préférés', via: 'genres' });
        }
      } catch (e) {
        if (!out.notes.includes(e.message)) out.notes.push(e.message);
      }
    }
  }

  for (const sec of SECTIONS) out.sections[sec] = out.sections[sec].sort((a, b) => b.score - a.score).slice(0, 24);
  return out;
}

// Remet les fiches en mémoire et retire ce qui a été ajouté à la liste depuis le calcul.
function hydrate(data) {
  const sections = {};
  const ownedTitles = new Set(store.all().map((e) => norm(e.title)));
  for (const sec of SECTIONS) {
    sections[sec] = (data.sections?.[sec] || []).filter((r) => r.media && !store.has(r.media.key) && !ownedTitles.has(norm(r.media.title)));
    remember(sections[sec].map((r) => r.media));
  }
  return { ...data, sections };
}

let inflight = null;

export async function getRecommendations({ force = false, allowStale = false } = {}) {
  const lib = store.all();
  const sig = signature(lib);
  const cached = cacheGet(CACHE, DAY);
  if (cached && !force) {
    const sameLibrary = cached.d.sig === sig;
    const recent = Date.now() - cached.t < 10 * 60e3;
    if (sameLibrary || (allowStale && recent)) return hydrate(cached.d.data);
  }
  if (inflight && inflight.sig === sig) return inflight.promise;
  const promise = compute(lib)
    .then((data) => {
      // On ne met pas en cache un calcul raté (source injoignable) pour pouvoir réessayer.
      if (!data.notes.length) cacheSet(CACHE, { sig, data });
      return hydrate(data);
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  inflight = { sig, promise };
  return promise;
}

export function flatTop(reco, n = 16) {
  const lists = SECTIONS.map((s) => [...(reco.sections[s] || [])]);
  const out = [];
  while (out.length < n && lists.some((l) => l.length)) for (const l of lists) if (l.length && out.length < n) out.push(l.shift());
  return out;
}
