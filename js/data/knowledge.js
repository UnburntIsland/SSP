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
    },
    {
      id: "q_food_waste",
      prompt: "吃不完的食物最好的第一步是什麼？",
      options: ["先拿剛好吃得完的份量", "全部沖進水槽", "直接丟在戶外"],
      answer: 0,
      explanation: "先減少食物浪費最有效；可堆肥的廚餘再依當地規定分類。"
    },
    {
      id: "q_save_water",
      prompt: "刷牙時怎麼做比較節水？",
      options: ["讓水一直流", "用更多熱水", "刷牙時先關水龍頭"],
      answer: 2,
      explanation: "不需要用水時先關掉水龍頭，可以減少大量不必要的用水。"
    },
    {
      id: "q_e_waste",
      prompt: "還能修理的電子用品，較永續的做法是？",
      options: ["先維修或延長使用時間", "立刻丟一般垃圾", "丟進河川"],
      answer: 0,
      explanation: "維修與延長使用壽命能減少電子廢棄物，也節省製造新品所需資源。"
    },
    {
      id: "q_transport",
      prompt: "短程移動時，哪個選擇通常較低碳？",
      options: ["一個人開車繞遠路", "步行、騎單車或搭大眾運輸", "讓車子原地空轉"],
      answer: 1,
      explanation: "步行、單車與大眾運輸通常能降低每人的能源消耗與排放。"
    },
    {
      id: "q_native_species",
      prompt: "種植適合當地環境的原生植物有什麼幫助？",
      options: ["讓所有昆蟲消失", "增加一次性垃圾", "提供在地生物食物與棲地"],
      answer: 2,
      explanation: "原生植物與在地生物長期共同適應，能支持授粉昆蟲與生物多樣性。"
    },
    {
      id: "q_recycling_clean",
      prompt: "回收容器送進回收前，通常應先怎麼做？",
      options: ["依規定倒空並簡單清潔", "裝滿廚餘", "和危險物品混在一起"],
      answer: 0,
      explanation: "倒空並依地方規定分類，可降低回收物被污染而無法再利用的機會。"
    },
    {
      id: "q_microplastic",
      prompt: "減少微塑膠進入環境，可以從哪件事開始？",
      options: ["把塑膠碎片掃進排水溝", "減少一次性塑膠並妥善丟棄", "在海邊留下垃圾"],
      answer: 1,
      explanation: "塑膠破碎後可能形成微塑膠，源頭減量與妥善處理都很重要。"
    },
    {
      id: "q_air_conditioner",
      prompt: "使用冷氣時，哪個做法較節能？",
      options: ["門窗全開", "沒人在房間也持續開著", "搭配風扇並避免設定過低溫"],
      answer: 2,
      explanation: "減少冷氣負擔並讓空氣循環，可以在維持舒適時降低耗電。"
    },
    {
      id: "q_renewable",
      prompt: "下列哪一組屬於再生能源？",
      options: ["太陽能與風力", "煤與石油", "一次性電池與塑膠"],
      answer: 0,
      explanation: "太陽與風能可由自然循環持續補充，使用時不需燃燒化石燃料。"
    },
    {
      id: "q_cleanup_safety",
      prompt: "淨灘時看到尖銳或不明廢棄物，應該怎麼做？",
      options: ["徒手快速撿起", "請大人或工作人員用合適工具處理", "踢進海裡"],
      answer: 1,
      explanation: "安全比速度重要；尖銳與危險廢棄物應由有防護與工具的人員處理。"
    },
    {
      id: "q_biodiversity",
      prompt: "生物多樣性較高的環境，通常有什麼優點？",
      options: ["只有一種生物能生存", "不再需要乾淨水源", "生態系面對變化時較有韌性"],
      answer: 2,
      explanation: "多樣的物種彼此支援，能讓生態系在疾病或環境變化下更有恢復力。"
    },
    {
      id: "q_reuse_bottle",
      prompt: "外出買飲料時，哪個行動能減少一次性容器？",
      options: ["每次多拿幾個杯子", "自備可重複使用的水瓶或杯子", "把杯子留在路邊"],
      answer: 1,
      explanation: "重複使用容器能直接減少一次性用品的製造與廢棄量。"
    },
    {
      id: "q_rainwater",
      prompt: "收集雨水較適合用在哪裡？",
      options: ["澆灌植物或清潔地面", "不處理就直接飲用", "倒進裝有廢油的桶子"],
      answer: 0,
      explanation: "妥善收集的雨水可用於澆灌或清潔，飲用則需要符合安全處理標準。"
    }
  ];

  global.GameData.getKnowledge = function (id) {
    return global.GameData.knowledge.find(function (k) { return k.id === id; });
  };
})(window);
