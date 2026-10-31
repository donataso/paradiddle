// Paradiddle - drum rudiments trainer
// Copyright (C) 2026 Donatas Olsevičius
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Measure, Slot, TimeSig, beatEvents, beatLengths } from './model';

export interface TNote {
  q: number;
  durQ: number;
  slot: Slot;
  index: number;
}

export interface TBeat {
  q: number;
  lenQ: number;
  index: number;
}

export interface Timeline {
  lenQ: number;
  notes: TNote[];
  beats: TBeat[];
  countIn: TBeat[];
}

export function buildTimeline(measures: Measure[]): Timeline {
  const notes: TNote[] = [];
  const beats: TBeat[] = [];
  let q = 0;
  for (const m of measures) {
    m.forEach((beat, bi) => {
      const lenQ = beat.len.value * 4;
      const slotQ = lenQ / beat.slots.length;
      beats.push({ q, lenQ, index: bi });
      for (const e of beatEvents(beat.slots)) {
        if (e.slot) notes.push({ q: q + e.start * slotQ, durQ: e.len * slotQ, slot: e.slot, index: notes.length });
      }
      q += lenQ;
    });
  }
  return { lenQ: q, notes, beats, countIn: beats.slice(0, measures[0].length) };
}

export function clickTimeline(time: TimeSig): Timeline {
  let q = 0;
  const beats = beatLengths(time).map((len, index) => {
    const b = { q, lenQ: len.value * 4, index };
    q += b.lenQ;
    return b;
  });
  return { lenQ: q, notes: [], beats, countIn: beats };
}
