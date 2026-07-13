/* ============================================================
   Skill effect image resolver.
   Visual-only layer: never changes damage, cooldown, collision,
   range, upgrade logic, or the existing Canvas fallback.
   ============================================================ */
(function (global) {
  var VERSION = "skill_effect_promote_20260702_2258";

  var MANIFEST = {
    seed_blade: {
      approvedEffect: true,
      runtimePath: "assets/images/effects/seed_blade/",
      groups: {
        projectile: { approved: true, frameCount: 4, canvasSize: [64, 64], frames: ["projectile_0.png", "projectile_1.png", "projectile_2.png", "projectile_3.png"] },
        hit: { approved: true, frameCount: 4, canvasSize: [64, 64], frames: ["hit_0.png", "hit_1.png", "hit_2.png", "hit_3.png"] }
      }
    },
    recycle_net: {
      approvedEffect: true,
      runtimePath: "assets/images/effects/recycle_net/",
      groups: {
        aoe: { approved: true, frameCount: 6, canvasSize: [192, 192], frames: ["aoe_0.png", "aoe_1.png", "aoe_2.png", "aoe_3.png", "aoe_4.png", "aoe_5.png"] }
      }
    },
    solar_pulse: {
      approvedEffect: false,
      runtimePath: "assets/images/effects/solar_pulse/",
      groups: {
        pulse: { approved: false, frameCount: 6, canvasSize: [192, 192], frames: ["pulse_0.png", "pulse_1.png", "pulse_2.png", "pulse_3.png", "pulse_4.png", "pulse_5.png"] }
      }
    },
    wind_blade: {
      approvedEffect: true,
      runtimePath: "assets/images/effects/wind_blade/",
      groups: {
        blade: { approved: true, frameCount: 4, canvasSize: [64, 64], frames: ["blade_0.png", "blade_1.png", "blade_2.png", "blade_3.png"] }
      }
    },
    compost_spore: {
      approvedEffect: true,
      runtimePath: "assets/images/effects/compost_spore/",
      groups: {
        area: { approved: true, frameCount: 6, canvasSize: [192, 192], frames: ["area_0.png", "area_1.png", "area_2.png", "area_3.png", "area_4.png", "area_5.png"] }
      }
    },
    common: {
      approvedEffect: true,
      runtimePath: "assets/images/effects/common/",
      groups: {
        hit_small: { approved: true, frameCount: 4, canvasSize: [64, 64], frames: ["hit_small_0.png", "hit_small_1.png", "hit_small_2.png", "hit_small_3.png"] },
        purify_pop: { approved: true, frameCount: 5, canvasSize: [96, 96], frames: ["purify_pop_0.png", "purify_pop_1.png", "purify_pop_2.png", "purify_pop_3.png", "purify_pop_4.png"] },
        pickup_sparkle: { approved: true, frameCount: 4, canvasSize: [64, 64], frames: ["pickup_sparkle_0.png", "pickup_sparkle_1.png", "pickup_sparkle_2.png", "pickup_sparkle_3.png"] }
      }
    }
  };

  function key(effectId, groupName, index) {
    return "effect_" + effectId + "_" + groupName + "_" + index;
  }

  function group(effectId, groupName) {
    var effect = MANIFEST[effectId];
    if (!effect || !effect.approvedEffect) return null;
    var g = effect.groups && effect.groups[groupName];
    if (!g || !g.approved) return null;
    return g;
  }

  function registerAll() {
    if (!global.Assets || !global.Assets.register) return;
    for (var effectId in MANIFEST) {
      var effect = MANIFEST[effectId];
      if (!effect.approvedEffect) continue;
      for (var groupName in effect.groups) {
        var g = effect.groups[groupName];
        if (!g.approved) continue;
        for (var i = 0; i < g.frames.length; i++) {
          global.Assets.register(key(effectId, groupName, i), [
            effect.runtimePath + g.frames[i] + "?v=" + VERSION
          ]);
        }
      }
    }
  }

  function ready(effectId, groupName) {
    var g = group(effectId, groupName);
    if (!g || !global.Assets || !global.Assets.ready) return false;
    for (var i = 0; i < g.frames.length; i++) {
      if (!global.Assets.ready(key(effectId, groupName, i))) return false;
    }
    return true;
  }

  function frameCount(effectId, groupName) {
    var g = group(effectId, groupName);
    return g ? g.frames.length : 0;
  }

  function drawFrame(ctx, effectId, groupName, frameIndex, cx, cy, opt) {
    var g = group(effectId, groupName);
    if (!g || !ready(effectId, groupName)) return false;
    var count = g.frames.length;
    var idx = ((frameIndex | 0) % count + count) % count;
    var entry = global.Assets.get(key(effectId, groupName, idx));
    if (!entry) return false;

    opt = opt || {};
    var dw = opt.w || opt.size || g.canvasSize[0];
    var dh = opt.h || opt.size || g.canvasSize[1];
    var alpha = opt.alpha == null ? 1 : opt.alpha;
    var rotation = opt.rotation || 0;

    ctx.save();
    ctx.translate(cx, cy);
    if (rotation) ctx.rotate(rotation);
    if (alpha !== 1) ctx.globalAlpha *= alpha;
    try {
      ctx.drawImage(entry.src, -dw / 2, -dh / 2, dw, dh);
    } catch (err) {
      ctx.restore();
      return false;
    }
    ctx.restore();
    return true;
  }

  function VisualEffect(effectId, groupName, x, y, opt) {
    opt = opt || {};
    this.effectId = effectId;
    this.groupName = groupName;
    this.x = x;
    this.y = y;
    this.age = 0;
    this.life = opt.life || 0.35;
    this.size = opt.size || 48;
    this.rotation = opt.rotation || 0;
    this.alpha = opt.alpha == null ? 1 : opt.alpha;
    this.dead = false;
  }

  VisualEffect.prototype.update = function (dt) {
    this.age += dt;
    if (this.age >= this.life) this.dead = true;
  };

  VisualEffect.prototype.draw = function (ctx) {
    var count = frameCount(this.effectId, this.groupName);
    if (!count) return false;
    var t = Math.max(0, Math.min(0.999, this.age / this.life));
    var frame = Math.floor(t * count);
    return drawFrame(ctx, this.effectId, this.groupName, frame, this.x, this.y, {
      size: this.size,
      rotation: this.rotation,
      alpha: this.alpha
    });
  };

  function debugSummary() {
    var out = [];
    for (var effectId in MANIFEST) {
      var effect = MANIFEST[effectId];
      for (var groupName in effect.groups) {
        out.push({
          effectId: effectId,
          groupName: groupName,
          approvedEffect: !!effect.approvedEffect,
          approvedGroup: !!effect.groups[groupName].approved,
          ready: ready(effectId, groupName),
          frames: effect.groups[groupName].frames.slice()
        });
      }
    }
    return out;
  }

  var api = {
    version: VERSION,
    manifest: MANIFEST,
    registerAll: registerAll,
    ready: ready,
    frameCount: frameCount,
    drawFrame: drawFrame,
    VisualEffect: VisualEffect,
    debugSummary: debugSummary
  };

  global.SkillEffectRenderer = api;
  registerAll();
})(window);
