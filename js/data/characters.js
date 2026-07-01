/* ============================================================
   data/characters.js  —  可選角色（資料驅動）
   每個角色：id、名稱、定位、初始技能、被動、像素圖 id、主題說明。
   passive 以「修飾值」表示，於開局時套用到玩家基礎屬性。
   ============================================================ */
(function (global) {
  global.GameData = global.GameData || {};

  global.GameData.characters = [
    {
      id: "ranger",
      name: "森林巡守員",
      role: "平衡型",
      spriteId: "char_ranger",
      startingSkill: "seed_blade",
      passive: {
        // 最大生命值 +10%
        maxHpMult: 1.10
      },
      passiveText: "最大生命值 +10%",
      flavour: "守護森林邊界的巡守員，相信健康的土地能擋下污染潮。"
    },
    {
      id: "beachcomber",
      name: "海岸淨灘者",
      role: "收集型",
      spriteId: "char_beach",
      startingSkill: "recycle_net",
      passive: {
        // 拾取範圍 +25%
        pickupRangeMult: 1.25
      },
      passiveText: "拾取範圍 +25%",
      flavour: "習慣彎腰撿起每一片海廢，深知資源不該被丟進大海。"
    },
    {
      id: "solar",
      name: "太陽能工程師",
      role: "技能型",
      spriteId: "char_solar",
      startingSkill: "solar_pulse",
      passive: {
        // 技能冷卻 -10%
        cooldownMult: 0.90
      },
      passiveText: "技能冷卻 -10%",
      flavour: "用乾淨能源驅動裝置，相信節能行動能讓世界更明亮。"
    }
  ];

  // 8 方向動畫資產設定（spriteBasePath + animationSet）—— 資料驅動，所有角色套同一規則
  (function () {
    var FOLDER = { ranger: "ranger", beachcomber: "beachcomber", solar: "solar_engineer" };
    var D = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    function buildAnimSet() {
      var idle = {}, walk = {};
      D.forEach(function (d) {
        idle[d] = ["idle_" + d + "_0"];
        walk[d] = ["walk_" + d + "_0", "walk_" + d + "_1", "walk_" + d + "_2", "walk_" + d + "_3"];
      });
      return { idle: idle, walk: walk };
    }
    global.GameData.characters.forEach(function (ch) {
      var folder = FOLDER[ch.id] || ch.id;
      ch.canonicalId = ch.id === "solar" ? "solar_engineer" : ch.id;
      ch.animationId = ch.canonicalId;
      ch.spriteBasePath = "assets/images/characters/" + folder + "/";
      ch.spriteVersion = ch.id === "ranger" ? "lrfix1" : "";
      ch.animationSet = buildAnimSet();
    });
  })();

  global.GameData.characterAliases = {
    ranger: "ranger",
    forest_ranger: "ranger",
    beachcomber: "beachcomber",
    coastal_cleanup: "beachcomber",
    coastal_cleanup_volunteer: "beachcomber",
    solar: "solar",
    solar_engineer: "solar"
  };

  global.GameData.resolveCharacterId = function (id) {
    return global.GameData.characterAliases[id] || id;
  };

  global.GameData.getCharacter = function (id) {
    id = global.GameData.resolveCharacterId(id);
    return global.GameData.characters.find(function (c) { return c.id === id; });
  };
})(window);
