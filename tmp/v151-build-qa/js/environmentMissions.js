/* ============================================================
   environmentMissions.js  —  週期任務與挑戰模式執行層
   週期以台灣時間（UTC+8）計算；每日 00:00、每週一 00:00 重置。
   ============================================================ */
(function (global) {
  "use strict";

  var TAIWAN_OFFSET_MS = 8 * 60 * 60 * 1000;

  function definitions(scope) {
    var data = global.GameData && global.GameData.environmentMissions;
    return data && Array.isArray(data[scope]) ? data[scope] : [];
  }

  function hashText(text) {
    var hash = 2166136261;
    text = String(text || "");
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededShuffle(items, seedText) {
    var result = items.slice();
    var seed = hashText(seedText) || 1;
    function random() {
      seed += 0x6D2B79F5;
      var value = seed;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    }
    for (var i = result.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var item = result[i];
      result[i] = result[j];
      result[j] = item;
    }
    return result;
  }

  function dateParts(now) {
    var shifted = new Date((now == null ? Date.now() : now) + TAIWAN_OFFSET_MS);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      weekday: shifted.getUTCDay()
    };
  }

  function pad(value) { return value < 10 ? "0" + value : String(value); }

  function dailyKey(now) {
    var p = dateParts(now);
    return p.year + "-" + pad(p.month) + "-" + pad(p.day);
  }

  function weeklyKey(now) {
    var time = now == null ? Date.now() : now;
    var shifted = new Date(time + TAIWAN_OFFSET_MS);
    var weekday = shifted.getUTCDay() || 7;
    shifted.setUTCDate(shifted.getUTCDate() - weekday + 1);
    return shifted.getUTCFullYear() + "-" + pad(shifted.getUTCMonth() + 1) + "-" + pad(shifted.getUTCDate());
  }

  function currentKey(scope, now) {
    return scope === "weekly" ? weeklyKey(now) : dailyKey(now);
  }

  function missionRoot() {
    var storage = global.Storage;
    if (!storage || !storage.data) return null;
    if (!storage.data.environmentMissions || typeof storage.data.environmentMissions !== "object") {
      storage.data.environmentMissions = {
        version: 2,
        daily: { periodKey: null, activeIds: [], previousIds: [], progress: {}, claimed: {} },
        weekly: { periodKey: null, activeIds: [], previousIds: [], progress: {}, claimed: {} },
        challenges: {},
        tracked: null
      };
    }
    var root = storage.data.environmentMissions;
    if (!root.daily || typeof root.daily !== "object") root.daily = { periodKey: null, activeIds: [], previousIds: [], progress: {}, claimed: {} };
    if (!root.weekly || typeof root.weekly !== "object") root.weekly = { periodKey: null, activeIds: [], previousIds: [], progress: {}, claimed: {} };
    if (!root.challenges || typeof root.challenges !== "object") root.challenges = {};
    if (!root.tracked || typeof root.tracked !== "object") root.tracked = null;
    return root;
  }

  function missionEligible(definition) {
    if (!definition) return false;
    if (definition.requiresPlacedBuilding) {
      var ids = placedBuildingIds();
      if (!Object.keys(ids).length) return false;
    }
    if (definition.requiredBuildingId && !placedBuildingIds()[definition.requiredBuildingId]) return false;
    if (definition.requiredCharacterId &&
        global.Storage && global.Storage.isCharacterOwned &&
        !global.Storage.isCharacterOwned(definition.requiredCharacterId)) return false;
    if (definition.requiredStageId &&
        global.Storage && global.Storage.isStageUnlocked &&
        !global.Storage.isStageUnlocked(definition.requiredStageId)) return false;
    return true;
  }

  function selectMissionIds(scope, key, previousIds) {
    var count = scope === "weekly" ? 4 : 3;
    var eligible = definitions(scope).filter(missionEligible);
    if (eligible.length < count) eligible = definitions(scope).slice();
    var previous = {};
    (previousIds || []).forEach(function (id) { previous[id] = true; });
    var fresh = seededShuffle(eligible.filter(function (item) { return !previous[item.id]; }), scope + ":" + key + ":fresh");
    var repeated = seededShuffle(eligible.filter(function (item) { return previous[item.id]; }), scope + ":" + key + ":repeat");
    return fresh.concat(repeated).slice(0, Math.min(count, eligible.length)).map(function (item) { return item.id; });
  }

  function ensurePeriod(scope, now, shouldSave) {
    var root = missionRoot();
    if (!root) return null;
    var bucket = root[scope];
    var key = currentKey(scope, now);
    if (bucket.periodKey !== key) {
      bucket.previousIds = Array.isArray(bucket.activeIds) ? bucket.activeIds.slice() : [];
      bucket.periodKey = key;
      bucket.activeIds = selectMissionIds(scope, key, bucket.previousIds);
      bucket.progress = {};
      bucket.claimed = {};
      if (shouldSave !== false && global.Storage.save) global.Storage.save();
    }
    if (!Array.isArray(bucket.previousIds)) bucket.previousIds = [];
    if (!Array.isArray(bucket.activeIds) || !bucket.activeIds.length) {
      bucket.activeIds = selectMissionIds(scope, key, bucket.previousIds);
      if (shouldSave !== false && global.Storage.save) global.Storage.save();
    }
    if (!bucket.progress || typeof bucket.progress !== "object") bucket.progress = {};
    if (!bucket.claimed || typeof bucket.claimed !== "object") bucket.claimed = {};
    return bucket;
  }

  function activeDefinitions(scope, now) {
    var bucket = ensurePeriod(scope, now);
    var ids = {};
    (bucket.activeIds || []).forEach(function (id) { ids[id] = true; });
    return definitions(scope).filter(function (definition) { return ids[definition.id]; });
  }

  function rewardLabel(reward) {
    reward = reward || {};
    var parts = [];
    if (reward.coins) parts.push("♻ " + reward.coins.toLocaleString("zh-TW"));
    if (reward.recycled) parts.push("再生材料 ⬢ " + reward.recycled);
    return parts.join(" + ") || "無";
  }

  function grantReward(reward) {
    var storage = global.Storage;
    if (!storage || !storage.data) return false;
    reward = reward || {};
    storage.data.coins = Math.max(0, (storage.data.coins | 0) + Math.max(0, reward.coins | 0));
    if (reward.recycled) {
      var lobby = storage.getLobby();
      lobby.materials.recycled = Math.max(0, (lobby.materials.recycled | 0) + Math.max(0, reward.recycled | 0));
    }
    storage.save();
    return true;
  }

  function missionState(scope, definition, now) {
    var bucket = ensurePeriod(scope, now);
    var progress = Math.max(0, Number(bucket.progress[definition.id]) || 0);
    return {
      id: definition.id,
      scope: scope,
      title: definition.title,
      description: definition.description,
      metric: definition.metric,
      target: definition.target,
      progress: Math.min(definition.target, progress),
      complete: progress >= definition.target,
      claimed: bucket.claimed[definition.id] === true,
      reward: definition.reward,
      rewardLabel: rewardLabel(definition.reward),
      tracked: !!(missionRoot().tracked &&
        missionRoot().tracked.scope === scope &&
        missionRoot().tracked.id === definition.id)
    };
  }

  function runMetrics(stats) {
    stats = stats || {};
    return {
      runs: 1,
      victories: stats.result === "victory" ? 1 : 0,
      bossVictories: stats.result === "victory" && stats.bossDefeated ? 1 : 0,
      purified: Math.max(0, stats.purified | 0),
      mapCleaned: Math.max(0, stats.mapCleaned | 0),
      quizCorrect: Math.max(0, stats.quizCorrect | 0)
    };
  }

  function missionDelta(definition, metrics, stats) {
    var condition = definition.condition || {};
    if (condition.characterId && stats.characterId !== condition.characterId) return 0;
    if (condition.stageId && stats.stageId !== condition.stageId) return 0;
    if (condition.victory && stats.result !== "victory") return 0;
    if (condition.noDamage && !stats.noDamage) return 0;
    if (condition.terrainKind) {
      var terrain = stats.terrainSeconds || {};
      return Math.max(0, Math.floor(Number(terrain[condition.terrainKind]) || 0));
    }
    if (condition.requiresPlacedBuilding && !Object.keys(placedBuildingIds()).length) return 0;
    if (condition.buildingId && !placedBuildingIds()[condition.buildingId]) return 0;
    return Math.max(0, Number(metrics[definition.metric]) || 0);
  }

  function placedBuildingIds() {
    var lobby = global.Storage && global.Storage.getLobby ? global.Storage.getLobby() : null;
    var ids = {};
    ((lobby && lobby.buildings) || []).forEach(function (building) {
      if (building && building.placed !== false) ids[building.buildingId] = true;
    });
    return ids;
  }

  function challengeAvailability(definition) {
    var stage = global.GameData.getStage(definition.stageId);
    var character = definition.requiredCharacterId
      ? global.GameData.getCharacter(definition.requiredCharacterId) : null;
    var building = definition.requiredBuildingId
      ? global.GameData.getLobbyBuilding(definition.requiredBuildingId) : null;
    var stageUnlocked = !!stage && (!global.Storage.isStageUnlocked || global.Storage.isStageUnlocked(stage.id));
    var characterOwned = !definition.requiredCharacterId ||
      (global.Storage.isCharacterOwned && global.Storage.isCharacterOwned(definition.requiredCharacterId));
    var characterRental = !!definition.requiredCharacterId && !characterOwned;
    var selectedCharacter = global.App && global.App.selectedCharacterId;
    var characterSelected = !definition.requiredCharacterId || characterRental || selectedCharacter === definition.requiredCharacterId;
    var buildingPlaced = !definition.requiredBuildingId || !!placedBuildingIds()[definition.requiredBuildingId];
    var reasons = [];
    if (!stageUnlocked) reasons.push("尚未解鎖「" + (stage ? stage.name : "指定關卡") + "」");
    if (!characterSelected) reasons.push("請先選用「" + (character ? character.name : "指定角色") + "」");
    if (!buildingPlaced) reasons.push("大廳需擺放「" + (building ? building.name : "指定建築") + "」");
    return {
      ready: reasons.length === 0,
      reasons: reasons,
      stage: stage,
      character: character,
      building: building,
      stageUnlocked: stageUnlocked,
      characterOwned: characterOwned,
      characterRental: characterRental,
      characterSelected: characterSelected,
      buildingPlaced: buildingPlaced
    };
  }

  function challengeState(definition) {
    var root = missionRoot();
    var saved = root.challenges[definition.id] || {};
    var availability = challengeAvailability(definition);
    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      stageId: definition.stageId,
      stageName: availability.stage ? availability.stage.name : definition.stageId,
      requiredCharacterId: definition.requiredCharacterId || null,
      requiredCharacterName: availability.character ? availability.character.name : null,
      requiredBuildingId: definition.requiredBuildingId || null,
      requiredBuildingName: availability.building ? availability.building.name : null,
      goal: definition.goal || { victory: true },
      modifiers: definition.modifiers || {},
      modifierText: definition.modifierText || "",
      reward: definition.reward,
      rewardLabel: rewardLabel(definition.reward),
      ready: availability.ready,
      reasons: availability.reasons,
      completed: !!saved.completedAt,
      claimed: saved.claimed === true,
      completedAt: saved.completedAt || null,
      attempts: Math.max(0, saved.attempts | 0),
      best: saved.best || null,
      characterOwned: availability.characterOwned,
      characterRental: availability.characterRental,
      characterSelected: availability.characterSelected,
      buildingPlaced: availability.buildingPlaced,
      stageUnlocked: availability.stageUnlocked,
      goalResults: goalResultRows(definition.goal || {}, saved.best || null)
    };
  }

  function goalResultRows(goal, best) {
    goal = goal || {};
    best = best || {};
    var rows = [];
    if (goal.victory) rows.push({ label: "完成關卡", value: best.result === "victory" ? "已達成" : "未達成", met: best.result === "victory" });
    if (goal.mapCleaned) rows.push({ label: "清理數", value: Math.max(0, best.mapCleaned | 0) + " / " + goal.mapCleaned, met: (best.mapCleaned | 0) >= goal.mapCleaned });
    if (goal.purified) rows.push({ label: "淨化數", value: Math.max(0, best.purified | 0) + " / " + goal.purified, met: (best.purified | 0) >= goal.purified });
    if (goal.quizCorrect) rows.push({ label: "答對題數", value: Math.max(0, best.quizCorrect | 0) + " / " + goal.quizCorrect, met: (best.quizCorrect | 0) >= goal.quizCorrect });
    if (goal.noDamage) rows.push({ label: "全程無傷", value: best.noDamage ? "已達成" : "未達成", met: !!best.noDamage });
    return rows;
  }

  function goalSatisfied(definition, stats) {
    var goal = definition.goal || {};
    if (goal.victory && stats.result !== "victory") return false;
    if (goal.mapCleaned && (stats.mapCleaned | 0) < goal.mapCleaned) return false;
    if (goal.purified && (stats.purified | 0) < goal.purified) return false;
    if (goal.quizCorrect && (stats.quizCorrect | 0) < goal.quizCorrect) return false;
    if (goal.noDamage && !stats.noDamage) return false;
    return true;
  }

  var EnvironmentMissions = {
    dailyKey: dailyKey,
    weeklyKey: weeklyKey,

    getMissions: function (scope, now) {
      if (scope !== "weekly") scope = "daily";
      return activeDefinitions(scope, now).map(function (definition) {
        return missionState(scope, definition, now);
      });
    },

    getChallenges: function () {
      return ((global.GameData && global.GameData.challenges) || []).map(challengeState);
    },

    getChallengeState: function (id) {
      var definition = global.GameData && global.GameData.getChallenge ? global.GameData.getChallenge(id) : null;
      return definition ? challengeState(definition) : null;
    },

    getClaimableCount: function () {
      var count = 0;
      ["daily", "weekly"].forEach(function (scope) {
        count += EnvironmentMissions.getMissions(scope).filter(function (mission) {
          return mission.complete && !mission.claimed;
        }).length;
      });
      count += this.getChallenges().filter(function (challenge) {
        return challenge.completed && !challenge.claimed;
      }).length;
      return count;
    },

    getResetInfo: function (scope, now) {
      var current = now == null ? Date.now() : Number(now);
      var shifted = new Date(current + TAIWAN_OFFSET_MS);
      var next = new Date(shifted.getTime());
      next.setUTCHours(0, 0, 0, 0);
      if (scope === "weekly") {
        var weekday = shifted.getUTCDay() || 7;
        next.setUTCDate(shifted.getUTCDate() + (8 - weekday));
      } else {
        next.setUTCDate(shifted.getUTCDate() + 1);
      }
      var expiresAt = next.getTime() - TAIWAN_OFFSET_MS;
      return { expiresAt: expiresAt, remainingMs: Math.max(0, expiresAt - current) };
    },

    getTrackedMission: function () {
      var tracked = missionRoot().tracked;
      if (!tracked) return null;
      return this.getMissions(tracked.scope).find(function (mission) { return mission.id === tracked.id; }) || null;
    },

    toggleTrackedMission: function (scope, id) {
      if (scope !== "weekly") scope = "daily";
      var root = missionRoot();
      var same = root.tracked && root.tracked.scope === scope && root.tracked.id === id;
      root.tracked = same ? null : { scope: scope, id: id };
      if (global.Storage.save) global.Storage.save();
      return root.tracked;
    },

    recordRun: function (stats) {
      var metrics = runMetrics(stats);
      var changed = [];
      ["daily", "weekly"].forEach(function (scope) {
        var bucket = ensurePeriod(scope, null, false);
        activeDefinitions(scope).forEach(function (definition) {
          var delta = missionDelta(definition, metrics, stats || {});
          if (!delta) return;
          var before = Math.max(0, Number(bucket.progress[definition.id]) || 0);
          var next = Math.min(definition.target, before + delta);
          if (next !== before) {
            bucket.progress[definition.id] = next;
            changed.push(scope + ":" + definition.id);
          }
        });
      });
      if (changed.length && global.Storage.save) global.Storage.save();
      return { changed: changed, claimable: this.getClaimableCount() };
    },

    claimMission: function (scope, id) {
      if (scope !== "weekly") scope = "daily";
      var definition = global.GameData.getEnvironmentMission(scope, id);
      if (!definition) return { ok: false, reason: "not_found" };
      var bucket = ensurePeriod(scope);
      var state = missionState(scope, definition);
      if (!state.complete) return { ok: false, reason: "incomplete" };
      if (state.claimed) return { ok: false, reason: "claimed" };
      bucket.claimed[id] = true;
      grantReward(definition.reward);
      return { ok: true, reward: definition.reward, rewardLabel: rewardLabel(definition.reward) };
    },

    claimAll: function () {
      var rewards = [];
      ["daily", "weekly"].forEach(function (scope) {
        EnvironmentMissions.getMissions(scope).forEach(function (mission) {
          if (!mission.complete || mission.claimed) return;
          var result = EnvironmentMissions.claimMission(scope, mission.id);
          if (result.ok) rewards.push(result);
        });
      });
      EnvironmentMissions.getChallenges().forEach(function (challenge) {
        if (!challenge.completed || challenge.claimed) return;
        var result = EnvironmentMissions.claimChallenge(challenge.id);
        if (result.ok) rewards.push(result);
      });
      return { ok: rewards.length > 0, count: rewards.length, rewards: rewards };
    },

    recordChallenge: function (challengeId, stats) {
      var definition = global.GameData && global.GameData.getChallenge ? global.GameData.getChallenge(challengeId) : null;
      if (!definition) return { ok: false, reason: "not_found" };
      var root = missionRoot();
      var saved = root.challenges[challengeId] || (root.challenges[challengeId] = {});
      saved.attempts = Math.max(0, saved.attempts | 0) + 1;
      var previousBest = saved.best || {};
      saved.best = {
        result: previousBest.result === "victory" || stats.result === "victory" ? "victory" : stats.result,
        survived: Math.max(Number(saved.best && saved.best.survived) || 0, Number(stats.survived) || 0),
        purified: Math.max(Number(saved.best && saved.best.purified) || 0, Number(stats.purified) || 0),
        mapCleaned: Math.max(Number(saved.best && saved.best.mapCleaned) || 0, Number(stats.mapCleaned) || 0),
        quizCorrect: Math.max(Number(saved.best && saved.best.quizCorrect) || 0, Number(stats.quizCorrect) || 0),
        noDamage: !!(previousBest.noDamage || stats.noDamage)
      };
      var complete = goalSatisfied(definition, stats);
      var firstCompletion = complete && !saved.completedAt;
      if (firstCompletion) saved.completedAt = Date.now();
      global.Storage.save();
      return { ok: true, complete: complete, firstCompletion: firstCompletion, state: challengeState(definition) };
    },

    claimChallenge: function (id) {
      var definition = global.GameData && global.GameData.getChallenge ? global.GameData.getChallenge(id) : null;
      if (!definition) return { ok: false, reason: "not_found" };
      var root = missionRoot();
      var saved = root.challenges[id] || {};
      if (!saved.completedAt) return { ok: false, reason: "incomplete" };
      if (saved.claimed === true) return { ok: false, reason: "claimed" };
      saved.claimed = true;
      root.challenges[id] = saved;
      grantReward(definition.reward);
      return { ok: true, reward: definition.reward, rewardLabel: rewardLabel(definition.reward) };
    },

    validateChallengeStart: function (id) {
      var state = this.getChallengeState(id);
      if (!state) return { ok: false, reason: "not_found", reasons: ["找不到挑戰"] };
      return { ok: state.ready, reason: state.ready ? null : "requirements", reasons: state.reasons, state: state };
    },

    goalText: function (goal) {
      goal = goal || {};
      var parts = [];
      if (goal.victory) parts.push("完成關卡");
      if (goal.mapCleaned) parts.push("清理 " + goal.mapCleaned + " 個回收物");
      if (goal.purified) parts.push("淨化 " + goal.purified + " 個污染物");
      if (goal.quizCorrect) parts.push("答對 " + goal.quizCorrect + " 題");
      if (goal.noDamage) parts.push("全程無傷");
      return parts.join("、") || "完成挑戰";
    },

    rewardLabel: rewardLabel
  };

  global.EnvironmentMissions = EnvironmentMissions;
})(window);
