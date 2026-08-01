/* ============================================================
   data/environmentMissions.js  —  每日／每週環境任務與挑戰模式
   - 週期任務只描述指標、目標與獎勵；重置與存檔由 environmentMissions.js 處理。
   - 挑戰可要求指定角色、已擺放的功能建築，並套用額外難度倍率。
   ============================================================ */
(function (global) {
  "use strict";

  var GD = global.GameData = global.GameData || {};

  GD.environmentMissions = {
    daily: [
      {
        id: "daily_take_action",
        title: "每日出勤",
        description: "完成 1 次淨化行動，不限勝敗。",
        metric: "runs",
        target: 1,
        reward: { coins: 80 }
      },
      {
        id: "daily_field_cleanup",
        title: "隨手清理",
        description: "清理 10 個散落在地圖上的可回收物。",
        metric: "mapCleaned",
        target: 10,
        reward: { recycled: 8 }
      },
      {
        id: "daily_eco_quiz",
        title: "環境知識複習",
        description: "在永續問答中答對 2 題。",
        metric: "quizCorrect",
        target: 2,
        reward: { coins: 120 }
      },
      {
        id: "daily_ranger_patrol",
        title: "巡守員值勤",
        description: "使用森林巡守員完成 1 次行動，不限勝敗。",
        metric: "runs",
        target: 1,
        condition: { characterId: "ranger" },
        reward: { coins: 100 }
      },
      {
        id: "daily_beachcomber_patrol",
        title: "海岸巡查",
        description: "使用海岸淨灘者完成 1 次行動，不限勝敗。",
        metric: "runs",
        target: 1,
        condition: { characterId: "beachcomber" },
        reward: { coins: 100 }
      },
      {
        id: "daily_tidepool_walk",
        title: "潮池踏查",
        description: "在潮池地形累積停留 20 秒。",
        metric: "terrainTime",
        target: 20,
        condition: { terrainKind: "tidePool" },
        reward: { recycled: 10 }
      },
      {
        id: "daily_flawless",
        title: "無傷演練",
        description: "完成 1 局且全程沒有受到傷害。",
        metric: "runs",
        target: 1,
        condition: { noDamage: true },
        reward: { coins: 180 }
      },
      {
        id: "daily_building_support",
        title: "基地支援",
        description: "大廳擺放任一建築後完成 1 次行動。",
        metric: "runs",
        target: 1,
        requiresPlacedBuilding: true,
        condition: { requiresPlacedBuilding: true },
        reward: { coins: 130, recycled: 5 }
      }
    ],
    weekly: [
      {
        id: "weekly_restore_regions",
        title: "區域復育巡迴",
        description: "本週完成 3 次關卡淨化。",
        metric: "victories",
        target: 3,
        reward: { coins: 500, recycled: 20 }
      },
      {
        id: "weekly_pollution_control",
        title: "污染量減計畫",
        description: "本週累積淨化 300 個污染物。",
        metric: "purified",
        target: 300,
        reward: { coins: 420 }
      },
      {
        id: "weekly_material_recovery",
        title: "資源回收週",
        description: "本週累積清理 60 個地圖回收物。",
        metric: "mapCleaned",
        target: 60,
        reward: { coins: 300, recycled: 25 }
      },
      {
        id: "weekly_boss_control",
        title: "大型污染源管制",
        description: "本週擊敗 2 隻關卡 BOSS。",
        metric: "bossVictories",
        target: 2,
        reward: { coins: 520, recycled: 18 }
      },
      {
        id: "weekly_tidal_restoration",
        title: "潮間帶復育",
        description: "本週在海廢潮間帶完成 2 次淨化。",
        metric: "victories",
        target: 2,
        condition: { stageId: "tidal_flat", victory: true },
        reward: { coins: 460, recycled: 16 }
      },
      {
        id: "weekly_beach_team",
        title: "淨灘者週勤",
        description: "本週使用海岸淨灘者完成 3 次行動。",
        metric: "runs",
        target: 3,
        condition: { characterId: "beachcomber" },
        reward: { coins: 480 }
      },
      {
        id: "weekly_terrain_training",
        title: "潮池適應訓練",
        description: "本週在潮池地形累積停留 90 秒。",
        metric: "terrainTime",
        target: 90,
        condition: { terrainKind: "tidePool" },
        reward: { coins: 420, recycled: 20 }
      },
      {
        id: "weekly_flawless_runs",
        title: "零污染接觸",
        description: "本週完成 2 局無傷行動。",
        metric: "runs",
        target: 2,
        condition: { noDamage: true },
        reward: { coins: 650, recycled: 20 }
      },
      {
        id: "weekly_building_network",
        title: "基地協作網",
        description: "大廳擺放任一建築後，本週完成 3 次行動。",
        metric: "runs",
        target: 3,
        requiresPlacedBuilding: true,
        condition: { requiresPlacedBuilding: true },
        reward: { coins: 560, recycled: 24 }
      }
    ]
  };

  GD.challenges = [
    {
      id: "coast_specialist",
      title: "潮池專家",
      stageId: "tidal_flat",
      description: "用海岸淨灘者完成潮間帶，並在途中清理至少 12 個散落資源。",
      requiredCharacterId: "beachcomber",
      goal: { victory: true, mapCleaned: 12 },
      modifiers: { enemyHpMult: 1.15, enemySpeedMult: 1.08 },
      modifierText: "污染物生命 +15%、速度 +8%",
      reward: { coins: 300, recycled: 10 }
    },
    {
      id: "wind_power_route",
      title: "風力支援線",
      stageId: "recycle_works",
      description: "啟用已擺放的微型風力站，完成失控回收工廠。",
      requiredBuildingId: "wind_station",
      goal: { victory: true },
      modifiers: { enemyHpMult: 1.2, enemyContactMult: 1.15 },
      modifierText: "污染物生命 +20%、接觸傷害 +15%",
      reward: { coins: 450, recycled: 15 }
    },
    {
      id: "circular_overdrive",
      title: "循環超載協定",
      stageId: "recycle_works",
      description: "使用循環機械師與太陽能工坊，在強化污染潮中完成回收工廠。",
      requiredCharacterId: "mechanic",
      requiredBuildingId: "solar_workshop",
      goal: { victory: true, purified: 90 },
      modifiers: { enemyHpMult: 1.28, enemySpeedMult: 1.1, mapSpawnIntervalMult: 0.8 },
      modifierText: "污染物生命 +28%、速度 +10%、散落資源更頻繁",
      reward: { coins: 700, recycled: 25 }
    },
    {
      id: "east_resilience",
      title: "花東韌性行動",
      stageId: "east_ridge",
      description: "使用生態藥劑師與雨水花園，淨化東部山海溪谷並清理 25 個回收物。",
      requiredCharacterId: "chemist",
      requiredBuildingId: "rain_garden",
      goal: { victory: true, mapCleaned: 25 },
      modifiers: { enemyHpMult: 1.35, enemySpeedMult: 1.12, enemyContactMult: 1.12 },
      modifierText: "污染物生命 +35%、速度與接觸傷害 +12%",
      reward: { coins: 1000, recycled: 40 }
    }
  ];

  GD.getEnvironmentMission = function (scope, id) {
    var list = GD.environmentMissions[scope] || [];
    return list.find(function (mission) { return mission.id === id; }) || null;
  };

  GD.getChallenge = function (id) {
    return GD.challenges.find(function (challenge) { return challenge.id === id; }) || null;
  };
})(window);
