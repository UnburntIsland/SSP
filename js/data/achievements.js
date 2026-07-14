/* ============================================================
   data/achievements.js  —  成就資料定義
   只以五名正式角色與三個主要關卡交叉生成，Skin 不會進入角色成就。
   ============================================================ */
(function (global) {
  "use strict";

  var GD = global.GameData = global.GameData || {};
  var achievements = [];
  var order = 0;

  var ICONS = {
    guardian: "assets/images/achievements/achievement_guardian.png?v=achievements-20260714i",
    damage: "assets/images/achievements/achievement_damage.png?v=achievements-20260714i",
    flawless: "assets/images/achievements/achievement_flawless.png?v=achievements-20260714i",
    purify: "assets/images/achievements/achievement_purify.png?v=achievements-20260714i",
    learning: "assets/images/achievements/achievement_learning.png?v=achievements-20260714i"
  };
  var TIERS = ["bronze", "silver", "gold"];
  var ROMAN = ["I", "II", "III"];
  var CHARACTER_IDS = ["ranger", "beachcomber", "solar", "mechanic", "chemist"];
  var STAGE_IDS = ["tidal_flat", "recycle_works", "blackwater_plant"];

  function reward(coins, skillPoints) {
    var value = { coins: coins };
    if (skillPoints) value.skillPoints = skillPoints;
    return value;
  }

  function add(definition) {
    definition.order = ++order;
    achievements.push(definition);
  }

  function selectByIds(source, ids) {
    var selected = [];
    source = Array.isArray(source) ? source : [];
    ids.forEach(function (id) {
      for (var i = 0; i < source.length; i++) {
        if (source[i] && source[i].id === id) {
          selected.push(source[i]);
          break;
        }
      }
    });
    return selected;
  }

  var characters = selectByIds(GD.characters, CHARACTER_IDS);
  var stages = selectByIds(GD.stages, STAGE_IDS);
  var guardianCoins = [150, 350, 750];

  characters.forEach(function (character) {
    stages.forEach(function (stage, stageIndex) {
      add({
        id: "guardian_" + character.id + "_" + stage.id,
        title: character.name + "：" + stage.name,
        description: "使用「" + character.name + "」通關「" + stage.name + "」。",
        group: "guardian",
        category: "clear",
        tier: TIERS[stageIndex],
        order: 0,
        icon: ICONS.guardian,
        kind: "guardian_clear",
        metric: "stageClear",
        target: 1,
        characterId: character.id,
        stageId: stage.id,
        reward: reward(guardianCoins[stageIndex], stageIndex === 2 ? {
          amount: 1,
          characterId: character.id
        } : null),
        unit: "次"
      });
    });
  });

  [
    { target: 5000, coins: 100 },
    { target: 20000, coins: 250 },
    { target: 50000, coins: 600 }
  ].forEach(function (entry, index) {
    add({
      id: "challenge_damage_" + entry.target,
      title: "火力試煉 " + ROMAN[index],
      description: "單局累積造成至少 " + entry.target.toLocaleString("en-US") + " 點有效傷害。",
      group: "challenge",
      category: "damage",
      tier: TIERS[index],
      order: 0,
      icon: ICONS.damage,
      kind: "run_threshold",
      metric: "damageDealt",
      target: entry.target,
      characterId: null,
      stageId: null,
      reward: reward(entry.coins),
      unit: "傷害"
    });
  });

  var flawlessCoins = [250, 600, 1200];
  stages.forEach(function (stage, stageIndex) {
    add({
      id: "challenge_flawless_" + stage.id,
      title: "毫髮無傷：" + stage.name,
      description: "在「" + stage.name + "」達成無傷通關。",
      group: "challenge",
      category: "flawless",
      tier: TIERS[stageIndex],
      order: 0,
      icon: ICONS.flawless,
      kind: "flawless_clear",
      metric: "flawlessClear",
      target: 1,
      characterId: null,
      stageId: stage.id,
      reward: reward(flawlessCoins[stageIndex], stageIndex === 2 ? {
        amount: 1,
        targetPolicy: "unlockingCharacter"
      } : null),
      unit: "次"
    });
  });

  [
    { target: 50, coins: 150 },
    { target: 150, coins: 350 },
    { target: 300, coins: 750 }
  ].forEach(function (entry, index) {
    add({
      id: "challenge_purify_" + entry.target,
      title: "淨化先鋒 " + ROMAN[index],
      description: "單局淨化至少 " + entry.target + " 個污染物。",
      group: "challenge",
      category: "purify",
      tier: TIERS[index],
      order: 0,
      icon: ICONS.purify,
      kind: "run_threshold",
      metric: "purified",
      target: entry.target,
      characterId: null,
      stageId: null,
      reward: reward(entry.coins),
      unit: "個"
    });
  });

  [
    { target: 5, coins: 150 },
    { target: 10, coins: 350 },
    { target: 20, coins: 750 }
  ].forEach(function (entry, index) {
    add({
      id: "challenge_learning_" + entry.target,
      title: "永續學習 " + ROMAN[index],
      description: "單局永續問答連續答對至少 " + entry.target + " 題。",
      group: "challenge",
      category: "learning",
      tier: TIERS[index],
      order: 0,
      icon: ICONS.learning,
      kind: "run_threshold",
      metric: "bestQuizStreak",
      target: entry.target,
      characterId: null,
      stageId: null,
      reward: reward(entry.coins),
      unit: "題"
    });
  });

  GD.achievements = achievements;
  GD.getAchievement = function (id) {
    for (var i = 0; i < achievements.length; i++) {
      if (achievements[i].id === id) return achievements[i];
    }
    return null;
  };
})(window);
