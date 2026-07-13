/* ============================================================
   player.js  —  玩家角色
   玩家只控制移動；武器/技能自動攻擊（見 weapons.js）。
   開局時套用「角色被動」與「商店永久升級」加成。
   ============================================================ */
(function (global) {

  var BASE = {
    maxHp: 100,
    speed: 168,
    radius: 13,
    pickupRange: 72,
    invuln: 0.6          // 受擊後無敵時間（秒），雨水收集會延長
  };

  function Player(character, meta) {
    this.character = character;
    this.spriteId = character.spriteId;

    var p = character.passive || {};
    meta = meta || {};

    // 生命值：基礎 + 商店土壤加成，再乘上角色倍率
    this.maxHp = Math.round((BASE.maxHp + (meta.bonusMaxHp || 0)) * (p.maxHpMult || 1));
    this.hp = this.maxHp;

    this.speed = BASE.speed * (p.speedMult || 1);
    this.environmentSpeedMult = 1;
    this.radius = BASE.radius;

    // 拾取範圍：基礎 × 角色倍率 ×（1 + 商店生態感知）
    this.pickupRange = BASE.pickupRange * (p.pickupRangeMult || 1) * (1 + (meta.pickupRangeBonus || 0));

    // 技能冷卻倍率：角色倍率 ×（1 - 商店節能）
    this.cooldownMult = (p.cooldownMult || 1) * (1 - (meta.cooldownReduce || 0));

    // 局後循環幣倍率（商店回收分類）
    this.coinMult = 1 + (meta.coinBonusMult || 0);

    // 受擊後護盾（無敵）時間 = 基礎 + 商店雨水收集
    this.invulnAfterHit = BASE.invuln + (meta.shieldBonus || 0);

    this.level = 1;
    this.xp = 0;
    this.xpToNext = this.xpForLevel(1);

    this.invulnTimer = 0;
    this.facing = 1;
    this.hitFlash = 0;
    this.eliteDamageMult = 1;

    // 全角色共用衝刺。只改位移與短暫無敵，不影響方向判定或攻擊數值。
    this.dashCooldownMax = 3.0;
    this.dashCooldown = 0;
    this.dashDuration = 0.18;
    this.dashTimer = 0;
    this.dashSpeedMult = 3.4;
    this.dashDirX = 0;
    this.dashDirY = 1;
    this.lastMoveX = 0;
    this.lastMoveY = 1;

    this.weapons = [];   // Weapon 實例
    this.oneShotUpgrades = {};
    this.passiveUpgrades = {};
    this.passiveUpgradeOrder = [];

    // 8 方向動畫播放器（缺圖時 draw 會 fallback 到靜態圖 / placeholder）
    this.animator = global.CharacterAnimator ? new global.CharacterAnimator(character) : null;
  }

  Player.prototype.xpForLevel = function (level) {
    // 隨等級平滑成長的經驗需求
    return Math.floor(5 + (level - 1) * 4 + Math.pow(level - 1, 1.7) * 1.3);
  };

  Player.prototype.hasSkill = function (skillId) {
    for (var i = 0; i < this.weapons.length; i++) {
      if (this.weapons[i].skill.id === skillId) return true;
    }
    return false;
  };

  Player.prototype.getWeapon = function (skillId) {
    for (var i = 0; i < this.weapons.length; i++) {
      if (this.weapons[i].skill.id === skillId) return this.weapons[i];
    }
    return null;
  };

  Player.prototype.addSkill = function (skillId) {
    if (this.hasSkill(skillId)) { this.upgradeSkill(skillId); return; }
    var skill = global.GameData.getSkill(skillId);
    if (!skill) return;
    this.weapons.push(new global.Weapon(skill, this));
  };

  Player.prototype.upgradeSkill = function (skillId) {
    var w = this.getWeapon(skillId);
    if (w) w.levelUp();
  };

  // 回傳本次升了幾級（0 表示沒升級）
  Player.prototype.gainXp = function (amount) {
    this.xp += amount;
    var ups = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = this.xpForLevel(this.level);
      ups += 1;
    }
    return ups;
  };

  Player.prototype.takeDamage = function (n) {
    if (this.invulnTimer > 0) return false;
    this.hp -= n;
    this.invulnTimer = this.invulnAfterHit;
    this.hitFlash = 0.18;
    if (this.hp < 0) this.hp = 0;
    return true;
  };

  Player.prototype.heal = function (n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  };

  Player.prototype.update = function (dt, world) {
    var mv = global.Input.getMoveVector();
    var moveLen = Math.sqrt(mv.x * mv.x + mv.y * mv.y);
    if (moveLen > 0.001) {
      this.lastMoveX = mv.x / moveLen;
      this.lastMoveY = mv.y / moveLen;
    }

    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    var wantsDash = global.Input.consumeDash ? global.Input.consumeDash() : false;
    if (wantsDash && this.dashCooldown <= 0 && this.dashTimer <= 0) {
      this.dashDirX = moveLen > 0.001 ? mv.x / moveLen : this.lastMoveX;
      this.dashDirY = moveLen > 0.001 ? mv.y / moveLen : this.lastMoveY;
      this.dashTimer = this.dashDuration;
      this.dashCooldown = this.dashCooldownMax;
      this.invulnTimer = Math.max(this.invulnTimer, this.dashDuration + 0.08);
    }

    var moveX = mv.x;
    var moveY = mv.y;
    var moveSpeed = this.speed * (this.environmentSpeedMult || 1);
    if (this.dashTimer > 0) {
      moveX = this.dashDirX;
      moveY = this.dashDirY;
      moveSpeed = this.speed * this.dashSpeedMult;
      this.dashTimer = Math.max(0, this.dashTimer - dt);
    }

    if (moveX !== 0) this.facing = moveX > 0 ? 1 : -1;
    if (this.animator) this.animator.update(dt, moveX, moveY);
    this._bobT = (this._bobT || 0) + dt;   // 走路 bob 相位
    this.x += moveX * moveSpeed * dt;
    this.y += moveY * moveSpeed * dt;

    // 限制在世界範圍內
    this.x = Math.max(this.radius, Math.min(world.w - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(world.h - this.radius, this.y));

    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
  };

  Player.prototype.draw = function (ctx) {
    if (this.dashTimer > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#9df6e5";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(this.x - this.dashDirX * 28, this.y - this.dashDirY * 28);
      ctx.lineTo(this.x - this.dashDirX * 8, this.y - this.dashDirY * 8);
      ctx.stroke();
      ctx.restore();
    }

    // 影子
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 16, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 受擊後本體快速閃爍；既有較長護盾期間維持較慢的半透明節奏。
    var iframeBlink = (this.invulnTimer > 0 && Math.floor(this.invulnTimer * 16) % 2 === 0);
    var hitBlink = (this.hitFlash > 0 && Math.floor(this.hitFlash * 50) % 2 === 0);
    var alpha = hitBlink ? 0.28 : (iframeBlink ? 0.45 : 1);
    var __ps = (global.Config ? global.Config.RENDER_SIZES.player / global.Config.CAMERA_ZOOM : 36);
    var __dir = this.animator ? this.animator.dir : "S";
    var __moving = this.animator ? this.animator.action === "walk" : false;
    var __faceLeft = (__dir === "W" || __dir === "NW" || __dir === "SW");
    var __bob = __moving ? Math.abs(Math.sin((this._bobT || 0) * 9)) * (__ps * 0.07) : 0;
    var __dy = this.y - __bob;
    // 8 方向動畫幀優先；缺圖 → 靜態圖（朝左時水平翻轉 + 走路 bob，避免看起來像倒退走）
    var __resolution = this.animator && this.animator.resolveSprite ? this.animator.resolveSprite() : null;
    var __drawn = false;
    if (__resolution && __resolution.key && global.Animation && global.Animation.drawResolvedSprite) {
      __drawn = global.Animation.drawResolvedSprite(ctx, __resolution, this.x, __dy, __ps, __ps, alpha);
    }
    if (__drawn && global.Animation && global.Animation.recordResolved) {
      global.Animation.recordResolved(this.animator, __resolution);
    }
    if (!__drawn) {
      if (global.Animation && global.Animation.drawFallbackSprite && this.animator) {
        global.Animation.drawFallbackSprite(ctx, {
          animator: this.animator,
          spriteId: this.spriteId,
          x: this.x,
          y: this.y,
          w: __ps,
          h: __ps,
          alpha: alpha,
          entityType: "Player"
        });
      } else {
        if (__faceLeft) { ctx.save(); ctx.translate(this.x, 0); ctx.scale(-1, 1); ctx.translate(-this.x, 0); }
        global.Sprites.drawSized(ctx, this.spriteId, this.x, __dy, __ps, __ps, { alpha: alpha });
        if (__faceLeft) ctx.restore();
      }
    }
    if (this.animator && global.Animation && global.Animation.drawAnimationDebugLabel) {
      global.Animation.drawAnimationDebugLabel(ctx, {
        animator: this.animator,
        resolution: __drawn ? __resolution : null,
        x: this.x,
        y: this.y,
        offsetY: __ps * 0.82
      });
    }

    if (this.hitFlash > 0) {
      var __hitT = Math.max(0, Math.min(1, this.hitFlash / 0.18));
      ctx.save();
      ctx.globalAlpha = __hitT * 0.82;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 4 + (1 - __hitT) * 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha *= 0.55;
      ctx.strokeStyle = "#8fe4ff";
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 9 + (1 - __hitT) * 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 護盾光環
    if (this.invulnTimer > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(120,200,255,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  global.Player = Player;
})(window);
