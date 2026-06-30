/* ============================================================
   enemy.js  —  污染物（敵人）實體
   行為：朝玩家移動；被技能命中後扣血；歸零時被「淨化」並掉落經驗。
   （遊戲中以「淨化 / 回收 / 驅散污染」描述，而非擊殺。）
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

    var sz = global.Sprites.size(this.spriteId, 1);
    this.drawScale = sz.w ? (this.radius * 2.3) / sz.w : 2.4;

    // 接觸傷害節流（避免每幀都打到玩家）
    this.contactTimer = 0;
  }

  Enemy.prototype.update = function (dt, player) {
    var dx = player.x - this.x;
    var dy = player.y - this.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    this.x += (dx / dist) * this.speed * dt;
    this.y += (dy / dist) * this.speed * dt;

    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.contactTimer > 0) this.contactTimer -= dt;
  };

  // 回傳 true 表示此次傷害使其被淨化
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

  Enemy.prototype.draw = function (ctx) {
    // 影子
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + this.radius * 0.7, this.radius * 0.9, this.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    global.Sprites.draw(ctx, this.spriteId, this.x, this.y, this.drawScale);

    // 命中閃光
    if (this.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Boss 血條
    if (this.isBoss) {
      var w = 70, h = 7;
      var bx = this.x - w / 2, by = this.y - this.radius - 18;
      ctx.fillStyle = "#0a1a23";
      ctx.fillRect(bx - 2, by - 2, w + 4, h + 4);
      ctx.fillStyle = "#3a1416";
      ctx.fillRect(bx, by, w, h);
      ctx.fillStyle = "#e8534e";
      ctx.fillRect(bx, by, w * (this.hp / this.maxHp), h);
    }
  };

  global.Enemy = Enemy;
})(window);
