/* ============================================================
   lobbyPlacement.js  —  大廳格線世界與建造擺放驗證
   - LobbyWorld：大廳尺寸、固定區域（傳送門/掛機區/工作台/出生點）、
     不可通行區（水域/樹林/固定建物）與格線工具。座標皆為 world px，
     格線 32x32。背景圖 1280x720 → 世界 1600x900（等比 1.25，不變形）。
   - LobbyPlacement：擺放驗證（邊界/重疊/保留區/水域/可達性 flood-fill/
     unique/材料），與玩家行走碰撞查詢。
   規則見 LOBBY_BUILDING_SYSTEM_PLAN.md 第 3、7 節。
   ============================================================ */
(function (global) {

  var CELL = 32;
  var W = 1600, H = 900;
  var COLS = Math.floor(W / CELL);          /* 50 */
  var ROWS = Math.floor(H / CELL);          /* 28（最後 4px 併入下邊界） */

  /* ---------------- 固定配置（對齊背景圖地景） ---------------- */
  var LobbyWorld = {
    CELL: CELL, W: W, H: H, COLS: COLS, ROWS: ROWS,
    /* 大廳鏡頭倍率（不影響戰鬥）。1.25 讓視野較廣；
       角色在大廳以 AVATAR_WORLD(=100 world px) 繪製，
       與背景圖中的門、樓梯、回收桶比例一致。 */
    ZOOM: 1.25,

    spawn: { x: 820, y: 500, direction: "S" },

    portal:    { x: 830, y: 205, interactRadius: 110, label: "行動傳送門" },
    workbench: { x: 470, y: 505, interactRadius: 105, label: "建造工作台" },
    /* 掛機回收區：站上去就開始累積（矩形判定） */
    idleZone:  { x: 1216, y: 448, w: 224, h: 160, label: "資源回收區" },

    /* 不可通行（水域 / 樹林 / 背景固定建物）。玩家與建築皆不可進入。 */
    blockedRects: [
      { x: 0,    y: 0,   w: 1600, h: 132, name: "上方樹林帶" },
      { x: 0,    y: 0,   w: 700,  h: 150, name: "上方樹林(左)" },
      { x: 975,  y: 0,   w: 625,  h: 150, name: "上方樹林(右)" },
      { x: 25,   y: 75,  w: 525,  h: 280, name: "左側工坊平台" },
      { x: 25,   y: 355, w: 350,  h: 195, name: "左側平台下段" },
      { x: 0,    y: 560, w: 470,  h: 340, name: "左下水域與棧橋" },
      { x: 1010, y: 130, w: 590,  h: 200, name: "右側水塔平台" },
      { x: 1150, y: 330, w: 450,  h: 110, name: "右側菜園平台" },
      { x: 1520, y: 0,   w: 80,   h: 900, name: "右側海面" },
      { x: 1470, y: 380, w: 130,  h: 520, name: "右下海灣" },
      { x: 1150, y: 760, w: 450,  h: 140, name: "右下海灘水線" },
      { x: 0,    y: 840, w: 1600, h: 60,  name: "下方叢林邊界" },
      { x: 540,  y: 620, w: 250,  h: 150, name: "紅樹林矮叢" },
      { x: 870,  y: 630, w: 140,  h: 90,  name: "中央灌木" }
    ],

    /* 可建造範圍（再扣掉 blocked 與 fixed 保留區） */
    buildArea: { x: 96, y: 160, w: 1408, h: 680 },

    /* 建造保留區：出生點 5x5、傳送門、工作台、掛機區（含出入口緩衝） */
    reservedRects: [
      { x: 736,  y: 416, w: 160, h: 160, name: "出生點安全區" },
      { x: 736,  y: 64,  w: 192, h: 224, name: "傳送門保留區" },
      { x: 416,  y: 416, w: 192, h: 192, name: "工作台保留區" },
      { x: 1184, y: 416, w: 288, h: 224, name: "掛機回收區" }
    ],

    /* flood-fill 檢查目標：出生點必須永遠走得到這些位置 */
    reachTargets: function () {
      return [
        { x: this.portal.x, y: this.portal.y + 62, name: "傳送門" },
        { x: this.workbench.x + 30, y: this.workbench.y, name: "工作台" },
        { x: this.idleZone.x + 16, y: this.idleZone.y + this.idleZone.h / 2, name: "掛機回收區" }
      ];
    },

    toCell: function (wx, wy) {
      return { cx: Math.floor(wx / CELL), cy: Math.floor(wy / CELL) };
    },
    cellCenter: function (cx, cy) {
      return { x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 };
    },
    inBounds: function (cx, cy) {
      return cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS;
    },

    /* 靜態阻擋格（以格心是否落在 blockedRect 內判定；邊界外一律阻擋） */
    _staticGrid: null,
    staticBlocked: function (cx, cy) {
      if (!this.inBounds(cx, cy)) return true;
      if (!this._staticGrid) this._buildStaticGrid();
      return this._staticGrid[cy * COLS + cx];
    },
    _buildStaticGrid: function () {
      var grid = new Array(COLS * ROWS);
      for (var cy = 0; cy < ROWS; cy++) {
        for (var cx = 0; cx < COLS; cx++) {
          var c = this.cellCenter(cx, cy);
          grid[cy * COLS + cx] = this.blockedRects.some(function (r) {
            return c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h;
          });
        }
      }
      this._staticGrid = grid;
    },

    pointInRect: function (x, y, r) {
      return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    },
    inIdleZone: function (x, y) {
      return this.pointInRect(x, y, this.idleZone);
    }
  };

  /* ---------------- 擺放與碰撞 ---------------- */
  var LobbyPlacement = {

    /* footprint 旋轉後的格數（90/270 度交換寬高；圖片第一版不旋轉） */
    footprintSize: function (def, rotation) {
      var w = def.footprint.w, h = def.footprint.h;
      if (rotation === 90 || rotation === 270) return { w: h, h: w };
      return { w: w, h: h };
    },

    /* 建築實例目前佔用的世界矩形（x/y 為 footprint 左上角 world px） */
    instanceRect: function (inst, def) {
      var size = this.footprintSize(def, inst.rotation);
      return { x: inst.x, y: inst.y, w: size.w * CELL, h: size.h * CELL };
    },

    /* 目前所有已放置建築；excludeId 用於「移動中」略過自己 */
    placedInstances: function (excludeId) {
      var lobby = global.Storage.getLobby();
      return lobby.buildings.filter(function (b) {
        return b.placed !== false && b.instanceId !== excludeId;
      });
    },

    /* 玩家行走阻擋：靜態 rect + collision 建築 rect */
    collisionRects: function () {
      var rects = LobbyWorld.blockedRects.slice();
      var self = this;
      this.placedInstances(null).forEach(function (inst) {
        var def = global.GameData.getLobbyBuilding(inst.buildingId);
        if (def && def.collision) rects.push(self.instanceRect(inst, def));
      });
      return rects;
    },

    /* 圓形（玩家）對矩形群碰撞：分軸解算，回傳修正後座標 */
    resolveCircle: function (x, y, prevX, prevY, radius, rects) {
      /* X 軸 */
      var nx = x;
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (prevY + radius > r.y && prevY - radius < r.y + r.h) {
          if (nx + radius > r.x && nx - radius < r.x + r.w) {
            nx = (prevX < r.x + r.w / 2) ? r.x - radius : r.x + r.w + radius;
          }
        }
      }
      /* Y 軸 */
      var ny = y;
      for (var j = 0; j < rects.length; j++) {
        var q = rects[j];
        if (nx + radius > q.x && nx - radius < q.x + q.w) {
          if (ny + radius > q.y && ny - radius < q.y + q.h) {
            ny = (prevY < q.y + q.h / 2) ? q.y - radius : q.y + q.h + radius;
          }
        }
      }
      nx = Math.max(radius, Math.min(LobbyWorld.W - radius, nx));
      ny = Math.max(radius, Math.min(LobbyWorld.H - radius, ny));
      return { x: nx, y: ny };
    },

    /* 候選 footprint 佔用的格清單 */
    footprintCells: function (def, rotation, cellX, cellY) {
      var size = this.footprintSize(def, rotation);
      var cells = [];
      for (var dy = 0; dy < size.h; dy++) {
        for (var dx = 0; dx < size.w; dx++) {
          cells.push({ cx: cellX + dx, cy: cellY + dy });
        }
      }
      return cells;
    },

    /* ------------------------------------------------------------
       擺放驗證（計畫 §7 的 7 條規則）
       options: { def, rotation, cellX, cellY, excludeInstanceId,
                  playerX, playerY, mode:"buy"|"inventory"|"move" }
       回傳 { ok, reasons:[文字] }
       ------------------------------------------------------------ */
    validate: function (options) {
      var def = options.def;
      var reasons = [];
      var cells = this.footprintCells(def, options.rotation, options.cellX, options.cellY);
      var size = this.footprintSize(def, options.rotation);
      var rect = { x: options.cellX * CELL, y: options.cellY * CELL, w: size.w * CELL, h: size.h * CELL };
      var self = this;

      /* 1) 必須完整位於可建造區 */
      var area = LobbyWorld.buildArea;
      if (rect.x < area.x || rect.y < area.y ||
          rect.x + rect.w > area.x + area.w || rect.y + rect.h > area.y + area.h) {
        reasons.push("超出可建造範圍");
      }

      /* 4) 不可壓到水域 / 樹林 / 固定建物 */
      var hitsStatic = cells.some(function (c) { return LobbyWorld.staticBlocked(c.cx, c.cy); });
      if (hitsStatic) reasons.push("不能蓋在水域或固定地形上");

      /* 3) 不可壓到傳送門 / 掛機區 / 工作台 / 出生點保留區 */
      var hitsReserved = LobbyWorld.reservedRects.some(function (r) {
        return rect.x < r.x + r.w && rect.x + rect.w > r.x && rect.y < r.y + r.h && rect.y + rect.h > r.y;
      });
      if (hitsReserved) reasons.push("此處保留給重要設施");

      /* 2) 不可與其他建築 footprint 重疊（不論是否純視覺） */
      var overlap = this.placedInstances(options.excludeInstanceId).some(function (inst) {
        var otherDef = global.GameData.getLobbyBuilding(inst.buildingId);
        if (!otherDef) return false;
        var o = self.instanceRect(inst, otherDef);
        return rect.x < o.x + o.w && rect.x + rect.w > o.x && rect.y < o.y + o.h && rect.y + rect.h > o.y;
      });
      if (overlap) reasons.push("與其他建築重疊");

      /* 會把角色壓在裡面的碰撞建築不可放 */
      if (def.collision && options.playerX != null) {
        var pr = 14;
        if (options.playerX + pr > rect.x && options.playerX - pr < rect.x + rect.w &&
            options.playerY + pr > rect.y && options.playerY - pr < rect.y + rect.h) {
          reasons.push("不能蓋在角色站的位置");
        }
      }

      /* 6) 功能建築 unique */
      if (def.unique && options.mode === "buy" && global.Storage.countLobbyBuilding(def.id) > 0) {
        reasons.push("這種功能建築已經擁有");
      }

      /* 7) 材料 / 庫存 */
      if (options.mode === "buy") {
        var cost = (def.cost && def.cost.recycled) | 0;
        var have = global.Storage.getRecycled();
        if (have < cost) reasons.push("再生材料不足（還差 " + (cost - have) + "）");
      } else if (options.mode === "inventory") {
        if (global.Storage.getLobbyInventoryCount(def.id) <= 0) reasons.push("庫存中沒有這個物件");
      }

      /* 5) 可達性：放置後出生點仍要能走到傳送門 / 掛機區 / 工作台。
            只有會阻擋行走的建築需要檢查（純視覺裝飾不影響通行）。 */
      if (def.collision && reasons.length === 0) {
        var blockedNames = this.checkReachability(cells, options.excludeInstanceId);
        if (blockedNames.length) reasons.push("會堵住通往" + blockedNames.join("、") + "的路");
      }

      return { ok: reasons.length === 0, reasons: reasons };
    },

    /* flood-fill（BFS）：回傳被堵住的目標名稱陣列（空陣列 = 全部可達） */
    checkReachability: function (candidateCells, excludeInstanceId) {
      var blockedExtra = {};
      candidateCells.forEach(function (c) { blockedExtra[c.cx + "," + c.cy] = true; });
      var self = this;
      this.placedInstances(excludeInstanceId).forEach(function (inst) {
        var def = global.GameData.getLobbyBuilding(inst.buildingId);
        if (!def || !def.collision) return;
        var cell = LobbyWorld.toCell(inst.x + 1, inst.y + 1);
        self.footprintCells(def, inst.rotation, cell.cx, cell.cy).forEach(function (c) {
          blockedExtra[c.cx + "," + c.cy] = true;
        });
      });

      function walkable(cx, cy) {
        if (!LobbyWorld.inBounds(cx, cy)) return false;
        if (LobbyWorld.staticBlocked(cx, cy)) return false;
        return !blockedExtra[cx + "," + cy];
      }

      var start = LobbyWorld.toCell(LobbyWorld.spawn.x, LobbyWorld.spawn.y);
      if (!walkable(start.cx, start.cy)) return ["出生點"];

      var visited = {};
      var queue = [start];
      visited[start.cx + "," + start.cy] = true;
      while (queue.length) {
        var cur = queue.shift();
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var nx = cur.cx + d[0], ny = cur.cy + d[1];
          var key = nx + "," + ny;
          if (visited[key] || !walkable(nx, ny)) return;
          visited[key] = true;
          queue.push({ cx: nx, cy: ny });
        });
      }

      var unreachable = [];
      LobbyWorld.reachTargets().forEach(function (target) {
        var cell = LobbyWorld.toCell(target.x, target.y);
        /* 目標格本身或其相鄰格任一可達即算通 */
        var candidates = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
        var reached = candidates.some(function (d) {
          return visited[(cell.cx + d[0]) + "," + (cell.cy + d[1])];
        });
        if (!reached) unreachable.push(target.name);
      });
      return unreachable;
    }
  };

  global.LobbyWorld = LobbyWorld;
  global.LobbyPlacement = LobbyPlacement;
})(window);
