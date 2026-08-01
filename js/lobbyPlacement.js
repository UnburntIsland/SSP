/* ============================================================
   lobbyPlacement.js  —  大廳格線世界與建造擺放驗證
   - LobbyWorld：大廳尺寸、固定區域（傳送門/掛機區/工作台/出生點）、
     不可通行區（水域/樹林/固定建物）與格線工具。座標皆為 world px，
     格線 32x32。背景圖與世界皆為 1600x1000，固定裝置不再受縮放變形。
   - LobbyPlacement：擺放驗證（邊界/重疊/保留區/水域/可達性 flood-fill/
     unique/材料），與玩家行走碰撞查詢。
   規則見 LOBBY_BUILDING_SYSTEM_PLAN.md 第 3、7 節。
   ============================================================ */
(function (global) {

  var CELL = 32;
  var W = 1600, H = 1000;
  var COLS = Math.floor(W / CELL);          /* 50 */
  var ROWS = Math.floor(H / CELL);          /* 31（最後 8px 併入下邊界） */

  /* ---------------- 固定配置（對齊背景圖地景） ---------------- */
  var LobbyWorld = {
    CELL: CELL, W: W, H: H, COLS: COLS, ROWS: ROWS,
    /* 大廳鏡頭倍率（不影響戰鬥）。1.25 讓視野較廣；
       角色在大廳以 AVATAR_WORLD(=100 world px) 繪製，
       與背景圖中的門、樓梯、回收桶比例一致。 */
    ZOOM: 1.25,

    spawn: { x: 820, y: 556, direction: "S" },

    portal:    { x: 800, y: 40, interactRadius: 110, label: "行動傳送門" },
    workbench: { x: 300, y: 448, interactRadius: 105, label: "建造工作台" },
    /* 掛機回收區：站上去就開始累積（矩形判定） */
    idleZone:  { x: 1196, y: 379, w: 224, h: 178, label: "資源回收區" },

    /*
     * 可行走輪廓直接沿著 lobby_map.png 的草地、沙地與橋面描繪。
     * 舊版使用大型矩形排除水域，會同時留下可走進河裡的缺口，
     * 也會誤擋中央空地。多邊形聯集讓海岸、石牆與回收平台貼合底圖。
     */
    walkablePolygons: [
      {
        name: "main-clearing",
        points: [
          [385, 247], [455, 238], [520, 246], [580, 242],
          [635, 226], [690, 228], [718, 240], [882, 240],
          [915, 235], [975, 242], [1035, 255], [1090, 278],
          [1125, 305], [1147, 337], [1151, 373], [1141, 408],
          [1119, 444], [1105, 477], [1122, 509], [1160, 543],
          [1208, 570], [1260, 596], [1312, 624], [1355, 659],
          [1378, 696], [1372, 727], [1347, 754], [1308, 767],
          [1258, 760], [1205, 746], [1153, 735], [1100, 733],
          [1060, 750], [1018, 779], [979, 813], [938, 831],
          [895, 829], [852, 812], [812, 806], [770, 809],
          [727, 815], [683, 822], [637, 817], [590, 805],
          [543, 788], [494, 769], [449, 748], [410, 719],
          [378, 685], [350, 647], [321, 614], [286, 588],
          [250, 570], [226, 546], [216, 518], [224, 486],
          [242, 452], [265, 422], [291, 389], [318, 351],
          [344, 314], [371, 278]
        ]
      },
      {
        name: "portal-corridor",
        points: [
          [704, 18], [891, 18], [906, 54], [903, 98],
          [882, 130], [850, 146], [850, 220], [892, 237],
          [902, 259], [690, 259], [698, 238], [750, 220],
          [750, 146], [716, 132], [696, 102], [693, 56]
        ]
      },
      {
        name: "northwest-terrace",
        points: [
          [400, 80], [440, 75], [485, 95], [520, 120],
          [535, 145], [525, 165], [505, 175], [490, 190],
          [515, 210], [525, 235], [510, 255], [480, 265],
          [450, 250], [430, 225], [425, 200], [405, 180],
          [390, 155], [388, 120]
        ]
      },
      {
        name: "northeast-terrace",
        points: [
          [1100, 110], [1140, 85], [1190, 70], [1250, 70],
          [1300, 85], [1340, 105], [1380, 100], [1400, 120],
          [1398, 150], [1380, 175], [1345, 190], [1300, 202],
          [1260, 197], [1220, 185], [1190, 190], [1165, 210],
          [1160, 235], [1170, 250], [1150, 268], [1115, 268],
          [1090, 250], [1075, 225], [1070, 195], [1080, 160]
        ]
      },
      {
        name: "recycle-platform",
        points: [
          [1190, 372], [1235, 350], [1377, 350], [1420, 370],
          [1455, 400], [1466, 440], [1462, 480], [1445, 512],
          [1415, 537], [1375, 552], [1325, 558], [1268, 550],
          [1220, 532], [1188, 505], [1168, 473], [1168, 423]
        ]
      },
      {
        name: "recycle-stairs",
        points: [
          [1285, 538], [1405, 538], [1430, 562], [1432, 596],
          [1418, 625], [1393, 650], [1362, 665], [1328, 654],
          [1304, 631], [1288, 600]
        ]
      },
      {
        name: "southwest-trail-landing",
        points: [
          [220, 560], [270, 575], [325, 610], [370, 655],
          [365, 700], [330, 725], [285, 705], [250, 675],
          [220, 670], [190, 690], [170, 670], [180, 630]
        ]
      },
      {
        name: "southwest-bridge-upper",
        points: [
          [175, 670], [205, 660], [235, 680], [250, 700],
          [275, 725], [270, 755], [245, 775], [220, 755],
          [205, 730], [180, 710]
        ]
      },
      {
        name: "southwest-bridge-entry",
        points: [
          [220, 660], [270, 645], [315, 660], [335, 685],
          [330, 710], [300, 730], [265, 725], [235, 705],
          [210, 682]
        ]
      },
      {
        name: "southwest-bridge-lower",
        points: [
          [235, 740], [270, 755], [268, 785], [245, 805],
          [215, 815], [195, 840], [180, 870], [145, 875],
          [125, 855], [130, 825], [155, 805], [180, 780],
          [205, 765]
        ]
      },
      {
        name: "southeast-trail",
        points: [
          [1290, 600], [1340, 595], [1370, 610], [1375, 635],
          [1360, 660], [1340, 675], [1330, 700], [1390, 720],
          [1420, 740],
          [1450, 760], [1475, 790], [1485, 825], [1510, 850],
          [1550, 865], [1600, 875], [1600, 935], [1560, 925],
          [1520, 905], [1480, 885], [1445, 860], [1410, 845],
          [1380, 825], [1350, 800], [1320, 770], [1300, 735],
          [1285, 700], [1285, 660]
        ]
      }
    ],

    /* Large scenery baked into the background but surrounded by walkable land. */
    blockedPolygons: [
      {
        name: "northwest-tree-cluster",
        points: [
          [438, 82], [486, 82], [514, 103], [520, 132],
          [505, 157], [478, 168], [450, 155], [433, 128]
        ]
      },
      {
        name: "northeast-tree-cluster",
        points: [
          [1218, 68], [1278, 66], [1310, 86], [1321, 117],
          [1312, 148], [1286, 171], [1250, 174], [1222, 154],
          [1209, 124]
        ]
      }
    ],

    /* 只保留真正位於可行走輪廓內的矩形障礙；背景邊界由多邊形負責。 */
    blockedRects: [],

    /* Fixed station bases are real world obstacles, separate from their labels/glow. */
    fixedCollisionRects: [
      { x: 752, y: 55, w: 96, h: 42, name: "portal-base" },
      { x: 248, y: 430, w: 104, h: 56, name: "workbench-base" },
      { x: 1270, y: 454, w: 76, h: 58, name: "recycle-station-base" }
    ],

    /* 可建造範圍（再扣掉 blocked 與 fixed 保留區） */
    buildArea: { x: 96, y: 178, w: 1408, h: 756 },

    /* 建造保留區：出生點 5x5、傳送門、工作台、掛機區（含出入口緩衝） */
    reservedRects: [
      { x: 736,  y: 462, w: 160, h: 178, name: "出生點安全區" },
      { x: 704,  y: 0,   w: 192, h: 220, name: "傳送門保留區" },
      { x: 220,  y: 352, w: 176, h: 192, name: "工作台保留區" },
      { x: 1164, y: 347, w: 288, h: 242, name: "掛機回收區" }
    ],

    /* flood-fill 檢查目標：出生點必須永遠走得到這些位置 */
    reachTargets: function () {
      return [
        { x: this.portal.x, y: this.portal.y + 96, name: "傳送門" },
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

    pointInPolygon: function (x, y, points) {
      var inside = false;
      for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
        var xi = points[i][0], yi = points[i][1];
        var xj = points[j][0], yj = points[j][1];
        var crosses = ((yi > y) !== (yj > y)) &&
          (x < (xj - xi) * (y - yi) / ((yj - yi) || 0.00001) + xi);
        if (crosses) inside = !inside;
      }
      return inside;
    },
    pointInWalkable: function (x, y) {
      if (x < 0 || y < 0 || x >= this.W || y >= this.H) return false;
      var self = this;
      var onLand = this.walkablePolygons.some(function (poly) {
        return self.pointInPolygon(x, y, poly.points);
      });
      if (!onLand) return false;
      var inScenery = (this.blockedPolygons || []).some(function (poly) {
        return self.pointInPolygon(x, y, poly.points);
      });
      if (inScenery) return false;
      return !this.blockedRects.some(function (r) {
        return self.pointInRect(x, y, r);
      });
    },
    circleInWalkable: function (x, y, radius) {
      if (!this.pointInWalkable(x, y)) return false;
      var sampleRadius = Math.max(0, radius || 0);
      if (!sampleRadius) return true;
      /*
       * Keep adjacent probes at most two world pixels apart. The previous
       * 12-point probe left wide gaps around a 20px circle, which allowed
       * diagonal shore edges through the collision footprint.
       */
      var samples = Math.max(32, Math.ceil(Math.PI * 2 * sampleRadius / 2));
      for (var i = 0; i < samples; i++) {
        var angle = i * Math.PI * 2 / samples;
        if (!this.pointInWalkable(
          x + Math.cos(angle) * sampleRadius,
          y + Math.sin(angle) * sampleRadius
        )) return false;
      }
      return true;
    },

    /* 靜態阻擋格：四角都必須落在底圖可行走區，避免建築壓到岸邊。 */
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
          var inset = CELL / 2 - 3;
          grid[cy * COLS + cx] = !(
            this.pointInWalkable(c.x - inset, c.y - inset) &&
            this.pointInWalkable(c.x + inset, c.y - inset) &&
            this.pointInWalkable(c.x - inset, c.y + inset) &&
            this.pointInWalkable(c.x + inset, c.y + inset)
          );
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
      var rects = LobbyWorld.blockedRects.concat(LobbyWorld.fixedCollisionRects || []);
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

      /* 不規則海岸線：先嘗試分軸滑動，再沿移動向量逼近可行走邊界。 */
      if (!LobbyWorld.circleInWalkable(nx, ny, radius)) {
        if (LobbyWorld.circleInWalkable(nx, prevY, radius)) {
          ny = prevY;
        } else if (LobbyWorld.circleInWalkable(prevX, ny, radius)) {
          nx = prevX;
        } else if (LobbyWorld.circleInWalkable(prevX, prevY, radius)) {
          var lo = 0, hi = 1;
          for (var step = 0; step < 8; step++) {
            var mid = (lo + hi) / 2;
            var mx = prevX + (nx - prevX) * mid;
            var my = prevY + (ny - prevY) * mid;
            if (LobbyWorld.circleInWalkable(mx, my, radius)) lo = mid;
            else hi = mid;
          }
          nx = prevX + (nx - prevX) * lo;
          ny = prevY + (ny - prevY) * lo;
        } else {
          nx = prevX;
          ny = prevY;
        }
      }
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
