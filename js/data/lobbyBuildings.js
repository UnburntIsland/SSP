/* ============================================================
   data/lobbyBuildings.js  —  大廳建築與裝飾（資料驅動）
   - functional：每種只能擁有一棟（unique），提供進入關卡時的加成。
   - decoration：可重複建造，純外觀；collision 標記是否阻擋走位。
   - 所有成本 / footprint / 效果 / 圖片路徑皆由資料決定，
     建造與繪製程式不寫 if buildingId。
   - 圖片缺漏時由 lobby.js 以 fallback 樣式繪製（不影響玩法）。
   ============================================================ */
(function (global) {
  global.GameData = global.GameData || {};

  var BASE_PATH = "assets/images/lobby/";

  /* fallback：body / accent 為程式繪製時的主色，glyph 決定屋頂上的小圖示 */
  global.GameData.lobbyBuildings = [
    /* ---------------- 功能建築（unique） ---------------- */
    {
      id: "solar_workshop",
      name: "太陽能工坊",
      category: "functional",
      unique: true,
      cost: { recycled: 80 },
      footprint: { w: 4, h: 4 },
      collision: true,
      rotations: [0, 90, 180, 270],
      assetBasePath: BASE_PATH + "buildings/solar_workshop/",
      effect: { stat: "damageMult", op: "multiply", value: 1.05 },
      effectText: "出擊時攻擊力 +5%",
      knowledgeId: "building_solar_workshop",
      description: "把回收材料轉為穩定能源，出擊時攻擊力提升 5%。",
      fallback: { body: "#c98d4f", roof: "#3d6fa8", accent: "#ffd45c", glyph: "sun" }
    },
    {
      id: "rain_garden",
      name: "雨水花園",
      category: "functional",
      unique: true,
      cost: { recycled: 70 },
      footprint: { w: 4, h: 3 },
      collision: true,
      rotations: [0, 90, 180, 270],
      assetBasePath: BASE_PATH + "buildings/rain_garden/",
      effect: { stat: "maxHpMult", op: "multiply", value: 1.08 },
      effectText: "出擊時最大生命 +8%",
      knowledgeId: "building_rain_garden",
      description: "收集雨水灌溉的花園讓身心更強健，出擊時最大生命提升 8%。",
      fallback: { body: "#5d8f56", roof: "#7ec4e8", accent: "#a9dff5", glyph: "drop" }
    },
    {
      id: "wind_station",
      name: "微型風力站",
      category: "functional",
      unique: true,
      cost: { recycled: 65 },
      footprint: { w: 3, h: 3 },
      collision: true,
      rotations: [0, 90, 180, 270],
      assetBasePath: BASE_PATH + "buildings/wind_station/",
      effect: { stat: "speedMult", op: "multiply", value: 1.04 },
      effectText: "出擊時移動速度 +4%",
      knowledgeId: "building_wind_station",
      description: "微風也能發電！輕快的能源讓你出擊時移動速度提升 4%。",
      fallback: { body: "#d9d4c8", roof: "#8fb7c9", accent: "#eef6f9", glyph: "fan" }
    },
    {
      id: "recycle_guard",
      name: "循環防護站",
      category: "functional",
      unique: true,
      cost: { recycled: 100 },
      footprint: { w: 4, h: 4 },
      collision: true,
      rotations: [0, 90, 180, 270],
      assetBasePath: BASE_PATH + "buildings/recycle_guard/",
      effect: { stat: "blockInterval", op: "set", value: 90 },
      effectText: "每 90 秒格擋一次傷害",
      knowledgeId: "building_recycle_guard",
      description: "回收金屬打造的防護罩發生器，每 90 秒替你格擋一次傷害。",
      fallback: { body: "#6f7d8c", roof: "#4dd0c4", accent: "#9df6e5", glyph: "shield" }
    },

    /* ---------------- 裝飾（可重複建造） ---------------- */
    {
      id: "small_tree",
      name: "小樹",
      category: "decoration",
      unique: false,
      cost: { recycled: 6 },
      footprint: { w: 1, h: 1 },
      collision: true,
      rotations: [0, 90, 180, 270],
      assetBasePath: BASE_PATH + "decorations/small_tree/",
      effect: null,
      effectText: "純裝飾",
      description: "多種一棵樹，就多一份涼蔭與新鮮空氣。",
      fallback: { body: "#7b5a3a", roof: "#4f9a52", accent: "#6dc06d", glyph: "tree" }
    },
    {
      id: "flower_bed",
      name: "花圃",
      category: "decoration",
      unique: false,
      cost: { recycled: 5 },
      footprint: { w: 2, h: 1 },
      collision: false,        /* 純視覺：可直接走過 */
      rotations: [0, 90, 180, 270],
      assetBasePath: BASE_PATH + "decorations/flower_bed/",
      effect: null,
      effectText: "純裝飾（可走過）",
      description: "蜜蜂與蝴蝶最愛的小花圃，也是重要的授粉站。",
      fallback: { body: "#8a6b45", roof: "#e77fb3", accent: "#ffd45c", glyph: "flower" }
    },
    {
      id: "recycle_bench",
      name: "回收長椅",
      category: "decoration",
      unique: false,
      cost: { recycled: 8 },
      footprint: { w: 2, h: 1 },
      collision: true,
      rotations: [0, 90, 180, 270],
      assetBasePath: BASE_PATH + "decorations/recycling_bench/",
      effect: null,
      effectText: "純裝飾",
      description: "用回收塑料板做成的長椅，休息一下再出發。",
      fallback: { body: "#4da2b8", roof: "#7b5a3a", accent: "#cdeef5", glyph: "bench" }
    },
    {
      id: "solar_lamp",
      name: "太陽能路燈",
      category: "decoration",
      unique: false,
      cost: { recycled: 6 },
      footprint: { w: 1, h: 1 },
      collision: true,
      rotations: [0, 90, 180, 270],
      assetBasePath: BASE_PATH + "decorations/solar_streetlight/",
      effect: null,
      effectText: "純裝飾",
      description: "白天曬太陽、晚上亮起來，一度電都不用。",
      fallback: { body: "#5b6570", roof: "#ffd45c", accent: "#fff3c2", glyph: "lamp" }
    },
    {
      id: "sorting_bins",
      name: "分類垃圾桶",
      category: "decoration",
      unique: false,
      cost: { recycled: 10 },
      footprint: { w: 2, h: 1 },
      collision: true,
      rotations: [0, 90, 180, 270],
      assetBasePath: BASE_PATH + "decorations/sorting_bins/",
      effect: null,
      effectText: "純裝飾",
      description: "紙類、塑膠、金屬分清楚，回收才有力量。",
      fallback: { body: "#43a047", roof: "#1e88e5", accent: "#fb8c00", glyph: "bin" }
    },
    {
      id: "rain_barrel",
      name: "雨水桶",
      category: "decoration",
      unique: false,
      cost: { recycled: 6 },
      footprint: { w: 1, h: 1 },
      collision: true,
      rotations: [0, 90, 180, 270],
      assetBasePath: BASE_PATH + "decorations/rain_barrel/",
      effect: null,
      effectText: "純裝飾",
      description: "接住屋簷的雨水，澆花洗地都好用。",
      fallback: { body: "#7ba7c4", roof: "#5d7d94", accent: "#cdeef5", glyph: "drop" }
    },
    {
      id: "wood_sign",
      name: "木製告示牌",
      category: "decoration",
      unique: false,
      cost: { recycled: 4 },
      footprint: { w: 1, h: 1 },
      collision: true,
      rotations: [0, 90, 180, 270],
      assetBasePath: BASE_PATH + "decorations/eco_sign/",
      effect: null,
      effectText: "純裝飾",
      description: "寫上你的永續行動宣言吧！",
      fallback: { body: "#8a6b45", roof: "#6b4f30", accent: "#e9d6a8", glyph: "sign" }
    },
    {
      id: "eco_pond",
      name: "小型生態池",
      category: "decoration",
      unique: false,
      cost: { recycled: 15 },
      footprint: { w: 3, h: 2 },
      collision: true,
      rotations: [0, 90, 180, 270],
      assetBasePath: BASE_PATH + "decorations/eco_pond/",
      effect: null,
      effectText: "純裝飾",
      description: "青蛙與蜻蜓的家，小小池塘也是完整的生態系。",
      fallback: { body: "#2a9db5", roof: "#4f9a52", accent: "#9fdce8", glyph: "pond" }
    }
  ];

  global.GameData.getLobbyBuilding = function (id) {
    return global.GameData.lobbyBuildings.find(function (b) { return b.id === id; }) || null;
  };

  /* ------------------------------------------------------------
     彙整大廳加成（單一入口；Player 不自行掃描大廳配置）
     - 只計「已擺放在大廳」(placed:true) 的功能建築。
     - 同一 buildingId 只生效一次（unique 規則的最後防線）。
     - 沒有任何功能建築時回傳全 1 倍率，數值與無大廳版本完全一致。
     ------------------------------------------------------------ */
  global.GameData.getLobbyBonuses = function (lobbySave) {
    var bonuses = {
      damageMult: 1,
      maxHpMult: 1,
      speedMult: 1,
      blockInterval: 0,       /* 0 = 沒有格擋 */
      sources: []
    };
    if (!lobbySave || !Array.isArray(lobbySave.buildings)) return bonuses;
    var applied = {};
    lobbySave.buildings.forEach(function (inst) {
      if (!inst || inst.placed === false) return;
      var def = global.GameData.getLobbyBuilding(inst.buildingId);
      if (!def || def.category !== "functional" || !def.effect) return;
      if (applied[def.id]) return;                 /* 效果不可重複堆疊 */
      applied[def.id] = true;
      var e = def.effect;
      if (e.op === "multiply" && typeof bonuses[e.stat] === "number") {
        bonuses[e.stat] *= e.value;                /* 各倍率只套用一次 */
      } else if (e.op === "set" && e.stat === "blockInterval") {
        bonuses.blockInterval = bonuses.blockInterval
          ? Math.min(bonuses.blockInterval, e.value)
          : e.value;
      }
      bonuses.sources.push({ buildingId: def.id, label: def.name + "：" + def.effectText });
    });
    return bonuses;
  };
})(window);
