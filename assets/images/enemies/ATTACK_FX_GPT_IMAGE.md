# 遠程怪物與 BOSS 攻擊特效（GPT-image）

生成日期：2026-07-14  
生成方式：Codex 內建 GPT-image（`imagegen`）  
用途：2D 俯視角生態 Roguelite 的敵方投射物與攻擊預警

## 共用提示詞

```text
Use case: stylized-concept
Asset type: game-ready pixel-art enemy attack VFX
Style/medium: polished 2D top-down roguelite pixel art, medium-high detail,
crisp dark outline, hard pixel edges, readable at small gameplay size.
Lighting/mood: top-left pixel lighting; preserve the referenced enemy's materials and palette.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for local removal.
Constraints: one centered asset with generous padding; background must be exactly one
uniform #00ff00 with no shadows, gradients, texture, floor, reflections, or lighting
variation; do not use #00ff00 in the artwork; opaque crisp silhouette; no cast shadow;
no text; no border; no UI; no watermark; no photorealism; no 3D render.
```

投射物另外要求：面向正右、單一物件、旋轉中心位於畫布中央。  
預警環另外要求：俯視正圓、中央完全留空、無角色或投射物。

## 素材提示詞差異

| 輸出素材 | 敵人參考圖 | 主要提示詞 |
| --- | --- | --- |
| `ghost_net/attacks/ghost_net_knot_projectile.png` | `ghost_net/idle_S_0.png` | Compact spectral fishing-net knot projectile, glowing teal rope, cyan eye, shells and floats, sharp forward tip, short frayed spectral trail. |
| `ghost_net/attacks/ghost_net_barrage_telegraph.png` | `ghost_net/enemy_ghost_net.png` | Haunted net warning ring with teal rope, floats and shells; exactly 8 evenly spaced glowing outward emitters and a large empty center. |
| `scrap_drone/attacks/scrap_shard_projectile.png` | `scrap_drone/idle_S_0.png` | Magnetically accelerated jagged steel shard, cyan magnetic core, copper induction bands and a short orange electromagnetic trail. |
| `scrap_drone/attacks/scrap_magnet_telegraph.png` | `scrap_drone/idle_S_0.png` | Aimed-shot magnetic charge ring made of segmented gunmetal plates, four copper coils, orange arcs and cyan polarity lights; no outward spikes. |
| `compactor_golem/attacks/compactor_scrap_projectile.png` | `compactor_golem/enemy_compactor_golem.png` | Heavy hydraulic rivet of compressed steel plates, wedge nose, black iron frame, orange heated seams and a small muted-green recycling plate without text. |
| `compactor_golem/attacks/compactor_barrage_telegraph.png` | `compactor_golem/enemy_compactor_golem.png` | Industrial warning ring with hydraulic joints and hazard lights; exactly 12 evenly spaced heavy outward emitters and a large empty center. |
| `smog_drone/attacks/smog_orb_projectile.png` | `smog_drone/idle_S_0.png` | Concentrated dark-violet smog core in a mechanical monitor collar, purple sensor glow and discrete opaque soot-pixel trail. |
| `smog_drone/attacks/smog_charge_telegraph.png` | `smog_drone/idle_S_0.png` | Aimed-shot pollution charge ring made of charcoal soot clusters, dark sensor housings, four violet nodes and a bright purple inner energy line; no outward spikes. |

現有的電池史萊姆與油污核心素材作為同系列風格、構圖與像素密度參考，未被覆蓋。

## 後製規格

- 使用 `remove_chroma_key.py` 的 border auto-key、soft matte 與 despill 移除綠幕。
- 投射物輸出為 `128×128 RGBA PNG`，內容置中於約 `104×56` 安全框。
- 預警輸出為 `256×256 RGBA PNG`，內容置中於約 `238×238` 安全框。
- 四角 Alpha 必須為 0；執行期關閉影像平滑並依射擊方向旋轉投射物。
