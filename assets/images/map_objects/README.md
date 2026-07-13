# Random Map Objects

These transparent GPT-image pixel-art assets are loaded through `js/assets.js`:

- `map_plastic_bottle_01.png`
- `map_aluminum_can_01.png`
- `map_glass_bottle_01.png`
- `map_discarded_battery_01.png`

Runtime behavior:

- The map starts with no collectible objects.
- One random object spawns every five seconds of active gameplay.
- Objects spawn near the player with spacing checks. The safety cap is above the
  maximum number a five-minute run can naturally create.
- Touching an object collects it, removes it from the world, and grants its configured reward.
- Missing images use the Canvas fallback in `js/stageRenderer.js`.
