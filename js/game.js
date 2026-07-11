/* ============================================================
   game.js  —  核心遊戲迴圈與世界模擬
   負責：關卡計時、敵人生成、碰撞、淨化掉落、升級暫停、勝負判定。
   menu/shop/codex 等畫面由 ui.js + main.js 控制；本檔只管「玩」。
   ============================================================ */
(function (global) {

  var MAX_WEAPONS = 6;
  var VIEW_W = (global.Config ? global.Config.GAME_WIDTH : 1280);
  var VIEW_H = (global.Config ? global.Config.GAME_HEIGHT : 720);
  function ZOOM() { return global.Config ? global.Config.CAMERA_ZOOM : 1.8; }   // 世界層放大倍率（UI 不受影響）

  // 升級畫面用的通用能力選項（非技能）
  var STAT_UPGRADES = [
    { id: "vitality", name: "強健體魄", icon: "passive_vitality", effect: "最大生命值 +20，並回復 20",
      edu: "健康的身體，是長期投入永續行動的本錢。",
      apply: function (p) { p.maxHp += 20; p.heal(20); } },
    { id: "swift", name: "輕巧步伐", icon: "passive_swift", effect: "移動速度 +8%",
      edu: "步行與單車是幾乎零碳排的移動方式。",
      apply: function (p) { p.speed *= 1.08; } },
    { id: "sense", name: "敏銳感知", icon: "passive_sense", effect: "拾取範圍 +20%",
      edu: "多留心周遭，就能發現更多可回收的資源。",
      apply: function (p) { p.pickupRange *= 1.2; } },
    { id: "efficiency", name: "高效節能", icon: "passive_efficiency", effect: "所有技能冷卻 -6%",
      edu: "提升效率，用更少的能源做更多的事。",
      apply: function (p) { p.cooldownMult *= 0.94; } },
    { id: "mend", name: "淨水補給", icon: "passive_mend", effect: "立即回復 35 生命",
      edu: "潔淨的水，是所有生命賴以維繫的根本。",
      apply: function (p) { p.heal(35); } },
    { id: "eco_sneakers", name: "輕量步鞋", icon: "passive_eco_sneakers", effect: "移動速度 +6%（一次滿級）",
      edu: "舒適的步行裝備，能讓低碳移動更容易成為日常。", oneShot: true,
      apply: function (p) { p.speed *= 1.06; } },
    { id: "sorting_pouch", name: "分類小袋", icon: "passive_sorting_pouch", effect: "拾取範圍 +12%（一次滿級）",
      edu: "先分類再收集，能讓資源整理更有效率。", oneShot: true,
      apply: function (p) { p.pickupRange *= 1.12; } },
    { id: "refill_snack", name: "補給點心", icon: "passive_refill_snack", effect: "最大生命 +8，並回復 8（一次滿級）",
      edu: "適量補充體力，才能穩定完成長時間的環境行動。", oneShot: true,
      apply: function (p) { p.maxHp += 8; p.heal(8); } }
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
      // 固定內部邏輯解析度（16:9）；CSS 負責等比例縮放與置中，image-rendering:pixelated 保持銳利。
      var c = this.canvas;
      if (c.width !== VIEW_W) c.width = VIEW_W;
      if (c.height !== VIEW_H) c.height = VIEW_H;
      this.ctx.imageSmoothingEnabled = false;
    },

    /* ---------------- 開始一局 ---------------- */
    start: function (stageId, player) {
      this.stage = global.GameData.getStage(stageId);
      this.world = { w: this.stage.world.w, h: this.stage.world.h };
      this.player = player;

      this.enemies = [];
      this.projectiles = [];
      this.enemyProjectiles = [];
      this.deployables = [];
      this.zones = [];
      this.pulses = [];
      this.pickups = [];
      this.effects = [];
      this.puffs = [];
      this.floaters = [];

      this.time = 0;
      this.runCoins = 0;
      this.purifiedCount = 0;
      this.mapCleanedCount = 0;
      this.quizCorrect = 0;
      this.quizIncorrect = 0;
      this.quizStreak = 0;
      this.bestQuizStreak = 0;
      this.eliteRewardLevel = 0;
      this.player.eliteDamageMult = 1;
      this.quizIndex = 0;
      this.quizOrder = shuffle((global.GameData.sustainabilityQuestions || []).slice());
      this.pendingLevelUps = 0;
      this.knowledgePaused = false;
      this.knowledgeQueue = [];
      this.runIntroDuration = 5;
      this.runIntroRemaining = this.runIntroDuration;
      this.runIntroActive = true;
      this.firedEvents = {};
      this.spawnAcc = 0;
      this.mapObjectSpawnAcc = 0;
      this.mapObjectSpawnInterval = 5;
      this.nearestMapObjective = null;
      this.zoneDamageTimer = 0;
      this.contamination = this.makeContaminationState();

      this.camera = { x: 0, y: 0 };
      this.player.x = this.world.w / 2;
      this.player.y = this.world.h / 2;

      // 起始技能
      this.player.addSkill(this.player.character.startingSkill);

      this.buildBackground();

      this.running = true;
      this.paused = true;
      this.menuPaused = false;
      this.ended = false;
      this.lastTs = 0;

      this._hudSig = "";
      if (!this._looping) { this._looping = true; global.requestAnimationFrame(this._loop); }
    },

    stop: function () { this.running = false; },

    /* ---------------- 暫停 / 中止（選單用） ---------------- */
    isPausable: function () { return this.running && !this.ended && !this.runIntroActive && !this.paused && !this.menuPaused; },
    pauseGame: function () { if (!this.isPausable()) return false; this.menuPaused = true; return true; },
    resumeGame: function () { if (!this.menuPaused) return false; this.menuPaused = false; this.lastTs = 0; return true; },
    isMenuPaused: function () { return !!this.menuPaused; },
    // 立即中止本局並清空世界（回首頁用），確保不殘留敵人/子彈/掉落物/計時器/暫停狀態
    abort: function () {
      this.running = false; this.ended = true; this.menuPaused = false; this.paused = false;
      this.enemies = []; this.projectiles = []; this.enemyProjectiles = []; this.deployables = []; this.zones = []; this.pulses = [];
      this.pickups = []; this.effects = []; this.puffs = []; this.floaters = [];
      this.pendingLevelUps = 0; this.knowledgePaused = false; this.knowledgeQueue = [];
      this.runIntroActive = false; this.runIntroRemaining = 0; this.time = 0;
    },

    /* ---------------- 背景（離屏繪製一次） ---------------- */
    buildBackground: function () {
      // 改用素材驅動的 StageRenderer（tilemap + props）；缺圖時 StageRenderer 內部自行 fallback。
      if (global.StageRenderer) { global.StageRenderer.build(this.stage, 1337); this.bg = null; return; }
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
      if (!this.running) { this._looping = false; return; }
      if (!this.lastTs) this.lastTs = ts;
      var dt = (ts - this.lastTs) / 1000;
      this.lastTs = ts;
      if (dt > 0.05) dt = 0.05;          // 防止切到背景分頁後的大跳躍

      if (this.runIntroActive && !this.ended) this.updateRunIntro(dt);
      else if (!this.paused && !this.menuPaused && !this.ended) this.update(dt);
      this.render();

      if (this.running) global.requestAnimationFrame(this._loop);
    },

    updateRunIntro: function (dt) {
      this.runIntroRemaining = Math.max(0, this.runIntroRemaining - dt);
      if (this.runIntroRemaining > 0) return;
      this.finishRunIntro();
    },

    finishRunIntro: function () {
      if (!this.runIntroActive) return false;
      this.runIntroActive = false;
      this.runIntroRemaining = 0;
      this.paused = false;
      this.lastTs = 0;
      if (global.Input && global.Input.clearPresses) global.Input.clearPresses();
      return true;
    },

    skipRunIntro: function () {
      return this.finishRunIntro();
    },

    /* ---------------- 更新 ---------------- */
    update: function (dt) {
      this.time += dt;

      this.spawnEnemies(dt);
      this.handleEvents();

      var ctx = this.makeCtx();

      this.updateMapObjectSpawner(dt);
      this.updateMapInteractions(dt);
      this.player.update(dt, this.world);

      // 武器自動攻擊
      var ws = this.player.weapons;
      for (var i = 0; i < ws.length; i++) ws[i].update(dt, ctx);

      // 可部署裝置在世界中獨立存活、瞄準與射擊。
      for (var d = 0; d < this.deployables.length; d++) this.deployables[d].update(dt, ctx);

      // 投射物
      for (var p = 0; p < this.projectiles.length; p++) {
        var pr = this.projectiles[p];
        pr.update(dt);
        this.collideProjectile(pr);
      }

      for (var ep = 0; ep < this.enemyProjectiles.length; ep++) {
        var enemyProjectile = this.enemyProjectiles[ep];
        enemyProjectile.update(dt, this.world);
        this.collideEnemyProjectile(enemyProjectile);
      }

      // 區域（磁網 / 孢子）
      for (var z = 0; z < this.zones.length; z++) this.zones[z].update(dt, ctx);

      // 脈衝視覺
      for (var u = 0; u < this.pulses.length; u++) this.pulses[u].update(dt);

      // 敵人移動 + 接觸傷害
      for (var e = 0; e < this.enemies.length; e++) {
        var en = this.enemies[e];
        en.update(dt, this.player);
        var attack = en.consumeAttack ? en.consumeAttack() : null;
        if (attack) this.fireEnemyAttack(en, attack);
        var dx = en.x - this.player.x, dy = en.y - this.player.y;
        var rr = en.radius + this.player.radius;
        if ((!en.isSpawning || !en.isSpawning()) && dx * dx + dy * dy <= rr * rr) {
          this.player.takeDamage(en.contact);
        }
      }

      this.updateContamination(dt);

      // 掉落物拾取
      for (var k = 0; k < this.pickups.length; k++) {
        var pk = this.pickups[k];
        pk.update(dt, this.player);
        if (pk.collected) this.collect(pk);
      }
      if (this.knowledgePaused) {
        this.cleanup();
        this.updateCamera();
        return;
      }

      // 特效
      for (var f = 0; f < this.puffs.length; f++) {
        var pf = this.puffs[f]; pf.age += dt; if (pf.age >= pf.life) pf.dead = true;
      }
      for (var ef = 0; ef < this.effects.length; ef++) this.effects[ef].update(dt);
      for (var fl = 0; fl < this.floaters.length; fl++) {
        var ft = this.floaters[fl]; ft.age += dt; ft.y -= 18 * dt; if (ft.age >= ft.life) ft.dead = true;
      }

      this.cleanup();
      this.updateCamera();

      // 勝負判定
      if (this.player.hp <= 0) { this.end("defeat"); return; }
      if (this.time >= this.stage.duration) { this.end("victory"); return; }

      // 升級暫停放在死亡判定後，避免同一幀同時開啟問答與結算畫面。
      if (this.pendingLevelUps > 0 && !this.paused) this.triggerLevelUp();
    },

    makeCtx: function () {
      var self = this;
      return {
        player: this.player,
        enemies: this.enemies,
        projectiles: this.projectiles,
        deployables: this.deployables,
        zones: this.zones,
        pulses: this.pulses,
        pickups: this.pickups,
        effects: this.effects,
        world: this.world,
        findNearestEnemy: function (x, y) { return self.findNearestEnemy(x, y); },
        onPurified: function (en) { self.onPurified(en); }
      };
    },

    makeContaminationState: function () {
      var def = this.stage && this.stage.contaminationZone;
      if (!def) return null;
      var startsAt = def.startsAt || 0;
      if (global.TestMode && global.TestMode.enabled) {
        startsAt = Math.min(startsAt, this.stage.duration * 0.48);
      }
      return {
        def: def,
        startsAt: startsAt,
        x: this.world.w / 2,
        y: this.world.h / 2,
        radius: def.startRadius,
        projectedRadius: null,
        phase: "pending",
        step: 0,
        secondsUntilShrink: Math.max(0, startsAt - this.time),
        active: false,
        outside: false
      };
    },

    updateContamination: function (dt) {
      var zone = this.contamination;
      if (!zone) return;
      if (this.time < zone.startsAt) {
        zone.active = false;
        zone.outside = false;
        zone.phase = "pending";
        zone.projectedRadius = null;
        zone.secondsUntilShrink = Math.max(0, zone.startsAt - this.time);
        return;
      }

      zone.active = true;
      var steps = Math.max(1, zone.def.steps || 4);
      var warning = Math.max(1, zone.def.warningDuration || 12);
      var shrinking = Math.max(1, zone.def.shrinkDuration || 8);
      var hold = Math.max(0, zone.def.holdDuration || 26);
      var cycle = warning + shrinking + hold;
      var elapsed = Math.max(0, this.time - zone.startsAt);
      var step = Math.floor(elapsed / cycle);
      var phaseTime = elapsed - step * cycle;

      if (step >= steps) {
        zone.step = steps;
        zone.phase = "final";
        zone.radius = zone.def.endRadius;
        zone.projectedRadius = null;
        zone.secondsUntilShrink = 0;
      } else {
        var baseRadius = lerp(zone.def.startRadius, zone.def.endRadius, step / steps);
        var targetRadius = lerp(zone.def.startRadius, zone.def.endRadius, (step + 1) / steps);
        zone.step = step;
        if (phaseTime < warning) {
          zone.phase = "warning";
          zone.radius = baseRadius;
          zone.projectedRadius = targetRadius;
          zone.secondsUntilShrink = warning - phaseTime;
        } else if (phaseTime < warning + shrinking) {
          zone.phase = "shrinking";
          zone.radius = lerp(baseRadius, targetRadius, (phaseTime - warning) / shrinking);
          zone.projectedRadius = targetRadius;
          zone.secondsUntilShrink = 0;
        } else {
          zone.phase = "hold";
          zone.radius = targetRadius;
          zone.projectedRadius = null;
          zone.secondsUntilShrink = step + 1 < steps
            ? (cycle - phaseTime) + warning
            : 0;
        }
      }

      var dx = this.player.x - zone.x;
      var dy = this.player.y - zone.y;
      zone.outside = dx * dx + dy * dy > Math.pow(Math.max(0, zone.radius - this.player.radius), 2);
      if (!zone.outside) {
        this.zoneDamageTimer = 0;
        return;
      }

      this.zoneDamageTimer -= dt;
      if (this.zoneDamageTimer <= 0) {
        this.zoneDamageTimer = zone.def.tickInterval || 1;
        if (this.player.takeDamage(zone.def.damagePerTick || 2)) {
          this.floaters.push({
            x: this.player.x,
            y: this.player.y - 24,
            age: 0,
            life: 0.7,
            text: "污染區 -" + (zone.def.damagePerTick || 2),
            color: "#e97885"
          });
        }
      }
    },

    contaminationStatus: function () {
      var zone = this.contamination;
      if (!zone) return "";
      if (!zone.active) return "污染圈預告 " + Math.max(0, Math.ceil(zone.startsAt - this.time)) + "s";
      if (zone.outside) return "警告：回到綠色安全圈";
      if (zone.phase === "warning") return "紅圈縮小倒數 " + Math.max(0, Math.ceil(zone.secondsUntilShrink)) + "s";
      if (zone.phase === "shrinking") return "污染圈縮小中";
      if (zone.phase === "hold" && zone.secondsUntilShrink > 0) return "下次縮圈 " + Math.ceil(zone.secondsUntilShrink) + "s";
      return "最終安全區";
    },

    updateMapObjectSpawner: function (dt) {
      var renderer = global.StageRenderer;
      if (!renderer || !renderer.built || !renderer.spawnRandomObject) return;
      this.mapObjectSpawnAcc += dt;
      while (this.mapObjectSpawnAcc >= this.mapObjectSpawnInterval) {
        this.mapObjectSpawnAcc -= this.mapObjectSpawnInterval;
        renderer.spawnRandomObject(this.player);
      }
    },

    collectMapObject: function (prop) {
      prop.collected = true;
      this.mapCleanedCount += 1;

      if (prop.xp > 0) this.pickups.push(new global.Pickup("xp", prop.x, prop.y, prop.xp));
      var coinCount = prop.coins || 0;
      if (prop.coinChance && Math.random() < prop.coinChance) coinCount += 1;
      for (var c = 0; c < coinCount; c++) {
        this.pickups.push(new global.Pickup("coin", prop.x + (c * 8), prop.y, 1));
      }

      this.puffs.push({ x: prop.x, y: prop.y, age: 0, life: 0.5, r: 13, color: prop.color || "#7cc36a" });
      this.floaters.push({
        x: prop.x,
        y: prop.y,
        age: 0,
        life: 0.85,
        text: prop.label || "回收資源",
        color: prop.color || "#8ff0a0"
      });
    },

    updateMapInteractions: function () {
      this.player.environmentSpeedMult = 1;
      var renderer = global.StageRenderer;
      var props = renderer && renderer.props;
      if (!props) return;

      var nearest = null;
      for (var i = 0; i < props.length; i++) {
        var p = props[i];
        if (!p.collectible || p.collected) continue;
        var dx = this.player.x - p.x;
        var dy = this.player.y - p.y;
        var d2 = dx * dx + dy * dy;

        var collectRadius = p.collectRadius || 34;
        if (d2 < collectRadius * collectRadius) this.collectMapObject(p);
        else if (!nearest || d2 < nearest.distance2) nearest = { prop: p, distance2: d2 };
      }
      if (renderer.removeCollected) renderer.removeCollected();
      this.nearestMapObjective = nearest;
    },

    mapObjectiveStatus: function () {
      var target = this.nearestMapObjective;
      if (!target || !target.prop) {
        var wait = Math.max(0, Math.ceil(this.mapObjectSpawnInterval - this.mapObjectSpawnAcc));
        return "散落資源 " + wait + "s 後出現";
      }
      var dx = target.prop.x - this.player.x;
      var dy = target.prop.y - this.player.y;
      var angle = Math.atan2(dy, dx);
      var arrows = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
      var index = Math.round(angle / (Math.PI / 4));
      if (index < 0) index += 8;
      return "散落資源 " + Math.round(Math.sqrt(target.distance2)) + "m " + arrows[index % 8];
    },

    fireEnemyAttack: function (enemy, attack) {
      if (!global.EnemyProjectile) return;
      if (this.enemyProjectiles.length >= 220) return;
      var r = attack.config;
      var count = r.kind === "radial" ? (r.count || 8) : 1;
      var baseAngle = r.kind === "radial" ? this.time * 0.35 : Math.atan2(attack.aimY, attack.aimX);
      for (var i = 0; i < count; i++) {
        if (this.enemyProjectiles.length >= 220) break;
        var angle = r.kind === "radial" ? baseAngle + i * Math.PI * 2 / count : baseAngle;
        var speed = r.projectileSpeed || 140;
        var radius = r.projectileRadius || 7;
        this.enemyProjectiles.push(new global.EnemyProjectile(
          enemy.x + Math.cos(angle) * (enemy.radius + radius + 2),
          enemy.y + Math.sin(angle) * (enemy.radius + radius + 2),
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          {
            damage: r.projectileDamage || 6,
            radius: radius,
            color: r.color,
            sourceId: enemy.id,
            visualId: r.visualId || null
          }
        ));
      }
    },

    collideEnemyProjectile: function (projectile) {
      if (projectile.dead) return;
      var dx = projectile.x - this.player.x;
      var dy = projectile.y - this.player.y;
      var rr = projectile.radius + this.player.radius;
      if (dx * dx + dy * dy > rr * rr) return;
      projectile.dead = true;
      this.player.takeDamage(projectile.damage);
      this.puffs.push({ x: projectile.x, y: projectile.y, age: 0, life: 0.24, r: projectile.radius, color: projectile.color });
    },

    spawnEffect: function (effectId, groupName, x, y, opt) {
      if (!global.SkillEffectRenderer || !global.SkillEffectRenderer.VisualEffect) return false;
      if (!global.SkillEffectRenderer.ready(effectId, groupName)) return false;
      this.effects.push(new global.SkillEffectRenderer.VisualEffect(effectId, groupName, x, y, opt || {}));
      return true;
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
          var projectileDamage = pr.damage * (e.isElite ? (pr.eliteMult || 1) : 1);
          var killed = e.takeDamage(projectileDamage);
          this.spawnEffect(pr.hitEffectId || "seed_blade", pr.hitEffectGroup || "hit", pr.x, pr.y, {
            life: 0.22,
            size: (global.Config ? 42 / global.Config.CAMERA_ZOOM : 24),
            rotation: Math.atan2(pr.vy, pr.vx)
          });
          if (killed) this.onPurified(e);
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
      this.spawnEffect("common", "purify_pop", e.x, e.y, {
        life: 0.38,
        size: Math.max(e.radius * 3.4, (global.Config ? 58 / global.Config.CAMERA_ZOOM : 34))
      });

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
      var knowledgeMilestone = this.purifiedCount > 0 && this.purifiedCount % 32 === 0;
      if (this.lockedKnowledgeRemain() && (e.isBoss || knowledgeMilestone || Math.random() < 0.018)) {
        this.pickups.push(new global.Pickup("card", e.x + rand(-12, 12), e.y + rand(-12, 12)));
        this.puffs.push({ x: e.x, y: e.y, age: 0, life: 0.8, r: 22, color: "#ffd84a" });
        this.floaters.push({ x: e.x, y: e.y - 10, age: 0, life: 1.2, text: "永續知識卡出現！", color: "#fff19a" });
      }
    },

    lockedKnowledgeRemain: function () {
      return global.Storage.data.knowledge.length < global.GameData.knowledge.length;
    },

    collect: function (pk) {
      if (pk.type === "xp") {
        var ups = this.player.gainXp(pk.value);
        this.pendingLevelUps += ups;
        this.spawnEffect("common", "pickup_sparkle", pk.x, pk.y, {
          life: 0.32,
          size: (global.Config ? 36 / global.Config.CAMERA_ZOOM : 22)
        });
        this.floaters.push({ x: pk.x, y: pk.y, age: 0, life: 0.6, text: "+" + pk.value, color: "#7cf08a" });
      } else if (pk.type === "coin") {
        this.runCoins += pk.value;
        this.spawnEffect("common", "pickup_sparkle", pk.x, pk.y, {
          life: 0.32,
          size: (global.Config ? 38 / global.Config.CAMERA_ZOOM : 24)
        });
        this.floaters.push({ x: pk.x, y: pk.y, age: 0, life: 0.7, text: "♻+" + pk.value, color: "#4dd0c4" });
      } else if (pk.type === "health") {
        this.player.heal(pk.value);
        this.floaters.push({ x: pk.x, y: pk.y, age: 0, life: 0.7, text: "+" + pk.value + "HP", color: "#7fd0f5" });
      } else if (pk.type === "card") {
        var entry = global.Storage.unlockNextKnowledge();
        this.puffs.push({ x: pk.x, y: pk.y, age: 0, life: 0.9, r: 28, color: "#ffd84a" });
        this.spawnEffect("common", "purify_pop", pk.x, pk.y, { life: 0.5, size: 58 / ZOOM() });
        if (entry) this.pauseForKnowledgeCard(entry);
      }
    },

    pauseForKnowledgeCard: function (entry) {
      if (!entry || this.ended) return;
      if (this.knowledgePaused) {
        this.knowledgeQueue.push(entry);
        return;
      }
      this.knowledgePaused = true;
      this.paused = true;
      var self = this;
      if (this.app && this.app.onKnowledgeUnlocked) {
        this.app.onKnowledgeUnlocked(entry, function () { self.resumeKnowledgeCard(); });
      } else {
        this.resumeKnowledgeCard();
      }
    },

    resumeKnowledgeCard: function () {
      if (!this.knowledgePaused) return;
      if (this.knowledgeQueue.length) {
        var next = this.knowledgeQueue.shift();
        var self = this;
        if (this.app && this.app.onKnowledgeUnlocked) {
          this.app.onKnowledgeUnlocked(next, function () { self.resumeKnowledgeCard(); });
          return;
        }
      }
      this.knowledgePaused = false;
      this.paused = false;
      if (global.Input && global.Input.clearPresses) global.Input.clearPresses();
      this.lastTs = 0;
      if (this.pendingLevelUps > 0) this.triggerLevelUp();
    },

    cleanup: function () {
      this.enemies = this.enemies.filter(function (e) { return !e.dead; });
      this.projectiles = this.projectiles.filter(function (p) { return !p.dead; });
      this.enemyProjectiles = this.enemyProjectiles.filter(function (p) { return !p.dead; });
      this.deployables = this.deployables.filter(function (d) { return !d.dead; });
      this.zones = this.zones.filter(function (z) { return !z.dead; });
      this.pulses = this.pulses.filter(function (u) { return !u.dead; });
      this.pickups = this.pickups.filter(function (p) { return !p.dead; });
      this.effects = this.effects.filter(function (e) { return !e.dead; });
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
      if (def.isElite && !forceBoss) {
        var eliteCount = 0;
        for (var i = 0; i < this.enemies.length; i++) {
          if (!this.enemies[i].dead && this.enemies[i].isElite) eliteCount += 1;
        }
        if (eliteCount >= (this.stage.maxElites || 5)) {
          def = global.GameData.getEnemy(Math.random() < 0.5 ? "plastic_bag" : "butt_bug");
        }
      }
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
      var question = this.nextQuizQuestion();
      function showChoices() {
        self.app.onLevelUp(options, function (choice) { self.resolveLevelUp(choice); });
      }
      if (question && this.app && this.app.onSustainabilityQuiz) {
        this.app.onSustainabilityQuiz(question, function (result) {
          self.applyQuizAnswer(result);
          showChoices();
        });
      } else {
        showChoices();
      }
    },

    nextQuizQuestion: function () {
      if (!this.quizOrder || !this.quizOrder.length) return null;
      if (this.quizIndex >= this.quizOrder.length) {
        this.quizOrder = shuffle(this.quizOrder.slice());
        this.quizIndex = 0;
      }
      return this.quizOrder[this.quizIndex++];
    },

    applyQuizAnswer: function (result) {
      if (!result) return;
      if (result.correct) {
        this.quizCorrect += 1;
        this.quizStreak += 1;
        this.bestQuizStreak = Math.max(this.bestQuizStreak, this.quizStreak);
        var heal = Math.max(6, Math.round(this.player.maxHp * 0.08));
        this.player.heal(heal);
        this.runCoins += 2;
        this.floaters.push({ x: this.player.x, y: this.player.y - 30, age: 0, life: 0.9, text: "答對！連勝 " + this.quizStreak + "  +" + heal + " HP", color: "#8ff0a0" });
        if (this.quizStreak >= 10 && this.eliteRewardLevel < 2) {
          this.eliteRewardLevel = 2;
          this.player.eliteDamageMult = 1.7;
          if (this.app) this.app.showToast("精英解析 II", "連續答對 10 題：對綠色精英傷害提升至 1.7 倍。 ");
        } else if (this.quizStreak >= 5 && this.eliteRewardLevel < 1) {
          this.eliteRewardLevel = 1;
          this.player.eliteDamageMult = 1.35;
          if (this.app) this.app.showToast("精英解析 I", "連續答對 5 題：對綠色精英傷害提升至 1.35 倍。 ");
        }
      } else {
        this.quizIncorrect += 1;
        this.quizStreak = 0;
        var penalty = Math.max(4, Math.round(this.player.maxHp * 0.05));
        this.player.hp = Math.max(1, this.player.hp - penalty);
        this.player.hitFlash = 0.18;
        this.floaters.push({ x: this.player.x, y: this.player.y - 30, age: 0, life: 0.9, text: "答錯：污染壓力 -" + penalty + " HP", color: "#ff9a9a" });
      }
    },

    generateLevelUpOptions: function () {
      var pool = [];
      var p = this.player;
      p.oneShotUpgrades = p.oneShotUpgrades || {};
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
        if (stats[t].oneShot && p.oneShotUpgrades[stats[t].id]) continue;
        pool.push({
          kind: "stat", id: stats[t].id, icon: stats[t].icon,
          name: stats[t].name, tag: stats[t].oneShot ? "一次滿級" : "能力",
          effect: stats[t].effect, edu: stats[t].edu, oneShot: !!stats[t].oneShot
        });
      }
      // 每輪保留兩個主技能槽，另提供一個輕量能力槽；一次滿級能力優先出現。
      var skillOpts = pool.filter(function (o) { return o.kind !== "stat"; });
      var oneShotOpts = pool.filter(function (o) { return o.kind === "stat" && o.oneShot; });
      var repeatStatOpts = pool.filter(function (o) { return o.kind === "stat" && !o.oneShot; });
      shuffle(skillOpts);
      shuffle(oneShotOpts);
      shuffle(repeatStatOpts);
      var chosen = skillOpts.slice(0, 2);
      if (oneShotOpts.length) chosen.push(oneShotOpts[0]);
      else if (repeatStatOpts.length) chosen.push(repeatStatOpts[0]);
      var remaining = skillOpts.concat(oneShotOpts, repeatStatOpts);
      for (var si = 0; chosen.length < 3 && si < remaining.length; si++) {
        if (chosen.indexOf(remaining[si]) === -1) chosen.push(remaining[si]);
      }
      return shuffle(chosen);
    },

    applyPassiveUpgrade: function (id) {
      var p = this.player;
      if (!p) return false;
      p.oneShotUpgrades = p.oneShotUpgrades || {};
      p.passiveUpgrades = p.passiveUpgrades || {};
      p.passiveUpgradeOrder = p.passiveUpgradeOrder || [];

      var upgrade = null;
      for (var i = 0; i < STAT_UPGRADES.length; i++) {
        if (STAT_UPGRADES[i].id === id) {
          upgrade = STAT_UPGRADES[i];
          break;
        }
      }
      if (!upgrade || (upgrade.oneShot && p.oneShotUpgrades[id])) return false;

      upgrade.apply(p);
      if (upgrade.oneShot) p.oneShotUpgrades[id] = true;
      if (!p.passiveUpgrades[id]) {
        p.passiveUpgrades[id] = {
          id: id,
          name: upgrade.name,
          icon: upgrade.icon,
          effect: upgrade.effect,
          oneShot: !!upgrade.oneShot,
          level: 0
        };
        p.passiveUpgradeOrder.push(id);
      }
      p.passiveUpgrades[id].level += 1;
      return true;
    },

    resolveLevelUp: function (choice) {
      var p = this.player;
      if (choice.kind === "skill_up" || choice.kind === "skill_new") {
        p.addSkill(choice.id);
      } else if (choice.kind === "stat") {
        this.applyPassiveUpgrade(choice.id);
      }
      this.pendingLevelUps -= 1;
      if (this.pendingLevelUps > 0) {
        // 還有待處理的升級，連續再選
        this.triggerLevelUp();
      } else {
        this.paused = false;
        if (global.Input && global.Input.clearPresses) global.Input.clearPresses();
        this.lastTs = 0; // 重置時間戳，避免暫停期間累積 dt
      }
    },

    /* ---------------- 結束 ---------------- */
    end: function (result) {
      if (this.ended) return;
      this.ended = true;
      this.running = false;
      this.paused = false;
      this.menuPaused = false;
      this.runIntroActive = false;
      this.runIntroRemaining = 0;
      // end() 可能在既有 animation frame 中途發生；主迴圈不會再進入開頭分支，
      // 因此要在這裡明確釋放旗標，讓「再試一次」能重新 requestAnimationFrame。
      this._looping = false;
      this.lastTs = 0;

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
        mapCleaned: this.mapCleanedCount,
        quizCorrect: this.quizCorrect,
        quizIncorrect: this.quizIncorrect,
        bestQuizStreak: this.bestQuizStreak,
        eliteRewardLevel: this.eliteRewardLevel,
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
      // 攝影機以「世界座標」運作；可視世界範圍 = 畫面尺寸 / zoom
      var z = ZOOM();
      var vw = this.canvas.width / z, vh = this.canvas.height / z;
      var maxX = Math.max(0, this.world.w - vw);
      var maxY = Math.max(0, this.world.h - vh);
      this.camera.x = clamp(this.player.x - vw / 2, 0, maxX);
      this.camera.y = clamp(this.player.y - vh / 2, 0, maxY);
    },

    drawContaminationZone: function (ctx) {
      var zone = this.contamination;
      if (!zone || !zone.active) return;
      ctx.save();
      ctx.fillStyle = "rgba(93, 33, 91, 0.16)";
      ctx.beginPath();
      ctx.rect(0, 0, this.world.w, this.world.h);
      ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2, true);
      ctx.fill("evenodd");
      ctx.strokeStyle = zone.outside ? "rgba(255, 103, 121, 0.95)" : "rgba(113, 231, 168, 0.85)";
      ctx.lineWidth = 4 / ZOOM();
      ctx.setLineDash([12 / ZOOM(), 8 / ZOOM()]);
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
      ctx.stroke();

      if (zone.projectedRadius != null && zone.projectedRadius < zone.radius - 1) {
        ctx.fillStyle = "rgba(255, 78, 96, 0.08)";
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
        ctx.arc(zone.x, zone.y, zone.projectedRadius, 0, Math.PI * 2, true);
        ctx.fill("evenodd");
        ctx.strokeStyle = "rgba(255, 78, 96, 0.95)";
        ctx.lineWidth = 3 / ZOOM();
        ctx.setLineDash([7 / ZOOM(), 5 / ZOOM()]);
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.projectedRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    },

    /* ---------------- 繪製 ---------------- */
    render: function () {
      var ctx = this.ctx;
      var cw = this.canvas.width, ch = this.canvas.height;
      var cam = this.camera;

      // 清背景
      ctx.fillStyle = "#0a2535"; ctx.fillRect(0, 0, cw, ch);

      // ===== 世界層：套用 camera zoom + translate（UI 層之後另外畫，不受 zoom 影響） =====
      var z = ZOOM();
      var vw = cw / z, vh = ch / z;   // 可視世界範圍
      ctx.save();
      ctx.scale(z, z);
      ctx.translate(-cam.x, -cam.y);

      // 背景：tilemap + props（優先圖片素材，缺圖時 StageRenderer 內部 fallback）
      if (global.StageRenderer && global.StageRenderer.built) {
        global.StageRenderer.draw(ctx, cam.x, cam.y, vw, vh);
      } else if (this.bg) {
        ctx.drawImage(this.bg, cam.x, cam.y, vw, vh, cam.x, cam.y, vw, vh);
      }

      this.drawContaminationZone(ctx);

      var minX = cam.x - 40, maxX = cam.x + vw + 40, minY = cam.y - 40, maxY = cam.y + vh + 40;
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

      // 可部署裝置（地面層、敵人下方）
      for (var dp = 0; dp < this.deployables.length; dp++) {
        if (vis(this.deployables[dp], 50)) this.deployables[dp].draw(ctx);
      }

      // 敵人
      for (var e = 0; e < this.enemies.length; e++) if (vis(this.enemies[e], 30)) this.enemies[e].draw(ctx);

      // 投射物
      for (var pr = 0; pr < this.projectiles.length; pr++) if (vis(this.projectiles[pr])) this.projectiles[pr].draw(ctx);

      // 敵方彈幕（在玩家下方，保持閃避路徑清楚）
      for (var ep = 0; ep < this.enemyProjectiles.length; ep++) {
        if (vis(this.enemyProjectiles[ep], 30)) this.enemyProjectiles[ep].draw(ctx);
      }

      // 圖片化一次性特效（命中、淨化、拾取）
      for (var ef = 0; ef < this.effects.length; ef++) {
        var vfx = this.effects[ef];
        if (vis(vfx, 80)) vfx.draw(ctx);
      }

      // 玩家 + 環繞武器（葉片）
      this.player.draw(ctx);
      for (var w = 0; w < this.player.weapons.length; w++) this.player.weapons[w].draw(ctx);

      // 脈衝（在最上層）
      for (var u = 0; u < this.pulses.length; u++) this.pulses[u].draw(ctx);

      // 飄字
      for (var fl = 0; fl < this.floaters.length; fl++) {
        var ft = this.floaters[fl];
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - ft.age / ft.life);
        if (global.UI_THEME) global.UI_THEME.drawOutlinedText(ctx, ft.text, ft.x, ft.y, { fontSize: 15, fill: ft.color, strokeWidth: 3 });
        else { ctx.textAlign = "center"; ctx.fillStyle = ft.color; ctx.fillText(ft.text, ft.x, ft.y); }
        ctx.restore();
      }

      ctx.restore();

      // debugUI：視窗邊框 + 滑鼠內部座標十字準星
      if (global.Debug && global.Debug.enabled) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,60,240,0.7)"; ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, cw - 1, ch - 1);
        var mm = (global.Input && global.Input.getMouse) ? global.Input.getMouse() : null;
        if (mm) { ctx.beginPath(); ctx.moveTo(mm.x, 0); ctx.lineTo(mm.x, ch); ctx.moveTo(0, mm.y); ctx.lineTo(cw, mm.y); ctx.stroke(); }
        ctx.restore();
      }

      // HUD（DOM）更新
      if (this.app && this.app.ui) this.app.ui.updateHUD(this);
    }
  };

  /* ---------------- 小工具 ---------------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }
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

  Game.VIEW_W = VIEW_W; Game.VIEW_H = VIEW_H;
  global.Game = Game;
})(window);
