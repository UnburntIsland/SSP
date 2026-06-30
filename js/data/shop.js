/* ============================================================
   data/shop.js  —  循環商店：永久升級（資料驅動）
   每個升級：id、名稱、最大等級、各級價格 prices[]、各級累計效果 values[]、
   statKey（對應 storage 的 meta 加成）、format（顯示文字）、eduText。
   values[i] = 擁有「等級 i+1」時的累計效果值。
   ============================================================ */
(function (global) {
  global.GameData = global.GameData || {};

  global.GameData.shop = [
    {
      id: "healthy_soil",
      name: "健康土壤",
      iconId: "shop_soil",
      statKey: "bonusMaxHp",
      maxLevel: 5,
      prices: [40, 70, 110, 160, 230],
      values: [10, 22, 36, 52, 70],
      format: function (v) { return "最大生命值 +" + v; },
      eduText: "健康有機質的土壤能蓄水、固碳，是陸地生態的根基。"
    },
    {
      id: "recycling_sort",
      name: "回收分類",
      iconId: "shop_recycle",
      statKey: "coinBonusMult",
      maxLevel: 5,
      prices: [50, 90, 140, 200, 280],
      values: [0.10, 0.20, 0.32, 0.45, 0.60],
      format: function (v) { return "每局循環幣 +" + Math.round(v * 100) + "%"; },
      eduText: "正確分類能提高回收率，讓更多材料真正被再利用。"
    },
    {
      id: "energy_saving",
      name: "節能行動",
      iconId: "shop_energy",
      statKey: "cooldownReduce",
      maxLevel: 5,
      prices: [60, 100, 150, 210, 300],
      values: [0.04, 0.08, 0.12, 0.16, 0.20],
      format: function (v) { return "技能冷卻 -" + Math.round(v * 100) + "%"; },
      eduText: "隨手關燈、選用節能設備，累積起來就是可觀的能源節省。"
    },
    {
      id: "eco_sense",
      name: "生態感知",
      iconId: "shop_eco",
      statKey: "pickupRangeBonus",
      maxLevel: 5,
      prices: [40, 70, 110, 160, 230],
      values: [0.10, 0.20, 0.32, 0.45, 0.60],
      format: function (v) { return "拾取範圍 +" + Math.round(v * 100) + "%"; },
      eduText: "觀察與認識周遭生態，是願意保護環境的第一步。"
    },
    {
      id: "rainwater",
      name: "雨水收集",
      iconId: "shop_rain",
      statKey: "shieldBonus",
      maxLevel: 5,
      prices: [50, 90, 140, 200, 280],
      values: [0.4, 0.8, 1.2, 1.6, 2.0],
      format: function (v) { return "受傷後護盾 +" + v.toFixed(1) + " 秒"; },
      eduText: "收集雨水可用於澆灌與清潔，降低對自來水的依賴。"
    }
  ];

  global.GameData.getShopItem = function (id) {
    return global.GameData.shop.find(function (s) { return s.id === id; });
  };
})(window);
