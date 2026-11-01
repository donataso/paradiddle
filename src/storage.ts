// Paradiddle - drum rudiments trainer
// Copyright (C) 2026 Donatas Olsevičius
// SPDX-License-Identifier: AGPL-3.0-or-later

import { DEFAULT_CATEGORY, DENOMINATORS, Rudiment, parsePattern } from './model';

const CUSTOM_KEY = 'paradiddle.custom';
const SETTINGS_KEY = 'paradiddle.settings';

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export function loadCustom(): Rudiment[] {
  const list = read<unknown[]>(CUSTOM_KEY);
  return Array.isArray(list) ? list.map(validate).filter((r): r is Rudiment => !!r) : [];
}

export function saveCustom(list: Rudiment[]) {
  write(CUSTOM_KEY, list);
}

export function loadSettings<T>(): Partial<T> {
  return read<Partial<T>>(SETTINGS_KEY) ?? {};
}

export function saveSettings(s: unknown) {
  write(SETTINGS_KEY, s);
}

export function newId(): string {
  return 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function validate(x: unknown): Rudiment | undefined {
  if (!x || typeof x !== 'object') return;
  const r = x as Partial<Rudiment>;
  const t = r.time;
  if (typeof r.name !== 'string' || typeof r.pattern !== 'string' || !t) return;
  if (!Number.isInteger(t.num) || t.num < 1 || t.num > 32 || !DENOMINATORS.includes(t.den)) return;
  const time = { num: t.num, den: t.den, ...(Array.isArray(t.groups) ? { groups: t.groups.map(Number) } : {}) };
  try {
    parsePattern(r.pattern, time);
  } catch {
    return;
  }
  return {
    id: typeof r.id === 'string' && r.id.startsWith('c-') ? r.id : newId(),
    name: r.name.trim() || 'Untitled',
    category: typeof r.category === 'string' && r.category.trim() ? r.category.trim() : DEFAULT_CATEGORY,
    time,
    pattern: r.pattern,
  };
}

function exported(r: Rudiment) {
  const { id: _id, builtin: _b, ...rest } = r;
  return rest;
}

export function download(rudiments: Rudiment[], filename: string) {
  const data = { format: 'paradiddle', version: 1, rudiments: rudiments.map(exported) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'rudiment';
}

export function importRudiments(text: string, existing: Rudiment[], reserved: Rudiment[]): { list: Rudiment[]; added: number; skipped: number } {
  const data = JSON.parse(text);
  const items: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.rudiments) ? data.rudiments : [data];
  const list = [...existing];
  let added = 0;
  let skipped = 0;
  for (const item of items) {
    const r = validate(item);
    if (!r) {
      skipped++;
      continue;
    }
    const same = list.find(e => e.name === r.name && e.pattern === r.pattern && JSON.stringify(e.time) === JSON.stringify(r.time));
    if (same) {
      skipped++;
      continue;
    }
    r.id = newId();
    r.name = uniqueName(r.name, [...reserved, ...list]);
    list.push(r);
    added++;
  }
  return { list, added, skipped };
}

export function uniqueName(name: string, list: Rudiment[]): string {
  const names = new Set(list.map(r => r.name));
  if (!names.has(name)) return name;
  const base = name.replace(/ \(\d+\)$/, '');
  let i = 2;
  while (names.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}
