# 全怪物 8 方向動畫 Promotion Report

## 本次接入

新生成並 promote：

- `bottle_mite`
- `foam_crab`
- `ghost_net`
- `scrap_drone`
- `can_crusher`
- `compactor_golem`
- `oil_slickling`
- `smog_drone`
- `ash_wisp`

保留既有完整 GPT-image move，並補齊 8 方向 idle：

- `plastic_bag`
- `butt_bug`
- `battery_slime`
- `oil_blob`

## 檔案數

- 新 promote：360 張（9 種 x 40 張）。
- 原四種新增 idle：32 張。
- Runtime 總數：520 張。
- Runtime 容量：約 15.15 MB。

每隻怪物的 runtime 格式：

```text
assets/images/enemies/<enemyId>/
  idle_N_0.png ... idle_NW_0.png
  move_N_0.png ... move_NW_3.png
```

## 安全措施

- 未永久刪除舊圖。
- 唯一被覆蓋的舊檔 `plastic_bag/idle_S_0.png` 已備份至：
  `assets/_archive_unused/20260711_2351/images/enemies/plastic_bag/idle_S_0.png`
- Incoming 母版與 normalized frames 均保留。
- 完整對應記錄：`ENEMY_8DIR_PROMOTION_MANIFEST.json`。

## 程式接入

- 13 種怪物皆建立 `spriteBasePath` 與完整 `animationSet`。
- 原本 `runtimeAnimated: false` 的 9 種怪物已啟用動畫。
- Cache version：`enemy_8dir_20260711a`。
- Resolver 仍要求同方向四幀完整才視為 `approvedMove=true`。
- 圖片缺失或載入失敗時仍回到既有 Canvas fallback，不影響 AI、碰撞、傷害或戰鬥數值。
