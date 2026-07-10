# Gameplay Improvements

Date: 2026-07-10

## Scope

This pass improves combat usefulness, character balance, mobile readability,
death recovery, sustainability learning, late-run pressure, knowledge-card
visibility, and map exploration. It does not change input mapping,
`getDirectionFromVector()`, character animation resolution, or stage identity.

## Balance

| Item | Before | After |
| --- | --- | --- |
| Ranger passive | Max HP +10% | Max HP +16% |
| Beachcomber passive | Pickup range +25% | Pickup range +35%, speed +6% |
| Solar Engineer passive | Cooldown -10% | Cooldown -4%, max HP -8% |
| Recycle Net Lv.1 | 78 radius, 8 DPS, 6.0 sec cooldown | 84 radius, 12 DPS, 5.2 sec cooldown |
| Solar Pulse Lv.1 | 110 radius, 16 damage, 3.2 sec cooldown | 100 radius, 12 damage, 3.8 sec cooldown |
| Wind Blades Lv.1 | 62 radius, 24 DPS | 78 radius, 34 DPS, larger hit area and knockback |

Wind Blades now scale to 116 orbit radius, 58 DPS, five blades, and a 25-unit
blade hit radius at max level. The skill is intended to create a visible
protective lane rather than only damaging enemies that are already touching
the player.

## Enemy Pressure

- `battery_slime` now maintains medium range, telegraphs an aimed toxic shot,
  and fires a readable projectile.
- `oil_blob` now telegraphs and fires a ten-shot radial barrage.
- Enemy projectiles are capped at 220 active instances to protect mobile FPS.
- Small and medium enemy render targets increased to 58 px and 74 px.
- Mobile enemy rendering receives an additional 1.28 scale multiplier.
- Enemies briefly appear enlarged with a spawn ring before settling to their
  normal size. Contact damage is disabled during this short arrival window.

## Sustainability Loop

- Every level-up begins with one of six sustainability questions.
- Correct answer: heal 8% max HP (minimum 6) and gain 2 run coins.
- Incorrect answer: lose 5% max HP (minimum 4), never reducing HP below 1.
- Every answer displays the correct explanation before upgrade selection.
- Results show correct and incorrect answer totals.

## Exploration And Survival

- Recycling bins are one-use resource stations that award 3 coins and 4 XP.
- Loose trash can be cleaned for 2 XP and has a coin drop chance.
- Oil-stain props slow movement to 72% while occupied.
- HUD points toward the nearest unused recycling station.
- A contamination ring begins closing during the second half of the run.
  Remaining outside deals four damage every 0.75 seconds and shows a HUD warning.
- Knowledge cards have a larger sprite, pulse ring, light beam, guaranteed
  milestone drops, and a six-second unlock card containing the full knowledge text.

## Death Recovery

`Game.end()` now releases the animation-loop ownership flag. Previously a run
could end from inside the current animation frame while leaving `_looping=true`;
the next run then believed a loop already existed and never requested a frame.
The defeat screen now also provides a direct `再試一次` action.

## QA

- All JavaScript files pass `node --check`.
- `git diff --check` passes.
- Browser console warnings/errors: none.
- Correct-answer reward and incorrect-answer penalty both verified.
- Death -> retry verified with the timer advancing in the new run.
- Battery Slime telegraph and projectile verified.
- Contamination-zone warning and damage verified.
- Recycling-station reward and knowledge-card unlock verified.
- Desktop test URL: `http://127.0.0.1:8765/index.html?test=1`
- Debug test URL: `http://127.0.0.1:8765/index.html?test=1&debugAnimation=1`

