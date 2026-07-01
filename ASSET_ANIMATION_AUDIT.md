# Asset Animation Audit

Date: 2026-07-01

Scope: audit only. No gameplay code, input mapping, direction mapping, characters, enemies, skills, or stages were changed.

## Summary

The player and enemy animation systems are partially wired: both player and enemy objects have animators, direction state, action state, frame index, sprite keys, and debugAnimation records.

The reason characters and monsters do not visually switch to other PNG frames is that the runtime animation frame PNGs are not present at the paths and filenames the resolver expects. In debugAnimation mode the resolver correctly requests keys such as `canim_ranger_walk_NE_2` and `eanim_plastic_bag_move_NE_2`, but all animation frame assets resolve to missing images and fall back.

Root cause: runtime PNGs are missing / not cut into expected folders and names.

Not the root cause:

- Input vector mapping.
- `getDirectionFromVector()`.
- selectedCharacter pointing to the wrong character in the default test session.
- Enemy renderer not using animation; it does use `EnemyAnimator`.

## Actual PNG Folder Scan

### `assets/images/characters/`

| Folder | PNG Count | First PNGs |
| --- | ---: | --- |
| `(root)` | 12 | `char_beach.png`, `char_beach@2x.png`, `char_ranger.png`, `char_ranger@2x.png`, `char_solar.png`, `char_solar@2x.png`, `characters_preview.png`, `characters_sheet.png`, `characters_sheet@2x.png`, `player_beachcomber.png`, `player_ranger.png`, `player_solar_engineer.png` |
| `beachcomber` | 0 | none |
| `concepts` | 9 | concept PNGs only |
| `directions` | 1 | `forest_ranger_8_direction_turnaround_v1.png` |
| `forest_ranger` | 0 directly | child folders contain non-runtime named PNGs |
| `ranger` | 0 | none |
| `solar_engineer` | 0 | none |

Extra art exists under `assets/images/characters/forest_ranger/idle/`, but filenames are like `forest_ranger_idle_N.png`, not the runtime names `idle_N_0.png`. These are not used by the current resolver.

### `assets/images/enemies/`

| Folder | PNG Count | First PNGs |
| --- | ---: | --- |
| `(root)` | 4 | `enemy_battery_slime.png`, `enemy_cigarette_bug.png`, `enemy_oil_blob.png`, `enemy_plastic_bag.png` |
| `animations` | 10 | full sheets / chroma sheets only |
| `battery_slime` | 0 | none |
| `cigarette_bug` | 0 | none |
| `concepts` | 12 | concept PNGs only |
| `oil_boss` | 0 | none |
| `plastic_bag` | 0 | none |

Important mismatch: code expects `assets/images/enemies/butt_bug/` and `assets/images/enemies/oil_blob/`; the scanned folders include `cigarette_bug/` and `oil_boss/`, but those are empty too.

## Expected Player Frames

For each character runtime folder, the expected 40 files are:

- 8 idle: `idle_N_0.png`, `idle_NE_0.png`, `idle_E_0.png`, `idle_SE_0.png`, `idle_S_0.png`, `idle_SW_0.png`, `idle_W_0.png`, `idle_NW_0.png`
- 32 walk: `walk_<DIR>_0.png` through `walk_<DIR>_3.png` for all 8 directions

| Character Folder | Found | Missing | Idle Directions | Walk Directions | Result |
| --- | ---: | ---: | --- | --- | --- |
| `assets/images/characters/ranger/` | 0 | 40 | none | none | all directions fallback |
| `assets/images/characters/beachcomber/` | 0 | 40 | none | none | all directions fallback |
| `assets/images/characters/solar_engineer/` | 0 | 40 | none | none | all directions fallback |

## Character Data Mapping

Source: `js/data/characters.js`

| Character ID | Animation ID | Sprite ID | `spriteBasePath` | Matches Runtime Folder? |
| --- | --- | --- | --- | --- |
| `ranger` | `ranger` | `char_ranger` | `assets/images/characters/ranger/` | folder exists, 0 PNG |
| `beachcomber` | `beachcomber` | `char_beach` | `assets/images/characters/beachcomber/` | folder exists, 0 PNG |
| `solar` | `solar_engineer` | `char_solar` | `assets/images/characters/solar_engineer/` | folder exists, 0 PNG |

Alias check:

- `solar_engineer` resolves to character id `solar`.
- Solar engineer correctly points to `assets/images/characters/solar_engineer/`.
- Beachcomber correctly points to `assets/images/characters/beachcomber/`.
- Ranger correctly points to `assets/images/characters/ranger/`.

## LocalStorage / Selected Character

Fresh Playwright session result:

- localStorage key: `senloop_save_v1`
- localStorage data: none
- default selected character: `ranger`
- homepage character id: `ranger`
- game runtime character id: `ranger`
- game runtime `spriteBasePath`: `assets/images/characters/ranger/`
- PNG count in that folder: 0

If the user's browser has saved `selectedCharacterId`, it may differ, but the default code path is correct and falls back to ranger when no save exists.

## Asset Loader Status

Source: `js/assets.js`, `js/animation.js`

The asset loader supports runtime registration through `Assets.register(key, paths)`. In `?debugAnimation=1`, `Animation.registerAll()` eagerly registers:

- 3 characters x 40 frames = 120 character animation keys
- 4 enemies x 40 frames = 160 enemy animation keys
- total animation keys = 280

Runtime browser audit:

| Metric | Count |
| --- | ---: |
| Total manifest entries after debug registration | 329 |
| Loaded assets | 39 |
| Failed assets | 290 |
| Animation assets registered | 280 |
| Animation assets loaded | 0 |
| Character animation assets loaded | 0 |
| Enemy animation assets loaded | 0 |

There is no explicit console warning from `Assets.register()` on image failure. Failures are visible through `Assets.report()` and browser Network 404s.

## Runtime Player Resolver Table

Mode: `index.html?test=1&debugAnimation=1`

Active character in fresh test session: `ranger`.

| Input | vx | vy | Direction | Action | Requested | Resolved | hasSprite | fallbackType | imagePath |
| --- | ---: | ---: | --- | --- | --- | --- | --- | --- | --- |
| W | 0 | -1 | N | walk | `canim_ranger_walk_N_1` | null | false | diagnostic | null |
| W+D | 0.707 | -0.707 | NE | walk | `canim_ranger_walk_NE_2` | null | false | diagnostic | null |
| D | 1 | 0 | E | walk | `canim_ranger_walk_E_0` | null | false | diagnostic | null |
| S+D | 0.707 | 0.707 | SE | walk | `canim_ranger_walk_SE_1` | null | false | diagnostic | null |
| S | 0 | 1 | S | walk | `canim_ranger_walk_S_3` | null | false | diagnostic | null |
| S+A | -0.707 | 0.707 | SW | walk | `canim_ranger_walk_SW_0` | null | false | diagnostic | null |
| A | -1 | 0 | W | walk | `canim_ranger_walk_W_2` | null | false | diagnostic | null |
| W+A | -0.707 | -0.707 | NW | walk | `canim_ranger_walk_NW_1` | null | false | diagnostic | null |

Interpretation: direction and requested keys are correct. The resolver cannot draw different PNGs because every requested frame is missing.

## Enemy Animation Integration

Source: `js/enemy.js`, `js/data/enemies.js`, `js/animation.js`

Enemy animation state is connected:

- Enemy has `this.animator = new EnemyAnimator(def)`.
- Enemy update computes movement vector toward player.
- Enemy update stores `moveDir`.
- Enemy animator receives `vx`, `vy`.
- Enemy draw calls `animator.resolveSprite()`.
- Enemy draw uses `Animation.drawResolvedSprite()` if a PNG is available.
- Enemy falls back to `Animation.drawFallbackSprite()` when no PNG is available.

Runtime test with `plastic_bag`:

| Field | Value |
| --- | --- |
| enemy id | `plastic_bag` |
| has animator | true |
| moveDir | `NE` |
| animator state | `move_NE` |
| requested key | `eanim_plastic_bag_move_NE_2` |
| resolved key | null |
| hasSprite | false |
| fallbackType | diagnostic |
| imagePath | null |

Enemy animation connection status: half complete. Logic is connected, but runtime frame PNGs are absent.

## Enemy Data Mapping

Source: `js/data/enemies.js`

| Enemy ID | Animation ID | Sprite ID | Expected Folder | Folder State |
| --- | --- | --- | --- | --- |
| `plastic_bag` | `plastic_bag` | `enemy_bag` | `assets/images/enemies/plastic_bag/` | exists, 0 PNG |
| `butt_bug` | `butt_bug` | `enemy_butt` | `assets/images/enemies/butt_bug/` | missing |
| `battery_slime` | `battery_slime` | `enemy_battery` | `assets/images/enemies/battery_slime/` | exists, 0 PNG |
| `oil_blob` | `oil_blob` | `enemy_oil` | `assets/images/enemies/oil_blob/` | missing |

Aliases:

- `cigarette_bug` resolves to `butt_bug`, but code still expects folder `butt_bug/`.
- `oil_boss` resolves to `oil_blob`, but code still expects folder `oil_blob/`.

## Network / 404 Findings

Local server was used at `http://127.0.0.1:4173/index.html?test=1&debugAnimation=1`.

Network results:

- PNG responses observed: 336
- PNG 200 responses: static player/enemy images, UI, skills, items, etc.
- PNG 404 responses: 295
- Animation PNG 200 responses: 0

Representative 404s:

- `assets/images/characters/ranger/idle_N_0.png`
- `assets/images/characters/ranger/walk_NE_2.png`
- `assets/images/characters/beachcomber/idle_N_0.png`
- `assets/images/characters/solar_engineer/idle_N_0.png`
- `assets/images/enemies/plastic_bag/idle_N_0.png`
- `assets/images/enemies/plastic_bag/move_NE_2.png`

No evidence of browser cache being the main issue. The server returns 404 because the files are absent at the requested paths.

## Duplicate Image Check

Runtime animation folders contain 0 PNG files, so runtime frame duplication cannot be the reason for identical movement visuals.

Across scanned character/enemy PNGs, no duplicate file-size groups were found in the quick size grouping pass. Existing non-runtime concept/sheet files appear to be distinct, but they are not used by the resolver because paths and filenames do not match runtime expectations.

## Root Cause Judgment

Primary root cause:

1. Runtime animation PNG files do not exist under the expected folders.
2. Existing generated sheets/concepts have not been sliced and renamed to the expected frame filenames.
3. Enemy generated sheets under `assets/images/enemies/animations/` are not registered as individual `idle_*` / `move_*` frames.

Secondary issue:

- Some enemy empty folders use alternate names (`cigarette_bug/`, `oil_boss/`) while runtime expects `butt_bug/`, `oil_blob/`.

Not a current blocker:

- Character selected id mapping is correct.
- Sprite resolver is requesting the right keys.
- Enemy rendering does use the animated renderer.

## Minimal Fix Plan

No code change is required before assets are cut correctly.

1. Put 8 idle frames for the selected player into the runtime folder first.
   - Example for solar:
     - `assets/images/characters/solar_engineer/idle_N_0.png`
     - `assets/images/characters/solar_engineer/idle_NE_0.png`
     - `assets/images/characters/solar_engineer/idle_E_0.png`
     - `assets/images/characters/solar_engineer/idle_SE_0.png`
     - `assets/images/characters/solar_engineer/idle_S_0.png`
     - `assets/images/characters/solar_engineer/idle_SW_0.png`
     - `assets/images/characters/solar_engineer/idle_W_0.png`
     - `assets/images/characters/solar_engineer/idle_NW_0.png`
2. Re-run the solar idle Playwright test:
   - `npx playwright test tests/e2e/solar-idle-direction.spec.js`
3. Then add walk frames direction by direction:
   - `walk_S_0.png` through `walk_S_3.png`
   - then `walk_E_*`, `walk_W_*`, `walk_N_*`, diagonals.
4. For enemies, either slice the existing sheets into individual frames or update the loader to support sheet metadata. The smaller change is to slice sheets into:
   - `assets/images/enemies/plastic_bag/move_<DIR>_<0-3>.png`
   - `assets/images/enemies/butt_bug/move_<DIR>_<0-3>.png`
   - `assets/images/enemies/battery_slime/move_<DIR>_<0-3>.png`
   - `assets/images/enemies/oil_blob/move_<DIR>_<0-3>.png`

## Next Step Recommendation

Start with the selected player, not enemies:

1. Add 8 direction idle PNGs for `solar_engineer` or whichever character is currently selected.
2. Confirm runtime resolves `walk_<DIR>_*` to `idle_<DIR>_0` with `hasSprite=true`.
3. Add walk frames later.

This will immediately prove the resolver path and direction system are working without requiring all 40 player frames or all enemy sheets to be finished.
