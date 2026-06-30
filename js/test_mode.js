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
          { enemy: "battery_slime", weight: 1 }
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
          ended: !!g.ended,
          time: g.time || 0,
          enemies: g.enemies ? g.enemies.length : 0,
          pickups: g.pickups ? g.pickups.length : 0,
          player: p ? {
            x: p.x, y: p.y,
            hp: p.hp, maxHp: p.maxHp,
            level: p.level, xp: p.xp, xpToNext: p.xpToNext,
            pickupRange: p.pickupRange,
            cooldownMult: p.cooldownMult,
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
