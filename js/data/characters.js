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
        // 生存型：以高生命容錯保護剛接觸動作遊戲的玩家。
        maxHpMult: 1.5
      },
      passiveText: "最大生命值 +50%",
      flavour: "守護森林邊界的巡守員，相信健康的土地能擋下污染潮。"
    },
    {
      id: "beachcomber",
      name: "海岸淨灘者",
      role: "收集型",
      spriteId: "char_beach",
      startingSkill: "recycle_net",
      passive: {
        // 收集型：更容易吃到散落資源，並有少量移動優勢。
        pickupRangeMult: 1.35,
        speedMult: 1.06
      },
      passiveText: "拾取範圍 +35%、移動速度 +6%",
      flavour: "習慣彎腰撿起每一片海廢，深知資源不該被丟進大海。"
    },
    {
      id: "solar",
      name: "太陽能工程師",
      role: "技能型",
      spriteId: "char_solar",
      startingSkill: "solar_pulse",
      passive: {
        // 技能型：用明顯的冷卻優勢交換較低生命容錯。
        cooldownMult: 0.8,
        maxHpMult: 0.8
      },
      passiveText: "技能冷卻 -20%、最大生命值 -20%",
      flavour: "用乾淨能源驅動裝置，相信節能行動能讓世界更明亮。"
    },
    {
      id: "mechanic",
      name: "循環機械師",
      role: "部署型",
      spriteId: "char_mechanic",
      startingSkill: "recycle_sentry",
      passive: {
        // 部署型：以固定攻擊倍率強化專屬哨兵與後續取得的攻擊技能。
        damageMult: 1.1
      },
      passiveText: "攻擊力 +10%",
      flavour: "把回收零件組成自動哨兵，讓循環科技在污染潮中守住陣地。"
    },
    {
      id: "chemist",
      name: "生態藥劑師",
      role: "路徑控場",
      spriteId: "char_chemist",
      startingSkill: "purifying_trail",
      passive: {
        // 高機動生存型：利用速度主動鋪設路徑，額外生命提高近身引怪的容錯。
        maxHpMult: 1.1,
        speedMult: 1.2
      },
      passiveText: "最大生命值 +10%、移動速度 +20%",
      flavour: "把微生物與淨水藥劑調成活性配方，走過之處都會留下能分解污染的淨化藥跡。"
    }
  ];

  // 8 方向動畫資產設定（spriteBasePath + animationSet）—— 資料驅動，所有角色套同一規則
  (function () {
    var FOLDER = {
      ranger: "ranger",
      beachcomber: "beachcomber",
      solar: "solar_engineer",
      mechanic: "circular_mechanic",
      chemist: "eco_chemist"
    };
    var CANONICAL = {
      solar: "solar_engineer",
      mechanic: "circular_mechanic",
      chemist: "eco_chemist"
    };
    var D = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    // 8 方向 idle / walk 全部列出，不在資料層假設哪些 walk 存在。
    // 「某方向 walk 是否可用」由執行期依「資料夾實際檔案」判斷：
    // walk_<DIR>_0~3 四張全部成功載入才使用（animation.js 的 isWalkApproved），
    // 缺任一張 → 該方向固定用 idle_<DIR>_0。之後補齊圖檔會自動啟用，毋須改程式。
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
      ch.canonicalId = CANONICAL[ch.id] || ch.id;
      ch.animationId = ch.canonicalId;
      ch.spriteBasePath = "assets/images/characters/" + folder + "/";
      ch.spriteVersion = ch.id === "ranger" ? "lrfix1" : (ch.id === "solar" ? "solar_regen_2" : (ch.id === "mechanic" ? "mechanic_1" : (ch.id === "chemist" ? "chemist_1" : "")));
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
    solar_engineer: "solar",
    mechanic: "mechanic",
    circular_mechanic: "mechanic",
    recycling_mechanic: "mechanic",
    chemist: "chemist",
    eco_chemist: "chemist",
    ecological_chemist: "chemist"
  };

  global.GameData.resolveCharacterId = function (id) {
    return global.GameData.characterAliases[id] || id;
  };

  global.GameData.getCharacter = function (id) {
    id = global.GameData.resolveCharacterId(id);
    return global.GameData.characters.find(function (c) { return c.id === id; });
  };
})(window);
