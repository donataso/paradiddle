// Paradiddle - drum rudiments trainer
// Copyright (C) 2026 Donatas Olsevičius
// SPDX-License-Identifier: AGPL-3.0-or-later

export type Hand = 'R' | 'L';
export type Grace = 'flam' | 'drag';
export type Roll = 'diddle' | 'buzz';

export interface Slot {
  kind: 'note' | 'rest' | 'hold';
  hand?: Hand;
  accent?: boolean;
  grace?: Grace;
  roll?: Roll;
}

export interface Beat {
  len: Frac;
  slots: Slot[];
}

export type Measure = Beat[];

export interface TimeSig {
  num: number;
  den: number;
  groups?: number[];
}

export interface Rudiment {
  id: string;
  name: string;
  category: string;
  time: TimeSig;
  pattern: string;
  builtin?: boolean;
}

export class Frac {
  readonly n: number;
  readonly d: number;
  constructor(n: number, d = 1) {
    const g = gcd(Math.abs(n), Math.abs(d)) || 1;
    this.n = n / g;
    this.d = d / g;
  }
  add(o: Frac) { return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o: Frac) { return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o: Frac | number) { return typeof o === 'number' ? new Frac(this.n * o, this.d) : new Frac(this.n * o.n, this.d * o.d); }
  div(o: Frac | number) { return typeof o === 'number' ? new Frac(this.n, this.d * o) : new Frac(this.n * o.d, this.d * o.n); }
  cmp(o: Frac) { return this.n * o.d - o.n * this.d; }
  get value() { return this.n / this.d; }
  get dyadic() { return (this.d & (this.d - 1)) === 0; }
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

export const DENOMINATORS = [2, 4, 8, 16];

export function defaultGroups(num: number, den: number): number[] {
  if (den === 8) {
    if (num % 3 === 0) return Array(num / 3).fill(3);
    if (num < 4) return [num];
    const g = Array(Math.floor(num / 2)).fill(2);
    if (num % 2) g[g.length - 1] = 3;
    return g;
  }
  if (den === 16) {
    const g = Array(Math.floor(num / 4)).fill(4);
    if (num % 4) g.push(num % 4);
    return g;
  }
  return Array(num).fill(1);
}

export function beatGroups(t: TimeSig): number[] {
  const g = t.groups;
  if (g && g.length && g.every(x => x > 0) && g.reduce((a, b) => a + b, 0) === t.num) return g;
  return defaultGroups(t.num, t.den);
}

export function beatLengths(t: TimeSig): Frac[] {
  return beatGroups(t).map(g => new Frac(g, t.den));
}

export function measureLength(t: TimeSig): Frac {
  return new Frac(t.num, t.den);
}

const TOKEN = /([fd]?)([RL.\-])([>\/z]*)/y;

export function parsePattern(pattern: string, time: TimeSig): Measure[] {
  const lens = beatLengths(time);
  const measures = pattern.split('|').map(m => m.trim()).filter(Boolean);
  if (!measures.length) throw new Error('Pattern is empty');
  return measures.map((m, mi) => {
    const beats = m.split(/\s+/);
    if (beats.length !== lens.length) {
      throw new Error(`Measure ${mi + 1}: ${beats.length} beats, time signature needs ${lens.length}`);
    }
    return beats.map((b, bi) => ({ len: lens[bi], slots: parseBeat(b, mi, bi) }));
  });
}

function parseBeat(s: string, mi: number, bi: number): Slot[] {
  const slots: Slot[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < s.length) {
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(s);
    if (!m) throw new Error(`Measure ${mi + 1}, beat ${bi + 1}: invalid token at "${s.slice(at)}"`);
    const [, pre, core, suf] = m;
    if (core === '.' || core === '-') {
      if (pre || suf) throw new Error(`Measure ${mi + 1}, beat ${bi + 1}: modifiers on rest/hold`);
      slots.push({ kind: core === '.' ? 'rest' : 'hold' });
      continue;
    }
    const slot: Slot = { kind: 'note', hand: core as Hand };
    if (pre === 'f') slot.grace = 'flam';
    if (pre === 'd') slot.grace = 'drag';
    if (suf.includes('>')) slot.accent = true;
    if (suf.includes('/')) slot.roll = 'diddle';
    if (suf.includes('z')) slot.roll = 'buzz';
    slots.push(slot);
  }
  if (!slots.length) throw new Error(`Measure ${mi + 1}, beat ${bi + 1}: empty`);
  return slots;
}

export function slotToken(s: Slot): string {
  if (s.kind === 'rest') return '.';
  if (s.kind === 'hold') return '-';
  return (s.grace === 'flam' ? 'f' : s.grace === 'drag' ? 'd' : '') + s.hand +
    (s.accent ? '>' : '') + (s.roll === 'diddle' ? '/' : s.roll === 'buzz' ? 'z' : '');
}

export function serializePattern(measures: Measure[]): string {
  return measures.map(m => m.map(b => b.slots.map(slotToken).join('')).join(' ')).join(' | ');
}

export function timeLabel(t: TimeSig): string {
  const g = beatGroups(t);
  const custom = t.den === 8 && g.join('+') !== defaultGroups(t.num, t.den).join('+');
  return `${t.num}/${t.den}` + (custom ? ` (${g.join('+')})` : '');
}

export interface BeatEvent {
  start: number;
  len: number;
  slot?: Slot;
}

export function beatEvents(slots: Slot[]): BeatEvent[] {
  const ev: BeatEvent[] = [];
  slots.forEach((s, i) => {
    const last = ev[ev.length - 1];
    if (s.kind === 'note') ev.push({ start: i, len: 1, slot: s });
    else if (last && (s.kind === 'hold' || !last.slot)) last.len++;
    else ev.push({ start: i, len: 1 });
  });
  return ev;
}
