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

    this.x += vx * dt;
    this.y += vy * dt;

    this.faceLeft = dx < 0;
    this.moveDir = global.getDirectionFromVector ? global.getDirectionFromVector(vx, vy) : this.moveDir;
    this._bobT += dt;
    if (this.animator) this.animator.update(dt, vx, vy);

    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.contactTimer > 0) this.contactTimer -= dt;
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
    return px / (global.Config ? global.Config.CAMERA_ZOOM : 1.8);
  };

  Enemy.prototype.drawBody = function (ctx, size) {
    var resolution = this.animator && this.animator.resolveSprite ? this.animator.resolveSprite() : null;
    var drawn = false;
    if (resolution && resolution.key && global.Animation && global.Animation.drawResolvedSprite) {
      drawn = global.Animation.drawResolvedSprite(ctx, resolution, this.x, this.y, size, size, 1);
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
    global.Sprites.drawSized(ctx, this.spriteId, this.x, drawY, size, size);
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

  Enemy.prototype.draw = function (ctx) {
    this.drawShadow(ctx);
    this.drawBody(ctx, this.renderSize());
    this.drawHitFlash(ctx);
    this.drawBossHp(ctx);
  };

  global.Enemy = Enemy;
})(window);
