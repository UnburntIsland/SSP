/* ============================================================
   achievements.js  —  成就進度、解鎖與領獎入口
   局內只收單局結算資料；持久化由 Storage 統一處理。
   ============================================================ */
(function (global) {
  "use strict";

  var OFFICIAL_CHARACTER_IDS = ["ranger", "beachcomber", "solar", "mechanic", "chemist"];

  function definitions() {
    return (global.GameData && global.GameData.achievements) || [];
  }

  function storageReady() {
    var storage = global.Storage;
    return !!(storage &&
      storage.getAchievementProgress &&
      storage.setAchievementProgress &&
      storage.isAchievementUnlocked &&
      storage.unlockAchievement &&
      storage.claimAchievementReward);
  }

  function findDefinition(id) {
    if (global.GameData && global.GameData.getAchievement) {
      return global.GameData.getAchievement(id);
    }
    var all = definitions();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function numberOrZero(value) {
    var number = Number(value);
    return isFinite(number) && number > 0 ? number : 0;
  }

  function officialCharacterId(value) {
    if (value && typeof value === "object") value = value.id || value.characterId;
    if (!value) return null;

    var skin = global.GameData && global.GameData.getSkin ? global.GameData.getSkin(value) : null;
    if (skin && skin.characterId) value = skin.characterId;
    if (global.GameData && global.GameData.resolveCharacterId) {
      value = global.GameData.resolveCharacterId(value);
    }
    if (OFFICIAL_CHARACTER_IDS.indexOf(value) === -1) return null;
    if (global.GameData && global.GameData.getCharacter && !global.GameData.getCharacter(value)) return null;
    return value;
  }

  function progressNumber(value) {
    if (value && typeof value === "object") value = value.progress;
    return numberOrZero(value);
  }

  function rawAchievementState(id) {
    var data = global.Storage && global.Storage.data;
    var achievements = data && data.achievements;
    var state = null;
    var unlocked = null;
    var claimed = null;

    if (achievements && typeof achievements === "object") {
      state = achievements[id] && typeof achievements[id] === "object" ? achievements[id] : null;
      if (achievements.progress && achievements.progress[id] && typeof achievements.progress[id] === "object") {
        state = achievements.progress[id];
      }
      if (achievements.unlocked) unlocked = achievements.unlocked[id] || null;
      if (achievements.claimed) claimed = achievements.claimed[id] || null;
    }

    return {
      state: state,
      unlocked: unlocked,
      claimed: claimed
    };
  }

  function stateFor(definition) {
    var rawProgress = storageReady() ? global.Storage.getAchievementProgress(definition.id) : 0;
    var raw = rawAchievementState(definition.id);
    var progress = progressNumber(rawProgress);
    var unlocked = storageReady() ? !!global.Storage.isAchievementUnlocked(definition.id) : false;
    var claimedAt = null;
    var unlockedAt = null;
    var runCharacterId = null;

    if (raw.state) {
      claimedAt = raw.state.claimedAt || (raw.state.claimed === true ? true : null);
      unlockedAt = raw.state.unlockedAt || null;
      runCharacterId = raw.state.runCharacterId || null;
    }
    if (raw.unlocked) {
      unlockedAt = raw.unlocked.at || raw.unlocked.unlockedAt || unlockedAt || true;
      runCharacterId = raw.unlocked.runCharacterId || runCharacterId;
    }
    if (raw.claimed) claimedAt = raw.claimed.at || raw.claimed.claimedAt || true;
    if (!claimedAt && global.Storage && global.Storage.isAchievementClaimed) {
      claimedAt = global.Storage.isAchievementClaimed(definition.id) ? true : null;
    }

    return {
      id: definition.id,
      progress: progress,
      target: definition.target,
      unlocked: unlocked,
      unlockedAt: unlockedAt,
      claimed: !!claimedAt,
      claimedAt: claimedAt,
      claimable: unlocked && !claimedAt,
      runCharacterId: runCharacterId
    };
  }

  function copyDefinition(definition) {
    var copy = {};
    var key;
    for (key in definition) {
      if (Object.prototype.hasOwnProperty.call(definition, key)) copy[key] = definition[key];
    }
    var state = stateFor(definition);
    for (key in state) {
      if (Object.prototype.hasOwnProperty.call(state, key)) copy[key] = state[key];
    }
    copy.rewardLabel = rewardText(definition);
    return copy;
  }

  function matchesFilter(item, filter) {
    if (!filter) return true;
    if (typeof filter === "function") return !!filter(item);
    if (typeof filter === "string") return item.group === filter || item.category === filter;
    if (typeof filter !== "object") return true;

    var keys = ["group", "category", "tier", "characterId", "stageId", "kind", "metric"];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (filter[key] != null && item[key] !== filter[key]) return false;
    }
    if (filter.unlocked != null && item.unlocked !== !!filter.unlocked) return false;
    if (filter.claimed != null && item.claimed !== !!filter.claimed) return false;
    if (filter.claimable != null && item.claimable !== !!filter.claimable) return false;
    return true;
  }

  function getAll(filter) {
    var all = definitions();
    var result = [];
    for (var i = 0; i < all.length; i++) {
      var item = copyDefinition(all[i]);
      if (matchesFilter(item, filter)) result.push(item);
    }
    result.sort(function (a, b) { return a.order - b.order; });
    return result;
  }

  function getState(id) {
    if (id) {
      var definition = findDefinition(id);
      return definition ? stateFor(definition) : null;
    }
    var state = {};
    var all = definitions();
    for (var i = 0; i < all.length; i++) state[all[i].id] = stateFor(all[i]);
    return state;
  }

  function getSummary(filter) {
    var all = getAll(filter);
    var summary = {
      total: all.length,
      completed: 0,
      unlocked: 0,
      claimed: 0,
      claimable: 0,
      inProgress: 0,
      percent: 0,
      byGroup: {}
    };

    for (var i = 0; i < all.length; i++) {
      var item = all[i];
      if (!summary.byGroup[item.group]) {
        summary.byGroup[item.group] = { total: 0, unlocked: 0, claimed: 0, claimable: 0 };
      }
      var group = summary.byGroup[item.group];
      group.total += 1;
      if (item.unlocked) {
        summary.unlocked += 1;
        summary.completed += 1;
        group.unlocked += 1;
      } else if (item.progress > 0) {
        summary.inProgress += 1;
      }
      if (item.claimed) {
        summary.claimed += 1;
        group.claimed += 1;
      }
      if (item.claimable) {
        summary.claimable += 1;
        group.claimable += 1;
      }
    }
    summary.percent = summary.total ? Math.round(summary.completed / summary.total * 100) : 0;
    return summary;
  }

  function formatNumber(value) {
    var text = String(Math.max(0, Math.floor(numberOrZero(value))));
    return text.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function characterName(id) {
    var character = global.GameData && global.GameData.getCharacter ? global.GameData.getCharacter(id) : null;
    return character ? character.name : "角色";
  }

  function rewardText(value) {
    var definition = null;
    if (typeof value === "string") definition = findDefinition(value);
    else if (value && value.reward) definition = value;
    var reward = definition ? definition.reward : value;
    if (!reward) return "無";

    var parts = [];
    if (reward.coins > 0) parts.push("♻ " + formatNumber(reward.coins));
    var skillPoints = reward.skillPoints;
    var pointAmount = typeof skillPoints === "object"
      ? numberOrZero(skillPoints.amount)
      : numberOrZero(skillPoints);
    if (pointAmount > 0) {
      var pointCharacterId = typeof skillPoints === "object" ? skillPoints.characterId : reward.characterId;
      var targetName = pointCharacterId
        ? characterName(pointCharacterId)
        : (definition && definition.characterId ? characterName(definition.characterId) : "當局角色");
      parts.push(targetName + "技能點 ×" + formatNumber(pointAmount));
    }
    return parts.length ? parts.join(" + ") : "無";
  }

  function runMetric(stats, metric) {
    var value = stats[metric];
    if (value == null && metric === "damageDealt") value = stats.totalDamageDealt;
    if (value == null && metric === "purified") value = stats.purifiedCount;
    if (value == null && metric === "bestQuizStreak") value = stats.quizStreak;
    return Math.floor(numberOrZero(value));
  }

  function runProgress(definition, stats, runCharacterId, stageId) {
    if (definition.kind === "guardian_clear") {
      return stats.result === "victory" &&
        definition.characterId === runCharacterId &&
        definition.stageId === stageId ? 1 : 0;
    }
    if (definition.kind === "flawless_clear") {
      var damageTaken = stats.damageTaken;
      if (damageTaken == null) damageTaken = stats.totalDamageTaken;
      var hasDamageResult = damageTaken != null || stats.noDamage === true;
      // 若同時有數值與布林標記，以可量測的受傷值為準，避免矛盾資料誤解鎖。
      var tookNoDamage = damageTaken != null
        ? numberOrZero(damageTaken) === 0
        : stats.noDamage === true;
      return stats.result === "victory" && hasDamageResult && tookNoDamage &&
        definition.stageId === stageId ? 1 : 0;
    }
    if (definition.kind === "run_threshold") return runMetric(stats, definition.metric);
    return 0;
  }

  function recordRun(stats) {
    stats = stats || {};
    if (global.TestMode && global.TestMode.enabled && !global.TestMode.achievementPersistence) {
      return { ok: true, persisted: false, reason: "test_mode", changed: [], unlocked: [] };
    }
    if (!storageReady()) {
      return { ok: false, persisted: false, reason: "storage_unavailable", changed: [], unlocked: [] };
    }

    var activePlayer = global.Game && global.Game.player;
    var activeCharacter = activePlayer && activePlayer.character;
    var runCharacterId = stats.runCharacterId || stats.characterId || stats.character ||
      (activeCharacter && activeCharacter.id) ||
      (global.App && (global.App.currentChar || global.App.selectedCharacterId)) || null;
    runCharacterId = officialCharacterId(runCharacterId);
    var stageId = stats.stageId || null;
    var all = definitions();
    var changed = [];
    var unlocked = [];
    var dirty = false;

    for (var i = 0; i < all.length; i++) {
      var definition = all[i];
      var current = progressNumber(global.Storage.getAchievementProgress(definition.id));
      var measured = runProgress(definition, stats, runCharacterId, stageId);
      var next = Math.max(current, measured);

      if (next > current) {
        global.Storage.setAchievementProgress(definition.id, next, false);
        changed.push(definition.id);
        dirty = true;
      }

      if (next >= definition.target && !global.Storage.isAchievementUnlocked(definition.id)) {
        global.Storage.unlockAchievement(definition.id, runCharacterId, false);
        unlocked.push(definition.id);
        dirty = true;
      }
    }

    if (dirty && global.Storage.save) global.Storage.save();

    return {
      ok: true,
      persisted: dirty,
      changed: changed,
      unlocked: unlocked,
      unlockedAchievements: unlocked.map(function (id) { return copyDefinition(findDefinition(id)); }),
      summary: getSummary()
    };
  }

  function claim(id) {
    var definition = findDefinition(id);
    if (!definition) return { ok: false, reason: "not_found" };
    if (!storageReady()) return { ok: false, reason: "storage_unavailable" };
    if (!global.Storage.isAchievementUnlocked(id)) return { ok: false, reason: "locked" };
    return global.Storage.claimAchievementReward(definition);
  }

  global.Achievements = {
    recordRun: recordRun,
    getState: getState,
    getAll: getAll,
    getSummary: getSummary,
    claim: claim,
    rewardText: rewardText
  };
})(window);
