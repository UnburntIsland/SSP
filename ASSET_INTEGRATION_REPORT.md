# 場景、大廳與音訊素材整合報告

日期：2026-07-26

## 總結

本輪補齊三個戰鬥關卡的正式地圖磚，將既有 GPT-image 大廳素材接回
runtime，並新增可實際播放的大廳／戰鬥 BGM 與必要事件音效。遊戲邏輯、
傷害、碰撞、角色方向與關卡數值均未修改。

## 戰鬥場景

### 潮間帶

- `assets/images/tiles/beach_sand_01.png`
- `assets/images/tiles/beach_sand_02.png`
- `assets/images/tiles/beach_sand_03.png`
- `assets/images/tiles/tide_pool_01.png`
- `assets/images/tiles/shoreline_01.png`
- `assets/images/tiles/ocean_water_01.png`

### 回收工廠

- `assets/images/tiles/factory_floor_01.png`
- `assets/images/tiles/conveyor_01.png`
- `assets/images/tiles/recycle_pad_01.png`

### 黑水處理廠

- `assets/images/tiles/blackwater_platform_01.png`
- `assets/images/tiles/oil_channel_01.png`
- `assets/images/tiles/hazard_deck_01.png`

以上素材已註冊於 `js/assets.js`，並由 `js/stageRenderer.js` 依關卡配置繪製。
潮間帶沙地使用固定底圖與低透明度變體混合，避免不同 tile 形成棋盤格。

## 大廳素材

`js/lobby.js` 與 `js/data/lobbyBuildings.js` 已改用
`assets/images/lobby/LOBBY_ASSET_MANIFEST.json` 中實際存在的路徑：

- 大廳底圖：`ground/lobby_map.png`
- 傳送門：`portal/portal_idle_0.png` 與動畫幀
- 工作台：`stations/construction_workbench/idle_0.png`
- 掛機回收區：`stations/recycling_idle_zone/idle_0.png` 與動畫幀
- 材料／建造 UI：`ui/recycled_material.png`、`ui/build_mode.png`
- 建築：統一使用各資料夾的 `idle_0.png`

已修正 `recycling_bench`、`solar_streetlight`、`eco_sign` 三個資料夾名稱。
大廳 manifest 共 26 張圖片，HTTP 驗證為 26/26 成功。

## 音訊

### BGM

- `assets/audio/bgm_lobby.wav`
- `assets/audio/bgm_stage.wav`

### 音效

- `ui_click.wav`
- `pickup.wav`
- `levelup.wav`
- `purify.wav`
- `hurt.wav`
- `quiz_correct.wav`
- `quiz_wrong.wav`
- `boss_intro.wav`
- `victory.wav`

`js/audioManager.js` 已註冊以上檔案，並在第一次指標或鍵盤操作時解除瀏覽器
自動播放限制。事件接點位於 `js/main.js` 與 `js/game.js`；音量、靜音與設定
儲存沿用原本介面。

音訊可由 `tools/generate_audio_assets.mjs` 重建。所有檔案皆驗證為合法
RIFF/WAVE，HTTP 請求 11/11 成功。

## 驗證結果

- 主要修改 JavaScript 以 UTF-8 讀取後通過語法檢查。
- 三關地圖磚共 12/12 回傳 HTTP 200。
- 大廳 manifest 圖片共 26/26 回傳 HTTP 200。
- 音訊共 11/11 回傳 HTTP 200。
- 地圖拾取物代表圖共 4/4 回傳 HTTP 200。
- 首頁、大廳與三個戰鬥場景的瀏覽器 console 無 error／warning。
- 正式畫面使用世界層場景圖片；沒有讀取 archive 路徑。

## 視覺驗證

- `screenshots/stage-tile-contact-sheet.png`
- `screenshots/asset-integration-lobby.png`
- `screenshots/asset-integration-tidal-flat.png`
- `screenshots/asset-integration-recycle-works.png`
- `screenshots/asset-integration-blackwater-plant.png`

## 保留的 fallback

圖片載入失敗時仍保留原 Canvas fallback，避免單一素材故障使遊戲無法遊玩。
音訊播放失敗不會中斷遊戲流程。
