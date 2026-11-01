// Paradiddle - drum rudiments trainer
// Copyright (C) 2026 Donatas Olsevičius
// SPDX-License-Identifier: AGPL-3.0-or-later

import './style.css';
import { Editor } from './editor';
import { Measure, Rudiment, TimeSig, beatGroups, defaultGroups, parsePattern, timeLabel } from './model';
import { Anchor, NotePos, renderSheet } from './notation';
import { Player, TEMPO_MAX, TEMPO_MIN, Trainer } from './player';
import { BUILTINS, CATEGORIES } from './rudiments';
import { VOICES } from './sounds';
import { download, importRudiments, loadCustom, loadSettings, newId, saveCustom, saveSettings, slug, uniqueName } from './storage';
import { Timeline, buildTimeline, clickTimeline } from './timeline';

interface Settings {
  tempo: number;
  click: boolean;
  sub: number;
  countIn: boolean;
  rudVoice: string;
  clickVoice: string;
  rudVol: number;
  clickVol: number;
  trainer: Trainer;
  current: string;
  metro: TimeSig;
}

const DEFAULTS: Settings = {
  tempo: 80,
  click: true,
  sub: 1,
  countIn: true,
  rudVoice: 'snare',
  clickVoice: 'click',
  rudVol: 0.8,
  clickVol: 0.7,
  trainer: { on: false, start: 60, target: 120, step: 5, every: 4 },
  current: 'pas-16',
  metro: { num: 4, den: 4 },
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);

const stored = loadSettings<Settings>();
const settings: Settings = { ...DEFAULTS, ...stored, trainer: { ...DEFAULTS.trainer, ...stored.trainer } };
let custom = loadCustom();
let mode: 'rudiment' | 'metronome' = 'rudiment';
let current = findRudiment(settings.current) ?? BUILTINS[15];
let shown: { rud: Rudiment; measures: Measure[] } = { rud: current, measures: parsePattern(current.pattern, current.time) };
let positions: NotePos[] = [];
let anchors: Anchor[] = [];
let activeEl: SVGElement | undefined;

const player = new Player({
  click: settings.click,
  sub: settings.sub,
  countIn: settings.countIn,
  rudVoice: settings.rudVoice,
  clickVoice: settings.clickVoice,
  rudVol: settings.rudVol,
  clickVol: settings.clickVol,
  trainer: settings.trainer,
});
player.tempo = settings.tempo;

const editor = new Editor($('editor'), {
  change(r, measures) {
    showRudiment(r, measures);
    if (player.playing && mode === 'rudiment') player.setTimeline(buildTimeline(measures));
  },
  save(r) {
    const i = custom.findIndex(c => c.id === r.id);
    const saved = { ...r, builtin: undefined };
    if (i >= 0) custom[i] = saved;
    else custom.push(saved);
    persistCustom();
    closeEditor();
    select(saved);
    toast('Saved');
  },
  cancel() {
    closeEditor();
    select(current);
  },
  remove(r) {
    if (!confirm(`Delete "${r.name}"?`)) return;
    custom = custom.filter(c => c.id !== r.id);
    persistCustom();
    closeEditor();
    select(BUILTINS[15]);
  },
});

function findRudiment(id: string): Rudiment | undefined {
  return BUILTINS.find(r => r.id === id) ?? custom.find(r => r.id === id);
}

function persist() {
  Object.assign(settings, player.opts, { tempo: player.tempo, current: current.id });
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
  const html = [...groups].map(([cat, list]) => groupHtml(cat, list, false));
  for (const cat of customCats) html.push(groupHtml(cat, custom.filter(r => r.category === cat).sort((a, b) => a.name.localeCompare(b.name)), true));
  $('libList').innerHTML = html.join('');
  $('catList').innerHTML = [...new Set([...CATEGORIES, ...customCats, 'Custom'])].map(c => `<option value="${esc(c)}">`).join('');
  markSelected();
}

function groupHtml(cat: string, list: Rudiment[], isCustom: boolean): string {
  return `<details open><summary>${esc(cat)}${isCustom ? ' <span class="chip">custom</span>' : ''}</summary><ul>${
    list.map(r => `<li><button data-id="${r.id}">${esc(r.name)}</button></li>`).join('')}</ul></details>`;
}

function markSelected() {
  document.querySelectorAll<HTMLButtonElement>('#libList button').forEach(b => b.classList.toggle('sel', b.dataset.id === current.id));
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

$('libList').addEventListener('click', e => {
  const id = (e.target as HTMLElement).closest('button')?.dataset.id;
  const r = id && findRudiment(id);
  if (!r) return;
  if (!$('editor').hidden) {
    if (editor.dirty && !confirm('Discard unsaved changes?')) return;
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
  $('rTitle').textContent = r.name || 'Untitled';
  $('rMeta').textContent = `${r.category} · ${timeLabel(r.time)}${r.builtin ? ' · PAS' : ''}`;
  $('editBtn').hidden = !!r.builtin || !$('editor').hidden;
  $('copyBtn').hidden = !$('editor').hidden;
  $('downloadBtn').hidden = !$('editor').hidden;
  drawSheet();
  if (mode === 'rudiment') renderBeats();
}

function drawSheet() {
  clearMarker();
  try {
    ({ notes: positions, anchors } = renderSheet($('sheet'), shown.measures, shown.rud.time));
  } catch (err) {
    console.error(err);
    positions = [];
    anchors = [];
  }
}

function clearMarker() {
  $('marker').hidden = true;
  $('pulse').hidden = true;
  activeEl?.classList.remove('active');
  activeEl = undefined;
}

function showMarker(index: number) {
  const p = positions[index];
  if (!p) return;
  const m = $('marker');
  m.hidden = false;
  m.style.transform = `translate(${p.x}px, ${p.top}px)`;
  m.style.height = `${p.bottom - p.top}px`;
  activeEl?.classList.remove('active');
  activeEl = p.el;
  activeEl?.classList.add('active');
}

function showPulse(q: number) {
  const i = anchors.findIndex((a, k) => a.q <= q + 1e-9 && (anchors[k + 1]?.q ?? Infinity) > q + 1e-9);
  const a = anchors[i];
  const b = anchors[i + 1];
  if (!a) return;
  const x = b && b.line === a.line ? a.x + ((q - a.q) / (b.q - a.q)) * (b.x - a.x) : a.x;
  const p = $('pulse');
  p.hidden = false;
  p.style.transform = `translate(${x}px, ${a.y}px)`;
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
}

$('newBtn').addEventListener('click', () => {
  setDrawer(false);
  openEditor({ id: newId(), name: uniqueName('New rudiment', [...BUILTINS, ...custom]), category: 'Custom', time: { num: 2, den: 4 }, pattern: 'RLRL RLRL' }, true);
});

$('copyBtn').addEventListener('click', () => {
  const base = current.name.replace(/^\d+\.\s*/, '');
  openEditor({ ...structuredClone(current), id: newId(), builtin: undefined, name: uniqueName(`${base} (copy)`, [...BUILTINS, ...custom]), category: current.builtin ? 'Custom' : current.category }, true);
});

$('editBtn').addEventListener('click', () => !current.builtin && openEditor(current, false));

$('downloadBtn').addEventListener('click', () => download([current], `${slug(current.name)}.json`));

$('downloadAllBtn').addEventListener('click', () => {
  if (!custom.length) return toast('No custom rudiments yet');
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
    toast(`Imported ${res.added}${res.skipped ? `, skipped ${res.skipped}` : ''}`);
  } catch {
    toast('Invalid file');
  }
});

// Sponsor menu

document.addEventListener('click', e => {
  const sponsor = $<HTMLDetailsElement>('sponsor');
  if (sponsor.open && !sponsor.contains(e.target as Node)) sponsor.open = false;
});

// Drawer

function setDrawer(open: boolean) {
  document.body.classList.toggle('drawer-open', open);
  $('scrim').hidden = !open;
}
$('menuBtn').addEventListener('click', () => setDrawer(!document.body.classList.contains('drawer-open')));
$('scrim').addEventListener('click', () => setDrawer(false));

// Mode tabs

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach(btn => btn.addEventListener('click', () => {
  const m = btn.dataset.mode as typeof mode;
  if (m === mode) return;
  player.stop();
  mode = m;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
  $('rudimentView').hidden = m !== 'rudiment';
  $('metronomeView').hidden = m !== 'metronome';
  document.body.classList.toggle('metro-mode', m === 'metronome');
  if (m === 'rudiment') drawSheet();
  renderBeats();
}));

// Metronome time signature

function fillMetro() {
  const t = settings.metro;
  input('mNum').value = String(t.num);
  $<HTMLSelectElement>('mDen').value = String(t.den);
  input('mGroups').value = beatGroups(t).join('+');
  $('mGroupsWrap').hidden = t.den !== 8;
}

function metroChanged() {
  const num = Math.max(1, Math.min(32, Math.round(Number(input('mNum').value) || 4)));
  const den = Number($<HTMLSelectElement>('mDen').value);
  const raw = input('mGroups').value.split('+').map(s => Number(s.trim()));
  const t: TimeSig = { num, den };
  const same = num === settings.metro.num && den === settings.metro.den;
  if (same && den === 8 && raw.every(n => n > 0) && raw.reduce((a, b) => a + b, 0) === num && raw.join('+') !== defaultGroups(num, den).join('+')) t.groups = raw;
  settings.metro = t;
  fillMetro();
  persist();
  renderBeats();
  if (player.playing) player.setTimeline(clickTimeline(t));
}
['mNum', 'mDen', 'mGroups'].forEach(id => $(id).addEventListener('change', metroChanged));

// Beat indicator

function currentTimeSig(): TimeSig {
  return mode === 'metronome' ? settings.metro : shown.rud.time;
}

function renderBeats() {
  const n = beatGroups(currentTimeSig()).length;
  const dots = [...Array(n)].map((_, i) => `<span class="dot${i === 0 ? ' first' : ''}"></span>`).join('');
  $('beats').innerHTML = dots;
  $('bigBeats').innerHTML = [...Array(n)].map((_, i) => `<span class="dot${i === 0 ? ' first' : ''}">${i + 1}</span>`).join('');
}

function lightBeat(index: number) {
  for (const host of [$('beats'), $('bigBeats')]) {
    host.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('on', i === index));
  }
}

// Transport

function timeline(): Timeline {
  return mode === 'metronome' ? clickTimeline(settings.metro) : buildTimeline(shown.measures);
}

function setStatus(text: string) {
  $('statusText').textContent = text;
}

function trainerStatus(loops: number) {
  const t = player.opts.trainer;
  if (!t.on) return setStatus(loops ? `Loop ${loops + 1}` : '');
  const left = t.every - (loops % t.every);
  const done = player.tempo === t.target;
  setStatus(done ? `Target ${t.target} reached` : `Loop ${loops + 1} · next step in ${left}`);
}

const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
const STOP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/></svg>';
$('playBtn').innerHTML = PLAY_ICON;

player.onNote = showMarker;
player.onPulse = showPulse;
player.onBeat = (beat, count) => {
  if (beat.index === 0 && !count) renderBeats();
  lightBeat(beat.index);
  if (count) setStatus(`Count-in ${beat.index + 1}`);
};
player.onLoop = trainerStatus;
player.onTempo = () => {
  updateTempo();
  persist();
};
player.onStop = () => {
  $('playBtn').innerHTML = PLAY_ICON;
  $('playBtn').setAttribute('aria-label', 'Play');
  clearMarker();
  lightBeat(-1);
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
  $('playBtn').setAttribute('aria-label', 'Stop');
  trainerStatus(0);
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
  input('clickOn').checked = o.click;
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
  on('clickOn', 'change', el => (o.click = el.checked));
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
  await document.fonts.load('30px Bravura').catch(() => undefined);
  bindSettings();
  fillMetro();
  updateTempo();
  renderLibrary();
  select(current);
  renderBeats();
  document.querySelector('#libList button.sel')?.scrollIntoView({ block: 'center' });
}

init();
