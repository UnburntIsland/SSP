# 台灣區域地圖 Phase 1 QA

日期：2026-07-26

## 範圍

- 新增台灣北、中、南、東四區的選關資料。
- 北、中、南沿用現有 `tidal_flat`、`recycle_works`、`blackwater_plant`，不改 stage id 或存檔結構。
- 東部只在測試地圖顯示為非互動規劃節點；`east_valley` 留到 Phase 4 完整製作。
- 正式入口維持原本 carousel。只有 `?taiwanMap=1` 顯示台灣地圖。
- 未修改 input mapping、`getDirectionFromVector()`、戰鬥、角色或敵人邏輯。

## GPT-image 素材

- Runtime：`assets/images/maps/taiwan_overview/taiwan_region_map.png`
- 尺寸：1024 x 1536
- 內容：無文字、無 UI 的台灣直式像素地圖；北部城市河口、中部濕地與循環產業、南部熱帶海岸、東部山海。
- Cache key：`?v=taiwan-map-1`

## 功能驗證

| 項目 | 結果 |
| --- | --- |
| `taiwanRegions.js`、`main.js`、`test_mode.js` 語法 | PASS |
| 北部節點同步第一關 | PASS |
| 中部節點同步第二關 | PASS |
| 南部節點同步第三關 | PASS |
| 東部節點不可啟動 | PASS |
| 左右按鈕同步 active map node | PASS |
| 地圖節點方向鍵切換 | PASS |
| 中部開始遊戲進入 8 分鐘第二關 | PASS |
| `taiwanMap` 未啟用時地圖隱藏 | PASS |
| 未啟用時標題恢復「行動傳送門」 | PASS |
| 瀏覽器 console error / warning | 0 |
| 台灣地圖請求 | HTTP 200 / 304 |

## 響應式驗證

| Viewport | 模式 | 結果 | 截圖 |
| --- | --- | --- | --- |
| 1440 x 900 | 桌機 | PASS | `screenshots/taiwan-map-phase1-desktop.png` |
| 820 x 1180 | 觸控平板直向 | PASS | `screenshots/taiwan-map-phase1-tablet.png` |
| 390 x 844 | 觸控手機直向 | PASS | `screenshots/taiwan-map-phase1-mobile.png` |
| 844 x 390 | 觸控手機橫向 | PASS | `screenshots/taiwan-map-phase1-mobile-landscape.png` |
| 1440 x 900 | 無地圖旗標回歸 | PASS | `screenshots/taiwan-map-phase1-no-flag-regression.png` |

直向觸控版使用單欄配置；橫向短螢幕使用可見舞台 inset，避免 16:9 cover 模式裁掉標題與操作列。

## 測試入口

- 台灣地圖：`index.html?test=1&taiwanMap=1&qaUnlockStages=1&qaPortal=1`
- 原選關回歸：`index.html?test=1&qaUnlockStages=1&qaPortal=1`
- `qaPortal=1` 只在 `test=1` 時直接開啟傳送門，方便自動 QA，不影響正式流程。

## 已知既有缺圖

本地 server 仍記錄到既有 Canvas fallback 資產 404，例如部分 `assets/images/tiles/` 與尚未生成的 `assets/images/lobby/` 建築或裝飾。台灣地圖、三張關卡卡與本輪新增 JS 均成功載入；本輪沒有新增 404。

## 下一階段

Phase 2 僅實作台灣藍鵲守護夥伴垂直切片：Boss 解鎖、存檔遷移、裝備、跟隨、攻擊與 Canvas fallback。素材仍須先 incoming、QA，再進 runtime。
