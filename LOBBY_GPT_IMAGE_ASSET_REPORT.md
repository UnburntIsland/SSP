# 大廳 GPT-image 素材報告

## 產出狀態

- 生成方式：Codex 內建 GPT-image。
- 透明素材處理：平面洋紅 chroma-key，再以官方 `remove_chroma_key.py` 去背。
- Runtime 圖片：26 張。
- 大廳背景：1 張，`1600x1000`。
- 透明 PNG：25 張。
- 所有透明圖片四角 alpha 均為 0。
- 所有圖片均已解碼並完成 non-transparent bounding box 檢查。

## 素材清單

### 大廳地圖

- `assets/images/lobby/ground/lobby_map.png`

### 行動傳送門

- `assets/images/lobby/portal/portal_idle_0.png`
- `assets/images/lobby/portal/portal_idle_1.png`
- `assets/images/lobby/portal/portal_idle_2.png`
- `assets/images/lobby/portal/portal_idle_3.png`
- `assets/images/lobby/portal/portal_idle_4.png`
- `assets/images/lobby/portal/portal_idle_5.png`

### 掛機回收區

- `assets/images/lobby/stations/recycling_idle_zone/idle_0.png`
- `assets/images/lobby/stations/recycling_idle_zone/idle_1.png`
- `assets/images/lobby/stations/recycling_idle_zone/idle_2.png`
- `assets/images/lobby/stations/recycling_idle_zone/idle_3.png`

### 建造工作台

- `assets/images/lobby/stations/construction_workbench/idle_0.png`

### 功能建築

- `assets/images/lobby/buildings/solar_workshop/idle_0.png`
- `assets/images/lobby/buildings/rain_garden/idle_0.png`
- `assets/images/lobby/buildings/wind_station/idle_0.png`
- `assets/images/lobby/buildings/recycle_guard/idle_0.png`

### 裝飾

- `assets/images/lobby/decorations/small_tree/idle_0.png`
- `assets/images/lobby/decorations/flower_bed/idle_0.png`
- `assets/images/lobby/decorations/recycling_bench/idle_0.png`
- `assets/images/lobby/decorations/solar_streetlight/idle_0.png`
- `assets/images/lobby/decorations/sorting_bins/idle_0.png`
- `assets/images/lobby/decorations/rain_barrel/idle_0.png`
- `assets/images/lobby/decorations/eco_sign/idle_0.png`
- `assets/images/lobby/decorations/eco_pond/idle_0.png`

### UI 與物品

- `assets/images/lobby/ui/recycled_material.png`
- `assets/images/lobby/ui/build_mode.png`

## 尺寸規格

| 類別 | Canvas |
|---|---:|
| 大廳背景 | 1600x1000 |
| 傳送門 | 320x320 |
| 掛機回收區 | 320x320 |
| 建造工作台 | 256x256 |
| 功能建築 | 384x384 |
| 裝飾 | 256x256 |
| UI icon | 96x96 |

所有同類動畫幀使用相同 canvas、水平中心與底部 anchor。程式可依 world footprint 縮放顯示，不應以 PNG canvas 大小直接作為碰撞箱。

## Prompt 規格摘要

所有 prompt 共用：

- polished 2D pixel art
- top-down / 3/4 camera
- sustainable eco-adventure
- match existing lobby pixel density and palette
- readable beside a 72px character
- no character, scene, UI, text, label, or watermark
- placeable objects use a flat `#ff00ff` chroma-key background
- centered subject, generous padding, fixed bottom anchor

個別主題：

- 大廳：海岸生態科技聚落、中央大面積可建造區、固定通道與三個設施預留平台。
- 傳送門：回收金屬拱門、太陽能板、青色能源環，6 幀循環。
- 掛機站：回收分類平台、太陽能供電、材料吸入與處理，4 幀循環。
- 太陽能工坊：太陽能板屋頂、工具與儲能設備。
- 雨水花園：雨水槽、原生濕地植物與過濾水道。
- 微型風力站：三葉風機、控制櫃與回收金屬基座。
- 循環防護站：青色防護線圈、回收核心與太陽能供電。
- 裝飾：原生小樹、花圃、回收長椅、太陽能路燈、分類桶、雨水桶、生態告示牌、小型生態池。
- UI：再生材料組合物與建造工具。

## QA 檔案

- `assets/images/lobby/LOBBY_ASSET_QA.json`
- `assets/images/lobby/LOBBY_ASSET_MANIFEST.json`
- `screenshots/lobby-gpt-assets-contact-sheet.png`
- `screenshots/lobby-gpt-animation-frames.png`
- `prompts/generated_lobby_prompts/lobby_asset_prompt_pack.md`

## 接入提醒

- 本輪只建立並整理圖片素材，尚未修改大廳程式。
- 傳送門建議 8 FPS loop。
- 掛機回收區建議 5 FPS loop。
- 功能建築與裝飾使用圖片底部中心作 world anchor。
- 碰撞與建造重疊判定應使用資料中的 footprint，不應使用透明 PNG bbox。
