# Missing Runtime Sprites

Date: 2026-07-01

Scope: player character animation PNGs used by the runtime resolver. Concept sheets, previews, and files in non-runtime folders are not counted as runtime frames unless they use names like `idle_N_0.png` or `walk_S_2.png`.

Latest check: `ranger`, `solar_engineer`, and `beachcomber` now all have 8-direction idle PNGs. Movement can therefore use same-direction idle art when walk frames are missing.

## Summary

Expected runtime set per character:

- 8 idle PNGs: `idle_N_0.png`, `idle_NE_0.png`, `idle_E_0.png`, `idle_SE_0.png`, `idle_S_0.png`, `idle_SW_0.png`, `idle_W_0.png`, `idle_NW_0.png`
- 32 walk PNGs: 4 frames for each of `N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`

| Character | Runtime folder | Runtime PNG found | Expected PNG | Missing PNG | Current display |
| --- | --- | ---: | ---: | ---: | --- |
| Forest Ranger | `assets/images/characters/ranger/` | 12 | 40 | 28 | `walk_S` exact, other directions same-direction idle fallback |
| Coastal Cleanup Volunteer | `assets/images/characters/beachcomber/` | 8 | 40 | 32 | all walk directions fallback to same-direction idle |
| Solar Engineer | `assets/images/characters/solar_engineer/` | 8 | 40 | 32 | all walk directions fallback to same-direction idle |

## Runtime Idle Status

All three player characters now have these files:

- `idle_N_0.png`
- `idle_NE_0.png`
- `idle_E_0.png`
- `idle_SE_0.png`
- `idle_S_0.png`
- `idle_SW_0.png`
- `idle_W_0.png`
- `idle_NW_0.png`

## Runtime Walk Status

### Forest Ranger

Complete walk directions currently present:

- `walk_S_0.png`
- `walk_S_1.png`
- `walk_S_2.png`
- `walk_S_3.png`

Still missing:

- `walk_N_0.png` through `walk_N_3.png`
- `walk_NE_0.png` through `walk_NE_3.png`
- `walk_E_0.png` through `walk_E_3.png`
- `walk_SE_0.png` through `walk_SE_3.png`
- `walk_SW_0.png` through `walk_SW_3.png`
- `walk_W_0.png` through `walk_W_3.png`
- `walk_NW_0.png` through `walk_NW_3.png`

### Solar Engineer

Still missing all walk frames:

- `walk_N_0.png` through `walk_N_3.png`
- `walk_NE_0.png` through `walk_NE_3.png`
- `walk_E_0.png` through `walk_E_3.png`
- `walk_SE_0.png` through `walk_SE_3.png`
- `walk_S_0.png` through `walk_S_3.png`
- `walk_SW_0.png` through `walk_SW_3.png`
- `walk_W_0.png` through `walk_W_3.png`
- `walk_NW_0.png` through `walk_NW_3.png`

### Coastal Cleanup Volunteer

Still missing all walk frames:

- `walk_N_0.png` through `walk_N_3.png`
- `walk_NE_0.png` through `walk_NE_3.png`
- `walk_E_0.png` through `walk_E_3.png`
- `walk_SE_0.png` through `walk_SE_3.png`
- `walk_S_0.png` through `walk_S_3.png`
- `walk_SW_0.png` through `walk_SW_3.png`
- `walk_W_0.png` through `walk_W_3.png`
- `walk_NW_0.png` through `walk_NW_3.png`

## Verified Resolver Behavior

Current resolver priority remains:

1. `walk_<DIR>_<frame>.png`
2. `idle_<DIR>_0.png`
3. nearby direction walk/idle candidates
4. mirrored right-facing art only for missing left-facing directions (`W`, `NW`, `SW`)
5. clean fallback in formal mode, diagnostic fallback in `debugAnimation` mode

Validation on 2026-07-01 confirmed:

- `solar` uses `animationId=solar_engineer` and `spriteBasePath=assets/images/characters/solar_engineer/`
- `beachcomber` uses `animationId=beachcomber` and `spriteBasePath=assets/images/characters/beachcomber/`
- `ranger` uses `animationId=ranger` and `spriteBasePath=assets/images/characters/ranger/`
- In `debugAnimation=1`, all three characters resolve every direction with `hasSprite=true`.
- For `solar_engineer` and `beachcomber`, movement currently resolves `walk_<DIR>_<frame>` to `idle_<DIR>_0` with fallback type `idle-direction`.
- Releasing movement returns to `idle_<lastDirection>_0` with fallback type `exact`.

## Next Recommended Walk Assets

Best next batch:

1. Complete `ranger` walk directions: `E`, `W`, `N`, then diagonals.
2. Add `solar_engineer/walk_S_0.png` through `walk_S_3.png`.
3. Add `beachcomber/walk_S_0.png` through `walk_S_3.png`.

Once walk files exist, the resolver automatically prefers the walk animation over idle fallback.
