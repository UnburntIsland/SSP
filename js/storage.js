/* ============================================================
   storage.js  —  存檔（localStorage）
   保存：循環幣總額、商店升級等級、已解鎖知識、上次選用角色。
   以 try/catch 包裹，讓 file:// 下若無法存取也能照常遊玩。
   ============================================================ */
(function (global) {
  var KEY = "senloop_save_v1";

  var Storage = {
    data: null,

    _default: function () {
      return {
        coins: 0,
        shop: {},        // { upgradeId: level }
        knowledge: [],   // 已解鎖的 knowledge id
        lastChar: "ranger"
      };
    },

    load: function () {
      var d = null;
      try {
        var raw = global.localStorage.getItem(KEY);
        if (raw) d = JSON.parse(raw);
      } catch (e) { d = null; }
      if (!d || typeof d !== "object") d = this._default();
      // 補齊缺漏欄位
      var def = this._default();
      for (var k in def) { if (!(k in d)) d[k] = def[k]; }
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

    /* -------- 上次角色 -------- */
    getLastChar: function () { return this.data.lastChar; },
    setLastChar: function (id) { this.data.lastChar = id; this.save(); },

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
