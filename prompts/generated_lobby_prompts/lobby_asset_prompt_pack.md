# Lobby GPT-image Prompt Pack

## Reference

All prompts used this image as a style reference:

```text
assets/images/backgrounds/lobby_background.png
```

## Shared Transparent-Asset Suffix

Append this block to every placeable object, animation sheet, decoration, and UI icon prompt:

```text
Match the reference image's polished 2D pixel-art visual language, pixel density,
eco-adventure palette, and top-down / 3/4 camera angle.
Center the subject with generous padding and a fixed bottom anchor.
Create it on a perfectly flat solid #ff00ff chroma-key background.
No shadow, gradient, texture, reflection, floor plane, scene, character, UI,
readable text, label, watermark, photorealism, or 3D.
Do not use #ff00ff in the subject.
```

## Lobby Map

```text
Create a full-bleed wide eco-adventure lobby world background.
Use a coastal sustainable settlement with mangroves, clean turquoise channels,
rocks, reclaimed-timber paths, solar technology, and lush perimeter vegetation.
Keep a very large flat grass-and-packed-earth central clearing for freely placed
buildings. Reserve an unobstructed spawn plaza in the center, a broad route to a
portal plaza at the top, a recycling/idle-zone pad on the right, and a
construction-workbench pad on the left.
Do not paint the portal, station, workbench, placeable buildings, decorations,
characters, monsters, items, labels, or UI into the buildable area.
Landscape approximately 8:5, no border.
```

Output:

```text
assets/images/lobby/ground/lobby_map.png
```

## Action Portal

```text
Create one 3-column by 2-row sprite sheet containing exactly six sequential
idle-animation frames of the same compact eco-tech action portal.
Design: reclaimed-metal arch, teal recycling-energy ring, small solar panels,
warm amber indicators, renewable-technology details.
Animation: dormant glow, rising glow, energy forming, full ring, soft pulse,
returning glow. Keep the body, silhouette, scale, camera, center, and foot
baseline identical. Animate only energy and indicators. Equal cells, no borders.
```

Outputs:

```text
assets/images/lobby/portal/portal_idle_0.png
...
assets/images/lobby/portal/portal_idle_5.png
```

## Recycling Idle Zone

```text
Create one 2-column by 2-row sprite sheet containing exactly four sequential
operating frames of the same circular recycling idle-zone station.
Design: reclaimed-material sorting platform, blue-green collection coils,
opaque pixel-art canisters, small solar panel and warm lamp.
Animation: quiet, materials flowing inward, bright processing, settling.
Keep body, footprint, center, scale and bottom baseline identical.
Equal cells, no borders.
```

Outputs:

```text
assets/images/lobby/stations/recycling_idle_zone/idle_0.png
...
assets/images/lobby/stations/recycling_idle_zone/idle_3.png
```

## Construction Workbench

```text
Create one reclaimed-wood and recycled-metal construction workbench.
Include a hammer, wrench, measuring grid, rolled blueprint without readable
text, small solar task lamp, and organized bins of reusable parts.
Compact silhouette readable beside a 72px character.
```

Output:

```text
assets/images/lobby/stations/construction_workbench/idle_0.png
```

## Functional Buildings

### Solar Workshop

```text
Create one compact solar workshop for a 4x4 module.
Reclaimed wood and metal, blue solar-panel roof, amber energy conduits, tool
racks, battery cabinets, warm workshop light, and green plant accents.
```

### Rain Garden

```text
Create one rain garden for a 4x3 module.
Raised stone and timber beds, compact rainwater cistern, visible filtration
channels, native wetland flowers, reeds, and friendly sustainable engineering.
```

### Micro Wind Station

```text
Create one micro wind station for a 3x3 module.
Compact sturdy wind turbine, three cream-and-orange blades, recycled-metal base,
control cabinet, cable coils, safety rail, grass and tiny plants.
Keep the turbine fully visible and uncropped.
```

### Recycling Guard Station

```text
Create one recycling guard station for a 4x4 module.
Dark recycled metal and timber, cyan shield-projector coils as opaque pixel
shapes, recycling core, small solar panels, amber status lamps, rugged but
friendly silhouette.
```

Outputs:

```text
assets/images/lobby/buildings/solar_workshop/idle_0.png
assets/images/lobby/buildings/rain_garden/idle_0.png
assets/images/lobby/buildings/wind_station/idle_0.png
assets/images/lobby/buildings/recycle_guard/idle_0.png
```

## Decorations

### Small Tree

```text
Create one compact native coastal tree in a square soil planter, with a slim
reclaimed-wood support and rich green canopy. Readable at 64-80px.
```

### Flower Bed

```text
Create one low reclaimed-timber flower bed filled with diverse native yellow,
white, blue and small purple flowers. Readable at 48-72px.
```

### Recycling Bench

```text
Create one comfortable bench made from reclaimed warm wood and recycled-metal
supports, with a subtle leaf cutout and one attached planter.
```

### Solar Streetlight

```text
Create one compact recycled-metal streetlight with a small angled blue solar
panel, warm amber lamp, square planter base, and tiny green vine.
```

### Sorting Bins

```text
Create three connected compact sorting bins in blue, green and yellow-gray,
using distinct lid shapes and simple material pictograms without words.
```

### Rain Barrel

```text
Create one compact blue-gray rain barrel on a short timber stand, with a gutter
inlet, brass tap, water-drop pictogram and tiny fern.
```

### Eco Sign

```text
Create one small reclaimed-wood information sign on two posts, with only carved
leaf and recycling-arrow pictograms, plus grass and stones at the base.
```

### Ecology Pond

```text
Create one miniature irregular stone-lined pond with clear teal water, two lily
pads, reeds, one yellow flower and a tiny wooden edge. No animals.
```

Outputs:

```text
assets/images/lobby/decorations/small_tree/idle_0.png
assets/images/lobby/decorations/flower_bed/idle_0.png
assets/images/lobby/decorations/recycling_bench/idle_0.png
assets/images/lobby/decorations/solar_streetlight/idle_0.png
assets/images/lobby/decorations/sorting_bins/idle_0.png
assets/images/lobby/decorations/rain_barrel/idle_0.png
assets/images/lobby/decorations/eco_sign/idle_0.png
assets/images/lobby/decorations/eco_pond/idle_0.png
```

## UI Icons

### Recycled Material

```text
Create one square inventory icon for recycled material.
Bundle one teal recycled-metal plate, warm wood piece, rounded blue glass shard,
and green recycling-arrow token. Strong silhouette at 32-48px.
```

### Build Mode

```text
Create one square construction-mode icon.
Cross a small hammer and wrench over a compact blue blueprint tile, with one
small green leaf accent. Strong silhouette at 32-48px.
```

Outputs:

```text
assets/images/lobby/ui/recycled_material.png
assets/images/lobby/ui/build_mode.png
```
