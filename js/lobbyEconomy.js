/* ============================================================
   lobbyEconomy.js  —  再生材料經濟（掛機回收 + BOSS 每日首勝）
   規則（見 LOBBY_BUILDING_SYSTEM_PLAN.md 第 5 節）：
   - 角色站在掛機回收區內，每 20 秒 +1 再生材料。
   - 每日掛機上限 60 份；達上限即停止計時。
   - 以 timestamp 差值結算（不靠每幀 dt），單次補算上限 5 分鐘，
     防止分頁節流漏算，也防止改系統時間灌材料。
   - 依玩家本地日期（YYYY-MM-DD）重置；不做離線收益。
   - BOSS 每日首勝另外提供少量材料，與掛機上限分開計。
   ============================================================ */
(function (global) {

  var IDLE_INTERVAL = 20;        /* 秒 / 份 */
  var DAILY_CAP = 60;            /* 每日掛機上限 */
  var MAX_SETTLE = 300;          /* 單次可結算的最大秒數（5 分鐘） */
  var BOSS_BONUS = {             /* 每關每日首勝的再生材料 */
    tidal_flat: 8,
    recycle_works: 12,
    blackwater_plant: 18,
    east_ridge: 24
  };

  /* 測試模式（?test=1）允許縮短掛機間隔與預先給材料，方便 QA */
  try {
    var params = new URLSearchParams(global.location.search);
    if (params.get("test") === "1") {
      var qaInterval = Number(params.get("qaIdleInterval"));
      if (isFinite(qaInterval) && qaInterval > 0) IDLE_INTERVAL = qaInterval;
    }
  } catch (e) {}

  function todayKey(now) {
    var d = now != null ? new Date(now) : new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
  }

  var LobbyEconomy = {
    IDLE_INTERVAL: IDLE_INTERVAL,
    DAILY_CAP: DAILY_CAP,

    _inZone: false,
    _lastTick: 0,          /* 上次結算的 timestamp（ms）；離開大廳子頁時仍可結算 */
    _backgroundTimer: 0,

    /* 日期換日檢查；必要時歸零今日進度。任何讀寫每日資料前都先呼叫。 */
    ensureDaily: function (now) {
      var S = global.Storage;
      if (!S || !S.getLobby) return null;
      var lobby = S.getLobby();
      var key = todayKey(now);
      if (lobby.daily.dateKey !== key) {
        lobby.daily.dateKey = key;
        lobby.daily.idleEarned = 0;
        /* 清掉非今天的 BOSS 首勝紀錄，物件不會無限長大 */
        var claims = lobby.daily.dailyBossClaims || {};
        Object.keys(claims).forEach(function (stageId) {
          if (claims[stageId] !== key) delete claims[stageId];
        });
        lobby.daily.dailyBossClaims = claims;
        S.save();
      }
      return lobby;
    },

    enterZone: function (now) {
      if (this._inZone) return;
      this._inZone = true;
      this._lastTick = now != null ? now : Date.now();
    },

    leaveZone: function () {
      /* 移出區域立即停止；未滿 20 秒的進度不保留（規則透明、不可刷） */
      this._inZone = false;
      this._lastTick = 0;
    },

    isCollecting: function () {
      return this._inZone;
    },

    startBackgroundSettlement: function () {
      if (this._backgroundTimer) return;
      var self = this;
      this._backgroundTimer = global.setInterval(function () {
        if (!self._inZone) return;
        var gained = self.update(Date.now());
        if (gained > 0) {
          try {
            global.dispatchEvent(new CustomEvent("lobby-material-gained", {
              detail: { amount: gained, total: global.Storage.getRecycled() }
            }));
          } catch (e) {}
        }
      }, 1000);
    },

    /* 主迴圈呼叫；回傳本次新增的材料數（0 = 無變化） */
    update: function (now) {
      if (!this._inZone) return 0;
      now = now != null ? now : Date.now();
      var lobby = this.ensureDaily(now);
      if (!lobby) return 0;
      if (lobby.daily.idleEarned >= DAILY_CAP) return 0;

      var elapsed = (now - this._lastTick) / 1000;
      if (elapsed < 0) { this._lastTick = now; return 0; }        /* 時鐘倒退：重新起算 */
      if (elapsed > MAX_SETTLE) {
        /* 節流或改時間造成的大差值：最多補算 5 分鐘 */
        this._lastTick = now - MAX_SETTLE * 1000;
        elapsed = MAX_SETTLE;
      }
      if (elapsed < IDLE_INTERVAL) return 0;

      var units = Math.floor(elapsed / IDLE_INTERVAL);
      var room = DAILY_CAP - lobby.daily.idleEarned;
      if (units > room) units = room;
      if (units <= 0) return 0;

      this._lastTick += units * IDLE_INTERVAL * 1000;
      lobby.daily.idleEarned += units;
      global.Storage.addRecycled(units);           /* 內含 save()：材料與每日進度同筆寫入 */
      return units;
    },

    /* HUD 顯示用狀態 */
    getStatus: function (now) {
      now = now != null ? now : Date.now();
      var lobby = this.ensureDaily(now);
      var earned = lobby ? lobby.daily.idleEarned : 0;
      var capped = earned >= DAILY_CAP;
      var secondsToNext = null;
      if (this._inZone && !capped && this._lastTick) {
        var into = (now - this._lastTick) / 1000;
        secondsToNext = Math.max(0, Math.ceil(IDLE_INTERVAL - (into % IDLE_INTERVAL)));
      }
      return {
        inZone: this._inZone,
        earned: earned,
        cap: DAILY_CAP,
        capped: capped,
        secondsToNext: secondsToNext
      };
    },

    /* BOSS 每日首勝獎勵；未領 → 入帳並回傳 {amount}，已領 → null */
    claimBossDaily: function (stageId, now, rewardMultiplier) {
      var S = global.Storage;
      if (!S || !S.getLobby || !BOSS_BONUS[stageId]) return null;
      var lobby = this.ensureDaily(now);
      if (!lobby) return null;
      var key = todayKey(now);
      if (lobby.daily.dailyBossClaims[stageId] === key) return null;
      lobby.daily.dailyBossClaims[stageId] = key;
      var multiplier = Number(rewardMultiplier);
      if (!isFinite(multiplier) || multiplier <= 0) multiplier = 1;
      var amount = Math.max(1, Math.floor(BOSS_BONUS[stageId] * multiplier));
      S.addRecycled(amount);                       /* 與掛機上限分開，不佔 60 份額度 */
      return { amount: amount, multiplier: multiplier };
    },

    bossBonusAmount: function (stageId) {
      return BOSS_BONUS[stageId] || 0;
    }
  };

  global.LobbyEconomy = LobbyEconomy;
  LobbyEconomy.startBackgroundSettlement();
})(window);
