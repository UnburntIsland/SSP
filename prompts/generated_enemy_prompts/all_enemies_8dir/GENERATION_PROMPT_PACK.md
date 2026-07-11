# All Enemy 8-Direction GPT-image Prompt Pack

## Common production prompt

```text
Create a production 2D pixel-art enemy animation sprite sheet for a top-down / 3/4 Web Canvas roguelite.

Create exactly 16 isolated sprites in a regular 4-column x 4-row sheet. Columns are frames 0, 1, 2, 3. Use one facing direction per row and never change direction inside a row.

Every cell must contain the same exact enemy identity, palette, silhouette, equipment and pixel density. The four frames must form a readable loop with contact/extension, passing/compression, opposite contact, and recovery. Frame 0 and frame 2 must clearly differ.

Use one centered sprite per equal invisible cell with identical visual center, baseline, scale and padding. No crop, grid line, label, arrow, text, UI, floor, shadow, scene, border, photorealism or 3D.

Use a perfectly flat solid chroma-key background, uniform edge-to-edge. Do not use the key color in the subject.
```

Cardinal row order used by the final masters: `S, E, N, W`.

Diagonal intent: `NE, SE, SW, NW`; rows were visually audited and remapped after generation because model row adherence is not deterministic.

## Enemy specifications

| Enemy | Design lock | Motion | Key |
|---|---|---|---|
| bottle_mite | Turquoise bottle cap, clear-blue ring, orange mandibles, six legs | Fast scuttle | `#ff00ff` |
| foam_crab | White packaging foam shell, mint underside, coral claws | Side scuttle | `#ff00ff` |
| ghost_net | Teal fishing-net mound, ocean debris, claws, glowing core | Heavy net drag | `#ff00ff` |
| scrap_drone | Dented steel drone, teal light, orange thrusters, grabbers | Hover/thruster loop | `#ff00ff` |
| can_crusher | Aluminum can body, recycling panel, hydraulic claws | Heavy stomp/compress | `#ff00ff` |
| compactor_golem | Dark steel mech, orange hydraulics, green recycling core | Boss stomp | `#00ff00` |
| oil_slickling | Small black oil puddle, amber eyes, rainbow film | Viscous creep | `#00ff00` |
| smog_drone | Charcoal drone, violet canister, silver rotors, yellow eye | Rotor/exhaust hover | `#00ff00` |
| ash_wisp | Ash ribbons, violet core, amber eyes, soot flakes | Drifting flutter | `#00ff00` |

## Source and output

- Built-in GPT-image mode was used.
- Master sheets are stored under:
  `assets/images/enemies/<enemyId>/_incoming_move_regen/_masters/`
- Split incoming frames are stored under:
  `assets/images/enemies/<enemyId>/_incoming_move_regen/<DIR>/`
- Runtime output is stored under:
  `assets/images/enemies/<enemyId>/`

The original four animated enemies (`plastic_bag`, `butt_bug`, `battery_slime`, `oil_blob`) retain their previously generated GPT-image move sets after visual QA.
