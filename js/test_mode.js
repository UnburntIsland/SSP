/* ============================================================
   test_mode.js  —  QA / E2E 測試模式
   只有在 URL 帶有 ?test=1 時啟用。
   不改變正式遊戲模式；提供短關卡、固定亂數與少量測試 helper。
   ============================================================ */
(function (global) {
  var params = new URLSearchParams(global.location.search);
  var enabled = params.get("test") === "1";

  var TestMode = {
    enabled: enabled,
    seed: Number(params.get("seed")) || 424242,
    stageId: params.get("stage") || "tidal_flat",
    unlockStages: params.get("qaUnlockStages") === "1"
  };

  global.TestMode = TestMode;
  if (!enabled) return;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var rng = mulberry32(TestMode.seed);
  TestMode.originalRandom = Math.random;
  TestMode.random = rng;
  Math.random = rng;

  function applyStageTuning() {
    var stage = global.GameData && global.GameData.getStage && global.GameData.getStage("tidal_flat");
    if (!stage) return;

    stage.duration = Number(params.get("duration")) || 30;
    stage.spawnRadius = 520;
    stage.maxEnemies = 90;
    stage.maxElites = 2;
    stage.waves = [
      {
        from: 0, to: 10,
        interval: 0.55, batch: 2,
        types: [{ enemy: "plastic_bag", weight: 1 }]
      },
      {
        from: 10, to: 20,
        interval: 0.45, batch: 2,
        types: [
          { enemy: "plastic_bag", weight: 2 },
          { enemy: "butt_bug", weight: 2 }
        ]
      },
      {
        from: 20, to: 30,
        interval: 0.40, batch: 3,
        types: [
          { enemy: "plastic_bag", weight: 2 },
          { enemy: "butt_bug", weight: 2 },
          { enemy: "battery_slime", weight: 0.45 }
        ]
      }
    ];
    stage.events = [
      { at: 20, enemy: stage.bossId || "ghost_net", count: 1, announce: "測試模式：關卡 BOSS 提前登場！" }
    ];
  }

  function applyPlayerTuning() {
    if (!global.Player || !global.Player.prototype) return;
    global.Player.prototype.xpForLevel = function (level) {
      return Math.max(2, 2 + (level - 1) * 2);
    };
  }

  function applyCoinTuning() {
    if (!global.Game || global.Game._testModePatched) return;
    var originalEnd = global.Game.end;
    global.Game.end = function (result) {
      if (this.player && !this._testCoinBoostApplied) {
        this.player.coinMult *= 4;
        this._testCoinBoostApplied = true;
      }
      return originalEnd.call(this, result);
    };
    global.Game._testModePatched = true;
  }

  function activeScreenName() {
    var ids = {
      menu: "screen-menu",
      characters: "screen-characters",
      shop: "screen-shop",
      codex: "screen-codex",
      help: "screen-help",
      victory: "screen-victory",
      gameover: "screen-gameover"
    };
    for (var name in ids) {
      var el = document.getElementById(ids[name]);
      if (el && !el.classList.contains("hidden")) return name;
    }
    if (document.getElementById("hud") && !document.getElementById("hud").classList.contains("hidden")) return "game";
    return "none";
  }

  function installHelpers() {
    global.__TEST__ = {
      enabled: true,
      getState: function () {
        var g = global.Game || {};
        var p = g.player || null;
        return {
          screen: activeScreenName(),
          stageId: g.stage ? g.stage.id : null,
          bossDefeated: !!g.bossDefeated,
          running: !!g.running,
          paused: !!g.paused,
          knowledgePaused: !!g.knowledgePaused,
          runIntroActive: !!g.runIntroActive,
          runIntroRemaining: g.runIntroRemaining || 0,
          ended: !!g.ended,
          time: g.time || 0,
           enemies: g.enemies ? g.enemies.length : 0,
           enemyProjectiles: g.enemyProjectiles ? g.enemyProjectiles.length : 0,
           deployables: g.deployables ? g.deployables.map(function (device) {
             return {
               x: device.x,
               y: device.y,
               life: device.life,
               duration: device.duration,
               direction: device.direction,
               dead: !!device.dead
             };
           }) : [],
           pickups: g.pickups ? g.pickups.length : 0,
           quizCorrect: g.quizCorrect || 0,
           quizIncorrect: g.quizIncorrect || 0,
           quizStreak: g.quizStreak || 0,
           bestQuizStreak: g.bestQuizStreak || 0,
           eliteRewardLevel: g.eliteRewardLevel || 0,
           mapCleaned: g.mapCleanedCount || 0,
           mapObjects: global.StageRenderer && global.StageRenderer.props ? global.StageRenderer.props.map(function (prop) {
             return { id: prop.id, type: prop.type, x: prop.x, y: prop.y };
           }) : [],
           mapObjectSpawnInterval: g.mapObjectSpawnInterval || 0,
           mapObjectSpawnRemaining: g.mapObjectSpawnInterval ? Math.max(0, g.mapObjectSpawnInterval - (g.mapObjectSpawnAcc || 0)) : 0,
           contamination: g.contamination ? {
             active: !!g.contamination.active,
             outside: !!g.contamination.outside,
             radius: g.contamination.radius,
             projectedRadius: g.contamination.projectedRadius,
             phase: g.contamination.phase,
             secondsUntilShrink: g.contamination.secondsUntilShrink
           } : null,
          player: p ? {
            x: p.x, y: p.y,
            hp: p.hp, maxHp: p.maxHp,
            level: p.level, xp: p.xp, xpToNext: p.xpToNext,
            pickupRange: p.pickupRange,
            cooldownMult: p.cooldownMult,
            dashCooldown: p.dashCooldown,
            dashTimer: p.dashTimer,
            eliteDamageMult: p.eliteDamageMult,
            passives: (p.passiveUpgradeOrder || []).map(function (id) {
              var passive = p.passiveUpgrades && p.passiveUpgrades[id];
              return passive ? { id: id, level: passive.level } : null;
            }).filter(Boolean),
            weapons: p.weapons.map(function (w) { return { id: w.skill.id, level: w.level, timer: w.timer }; })
          } : null,
          save: global.Storage ? JSON.parse(JSON.stringify(global.Storage.data)) : null
        };
      },
      grantCoins: function (amount) {
        global.Storage.addCoins(amount || 500);
        if (global.App && global.App.ui) global.App.ui.updateCoinLabels();
        return global.Storage.getCoins();
      },
      forceVictory: function () {
        if (global.Game && global.Game.running) global.Game.end("victory");
      },
      clearCurrentStage: function () {
        if (!global.Game || !global.Game.running || !global.Game.stage) return false;
        var bossDef = global.GameData.getEnemy(global.Game.stage.bossId);
        if (!bossDef) return false;
        var boss = new global.Enemy(bossDef, global.Game.player.x + 80, global.Game.player.y, 1);
        boss.dead = true;
        boss.hp = 0;
        global.Game.onPurified(boss);
        global.Game.enemies = [];
        global.Game.time = global.Game.stage.duration;
        global.Game.end("victory");
        return true;
      },
       forceDefeat: function () {
         if (global.Game && global.Game.running) global.Game.end("defeat");
       },
       forceLevelUp: function () {
         if (!global.Game || !global.Game.running || global.Game.ended) return false;
         global.Game.pendingLevelUps += 1;
         if (!global.Game.paused) global.Game.triggerLevelUp();
         return true;
       },
       grantPassive: function (id) {
         if (!global.Game || !global.Game.running || global.Game.ended) return false;
         return global.Game.applyPassiveUpgrade(id);
       },
       setSkillLevel: function (id, level) {
         if (!global.Game || !global.Game.player) return false;
         var player = global.Game.player;
         if (!player.hasSkill(id)) player.addSkill(id);
         var weapon = player.getWeapon(id);
         if (!weapon) return false;
         var target = Math.max(1, Math.min(weapon.skill.maxLevel, Number(level) || 1));
         weapon.level = target;
         return { id: id, level: weapon.level, stats: weapon.stats() };
       },
       setGameTime: function (seconds) {
         if (!global.Game || !global.Game.running) return false;
         global.Game.time = Math.max(0, Number(seconds) || 0);
         return global.Game.time;
       },
       requestDash: function () {
         if (!global.Input || !global.Input.requestDash) return false;
         global.Input.requestDash();
         return true;
       },
       spawnEnemy: function (enemyId, x, y) {
         if (!global.Game || !global.Game.running) return null;
         var def = global.GameData.getEnemy(enemyId);
         if (!def) return null;
         var p = global.Game.player;
         var enemy = new global.Enemy(def, x == null ? p.x + 240 : x, y == null ? p.y : y, 1);
         global.Game.enemies.push(enemy);
         return enemy;
       },
       spawnMapObject: function (type, x, y) {
         if (!global.Game || !global.Game.running || !global.StageRenderer || !global.StageRenderer.spawnRandomObject) return null;
         var p = global.Game.player;
         var position = (x == null || y == null) ? null : { x: x, y: y };
         return global.StageRenderer.spawnRandomObject(p, type, position);
       },
      unlockKnowledge: function () {
        var entry = global.Storage.unlockNextKnowledge();
        if (global.App && global.App.ui) global.App.ui.buildCodex();
        return entry;
      },
      resetSave: function () {
        global.Storage.reset();
        if (global.App && global.App.ui) global.App.ui.updateCoinLabels();
        return global.Storage.data;
      }
    };

    if (params.get("qaSkipIntro") === "1") {
      var introSkipPoll = setInterval(function () {
        if (!global.Game || !global.Game.running || !global.Game.runIntroActive) return;
        clearInterval(introSkipPoll);
        global.Game.skipRunIntro();
      }, 25);
    }

    var wantsScenario = params.get("qaLevelUp") === "1" || params.get("qaRanged") === "1" ||
      params.get("qaZone") === "1" || params.get("qaDefeat") === "1" ||
      !!params.get("qaKnowledge") || !!params.get("qaMap") || params.get("qaZoneOutside") === "1" ||
      params.get("qaFinalCountdown") === "1" || !!params.get("qaQuizStreak") || params.get("qaPassives") === "1" ||
      params.get("qaTurret") === "1" || params.get("qaBossAttack") === "1" || params.get("qaDamageFlash") === "1" ||
      !!params.get("qaEnemyIntro") || !!params.get("qaEnemy8Dir") ||
      params.get("qaBossIntro") === "1" || params.get("qaClearStage") === "1";
    if (wantsScenario) {
      var scenarioPoll = setInterval(function () {
        if (!global.Game || !global.Game.running || !global.Game.player) return;
        if (global.Game.runIntroActive) return;
        clearInterval(scenarioPoll);

        if (params.get("qaFinalCountdown") === "1") {
          global.Game.stage.events = [];
          global.Game.enemies = [];
          global.Game.enemyProjectiles = [];
          global.Game.time = Math.max(0, global.Game.stage.duration - 9.2);
        }

        if (params.get("qaZone") === "1" && global.Game.contamination) {
          global.Game.stage.events = [];
          global.Game.enemies = [];
          global.Game.enemyProjectiles = [];
          global.Game.time = global.Game.contamination.startsAt + 2;
        }
        if (params.get("qaZoneOutside") === "1" && global.Game.contamination) {
          global.Game.stage.events = [];
          global.Game.enemies = [];
          global.Game.enemyProjectiles = [];
          global.Game.time = global.Game.contamination.startsAt + 2;
          global.Game.player.x = 24;
          global.Game.player.y = 24;
        }
        if (params.get("qaRanged") === "1") {
          var def = global.GameData.getEnemy("battery_slime");
          var p = global.Game.player;
          var enemy = new global.Enemy(def, p.x + 230, p.y, 1);
          enemy.spawnAge = enemy.spawnDuration;
          enemy.attackTimer = 0.12;
          global.Game.enemies.push(enemy);
        }
        if (params.get("qaEnemyIntro") || params.get("qaBossIntro") === "1") {
          global.Game.stage.waves = [];
          global.Game.stage.events = [];
          global.Game.enemies = [];
          global.Game.enemyProjectiles = [];
          var introEnemyId = params.get("qaBossIntro") === "1"
            ? "oil_blob"
            : (params.get("qaEnemyIntro") || "battery_slime");
          var introEnemy = global.Game.spawnOne(introEnemyId, introEnemyId === "oil_blob");
          if (introEnemy && introEnemyId === "oil_blob") {
            introEnemy.x = global.Game.player.x + 190;
            introEnemy.y = global.Game.player.y - 20;
            introEnemy.speed = 0;
            introEnemy.contact = 0;
            introEnemy.maxHp = 99999;
            introEnemy.hp = introEnemy.maxHp;
          }
        }
        if (params.get("qaEnemy8Dir")) {
          global.Game.stage.waves = [];
          global.Game.stage.events = [];
          global.Game.enemies = [];
          global.Game.enemyProjectiles = [];
          var eightDirEnemyId = params.get("qaEnemy8Dir");
          var eightDirDef = global.GameData.getEnemy(eightDirEnemyId);
          var eightDirPlayer = global.Game.player;
          if (eightDirDef && eightDirPlayer) {
            ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].forEach(function (direction) {
              var vector = global.Animation.directionVector(direction);
              var enemy = new global.Enemy(
                eightDirDef,
                eightDirPlayer.x - vector.x * 155,
                eightDirPlayer.y - vector.y * 155,
                1
              );
              enemy.spawnAge = enemy.spawnDuration;
              enemy.speed = 4;
              enemy.contact = 0;
              enemy.ranged = null;
              enemy.maxHp = 99999;
              enemy.hp = enemy.maxHp;
              global.Game.enemies.push(enemy);
            });
          }
        }
        if (params.get("qaBossAttack") === "1") {
          global.Game.stage.waves = [];
          global.Game.stage.events = [];
          global.Game.enemies = [];
          global.Game.enemyProjectiles = [];
          var bossDef = global.GameData.getEnemy("oil_blob");
          var bossPlayer = global.Game.player;
          var boss = new global.Enemy(bossDef, bossPlayer.x + 185, bossPlayer.y - 25, 1);
          boss.spawnAge = boss.spawnDuration;
          boss.speed = 0;
          boss.contact = 0;
          boss.maxHp = 99999;
          boss.hp = boss.maxHp;
          boss.ranged = Object.assign({}, bossDef.ranged, {
            cooldown: 1.8,
            telegraph: 1.2,
            projectileDamage: 0.01,
            projectileSpeed: 105
          });
          boss.attackTimer = 0.15;
          global.Game.enemies.push(boss);
        }
        if (params.get("qaDamageFlash") === "1") {
          global.Game.stage.waves = [];
          global.Game.stage.events = [];
          global.Game.enemies = [];
          global.Game.enemyProjectiles = [];
          var flashPlayer = global.Game.player;
          var flashDef = global.GameData.getEnemy("battery_slime");
          var flashEnemy = new global.Enemy(flashDef, flashPlayer.x + 105, flashPlayer.y, 1);
          flashEnemy.spawnAge = flashEnemy.spawnDuration;
          flashEnemy.speed = 0;
          flashEnemy.contact = 0;
          flashEnemy.ranged = null;
          flashEnemy.maxHp = 9999;
          flashEnemy.hp = flashEnemy.maxHp;
          flashEnemy.takeDamage(1);
          flashEnemy.hitFlash = 1.5;
          flashEnemy.damageInvulnTimer = 1.5;
          flashPlayer.takeDamage(2);
          flashPlayer.hitFlash = 1.5;
          flashPlayer.invulnTimer = Math.max(flashPlayer.invulnTimer, 1.5);
          global.Game.enemies.push(flashEnemy);
        }
        if (params.get("qaLevelUp") === "1") {
          setTimeout(function () {
            if (!global.Game.running || global.Game.ended) return;
            global.Game.pendingLevelUps += 1;
            if (!global.Game.paused) global.Game.triggerLevelUp();
          }, 450);
        }
        if (params.get("qaQuizStreak")) {
          var streakTarget = Math.max(0, Math.min(10, Number(params.get("qaQuizStreak")) || 0));
          for (var qs = 0; qs < streakTarget; qs++) global.Game.applyQuizAnswer({ correct: true });
        }
        if (params.get("qaPassives") === "1") {
          ["vitality", "swift", "sense", "efficiency", "mend", "eco_sneakers", "sorting_pouch", "refill_snack"].forEach(function (id) {
            global.Game.applyPassiveUpgrade(id);
          });
          global.Game.applyPassiveUpgrade("swift");
          global.Game.applyPassiveUpgrade("efficiency");
        }
        if (params.get("qaTurret") === "1") {
          global.Game.stage.waves = [];
          global.Game.stage.events = [];
          global.Game.enemies = [];
          global.Game.enemyProjectiles = [];
          global.Game.projectiles = [];
          var turretLevel = Math.max(1, Math.min(5, Number(params.get("qaTurretLevel")) || 1));
          if (!global.Game.player.hasSkill("recycle_sentry")) global.Game.player.addSkill("recycle_sentry");
          var turretWeapon = global.Game.player.getWeapon("recycle_sentry");
          turretWeapon.level = turretLevel;
          turretWeapon.timer = 0.05;
          var turretDir = (params.get("qaTurretDir") || "E").toUpperCase();
          var turretVector = global.Animation.directionVector(turretDir);
          var turretEnemyDef = global.GameData.getEnemy("battery_slime");
          var turretEnemy = new global.Enemy(
            turretEnemyDef,
            global.Game.player.x + turretVector.x * 185,
            global.Game.player.y + turretVector.y * 185,
            1
          );
          turretEnemy.spawnAge = turretEnemy.spawnDuration;
          turretEnemy.speed = 0;
          turretEnemy.contact = 0;
          turretEnemy.ranged = null;
          turretEnemy.maxHp = 9999;
          turretEnemy.hp = 9999;
          global.Game.enemies.push(turretEnemy);
        }
        if (params.get("qaKnowledge")) {
          var near = params.get("qaKnowledge") === "collect" ? 8 : 105;
          if (params.get("qaKnowledge") === "collect" && global.Storage && global.GameData.knowledge.length) {
            var unlockNextKnowledge = global.Storage.unlockNextKnowledge;
            global.Storage.unlockNextKnowledge = function () {
              global.Storage.unlockNextKnowledge = unlockNextKnowledge;
              return global.GameData.knowledge[0];
            };
          }
          global.Game.pickups.push(new global.Pickup("card", global.Game.player.x + near, global.Game.player.y));
        }
        if (params.get("qaMap") && global.StageRenderer && global.StageRenderer.spawnRandomObject) {
          var mapMode = params.get("qaMap");
          var mapPlayer = global.Game.player;
          if (mapMode === "timing") {
            global.Game.stage.waves = [];
            global.Game.stage.events = [];
            global.Game.enemies = [];
            global.Game.enemyProjectiles = [];
            global.Game.mapObjectSpawnAcc = 0;
          } else {
            var mapTypes = ["plasticBottle", "aluminumCan", "glassBottle", "discardedBattery"];
            for (var mt = 0; mt < mapTypes.length; mt++) {
              global.StageRenderer.spawnRandomObject(mapPlayer, mapTypes[mt], {
                x: mapPlayer.x - 150 + mt * 100,
                y: mapPlayer.y + (mt % 2 ? 82 : -82)
              });
            }
            if (mapMode === "collect" && global.StageRenderer.props[0]) {
              global.Game.player.xp = 0;
              global.Game.player.xpToNext = Math.max(global.Game.player.xpToNext, 9999);
              global.Game.player.x = global.StageRenderer.props[0].x;
              global.Game.player.y = global.StageRenderer.props[0].y;
            }
          }
        }
        if (params.get("qaDefeat") === "1") {
          setTimeout(function () {
            if (global.Game.running && !global.Game.ended) global.Game.end("defeat");
          }, 850);
        }
        if (params.get("qaClearStage") === "1") {
          global.Game.stage.waves = [];
          global.Game.stage.events = [];
          setTimeout(function () {
            if (global.__TEST__ && global.__TEST__.clearCurrentStage) global.__TEST__.clearCurrentStage();
          }, 450);
        }
      }, 100);
    }
  }

  applyStageTuning();
  applyPlayerTuning();
  applyCoinTuning();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installHelpers);
  } else {
    installHelpers();
  }
})(window);
