/* ============================================================
   main.js  —  App 控制器：狀態機、畫面路由、暫停/設定/確認、ESC/P 快捷鍵
   是整個程式的進入點（最後載入）。
   狀態：HOME / CHARACTER_SELECT / SHOP / CODEX / SETTINGS_FROM_HOME /
        PLAYING / PAUSED / SETTINGS_FROM_PAUSE / CONFIRM_HOME /
        CONFIRM_RESTART / GAME_OVER / VICTORY
   ============================================================ */
(function (global) {

  var STAGE_ID = "tidal_flat";

  var SCREENS = {
    menu: "screen-menu",
    characters: "screen-characters",
    shop: "screen-shop",
    codex: "screen-codex",
    settings: "screen-settings",
    victory: "screen-victory",
    gameover: "screen-gameover"
  };

  var App = {
    state: "HOME",
    settingsReturn: "home",

    boot: function () {
      global.Storage.load();
      if (global.AudioManager) global.AudioManager.init();   // 在 Storage.load 之後再同步一次設定

      this.canvas = document.getElementById("game-canvas");
      this.ui = global.UI;
      this.ui.init(this);
      global.Game.init(this.canvas, this);

      this.selectedChar = global.Storage.getLastChar() || "ranger";
      if (!global.GameData.getCharacter(this.selectedChar)) this.selectedChar = "ranger";
      this.currentChar = this.selectedChar;

      this.wireButtons();
      this.bindKeys();
      this.ui.updateCoinLabels();
      this.ui.refreshSettings();
      this.showScreen("menu");
      this.setState("HOME");
    },

    setState: function (s) { this.state = s; },

    wireButtons: function () {
      var self = this;
      var root = document.getElementById("game-root");
      root.addEventListener("click", function (e) {
        var t = e.target;
        while (t && t !== root && !(t.dataset && t.dataset.action)) t = t.parentNode;
        if (!t || !t.dataset || !t.dataset.action) return;
        if (global.AudioManager) global.AudioManager.playSfx("click");
        self.handleAction(t.dataset.action);
      });
    },

    bindKeys: function () {
      var self = this;
      global.addEventListener("keydown", function (e) {
        if (e.repeat) return;
        var c = e.code;
        if (c !== "Escape" && c !== "KeyP") return;
        // 升級選擇進行中：ESC/P 不作用，交給升級面板（避免破壞升級流程）
        if (self.ui.isLevelUpVisible()) return;

        var st = self.state;
        if (st === "PLAYING") { e.preventDefault(); self.pause(); }
        else if (st === "PAUSED") { e.preventDefault(); self.resume(); }
        else if (c === "Escape") {
          if (st === "SETTINGS_FROM_PAUSE" || st === "SETTINGS_FROM_HOME") { e.preventDefault(); self.closeSettings(); }
          else if (st === "CONFIRM_HOME" || st === "CONFIRM_RESTART") { e.preventDefault(); self.confirmCancel(); }
          else if (st === "CHARACTER_SELECT" || st === "SHOP" || st === "CODEX") { e.preventDefault(); self.handleAction("back"); }
        }
      });
    },

    handleAction: function (action) {
      switch (action) {
        // 首頁
        case "play":          this.startRun(this.selectedChar); break;
        case "characters":    this.showScreen("characters"); this.ui.buildCharacters(this.selectedChar); this.setState("CHARACTER_SELECT"); break;
        case "shop":          this.showScreen("shop"); this.ui.buildShop(); this.ui.updateCoinLabels(); this.setState("SHOP"); break;
        case "codex":         this.showScreen("codex"); this.ui.buildCodex(); this.setState("CODEX"); break;
        case "settings-home": this.openSettings("home"); break;
        case "start":         this.startRun(this.selectedChar); break;
        case "back":          this.showScreen("menu"); this.ui.updateCoinLabels(); this.setState("HOME"); break;
        case "menu":          this.showScreen("menu"); this.ui.updateCoinLabels(); this.setState("HOME"); break;
        case "reset":         this.resetSave(); break;

        // 暫停選單
        case "resume":         this.resume(); break;
        case "settings-pause": this.openSettings("pause"); break;
        case "ask-restart":    this.askConfirm("restart"); break;
        case "ask-home":       this.askConfirm("home"); break;

        // 設定
        case "settings-back":  this.closeSettings(); break;

        // 確認視窗
        case "confirm-cancel": this.confirmCancel(); break;
        case "confirm-ok":     this.confirmOk(); break;
      }
    },

    showScreen: function (name) {
      for (var key in SCREENS) {
        var s = document.getElementById(SCREENS[key]);
        if (s) s.classList.add("hidden");
      }
      this.ui.showHUD(false);
      this.ui.hideLevelUp();
      this.ui.showPause(false);
      this.ui.showConfirm(false);
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
      if (global.AudioManager) global.AudioManager.init();
      this.selectedChar = "ranger";
      this.ui.updateCoinLabels();
      this.ui.refreshSettings();
      this.showScreen("menu");
      this.setState("HOME");
    },

    /* ---------------- 設定畫面 ---------------- */
    openSettings: function (origin) {
      this.settingsReturn = origin;
      this.ui.showPause(false);
      this.showScreen("settings");
      this.ui.refreshSettings();
      this.setState(origin === "home" ? "SETTINGS_FROM_HOME" : "SETTINGS_FROM_PAUSE");
    },

    closeSettings: function () {
      var s = document.getElementById("screen-settings");
      if (s) s.classList.add("hidden");
      if (this.settingsReturn === "home") {
        this.showScreen("menu");
        this.ui.updateCoinLabels();
        this.setState("HOME");
      } else {
        // 從暫停進入 → 返回暫停選單，絕不恢復遊戲
        this.ui.showHUD(true);
        this.ui.showPause(true);
        this.setState("PAUSED");
      }
    },

    /* ---------------- 暫停 / 繼續 ---------------- */
    pause: function () {
      if (!global.Game.pauseGame()) return;
      this.ui.showPause(true);
      this.setState("PAUSED");
    },

    resume: function () {
      this.ui.showPause(false);
      global.Game.resumeGame();
      this.setState("PLAYING");
    },

    /* ---------------- 確認視窗（回首頁 / 重新開始） ---------------- */
    askConfirm: function (type) {
      if (type === "home") {
        this.ui.setConfirm("確定要回到首頁嗎？", "目前這局進度將不會保存。", "確認回首頁");
      } else {
        this.ui.setConfirm("確定要重新開始本關嗎？", "目前這局進度將重置；永久升級與存檔不受影響。", "確認重新開始");
      }
      this.ui.showPause(false);
      this.ui.showConfirm(true);
      this.setState(type === "home" ? "CONFIRM_HOME" : "CONFIRM_RESTART");
    },

    confirmCancel: function () {
      this.ui.showConfirm(false);
      this.ui.showPause(true);
      this.setState("PAUSED");
    },

    confirmOk: function () {
      if (this.state === "CONFIRM_HOME") this.doReturnHome();
      else if (this.state === "CONFIRM_RESTART") this.doRestart();
    },

    doReturnHome: function () {
      this.ui.showConfirm(false);
      this.ui.showPause(false);
      if (global.AudioManager) global.AudioManager.stopMusic();
      global.Game.abort();          // 清空敵人/子彈/掉落物/計時器/暫停狀態
      this.showScreen("menu");
      this.ui.updateCoinLabels();
      this.setState("HOME");
    },

    doRestart: function () {
      this.ui.showConfirm(false);
      this.ui.showPause(false);
      global.Game.abort();
      this.startRun(this.currentChar || this.selectedChar);   // 不重置商店升級 / localStorage
    },

    /* ---------------- 一局生命週期 ---------------- */
    startRun: function (charId) {
      var character = global.GameData.getCharacter(charId) || global.GameData.characters[0];
      this.currentChar = character.id;
      var meta = global.Storage.getMetaBonuses();
      var player = new global.Player(character, meta);

      this.showScreen(null);     // 隱藏所有選單與覆蓋層
      this.ui.showHUD(true);
      this.ui._hudSig = "";
      global.Game.resize();
      global.Game.start(STAGE_ID, player);
      if (global.AudioManager) global.AudioManager.playMusic("stage");
      this.setState("PLAYING");
    },

    onLevelUp: function (options, cb) {
      this.ui.showLevelUp(options, cb);
    },

    onRunEnd: function (stats) {
      this.ui.showHUD(false);
      if (global.AudioManager) global.AudioManager.stopMusic();
      this.ui.buildResult(stats);
      this.showScreen(stats.result === "victory" ? "victory" : "gameover");
      this.ui.updateCoinLabels();
      this.setState(stats.result === "victory" ? "VICTORY" : "GAME_OVER");
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
