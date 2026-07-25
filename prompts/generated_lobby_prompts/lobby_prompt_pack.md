# Lobby Buildings & Stations Prompt Pack（FLUX Krea 用）

Runtime 模組：`js/lobby.js` + `js/data/lobbyBuildings.js`（v=lobby-20260725b）

所有素材產出後直接放到各段落標示的 Runtime 路徑即可，遊戲會自動載入並取代程式繪製的佔位圖，不用改程式。想先走 QA 流程，也可以先放 `assets/images/lobby/_incoming/<asset_id>/`，確認後再搬到 Runtime 路徑。

Style reference（每一張生成都當參考圖）：

- `assets/images/backgrounds/lobby_background.png`（大廳背景：海島永續基地、黃昏暖光、細緻像素風）
- `assets/images/characters/ranger/idle_S_0.png`（角色外觀參考；大廳中角色以約 100 world px 高顯示，約等於背景圖裡的門高）

Global requirements for every prompt:

- Detailed pixel art, same pixel density and rendering style as the reference lobby background.
- Same top-down 3/4 view angle as the reference background (about 30–40 degrees, front face visible, slight top visible).
- Transparent background PNG. No scene, no ground shadow baked in, no text, no UI, no watermark, no black or white background.
- Single object centered, bottom edge of the object sitting on the bottom of the canvas with a small margin.
- Warm tropical dusk palette that matches the reference background; clean readable silhouette for a kids' game.
- 1 grid cell = 32 world px. The player character stands about 100 world px (≈3 cells) tall next to these objects — match the door / bench / bin scale already painted in the reference background.

尺寸建議：以下每張以標示的比例生成即可，遊戲會自動縮放；建築「寬度」對齊 footprint、底部貼齊地面、上方允許高出 footprint。建議建築畫得比 footprint 高（高寬比 ≥1.4），與 100px 角色站在旁邊時比例才自然。

---

## 1. 行動傳送門（待機動畫 6 幀）

Runtime 路徑：`assets/images/lobby/portal/portal_idle_0.png` … `portal_idle_5.png`（6 張分開的 PNG；若只想先出 1 張靜態圖，存成 `assets/images/lobby/portal/portal.png` 也會被使用）

Prompt:

Use the reference lobby background image for style, palette, and camera angle. Generate 6 separate pixel art PNG frames of the same free-standing eco portal gate: a ring of recycled driftwood and polished scrap metal, inside it a swirling teal-green energy vortex with small leaf and water-droplet particles orbiting. Stone pedestal base with moss. The 6 frames form a smooth idle loop: the vortex slowly rotates and brightens then dims, particles drift upward. Keep the exact same portal structure, canvas size, visual center, and scale in every frame; only the energy and particles move. Fantasy but friendly, suitable for a kids' environmental game. Transparent background, no scene, no text, no UI.

---

## 2. 掛機回收裝置（運作動畫 4 幀）

Runtime 路徑：`assets/images/lobby/stations/recycle_station_0.png` … `recycle_station_3.png`（4 張分開的 PNG；靜態備援檔名 `recycle_station.png`）

Prompt:

Use the reference lobby background image for style, palette, and camera angle. Generate 4 separate pixel art PNG frames of the same compact recycling sorter machine: a cheerful teal-and-green device built from recycled parts, with a hopper on top, three color-coded sorting chutes (green, blue, orange), a small conveyor, and a glowing circular-recycling arrow emblem. The 4 frames form a working loop: the emblem arrows rotate step by step and a small bottle/can moves along the conveyor. Keep the same machine, canvas size, center, and scale in every frame; only the arrows, conveyor, and small indicator lights change. Transparent background, no scene, no text, no UI.

---

## 3. 建造工作台（1 張）

Runtime 路徑：`assets/images/lobby/stations/workbench.png`

Prompt:

Use the reference lobby background image for style, palette, and camera angle. One pixel art PNG of a sturdy outdoor carpenter workbench made of reclaimed wood: thick tabletop with visible wood grain, a hammer and saw resting on it, a small stack of recycled planks and a jar of nails beside them, blueprint paper half unrolled. Warm brown wood with teal cloth accent. Friendly, inviting, clearly "the place where you build things". Transparent background, no character, no scene, no text.

---

## 4. 再生材料 icon（1 張）

Runtime 路徑：`assets/images/lobby/icons/icon_recycled_material.png`（建議 128×128）

Prompt:

Use the reference lobby background image for palette only. One pixel art game icon of a hexagonal recycled-material block: compressed cube-like hexagon chunk showing layered recycled content (green plastic flakes, silver metal bits, warm wood fiber), with a subtle circular-arrows emboss on the front face and a soft green rim light. Bold readable silhouette at small size, centered, transparent background, no text.

---

## 5. 功能建築（每棟 1 張，檔名固定 `base.png`）

### 5a. 太陽能工坊 solar_workshop（footprint 4×4，畫面寬約 512、高約 760）

Runtime 路徑：`assets/images/lobby/buildings/solar_workshop/base.png`

Prompt:

Use the reference lobby background image for style, palette, and camera angle — it already contains a wooden workshop hut with rooftop solar panels on the left side; design a NEW standalone building in that exact same style. One pixel art PNG of a compact solar workshop: warm timber cabin on a low stone base, large angled deep-blue solar panel array covering the roof, small battery unit and cables on the side wall, a round yellow sun emblem sign above the door, a few potted plants. Square footprint, front door facing the camera. Transparent background, no ground scene, no text.

### 5b. 雨水花園 rain_garden（footprint 4×3，畫面寬約 512、高約 620）

Runtime 路徑：`assets/images/lobby/buildings/rain_garden/base.png`

Prompt:

Use the reference lobby background image for style, palette, and camera angle. One pixel art PNG of a rain garden structure: a light wooden pergola frame with a slanted clear rain-collecting canopy, water flowing into a carved stone channel that feeds raised flower beds full of colorful native flowers, one small water tank with a blue droplet emblem at the side. Fresh greens and sky-blue water accents. Wider than deep (4x3 footprint). Transparent background, no scene, no text.

### 5c. 微型風力站 wind_station（footprint 3×3，畫面寬約 448、高約 680）

Runtime 路徑：`assets/images/lobby/buildings/wind_station/base.png`

Prompt:

Use the reference lobby background image for style, palette, and camera angle — it already contains tall white wind turbines; match them. One pixel art PNG of a mini wind power station: one elegant small white-and-teal wind turbine on a wooden service platform, a little control cabin with a round gauge, cables running to a small battery box, a wind sock on a pole. Light, airy, clean silhouette. Transparent background, no scene, no text.

### 5d. 循環防護站 recycle_guard（footprint 4×4，畫面寬約 512、高約 760）

Runtime 路徑：`assets/images/lobby/buildings/recycle_guard/base.png`

Prompt:

Use the reference lobby background image for style, palette, and camera angle. One pixel art PNG of a guardian shield generator station built from polished recycled metal: a rounded armored dome hut in gunmetal gray with teal energy seams, a rooftop emitter dish projecting a faint translucent hexagonal energy shield bubble above it, a glowing shield-with-recycling-arrows emblem on the front, rivets and reclaimed metal plates visible. Protective but friendly, not military. Transparent background, no scene, no text.

---

## 6. 裝飾（每種 1 張，檔名固定 `base.png`）

### 6a. 小樹 small_tree（1×1，畫面寬約 256、高約 400；遊戲內顯示約 48×75 world px）

Runtime 路徑：`assets/images/lobby/decorations/small_tree/base.png`

Prompt:

Use the reference lobby background image for style, palette, and camera angle — match its existing tropical shrubs and trees. One pixel art PNG of a single young broadleaf tree in a small mulch ring: short sturdy trunk, round layered canopy in two greens with a few light leaf highlights. Simple, cute, readable at 32px width. Transparent background, no scene, no text.

### 6b. 花圃 flower_bed（2×1，畫面寬約 512、高約 300）

Runtime 路徑：`assets/images/lobby/decorations/flower_bed/base.png`

Prompt:

Use the reference lobby background image for style, palette, and camera angle — it already contains wooden raised garden beds; match them. One pixel art PNG of a low wooden flower planter box, wider than deep, filled with rich dark soil and a cheerful row of pink, yellow, and white flowers with green leaves, one tiny butterfly resting on a bloom. Low profile so a character can appear to walk past it. Transparent background, no scene, no text.

### 6c. 回收長椅 recycle_bench（2×1，畫面寬約 512、高約 340）

Runtime 路徑：`assets/images/lobby/decorations/recycle_bench/base.png`

Prompt:

Use the reference lobby background image for style, palette, and camera angle. One pixel art PNG of a park bench made of colorful recycled plastic planks: seat and backrest slats in alternating soft teal, blue, and sand tones on a dark metal frame, a small stamped recycling emblem on the backrest. Friendly and clean. Transparent background, no scene, no text.

### 6d. 太陽能路燈 solar_lamp（1×1，畫面寬約 256、高約 480）

Runtime 路徑：`assets/images/lobby/decorations/solar_lamp/base.png`

Prompt:

Use the reference lobby background image for style, palette, and camera angle. One pixel art PNG of a solar-powered street lamp: slim dark-green metal pole, warm glowing round lantern head, small angled solar panel on top, tiny charge indicator light. Soft warm glow suits the dusk lighting of the reference. Transparent background, no scene, no text.

### 6e. 分類垃圾桶 sorting_bins（2×1，畫面寬約 512、高約 360）

Runtime 路徑：`assets/images/lobby/decorations/sorting_bins/base.png`

Prompt:

Use the reference lobby background image for style, palette, and camera angle — it already contains colorful recycling bins on the wooden deck; match them exactly in style. One pixel art PNG of a neat row of three recycling bins on a small wooden base: green, blue, and orange bins with lids and clear white recycling symbols, slightly different heights for charm. Transparent background, no scene, no text.

### 6f. 雨水桶 rain_barrel（1×1，畫面寬約 256、高約 360）

Runtime 路徑：`assets/images/lobby/decorations/rain_barrel/base.png`

Prompt:

Use the reference lobby background image for style, palette, and camera angle — it already contains a pale water tank with a blue droplet emblem; match that motif. One pixel art PNG of a wooden rain barrel with metal bands, a short gutter pipe feeding into the open top, a blue water-droplet emblem painted on the front, a tiny tap near the bottom. Transparent background, no scene, no text.

### 6g. 木製告示牌 wood_sign（1×1，畫面寬約 256、高約 360）

Runtime 路徑：`assets/images/lobby/decorations/wood_sign/base.png`

Prompt:

Use the reference lobby background image for style, palette, and camera angle. One pixel art PNG of a rustic wooden signboard on a single post: weathered plank board with a carved leaf mark and two short blank text lines suggested by lighter grooves (no real letters), small green vine curling up the post. Transparent background, no scene, no readable text.

### 6h. 小型生態池 eco_pond（3×2，畫面寬約 512、高約 400）

Runtime 路徑：`assets/images/lobby/decorations/eco_pond/base.png`

Prompt:

Use the reference lobby background image for style, palette, and camera angle — match its turquoise shallow water rendering. One pixel art PNG of a small oval ecological pond: clear teal water with soft ripple highlights, natural stone rim with moss, two lily pads with one pink lotus, a few reeds and a tiny frog on a stone, one dragonfly hovering. Wider than deep (3x2 footprint), low profile. Transparent background, no scene, no text.

---

## 產出後檢查（對齊素材 QA 規則）

透明背景、無文字與 UI、同一透視角度、像素密度一致、單一物件置中且底部貼齊、剪影清楚；放進 Runtime 路徑後重新整理遊戲即可看到（快取問題可用 Ctrl+F5）。若某張圖穿幫，刪掉該檔案就會自動回到程式繪製的佔位圖，不影響遊玩。
