// Paradiddle - drum rudiments trainer
// Copyright (C) 2026 Donatas Olsevičius
// SPDX-License-Identifier: AGPL-3.0-or-later

export type Variant = 'normal' | 'accent' | 'sub';

export const VOICES: Record<string, string> = {
  click: 'Click',
  beep: 'Beep',
  woodblock: 'Woodblock',
  cowbell: 'Cowbell',
  rim: 'Rim click',
  hihat: 'Hi-hat',
  pad: 'Practice pad',
  snare: 'Snare',
};

let noise: AudioBuffer | undefined;

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

function env(ctx: BaseAudioContext, dest: AudioNode, t: number, peak: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  g.connect(dest);
  return g;
}

function tone(ctx: BaseAudioContext, dest: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, peak: number, decay: number) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + decay);
  o.connect(env(ctx, dest, t, peak, decay));
  o.start(t);
  o.stop(t + decay + 0.01);
}

function hiss(ctx: BaseAudioContext, dest: AudioNode, t: number, filter: BiquadFilterType, freq: number, q: number, peak: number, decay: number) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f).connect(env(ctx, dest, t, peak, decay));
  src.start(t, Math.random() * 0.5);
  src.stop(t + decay + 0.01);
}

export function playVoice(ctx: BaseAudioContext, dest: AudioNode, voice: string, t: number, gain: number, variant: Variant = 'normal') {
  const pitch = variant === 'accent' ? 1.8 : variant === 'sub' ? 0.8 : 1;
  const ring = variant === 'accent' ? 1.6 : 1;
  const dk = (d: number) => d * ring;
  const g = gain;
  switch (voice) {
    case 'beep':
      tone(ctx, dest, t, 'sine', 880 * pitch, 880 * pitch, g * 0.6, dk(0.07));
      break;
    case 'woodblock':
      tone(ctx, dest, t, 'sine', 1100 * pitch, 900 * pitch, g * 0.8, dk(0.06));
      hiss(ctx, dest, t, 'bandpass', 2200 * pitch, 8, g * 0.6, dk(0.02));
      break;
    case 'cowbell': {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900 * pitch;
      f.Q.value = 1.5;
      f.connect(dest);
      tone(ctx, f, t, 'square', 562 * pitch, 562 * pitch, g * 0.5, dk(0.25));
      tone(ctx, f, t, 'square', 845 * pitch, 845 * pitch, g * 0.5, dk(0.25));
      break;
    }
    case 'rim':
      hiss(ctx, dest, t, 'bandpass', 1800 * pitch, 4, g * 1.4, dk(0.04));
      tone(ctx, dest, t, 'triangle', 420 * pitch, 380 * pitch, g * 0.5, dk(0.03));
      break;
    case 'hihat':
      hiss(ctx, dest, t, 'highpass', 7000 * pitch, 1, g * 0.9, dk(0.05));
      break;
    case 'pad':
      hiss(ctx, dest, t, 'bandpass', 1200 * pitch, 1.2, g * 1.6, dk(0.05));
      tone(ctx, dest, t, 'sine', 320 * pitch, 260 * pitch, g * 0.3, dk(0.03));
      break;
    case 'snare':
      hiss(ctx, dest, t, 'highpass', 1500, 0.7, g * 0.9, dk(0.12 + 0.08 * g));
      tone(ctx, dest, t, 'triangle', 210 * pitch, 160 * pitch, g * 0.7, dk(0.08));
      break;
    default:
      tone(ctx, dest, t, 'square', 1600 * pitch, 1600 * pitch, g * 0.35, dk(0.02));
      tone(ctx, dest, t, 'sine', 3200 * pitch, 3200 * pitch, g * 0.3, dk(0.015));
  }
}
