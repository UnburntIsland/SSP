/* ============================================================
   data/knowledge.js  —  永續知識（圖鑑內容，資料驅動）
   玩家在關卡中拾取「知識卡」可依序解鎖。
   ============================================================ */
(function (global) {
  global.GameData = global.GameData || {};

  global.GameData.knowledge = [
    {
      id: "k_plastic",
      title: "塑膠袋與海洋",
      text: "輕薄的塑膠袋容易隨風與水流進入海洋，外型酷似水母，常被海龜等生物誤食而影響攝食與健康。源頭減量與自備購物袋，是最直接的解方。"
    },
    {
      id: "k_cigarette",
      title: "菸蒂的隱形污染",
      text: "菸蒂的濾嘴多由醋酸纖維製成，難以自然分解，還會釋出尼古丁與重金屬等污染物進入土壤與水體。它是全球海灘淨灘中最常見的廢棄物之一。"
    },
    {
      id: "k_battery",
      title: "廢電池要分開回收",
      text: "廢電池若混入一般垃圾或進入環境，可能釋出汞、鎘、鉛等重金屬，污染土壤與地下水。請投入專用回收箱，交由專業處理與資源再利用。"
    },
    {
      id: "k_wetland",
      title: "潮間帶與濕地的價值",
      text: "潮間帶與濕地是眾多生物的棲地與孵育場，也能淨化水質、緩衝風浪與洪水，甚至有可觀的固碳能力，是抵禦環境衝擊的天然防線。"
    },
    {
      id: "k_reduce",
      title: "回收不是終點",
      text: "回收能讓部分材料再利用，但過程仍耗用能源，且並非所有材質都能無限循環。減量（Reduce）與重複使用（Reuse）排在回收之前，才是更根本的選擇。"
    }
  ];

  global.GameData.getKnowledge = function (id) {
    return global.GameData.knowledge.find(function (k) { return k.id === id; });
  };
})(window);
