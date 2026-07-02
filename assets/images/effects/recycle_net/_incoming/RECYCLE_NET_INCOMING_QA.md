# Recycle Net Incoming QA

Generated incoming AoE frames only. Not promoted to runtime.

## Frame Metrics

| file | canvas | bbox | opaquePx | partialPx |
| --- | --- | --- | ---: | ---: |
| `aoe_0.png` | `(192, 192)` | `(71, 58, 156, 145)` | 1334 | 283 |
| `aoe_1.png` | `(192, 192)` | `(29, 34, 160, 163)` | 3088 | 935 |
| `aoe_2.png` | `(192, 192)` | `(9, 31, 142, 166)` | 3384 | 1344 |
| `aoe_3.png` | `(192, 192)` | `(48, 12, 179, 141)` | 4091 | 1805 |
| `aoe_4.png` | `(192, 192)` | `(29, 11, 161, 146)` | 4031 | 1840 |
| `aoe_5.png` | `(192, 192)` | `(8, 11, 144, 144)` | 1916 | 619 |

## Checks

- All output frames use a fixed `192x192` transparent canvas.
- Relative pulse scale from the generated sheet was preserved.
- These files are in `_incoming` only and are not runtime-promoted.
- Original Canvas fallback remains untouched.
- Contact sheet: `screenshots/recycle-net-incoming-contact-sheet.png`