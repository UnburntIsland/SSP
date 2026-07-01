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
      driftwood:  ['driftwood_01'],
      rock:       ['rock_01'],
      recycleBin: ['recycle_bin_01'],
      trash:      ['plastic_trash_01'],
      oil:        ['oil_stain_01']
    }
  };

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
    TILE: TILE,
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

      // 場景裝飾物（座標依 seed 固定）
      this.props = [];
      var defs = [
        { type: 'rock',       size: 'propSmall',  n: 22, minY: SEA_H },
        { type: 'trash',      size: 'propSmall',  n: 26, minY: SEA_H },
        { type: 'oil',        size: 'propMedium', n: 6,  minY: WET_H },
        { type: 'driftwood',  size: 'propMedium', n: 14, minY: WET_H },
        { type: 'recycleBin', size: 'propMedium', n: 8,  minY: WET_H + 20 }
      ];
      for (var d = 0; d < defs.length; d++) {
        var pd = defs[d], variants = STAGE_ASSETS.props[pd.type];
        for (var k = 0; k < pd.n; k++) {
          this.props.push({
            type: pd.type, size: pd.size,
            x: 60 + rnd() * (this.world.w - 120),
            y: pd.minY + rnd() * (this.world.h - pd.minY - 40),
            v: (rnd() * variants.length) | 0
          });
        }
      }
      this.props.sort(function (a, b) { return a.y - b.y; });   // 後方先畫，簡單深度感
      this.built = true;
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
        if (p.x < camX - 120 || p.x > camX + viewW + 120 || p.y < camY - 120 || p.y > camY + viewH + 120) continue;
        var sz = (sizes[p.size] || 64) / zoom;
        // 影子
        ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(p.x, p.y + sz * 0.30, sz * 0.34, sz * 0.14, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        var pk = 'prop_' + STAGE_ASSETS.props[p.type][p.v];
        var ok = A && A.ready && A.ready(pk) && A.drawCentered && A.drawCentered(ctx, pk, p.x, p.y, sz, sz);
        if (!ok) this.fallbackProp(ctx, p.type, p.x, p.y, sz);
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

    fallbackProp: function (ctx, type, x, y, sz) {
      ctx.save();
      if (type === 'recycleBin') {
        ctx.fillStyle = '#2c2c2c'; ctx.fillRect(x - sz * 0.30, y - sz * 0.40, sz * 0.60, sz * 0.66);
        ctx.fillStyle = '#43a047'; ctx.fillRect(x - sz * 0.26, y - sz * 0.36, sz * 0.52, sz * 0.58);
        ctx.fillStyle = '#2e7d32'; ctx.fillRect(x - sz * 0.32, y - sz * 0.46, sz * 0.64, sz * 0.14);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(x - sz * 0.06, y - sz * 0.16, sz * 0.12, sz * 0.04);
        ctx.fillRect(x - sz * 0.02, y - sz * 0.20, sz * 0.04, sz * 0.12);
      } else if (type === 'driftwood') {
        ctx.fillStyle = '#7b5a3a'; ctx.fillRect(x - sz * 0.46, y - sz * 0.12, sz * 0.92, sz * 0.24);
        ctx.fillStyle = '#5d4327'; ctx.fillRect(x - sz * 0.46, y - sz * 0.12, sz * 0.92, sz * 0.07);
      } else if (type === 'rock') {
        ctx.fillStyle = '#9e9e9e'; ctx.beginPath(); ctx.arc(x, y, sz * 0.30, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c4c4c4'; ctx.beginPath(); ctx.arc(x - sz * 0.08, y - sz * 0.08, sz * 0.12, 0, Math.PI * 2); ctx.fill();
      } else if (type === 'trash') {
        ctx.fillStyle = '#eef3f6'; ctx.fillRect(x - sz * 0.18, y - sz * 0.20, sz * 0.36, sz * 0.40);
        ctx.fillStyle = '#b0bec5'; ctx.fillRect(x - sz * 0.18, y - sz * 0.20, sz * 0.36, sz * 0.08);
      } else if (type === 'oil') {
        ctx.globalAlpha = 0.7; ctx.fillStyle = '#26263a';
        ctx.beginPath(); ctx.ellipse(x, y, sz * 0.42, sz * 0.24, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.5; ctx.fillStyle = '#6a5acd';
        ctx.beginPath(); ctx.ellipse(x - sz * 0.08, y - sz * 0.04, sz * 0.16, sz * 0.09, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  };

  global.StageRenderer = StageRenderer;
})(window);
