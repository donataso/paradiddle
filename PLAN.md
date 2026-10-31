# Implementation Plan

1. **Scaffold**: Vite + TypeScript, Docker Compose (`dev`, `build`, `preview`; named volumes for `node_modules` and npm cache), responsive layout, dark mode via CSS variables.
2. **Data model**: one JSON schema for built-ins, custom rudiments and import/export. Rudiment: id, name, category, time signature, measures → steps. Step: duration/tuplet, hand, accent, grace (flam/drag), roll (diddle/buzz), rest.
3. **Prototype rudiments**: paradiddle, flam accent, 5-stroke roll.
4. **Notation renderer** (VexFlow): single-line staff, sticking, accents, grace notes, tremolo slashes, buzz "z", tuplets, beaming, odd meters, line wrapping on narrow screens. Exposes note positions for the marker.
5. **Audio engine**: Web Audio look-ahead scheduler. Rudiment → timed events (grace notes before the beat, diddles expanded, buzz as short presses), dynamic levels for accent/tap/grace.
6. **Sounds**: CC0 sample set if a suitable one exists, otherwise synthesized. Separate selection for click and rudiment.
7. **Player UI**: play/stop, tempo ±1/±5, 1-bar count-in, loop, marker synced to the audio clock.
8. **Metronome**: accented beat 1, subdivision clicks; standalone or with the rudiment.
9. **Speed trainer**: start/target BPM, step, every N loops.
10. **All 40 rudiments**: encoded per the PAS sheet.
11. **Editor**: step grid, copy from built-in or new, live notation preview.
12. **Storage**: localStorage; download all or one; upload with merge and renaming of duplicates.
13. **Deploy**: GitHub Actions workflow for Pages; `dist/` also works on Cloudflare Pages.

Notation is checked in the browser after steps 4 and 11.
