# Common Combat Effects Incoming QA

Generated incoming common effect frames only. Not promoted to runtime.

## Frame Metrics

| group | file | canvas | bbox | opaquePx | partialPx | scale |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `hit_small` | `hit_small_0.png` | `(64, 64)` | `(6, 5, 57, 59)` | 481 | 239 | 0.429 |
| `hit_small` | `hit_small_1.png` | `(64, 64)` | `(5, 7, 59, 56)` | 613 | 294 | 0.316 |
| `hit_small` | `hit_small_2.png` | `(64, 64)` | `(5, 7, 59, 57)` | 281 | 107 | 0.327 |
| `hit_small` | `hit_small_3.png` | `(64, 64)` | `(5, 5, 59, 59)` | 193 | 56 | 0.353 |
| `purify_pop` | `purify_pop_0.png` | `(96, 96)` | `(5, 6, 91, 89)` | 1717 | 1880 | 0.478 |
| `purify_pop` | `purify_pop_1.png` | `(96, 96)` | `(5, 8, 91, 87)` | 1913 | 1572 | 0.428 |
| `purify_pop` | `purify_pop_2.png` | `(96, 96)` | `(5, 5, 91, 90)` | 844 | 374 | 0.411 |
| `purify_pop` | `purify_pop_3.png` | `(96, 96)` | `(5, 7, 91, 88)` | 505 | 173 | 0.389 |
| `purify_pop` | `purify_pop_4.png` | `(96, 96)` | `(6, 5, 89, 91)` | 185 | 92 | 0.408 |
| `pickup_sparkle` | `pickup_sparkle_0.png` | `(64, 64)` | `(5, 6, 59, 58)` | 918 | 220 | 0.844 |
| `pickup_sparkle` | `pickup_sparkle_1.png` | `(64, 64)` | `(5, 6, 59, 57)` | 443 | 100 | 0.372 |
| `pickup_sparkle` | `pickup_sparkle_2.png` | `(64, 64)` | `(5, 7, 59, 56)` | 277 | 62 | 0.323 |
| `pickup_sparkle` | `pickup_sparkle_3.png` | `(64, 64)` | `(5, 6, 59, 57)` | 185 | 75 | 0.365 |

## Checks

- `hit_small_*` frames use fixed `64x64` transparent canvases.
- `purify_pop_*` frames use fixed `96x96` transparent canvases.
- `pickup_sparkle_*` frames use fixed `64x64` transparent canvases.
- These files are in `_incoming` only and are not runtime-promoted.
- Original Canvas fallback remains untouched.
- Contact sheet: `screenshots/common-combat-effects-incoming-contact-sheet.png`