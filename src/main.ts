// Paradiddle - drum rudiments trainer
// Copyright (C) 2026 Donatas Olsevičius
// SPDX-License-Identifier: AGPL-3.0-or-later

import './style.css';
import { Editor } from './editor';
import { renderGroupPicker } from './groupPicker';
import { confirmClick, disarm, fillIcons } from './icons';
import { getLocale, setLocale, t } from './i18n';
import { Measure, Rudiment, TimeSig, beatGroups, defaultGroups, parsePattern, timeLabel } from './model';
import { NotePos, renderSheet } from './notation';
import { Player, TEMPO_MAX, TEMPO_MIN, Trainer } from './player';
import { BUILTINS, CATEGORIES } from './rudiments';
import { VOICES } from './sounds';
import { download, importRudiments, loadCustom, loadSettings, newId, saveCustom, saveSettings, slug, uniqueName } from './storage';
import { Timeline, buildTimeline, clickTimeline, measureSteps } from './timeline';

interface Settings {
  tempo: number;
  sub: number;
  countIn: boolean;
  rudVoice: string;
  clickVoice: string;
  rudVol: number;
  clickVol: number;
  trainer: Trainer;
  current: string;
  metro: TimeSig;
  mode: 'rudiment' | 'metronome';
}

const DEFAULTS: Settings = {
  tempo: 80,
  sub: 1,
  countIn: true,
  rudVoice: 'snare',
  clickVoice: 'click',
  rudVol: 0.8,
  clickVol: 0.7,
  trainer: { on: false, start: 60, target: 120, step: 5, every: 4 },
  current: 'pas-16',
  metro: { num: 4, den: 4 },
  mode: 'rudiment',
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);

const stored = loadSettings<Settings>();
const settings: Settings = { ...DEFAULTS, ...stored, trainer: { ...DEFAULTS.trainer, ...stored.trainer } };
let custom = loadCustom();
let mode: 'rudiment' | 'metronome' = settings.mode;
let current = findRudiment(settings.current) ?? BUILTINS[15];
let shown: { rud: Rudiment; measures: Measure[] } = { rud: current, measures: parsePattern(current.pattern, current.time) };
let positions: NotePos[] = [];
let activeEl: SVGElement | undefined;
let activeStemEl: SVGElement | undefined;

const player = new Player({
  sub: settings.sub,
  countIn: settings.countIn,
  rudVoice: settings.rudVoice,
  clickVoice: settings.clickVoice,
  rudVol: settings.rudVol,
  clickVol: settings.clickVol,
  trainer: settings.trainer,
});
player.tempo = settings.tempo;

const editor = new Editor($('editor'), { delete: $('edDeleteBtn'), cancel: $('edCancelBtn'), save: $('edSaveBtn') }, {
  change(r, measures) {
    showRudiment(r, measures);
    if (player.playing && mode === 'rudiment') player.setTimeline(buildTimeline(measures, r.time.den));
  },
  save(r) {
    const i = custom.findIndex(c => c.id === r.id);
    const saved = { ...r, builtin: undefined };
    if (i >= 0) custom[i] = saved;
    else custom.push(saved);
    persistCustom();
    closeEditor();
    select(saved);
    toast(t('saved'));
  },
  cancel() {
    closeEditor();
    select(current);
  },
  remove: deleteRudiment,
});

function deleteRudiment(r: Rudiment) {
  custom = custom.filter(c => c.id !== r.id);
  persistCustom();
  closeEditor();
  select(BUILTINS[15]);
  toast(t('deleted', { name: r.name }));
}

function findRudiment(id: string): Rudiment | undefined {
  return BUILTINS.find(r => r.id === id) ?? custom.find(r => r.id === id);
}

function persist() {
  Object.assign(settings, player.opts, { tempo: player.tempo, current: current.id, mode });
  saveSettings(settings);
}

function persistCustom() {
  saveCustom(custom);
  renderLibrary();
}

function toast(msg: string) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(Number(t.dataset.timer));
  t.dataset.timer = String(setTimeout(() => (t.hidden = true), 2500));
}

// Library

function renderLibrary() {
  const groups = new Map<string, Rudiment[]>();
  for (const c of CATEGORIES) groups.set(c, BUILTINS.filter(r => r.category === c));
  const customCats = [...new Set(custom.map(r => r.category))].sort();
  const html = [...groups].map(([cat, list]) => groupHtml(cat, list));
  for (const cat of customCats) html.push(groupHtml(cat, custom.filter(r => r.category === cat).sort((a, b) => a.name.localeCompare(b.name))));
  $('libList').innerHTML = html.join('');
  $('catList').innerHTML = [...new Set([...CATEGORIES, ...customCats, t('categoryCustom')])].map(c => `<option value="${esc(c)}">`).join('');
  markSelected();
}

function catLabel(cat: string): string {
  if (cat === 'Custom') return t('categoryCustom');
  return CATEGORIES.includes(cat) ? t(`cat:${cat}`) : cat;
}

function groupHtml(cat: string, list: Rudiment[]): string {
  return `<details open><summary>${esc(catLabel(cat))}</summary><ul>${
    list.map(r => `<li><button data-id="${r.id}">${esc(r.name)}<span class="time-sig">${esc(timeLabel(r.time))}</span></button></li>`).join('')}</ul></details>`;
}

function markSelected() {
  document.querySelectorAll<HTMLButtonElement>('#libList button').forEach(b => b.classList.toggle('sel', b.dataset.id === current.id));
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

const CONFIRM_MS = 3000;
let discardArm: { id: string; until: number } | undefined;

$('libList').addEventListener('click', e => {
  const id = (e.target as HTMLElement).closest('button')?.dataset.id;
  const r = id && findRudiment(id);
  if (!r) return;
  if (!$('editor').hidden) {
    if (editor.dirty && !(discardArm?.id === r.id && Date.now() < discardArm.until)) {
      discardArm = { id: r.id, until: Date.now() + CONFIRM_MS };
      return toast(t('unsavedDiscard'));
    }
    discardArm = undefined;
    closeEditor();
  }
  select(r);
  setDrawer(false);
});

function select(r: Rudiment) {
  if (player.playing) player.stop();
  current = r;
  showRudiment(r, parsePattern(r.pattern, r.time));
  markSelected();
  persist();
}

function showRudiment(r: Rudiment, measures: Measure[]) {
  shown = { rud: r, measures };
  $('rTitle').textContent = r.name || t('untitled');
  $('rMeta').textContent = `${catLabel(r.category)} · ${timeLabel(r.time)}${r.builtin ? ' · PAS' : ''}`;
  $('editBtn').hidden = !!r.builtin || !$('editor').hidden;
  $('copyBtn').hidden = !$('editor').hidden;
  $('downloadBtn').hidden = !$('editor').hidden;
  $('deleteBtn').hidden = !!r.builtin || !$('editor').hidden;
  disarm($('deleteBtn'));
  drawSheet();
  if (mode === 'rudiment') renderBeats();
}

function drawSheet() {
  clearMarker();
  try {
    ({ notes: positions } = renderSheet($('sheet'), shown.measures, shown.rud.time));
  } catch (err) {
    console.error(err);
    positions = [];
  }
}

function clearMarker() {
  activeEl?.classList.remove('active');
  activeEl = undefined;
  activeStemEl?.classList.remove('active');
  activeStemEl = undefined;
}

function showMarker(index: number) {
  const p = positions[index];
  if (!p) return;
  activeEl?.classList.remove('active');
  activeEl = p.el;
  activeEl?.classList.add('active');
  activeStemEl?.classList.remove('active');
  activeStemEl = p.stemEl;
  activeStemEl?.classList.add('active');
}

let resizeTimer = 0;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => mode === 'rudiment' && drawSheet(), 60);
}).observe($('sheet'));

// Editor

function openEditor(r: Rudiment, isNew: boolean) {
  if (player.playing) player.stop();
  $('editor').hidden = false;
  editor.open(r, isNew);
}

function closeEditor() {
  $('editor').hidden = true;
  editor.close();
}

$('newBtn').addEventListener('click', () => {
  setDrawer(false);
  openEditor({ id: newId(), name: uniqueName(t('newRudimentName'), [...BUILTINS, ...custom]), category: t('categoryCustom'), time: { num: 2, den: 4 }, pattern: 'RLRL RLRL' }, true);
});

$('copyBtn').addEventListener('click', () => {
  const base = current.name.replace(/^\d+\.\s*/, '');
  openEditor({ ...structuredClone(current), id: newId(), builtin: undefined, name: uniqueName(`${base} (copy)`, [...BUILTINS, ...custom]), category: current.builtin ? t('categoryCustom') : current.category }, true);
});

$('editBtn').addEventListener('click', () => !current.builtin && openEditor(current, false));

$('downloadBtn').addEventListener('click', () => download([current], `${slug(current.name)}.json`));

$('deleteBtn').addEventListener('click', e => {
  if (!current.builtin) confirmClick(e.currentTarget as HTMLElement, () => deleteRudiment(current));
});

$('downloadAllBtn').addEventListener('click', () => {
  if (!custom.length) return toast(t('noCustomYet'));
  download(custom, 'paradiddle-rudiments.json');
});

$('uploadBtn').addEventListener('click', () => input('fileInput').click());

input('fileInput').addEventListener('change', async e => {
  const el = e.target as HTMLInputElement;
  const file = el.files?.[0];
  el.value = '';
  if (!file) return;
  try {
    const res = importRudiments(await file.text(), custom, BUILTINS);
    custom = res.list;
    persistCustom();
    toast(t('imported', { added: res.added }) + (res.skipped ? t('importedSkipped', { skipped: res.skipped }) : ''));
  } catch {
    toast(t('invalidFile'));
  }
});

// Drawer

function setDrawer(open: boolean) {
  document.body.classList.toggle('drawer-open', open);
  $('scrim').hidden = !open;
}
$('menuBtn').addEventListener('click', () => setDrawer(!document.body.classList.contains('drawer-open')));
$('scrim').addEventListener('click', () => setDrawer(false));

// Mode tabs

function applyMode(m: typeof mode) {
  mode = m;
  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
  $('rudimentView').hidden = m !== 'rudiment';
  $('metronomeView').hidden = m !== 'metronome';
  document.body.classList.toggle('metro-mode', m === 'metronome');
  if (m === 'rudiment') drawSheet();
  renderBeats();
}

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach(btn => btn.addEventListener('click', () => {
  const m = btn.dataset.mode as typeof mode;
  if (m === mode) return;
  player.stop();
  applyMode(m);
  persist();
}));

// Metronome time signature

function fillMetro() {
  const t = settings.metro;
  input('mNum').value = String(t.num);
  $<HTMLSelectElement>('mDen').value = String(t.den);
  $('mGroupsWrap').hidden = t.den !== 8;
  renderGroupPicker($('mGroups'), t.num, beatGroups(t), groupsChanged);
}

function metroChanged() {
  const num = Math.max(1, Math.min(32, Math.round(Number(input('mNum').value) || 4)));
  const den = Number($<HTMLSelectElement>('mDen').value);
  applyMetro({ num, den });
}

function groupsChanged(groups: number[]) {
  const t = settings.metro;
  const nt: TimeSig = { num: t.num, den: t.den };
  if (groups.join('+') !== defaultGroups(t.num, t.den).join('+')) nt.groups = groups;
  applyMetro(nt);
}

function applyMetro(t: TimeSig) {
  settings.metro = t;
  fillMetro();
  persist();
  renderBeats();
  if (player.playing) player.setTimeline(clickTimeline(t));
}
['mNum', 'mDen'].forEach(id => $(id).addEventListener('change', metroChanged));

// Beat indicator

function renderBeats() {
  const groups = mode === 'metronome' ? beatGroups(settings.metro) : measureSteps(shown.measures)[0];
  const mk = (big: boolean) => groups.map((units, gi) => {
    let html = `<span class="dot${gi === 0 ? ' first' : ''}" data-group="${gi}" data-step="0">${big ? gi + 1 : ''}</span>`;
    for (let u = 1; u < units; u++) html += `<span class="dot sub" data-group="${gi}" data-step="${u}"></span>`;
    return html;
  }).join('');
  $('beats').innerHTML = mk(false);
  $('bigBeatsDots').innerHTML = mk(true);
  (mode === 'rudiment' ? $('sheet') : $('bigBeats')).prepend($('statusText'));
}

function lightBeat(group: number, step: number) {
  for (const host of [$('beats'), $('bigBeatsDots')]) {
    host.querySelectorAll('.dot').forEach(d => {
      d.classList.toggle('on', d.getAttribute('data-group') === String(group) && d.getAttribute('data-step') === String(step));
    });
  }
}

// Transport

function timeline(): Timeline {
  return mode === 'metronome' ? clickTimeline(settings.metro) : buildTimeline(shown.measures, shown.rud.time.den);
}

function setStatus(text: string) {
  $('statusText').textContent = text;
}

function trainerStatus(loops: number) {
  const tr = player.opts.trainer;
  if (!tr.on) return setStatus(t('loop', { n: loops }));
  const left = tr.every - ((loops - 1) % tr.every);
  const done = player.tempo === tr.target;
  setStatus(done ? t('targetReached', { target: tr.target }) : t('loopNextStep', { n: loops, left }));
}

const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
const STOP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/></svg>';
$('playBtn').innerHTML = PLAY_ICON;

player.onNote = showMarker;
player.onBeat = (beat, count, step) => {
  if (beat.index === 0 && step === 0 && !count) renderBeats();
  lightBeat(beat.index, step);
  if (count && step === 0) setStatus(t('countInStatus', { n: beat.index + 1 }));
};
player.onLoop = trainerStatus;
player.onTempo = () => {
  updateTempo();
  persist();
};
player.onStop = () => {
  $('playBtn').innerHTML = PLAY_ICON;
  $('playBtn').setAttribute('aria-label', t('play'));
  clearMarker();
  lightBeat(-1, -1);
  setStatus('');
  releaseWakeLock();
};

let wakeLock: WakeLockSentinel | undefined;

async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    wakeLock = undefined;
  }
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => undefined);
  wakeLock = undefined;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && player.playing) requestWakeLock();
});

$('playBtn').addEventListener('click', async () => {
  if (player.playing) return player.stop();
  if (mode === 'rudiment') renderBeats();
  await player.start(timeline(), mode === 'rudiment');
  $('playBtn').innerHTML = STOP_ICON;
  $('playBtn').setAttribute('aria-label', t('stop'));
  setStatus('');
  requestWakeLock();
});

document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if ((e.target as HTMLElement).closest('input, select, textarea, [contenteditable]')) return;
  e.preventDefault();
  $('playBtn').click();
});

function updateTempo() {
  input('tempoInput').value = String(player.tempo);
  input('tempoRange').value = String(player.tempo);
}

for (const el of [input('tempoInput'), input('tempoRange')]) {
  el.min = String(TEMPO_MIN);
  el.max = String(TEMPO_MAX);
}
document.querySelectorAll<HTMLButtonElement>('[data-tempo]').forEach(b =>
  b.addEventListener('click', () => player.setTempo(player.tempo + Number(b.dataset.tempo))));
input('tempoInput').addEventListener('change', e => {
  player.setTempo(Number((e.target as HTMLInputElement).value) || player.tempo);
  updateTempo();
});
input('tempoRange').addEventListener('input', e => player.setTempo(Number((e.target as HTMLInputElement).value)));

// i18n

function applyI18n() {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const vars = el.dataset.i18nVars ? JSON.parse(el.dataset.i18nVars) : undefined;
    el.textContent = t(el.dataset.i18n!, vars);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach(el => (el.title = t(el.dataset.i18nTitle!)));
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria!)));
  $('playBtn').setAttribute('aria-label', t(player.playing ? 'stop' : 'play'));
}

$<HTMLSelectElement>('langSel').value = getLocale();
$<HTMLSelectElement>('langSel').addEventListener('change', e => {
  setLocale((e.target as HTMLSelectElement).value as 'en' | 'de');
  applyI18n();
  renderLibrary();
  showRudiment(shown.rud, shown.measures);
  fillMetro();
});

// Settings

function fillVoices(id: string, value: string) {
  const sel = $<HTMLSelectElement>(id);
  sel.innerHTML = Object.entries(VOICES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  sel.value = value;
}

function bindSettings() {
  const o = player.opts;
  fillVoices('rudVoice', o.rudVoice);
  fillVoices('clickVoice', o.clickVoice);
  input('countIn').checked = o.countIn;
  $<HTMLSelectElement>('subSel').value = String(o.sub);
  input('rudVol').value = String(o.rudVol);
  input('clickVol').value = String(o.clickVol);
  input('trOn').checked = o.trainer.on;
  input('trStart').value = String(o.trainer.start);
  input('trTarget').value = String(o.trainer.target);
  input('trStep').value = String(o.trainer.step);
  input('trEvery').value = String(o.trainer.every);

  const on = (id: string, ev: string, fn: (el: HTMLInputElement) => void) =>
    $(id).addEventListener(ev, e => {
      fn(e.target as HTMLInputElement);
      persist();
    });
  const clampTempo = (v: string, fallback: number) => Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(Number(v)) || fallback));
  on('countIn', 'change', el => (o.countIn = el.checked));
  on('subSel', 'change', el => (o.sub = Number(el.value)));
  on('rudVoice', 'change', el => (o.rudVoice = el.value));
  on('clickVoice', 'change', el => (o.clickVoice = el.value));
  on('rudVol', 'input', el => { o.rudVol = Number(el.value); player.applyVolumes(); });
  on('clickVol', 'input', el => { o.clickVol = Number(el.value); player.applyVolumes(); });
  on('trOn', 'change', el => {
    o.trainer.on = el.checked;
    if (el.checked && !player.playing) player.setTempo(o.trainer.start);
  });
  on('trStart', 'change', el => { o.trainer.start = clampTempo(el.value, o.trainer.start); el.value = String(o.trainer.start); });
  on('trTarget', 'change', el => { o.trainer.target = clampTempo(el.value, o.trainer.target); el.value = String(o.trainer.target); });
  on('trStep', 'change', el => { o.trainer.step = Math.max(1, Math.round(Number(el.value)) || 1); el.value = String(o.trainer.step); });
  on('trEvery', 'change', el => { o.trainer.every = Math.max(1, Math.round(Number(el.value)) || 1); el.value = String(o.trainer.every); });
}

// Init

async function init() {
  applyI18n();
  fillIcons();
  await document.fonts.load('30px Bravura').catch(() => undefined);
  bindSettings();
  fillMetro();
  updateTempo();
  renderLibrary();
  select(current);
  applyMode(mode);
  document.querySelector('#libList button.sel')?.scrollIntoView({ block: 'center' });
}

init();
