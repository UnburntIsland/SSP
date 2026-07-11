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
      shoreline: ['shoreline_01']
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

  var StageRenderer = {
    STAGE_ASSETS: STAGE_ASSETS,
    COLLECTIBLE_TYPES: COLLECTIBLE_TYPES,
    TILE: TILE,
    MAX_ACTIVE_OBJECTS: 64,
    built: false,

    build: function (stage, seed) {
      this.stage = stage;
      this.world = stage.world;
      var rnd = mulberry32((seed || 1337) ^ 0x9e3779b1);
      this.cols = Math.ceil(this.world.w / TILE);
      this.rows = Math.ceil(this.world.h / TILE);

      // 依地帶決定每格 tile 種類，變化來自 seed（固定，不閃爍）
      this.tileMap = [];
      for (var r = 0; r < this.rows; r++) {
        var y = r * TILE, rowArr = [];
        for (var c = 0; c < this.cols; c++) {
          var kind;
          if (y < SEA_H) kind = 'shoreline';
          else if (y < WET_H && rnd() < 0.14) kind = 'tidePool';
          else kind = 'sand';
          var list = STAGE_ASSETS.tiles[kind];
          rowArr.push({ kind: kind, v: (rnd() * list.length) | 0 });
        }
        this.tileMap.push(rowArr);
      }

      // 可拾取地圖物件由遊戲計時器逐一生成，不在開局一次塞滿場景。
      this.props = [];
      this.spawnSerial = 0;
      this.built = true;
    },

    spawnRandomObject: function (player, forcedType, forcedPosition) {
      if (!this.built || !this.world || !player) return null;
      if (this.props.length >= this.MAX_ACTIVE_OBJECTS) return null;

      var def = null;
      for (var d = 0; d < COLLECTIBLE_TYPES.length; d++) {
        if (COLLECTIBLE_TYPES[d].type === forcedType) { def = COLLECTIBLE_TYPES[d]; break; }
      }
      if (!def) def = COLLECTIBLE_TYPES[(Math.random() * COLLECTIBLE_TYPES.length) | 0];

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
        y = Math.max(SEA_H + 28, Math.min(this.world.h - 56, y));

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
          var key = 'tile_' + STAGE_ASSETS.tiles[t.kind][t.v];
          var drawn = A && A.ready && A.ready(key) && A.drawInRect && A.drawInRect(ctx, key, x, y, TILE + 1, TILE + 1);
          if (!drawn) this.fallbackTile(ctx, t.kind, x, y);
        }
      }

      // ---- props（世界座標；螢幕尺寸固定 = RENDER_SIZES ÷ zoom，與角色一致） ----
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
    fallbackTile: function (ctx, kind, x, y) {
      if (kind === 'shoreline') {
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
