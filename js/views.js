// Les pages du site : accueil, catégories, recherche, recommandations.
import { html, render, icon, $, $$, safeColor, verdict } from './util.js';
import { store } from './store.js';
import { card, row, skeletonRow, skeletonCards, stamp, img, emptyState, tmdbSetup, CATEGORIES, STATUSES, KIND_LABEL, statusLabel, metaLine, genreLine } from './ui.js';
import { search, remember } from './catalog.js';
import { trending } from './sources/anilist.js';
import { tmdbPopular } from './sources/tmdb.js';
import { getRecommendations, flatTop, SECTIONS } from './reco.js';

const byUpdated = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);
const errorNote = (msg) => html`<p class="notice notice--warn">${msg}</p>`;

/* ================= Bandeau cinéma (accueil) ================= */

function heroSlide(m, mode, i) {
  const e = store.get(m.key);
  const v = e ? { ...m, ...e } : m;
  const tint = safeColor(v.color);
  const context =
    mode === 'trend'
      ? 'Tendance du moment'
      : e?.score != null
        ? `${verdict(e.score)} · dans ta collection`
        : `${statusLabel(e?.status, v)} · dans ta collection`;
  return html`
    <article class="hero__slide ${i === 0 ? 'is-active' : ''}" style="${tint ? `--tint:${tint}` : ''}">
      <div class="hero__bg ${v.banner ? '' : 'hero__bg--blur'}">
        ${v.banner
          ? html`<picture>${v.cover ? html`<source media="(max-aspect-ratio: 1/1)" srcset="${v.cover}">` : ''}${img(v.banner)}</picture>`
          : img(v.cover)}
      </div>
      <div class="hero__shade"></div>
      ${v.banner ? '' : img(v.cover, 'hero__poster')}
      <div class="hero__content">
        <p class="hero__kicker"><span class="tag">${KIND_LABEL[v.kind] || v.format}</span><span>${context}</span></p>
        <h1 class="hero__title">${v.title}</h1>
        <p class="hero__meta">${[metaLine(v), genreLine(v)].filter(Boolean).join(' · ')}</p>
        <div class="hero__cta">
          ${e?.score != null ? html`<span class="hero__score">${stamp(e.score, 'stamp--lg')}<span>Ta note<br><b>${e.score}/100</b></span></span>` : ''}
          <a class="btn btn--primary" href="#/t/${v.key}">${e ? 'Ouvrir la fiche' : 'Découvrir'}</a>
          ${e ? '' : html`<button class="btn btn--glass" type="button" data-action="quick-add" data-key="${v.key}">${icon('plus', 18)} À voir</button>`}
        </div>
      </div>
    </article>`;
}

const hero = (list, mode) => html`
  <section class="hero" data-hero>
    <div class="hero__slides">${list.map((m, i) => heroSlide(m, mode, i))}</div>
    <span class="hero__vert" aria-hidden="true">記録 — KIROKU</span>
    ${list.length > 1
      ? html`<div class="hero__dots">${list.map((_, i) => html`<button class="hero__dot ${i === 0 ? 'is-active' : ''}" type="button" data-i="${i}" aria-label="Affiche ${i + 1}"></button>`)}</div>`
      : ''}
  </section>`;

function mountHero(root) {
  const el = $('[data-hero]', root);
  if (!el) return () => {};
  const slides = $$('.hero__slide', el);
  const dots = $$('.hero__dot', el);
  if (slides.length < 2) return () => {};
  let i = 0;
  let timer;
  const go = (n) => {
    i = (n + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle('is-active', k === i));
    dots.forEach((d, k) => d.classList.toggle('is-active', k === i));
  };
  const stop = () => clearInterval(timer);
  const start = () => {
    stop();
    timer = setInterval(() => go(i + 1), 8000);
  };
  const onClick = (e) => {
    const d = e.target.closest('.hero__dot');
    if (!d) return;
    go(Number(d.dataset.i));
    start();
  };
  el.addEventListener('click', onClick);
  start();
  return () => {
    stop();
    el.removeEventListener('click', onClick);
  };
}

function pickFeatured(lib) {
  return lib
    .filter((e) => e.banner || e.cover)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || Number(!!b.banner) - Number(!!a.banner) || byUpdated(a, b))
    .slice(0, 6);
}

function statsBand(lib) {
  const scored = lib.filter((e) => e.score != null);
  const avg = scored.length ? Math.round(scored.reduce((t, e) => t + e.score, 0) / scored.length) : null;
  const done = lib.filter((e) => e.status === 'completed').length;
  const per = (cat) => lib.filter((e) => e.category === cat).length;
  const buckets = Array(10).fill(0);
  scored.forEach((e) => buckets[Math.min(9, Math.floor(e.score / 10))]++);
  const max = Math.max(1, ...buckets);
  return html`
    <section class="stats" aria-label="Ta collection en chiffres">
      <div class="stat"><b class="stat__num">${lib.length}</b><span class="stat__label">${lib.length > 1 ? 'titres dans ta collection' : 'titre dans ta collection'}</span></div>
      <div class="stat"><b class="stat__num">${avg ?? '—'}<small>/100</small></b><span class="stat__label">ta note moyenne</span></div>
      <div class="stat"><b class="stat__num">${done}</b><span class="stat__label">${done > 1 ? 'terminés' : 'terminé'}</span></div>
      <div class="stat stat--cats">
        ${Object.values(CATEGORIES).map((c) => html`<a href="#/${c.id}"><b>${per(c.id)}</b><span>${c.label}</span></a>`)}
      </div>
      <div class="stat stat--histo">
        <div class="histo" role="img" aria-label="Répartition de tes notes de 0 à 100">
          ${buckets.map((n, i) => html`<i style="--h:${Math.round((n / max) * 100)}" title="${i * 10} à ${i === 9 ? 100 : i * 10 + 9} : ${n}"></i>`)}
        </div>
        <span class="stat__label">tes notes, de 0 à 100</span>
      </div>
    </section>`;
}

const welcomeBand = () => html`
  <section class="welcome">
    <p class="eyebrow">ようこそ · Bienvenue</p>
    <h2 class="welcome__title">Ta collection commence ici.</h2>
    <ol class="welcome__steps">
      <li><b>01</b><h3>Cherche</h3><p>N’importe quel anime, manga, manhwa ou K-drama, des plus connus aux plus obscurs.</p></li>
      <li><b>02</b><h3>Note sur 100</h3><p>Donne ta note, et écris ton avis une fois que tu as tout vu.</p></li>
      <li><b>03</b><h3>Découvre</h3><p>Kiroku te propose des titres proches de ceux que tu as aimés.</p></li>
    </ol>
    <button class="btn btn--primary" type="button" data-action="focus-search">${icon('search', 18)} Chercher mon premier titre</button>
  </section>`;

export function renderHome(root) {
  let alive = true;
  const stops = [];
  const lib = store.all();
  const featured = pickFeatured(lib);
  const watching = lib.filter((e) => e.status === 'watching').sort(byUpdated).slice(0, 20);
  const recent = [...lib].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, 20);
  const pantheon = lib.filter((e) => e.score != null && e.score >= 85).sort((a, b) => b.score - a.score).slice(0, 20);
  const planned = lib.filter((e) => e.status === 'planned').sort(byUpdated).slice(0, 20);

  render(
    root,
    html`
      <div id="home-hero">${featured.length ? hero(featured, 'mine') : html`<section class="hero hero--ghost"></section>`}</div>
      ${lib.length ? statsBand(lib) : welcomeBand()}
      <div class="rows">
        ${row({ kicker: '視聴中', title: 'Reprends où tu en étais', items: watching })}
        ${row({ kicker: '新着', title: 'Derniers ajouts', items: recent })}
        ${row({ kicker: '殿堂', title: 'Ton panthéon', note: 'noté 85 et plus', items: pantheon })}
        <div id="home-reco"></div>
        ${row({ kicker: '予定', title: 'Gardés pour plus tard', items: planned })}
        <div id="home-trend">${skeletonRow('Tendances du moment')}</div>
        <div id="home-drama"></div>
      </div>`,
  );
  stops.push(mountHero(root));

  if (lib.length) {
    getRecommendations({ allowStale: true })
      .then((reco) => {
        if (!alive) return;
        const top = flatTop(reco, 18);
        const info = new Map(top.map((r) => [r.media.key, r]));
        render(
          $('#home-reco', root),
          row({
            kicker: 'おすすめ',
            title: 'Recommandé pour toi',
            items: top.map((r) => r.media),
            opts: (m) => ({ because: info.get(m.key)?.because, affinity: info.get(m.key)?.affinity }),
            more: { href: '#/pour-toi', label: 'Tout voir' },
          }),
        );
      })
      .catch(() => {});
  }

  trending()
    .then((t) => {
      if (!alive) return;
      remember([...t.anime, ...t.manga, ...t.manhwa]);
      if (!featured.length) {
        const slides = t.anime.filter((m) => m.banner).slice(0, 6);
        if (slides.length) {
          render($('#home-hero', root), hero(slides, 'trend'));
          stops.push(mountHero(root));
        }
      }
      render(
        $('#home-trend', root),
        html`
          ${row({ kicker: '人気', title: 'Anime du moment', items: t.anime })}
          ${row({ kicker: '人気', title: 'Mangas du moment', items: t.manga })}
          ${row({ kicker: '인기', title: 'Manhwa du moment', items: t.manhwa })}`,
      );
    })
    .catch((e) => alive && render($('#home-trend', root), html`<div class="wrap">${errorNote(`Tendances indisponibles pour l’instant. ${e.message}`)}</div>`));

  if (store.settings.tmdbKey) {
    tmdbPopular()
      .then((list) => {
        if (!alive) return;
        remember(list);
        render($('#home-drama', root), row({ kicker: '인기', title: 'K-dramas du moment', items: list }));
      })
      .catch(() => {});
  }

  return () => {
    alive = false;
    stops.forEach((s) => s());
  };
}

/* ================= Page d'une catégorie ================= */

const catState = {
  anime: { sub: 'all', status: 'all', sort: 'recent' },
  manhwa: { sub: 'all', status: 'all', sort: 'recent' },
  kdrama: { sub: 'all', status: 'all', sort: 'recent' },
};
const SORTS = {
  recent: ['Ajout récent', (a, b) => (b.addedAt || 0) - (a.addedAt || 0)],
  score: ['Meilleures notes', (a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.addedAt || 0) - (a.addedAt || 0)],
  title: ['Titre A → Z', (a, b) => a.title.localeCompare(b.title, 'fr')],
  year: ['Année de sortie', (a, b) => (b.year || 0) - (a.year || 0)],
};

const stripsHtml = (srcs) => html`<div class="cathero__strips">${srcs.slice(0, 6).map((s) => html`<div>${img(s)}</div>`)}</div>`;

function catHero(C, items, strips) {
  const scored = items.filter((e) => e.score != null);
  const avg = scored.length ? Math.round(scored.reduce((t, e) => t + e.score, 0) / scored.length) : null;
  const summary = items.length
    ? `${items.length} ${items.length > 1 ? 'titres' : 'titre'}${avg != null ? ` · moyenne ${avg}/100` : ''}`
    : 'Encore vide';
  return html`
    <div id="cat-strips">${stripsHtml(strips)}</div>
    <div class="cathero__shade"></div>
    <span class="cathero__native" aria-hidden="true">${C.native}</span>
    <div class="cathero__content wrap">
      <p class="eyebrow">Ma collection · ${summary}</p>
      <h1 class="cathero__title">${C.label}</h1>
      <p class="cathero__blurb">${C.blurb}</p>
      <a class="btn btn--primary" href="#/recherche?scope=${C.scope}">${icon('plus', 18)} Ajouter un titre</a>
    </div>`;
}

export function renderCategory(root, catId) {
  const C = CATEGORIES[catId];
  const st = catState[catId];
  let alive = true;
  const items = store.all().filter((e) => e.category === catId);
  const strips = [...items].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((e) => e.banner || e.cover).filter(Boolean);

  render(
    root,
    html`
      <section class="cathero">${catHero(C, items, strips)}</section>
      <div class="wrap" id="cat-body"></div>
      <div class="rows" id="cat-reco"></div>`,
  );

  const drawBody = () => {
    let list = items;
    if (catId === 'anime' && st.sub !== 'all') list = list.filter((e) => (st.sub === 'anime' ? e.kind === 'anime' : e.kind !== 'anime'));
    const counts = {};
    for (const e of list) counts[e.status] = (counts[e.status] || 0) + 1;
    const total = list.length;
    if (st.status !== 'all') list = list.filter((e) => e.status === st.status);
    list = [...list].sort(SORTS[st.sort][1]);

    if (!items.length) {
      render(
        $('#cat-body', root),
        catId === 'kdrama' && !store.settings.tmdbKey
          ? tmdbSetup()
          : emptyState({
              glyph: '空',
              title: `Aucun titre dans ${C.label} pour l’instant`,
              text: 'Cherche un titre, donne-lui une note sur 100 : il apparaîtra ici avec son affiche.',
              actions: html`<a class="btn btn--primary" href="#/recherche?scope=${C.scope}">${icon('search', 18)} Chercher un titre</a>`,
            }),
      );
      return;
    }

    const chip = (id, label, n) =>
      html`<button class="chip ${st.status === id ? 'is-on' : ''}" type="button" data-filter="status" data-value="${id}">${label}<i>${n}</i></button>`;
    render(
      $('#cat-body', root),
      html`
        <div class="toolbar">
          ${catId === 'anime'
            ? html`<div class="seg seg--sm" role="group" aria-label="Type">
                ${[['all', 'Tout'], ['anime', 'Anime'], ['manga', 'Manga']].map(
                  ([id, label]) => html`<button class="seg__btn ${st.sub === id ? 'is-on' : ''}" type="button" data-filter="sub" data-value="${id}">${label}</button>`,
                )}
              </div>`
            : ''}
          <div class="chips">
            ${chip('all', 'Tous', total)}
            ${STATUSES.filter((s) => counts[s.id]).map((s) => chip(s.id, s.label, counts[s.id]))}
          </div>
          <label class="select"><span>Trier</span>
            <select data-sort>${Object.entries(SORTS).map(([id, [label]]) => html`<option value="${id}" ${st.sort === id ? 'selected' : ''}>${label}</option>`)}</select>
          </label>
        </div>
        ${list.length ? html`<div class="grid">${list.map((m) => card(m))}</div>` : html`<p class="notice">Aucun titre ne correspond à ce filtre.</p>`}`,
    );
  };
  drawBody();

  const onClick = (e) => {
    const f = e.target.closest('[data-filter]');
    if (!f) return;
    st[f.dataset.filter] = f.dataset.value;
    if (f.dataset.filter === 'sub') st.status = 'all';
    drawBody();
  };
  const onChange = (e) => {
    if (!e.target.matches('[data-sort]')) return;
    st.sort = e.target.value;
    drawBody();
  };
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);

  // Catégorie vide : on habille le bandeau avec les tendances.
  if (!strips.length && catId !== 'kdrama') {
    trending()
      .then((t) => {
        if (!alive) return;
        const src = (catId === 'manhwa' ? t.manhwa : t.anime).map((m) => m.banner || m.cover).filter(Boolean);
        render($('#cat-strips', root), stripsHtml(src));
      })
      .catch(() => {});
  }

  const recoSlot = $('#cat-reco', root);
  const wanted = catId === 'anime' ? ['anime', 'manga'] : [catId];
  if (store.count()) {
    getRecommendations({ allowStale: true })
      .then((reco) => {
        if (!alive) return;
        const picks = flatTop({ sections: Object.fromEntries(wanted.map((s) => [s, reco.sections[s] || []])) }, 18);
        const info = new Map(picks.map((r) => [r.media.key, r]));
        render(
          recoSlot,
          row({
            kicker: catId === 'anime' ? 'おすすめ' : '추천',
            title: `Recommandé pour toi · ${C.label}`,
            items: picks.map((r) => r.media),
            opts: (m) => ({ because: info.get(m.key)?.because, affinity: info.get(m.key)?.affinity }),
            more: { href: '#/pour-toi', label: 'Tout voir' },
          }),
        );
      })
      .catch(() => {});
  }
  if (catId === 'kdrama' && store.settings.tmdbKey) {
    tmdbPopular()
      .then((list) => {
        if (!alive) return;
        remember(list);
        if (!strips.length) render($('#cat-strips', root), stripsHtml(list.map((m) => m.banner || m.cover).filter(Boolean)));
        recoSlot.insertAdjacentHTML('beforeend', row({ kicker: '인기', title: 'Populaires en Corée', items: list.filter((m) => !store.has(m.key)) }).__raw || '');
      })
      .catch(() => {});
  }

  return () => {
    alive = false;
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
  };
}

/* ================= Recherche ================= */

const SCOPES = [['all', 'Tout'], ['anime', 'Anime'], ['manga', 'Manga'], ['manhwa', 'Manhwa'], ['kdrama', 'K-Drama']];
const searchCache = new Map();

export const cleanScope = (s) => (SCOPES.some((x) => x[0] === s) ? s : 'all');
export const searchHref = (q, scope) => `#/recherche?${new URLSearchParams({ ...(q ? { q } : {}), scope }).toString()}`;

function resultsHtml(res, q, scope) {
  const groups =
    scope === 'all'
      ? [
          ['Anime', (m) => m.kind === 'anime'],
          ['Manga & light novels', (m) => m.category === 'anime' && m.kind !== 'anime'],
          ['Manhwa & manhua', (m) => m.category === 'manhwa'],
          ['K-Drama', (m) => m.category === 'kdrama'],
        ]
      : [['', () => true]];
  const blocks = groups
    .map(([label, test]) => [label, res.items.filter(test)])
    .filter(([, list]) => list.length)
    .map(
      ([label, list]) => html`
        <section class="results">
          ${label ? html`<h2 class="results__title">${label}<i>${list.length}</i></h2>` : ''}
          <div class="grid">${list.map((m) => card(m))}</div>
        </section>`,
    );
  return html`
    ${res.errors.map((e) => errorNote(e))}
    ${res.needsTmdb
      ? scope === 'kdrama'
        ? tmdbSetup()
        : html`<p class="notice">K-dramas non inclus : <button class="link" type="button" data-action="open-settings">ajoute ta clé TMDB gratuite</button> pour les chercher aussi.</p>`
      : ''}
    ${blocks.length
      ? blocks
      : res.needsTmdb && scope === 'kdrama'
        ? ''
        : emptyState({ glyph: '無', title: `Rien trouvé pour « ${q} »`, text: 'Essaie le titre original (japonais ou coréen romanisé), un titre plus court, ou ajoute-le toi-même.' })}
    <div class="manual">
      <p>Tu ne trouves pas ton titre ?</p>
      <button class="btn btn--glass" type="button" data-action="manual-add" data-title="${q}">${icon('pen', 18)} L’ajouter à la main</button>
    </div>`;
}

export function renderSearch(root, params) {
  const q = (params.get('q') || '').trim().slice(0, 120);
  const scope = cleanScope(params.get('scope'));
  const s = store.settings;
  let alive = true;
  const ctrl = new AbortController();

  render(
    root,
    html`
      <section class="searchpage wrap">
        <header class="pagehead">
          <p class="eyebrow">検索 · Recherche</p>
          <h1 class="pagehead__title">${q ? html`Résultats pour <em>« ${q} »</em>` : 'Que veux-tu ajouter ?'}</h1>
          <div class="chips">
            ${SCOPES.map(([id, label]) => html`<a class="chip ${id === scope ? 'is-on' : ''}" href="${searchHref(q, id)}">${label}</a>`)}
            ${scope === 'kdrama' && s.tmdbKey
              ? html`<button class="chip chip--toggle ${s.dramaAll ? 'is-on' : ''}" type="button" data-action="toggle-drama-all">${icon(s.dramaAll ? 'check' : 'plus', 14)} Dramas d’autres pays</button>`
              : ''}
          </div>
        </header>
        <div id="search-body"></div>
      </section>`,
  );
  const body = $('#search-body', root);

  if (q.length < 2) {
    render(
      body,
      html`
        ${emptyState({
          glyph: '探',
          title: 'Tape un titre dans la barre de recherche',
          text: 'Deux lettres suffisent. La recherche fouille AniList, Kitsu et TMDB en même temps, y compris pour les titres très peu connus.',
        })}
        <div class="manual">
          <p>Un titre introuvable partout ?</p>
          <button class="btn btn--glass" type="button" data-action="manual-add">${icon('pen', 18)} L’ajouter à la main</button>
        </div>`,
    );
    return () => {
      alive = false;
    };
  }

  const cacheKey = [scope, q.toLowerCase(), s.adult ? 1 : 0, s.dramaAll ? 1 : 0, s.tmdbKey ? 1 : 0].join('|');
  const cached = searchCache.get(cacheKey);
  if (cached) {
    render(body, resultsHtml(cached, q, scope));
  } else {
    render(body, html`<div class="grid">${skeletonCards(12)}</div>`);
    search(q, scope, { signal: ctrl.signal })
      .then((res) => {
        if (!res.errors.length) searchCache.set(cacheKey, res);
        if (alive) render(body, resultsHtml(res, q, scope));
      })
      .catch((e) => {
        if (!alive || e.name === 'AbortError') return;
        render(
          body,
          html`${emptyState({ glyph: '嵐', title: 'La recherche a échoué', text: e.message })}
            <div class="manual"><button class="btn btn--glass" type="button" data-action="manual-add" data-title="${q}">${icon('pen', 18)} Ajouter « ${q} » à la main</button></div>`,
        );
      });
  }

  return () => {
    alive = false;
    ctrl.abort();
  };
}

/* ================= Recommandations ================= */

const RECO_TITLES = { anime: ['おすすめ', 'Anime à voir'], manga: ['おすすめ', 'Mangas à lire'], manhwa: ['추천', 'Manhwa à lire'], kdrama: ['추천', 'K-dramas à voir'] };

function featureHtml(r) {
  const m = r.media;
  const tint = safeColor(m.color);
  return html`
    <a class="feature" href="#/t/${m.key}" style="${tint ? `--tint:${tint}` : ''}">
      <div class="feature__bg ${m.banner ? '' : 'feature__bg--blur'}">${img(m.banner || m.cover)}</div>
      <div class="feature__shade"></div>
      <div class="feature__body">
        <p class="eyebrow">Notre pari n°1 pour toi</p>
        <h2 class="feature__title">${m.title}</h2>
        <p class="feature__meta">${[KIND_LABEL[m.kind] !== m.format && KIND_LABEL[m.kind], metaLine(m), genreLine(m)].filter(Boolean).join(' · ')}</p>
        <p class="feature__because">${r.because}</p>
      </div>
      <div class="feature__aff"><b>${r.affinity}</b><span>% d’affinité</span></div>
    </a>`;
}

function recoHtml(reco) {
  const all = SECTIONS.flatMap((sec) => reco.sections[sec] || []);
  if (!all.length) {
    return html`
      ${reco.notes.map((n) => errorNote(n))}
      ${emptyState({
        glyph: '好',
        title: reco.seedCount ? 'Pas encore de recommandation' : 'Dis-moi ce que tu aimes',
        text: reco.seedCount
          ? 'Je n’ai rien trouvé de neuf à partir de tes titres. Ajoute et note d’autres œuvres pour élargir.'
          : 'Ajoute quelques titres et note ceux que tu as aimés 70 ou plus : tes recommandations apparaîtront ici.',
        actions: html`<button class="btn btn--primary" type="button" data-action="focus-search">${icon('search', 18)} Ajouter des titres</button>`,
      })}`;
  }
  const best = all.filter((r) => r.via === 'similar').sort((a, b) => b.score - a.score)[0] || all[0];
  return html`
    ${reco.notes.map((n) => html`<div class="wrap">${errorNote(n)}</div>`)}
    <div class="wrap">${featureHtml(best)}</div>
    ${SECTIONS.map((sec) => {
      const list = (reco.sections[sec] || []).filter((r) => r.media.key !== best.media.key);
      if (!list.length) return '';
      const [kicker, title] = RECO_TITLES[sec];
      return html`
        <section class="results wrap">
          <h2 class="results__title"><span class="row__kicker">${kicker}</span>${title}<i>${list.length}</i></h2>
          <div class="grid">${list.map((r) => card(r.media, { because: r.because, affinity: r.affinity }))}</div>
        </section>`;
    })}
    ${store.settings.tmdbKey ? '' : html`<div class="wrap"><p class="notice">Pour recevoir aussi des K-dramas : <button class="link" type="button" data-action="open-settings">ajoute ta clé TMDB gratuite</button>.</p></div>`}`;
}

export function renderReco(root) {
  let alive = true;
  render(
    root,
    html`
      <section class="recopage">
        <header class="pagehead wrap">
          <p class="eyebrow">おすすめ · Pour toi</p>
          <h1 class="pagehead__title">Ce que tu devrais voir ensuite</h1>
          <p class="pagehead__text">Calculé à partir des titres que tu as notés 70 et plus, de ce que leurs fans ont aussi aimé, et de tes genres préférés. Rien de ce qui est déjà dans ta liste n’apparaît ici.</p>
          <button class="btn btn--glass" type="button" data-action="refresh-reco">${icon('refresh', 18)} Recalculer</button>
        </header>
        <div id="reco-body"></div>
      </section>`,
  );
  const body = $('#reco-body', root);
  const load = (force) => {
    if (!store.count()) {
      render(body, recoHtml({ sections: {}, notes: [], seedCount: 0 }));
      return;
    }
    render(body, html`<div class="wrap"><div class="feature feature--ghost"></div><div class="grid">${skeletonCards(12)}</div></div>`);
    getRecommendations({ force })
      .then((reco) => alive && render(body, recoHtml(reco)))
      .catch((e) => alive && render(body, emptyState({ glyph: '嵐', title: 'Calcul impossible pour l’instant', text: e.message })));
  };
  const onClick = (e) => {
    if (e.target.closest('[data-action="refresh-reco"]')) load(true);
  };
  root.addEventListener('click', onClick);
  load(false);
  return () => {
    alive = false;
    root.removeEventListener('click', onClick);
  };
}
