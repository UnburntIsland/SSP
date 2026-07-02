# Seed Blade Incoming QA

Generated incoming frames only. Not promoted to runtime.

## Frame Metrics

| file | canvas | bbox | opaquePx | partialPx | scale |
| --- | --- | --- | ---: | ---: | ---: |
| `projectile_0.png` | `(64, 64)` | `(5, 14, 59, 50)` | 733 | 61 | 0.307 |
| `projectile_1.png` | `(64, 64)` | `(5, 9, 59, 55)` | 1166 | 194 | 0.362 |
| `projectile_2.png` | `(64, 64)` | `(5, 12, 59, 52)` | 919 | 73 | 0.235 |
| `projectile_3.png` | `(64, 64)` | `(5, 5, 59, 58)` | 1096 | 118 | 0.242 |
| `hit_0.png` | `(64, 64)` | `(5, 6, 59, 57)` | 901 | 166 | 0.362 |
| `hit_1.png` | `(64, 64)` | `(5, 10, 59, 54)` | 594 | 87 | 0.221 |
| `hit_2.png` | `(64, 64)` | `(6, 5, 57, 59)` | 218 | 62 | 0.260 |
| `hit_3.png` | `(64, 64)` | `(5, 8, 59, 56)` | 87 | 44 | 0.276 |

## Checks

- All output frames use a fixed `64x64` transparent canvas.
- These files are in `_incoming` only and are not runtime-promoted.
- Original Canvas fallback remains untouched.
- Contact sheet: `screenshots/seed-blade-incoming-contact-sheet.png`