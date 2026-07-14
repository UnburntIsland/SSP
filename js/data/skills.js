/* ============================================================
   data/skills.js  —  技能（資料驅動）
   每個技能含：type（行為類型）、iconId、maxLevel、各等級數值 levels[]。
   levels[i] 代表「等級 i+1」的完整數值，up 欄位描述升到該級獲得什麼。
   type 對應 weapons.js 的行為：
     projectile / aura / pulse / orbit / zone / deployable / trail
   ============================================================ */
(function (global) {
  global.GameData = global.GameData || {};

  global.GameData.skills = [
    {
      id: "seed_blade",
      name: "種子飛刃",
      type: "projectile",
      iconId: "skill_seed",
      desc: "自動朝最近的污染物射出旋轉種子；每輪總傷害會平均分配到所有飛刃。",
      eduText: "原生植物的種子能修復棲地，是大地最早的修復者。",
      damageMode: "volley",
      minCooldown: 0.55,
      maxLevel: 6,
      levels: [
        { damage: 8, count: 1, cooldown: 1.10, speed: 380, pierce: 0, eliteMult: 1.10, up: "解鎖：每輪造成 8 點高單體傷害" },
        { damage: 12, count: 2, cooldown: 1.05, speed: 390, pierce: 0, eliteMult: 1.12, up: "每輪總傷害 8 → 12，飛刃數量 +1" },
        { damage: 16, count: 2, cooldown: 1.00, speed: 400, pierce: 0, eliteMult: 1.15, up: "每輪總傷害 12 → 16，冷卻縮短" },
        { damage: 20, count: 3, cooldown: 0.95, speed: 410, pierce: 0, eliteMult: 1.18, up: "每輪總傷害 16 → 20，飛刃數量 +1" },
        { damage: 25, count: 3, cooldown: 0.90, speed: 430, pierce: 1, eliteMult: 1.22, up: "每輪總傷害 20 → 25，可貫穿 1 個目標" },
        { damage: 30, count: 4, cooldown: 0.85, speed: 450, pierce: 1, eliteMult: 1.30, up: "每輪總傷害 25 → 30，飛刃與精英傷害提升（滿級）" }
      ]
    },
    {
      id: "recycle_net",
      name: "回收磁網",
      type: "aura",
      iconId: "skill_net",
      desc: "在身邊展開圓形磁網，吸引經驗並持續傷害附近污染物。",
      eduText: "妥善分類回收，能讓資源重新進入循環、減少進入海洋的廢棄物。",
      minCooldown: 2.6,
      maxLevel: 5,
      levels: [
        { radius: 80, dps: 4, cooldown: 5.4, duration: 3.0, pull: 1.4, up: "解鎖：展開低傷害回收磁網" },
        { radius: 92, dps: 5, cooldown: 5.2, duration: 3.2, pull: 1.6, up: "磁網範圍、吸力與傷害提升" },
        { radius: 102, dps: 6, cooldown: 5.0, duration: 3.4, pull: 1.8, up: "每秒傷害 5 → 6，持續時間延長" },
        { radius: 114, dps: 8, cooldown: 4.8, duration: 3.6, pull: 2.0, up: "每秒傷害 6 → 8，冷卻縮短" },
        { radius: 126, dps: 9, cooldown: 4.6, duration: 3.8, pull: 2.2, up: "每秒傷害 8 → 9，範圍與吸力提升（滿級）" }
      ]
    },
    {
      id: "solar_pulse",
      name: "太陽能脈衝",
      type: "pulse",
      iconId: "skill_solar",
      desc: "定期向四周釋放一圈能量波，震退並傷害周圍污染物。",
      eduText: "太陽能是潔淨的再生能源，一片屋頂也能成為小型電廠。",
      minCooldown: 1.8,
      maxLevel: 5,
      levels: [
        { radius: 96, damage: 6, cooldown: 4.0, up: "解鎖：釋放低傷害的大範圍脈衝" },
        { radius: 110, damage: 8, cooldown: 3.8, up: "脈衝傷害 6 → 8，範圍擴大" },
        { radius: 122, damage: 11, cooldown: 3.6, up: "脈衝傷害 8 → 11，冷卻縮短" },
        { radius: 136, damage: 14, cooldown: 3.4, up: "波及範圍與傷害提升" },
        { radius: 150, damage: 17, cooldown: 3.2, up: "脈衝傷害 14 → 17，範圍提升（滿級）" }
      ]
    },
    {
      id: "wind_blades",
      name: "風力葉片",
      type: "orbit",
      iconId: "skill_wind",
      desc: "讓潔淨能源葉片環繞自身旋轉，持續切割接觸到的污染物。",
      eduText: "風力發電不需燃燒燃料，運轉時幾乎不排放溫室氣體。",
      maxLevel: 5,
      levels: [
        { count: 2, radius: 76, dps: 14, hitRadius: 16, knockback: 18, rotSpeed: 3.4, up: "解鎖：2 片低傷害護身風葉" },
        { count: 3, radius: 82, dps: 16, hitRadius: 17, knockback: 20, rotSpeed: 3.6, up: "葉片 +1（共 3 片），每秒傷害提升" },
        { count: 3, radius: 92, dps: 18, hitRadius: 18, knockback: 23, rotSpeed: 3.8, up: "旋轉半徑與有效範圍擴大" },
        { count: 4, radius: 100, dps: 21, hitRadius: 20, knockback: 26, rotSpeed: 4.0, up: "葉片 +1，推離接近的污染物" },
        { count: 5, radius: 110, dps: 24, hitRadius: 22, knockback: 29, rotSpeed: 4.2, up: "形成大型護身風場（滿級）" }
      ]
    },
    {
      id: "compost_spores",
      name: "堆肥孢子",
      type: "zone",
      iconId: "skill_compost",
      desc: "定期在腳下灑出淨化孢子，於地面形成短暫的持續傷害區域。",
      eduText: "廚餘與落葉堆肥可化為養分，讓有機廢棄物重回土壤循環。",
      minCooldown: 2.2,
      maxLevel: 5,
      levels: [
        { radius: 52, dps: 4, cooldown: 5.0, duration: 3.0, up: "解鎖：灑出低傷害堆肥孢子區" },
        { radius: 56, dps: 5, cooldown: 4.8, duration: 3.4, up: "淨化區持續時間與傷害提升" },
        { radius: 68, dps: 6, cooldown: 4.5, duration: 3.8, up: "範圍擴大，每秒傷害 5 → 6" },
        { radius: 74, dps: 8, cooldown: 4.2, duration: 4.2, up: "每秒傷害 6 → 8，冷卻縮短" },
        { radius: 84, dps: 10, cooldown: 4.0, duration: 4.6, up: "範圍與傷害提升，可利用減冷卻疊加區域（滿級）" }
      ]
    },
    {
      id: "recycle_sentry",
      name: "回收哨兵",
      type: "deployable",
      iconId: "skill_sentry",
      exclusiveCharacterId: "mechanic",
      desc: "循環機械師專屬。定期部署自動哨兵鎖定單一污染物；哨兵可在存活期間持續疊加。",
      eduText: "模組化設計能延長設備壽命；零件可維修、替換與回收，就能減少電子廢棄物。",
      minCooldown: 3.8,
      maxLevel: 5,
      levels: [
        { cooldown: 7, duration: 10, damage: 5, fireCooldown: 1.2, range: 210, speed: 350, up: "專屬解鎖：哨兵存活 10 秒，單發攻擊 5" },
        { cooldown: 7, duration: 12, damage: 7, fireCooldown: 1.2, range: 215, speed: 360, up: "單發攻擊 5 → 7（+2），存活時間 10 → 12 秒" },
        { cooldown: 7, duration: 14, damage: 9, fireCooldown: 1.2, range: 220, speed: 370, up: "單發攻擊 7 → 9（+2），存活時間 12 → 14 秒" },
        { cooldown: 7, duration: 16, damage: 11, fireCooldown: 1.2, range: 225, speed: 380, up: "單發攻擊 9 → 11（+2），存活時間 14 → 16 秒" },
        { cooldown: 7, duration: 18, damage: 13, fireCooldown: 1.2, range: 230, speed: 390, up: "單發攻擊 11 → 13（+2），存活期間可持續疊加（滿級）" }
      ]
    },
    {
      id: "purifying_trail",
      name: "淨化藥跡",
      type: "trail",
      iconId: "skill_trail",
      exclusiveCharacterId: "chemist",
      desc: "生態藥劑師專屬。走過的地面會留下淨化藥跡；污染物踏入時立即受傷，停留期間依間隔持續扣血。",
      eduText: "生物修復會利用微生物分解污染物；正確控制濃度與環境，能讓受污染的土地逐步恢復。",
      maxLevel: 5,
      levels: [
        { damage: 2, tickCooldown: 0.60, radius: 20, duration: 3, spacing: 20, up: "專屬解鎖：每次傷害 2，每 0.60 秒觸發一次" },
        { damage: 4, tickCooldown: 0.55, radius: 20, duration: 3, spacing: 20, up: "每次傷害 2 → 4（+2），扣血間隔 0.60 → 0.55 秒" },
        { damage: 6, tickCooldown: 0.50, radius: 20, duration: 3, spacing: 20, up: "每次傷害 4 → 6（+2），扣血間隔 0.55 → 0.50 秒" },
        { damage: 8, tickCooldown: 0.45, radius: 20, duration: 3, spacing: 20, up: "每次傷害 6 → 8（+2），扣血間隔 0.50 → 0.45 秒" },
        { damage: 10, tickCooldown: 0.40, radius: 20, duration: 3, spacing: 20, up: "每次傷害 8 → 10（+2），扣血間隔 0.45 → 0.40 秒（滿級）" }
      ]
    }
  ];

  global.GameData.getSkill = function (id) {
    return global.GameData.skills.find(function (s) { return s.id === id; });
  };

  global.GameData.canCharacterUseSkill = function (skillOrId, characterOrId) {
    var skill = typeof skillOrId === "string" ? global.GameData.getSkill(skillOrId) : skillOrId;
    if (!skill) return false;
    if (!skill.exclusiveCharacterId) return true;
    var characterId = characterOrId && typeof characterOrId === "object" ? characterOrId.id : characterOrId;
    characterId = global.GameData.resolveCharacterId
      ? global.GameData.resolveCharacterId(characterId)
      : characterId;
    return characterId === skill.exclusiveCharacterId;
  };
})(window);
