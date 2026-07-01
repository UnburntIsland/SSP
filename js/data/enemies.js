/* ============================================================
   data/enemies.js  —  污染物（敵人）資料驅動定義
   speed 單位：像素/秒；radius：碰撞半徑；contact：接觸玩家的傷害。
   xp：被淨化後掉落的經驗值；coinChance：掉落循環幣機率。
   ============================================================ */
(function (global) {
  global.GameData = global.GameData || {};

  global.GameData.enemies = {
    plastic_bag: {
      id: "plastic_bag",
      name: "塑膠袋怪",
      spriteId: "enemy_bag",
      hp: 16,
      speed: 42,
      radius: 13,
      contact: 6,
      xp: 1,
      coinChance: 0.05,
      knowledgeId: "k_plastic"
    },
    butt_bug: {
      id: "butt_bug",
      name: "菸蒂蟲",
      spriteId: "enemy_butt",
      hp: 12,
      speed: 78,
      radius: 9,
      contact: 5,
      xp: 1,
      coinChance: 0.05,
      knowledgeId: "k_cigarette"
    },
    battery_slime: {
      id: "battery_slime",
      name: "廢電池史萊姆",
      spriteId: "enemy_battery",
      hp: 70,
      speed: 34,
      radius: 16,
      contact: 10,
      xp: 3,
      coinChance: 0.12,
      knowledgeId: "k_battery"
    },
    oil_blob: {
      id: "oil_blob",
      name: "油污團塊",
      spriteId: "enemy_oil",
      hp: 900,
      speed: 30,
      radius: 38,
      contact: 18,
      xp: 40,
      coinChance: 1.0,
      coinAmount: 12,
      isBoss: true,
      knowledgeId: "k_wetland"
    }
  };

  (function () {
    var D = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    var FOLDER = {
      plastic_bag: "plastic_bag",
      butt_bug: "butt_bug",
      battery_slime: "battery_slime",
      oil_blob: "oil_blob"
    };

    function buildAnimSet() {
      var idle = {};
      var move = {};
      D.forEach(function (dir) {
        idle[dir] = ["idle_" + dir + "_0"];
        move[dir] = [
          "move_" + dir + "_0",
          "move_" + dir + "_1",
          "move_" + dir + "_2",
          "move_" + dir + "_3"
        ];
      });
      return { idle: idle, move: move };
    }

    Object.keys(global.GameData.enemies).forEach(function (id) {
      var enemy = global.GameData.enemies[id];
      enemy.animationId = id;
      enemy.spriteBasePath = "assets/images/enemies/" + (FOLDER[id] || id) + "/";
      enemy.animationSet = buildAnimSet();
    });
  })();

  global.GameData.enemyAliases = {
    plastic_bag: "plastic_bag",
    butt_bug: "butt_bug",
    cigarette_bug: "butt_bug",
    cigarette_butt_bug: "butt_bug",
    battery_slime: "battery_slime",
    waste_battery_slime: "battery_slime",
    oil_blob: "oil_blob",
    oil_boss: "oil_blob",
    oil_slick_mass: "oil_blob"
  };

  global.GameData.resolveEnemyId = function (id) {
    return global.GameData.enemyAliases[id] || id;
  };

  global.GameData.getEnemy = function (id) {
    id = global.GameData.resolveEnemyId(id);
    return global.GameData.enemies[id];
  };
})(window);
