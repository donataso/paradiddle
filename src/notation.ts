// Paradiddle - drum rudiments trainer
// Copyright (C) 2026 Donatas Olsevičius
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  Annotation, Articulation, BarlineType, Beam, Dot, Formatter, GraceNote, GraceNoteGroup,
  Modifier, Renderer, Stave, StaveNote, Stem, Tremolo, Tuplet, Voice,
} from 'vexflow/bravura';
import { Frac, Measure, Slot, TimeSig } from './model';
import { durationCode, layoutBeat } from './layout';

export interface NotePos {
  x: number;
  top: number;
  bottom: number;
  el?: SVGElement;
}

export interface Sheet {
  notes: NotePos[];
}

const BEAMS: Record<string, number> = { '8': 1, '16': 2, '32': 3, '64': 4 };

class StemMark extends Tremolo {
  constructor(glyph: string) {
    super(1);
    this.text = glyph;
  }

  override draw() {
    const ctx = this.checkContext();
    const note = this.checkAttachedNote() as StaveNote;
    this.setRendered();
    const scale = note.getFontScale();
    const x = note.getAbsoluteX() + note.getGlyphWidth() - Stem.WIDTH / 2;
    const y = note.getStemExtents().topY + ((BEAMS[note.getDuration()] ?? 0) * 7.5 + 13) * scale;
    this.fontInfo.size = 30 * scale;
    this.renderText(ctx, x, y);
  }
}

const KEY = ['b/4'];
const LINE_H = 125;
const TOP = 25;
const MARGIN = 8;
const STICKING_FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

interface Built {
  voice: Voice;
  beams: Beam[];
  tuplets: Tuplet[];
  play: StaveNote[];
  lenQ: number;
}

function sticking(s: Slot): string {
  const g = s.hand === 'R' ? 'l' : 'r';
  return (s.grace === 'flam' ? g : s.grace === 'drag' ? g + g : '') + s.hand;
}

function makeNote(dur: Frac, rest: boolean, slot?: Slot): StaveNote {
  const { code, dots } = durationCode(dur);
  const note = new StaveNote({ keys: KEY, duration: code + (rest ? 'r' : ''), stemDirection: Stem.UP, autoStem: false });
  if (dots) Dot.buildAndAttach([note], { all: true });
  if (!slot) return note;
  if (slot.accent) note.addModifier(new Articulation('a>').setPosition(Modifier.Position.ABOVE), 0);
  if (slot.grace) {
    const flam = slot.grace === 'flam';
    const graces = [...Array(flam ? 1 : 2)].map(() =>
      new GraceNote({ keys: KEY, duration: flam ? '8' : '16', slash: flam, stemDirection: Stem.UP }));
    const group = new GraceNoteGroup(graces, false);
    if (!flam) group.beamNotes();
    note.addModifier(group, 0);
  }
  if (slot.roll === 'diddle') note.addModifier(new StemMark('\uE220'), 0);
  if (slot.roll === 'buzz') note.addModifier(new StemMark('\uE22A'), 0);
  note.addModifier(new Annotation(sticking(slot)).setFont(STICKING_FONT, 13, 'bold').setVerticalJustification(Annotation.VerticalJustify.BOTTOM), 0);
  return note;
}

const BEAMABLE = new Set(['8', '16', '32', '64', '128']);

function build(measure: Measure, time: TimeSig): Built {
  const tickables: StaveNote[] = [];
  const beams: Beam[] = [];
  const tuplets: Tuplet[] = [];
  const play: StaveNote[] = [];
  const pendingTuplets: { notes: StaveNote[]; num: number; occ: number }[] = [];
  let q = 0;
  for (const beat of measure) {
    let run: StaveNote[] = [];
    const flush = () => {
      if (run.length > 1) beams.push(new Beam(run, false));
      run = [];
    };
    for (const group of layoutBeat(beat)) {
      const ratio = group.tuplet ? group.tuplet.occ / group.tuplet.num : 1;
      const notes = group.notes.map(n => {
        const sn = makeNote(n.dur, n.rest, n.slot);
        q += n.dur.value * 4 * ratio;
        if (n.slot) play.push(sn);
        if (!n.rest && BEAMABLE.has(durationCode(n.dur).code)) run.push(sn);
        else flush();
        return sn;
      });
      tickables.push(...notes);
      if (group.tuplet) pendingTuplets.push({ notes, ...group.tuplet });
    }
    flush();
  }
  for (const t of pendingTuplets) {
    tuplets.push(new Tuplet(t.notes, { numNotes: t.num, notesOccupied: t.occ, ratioed: false }));
  }
  const voice = new Voice({ numBeats: time.num, beatValue: time.den }).setMode(Voice.Mode.SOFT).addTickables(tickables);
  return { voice, beams, tuplets, play, lenQ: q };
}

function minWidth(measure: Measure, time: TimeSig): number {
  const b = build(measure, time);
  return new Formatter().joinVoices([b.voice]).preCalculateMinTotalWidth([b.voice]);
}

function hideLines(stave: Stave) {
  stave.setConfigForLines([0, 1, 2, 3, 4].map(i => ({ visible: i === 2 })));
}

export function renderSheet(host: HTMLElement, measures: Measure[], time: TimeSig): Sheet {
  host.querySelector('svg')?.remove();
  const width = Math.max(260, host.clientWidth);
  const avail = width - 2 * MARGIN;
  const extra = (mi: number, first: boolean) => (first ? 40 : 0) + (mi === 0 ? 30 : 0) + 30;

  const natural = measures.map(m => minWidth(m, time) * 1.4 + 20);
  const lines: number[][] = [[]];
  let used = 0;
  measures.forEach((_, mi) => {
    let line = lines[lines.length - 1];
    let w = natural[mi] + extra(mi, !line.length);
    if (line.length && used + w > avail) {
      line = [];
      lines.push(line);
      used = 0;
      w = natural[mi] + extra(mi, true);
    }
    line.push(mi);
    used += w;
  });

  const renderer = new Renderer(host as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(width, lines.length * LINE_H + 10);
  const ctx = renderer.getContext();
  ctx.setFillStyle('currentColor');
  ctx.setStrokeStyle('currentColor');

  const positions: NotePos[] = [];
  lines.forEach((line, li) => {
    const widths = line.map((mi, k) => natural[mi] + extra(mi, k === 0));
    const total = widths.reduce((a, b) => a + b, 0);
    const scale = Math.min(avail / total, 2.2);
    let x = MARGIN;
    const y = li * LINE_H + TOP;
    line.forEach((mi, k) => {
      const w = widths[k] * scale;
      const stave = new Stave(x, y, w);
      hideLines(stave);
      if (k === 0) stave.addClef('percussion');
      if (mi === 0) {
        stave.addTimeSignature(`${time.num}/${time.den}`);
        stave.setBegBarType(BarlineType.REPEAT_BEGIN);
      }
      if (mi === measures.length - 1) stave.setEndBarType(BarlineType.REPEAT_END);
      stave.setContext(ctx).draw();
      const b = build(measures[mi], time);
      new Formatter().joinVoices([b.voice]).format([b.voice], stave.getNoteEndX() - stave.getNoteStartX() - 10);
      b.beams.forEach(beam => beam.postFormat());
      b.voice.draw(ctx, stave);
      b.beams.forEach(beam => beam.setContext(ctx).draw());
      b.tuplets.forEach(t => t.setContext(ctx).draw());
      const top = Math.min(stave.getYForLine(0), ...b.play.map(n => n.getStemExtents().topY)) - 18;
      const bottom = stave.getYForLine(4) + 34;
      for (const n of b.play) {
        positions.push({
          x: (n.getNoteHeadBeginX() + n.getNoteHeadEndX()) / 2,
          top,
          bottom,
          el: n.getSVGElement() ?? undefined,
        });
      }
      x += w;
    });
  });
  return { notes: positions };
}
