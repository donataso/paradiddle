// Paradiddle - drum rudiments trainer
// Copyright (C) 2026 Donatas Olsevičius
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Measure, Slot, TimeSig, beatEvents, beatLengths, beatPulses } from './model';

export interface TNote {
  q: number;
  durQ: number;
  slot: Slot;
  index: number;
}

export interface TMark {
  q: number;
  index: number;
}

export interface TBeat {
  q: number;
  lenQ: number;
  index: number;
  units: number;
  stepOffsets: number[];
}

export interface Timeline {
  lenQ: number;
  notes: TNote[];
  rests: TMark[];
  beats: TBeat[];
  countIn: TBeat[];
  unitQ: number;
}

// Per-beat dot count, one array per measure. A beat with real internal
// structure (more than one written pulse: a note or a rest) keeps one dot
// per pulse — holds ('-') don't count, they just extend the previous pulse's
// sustain. A beat that's just one bare pulse spanning the whole beat (e.g. a
// trailing accent, or a whole rest-only measure) has no structure to show, so
// it borrows the finest pulse width among same-length beats anywhere in the
// rudiment (capped at 1/16 of its own length) to get a trailing "pause" dot
// too. Every measure of a rudiment shares the same beat-length grid, so
// borrowing across measures is safe; only same-length beats are comparable,
// so an irregular/manually grouped beat of a different size never donates or
// receives a borrowed grid.
export function measureSteps(measures: Measure[]): number[][] {
  const all = measures.flatMap(m => m.map(beat => ({ lenQ: beat.len.value * 4, count: beatPulses(beat.slots).length })));
  const widthsByLen = new Map<number, number[]>();
  for (const b of all) if (b.count > 1) widthsByLen.set(b.lenQ, [...(widthsByLen.get(b.lenQ) ?? []), b.lenQ / b.count]);
  return measures.map(m =>
    m.map(beat => {
      const lenQ = beat.len.value * 4;
      const count = beatPulses(beat.slots).length;
      if (count > 1) return count;
      const widths = widthsByLen.get(lenQ);
      if (!widths?.length) return 1;
      const finest = Math.min(...widths);
      return Math.max(1, Math.round(lenQ / Math.max(finest, lenQ / 16)));
    }),
  );
}

// notes and rests share one index space, matching the order renderSheet
// assigns to its marker positions (one per first-piece of each written note
// or rest), so the marker can land on rests, not just sounded notes.
export function buildTimeline(measures: Measure[], den: number): Timeline {
  const notes: TNote[] = [];
  const rests: TMark[] = [];
  const beats: TBeat[] = [];
  let q = 0;
  let markIndex = 0;
  const steps = measureSteps(measures);
  measures.forEach((m, mi) => {
    m.forEach((beat, bi) => {
      const lenQ = beat.len.value * 4;
      const slotQ = lenQ / beat.slots.length;
      const pulses = beatPulses(beat.slots);
      const n = steps[mi][bi];
      const stepOffsets = pulses.length > 1 ? pulses.map(p => p.start * slotQ) : Array.from({ length: n }, (_, u) => (u * lenQ) / n);
      beats.push({ q, lenQ, index: bi, units: n, stepOffsets });
      for (const e of beatEvents(beat.slots)) {
        const eq = q + e.start * slotQ;
        if (e.slot) notes.push({ q: eq, durQ: e.len * slotQ, slot: e.slot, index: markIndex });
        else rests.push({ q: eq, index: markIndex });
        markIndex++;
      }
      q += lenQ;
    });
  });
  return { lenQ: q, notes, rests, beats, countIn: beats.slice(0, measures[0].length), unitQ: 4 / den };
}

export function clickTimeline(time: TimeSig): Timeline {
  let q = 0;
  const unitQ = 4 / time.den;
  const beats = beatLengths(time).map((len, index) => {
    const lenQ = len.value * 4;
    const units = Math.max(1, Math.round(lenQ / unitQ));
    const b = { q, lenQ, index, units, stepOffsets: Array.from({ length: units }, (_, u) => (u * lenQ) / units) };
    q += lenQ;
    return b;
  });
  return { lenQ: q, notes: [], rests: [], beats, countIn: beats, unitQ };
}
