// Paradiddle - drum rudiments trainer
// Copyright (C) 2026 Donatas Olsevičius
// SPDX-License-Identifier: AGPL-3.0-or-later

import { playVoice } from './sounds';
import { TBeat, TNote, Timeline } from './timeline';

export interface Trainer {
  on: boolean;
  start: number;
  target: number;
  step: number;
  every: number;
}

export interface PlayerOptions {
  sub: number;
  countIn: boolean;
  rudVoice: string;
  clickVoice: string;
  rudVol: number;
  clickVol: number;
  trainer: Trainer;
}

type Item =
  | { q: number; type: 'note'; note: TNote }
  | { q: number; type: 'click'; beat: TBeat; level: 'accent' | 'normal' | 'sub' }
  | { q: number; type: 'step'; beat: TBeat; step: number };

interface Segment {
  count: boolean;
  lenQ: number;
  items: Item[];
}

export const TEMPO_MIN = 20;
export const TEMPO_MAX = 300;
const LOOKAHEAD = 0.12;
const LEVEL = { accent: 1, tap: 0.42, grace: 0.22, buzz: 0.3 };

export class Player {
  onNote?: (index: number) => void;
  onBeat?: (beat: TBeat, count: boolean, step: number) => void;
  onTempo?: (bpm: number) => void;
  onLoop?: (loops: number) => void;
  onStop?: () => void;

  tempo = 100;
  playing = false;
  private ctx?: AudioContext;
  private bus?: GainNode;
  private rudGain?: GainNode;
  private clickGain?: GainNode;
  private timer = 0;
  private raf = 0;
  private tl!: Timeline;
  private next?: Timeline;
  private notesOn = true;
  private seg!: Segment;
  private segQ = 0;
  private idx = 0;
  private loops = 0;
  private anchorT = 0;
  private anchorQ = 0;
  private visuals: { t: number; fn: () => void }[] = [];

  constructor(public opts: PlayerOptions) {}

  private get spq() { return 60 / this.tempo; }
  private timeOf(q: number) { return this.anchorT + (q - this.anchorQ) * this.spq; }

  async start(tl: Timeline, notes: boolean) {
    this.stop();
    this.ctx ??= new AudioContext({ latencyHint: 'interactive' });
    await this.ctx.resume();
    const ctx = this.ctx;
    this.bus = ctx.createGain();
    this.bus.connect(ctx.destination);
    this.rudGain = ctx.createGain();
    this.clickGain = ctx.createGain();
    this.rudGain.connect(this.bus);
    this.clickGain.connect(this.bus);
    this.applyVolumes();
    this.tl = tl;
    this.next = undefined;
    this.notesOn = notes;
    this.loops = 0;
    if (this.opts.trainer.on) this.setTempo(this.opts.trainer.start);
    this.anchorT = ctx.currentTime + 0.08;
    this.anchorQ = 0;
    this.segQ = 0;
    this.seg = this.opts.countIn && notes ? this.countSegment() : this.loopSegment();
    this.idx = 0;
    if (!this.seg.count) {
      this.loops = 1;
      this.visual(this.timeOf(this.segQ), () => this.onLoop?.(1));
    }
    this.playing = true;
    this.timer = window.setInterval(() => this.tick(), 25);
    this.tick();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.visuals = [];
    const bus = this.bus!;
    bus.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.01);
    setTimeout(() => bus.disconnect(), 200);
    this.onStop?.();
  }

  setTimeline(tl: Timeline) {
    if (this.playing) this.next = tl;
    else this.tl = tl;
  }

  setTempo(bpm: number, atQ?: number) {
    bpm = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(bpm)));
    if (bpm === this.tempo) return;
    if (this.playing) {
      const q = atQ ?? this.segQ + (this.seg.items[this.idx]?.q ?? this.seg.lenQ);
      this.anchorT = this.timeOf(q);
      this.anchorQ = q;
    }
    this.tempo = bpm;
    this.onTempo?.(bpm);
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.rudGain?.gain.setTargetAtTime(this.opts.rudVol, this.ctx.currentTime, 0.01);
    this.clickGain?.gain.setTargetAtTime(this.opts.clickVol, this.ctx.currentTime, 0.01);
  }

  private clicks(beats: TBeat[], items: Item[]) {
    const sub = Math.max(1, this.opts.sub);
    const unit = this.tl.unitQ;
    const step = unit / sub;
    for (const beat of beats) {
      items.push({ q: beat.q, type: 'click', beat, level: beat.index === 0 ? 'accent' : 'normal' });
      items.push({ q: beat.q, type: 'step', beat, step: 0 });
      const units = Math.max(1, Math.round(beat.lenQ / unit));
      for (let u = 1; u < units; u++) items.push({ q: beat.q + u * unit, type: 'step', beat, step: u });
      if (sub > 1) for (let q = beat.q + step; q < beat.q + beat.lenQ - 1e-9; q += step) items.push({ q, type: 'click', beat, level: 'sub' });
    }
  }

  private countSegment(): Segment {
    const items: Item[] = [];
    this.clicks(this.tl.countIn, items);
    const last = this.tl.countIn[this.tl.countIn.length - 1];
    return { count: true, lenQ: last.q + last.lenQ, items: items.sort((a, b) => a.q - b.q) };
  }

  private loopSegment(): Segment {
    const items: Item[] = [];
    if (this.notesOn) for (const note of this.tl.notes) items.push({ q: note.q, type: 'note', note });
    this.clicks(this.tl.beats, items);
    return { count: false, lenQ: this.tl.lenQ, items: items.sort((a, b) => a.q - b.q) };
  }

  private advance() {
    this.segQ += this.seg.lenQ;
    if (!this.seg.count) {
      const completed = this.loops;
      const t = this.opts.trainer;
      if (t.on && t.every > 0 && completed % t.every === 0) {
        const bpm = t.target >= t.start ? Math.min(t.target, this.tempo + t.step) : Math.max(t.target, this.tempo - t.step);
        this.setTempo(bpm, this.segQ);
      }
    }
    if (this.next) {
      this.tl = this.next;
      this.next = undefined;
    }
    this.seg = this.loopSegment();
    this.idx = 0;
    this.loops++;
    const loops = this.loops;
    this.visual(this.timeOf(this.segQ), () => this.onLoop?.(loops));
  }

  private tick() {
    const ctx = this.ctx!;
    const horizon = ctx.currentTime + LOOKAHEAD;
    for (;;) {
      if (this.idx >= this.seg.items.length) {
        if (this.timeOf(this.segQ + this.seg.lenQ) > horizon) break;
        this.advance();
        continue;
      }
      const it = this.seg.items[this.idx];
      const t = this.timeOf(this.segQ + it.q);
      if (t > horizon) break;
      this.idx++;
      if (it.type === 'note') this.playNote(it.note, t);
      else if (it.type === 'click') this.playClick(it, t);
      else { const count = this.seg.count; this.visual(t, () => this.onBeat?.(it.beat, count, it.step)); }
    }
  }

  private playClick(it: Extract<Item, { type: 'click' }>, t: number) {
    const count = this.seg.count;
    if (count || !this.notesOn) {
      const gain = it.level === 'sub' ? 0.45 : it.level === 'accent' ? 1 : 0.75;
      playVoice(this.ctx!, this.clickGain!, this.opts.clickVoice, t, gain, it.level);
    }
  }

  private playNote(n: TNote, t: number) {
    const ctx = this.ctx!;
    const out = this.rudGain!;
    const v = this.opts.rudVoice;
    const s = n.slot;
    const dur = n.durQ * this.spq;
    const main = s.accent ? LEVEL.accent : LEVEL.tap;
    if (s.grace) {
      const count = s.grace === 'flam' ? 1 : 2;
      const gap = Math.min(s.grace === 'flam' ? 0.03 : 0.035, dur / 3);
      for (let k = count; k >= 1; k--) playVoice(ctx, out, v, Math.max(ctx.currentTime, t - gap * k), LEVEL.grace);
    }
    if (s.roll === 'diddle') {
      playVoice(ctx, out, v, t, main);
      playVoice(ctx, out, v, t + dur / 2, s.accent ? LEVEL.tap * 1.2 : LEVEL.tap * 0.9);
    } else if (s.roll === 'buzz') {
      const hits = Math.max(3, Math.round(dur / 0.028));
      const step = (dur * 0.92) / hits;
      for (let i = 0; i < hits; i++) playVoice(ctx, out, v, t + i * step, (i ? LEVEL.buzz : main) * (1 - (0.3 * i) / hits));
    } else {
      playVoice(ctx, out, v, t, main);
    }
    this.visual(t, () => this.onNote?.(n.index));
  }

  private visual(t: number, fn: () => void) {
    this.visuals.push({ t, fn });
  }

  private frame = () => {
    if (!this.playing) return;
    const ctx = this.ctx!;
    const now = ctx.getOutputTimestamp?.().contextTime ?? ctx.currentTime;
    this.visuals.sort((a, b) => a.t - b.t);
    while (this.visuals.length && this.visuals[0].t <= now) this.visuals.shift()!.fn();
    this.raf = requestAnimationFrame(this.frame);
  };
}
