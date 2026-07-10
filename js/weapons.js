/* ============================================================
   weapons.js  —  自動攻擊的武器/技能行為 + 投射物 / 區域 / 脈衝
   每個 Weapon 包一個 skill；依 skill.type 表現不同行為：
     projectile 種子飛刃 / aura 回收磁網 / pulse 太陽能脈衝
     orbit 風力葉片 / zone 堆肥孢子
   update(dt, ctx) 會把效果放進 ctx 的 projectiles / zones / pulses。
   ============================================================ */
(function (global) {

  /* ---------------- 投射物（種子飛刃） ---------------- */
  function Projectile(x, y, vx, vy, damage, pierce, radius) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.pierce = pierce;
    this.radius = radius || 6;
    this.life = 2.2;
    this.dead = false;
    this.spin = Math.random() * Math.PI;
    this.visualAge = 0;
    this.hitSet = [];   // 已命中的敵人，避免同一發重複打同一隻
  }
  Projectile.prototype.update = function (dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.spin += dt * 12;
    this.visualAge += dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  };
  Projectile.prototype.draw = function (ctx) {
    // 視覺大小取自 RENDER_SIZES（碰撞半徑 this.radius 不變，不影響命中判定）
    var vr = (global.Config ? (global.Config.RENDER_SIZES.projectile / 2) / global.Config.CAMERA_ZOOM : this.radius);
    var fx = global.SkillEffectRenderer;
    if (fx && fx.drawFrame) {
      var imgSize = (global.Config ? global.Config.RENDER_SIZES.projectile / global.Config.CAMERA_ZOOM : this.radius * 2.4);
      var frame = Math.floor(this.visualAge * 18);
      var angle = Math.atan2(this.vy, this.vx);
      if (fx.drawFrame(ctx, "seed_blade", "projectile", frame, this.x, this.y, {
        size: imgSize * 1.8,
        rotation: angle,
        alpha: 0.95
      })) return;
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.spin);
    ctx.fillStyle = "#7cc36a";
    ctx.beginPath();
    ctx.ellipse(0, 0, vr, vr * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2e7d32";
    ctx.fillRect(-1, -vr, 2, vr * 2);
    ctx.restore();
  };

  /* ---------------- 區域（回收磁網 / 堆肥孢子） ---------------- */
  function Zone(x, y, opt) {
    this.x = x; this.y = y;
    this.radius = opt.radius;
    this.dps = opt.dps;
    this.duration = opt.duration;
    this.life = opt.duration;
    this.follow = opt.follow || null;       // 跟隨的 player（磁網）或 null（靜態孢子）
    this.pullXP = !!opt.pullXP;
    this.pull = opt.pull || 0;
    this.style = opt.style || "compost";    // 'net' or 'compost'
    this.dead = false;
    this.pulse = Math.random() * Math.PI * 2;
  }
  Zone.prototype.update = function (dt, ctx) {
    this.life -= dt;
    this.pulse += dt * 5;
    if (this.follow) { this.x = this.follow.x; this.y = this.follow.y; }
    if (this.life <= 0) { this.dead = true; return; }

    // 對範圍內敵人造成持續傷害
    var enemies = ctx.enemies;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead) continue;
      var dx = e.x - this.x, dy = e.y - this.y;
      if (dx * dx + dy * dy <= (this.radius + e.radius) * (this.radius + e.radius)) {
        if (e.takeDamage(this.dps * dt)) ctx.onPurified(e);
      }
    }

    // 磁網：把範圍內的經驗/掉落物吸過來
    if (this.pullXP && this.pull > 0) {
      var pk = ctx.pickups;
      for (var j = 0; j < pk.length; j++) {
        var p = pk[j];
        if (p.dead) continue;
        var ddx = this.x - p.x, ddy = this.y - p.y;
        var d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.0001;
        if (d < this.radius) {
          var f = 130 * this.pull;
          p.x += (ddx / d) * f * dt;
          p.y += (ddy / d) * f * dt;
        }
      }
    }
  };
  Zone.prototype.draw = function (ctx) {
    var t = this.life / this.duration;
    var wob = Math.sin(this.pulse) * 3;
    var fx = global.SkillEffectRenderer;
    if (fx && fx.drawFrame) {
      if (this.style === "net") {
        var netFrame = Math.floor(this.pulse * 1.4);
        if (fx.drawFrame(ctx, "recycle_net", "aoe", netFrame, this.x, this.y, {
          size: (this.radius + wob) * 2,
          alpha: 0.86
        })) return;
      } else {
        var areaFrame = Math.floor(this.pulse * 1.2);
        if (fx.drawFrame(ctx, "compost_spore", "area", areaFrame, this.x, this.y, {
          size: (this.radius + wob) * 2,
          alpha: 0.82
        })) return;
      }
    }
    ctx.save();
    if (this.style === "net") {
      ctx.globalAlpha = 0.18 + 0.10 * t;
      ctx.fillStyle = "#4dd0c4";
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + wob, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = "#7fe9df"; ctx.lineWidth = 2;
      for (var rr = 0.4; rr <= 1.0; rr += 0.3) {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * rr, 0, Math.PI * 2); ctx.stroke();
      }
    } else {
      ctx.globalAlpha = 0.16 + 0.10 * t;
      ctx.fillStyle = "#8d6e4f";
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + wob, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "#9ccc65";
      for (var k = 0; k < 7; k++) {
        var a = this.pulse * 0.3 + k * (Math.PI * 2 / 7);
        var rad = this.radius * (0.3 + 0.6 * ((k % 3) / 3));
        ctx.beginPath();
        ctx.arc(this.x + Math.cos(a) * rad, this.y + Math.sin(a) * rad, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  /* ---------------- 脈衝（太陽能脈衝，純視覺；傷害於生成瞬間結算） ---------------- */
  function Pulse(x, y, radius) {
    this.x = x; this.y = y;
    this.maxR = radius;
    this.age = 0;
    this.life = 0.45;
    this.dead = false;
  }
  Pulse.prototype.update = function (dt) {
    this.age += dt;
    if (this.age >= this.life) this.dead = true;
  };
  Pulse.prototype.draw = function (ctx) {
    var t = this.age / this.life;
    var r = this.maxR * t;
    var fx = global.SkillEffectRenderer;
    if (fx && fx.drawFrame) {
      var count = fx.frameCount("solar_pulse", "pulse");
      var frame = count ? Math.min(count - 1, Math.floor(t * count)) : 0;
      if (fx.drawFrame(ctx, "solar_pulse", "pulse", frame, this.x, this.y, {
        size: Math.max(8, this.maxR * 2),
        alpha: Math.max(0, 1 - t)
      })) return;
    }
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.8;
    ctx.strokeStyle = "#ffce3d";
    ctx.lineWidth = 5 * (1 - t) + 1;
    ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = (1 - t) * 0.25;
    ctx.fillStyle = "#ffce3d";
    ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  /* ---------------- Weapon：包裝技能、管理冷卻與行為 ---------------- */
  function Weapon(skill, player) {
    this.skill = skill;
    this.player = player;
    this.level = 1;
    this.timer = 0.4;          // 初始稍微延遲首發
    this.angle = Math.random() * Math.PI * 2; // 給 orbit 用
    this.blades = [];
  }

  Weapon.prototype.stats = function () { return this.skill.levels[this.level - 1]; };
  Weapon.prototype.isMax = function () { return this.level >= this.skill.maxLevel; };
  Weapon.prototype.levelUp = function () { if (!this.isMax()) this.level += 1; };
  Weapon.prototype.cd = function (base) { return base * this.player.cooldownMult; };

  Weapon.prototype.update = function (dt, ctx) {
    var s = this.stats();
    switch (this.skill.type) {

      case "projectile": {
        this.timer -= dt;
        if (this.timer <= 0) {
          var target = ctx.findNearestEnemy(this.player.x, this.player.y);
          if (target) {
            var baseAng = Math.atan2(target.y - this.player.y, target.x - this.player.x);
            var count = s.count;
            var spread = 0.16;
            for (var i = 0; i < count; i++) {
              var off = (count === 1) ? 0 : (i - (count - 1) / 2) * spread;
              var ang = baseAng + off;
              ctx.projectiles.push(new Projectile(
                this.player.x, this.player.y,
                Math.cos(ang) * s.speed, Math.sin(ang) * s.speed,
                s.damage, s.pierce, 6
              ));
            }
            this.timer = this.cd(s.cooldown);
          } else {
            this.timer = 0.2; // 沒有目標，稍後重試
          }
        }
        break;
      }

      case "aura": {
        this.timer -= dt;
        if (this.timer <= 0) {
          ctx.zones.push(new Zone(this.player.x, this.player.y, {
            radius: s.radius, dps: s.dps, duration: s.duration,
            follow: this.player, pullXP: true, pull: s.pull, style: "net"
          }));
          this.timer = this.cd(s.cooldown);
        }
        break;
      }

      case "zone": {
        this.timer -= dt;
        if (this.timer <= 0) {
          ctx.zones.push(new Zone(this.player.x, this.player.y, {
            radius: s.radius, dps: s.dps, duration: s.duration,
            follow: null, pullXP: false, style: "compost"
          }));
          this.timer = this.cd(s.cooldown);
        }
        break;
      }

      case "pulse": {
        this.timer -= dt;
        if (this.timer <= 0) {
          ctx.pulses.push(new Pulse(this.player.x, this.player.y, s.radius));
          var enemies = ctx.enemies;
          for (var p = 0; p < enemies.length; p++) {
            var e = enemies[p];
            if (e.dead) continue;
            var dx = e.x - this.player.x, dy = e.y - this.player.y;
            if (dx * dx + dy * dy <= (s.radius + e.radius) * (s.radius + e.radius)) {
              if (e.takeDamage(s.damage)) ctx.onPurified(e);
            }
          }
          this.timer = this.cd(s.cooldown);
        }
        break;
      }

      case "orbit": {
        this.angle += s.rotSpeed * dt;
        this.blades.length = 0;
        var n = s.count;
        for (var b = 0; b < n; b++) {
          var a2 = this.angle + b * (Math.PI * 2 / n);
          var bx = this.player.x + Math.cos(a2) * s.radius;
          var by = this.player.y + Math.sin(a2) * s.radius;
          this.blades.push({ x: bx, y: by });
          var en = ctx.enemies;
          for (var m = 0; m < en.length; m++) {
            var ee = en[m];
            if (ee.dead) continue;
            var bdx = ee.x - bx, bdy = ee.y - by;
            var rr2 = ((s.hitRadius || 12) + ee.radius);
            if (bdx * bdx + bdy * bdy <= rr2 * rr2) {
              if (ee.takeDamage(s.dps * dt)) {
                ctx.onPurified(ee);
              } else if (s.knockback) {
                var pushDist = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
                ee.x += (bdx / pushDist) * s.knockback * dt;
                ee.y += (bdy / pushDist) * s.knockback * dt;
              }
            }
          }
        }
        break;
      }
    }
  };

  // 只有 orbit 需要在玩家周圍畫葉片；其餘效果由各自實體繪製
  Weapon.prototype.draw = function (ctx) {
    if (this.skill.type !== "orbit") return;
    for (var i = 0; i < this.blades.length; i++) {
      var bl = this.blades[i];
      var fx = global.SkillEffectRenderer;
      if (fx && fx.drawFrame) {
        var bladeSize = (global.Config ? 42 / global.Config.CAMERA_ZOOM : 24);
        if (fx.drawFrame(ctx, "wind_blade", "blade", Math.floor(this.angle * 4 + i), bl.x, bl.y, {
          size: bladeSize,
          rotation: this.angle * 2 + i,
          alpha: 0.95
        })) continue;
      }
      ctx.save();
      ctx.translate(bl.x, bl.y);
      ctx.rotate(this.angle * 2 + i);
      ctx.fillStyle = "#e3f6ff";
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#90caf9";
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  global.Weapon = Weapon;
  global.Projectile = Projectile;
  global.Zone = Zone;
  global.Pulse = Pulse;
})(window);
