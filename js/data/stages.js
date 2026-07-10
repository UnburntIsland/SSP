/* ============================================================
   data/stages.js  —  關卡（資料驅動）
   waves：依時間區間生成敵人；events：特定時間的單次事件（如 Boss）。
   時間單位：秒。spawner（game.js）會讀取這些規則生成污染物。
   ============================================================ */
(function (global) {
  global.GameData = global.GameData || {};

  global.GameData.stages = [
    {
      id: "tidal_flat",
      name: "海廢潮間帶",
      concept: "被海洋廢棄物與污染生物入侵的潮間帶，需在限定時間內存活並淨化污染源。",
      duration: 300,            // 5 分鐘
      world: { w: 2400, h: 1600 },
      spawnRadius: 560,         // 從玩家周圍此半徑（畫面外）生成
      maxEnemies: 320,
      contaminationZone: {
        startsAt: 125,
        startRadius: 1020,
        endRadius: 430,
        damagePerTick: 4,
        tickInterval: 0.75
      },
      // 各時段的生成規則
      waves: [
        {
          from: 0, to: 45,
          interval: 1.1, batch: 1,
          types: [{ enemy: "plastic_bag", weight: 1 }]
        },
        {
          from: 45, to: 120,
          interval: 0.9, batch: 2,
          types: [
            { enemy: "plastic_bag", weight: 3 },
            { enemy: "butt_bug", weight: 2 }
          ]
        },
        {
          from: 120, to: 210,
          interval: 0.75, batch: 2,
          types: [
            { enemy: "plastic_bag", weight: 3 },
            { enemy: "butt_bug", weight: 3 },
            { enemy: "battery_slime", weight: 1 }
          ]
        },
        {
          from: 210, to: 300,
          interval: 0.55, batch: 3,
          types: [
            { enemy: "plastic_bag", weight: 3 },
            { enemy: "butt_bug", weight: 3 },
            { enemy: "battery_slime", weight: 2 }
          ]
        }
      ],
      // 單次事件：小 Boss 在第 5 分鐘前登場
      events: [
        { at: 235, enemy: "oil_blob", count: 1, announce: "油污團塊從外海湧上潮間帶！" }
      ]
    }
  ];

  global.GameData.getStage = function (id) {
    return global.GameData.stages.find(function (s) { return s.id === id; });
  };
})(window);
