// Point d'entrée : navigation entre les pages, recherche, raccourcis et actions globales.
import { $, $$, debounce, toast } from './util.js';
import { store } from './store.js';
import { lookup } from './catalog.js';
import { renderHome, renderCategory, renderSearch, renderReco, cleanScope, searchHref } from './views.js';
import { openDetail, closeDetail, isDetailOpen } from './detail.js';
import { openSettings, openManualAdd, closeModal, isModalOpen } from './settings.js';
import { CATEGORIES, statusLabel } from './ui.js';

const view = $('#view');
const nav = $('#nav');
const input = $('#q');

let base = null; // la page affichée sous une éventuelle fiche
let cleanup = null;
let dirty = false;
let hops = 0;
let rerenderTimer;

const TITLES = { '/': 'Accueil', '/anime': 'Anime & Manga', '/manhwa': 'Manhwa', '/kdrama': 'K-Drama', '/pour-toi': 'Pour toi', '/recherche': 'Recherche' };

function parse() {
  const h = location.hash.replace(/^#/, '') || '/';
  const i = h.indexOf('?');
  const path = i === -1 ? h : h.slice(0, i);
  return { path: path || '/', params: new URLSearchParams(i === -1 ? '' : h.slice(i + 1)) };
}

function renderBase(route, keepScroll = false) {
  const y = window.scrollY;
  if (!TITLES[route.path]) route = { path: '/', params: new URLSearchParams() };
  clearTimeout(rerenderTimer);
  cleanup?.();
  cleanup = null;
  base = route;
  dirty = false;
  $$('[data-nav]').forEach((a) => a.classList.toggle('is-active', a.dataset.nav === route.path));
  document.title = `${TITLES[route.path]} · Kiroku`;

  if (route.path === '/anime' || route.path === '/manhwa' || route.path === '/kdrama') cleanup = renderCategory(view, route.path.slice(1));
  else if (route.path === '/pour-toi') cleanup = renderReco(view);
  else if (route.path === '/recherche') cleanup = renderSearch(view, route.params);
  else cleanup = renderHome(view);

  if (route.path === '/recherche') {
    const q = route.params.get('q') || '';
    if (document.activeElement !== input) input.value = q;
    if (!q && !keepScroll) input.focus({ preventScroll: true });
  } else if (document.activeElement !== input) {
    input.value = '';
  }
  window.scrollTo(0, keepScroll ? y : 0);
}

function onRoute() {
  const r = parse();
  if (r.path.startsWith('/t/')) {
    if (!base) renderBase({ path: '/', params: new URLSearchParams() });
    let key = r.path.slice(3);
    try {
      key = decodeURIComponent(key);
    } catch {
      /* clé déjà lisible */
    }
    openDetail(key);
    return;
  }
  closeDetail();
  const same = base && base.path === r.path && base.params.toString() === r.params.toString();
  if (same && !dirty) return;
  renderBase(r, !!same);
}

// La collection a changé : on rafraîchit la page (tout de suite, ou à la fermeture de la fiche).
store.on(() => {
  dirty = true;
  if (isDetailOpen() || !base) return;
  clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(() => renderBase(base, true), 40);
});

/* ---------- recherche ---------- */

const runSearch = () => {
  const q = input.value.trim();
  const cur = parse();
  const onSearch = cur.path === '/recherche';
  const scope = onSearch ? cleanScope(cur.params.get('scope')) : CATEGORIES[base?.path.slice(1)]?.scope || 'all';
  const target = searchHref(q, scope);
  if (onSearch) {
    history.replaceState(null, '', target);
    onRoute();
  } else if (q) {
    location.hash = target;
  }
};
const typed = debounce(runSearch, 380);
input.addEventListener('input', typed);
$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  typed.cancel();
  runSearch();
});

function focusSearch() {
  if (parse().path !== '/recherche') location.hash = searchHref('', 'all');
  input.focus();
  input.select();
}

/* ---------- actions globales (boutons data-action) ---------- */

const actions = {
  'quick-add'(el) {
    const m = lookup(el.dataset.key);
    if (!m) return;
    const ok = store.save(m, { status: 'planned' });
    if (ok && el.classList.contains('card__add')) el.remove();
    toast(ok ? `« ${m.title} » gardé pour plus tard (${statusLabel('planned', m).toLowerCase()}).` : 'Stockage plein : impossible d’enregistrer.', {
      tone: ok ? '' : 'warn',
      action: ok ? 'Noter' : '',
      onAction: () => (location.hash = `#/t/${m.key}`),
    });
  },
  'scroll-row'(el) {
    const track = el.closest('.row')?.querySelector('.row__track');
    track?.scrollBy({ left: Number(el.dataset.dir) * track.clientWidth * 0.85, behavior: 'smooth' });
  },
  'open-settings': () => openSettings(),
  'close-modal': () => closeModal(),
  'manual-add': (el) => openManualAdd({ key: el.dataset.key || '', title: el.dataset.title || '' }),
  'close-detail'() {
    if (hops > 0) history.back();
    else location.hash = '#/';
  },
  'focus-search': () => focusSearch(),
  'toggle-drama-all': () => store.setSetting('dramaAll', !store.settings.dramaAll),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  actions[el.dataset.action](el, e);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (isModalOpen()) closeModal();
    else if (isDetailOpen()) actions['close-detail']();
    else if (document.activeElement === input) input.blur();
    return;
  }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  if (e.key === '/' && !typing && !isDetailOpen() && !isModalOpen() && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    focusSearch();
  }
});

// Image cassée : on la masque, le fond de secours (titre) reste visible.
document.addEventListener(
  'error',
  (e) => {
    if (e.target?.tagName === 'IMG') e.target.classList.add('is-broken');
  },
  true,
);

const onScroll = () => nav.classList.toggle('is-solid', window.scrollY > 24);
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('hashchange', () => {
  hops++;
  onRoute();
});

onScroll();
onRoute();
