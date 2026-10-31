// Paradiddle - drum rudiments trainer
// Copyright (C) 2026 Donatas Olsevičius
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Beat, BeatEvent, Frac, Slot, beatEvents } from './model';

export interface LNote {
  dur: Frac;
  rest: boolean;
  slot?: Slot;
}

export interface LGroup {
  notes: LNote[];
  tuplet?: { num: number; occ: number };
}

export function layoutBeat(beat: Beat): LGroup[] {
  return span(beat.len, beat.slots.length, beatEvents(beat.slots));
}

function span(len: Frac, slots: number, events: BeatEvent[]): LGroup[] {
  const slotLen = len.div(slots);
  if (events.every(e => slotLen.mul(e.len).dyadic)) {
    return [{ notes: events.flatMap(e => pieces(slotLen.mul(e.len), e)) }];
  }
  for (const parts of [2, 3]) {
    if (slots % parts) continue;
    const per = slots / parts;
    if (events.some(e => Math.floor(e.start / per) !== Math.floor((e.start + e.len - 1) / per))) continue;
    const rendered = [...Array(parts)].map((_, k) => span(len.div(parts), per,
      events.filter(e => Math.floor(e.start / per) === k).map(e => ({ ...e, start: e.start - k * per }))));
    if (rendered.some(r => r.every(g => !g.tuplet))) return rendered.flat();
  }
  let occ = 1;
  while (occ * 2 < slots) occ *= 2;
  const written = len.div(occ);
  return [{ notes: events.flatMap(e => pieces(written.mul(e.len), e)), tuplet: { num: slots, occ } }];
}

function pieces(dur: Frac, e: BeatEvent): LNote[] {
  const out: LNote[] = [];
  let rem = dur;
  while (rem.n > 0) {
    const d = largestWritable(rem);
    const first = !out.length;
    out.push({ dur: d, rest: !e.slot || !first, slot: first ? e.slot : undefined });
    rem = rem.sub(d);
  }
  return out;
}

function largestWritable(f: Frac): Frac {
  for (let k = 0; k <= 7; k++) {
    const base = new Frac(1, 2 ** k);
    const dotted = base.mul(new Frac(3, 2));
    if (dotted.cmp(f) <= 0) return dotted;
    if (base.cmp(f) <= 0) return base;
  }
  return f;
}

const CODES: Record<number, string> = { 1: 'w', 2: 'h', 4: 'q', 8: '8', 16: '16', 32: '32', 64: '64', 128: '128' };

export function durationCode(d: Frac): { code: string; dots: number } {
  if (d.n === 1 && d.d === 1) return { code: 'w', dots: 0 };
  if (d.n === 3) return { code: CODES[d.d / 2] ?? 'w', dots: 1 };
  return { code: CODES[d.d] ?? '64', dots: 0 };
}
