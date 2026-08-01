/* ============================================================
   gacha.js  —  生態扭蛋核心
   五個角色項目永遠保留；已取得 Skin 永久自獎池移除。
   ============================================================ */
(function (global) {
  function secureIndex(length) {
    if (length <= 1) return 0;
    var cryptoObj = global.crypto;
    if (!cryptoObj || !cryptoObj.getRandomValues) return Math.floor(Math.random() * length);
    var max = 0x100000000;
    var limit = max - (max % length);
    var values = new Uint32Array(1);
    do { cryptoObj.getRandomValues(values); } while (values[0] >= limit);
    return values[0] % length;
  }

  var Gacha = {
    getCost: function () { return (global.GameData && global.GameData.GACHA_COST) || 1000; },

    getPool: function () {
      var pool = [];
      var GD = global.GameData || {};
      (GD.characters || []).forEach(function (ch) {
        pool.push({ type: "character", id: ch.id, character: ch, name: ch.name });
      });
      (GD.skins || []).forEach(function (skin) {
        if (!global.Storage.isSkinOwned(skin.id)) {
          pool.push({ type: "skin", id: skin.id, skin: skin, name: skin.name });
        }
      });
      return pool;
    },

    getOdds: function () {
      var pool = this.getPool();
      var chance = pool.length ? 1 / pool.length : 0;
      return pool.map(function (item) {
        return { type: item.type, id: item.id, name: item.name, chance: chance };
      });
    },

    getPityStatus: function () {
      var pity = global.Storage && global.Storage.getGachaPity
        ? global.Storage.getGachaPity()
        : { sinceNew: 0, totalPulls: 0, guaranteeAt: 10 };
      var guaranteeAt = pity.guaranteeAt || 10;
      var hasNewReward = this.getPool().some(function (candidate) {
        return candidate.type === "skin" || !global.Storage.isCharacterOwned(candidate.id);
      });
      return {
        sinceNew: pity.sinceNew || 0,
        totalPulls: pity.totalPulls || 0,
        guaranteeAt: guaranteeAt,
        hasNewReward: hasNewReward,
        pullsUntilGuarantee: hasNewReward ? Math.max(1, guaranteeAt - (pity.sinceNew || 0)) : 0
      };
    },

    pull: function () {
      var storage = global.Storage;
      var cost = this.getCost();
      if (!storage || storage.getCoins() < cost) return { ok: false, reason: "coins", cost: cost };
      var pool = this.getPool();
      if (!pool.length) return { ok: false, reason: "empty", cost: cost };

      // 先決定並完整寫入結果，再播放動畫；重新整理不會重抽或漏獎。
      var pity = this.getPityStatus();
      var newRewardPool = pool.filter(function (candidate) {
        return candidate.type === "skin" || !storage.isCharacterOwned(candidate.id);
      });
      var guaranteed = pity.sinceNew >= pity.guaranteeAt - 1 && newRewardPool.length > 0;
      var drawPool = guaranteed ? newRewardPool : pool;
      var item = drawPool[secureIndex(drawPool.length)];
      storage.data.coins -= cost;
      var result = {
        ok: true,
        cost: cost,
        poolSize: pool.length,
        item: item,
        guaranteed: guaranteed
      };

      if (item.type === "skin") {
        storage.addOwnedSkin(item.id, false);
        result.kind = "new-skin";
        result.skin = item.skin;
      } else if (storage.isCharacterOwned(item.id)) {
        storage.addCharacterSkillPoints(item.id, 1, false);
        result.kind = "duplicate-character";
        result.character = item.character;
        result.points = 1;
      } else {
        storage.unlockCharacter(item.id, false);
        result.kind = "new-character";
        result.character = item.character;
      }

      storage.recordGachaPull(result.kind !== "duplicate-character", false);
      result.pity = this.getPityStatus();
      storage.addGachaHistory(result, false);
      storage.save();
      result.coins = storage.getCoins();
      return result;
    }
  };

  global.Gacha = Gacha;
})(window);
