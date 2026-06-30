/* ============================================================
   game.js  —  核心遊戲迴圈與世界模擬
   負責：關卡計時、敵人生成、碰撞、淨化掉落、升級暫停、勝負判定。
   menu/shop/codex 等畫面由 ui.js + main.js 控制；本檔只管「玩」。
   ============================================================ */
(function (global) {

  var MAX_WEAPONS = 6;

  // 升級畫面用的通用能力選項（非技能）
  var STAT_UPGRADES = [
    { id: "vitality", name: "強健體魄", icon: "shop_soil", effect: "最大生命值 +20，並回復 20",
      edu: "健康的身體，是長期投入永續行動的本錢。",
      apply: function (p) { p.maxHp += 20; p.heal(20); } },
    { id: "swift", name: "輕巧步伐", icon: "shop_energy", effect: "移動速度 +8%",
      edu: "步行與單車是幾乎零碳排的移動方式。",
      apply: function (p) { p.speed *= 1.08; } },
    { id: "sense", name: "敏銳感知", icon: "shop_eco", effect: "拾取範圍 +20%",
      edu: "多留心周遭，就能發現更多可回收的資源。",
      apply: function (p) { p.pickupRange *= 1.2; } },
    { id: "efficiency", name: "高效節能", icon: "shop_energy", effect: "所有技能冷卻 -6%",
      edu: "提升效率，用更少的能源做更多的事。",
      apply: function (p) { p.cooldownMult *= 0.94; } },
    { id: "mend", name: "淨水補給", icon: "shop_rain", effect: "立即回復 35 生命",
      edu: "潔淨的水，是所有生命賴以維繫的根本。",
      apply: function (p) { p.heal(35); } }
  ];

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var Game = {
    init: function (canvas, app) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.ctx.imageSmoothingEnabled = false;
      this.app = app;
      this._loop = this.loop.bind(this);
      this.running = false;
      this.resize();
      var self = this;
      global.addEventListener("resize", function () { self.resize(); });
    },

    resize: function () {
      var c = this.canvas;
      var w = c.clientWidth || global.innerWidth;
      var h = c.clientHeight || global.innerHeight;
      c.width = Math.max(320, Math.floor(w));
      c.height = Math.max(240, Math.floor(h));
      this.ctx.imageSmoothingEnabled = false;
    },

    /* ---------------- 開始一局 ---------------- */
    start: function (stageId, player) {
      this.stage = global.GameData.getStage(stageId);
      this.world = { w: this.stage.world.w, h: this.stage.world.h };
      this.player = player;

      this.enemies = [];
      this.projectiles = [];
      this.zones = [];
      this.pulses = [];
      this.pickups = [];
      this.puffs = [];
      this.floaters = [];

      this.time = 0;
      this.runCoins = 0;
      this.purifiedCount = 0;
      this.pendingLevelUps = 0;
      this.firedEvents = {};
      this.spawnAcc = 0;

      this.camera = { x: 0, y: 0 };
      this.player.x = this.world.w / 2;
      this.player.y = this.world.h / 2;

      // 起始技能
      this.player.addSkill(this.player.character.startingSkill);

      this.buildBackground();

      this.running = true;
      this.paused = false;
      this.ended = false;
      this.lastTs = 0;

      this._hudSig = "";
      global.requestAnimationFrame(this._loop);
    },

    stop: function () { this.running = false; },

    /* ---------------- 背景（離屏繪製一次） ---------------- */
    buildBackground: function () {
      var W = this.world.w, H = this.world.h;
      var bg = document.createElement("canvas");
      bg.width = W; bg.height = H;
      var b = bg.getContext("2d");
      var rnd = mulberry32(1337);

      // 水平地帶：海水 → 濕沙 → 乾沙
      var seaH = 240, wetH = 380;
      for (var y = 0; y < H; y += 16) {
        for (var x = 0; x < W; x += 16) {
          var base;
          if (y < seaH) base = "#2a9db5";
          else if (y < wetH) base = "#cdb98a";
          else base = "#e9d6a8";
          // 每格輕微色彩抖動
          var j = (rnd() * 16 - 8) | 0;
          b.fillStyle = shade(base, j);
          b.fillRect(x, y, 16, 16);
        }
      }
      // 海浪線
      b.strokeStyle = "rgba(255,255,255,0.35)"; b.lineWidth = 3;
      for (var wy = 60; wy < seaH; wy += 60) {
        b.beginPath();
        for (var wx = 0; wx <= W; wx += 24) {
          var yy = wy + Math.sin((wx / 80) + wy) * 6;
          if (wx === 0) b.moveTo(wx, yy); else b.lineTo(wx, yy);
        }
        b.stroke();
      }
      // 海/沙交界泡沫
      b.fillStyle = "rgba(255,255,255,0.5)";
      for (var fx = 0; fx < W; fx += 10) {
        b.fillRect(fx, seaH - 4 + Math.sin(fx / 30) * 4, 8, 4);
      }

      // 碎石叢
      for (var g = 0; g < 70; g++) {
        var gx = rnd() * W, gy = seaH + 20 + rnd() * (H - seaH - 40);
        for (var gi = 0; gi < 6; gi++) {
          b.fillStyle = shade("#9e9e9e", (rnd() * 30 - 15) | 0);
          b.fillRect(gx + rnd() * 18 - 9, gy + rnd() * 12 - 6, 4, 4);
        }
      }
      // 潮池
      for (var t = 0; t < 16; t++) {
        var tx = rnd() * W, ty = seaH + 30 + rnd() * (H - seaH - 60);
        var tr = 26 + rnd() * 34;
        b.fillStyle = "rgba(40,150,170,0.55)";
        b.beginPath(); b.ellipse(tx, ty, tr, tr * 0.6, 0, 0, Math.PI * 2); b.fill();
        b.strokeStyle = "rgba(20,90,110,0.6)"; b.lineWidth = 3;
        b.beginPath(); b.ellipse(tx, ty, tr, tr * 0.6, 0, 0, Math.PI * 2); b.stroke();
        b.fillStyle = "rgba(180,230,235,0.5)";
        b.beginPath(); b.ellipse(tx - tr * 0.3, ty - tr * 0.18, tr * 0.28, tr * 0.14, 0, 0, Math.PI * 2); b.fill();
      }
      // 漂流木
      for (var d = 0; d < 18; d++) {
        var dx = rnd() * W, dy = wetH + rnd() * (H - wetH - 20), dw = 40 + rnd() * 50, ang = rnd() * Math.PI;
        b.save(); b.translate(dx, dy); b.rotate(ang);
        b.fillStyle = "#7b5a3a"; b.fillRect(-dw / 2, -7, dw, 14);
        b.fillStyle = "#5d4327"; b.fillRect(-dw / 2, -7, dw, 4);
        b.fillStyle = "#8d6a45";
        for (var k = -dw / 2 + 6; k < dw / 2; k += 12) b.fillRect(k, -2, 2, 8);
        b.restore();
      }
      // 回收桶
      var binCols = ["#43a047", "#1e88e5", "#fb8c00", "#e53935"];
      for (var bn = 0; bn < 9; bn++) {
        var bx = 120 + rnd() * (W - 240), by = wetH + 30 + rnd() * (H - wetH - 80);
        var col = binCols[(rnd() * binCols.length) | 0];
        b.fillStyle = "#2c2c2c"; b.fillRect(bx - 13, by - 22, 26, 30);          // 桶身陰影框
        b.fillStyle = col; b.fillRect(bx - 11, by - 20, 22, 26);
        b.fillStyle = shade(col, -25); b.fillRect(bx - 13, by - 24, 26, 6);     // 桶蓋
        b.fillStyle = "rgba(255,255,255,0.85)";                                  // 回收符號
        b.fillRect(bx - 3, by - 12, 6, 2); b.fillRect(bx - 3, by - 6, 6, 2); b.fillRect(bx - 3, by - 9, 2, 6);
      }

      this.bg = bg;
    },

    /* ---------------- 主迴圈 ---------------- */
    loop: function (ts) {
      if (!this.running) return;
      if (!this.lastTs) this.lastTs = ts;
      var dt = (ts - this.lastTs) / 1000;
      this.lastTs = ts;
      if (dt > 0.05) dt = 0.05;          // 防止切到背景分頁後的大跳躍

      if (!this.paused && !this.ended) this.update(dt);
      this.render();

      if (this.running) global.requestAnimationFrame(this._loop);
    },

    /* ---------------- 更新 ---------------- */
    update: function (dt) {
      this.time += dt;

      this.spawnEnemies(dt);
      this.handleEvents();

      var ctx = this.makeCtx();

      this.player.update(dt, this.world);

      // 武器自動攻擊
      var ws = this.player.weapons;
      for (var i = 0; i < ws.length; i++) ws[i].update(dt, ctx);

      // 投射物
      for (var p = 0; p < this.projectiles.length; p++) {
        var pr = this.projectiles[p];
        pr.update(dt);
        this.collideProjectile(pr);
      }

      // 區域（磁網 / 孢子）
      for (var z = 0; z < this.zones.length; z++) this.zones[z].update(dt, ctx);

      // 脈衝視覺
      for (var u = 0; u < this.pulses.length; u++) this.pulses[u].update(dt);

      // 敵人移動 + 接觸傷害
      for (var e = 0; e < this.enemies.length; e++) {
        var en = this.enemies[e];
        en.update(dt, this.player);
        var dx = en.x - this.player.x, dy = en.y - this.player.y;
        var rr = en.radius + this.player.radius;
        if (dx * dx + dy * dy <= rr * rr) {
          this.player.takeDamage(en.contact);
        }
      }

      // 掉落物拾取
      for (var k = 0; k < this.pickups.length; k++) {
        var pk = this.pickups[k];
        pk.update(dt, this.player);
        if (pk.collected) this.collect(pk);
      }

      // 特效
      for (var f = 0; f < this.puffs.length; f++) {
        var pf = this.puffs[f]; pf.age += dt; if (pf.age >= pf.life) pf.dead = true;
      }
      for (var fl = 0; fl < this.floaters.length; fl++) {
        var ft = this.floaters[fl]; ft.age += dt; ft.y -= 18 * dt; if (ft.age >= ft.life) ft.dead = true;
      }

      this.cleanup();
      this.updateCamera();

      // 升級暫停
      if (this.pendingLevelUps > 0 && !this.paused) this.triggerLevelUp();

      // 勝負判定
      if (this.player.hp <= 0) { this.end("defeat"); return; }
      if (this.time >= this.stage.duration) { this.end("victory"); return; }
    },

    makeCtx: function () {
      var self = this;
      return {
        player: this.player,
        enemies: this.enemies,
        projectiles: this.projectiles,
        zones: this.zones,
        pulses: this.pulses,
        pickups: this.pickups,
        findNearestEnemy: function (x, y) { return self.findNearestEnemy(x, y); },
        onPurified: function (en) { self.onPurified(en); }
      };
    },

    findNearestEnemy: function (x, y) {
      var best = null, bd = Infinity;
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (e.dead) continue;
        var dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },

    collideProjectile: function (pr) {
      if (pr.dead) return;
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (e.dead) continue;
        if (pr.hitSet.indexOf(e) !== -1) continue;
        var dx = e.x - pr.x, dy = e.y - pr.y, rr = e.radius + pr.radius;
        if (dx * dx + dy * dy <= rr * rr) {
          pr.hitSet.push(e);
          if (e.takeDamage(pr.damage)) this.onPurified(e);
          if (pr.pierce <= 0) { pr.dead = true; return; }
          pr.pierce -= 1;
        }
      }
    },

    onPurified: function (e) {
      if (e._counted) return;
      e._counted = true;
      this.purifiedCount += 1;

      // 淨化特效
      this.puffs.push({ x: e.x, y: e.y, age: 0, life: 0.35, r: e.radius, color: e.isBoss ? "#6a5acd" : "#7cc36a" });

      // 經驗晶體
      if (e.isBoss) {
        for (var i = 0; i < 8; i++) {
          this.pickups.push(new global.Pickup("xp", e.x + rand(-30, 30), e.y + rand(-30, 30), Math.ceil(e.xp / 8)));
        }
      } else {
        this.pickups.push(new global.Pickup("xp", e.x, e.y, e.xp));
      }

      // 循環幣
      if (Math.random() < e.coinChance) {
        var amt = e.coinAmount || 1;
        this.pickups.push(new global.Pickup("coin", e.x + rand(-8, 8), e.y + rand(-8, 8), amt));
      }
      // 淨水瓶（低機率）
      if (e.isBoss || Math.random() < 0.015) {
        this.pickups.push(new global.Pickup("health", e.x + rand(-10, 10), e.y + rand(-10, 10)));
      }
      // 知識卡（仍有未解鎖時才掉落）
      if (this.lockedKnowledgeRemain() && (e.isBoss || Math.random() < 0.01)) {
        this.pickups.push(new global.Pickup("card", e.x + rand(-12, 12), e.y + rand(-12, 12)));
      }
    },

    lockedKnowledgeRemain: function () {
      return global.Storage.data.knowledge.length < global.GameData.knowledge.length;
    },

    collect: function (pk) {
      if (pk.type === "xp") {
        var ups = this.player.gainXp(pk.value);
        this.pendingLevelUps += ups;
        this.floaters.push({ x: pk.x, y: pk.y, age: 0, life: 0.6, text: "+" + pk.value, color: "#7cf08a" });
      } else if (pk.type === "coin") {
        this.runCoins += pk.value;
        this.floaters.push({ x: pk.x, y: pk.y, age: 0, life: 0.7, text: "♻+" + pk.value, color: "#4dd0c4" });
      } else if (pk.type === "health") {
        this.player.heal(pk.value);
        this.floaters.push({ x: pk.x, y: pk.y, age: 0, life: 0.7, text: "+" + pk.value + "HP", color: "#7fd0f5" });
      } else if (pk.type === "card") {
        var entry = global.Storage.unlockNextKnowledge();
        if (entry && this.app) this.app.onKnowledgeUnlocked(entry);
      }
    },

    cleanup: function () {
      this.enemies = this.enemies.filter(function (e) { return !e.dead; });
      this.projectiles = this.projectiles.filter(function (p) { return !p.dead; });
      this.zones = this.zones.filter(function (z) { return !z.dead; });
      this.pulses = this.pulses.filter(function (u) { return !u.dead; });
      this.pickups = this.pickups.filter(function (p) { return !p.dead; });
      this.puffs = this.puffs.filter(function (p) { return !p.dead; });
      this.floaters = this.floaters.filter(function (f) { return !f.dead; });
    },

    /* ---------------- 生成 ---------------- */
    spawnEnemies: function (dt) {
      if (this.enemies.length >= this.stage.maxEnemies) return;
      var wave = null;
      for (var i = 0; i < this.stage.waves.length; i++) {
        var w = this.stage.waves[i];
        if (this.time >= w.from && this.time < w.to) { wave = w; break; }
      }
      if (!wave) return;

      this.spawnAcc += dt;
      while (this.spawnAcc >= wave.interval) {
        this.spawnAcc -= wave.interval;
        for (var b = 0; b < wave.batch; b++) {
          if (this.enemies.length >= this.stage.maxEnemies) break;
          this.spawnOne(this.pickType(wave.types));
        }
      }
    },

    pickType: function (types) {
      var total = 0, i;
      for (i = 0; i < types.length; i++) total += types[i].weight;
      var r = Math.random() * total;
      for (i = 0; i < types.length; i++) { r -= types[i].weight; if (r <= 0) return types[i].enemy; }
      return types[0].enemy;
    },

    spawnOne: function (enemyId, forceBoss) {
      var def = global.GameData.getEnemy(enemyId);
      if (!def) return;
      var ang = Math.random() * Math.PI * 2;
      var rad = this.stage.spawnRadius + rand(0, 80);
      var x = this.player.x + Math.cos(ang) * rad;
      var y = this.player.y + Math.sin(ang) * rad;
      x = Math.max(20, Math.min(this.world.w - 20, x));
      y = Math.max(20, Math.min(this.world.h - 20, y));
      // 隨時間略微提升血量，維持挑戰性
      var hpScale = 1 + (this.time / this.stage.duration) * 0.6;
      if (def.isBoss) hpScale = 1;
      this.enemies.push(new global.Enemy(def, x, y, hpScale));
    },

    handleEvents: function () {
      var evs = this.stage.events || [];
      for (var i = 0; i < evs.length; i++) {
        var ev = evs[i];
        if (!this.firedEvents[i] && this.time >= ev.at) {
          this.firedEvents[i] = true;
          for (var c = 0; c < (ev.count || 1); c++) this.spawnOne(ev.enemy, true);
          if (ev.announce && this.app) this.app.showToast("警報", ev.announce);
        }
      }
    },

    /* ---------------- 升級 ---------------- */
    triggerLevelUp: function () {
      this.paused = true;
      var options = this.generateLevelUpOptions();
      var self = this;
      this.app.onLevelUp(options, function (choice) { self.resolveLevelUp(choice); });
    },

    generateLevelUpOptions: function () {
      var pool = [];
      var p = this.player;
      // 已有技能可強化
      for (var i = 0; i < p.weapons.length; i++) {
        var w = p.weapons[i];
        if (!w.isMax()) {
          var next = w.skill.levels[w.level]; // 升一級後的數值（含 up 文字）
          pool.push({
            kind: "skill_up", id: w.skill.id, icon: w.skill.iconId,
            name: w.skill.name, tag: "技能強化 Lv." + (w.level + 1),
            effect: next.up, edu: w.skill.eduText
          });
        }
      }
      // 學習新技能（未達上限時）
      if (p.weapons.length < MAX_WEAPONS) {
        var skills = global.GameData.skills;
        for (var s = 0; s < skills.length; s++) {
          if (!p.hasSkill(skills[s].id)) {
            pool.push({
              kind: "skill_new", id: skills[s].id, icon: skills[s].iconId,
              name: skills[s].name, tag: "新技能",
              effect: skills[s].desc, edu: skills[s].eduText
            });
          }
        }
      }
      // 通用能力（隨機若干，保證選項充足）
      var stats = shuffle(STAT_UPGRADES.slice());
      for (var t = 0; t < stats.length; t++) {
        pool.push({
          kind: "stat", id: stats[t].id, icon: stats[t].icon,
          name: stats[t].name, tag: "能力", effect: stats[t].effect, edu: stats[t].edu
        });
      }
      // 洗牌後優先保留技能類，再補能力，取 3 個
      var skillOpts = pool.filter(function (o) { return o.kind !== "stat"; });
      var statOpts = pool.filter(function (o) { return o.kind === "stat"; });
      shuffle(skillOpts);
      var chosen = skillOpts.slice(0, 3);
      var si = 0;
      while (chosen.length < 3 && si < statOpts.length) chosen.push(statOpts[si++]);
      return chosen;
    },

    resolveLevelUp: function (choice) {
      var p = this.player;
      if (choice.kind === "skill_up" || choice.kind === "skill_new") {
        p.addSkill(choice.id);
      } else if (choice.kind === "stat") {
        var su = null;
        for (var i = 0; i < STAT_UPGRADES.length; i++) if (STAT_UPGRADES[i].id === choice.id) su = STAT_UPGRADES[i];
        if (su) su.apply(p);
      }
      this.pendingLevelUps -= 1;
      if (this.pendingLevelUps > 0) {
        // 還有待處理的升級，連續再選
        this.triggerLevelUp();
      } else {
        this.paused = false;
        this.lastTs = 0; // 重置時間戳，避免暫停期間累積 dt
      }
    },

    /* ---------------- 結束 ---------------- */
    end: function (result) {
      if (this.ended) return;
      this.ended = true;
      this.running = false;

      var collected = this.runCoins;
      var purifyBonus = Math.floor(this.purifiedCount * 0.5);
      var timeBonus = Math.floor(this.time / 10);
      var winBonus = (result === "victory") ? 30 : 0;
      var subtotal = collected + purifyBonus + timeBonus + winBonus;
      var total = Math.floor(subtotal * this.player.coinMult);

      var stats = {
        result: result,
        survived: this.time,
        purified: this.purifiedCount,
        level: this.player.level,
        collected: collected,
        purifyBonus: purifyBonus,
        timeBonus: timeBonus,
        winBonus: winBonus,
        multiplier: this.player.coinMult,
        total: total
      };

      global.Storage.addCoins(total);
      if (this.app) this.app.onRunEnd(stats);
    },

    /* ---------------- 攝影機 ---------------- */
    updateCamera: function () {
      var cw = this.canvas.width, ch = this.canvas.height;
      var maxX = Math.max(0, this.world.w - cw);
      var maxY = Math.max(0, this.world.h - ch);
      this.camera.x = clamp(this.player.x - cw / 2, 0, maxX);
      this.camera.y = clamp(this.player.y - ch / 2, 0, maxY);
    },

    /* ---------------- 繪製 ---------------- */
    render: function () {
      var ctx = this.ctx;
      var cw = this.canvas.width, ch = this.canvas.height;
      var cam = this.camera;

      // 背景（只畫可視範圍）
      if (this.bg) {
        ctx.drawImage(this.bg, cam.x, cam.y, cw, ch, 0, 0, cw, ch);
      } else {
        ctx.fillStyle = "#0a2535"; ctx.fillRect(0, 0, cw, ch);
      }

      ctx.save();
      ctx.translate(-cam.x, -cam.y);

      var minX = cam.x - 40, maxX = cam.x + cw + 40, minY = cam.y - 40, maxY = cam.y + ch + 40;
      function vis(o, m) { m = m || 0; return o.x > minX - m && o.x < maxX + m && o.y > minY - m && o.y < maxY + m; }

      // 地面層：區域效果（在敵人下方）
      for (var z = 0; z < this.zones.length; z++) this.zones[z].draw(ctx);

      // 掉落物
      for (var k = 0; k < this.pickups.length; k++) if (vis(this.pickups[k])) this.pickups[k].draw(ctx);

      // 淨化特效
      for (var pf = 0; pf < this.puffs.length; pf++) {
        var p = this.puffs[pf]; var t = p.age / p.life;
        ctx.save(); ctx.globalAlpha = (1 - t) * 0.7; ctx.strokeStyle = p.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + t * 22, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }

      // 敵人
      for (var e = 0; e < this.enemies.length; e++) if (vis(this.enemies[e], 30)) this.enemies[e].draw(ctx);

      // 投射物
      for (var pr = 0; pr < this.projectiles.length; pr++) if (vis(this.projectiles[pr])) this.projectiles[pr].draw(ctx);

      // 玩家 + 環繞武器（葉片）
      this.player.draw(ctx);
      for (var w = 0; w < this.player.weapons.length; w++) this.player.weapons[w].draw(ctx);

      // 脈衝（在最上層）
      for (var u = 0; u < this.pulses.length; u++) this.pulses[u].draw(ctx);

      // 飄字
      ctx.textAlign = "center"; ctx.font = "bold 13px 'Courier New', monospace";
      for (var fl = 0; fl < this.floaters.length; fl++) {
        var ft = this.floaters[fl];
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - ft.age / ft.life);
        ctx.fillStyle = ft.color; ctx.fillText(ft.text, ft.x, ft.y); ctx.restore();
      }

      ctx.restore();

      // HUD（DOM）更新
      if (this.app && this.app.ui) this.app.ui.updateHUD(this);
    }
  };

  /* ---------------- 小工具 ---------------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }
  function shade(hex, amt) {
    var c = hex.replace("#", "");
    var r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), bl = parseInt(c.substr(4, 2), 16);
    r = clamp(r + amt, 0, 255); g = clamp(g + amt, 0, 255); bl = clamp(bl + amt, 0, 255);
    return "rgb(" + r + "," + g + "," + bl + ")";
  }

  global.Game = Game;
})(window);
