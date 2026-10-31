// Paradiddle - drum rudiments trainer
// Copyright (C) 2026 Donatas Olsevičius
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Rudiment } from './model';

export const CATEGORIES = [
  'Single Stroke Rolls',
  'Multiple Bounce Rolls',
  'Double Stroke Rolls',
  'Diddles',
  'Flams',
  'Drags',
];

type Def = [name: string, category: number, time: string, pattern: string];

const DEFS: Def[] = [
  ['Single Stroke Roll', 0, '2/4', 'RLRL RLRL'],
  ['Single Stroke Four', 0, '2/4', 'RLRL>-- RLRL>--'],
  ['Single Stroke Seven', 0, '2/4', 'RLRLRL R> | LRLRLR L>'],
  ['Multiple Bounce Roll', 1, '2/4', 'RzLzRzLz RzLzRzLz'],
  ['Triple Stroke Roll', 1, '2/4', 'RRRLLL RRRLLL'],
  ['Double Stroke Open Roll', 2, '2/4', 'R/L/ R/L/'],
  ['Five Stroke Roll', 2, '2/4', 'R/L/ R> | L/R/ L>'],
  ['Six Stroke Roll', 2, '2/4', 'R>L/ R/L>'],
  ['Seven Stroke Roll', 2, '2/4', 'L/R/L/ R> | R/L/R/ L>'],
  ['Nine Stroke Roll', 2, '4/4', 'R/L/ R/L/ R> . | L/R/ L/R/ L> .'],
  ['Ten Stroke Roll', 2, '4/4', 'R/L/ R/L/ R>L> .'],
  ['Eleven Stroke Roll', 2, '4/4', 'R/L/ R/L/ R/L> .'],
  ['Thirteen Stroke Roll', 2, '4/4', 'R/L/ R/L/ R/L/ R> | L/R/ L/R/ L/R/ L>'],
  ['Fifteen Stroke Roll', 2, '4/4', 'R/L/ R/L/ R/L/ R/L>'],
  ['Seventeen Stroke Roll', 2, '4/4', 'R/L/ R/L/ R/L/ R/L/ | R> . . . | L/R/ L/R/ L/R/ L/R/ | L> . . .'],
  ['Single Paradiddle', 3, '2/4', 'R>LRR L>RLL'],
  ['Double Paradiddle', 3, '2/4', 'R>LRLRR L>RLRLL'],
  ['Triple Paradiddle', 3, '4/4', 'R>LRL RLRR L>RLR LRLL'],
  ['Single Paradiddle-Diddle', 3, '2/4', 'R>LRRLL R>LRRLL'],
  ['Flam', 4, '2/4', 'fR fL'],
  ['Flam Accent', 4, '2/4', 'fR>LR fL>RL'],
  ['Flam Tap', 4, '2/4', 'fR>RfL>L fR>RfL>L'],
  ['Flamacue', 4, '2/4', 'fRL>RL fR | fLR>LR fL'],
  ['Flam Paradiddle', 4, '2/4', 'fR>LRR fL>RLL'],
  ['Single Flammed Mill', 4, '2/4', 'fR>RLR fL>LRL'],
  ['Flam Paradiddle-Diddle', 4, '2/4', 'fR>LRRLL fL>RLLRR'],
  ['Pataflafla', 4, '2/4', 'fRLRfL fRLRfL'],
  ['Swiss Army Triplet', 4, '2/4', 'fR>RL fR>RL'],
  ['Inverted Flam Tap', 4, '2/4', 'fR>LfL>R fR>LfL>R'],
  ['Flam Drag', 4, '2/4', 'fR>L/R fL>R/L'],
  ['Drag', 5, '2/4', 'dR dL'],
  ['Single Drag Tap', 5, '2/4', 'dRL> dLR>'],
  ['Double Drag Tap', 5, '2/4', 'dRdRL> dLdLR>'],
  ['Lesson 25', 5, '2/4', 'dRLR>- dLRL>-'],
  ['Single Dragadiddle', 5, '2/4', 'R>/LRR L>/RLL'],
  ['Drag Paradiddle #1', 5, '2/4', 'R>-dRL RR | L>-dLR LL'],
  ['Drag Paradiddle #2', 5, '3/4', 'R>dR dRL RR | L>dL dLR LL'],
  ['Single Ratamacue', 5, '2/4', 'dRLRL>-- dLRLR>--'],
  ['Double Ratamacue', 5, '6/8', 'dR--dRLRL>-- dL--dLRLR>--'],
  ['Triple Ratamacue', 5, '2/4', 'dRdR dRLRL>-- | dLdL dLRLR>--'],
];

export const BUILTINS: Rudiment[] = DEFS.map(([name, cat, time, pattern], i) => {
  const [num, den] = time.split('/').map(Number);
  return {
    id: `pas-${String(i + 1).padStart(2, '0')}`,
    name: `${i + 1}. ${name}`,
    category: CATEGORIES[cat],
    time: { num, den },
    pattern,
    builtin: true,
  };
});
