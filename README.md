# Paradiddle

### :heart: If this project is useful to you, consider supporting it

[![Sponsor on GitHub](https://img.shields.io/badge/GitHub-Sponsor-ea4aaa.svg?logo=githubsponsors)](https://github.com/sponsors/donataso)
[![PayPal.me](https://img.shields.io/badge/PayPal.me-donataso-blue.svg?logo=paypal)](http://paypal.me/donataso)

Drum rudiments trainer.

**Open the app:** https://donataso.github.io/paradiddle/

## Features

- **Rudiments**: all 40 PAS International Drum Rudiments, grouped by category (rolls, diddles, flams, drags).
- **Notation**: PAS-style single-line staff, sticking (R/L) under notes, accents, flam/drag grace notes, tremolo slashes for rolls, "z" for buzz.
- **Playback**: looping, a marker that follows the current note, accent/tap/grace dynamics heard in the sound. Slashed notes play as written-out diddles, buzz as short presses.
- **Tempo**: BPM per quarter note, −10/−5/+5/+10 buttons.
- **Count-in**: 1 bar before the rudiment loop.
- **Metronome**: accented beat 1, optional subdivision clicks.
- **Speed trainer**: start BPM, target BPM, step, step every N loops.
- **Sounds**: selectable separately for click and rudiment, from a standard metronome click to drum-like sounds, synthesized with Web Audio.
- **Editor**: step grid with selectable notes per beat (tuplets are notated automatically); per step: hand, accent, flam, drag, diddle, buzz, rest, hold. Any time signature, including odd meters with custom beat grouping.
- **Custom rudiments**: built-ins are read-only; copy to customize, or create new.
- **Storage**: localStorage; JSON download/upload of all or individual rudiments. Uploads merge; duplicate names are renamed.
- **Devices**: desktop, tablet, phone; installable as an app (PWA) with offline support.
- **Theme**: dark mode follows the system setting.

## Stack

TypeScript, Vite, [VexFlow](https://www.vexflow.com/), Web Audio API. No UI framework.

## Development

Runs in `node:22-alpine` via Docker Compose; `node_modules` and the npm cache live in named volumes.

```bash
docker compose run --rm --service-ports dev
```

```bash
docker compose run --rm build
```

Output goes to `dist/`.

## License

© 2026 [Donatas Olsevičius](https://www.linkedin.com/in/olsevicius/) — [AGPL-3.0-or-later](LICENSE)
