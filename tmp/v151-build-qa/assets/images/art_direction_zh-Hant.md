# 永續生態 Roguelite 美術素材規格

本文件定義 2D top-down / 3/4 俯視角像素動作 Roguelite 的統一美術方向。目標是讓角色、敵人、技能、道具與地圖素材在 Web / 2D Canvas 中有一致的世界觀、色彩、像素密度與可讀性。

概念表參考圖：

- `assets/images/concepts/eco_roguelite_asset_concept_v1.png`

## 核心視覺定位

遊戲氣質是「療癒自然感 + 生態冒險感 + 污染侵蝕危機感」。畫面要明亮、清楚、可愛但不幼稚，污染元素用卡通化、可淨化的方式呈現，避免恐怖、獵奇、寫實或過暗。

主要視覺支柱：

- 永續教育：葉片、水滴、太陽能、風力、回收標誌、知識卡、淨化光點。
- 生態冒險：海岸、濕地、森林、土壤、種子、生物多樣性、自然材質。
- 污染危機：塑膠、油污、廢棄電池、煙霧、灰紫土壤、毒性黏液、廢棄罐。

## 像素規格

建議以 16px 為最小視覺模組，遊戲中主素材以 32px 或 48px 為核心單位。

| 類型 | 原始尺寸 | 顯示倍率 | 備註 |
| --- | ---: | ---: | --- |
| 玩家角色 | 32x32 或 48x48 | 2x-3x | 需有四方向走路動畫 |
| 一般敵人 | 24x24 或 32x32 | 2x-3x | 輪廓需比道具更強 |
| 精英敵人 | 48x48 | 2x | 加入發光、污染紋路或裝甲 |
| Boss | 64x64 或 96x96 | 1.5x-2x | 大輪廓，攻擊提示清楚 |
| 掉落物 | 16x16 或 24x24 | 2x-3x | 高亮外緣，遠距離可辨識 |
| 技能投射物 | 16x16 或 24x24 | 2x-3x | 形狀不能與掉落物混淆 |
| 技能特效 | 32x32, 64x64, 96x96 | 1x-2x | 可用序列幀或 Canvas 粒子輔助 |
| 地圖 tile | 32x32 | 1x-2x | 以健康/污染狀態成對設計 |
| 地圖 overlay | 16x16 或 32x32 | 1x-2x | 石頭、草叢、塑膠碎片、油污 |

Canvas 顯示設定：

- 關閉平滑縮放：`imageSmoothingEnabled = false`
- PNG 使用透明背景。
- 若從概念圖切圖，需重新清理背景與陰影；概念表主要是風格參考，不建議直接當最終 sprite sheet。

## 色彩語言

整體使用明亮自然色，污染色不可全面壓過畫面。健康自然色約 65%，污染危機色約 25%，互動高亮色約 10%。

| 用途 | 色彩 | Hex |
| --- | --- | --- |
| 深色輪廓 | deep ink | `#243039` |
| 葉片暗部 | forest green | `#2F6B3E` |
| 葉片主色 | leaf green | `#68C85A` |
| 新芽高光 | sprout lime | `#B6E36A` |
| 海水主色 | ocean cyan | `#2C9BCB` |
| 淨化水光 | clean aqua | `#75E4E0` |
| 沙灘 | warm sand | `#E8C878` |
| 健康土壤 | living soil | `#8C5A35` |
| 太陽能 | solar yellow | `#F7C948` |
| 珊瑚提示色 | coral action | `#F06A4A` |
| 污染灰霧 | smog gray | `#7C8794` |
| 污染紫土 | toxic mauve | `#6F5B7D` |
| 油污暗色 | oil navy | `#1F2233` |
| 油污反光 | oily violet | `#5B4FA3` |
| 毒性黏液 | muted toxic lime | `#A6D854` |
| 塑膠白 | plastic white | `#D8E7EF` |

### 陣營對比

淨化/自然陣營：

- 圓弧、葉片、水滴、太陽放射、柔和光粒。
- 主色為綠、青、水藍、暖黃。
- 高光乾淨，邊緣帶少量白或淺青。

污染陣營：

- 不規則輪廓、黏液拖尾、破碎塑膠、煙霧顆粒。
- 主色為灰紫、油黑、塑膠白、暗紅鏽色。
- 可以帶毒綠點綴，但避免螢光過量。

## 光影與材質

所有 sprite 統一使用左上光源：

- 左上方 1-2px 高光。
- 右下方 1-2px 暗部。
- 腳底使用簡單橢圓陰影或像素化半透明陰影。
- 輪廓以深色 1px 為主，大型 Boss 可局部 2px。
- 金屬、塑膠、油污、水面可加小面積亮點，但不要變成寫實反射。

材質辨識：

- 葉片：明暗分面 + 中央葉脈。
- 水：青藍主色 + 白色碎亮點。
- 土壤：暖棕底 + 小石塊 + 新芽。
- 沙灘：暖黃底 + 貝殼/海星/小石。
- 油污：深藍黑底 + 紫色彎曲反光。
- 塑膠：偏冷白灰 + 折線高光。
- 煙霧：低對比灰紫雲團，邊緣不要太軟。

## 玩家角色設計

玩家只控制移動，技能自動攻擊，因此角色動作要以移動可讀性為主，攻擊可以由技能特效表現。

### Eco Ranger

- 視覺：森林披肩、背包、葉片徽章、自然研究員感。
- 色彩：綠、棕、米白。
- 初始技能：種子葉刃。
- 個性：穩定、基礎生命較高。

建議動畫：

- `idle_down`, `idle_up`, `idle_side`: 2-4 幀。
- `walk_down`, `walk_up`, `walk_side`: 4 幀。
- `hurt`: 1-2 幀，白閃或小葉片散落。

### Beach Cleanser

- 視覺：海岸志工、手套、輕裝背包、藍綠配色。
- 色彩：水藍、青綠、沙色。
- 初始技能：回收網。
- 個性：拾取範圍大，機動感較強。

### Solar Engineer

- 視覺：太陽能面板背包、黃色護目鏡、工程工具。
- 色彩：太陽黃、橘、深藍。
- 初始技能：太陽脈衝。
- 個性：技能冷卻短，科技永續感。

### Wetland Researcher

- 視覺：濕地調查帽、樣本瓶、短靴、小水滴吊飾。
- 色彩：青藍、橄欖綠、米色。
- 初始技能：淨水湧泉或堆肥孢子。
- 個性：治癒/淨化輔助向。

## 敵人素材

敵人必須有清楚污染來源，並在被擊敗時看起來像被淨化，而不是死亡血腥。

| ID | 名稱 | 尺寸 | 造型 | 色彩/辨識 |
| --- | --- | ---: | --- | --- |
| `enemy_plastic_bag` | 漂浮塑膠袋 | 24x24 | 像幽靈但不可恐怖 | 冷白灰、皺摺、塑膠高光 |
| `enemy_butt_bug` | 菸蒂蟲 | 24x24 | 小型快速爬行 | 米白濾嘴、橘紅燃痕 |
| `enemy_battery_slime` | 廢電池史萊姆 | 32x32 | 電池嵌在黏液中 | 綠灰黏液、黃黑警示點 |
| `enemy_oil_blob` | 油污核心 | 64x64/96x96 | Boss，大片油污與眼光 | 油黑、紫藍反光、暗黃眼 |
| `enemy_smog_wisp` | 灰霧靈 | 32x32 | 雲團狀慢速接近 | 灰紫煙霧、藍色弱光眼 |
| `enemy_can_crawler` | 廢罐爬蟲 | 32x32 | 罐頭殼與小腳 | 鏽紅金屬、罐口高光 |
| `enemy_microplastic_swarm` | 微塑膠群 | 32x32 | 多顆碎片聚合 | 白、粉、藍小碎片 |
| `enemy_ewaste_beetle` | 電廢甲蟲 | 48x48 | 電路板甲殼 | 深綠電路、銅色腳 |

淨化死亡特效：

- 小型敵人：綠/青色圓環擴散 + 2-4 個葉片粒子。
- 污染敵人：灰紫碎片變淡，最後轉為水滴或葉片光點。
- Boss：多段油污退散，中心爆出金黃淨化光柱。

## 技能與特效

技能要與教育主題自然融合，不需要用文字說明，圖像本身就能理解。

| ID | 技能 | 視覺 | 尺寸/動畫 |
| --- | --- | --- | --- |
| `skill_seed_blade` | 種子葉刃 | 旋轉葉片飛刃，尾端小綠光 | 16x16 projectile，4 幀旋轉 |
| `skill_recycle_net` | 回收網 | 青綠網狀圓環，將污染物拉近或標記 | 96x96 aura，6-8 幀 |
| `skill_solar_pulse` | 太陽脈衝 | 金黃光柱或環形脈衝 | 128x128 pulse，6 幀 |
| `skill_wind_blades` | 風力葉輪 | 三葉風車葉片繞玩家旋轉 | 24x24 orbit sprite |
| `skill_compost_spores` | 堆肥孢子 | 土壤圈、菌絲、小芽冒出 | 64x64 zone，6 幀 |
| `skill_pure_water` | 淨水湧泉 | 水柱、泡泡、淺藍碎光 | 64x64 burst，6 幀 |
| `skill_root_snare` | 根系束縛 | 樹根從地面纏住污染物 | 64x64 ground effect |
| `skill_biodiversity_swarm` | 生物多樣性群 | 小鳥/魚/昆蟲圖像化光影，不寫實 | 96x96 sweep |

特效分層建議：

- 底層：半透明圓形範圍提示。
- 中層：主要像素形狀，例如葉片、水、太陽、風。
- 上層：少量高亮粒子。

## 道具與掉落物

| ID | 名稱 | 尺寸 | 用途 |
| --- | --- | ---: | --- |
| `pickup_xp_leaf` | 葉片經驗 | 16x16 | 綠色小葉或種子光點 |
| `pickup_eco_coin` | 生態點數 | 16x16 | 青綠圓片、回收微符號 |
| `pickup_water_drop` | 生命水滴 | 16x16/24x24 | 藍色水滴，高光明顯 |
| `pickup_knowledge_card` | 知識卡 | 24x24 | 米白卡片 + 葉片角標 |
| `pickup_solar_cell` | 太陽能電池 | 24x24 | 小面板 + 金色邊 |
| `pickup_seed_capsule` | 種子膠囊 | 24x24 | 木色外殼、新芽露出 |
| `pickup_recycle_crate` | 回收箱 | 32x32 | 綠箱，白色回收符號 |

道具優先使用外圈亮邊，避免被地圖 texture 吃掉。

## 地圖與環境

每個 biome 都設計「健康版」與「污染版」，可在遊戲進程中逐步淨化。

### 海岸

- 健康：清澈淺水、沙灘、貝殼、海草、白色浪花。
- 污染：塑膠瓶、袋子碎片、油膜、灰色泡沫。
- Tile：`coast_sand`, `coast_water_edge`, `coast_debris_overlay`, `coast_oil_overlay`。

### 森林

- 健康：草地、花、小石、新芽、樹根。
- 污染：灰紫土、枯枝、煙霧斑、塑膠纏繞。
- Tile：`forest_grass`, `forest_soil`, `forest_polluted_soil`, `forest_roots_overlay`。

### 濕地

- 健康：淺水、蘆葦、浮葉、水光。
- 污染：暗色水面、漂浮廢棄物、油污漣漪。
- Tile：`wetland_water`, `wetland_reed`, `wetland_dirty_water`, `wetland_plastic_overlay`。

### 校園/教育據點

- 健康：太陽能板、風機標記、回收站、研究看板。
- 污染：故障電池、破碎設備、灰霧堆。
- 用於主選單、商店或關卡互動點。

## 角色與敵人的輪廓規則

- 玩家輪廓偏圓、比例穩定，頭身約 1:1.5 到 1:2。
- 敵人輪廓更誇張，讓玩家不用讀文字也能分辨污染類型。
- 遠距離測試時，縮到 32px 顯示仍需可辨識。
- 不讓重要色與地圖底色過近；例如綠色角色在草地上需用米白披肩或深色輪廓分離。

## 命名與輸出規則

建議資料夾：

```text
assets/images/characters/
assets/images/enemies/
assets/images/pickups/
assets/images/skills/
assets/images/tiles/
assets/images/concepts/
```

命名：

```text
char_<id>_<anim>.png
enemy_<id>_<anim>.png
pickup_<id>.png
skill_<id>_<anim>.png
tile_<biome>_<state>.png
overlay_<biome>_<object>.png
```

範例：

```text
char_ranger_walk_down.png
enemy_oil_blob_idle.png
pickup_knowledge_card.png
skill_solar_pulse_burst.png
tile_coast_polluted_sand.png
overlay_forest_plastic_bits.png
```

Sprite sheet metadata 建議：

```json
{
  "frameWidth": 32,
  "frameHeight": 32,
  "animations": {
    "idle_down": [0, 1],
    "walk_down": [2, 3, 4, 5],
    "walk_side": [6, 7, 8, 9],
    "walk_up": [10, 11, 12, 13]
  }
}
```

## AI 生成提示詞模板

### 全域風格

```text
clean pixel art, 2D top-down / 3/4 top-down game asset, medium-high detail pixel art, sustainable ecology theme, nature-inspired fantasy, pollution purification, clear readable silhouette, consistent palette, crisp hard pixel edges, transparent background or flat chroma-key background, top-left pixel lighting, simple pixel shadow, charming but not childish, game-ready asset, no photorealism, no 3D render, no text, no watermark
```

### 玩家角色

```text
Create a 32x32 or 48x48 pixel art sprite sheet for a top-down eco-adventurer character in a sustainable ecology action roguelite. The character is a university-age environmental adventurer with [specific outfit]. Use forest green, ocean teal, warm sand, and solar yellow accents. Include idle and 4-frame walk cycles for down, side, and up directions. Keep the silhouette readable at small size, with a dark 1px outline, top-left highlights, simple foot shadow, transparent background, no text, no UI, no photorealism, no 3D.
```

### 敵人

```text
Create a pixel art enemy sprite for a top-down pollution purification roguelite. Subject: [plastic slime / oil blob / smog wisp / e-waste beetle]. The enemy should be stylized, readable, cartoon-like, not horror, with pollution materials clearly visible. Use polluted gray-purple, oil navy, muted toxic lime, plastic white, and small clean-color highlights. 24x24/32x32/48x48 game-ready sprite, transparent background, crisp pixels, dark outline, top-left lighting, no text, no watermark, no realistic rendering.
```

### 技能特效

```text
Create a pixel art VFX sprite sheet for a top-down ecology-themed roguelite skill. Skill: [seed blade / recycle net / solar pulse / wind blades / compost spores / pure water burst]. Use clean nature colors and pollution purification glow. The effect must be readable over grass, sand, water, and polluted soil. 6-8 animation frames, crisp pixels, top-left lighting, transparent background, no text, no photorealism, no 3D.
```

### 地圖 tile

```text
Create a seamless 32x32 pixel art terrain tile set for a top-down sustainable ecology roguelite. Biome: [coast / forest / wetland]. Include healthy and polluted versions of the same tile, plus small overlay objects. Bright natural palette, readable texture, consistent pixel density, no perspective scene, no text, no characters, no photorealism, no 3D.
```

## 本次概念表生成提示詞

```text
Design a unified pixel art asset sheet for a 2D top-down / 3/4 view action roguelite about sustainable education, ecological adventure, and pollution purification. Include a playable eco-adventurer/student hero, a seed drone companion, pollution enemies, eco pickups, skill effects, and terrain tiles. Clean pixel art, medium-high detail, consistent palette, readable silhouettes, bright natural daylight, healing nature mood with pollution crisis, vivid greens, teal, ocean cyan, solar yellow, coral accents, soil brown, polluted gray-purple, oily indigo, muted toxic lime. Arrange as separated game assets with even padding on a neutral background. No labels, no text, no watermark, no photorealism, no 3D render.
```

## 驗收清單

- 角色、敵人、掉落物縮到遊戲實際顯示大小仍可分辨。
- 所有素材使用同一光源方向與輪廓深度。
- 地圖健康版與污染版能看出是同一地形的不同狀態。
- 污染素材有危機感，但不恐怖、不噁心。
- 技能特效不遮蔽玩家與敵人的碰撞判斷。
- 每個素材能自然連回永續教育、生態冒險或污染淨化。
- 圖片可在 Canvas 關閉平滑縮放下保持清楚。
