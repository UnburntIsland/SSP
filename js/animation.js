/* ============================================================
   animation.js
   Shared 8-direction animation helpers for players and enemies.

   Real PNG frames are loaded through Assets when available. When frames are
   missing, the renderer keeps an animated directional fallback so gameplay and
   QA never depend on placeholder art being present.
   ============================================================ */
(function (global) {
  var DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  var DIR_VECTOR = {
    N: { x: 0, y: -1 },
    NE: { x: 0.707, y: -0.707 },
    E: { x: 1, y: 0 },
    SE: { x: 0.707, y: 0.707 },
    S: { x: 0, y: 1 },
    SW: { x: -0.707, y: 0.707 },
    W: { x: -1, y: 0 },
    NW: { x: -0.707, y: -0.707 }
  };

  var DEFAULT_DURATIONS = {
    idle: 0.48,
    walk: 0.13,
    move: 0.16
  };

  function getDirectionFromVector(vx, vy) {
    if (Math.abs(vx) < 0.001 && Math.abs(vy) < 0.001) return null;

    // Canvas coordinates: +X is right, +Y is down.
    var degrees = (Math.atan2(vy, vx) * 180 / Math.PI + 360) % 360;
    if (degrees >= 337.5 || degrees < 22.5) return "E";
    if (degrees >= 22.5 && degrees < 67.5) return "SE";
    if (degrees >= 67.5 && degrees < 112.5) return "S";
    if (degrees >= 112.5 && degrees < 157.5) return "SW";
    if (degrees >= 157.5 && degrees < 202.5) return "W";
    if (degrees >= 202.5 && degrees < 247.5) return "NW";
    if (degrees >= 247.5 && degrees < 292.5) return "N";
    if (degrees >= 292.5 && degrees < 337.5) return "NE";
    return "S";
  }

  function directionVector(dir) {
    return DIR_VECTOR[dir] || DIR_VECTOR.S;
  }

  function makeDirectionalSet(moveAction) {
    var idle = {};
    var move = {};
    DIRECTIONS.forEach(function (dir) {
      idle[dir] = ["idle_" + dir + "_0"];
      move[dir] = [
        moveAction + "_" + dir + "_0",
        moveAction + "_" + dir + "_1",
        moveAction + "_" + dir + "_2",
        moveAction + "_" + dir + "_3"
      ];
    });
    var out = { idle: idle };
    out[moveAction] = move;
    return out;
  }

  function countFallbackFrames(action) {
    return action === "idle" ? 1 : 4;
  }

  function animationIdFor(def) {
    return (def && (def.animationId || def.id)) || "unknown";
  }

  function isDebugAnimation() {
    return !!(global.Debug && global.Debug.animationEnabled);
  }

  function AnimatedSpriteAnimator(def, opts) {
    opts = opts || {};
    this.def = def || {};
    this.entityType = opts.entityType || "Entity";
    this.assetId = opts.assetId || animationIdFor(this.def);
    this.keyPrefix = opts.keyPrefix || "anim";
    this.idleAction = opts.idleAction || "idle";
    this.moveAction = opts.moveAction || "move";
    this.animationSet = opts.animationSet || this.def.animationSet || makeDirectionalSet(this.moveAction);
    this.durations = opts.durations || DEFAULT_DURATIONS;
    this.dir = opts.defaultDirection || "S";
    this.action = this.idleAction;
    this.frame = 0;
    this.timer = 0;
    this.elapsed = 0;
    this.moving = false;
    this.lastVx = 0;
    this.lastVy = 0;
    // strictDirection：只允許「同方向」的圖（walk_<DIR> 完整 4 張才用，
    // 否則固定用 idle_<DIR>_0）。不做鄰近方向 fallback、不做鏡像翻轉。
    // 玩家（CharacterAnimator）啟用；敵人維持原有行為。
    this.strictDirection = !!opts.strictDirection;
    if (this.strictDirection) this.registerOwnFrames();
  }

  // 預先註冊此 animator 自己 animationSet 內列出的所有幀，讓素材及早載入，
  // 避免「一半 walk 幀已載入、一半還在載」造成 walk / idle 混用閃爍。
  AnimatedSpriteAnimator.prototype.registerOwnFrames = function () {
    var set = this.animationSet || {};
    var self = this;
    Object.keys(set).forEach(function (action) {
      var byDir = set[action] || {};
      Object.keys(byDir).forEach(function (dir) {
        (byDir[dir] || []).forEach(function (frameName) {
          self.registerFrame(frameName);
        });
      });
    });
  };

  AnimatedSpriteAnimator.prototype.framesOf = function (action, dir) {
    var set = this.animationSet || {};
    return (set[action] && set[action][dir]) ? set[action][dir] : [];
  };

  AnimatedSpriteAnimator.prototype.frameCount = function (action, dir) {
    var frames = this.framesOf(action, dir);
    if (frames.length) return frames.length;
    if (action !== this.idleAction) return 1;
    return countFallbackFrames(action);
  };

  AnimatedSpriteAnimator.prototype.update = function (dt, vx, vy) {
    dt = Math.max(0, dt || 0);
    this.lastVx = vx || 0;
    this.lastVy = vy || 0;
    var moving = !!(vx || vy);
    if (moving) {
      var dir = getDirectionFromVector(vx, vy);
      if (dir && dir !== this.dir) {
        this.dir = dir;
        // 方向改變：從第 0 幀重新開始，避免殘留上一方向的幀（防閃爍）
        if (this.strictDirection) {
          this.frame = 0;
          this.timer = 0;
        }
      }
    }

    var nextAction = moving ? this.moveAction : this.idleAction;
    if (nextAction !== this.action) {
      this.action = nextAction;
      this.frame = 0;
      this.timer = 0;
    }

    this.moving = moving;
    this.elapsed += dt;

    var count = this.frameCount(this.action, this.dir);
    var duration = this.durations[this.action] || DEFAULT_DURATIONS[this.action] || 0.16;
    this.timer += dt;
    while (this.timer >= duration) {
      this.timer -= duration;
      this.frame = (this.frame + 1) % count;
    }
    if (this.frame >= count) this.frame = 0;
  };

  AnimatedSpriteAnimator.prototype.currentFrameName = function () {
    var frames = this.framesOf(this.action, this.dir);
    if (frames.length) return frames[Math.min(this.frame, frames.length - 1)];
    return this.action + "_" + this.dir + "_" + (this.frame % countFallbackFrames(this.action));
  };

  AnimatedSpriteAnimator.prototype.frameNameFor = function (action, dir, frame) {
    var frames = this.framesOf(action, dir);
    if (frames.length) return frames[Math.min(frame || 0, frames.length - 1)];
    return action + "_" + dir + "_" + ((frame || 0) % countFallbackFrames(action));
  };

  AnimatedSpriteAnimator.prototype.keyForFrame = function (frameName) {
    if (!frameName) return null;
    return this.keyPrefix + "_" + this.assetId + "_" + frameName;
  };

  function spritePathFor(def, frameName) {
    var path = def.spriteBasePath + frameName + ".png";
    if (def.spriteVersion) path += "?v=" + encodeURIComponent(def.spriteVersion);
    return path;
  }

  AnimatedSpriteAnimator.prototype.registerFrame = function (frameName) {
    var A = global.Assets;
    if (!A || !A.register || !this.def || !this.def.spriteBasePath || !frameName) return;
    A.register(this.keyForFrame(frameName), [spritePathFor(this.def, frameName)]);
  };

  // 規則：某方向的 walk「必須完整 4 張且全部載入完成」才可使用；
  // 缺任何一張都視為不可用（改用同方向 idle_<DIR>_0），避免 walk / idle 混用。
  AnimatedSpriteAnimator.prototype.isWalkApproved = function (dir) {
    var A = global.Assets;
    if (!A || !A.ready) return false;
    var frames = this.framesOf(this.moveAction, dir);
    if (!frames || frames.length < 4) return false;
    for (var i = 0; i < 4; i++) {
      this.registerFrame(frames[i]);
      if (!A.ready(this.keyForFrame(frames[i]))) return false;
    }
    return true;
  };

  // 嚴格模式解析（玩家用）：
  //   direction = DIR 時只允許兩種結果：
  //     1) walk_<DIR>_0~3 完整 → 用 walk_<DIR>_<frame>
  //     2) 否則 → 用 idle_<DIR>_0
  //   絕不 fallback 到其他方向、絕不鏡像翻轉（flipX 恆為 false）。
  AnimatedSpriteAnimator.prototype.resolveSpriteStrict = function () {
    var A = global.Assets;
    if (!A || !A.ready) return null;

    var current = this.currentFrameName();
    var requestedKey = this.keyForFrame(current);
    var isMove = this.action !== this.idleAction;
    var approvedWalk = isMove && this.isWalkApproved(this.dir);

    var frameName;
    var fallbackType;
    if (isMove && approvedWalk) {
      var frames = this.framesOf(this.moveAction, this.dir);
      frameName = frames[this.frame % frames.length];
      fallbackType = "exact";
    } else {
      // 停止移動、或該方向 walk 不完整 → 一律用同方向 idle 第 0 幀
      frameName = this.frameNameFor(this.idleAction, this.dir, 0);
      fallbackType = isMove ? "idle-direction" : "exact";
    }

    this.registerFrame(frameName);
    var key = this.keyForFrame(frameName);
    if (A.ready(key)) {
      return {
        key: key,
        requestedKey: requestedKey,
        resolvedKey: key,
        requestedFrameName: current,
        resolvedFrameName: frameName,
        fallbackType: fallbackType,
        flipX: false,
        hasSprite: true,
        fallback: fallbackType !== "exact",
        approvedWalk: approvedWalk
      };
    }
    if (A.pending && A.pending(key)) {
      return {
        key: null,
        requestedKey: requestedKey,
        resolvedKey: null,
        requestedFrameName: current,
        resolvedFrameName: frameName,
        fallbackType: "loading-" + fallbackType,
        flipX: false,
        hasSprite: false,
        fallback: true,
        approvedWalk: approvedWalk
      };
    }
    return {
      key: null,
      requestedKey: requestedKey,
      resolvedKey: null,
      requestedFrameName: current,
      resolvedFrameName: null,
      fallbackType: isDebugAnimation() ? "diagnostic" : "clean",
      flipX: false,
      hasSprite: false,
      fallback: true,
      approvedWalk: approvedWalk
    };
  };

  function fallbackDirections(dir) {
    var map = {
      NE: ["E", "N"],
      NW: ["W", "N"],
      SE: ["E", "S"],
      SW: ["W", "S"],
      N: ["NE", "NW", "S"],
      S: ["SE", "SW", "N"],
      E: ["SE", "NE", "S"],
      W: ["SW", "NW", "S"]
    };
    return map[dir] || ["S"];
  }

  function mirroredRightDirection(dir) {
    var map = { W: "E", NW: "NE", SW: "SE" };
    return map[dir] || null;
  }

  AnimatedSpriteAnimator.prototype.resolveSprite = function () {
    if (this.strictDirection) return this.resolveSpriteStrict();

    var A = global.Assets;
    if (!A || !A.ready) return null;

    var candidates = [];
    var seen = {};
    var current = this.currentFrameName();
    var requestedKey = this.keyForFrame(current);
    var self = this;
    var hasActionFrames = this.framesOf(this.action, this.dir).length > 0;
    var canUseActionFrame = this.action === this.idleAction || hasActionFrames;

    function add(frameName, fallbackType, flipX) {
      if (!frameName) return;
      var key = self.keyForFrame(frameName);
      var id = key + "|" + (flipX ? "1" : "0");
      if (!key || seen[id]) return;
      seen[id] = true;
      candidates.push({
        frameName: frameName,
        key: key,
        fallbackType: fallbackType,
        flipX: !!flipX
      });
    }

    if (canUseActionFrame) {
      add(current, "exact", false);
    }
    if (this.action !== this.idleAction) {
      add(this.frameNameFor(this.idleAction, this.dir, 0), "idle-direction", false);
    }

    fallbackDirections(this.dir).forEach(function (dir) {
      var hasNearActionFrames = self.framesOf(self.action, dir).length > 0;
      if (self.action === self.idleAction || hasNearActionFrames) {
        add(self.frameNameFor(self.action, dir, self.frame), "near-" + dir, false);
      }
      if (self.action !== self.idleAction) {
        add(self.frameNameFor(self.idleAction, dir, 0), "idle-near-" + dir, false);
      }
    });

    var mirror = mirroredRightDirection(this.dir);
    if (mirror) {
      var hasMirrorActionFrames = this.framesOf(this.action, mirror).length > 0;
      if (this.action === this.idleAction || hasMirrorActionFrames) {
        add(this.frameNameFor(this.action, mirror, this.frame), "mirror-" + mirror, true);
      }
      if (this.action !== this.idleAction) {
        add(this.frameNameFor(this.idleAction, mirror, 0), "idle-mirror-" + mirror, true);
      }
    }

    for (var i = 0; i < candidates.length; i++) {
      this.registerFrame(candidates[i].frameName);
      if (A.ready(candidates[i].key)) {
        return {
          key: candidates[i].key,
          requestedKey: requestedKey,
          resolvedKey: candidates[i].key,
          requestedFrameName: current,
          resolvedFrameName: candidates[i].frameName,
          fallbackType: candidates[i].fallbackType,
          flipX: candidates[i].flipX,
          hasSprite: true,
          fallback: candidates[i].fallbackType !== "exact"
        };
      }
      if (A.pending && A.pending(candidates[i].key)) {
        return {
          key: null,
          requestedKey: requestedKey,
          resolvedKey: null,
          requestedFrameName: current,
          resolvedFrameName: candidates[i].frameName,
          fallbackType: "loading-" + candidates[i].fallbackType,
          flipX: candidates[i].flipX,
          hasSprite: false,
          fallback: true
        };
      }
    }

    return {
      key: null,
      requestedKey: requestedKey,
      resolvedKey: null,
      requestedFrameName: current,
      resolvedFrameName: null,
      fallbackType: isDebugAnimation() ? "diagnostic" : "clean",
      flipX: false,
      hasSprite: false,
      fallback: true
    };
  };

  AnimatedSpriteAnimator.prototype.resolveKey = function () {
    var resolved = this.resolveSprite();
    return resolved && resolved.key ? resolved.key : null;
  };

  AnimatedSpriteAnimator.prototype.getRenderInfo = function (resolved) {
    var frameName = this.currentFrameName();
    if (typeof resolved === "string") {
      resolved = {
        key: resolved,
        requestedKey: this.keyForFrame(frameName),
        resolvedKey: resolved,
        requestedFrameName: frameName,
        resolvedFrameName: frameName,
        fallbackType: "exact",
        flipX: false,
        hasSprite: true,
        fallback: false
      };
    }
    resolved = resolved || {};
    var requestedKey = resolved.requestedKey || this.keyForFrame(frameName);
    var resolvedKey = resolved.resolvedKey || resolved.key || null;
    return {
      entityType: this.entityType,
      entityId: this.assetId,
      action: this.action,
      direction: this.dir,
      approvedWalk: this.action === this.moveAction && (
        this.strictDirection
          ? this.isWalkApproved(this.dir)
          : this.framesOf(this.action, this.dir).length > 0
      ),
      // 敵人（moveAction="move"）語意別名：approvedMove 與 approvedWalk 同值
      approvedMove: this.action === this.moveAction && (
        this.strictDirection
          ? this.isWalkApproved(this.dir)
          : this.framesOf(this.action, this.dir).length > 0
      ),
      frameIndex: this.frame,
      frameName: frameName,
      requestedFrameName: resolved.requestedFrameName || frameName,
      resolvedFrameName: resolved.resolvedFrameName || null,
      requestedKey: requestedKey,
      resolvedKey: resolvedKey,
      spriteKey: resolvedKey || requestedKey,
      hasSprite: !!resolved.hasSprite,
      fallback: resolved.fallback !== false,
      fallbackType: resolved.fallbackType || (resolvedKey ? "exact" : (isDebugAnimation() ? "diagnostic" : "clean")),
      fallbackKey: resolvedKey && resolvedKey !== requestedKey ? resolvedKey : "",
      flipX: !!resolved.flipX,
      inputVx: this.lastVx || 0,
      inputVy: this.lastVy || 0
    };
  };

  AnimatedSpriteAnimator.prototype.state = function () {
    return this.action + "_" + this.dir;
  };

  function CharacterAnimator(character) {
    AnimatedSpriteAnimator.call(this, character, {
      entityType: "Player",
      assetId: animationIdFor(character),
      keyPrefix: "canim",
      idleAction: "idle",
      moveAction: "walk",
      animationSet: character && character.animationSet,
      durations: { idle: 0.48, walk: 0.13 },
      strictDirection: true
    });
    this.char = character || {};
    this.charId = this.assetId;
  }
  CharacterAnimator.prototype = Object.create(AnimatedSpriteAnimator.prototype);
  CharacterAnimator.prototype.constructor = CharacterAnimator;

  function EnemyAnimator(enemyDef) {
    AnimatedSpriteAnimator.call(this, enemyDef, {
      entityType: "Enemy",
      assetId: animationIdFor(enemyDef),
      keyPrefix: "eanim",
      idleAction: "idle",
      moveAction: "move",
      animationSet: enemyDef && enemyDef.animationSet,
      durations: {
        idle: enemyDef && enemyDef.isBoss ? 0.6 : 0.46,
        move: enemyDef && enemyDef.isBoss ? 0.22 : 0.16
      },
      strictDirection: true
    });
    this.enemyId = this.assetId;
  }
  EnemyAnimator.prototype = Object.create(AnimatedSpriteAnimator.prototype);
  EnemyAnimator.prototype.constructor = EnemyAnimator;

  function registerAnimationSet(def, keyPrefix, actions) {
    var A = global.Assets;
    if (!A || !A.register || !def || !def.animationSet || !def.spriteBasePath) return 0;
    var count = 0;
    actions.forEach(function (action) {
      var byDir = def.animationSet[action] || {};
      Object.keys(byDir).forEach(function (dir) {
        byDir[dir].forEach(function (frameName) {
          A.register(keyPrefix + "_" + animationIdFor(def) + "_" + frameName, [spritePathFor(def, frameName)]);
          count += 1;
        });
      });
    });
    return count;
  }

  function registerAll() {
    var GD = global.GameData || {};
    if (GD.characters) {
      GD.characters.forEach(function (ch) {
        registerAnimationSet(ch, "canim", ["idle", "walk"]);
      });
    }
    if (GD.enemies) {
      Object.keys(GD.enemies).forEach(function (id) {
        registerAnimationSet(GD.enemies[id], "eanim", ["idle", "move"]);
      });
    }
  }

  function assetReady(key) {
    return !!(global.Assets && global.Assets.ready && key && global.Assets.ready(key));
  }

  function auditDef(def, prefix, actions) {
    var missing = [];
    var registered = 0;
    if (!def || !def.animationSet) {
      return { id: def && def.id, registered: 0, missing: ["missing animationSet"] };
    }
    actions.forEach(function (action) {
      DIRECTIONS.forEach(function (dir) {
        var frames = def.animationSet[action] && def.animationSet[action][dir];
        if (!frames || !frames.length) {
          missing.push(action + "_" + dir + " missing data");
          return;
        }
        frames.forEach(function (frameName) {
          var key = prefix + "_" + animationIdFor(def) + "_" + frameName;
          registered += 1;
          if (!assetReady(key)) missing.push(key);
        });
      });
    });
    return { id: animationIdFor(def), registered: registered, missing: missing };
  }

  function auditAnimations() {
    var GD = global.GameData || {};
    var characters = (GD.characters || []).map(function (ch) {
      return auditDef(ch, "canim", ["idle", "walk"]);
    });
    var enemies = Object.keys(GD.enemies || {}).map(function (id) {
      return auditDef(GD.enemies[id], "eanim", ["idle", "move"]);
    });
    var fallbackCount = characters.concat(enemies).reduce(function (sum, item) {
      return sum + item.missing.length;
    }, 0);
    var report = {
      directions: DIRECTIONS.slice(),
      directionMapping: directionMappingSelfTest(),
      characterCount: characters.length,
      enemyCount: enemies.length,
      characters: characters,
      enemies: enemies,
      fallbackCount: fallbackCount,
      ok: fallbackCount === 0
    };
    if (global.Debug && global.Debug.animationEnabled && global.console) {
      console.groupCollapsed("[debugAnimation] animation asset audit");
      console.log(report);
      console.table(report.directionMapping);
      console.groupEnd();
    }
    return report;
  }

  function directionMappingSelfTest() {
    var cases = [
      { input: "W / ArrowUp", vx: 0, vy: -1, expected: "N" },
      { input: "S / ArrowDown", vx: 0, vy: 1, expected: "S" },
      { input: "A / ArrowLeft", vx: -1, vy: 0, expected: "W" },
      { input: "D / ArrowRight", vx: 1, vy: 0, expected: "E" },
      { input: "W + D", vx: 1, vy: -1, expected: "NE" },
      { input: "W + A", vx: -1, vy: -1, expected: "NW" },
      { input: "S + D", vx: 1, vy: 1, expected: "SE" },
      { input: "S + A", vx: -1, vy: 1, expected: "SW" }
    ];
    return cases.map(function (item) {
      var actual = getDirectionFromVector(item.vx, item.vy);
      return {
        input: item.input,
        vx: item.vx,
        vy: item.vy,
        expected: item.expected,
        actual: actual,
        ok: actual === item.expected
      };
    });
  }

  function drawDirectionCue(ctx, x, y, size, dir, frame, tint) {
    var v = directionVector(dir);
    var frontX = x + v.x * size * 0.47;
    var frontY = y + v.y * size * 0.39;
    var baseX = x + v.x * size * 0.12;
    var baseY = y + v.y * size * 0.1;
    var perpX = -v.y;
    var perpY = v.x;
    var half = Math.max(5, size * 0.11);
    var pulse = 2 + (frame % 2);
    ctx.save();
    ctx.fillStyle = tint || "rgba(113, 224, 175, 0.72)";
    ctx.strokeStyle = "rgba(14, 47, 48, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(frontX), Math.round(frontY));
    ctx.lineTo(Math.round(baseX + perpX * half), Math.round(baseY + perpY * half));
    ctx.lineTo(Math.round(baseX - perpX * half), Math.round(baseY - perpY * half));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.62)";
    ctx.fillRect(Math.round(frontX - pulse * 0.5), Math.round(frontY - pulse * 0.5), pulse, pulse);
    ctx.restore();
  }

  function pixelRect(ctx, cx, cy, w, h) {
    ctx.fillRect(Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h));
  }

  function drawFallbackFacingOverlay(ctx, x, y, size, dir, frame, opts) {
    var v = directionVector(dir);
    var perpX = -v.y;
    var perpY = v.x;
    var frontX = x + v.x * size * 0.17;
    var frontY = y + v.y * size * 0.14;
    var backX = x - v.x * size * 0.15;
    var backY = y - v.y * size * 0.12;
    var isEnemy = opts && opts.entityType === "Enemy";
    var side = Math.abs(v.x) > 0.55;
    var backFacing = v.y < -0.35;
    var frontFacing = v.y > 0.35;
    var bounce = (frame % 2) ? 1 : 0;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = Math.max(0.72, opts && opts.alpha == null ? 1 : opts.alpha);
    ctx.fillStyle = isEnemy ? "rgba(62, 48, 82, 0.88)" : "rgba(69, 43, 29, 0.86)";
    ctx.strokeStyle = "rgba(13, 33, 34, 0.58)";
    ctx.lineWidth = 1;

    if (backFacing) {
      pixelRect(ctx, backX, backY, size * 0.18, size * 0.18);
      ctx.strokeRect(Math.round(backX - size * 0.09), Math.round(backY - size * 0.09), Math.round(size * 0.18), Math.round(size * 0.18));
      ctx.fillStyle = isEnemy ? "rgba(186, 164, 214, 0.85)" : "rgba(109, 184, 85, 0.9)";
      pixelRect(ctx, backX + perpX * size * 0.04, backY + perpY * size * 0.04, size * 0.06, size * 0.08);
    } else if (side) {
      ctx.fillStyle = "rgba(26, 38, 43, 0.92)";
      pixelRect(ctx, frontX, frontY - size * 0.04, size * 0.07, size * 0.055);
      ctx.fillStyle = isEnemy ? "rgba(226, 213, 172, 0.9)" : "rgba(255, 216, 88, 0.92)";
      pixelRect(ctx, x + v.x * size * 0.28, y + v.y * size * 0.1 + bounce, size * 0.12, size * 0.045);
    } else if (frontFacing) {
      ctx.fillStyle = "rgba(26, 38, 43, 0.92)";
      pixelRect(ctx, frontX + perpX * size * 0.055, frontY + perpY * size * 0.055, size * 0.045, size * 0.045);
      pixelRect(ctx, frontX - perpX * size * 0.055, frontY - perpY * size * 0.055, size * 0.045, size * 0.045);
      ctx.fillStyle = isEnemy ? "rgba(117, 92, 126, 0.86)" : "rgba(102, 72, 42, 0.84)";
      pixelRect(ctx, backX, backY, size * 0.14, size * 0.12);
    } else {
      ctx.fillStyle = "rgba(26, 38, 43, 0.9)";
      pixelRect(ctx, frontX, frontY, size * 0.055, size * 0.055);
    }

    if (Math.abs(v.x) > 0.2 && Math.abs(v.y) > 0.2) {
      ctx.fillStyle = isEnemy ? "rgba(183, 199, 214, 0.82)" : "rgba(97, 178, 103, 0.84)";
      pixelRect(ctx, x + v.x * size * 0.22, y + v.y * size * 0.2, size * 0.09, size * 0.055);
    }
    ctx.restore();
  }

  function drawCleanFallbackCharacter(ctx, opts, info) {
    opts = opts || {};
    var animator = opts.animator;
    var dir = (info && info.direction) || opts.direction || "S";
    var frame = (info && info.frameIndex) || 0;
    var action = (info && info.action) || "idle";
    var sizeW = opts.w || opts.size || 48;
    var sizeH = opts.h || opts.size || 48;
    var x = opts.x || 0;
    var y = opts.y || 0;
    var alpha = opts.alpha == null ? 1 : opts.alpha;
    var elapsed = animator ? animator.elapsed : 0;
    var moving = action !== "idle";
    var beat = moving ? Math.sin((frame / Math.max(1, countFallbackFrames(action))) * Math.PI * 2) : Math.sin(elapsed * 2.6);
    var squashX = moving ? 1 + beat * 0.045 : 1;
    var squashY = moving ? 1 - beat * 0.035 : 1;
    var bob = moving ? Math.abs(Math.sin(elapsed * 8.5)) * sizeH * 0.045 : Math.sin(elapsed * 2.5) * sizeH * 0.015;
    var spriteId = opts.spriteId;

    if (global.Sprites && global.Sprites.drawSized && spriteId) {
      ctx.save();
      ctx.translate(x, y - bob);
      global.Sprites.drawSized(ctx, spriteId, 0, 0, sizeW * squashX, sizeH * squashY, { alpha: alpha });
      ctx.restore();
      return true;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = opts.entityType === "Enemy" ? "#6b6578" : "#4f8f5e";
    ctx.strokeStyle = "#10242a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y - bob, sizeW * 0.32, sizeH * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = opts.entityType === "Enemy" ? "#d9d0e3" : "#e7f3bd";
    pixelRect(ctx, x, y - bob - sizeH * 0.1, sizeW * 0.16, sizeH * 0.1);
    ctx.restore();
    return true;
  }

  function drawDiagnosticFallbackCharacter(ctx, opts, info) {
    opts = opts || {};
    var animator = opts.animator;
    var dir = (info && info.direction) || opts.direction || "S";
    var frame = (info && info.frameIndex) || 0;
    var action = (info && info.action) || "idle";
    var sizeW = opts.w || opts.size || 48;
    var sizeH = opts.h || opts.size || 48;
    var x = opts.x || 0;
    var y = opts.y || 0;
    var alpha = opts.alpha == null ? 1 : opts.alpha;
    var elapsed = animator ? animator.elapsed : 0;
    var moving = action !== "idle";
    var beat = moving ? Math.sin((frame / Math.max(1, countFallbackFrames(action))) * Math.PI * 2) : Math.sin(elapsed * 2.6);
    var squashX = moving ? 1 + beat * 0.045 : 1;
    var squashY = moving ? 1 - beat * 0.035 : 1;
    var bob = moving ? Math.abs(Math.sin(elapsed * 8.5)) * sizeH * 0.045 : Math.sin(elapsed * 2.5) * sizeH * 0.015;
    var faceLeft = (dir === "W" || dir === "NW" || dir === "SW");
    var spriteId = opts.spriteId;

    if (global.Sprites && global.Sprites.drawSized && spriteId) {
      ctx.save();
      ctx.translate(x, y - bob);
      if (faceLeft) ctx.scale(-1, 1);
      global.Sprites.drawSized(ctx, spriteId, 0, 0, sizeW * squashX, sizeH * squashY, { alpha: alpha });
      ctx.restore();
    }

    if (alpha > 0.2) {
      drawFallbackFacingOverlay(ctx, x, y - bob, Math.max(sizeW, sizeH), dir, frame, {
        alpha: alpha,
        entityType: opts.entityType
      });
      drawDirectionCue(
        ctx,
        x,
        y - bob,
        Math.max(sizeW, sizeH),
        dir,
        frame,
        opts.cueTint || (opts.entityType === "Enemy" ? "rgba(169, 223, 86, 0.78)" : "rgba(87, 235, 218, 0.92)")
      );
    }

    if (info && global.Debug && global.Debug.recordAnimation) {
      var out = {};
      for (var k in info) out[k] = info[k];
      out.fallback = true;
      out.hasSprite = false;
      out.fallbackType = "diagnostic";
      out.fallbackKey = "diagnostic_" + dir;
      out.flipX = faceLeft;
      global.Debug.recordAnimation(out);
    }
    return true;
  }

  function drawFallbackSprite(ctx, opts) {
    opts = opts || {};
    var animator = opts.animator;
    var emptyResolution = {
      key: null,
      fallbackType: isDebugAnimation() ? "diagnostic" : "clean",
      hasSprite: false,
      fallback: true,
      flipX: false
    };
    var info = animator && animator.getRenderInfo ? animator.getRenderInfo(emptyResolution) : null;
    if (isDebugAnimation()) return drawDiagnosticFallbackCharacter(ctx, opts, info);
    var drawn = drawCleanFallbackCharacter(ctx, opts, info);
    if (info && global.Debug && global.Debug.recordAnimation) global.Debug.recordAnimation(info);
    return drawn;
  }

  function drawResolvedSprite(ctx, resolved, cx, cy, boxW, boxH, alpha) {
    if (!resolved || !resolved.key || !global.Assets || !global.Assets.get) return false;
    var e = global.Assets.get(resolved.key);
    if (!e) return false;
    var sc = Math.min(boxW / e.w, boxH / e.h);
    var dw = e.w * sc;
    var dh = e.h * sc;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (alpha != null && alpha !== 1) ctx.globalAlpha = alpha;
    try {
      if (resolved.flipX) {
        ctx.translate(cx, cy);
        ctx.scale(-1, 1);
        ctx.drawImage(e.src, -dw / 2, -dh / 2, dw, dh);
      } else {
        ctx.drawImage(e.src, cx - dw / 2, cy - dh / 2, dw, dh);
      }
    } catch (err) {
      ctx.restore();
      return false;
    }
    ctx.restore();
    return true;
  }

  function drawAnimationDebugLabel(ctx, opts) {
    if (!isDebugAnimation()) return;
    opts = opts || {};
    var animator = opts.animator;
    if (!animator || !animator.getRenderInfo) return;
    var info = animator.getRenderInfo(opts.resolution);
    var vx = Number(info.inputVx || 0).toFixed(2);
    var vy = Number(info.inputVy || 0).toFixed(2);
    var lines = [
      "dir=" + info.direction + " action=" + info.action + " f" + info.frameIndex,
      "vx=" + vx + " vy=" + vy,
      "requested=" + (info.requestedKey || "-"),
      "resolved=" + (info.resolvedKey || "-"),
      "hasSprite=" + info.hasSprite + " type=" + info.fallbackType,
      (info.entityType === "Enemy" ? "approvedMove=" : "approvedWalk=") + info.approvedWalk + " flipX=" + info.flipX
    ];
    var x = opts.x || 0;
    var y = (opts.y || 0) - (opts.offsetY || 52);
    var padX = 5;
    var lineH = 10;
    ctx.save();
    ctx.font = "8px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var width = 0;
    lines.forEach(function (line) { width = Math.max(width, ctx.measureText(line).width); });
    var h = lines.length * lineH + 6;
    ctx.fillStyle = "rgba(4, 10, 14, 0.74)";
    ctx.strokeStyle = "rgba(87, 235, 218, 0.75)";
    ctx.lineWidth = 1;
    ctx.fillRect(Math.round(x - width / 2 - padX), Math.round(y - h / 2), Math.round(width + padX * 2), h);
    ctx.strokeRect(Math.round(x - width / 2 - padX) + 0.5, Math.round(y - h / 2) + 0.5, Math.round(width + padX * 2), h);
    ctx.fillStyle = "#eafff7";
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], Math.round(x), Math.round(y - h / 2 + 6 + i * lineH));
    }
    ctx.restore();
  }

  function recordResolved(animator, resolvedKey) {
    if (!animator || !global.Debug || !global.Debug.recordAnimation) return;
    global.Debug.recordAnimation(animator.getRenderInfo(resolvedKey));
  }

  var Animation = {
    DIRECTIONS: DIRECTIONS,
    DEFAULT_DURATIONS: DEFAULT_DURATIONS,
    getDirectionFromVector: getDirectionFromVector,
    directionVector: directionVector,
    makeDirectionalSet: makeDirectionalSet,
    AnimatedSpriteAnimator: AnimatedSpriteAnimator,
    CharacterAnimator: CharacterAnimator,
    EnemyAnimator: EnemyAnimator,
    registerAll: registerAll,
    auditAnimations: auditAnimations,
    drawFallbackSprite: drawFallbackSprite,
    drawCleanFallbackCharacter: drawCleanFallbackCharacter,
    drawDiagnosticFallbackCharacter: drawDiagnosticFallbackCharacter,
    drawResolvedSprite: drawResolvedSprite,
    drawAnimationDebugLabel: drawAnimationDebugLabel,
    recordResolved: recordResolved,
    getAnimationState: function (entity) {
      var animator = entity && entity.animator;
      return animator ? animator.state() : "idle_S";
    }
  };

  function shouldEagerRegister() {
    try {
      return new URLSearchParams(global.location.search).get("debugAnimationPreload") === "1";
    } catch (e) {
      return false;
    }
  }

  if (shouldEagerRegister()) registerAll();
  global.Animation = Animation;
  global.DIRECTIONS = DIRECTIONS;
  global.getDirectionFromVector = getDirectionFromVector;
  global.CharacterAnimator = CharacterAnimator;
  global.EnemyAnimator = EnemyAnimator;
})(window);
