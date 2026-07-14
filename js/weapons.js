/* ============================================================
   weapons.js  —  自動攻擊的武器/技能行為 + 投射物 / 區域 / 脈衝
   每個 Weapon 包一個 skill；依 skill.type 表現不同行為：
     projectile 種子飛刃 / aura 回收磁網 / pulse 太陽能脈衝
     orbit 風力葉片 / zone 堆肥孢子 / deployable 回收哨兵 / trail 淨化藥跡
   update(dt, ctx) 會把效果放進 ctx 的 projectiles / zones / pulses / deployables。
   ============================================================ */
(function (global) {

  /* ---------------- 投射物（種子飛刃） ---------------- */
  function Projectile(x, y, vx, vy, damage, pierce, radius, eliteMult) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.eliteMult = eliteMult || 1;
    this.pierce = pierce;
    this.radius = radius || 6;
    this.life = 2.2;
    this.dead = false;
    this.spin = Math.random() * Math.PI;
    this.visualAge = 0;
    this.hitEffectId = "seed_blade";
    this.hitEffectGroup = "hit";
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

  /* ---------------- 回收哨兵能量彈 ---------------- */
  function TurretProjectile(x, y, vx, vy, damage, eliteMult) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.eliteMult = eliteMult || 1;
    this.pierce = 0;
    this.radius = 5;
    this.life = 1.8;
    this.dead = false;
    this.visualAge = 0;
    this.hitSet = [];
    this.hitEffectId = "common";
    this.hitEffectGroup = "hit_small";
  }
  TurretProjectile.prototype.update = function (dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.visualAge += dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  };
  TurretProjectile.prototype.draw = function (ctx) {
    var angle = Math.atan2(this.vy, this.vx);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = "#52fff0";
    ctx.fillRect(-12, -4, 18, 8);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#e9fffb";
    ctx.fillRect(-5, -2, 12, 4);
    ctx.fillStyle = "#ffd33f";
    ctx.fillRect(-8, -1, 5, 2);
    ctx.restore();
  };

  /* ---------------- 可部署回收哨兵 ---------------- */
  function RecycleSentry(x, y, opt) {
    this.x = x; this.y = y;
    this.owner = opt.owner;
    this.duration = opt.duration;
    this.life = opt.duration;
    this.damage = opt.damage;
    this.fireCooldown = opt.fireCooldown;
    this.fireTimer = 0.22;
    this.range = opt.range;
    this.projectileSpeed = opt.speed;
    this.direction = opt.direction || "S";
    this.age = 0;
    this.flashTimer = 0;
    this.dead = false;
  }

  RecycleSentry.prototype.findTarget = function (enemies) {
    var best = null;
    var bestDistance = this.range * this.range;
    for (var i = 0; i < enemies.length; i++) {
      var enemy = enemies[i];
      if (enemy.dead || (enemy.isSpawning && enemy.isSpawning())) continue;
      var dx = enemy.x - this.x;
      var dy = enemy.y - this.y;
      var d2 = dx * dx + dy * dy;
      if (d2 <= bestDistance) { bestDistance = d2; best = enemy; }
    }
    return best;
  };

  RecycleSentry.prototype.update = function (dt, ctx) {
    if (this.dead) return;
    this.age += dt;
    this.life -= dt;
    this.fireTimer -= dt;
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    if (this.life <= 0) { this.dead = true; return; }

    var target = this.findTarget(ctx.enemies);
    if (!target) return;
    var dx = target.x - this.x;
    var dy = target.y - this.y;
    var distance = Math.sqrt(dx * dx + dy * dy) || 1;
    var dir = global.Animation && global.Animation.getDirectionFromVector
      ? global.Animation.getDirectionFromVector(dx, dy)
      : null;
    if (dir) this.direction = dir;

    if (this.fireTimer <= 0) {
      var ux = dx / distance;
      var uy = dy / distance;
      ctx.projectiles.push(new TurretProjectile(
        this.x + ux * 16,
        this.y + uy * 16,
        ux * this.projectileSpeed,
        uy * this.projectileSpeed,
        this.damage,
        (this.owner && this.owner.eliteDamageMult) || 1
      ));
      this.fireTimer = this.fireCooldown;
      this.flashTimer = 0.09;
    }
  };

  RecycleSentry.prototype.draw = function (ctx) {
    var baseSize = global.Config
      ? global.Config.RENDER_SIZES.deployable / global.Config.CAMERA_ZOOM
      : 36;
    var spawnT = Math.max(0, Math.min(1, this.age / 0.28));
    var spawnScale = 0.68 + (1 - Math.pow(1 - spawnT, 3)) * 0.32;
    var alpha = Math.min(1, spawnT * 1.4, this.life < 1 ? this.life : 1);
    var size = baseSize * spawnScale;

    ctx.save();
    ctx.globalAlpha = 0.24 * alpha;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + baseSize * 0.28, baseSize * 0.34, baseSize * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    var key = "deployable_recycle_sentry_" + this.direction;
    var drawn = global.Assets && global.Assets.ready(key) && global.Assets.drawCentered(
      ctx, key, this.x, this.y, size, size, alpha
    );
    if (!drawn) {
      var vector = global.Animation && global.Animation.directionVector
        ? global.Animation.directionVector(this.direction)
        : { x: 0, y: 1 };
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(this.x, this.y);
      ctx.fillStyle = "#3f4d52";
      ctx.fillRect(-baseSize * 0.32, baseSize * 0.05, baseSize * 0.64, baseSize * 0.28);
      ctx.fillStyle = "#10aaa0";
      ctx.beginPath(); ctx.arc(0, 0, baseSize * 0.23, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(Math.atan2(vector.y, vector.x));
      ctx.fillStyle = "#d8eeee";
      ctx.fillRect(0, -baseSize * 0.055, baseSize * 0.32, baseSize * 0.11);
      ctx.restore();
    }

    var lifeRatio = Math.max(0, this.life / this.duration);
    ctx.save();
    ctx.globalAlpha = 0.8 * alpha;
    ctx.strokeStyle = lifeRatio > 0.25 ? "#57dfd3" : "#ff9a61";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, baseSize * 0.43, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lifeRatio);
    ctx.stroke();
    if (this.flashTimer > 0) {
      var muzzle = global.Animation && global.Animation.directionVector
        ? global.Animation.directionVector(this.direction)
        : { x: 0, y: 1 };
      ctx.globalAlpha = this.flashTimer / 0.09;
      ctx.fillStyle = "#e9fffb";
      ctx.beginPath();
      ctx.arc(this.x + muzzle.x * baseSize * 0.29, this.y + muzzle.y * baseSize * 0.29, baseSize * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (global.Debug && global.Debug.animationEnabled) {
      var label = "Sentry " + this.direction + "  " + Math.max(0, this.life).toFixed(1) + "s";
      ctx.save();
      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      var labelWidth = ctx.measureText(label).width + 8;
      ctx.fillStyle = "rgba(4, 16, 20, 0.76)";
      ctx.fillRect(this.x - labelWidth / 2, this.y - baseSize * 0.58, labelWidth, 13);
      ctx.fillStyle = "#dffcf7";
      ctx.fillText(label, this.x, this.y - baseSize * 0.58 + 6.5);
      ctx.restore();
    }
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
    this.eliteMult = opt.eliteMult || 1;
    this.style = opt.style || "compost";    // 'net' or 'compost'
    this.dead = false;
    this.pulse = Math.random() * Math.PI * 2;
  }
  Zone.prototype.update = function (dt, ctx) {
    if (this.dead) return;
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
        var zoneDamage = this.dps * dt * (e.isElite ? this.eliteMult : 1);
        var zoneKilled = ctx.damageEnemy
          ? ctx.damageEnemy(e, zoneDamage, { continuous: true })
          : e.takeDamage(zoneDamage, { continuous: true });
        if (zoneKilled) ctx.onPurified(e);
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

  /* ---------------- 淨化藥跡（生態藥劑師專屬） ----------------
     一個實體管理整條路徑與每隻敵人的計時，避免相鄰路徑點重疊時重複扣血。 */
  function PurifyingTrail(owner, opt) {
    this.owner = owner;
    this.points = [];
    this.hitCooldowns = new WeakMap();
    this.dead = false;
    this.phase = 0;
    this.x = owner.x;
    this.y = owner.y;
    this.lastX = owner.x;
    this.lastY = owner.y;
    this.configure(opt);
    this.addPoint(owner.x, owner.y);
  }

  PurifyingTrail.prototype.configure = function (opt) {
    opt = opt || {};
    this.damage = Math.max(0, Number(opt.damage) || 0);
    this.tickCooldown = Math.max(0.05, Number(opt.tickCooldown) || 0.6);
    this.radius = Math.max(4, Number(opt.radius) || 24);
    this.duration = Math.max(0.2, Number(opt.duration) || 4);
    this.spacing = Math.max(4, Number(opt.spacing) || 20);
    this.eliteMult = Math.max(1, Number(opt.eliteMult) || 1);
  };

  PurifyingTrail.prototype.addPoint = function (x, y) {
    this.points.push({ x: x, y: y, life: this.duration });
    if (this.points.length > 240) this.points.splice(0, this.points.length - 240);
  };

  PurifyingTrail.prototype.update = function (dt, ctx) {
    if (!this.owner || this.owner.hp <= 0) { this.dead = true; return; }
    this.phase += dt * 4.2;
    this.x = this.owner.x;
    this.y = this.owner.y;

    for (var p = this.points.length - 1; p >= 0; p--) {
      this.points[p].life -= dt;
      if (this.points[p].life <= 0) this.points.splice(p, 1);
    }

    var dx = this.owner.x - this.lastX;
    var dy = this.owner.y - this.lastY;
    var distance = Math.sqrt(dx * dx + dy * dy);
    if (!this.points.length) {
      this.addPoint(this.owner.x, this.owner.y);
      this.lastX = this.owner.x;
      this.lastY = this.owner.y;
    } else if (distance >= this.spacing) {
      // 低 FPS 或衝刺也逐段內插，確保路徑中央不會出現無法命中的缺口。
      var steps = Math.max(1, Math.ceil(distance / this.spacing));
      for (var step = 1; step <= steps; step++) {
        var ratio = step / steps;
        this.addPoint(this.lastX + dx * ratio, this.lastY + dy * ratio);
      }
      this.lastX = this.owner.x;
      this.lastY = this.owner.y;
    } else {
      // 停留時只刷新腳下最後一點，不持續堆疊重複區塊。
      this.points[this.points.length - 1].life = this.duration;
    }

    var enemies = ctx.enemies || [];
    for (var i = 0; i < enemies.length; i++) {
      var enemy = enemies[i];
      if (!enemy || enemy.dead) continue;
      var remaining = Math.max(0, (this.hitCooldowns.get(enemy) || 0) - dt);
      var inside = false;
      var hitRadius = this.radius + (enemy.radius || 0);
      var hitRadiusSquared = hitRadius * hitRadius;
      for (var j = 0; j < this.points.length; j++) {
        var point = this.points[j];
        var ex = enemy.x - point.x;
        var ey = enemy.y - point.y;
        if (ex * ex + ey * ey <= hitRadiusSquared) { inside = true; break; }
      }

      if (inside && remaining <= 0.000001) {
        var amount = this.damage * (enemy.isElite ? this.eliteMult : 1);
        var killed = ctx.damageEnemy
          ? ctx.damageEnemy(enemy, amount, { continuous: true })
          : enemy.takeDamage(amount, { continuous: true });
        this.hitCooldowns.set(enemy, this.tickCooldown);
        if (killed && ctx.onPurified) ctx.onPurified(enemy);
      } else if (remaining > 0) {
        // 離開再踏入仍沿用同一扣血間隔，避免在邊界反覆進出洗傷害。
        this.hitCooldowns.set(enemy, remaining);
      }
    }
  };

  PurifyingTrail.prototype.draw = function (ctx) {
    if (!this.points.length) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (var i = 1; i < this.points.length; i++) {
      var previous = this.points[i - 1];
      var point = this.points[i];
      var sx = point.x - previous.x;
      var sy = point.y - previous.y;
      if (sx * sx + sy * sy > this.spacing * this.spacing * 3.2) continue;
      var alpha = Math.min(1, Math.min(previous.life, point.life) / 0.65);
      ctx.globalAlpha = alpha * 0.23;
      ctx.strokeStyle = "#0b6b69";
      ctx.lineWidth = this.radius * 1.65;
      ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(point.x, point.y); ctx.stroke();
      ctx.globalAlpha = alpha * 0.52;
      ctx.strokeStyle = "#60ddbd";
      ctx.lineWidth = this.radius * 0.78;
      ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(point.x, point.y); ctx.stroke();
    }

    for (var k = 0; k < this.points.length; k++) {
      var trailPoint = this.points[k];
      var pointAlpha = Math.min(1, trailPoint.life / 0.65);
      ctx.globalAlpha = pointAlpha * 0.26;
      ctx.fillStyle = "#0b6b69";
      ctx.beginPath(); ctx.arc(trailPoint.x, trailPoint.y, this.radius * 0.82, 0, Math.PI * 2); ctx.fill();
      if (k % 3 === 0) {
        var bubbleAngle = this.phase + k * 2.1;
        ctx.globalAlpha = pointAlpha * 0.72;
        ctx.fillStyle = "#d9fff1";
        ctx.beginPath();
        ctx.arc(
          trailPoint.x + Math.cos(bubbleAngle) * this.radius * 0.45,
          trailPoint.y + Math.sin(bubbleAngle) * this.radius * 0.32,
          1.7 + (k % 2),
          0,
          Math.PI * 2
        );
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
    this.timer = skill.type === "deployable" ? this.cd(skill.levels[0].cooldown) : 0.4;
    this.angle = Math.random() * Math.PI * 2; // 給 orbit 用
    this.blades = [];
    this.deployCount = 0;
    this.trailField = null;
  }

  Weapon.prototype.stats = function () { return this.skill.levels[this.level - 1]; };
  Weapon.prototype.isMax = function () { return this.level >= this.skill.maxLevel; };
  Weapon.prototype.levelUp = function () { if (!this.isMax()) this.level += 1; };
  Weapon.prototype.cd = function (base) {
    var raw = Number(this.player.cooldownMult);
    if (!isFinite(raw)) raw = 1;
    var mult = Math.max(this.player.minCooldownMult || 0.60, raw);
    return Math.max(this.skill.minCooldown || 0.45, base * mult);
  };

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
            var volleyDamage = s.damage * (this.player.damageMult || 1);
            var projectileDamage = this.skill.damageMode === "volley" ? volleyDamage / Math.max(1, count) : volleyDamage;
            var spread = 0.16;
            for (var i = 0; i < count; i++) {
              var off = (count === 1) ? 0 : (i - (count - 1) / 2) * spread;
              var ang = baseAng + off;
              ctx.projectiles.push(new Projectile(
                this.player.x, this.player.y,
                Math.cos(ang) * s.speed, Math.sin(ang) * s.speed,
                projectileDamage, s.pierce, 6,
                (s.eliteMult || 1) * (this.player.eliteDamageMult || 1)
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
            radius: s.radius, dps: s.dps * (this.player.damageMult || 1), duration: s.duration,
            follow: this.player, pullXP: true, pull: s.pull, style: "net",
            eliteMult: this.player.eliteDamageMult || 1
          }));
          this.timer = this.cd(s.cooldown);
        }
        break;
      }

      case "zone": {
        this.timer -= dt;
        if (this.timer <= 0) {
          ctx.zones.push(new Zone(this.player.x, this.player.y, {
            radius: s.radius, dps: s.dps * (this.player.damageMult || 1), duration: s.duration,
            follow: null, pullXP: false, style: "compost",
            eliteMult: this.player.eliteDamageMult || 1
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
              var pulseDamage = s.damage * (this.player.damageMult || 1) * (e.isElite ? (this.player.eliteDamageMult || 1) : 1);
              var pulseKilled = ctx.damageEnemy ? ctx.damageEnemy(e, pulseDamage) : e.takeDamage(pulseDamage);
              if (pulseKilled) ctx.onPurified(e);
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
              var orbitDamage = s.dps * (this.player.damageMult || 1) * dt * (ee.isElite ? (this.player.eliteDamageMult || 1) : 1);
              var orbitKilled = ctx.damageEnemy
                ? ctx.damageEnemy(ee, orbitDamage, { continuous: true })
                : ee.takeDamage(orbitDamage, { continuous: true });
              if (orbitKilled) {
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

      case "deployable": {
        this.timer -= dt;
        if (this.timer <= 0) {
          var facing = this.player.animator ? this.player.animator.dir : "S";
          var direction = global.Animation && global.Animation.directionVector
            ? global.Animation.directionVector(facing)
            : { x: this.player.lastMoveX || 0, y: this.player.lastMoveY || 1 };
          var baseAngle = Math.atan2(direction.y, direction.x);
          var deployOffsets = [0, 0.62, -0.62, 1.18, -1.18, Math.PI];
          var deployAngle = baseAngle + deployOffsets[this.deployCount % deployOffsets.length];
          this.deployCount += 1;
          var tx = this.player.x + Math.cos(deployAngle) * 42;
          var ty = this.player.y + Math.sin(deployAngle) * 42;
          if (ctx.world) {
            tx = Math.max(24, Math.min(ctx.world.w - 24, tx));
            ty = Math.max(24, Math.min(ctx.world.h - 24, ty));
          }
          var sentry = new RecycleSentry(tx, ty, {
            owner: this.player,
            direction: facing,
            duration: s.duration,
            damage: s.damage * (this.player.damageMult || 1),
            fireCooldown: s.fireCooldown,
            range: s.range,
            speed: s.speed
          });
          ctx.deployables.push(sentry);
          this.timer = this.cd(s.cooldown);
        }
        break;
      }

      case "trail": {
        var trailOptions = {
          damage: s.damage * (this.player.damageMult || 1),
          tickCooldown: s.tickCooldown,
          radius: s.radius,
          duration: s.duration,
          spacing: s.spacing,
          eliteMult: this.player.eliteDamageMult || 1
        };
        if (!this.trailField || this.trailField.dead) {
          this.trailField = new PurifyingTrail(this.player, trailOptions);
          ctx.zones.push(this.trailField);
        } else {
          this.trailField.configure(trailOptions);
          if (ctx.zones.indexOf(this.trailField) === -1) ctx.zones.push(this.trailField);
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
  global.RecycleSentry = RecycleSentry;
  global.TurretProjectile = TurretProjectile;
  global.PurifyingTrail = PurifyingTrail;
})(window);
