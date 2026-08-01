# 素材整合說明（圖片優先 · 缺圖自動 fallback）

本專案已改為「**圖片素材優先，缺圖則回退程式碼繪製的 placeholder**」。
你只要把圖片放到下表的「正式素材路徑」，重新整理頁面即可看到替換效果；
任何圖片缺失或載入失敗都**不會**影響遊戲啟動與流程。

---

## 一、運作原理

1. `js/assets.js`（AssetLoader）在開機時**非同步預載**所有素材。
   - 每個素材可設定多個候選路徑，依序嘗試：**正式路徑 →（目前的 concept 圖）→ 失敗**。
   - 大圖載入後會一次性**下採樣（bake）到最長邊 200px**，之後每幀繪製較省效能。
2. `js/sprites.js` 的三個繪製函式都改為「先問 `Assets`，有圖用圖，否則畫 placeholder」：
   - `Sprites.draw()`：世界中的**角色 / 敵人 / 掉落物**。
   - `Sprites.makeCanvas()`：DOM 的**角色頭像、主畫面立繪**。
   - `Sprites.drawIcon()` / `makeIconCanvas()`：**技能圖示、商店升級圖示、升級卡圖示**。
3. 圖片會**等比例置中**塞進「與原本 placeholder 相同大小的方框」，
   因此換圖**不會改變碰撞範圍或遊戲數值**，只換外觀。

> 偵錯：在瀏覽器 Console 輸入 `Assets.report()`，可看到每個 key 是否載入成功、用了哪個路徑。

---

## 二、素材對照表（key → 正式路徑 → 名稱 → 目前狀態）

「正式路徑」是建議你放最終圖的位置；把檔案放這裡（或覆蓋同名檔）即可生效。

### 角色（世界中繪製 + 角色卡）
| key | 正式素材路徑 | 名稱 | 目前狀態 |
|---|---|---|---|
| `char_ranger` | `assets/images/characters/player_ranger.png` | 森林巡守員 | ✅ 已用圖片（由 v2 concept 裁切而來，可覆蓋） |
| `char_beach` | `assets/images/characters/player_beachcomber.png` | 海岸淨灘者 | ✅ 已用圖片 |
| `char_solar` | `assets/images/characters/player_solar_engineer.png` | 太陽能工程師 | ✅ 已用圖片 |

### 敵人
| key | 正式素材路徑 | 名稱 | 目前狀態 |
|---|---|---|---|
| `enemy_bag` | `assets/images/enemies/enemy_plastic_bag.png` | 塑膠袋怪 | ✅ 已用圖片 |
| `enemy_butt` | `assets/images/enemies/enemy_cigarette_bug.png` | 菸蒂蟲 | ✅ 已用圖片 |
| `enemy_battery` | `assets/images/enemies/enemy_battery_slime.png` | 廢電池史萊姆 | ✅ 已用圖片 |
| `enemy_oil` | `assets/images/enemies/enemy_oil_blob.png` | 油污團塊（Boss） | ✅ 已用圖片 |

### 掉落物 / 道具
| key | 正式素材路徑 | 名稱 | 目前狀態 |
|---|---|---|---|
| `pickup_xp` | `assets/images/items/item_exp_crystal.png` | 經驗晶體 | ✅ 已用圖片 |
| `pickup_coin` | `assets/images/items/item_cycle_coin.png` | 循環幣 | ✅ 已用圖片 |
| `pickup_health` | `assets/images/items/item_water_bottle.png` | 淨水瓶 | ✅ 已用圖片 |
| `pickup_card` | `assets/images/items/item_knowledge_card.png` | 知識卡 | ✅ 已用圖片 |

### 技能圖示（HUD 技能列 / 升級卡）
| key | 正式素材路徑 | 名稱 | 目前狀態 |
|---|---|---|---|
| `skill_seed` | `assets/images/skills/skill_seed_blade.png` | 種子飛刃 | ✅ 已用圖片 |
| `skill_net` | `assets/images/skills/skill_recycle_net.png` | 回收磁網 | ✅ 已用圖片 |
| `skill_solar` | `assets/images/skills/skill_solar_pulse.png` | 太陽能脈衝 | ✅ 已用圖片 |
| `skill_wind` | `assets/images/skills/skill_wind_blades.png` | 風力葉片 | ✅ 已用圖片 |
| `skill_compost` | `assets/images/skills/skill_compost_spores.png` | 堆肥孢子 | ✅ 已用圖片 |

### 商店升級圖示
| key | 正式素材路徑 | 名稱 | 目前狀態 |
|---|---|---|---|
| `shop_soil` | `assets/images/ui/upgrade_healthy_soil.png` | 健康土壤 | ⬜ fallback（向量繪製，放圖即可替換） |
| `shop_recycle` | `assets/images/ui/upgrade_recycling_sort.png` | 回收分類 | ⬜ fallback |
| `shop_energy` | `assets/images/ui/upgrade_energy_saving.png` | 節能行動 | ⬜ fallback |
| `shop_eco` | `assets/images/ui/upgrade_eco_sense.png` | 生態感知 | ⬜ fallback |
| `shop_rain` | `assets/images/ui/upgrade_rainwater.png` | 雨水收集 | ⬜ fallback |

### 仍為程式繪製（非 sprite，暫不走圖片）
- **特效**：種子飛刃投射物、回收磁網/堆肥孢子地面區域、太陽能脈衝波、風力葉片、淨化粒子、飄字。
- **關卡背景**：潮間帶地形（沙灘/海水/潮池/漂流木/回收桶）為程式生成。
- **HUD 條**：生命條、經驗條為 CSS 繪製。
> 這些屬於動態效果/版面，第一版維持程式繪製即可；若日後要換圖，見下方「進階」。

---

## 三、如何新增 / 替換圖片（最常用）

1. 準備一張 **去背 PNG**（建議單一主體、置中、四周留少量透明邊）。尺寸不限，載入時會自動縮小。
2. 依上表，把檔案放到該 key 的「正式素材路徑」（或直接覆蓋同名檔）。
3. 重新整理（或重開 `index.html`）即可。圖片會自動置中縮放到原本大小，不影響數值。

> 不需要改任何程式碼。若路徑/檔名想自訂，改 `js/assets.js` 裡 `MANIFEST` 對應 key 的 `paths` 第一個值即可。

---

## 四、進階

### 1. 新增一個全新的素材 key
- 在 `js/data/*` 給實體設定 `spriteId` / `iconId`（例如新敵人 `spriteId: "enemy_xxx"`）。
- 在 `js/assets.js` 的 `MANIFEST` 加一筆：
  ```js
  enemy_xxx: { label: "新敵人", paths: ["assets/images/enemies/enemy_xxx.png"] }
  ```
- 沒有圖時，只要 `js/sprites.js` 的 `SPRITES` 裡有同名 placeholder 就會 fallback；
  若兩者皆無，該實體不會繪製（但不會報錯）。

### 2. 調整載入後的下採樣大小
- `js/assets.js` 最上方 `BAKE_MAX`（預設 200）。Boss 或高解析需求可調大；要更省效能可調小。

### 3. 換掉技能特效 / 背景（選用，較進階）
- 特效在 `js/weapons.js`（`Projectile / Zone / Pulse / Weapon.draw`）。
- 背景在 `js/game.js` 的 `buildBackground()`。
- 可在 `MANIFEST` 加 key（例如 `fx_seed`、`bg_tidal_flat`），再於對應 `draw` 內用
  `Assets.drawCentered(...)`／`Assets.get(...)` 取代程式繪製，同樣保有 fallback。

### 4. 載入失敗的行為
- 任一圖片載入失敗（檔案不存在、`file://` 限制等）→ 該 key 自動使用 placeholder。
- 遊戲一定能啟動；不會因缺圖而中斷。
