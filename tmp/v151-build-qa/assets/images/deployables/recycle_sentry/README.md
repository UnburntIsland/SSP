# Recycling Sentry Runtime Sprites

Skill id: `recycle_sentry`

Included direction sprites:

- `turret_N_0.png`
- `turret_NE_0.png`
- `turret_E_0.png`
- `turret_SE_0.png`
- `turret_S_0.png`
- `turret_SW_0.png`
- `turret_W_0.png`
- `turret_NW_0.png`

The runtime picks a direction from the vector between the sentry and its current
target. Missing images fall back to the Canvas-rendered sentry in `js/weapons.js`.

