/* ============================================================
   storage.js  —  存檔（localStorage）
   保存：循環幣總額、商店升級等級、已解鎖知識、目前選用角色、音量設定。
   以 try/catch 包裹，讓 file:// 下若無法存取也能照常遊玩。
   ============================================================ */
(function (global) {
  var KEY = "senloop_save_v1";
  var PRODUCTION_STARTING_COINS = 200;
  var QA_STARTING_COINS = 1000000;
  var STARTING_RECYCLED = 10; // 新手可立即完成第一個小型裝飾建造
  var OFFICIAL_CHARACTER_IDS = ["ranger", "beachcomber", "solar", "mechanic", "chemist"];

  function isQaSession() {
    if (global.TestMode && global.TestMode.enabled) return true;
    try { return new URLSearchParams(global.location.search).get("test") === "1"; }
    catch (error) { return false; }
  }

  function startingCoins() {
    return isQaSession() ? QA_STARTING_COINS : PRODUCTION_STARTING_COINS;
  }

  function learningEventId(prefix) {
    if (global.crypto && global.crypto.randomUUID) return String(prefix || "event") + "-" + global.crypto.randomUUID();
    return String(prefix || "event") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }

  function normalizeLearningEvent(value) {
    if (!isRecord(value)) return null;
    var kind = String(value.kind || "");
    if (["stage_clear", "quiz_answer", "correction"].indexOf(kind) === -1) return null;
    var id = String(value.id || "").slice(0, 80);
    var subjectId = String(value.subjectId || "").slice(0, 80);
    if (!id || !subjectId) return null;
    var occurredAt = new Date(value.occurredAt || Date.now());
    if (!isFinite(occurredAt.getTime())) occurredAt = new Date();
    return {
      id: id,
      kind: kind,
      subjectId: subjectId,
      correct: value.correct === true,
      amount: Math.max(1, Math.min(value.legacy === true ? 100 : 1, nonNegativeInteger(value.amount) || 1)),
      legacy: value.legacy === true,
      occurredAt: occurredAt.toISOString()
    };
  }

  function appendLearningEvent(root, value) {
    if (!isRecord(root)) return null;
    if (!Array.isArray(root.queue)) root.queue = [];
    var event = normalizeLearningEvent(value);
    if (!event || root.queue.some(function (entry) { return entry.id === event.id; })) return null;
    root.queue.push(event);
    if (root.queue.length > 500) root.queue.splice(0, root.queue.length - 500);
    return event;
  }
  var PREFERENCE_DEFAULTS = {
    quality: "balanced",
    reduceAnimations: false,
    skipSeenEnemyIntros: true,
    floatingJoystick: true,
    haptics: true,
    textSize: "normal",
    colorMode: "default",
    keyLayout: "wasd",
    touchSensitivity: 100
  };

  function normalizePreferences(value) {
    var source = isRecord(value) ? value : {};
    var preferences = {};
    preferences.quality = ["high", "balanced", "performance"].indexOf(source.quality) !== -1
      ? source.quality : PREFERENCE_DEFAULTS.quality;
    preferences.reduceAnimations = source.reduceAnimations === true;
    preferences.skipSeenEnemyIntros = source.skipSeenEnemyIntros !== false;
    preferences.floatingJoystick = source.floatingJoystick !== false;
    preferences.haptics = source.haptics !== false;
    preferences.textSize = ["normal", "large", "xlarge"].indexOf(source.textSize) !== -1
      ? source.textSize : PREFERENCE_DEFAULTS.textSize;
    preferences.colorMode = ["default", "deuteranopia", "protanopia", "tritanopia"].indexOf(source.colorMode) !== -1
      ? source.colorMode : PREFERENCE_DEFAULTS.colorMode;
    preferences.keyLayout = ["wasd", "arrows", "ijkl"].indexOf(source.keyLayout) !== -1
      ? source.keyLayout : PREFERENCE_DEFAULTS.keyLayout;
    var sensitivity = Math.round(Number(source.touchSensitivity));
    preferences.touchSensitivity = Number.isFinite(sensitivity)
      ? Math.max(50, Math.min(150, sensitivity))
      : PREFERENCE_DEFAULTS.touchSensitivity;
    return preferences;
  }

  function normalizeCharacterId(id) {
    if (!id) return "ranger";
    if (global.GameData && global.GameData.resolveCharacterId) return global.GameData.resolveCharacterId(id);
    if (id === "solar_engineer") return "solar";
    return id;
  }

  function normalizeEnemyId(id) {
    if (!id) return null;
    if (global.GameData && global.GameData.resolveEnemyId) return global.GameData.resolveEnemyId(id);
    return String(id);
  }

  function achievementCharacterId(id) {
    if (id && typeof id === "object") id = id.id || id.characterId;
    if (!id) return null;
    var skin = global.GameData && global.GameData.getSkin ? global.GameData.getSkin(id) : null;
    if (skin && skin.characterId) id = skin.characterId;
    id = normalizeCharacterId(id);
    if (OFFICIAL_CHARACTER_IDS.indexOf(id) === -1) return null;
    if (global.GameData && global.GameData.getCharacter && !global.GameData.getCharacter(id)) return null;
    return id;
  }

  function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function nonNegativeInteger(value) {
    value = Number(value);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  function achievementDefaults() {
    return {
      version: 1,
      metrics: {
        completedRuns: 0,
        victories: 0,
        totalDamageDealt: 0,
        bestRunDamage: 0,
        totalDamageTaken: 0,
        bestRunPurified: 0,
        bestQuizStreak: 0,
        clearsByCharacter: {},
        flawlessStages: {}
      },
      progress: {},
      unlocked: {},
      claimed: {}
    };
  }

  function normalizeAchievementData(value) {
    var source = value;
    var data = achievementDefaults();
    var defaults = achievementDefaults();

    // 最早的測試存檔可能是 ID 陣列；將它們視為已解鎖、尚未領取。
    if (Array.isArray(source)) {
      source.forEach(function (entry) {
        var id = typeof entry === "string" ? entry : (entry && entry.id);
        if (!id) return;
        data.unlocked[id] = { at: null, runCharacterId: null };
        if (entry && typeof entry === "object" && entry.claimed) {
          data.claimed[id] = { at: entry.claimedAt || null, targetCharacterId: null };
        }
      });
      source = {};
    }
    if (!isRecord(source)) source = {};

    var sourceMetrics = isRecord(source.metrics) ? source.metrics : {};
    Object.keys(defaults.metrics).forEach(function (key) {
      if (key === "clearsByCharacter" || key === "flawlessStages") {
        data.metrics[key] = isRecord(sourceMetrics[key]) ? sourceMetrics[key] : {};
      } else {
        var numberValue = Number(sourceMetrics[key]);
        data.metrics[key] = Number.isFinite(numberValue) ? Math.max(0, numberValue) : 0;
      }
    });

    function addProgress(id, raw) {
      if (!id) return;
      if (raw && typeof raw === "object") raw = raw.progress;
      raw = Number(raw);
      if (Number.isFinite(raw)) data.progress[id] = Math.max(0, raw);
    }

    function addMarker(target, id, raw, kind) {
      if (!id || !raw) return;
      var marker = { at: null };
      if (isRecord(raw)) {
        marker.at = raw.at || raw[kind + "At"] || null;
        if (kind === "unlocked") marker.runCharacterId = achievementCharacterId(raw.runCharacterId);
        if (kind === "claimed") marker.targetCharacterId = achievementCharacterId(raw.targetCharacterId);
      } else if (typeof raw === "number" || typeof raw === "string") {
        marker.at = raw;
      }
      if (kind === "unlocked" && !("runCharacterId" in marker)) marker.runCharacterId = null;
      if (kind === "claimed" && !("targetCharacterId" in marker)) marker.targetCharacterId = null;
      target[id] = marker;
    }

    function importMap(raw, callback) {
      if (Array.isArray(raw)) {
        raw.forEach(function (entry) {
          var id = typeof entry === "string" ? entry : (entry && entry.id);
          if (id) callback(id, entry);
        });
        return;
      }
      if (!isRecord(raw)) return;
      Object.keys(raw).forEach(function (id) { callback(id, raw[id]); });
    }

    importMap(source.progress || source.achievementProgress, addProgress);
    importMap(source.unlocked || source.unlockedAchievements, function (id, raw) {
      addMarker(data.unlocked, id, raw, "unlocked");
    });
    importMap(source.claimed || source.claimedAchievements, function (id, raw) {
      addMarker(data.claimed, id, raw, "claimed");
    });

    // 兼容曾經使用 achievements[id] = { progress, unlocked, claimed } 的平面格式。
    var reserved = {
      version: true, metrics: true, progress: true, unlocked: true, claimed: true,
      achievementProgress: true, unlockedAchievements: true, claimedAchievements: true
    };
    Object.keys(source).forEach(function (id) {
      if (reserved[id] || !isRecord(source[id])) return;
      var state = source[id];
      addProgress(id, state.progress);
      if (state.unlocked || state.unlockedAt) {
        addMarker(data.unlocked, id, state.unlocked === true ? {
          unlockedAt: state.unlockedAt,
          runCharacterId: state.runCharacterId
        } : state.unlocked, "unlocked");
      }
      if (state.claimed || state.claimedAt) {
        addMarker(data.claimed, id, state.claimed === true ? {
          claimedAt: state.claimedAt,
          targetCharacterId: state.targetCharacterId
        } : state.claimed, "claimed");
      }
    });

    data.version = 1;
    return data;
  }

  var Storage = {
    data: null,
    _suppressEvents: false,

    /* -------- 大廳（schema 4 新增；v1.5 升至 lobby version 5）預設值 -------- */
    _defaultLobby: function () {
      return {
        version: 5,
        playerPosition: { x: 0, y: 0, direction: "S" },   /* 0,0 = 尚未存過 → 用出生點 */
        guideCompleted: false,
        placementHelpCompleted: false,
        materials: { recycled: STARTING_RECYCLED },
        daily: { dateKey: null, idleEarned: 0, dailyBossClaims: {} },
        recycleGenerator: {
          unclaimed: 1,
          lastAccruedAt: Date.now(),
          lastClaimedAt: null,
          capacity: 60
        },
        inventory: {},          /* { buildingId: 數量 }（已購買但收納中） */
        buildings: [],          /* { instanceId, buildingId, x, y, rotation, level, placed } */
        orphanedBuildings: [],  /* 未知 building id 先移到這裡，不直接刪除 */
        nextInstanceId: 1,
        land: {
          expansionLevel: 0,
          expandedAt: {}
        },
        spaces: {
          cottage: { visits: 0, lastRestDate: null, restClaims: 0 },
          laboratory: { visits: 0, research: { recycleSpeed: 0, recycleCapacity: 0 } },
          recycleYard: { visits: 0, dateKey: null, playsToday: 0, bestScore: 0, totalSorted: 0, activeGame: null }
        }
      };
    },

    /* 大廳存檔清洗：舊存檔補預設、未知建築移入 orphanedBuildings、數值防呆 */
    _normalizeLobby: function (raw) {
      var def = this._defaultLobby();
      if (!isRecord(raw)) return def;
      var out = def;
      var sourceVersion = nonNegativeInteger(raw.version);
      var legacyYScale = sourceVersion < 2 ? (1000 / 900) : 1;
      if (isRecord(raw.playerPosition)) {
        out.playerPosition.x = Number(raw.playerPosition.x) || 0;
        out.playerPosition.y = Math.round((Number(raw.playerPosition.y) || 0) * legacyYScale);
        if (typeof raw.playerPosition.direction === "string") out.playerPosition.direction = raw.playerPosition.direction;
      }
      out.guideCompleted = raw.guideCompleted === true;
      out.placementHelpCompleted = raw.placementHelpCompleted === true;
      if (isRecord(raw.materials)) out.materials.recycled = nonNegativeInteger(raw.materials.recycled);
      if (isRecord(raw.daily)) {
        out.daily.dateKey = typeof raw.daily.dateKey === "string" ? raw.daily.dateKey : null;
        out.daily.idleEarned = nonNegativeInteger(raw.daily.idleEarned);
        if (isRecord(raw.daily.dailyBossClaims)) out.daily.dailyBossClaims = raw.daily.dailyBossClaims;
      }
      if (isRecord(raw.recycleGenerator)) {
        out.recycleGenerator.unclaimed = Math.min(60, nonNegativeInteger(raw.recycleGenerator.unclaimed));
        var accruedAt = Number(raw.recycleGenerator.lastAccruedAt);
        out.recycleGenerator.lastAccruedAt = Number.isFinite(accruedAt) && accruedAt > 0 ? accruedAt : Date.now();
        var claimedAt = Number(raw.recycleGenerator.lastClaimedAt);
        out.recycleGenerator.lastClaimedAt = Number.isFinite(claimedAt) && claimedAt > 0 ? claimedAt : null;
        out.recycleGenerator.capacity = 60;
      } else {
        /* 舊版收益已直接進入錢包；遷移時不重複發放。 */
        out.recycleGenerator.unclaimed = 0;
        out.recycleGenerator.lastAccruedAt = Date.now();
      }
      if (isRecord(raw.inventory)) {
        Object.keys(raw.inventory).forEach(function (id) {
          var n = nonNegativeInteger(raw.inventory[id]);
          if (n > 0) out.inventory[id] = n;
        });
      }
      var maxInstance = 0;
      var known = function (id) {
        return !!(global.GameData && global.GameData.getLobbyBuilding && global.GameData.getLobbyBuilding(id));
      };
      if (Array.isArray(raw.orphanedBuildings)) {
        raw.orphanedBuildings.forEach(function (inst) {
          if (!isRecord(inst)) return;
          /* 資料表補回該建築後，自動從孤兒區還原 */
          if (known(inst.buildingId)) {
            var restored = Object.assign({}, inst);
            restored.y = Math.round((Number(restored.y) || 0) * legacyYScale);
            out.buildings.push(restored);
          }
          else out.orphanedBuildings.push(inst);
        });
      }
      if (Array.isArray(raw.buildings)) {
        raw.buildings.forEach(function (inst) {
          if (!isRecord(inst) || !inst.buildingId) return;
          if (!known(inst.buildingId)) { out.orphanedBuildings.push(inst); return; }
          var defBld = global.GameData.getLobbyBuilding(inst.buildingId);
          var rotation = [0, 90, 180, 270].indexOf(inst.rotation | 0) !== -1 ? (inst.rotation | 0) : 0;
          if (defBld.rotations && defBld.rotations.indexOf(rotation) === -1) rotation = defBld.rotations[0] || 0;
          out.buildings.push({
            instanceId: typeof inst.instanceId === "string" ? inst.instanceId : ("building-" + (++maxInstance)),
            buildingId: inst.buildingId,
            x: Number(inst.x) || 0,
            y: Math.round((Number(inst.y) || 0) * legacyYScale),
            rotation: rotation,
            level: Math.max(1, inst.level | 0),
            placed: inst.placed !== false
          });
        });
      }
      out.buildings.forEach(function (inst) {
        var m = /^building-(\d+)$/.exec(inst.instanceId || "");
        if (m) maxInstance = Math.max(maxInstance, Number(m[1]) || 0);
      });
      out.nextInstanceId = Math.max(nonNegativeInteger(raw.nextInstanceId), maxInstance + 1, 1);
      if (isRecord(raw.land)) {
        out.land.expansionLevel = Math.max(0, Math.min(2, nonNegativeInteger(raw.land.expansionLevel)));
        if (isRecord(raw.land.expandedAt)) {
          ["1", "2"].forEach(function (level) {
            var at = Number(raw.land.expandedAt[level]);
            if (Number.isFinite(at) && at > 0) out.land.expandedAt[level] = at;
          });
        }
      } else if (sourceVersion > 0 && sourceVersion < 5) {
        /* v1.4 可在外圍放置建築；若舊存檔已有外圍配置，直接保留完整土地權限。 */
        var usedOuterLand = out.buildings.some(function (inst) {
          return inst.x < 360 || inst.x > 1160 || inst.y < 210 || inst.y > 840;
        });
        out.land.expansionLevel = usedOuterLand ? 2 : 0;
      }
      if (isRecord(raw.spaces)) {
        var cottage = isRecord(raw.spaces.cottage) ? raw.spaces.cottage : {};
        out.spaces.cottage.visits = nonNegativeInteger(cottage.visits);
        out.spaces.cottage.lastRestDate = typeof cottage.lastRestDate === "string" ? cottage.lastRestDate : null;
        out.spaces.cottage.restClaims = nonNegativeInteger(cottage.restClaims);
        var laboratory = isRecord(raw.spaces.laboratory) ? raw.spaces.laboratory : {};
        out.spaces.laboratory.visits = nonNegativeInteger(laboratory.visits);
        var research = isRecord(laboratory.research) ? laboratory.research : {};
        out.spaces.laboratory.research.recycleSpeed = Math.min(2, nonNegativeInteger(research.recycleSpeed));
        out.spaces.laboratory.research.recycleCapacity = Math.min(2, nonNegativeInteger(research.recycleCapacity));
        var yard = isRecord(raw.spaces.recycleYard) ? raw.spaces.recycleYard : {};
        out.spaces.recycleYard.visits = nonNegativeInteger(yard.visits);
        out.spaces.recycleYard.dateKey = typeof yard.dateKey === "string" ? yard.dateKey : null;
        out.spaces.recycleYard.playsToday = Math.min(3, nonNegativeInteger(yard.playsToday));
        out.spaces.recycleYard.bestScore = Math.min(5, nonNegativeInteger(yard.bestScore));
        out.spaces.recycleYard.totalSorted = nonNegativeInteger(yard.totalSorted);
        if (isRecord(yard.activeGame) && Array.isArray(yard.activeGame.itemIds) && yard.activeGame.itemIds.length === 5) {
          var itemIds = yard.activeGame.itemIds.map(function (id) { return String(id || "").slice(0, 40); });
          if (itemIds.every(Boolean)) {
            out.spaces.recycleYard.activeGame = {
              itemIds: itemIds,
              index: Math.min(4, nonNegativeInteger(yard.activeGame.index)),
              correct: Math.min(5, nonNegativeInteger(yard.activeGame.correct)),
              awaitingNext: yard.activeGame.awaitingNext === true,
              feedbackCorrect: typeof yard.activeGame.feedbackCorrect === "boolean" ? yard.activeGame.feedbackCorrect : null
            };
          }
        }
      }
      return out;
    },

    _default: function () {
      return {
        schemaVersion: 12,
        saveMeta: { revision: 1, updatedAt: Date.now(), createdAt: Date.now() },
        coins: startingCoins(),
        shop: {},        // { upgradeId: level }
        knowledge: [],   // 已解鎖的 knowledge id
        ownedCharacters: { ranger: true, beachcomber: true, solar: false, mechanic: false, chemist: false },
        ownedSkins: [],
        equippedSkins: {},
        characterProgress: {},
        gachaHistory: [],
        gachaPity: { sinceNew: 0, totalPulls: 0, guaranteeAt: 10 },
        selectedCharacterId: "ranger",
        lastChar: "ranger",
        selectedStageId: "tidal_flat",
        clearedStages: [],
        encounteredEnemies: [],
        achievements: achievementDefaults(),
        environmentMissions: {
          version: 2,
          daily: { periodKey: null, activeIds: [], previousIds: [], progress: {}, claimed: {} },
          weekly: { periodKey: null, activeIds: [], previousIds: [], progress: {}, claimed: {} },
          challenges: {},
          tracked: null
        },
        tutorial: {
          version: 1,
          active: false,
          completed: false,
          skipped: false,
          stepId: "move",
          completedSteps: [],
          startedAt: null,
          completedAt: null
        },
        questionProgress: { version: 1, byId: {} },
        learningEvents: { version: 1, queue: [] },
        lobby: this._defaultLobby(),
        // 音量設定（0~100；mute 為布林）—— 單一來源，audioManager 由此讀寫
        audio: { master: 80, music: 70, sfx: 80, mute: false },
        preferences: normalizePreferences(null)
      };
    },

    load: function () {
      var d = null;
      try {
        var raw = global.localStorage.getItem(KEY);
        if (raw) d = JSON.parse(raw);
      } catch (e) { d = null; }
      if (!d || typeof d !== "object") d = this._default();
      var savedSchemaVersion = d.schemaVersion | 0;
      // 舊存檔只在升到 schema 3 前補足一次目前環境的初始資源。
      var requiresCoinTopUp = savedSchemaVersion < 3;
      var requiresLobbySave = !isRecord(d.lobby) || nonNegativeInteger(d.lobby.version) < 5;
      var requiresSchemaSave = savedSchemaVersion < 12 || requiresLobbySave;
      // 補齊缺漏欄位（含舊存檔沒有的 audio）
      var def = this._default();
      var legacyCharacterSave = !d.ownedCharacters || typeof d.ownedCharacters !== "object";
      for (var k in def) { if (!(k in d)) d[k] = def[k]; }
      if (!d.shop || typeof d.shop !== "object") d.shop = {};
      if (d.shop.recycling_sort != null && d.shop.recycle_sort == null) d.shop.recycle_sort = d.shop.recycling_sort;
      if (d.shop.rainwater != null && d.shop.rainwater_harvest == null) d.shop.rainwater_harvest = d.shop.rainwater;
      if (!d.selectedCharacterId && d.lastChar) d.selectedCharacterId = d.lastChar;
      if (!d.lastChar && d.selectedCharacterId) d.lastChar = d.selectedCharacterId;
      d.selectedCharacterId = normalizeCharacterId(d.selectedCharacterId);
      d.lastChar = normalizeCharacterId(d.lastChar);
      if (!d.ownedCharacters || typeof d.ownedCharacters !== "object") d.ownedCharacters = {};
      var characterIds = OFFICIAL_CHARACTER_IDS.slice();
      characterIds.forEach(function (id, index) {
        if (typeof d.ownedCharacters[id] !== "boolean") d.ownedCharacters[id] = index < 2;
      });
      // 舊版所有角色皆可直接選；遷移時保留玩家當時正在使用的後期角色。
      if (legacyCharacterSave && d.selectedCharacterId) d.ownedCharacters[d.selectedCharacterId] = true;
      if (!Array.isArray(d.ownedSkins)) d.ownedSkins = [];
      d.ownedSkins = d.ownedSkins.filter(function (id, index, all) {
        return !!(global.GameData && global.GameData.getSkin && global.GameData.getSkin(id)) && all.indexOf(id) === index;
      });
      if (!d.equippedSkins || typeof d.equippedSkins !== "object") d.equippedSkins = {};
      if (!d.characterProgress || typeof d.characterProgress !== "object") d.characterProgress = {};
      characterIds.forEach(function (id) {
        var progress = d.characterProgress[id];
        if (!progress || typeof progress !== "object") progress = d.characterProgress[id] = {};
        progress.availablePoints = Math.max(0, progress.availablePoints | 0);
        if (!progress.stats || typeof progress.stats !== "object") progress.stats = {};
        ["attack", "speed", "hp"].forEach(function (stat) {
          progress.stats[stat] = Math.max(0, progress.stats[stat] | 0);
        });
      });
      Object.keys(d.equippedSkins).forEach(function (characterId) {
        var skin = global.GameData && global.GameData.getSkin ? global.GameData.getSkin(d.equippedSkins[characterId]) : null;
        if (!skin || skin.characterId !== characterId || d.ownedSkins.indexOf(skin.id) === -1) delete d.equippedSkins[characterId];
      });
      if (!Array.isArray(d.gachaHistory)) d.gachaHistory = [];
      d.gachaHistory = d.gachaHistory.slice(0, 30);
      if (!isRecord(d.gachaPity)) d.gachaPity = {};
      d.gachaPity.sinceNew = nonNegativeInteger(d.gachaPity.sinceNew);
      d.gachaPity.totalPulls = nonNegativeInteger(d.gachaPity.totalPulls);
      d.gachaPity.guaranteeAt = 10;
      if (!Array.isArray(d.clearedStages)) d.clearedStages = [];
      if (!Array.isArray(d.encounteredEnemies)) d.encounteredEnemies = [];
      if (!isRecord(d.environmentMissions)) d.environmentMissions = def.environmentMissions;
      if (!isRecord(d.environmentMissions.daily)) {
        d.environmentMissions.daily = { periodKey: null, activeIds: [], previousIds: [], progress: {}, claimed: {} };
      }
      if (!isRecord(d.environmentMissions.weekly)) {
        d.environmentMissions.weekly = { periodKey: null, activeIds: [], previousIds: [], progress: {}, claimed: {} };
      }
      if (!Array.isArray(d.environmentMissions.daily.activeIds)) d.environmentMissions.daily.activeIds = [];
      if (!Array.isArray(d.environmentMissions.daily.previousIds)) d.environmentMissions.daily.previousIds = [];
      if (!Array.isArray(d.environmentMissions.weekly.activeIds)) d.environmentMissions.weekly.activeIds = [];
      if (!Array.isArray(d.environmentMissions.weekly.previousIds)) d.environmentMissions.weekly.previousIds = [];
      if (!isRecord(d.environmentMissions.daily.progress)) d.environmentMissions.daily.progress = {};
      if (!isRecord(d.environmentMissions.daily.claimed)) d.environmentMissions.daily.claimed = {};
      if (!isRecord(d.environmentMissions.weekly.progress)) d.environmentMissions.weekly.progress = {};
      if (!isRecord(d.environmentMissions.weekly.claimed)) d.environmentMissions.weekly.claimed = {};
      if (!isRecord(d.environmentMissions.challenges)) d.environmentMissions.challenges = {};
      if (!isRecord(d.environmentMissions.tracked)) d.environmentMissions.tracked = null;
      d.environmentMissions.version = 2;
      if (!isRecord(d.tutorial)) d.tutorial = def.tutorial;
      d.tutorial.version = 1;
      d.tutorial.active = d.tutorial.active === true;
      d.tutorial.completed = d.tutorial.completed === true;
      d.tutorial.skipped = d.tutorial.skipped === true;
      d.tutorial.stepId = typeof d.tutorial.stepId === "string" ? d.tutorial.stepId : "move";
      d.tutorial.completedSteps = Array.isArray(d.tutorial.completedSteps)
        ? d.tutorial.completedSteps.filter(function (id, index, all) { return typeof id === "string" && all.indexOf(id) === index; })
        : [];
      d.tutorial.startedAt = Number(d.tutorial.startedAt) || null;
      d.tutorial.completedAt = Number(d.tutorial.completedAt) || null;
      if (savedSchemaVersion < 9 && d.lobby && d.lobby.guideCompleted === true) {
        d.tutorial.completed = true;
        d.tutorial.active = false;
      }
      if (!isRecord(d.questionProgress)) d.questionProgress = { version: 1, byId: {} };
      if (!isRecord(d.questionProgress.byId)) d.questionProgress.byId = {};
      Object.keys(d.questionProgress.byId).forEach(function (id) {
        var progress = d.questionProgress.byId[id];
        if (!isRecord(progress)) { delete d.questionProgress.byId[id]; return; }
        progress.attempts = nonNegativeInteger(progress.attempts);
        progress.correctCount = nonNegativeInteger(progress.correctCount);
        progress.wrongCount = nonNegativeInteger(progress.wrongCount);
        progress.lastSelected = Number.isFinite(Number(progress.lastSelected)) ? Number(progress.lastSelected) : null;
        progress.lastCorrect = progress.lastCorrect === true;
        progress.firstAnsweredAt = Number(progress.firstAnsweredAt) || null;
        progress.lastAnsweredAt = Number(progress.lastAnsweredAt) || null;
        progress.correctedAt = Number(progress.correctedAt) || null;
      });
      d.questionProgress.version = 1;
      var hadLearningEvents = isRecord(d.learningEvents);
      if (!hadLearningEvents) d.learningEvents = { version: 1, queue: [] };
      if (!Array.isArray(d.learningEvents.queue)) d.learningEvents.queue = [];
      d.learningEvents.queue = d.learningEvents.queue.map(normalizeLearningEvent).filter(Boolean).slice(-500);
      d.learningEvents.version = 1;
      if (!hadLearningEvents) {
        (d.clearedStages || []).forEach(function (stageId) {
          appendLearningEvent(d.learningEvents, {
            id: "legacy-stage-" + String(stageId).replace(/[^a-z0-9_-]/gi, "-").slice(0, 60),
            kind: "stage_clear", subjectId: stageId, amount: 1, legacy: true,
            occurredAt: d.saveMeta && d.saveMeta.updatedAt || Date.now()
          });
        });
        Object.keys(d.questionProgress.byId).forEach(function (questionId) {
          var questionState = d.questionProgress.byId[questionId] || {};
          if (questionState.attempts > 0) appendLearningEvent(d.learningEvents, {
            id: "legacy-quiz-" + String(questionId).replace(/[^a-z0-9_-]/gi, "-").slice(0, 61),
            kind: "quiz_answer", subjectId: questionId, correct: questionState.lastCorrect === true,
            amount: questionState.attempts, legacy: true, occurredAt: questionState.lastAnsweredAt || Date.now()
          });
          if (questionState.correctedAt) appendLearningEvent(d.learningEvents, {
            id: "legacy-correction-" + String(questionId).replace(/[^a-z0-9_-]/gi, "-").slice(0, 55),
            kind: "correction", subjectId: questionId, correct: true,
            amount: 1, legacy: true, occurredAt: questionState.correctedAt
          });
        });
      }
      if (!isRecord(d.saveMeta)) d.saveMeta = def.saveMeta;
      d.saveMeta.revision = Math.max(1, nonNegativeInteger(d.saveMeta.revision));
      d.saveMeta.createdAt = Number(d.saveMeta.createdAt) || Number(d.saveMeta.updatedAt) || Date.now();
      d.saveMeta.updatedAt = Number(d.saveMeta.updatedAt) || d.saveMeta.createdAt;
      var normalizedEnemyIds = [];
      function rememberEnemy(id) {
        id = normalizeEnemyId(id);
        if (!id || normalizedEnemyIds.indexOf(id) !== -1) return;
        if (global.GameData && global.GameData.getEnemy && !global.GameData.getEnemy(id)) return;
        normalizedEnemyIds.push(id);
      }
      d.encounteredEnemies.forEach(rememberEnemy);
      // schema 5：舊存檔已通關的關卡視為曾遭遇其中敵人，保留既有探索成果。
      if (savedSchemaVersion < 5 && global.GameData && Array.isArray(global.GameData.stages)) {
        global.GameData.stages.forEach(function (stage) {
          if (d.clearedStages.indexOf(stage.id) === -1) return;
          (stage.fallbackEnemies || []).forEach(rememberEnemy);
          (stage.waves || []).forEach(function (wave) {
            (wave.types || []).forEach(function (entry) { rememberEnemy(entry.enemy); });
          });
          (stage.events || []).forEach(function (event) { rememberEnemy(event.enemy); });
          rememberEnemy(stage.bossId);
        });
      }
      d.encounteredEnemies = normalizedEnemyIds;
      // QA 保留大量測試幣；正式玩家只補到正式起始值，避免測試數值污染經濟。
      if (requiresCoinTopUp) d.coins = Math.max(nonNegativeInteger(d.coins), startingCoins());
      // schema 4：大廳存檔。舊存檔沒有 lobby 時補預設值；
      // schema 5：污染物遭遇圖鑑。兩者皆不改角色、經濟與關卡解鎖。
      d.lobby = this._normalizeLobby(d.lobby);
      d.schemaVersion = 12;
      d.achievements = normalizeAchievementData(d.achievements);
      if (!d.selectedStageId || !global.GameData || !global.GameData.getStage || !global.GameData.getStage(d.selectedStageId)) {
        d.selectedStageId = "tidal_flat";
      }
      // audio 子欄位也補齊
      if (!d.audio || typeof d.audio !== "object") d.audio = def.audio;
      for (var ak in def.audio) { if (!(ak in d.audio)) d.audio[ak] = def.audio[ak]; }
      d.preferences = normalizePreferences(d.preferences);
      this.data = d;
      if (requiresSchemaSave) this.save({ preserveRevision: true, source: "migration" });
      return d;
    },

    save: function (options) {
      options = options || {};
      if (!this.data) return;
      if (!isRecord(this.data.saveMeta)) this.data.saveMeta = { revision: 1, updatedAt: Date.now(), createdAt: Date.now() };
      if (!options.preserveRevision) {
        this.data.saveMeta.revision = Math.max(1, (this.data.saveMeta.revision | 0) + 1);
        this.data.saveMeta.updatedAt = Date.now();
      }
      try {
        global.localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch (e) { /* file:// 或隱私模式可能失敗，靜默忽略 */ }
      if (!options.silentEvent && !this._suppressEvents) {
        try {
          global.dispatchEvent(new CustomEvent("game-save-changed", {
            detail: {
              revision: this.data.saveMeta.revision,
              updatedAt: this.data.saveMeta.updatedAt,
              source: options.source || "local"
            }
          }));
        } catch (e2) {}
      }
    },

    reset: function () {
      this.data = this._default();
      this.save();
    },

    exportCloudData: function () {
      if (!this.data) this.load();
      try { return JSON.parse(JSON.stringify(this.data)); }
      catch (error) { return null; }
    },

    replaceFromCloud: function (payload) {
      if (!isRecord(payload)) return { ok: false, reason: "format" };
      var serialized;
      try { serialized = JSON.stringify(payload); }
      catch (error) { return { ok: false, reason: "format" }; }
      if (!serialized || serialized.length > 1024 * 1024) return { ok: false, reason: "size" };
      var schema = nonNegativeInteger(payload.schemaVersion);
      if (!schema || schema > 12) return { ok: false, reason: "schema" };
      this._suppressEvents = true;
      try {
        global.localStorage.setItem(KEY, serialized);
        this.data = null;
        this.load();
        this.save({ preserveRevision: true, silentEvent: true, source: "cloud" });
      } catch (error2) {
        return { ok: false, reason: "storage" };
      } finally {
        this._suppressEvents = false;
      }
      try { global.dispatchEvent(new CustomEvent("cloud-save-applied")); } catch (error3) {}
      return { ok: true, data: this.data };
    },

    hasMeaningfulProgress: function () {
      if (!this.data) this.load();
      var d = this.data;
      var lobby = d.lobby || {};
      var questions = d.questionProgress && d.questionProgress.byId || {};
      return (Array.isArray(d.clearedStages) && d.clearedStages.length > 0) ||
        (Array.isArray(lobby.buildings) && lobby.buildings.length > 0) ||
        Object.keys(questions).length > 0 ||
        (Array.isArray(d.knowledge) && d.knowledge.length > 0) ||
        (Array.isArray(d.ownedSkins) && d.ownedSkins.length > 0) ||
        Number(lobby.land && lobby.land.expansionLevel) > 0 ||
        Number(lobby.spaces && lobby.spaces.cottage && lobby.spaces.cottage.restClaims) > 0 ||
        Number(lobby.spaces && lobby.spaces.recycleYard && lobby.spaces.recycleYard.totalSorted) > 0 ||
        Number(d.coins) !== startingCoins() ||
        !lobby.materials || Number(lobby.materials.recycled) !== STARTING_RECYCLED;
    },

    describeSave: function (payload) {
      payload = isRecord(payload) ? payload : {};
      var lobby = isRecord(payload.lobby) ? payload.lobby : {};
      var questions = payload.questionProgress && isRecord(payload.questionProgress.byId)
        ? payload.questionProgress.byId : {};
      return {
        schemaVersion: nonNegativeInteger(payload.schemaVersion),
        updatedAt: Number(payload.saveMeta && payload.saveMeta.updatedAt) || null,
        revision: Number(payload.saveMeta && payload.saveMeta.revision) || 0,
        clearedStages: Array.isArray(payload.clearedStages) ? payload.clearedStages.length : 0,
        buildings: Array.isArray(lobby.buildings) ? lobby.buildings.length : 0,
        questions: Object.keys(questions).length,
        coins: nonNegativeInteger(payload.coins),
        recycled: nonNegativeInteger(lobby.materials && lobby.materials.recycled),
        materials: nonNegativeInteger(lobby.materials && lobby.materials.recycled)
      };
    },

    /* -------- 循環幣 -------- */
    getStartingCoins: function () { return startingCoins(); },
    getCoins: function () { return this.data.coins | 0; },
    addCoins: function (n) { this.data.coins = (this.data.coins | 0) + Math.max(0, n | 0); this.save(); },
    spendCoins: function (n) {
      if (this.data.coins >= n) { this.data.coins -= n; this.save(); return true; }
      return false;
    },

    /* -------- 商店升級 -------- */
    getShopLevel: function (id) { return this.data.shop[id] | 0; },

    canBuy: function (item) {
      var lvl = this.getShopLevel(item.id);
      if (lvl >= item.maxLevel) return false;
      return this.data.coins >= item.prices[lvl];
    },

    buyShopUpgrade: function (item) {
      var lvl = this.getShopLevel(item.id);
      if (lvl >= item.maxLevel) return { ok: false, reason: "max" };
      var price = item.prices[lvl];
      if (this.data.coins < price) return { ok: false, reason: "coins" };
      this.data.coins -= price;
      this.data.shop[item.id] = lvl + 1;
      this.save();
      return { ok: true, level: lvl + 1, spent: price };
    },

    /* -------- 知識 / 圖鑑 -------- */
    isKnowledgeUnlocked: function (id) { return this.data.knowledge.indexOf(id) !== -1; },

    // 依資料順序解鎖下一則尚未解鎖的知識；回傳該則 entry 或 null（全部已解鎖）
    unlockNextKnowledge: function () {
      var all = global.GameData.knowledge;
      for (var i = 0; i < all.length; i++) {
        if (!this.isKnowledgeUnlocked(all[i].id)) {
          this.data.knowledge.push(all[i].id);
          this.save();
          return all[i];
        }
      }
      return null;
    },

    isEnemyEncountered: function (id) {
      id = normalizeEnemyId(id);
      return !!(id && this.data && Array.isArray(this.data.encounteredEnemies) &&
        this.data.encounteredEnemies.indexOf(id) !== -1);
    },

    markEnemyEncountered: function (id) {
      id = normalizeEnemyId(id);
      if (!id || !this.data) return false;
      if (global.GameData && global.GameData.getEnemy && !global.GameData.getEnemy(id)) return false;
      if (!Array.isArray(this.data.encounteredEnemies)) this.data.encounteredEnemies = [];
      if (this.data.encounteredEnemies.indexOf(id) !== -1) return false;
      this.data.encounteredEnemies.push(id);
      this.save();
      return true;
    },

    /* -------- 目前選用角色 -------- */
    loadSelectedCharacter: function () {
      var id = normalizeCharacterId(this.data.selectedCharacterId || this.data.lastChar || "ranger");
      if (this.isCharacterOwned(id)) return id;
      var chars = (global.GameData && global.GameData.characters) || [];
      for (var i = 0; i < chars.length; i++) if (this.isCharacterOwned(chars[i].id)) return chars[i].id;
      return "ranger";
    },
    saveSelectedCharacter: function (id) {
      id = normalizeCharacterId(id);
      if (!this.isCharacterOwned(id)) return false;
      this.data.selectedCharacterId = id;
      this.data.lastChar = id; // 相容舊版測試/存檔欄位
      this.save();
      return true;
    },
    getLastChar: function () { return this.loadSelectedCharacter(); },
    setLastChar: function (id) { this.saveSelectedCharacter(id); },

    /* -------- 角色解鎖 / Skin / 技能點 -------- */
    isCharacterOwned: function (id) {
      id = normalizeCharacterId(id);
      return !!(this.data && this.data.ownedCharacters && this.data.ownedCharacters[id]);
    },
    unlockCharacter: function (id, shouldSave) {
      id = normalizeCharacterId(id);
      if (!global.GameData || !global.GameData.getCharacter(id)) return false;
      this.data.ownedCharacters[id] = true;
      if (shouldSave !== false) this.save();
      return true;
    },
    isSkinOwned: function (id) {
      return !!(this.data && this.data.ownedSkins && this.data.ownedSkins.indexOf(id) !== -1);
    },
    addOwnedSkin: function (id, shouldSave) {
      if (!global.GameData || !global.GameData.getSkin || !global.GameData.getSkin(id)) return false;
      if (!this.isSkinOwned(id)) this.data.ownedSkins.push(id);
      if (shouldSave !== false) this.save();
      return true;
    },
    getEquippedSkin: function (characterId) {
      characterId = normalizeCharacterId(characterId);
      var id = this.data.equippedSkins[characterId];
      var skin = global.GameData && global.GameData.getSkin ? global.GameData.getSkin(id) : null;
      return skin && skin.characterId === characterId && this.isSkinOwned(id) ? id : null;
    },
    equipSkin: function (characterId, skinId) {
      characterId = normalizeCharacterId(characterId);
      if (!this.isCharacterOwned(characterId)) return { ok: false, reason: "character" };
      if (!skinId || skinId === "default") {
        delete this.data.equippedSkins[characterId];
        this.save();
        return { ok: true, skinId: null };
      }
      var skin = global.GameData && global.GameData.getSkin ? global.GameData.getSkin(skinId) : null;
      if (!skin || skin.characterId !== characterId || !this.isSkinOwned(skinId)) return { ok: false, reason: "skin" };
      this.data.equippedSkins[characterId] = skinId;
      this.save();
      return { ok: true, skinId: skinId };
    },
    getCharacterProgress: function (id) {
      id = normalizeCharacterId(id);
      if (!this.data.characterProgress[id]) {
        this.data.characterProgress[id] = { availablePoints: 0, stats: { attack: 0, speed: 0, hp: 0 } };
      }
      return this.data.characterProgress[id];
    },
    addCharacterSkillPoints: function (id, amount, shouldSave) {
      var progress = this.getCharacterProgress(id);
      progress.availablePoints += Math.max(0, amount | 0);
      if (shouldSave !== false) this.save();
      return progress.availablePoints;
    },
    allocateCharacterStats: function (id, allocation) {
      var progress = this.getCharacterProgress(id);
      allocation = allocation || {};
      var spend = 0;
      ["attack", "speed", "hp"].forEach(function (stat) {
        var n = Math.max(0, allocation[stat] | 0);
        allocation[stat] = n;
        spend += n;
      });
      if (!spend) return { ok: false, reason: "empty" };
      if (spend > progress.availablePoints) return { ok: false, reason: "points" };
      ["attack", "speed", "hp"].forEach(function (stat) { progress.stats[stat] += allocation[stat]; });
      progress.availablePoints -= spend;
      this.save();
      return { ok: true, spent: spend, progress: progress };
    },
    getCharacterBonuses: function (id) {
      var progress = this.getCharacterProgress(id);
      var pointBonus = (global.GameData && global.GameData.SKILL_POINT_BONUS) || 0.05;
      function perPoint(stat) {
        if (global.GameData && global.GameData.getCharacterSkillPointBonus) {
          return global.GameData.getCharacterSkillPointBonus(id, stat);
        }
        if (typeof pointBonus === "number") return pointBonus;
        var value = Number(pointBonus && pointBonus[stat]);
        return isFinite(value) && value >= 0 ? value : 0.05;
      }
      var skinBonus = (global.GameData && global.GameData.SKIN_BONUS) || 0.10;
      var bonus = {
        attack: progress.stats.attack * perPoint("attack"),
        speed: progress.stats.speed * perPoint("speed"),
        hp: progress.stats.hp * perPoint("hp"),
        skinId: this.getEquippedSkin(id)
      };
      var skin = global.GameData && global.GameData.getSkin ? global.GameData.getSkin(bonus.skinId) : null;
      if (skin && Object.prototype.hasOwnProperty.call(bonus, skin.stat)) bonus[skin.stat] += skinBonus;
      bonus.attackMult = 1 + bonus.attack;
      bonus.speedMult = 1 + bonus.speed;
      bonus.hpMult = 1 + bonus.hp;
      return bonus;
    },
    addGachaHistory: function (result, shouldSave) {
      if (!result || !result.ok) return;
      this.data.gachaHistory.unshift({
        at: Date.now(), kind: result.kind,
        type: result.item.type, id: result.item.id, name: result.item.name
      });
      this.data.gachaHistory = this.data.gachaHistory.slice(0, 30);
      if (shouldSave !== false) this.save();
    },

    getGachaPity: function () {
      if (!this.data) this.load();
      if (!isRecord(this.data.gachaPity)) {
        this.data.gachaPity = { sinceNew: 0, totalPulls: 0, guaranteeAt: 10 };
      }
      this.data.gachaPity.sinceNew = nonNegativeInteger(this.data.gachaPity.sinceNew);
      this.data.gachaPity.totalPulls = nonNegativeInteger(this.data.gachaPity.totalPulls);
      this.data.gachaPity.guaranteeAt = 10;
      return this.data.gachaPity;
    },

    recordGachaPull: function (receivedNewReward, shouldSave) {
      var pity = this.getGachaPity();
      pity.totalPulls += 1;
      pity.sinceNew = receivedNewReward ? 0 : pity.sinceNew + 1;
      if (shouldSave !== false) this.save();
      return pity;
    },

    /* -------- 成就進度與獎勵 -------- */
    getAchievementData: function () {
      if (!this.data.achievements || typeof this.data.achievements !== "object") {
        this.data.achievements = achievementDefaults();
      }
      this.data.achievements = normalizeAchievementData(this.data.achievements);
      return this.data.achievements;
    },
    getAchievementProgress: function (id) {
      var value = Number(this.getAchievementData().progress[id]);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    },
    setAchievementProgress: function (id, value, shouldSave) {
      value = Number(value);
      this.getAchievementData().progress[id] = Number.isFinite(value) ? Math.max(0, value) : 0;
      if (shouldSave !== false) this.save();
      return this.getAchievementData().progress[id];
    },
    isAchievementUnlocked: function (id) {
      return !!this.getAchievementData().unlocked[id];
    },
    unlockAchievement: function (id, runCharacterId, shouldSave) {
      var achievements = this.getAchievementData();
      if (achievements.unlocked[id]) return false;
      achievements.unlocked[id] = {
        at: Date.now(),
        runCharacterId: achievementCharacterId(runCharacterId)
      };
      if (shouldSave !== false) this.save();
      return true;
    },
    isAchievementClaimed: function (id) {
      return !!this.getAchievementData().claimed[id];
    },
    claimAchievementReward: function (definition) {
      if (!definition || !definition.id) return { ok: false, reason: "definition" };
      // 領獎一律採用資料層的正式定義，避免呼叫端偽造 reward 數值。
      if (global.GameData && global.GameData.getAchievement) {
        definition = global.GameData.getAchievement(definition.id);
        if (!definition) return { ok: false, reason: "not_found" };
      }
      var achievements = this.getAchievementData();
      var unlocked = achievements.unlocked[definition.id];
      if (!unlocked) return { ok: false, reason: "locked" };
      if (achievements.claimed[definition.id]) return { ok: false, reason: "claimed" };

      var reward = definition.reward || {};
      var coins = nonNegativeInteger(reward.coins);
      var pointRule = reward.skillPoints;
      var points = 0;
      var targetCharacterId = null;
      if (typeof pointRule === "number") {
        points = nonNegativeInteger(pointRule);
      } else if (pointRule && typeof pointRule === "object") {
        points = nonNegativeInteger(pointRule.amount);
        targetCharacterId = pointRule.characterId || null;
        if (!targetCharacterId && pointRule.targetPolicy === "unlockingCharacter") {
          // 舊版成就存檔只保存「已解鎖」狀態，沒有記錄當局角色。
          // 此時退回玩家目前選擇的正式角色，避免角色點獎勵永久無法領取。
          targetCharacterId = unlocked.runCharacterId ||
            this.data.selectedCharacterId || this.data.lastChar || null;
        }
      }
      if (!targetCharacterId) targetCharacterId = reward.characterId || null;
      if (!targetCharacterId && points && definition.characterId) targetCharacterId = definition.characterId;
      if (!targetCharacterId && points && reward.targetPolicy === "unlockingCharacter") {
        targetCharacterId = unlocked.runCharacterId ||
          this.data.selectedCharacterId || this.data.lastChar || null;
      }
      if (targetCharacterId) targetCharacterId = achievementCharacterId(targetCharacterId);
      if (points && !targetCharacterId) {
        return { ok: false, reason: "character" };
      }

      var next;
      try {
        next = JSON.parse(JSON.stringify(this.data));
      } catch (cloneError) {
        return { ok: false, reason: "storage" };
      }
      next.schemaVersion = 12;
      next.coins = nonNegativeInteger(next.coins) + coins;
      next.achievements = normalizeAchievementData(next.achievements);
      if (points) {
        if (!next.characterProgress || typeof next.characterProgress !== "object") next.characterProgress = {};
        var progress = next.characterProgress[targetCharacterId];
        if (!progress || typeof progress !== "object") {
          progress = next.characterProgress[targetCharacterId] = {
            availablePoints: 0,
            stats: { attack: 0, speed: 0, hp: 0 }
          };
        }
        if (!progress.stats || typeof progress.stats !== "object") {
          progress.stats = { attack: 0, speed: 0, hp: 0 };
        }
        ["attack", "speed", "hp"].forEach(function (stat) {
          progress.stats[stat] = nonNegativeInteger(progress.stats[stat]);
        });
        progress.availablePoints = nonNegativeInteger(progress.availablePoints) + points;
      }
      next.achievements.claimed[definition.id] = {
        at: Date.now(),
        targetCharacterId: targetCharacterId
      };

      try {
        global.localStorage.setItem(KEY, JSON.stringify(next));
      } catch (saveError) {
        return { ok: false, reason: "storage" };
      }
      this.data = next;
      return {
        ok: true,
        reward: reward,
        coins: coins,
        points: points,
        targetCharacterId: targetCharacterId
      };
    },

    /* -------- 關卡進度 -------- */
    isStageCleared: function (id) {
      return !!(this.data && this.data.clearedStages && this.data.clearedStages.indexOf(id) !== -1);
    },
    isStageUnlocked: function (id) {
      var stage = global.GameData && global.GameData.getStage ? global.GameData.getStage(id) : null;
      if (!stage) return false;
      return !stage.unlockAfter || this.isStageCleared(stage.unlockAfter);
    },
    markStageCleared: function (id) {
      if (!this.data || !global.GameData || !global.GameData.getStage(id)) return null;
      var next = global.GameData.getNextStage ? global.GameData.getNextStage(id) : null;
      var nextWasUnlocked = next ? this.isStageUnlocked(next.id) : false;
      var firstClear = !this.isStageCleared(id);
      if (firstClear) {
        this.data.clearedStages.push(id);
        appendLearningEvent(this.data.learningEvents, {
          id: learningEventId("stage"), kind: "stage_clear", subjectId: id,
          correct: true, amount: 1, occurredAt: Date.now()
        });
      }
      this._lastFixedCharacterUnlocks = [];
      var fixedCharacterId = id === "recycle_works"
        ? "mechanic"
        : (id === "blackwater_plant" ? "chemist" : null);
      if (fixedCharacterId && !this.isCharacterOwned(fixedCharacterId)) {
        this.unlockCharacter(fixedCharacterId, false);
        this._lastFixedCharacterUnlocks.push(fixedCharacterId);
      }
      var nextIsUnlocked = next ? this.isStageUnlocked(next.id) : false;
      this.save();
      return next && !nextWasUnlocked && nextIsUnlocked ? next : null;
    },
    consumeFixedCharacterUnlocks: function () {
      var unlocked = (this._lastFixedCharacterUnlocks || []).slice();
      this._lastFixedCharacterUnlocks = [];
      return unlocked;
    },
    loadSelectedStage: function () {
      var id = (this.data && this.data.selectedStageId) || "tidal_flat";
      if (this.isStageUnlocked(id)) return id;
      var stages = (global.GameData && global.GameData.stages) || [];
      for (var i = stages.length - 1; i >= 0; i--) {
        if (this.isStageUnlocked(stages[i].id)) return stages[i].id;
      }
      return "tidal_flat";
    },
    saveSelectedStage: function (id) {
      if (!this.isStageUnlocked(id)) return false;
      this.data.selectedStageId = id;
      this.save();
      return true;
    },

    /* -------- 音量設定（重整後保留；商店升級/存檔不受重新開始影響） -------- */
    getPreferences: function () {
      if (!this.data) this.load();
      this.data.preferences = normalizePreferences(this.data.preferences);
      return this.data.preferences;
    },

    setPreferences: function (changes, shouldSave) {
      var next = Object.assign({}, this.getPreferences(), changes || {});
      this.data.preferences = normalizePreferences(next);
      if (shouldSave !== false) this.save();
      return this.data.preferences;
    },

    getAudioSettings: function () {
      if (!this.data) return { master: 80, music: 70, sfx: 80, mute: false };
      if (!this.data.audio || typeof this.data.audio !== "object") {
        this.data.audio = { master: 80, music: 70, sfx: 80, mute: false };
      }
      return this.data.audio;
    },
    setAudioSettings: function (obj) {
      var a = this.getAudioSettings();
      for (var k in obj) a[k] = obj[k];
      this.save();
    },

    /* -------- v1.2 漸進式教學 -------- */
    getTutorial: function () {
      if (!this.data) this.load();
      if (!isRecord(this.data.tutorial)) this.data.tutorial = this._default().tutorial;
      return this.data.tutorial;
    },

    startTutorial: function (restart) {
      var tutorial = this.getTutorial();
      if (restart) {
        tutorial.completedSteps = [];
        tutorial.stepId = "move";
        tutorial.completed = false;
        tutorial.skipped = false;
        tutorial.completedAt = null;
      }
      tutorial.active = true;
      tutorial.startedAt = tutorial.startedAt || Date.now();
      this.save();
      return tutorial;
    },

    setTutorialStep: function (stepId, completedSteps) {
      var tutorial = this.getTutorial();
      tutorial.stepId = stepId;
      tutorial.active = true;
      if (Array.isArray(completedSteps)) tutorial.completedSteps = completedSteps.slice();
      this.save();
      return tutorial;
    },

    finishTutorial: function (skipped) {
      var tutorial = this.getTutorial();
      tutorial.active = false;
      tutorial.completed = !skipped;
      tutorial.skipped = skipped === true;
      tutorial.completedAt = Date.now();
      this.save();
      return tutorial;
    },

    /* -------- v1.2 題目作答、詳解與訂正紀錄 -------- */
    getQuestionProgress: function (id) {
      if (!this.data) this.load();
      var root = this.data.questionProgress;
      if (!isRecord(root)) root = this.data.questionProgress = { version: 1, byId: {} };
      if (!isRecord(root.byId)) root.byId = {};
      return id ? (root.byId[id] || null) : root;
    },

    getQuestionStatus: function (id) {
      var progress = this.getQuestionProgress(id);
      if (!progress || !progress.attempts) return "unanswered";
      if (!progress.lastCorrect) return "wrong";
      return progress.wrongCount > 0 ? "corrected" : "correct";
    },

    recordQuestionAttempt: function (question, selected, correct) {
      if (!question || !question.id) return null;
      var root = this.getQuestionProgress();
      var now = Date.now();
      var progress = root.byId[question.id];
      var wasWrong = !!(progress && progress.attempts && !progress.lastCorrect);
      if (!isRecord(progress)) {
        progress = root.byId[question.id] = {
          attempts: 0,
          correctCount: 0,
          wrongCount: 0,
          firstAnsweredAt: now,
          lastAnsweredAt: now,
          lastSelected: null,
          lastCorrect: false,
          correctedAt: null
        };
      }
      progress.attempts = (progress.attempts | 0) + 1;
      progress.correctCount = (progress.correctCount | 0) + (correct ? 1 : 0);
      progress.wrongCount = (progress.wrongCount | 0) + (correct ? 0 : 1);
      progress.lastSelected = Number(selected);
      progress.lastCorrect = correct === true;
      progress.lastAnsweredAt = now;
      if (!progress.firstAnsweredAt) progress.firstAnsweredAt = now;
      if (correct && progress.wrongCount > 0) progress.correctedAt = now;
      appendLearningEvent(this.data.learningEvents, {
        id: learningEventId("quiz"), kind: "quiz_answer", subjectId: question.id,
        correct: correct === true, amount: 1, occurredAt: now
      });
      if (correct && wasWrong) appendLearningEvent(this.data.learningEvents, {
        id: learningEventId("correction"), kind: "correction", subjectId: question.id,
        correct: true, amount: 1, occurredAt: now
      });
      this.save();
      return progress;
    },

    getPendingLearningEvents: function () {
      if (!this.data) this.load();
      var root = isRecord(this.data.learningEvents) ? this.data.learningEvents : (this.data.learningEvents = { version: 1, queue: [] });
      if (!Array.isArray(root.queue)) root.queue = [];
      return root.queue.map(function (entry) { return Object.assign({}, entry); });
    },

    acknowledgeLearningEvents: function (ids) {
      if (!this.data || !isRecord(this.data.learningEvents) || !Array.isArray(this.data.learningEvents.queue)) return 0;
      var accepted = {};
      (ids || []).forEach(function (id) { accepted[String(id)] = true; });
      var before = this.data.learningEvents.queue.length;
      this.data.learningEvents.queue = this.data.learningEvents.queue.filter(function (entry) { return !accepted[entry.id]; });
      var removed = before - this.data.learningEvents.queue.length;
      if (removed) this.save({ source: "learning-events-ack" });
      return removed;
    },

    getQuestionSummary: function () {
      var questions = global.GameData && Array.isArray(global.GameData.sustainabilityQuestions)
        ? global.GameData.sustainabilityQuestions : [];
      var summary = { total: questions.length, attempted: 0, attempts: 0, correctAttempts: 0, correct: 0, wrong: 0, corrected: 0, unanswered: 0 };
      var self = this;
      questions.forEach(function (question) {
        var progress = self.getQuestionProgress(question.id);
        var status = self.getQuestionStatus(question.id);
        summary[status] += 1;
        if (progress) {
          summary.attempted += 1;
          summary.attempts += progress.attempts | 0;
          summary.correctAttempts += progress.correctCount | 0;
        }
      });
      summary.completionRate = summary.total ? Math.round(summary.attempted / summary.total * 100) : 0;
      summary.accuracyRate = summary.attempts ? Math.round(summary.correctAttempts / summary.attempts * 100) : 0;
      return summary;
    },

    /* ============================================================
       大廳（schema 4）：再生材料、建築配置、每日進度
       所有「扣材料 + 動建築」都在同一次 save() 內完成，
       重新整理不會出現材料已扣但建築不存在的中間狀態。
       ============================================================ */
    getLobby: function () {
      if (!this.data) this.load();
      if (!this.data.lobby) this.data.lobby = this._defaultLobby();
      return this.data.lobby;
    },

    isLobbyGuideCompleted: function () {
      return this.getLobby().guideCompleted === true;
    },

    completeLobbyGuide: function () {
      this.getLobby().guideCompleted = true;
      this.save();
    },

    isPlacementHelpCompleted: function () {
      return this.getLobby().placementHelpCompleted === true;
    },

    completePlacementHelp: function () {
      this.getLobby().placementHelpCompleted = true;
      this.save();
    },

    getRecycled: function () { return this.getLobby().materials.recycled | 0; },

    getLobbyExpansionLevel: function () {
      var lobby = this.getLobby();
      return Math.max(0, Math.min(2, lobby.land && lobby.land.expansionLevel | 0));
    },

    expandLobbyLand: function (level, cost) {
      level = Math.max(1, Math.min(2, level | 0));
      cost = Math.max(0, cost | 0);
      var lobby = this.getLobby();
      var current = this.getLobbyExpansionLevel();
      if (level <= current) return { ok: false, reason: "owned", level: current };
      if (level !== current + 1) return { ok: false, reason: "sequence", level: current };
      if ((lobby.materials.recycled | 0) < cost) return { ok: false, reason: "materials", missing: cost - (lobby.materials.recycled | 0) };
      lobby.materials.recycled -= cost;
      lobby.land.expansionLevel = level;
      lobby.land.expandedAt[String(level)] = Date.now();
      this.save();
      return { ok: true, level: level, spent: cost };
    },

    getIslandSpaces: function () { return this.getLobby().spaces; },

    visitIslandSpace: function (spaceId) {
      var space = this.getIslandSpaces()[spaceId];
      if (!space) return false;
      space.visits = Math.max(0, space.visits | 0) + 1;
      this.save();
      return true;
    },

    spendRecycled: function (amount) {
      amount = Math.max(0, amount | 0);
      var lobby = this.getLobby();
      if ((lobby.materials.recycled | 0) < amount) return false;
      lobby.materials.recycled -= amount;
      this.save();
      return true;
    },

    addRecycled: function (n) {
      var lobby = this.getLobby();
      lobby.materials.recycled = Math.max(0, (lobby.materials.recycled | 0) + Math.max(0, n | 0));
      this.save();
      return lobby.materials.recycled;
    },

    setLobbyPlayerPosition: function (x, y, direction, shouldSave) {
      var lobby = this.getLobby();
      lobby.playerPosition.x = Math.round(x);
      lobby.playerPosition.y = Math.round(y);
      if (direction) lobby.playerPosition.direction = direction;
      if (shouldSave !== false) this.save();
    },

    getLobbyInventoryCount: function (buildingId) {
      return this.getLobby().inventory[buildingId] | 0;
    },

    /* 已擁有（含收納中）的數量：unique 判定要同時看場上與庫存 */
    countLobbyBuilding: function (buildingId) {
      var lobby = this.getLobby();
      var placed = lobby.buildings.filter(function (b) { return b.buildingId === buildingId; }).length;
      return placed + (lobby.inventory[buildingId] | 0);
    },

    /* 購買並直接擺放（交易：扣材料 + 新增建築 → 單次 save） */
    buildLobbyBuilding: function (def, x, y, rotation) {
      if (!def) return { ok: false, reason: "definition" };
      var lobby = this.getLobby();
      if (def.unique && this.countLobbyBuilding(def.id) > 0) return { ok: false, reason: "unique" };
      var cost = (def.cost && def.cost.recycled) | 0;
      if ((lobby.materials.recycled | 0) < cost) return { ok: false, reason: "materials" };
      lobby.materials.recycled -= cost;
      var inst = {
        instanceId: "building-" + (lobby.nextInstanceId++),
        buildingId: def.id,
        x: Math.round(x),
        y: Math.round(y),
        rotation: rotation | 0,
        level: 1,
        placed: true
      };
      lobby.buildings.push(inst);
      this.save();
      return { ok: true, building: inst, spent: cost };
    },

    /* 從庫存擺回大廳（不再扣材料） */
    placeLobbyFromInventory: function (def, x, y, rotation) {
      if (!def) return { ok: false, reason: "definition" };
      var lobby = this.getLobby();
      if ((lobby.inventory[def.id] | 0) <= 0) return { ok: false, reason: "inventory" };
      lobby.inventory[def.id] -= 1;
      if (lobby.inventory[def.id] <= 0) delete lobby.inventory[def.id];
      var inst = {
        instanceId: "building-" + (lobby.nextInstanceId++),
        buildingId: def.id,
        x: Math.round(x),
        y: Math.round(y),
        rotation: rotation | 0,
        level: 1,
        placed: true
      };
      lobby.buildings.push(inst);
      this.save();
      return { ok: true, building: inst };
    },

    getLobbyBuildingInstance: function (instanceId) {
      return this.getLobby().buildings.find(function (b) { return b.instanceId === instanceId; }) || null;
    },

    /* 移動 / 旋轉已放置建築 */
    updateLobbyBuilding: function (instanceId, patch) {
      var inst = this.getLobbyBuildingInstance(instanceId);
      if (!inst) return { ok: false, reason: "not_found" };
      if (patch && patch.x != null) inst.x = Math.round(patch.x);
      if (patch && patch.y != null) inst.y = Math.round(patch.y);
      if (patch && patch.rotation != null) inst.rotation = patch.rotation | 0;
      this.save();
      return { ok: true, building: inst };
    },

    /* 收納：物件回庫存，不返還材料 */
    stowLobbyBuilding: function (instanceId) {
      var lobby = this.getLobby();
      var index = lobby.buildings.findIndex(function (b) { return b.instanceId === instanceId; });
      if (index === -1) return { ok: false, reason: "not_found" };
      var inst = lobby.buildings.splice(index, 1)[0];
      lobby.inventory[inst.buildingId] = (lobby.inventory[inst.buildingId] | 0) + 1;
      this.save();
      return { ok: true, buildingId: inst.buildingId };
    },

    /* -------- 將商店等級換算為開局加成 -------- */
    getMetaBonuses: function () {
      var b = {
        bonusMaxHp: 0,
        coinBonusMult: 0,
        cooldownReduce: 0,
        pickupRangeBonus: 0,
        shieldBonus: 0
      };
      var shop = global.GameData.shop;
      for (var i = 0; i < shop.length; i++) {
        var item = shop[i];
        var lvl = this.getShopLevel(item.id);
        if (lvl > 0) {
          b[item.statKey] += item.values[lvl - 1];
        }
      }
      return b;
    }
  };

  global.Storage = Storage;
})(window);
