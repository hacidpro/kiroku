// Fiche d'une œuvre : grande bannière, infos, et le panneau « Mon suivi » (statut, note sur 100, avis).
import { html, render, icon, $, toast, debounce, plainText, safeUrl, safeColor, genreFr, verdict, clamp } from './util.js';
import { store, CATEGORY_IDS } from './store.js';
import { lookup, details } from './catalog.js';
import { row, img, CATEGORIES, STATUSES, KIND_LABEL, statusLabel, isRead, countLabel } from './ui.js';

const sheet = $('#sheet');
let media = null;
let token = 0;
let removeArmed = false;

export const isDetailOpen = () => !sheet.hidden;

export function closeDetail() {
  if (sheet.hidden) return;
  flushReview();
  sheet.hidden = true;
  sheet.innerHTML = '';
  document.body.classList.remove('is-locked');
  media = null;
  token++;
}

const entry = () => (media ? store.get(media.key) : null);
// Vue fusionnée : la fiche la plus fraîche, plus les choix de l'utilisateur.
const view = () => {
  const e = entry();
  return e ? { ...e, ...media, category: e.category, status: e.status, score: e.score, review: e.review, progress: e.progress } : media;
};

/* ---------- rendu ---------- */

const bannerHtml = () => {
  const v = view();
  if (!v) return html`<div class="d-banner d-banner--ghost"></div>`;
  return html`<div class="d-banner ${v.banner ? '' : 'd-banner--blur'}">${img(v.banner || v.cover)}</div>`;
};

const posterHtml = () => {
  const v = view();
  return v ? html`<div class="card__fallback"><span>${v.title}</span></div>${img(v.cover)}` : '';
};

function idHtml() {
  const v = view();
  if (!v) return '';
  const facts = [
    v.avgScore ? [v.avgScore, 'note du public /100'] : null,
    countLabel(v) ? [countLabel(v).replace(/ (ép|ch|vol)\.$/, ''), v.episodes ? 'épisodes' : v.chapters ? 'chapitres' : 'volumes'] : null,
    v.seasons ? [v.seasons, v.seasons > 1 ? 'saisons' : 'saison'] : null,
    v.duration ? [`${v.duration} min`, 'par épisode'] : null,
    v.airing ? [v.airing, 'parution'] : null,
    v.studios?.length ? [v.studios[0], v.kind === 'drama' ? 'chaîne' : 'studio'] : null,
  ].filter(Boolean);
  return html`
    <p class="hero__kicker"><span class="tag">${KIND_LABEL[v.kind] || 'Œuvre'}</span><span>${[v.format, v.year && (v.endYear && v.endYear !== v.year ? `${v.year} – ${v.endYear}` : v.year)].filter(Boolean).join(' · ')}</span></p>
    <h1 class="d-title" id="d-title">${v.title}</h1>
    ${v.titleAlt ? html`<p class="d-alt">${v.titleAlt}</p>` : ''}
    ${facts.length ? html`<ul class="d-facts">${facts.map(([n, l]) => html`<li><b>${n}</b><span>${l}</span></li>`)}</ul>` : ''}
    ${v.genres?.length ? html`<div class="chips chips--static">${v.genres.slice(0, 8).map((g) => html`<span class="chip">${genreFr(g)}</span>`)}</div>` : ''}`;
}

function trackHtml() {
  const v = view();
  if (!v) return '';
  const e = entry();
  const score = e?.score ?? null;
  const total = v.episodes || v.chapters || null;
  const unit = isRead(v) ? 'chapitres' : 'épisodes';
  const showProgress = e && ['watching', 'paused', 'dropped'].includes(e.status);
  const cat = e?.category || v.category;
  return html`
    <h2 class="track__title">Mon suivi <span class="track__saved" id="saved" aria-live="polite"></span></h2>
    ${e ? '' : html`<p class="track__hint">Pas encore dans ta liste. Choisis un statut ou donne directement une note.</p>`}

    <div class="seg seg--status" role="group" aria-label="Statut">
      ${STATUSES.map(
        (s) => html`<button class="seg__btn ${e?.status === s.id ? 'is-on' : ''}" type="button" data-status="${s.id}" aria-pressed="${e?.status === s.id ? 'true' : 'false'}">${icon(s.icon, 16)}${statusLabel(s.id, v)}</button>`,
      )}
    </div>

    <div class="score ${score == null ? 'is-empty' : ''} ${score != null && score >= 90 ? 'is-gold' : ''}" id="score">
      <div class="score__read">
        <output class="score__num" id="score-num" for="score-range">${score ?? '—'}</output>
        <span class="score__max">/100</span>
        <span class="score__verdict" id="score-verdict">${verdict(score)}</span>
      </div>
      <input class="score__range" id="score-range" type="range" min="0" max="100" step="1" value="${score ?? 0}" style="--v:${score ?? 0}" aria-label="Ma note sur 100">
      <div class="score__scale" aria-hidden="true"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
      <div class="score__tools">
        <button class="mini" type="button" data-nudge="-1" aria-label="Baisser la note de 1">${icon('minus', 14)} 1</button>
        <button class="mini" type="button" data-nudge="1" aria-label="Monter la note de 1">${icon('plus', 14)} 1</button>
        ${score != null ? html`<button class="mini mini--ghost" type="button" data-act="clear-score">Effacer la note</button>` : ''}
      </div>
    </div>

    ${e?.status === 'completed'
      ? html`<label class="field">
          <span class="field__label">Mon avis <i>facultatif</i></span>
          <textarea id="review" rows="4" maxlength="1500" placeholder="Ce que tu en as pensé, en quelques mots…">${e.review || ''}</textarea>
        </label>`
      : e
        ? html`<p class="track__hint">Tu pourras écrire ton avis une fois le titre terminé.</p>`
        : ''}

    ${showProgress
      ? html`<div class="progress">
          <span class="field__label">Progression</span>
          <div class="progress__row">
            <button class="mini" type="button" data-step="-1" aria-label="Un de moins">${icon('minus', 14)}</button>
            <span class="progress__val"><b id="progress-val">${e.progress || 0}</b>${total ? ` / ${total}` : ''} ${unit}</span>
            <button class="mini" type="button" data-step="1" aria-label="Un de plus">${icon('plus', 14)}</button>
          </div>
        </div>`
      : ''}

    ${e
      ? html`<div class="track__foot">
          <label class="select select--sm"><span>Rangé dans</span>
            <select id="cat-select">${CATEGORY_IDS.map((id) => html`<option value="${id}" ${cat === id ? 'selected' : ''}>${CATEGORIES[id].label}</option>`)}</select>
          </label>
          ${v.source === 'custom' ? html`<button class="mini mini--ghost" type="button" data-action="manual-add" data-key="${v.key}">${icon('pen', 14)} Modifier la fiche</button>` : ''}
          <button class="mini mini--danger" type="button" data-act="remove">${icon('trash', 14)} ${removeArmed ? 'Confirmer le retrait' : 'Retirer de ma liste'}</button>
        </div>`
      : ''}`;
}

function bodyHtml(state) {
  const v = view();
  if (state === 'loading') return html`<div class="ghost-line"></div><div class="ghost-line"></div><div class="ghost-line ghost-line--short"></div>`;
  const desc = plainText(v?.description);
  const url = safeUrl(v?.url);
  const SOURCE = { anilist: 'AniList', kitsu: 'Kitsu', tmdb: 'TMDB' };
  return html`
    ${typeof state === 'string' && state.startsWith('error:') ? html`<p class="notice notice--warn">Impossible de charger tous les détails. ${state.slice(6)}</p>` : ''}
    <section class="d-sec">
      <h2 class="d-sec__title">Synopsis</h2>
      ${desc
        ? html`<p class="d-desc ${desc.length > 520 ? 'is-clamped' : ''}" id="d-desc">${desc}</p>
            ${desc.length > 520 ? html`<button class="link" type="button" data-act="more">Lire la suite</button>` : ''}`
        : html`<p class="d-desc d-desc--none">Pas de synopsis disponible pour ce titre.</p>`}
    </section>
    ${v?.tags?.length ? html`<div class="chips chips--static chips--faint">${v.tags.map((t) => html`<span class="chip">${t}</span>`)}</div>` : ''}
    ${url && SOURCE[v.source] ? html`<a class="link link--out" href="${url}" target="_blank" rel="noopener noreferrer">Voir la fiche sur ${SOURCE[v.source]} ${icon('external', 14)}</a>` : ''}`;
}

function rowsHtml() {
  const v = view();
  if (!v) return '';
  const related = (v.related || []).filter((r) => r.media);
  const labels = new Map(related.map((r) => [r.media.key, r.label]));
  return html`
    ${row({ kicker: '関連', title: 'Dans le même univers', items: related.map((r) => r.media), opts: (m) => ({ because: labels.get(m.key) }) })}
    ${row({ kicker: v.category === 'anime' ? 'おすすめ' : '추천', title: 'Si tu as aimé, tu aimeras', items: (v.similar || []).filter((m) => !store.has(m.key)) })}`;
}

function paint(part, arg) {
  if (!media && part !== 'head') return;
  if (part === 'head') {
    render($('#d-banner', sheet), bannerHtml());
    render($('#d-poster', sheet), posterHtml());
    render($('#d-id', sheet), idHtml());
    const tint = safeColor(view()?.color);
    sheet.style.setProperty('--tint', tint || '#ff4326');
  }
  if (part === 'track') render($('#d-track', sheet), trackHtml());
  if (part === 'body') render($('#d-body', sheet), bodyHtml(arg));
  if (part === 'rows') render($('#d-rows', sheet), rowsHtml());
}

export async function openDetail(key) {
  flushReview();
  const my = ++token;
  removeArmed = false;
  const known = lookup(key);
  media = known ? { ...known } : null;
  sheet.hidden = false;
  document.body.classList.add('is-locked');
  render(
    sheet,
    html`
      <div class="sheet__scroll" role="dialog" aria-modal="true" aria-labelledby="d-title">
        <button class="sheet__close" type="button" data-action="close-detail" aria-label="Fermer la fiche">${icon('x', 22)}</button>
        <div id="d-banner"></div>
        <div class="d-grid wrap">
          <div class="d-poster" id="d-poster"></div>
          <div class="d-id" id="d-id"></div>
          <aside class="track" id="d-track" aria-label="Mon suivi"></aside>
          <div class="d-body" id="d-body"></div>
        </div>
        <div class="rows" id="d-rows"></div>
      </div>`,
  );
  paint('head');
  paint('track');
  const isCustom = key.startsWith('custom:');
  paint('body', isCustom ? 'ready' : 'loading');
  $('.sheet__close', sheet)?.focus({ preventScroll: true });
  if (isCustom) {
    if (!media) paint('body', 'error:Cette fiche n’existe pas (ou plus).');
    return;
  }

  try {
    const full = await details(key);
    if (my !== token) return;
    media = { ...(media || {}), ...full };
    store.refreshSnapshot(media);
    paint('head');
    if (!known) paint('track');
    paint('body', 'ready');
    paint('rows');
  } catch (e) {
    if (my !== token) return;
    if (!media) {
      render($('#d-body', sheet), html`<p class="notice notice--warn">Fiche introuvable. ${e.message}</p>`);
      return;
    }
    paint('body', `error:${e.message}`);
  }
}

/* ---------- actions de l'utilisateur ---------- */

function flashSaved(ok = true) {
  const el = $('#saved', sheet);
  if (!el) return;
  el.textContent = ok ? 'Enregistré' : 'Stockage plein : non enregistré';
  el.classList.toggle('is-error', !ok);
  el.classList.remove('is-on');
  void el.offsetWidth;
  el.classList.add('is-on');
}

// Crée l'entrée si besoin, sinon la met à jour. Retourne true si elle vient d'être créée.
function commit(patch, defaults = {}) {
  if (!media) return false;
  const existed = store.has(media.key);
  const ok = store.save(media, existed ? patch : { ...defaults, ...patch });
  flashSaved(ok);
  return !existed;
}

function setScore(value, { repaint = true } = {}) {
  const score = value == null ? null : clamp(Math.round(value), 0, 100);
  const created = commit({ score }, { status: 'completed' });
  if (created) toast(`« ${media.title} » ajouté à ta liste comme terminé.`);
  if (repaint || created) {
    paint('track');
    flashSaved(true);
  }
}

function showScore(score) {
  const box = $('#score', sheet);
  if (!box) return;
  $('#score-num', sheet).textContent = score;
  $('#score-verdict', sheet).textContent = verdict(score);
  $('#score-range', sheet).style.setProperty('--v', score);
  box.classList.remove('is-empty');
  box.classList.toggle('is-gold', score >= 90);
}

const saveReview = debounce(() => flushReview(), 600);
function flushReview() {
  saveReview.cancel?.();
  const ta = $('#review', sheet);
  if (!ta || !media || !store.has(media.key)) return;
  if (ta.value === (store.get(media.key).review || '')) return;
  flashSaved(store.update(media.key, { review: ta.value.slice(0, 1500) }));
}

sheet.addEventListener('click', (ev) => {
  if (!media) return;
  const t = ev.target;
  const statusBtn = t.closest('[data-status]');
  if (statusBtn) {
    flushReview();
    removeArmed = false;
    const created = commit({ status: statusBtn.dataset.status });
    if (created) toast(`« ${media.title} » ajouté à ta liste.`);
    paint('track');
    flashSaved(true);
    if (statusBtn.dataset.status === 'completed') $('#review', sheet)?.focus({ preventScroll: true });
    return;
  }
  const nudge = t.closest('[data-nudge]');
  if (nudge) {
    const cur = entry()?.score ?? Number($('#score-range', sheet).value) ?? 0;
    setScore(cur + Number(nudge.dataset.nudge));
    return;
  }
  const step = t.closest('[data-step]');
  if (step && entry()) {
    const e = entry();
    const total = e.episodes || e.chapters || null;
    const next = clamp((e.progress || 0) + Number(step.dataset.step), 0, total || 99999);
    if (total && next >= total) {
      commit({ progress: total, status: 'completed' });
      toast(`« ${media.title} » terminé ! Donne-lui une note.`);
    } else {
      commit({ progress: next });
    }
    paint('track');
    flashSaved(true);
    return;
  }
  const act = t.closest('[data-act]')?.dataset.act;
  if (act === 'clear-score') setScore(null);
  if (act === 'more') {
    $('#d-desc', sheet)?.classList.remove('is-clamped');
    t.closest('[data-act]').remove();
  }
  if (act === 'remove') {
    if (!removeArmed) {
      removeArmed = true;
      paint('track');
      return;
    }
    removeArmed = false;
    const title = media.title;
    const wasCustom = media.source === 'custom';
    store.remove(media.key);
    toast(`« ${title} » retiré de ta liste.`);
    // Une fiche ajoutée à la main n'existe plus nulle part une fois retirée : on referme.
    if (wasCustom) $('.sheet__close', sheet)?.click();
    else paint('track');
  }
});

sheet.addEventListener('input', (ev) => {
  if (ev.target.id === 'score-range') showScore(Number(ev.target.value));
  if (ev.target.id === 'review') saveReview();
});

sheet.addEventListener('change', (ev) => {
  if (!media) return;
  if (ev.target.id === 'score-range') setScore(Number(ev.target.value), { repaint: entry()?.score == null });
  if (ev.target.id === 'review') flushReview();
  if (ev.target.id === 'cat-select' && CATEGORY_IDS.includes(ev.target.value)) {
    commit({ category: ev.target.value, categoryLocked: true });
    toast(`Rangé dans ${CATEGORIES[ev.target.value].label}.`);
  }
});
