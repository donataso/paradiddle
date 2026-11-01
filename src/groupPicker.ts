// Paradiddle - drum rudiments trainer
// Copyright (C) 2026 Donatas Olsevičius
// SPDX-License-Identifier: AGPL-3.0-or-later

import { t } from './i18n';
import { groupStarts, startsToGroups } from './model';

export function renderGroupPicker(container: HTMLElement, num: number, groups: number[], onChange: (groups: number[]) => void) {
  const starts = new Set(groupStarts(groups));
  container.innerHTML = Array.from({ length: num }, (_, i) =>
    `<button type="button" class="gdot${starts.has(i) ? ' start' : ''}" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="${t('beatN', { n: i + 1 })}${i === 0 ? '' : starts.has(i) ? t('groupBreakJoin') : t('clickToSplit')}"></button>`
  ).join('');
  container.onclick = e => {
    const btn = (e.target as HTMLElement).closest('button.gdot') as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    btn.classList.toggle('start');
    const newStarts = [...container.querySelectorAll<HTMLButtonElement>('.gdot')]
      .reduce<number[]>((acc, el, i) => (el.classList.contains('start') ? [...acc, i] : acc), []);
    onChange(startsToGroups(newStarts, num));
  };
}
