/* ============================================================
   islandSpaces.js — v1.5 土地擴張、林間小屋、生態實驗室與分類回收場
   - 所有消費、每日次數與研究等級都寫入 Storage，會跟著雲端存檔。
   - 回收分類為五題短局；題目與正確桶別只採用本地正式資料。
   ============================================================ */
(function (global) {
  "use strict";

  var EXPANSIONS = [
    { level: 1, id: "living_bank", name: "溪岸生活區", cost: 20, icon: "⌂", description: "開放西北林地與西南步道，解鎖林間小屋。", unlocks: "林間小屋 · 西南步道 · 新建造區" },
    { level: 2, id: "research_coast", name: "生態研發區", cost: 45, icon: "⚗", description: "開放東北平台、東側海岸與回收平台。", unlocks: "生態實驗室 · 分類回收場 · 東側海岸" }
  ];
  var FACILITIES = [
    { id: "cottage", name: "林間小屋", icon: "⌂", level: 1, theme: "cottage", description: "每天回來休息整理一次，領取 50 循環幣。" },
    { id: "laboratory", name: "生態實驗室", icon: "⚗", level: 2, theme: "laboratory", description: "投入再生材料研究，提升自動回收效率與容量。" },
    { id: "recycleYard", name: "分類回收場", icon: "♻", level: 2, theme: "recycle", description: "領取自動回收材料，並用分類挑戰檢查回收知識。" }
  ];
  var RESEARCH = {
    recycleSpeed: { name: "智慧分流輸送帶", icon: "⇢", costs: [15, 25], detail: ["自動回收每 18 秒產出 1 份", "自動回收每 16 秒產出 1 份"] },
    recycleCapacity: { name: "高密度儲料槽", icon: "⬢", costs: [20, 30], detail: ["每日與儲存上限提高到 75", "每日與儲存上限提高到 90"] }
  };
  var SORT_ITEMS = [
    { id: "pet_bottle", name: "喝完的寶特瓶", icon: "🥤", bin: "plastic", lesson: "寶特瓶倒空、簡單沖洗後交給塑膠類回收。" },
    { id: "aluminum_can", name: "乾淨鋁罐", icon: "🥫", bin: "metal", lesson: "鋁罐屬金屬類，壓扁前先確認內容物已清空。" },
    { id: "newspaper", name: "舊報紙", icon: "📰", bin: "paper", lesson: "乾燥、未沾油的報紙可放入紙類回收。" },
    { id: "glass_bottle", name: "玻璃飲料瓶", icon: "🍾", bin: "glass", lesson: "玻璃容器要輕放，並依現場規定分色回收。" },
    { id: "dry_battery", name: "用完的乾電池", icon: "🔋", bin: "battery", lesson: "廢電池含特殊物質，要交給電池回收點，不能混入一般垃圾。" },
    { id: "cardboard", name: "乾淨紙箱", icon: "📦", bin: "paper", lesson: "紙箱拆開壓平、保持乾燥後再回收。" },
    { id: "metal_cap", name: "金屬瓶蓋", icon: "◉", bin: "metal", lesson: "金屬瓶蓋與塑膠瓶身要拆開，分別投入正確類別。" },
    { id: "glass_jar", name: "洗淨玻璃罐", icon: "◌", bin: "glass", lesson: "玻璃罐去除內容物後可交給玻璃類回收。" }
  ];
  var BINS = [
    { id: "plastic", label: "塑膠", icon: "♳" },
    { id: "metal", label: "金屬", icon: "◇" },
    { id: "paper", label: "紙類", icon: "▤" },
    { id: "glass", label: "玻璃", icon: "◈" },
    { id: "battery", label: "電池", icon: "▣" }
  ];

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function todayKey(now, previousKey) {
    if (global.GameClock && global.GameClock.dateKey) return global.GameClock.dateKey(previousKey, now);
    var d = new Date(now == null ? Date.now() : now);
    var key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    return typeof previousKey === "string" && previousKey > key ? previousKey : key;
  }
  function expansion(level) { return EXPANSIONS.find(function (entry) { return entry.level === (level | 0); }) || null; }
  function facility(id) { return FACILITIES.find(function (entry) { return entry.id === id; }) || null; }

  var IslandSpaces = {
    app: null,
    view: "hub",
    message: "",
    game: null,

    init: function (app) {
      this.app = app;
      this.updateMenuBadge();
      var self = this;
      global.addEventListener("game-save-changed", function () { self.updateMenuBadge(); });
      global.addEventListener("cloud-save-applied", function () { self.game = null; self.updateMenuBadge(); });
    },

    getExpansionLevel: function () { return global.Storage.getLobbyExpansionLevel(); },
    getExpansion: expansion,
    getFacility: facility,
    facilities: FACILITIES,
    isUnlocked: function (id) {
      var def = facility(id);
      return !!def && this.getExpansionLevel() >= def.level;
    },
    getResearchLevel: function (id) {
      var spaces = global.Storage.getIslandSpaces();
      return Math.max(0, Math.min(2, spaces.laboratory.research[id] | 0));
    },
    getRecycleInterval: function () { return Math.max(16, 20 - this.getResearchLevel("recycleSpeed") * 2); },
    getRecycleCapacity: function () { return 60 + this.getResearchLevel("recycleCapacity") * 15; },

    updateMenuBadge: function () {
      var badge = global.document.getElementById("island-space-badge");
      var label = global.document.getElementById("island-space-label");
      var level = global.Storage && global.Storage.data ? this.getExpansionLevel() : 0;
      var unlocked = FACILITIES.filter(function (entry) { return entry.level <= level; }).length;
      if (badge) { badge.textContent = unlocked + "/3"; badge.classList.toggle("hidden", unlocked === 3); }
      if (label) label.textContent = level ? "島嶼空間" : "擴張";
    },

    renderHub: function () {
      this.view = "hub";
      this.game = null;
      var root = global.document.getElementById("island-space-content");
      var title = global.document.getElementById("island-space-title");
      var backButton = global.document.querySelector('#screen-island-spaces [data-action="island-space-back"]');
      if (backButton) backButton.classList.add("hidden");
      if (!root) return;
      if (title) title.textContent = "島嶼空間";
      var level = this.getExpansionLevel();
      var materials = global.Storage.getRecycled();
      var next = expansion(level + 1);
      var html = "<div class='island-summary'>" +
        "<div><span>土地開發進度</span><strong>" + level + " / 2</strong><small>已開放 " + FACILITIES.filter(function (entry) { return entry.level <= level; }).length + " 個空間</small></div>" +
        "<div class='island-summary-material'><span>可用再生材料</span><strong>⬢ " + materials + "</strong></div>" +
        (next ? "<button class='btn btn-primary' type='button' data-action='island-go-build'>前往工作台擴張</button>" : "<span class='island-complete'>全島土地已開放</span>") +
        "</div><div class='island-space-grid'>";
      FACILITIES.forEach(function (entry) {
        var unlocked = level >= entry.level;
        html += "<article class='island-space-card " + entry.theme + (unlocked ? " unlocked" : " locked") + "'>" +
          "<div class='island-space-icon' aria-hidden='true'>" + entry.icon + "</div>" +
          "<div class='island-space-copy'><span>" + (unlocked ? "已開放" : "土地擴張 " + entry.level + " 解鎖") + "</span><h3>" + entry.name + "</h3><p>" + entry.description + "</p></div>" +
          "<button class='btn " + (unlocked ? "btn-primary" : "") + "' type='button' data-action='island-open-space' data-space-id='" + entry.id + "' " + (unlocked ? "" : "disabled") + ">" + (unlocked ? "進入" : "尚未開放") + "</button></article>";
      });
      html += "</div>" + (this.message ? "<div class='island-message' role='status'>" + esc(this.message) + "</div>" : "");
      root.innerHTML = html;
      this.updateMenuBadge();
    },

    renderLandCatalog: function (root) {
      if (!root) return;
      var level = this.getExpansionLevel();
      var materials = global.Storage.getRecycled();
      var html = "<div class='land-catalog-intro'><div class='land-catalog-icon'>⌘</div><div><strong>擴張森循島</strong><span>購地後會永久增加可行走與可建造範圍，並開放新的互動空間。</span></div><b>進度 " + level + " / 2</b></div>";
      EXPANSIONS.forEach(function (entry) {
        var owned = level >= entry.level;
        var available = entry.level === level + 1;
        var enough = materials >= entry.cost;
        html += "<article class='land-expansion-card " + (owned ? "owned" : available ? "available" : "locked") + "'>" +
          "<div class='land-expansion-icon' aria-hidden='true'>" + entry.icon + "</div><div class='land-expansion-copy'><span>土地階段 " + entry.level + "</span><h3>" + entry.name + "</h3><p>" + entry.description + "</p><small>開放：" + entry.unlocks + "</small></div>" +
          "<button class='btn " + (available && enough ? "btn-primary" : "") + "' type='button' data-action='island-expand' data-expansion-level='" + entry.level + "' " + (available && enough ? "" : "disabled") + ">" +
          (owned ? "已擴張" : !available ? "先完成前一階段" : enough ? "擴張土地　⬢ " + entry.cost : "還差 ⬢ " + (entry.cost - materials)) + "</button></article>";
      });
      root.innerHTML = html;
    },

    expand: function (level) {
      var def = expansion(level);
      if (!def) return false;
      var result = global.Storage.expandLobbyLand(def.level, def.cost);
      if (!result.ok) {
        this.message = result.reason === "materials" ? "再生材料不足，還差 " + result.missing + " 份。" : "請依序完成土地擴張。";
        if (global.UI) global.UI.showToast("土地尚未擴張", this.message);
        return false;
      }
      this.message = def.name + "已開放，新道路與空間現在可以進入。";
      this.updateMenuBadge();
      if (global.Lobby) { global.Lobby.buildCatalog(); global.Lobby.updateHud(); global.Lobby.updateInteractions(); }
      try { global.dispatchEvent(new CustomEvent("lobby-land-expanded", { detail: { level: def.level } })); } catch (error) {}
      if (global.UI) global.UI.showToast("土地擴張完成", this.message);
      return true;
    },

    renderSpace: function (id) {
      var def = facility(id);
      if (!def || !this.isUnlocked(id)) { this.renderHub(); return; }
      this.view = id;
      var title = global.document.getElementById("island-space-title");
      var backButton = global.document.querySelector('#screen-island-spaces [data-action="island-space-back"]');
      if (backButton) backButton.classList.remove("hidden");
      if (title) title.textContent = def.name;
      if (id === "cottage") this.renderCottage();
      else if (id === "laboratory") this.renderLaboratory();
      else this.renderRecycleYard();
    },

    renderCottage: function () {
      var root = global.document.getElementById("island-space-content");
      var data = global.Storage.getIslandSpaces().cottage;
      var ready = data.lastRestDate !== todayKey(null, data.lastRestDate);
      root.innerHTML = "<div class='facility-hero cottage'><div class='facility-hero-icon'>⌂</div><div><span>生活空間</span><h3>林間小屋</h3><p>把行動裝備整理好，也讓守護者在下一次出發前喘口氣。</p></div></div>" +
        "<div class='facility-layout'><article class='facility-action-card'><span>每日一次</span><h3>休息與整理</h3><p>完成今日整理可領取 50 循環幣。獎勵每天重置，不必在線等待。</p><button class='btn btn-primary' type='button' data-action='cottage-rest' " + (ready ? "" : "disabled") + ">" + (ready ? "完成今日整理　♻ 50" : "今天已整理完成") + "</button></article>" +
        "<article class='facility-stats'><div><span>造訪次數</span><strong>" + (data.visits | 0) + "</strong></div><div><span>累積整理</span><strong>" + (data.restClaims | 0) + "</strong></div><div><span>今日狀態</span><strong>" + (ready ? "可整理" : "已完成") + "</strong></div></article></div>" + this.messageHtml();
    },

    restCottage: function () {
      if (!this.isUnlocked("cottage")) return false;
      var data = global.Storage.getIslandSpaces().cottage;
      var key = todayKey(null, data.lastRestDate);
      if (data.lastRestDate === key) { this.message = "今天已經整理過小屋，明天再回來吧。"; this.renderCottage(); return false; }
      data.lastRestDate = key;
      data.restClaims = (data.restClaims | 0) + 1;
      global.Storage.data.coins = (global.Storage.data.coins | 0) + 50;
      global.Storage.save();
      this.message = "小屋整理完成，獲得 50 循環幣。";
      if (global.UI) { global.UI.updateCoinLabels(); global.UI.showToast("精神恢復！", this.message); }
      this.renderCottage();
      return true;
    },

    renderLaboratory: function () {
      var root = global.document.getElementById("island-space-content");
      var self = this;
      var html = "<div class='facility-hero laboratory'><div class='facility-hero-icon'>⚗</div><div><span>研究空間</span><h3>生態實驗室</h3><p>把回收成果轉化成長期技術，研究效果會套用到自動回收站。</p></div><div class='facility-resource'>⬢ " + global.Storage.getRecycled() + "</div></div><div class='research-grid'>";
      Object.keys(RESEARCH).forEach(function (id) {
        var entry = RESEARCH[id], level = self.getResearchLevel(id), max = level >= 2;
        var cost = max ? 0 : entry.costs[level];
        var enough = global.Storage.getRecycled() >= cost;
        html += "<article class='research-card'><div class='research-icon'>" + entry.icon + "</div><span>研究等級 " + level + " / 2</span><h3>" + entry.name + "</h3><p>" + (max ? entry.detail[1] : entry.detail[level]) + "</p>" +
          "<button class='btn " + (!max && enough ? "btn-primary" : "") + "' type='button' data-action='laboratory-research' data-research-id='" + id + "' " + (max || !enough ? "disabled" : "") + ">" +
          (max ? "研究完成" : enough ? "開始研究　⬢ " + cost : "材料不足　還差 " + (cost - global.Storage.getRecycled())) + "</button></article>";
      });
      html += "</div><div class='research-effect-bar'><span>目前自動回收</span><strong>每 " + this.getRecycleInterval() + " 秒 1 份</strong><strong>每日／儲存上限 " + this.getRecycleCapacity() + "</strong></div>" + this.messageHtml();
      root.innerHTML = html;
    },

    research: function (id) {
      var def = RESEARCH[id];
      if (!def || !this.isUnlocked("laboratory")) return false;
      var spaces = global.Storage.getIslandSpaces(), level = this.getResearchLevel(id);
      if (level >= 2) return false;
      var cost = def.costs[level], lobby = global.Storage.getLobby();
      if ((lobby.materials.recycled | 0) < cost) { this.message = "再生材料不足。"; this.renderLaboratory(); return false; }
      lobby.materials.recycled -= cost;
      spaces.laboratory.research[id] = level + 1;
      if (lobby.recycleGenerator) lobby.recycleGenerator.capacity = this.getRecycleCapacity();
      global.Storage.save();
      this.message = def.name + "已提升到等級 " + (level + 1) + "。";
      if (global.Lobby) global.Lobby.updateHud();
      if (global.UI) global.UI.showToast("研究完成", this.message);
      this.renderLaboratory();
      return true;
    },

    ensureYardDay: function () {
      var yard = global.Storage.getIslandSpaces().recycleYard;
      var key = todayKey(null, yard.dateKey);
      if (yard.dateKey !== key) {
        yard.dateKey = key;
        yard.playsToday = 0;
        yard.activeGame = null;
        this.game = null;
        global.Storage.save();
      }
      return yard;
    },

    renderRecycleYard: function () {
      var root = global.document.getElementById("island-space-content");
      var yard = this.ensureYardDay();
      if (!this.game && yard.activeGame) this.restoreRecycleGame(yard);
      var status = global.LobbyEconomy.getStatus();
      var html = "<div class='facility-hero recycle'><div class='facility-hero-icon'>♻</div><div><span>實作空間</span><h3>分類回收場</h3><p>自動累積不需要掛機；有空時再來領取，或完成五件物品分類挑戰。</p></div></div>" +
        "<div class='recycle-yard-status'><div><span>待領材料</span><strong>⬢ " + status.unclaimed + " / " + status.capacity + "</strong><small>下一份約 " + (status.secondsToNext == null ? "—" : status.secondsToNext + " 秒") + "</small></div>" +
        "<button class='btn btn-primary' type='button' data-action='recycle-yard-collect' " + (status.unclaimed > 0 ? "" : "disabled") + ">" + (status.unclaimed > 0 ? "領取全部材料" : "持續自動累積中") + "</button>" +
        "<div><span>今日挑戰</span><strong>" + yard.playsToday + " / 3</strong><small>最佳 " + yard.bestScore + " / 5</small></div></div>";
      if (!this.game) {
        html += "<article class='sorting-start'><div class='sorting-start-icon'>◎</div><div><span>互動小遊戲</span><h3>五件物品分類挑戰</h3><p>把每件物品放進正確桶子。每答對一題獲得 2 份材料，全對再加 3 份；進度會自動保存，完成時才計入每日次數。</p></div><button class='btn btn-primary' type='button' data-action='recycle-game-start' " + (yard.playsToday < 3 ? "" : "disabled") + ">" + (yard.playsToday < 3 ? "開始分類" : "今日次數已用完") + "</button></article>";
      } else if (this.game.finished) {
        html += "<article class='sorting-result'><span>分類完成</span><strong>" + this.game.correct + " / 5</strong><p>獲得 ⬢ " + this.game.reward + " 再生材料。" + (this.game.correct === 5 ? " 全部分類正確，獲得完美獎勵！" : " 可參考每題提示，下次再挑戰。") + "</p><button class='btn' type='button' data-action='recycle-game-dismiss'>完成</button></article>";
      } else {
        var item = this.game.items[this.game.index];
        html += "<article class='sorting-game'><div class='sorting-progress'><span>第 " + (this.game.index + 1) + " / 5 件</span><strong>答對 " + this.game.correct + "</strong></div>" +
          "<div class='sorting-item'><span aria-hidden='true'>" + item.icon + "</span><h3>" + item.name + "</h3><p>應該放進哪一類回收桶？</p></div>" +
          (this.game.feedback ? "<div class='sorting-feedback " + (this.game.feedback.correct ? "correct" : "wrong") + "'><strong>" + (this.game.feedback.correct ? "分類正確" : "正確分類是「" + this.binLabel(item.bin) + "」") + "</strong><span>" + esc(this.game.feedback.lesson) + "</span></div>" : "");
        if (this.game.awaitingNext) {
          html += "<button class='btn btn-primary sorting-next' type='button' data-action='recycle-sort-next'>" + (this.game.index + 1 >= this.game.items.length ? "查看結果" : "下一題") + "</button>";
        } else {
          html += "<div class='sorting-bins'>";
          BINS.forEach(function (bin) { html += "<button type='button' data-action='recycle-sort-choice' data-bin-id='" + bin.id + "'><span>" + bin.icon + "</span><strong>" + bin.label + "</strong></button>"; });
          html += "</div>";
        }
        html += "</article>";
      }
      root.innerHTML = html + this.messageHtml();
    },

    collectRecycle: function () {
      var amount = global.LobbyEconomy.collect();
      this.message = amount > 0 ? "已領取 " + amount + " 份再生材料。" : "目前沒有待領材料。";
      if (global.Lobby) global.Lobby.updateHud();
      if (global.UI) global.UI.showToast(amount > 0 ? "回收完成" : "回收站運作中", this.message);
      this.renderRecycleYard();
      return amount;
    },

    startRecycleGame: function () {
      var yard = this.ensureYardDay();
      if (!this.isUnlocked("recycleYard") || yard.playsToday >= 3) return false;
      if (yard.activeGame && this.restoreRecycleGame(yard)) { this.renderRecycleYard(); return true; }
      var offset = (yard.totalSorted + yard.playsToday + 1) % SORT_ITEMS.length;
      var items = [];
      for (var i = 0; i < 5; i++) items.push(SORT_ITEMS[(offset + i) % SORT_ITEMS.length]);
      this.game = { items: items, index: 0, correct: 0, feedback: null, awaitingNext: false, finished: false, reward: 0 };
      this.persistRecycleGame(yard);
      this.message = "";
      this.renderRecycleYard();
      return true;
    },

    sortChoice: function (binId) {
      if (!this.game || this.game.finished || this.game.awaitingNext) return false;
      var item = this.game.items[this.game.index];
      var correct = item.bin === binId;
      if (correct) this.game.correct += 1;
      this.game.feedback = { correct: correct, lesson: item.lesson };
      this.game.awaitingNext = true;
      this.persistRecycleGame(this.ensureYardDay());
      this.renderRecycleYard();
      return correct;
    },

    nextSortItem: function () {
      if (!this.game || this.game.finished || !this.game.awaitingNext) return false;
      var yard = this.ensureYardDay();
      if (!this.game) { this.renderRecycleYard(); return false; }
      this.game.index += 1;
      if (this.game.index >= this.game.items.length) {
        this.game.finished = true;
        this.game.awaitingNext = false;
        this.game.reward = this.game.correct * 2 + (this.game.correct === 5 ? 3 : 0);
        yard.playsToday = Math.min(3, (yard.playsToday | 0) + 1);
        yard.bestScore = Math.max(yard.bestScore | 0, this.game.correct);
        yard.totalSorted = (yard.totalSorted | 0) + this.game.correct;
        yard.activeGame = null;
        global.Storage.getLobby().materials.recycled += this.game.reward;
        global.Storage.save();
        if (global.Lobby) global.Lobby.updateHud();
      } else {
        this.game.feedback = null;
        this.game.awaitingNext = false;
        this.persistRecycleGame(this.ensureYardDay());
      }
      this.renderRecycleYard();
      return true;
    },

    persistRecycleGame: function (yard) {
      if (!yard || !this.game || this.game.finished) return false;
      yard.activeGame = {
        itemIds: this.game.items.map(function (item) { return item.id; }),
        index: this.game.index | 0,
        correct: this.game.correct | 0,
        awaitingNext: this.game.awaitingNext === true,
        feedbackCorrect: this.game.feedback ? this.game.feedback.correct === true : null
      };
      global.Storage.save();
      return true;
    },

    restoreRecycleGame: function (yard) {
      var saved = yard && yard.activeGame;
      if (!saved || !Array.isArray(saved.itemIds) || saved.itemIds.length !== 5) return false;
      var items = saved.itemIds.map(function (id) { return SORT_ITEMS.find(function (item) { return item.id === id; }); });
      if (items.some(function (item) { return !item; })) { yard.activeGame = null; global.Storage.save(); return false; }
      var index = Math.max(0, Math.min(4, saved.index | 0));
      this.game = {
        items: items,
        index: index,
        correct: Math.max(0, Math.min(5, saved.correct | 0)),
        feedback: typeof saved.feedbackCorrect === "boolean" ? { correct: saved.feedbackCorrect, lesson: items[index].lesson } : null,
        awaitingNext: saved.awaitingNext === true,
        finished: false,
        reward: 0
      };
      return true;
    },

    binLabel: function (id) {
      var bin = BINS.find(function (entry) { return entry.id === id; });
      return bin ? bin.label : id;
    },

    dismissGame: function () { this.game = null; this.message = "分類成果已保存。"; this.renderRecycleYard(); },
    messageHtml: function () { return this.message ? "<div class='island-message' role='status'>" + esc(this.message) + "</div>" : ""; },

    back: function () {
      if (this.view !== "hub") { this.message = ""; this.renderHub(); return true; }
      return false;
    }
  };

  global.IslandSpaces = IslandSpaces;
})(window);
