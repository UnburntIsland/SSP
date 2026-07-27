# 永續守護行動

以台灣環境議題為主題的 Web Canvas 2D 動作 Roguelite。玩家從可互動大廳進入關卡，在自動攻擊、永續問答與角色成長之間完成淨化任務。

## 快速啟動

需求：

- Node.js 18 以上
- Chrome、Chromium 或 Microsoft Edge
- 不要用 `file://` 驗證素材；瀏覽器對本機檔案的載入限制與正式 HTTP 環境不同

啟動本地伺服器：

```powershell
npm run serve
```

開啟：

```text
http://127.0.0.1:4173/
```

也可指定連接埠：

```powershell
$env:PORT=8080
npm run serve
```

## 操作方式

### 大廳

- `WASD`／方向鍵：移動
- `E`：與傳送門、工作台或回收區互動
- 手機／平板：拖曳畫面移動，點擊畫面上的互動提示
- 走入傳送門後選擇台灣地圖關卡，再按「開始遊戲」

### 戰鬥

- `WASD`／方向鍵：八方向移動
- 攻擊會自動進行
- `Space`／`Shift`：衝刺
- `Esc`／`P`：暫停或返回
- 升級與永續問答可用滑鼠、觸控或數字鍵 `1`～`3` 選擇

### 關卡條件

- 海廢潮間帶：存活 5 分鐘並擊敗 Boss
- 失控回收工廠：存活 8 分鐘並擊敗前一關後解鎖
- 黑水能源站：存活 12 分鐘並擊敗前一關後解鎖

## 測試參數

參數可組合，例如：

```text
index.html?test=1&duration=20&qaSkipIntro=1&debugAnimation=1
```

| 參數 | 用途 |
| --- | --- |
| `test=1` | 啟用固定亂數、短關卡與 `window.__TEST__` QA API |
| `duration=<秒>` | 測試模式第一關長度，預設 30 秒 |
| `seed=<數字>` | 固定測試亂數種子 |
| `stage=<stageId>` | 指定測試關卡 |
| `character=<id>` | 指定已擁有的測試角色 |
| `qaSkipIntro=1` | 自動跳過戰鬥開場倒數 |
| `qaPortal=1` | 載入後直接顯示台灣關卡地圖 |
| `qaUnlockStages=1` | 測試時解鎖全部關卡 |
| `qaLevelUp=1` | 進入戰鬥後觸發一次問答與升級 |
| `qaDefeat=1` | 進入戰鬥後快速觸發失敗 |
| `qaClearStage=1` | 快速完成目前關卡與 Boss 條件 |
| `qaMove=N\|NE\|E\|SE\|S\|SW\|W\|NW` | 固定玩家移動方向 |
| `forceMobile=1` | 在桌面瀏覽器強制啟用觸控版面 |
| `debugAnimation=1` | 顯示角色與敵人動畫 resolver 資訊 |
| `debugUI=1` | 顯示 UI 與 Canvas 版面偵錯資訊 |
| `debugLayout=1` | 顯示手機縮放、可視範圍與指標換算 |
| `taiwanMap=0` | 僅供回歸測試的舊關卡選擇器；正式預設為台灣地圖 |

更多情境參數集中在 [`js/test_mode.js`](js/test_mode.js)。

## 自動化冒煙測試

執行：

```powershell
npm run test:smoke
```

測試器會自動啟動臨時 HTTP server 與無介面 Chrome／Edge，涵蓋：

1. 大廳 → 傳送門 → 戰鬥
2. 永續答題 → 升級 → 勝利
3. 失敗 → 重試
4. 存檔重設
5. 大廳底圖尺寸、固定裝置可達性與舊座標遷移
6. 設定／成就頁停留期間持續取得掛機材料
7. 關卡鎖定與擊敗 Boss 後解鎖
8. 手機 390×844 直向與 844×390 橫向版面

成功或失敗結果會寫入：

```text
output/smoke-test-results.json
```

若失敗，對應畫面會輸出至：

```text
output/smoke-failures/
```

自訂瀏覽器：

```powershell
$env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
npm run test:smoke
```

GitHub Actions 會在 push 與 pull request 時執行相同 smoke suite。

最近一次本機驗證結果見 [`SMOKE_TEST_REPORT.md`](SMOKE_TEST_REPORT.md)。

## 素材規格

所有 runtime 檔名皆區分大小寫。Windows 可載入不代表 GitHub Pages 或 Linux 伺服器也能載入。

### 角色

位置：`assets/images/characters/<animationId>/`

- 待機：`idle_<DIR>_0.png`
- 走路：`walk_<DIR>_0.png`～`walk_<DIR>_3.png`
- 方向：`N`、`NE`、`E`、`SE`、`S`、`SW`、`W`、`NW`
- 透明 PNG、同畫布尺寸、同角色比例、固定中心與腳底 baseline
- 角色 id 與資料夾可不同，例如 `solar` 使用 `solar_engineer`

### 敵人

位置：`assets/images/enemies/<enemyId>/`

- 移動：`move_<DIR>_0.png`～`move_<DIR>_3.png`
- 同方向必須四幀完整，否則 resolver 使用既有 fallback
- 透明背景、固定視覺中心，不可混入 contact sheet 或預覽圖

### 技能特效

位置：`assets/images/effects/<skillId>/`

- 完整幀組通過 QA 後才可放入 runtime
- 圖片只負責視覺；傷害、冷卻、碰撞與範圍仍由程式資料控制
- 缺幀時保留 Canvas fallback

### 地圖與音訊

- 地圖磚：`assets/images/tiles/`
- 地圖物件：`assets/images/props/`
- 大廳素材：`assets/images/lobby/`
- BGM／SFX：`assets/audio/`
- 新增或改名後須同步更新 `js/assets.js`、對應 manifest 與版本參數

## 存檔

- localStorage key：`senloop_save_v1`
- 正式重設：大廳 → 設定 → 重置存檔
- 測試重設：`window.__TEST__.resetSave()`，僅在 `?test=1` 可用
- 修改 schema 時必須保留舊存檔遷移，並重新執行關卡鎖定、角色選擇與圖鑑測試

## 已知限制

- 專案是純靜態網站，存檔只存在目前瀏覽器的 localStorage，尚未跨裝置同步。
- 手機以 1280×720 遊戲舞台縮放；直向可操作，但戰鬥建議使用橫向。
- 圖片與音訊載入失敗時部分系統會使用 Canvas fallback；新增素材後仍須檢查 Network 404。
- 測試模式會縮短關卡並調整生成節奏，不可用來判斷正式平衡數值。
- 自動化測試需要本機可執行的 Chrome、Chromium 或 Edge。

## 專案結構

```text
assets/       圖片、音訊與 runtime 素材
css/          版面與響應式樣式
js/           遊戲資料、引擎、UI、存檔與測試模式
tests/        自動化冒煙測試
tools/        本地靜態伺服器與素材處理工具
screenshots/  人工與視覺 QA 證據
output/       測試輸出
```
