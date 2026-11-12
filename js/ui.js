// Briques d'interface réutilisées par toutes les pages : affiches, rangées, pastille de note.
import { html, raw, icon, safeColor, genreFr } from './util.js';
import { store } from './store.js';

export const CATEGORIES = {
  anime: { id: 'anime', label: 'Anime & Manga', native: 'アニメ・漫画', icon: 'play', scope: 'all', blurb: 'Séries, films et mangas : tout ce que tu as vu et lu.', verb: 'vus et lus' },
  manhwa: { id: 'manhwa', label: 'Manhwa', native: '만화', icon: 'book', scope: 'manhwa', blurb: 'Webtoons coréens et manhua.', verb: 'lus' },
  kdrama: { id: 'kdrama', label: 'K-Drama', native: '드라마', icon: 'tv', scope: 'kdrama', blurb: 'Tes séries coréennes.', verb: 'vus' },
};

export const STATUSES = [
  { id: 'completed', label: 'Terminé', icon: 'check' },
  { id: 'watching', label: 'En cours', icon: 'eye' },
  { id: 'planned', label: 'À voir', labelRead: 'À lire', icon: 'bookmark' },
  { id: 'paused', label: 'En pause', icon: 'pause' },
  { id: 'dropped', label: 'Abandonné', icon: 'ban' },
];

export const KIND_LABEL = { anime: 'Anime', manga: 'Manga', manhwa: 'Manhwa', manhua: 'Manhua', novel: 'Light novel', drama: 'Drama' };
export const isRead = (m) => ['manga', 'manhwa', 'manhua', 'novel'].includes(m?.kind);

export function statusLabel(id, m) {
  const s = STATUSES.find((x) => x.id === id);
  if (!s) return '';
  return (isRead(m) && s.labelRead) || s.label;
}

export const countLabel = (m) => (m.episodes ? `${m.episodes} ép.` : m.chapters ? `${m.chapters} ch.` : m.volumes ? `${m.volumes} vol.` : '');
export const metaLine = (m) => [m.year, m.format, countLabel(m)].filter(Boolean).join(' · ');
export const genreLine = (m, n = 3) => (m.genres || []).slice(0, n).map(genreFr).join(', ');

// Pastille de note : un anneau rempli à hauteur de la note sur 100.
export function stamp(score, mod = '') {
  if (score == null) return '';
  return html`<span class="stamp ${mod} ${score >= 90 ? 'stamp--gold' : ''}" style="--p:${Number(score)}" title="Ta note : ${score}/100"><b>${score}</b></span>`;
}

export const img = (src, cls = '') =>
  src ? html`<img class="${cls}" src="${src}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '';

export function card(m, opts = {}) {
  const e = store.get(m.key);
  const v = e || m;
  const tint = safeColor(v.color);
  return html`
    <article class="card ${e ? 'is-owned' : ''}" style="${tint ? `--tint:${tint}` : ''}">
      <a class="card__link" href="#/t/${v.key}">
        <div class="card__poster">
          <div class="card__fallback"><span>${v.title}</span></div>
          ${img(v.cover)}
          <span class="card__kind">${opts.label || KIND_LABEL[v.kind] || v.format}</span>
          ${e && e.score != null ? stamp(e.score) : ''}
          ${e ? html`<span class="card__status card__status--${e.status}">${statusLabel(e.status, e)}</span>` : ''}
          ${!e && opts.affinity ? html`<span class="card__aff"><b>${opts.affinity}</b>% pour toi</span>` : ''}
        </div>
        <h3 class="card__title">${v.title}</h3>
        <p class="card__meta">${metaLine(v)}</p>
        ${opts.because ? html`<p class="card__because">${opts.because}</p>` : ''}
      </a>
      ${e
        ? ''
        : html`<button class="card__add" type="button" data-action="quick-add" data-key="${v.key}" title="Garder pour plus tard" aria-label="Ajouter ${v.title} à ma liste">${icon('plus', 18)}</button>`}
    </article>`;
}

export function row({ title, kicker = '', items, more, opts, id = '', note = '' }) {
  if (!items?.length) return '';
  return html`
    <section class="row" ${id ? html`id="${id}"` : ''}>
      <header class="row__head">
        <div class="row__heading">
          ${kicker ? html`<span class="row__kicker">${kicker}</span>` : ''}
          <h2 class="row__title">${title}</h2>
          ${note ? html`<span class="row__note">${note}</span>` : ''}
        </div>
        <div class="row__tools">
          ${more ? html`<a class="link" href="${more.href}">${more.label}</a>` : ''}
          <button class="iconbtn" type="button" data-action="scroll-row" data-dir="-1" aria-label="Défiler vers la gauche">${icon('left', 18)}</button>
          <button class="iconbtn" type="button" data-action="scroll-row" data-dir="1" aria-label="Défiler vers la droite">${icon('right', 18)}</button>
        </div>
      </header>
      <div class="row__track">${items.map((m) => card(m, opts ? opts(m) : {}))}</div>
    </section>`;
}

export const skeletonCards = (n = 8) => raw(Array.from({ length: n }, () => '<div class="card card--ghost"><div class="card__poster"></div><div class="ghost-line"></div><div class="ghost-line ghost-line--short"></div></div>').join(''));

export const skeletonRow = (title = '') => html`
  <section class="row row--ghost" aria-hidden="true">
    <header class="row__head"><div class="row__heading"><h2 class="row__title">${title}</h2></div></header>
    <div class="row__track">${skeletonCards(9)}</div>
  </section>`;

export function emptyState({ glyph = '空', title, text, actions = '' }) {
  return html`
    <div class="empty">
      <span class="empty__glyph" aria-hidden="true">${glyph}</span>
      <h2 class="empty__title">${title}</h2>
      <p class="empty__text">${text}</p>
      <div class="empty__actions">${actions}</div>
    </div>`;
}

// Carte d'aide affichée tant que la clé TMDB n'est pas renseignée.
export const tmdbSetup = () => html`
  <div class="setup">
    <span class="setup__glyph" aria-hidden="true">드라마</span>
    <div>
      <h2 class="setup__title">Active les K-dramas en 2 minutes</h2>
      <ol class="setup__steps">
        <li>Crée un compte gratuit sur <a href="https://www.themoviedb.org/signup" target="_blank" rel="noopener noreferrer">themoviedb.org</a>.</li>
        <li>Dans ton profil : <b>Paramètres → API</b>, demande une clé (usage personnel).</li>
        <li>Colle la clé dans les réglages de Kiroku. C’est tout.</li>
      </ol>
      <button class="btn btn--primary" type="button" data-action="open-settings">${icon('key', 18)} Coller ma clé TMDB</button>
    </div>
  </div>`;
