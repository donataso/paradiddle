// Paradiddle - drum rudiments trainer
// Copyright (C) 2026 Donatas Olsevičius
// SPDX-License-Identifier: AGPL-3.0-or-later

import { confirmClick, disarm, fillIcons } from './icons';
import { t } from './i18n';
import { renderGroupPicker } from './groupPicker';
import { Beat, DEFAULT_CATEGORY, DENOMINATORS, Frac, Hand, Measure, Rudiment, Slot, TimeSig, beatGroups, beatLengths, defaultGroups, parsePattern, serializePattern } from './model';

const SUBDIVISIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12];

interface Sel { m: number; b: number; i: number }

export interface EditorHooks {
  change(r: Rudiment, measures: Measure[]): void;
  save(r: Rudiment): void;
  cancel(): void;
  remove(r: Rudiment): void;
}

const $ = <T extends HTMLElement>(root: HTMLElement, sel: string) => root.querySelector(sel) as T;

export interface EditorActions {
  delete: HTMLElement;
  cancel: HTMLElement;
  save: HTMLElement;
}

export class Editor {
  draft!: Rudiment;
  isNew = false;
  dirty = false;
  private measures: Measure[] = [];
  private sel: Sel | null = { m: 0, b: 0, i: 0 };

  constructor(private root: HTMLElement, private actions: EditorActions, private hooks: EditorHooks) {
    root.innerHTML = `
      <div class="ed-fields">
        <label class="ed-name">${t('name')} <input id="edName" maxlength="80"></label>
        <label>${t('category')} <input id="edCat" list="catList" maxlength="40"></label>
        <label class="ed-time">${t('time')}
          <span><input id="edNum" type="number" min="1" max="32" inputmode="numeric"> /
          <select id="edDen">${DENOMINATORS.map(d => `<option>${d}</option>`).join('')}</select></span>
        </label>
        <label id="edGroupsWrap">${t('grouping')} <span id="edGroups" class="group-picker"></span></label>
      </div>
      <div class="ed-tools" role="toolbar">
        <button data-act="R" title="${t('rightHand')}">R</button>
        <button data-act="L" title="${t('leftHand')}">L</button>
        <button data-act="rest" title="${t('rest')}">${t('rest')}</button>
        <button data-act="hold" title="${t('extendPrevious')}">${t('hold')}</button>
        <span class="sep"></span>
        <button data-act="accent" title="${t('accent')}">&gt; ${t('accent')}</button>
        <button data-act="flam" title="${t('flam')}">${t('flam')}</button>
        <button data-act="drag" title="${t('drag')}">${t('drag')}</button>
        <button data-act="diddle" title="${t('diddleSlash')}">${t('diddle')}</button>
        <button data-act="buzz" title="${t('buzz')}">${t('buzz')}</button>
      </div>
      <div class="ed-grid"></div>
      <div class="ed-error" role="alert"></div>
      <div class="ed-actions">
        <button data-act="addMeasure">${t('addMeasure')}</button>
      </div>`;
    fillIcons(root);
    root.addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      const act = btn.dataset.act;
      if (btn.dataset.cell) {
        const [m, b, i] = btn.dataset.cell.split(',').map(Number);
        this.sel = { m, b, i };
        this.renderGrid();
        return;
      }
      if (act) this.action(act, btn);
    });
    root.addEventListener('change', e => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLSelectElement && t.dataset.beat) {
        const [m, b] = t.dataset.beat.split(',').map(Number);
        this.resubdivide(m, b, Number(t.value));
      }
    });
    $<HTMLInputElement>(root, '#edName').addEventListener('input', e => {
      this.draft.name = (e.target as HTMLInputElement).value;
      this.dirty = true;
    });
    $<HTMLInputElement>(root, '#edCat').addEventListener('input', e => {
      this.draft.category = (e.target as HTMLInputElement).value;
      this.dirty = true;
    });
    for (const id of ['#edNum', '#edDen']) {
      $(root, id).addEventListener('change', () => this.timeChanged());
    }
    actions.delete.addEventListener('click', () => confirmClick(actions.delete, () => this.hooks.remove(this.draft)));
    actions.cancel.addEventListener('click', () => this.action('cancel', actions.cancel));
    actions.save.addEventListener('click', () => this.action('save', actions.save));
  }

  open(r: Rudiment, isNew: boolean) {
    this.draft = structuredClone(r);
    this.isNew = isNew;
    this.dirty = isNew;
    this.measures = parsePattern(r.pattern, r.time);
    this.sel = { m: 0, b: 0, i: 0 };
    $<HTMLInputElement>(this.root, '#edName').value = r.name;
    $<HTMLInputElement>(this.root, '#edCat').value = r.category === DEFAULT_CATEGORY ? t('categoryCustom') : r.category;
    this.fillTime();
    this.actions.delete.hidden = isNew;
    this.actions.cancel.hidden = false;
    this.actions.save.hidden = false;
    disarm(this.actions.delete);
    this.error('');
    this.renderGrid();
    this.emit(false);
  }

  close() {
    this.actions.delete.hidden = true;
    this.actions.cancel.hidden = true;
    this.actions.save.hidden = true;
  }

  private fillTime() {
    const t = this.draft.time;
    $<HTMLInputElement>(this.root, '#edNum').value = String(t.num);
    $<HTMLSelectElement>(this.root, '#edDen').value = String(t.den);
    $(this.root, '#edGroupsWrap').hidden = t.den !== 8;
    renderGroupPicker($(this.root, '#edGroups'), t.num, beatGroups(t), groups => this.groupsChanged(groups));
  }

  private groupsChanged(groups: number[]) {
    const t = this.draft.time;
    const time: TimeSig = { num: t.num, den: t.den };
    if (groups.join('+') !== defaultGroups(t.num, t.den).join('+')) time.groups = groups;
    this.draft.time = time;
    this.fillTime();
    this.emit();
  }

  private timeChanged() {
    const num = Math.max(1, Math.min(32, Math.round(Number($<HTMLInputElement>(this.root, '#edNum').value) || 4)));
    const den = Number($<HTMLSelectElement>(this.root, '#edDen').value);
    const time: TimeSig = { num, den };
    this.draft.time = time;
    this.fillTime();
    const lens = beatLengths(time);
    this.measures = this.measures.map(m => lens.map((len, i) => (m[i] && m[i].len.cmp(len) === 0 ? m[i] : blankBeat(len))));
    this.sel = { m: 0, b: 0, i: 0 };
    this.renderGrid();
    this.emit();
  }

  private resubdivide(m: number, b: number, n: number) {
    const old = this.measures[m][b];
    const slots: Slot[] = [];
    for (let j = 0; j < n; j++) {
      const at = new Frac(j, n);
      const k = old.slots.findIndex((_, i) => new Frac(i, old.slots.length).cmp(at) === 0);
      slots.push(k >= 0 ? old.slots[k] : { kind: j ? 'hold' : 'rest' });
    }
    this.measures[m][b] = { len: old.len, slots };
    this.sel = { m, b, i: 0 };
    this.renderGrid();
    this.emit();
  }

  private action(act: string, btn: HTMLElement) {
    switch (act) {
      case 'addMeasure': {
        const last = this.measures[this.measures.length - 1];
        this.measures.push(last.map(b => ({ len: b.len, slots: b.slots.map(s => ({ ...s })) })));
        break;
      }
      case 'removeMeasure': {
        if (this.measures.length < 2) return;
        this.measures.splice(Number(btn.dataset.m), 1);
        this.sel = { m: 0, b: 0, i: 0 };
        break;
      }
      case 'save':
        if (!this.draft.name.trim()) return this.error(t('nameRequired'));
        if (!this.draft.category.trim()) this.draft.category = DEFAULT_CATEGORY;
        this.draft.name = this.draft.name.trim();
        this.draft.category = this.draft.category.trim();
        this.draft.pattern = serializePattern(this.measures);
        this.dirty = false;
        return this.hooks.save(this.draft);
      case 'cancel':
        this.dirty = false;
        return this.hooks.cancel();
      default:
        if (!this.sel) return;
        this.edit(this.measures[this.sel.m][this.sel.b].slots, this.sel.i, act);
    }
    this.renderGrid();
    this.emit();
  }

  private edit(slots: Slot[], i: number, act: string) {
    const s = slots[i];
    if (act === 'R' || act === 'L') {
      slots[i] = s.kind === 'note' ? { ...s, hand: act as Hand } : { kind: 'note', hand: act as Hand };
      return;
    }
    if (act === 'rest' || act === 'hold') {
      slots[i] = { kind: act };
      return;
    }
    if (s.kind !== 'note') return;
    const n = { ...s };
    if (act === 'accent') n.accent = !n.accent || undefined;
    if (act === 'flam' || act === 'drag') n.grace = n.grace === act ? undefined : act;
    if (act === 'diddle' || act === 'buzz') n.roll = n.roll === act ? undefined : act;
    slots[i] = n;
  }

  private emit(dirty = true) {
    if (dirty) this.dirty = true;
    this.draft.pattern = serializePattern(this.measures);
    this.hooks.change(this.draft, this.measures);
  }

  private error(msg: string) {
    $(this.root, '.ed-error').textContent = msg;
  }

  private renderGrid() {
    const grid = $(this.root, '.ed-grid');
    grid.innerHTML = this.measures.map((m, mi) => `
      <div class="ed-measure">
        <div class="ed-mhead"><span>${t('measure', { n: mi + 1 })}</span>
          ${this.measures.length > 1 ? `<button data-act="removeMeasure" data-m="${mi}" title="${t('removeMeasure')}" aria-label="${t('removeMeasureN', { n: mi + 1 })}">×</button>` : ''}
        </div>
        <div class="ed-beats">${m.map((b, bi) => this.beatHtml(b, mi, bi)).join('')}</div>
      </div>`).join('');
    const cur = this.sel && this.measures[this.sel.m]?.[this.sel.b]?.slots[this.sel.i];
    this.root.querySelectorAll<HTMLButtonElement>('.ed-tools button').forEach(btn => {
      const a = btn.dataset.act!;
      const on = !!cur && (
        (cur.kind === 'note' && (cur.hand === a || (a === 'accent' && cur.accent) || cur.grace === a || cur.roll === a)) ||
        cur.kind === a);
      btn.classList.toggle('on', on);
      btn.disabled = !cur || (cur.kind !== 'note' && ['accent', 'flam', 'drag', 'diddle', 'buzz'].includes(a));
    });
  }

  private beatHtml(b: Beat, mi: number, bi: number): string {
    const n = b.slots.length;
    const options = [...new Set([...SUBDIVISIONS, n])].sort((x, y) => x - y)
      .map(s => `<option value="${s}" ${s === n ? 'selected' : ''}>${s}</option>`).join('');
    const cells = b.slots.map((s, i) => {
      const sel = this.sel && this.sel.m === mi && this.sel.b === bi && this.sel.i === i;
      return `<button class="cell ${s.kind}${s.accent ? ' accent' : ''}${sel ? ' sel' : ''}" data-cell="${mi},${bi},${i}" aria-label="${cellLabel(s)}">${cellHtml(s)}</button>`;
    }).join('');
    return `<div class="ed-beat"><select data-beat="${mi},${bi}" title="${t('notesInBeat', { n: bi + 1 })}" aria-label="${t('notesInBeat', { n: bi + 1 })}">${options}</select><div class="cells">${cells}</div></div>`;
  }
}

function blankBeat(len: Frac): Beat {
  const n = Math.max(1, Math.round(len.value * 8));
  return { len, slots: [...Array(n)].map(() => ({ kind: 'rest' as const })) };
}

function cellHtml(s: Slot): string {
  if (s.kind === 'rest') return '<i>𝄽</i>';
  if (s.kind === 'hold') return '<i>–</i>';
  const g = s.grace === 'flam' ? 'fl' : s.grace === 'drag' ? 'dr' : '';
  const r = s.roll === 'diddle' ? '/' : s.roll === 'buzz' ? 'z' : '';
  return `<small>${s.accent ? '&gt;' : '&nbsp;'}</small><b>${s.hand}</b><small>${g}${g && r ? ' ' : ''}${r}&nbsp;</small>`;
}

function cellLabel(s: Slot): string {
  if (s.kind !== 'note') return s.kind;
  return [s.hand, s.accent && 'accent', s.grace, s.roll].filter(Boolean).join(' ');
}
