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

  global.GameData.getEnemy = function (id) {
    return global.GameData.enemies[id];
  };
})(window);
