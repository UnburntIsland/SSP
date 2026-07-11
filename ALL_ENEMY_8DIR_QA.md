# 全怪物 8 方向動畫 QA

## 結論

- 程式目前實際使用 13 種怪物。
- 每種怪物均有 8 張 `idle_<DIR>_0.png` 與 32 張 `move_<DIR>_<0-3>.png`。
- Runtime 總計 520 張 PNG，全部可解碼、具 alpha、四角透明，沒有缺幀。
- 9 種新怪物使用 GPT-image 母版生成；原有 4 種怪物保留先前已通過視覺檢查的 GPT-image move frames。
- 新圖先經 chroma 去背、切幀、方向重映射、visual-mass normalize，再由 incoming promote。

## Runtime 狀態

| Enemy | Runtime | Canvas | 最低相鄰幀差異 | Baseline | Center X | 結果 |
|---|---:|---:|---:|---:|---:|---|
| plastic_bag | 40/40 | 192x192 | 16.71% | 160 | 95.5-96.5 | PASS |
| butt_bug | 40/40 | 192x192 | 53.57% | 150-151 | 95.5-96.5 | PASS |
| battery_slime | 40/40 | 192x192 | 41.38% | 160-161 | 95.5-96.5 | PASS |
| oil_blob | 40/40 | 256x256 | 20.18% | 218 | 128.0-128.5 | PASS |
| bottle_mite | 40/40 | 192x192 | 61.64% | 160 | 95.5-96.5 | PASS |
| foam_crab | 40/40 | 192x192 | 58.51% | 160 | 95.5-96.5 | PASS |
| ghost_net | 40/40 | 256x256 | 89.08% | 220 | 127.5-128.5 | PASS |
| scrap_drone | 40/40 | 192x192 | 49.19% | 160 | 95.5-96.5 | PASS |
| can_crusher | 40/40 | 192x192 | 53.76% | 160 | 95.5-96.5 | PASS |
| compactor_golem | 40/40 | 256x256 | 50.64% | 220 | 127.5-128.5 | PASS |
| oil_slickling | 40/40 | 192x192 | 57.51% | 160 | 95.5-96.5 | PASS |
| smog_drone | 40/40 | 192x192 | 58.92% | 160 | 95.5-96.5 | PASS |
| ash_wisp | 40/40 | 192x192 | 63.72% | 160 | 95.5-96.5 | PASS |

## 檢查項目

- 8 方向：`N, NE, E, SE, S, SW, W, NW` 均有完整四幀 move。
- Partial direction：0。
- 重複 move 檔案 hash：0；每隻怪物皆為 32 個唯一 move PNG。
- 新圖背景：chroma 已移除，四角 alpha 均為 0。
- 新圖 baseline：方向與幀之間最多 1px。
- 新圖 center X：方向與幀之間最多約 1px。
- 新圖 visual mass：normalize 後面積比約 1.01-1.09。
- 正式模式使用圖片；圖片失敗時仍保留既有 Canvas fallback。

## Browser Runtime 驗證

- 測試網址：`index.html?test=1&debugAnimation=1&qaSkipIntro=1&qaUnlockStages=1&qaEnemy8Dir=<enemyId>`。
- 13 種怪物各建立 8 個方向實例，共 104 個方向案例。
- 104/104 的 `direction`、`requestedKey` 與 `resolvedKey` 相符。
- 104/104 均為 `fallbackType=exact`、`hasSprite=true`、`approvedMove=true`、`flipX=false`。
- 每組 move animation 均可循環 frame `0-3`，沒有 partial direction 被啟用。
- 正式模式沒有 debug overlay，DOM broken image 為 0。
- Browser console 共檢查 56 筆 log；error、warning、404、decode failure 均為 0。
- 遊戲沒有讀取 `_incoming_move_regen`、`_masters` 或 archive 路徑。

## 視覺證據

- `screenshots/all-enemies-8dir-runtime-overview.png`
- `screenshots/all-enemies-8dir-runtime-debug.png`
- `screenshots/enemy-bottle_mite-8dir-runtime-debug.png`
- `screenshots/enemy-compactor_golem-8dir-runtime-normal.png`
- `screenshots/enemy-<enemyId>-8dir-generated-contact-sheet.png`
- `screenshots/enemy-<enemyId>-8dir-runtime-contact-sheet.png`（原四種怪物）

原始機器檢查資料：`tmp/enemy_runtime_audit.json`。
