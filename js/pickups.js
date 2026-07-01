/* ============================================================
   pickups.js  —  掉落物：經驗晶體 / 循環幣 / 淨水瓶 / 知識卡
   磁吸：進入玩家拾取範圍後會被吸引；非常接近時被收取。
   實際效果（加經驗、加幣、回血、解鎖知識）由 game.js 處理。
   ============================================================ */
(function (global) {

  var TYPES = {
    xp:     { spriteId: "pickup_xp",     scale: 2.4, baseValue: 1,  collect: 16 },
    coin:   { spriteId: "pickup_coin",   scale: 2.4, baseValue: 1,  collect: 18 },
    health: { spriteId: "pickup_health", scale: 2.6, baseValue: 24, collect: 20 },
    card:   { spriteId: "pickup_card",   scale: 2.6, baseValue: 0,  collect: 22 }
  };

  function Pickup(type, x, y, value) {
    var def = TYPES[type] || TYPES.xp;
    this.type = type;
    this.def = def;
    this.x = x;
    this.y = y;
    this.value = (value != null) ? value : def.baseValue;
    this.spriteId = def.spriteId;
    this.scale = def.scale;
    this.dead = false;
    this.collected = false;
    this.bob = Math.random() * Math.PI * 2;   // 浮動相位
    this.vx = 0; this.vy = 0;
    this.life = 0;
  }

  Pickup.prototype.update = function (dt, player) {
    this.life += dt;
    this.bob += dt * 4;

    var dx = player.x - this.x;
    var dy = player.y - this.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;

    // 進入拾取範圍 → 被吸引；越近吸力越強
    if (dist < player.pickupRange) {
      var pull = 90 + (player.pickupRange - dist) * 6;
      this.x += (dx / dist) * pull * dt;
      this.y += (dy / dist) * pull * dt;
    }

    // 足夠接近 → 收取
    if (dist < this.def.collect + player.radius * 0.4) {
      this.collected = true;
      this.dead = true;
    }
  };

  Pickup.prototype.draw = function (ctx) {
    var floatY = Math.sin(this.bob) * 2;
    // 影子
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 6, this.scale * 3, this.scale * 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    var __pk = (global.Config ? global.Config.RENDER_SIZES.pickup / global.Config.CAMERA_ZOOM : this.scale * 8);
    global.Sprites.drawSized(ctx, this.spriteId, this.x, this.y + floatY, __pk, __pk);
  };

  global.Pickup = Pickup;
  global.PickupTypes = TYPES;
})(window);
