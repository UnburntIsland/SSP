/* ============================================================
   lobbyEconomy.js — v1.2 自動回收站 + BOSS 每日首勝
   - 不需站在回收區；遊玩、切換畫面與離線期間都會累積。
   - 產物先留在回收站，玩家靠近後主動一次領取。
   - 每日最多生產 60 份，回收站容量 60；時間倒退不產生收益。
   ============================================================ */
(function (global) {
  var IDLE_INTERVAL = 20;
  var DAILY_CAP = 60;
  var CAPACITY = 60;
  var QA_INTERVAL = null;
  var BOSS_BONUS = {
    tidal_flat: 8,
    recycle_works: 12,
    blackwater_plant: 18,
    east_ridge: 24
  };

  try {
    var params = new URLSearchParams(global.location.search);
    if (params.get("test") === "1") {
      var qaInterval = Number(params.get("qaIdleInterval"));
      if (isFinite(qaInterval) && qaInterval > 0) { IDLE_INTERVAL = qaInterval; QA_INTERVAL = qaInterval; }
    }
  } catch (error) {}

  function todayKey(now, previousKey) {
    if (global.GameClock && global.GameClock.dateKey) return global.GameClock.dateKey(previousKey, now);
    var d = now != null ? new Date(now) : new Date();
    var month = d.getMonth() + 1;
    var day = d.getDate();
    var key = d.getFullYear() + "-" + (month < 10 ? "0" + month : month) + "-" + (day < 10 ? "0" + day : day);
    return typeof previousKey === "string" && previousKey > key ? previousKey : key;
  }

  function currentInterval() {
    return QA_INTERVAL || (global.IslandSpaces && global.IslandSpaces.getRecycleInterval ? global.IslandSpaces.getRecycleInterval() : IDLE_INTERVAL);
  }
  function currentCapacity() {
    return global.IslandSpaces && global.IslandSpaces.getRecycleCapacity ? global.IslandSpaces.getRecycleCapacity() : CAPACITY;
  }
  function currentDailyCap() { return currentCapacity(); }
  function currentTime(value) {
    if (value != null) return value;
    return global.GameClock && global.GameClock.now ? global.GameClock.now() : Date.now();
  }

  function ensureGenerator(lobby, now) {
    var capacity = currentCapacity();
    if (!lobby.recycleGenerator || typeof lobby.recycleGenerator !== "object") {
      lobby.recycleGenerator = { unclaimed: 0, lastAccruedAt: now, lastClaimedAt: null, capacity: capacity };
    }
    var generator = lobby.recycleGenerator;
    generator.unclaimed = Math.max(0, Math.min(capacity, generator.unclaimed | 0));
    generator.capacity = capacity;
    var last = Number(generator.lastAccruedAt);
    generator.lastAccruedAt = isFinite(last) && last > 0 ? last : now;
    return generator;
  }

  var LobbyEconomy = {
    IDLE_INTERVAL: IDLE_INTERVAL,
    DAILY_CAP: DAILY_CAP,
    CAPACITY: CAPACITY,
    getInterval: currentInterval,
    getCapacity: currentCapacity,
    getDailyCap: currentDailyCap,
    _inZone: false,
    _backgroundTimer: 0,

    ensureDaily: function (now) {
      now = currentTime(now);
      var storage = global.Storage;
      if (!storage || !storage.getLobby) return null;
      var lobby = storage.getLobby();
      var generator = ensureGenerator(lobby, now);
      var key = todayKey(now, lobby.daily.dateKey);
      if (lobby.daily.dateKey !== key) {
        lobby.daily.dateKey = key;
        lobby.daily.idleEarned = 0;
        /* 保留最後生產時間，離線跨日回來仍可補算；本日上限會限制最多 60 份。 */
        var claims = lobby.daily.dailyBossClaims || {};
        Object.keys(claims).forEach(function (stageId) {
          if (claims[stageId] !== key) delete claims[stageId];
        });
        lobby.daily.dailyBossClaims = claims;
        storage.save();
      }
      return lobby;
    },

    enterZone: function () { this._inZone = true; },
    leaveZone: function () { this._inZone = false; },
    isCollecting: function () { return this._inZone; },

    startBackgroundSettlement: function () {
      if (this._backgroundTimer) return;
      var self = this;
      this.settle(Date.now());
      this._backgroundTimer = global.setInterval(function () { self.settle(Date.now()); }, 1000);
      global.addEventListener("focus", function () { self.settle(Date.now()); });
      global.addEventListener("pagehide", function () { self.settle(Date.now()); });
      if (global.document) {
        global.document.addEventListener("visibilitychange", function () {
          if (!global.document.hidden) self.settle(Date.now());
        });
      }
    },

    /* 回傳本次進入待領區的份數；不會直接改玩家錢包。 */
    settle: function (now) {
      now = currentTime(now);
      var lobby = this.ensureDaily(now);
      if (!lobby) return 0;
      var generator = ensureGenerator(lobby, now);
      var interval = currentInterval(), dailyCap = currentDailyCap(), capacity = currentCapacity();
      var elapsed = now - generator.lastAccruedAt;
      if (elapsed < 0) {
        generator.lastAccruedAt = now;
        global.Storage.save();
        return 0;
      }
      if (lobby.daily.idleEarned >= dailyCap || generator.unclaimed >= capacity) {
        generator.lastAccruedAt = now;
        return 0;
      }
      var units = Math.floor(elapsed / (interval * 1000));
      units = Math.min(units, dailyCap - lobby.daily.idleEarned, capacity - generator.unclaimed);
      if (units <= 0) return 0;
      generator.lastAccruedAt += units * interval * 1000;
      lobby.daily.idleEarned += units;
      generator.unclaimed += units;
      global.Storage.save();
      try {
        global.dispatchEvent(new CustomEvent("lobby-recycle-ready", {
          detail: { amount: units, unclaimed: generator.unclaimed }
        }));
      } catch (error) {}
      return units;
    },

    /* 舊呼叫點相容：update 現在只負責結算。 */
    update: function (now) { return this.settle(now); },

    collect: function (now) {
      now = currentTime(now);
      this.settle(now);
      var lobby = this.ensureDaily(now);
      if (!lobby) return 0;
      var generator = ensureGenerator(lobby, now);
      var amount = generator.unclaimed | 0;
      if (amount <= 0) return 0;
      generator.unclaimed = 0;
      generator.lastClaimedAt = now;
      global.Storage.addRecycled(amount);
      try {
        global.dispatchEvent(new CustomEvent("lobby-material-gained", {
          detail: { amount: amount, total: global.Storage.getRecycled() }
        }));
      } catch (error) {}
      return amount;
    },

    getStatus: function (now) {
      now = currentTime(now);
      this.settle(now);
      var lobby = this.ensureDaily(now);
      var generator = lobby ? ensureGenerator(lobby, now) : { unclaimed: 0, lastAccruedAt: now };
      var earned = lobby ? lobby.daily.idleEarned | 0 : 0;
      var interval = currentInterval(), dailyCap = currentDailyCap(), capacity = currentCapacity();
      var capped = earned >= dailyCap || generator.unclaimed >= capacity;
      var elapsed = Math.max(0, now - generator.lastAccruedAt) / 1000;
      var secondsToNext = capped ? null : Math.max(1, Math.ceil(interval - (elapsed % interval)));
      return {
        inZone: this._inZone,
        earned: earned,
        generated: earned,
        unclaimed: generator.unclaimed | 0,
        capacity: capacity,
        cap: dailyCap,
        capped: capped,
        ready: generator.unclaimed > 0,
        secondsToNext: secondsToNext
      };
    },

    claimBossDaily: function (stageId, now, rewardMultiplier) {
      var storage = global.Storage;
      if (!storage || !storage.getLobby || !BOSS_BONUS[stageId]) return null;
      var lobby = this.ensureDaily(now);
      if (!lobby) return null;
      var key = todayKey(now, lobby.daily.dateKey);
      if (lobby.daily.dailyBossClaims[stageId] === key) return null;
      lobby.daily.dailyBossClaims[stageId] = key;
      var multiplier = Number(rewardMultiplier);
      if (!isFinite(multiplier) || multiplier <= 0) multiplier = 1;
      var amount = Math.max(1, Math.floor(BOSS_BONUS[stageId] * multiplier));
      storage.addRecycled(amount);
      return { amount: amount, multiplier: multiplier };
    },

    bossBonusAmount: function (stageId) { return BOSS_BONUS[stageId] || 0; }
  };

  global.LobbyEconomy = LobbyEconomy;
  LobbyEconomy.startBackgroundSettlement();
})(window);
