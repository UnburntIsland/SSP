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
    seed: Number(params.get("seed")) || 424242
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
      { at: 20, enemy: "oil_blob", count: 1, announce: "測試模式：油污團塊提前登場！" }
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
          running: !!g.running,
          paused: !!g.paused,
          knowledgePaused: !!g.knowledgePaused,
          runIntroActive: !!g.runIntroActive,
          runIntroRemaining: g.runIntroRemaining || 0,
          ended: !!g.ended,
          time: g.time || 0,
           enemies: g.enemies ? g.enemies.length : 0,
           enemyProjectiles: g.enemyProjectiles ? g.enemyProjectiles.length : 0,
           pickups: g.pickups ? g.pickups.length : 0,
           quizCorrect: g.quizCorrect || 0,
           quizIncorrect: g.quizIncorrect || 0,
           quizStreak: g.quizStreak || 0,
           bestQuizStreak: g.bestQuizStreak || 0,
           eliteRewardLevel: g.eliteRewardLevel || 0,
           mapCleaned: g.mapCleanedCount || 0,
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
       forceDefeat: function () {
         if (global.Game && global.Game.running) global.Game.end("defeat");
       },
       forceLevelUp: function () {
         if (!global.Game || !global.Game.running || global.Game.ended) return false;
         global.Game.pendingLevelUps += 1;
         if (!global.Game.paused) global.Game.triggerLevelUp();
         return true;
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

    var wantsScenario = params.get("qaLevelUp") === "1" || params.get("qaRanged") === "1" ||
      params.get("qaZone") === "1" || params.get("qaDefeat") === "1" ||
      !!params.get("qaKnowledge") || params.get("qaMap") === "1" || params.get("qaZoneOutside") === "1" ||
      params.get("qaFinalCountdown") === "1" || !!params.get("qaQuizStreak");
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
        if (params.get("qaMap") === "1" && global.StageRenderer && global.StageRenderer.props) {
          var station = global.StageRenderer.props.find(function (prop) { return prop.type === "recycleBin"; });
          if (station) {
            global.Game.player.x = station.x;
            global.Game.player.y = station.y;
          }
        }
        if (params.get("qaDefeat") === "1") {
          setTimeout(function () {
            if (global.Game.running && !global.Game.ended) global.Game.end("defeat");
          }, 850);
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
