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

  // 升級前的永續快問快答。answer 為 options 的零起始索引。
  global.GameData.sustainabilityQuestions = [
    {
      id: "q_reduce_first",
      prompt: "要減少一次性塑膠，哪個行動最優先？",
      options: ["全部先丟一般垃圾", "自備可重複使用容器", "買更多塑膠袋備用"],
      answer: 1,
      explanation: "源頭減量與重複使用通常比事後回收更有效。"
    },
    {
      id: "q_battery",
      prompt: "使用完的乾電池應該怎麼處理？",
      options: ["埋進土裡", "和廚餘混在一起", "投入專用回收點"],
      answer: 2,
      explanation: "廢電池可能含重金屬，應交由專用回收系統處理。"
    },
    {
      id: "q_cigarette",
      prompt: "為什麼菸蒂不應丟進排水溝？",
      options: ["可能釋出污染物並流入水體", "會立刻變成肥料", "能幫助魚類築巢"],
      answer: 0,
      explanation: "菸蒂濾嘴難分解，也可能把尼古丁與重金屬帶入水環境。"
    },
    {
      id: "q_wetland",
      prompt: "潮間帶與濕地能提供哪項重要功能？",
      options: ["讓所有海水停止流動", "淨化水質與緩衝洪水", "製造更多一次性用品"],
      answer: 1,
      explanation: "濕地兼具棲地、水質淨化、固碳與防洪等價值。"
    },
    {
      id: "q_recycle",
      prompt: "資源循環的正確優先順序較接近哪一個？",
      options: ["先丟棄、再購買", "只要回收就能無限使用", "減量、重複使用、再回收"],
      answer: 2,
      explanation: "減量與重複使用可直接避免資源消耗，回收則是後續手段。"
    },
    {
      id: "q_energy",
      prompt: "下列哪個做法能直接減少不必要的用電？",
      options: ["整天開著空房照明", "關閉未使用的電器與待機電源", "把冷氣開到最低溫"],
      answer: 1,
      explanation: "減少待機與空轉用電，是容易執行的節能行動。"
    }
  ];

  global.GameData.getKnowledge = function (id) {
    return global.GameData.knowledge.find(function (k) { return k.id === id; });
  };
})(window);
