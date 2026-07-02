# Compost Spore Incoming QA

Generated incoming ground-area frames only. Not promoted to runtime.

## Frame Metrics

| file | canvas | bbox | opaquePx | partialPx |
| --- | --- | --- | ---: | ---: |
| `area_0.png` | `(192, 192)` | `(66, 70, 153, 148)` | 706 | 289 |
| `area_1.png` | `(192, 192)` | `(20, 55, 192, 166)` | 7172 | 629 |
| `area_2.png` | `(192, 192)` | `(0, 34, 131, 170)` | 8985 | 1043 |
| `area_3.png` | `(192, 192)` | `(45, 13, 188, 144)` | 10014 | 832 |
| `area_4.png` | `(192, 192)` | `(27, 26, 157, 140)` | 7143 | 597 |
| `area_5.png` | `(192, 192)` | `(9, 43, 123, 139)` | 725 | 305 |

## Checks

- All output frames use a fixed `192x192` transparent canvas.
- Relative ground-area growth/fade from the generated sheet was preserved.
- These files are in `_incoming` only and are not runtime-promoted.
- Original Canvas fallback remains untouched.
- Visual note: the source used magenta chroma key; minor magenta-tinted wisps may be removed during keying, but the main compost/soil/spore area is preserved.
- Contact sheet: `screenshots/compost-spore-incoming-contact-sheet.png`