/* ============================================================
   data/skills.js  —  技能（資料驅動）
   每個技能含：type（行為類型）、iconId、maxLevel、各等級數值 levels[]。
   levels[i] 代表「等級 i+1」的完整數值，up 欄位描述升到該級獲得什麼。
   type 對應 weapons.js 的行為：
     projectile / aura / pulse / orbit / zone
   ============================================================ */
(function (global) {
  global.GameData = global.GameData || {};

  global.GameData.skills = [
    {
      id: "seed_blade",
      name: "種子飛刃",
      type: "projectile",
      iconId: "skill_seed",
      desc: "自動朝最近的污染物射出旋轉種子。",
      eduText: "原生植物的種子能修復棲地，是大地最早的修復者。",
      maxLevel: 6,
      levels: [
        { damage: 14, count: 1, cooldown: 0.95, speed: 380, pierce: 0, eliteMult: 1.15, up: "解鎖：射出高傷害種子飛刃" },
        { damage: 16, count: 2, cooldown: 0.95, speed: 380, pierce: 0, eliteMult: 1.20, up: "飛刃數量 +1，單發傷害提升" },
        { damage: 20, count: 2, cooldown: 0.90, speed: 400, pierce: 0, eliteMult: 1.25, up: "單體傷害提升，飛行更快" },
        { damage: 24, count: 3, cooldown: 0.85, speed: 400, pierce: 1, eliteMult: 1.30, up: "數量 +1，並可貫穿 1 個目標" },
        { damage: 30, count: 3, cooldown: 0.80, speed: 440, pierce: 1, eliteMult: 1.40, up: "單體傷害大幅提升，冷卻縮短" },
        { damage: 36, count: 4, cooldown: 0.75, speed: 460, pierce: 2, eliteMult: 1.50, up: "數量 +1，精英傷害與貫穿提升（滿級）" }
      ]
    },
    {
      id: "recycle_net",
      name: "回收磁網",
      type: "aura",
      iconId: "skill_net",
      desc: "在身邊展開圓形磁網，吸引經驗並持續傷害附近污染物。",
      eduText: "妥善分類回收，能讓資源重新進入循環、減少進入海洋的廢棄物。",
      maxLevel: 5,
      levels: [
        { radius: 84, dps: 10, cooldown: 5.2, duration: 3.4, pull: 1.5, up: "解鎖：展開回收磁網" },
        { radius: 100, dps: 12, cooldown: 5.0, duration: 3.6, pull: 1.8, up: "磁網範圍與吸力提升" },
        { radius: 104, dps: 15, cooldown: 4.7, duration: 4.0, pull: 2.0, up: "傷害提升，持續時間延長" },
        { radius: 122, dps: 18, cooldown: 4.4, duration: 4.2, pull: 2.3, up: "範圍再擴大，吸引力增強" },
        { radius: 138, dps: 22, cooldown: 4.0, duration: 4.8, pull: 2.7, up: "範圍、吸力與傷害提升（滿級）" }
      ]
    },
    {
      id: "solar_pulse",
      name: "太陽能脈衝",
      type: "pulse",
      iconId: "skill_solar",
      desc: "定期向四周釋放一圈能量波，震退並傷害周圍污染物。",
      eduText: "太陽能是潔淨的再生能源，一片屋頂也能成為小型電廠。",
      maxLevel: 5,
      levels: [
        { radius: 100, damage: 10, cooldown: 3.8, up: "解鎖：釋放能量脈衝" },
        { radius: 114, damage: 12, cooldown: 3.4, up: "冷卻縮短，更頻繁釋放" },
        { radius: 124, damage: 17, cooldown: 3.2, up: "脈衝傷害提升" },
        { radius: 142, damage: 21, cooldown: 2.9, up: "波及範圍擴大" },
        { radius: 154, damage: 26, cooldown: 2.6, up: "傷害與範圍提升（滿級）" }
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
        { count: 2, radius: 78, dps: 32, hitRadius: 18, knockback: 22, rotSpeed: 3.4, up: "解鎖：2 片護身風葉" },
        { count: 3, radius: 82, dps: 34, hitRadius: 18, knockback: 24, rotSpeed: 3.6, up: "葉片 +1（共 3 片）" },
        { count: 3, radius: 96, dps: 40, hitRadius: 21, knockback: 28, rotSpeed: 3.8, up: "旋轉半徑與有效範圍擴大" },
        { count: 4, radius: 104, dps: 44, hitRadius: 22, knockback: 30, rotSpeed: 4.0, up: "葉片 +1，推離接近的污染物" },
        { count: 5, radius: 116, dps: 52, hitRadius: 25, knockback: 34, rotSpeed: 4.2, up: "形成大型護身風場（滿級）" }
      ]
    },
    {
      id: "compost_spores",
      name: "堆肥孢子",
      type: "zone",
      iconId: "skill_compost",
      desc: "定期在腳下灑出淨化孢子，於地面形成短暫的持續傷害區域。",
      eduText: "廚餘與落葉堆肥可化為養分，讓有機廢棄物重回土壤循環。",
      maxLevel: 5,
      levels: [
        { radius: 56, dps: 8, cooldown: 4.5, duration: 3.0, up: "解鎖：灑出堆肥孢子區" },
        { radius: 56, dps: 9, cooldown: 4.2, duration: 4.0, up: "淨化區持續時間延長" },
        { radius: 74, dps: 12, cooldown: 4.0, duration: 4.0, up: "範圍擴大，傷害提升" },
        { radius: 74, dps: 15, cooldown: 3.6, duration: 5.0, up: "傷害提升，持續更久" },
        { radius: 92, dps: 20, cooldown: 3.2, duration: 5.0, up: "範圍與傷害提升（滿級）" }
      ]
    },
    {
      id: "recycle_sentry",
      name: "回收哨兵",
      type: "deployable",
      iconId: "skill_sentry",
      desc: "每 5 秒部署一座自動哨兵，鎖定附近污染物並發射能量彈。",
      eduText: "模組化設計能延長設備壽命；零件可維修、替換與回收，就能減少電子廢棄物。",
      maxLevel: 5,
      levels: [
        { cooldown: 5, duration: 15, damage: 5, fireCooldown: 0.9, range: 220, speed: 380, up: "解鎖：哨兵存活 15 秒" },
        { cooldown: 5, duration: 20, damage: 5, fireCooldown: 0.9, range: 220, speed: 380, up: "哨兵存活時間 15 → 20 秒" },
        { cooldown: 5, duration: 25, damage: 5, fireCooldown: 0.9, range: 220, speed: 380, up: "哨兵存活時間 20 → 25 秒" },
        { cooldown: 5, duration: 30, damage: 5, fireCooldown: 0.9, range: 220, speed: 380, up: "哨兵存活時間 25 → 30 秒" },
        { cooldown: 5, duration: 35, damage: 5, fireCooldown: 0.9, range: 220, speed: 380, up: "哨兵存活時間 30 → 35 秒（滿級）" }
      ]
    }
  ];

  global.GameData.getSkill = function (id) {
    return global.GameData.skills.find(function (s) { return s.id === id; });
  };
})(window);
