# Wind Blade Incoming QA

Generated incoming blade frames only. Not promoted to runtime.

## Frame Metrics

| file | canvas | bbox | opaquePx | partialPx | scale |
| --- | --- | --- | ---: | ---: | ---: |
| `blade_0.png` | `(64, 64)` | `(4, 9, 60, 55)` | 927 | 70 | 0.156 |
| `blade_1.png` | `(64, 64)` | `(4, 4, 60, 60)` | 973 | 69 | 0.159 |
| `blade_2.png` | `(64, 64)` | `(4, 4, 60, 60)` | 981 | 125 | 0.155 |
| `blade_3.png` | `(64, 64)` | `(4, 9, 60, 55)` | 784 | 77 | 0.150 |

## Checks

- All output frames use a fixed `64x64` transparent canvas.
- These files are in `_incoming` only and are not runtime-promoted.
- Intended for Canvas rotate + drawImage around the player.
- Original Canvas fallback remains untouched.
- Contact sheet: `screenshots/wind-blade-incoming-contact-sheet.png`