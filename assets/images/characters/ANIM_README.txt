8 方向角色動畫幀放這裡（每個角色一個資料夾）：
  ranger/  beachcomber/  solar_engineer/
每個資料夾內的檔名規則（對照 characters.js 的 animationSet）：
  idle_<DIR>_0.png                         （待機，每方向 1 幀）
  walk_<DIR>_0.png ~ walk_<DIR>_3.png      （移動，每方向 4 幀）
<DIR> = N, NE, E, SE, S, SW, W, NW（共 8 方向）。
缺任何幀都不會報錯：walk 缺 → 該方向 idle → S idle → E idle → 原本靜態圖/placeholder。
