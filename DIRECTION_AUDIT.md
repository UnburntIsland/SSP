# Direction Audit

Date: 2026-07-01

Scope: audit only. No gameplay, animation, rendering, or asset-loading logic was changed.

## 1. Input Vector Check

Source checked: `js/input.js`

`Input.getMoveVector()` uses Canvas coordinates correctly:

- W / ArrowUp: `y -= 1`
- S / ArrowDown: `y += 1`
- A / ArrowLeft: `x -= 1`
- D / ArrowRight: `x += 1`
- Diagonal input is normalized with `1 / Math.sqrt(2)`

Browser runtime results:

| Input | Actual vx | Actual vy | Computed direction | Animator direction | Result |
| --- | ---: | ---: | --- | --- | --- |
| W / ArrowUp | 0 | -1 | N | N | Correct |
| S / ArrowDown | 0 | 1 | S | S | Correct |
| A / ArrowLeft | -1 | 0 | W | W | Correct |
| D / ArrowRight | 1 | 0 | E | E | Correct |
| W + D | 0.7071 | -0.7071 | NE | NE | Correct |
| W + A | -0.7071 | -0.7071 | NW | NW | Correct |
| S + D | 0.7071 | 0.7071 | SE | SE | Correct |
| S + A | -0.7071 | 0.7071 | SW | SW | Correct |

Conclusion: input vectors are not reversed.

## 2. Direction Mapping Check

Source checked: `js/animation.js`

Current implementation:

```js
var ANGLE_MAP = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
var idx = Math.round(Math.atan2(vy, vx) / (Math.PI / 4));
idx = ((idx % 8) + 8) % 8;
return ANGLE_MAP[idx];
```

This is correct for Canvas coordinates where +X is right and +Y is down.

Runtime mapping:

| Vector | Expected | Actual |
| --- | --- | --- |
| `(1, 0)` | E | E |
| `(1, 1)` | SE | SE |
| `(0, 1)` | S | S |
| `(-1, 1)` | SW | SW |
| `(-1, 0)` | W | W |
| `(-1, -1)` | NW | NW |
| `(0, -1)` | N | N |
| `(1, -1)` | NE | NE |

Conclusion: `getDirectionFromVector()` is not flipping N/S or NE/SE.

## 3. Sprite Key Selection Check

Runtime test was performed with the default selected character, `ranger`.

| Input | Requested frameName | Requested sprite key | Has real sprite | Fallback | flipX |
| --- | --- | --- | --- | --- | --- |
| W / ArrowUp | `walk_N_1` | `canim_ranger_walk_N_1` | false | true | false |
| S / ArrowDown | `walk_S_1` | `canim_ranger_walk_S_1` | false | true | false |
| A / ArrowLeft | `walk_W_1` | `canim_ranger_walk_W_1` | false | true | true |
| D / ArrowRight | `walk_E_1` | `canim_ranger_walk_E_1` | false | true | false |
| W + D | `walk_NE_1` | `canim_ranger_walk_NE_1` | false | true | false |
| W + A | `walk_NW_1` | `canim_ranger_walk_NW_1` | false | true | true |
| S + D | `walk_SE_1` | `canim_ranger_walk_SE_1` | false | true | false |
| S + A | `walk_SW_1` | `canim_ranger_walk_SW_1` | false | true | true |

Conclusion: the sprite key choice is directionally correct. W attempts `walk_N_*`, S attempts `walk_S_*`, diagonals attempt `walk_NE/NW/SE/SW_*`. The system is not collapsing sprite key selection to E/W.

## 4. Character Animation Asset Folder Check

Expected folders:

- `assets/images/characters/ranger/`
- `assets/images/characters/beachcomber/`
- `assets/images/characters/solar_engineer/`

Expected per character:

- 8 idle PNG files: `idle_N_0.png` through `idle_NW_0.png`
- 32 walk PNG files: `walk_N_0.png` through `walk_NW_3.png`
- Total: 40 PNG files per character

Actual counts:

| Character folder | PNG count | Missing expected files |
| --- | ---: | ---: |
| `ranger` | 0 | 40 |
| `beachcomber` | 0 | 40 |
| `solar_engineer` | 0 | 40 |

Missing directions:

- `ranger`: all idle directions and all walk directions are missing.
- `beachcomber`: all idle directions and all walk directions are missing.
- `solar_engineer`: all idle directions and all walk directions are missing.

Conclusion: currently the player can only use fallback rendering for directional animation. The generated image previews have not been cut into the active runtime folders using the required filenames.

## 5. Fallback Rendering Check

Source checked:

- `js/player.js`
- `js/animation.js`
- `js/sprites.js`

Real sprite path:

1. `Player.draw()` calls `this.animator.resolveKey()`.
2. If a key resolves, it calls `Assets.drawCentered(...)`.
3. If no PNG is ready, it calls `Animation.drawFallbackSprite(...)`.

`resolveKey()` fallback candidate order:

1. Current action and direction, for example `walk_N_1`
2. Idle same direction, for example `idle_N_0`
3. Idle S, `idle_S_0`
4. Idle E, `idle_E_0`

If none exists, it returns `null`.

Canvas fallback draw behavior:

```js
var faceLeft = (dir === "W" || dir === "NW" || dir === "SW");
if (faceLeft) ctx.scale(-1, 1);
Sprites.drawSized(ctx, spriteId, 0, 0, ...);
drawDirectionCue(...);
```

Important finding:

- Fallback does not actually load `walk_E` or `walk_W` as replacement art.
- Fallback draws the same static base sprite, such as `char_ranger`.
- W, NW, and SW are horizontally flipped.
- N, S, E, NE, and SE are not flipped.
- A small direction cue dot is drawn, but the underlying character art is still the same static sprite.

Conclusion: visually, fallback mostly supports only two body orientations: normal and horizontally flipped. This is why the character appears to only change left/right.

## 6. Why The Direction Looks Reversed

The code-level direction is not reversed:

- W produces `N`
- S produces `S`
- A produces `W`
- D produces `E`
- Diagonals produce the expected diagonal directions

The likely reason it looks reversed is visual, not logical:

1. There are no real `idle_N`, `walk_N`, `idle_S`, or `walk_S` PNGs in the active folders.
2. The fallback uses a single static character sprite.
3. That static sprite appears to be a front-facing or concept-style image, not a true top-down direction sprite.
4. Because the fallback cannot show a real back-facing N pose or front-facing S pose, upward and downward movement can feel visually wrong or reversed.

If a generated sprite sheet was manually viewed elsewhere, another possible source is sheet slicing/order. The runtime expects file names by direction, not a sheet order. If `idle_N_0.png` accidentally contains the S/front view, then W/S logic will be correct but the displayed art will be reversed. This could only happen after PNG files are added.

## 7. Why It Currently Only Has Left/Right Variation

The active runtime folders contain 0 directional character PNGs, so every direction falls through to fallback.

Fallback variation:

- `W`, `NW`, `SW`: static sprite flipped horizontally
- `N`, `NE`, `E`, `SE`, `S`: static sprite not flipped
- Small direction cue exists, but it is not enough to make the character body read as 8-direction animation

So the observed behavior is expected with the current asset state.

## 8. Minimal Fix Plan

Do not rewrite the animation system.

Minimal asset-side fix:

1. Slice generated sprite sheets into independent PNG frames.
2. Place files in the active runtime folders:
   - `assets/images/characters/ranger/`
   - `assets/images/characters/beachcomber/`
   - `assets/images/characters/solar_engineer/`
3. Use exact filenames:
   - `idle_N_0.png`
   - `idle_NE_0.png`
   - `idle_E_0.png`
   - `idle_SE_0.png`
   - `idle_S_0.png`
   - `idle_SW_0.png`
   - `idle_W_0.png`
   - `idle_NW_0.png`
   - `walk_N_0.png` through `walk_N_3.png`
   - repeat for all 8 directions
4. Verify each PNG visually:
   - `*_N_*` must show back/up-facing art
   - `*_S_*` must show front/down-facing art
   - `*_E_*` and `*_W_*` must not be accidentally swapped
   - diagonal files must not be mislabeled
5. Run `index.html?test=1&debugAnimation=1`.
6. Confirm `hasSprite=true` for the direction being tested.

Optional code-side fix after assets exist:

- Add a tiny direction debug label above the player in `debugAnimation` mode only, showing `action_direction frame fallback`.
- Add a one-time asset manifest validator that explicitly reports file-path existence by direction.

## 9. Files That Would Need Modification Later

Only if adding diagnostics or improving fallback:

- `js/animation.js`: expose richer fallback/render debug info or asset path audit.
- `js/debug.js`: show player `vx/vy/action/direction/frameName/hasSprite/fallback/flipX` more prominently.
- `js/player.js`: optional debug-only label above player.

For the actual directional visual fix, the primary work is asset placement, not code.

## 10. Files Not Recommended For Modification

Do not change these for the current issue:

- `js/input.js`: input vector mapping is already correct.
- `js/game.js`: movement update and render loop are not the source of direction inversion.
- `js/main.js`: screen flow and character selection do not affect direction mapping.
- `js/data/characters.js`: animationSet naming is already correct for `idle_<DIR>_0` and `walk_<DIR>_<0..3>`.
- Core gameplay, enemy spawning, skills, shop, storage: unrelated to this issue.

## Final Diagnosis

The current problem is not caused by wrong input vectors or wrong direction math.

Primary cause:

- The active character animation PNGs are missing from all three runtime character folders.

Secondary cause:

- The fallback renderer uses one static sprite and only horizontally flips W/NW/SW. It does not have true N/S/diagonal body art.

Most likely fix:

- Cut and place the generated 8-direction idle/walk PNGs into the exact runtime paths and filenames, then verify with `debugAnimation` that `hasSprite=true`.
