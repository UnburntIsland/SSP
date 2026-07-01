/* ============================================================
   sprites.js  —  圖片素材優先，否則程式繪製的像素風佔位圖
   每個 sprite 以調色盤 + 字元列定義；'.' 為透明。
   繪製順序：先問 assets.js 是否有對應圖片素材，有就畫圖片，
   沒有（或尚未載入完成）就 fallback 回這裡的程式碼像素繪製。
   提供：
     Sprites.draw(ctx, id, cx, cy, scale, opt)   世界座標置中繪製
     Sprites.makeCanvas(id, scale)               產生 <canvas>（給 DOM 卡片/HUD）
     Sprites.drawIcon(ctx, id, x, y, size)        技能/商店圖示
     Sprites.makeIconCanvas(id, size)
   ============================================================ */
(function (global) {

  // -------- 角色 --------
  var SPRITES = {
    char_ranger: {
      palette: { H: "#1b5e20", h: "#2e7d32", S: "#f1c79a", e: "#20323a", G: "#43a047", g: "#2e7d32", P: "#5d4037", B: "#3e2723" },
      rows: [
        "....hhhh....",
        "...hHHHHh...",
        "...hHHHHh...",
        "....SSSS....",
        "...SSeeSS...",
        "...SSSSSS...",
        "..gGGGGGGg..",
        "..GGGGGGGG..",
        "..GGGGGGGG..",
        "..gGG..GGg..",
        "...PP..PP...",
        "...BB..BB...",
        "...BB..BB..."
      ]
    },
    char_beach: {
      palette: { C: "#1565c0", c: "#1e88e5", S: "#f1c79a", e: "#20323a", T: "#26a69a", t: "#00897b", P: "#455a64", B: "#263238" },
      rows: [
        "....cccc....",
        "...cCCCCc...",
        "..CCCCCCCC..",
        "....SSSS....",
        "...SSeeSS...",
        "...SSSSSS...",
        "..tTTTTTTt..",
        "..TTTTTTTT..",
        "..TTTTTTTT..",
        "..tTT..TTt..",
        "...PP..PP...",
        "...BB..BB...",
        "...BB..BB..."
      ]
    },
    char_solar: {
      palette: { Y: "#ffca28", y: "#f9a825", S: "#f1c79a", e: "#20323a", O: "#fb8c00", o: "#ef6c00", V: "#1e88e5", P: "#37474f", B: "#263238" },
      rows: [
        "....YYYY....",
        "...yYYYYy...",
        "..YYYYYYYY..",
        "....SSSS....",
        "...SSeeSS...",
        "...SSSSSS...",
        "..oOOVVOOo..",
        "..OOVVVVOO..",
        "..OOOOOOOO..",
        "..oOO..OOo..",
        "...PP..PP...",
        "...BB..BB...",
        "...BB..BB..."
      ]
    },

    // -------- 敵人 --------
    enemy_bag: {
      palette: { W: "#eef3f6", w: "#cfd8dc", L: "#b0bec5", e: "#37474f" },
      rows: [
        "...L....L...",
        "..WWWWWWWW..",
        ".WWWWWWWWWW.",
        ".WWeWWWWeWW.",
        ".WWWWWWWWWW.",
        ".WwWWWWWWwW.",
        ".WWWWWWWWWW.",
        ".wWWWWWWWWw.",
        "..wWWWWWWw..",
        "..wwwwwwww..",
        "...w....w..."
      ]
    },
    enemy_butt: {
      palette: { F: "#e8dcc0", f: "#cdbd97", T: "#ff7043", e: "#3e2723", L: "#5d4037" },
      rows: [
        "...TTT...",
        "..TTTTT..",
        ".FFFFFFF.",
        ".FeFFFeF.",
        ".FFFFFFF.",
        ".fffffff.",
        ".L.L.L.L.",
        "L..L.L..L"
      ]
    },
    enemy_battery: {
      palette: { g: "#66bb6a", G: "#43a047", e: "#1b3a22", K: "#424242", P: "#ffca28", R: "#e53935" },
      rows: [
        ".....PP.....",
        "....KKKK....",
        "....KRRK....",
        "....KKKK....",
        "...gggggg...",
        "..gggggggg..",
        ".gggggggggg.",
        ".ggeggggegg.",
        ".gggggggggg.",
        ".gGggggggGg.",
        ".GGGGGGGGGG."
      ]
    },
    enemy_oil: {
      palette: { o: "#2b2b3a", O: "#3d3d52", p: "#6a5acd", e: "#ffd54f", m: "#b71c1c" },
      rows: [
        ".....oooooo.....",
        "...oooooooooo...",
        "..oooopppoooooo.",
        ".oooooooooooooo.",
        ".ooooeoooooeooo.",
        ".oooooooooooooo.",
        "oooooooooooooooo",
        "oooommmmmmmmoooo",
        "oooooommmmoooooo",
        ".oooooooooooooo.",
        ".oOooooooooOooo.",
        "..oooooooooooo..",
        "...oo..oo..oo..."
      ]
    },

    // -------- 掉落物 --------
    pickup_xp: {
      palette: { x: "#7cf08a", X: "#2e9e45", h: "#c8ffd0" },
      rows: [
        "...XX...",
        "..XxxX..",
        ".XxhhxX.",
        "XxhxxhxX",
        "XxhxxhxX",
        ".XxxxxX.",
        "..XxxX..",
        "...XX..."
      ]
    },
    pickup_coin: {
      palette: { c: "#4dd0c4", C: "#00897b", r: "#e0fff9" },
      rows: [
        "..cccc..",
        ".cccccc.",
        "ccCrrCcc",
        "ccrCCrcc",
        "ccrCCrcc",
        "ccCrrCcc",
        ".cccccc.",
        "..cccc.."
      ]
    },
    pickup_health: {
      palette: { b: "#4db6e8", B: "#1565c0", w: "#e3f6ff", L: "#cfeaff" },
      rows: [
        "...ww...",
        "...ww...",
        "..bbbb..",
        ".bLbbLb.",
        ".bbbbbb.",
        ".bBBBBb.",
        ".bBBBBb.",
        ".bbbbbb.",
        "..bbbb.."
      ]
    },
    pickup_card: {
      palette: { P: "#f3efe0", p: "#bdb78f", L: "#4caf50", i: "#2e7d32" },
      rows: [
        ".pppppp.",
        ".pPPPPp.",
        ".pPLLPp.",
        ".pPLLPp.",
        ".pPiiPp.",
        ".pPPPPp.",
        ".pPppPp.",
        ".pPppPp.",
        ".pppppp."
      ]
    }
  };

  // 預先計算每個 sprite 的寬高（以最長列為寬）
  for (var id in SPRITES) {
    var s = SPRITES[id];
    var w = 0;
    for (var i = 0; i < s.rows.length; i++) w = Math.max(w, s.rows[i].length);
    s.w = w; s.h = s.rows.length;
  }

  function drawSpriteTo(ctx, s, ox, oy, scale) {
    for (var r = 0; r < s.rows.length; r++) {
      var row = s.rows[r];
      for (var c = 0; c < row.length; c++) {
        var ch = row[c];
        if (ch === "." || ch === " ") continue;
        var col = s.palette[ch];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(
          Math.round(ox + c * scale),
          Math.round(oy + r * scale),
          Math.ceil(scale),
          Math.ceil(scale)
        );
      }
    }
  }

  var Sprites = {
    has: function (id) { return !!SPRITES[id]; },

    // 在世界座標 (cx,cy) 置中繪製（優先圖片素材，否則回退 placeholder）
    draw: function (ctx, id, cx, cy, scale, opt) {
      var s = SPRITES[id];
      opt = opt || {};
      // 優先使用圖片素材；置入與 placeholder 相同大小的方框，確保視覺大小與遊戲流程一致
      if (global.Assets) {
        var bw = s ? s.w * scale : 12 * scale;
        var bh = s ? s.h * scale : 12 * scale;
        if (global.Assets.drawCentered(ctx, id, cx, cy, bw, bh, opt.alpha)) return;
      }
      if (!s) return;
      var ox = cx - (s.w * scale) / 2;
      var oy = cy - (s.h * scale) / 2;
      if (opt.alpha != null) { ctx.save(); ctx.globalAlpha = opt.alpha; }
      drawSpriteTo(ctx, s, ox, oy, scale);
      if (opt.alpha != null) ctx.restore();
    },

    // 以「世界尺寸方框 (w×h)」置中繪製（圖片或 placeholder 皆等比例 fit，避免透明留白造成偏移）
    drawSized: function (ctx, id, cx, cy, w, h, opt) {
      opt = opt || {};
      if (global.Assets && global.Assets.drawCentered(ctx, id, cx, cy, w, h, opt.alpha)) return;
      var s = SPRITES[id];
      if (!s) return;
      var scale = Math.min(w / s.w, h / s.h);
      var ox = cx - (s.w * scale) / 2, oy = cy - (s.h * scale) / 2;
      if (opt.alpha != null) { ctx.save(); ctx.globalAlpha = opt.alpha; }
      drawSpriteTo(ctx, s, ox, oy, scale);
      if (opt.alpha != null) ctx.restore();
    },

    size: function (id, scale) {
      var s = SPRITES[id];
      if (!s) return { w: 0, h: 0 };
      return { w: s.w * scale, h: s.h * scale };
    },

    // 產生獨立 <canvas>，給 DOM（角色卡、HUD 圖示等）。優先圖片，否則 placeholder。
    makeCanvas: function (id, scale) {
      var s = SPRITES[id];
      var cv = document.createElement("canvas");
      var bw = s ? s.w * scale : 64;
      var bh = s ? s.h * scale : 64;
      cv.width = bw; cv.height = bh;
      var ctx = cv.getContext("2d");
      if (global.Assets && global.Assets.ready(id)) {
        ctx.imageSmoothingEnabled = true;
        if (global.Assets.drawInRect(ctx, id, 0, 0, bw, bh)) return cv;
      }
      ctx.imageSmoothingEnabled = false;
      if (s) drawSpriteTo(ctx, s, 0, 0, scale);
      return cv;
    },

    /* ---------- 技能 / 商店圖示（優先圖片，否則向量式繪製） ---------- */
    drawIcon: function (ctx, id, x, y, size) {
      // 優先使用圖片素材
      if (global.Assets && global.Assets.drawInRect(ctx, id, x, y, size, size)) return;
      ctx.save();
      ctx.translate(x, y);
      var c = size / 2;
      function disc(col, rad) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(c, c, rad, 0, Math.PI * 2); ctx.fill(); }
      switch (id) {
        case "skill_seed": {
          disc("#1b3a23", size * 0.46);
          ctx.fillStyle = "#7cc36a"; ctx.beginPath();
          ctx.ellipse(c, c, size * 0.16, size * 0.30, Math.PI / 5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#2e7d32"; ctx.lineWidth = Math.max(1, size * 0.04);
          ctx.beginPath(); ctx.moveTo(c, c - size * 0.22); ctx.lineTo(c, c + size * 0.22); ctx.stroke();
          break;
        }
        case "skill_net": {
          disc("#063a3a", size * 0.46);
          ctx.strokeStyle = "#4dd0c4"; ctx.lineWidth = Math.max(1, size * 0.05);
          for (var rr = 0.16; rr < 0.46; rr += 0.13) { ctx.beginPath(); ctx.arc(c, c, size * rr, 0, Math.PI * 2); ctx.stroke(); }
          break;
        }
        case "skill_solar": {
          disc("#3a2c05", size * 0.46);
          ctx.fillStyle = "#ffce3d"; ctx.beginPath(); ctx.arc(c, c, size * 0.18, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#ffce3d"; ctx.lineWidth = Math.max(1, size * 0.05);
          for (var a = 0; a < 8; a++) {
            var ang = a * Math.PI / 4;
            ctx.beginPath();
            ctx.moveTo(c + Math.cos(ang) * size * 0.26, c + Math.sin(ang) * size * 0.26);
            ctx.lineTo(c + Math.cos(ang) * size * 0.40, c + Math.sin(ang) * size * 0.40);
            ctx.stroke();
          }
          break;
        }
        case "skill_wind": {
          disc("#0a2233", size * 0.46);
          ctx.fillStyle = "#e3f6ff";
          for (var b = 0; b < 3; b++) {
            ctx.save(); ctx.translate(c, c); ctx.rotate(b * 2 * Math.PI / 3);
            ctx.beginPath(); ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(size * 0.10, -size * 0.30, size * 0.04, -size * 0.40);
            ctx.quadraticCurveTo(-size * 0.10, -size * 0.26, 0, 0);
            ctx.fill(); ctx.restore();
          }
          ctx.fillStyle = "#90a4ae"; ctx.beginPath(); ctx.arc(c, c, size * 0.06, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case "skill_compost": {
          disc("#2c1c0e", size * 0.46);
          ctx.fillStyle = "#6d4c33"; ctx.beginPath(); ctx.arc(c, c, size * 0.30, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#9ccc65";
          var dots = [[-0.12, -0.10], [0.14, -0.04], [-0.02, 0.14], [0.10, 0.12], [-0.16, 0.06]];
          for (var d = 0; d < dots.length; d++) { ctx.beginPath(); ctx.arc(c + dots[d][0] * size, c + dots[d][1] * size, size * 0.05, 0, Math.PI * 2); ctx.fill(); }
          break;
        }
        case "shop_soil": {
          ctx.fillStyle = "#5d4037"; ctx.fillRect(size * 0.12, size * 0.5, size * 0.76, size * 0.4);
          ctx.fillStyle = "#3e2723"; ctx.fillRect(size * 0.12, size * 0.5, size * 0.76, size * 0.08);
          ctx.fillStyle = "#66bb6a"; ctx.beginPath(); ctx.ellipse(c, size * 0.42, size * 0.10, size * 0.22, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#43a047"; ctx.beginPath(); ctx.ellipse(size * 0.34, size * 0.46, size * 0.08, size * 0.16, -0.5, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case "shop_recycle": {
          ctx.strokeStyle = "#4dd0c4"; ctx.lineWidth = Math.max(2, size * 0.10); ctx.lineJoin = "round";
          ctx.beginPath();
          for (var k = 0; k < 3; k++) {
            var ang2 = k * 2 * Math.PI / 3 - Math.PI / 2;
            var px = c + Math.cos(ang2) * size * 0.28, py = c + Math.sin(ang2) * size * 0.28;
            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath(); ctx.stroke();
          break;
        }
        case "shop_energy": {
          ctx.fillStyle = "#ffce3d"; ctx.beginPath();
          ctx.moveTo(c + size * 0.08, size * 0.12);
          ctx.lineTo(size * 0.30, c + size * 0.04);
          ctx.lineTo(c - size * 0.02, c + size * 0.04);
          ctx.lineTo(c - size * 0.10, size * 0.88);
          ctx.lineTo(size * 0.72, c - size * 0.02);
          ctx.lineTo(c + size * 0.04, c - size * 0.02);
          ctx.closePath(); ctx.fill();
          break;
        }
        case "shop_eco": {
          disc("#0a2233", size * 0.44);
          ctx.fillStyle = "#7cc36a"; ctx.beginPath();
          ctx.ellipse(c, c, size * 0.22, size * 0.30, Math.PI / 4, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#2e7d32"; ctx.lineWidth = Math.max(1, size * 0.04);
          ctx.beginPath(); ctx.moveTo(size * 0.34, size * 0.66); ctx.lineTo(size * 0.66, size * 0.34); ctx.stroke();
          break;
        }
        case "shop_rain": {
          ctx.fillStyle = "#4db6e8"; ctx.beginPath();
          ctx.moveTo(c, size * 0.16);
          ctx.quadraticCurveTo(size * 0.82, c + size * 0.10, c, size * 0.86);
          ctx.quadraticCurveTo(size * 0.18, c + size * 0.10, c, size * 0.16);
          ctx.fill();
          ctx.fillStyle = "#bfe9ff"; ctx.beginPath(); ctx.arc(size * 0.40, c, size * 0.07, 0, Math.PI * 2); ctx.fill();
          break;
        }
        default: {
          disc("#3a5b69", size * 0.42);
        }
      }
      ctx.restore();
    },

    makeIconCanvas: function (id, size) {
      var cv = document.createElement("canvas");
      cv.width = size; cv.height = size;
      var ctx = cv.getContext("2d");
      this.drawIcon(ctx, id, 0, 0, size);
      return cv;
    }
  };

  global.Sprites = Sprites;
})(window);
