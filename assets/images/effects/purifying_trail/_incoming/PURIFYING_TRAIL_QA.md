# Purifying Trail GPT-image VFX QA

Generated with the built-in GPT-image workflow as a 2x2 chroma-key sprite sheet, then keyed, pre-feathered and normalized into four runtime frames.

## Art direction

- Irregular teal and cyan vapor communicates purification without a puddle outline.
- Yellow-green motes communicate a controlled toxic or alchemical hazard.
- Small violet particles represent pollution being broken down.
- Layered wisps and a broad alpha falloff let adjacent stamps merge into one continuous fog bank.

## Runtime frames

| file | canvas | alpha bbox | opaque pixels | partial pixels |
| --- | --- | --- | ---: | ---: |
| `trail_0.png` | 96x96 | (11, 18, 89, 82) | 966 | 2498 |
| `trail_1.png` | 96x96 | (4, 18, 88, 87) | 1258 | 2880 |
| `trail_2.png` | 96x96 | (4, 12, 93, 85) | 1237 | 3156 |
| `trail_3.png` | 96x96 | (6, 18, 88, 82) | 1118 | 2758 |

## Integration checks

- All frames use fixed 96x96 transparent canvases.
- Roughly 70% of visible pixels are partially transparent; the outer 8-pixel edge averages below 0.2 alpha.
- Frames share the same center anchor and form an irregular looping ground-mist sequence.
- The renderer overlaps each trail point at low opacity, switching to every second point only above 80 active points.
- The connector is blurred and reduced to low opacity; the image layer uses a restrained screen blend.
- Damage, collision radius, duration and tick timing remain independent of the visual layer.
- Canvas fallback uses soft radial gradients when image frames have not loaded.
