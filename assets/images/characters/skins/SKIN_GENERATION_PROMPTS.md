# Skin animation generation notes

All fifteen skins were generated as precise edits with the built-in GPT-image tool. The source for each character is the corresponding file in `_references/`; transparent masters are stored in `_masters/`, and runtime frames are stored in each skin directory.

## Shared edit prompt

> Use Image 1 as the exact animation-sheet reference. Preserve the same character identity, pixel-art rendering, body proportions, silhouette, camera angle, scale, cell placement, directional poses, animation timing, and equipment placement. Change only the outfit, colors, and small themed accessories described below. Output one exact 1024x1536 sprite sheet on a perfectly flat solid #ff00ff background. Keep the exact 5 columns by 8 rows layout with no grid lines, dividers, labels, text, border, shadow, extra character, missing character, cropped character, merged cell, or rearranged pose. Rows from top to bottom must remain N, NE, E, SE, S, SW, W, NW. Columns from left to right must remain idle, walk step 1, walk step 2, walk step 3, walk step 4. Every cell must contain exactly one complete character and every walking row must show a coherent four-step loop. Do not redesign or re-pose the animation.

For the mechanic reference, append:

> The reference uses small positional offsets as a walk guide. Refine columns 2-5 into a readable four-step walking cycle while preserving the exact facing direction, footprint, scale, and 5x8 alignment.

## Per-skin delta

| Skin ID | Prompt delta | Bonus |
| --- | --- | --- |
| `ranger_thorn` | Dark forest-green thorn armor, crimson accents, thorn-vine bracers and a sharper leaf cloak; keep the original staff and ranger identity. | Attack +10% |
| `ranger_gale` | Lightweight teal-and-white scout outfit, wind ribbons, pale feather accents and streamlined boots; keep the original staff and ranger identity. | Speed +10% |
| `ranger_canopy` | Heavy moss-green canopy guard armor, layered bark plates, broad leaf mantle and reinforced gloves; keep the original staff and ranger identity. | HP +10% |
| `beach_harpoon` | Navy-and-coral tidal harpoon uniform, compact shoulder guard, rope details and a more aggressive rescue-tool treatment; preserve character identity. | Attack +10% |
| `beach_wave` | Bright aqua wave-runner suit, white speed stripes, short fluttering scarf and lightweight footwear; preserve character identity. | Speed +10% |
| `beach_coral` | Coral-red lifeguard armor, flotation padding, shell details and sturdy rescue gear; preserve character identity. | HP +10% |
| `solar_flare` | Fiery orange-red solar amplifier suit, radiant panel edges, sunburst shoulder accents and warm energy glow shapes; preserve character identity. | Attack +10% |
| `solar_lighttrail` | Sleek cyan-white light-trail suit, luminous circuit lines, aerodynamic panels and compact gear; preserve character identity. | Speed +10% |
| `solar_battery` | Heavy blue-gold energy-storage armor, battery modules, reinforced plating and insulated gauntlets; preserve character identity. | HP +10% |
| `mechanic_arc` | Copper-blue arc-welder gear, insulated apron panels, welding accents and bright electric details; preserve character identity and tools. | Attack +10% |
| `mechanic_bearing` | Lightweight orange-silver bearing runner outfit, wheel motifs, compact tool belt and streamlined boots; preserve character identity and tools. | Speed +10% |
| `mechanic_bulwark` | Heavy scrap-steel bulwark armor, riveted plates, broad shoulder guards and reinforced industrial gloves; preserve character identity and tools. | HP +10% |
| `chemist_catalyst` | Charcoal, burgundy and amber catalyst suit, copper fittings, red catalyst vials and a warm high-output bioreactor; preserve the chemist identity and boot sprayers. | Attack +10% |
| `chemist_current` | Streamlined cobalt, cyan and white current-runner suit, lightweight hoses and aerodynamic calf guards; preserve the chemist identity and boot sprayers. | Speed +10% |
| `chemist_springguard` | Emerald, pale-stone and muted-gold spring guard suit, reinforced bracers, rounded armor and clear water reservoir; preserve the chemist identity and boot sprayers. | HP +10% |

## Post-processing

The generated chroma masters were converted to transparency with the image-generation skill's `remove_chroma_key.py` helper, then sliced with:

```powershell
python tools/process_skin_sheets.py slice --skin <skin-id> --source <transparent-master.png>
python tools/process_skin_sheets.py slice-character --character chemist --source <transparent-base-master.png>
python tools/process_skin_sheets.py audit-character --character chemist
python tools/process_skin_sheets.py audit
```

The fixed sheet geometry is 32 px left margin, 192 px cells, five columns, and eight rows. The slicer isolates the largest connected subject in a padded cell before normalizing it, preventing boot pixels from an adjacent row from leaking into a frame. The audit requires 40 RGBA frames per skin and verifies every direction has four distinct walking frames.
