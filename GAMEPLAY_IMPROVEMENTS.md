# Gameplay Improvements

Date: 2026-07-11

## Scope

This pass improves combat usefulness, character balance, mobile readability,
death recovery, sustainability learning, late-run pressure, knowledge-card
visibility, and map exploration. It does not change input mapping,
`getDirectionFromVector()`, character animation resolution, or stage identity.

## Balance

| Item | Before | After |
| --- | --- | --- |
| Ranger passive | Max HP +10% | Max HP +50% |
| Beachcomber passive | Pickup range +25% | Pickup range +35%, speed +6% |
| Solar Engineer passive | Cooldown -10% | Cooldown -20%, max HP -20% |
| Seed Blade Lv.1 | 10 damage | 14 damage, increasing every level, plus elite bonus |
| Recycle Net Lv.1 | 78 radius, 8 DPS, 6.0 sec cooldown | 84 radius, 10 DPS, 5.2 sec cooldown |
| Solar Pulse Lv.1 | 110 radius, 16 damage, 3.2 sec cooldown | 100 radius, 10 damage, 3.8 sec cooldown |
| Wind Blades Lv.1 | 62 radius, 24 DPS | 78 radius, 32 DPS, larger hit area and knockback |

Wind Blades now scale to 116 orbit radius, 52 DPS, five blades, and a 25-unit
blade hit radius at max level. The skill is intended to create a visible
protective lane rather than only damaging enemies that are already touching
the player.

Seed Blade now scales from 14 to 36 damage with an additional per-level elite
multiplier. Area attacks were reduced slightly so focused projectiles have a
clear role without removing the utility of pull, knockback, and persistent zones.

Three low-impact passives now provide quick, one-level choices: `Lightweight
Shoes` (+6% movement speed), `Sorting Pouch` (+12% pickup range), and `Refill
Snack` (+8 max HP and 8 healing). Each is removed from the upgrade pool after
selection, so it cannot consume later levels.

## Enemy Pressure

- `battery_slime` now maintains medium range, telegraphs an aimed toxic shot,
  and fires a readable projectile.
- `battery_slime` is marked as the green elite. HP was reduced from 70 to 58,
  contact damage from 10 to 8, projectile damage from 7 to 5, and its attack
  cooldown was increased from 2.8 to 3.2 seconds.
- Elite wave weights were halved and no more than five elites may remain alive
  at once (two in test mode). Excess elite spawns become ordinary small enemies.
- `oil_blob` now telegraphs and fires a ten-shot radial barrage.
- Enemy projectiles are capped at 220 active instances to protect mobile FPS.
- Small and medium enemy render targets increased to 58 px and 74 px.
- Mobile enemy rendering receives an additional 1.28 scale multiplier.
- Enemies briefly appear enlarged with a spawn ring before settling to their
  normal size. Contact damage is disabled during this short arrival window.

## Sustainability Loop

- Every level-up begins with one of 50 sustainability questions.
- Correct answer: heal 8% max HP (minimum 6) and gain 2 run coins.
- Incorrect answer: lose 5% max HP (minimum 4), never reducing HP below 1.
- Every answer displays the correct explanation before upgrade selection.
- Five consecutive correct answers unlock `Elite Analysis I` (1.35x damage to
  green elites); ten unlock `Elite Analysis II` (1.70x). A wrong answer resets
  the streak but does not remove an already earned run reward.
- HUD and results show the current and best answer streaks.

## Exploration And Survival

- Every run opens with a five-second objective briefing. Combat, movement, enemy
  spawning, and the five-minute timer remain frozen until the briefing ends.
- During the final ten seconds, the centered timer becomes a larger pulsing red
  warning and the objective line reports the same remaining second count.
- Recycling bins are one-use resource stations that award 3 coins and 4 XP.
- Loose trash can be cleaned for 2 XP and has a coin drop chance.
- Oil-stain props slow movement to 72% while occupied.
- HUD points toward the nearest unused recycling station.
- The contamination ring now closes in four readable stages. Each stage shows a
  red projected boundary for a 12-second warning, shrinks for eight seconds,
  then holds for 26 seconds. Remaining outside deals two damage per second.
- Knowledge cards have a larger sprite, pulse ring, light beam, and guaranteed
  milestone drops. Collecting one now pauses the run and opens the full knowledge
  text until the player chooses `Continue`; queued cards are shown one at a time.
- A dedicated help screen explains recycling stations, loose trash, oil stains,
  knowledge cards, projected contamination boundaries, and dash controls.
- Every character can dash with `Space`, either `Shift`, or the lower-right
  touch button. Dash has a three-second cooldown and brief damage immunity.

## Death Recovery

`Game.end()` now releases the animation-loop ownership flag. Previously a run
could end from inside the current animation frame while leaving `_looping=true`;
the next run then believed a loop already existed and never requested a frame.
The defeat screen now also provides a direct `再試一次` action.

## QA

- All JavaScript files pass `node --check`.
- `git diff --check` passes.
- Browser console warnings/errors: none.
- Desktop and 844x390 mobile layouts verified without HUD/button overlap.
- Five-second objective briefing verified with the main timer held at `05:00`;
  gameplay begins only after the overlay closes.
- Final countdown verified at `00:09` with matching warning text, red styling,
  and no overlap with the mobile pause control.
- Dash displacement, cooldown, and temporary invulnerability verified.
- Projected contamination ring, countdown phases, and two-damage ticks verified.
- All 50 question IDs, option counts, answer indexes, five/ten-answer rewards, and elite damage
  multiplication verified with automated assertions.
- Elite cap replacement and reduced enemy values verified with automated assertions.
- Correct-answer reward and incorrect-answer penalty both verified.
- Death -> retry verified with the timer advancing in the new run.
- Battery Slime telegraph and projectile verified.
- Contamination-zone warning and damage verified.
- Recycling-station reward and knowledge-card unlock verified.
- Knowledge-card modal verified to hold the timer at `02:59` and resume only
  after `Continue`; desktop and 844x390 mobile captures have no page overflow.
- One-shot passive appears with its one-shot tag and is removed after selection.
- Desktop test URL: `http://127.0.0.1:8765/index.html?test=1`
- Debug test URL: `http://127.0.0.1:8765/index.html?test=1&debugAnimation=1`
