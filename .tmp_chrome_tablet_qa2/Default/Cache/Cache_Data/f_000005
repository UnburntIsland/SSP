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
      iconPath: "assets/images/codex/knowledge/icon_plastic_ocean.png?v=codex1",
      text: "輕薄的塑膠袋容易隨風與水流進入海洋，外型酷似水母，常被海龜等生物誤食而影響攝食與健康。源頭減量與自備購物袋，是最直接的解方。"
    },
    {
      id: "k_cigarette",
      title: "菸蒂的隱形污染",
      iconPath: "assets/images/codex/knowledge/icon_cigarette_pollution.png?v=codex1",
      text: "菸蒂的濾嘴多由醋酸纖維製成，難以自然分解，還會釋出尼古丁與重金屬等污染物進入土壤與水體。它是全球海灘淨灘中最常見的廢棄物之一。"
    },
    {
      id: "k_battery",
      title: "廢電池要分開回收",
      iconPath: "assets/images/codex/knowledge/icon_battery_recycling.png?v=codex1",
      text: "廢電池若混入一般垃圾或進入環境，可能釋出汞、鎘、鉛等重金屬，污染土壤與地下水。請投入專用回收箱，交由專業處理與資源再利用。"
    },
    {
      id: "k_wetland",
      title: "潮間帶與濕地的價值",
      iconPath: "assets/images/codex/knowledge/icon_wetland_value.png?v=codex1",
      text: "潮間帶與濕地是眾多生物的棲地與孵育場，也能淨化水質、緩衝風浪與洪水，甚至有可觀的固碳能力，是抵禦環境衝擊的天然防線。"
    },
    {
      id: "k_reduce",
      title: "回收不是終點",
      iconPath: "assets/images/codex/knowledge/icon_reduce_reuse_recycle.png?v=codex1",
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

  global.GameData.sustainabilityQuestions = global.GameData.sustainabilityQuestions.concat([
    {
      id: "q_led_lighting",
      prompt: "教室或家中想節省照明用電，可以怎麼做？",
      options: ["白天也打開所有燈", "使用省電燈具並隨手關燈", "用布蓋住亮著的燈"],
      answer: 1,
      explanation: "善用自然光、選擇高效率燈具並關閉不需要的照明，都能節省用電。"
    },
    {
      id: "q_fridge_door",
      prompt: "拿完冰箱裡的食物後，應該怎麼做？",
      options: ["盡快關好冰箱門", "讓冰箱門一直開著", "反覆開門確認"],
      answer: 0,
      explanation: "減少冰箱冷氣流失，可以降低壓縮機重新降溫所需的電力。"
    },
    {
      id: "q_laundry_load",
      prompt: "洗衣服時，哪個做法較節省水電？",
      options: ["每件衣服分開洗", "適量集中並選合適模式", "每次都使用最多水量"],
      answer: 1,
      explanation: "在不超載的前提下適量集中清洗，可減少洗衣次數與水電消耗。"
    },
    {
      id: "q_secondhand",
      prompt: "只會短期使用的物品，哪種取得方式較節省資源？",
      options: ["用一次就丟掉", "每次都買全新品", "優先借用、交換或買二手"],
      answer: 2,
      explanation: "共享與二手使用能延長物品壽命，也減少製造新品所需的材料。"
    },
    {
      id: "q_repair_clothes",
      prompt: "衣服出現小破洞時，較永續的做法是？",
      options: ["立刻丟棄", "先修補或改造再使用", "丟進排水溝"],
      answer: 1,
      explanation: "修補衣物能延長使用時間，減少紡織品廢棄與新品需求。"
    },
    {
      id: "q_sorting_label",
      prompt: "不確定一件物品能不能回收時，應該怎麼辦？",
      options: ["查看標示與所在地分類規定", "只靠顏色猜測", "全部混在同一袋"],
      answer: 0,
      explanation: "各地回收方式可能不同，依標示與當地規定分類最可靠。"
    },
    {
      id: "q_hazardous_waste",
      prompt: "廢油漆或不明化學品應該怎麼處理？",
      options: ["倒進水溝", "混入一般垃圾", "交給指定回收或清運管道"],
      answer: 2,
      explanation: "化學品可能污染水土，應交由合適的回收或清運系統處理。"
    },
    {
      id: "q_ocean_litter",
      prompt: "海邊的塑膠繩和包裝可能造成什麼影響？",
      options: ["纏住或被海洋生物誤食", "很快自動變成海水", "增加海洋氧氣"],
      answer: 0,
      explanation: "塑膠廢棄物可能造成纏繞、誤食與長期污染。"
    },
    {
      id: "q_fishing_line",
      prompt: "看到廢棄釣魚線時，安全且友善環境的做法是？",
      options: ["留在原地", "剪碎後丟進海裡", "請大人協助收好並妥善丟棄"],
      answer: 2,
      explanation: "釣魚線容易纏繞動物，應在安全情況下收集並妥善處理。"
    },
    {
      id: "q_tree_benefits",
      prompt: "城市中的樹木可以帶來哪項好處？",
      options: ["製造更多塑膠", "提供遮蔭、棲地並吸收二氧化碳", "讓土壤消失"],
      answer: 1,
      explanation: "健康的都市樹木能降溫、提供棲地，並在生長時儲存碳。"
    },
    {
      id: "q_pollinator_garden",
      prompt: "什麼環境較能幫助蜜蜂與蝴蝶等授粉者？",
      options: ["完全沒有植物的水泥地", "堆滿垃圾的角落", "有多樣花朵並減少不必要農藥"],
      answer: 2,
      explanation: "多樣植物能提供食物與棲地，減少不必要的藥劑也能降低傷害。"
    },
    {
      id: "q_release_pet",
      prompt: "無法繼續照顧寵物時，應該怎麼做？",
      options: ["任意放生到河川", "尋求家人、收容或專業協助", "丟到森林裡"],
      answer: 1,
      explanation: "任意放生可能傷害寵物與原生生態，應尋求負責任的安置方式。"
    },
    {
      id: "q_pet_waste",
      prompt: "帶寵物散步時，排泄物應如何處理？",
      options: ["留在步道上", "撿起並依規定妥善處理", "沖進河川"],
      answer: 1,
      explanation: "妥善清理能維持環境衛生，也減少雨水把污染帶進水體。"
    },
    {
      id: "q_wildlife_noise",
      prompt: "觀察野生動物時，哪個做法較合適？",
      options: ["保持距離並降低音量", "追著牠拍照", "播放很大的聲音吸引牠"],
      answer: 0,
      explanation: "安靜並保持距離，可以減少對動物覓食、休息與育幼的干擾。"
    },
    {
      id: "q_leave_no_trace",
      prompt: "到自然環境活動後，哪個做法符合無痕原則？",
      options: ["在樹上刻字", "帶走野生動物", "帶走自己的垃圾並保持原貌"],
      answer: 2,
      explanation: "減少留下的痕跡，能讓棲地與其他遊客都受到較少影響。"
    },
    {
      id: "q_refill_station",
      prompt: "水瓶喝完後，哪個選擇較能減少垃圾？",
      options: ["在安全的補水站重新裝水", "每次都買新瓶子", "把瓶子留在路邊"],
      answer: 0,
      explanation: "重複使用水瓶並補充飲水，可以減少一次性瓶罐。"
    },
    {
      id: "q_paper_double_sided",
      prompt: "使用影印紙時，哪個做法較節省紙張？",
      options: ["每張只寫一個字", "需要時雙面使用", "先弄濕再丟掉"],
      answer: 1,
      explanation: "雙面書寫或列印能提高每張紙的使用效率。"
    },
    {
      id: "q_seasonal_food",
      prompt: "選購食物時，哪個做法較能減少浪費？",
      options: ["一次買遠超過需要的量", "只挑多層包裝產品", "適量選擇當季食材"],
      answer: 2,
      explanation: "按需要購買並選擇當季食材，能降低吃不完與長期保存造成的浪費。"
    },
    {
      id: "q_water_leak",
      prompt: "發現公共飲水設備持續漏水時，應該怎麼做？",
      options: ["假裝沒看到", "告知老師、家人或管理人員", "把水開得更大"],
      answer: 1,
      explanation: "及早通報漏水，能避免水資源長時間流失。"
    },
    {
      id: "q_rain_garden",
      prompt: "雨水花園主要能幫助什麼？",
      options: ["吸收部分雨水並提供小型棲地", "製造一次性塑膠", "阻止所有植物生長"],
      answer: 0,
      explanation: "雨水花園可讓部分雨水滲入土壤，也能種植適合濕潤環境的植物。"
    },
    {
      id: "q_compost_material",
      prompt: "下列哪一項較可能適合進入合規的堆肥系統？",
      options: ["廢電池", "塑膠吸管", "果皮與未沾污染的落葉"],
      answer: 2,
      explanation: "可分解的植物性材料較適合堆肥；電池與塑膠必須分開處理。"
    },
    {
      id: "q_reusable_bag",
      prompt: "自備購物袋後，怎麼做最能發揮它的效益？",
      options: ["每次仍拿很多新袋子", "持續重複使用並保持清潔", "用一次就丟"],
      answer: 1,
      explanation: "耐用物品需要重複使用，才能真正減少一次性用品。"
    },
    {
      id: "q_less_packaging",
      prompt: "購買相似商品時，哪個選擇通常能減少包裝垃圾？",
      options: ["選擇包裝較精簡且符合需求的商品", "選最多層包裝", "把包裝留在店門口"],
      answer: 0,
      explanation: "在符合安全與保存需求下，精簡包裝能減少材料使用與廢棄物。"
    },
    {
      id: "q_shade_cooling",
      prompt: "炎熱天氣時，哪個方法能幫助室內減少冷氣負擔？",
      options: ["讓陽光直射整天", "同時開暖氣", "使用遮陽並保持適當通風"],
      answer: 2,
      explanation: "減少日曬熱量並適當通風，可降低室內累積的熱。"
    },
    {
      id: "q_vehicle_idling",
      prompt: "車輛長時間停等且確認安全時，哪個做法較節能？",
      options: ["持續踩油門", "避免不必要的長時間怠速", "同時開啟所有車燈"],
      answer: 1,
      explanation: "避免不必要怠速，可以減少燃料浪費與空氣污染。"
    },
    {
      id: "q_ac_windows",
      prompt: "冷氣運轉時，通常應該怎麼做？",
      options: ["關好主要門窗，減少冷氣外流", "把窗戶全部打開", "讓冷氣對著戶外吹"],
      answer: 0,
      explanation: "減少冷氣外流能讓設備更有效率，也降低不必要的耗電。"
    },
    {
      id: "q_dripping_tap",
      prompt: "看到水龍頭關不緊一直滴水，應該怎麼辦？",
      options: ["放著不管", "再開大一點", "關妥或請能處理的人協助維修"],
      answer: 2,
      explanation: "小漏水累積久了也會浪費大量水，應及早關妥或修理。"
    },
    {
      id: "q_shorter_shower",
      prompt: "洗澡時哪個做法較節省水與加熱能源？",
      options: ["一直開著水聊天", "縮短不必要的沖水時間", "離開後仍讓水流著"],
      answer: 1,
      explanation: "縮短用水時間能同時節省水，以及加熱熱水所需的能源。"
    },
    {
      id: "q_rechargeable_battery",
      prompt: "經常使用電池的合適設備，可考慮哪個選擇？",
      options: ["依設備規格使用可充電電池", "把用完的電池丟進火裡", "混入廚餘"],
      answer: 0,
      explanation: "在設備允許時，可充電電池能減少一次性電池使用；仍需依規定回收。"
    },
    {
      id: "q_school_action",
      prompt: "想讓班級更永續，哪個做法最適合一起執行？",
      options: ["比賽製造更多垃圾", "把回收物混在一起", "共同訂定節電、減廢與分類行動"],
      answer: 2,
      explanation: "清楚、可執行且能共同追蹤的行動，更容易形成長期習慣。"
    },
    {
      id: "q_feed_wildlife",
      prompt: "在野外遇到動物時，為什麼通常不應任意餵食？",
      options: ["因為動物完全不需要食物", "可能改變牠們的行為與健康", "因為所有食物都會發光"],
      answer: 1,
      explanation: "任意餵食可能讓動物依賴人類，也可能吃到不適合的食物。"
    }
  ]);

  global.GameData.getKnowledge = function (id) {
    return global.GameData.knowledge.find(function (k) { return k.id === id; });
  };
})(window);
