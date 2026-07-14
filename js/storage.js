/* ============================================================
   storage.js  —  存檔（localStorage）
   保存：循環幣總額、商店升級等級、已解鎖知識、目前選用角色、音量設定。
   以 try/catch 包裹，讓 file:// 下若無法存取也能照常遊玩。
   ============================================================ */
(function (global) {
  var KEY = "senloop_save_v1";
  var OFFICIAL_CHARACTER_IDS = ["ranger", "beachcomber", "solar", "mechanic", "chemist"];

  function normalizeCharacterId(id) {
    if (!id) return "ranger";
    if (global.GameData && global.GameData.resolveCharacterId) return global.GameData.resolveCharacterId(id);
    if (id === "solar_engineer") return "solar";
    return id;
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

    _default: function () {
      return {
        schemaVersion: 2,
        coins: 0,
        shop: {},        // { upgradeId: level }
        knowledge: [],   // 已解鎖的 knowledge id
        ownedCharacters: { ranger: true, beachcomber: true, solar: false, mechanic: false, chemist: false },
        ownedSkins: [],
        equippedSkins: {},
        characterProgress: {},
        gachaHistory: [],
        selectedCharacterId: "ranger",
        lastChar: "ranger",
        selectedStageId: "tidal_flat",
        clearedStages: [],
        achievements: achievementDefaults(),
        // 音量設定（0~100；mute 為布林）—— 單一來源，audioManager 由此讀寫
        audio: { master: 80, music: 70, sfx: 80, mute: false }
      };
    },

    load: function () {
      var d = null;
      try {
        var raw = global.localStorage.getItem(KEY);
        if (raw) d = JSON.parse(raw);
      } catch (e) { d = null; }
      if (!d || typeof d !== "object") d = this._default();
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
      if (!Array.isArray(d.clearedStages)) d.clearedStages = [];
      d.schemaVersion = 2;
      d.achievements = normalizeAchievementData(d.achievements);
      if (!d.selectedStageId || !global.GameData || !global.GameData.getStage || !global.GameData.getStage(d.selectedStageId)) {
        d.selectedStageId = "tidal_flat";
      }
      // audio 子欄位也補齊
      if (!d.audio || typeof d.audio !== "object") d.audio = def.audio;
      for (var ak in def.audio) { if (!(ak in d.audio)) d.audio[ak] = def.audio[ak]; }
      this.data = d;
      return d;
    },

    save: function () {
      try {
        global.localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch (e) { /* file:// 或隱私模式可能失敗，靜默忽略 */ }
    },

    reset: function () {
      this.data = this._default();
      this.save();
    },

    /* -------- 循環幣 -------- */
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
      var perPoint = (global.GameData && global.GameData.SKILL_POINT_BONUS) || 0.05;
      var skinBonus = (global.GameData && global.GameData.SKIN_BONUS) || 0.10;
      var bonus = {
        attack: progress.stats.attack * perPoint,
        speed: progress.stats.speed * perPoint,
        hp: progress.stats.hp * perPoint,
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
      next.schemaVersion = 2;
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
      if (!this.isStageCleared(id)) this.data.clearedStages.push(id);
      var next = global.GameData.getNextStage ? global.GameData.getNextStage(id) : null;
      this.save();
      return next && this.isStageUnlocked(next.id) ? next : null;
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
