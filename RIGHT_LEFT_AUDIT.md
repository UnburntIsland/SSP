# RIGHT_LEFT_AUDIT

Date: 2026-07-01

Scope: audit only. No gameplay code, input mapping, direction mapping, renderer logic, character data, enemies, skills, or stages were modified.

## Summary

The right/D movement path is correct at runtime.

- `D` / `ArrowRight` produces `vx=1`, `vy=0`.
- `getDirectionFromVector()` resolves this to `E`.
- The player sprite resolver requests `walk_E_<frame>`.
- Because `walk_E_0.png` through `walk_E_3.png` are currently missing, the resolver falls back to `idle_E_0.png`.
- `idle_E_0.png` is loaded successfully.
- `flipX=false`, so the renderer is not horizontally flipping the right-facing sprite.

The current issue is not caused by input mapping, `getDirectionFromVector()`, resolver selecting `W`, or renderer `flipX`.

The likely visual issue is asset-side:

- `assets/images/characters/ranger/idle_E_0.png` exists and is used for right movement.
- `assets/images/characters/ranger/idle_W_0.png` also exists, but visual inspection suggests it is not clearly left-facing and may be right-facing or ambiguous.
- `walk_E_*` and `walk_W_*` are missing, so horizontal movement currently uses idle fallback rather than real walk frames.

## Runtime Check: D / ArrowRight

Test URL:

```text
http://127.0.0.1:4185/index.html?test=1&debugAnimation=1
```

Runtime result:

```text
Input: D / ArrowRight
vx: 1
vy: 0
computed direction: E
action: walk
frameIndex: 2
requestedKey: canim_ranger_walk_E_2
resolvedKey: canim_ranger_idle_E_0
hasSprite: true
fallbackType: idle-direction
flipX: false
imagePath: assets/images/characters/ranger/idle_E_0.png
```

Formal mode result, without debug overlay:

```text
Input: D
vx: 1
vy: 0
computed direction: E
action: walk
requestedKey: canim_ranger_walk_E_2
resolvedKey: canim_ranger_idle_E_0
hasSprite: true
fallbackType: idle-direction
flipX: false
imagePath: assets/images/characters/ranger/idle_E_0.png
debugReadout: false
```

Conclusion: pressing right does not request or resolve to a left-facing key.

## Runtime Comparison: A / ArrowLeft

Runtime result:

```text
Input: A / ArrowLeft
vx: -1
vy: 0
computed direction: W
action: walk
frameIndex: 2
requestedKey: canim_ranger_walk_W_2
resolvedKey: canim_ranger_idle_W_0
hasSprite: true
fallbackType: idle-direction
flipX: false
imagePath: assets/images/characters/ranger/idle_W_0.png
```

Conclusion: left movement separately resolves to `idle_W_0.png`, not to `idle_E_0.png` with a flip.

## Resolver / Renderer State

Relevant behavior observed in code:

- `getDirectionFromVector()` correctly maps Canvas coordinates:
  - positive X => `E`
  - negative X => `W`
  - negative Y => `N`
  - positive Y => `S`
- The resolver tries the requested walk frame first.
- If the walk frame is missing, it falls back to same-direction idle.
- Mirroring is only used as a later fallback for missing left-facing directions:
  - `W` may use `E` flipped only if `W` assets are missing.
  - `NW` may use `NE` flipped only if `NW` assets are missing.
  - `SW` may use `SE` flipped only if `SW` assets are missing.
- `E` is not mirrored.
- `drawResolvedSprite()` flips only when `resolved.flipX === true`.

For `D` / `ArrowRight`, runtime reports:

```text
resolvedKey: canim_ranger_idle_E_0
flipX: false
```

Conclusion: renderer flip is not the source of the right-facing issue.

## Asset File Check

Folder checked:

```text
assets/images/characters/ranger/
```

Right/left idle files:

```text
idle_E_0.png: exists
idle_W_0.png: exists
```

Right/left walk files:

```text
walk_E_0.png: missing
walk_E_1.png: missing
walk_E_2.png: missing
walk_E_3.png: missing

walk_W_0.png: missing
walk_W_1.png: missing
walk_W_2.png: missing
walk_W_3.png: missing
```

Visual inspection:

- `idle_E_0.png` appears to be a right-facing side view.
- `idle_W_0.png` appears suspiciously similar in facing/readability and is not clearly left-facing.

This makes the issue more likely to be E/W asset readability or W asset naming/content, not runtime selecting the wrong direction.

## Network / 404

Observed successful sprite loads:

```text
assets/images/characters/ranger/idle_E_0.png: 200
assets/images/characters/ranger/idle_W_0.png: 200
```

Expected missing walk requests:

```text
assets/images/characters/ranger/walk_E_0.png: 404
assets/images/characters/ranger/walk_E_1.png: 404
assets/images/characters/ranger/walk_E_2.png: 404
assets/images/characters/ranger/walk_E_3.png: 404

assets/images/characters/ranger/walk_W_0.png: 404
assets/images/characters/ranger/walk_W_1.png: 404
assets/images/characters/ranger/walk_W_2.png: 404
assets/images/characters/ranger/walk_W_3.png: 404
```

These 404s are expected because those walk frames have not been provided yet. Resolver fallback to idle works.

## Screenshot / Report Outputs

Generated files:

```text
screenshots/right-left-d-debug.png
screenshots/right-left-arrowright-debug.png
screenshots/right-left-a-debug.png
screenshots/right-left-arrowleft-debug.png
screenshots/right-left-d-normal.png
screenshots/right-left-asset-preview.png
screenshots/right-left-runtime-report.json
```

## Root Cause Judgment

Not the cause:

- Input mapping
- `getDirectionFromVector()`
- Resolver requesting `W` when pressing `D`
- Renderer flipping the `E` sprite

Likely causes:

1. `walk_E_*` frames are missing, so movement right uses static `idle_E_0.png`.
2. `idle_W_0.png` appears not clearly left-facing, which makes E/W visual comparison confusing.
3. At 72px gameplay size, the ranger equipment silhouette may make `idle_E_0.png` read ambiguously unless the side direction is exaggerated.

## Minimal Next Fix Plan

Do not change:

- input mapping
- `getDirectionFromVector()`
- resolver direction mapping
- renderer flip logic

Recommended asset-side fixes:

1. Regenerate or correct `assets/images/characters/ranger/idle_W_0.png` so it clearly faces left.
2. Check `idle_NW_0.png` and `idle_SW_0.png` for the same left/right ambiguity.
3. Add real walk frames:
   - `walk_E_0.png` through `walk_E_3.png`
   - `walk_W_0.png` through `walk_W_3.png`
4. If a temporary fix is needed, create `idle_W_0.png` by horizontally flipping `idle_E_0.png`, but this may look wrong if backpack/staff asymmetry matters. Regeneration is safer for final art.

## Final Recommendation

The current code path for pressing right is correct. The next round should be an asset correction pass, focused on making `idle_W_0.png` truly left-facing and adding `walk_E_*` / `walk_W_*` frames.
