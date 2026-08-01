/* ============================================================
   stageRenderer.js  —  素材驅動的地圖背景（tilemap + props）
   - 地板用 tileset 圖片鋪設；缺圖 → 程式格子 fallback（不是主要視覺）。
   - 場景裝飾物用 props 圖片；缺圖 → 簡易程式繪製 fallback。
   - layout 依 seed 固定（不會每次刷新就重排 / 閃爍）。
   - 全部世界座標，繪製時已在 camera zoom 內 → 會跟著世界放大。
   - UI 不走這裡（不受 camera zoom 影響）。
   把 GPT-image 圖放到 assets/images/tiles、assets/images/props 即自動採用。
   ============================================================ */
(function (global) {

  var TILE = 96;   // 世界單位的 tile 大小（建議 64 或 96）

  var STAGE_ASSETS = {
    tiles: {
      sand:      ['beach_sand_01', 'beach_sand_02', 'beach_sand_03'],
      tidePool:  ['tide_pool_01'],
      shoreline: ['shoreline_01'],
      ocean:     ['ocean_water_01'],
      factoryFloor: ['factory_floor_01'],
      conveyor: ['conveyor_01'],
      recyclePad: ['recycle_pad_01'],
      blackwaterPlatform: ['blackwater_platform_01'],
      oilChannel: ['oil_channel_01'],
      hazardDeck: ['hazard_deck_01'],
      forestFloor: [],
      riverCurrent: [],
      gravelBar: [],
      landslide: [],
      estuaryShoal: []
    },
    props: {
      plasticBottle:   ['map_plastic_bottle_01'],
      aluminumCan:     ['map_aluminum_can_01'],
      glassBottle:     ['map_glass_bottle_01'],
      discardedBattery:['map_discarded_battery_01']
    }
  };

  var COLLECTIBLE_TYPES = [
    { type: 'plasticBottle',    size: 'interactable', xp: 2, coins: 0, coinChance: 0.20, label: '回收塑膠瓶 +2 XP', color: '#7de8f3' },
    { type: 'aluminumCan',      size: 'interactable', xp: 1, coins: 1, coinChance: 0,    label: '回收鋁罐 +1 XP',   color: '#ffd45c' },
    { type: 'glassBottle',      size: 'interactable', xp: 2, coins: 0, coinChance: 0.35, label: '回收玻璃瓶 +2 XP', color: '#8be0bd' },
    { type: 'discardedBattery', size: 'interactable', xp: 3, coins: 1, coinChance: 0,    label: '回收廢電池 +3 XP', color: '#d8ef78' }
  ];

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var SEA_H = 220, WET_H = 380;   // 海 / 濕沙 / 乾沙 分帶（世界座標 y）
  function tidalSpawnTileKind(world, c, r, fallback) {
    var centerC = Math.floor((world.w / 2) / TILE);
    var centerR = Math.floor((world.h / 2) / TILE);
    var key = (c - centerC) + "," + (r - centerR);
    var inlet = {
      "-2,-2": "ocean", "-1,-2": "ocean", "0,-2": "ocean", "1,-2": "ocean", "2,-2": "ocean",
      "-3,-1": "shoreline", "-2,-1": "shoreline", "-1,-1": "shoreline",
      "0,-1": "shoreline", "1,-1": "shoreline", "2,-1": "shoreline", "3,-1": "shoreline",
      "-3,0": "tidePool", "3,0": "tidePool",
      "-2,1": "tidePool", "2,1": "tidePool",
      "-3,2": "tidePool", "3,2": "tidePool"
    };
    return inlet[key] || fallback;
  }

  function makeTidalLandmarks(world) {
    var cx = world.w / 2;
    var cy = world.h / 2;
    return [
      { type: "driftwood", x: cx - 196, y: cy + 86, rotation: -0.28, scale: 1.05 },
      { type: "driftwood", x: cx + 238, y: cy - 58, rotation: 0.42, scale: 0.82 },
      { type: "seaweed", x: cx - 276, y: cy - 34, rotation: -0.08, scale: 1.0 },
      { type: "seaweed", x: cx + 288, y: cy + 128, rotation: 0.12, scale: 1.15 },
      { type: "rockPool", x: cx + 176, y: cy + 154, rotation: 0, scale: 1.0 }
    ];
  }

  function makeEastLandmarks(world) {
    var cx = world.w / 2;
    var cy = world.h / 2;
    return [
      { type: "riverMarker", x: cx - 238, y: cy - 145, rotation: -0.08, scale: 1.0 },
      { type: "riverMarker", x: cx + 254, y: cy + 104, rotation: 0.12, scale: 0.92 },
      { type: "mountainStone", x: cx - 312, y: cy + 158, rotation: 0.2, scale: 1.08 },
      { type: "mountainStone", x: cx + 342, y: cy - 176, rotation: -0.16, scale: 0.9 },
      { type: "driftwood", x: cx + 150, y: cy - 236, rotation: 0.55, scale: 0.88 },
      { type: "driftwoodBlock", x: cx - 52, y: cy + 292, rotation: -0.35, scale: 1.1 },
      { type: "driftwoodBlock", x: cx + 72, y: cy + 338, rotation: 0.38, scale: 0.92 },
      { type: "forestBoundary", x: cx - 470, y: cy - 250, rotation: 0, scale: 1.1 },
      { type: "forestBoundary", x: cx + 480, y: cy + 240, rotation: 0, scale: 1.0 },
      { type: "cliffEdge", x: cx - 392, y: cy + 355, rotation: -0.25, scale: 1.1 },
      { type: "landslideArrow", x: cx + 382, y: cy - 318, rotation: 0.72, scale: 1.0 }
    ];
  }

  var StageRenderer = {
    STAGE_ASSETS: STAGE_ASSETS,
    COLLECTIBLE_TYPES: COLLECTIBLE_TYPES,
    TILE: TILE,
    MAX_ACTIVE_OBJECTS: 64,
    built: false,

    build: function (stage, seed) {
      this.stage = stage;
      this.world = stage.world;
      this.theme = stage.theme || 'tidal';
      this.collectibleTypes = stage.collectibleTypes || null;
      var rnd = mulberry32((seed || 1337) ^ 0x9e3779b1);
      this.cols = Math.ceil(this.world.w / TILE);
      this.rows = Math.ceil(this.world.h / TILE);

      // 依關卡主題決定每格 tile，變化來自 seed（固定、不閃爍）。
      this.tileMap = [];
      for (var r = 0; r < this.rows; r++) {
        var y = r * TILE, rowArr = [];
        for (var c = 0; c < this.cols; c++) {
          var kind;
          if (this.theme === 'recycle') {
            if ((c + r * 2) % 9 === 0) kind = 'recyclePad';
            else if (c % 6 === 0 || (r % 7 === 0 && c % 3 !== 0)) kind = 'conveyor';
            else kind = 'factoryFloor';
          } else if (this.theme === 'blackwater') {
            if ((c * 3 + r) % 11 === 0 || (r % 6 === 0 && c % 4 !== 0)) kind = 'oilChannel';
            else if ((c + r) % 8 === 0) kind = 'hazardDeck';
            else kind = 'blackwaterPlatform';
          } else if (this.theme === 'east') {
            var centerC = Math.floor(this.cols / 2);
            var centerR = Math.floor(this.rows / 2);
            var dc = c - centerC;
            var dr = r - centerR;
            var riverC = Math.floor(this.cols * 0.55 + Math.sin(r * 0.52) * 2.2);
            var riverDistance = Math.abs(c - riverC);
            var boundaryDistance = Math.min(c, r, this.cols - c - 1, this.rows - r - 1);
            if (r >= this.rows - 4 && riverDistance <= 4) kind = 'estuaryShoal';
            else if (boundaryDistance <= 1) kind = 'forestFloor';
            else if (Math.abs(dc) <= 1 && Math.abs(dr) <= 1) kind = 'gravelBar';
            else if (riverDistance <= 1) kind = 'riverCurrent';
            else if (riverDistance <= 3 || (c * 5 + r * 3) % 17 === 0) kind = 'gravelBar';
            else if (Math.abs(dc) > 3 && Math.abs(dr) > 2 && (c * 3 + r * 7) % 19 < 2) kind = 'landslide';
            else kind = 'forestFloor';
          } else {
            if (y < SEA_H - TILE) kind = 'ocean';
            else if (y < SEA_H) kind = 'shoreline';
            else if (y < WET_H && rnd() < 0.14) kind = 'tidePool';
            else kind = 'sand';
            kind = tidalSpawnTileKind(this.world, c, r, kind);
          }
          var list = STAGE_ASSETS.tiles[kind] || [];
          rowArr.push({ kind: kind, v: list.length ? (rnd() * list.length) | 0 : 0 });
        }
        this.tileMap.push(rowArr);
      }

      // 可拾取地圖物件由遊戲計時器逐一生成，不在開局一次塞滿場景。
      this.props = [];
      this.landmarks = this.theme === 'tidal'
        ? makeTidalLandmarks(this.world)
        : (this.theme === 'east' ? makeEastLandmarks(this.world) : []);
      this.spawnSerial = 0;
      this.built = true;
    },

    getTileAt: function (x, y) {
      if (!this.built || !this.tileMap || !this.tileMap.length) return null;
      var c = Math.max(0, Math.min(this.cols - 1, Math.floor(x / TILE)));
      var r = Math.max(0, Math.min(this.rows - 1, Math.floor(y / TILE)));
      var tile = this.tileMap[r] && this.tileMap[r][c];
      if (!tile) return null;
      return { kind: tile.kind, c: c, r: r, x: c * TILE, y: r * TILE };
    },

    getTerrainEffectAt: function (x, y) {
      var tile = this.getTileAt(x, y);
      if (!tile) return null;
      if (tile.kind === "tidePool") {
        return { kind: tile.kind, speedMult: 0.72, status: "潮池：移動速度 -28%" };
      }
      if (tile.kind === "shoreline" || tile.kind === "ocean") {
        return { kind: tile.kind, speedMult: 0.84, status: "淺水帶：移動速度 -16%" };
      }
      if (tile.kind === "conveyor") {
        var direction = (tile.c + tile.r) % 2 === 0 ? 1 : -1;
        return { kind: tile.kind, pushY: direction * 72, status: "輸送帶：持續推動" };
      }
      if (tile.kind === "recyclePad") {
        return { kind: tile.kind, rewardMult: 1.5, status: "分類台：回收獎勵 +50%" };
      }
      if (tile.kind === "oilChannel") {
        return { kind: tile.kind, damage: 3, damageInterval: 0.8, status: "油污渠道：持續受到傷害" };
      }
      if (tile.kind === "riverCurrent") {
        var currentDirection = tile.r % 2 === 0 ? 1 : -1;
        return {
          kind: tile.kind,
          speedMult: 0.82,
          pushX: currentDirection * 26,
          pushY: 86,
          status: "溪流湍流：向下游推動、移動速度 -18%"
        };
      }
      if (tile.kind === "gravelBar") {
        return { kind: tile.kind, rewardMult: 1.25, status: "礫石回收區：回收獎勵 +25%" };
      }
      if (tile.kind === "estuaryShoal") {
        return { kind: tile.kind, speedMult: 0.9, status: "河口淺灘：移動速度 -10%" };
      }
      if (tile.kind === "landslide") {
        return {
          kind: tile.kind,
          speedMult: 0.68,
          damage: 2,
          damageInterval: 1.0,
          status: "崩塌地：移動速度 -32%、持續受到傷害"
        };
      }
      return null;
    },

    spawnRandomObject: function (player, forcedType, forcedPosition) {
      if (!this.built || !this.world || !player) return null;
      if (this.props.length >= this.MAX_ACTIVE_OBJECTS) return null;

      var def = null;
      for (var d = 0; d < COLLECTIBLE_TYPES.length; d++) {
        if (COLLECTIBLE_TYPES[d].type === forcedType) { def = COLLECTIBLE_TYPES[d]; break; }
      }
      var available = COLLECTIBLE_TYPES;
      if (this.collectibleTypes && this.collectibleTypes.length) {
        available = COLLECTIBLE_TYPES.filter(function (candidate) {
          return StageRenderer.collectibleTypes.indexOf(candidate.type) !== -1;
        });
      }
      if (!available.length) available = COLLECTIBLE_TYPES;
      if (!def) def = available[(Math.random() * available.length) | 0];

      var x = 0, y = 0, found = false;
      for (var attempt = 0; attempt < 16; attempt++) {
        if (forcedPosition) {
          x = forcedPosition.x;
          y = forcedPosition.y;
        } else {
          var angle = Math.random() * Math.PI * 2;
          var distance = 150 + Math.random() * 80;
          x = player.x + Math.cos(angle) * distance;
          y = player.y + Math.sin(angle) * distance;
        }
        x = Math.max(56, Math.min(this.world.w - 56, x));
        var minY = this.theme === 'tidal' ? SEA_H + 28 : 56;
        y = Math.max(minY, Math.min(this.world.h - 56, y));

        found = true;
        var playerDx = player.x - x;
        var playerDy = player.y - y;
        if (!forcedPosition && playerDx * playerDx + playerDy * playerDy < 140 * 140) found = false;
        for (var i = 0; i < this.props.length; i++) {
          var dx = this.props[i].x - x;
          var dy = this.props[i].y - y;
          if (dx * dx + dy * dy < 76 * 76) { found = false; break; }
        }
        if (found || forcedPosition) break;
      }
      if (!found && !forcedPosition) return null;

      var prop = {
        id: 'map-object-' + (++this.spawnSerial),
        type: def.type,
        size: def.size,
        x: x,
        y: y,
        v: 0,
        collectible: true,
        collectRadius: 34,
        xp: def.xp,
        coins: def.coins,
        coinChance: def.coinChance,
        label: def.label,
        color: def.color,
        spawnedAt: (global.Game && global.Game.time) || 0
      };
      this.props.push(prop);
      this.props.sort(function (a, b) { return a.y - b.y; });
      return prop;
    },

    removeCollected: function () {
      this.props = this.props.filter(function (p) { return !p.collected; });
    },

    // 在世界層（已套用 camera zoom + translate）呼叫；只畫可視範圍
    draw: function (ctx, camX, camY, viewW, viewH) {
      if (!this.built) return;
      var A = global.Assets;
      var sizes = (global.Config && global.Config.RENDER_SIZES) || {};
      var zoom = (global.Config && global.Config.CAMERA_ZOOM) || 1;

      // ---- 地板 tiles ----
      var c0 = Math.max(0, Math.floor(camX / TILE));
      var c1 = Math.min(this.cols - 1, Math.floor((camX + viewW) / TILE));
      var r0 = Math.max(0, Math.floor(camY / TILE));
      var r1 = Math.min(this.rows - 1, Math.floor((camY + viewH) / TILE));
      for (var r = r0; r <= r1; r++) {
        for (var c = c0; c <= c1; c++) {
          var t = this.tileMap[r][c], x = c * TILE, y = r * TILE;
          var tileAssets = STAGE_ASSETS.tiles[t.kind] || [];
          var tileName = tileAssets[t.v];
          var key = tileName ? 'tile_' + tileName : null;
          var drawn = false;
          if (t.kind === 'sand' && A && A.ready && A.drawInRect && A.ready('tile_beach_sand_01')) {
            drawn = A.drawInRect(ctx, 'tile_beach_sand_01', x, y, TILE + 1, TILE + 1);
            if (drawn && t.v > 0 && key && A.ready(key)) {
              ctx.save();
              ctx.globalAlpha = 0.14;
              A.drawInRect(ctx, key, x, y, TILE + 1, TILE + 1);
              ctx.restore();
            }
          } else {
            drawn = key && A && A.ready && A.ready(key) && A.drawInRect && A.drawInRect(ctx, key, x, y, TILE + 1, TILE + 1);
          }
          if (!drawn) this.fallbackTile(ctx, t.kind, x, y);
        }
      }

      // ---- props（世界座標；螢幕尺寸固定 = RENDER_SIZES ÷ zoom，與角色一致） ----
      this.drawLandmarks(ctx, camX, camY, viewW, viewH);
      for (var i = 0; i < this.props.length; i++) {
        var p = this.props[i];
        if (p.collected) continue;
        if (p.x < camX - 120 || p.x > camX + viewW + 120 || p.y < camY - 120 || p.y > camY + viewH + 120) continue;
        var sz = (sizes[p.size] || 64) / zoom;
        var gameTime = (global.Game && global.Game.time) || 0;
        var appearT = Math.max(0, Math.min(1, (gameTime - p.spawnedAt) / 0.32));
        var appearEase = 1 - Math.pow(1 - appearT, 3);
        var drawSize = sz * (0.72 + appearEase * 0.28);
        var pulse = 0.48 + Math.sin(gameTime * 4 + i) * 0.16;
        ctx.save();
        ctx.globalAlpha = pulse * appearT;
        ctx.strokeStyle = p.color || '#d8ef78';
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz * (0.46 + Math.sin(gameTime * 3 + i) * 0.035), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        // 影子
        ctx.save(); ctx.globalAlpha = 0.22 * appearT; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(p.x, p.y + sz * 0.30, drawSize * 0.34, drawSize * 0.14, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        var pk = 'prop_' + STAGE_ASSETS.props[p.type][p.v];
        var ok = A && A.ready && A.ready(pk) && A.drawCentered && A.drawCentered(ctx, pk, p.x, p.y, drawSize, drawSize, appearT);
        if (!ok) this.fallbackProp(ctx, p.type, p.x, p.y, drawSize, appearT);
      }
    },

    /* ---------------- fallback：程式繪製（僅缺圖時使用） ---------------- */
    drawLandmarks: function (ctx, camX, camY, viewW, viewH) {
      var landmarks = this.landmarks || [];
      for (var i = 0; i < landmarks.length; i++) {
        var landmark = landmarks[i];
        if (landmark.x < camX - 100 || landmark.x > camX + viewW + 100 ||
            landmark.y < camY - 100 || landmark.y > camY + viewH + 100) continue;
        var scale = landmark.scale || 1;
        ctx.save();
        ctx.translate(landmark.x, landmark.y);
        ctx.rotate(landmark.rotation || 0);
        ctx.scale(scale, scale);
        if (landmark.type === "driftwood") {
          ctx.fillStyle = "rgba(39,25,18,.24)";
          ctx.beginPath(); ctx.ellipse(2, 17, 48, 12, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#8d633d";
          ctx.fillRect(-48, -8, 96, 18);
          ctx.fillStyle = "#b48655";
          ctx.fillRect(-41, -5, 74, 5);
          ctx.strokeStyle = "#5e402b";
          ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(-25, -3); ctx.lineTo(-39, -25); ctx.moveTo(28, 2); ctx.lineTo(43, -19); ctx.stroke();
        } else if (landmark.type === "seaweed") {
          ctx.fillStyle = "rgba(20,64,48,.24)";
          ctx.beginPath(); ctx.ellipse(0, 18, 34, 11, 0, 0, Math.PI * 2); ctx.fill();
          var colors = ["#287f5d", "#3aa879", "#6dbb68", "#236f62"];
          for (var s = 0; s < 7; s++) {
            ctx.strokeStyle = colors[s % colors.length];
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(-24 + s * 8, 14);
            ctx.quadraticCurveTo(-33 + s * 10, -6 - (s % 2) * 8, -21 + s * 7, -31 - (s % 3) * 7);
            ctx.stroke();
          }
        } else if (landmark.type === "riverMarker") {
          ctx.fillStyle = "rgba(20,44,38,.25)";
          ctx.beginPath(); ctx.ellipse(0, 20, 36, 12, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#6f4f31"; ctx.fillRect(-4, -34, 8, 54);
          ctx.fillStyle = "#d6c27f";
          ctx.beginPath(); ctx.moveTo(-28, -30); ctx.lineTo(26, -25); ctx.lineTo(20, -5); ctx.lineTo(-28, -10); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "#4f7655"; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(-16, -21); ctx.lineTo(13, -18); ctx.stroke();
        } else if (landmark.type === "mountainStone" || landmark.type === "cliffEdge") {
          ctx.fillStyle = "rgba(23,39,30,.28)";
          ctx.beginPath(); ctx.ellipse(0, 21, 48, 14, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = landmark.type === "cliffEdge" ? "#59665d" : "#6f806c";
          ctx.beginPath(); ctx.moveTo(-44, 18); ctx.lineTo(-22, -24); ctx.lineTo(8, -36); ctx.lineTo(43, 8); ctx.lineTo(26, 24); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#9aaa83";
          ctx.beginPath(); ctx.moveTo(-22, -22); ctx.lineTo(8, -36); ctx.lineTo(3, -8); ctx.lineTo(-29, 7); ctx.closePath(); ctx.fill();
        } else if (landmark.type === "driftwoodBlock") {
          ctx.strokeStyle = "#6a472d"; ctx.lineWidth = 13; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(-58, -16); ctx.lineTo(54, 18); ctx.moveTo(-42, 22); ctx.lineTo(46, -23); ctx.stroke();
          ctx.strokeStyle = "#aa7b4b"; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(-54, -18); ctx.lineTo(50, 14); ctx.moveTo(-38, 19); ctx.lineTo(42, -20); ctx.stroke();
        } else if (landmark.type === "forestBoundary") {
          var treeColors = ["#194f37", "#276848", "#3f8052", "#6c9658"];
          for (var tree = 0; tree < 7; tree++) {
            ctx.fillStyle = treeColors[tree % treeColors.length];
            ctx.beginPath();
            ctx.arc(-48 + tree * 16, (tree % 2) * 10 - 9, 18 + (tree % 3) * 3, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (landmark.type === "landslideArrow") {
          ctx.fillStyle = "rgba(255,190,75,.88)";
          ctx.beginPath(); ctx.moveTo(0, 38); ctx.lineTo(-28, -2); ctx.lineTo(-10, -2); ctx.lineTo(-10, -34); ctx.lineTo(10, -34); ctx.lineTo(10, -2); ctx.lineTo(28, -2); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "#624727"; ctx.lineWidth = 4; ctx.stroke();
        } else {
          ctx.fillStyle = "rgba(24,78,83,.5)";
          ctx.beginPath(); ctx.ellipse(0, 3, 42, 27, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#718d7e";
          ctx.lineWidth = 7;
          for (var a = 0; a < 5; a++) {
            var angle = a * Math.PI * 2 / 5;
            ctx.beginPath();
            ctx.arc(Math.cos(angle) * 31, Math.sin(angle) * 19, 10, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    },

    fallbackTile: function (ctx, kind, x, y) {
      if (kind === 'factoryFloor') {
        ctx.fillStyle = '#3d5152'; ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = 'rgba(183,215,204,0.14)'; ctx.lineWidth = 2;
        ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
        ctx.fillStyle = '#1d3033';
        ctx.fillRect(x + 9, y + 9, 4, 4); ctx.fillRect(x + TILE - 13, y + 9, 4, 4);
        ctx.fillRect(x + 9, y + TILE - 13, 4, 4); ctx.fillRect(x + TILE - 13, y + TILE - 13, 4, 4);
      } else if (kind === 'conveyor') {
        ctx.fillStyle = '#24383b'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#111f24'; ctx.fillRect(x + 8, y, 10, TILE); ctx.fillRect(x + TILE - 18, y, 10, TILE);
        ctx.fillStyle = '#718489';
        for (var cy = 8; cy < TILE; cy += 18) ctx.fillRect(x + 20, y + cy, TILE - 40, 5);
        ctx.fillStyle = 'rgba(255,157,60,0.7)'; ctx.fillRect(x + 3, y + 3, 5, TILE - 6);
      } else if (kind === 'recyclePad') {
        ctx.fillStyle = '#285c52'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(93,225,177,0.22)'; ctx.fillRect(x + 10, y + 10, TILE - 20, TILE - 20);
        ctx.strokeStyle = '#62c99b'; ctx.lineWidth = 3; ctx.strokeRect(x + 10, y + 10, TILE - 20, TILE - 20);
        ctx.fillStyle = '#d58a37'; ctx.fillRect(x + 20, y + 20, 14, 14);
        ctx.fillStyle = '#6eb5d8'; ctx.fillRect(x + 41, y + 20, 14, 14);
        ctx.fillStyle = '#b7d46d'; ctx.fillRect(x + 62, y + 20, 14, 14);
      } else if (kind === 'blackwaterPlatform') {
        ctx.fillStyle = '#28343e'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(119,143,151,0.12)'; ctx.fillRect(x + 5, y + 5, TILE - 10, TILE - 10);
        ctx.strokeStyle = '#17242d'; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
        ctx.fillStyle = '#5d546f'; ctx.fillRect(x + 10, y + 10, 5, 5); ctx.fillRect(x + TILE - 15, y + TILE - 15, 5, 5);
      } else if (kind === 'oilChannel') {
        ctx.fillStyle = '#102832'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(37,11,48,0.58)'; ctx.fillRect(x + 5, y + 5, TILE - 10, TILE - 10);
        ctx.strokeStyle = 'rgba(104,77,150,0.72)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x + 34, y + 42, 21, 0.15, Math.PI * 1.45); ctx.stroke();
        ctx.strokeStyle = 'rgba(35,160,168,0.62)';
        ctx.beginPath(); ctx.arc(x + 62, y + 58, 18, Math.PI, Math.PI * 2.4); ctx.stroke();
      } else if (kind === 'hazardDeck') {
        ctx.fillStyle = '#41434a'; ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = '#1d262d'; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
        ctx.strokeStyle = 'rgba(232,145,47,0.68)'; ctx.lineWidth = 8;
        for (var hx = -TILE; hx < TILE * 2; hx += 28) {
          ctx.beginPath(); ctx.moveTo(x + hx, y + TILE); ctx.lineTo(x + hx + TILE, y); ctx.stroke();
        }
      } else if (kind === 'forestFloor') {
        ctx.fillStyle = '#446f4b'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(123,157,92,0.24)';
        ctx.beginPath(); ctx.arc(x + 21, y + 27, 13, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 72, y + 64, 18, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(37,81,54,0.34)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x + 8, y + 83); ctx.lineTo(x + 37, y + 56); ctx.moveTo(x + 59, y + 20); ctx.lineTo(x + 88, y + 8); ctx.stroke();
      } else if (kind === 'riverCurrent') {
        ctx.fillStyle = '#278fa7'; ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = 'rgba(189,244,235,0.64)'; ctx.lineWidth = 4;
        for (var rw = 14; rw < TILE; rw += 30) {
          ctx.beginPath();
          ctx.moveTo(x + 8, y + rw);
          ctx.bezierCurveTo(x + 27, y + rw - 8, x + 55, y + rw + 8, x + 88, y + rw - 2);
          ctx.stroke();
        }
      } else if (kind === 'estuaryShoal') {
        ctx.fillStyle = '#79b9b2'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(211,218,174,.58)';
        ctx.beginPath(); ctx.ellipse(x + 30, y + 34, 27, 15, -0.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + 70, y + 68, 31, 18, 0.25, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(239,250,225,.62)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x + 3, y + 20); ctx.bezierCurveTo(x + 28, y + 9, x + 63, y + 31, x + 93, y + 18); ctx.stroke();
      } else if (kind === 'gravelBar') {
        ctx.fillStyle = '#a8a77e'; ctx.fillRect(x, y, TILE, TILE);
        var gravelColors = ['#69786e', '#c6bd92', '#7f8f82', '#dad0a4'];
        for (var gr = 0; gr < 9; gr++) {
          ctx.fillStyle = gravelColors[gr % gravelColors.length];
          ctx.beginPath();
          ctx.ellipse(x + 10 + ((gr * 29) % 78), y + 13 + ((gr * 41) % 72), 5 + (gr % 3) * 2, 3 + (gr % 2) * 2, gr * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (kind === 'landslide') {
        ctx.fillStyle = '#765f43'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#4d4837';
        ctx.beginPath(); ctx.moveTo(x, y + 76); ctx.lineTo(x + 25, y + 17); ctx.lineTo(x + 54, y + 48); ctx.lineTo(x + 79, y + 8); ctx.lineTo(x + TILE, y + 61); ctx.lineTo(x + TILE, y + TILE); ctx.lineTo(x, y + TILE); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#a17c4e'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(x + 13, y + 21); ctx.lineTo(x + 83, y + 73); ctx.moveTo(x + 65, y + 15); ctx.lineTo(x + 34, y + 83); ctx.stroke();
        ctx.fillStyle = 'rgba(255,190,75,.86)';
        ctx.beginPath(); ctx.moveTo(x + 70, y + 84); ctx.lineTo(x + 52, y + 57); ctx.lineTo(x + 62, y + 57); ctx.lineTo(x + 62, y + 38); ctx.lineTo(x + 78, y + 38); ctx.lineTo(x + 78, y + 57); ctx.lineTo(x + 88, y + 57); ctx.closePath(); ctx.fill();
      } else if (kind === 'ocean') {
        ctx.fillStyle = '#39b6be'; ctx.fillRect(x, y, TILE, TILE);
      } else if (kind === 'shoreline') {
        ctx.fillStyle = '#2a9db5'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        for (var wy = 14; wy < TILE; wy += 30) ctx.fillRect(x, y + wy, TILE, 3);
      } else if (kind === 'tidePool') {
        ctx.fillStyle = '#cdb98a'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(40,150,170,0.55)';
        ctx.beginPath(); ctx.ellipse(x + TILE / 2, y + TILE / 2, TILE * 0.38, TILE * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = (y < WET_H) ? '#d8c29a' : '#e9d6a8';
        ctx.fillRect(x, y, TILE, TILE);
        // 靜態棋格明暗（依格子座標，不隨時間 → 不閃爍）
        if ((((x / TILE) | 0) + ((y / TILE) | 0)) % 2 === 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.045)'; ctx.fillRect(x, y, TILE, TILE);
        }
      }
    },

    fallbackProp: function (ctx, type, x, y, sz, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.translate(x, y);
      ctx.rotate(-0.48);
      if (type === 'plasticBottle' || type === 'glassBottle') {
        ctx.fillStyle = type === 'plasticBottle' ? '#8fe3ed' : '#68a982';
        ctx.fillRect(-sz * 0.32, -sz * 0.14, sz * 0.54, sz * 0.28);
        ctx.fillStyle = type === 'plasticBottle' ? '#168f98' : '#406a50';
        ctx.fillRect(sz * 0.20, -sz * 0.10, sz * 0.18, sz * 0.20);
      } else if (type === 'aluminumCan') {
        ctx.fillStyle = '#d6dddd'; ctx.fillRect(-sz * 0.30, -sz * 0.18, sz * 0.60, sz * 0.36);
        ctx.fillStyle = '#26a69a'; ctx.fillRect(-sz * 0.10, -sz * 0.18, sz * 0.20, sz * 0.36);
      } else {
        ctx.fillStyle = '#3c4245'; ctx.fillRect(-sz * 0.34, -sz * 0.16, sz * 0.68, sz * 0.32);
        ctx.fillStyle = '#e7bf35'; ctx.fillRect(-sz * 0.34, -sz * 0.16, sz * 0.16, sz * 0.32);
      }
      ctx.restore();
    }
  };

  global.StageRenderer = StageRenderer;
})(window);
