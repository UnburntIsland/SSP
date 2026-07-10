/* ============================================================
   enemy.js
   Enemy movement, damage, and rendering.
   ============================================================ */
(function (global) {

  function Enemy(def, x, y, hpScale) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.spriteId = def.spriteId;
    this.x = x;
    this.y = y;
    this.maxHp = Math.round(def.hp * (hpScale || 1));
    this.hp = this.maxHp;
    this.speed = def.speed;
    this.radius = def.radius;
    this.contact = def.contact;
    this.xp = def.xp;
    this.coinChance = def.coinChance;
    this.coinAmount = def.coinAmount || 1;
    this.isBoss = !!def.isBoss;
    this.knowledgeId = def.knowledgeId || null;

    this.dead = false;
    this.purified = false;
    this.hitFlash = 0;
    this.contactTimer = 0;
    this.faceLeft = false;
    this.moveDir = "S";
    this._bobT = 0;
    this.spawnAge = 0;
    this.spawnDuration = this.isBoss ? 0.9 : 0.55;
    this.ranged = def.ranged || null;
    this.attackPhase = "cooldown";
    this.attackTimer = this.ranged ? 0.9 + Math.random() * (this.ranged.cooldown || 2.5) : 0;
    this.attackTelegraph = 0;
    this.attackAim = { x: 0, y: 1 };
    this.pendingAttack = false;
    this.strafeSign = Math.random() < 0.5 ? -1 : 1;

    var sz = global.Sprites.size(this.spriteId, 1);
    this.drawScale = sz.w ? (this.radius * 2.3) / sz.w : 2.4;
    this.animator = global.EnemyAnimator ? new global.EnemyAnimator(def) : null;
  }

  Enemy.prototype.update = function (dt, player) {
    var dx = player.x - this.x;
    var dy = player.y - this.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    var vx = (dx / dist) * this.speed;
    var vy = (dy / dist) * this.speed;
    if (this.ranged && this.ranged.preferredDistance) {
      var preferred = this.ranged.preferredDistance;
      if (dist < preferred * 0.72) {
        vx = -(dx / dist) * this.speed * 0.72;
        vy = -(dy / dist) * this.speed * 0.72;
      } else if (dist < preferred * 1.12) {
        vx = -(dy / dist) * this.speed * 0.58 * this.strafeSign;
        vy = (dx / dist) * this.speed * 0.58 * this.strafeSign;
      }
    }

    this.spawnAge += dt;
    var moveScale = this.spawnAge < this.spawnDuration ? 0.22 : (this.attackPhase === "telegraph" ? 0.38 : 1);
    this.x += vx * dt * moveScale;
    this.y += vy * dt * moveScale;

    this.faceLeft = dx < 0;
    this.moveDir = global.getDirectionFromVector ? global.getDirectionFromVector(vx, vy) : this.moveDir;
    this._bobT += dt;
    if (this.animator) this.animator.update(dt, vx, vy);

    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.contactTimer > 0) this.contactTimer -= dt;
    this.updateRangedAttack(dt, player, dist, dx, dy);
  };

  Enemy.prototype.updateRangedAttack = function (dt, player, dist, dx, dy) {
    var r = this.ranged;
    if (!r || this.dead || this.spawnAge < this.spawnDuration || dist > (r.range || Infinity)) return;

    if (this.attackPhase === "cooldown") {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackPhase = "telegraph";
        this.attackTelegraph = r.telegraph || 0.5;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        this.attackAim.x = dx / d;
        this.attackAim.y = dy / d;
      }
      return;
    }

    this.attackTelegraph -= dt;
    if (this.attackTelegraph <= 0) {
      this.pendingAttack = true;
      this.attackPhase = "cooldown";
      this.attackTimer = r.cooldown || 2.5;
    }
  };

  Enemy.prototype.consumeAttack = function () {
    if (!this.pendingAttack || !this.ranged) return null;
    this.pendingAttack = false;
    return {
      config: this.ranged,
      aimX: this.attackAim.x,
      aimY: this.attackAim.y
    };
  };

  Enemy.prototype.isSpawning = function () {
    return this.spawnAge < this.spawnDuration;
  };

  Enemy.prototype.takeDamage = function (n) {
    if (this.dead) return false;
    this.hp -= n;
    this.hitFlash = 0.12;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.purified = true;
      return true;
    }
    return false;
  };

  Enemy.prototype.drawShadow = function (ctx) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + this.radius * 0.7, this.radius * 0.9, this.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  Enemy.prototype.renderSize = function () {
    var sizes = global.Config ? global.Config.RENDER_SIZES : null;
    var px = this.isBoss ? (sizes ? sizes.enemyBoss : 128)
      : (this.radius >= 15 ? (sizes ? sizes.enemyMedium : 56) : (sizes ? sizes.enemySmall : 44));
    var mobileScale = document.documentElement.classList.contains("is-mobile") ? 1.28 : 1;
    return (px * mobileScale) / (global.Config ? global.Config.CAMERA_ZOOM : 1.8);
  };

  Enemy.prototype.drawBody = function (ctx, size, alpha) {
    alpha = alpha == null ? 1 : alpha;
    var resolution = this.animator && this.animator.resolveSprite ? this.animator.resolveSprite() : null;
    var drawn = false;
    if (resolution && resolution.key && global.Animation && global.Animation.drawResolvedSprite) {
      drawn = global.Animation.drawResolvedSprite(ctx, resolution, this.x, this.y, size, size, alpha);
    }
    if (drawn && global.Animation && global.Animation.recordResolved) {
      global.Animation.recordResolved(this.animator, resolution);
      return;
    }

    if (global.Animation && global.Animation.drawFallbackSprite && this.animator) {
      global.Animation.drawFallbackSprite(ctx, {
        animator: this.animator,
        spriteId: this.spriteId,
        x: this.x,
        y: this.y,
        w: size,
        h: size,
        alpha: alpha,
        entityType: "Enemy",
        cueTint: this.isBoss ? "rgba(214, 137, 255, 0.65)" : "rgba(169, 223, 86, 0.72)"
      });
      return;
    }

    var bob = Math.abs(Math.sin((this._bobT || 0) * 8)) * (size * 0.06);
    var drawY = this.y - bob;
    if (this.faceLeft) {
      ctx.save();
      ctx.translate(this.x, 0);
      ctx.scale(-1, 1);
      ctx.translate(-this.x, 0);
    }
    global.Sprites.drawSized(ctx, this.spriteId, this.x, drawY, size, size, { alpha: alpha });
    if (this.faceLeft) ctx.restore();
  };

  Enemy.prototype.drawHitFlash = function (ctx) {
    if (this.hitFlash <= 0) return;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  Enemy.prototype.drawBossHp = function (ctx) {
    if (!this.isBoss) return;
    var w = 70;
    var h = 7;
    var bx = this.x - w / 2;
    var by = this.y - this.radius - 18;
    ctx.fillStyle = "#0a1a23";
    ctx.fillRect(bx - 2, by - 2, w + 4, h + 4);
    ctx.fillStyle = "#3a1416";
    ctx.fillRect(bx, by, w, h);
    ctx.fillStyle = "#e8534e";
    ctx.fillRect(bx, by, w * (this.hp / this.maxHp), h);
  };

  Enemy.prototype.drawSpawnCue = function (ctx, size) {
    if (!this.isSpawning()) return;
    var t = Math.max(0, Math.min(1, this.spawnAge / this.spawnDuration));
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.85;
    ctx.strokeStyle = this.isBoss ? "#d697ff" : "#d6f06a";
    ctx.lineWidth = Math.max(1.5, size * 0.045);
    ctx.beginPath();
    ctx.arc(this.x, this.y, size * (0.65 + (1 - t) * 0.42), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha *= 0.45;
    ctx.beginPath();
    ctx.arc(this.x, this.y, size * (0.45 + t * 0.25), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  Enemy.prototype.drawAttackCue = function (ctx) {
    if (!this.ranged || this.attackPhase !== "telegraph") return;
    var total = this.ranged.telegraph || 0.5;
    var t = 1 - Math.max(0, this.attackTelegraph) / total;
    var pulse = 0.45 + Math.sin(t * Math.PI * 6) * 0.18;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = this.ranged.color || "#ffcf5a";
    ctx.fillStyle = this.ranged.color || "#ffcf5a";
    ctx.lineWidth = this.isBoss ? 3 : 2;
    if (this.ranged.kind === "radial") {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 12 + t * 10, 0, Math.PI * 2);
      ctx.stroke();
      var count = this.ranged.count || 8;
      for (var i = 0; i < count; i++) {
        var a = i * Math.PI * 2 / count;
        ctx.beginPath();
        ctx.moveTo(this.x + Math.cos(a) * (this.radius + 6), this.y + Math.sin(a) * (this.radius + 6));
        ctx.lineTo(this.x + Math.cos(a) * (this.radius + 24), this.y + Math.sin(a) * (this.radius + 24));
        ctx.stroke();
      }
    } else {
      var len = Math.min(this.ranged.range || 320, 260);
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + this.attackAim.x * len, this.y + this.attackAim.y * len);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 8 + t * 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  Enemy.prototype.draw = function (ctx) {
    var size = this.renderSize();
    var spawnT = this.isSpawning() ? Math.max(0, Math.min(1, this.spawnAge / this.spawnDuration)) : 1;
    var spawnScale = this.isSpawning() ? 1.48 - spawnT * 0.48 : 1;
    var alpha = this.isSpawning() ? 0.45 + spawnT * 0.55 : 1;
    this.drawSpawnCue(ctx, size);
    this.drawAttackCue(ctx);
    this.drawShadow(ctx);
    this.drawBody(ctx, size * spawnScale, alpha);
    this.drawHitFlash(ctx);
    this.drawBossHp(ctx);
  };

  function EnemyProjectile(x, y, vx, vy, opt) {
    opt = opt || {};
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = opt.damage || 6;
    this.radius = opt.radius || 7;
    this.color = opt.color || "#d6e34a";
    this.life = opt.life || 5;
    this.age = 0;
    this.dead = false;
    this.sourceId = opt.sourceId || "enemy";
  }

  EnemyProjectile.prototype.update = function (dt, world) {
    this.age += dt;
    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.life <= 0 || this.x < -80 || this.y < -80 || this.x > world.w + 80 || this.y > world.h + 80) {
      this.dead = true;
    }
  };

  EnemyProjectile.prototype.draw = function (ctx) {
    var speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || 1;
    var nx = this.vx / speed, ny = this.vy / speed;
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.radius * 1.3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(this.x - nx * this.radius * 3.2, this.y - ny * this.radius * 3.2);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  };

  global.Enemy = Enemy;
  global.EnemyProjectile = EnemyProjectile;
})(window);
