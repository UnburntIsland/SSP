# QA Report

專案：`森循島：污染潮倖存者`

日期：2026-06-30

## 1. 測試環境

- OS：Windows
- Shell：PowerShell
- Node.js：v21.6.2
- npm：10.4.0
- Python：3.12.2
- Browser：Google Chrome `C:\Program Files\Google\Chrome\Application\chrome.exe`
- 測試框架：Playwright Test
- 測試伺服器：`python -m http.server 4173 --bind 127.0.0.1`

## 2. 測試方式

本輪先閱讀專案結構與所有核心模組，再新增 URL 參數測試模式與 Playwright E2E 測試。

主要入口與模組：

- `index.html`：靜態頁入口與畫面 DOM。
- `js/main.js`：App 啟動、畫面路由、角色選擇、商店與一局生命週期。
- `js/game.js`：關卡計時、敵人生成、碰撞、掉落、升級暫停、勝敗判定。
- `js/ui.js`：選單、角色、商店、圖鑑、HUD、升級與結算 DOM 繪製。
- `js/storage.js`：`localStorage` 存檔。
- `js/player.js` / `js/enemy.js` / `js/weapons.js` / `js/pickups.js`：玩家、敵人、技能與掉落物。
- `js/data/*.js`：角色、技能、敵人、商店、關卡與圖鑑資料。

## 3. 已測試項目

### A. 基礎啟動

- `index.html` 可以載入。
- 無 JavaScript console error。
- Canvas 正常存在並有有效尺寸。
- CSS 載入成功，主選單可見。

### B. 選單流程

- 主選單 → 角色選擇。
- 主選單 → 商店。
- 主選單 → 圖鑑。
- 角色、商店、圖鑑可返回主選單。
- 循環幣在主選單與商店中正確顯示。

### C. 角色選擇

- 三個角色都能顯示與被選擇。
- 角色資料正確顯示。
- 選角後可進入第一關。
- 被動差異已驗證：
  - 森林巡守員最大生命值較高。
  - 海岸淨灘者拾取範圍較大。
  - 太陽能工程師冷卻倍率較低。

### D. 第一關遊玩

- WASD 移動有效。
- 玩家會被限制在地圖邊界內。
- 敵人會生成。
- 自動攻擊可淨化近距離敵人。
- 敵人可掉落經驗。
- 玩家可拾取經驗並觸發升級。
- 升級畫面會暫停遊戲。
- 點選升級卡後遊戲恢復。

### E. 戰鬥與數值

- 測試模式可快速驗證勝利結算。
- 測試模式可快速驗證失敗結算。
- Boss 事件可在測試模式提前觸發並生成油污團塊。
- 技能冷卻與自動攻擊有基本作用。

### F. 商店與存檔

- 測試 helper 可授予循環幣。
- 商店購買會扣除循環幣。
- 商店升級寫入 `localStorage`。
- 重新整理後循環幣與商店升級仍保存。

### G. 圖鑑

- 知識卡可解鎖。
- 圖鑑可顯示已解鎖內容。
- 重新整理後圖鑑內容仍保存。

## 4. 發現的 bug

1. 首頁載入時 Chrome 會自動要求 `/favicon.ico`，靜態伺服器回 404，導致 console error。
2. 初版 E2E 戰鬥測試在加入邊界檢查後不穩定：測試把玩家放到地圖角落後，自動攻擊有機率先鎖定自然生成的遠處敵人，而不是人工放置的 1HP 測試敵人。

## 5. 已修復的 bug

1. 在 `index.html` 補上空 favicon：

   ```html
   <link rel="icon" href="data:," />
   ```

   目的：避免瀏覽器自動請求 `/favicon.ico` 造成 404 console error。

2. 穩定化 E2E 戰鬥測試：

   - 先確認自然生成敵人存在。
   - 再清空測試場敵人、投射物、掉落物。
   - 把玩家放回地圖中央。
   - 放置 1HP 近距離敵人。
   - 將武器冷卻歸零，專門驗證自動攻擊與 XP 掉落。

   目的：測試遊戲行為，而不是被隨機生成與尋敵順序干擾。

## 6. 尚未修復或後續建議

- 目前自動測試主要驗證流程與核心行為，尚未做長時間 5 分鐘正式模式壓力測試。
- 目前 Canvas 像素內容沒有做截圖像素比對；後續可加入基本 visual regression。
- 現有角色、敵人與 UI 仍以程式繪製 placeholder 為主，後續接入正式 PNG sprite sheet 時需要再跑一次視覺與碰撞測試。
- 手機尺寸有 CSS responsive，但本輪未完整測觸控與小螢幕 UI。

## 7. 如何執行遊戲

在專案根目錄執行：

```bash
python -m http.server 4173 --bind 127.0.0.1
```

正式模式：

```text
http://127.0.0.1:4173/index.html
```

測試模式：

```text
http://127.0.0.1:4173/index.html?test=1
```

## 8. 如何執行測試

第一次使用先安裝依賴：

```bash
npm install
```

執行 E2E：

```bash
npm run test:e2e
```

本輪最後一次測試結果：

```text
8 passed
```

## 9. 測試模式說明

使用 `?test=1` 啟用，不影響正式模式。

測試模式會：

- 將第一關時間縮短為 30 秒。
- 降低玩家升級 XP 需求。
- 提高結算循環幣倍率。
- 固定亂數種子，讓敵人生成可預測。
- 將 Boss 事件提前到第 20 秒。
- 暴露 `window.__TEST__` helper 供 E2E 使用。

正式模式驗證：

- `window.TestMode.enabled === false`
- `window.__TEST__ === undefined`
- 第一關時間維持 300 秒。

## 10. 下一輪開發建議

1. 接入正式角色、敵人、技能圖示 PNG 後，補上素材載入失敗 fallback 測試。
2. 加入正式 5 分鐘關卡的 soak test，觀察敵人數量接近上限時的 FPS 與記憶體。
3. 將碰撞與數值邏輯抽出更容易單元測試的小函式，但暫時不需要大重構。
4. 補手機/觸控模式測試，包含 HUD 不遮擋、升級卡片可點擊、畫面不溢出。
