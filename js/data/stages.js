/* ============================================================
   data/stages.js  -  關卡（資料驅動）
   waves：依時間區間生成敵人；events：特定時間的單次事件（如 Boss）。
   時間單位：秒。下一關只有在前一關 Boss 被擊敗並完成關卡後才會解鎖。
   ============================================================ */
(function (global) {
  global.GameData = global.GameData || {};

  global.GameData.stages = [
    {
      id: "tidal_flat",
      order: 1,
      name: "海廢潮間帶",
      shortName: "潮間帶",
      difficulty: "標準",
      concept: "清理被海廢占據的潮池，阻止幽靈廢網封鎖整片海岸。",
      objective: "存活 5 分鐘並擊敗幽靈廢網",
      previewImage: "assets/images/stages/tidal_flat_card.png?v=stages-20260711a",
      theme: "tidal",
      duration: 300,
      world: { w: 2400, h: 1600 },
      spawnRadius: 560,
      maxEnemies: 300,
      maxElites: 2,
      fallbackEnemies: ["plastic_bag", "bottle_mite"],
      bossId: "ghost_net",
      bossName: "幽靈廢網",
      bossHpMultiplier: 1,
      contaminationZone: {
        startsAt: 105,
        startRadius: 1020,
        endRadius: 500,
        steps: 4,
        warningDuration: 12,
        shrinkDuration: 8,
        holdDuration: 26,
        damagePerTick: 2,
        tickInterval: 1.0
      },
      collectibleTypes: ["plasticBottle", "glassBottle", "aluminumCan"],
      waves: [
        {
          from: 0, to: 60,
          interval: 1.05, batch: 1,
          types: [
            { enemy: "plastic_bag", weight: 3 },
            { enemy: "bottle_mite", weight: 2 }
          ]
        },
        {
          from: 60, to: 150,
          interval: 0.88, batch: 2,
          types: [
            { enemy: "plastic_bag", weight: 3 },
            { enemy: "bottle_mite", weight: 3 },
            { enemy: "foam_crab", weight: 1 }
          ]
        },
        {
          from: 150, to: 235,
          interval: 0.72, batch: 2,
          types: [
            { enemy: "plastic_bag", weight: 2 },
            { enemy: "bottle_mite", weight: 3 },
            { enemy: "foam_crab", weight: 2 }
          ]
        },
        {
          from: 235, to: 300,
          interval: 0.62, batch: 3,
          types: [
            { enemy: "plastic_bag", weight: 2 },
            { enemy: "bottle_mite", weight: 2 },
            { enemy: "foam_crab", weight: 3 }
          ]
        }
      ],
      events: [
        { at: 235, enemy: "ghost_net", count: 1, announce: "幽靈廢網從潮池深處纏了上來！" }
      ]
    },
    {
      id: "recycle_works",
      order: 2,
      unlockAfter: "tidal_flat",
      name: "失控回收工廠",
      shortName: "回收工廠",
      difficulty: "進階",
      concept: "深入失控的資源回收產線，重新啟動分類系統並擊倒壓縮機甲。",
      objective: "存活 8 分鐘並擊敗壓縮機甲",
      previewImage: "assets/images/stages/recycle_works_card.png?v=stages-20260711a",
      theme: "recycle",
      duration: 480,
      world: { w: 2600, h: 1750 },
      spawnRadius: 590,
      maxEnemies: 330,
      maxElites: 3,
      fallbackEnemies: ["butt_bug", "scrap_drone"],
      bossId: "compactor_golem",
      bossName: "壓縮機甲",
      bossHpMultiplier: 1.1,
      contaminationZone: {
        startsAt: 145,
        startRadius: 1080,
        endRadius: 470,
        steps: 5,
        warningDuration: 13,
        shrinkDuration: 9,
        holdDuration: 31,
        damagePerTick: 2,
        tickInterval: 1.0
      },
      collectibleTypes: ["aluminumCan", "glassBottle", "discardedBattery"],
      waves: [
        {
          from: 0, to: 100,
          interval: 0.95, batch: 1,
          types: [
            { enemy: "butt_bug", weight: 3 },
            { enemy: "scrap_drone", weight: 1 }
          ]
        },
        {
          from: 100, to: 220,
          interval: 0.78, batch: 2,
          types: [
            { enemy: "butt_bug", weight: 3 },
            { enemy: "scrap_drone", weight: 2 },
            { enemy: "battery_slime", weight: 0.7 }
          ]
        },
        {
          from: 220, to: 360,
          interval: 0.68, batch: 2,
          types: [
            { enemy: "butt_bug", weight: 2 },
            { enemy: "scrap_drone", weight: 3 },
            { enemy: "battery_slime", weight: 1 },
            { enemy: "can_crusher", weight: 0.45 }
          ]
        },
        {
          from: 360, to: 480,
          interval: 0.56, batch: 3,
          types: [
            { enemy: "butt_bug", weight: 2 },
            { enemy: "scrap_drone", weight: 3 },
            { enemy: "battery_slime", weight: 1.2 },
            { enemy: "can_crusher", weight: 0.65 }
          ]
        }
      ],
      events: [
        { at: 395, enemy: "compactor_golem", count: 1, announce: "主壓縮線啟動：壓縮機甲封鎖出口！" }
      ]
    },
    {
      id: "blackwater_plant",
      order: 3,
      unlockAfter: "recycle_works",
      name: "黑水能源站",
      shortName: "黑水能源站",
      difficulty: "高危",
      concept: "穿越遭油污淹沒的能源站，在污染擴散前淨化最後的油污核心。",
      objective: "存活 12 分鐘並擊敗油污核心",
      previewImage: "assets/images/stages/blackwater_plant_card.png?v=stages-20260711a",
      theme: "blackwater",
      duration: 720,
      world: { w: 2800, h: 1800 },
      spawnRadius: 620,
      maxEnemies: 350,
      maxElites: 4,
      fallbackEnemies: ["oil_slickling"],
      bossId: "oil_blob",
      bossName: "油污核心",
      bossHpMultiplier: 1.75,
      contaminationZone: {
        startsAt: 180,
        startRadius: 1140,
        endRadius: 430,
        steps: 6,
        warningDuration: 14,
        shrinkDuration: 10,
        holdDuration: 36,
        damagePerTick: 3,
        tickInterval: 1.0
      },
      collectibleTypes: ["discardedBattery", "aluminumCan", "plasticBottle"],
      waves: [
        {
          from: 0, to: 150,
          interval: 0.88, batch: 1,
          types: [
            { enemy: "oil_slickling", weight: 3 },
            { enemy: "smog_drone", weight: 1 }
          ]
        },
        {
          from: 150, to: 320,
          interval: 0.70, batch: 2,
          types: [
            { enemy: "oil_slickling", weight: 3 },
            { enemy: "smog_drone", weight: 2 },
            { enemy: "battery_slime", weight: 0.8 }
          ]
        },
        {
          from: 320, to: 500,
          interval: 0.60, batch: 2,
          types: [
            { enemy: "oil_slickling", weight: 3 },
            { enemy: "smog_drone", weight: 2.5 },
            { enemy: "battery_slime", weight: 1 },
            { enemy: "ash_wisp", weight: 0.55 }
          ]
        },
        {
          from: 500, to: 720,
          interval: 0.50, batch: 3,
          types: [
            { enemy: "oil_slickling", weight: 3 },
            { enemy: "smog_drone", weight: 3 },
            { enemy: "battery_slime", weight: 1.2 },
            { enemy: "ash_wisp", weight: 0.8 }
          ]
        }
      ],
      events: [
        { at: 600, enemy: "oil_blob", count: 1, announce: "最終污染源甦醒：油污核心正在擴張！" }
      ]
    }
  ];

  global.GameData.getStage = function (id) {
    return global.GameData.stages.find(function (s) { return s.id === id; });
  };

  global.GameData.getNextStage = function (id) {
    var current = global.GameData.getStage(id);
    if (!current) return null;
    return global.GameData.stages.find(function (s) { return s.order === current.order + 1; }) || null;
  };
})(window);
