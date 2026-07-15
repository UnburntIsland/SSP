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
      introText: "被海風吹起的塑膠廢棄物，會持續飄近並纏住行動路線。",
      introHint: "保持移動，優先清出安全空間。",
      knowledgeId: "k_plastic"
    },
    bottle_mite: {
      id: "bottle_mite",
      name: "瓶蓋甲蟲",
      spriteId: "enemy_bottle_mite",
      hp: 18,
      speed: 58,
      radius: 11,
      contact: 5,
      xp: 1,
      coinChance: 0.06,
      runtimeAnimated: true,
      introText: "由瓶蓋與微塑膠聚成的小型甲蟲，會沿潮池邊快速包圍。",
      introHint: "保持走位，別讓牠們從兩側形成包夾。",
      knowledgeId: "k_plastic"
    },
    foam_crab: {
      id: "foam_crab",
      name: "泡沫寄居蟹",
      spriteId: "enemy_foam_crab",
      hp: 42,
      speed: 35,
      radius: 15,
      contact: 7,
      xp: 2,
      coinChance: 0.09,
      runtimeAnimated: true,
      introText: "藏在清潔劑泡沫中的寄居蟹，甲殼能承受較多淨化攻擊。",
      introHint: "集中火力處理，避免牠堵住潮池通道。",
      knowledgeId: "k_wetland"
    },
    ghost_net: {
      id: "ghost_net",
      name: "幽靈廢網",
      spriteId: "enemy_ghost_net",
      hp: 820,
      speed: 25,
      radius: 40,
      contact: 16,
      xp: 42,
      coinChance: 1,
      coinAmount: 12,
      isBoss: true,
      runtimeAnimated: true,
      introText: "廢棄漁網、浮球與塑膠碎片纏成的潮間帶污染核心。",
      introHint: "穿過繩結彈幕的空隙，持續攻擊中央網囊。",
      ranged: {
        kind: "radial",
        visualId: "ghost_net_barrage",
        count: 8,
        range: 600,
        cooldown: 3.8,
        telegraph: 0.9,
        projectileSpeed: 118,
        projectileDamage: 8,
        projectileRadius: 8,
        color: "#55d8cf"
      },
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
      introText: "移動快速的菸蒂污染物，會從怪群縫隙突然貼近。",
      introHint: "別停在原地，範圍攻擊能有效阻擋。",
      knowledgeId: "k_cigarette"
    },
    battery_slime: {
      id: "battery_slime",
      name: "廢電池史萊姆",
      spriteId: "enemy_battery",
      hp: 58,
      speed: 34,
      radius: 16,
      contact: 8,
      xp: 3,
      coinChance: 0.12,
      isElite: true,
      introText: "帶有重金屬污染的精英史萊姆，會蓄力發射電池能量彈。",
      introHint: "看見蓄力環後，橫向移動避開射線。",
      ranged: {
        kind: "aimed",
        visualId: "battery_bolt",
        range: 430,
        preferredDistance: 220,
        cooldown: 3.2,
        telegraph: 0.7,
        projectileSpeed: 155,
        projectileDamage: 5,
        projectileRadius: 7,
        color: "#d6e34a"
      },
      knowledgeId: "k_battery"
    },
    scrap_drone: {
      id: "scrap_drone",
      name: "磁選廢料機",
      spriteId: "enemy_scrap_drone",
      hp: 30,
      speed: 50,
      radius: 13,
      contact: 6,
      xp: 2,
      coinChance: 0.08,
      runtimeAnimated: true,
      introText: "失控的磁選機會保持距離，朝回收動線發射金屬碎片。",
      introHint: "看到瞄準線後橫向閃避，再靠近快速淨化。",
      ranged: {
        kind: "aimed",
        visualId: "scrap_shard",
        range: 390,
        preferredDistance: 205,
        cooldown: 4.1,
        telegraph: 0.75,
        projectileSpeed: 165,
        projectileDamage: 5,
        projectileRadius: 6,
        color: "#ffb84a"
      },
      knowledgeId: "k_reduce"
    },
    can_crusher: {
      id: "can_crusher",
      name: "鋁罐壓塊獸",
      spriteId: "enemy_can_crusher",
      hp: 96,
      speed: 29,
      radius: 18,
      contact: 11,
      xp: 5,
      coinChance: 0.18,
      isElite: true,
      runtimeAnimated: true,
      introText: "壓縮鋁罐堆成的精英污染物，移動緩慢但非常耐打。",
      introHint: "先清掉周圍快怪，再保持距離集中輸出。",
      knowledgeId: "k_reduce"
    },
    compactor_golem: {
      id: "compactor_golem",
      name: "壓縮機甲",
      spriteId: "enemy_compactor_golem",
      hp: 1350,
      speed: 27,
      radius: 43,
      contact: 20,
      xp: 65,
      coinChance: 1,
      coinAmount: 20,
      isBoss: true,
      runtimeAnimated: true,
      introText: "回收工廠的主壓縮設備失控，會用液壓臂與金屬彈幕封鎖動線。",
      introHint: "遠離雙臂正面，利用機甲轉向較慢的空檔輸出。",
      ranged: {
        kind: "radial",
        visualId: "compactor_barrage",
        count: 12,
        range: 650,
        cooldown: 3.2,
        telegraph: 0.85,
        projectileSpeed: 138,
        projectileDamage: 10,
        projectileRadius: 8,
        color: "#ff9d3c"
      },
      knowledgeId: "k_reduce"
    },
    oil_slickling: {
      id: "oil_slickling",
      name: "油膜滴怪",
      spriteId: "enemy_oil_slickling",
      hp: 36,
      speed: 47,
      radius: 13,
      contact: 8,
      xp: 2,
      coinChance: 0.08,
      runtimeAnimated: true,
      introText: "從黑水渠道分裂出的油膜滴怪，會沿著平台快速滲近。",
      introHint: "別被多個方向同時包圍，優先清出退路。",
      knowledgeId: "k_wetland"
    },
    smog_drone: {
      id: "smog_drone",
      name: "煙塵監測機",
      spriteId: "enemy_smog_drone",
      hp: 48,
      speed: 43,
      radius: 14,
      contact: 7,
      xp: 3,
      coinChance: 0.11,
      isElite: true,
      runtimeAnimated: true,
      introText: "故障的排放監測機反而釋放煙塵能量彈，並在遠處繞行。",
      introHint: "觀察預警線，利用衝刺穿過單發彈道。",
      ranged: {
        kind: "aimed",
        visualId: "smog_orb",
        range: 450,
        preferredDistance: 245,
        cooldown: 3.1,
        telegraph: 0.65,
        projectileSpeed: 185,
        projectileDamage: 7,
        projectileRadius: 7,
        color: "#ad82e8"
      },
      knowledgeId: "k_battery"
    },
    ash_wisp: {
      id: "ash_wisp",
      name: "灰燼渦靈",
      spriteId: "enemy_ash_wisp",
      hp: 82,
      speed: 54,
      radius: 17,
      contact: 11,
      xp: 5,
      coinChance: 0.16,
      isElite: true,
      runtimeAnimated: true,
      introText: "高溫排放留下的灰燼聚成旋渦，會高速穿過怪群逼近。",
      introHint: "保留衝刺躲開突進，答題連勝能更快處理精英怪。",
      knowledgeId: "k_battery"
    },
    oil_blob: {
      id: "oil_blob",
      name: "油污核心",
      spriteId: "enemy_oil",
      hp: 900,
      speed: 30,
      radius: 38,
      contact: 18,
      xp: 40,
      coinChance: 1.0,
      coinAmount: 12,
      isBoss: true,
      introText: "黑水能源站的油污核心甦醒，厚重身軀會持續釋放環形彈幕。",
      introHint: "留意彈幕預警，保持距離並尋找缺口。",
      ranged: {
        kind: "radial",
        visualId: "oil_barrage",
        count: 10,
        range: 620,
        cooldown: 3.4,
        telegraph: 0.8,
        projectileSpeed: 125,
        projectileDamage: 10,
        projectileRadius: 9,
        color: "#9b73e8"
      },
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
      if (enemy.runtimeAnimated === false) {
        // 新主題敵人先使用各自的正式靜態素材 / Canvas sprite 與輕微移動 bob，
        // 不註冊不存在的 8 方向 PNG，避免產生無意義的 404。
        enemy.animationSet = { idle: {}, move: {} };
      } else {
        enemy.spriteBasePath = "assets/images/enemies/" + (FOLDER[id] || id) + "/";
        enemy.spriteVersion = "enemy_8dir_20260711a";
        enemy.animationSet = buildAnimSet();
      }
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
