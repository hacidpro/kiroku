// Réglages (clé TMDB, export/import, options) et ajout manuel d'un titre introuvable.
import { html, render, icon, $, toast, safeUrl, cacheClear } from './util.js';
import { store, CATEGORY_IDS } from './store.js';
import { CATEGORIES } from './ui.js';
import { testTmdbKey } from './sources/tmdb.js';
import { openDetail } from './detail.js';

const modal = $('#modal');
let wipeArmed = false;
let lastFocus = null;

export const isModalOpen = () => !modal.hidden;

export function closeModal() {
  if (modal.hidden) return;
  modal.hidden = true;
  modal.innerHTML = '';
  wipeArmed = false;
  document.body.classList.remove('is-modal');
  if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
}

function open(tpl) {
  lastFocus = document.activeElement;
  modal.hidden = false;
  document.body.classList.add('is-modal');
  render(modal, html`<div class="modal__backdrop" data-action="close-modal"></div><div class="modal__box" role="dialog" aria-modal="true">${tpl}</div>`);
  $('input, select, textarea, button', $('.modal__box', modal))?.focus({ preventScroll: true });
}

/* ================= Réglages ================= */

function settingsHtml() {
  const s = store.settings;
  const n = store.count();
  return html`
    <header class="modal__head">
      <div><p class="eyebrow">設定 · Réglages</p><h2 class="modal__title">Réglages</h2></div>
      <button class="iconbtn" type="button" data-action="close-modal" aria-label="Fermer">${icon('x')}</button>
    </header>

    <section class="set">
      <h3 class="set__title">${icon('key', 18)} Clé TMDB <span class="pill ${s.tmdbKey ? 'pill--ok' : ''}">${s.tmdbKey ? 'active' : 'non configurée'}</span></h3>
      <p class="set__text">Nécessaire pour les K-dramas. Gratuite : crée un compte sur
        <a href="https://www.themoviedb.org/signup" target="_blank" rel="noopener noreferrer">themoviedb.org</a>, puis va dans
        <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">Paramètres → API</a> et copie la « Clé d’API ».
        Elle reste dans ce navigateur, elle n’est jamais publiée avec le site.</p>
      <form class="set__row" id="tmdb-form">
        <input id="tmdb-key" type="password" autocomplete="off" spellcheck="false" placeholder="Colle ta clé ici" value="${s.tmdbKey}" aria-label="Clé TMDB">
        <button class="btn btn--primary" type="submit">Tester et enregistrer</button>
      </form>
      <p class="set__status" id="tmdb-status" aria-live="polite"></p>
    </section>

    <section class="set">
      <h3 class="set__title">${icon('download', 18)} Sauvegarde</h3>
      <p class="set__text">Ta collection (${n} ${n > 1 ? 'titres' : 'titre'}) est enregistrée dans ce navigateur uniquement. Exporte-la pour la mettre à l’abri ou la transférer sur un autre appareil.</p>
      <div class="set__row">
        <button class="btn btn--glass" type="button" data-set="export">${icon('download', 18)} Exporter ma collection</button>
        <label class="btn btn--glass">${icon('upload', 18)} Importer un fichier<input id="import-file" type="file" accept="application/json,.json" hidden></label>
      </div>
    </section>

    <section class="set">
      <h3 class="set__title">${icon('gear', 18)} Options</h3>
      <label class="check"><input type="checkbox" data-opt="dramaAll" ${s.dramaAll ? 'checked' : ''}><span>Inclure les dramas d’autres pays (Japon, Chine, Thaïlande…) dans la catégorie K-Drama</span></label>
      <label class="check"><input type="checkbox" data-opt="adult" ${s.adult ? 'checked' : ''}><span>Afficher les œuvres classées 18+ dans la recherche</span></label>
    </section>

    <section class="set set--danger">
      <h3 class="set__title">${icon('trash', 18)} Zone sensible</h3>
      <div class="set__row">
        <button class="btn btn--danger" type="button" data-set="wipe">${wipeArmed ? `Confirmer : effacer ${n} ${n > 1 ? 'titres' : 'titre'}` : 'Effacer toute ma collection'}</button>
      </div>
    </section>`;
}

export function openSettings() {
  wipeArmed = false;
  open(settingsHtml());
}

function exportFile() {
  const data = JSON.stringify(store.exportData(), null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `kiroku-collection-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Collection exportée.');
}

async function importFile(file) {
  if (!file) return;
  try {
    if (file.size > 20e6) throw new Error('Fichier trop lourd.');
    const r = store.importData(JSON.parse(await file.text()));
    toast(`Import terminé : ${r.added} ajouté(s), ${r.updated} mis à jour${r.skipped ? `, ${r.skipped} ignoré(s)` : ''}.`);
    if (isModalOpen()) open(settingsHtml());
  } catch (e) {
    toast(e instanceof SyntaxError ? 'Ce fichier n’est pas un export valide.' : e.message, { tone: 'warn' });
  }
}

/* ================= Ajout manuel ================= */

const KIND_CHOICES = [
  ['anime', 'Anime', 'anime'],
  ['manga', 'Manga', 'anime'],
  ['novel', 'Light novel', 'anime'],
  ['manhwa', 'Manhwa', 'manhwa'],
  ['manhua', 'Manhua', 'manhwa'],
  ['drama', 'Drama', 'kdrama'],
];

function manualHtml(e, title) {
  return html`
    <header class="modal__head">
      <div><p class="eyebrow">手動 · À la main</p><h2 class="modal__title">${e ? 'Modifier la fiche' : 'Ajouter un titre à la main'}</h2></div>
      <button class="iconbtn" type="button" data-action="close-modal" aria-label="Fermer">${icon('x')}</button>
    </header>
    <form class="form" id="manual-form" data-key="${e?.key || ''}">
      <label class="field"><span class="field__label">Titre</span>
        <input name="title" required maxlength="200" value="${e?.title || title || ''}" placeholder="Le titre exact"></label>
      <div class="form__cols">
        <label class="field"><span class="field__label">Type</span>
          <select name="kind">${KIND_CHOICES.map(([id, label]) => html`<option value="${id}" ${e?.kind === id ? 'selected' : ''}>${label}</option>`)}</select></label>
        <label class="field"><span class="field__label">Année <i>facultatif</i></span>
          <input name="year" type="number" min="1900" max="2100" value="${e?.year || ''}" placeholder="2024"></label>
      </div>
      <label class="field"><span class="field__label">Adresse de l’affiche <i>facultatif</i></span>
        <input name="cover" type="url" value="${e?.cover || ''}" placeholder="https://…/affiche.jpg"></label>
      <label class="field"><span class="field__label">Adresse de la bannière <i>facultatif</i></span>
        <input name="banner" type="url" value="${e?.banner || ''}" placeholder="https://…/banniere.jpg"></label>
      <p class="set__text">Astuce : clic droit sur une image → « Copier l’adresse de l’image ».</p>
      <div class="set__row">
        <button class="btn btn--primary" type="submit">${e ? 'Enregistrer' : 'Ajouter à ma liste'}</button>
        <button class="btn btn--glass" type="button" data-action="close-modal">Annuler</button>
      </div>
    </form>`;
}

export function openManualAdd({ key = '', title = '' } = {}) {
  open(manualHtml(key ? store.get(key) : null, title));
}

function submitManual(form) {
  const f = new FormData(form);
  const title = String(f.get('title') || '').trim();
  if (!title) return;
  const kind = String(f.get('kind'));
  const choice = KIND_CHOICES.find((k) => k[0] === kind) || KIND_CHOICES[0];
  const key = form.dataset.key || `custom:${Date.now().toString(36)}`;
  const existing = store.get(key);
  const year = Number(f.get('year'));
  const media = {
    key,
    source: 'custom',
    id: key.slice(7),
    kind: choice[0],
    category: CATEGORY_IDS.includes(choice[2]) ? choice[2] : 'anime',
    title,
    format: choice[1],
    year: year >= 1900 && year <= 2100 ? year : null,
    cover: safeUrl(String(f.get('cover') || '').trim()),
    banner: safeUrl(String(f.get('banner') || '').trim()),
    genres: existing?.genres || [],
  };
  // Les champs vidés doivent vraiment s'effacer (save ignore les valeurs vides).
  store.save(
    media,
    existing ? { cover: media.cover, banner: media.banner, year: media.year, category: media.category, categoryLocked: false } : { status: 'completed' },
  );
  closeModal();
  toast(existing ? 'Fiche mise à jour.' : `« ${title} » ajouté dans ${CATEGORIES[media.category].label}.`);
  if (location.hash === `#/t/${key}`) openDetail(key);
  else location.hash = `#/t/${key}`;
}

/* ================= Événements ================= */

modal.addEventListener('click', async (ev) => {
  const act = ev.target.closest('[data-set]')?.dataset.set;
  if (act === 'export') exportFile();
  if (act === 'wipe') {
    if (!wipeArmed) {
      wipeArmed = true;
      open(settingsHtml());
      return;
    }
    store.clear();
    cacheClear();
    wipeArmed = false;
    open(settingsHtml());
    toast('Collection effacée.');
  }
});

modal.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'import-file') importFile(t.files?.[0]);
  if (t.dataset.opt) store.setSetting(t.dataset.opt, t.checked);
});

modal.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (ev.target.id === 'manual-form') {
    submitManual(ev.target);
    return;
  }
  if (ev.target.id !== 'tmdb-form') return;
  const key = $('#tmdb-key', modal).value.trim();
  const status = $('#tmdb-status', modal);
  if (!key) {
    store.setSetting('tmdbKey', '');
    cacheClear();
    open(settingsHtml());
    toast('Clé TMDB retirée.');
    return;
  }
  status.textContent = 'Vérification…';
  status.className = 'set__status';
  try {
    await testTmdbKey(key);
    store.setSetting('tmdbKey', key);
    open(settingsHtml());
    $('#tmdb-status', modal).textContent = 'Clé valide : les K-dramas sont activés.';
    $('#tmdb-status', modal).className = 'set__status is-ok';
    toast('K-dramas activés.');
  } catch (e) {
    status.textContent = e.message;
    status.className = 'set__status is-error';
  }
});
