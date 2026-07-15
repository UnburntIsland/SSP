/* ============================================================
   data/skins.js  —  角色造型與生態扭蛋資料
   每名角色三套造型；造型不改技能，只提供一種永久裝備加成。
   ============================================================ */
(function (global) {
  var GD = global.GameData = global.GameData || {};

  GD.GACHA_COST = 1000;
  GD.SKIN_BONUS = 0.10;
  GD.SKILL_POINT_BONUS = 0.05;
  GD.CHARACTER_SKILL_POINT_BONUS = {
    chemist: {
      attack: 0.04,
      speed: 0.03,
      hp: 0.05
    }
  };

  GD.getCharacterSkillPointBonus = function (characterId, stat) {
    if (GD.resolveCharacterId) characterId = GD.resolveCharacterId(characterId);
    var override = GD.CHARACTER_SKILL_POINT_BONUS[characterId];
    var value = override && Number(override[stat]);
    if (isFinite(value) && value >= 0) return value;
    return typeof GD.SKILL_POINT_BONUS === "number" ? GD.SKILL_POINT_BONUS : 0.05;
  };

  GD.skins = [
    { id: "ranger_thorn", characterId: "ranger", name: "荊棘獵手", stat: "attack", statName: "攻擊", accent: "#f06a4a" },
    { id: "ranger_gale", characterId: "ranger", name: "疾風斥候", stat: "speed", statName: "速度", accent: "#75e4e0" },
    { id: "ranger_canopy", characterId: "ranger", name: "森冠守衛", stat: "hp", statName: "生命", accent: "#68c85a" },

    { id: "beach_harpoon", characterId: "beachcomber", name: "潮汐魚叉手", stat: "attack", statName: "攻擊", accent: "#f06a4a" },
    { id: "beach_wave", characterId: "beachcomber", name: "浪花快手", stat: "speed", statName: "速度", accent: "#75e4e0" },
    { id: "beach_coral", characterId: "beachcomber", name: "珊瑚救生員", stat: "hp", statName: "生命", accent: "#68c85a" },

    { id: "solar_flare", characterId: "solar", name: "日耀增幅型", stat: "attack", statName: "攻擊", accent: "#f06a4a" },
    { id: "solar_lighttrail", characterId: "solar", name: "光軌機動型", stat: "speed", statName: "速度", accent: "#75e4e0" },
    { id: "solar_battery", characterId: "solar", name: "儲能裝甲型", stat: "hp", statName: "生命", accent: "#68c85a" },

    { id: "mechanic_arc", characterId: "mechanic", name: "電弧焊匠", stat: "attack", statName: "攻擊", accent: "#f06a4a" },
    { id: "mechanic_bearing", characterId: "mechanic", name: "軸承疾行型", stat: "speed", statName: "速度", accent: "#75e4e0" },
    { id: "mechanic_bulwark", characterId: "mechanic", name: "廢鋼堡壘型", stat: "hp", statName: "生命", accent: "#68c85a" },

    { id: "chemist_catalyst", characterId: "chemist", name: "催化藥劑型", stat: "attack", statName: "攻擊", accent: "#f06a4a" },
    { id: "chemist_current", characterId: "chemist", name: "清流疾行型", stat: "speed", statName: "速度", accent: "#75e4e0" },
    { id: "chemist_springguard", characterId: "chemist", name: "聖泉守護型", stat: "hp", statName: "生命", accent: "#68c85a" }
  ];

  GD.skins.forEach(function (skin) {
    skin.spriteBasePath = "assets/images/characters/skins/" + skin.id + "/";
    skin.previewImage = skin.spriteBasePath + "idle_S_0.png";
    skin.bonus = GD.SKIN_BONUS;
  });

  GD.getSkin = function (id) {
    return GD.skins.find(function (skin) { return skin.id === id; }) || null;
  };

  GD.getCharacterSkins = function (characterId) {
    characterId = GD.resolveCharacterId ? GD.resolveCharacterId(characterId) : characterId;
    return GD.skins.filter(function (skin) { return skin.characterId === characterId; });
  };

  // 建立一份只供本局使用的角色資料，避免修改共用 GameData.characters。
  GD.makePlayableCharacter = function (characterId, skinId) {
    var base = GD.getCharacter(characterId) || GD.characters[0];
    var out = {};
    Object.keys(base).forEach(function (key) { out[key] = base[key]; });
    var skin = GD.getSkin(skinId);
    if (skin && skin.characterId === base.id) {
      out.skinId = skin.id;
      out.skin = skin;
      out.spriteBasePath = skin.spriteBasePath;
      out.spriteVersion = "skin-chemist-dirfix-20260715a";
      out.animationId = (base.animationId || base.id) + "_" + skin.id;
    }
    return out;
  };
})(window);
