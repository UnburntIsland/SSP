/* ============================================================
   main.js  —  App 控制器：載入存檔、畫面路由、串接 UI 與 Game
   是整個程式的進入點（最後載入）。
   ============================================================ */
(function (global) {

  var STAGE_ID = "tidal_flat";

  var SCREENS = {
    menu: "screen-menu",
    characters: "screen-characters",
    shop: "screen-shop",
    codex: "screen-codex",
    victory: "screen-victory",
    gameover: "screen-gameover"
  };

  var App = {
    boot: function () {
      global.Storage.load();
      this.canvas = document.getElementById("game-canvas");
      this.ui = global.UI;
      this.ui.init(this);
      global.Game.init(this.canvas, this);

      this.selectedChar = global.Storage.getLastChar() || "ranger";
      if (!global.GameData.getCharacter(this.selectedChar)) this.selectedChar = "ranger";

      this.wireButtons();
      this.ui.updateCoinLabels();
      this.showScreen("menu");
    },

    wireButtons: function () {
      var self = this;
      var root = document.getElementById("game-root");
      root.addEventListener("click", function (e) {
        var t = e.target;
        while (t && t !== root && !t.dataset.action) t = t.parentNode;
        if (!t || !t.dataset || !t.dataset.action) return;
        self.handleAction(t.dataset.action);
      });
    },

    handleAction: function (action) {
      switch (action) {
        case "play":       this.startRun(this.selectedChar); break;
        case "characters": this.showScreen("characters"); this.ui.buildCharacters(this.selectedChar); break;
        case "shop":       this.showScreen("shop"); this.ui.buildShop(); this.ui.updateCoinLabels(); break;
        case "codex":      this.showScreen("codex"); this.ui.buildCodex(); break;
        case "start":      this.startRun(this.selectedChar); break;
        case "back":       this.showScreen("menu"); this.ui.updateCoinLabels(); break;
        case "menu":       this.showScreen("menu"); this.ui.updateCoinLabels(); break;
        case "reset":      this.resetSave(); break;
      }
    },

    showScreen: function (name) {
      // 隱藏所有畫面 + HUD + 升級面板
      for (var key in SCREENS) {
        var s = document.getElementById(SCREENS[key]);
        if (s) s.classList.add("hidden");
      }
      this.ui.showHUD(false);
      this.ui.hideLevelUp();

      if (name && SCREENS[name]) {
        document.getElementById(SCREENS[name]).classList.remove("hidden");
      }
    },

    /* ---------------- 角色 / 商店 ---------------- */
    selectCharacter: function (id) {
      this.selectedChar = id;
      global.Storage.setLastChar(id);
      this.ui.buildCharacters(id);
    },

    buyUpgrade: function (id) {
      var item = global.GameData.getShopItem(id);
      if (!item) return;
      var res = global.Storage.buyShopUpgrade(item);
      if (res.ok) {
        this.ui.showToast("升級成功", item.name + " → 等級 " + res.level);
      } else if (res.reason === "coins") {
        this.ui.showToast("循環幣不足", "再淨化幾波污染潮，攢點循環幣吧。");
      }
      this.ui.buildShop();
      this.ui.updateCoinLabels();
    },

    resetSave: function () {
      var ok = global.confirm("確定要重置所有存檔嗎？循環幣、商店升級與圖鑑都會清空。");
      if (!ok) return;
      global.Storage.reset();
      this.selectedChar = "ranger";
      this.ui.updateCoinLabels();
      this.showScreen("menu");
    },

    /* ---------------- 一局生命週期 ---------------- */
    startRun: function (charId) {
      var character = global.GameData.getCharacter(charId) || global.GameData.characters[0];
      var meta = global.Storage.getMetaBonuses();
      var player = new global.Player(character, meta);

      this.showScreen(null);     // 隱藏所有選單
      this.ui.showHUD(true);
      this.ui._hudSig = "";      // 強制重建技能列
      global.Game.resize();
      global.Game.start(STAGE_ID, player);
    },

    onLevelUp: function (options, cb) {
      this.ui.showLevelUp(options, cb);
    },

    onRunEnd: function (stats) {
      this.ui.showHUD(false);
      this.ui.buildResult(stats);
      this.showScreen(stats.result === "victory" ? "victory" : "gameover");
      this.ui.updateCoinLabels();
    },

    onKnowledgeUnlocked: function (entry) {
      this.ui.showToast("解鎖永續知識", entry.title + "（已收入圖鑑）");
    },

    showToast: function (title, text) {
      this.ui.showToast(title, text);
    }
  };

  global.App = App;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { App.boot(); });
  } else {
    App.boot();
  }
})(window);
