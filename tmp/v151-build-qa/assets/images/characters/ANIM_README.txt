8 方向角色動畫幀放這裡（每個角色一個資料夾）：
  ranger/  beachcomber/  solar_engineer/  circular_mechanic/  eco_chemist/
每個資料夾內的檔名規則（對照 characters.js 的 animationSet）：
  idle_<DIR>_0.png                         （待機，每方向 1 幀）
  walk_<DIR>_0.png ~ walk_<DIR>_3.png      （移動，每方向 4 幀）
<DIR> = N, NE, E, SE, S, SW, W, NW（共 8 方向）。
缺任何幀都不會報錯：walk 缺 → 該方向 idle → S idle → E idle → 原本靜態圖/placeholder。

生態藥劑師（eco_chemist）與其三款 Skin 均使用 192×192 runtime 幀，
每套完整包含 8 張 idle 與 32 張 walk，共 40 張；來源表與透明 master
分別保存在 characters/_masters/ 與 characters/skins/_masters/。
