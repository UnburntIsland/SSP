# 非塑膠袋怪物 8 方向移動動畫 QA

驗收日期：2026-07-11

## 範圍

本輪只檢查與處理：

- `butt_bug`
- `battery_slime`
- `oil_blob`

依需求排除 `plastic_bag`。沒有修改敵人 AI、方向判定、玩家 input、`getDirectionFromVector()`、戰鬥數值或 renderer 邏輯。

## 修正前狀態

| Enemy | Runtime move | 已有方向 | 缺少方向 | 判定 |
| --- | ---: | --- | --- | --- |
| `butt_bug` | 16 / 32 | N, S, SW, W | NE, E, SE, NW | 現有圖一致；缺 4 個方向 |
| `battery_slime` | 16 / 32 | S, SW, W, NW | N, NE, E, SE | 現有圖一致；缺 4 個方向 |
| `oil_blob` | 32 / 32 | N, NE, E, SE, S, SW, W, NW | 無 | 8 方向完整且一致 |

現有圖片沒有發現黑底、白底、解碼失敗、錯誤角色或嚴重裁切。既有 squash/stretch 與爬行姿勢造成的 bbox 變化屬於動畫動作，不是角色尺寸漂移。

## GPT-image 重生與接入

使用各 enemy 既有方向圖作為角色 identity、配色與像素語言 reference，生成後先放入 incoming，經以下流程才 promote：

1. 2x2 生成 sheet 切成 4 張獨立 frame。
2. 移除純洋紅 chroma background，輸出透明 RGBA。
3. 以 nearest-neighbor normalize 到既有 runtime canvas。
4. 對齊既有視覺中心與 baseline。
5. 建立 contact sheet，人工確認方向、外型、配色與動態。
6. 通過尺寸、透明度、重複幀、HTTP 與瀏覽器 console QA 後才複製到 runtime。

新增到 runtime：

- `butt_bug`: `move_NE_0~3`, `move_E_0~3`, `move_SE_0~3`, `move_NW_0~3`
- `battery_slime`: `move_N_0~3`, `move_NE_0~3`, `move_E_0~3`, `move_SE_0~3`
- `oil_blob`: 無需重生或替換

共新增 32 張 PNG。這 32 個 runtime 檔名原本都不存在，因此沒有覆蓋或退役任何既有合格 frame。

## 最終一致性

| Enemy | Canvas | bbox center X | bbox bottom | 透明角落 | 唯一 frame | 結果 |
| --- | --- | --- | --- | --- | ---: | --- |
| `butt_bug` | 192x192 | 95.0 - 96.0 | 149 | 全部 alpha=0 | 32 / 32 | PASS |
| `battery_slime` | 192x192 | 95.0 - 96.0 | 159 | 全部 alpha=0 | 32 / 32 | PASS |
| `oil_blob` | 256x256 | 127.5 - 128.0 | 217 | 全部 alpha=0 | 32 / 32 | PASS |

人工方向判定：

- `butt_bug`: E/W、NE/NW、SE/SW 的頭部與濾嘴方向可區分；N 為背面、S 為正面。
- `battery_slime`: E/NE/SE 的臉與側電池位置和 W/NW/SW 形成正確對應；N 不顯示正面表情。
- `oil_blob`: 核心、油膜與拖曳輪廓在 8 方向維持同一怪物；沒有外型跳換。

所有方向 4 幀 hash 均不同。72px 縮放檢查仍能辨識爬行、壓縮回彈或黏稠流動，沒有同一張圖重複播放。

## Runtime 驗證

本地伺服器：`http://127.0.0.1:8765/`

| Enemy | move URL 200 | 404 |
| --- | ---: | ---: |
| `butt_bug` | 32 / 32 | 0 |
| `battery_slime` | 32 / 32 | 0 |
| `oil_blob` | 32 / 32 | 0 |

- `js/data/enemies.js` 會為每個 enemy 註冊 N/NE/E/SE/S/SW/W/NW 的 `move_<DIR>_0~3`。
- runtime folder 與 enemy id 一致。
- 瀏覽器 console 對這三隻怪沒有 warning 或 error。
- 沒有程式碼變更，也不需要 cache-bust；補入的是原先不存在的新 URL。

## 截圖

- `screenshots/enemy-move-audit-butt_bug.png`
- `screenshots/enemy-move-audit-battery_slime.png`
- `screenshots/enemy-move-audit-oil_blob.png`
- `screenshots/enemy-move-regeneration-raw-contact-sheet.png`
- `screenshots/enemy-move-final-qa-butt_bug.png`
- `screenshots/enemy-move-final-qa-battery_slime.png`
- `screenshots/enemy-move-final-qa-oil_blob.png`
- `screenshots/enemy-move-runtime-final-butt_bug.png`
- `screenshots/enemy-move-runtime-final-battery_slime.png`
- `screenshots/enemy-move-runtime-final-oil_blob.png`

## 結論

三隻非塑膠袋怪物目前皆為完整 8 方向、每方向 4 幀，共 32 張 move frame。未發現需要退役的既有合格圖片；原本的問題是 `butt_bug` 與 `battery_slime` 各缺 4 個方向，現已用通過 QA 的 GPT-image 素材補齊。
