/* ============================================================
   main.js  —  App 控制器：狀態機、畫面路由、暫停/設定/確認、ESC/P 快捷鍵
   是整個程式的進入點（最後載入）。
   狀態：HOME / CHARACTER_SELECT / SHOP / CODEX / SETTINGS_FROM_HOME /
        PLAYING / PAUSED / SETTINGS_FROM_PAUSE / CONFIRM_HOME /
        CONFIRM_RESTART / CONFIRM_RESET / GAME_OVER / VICTORY
   ============================================================ */
(function (global) {

  var DEFAULT_STAGE_ID = "tidal_flat";

  var SCREENS = {
    menu: "screen-menu",
    characters: "screen-characters",
    gacha: "screen-gacha",
    shop: "screen-shop",
    achievements: "screen-achievements",
    codex: "screen-codex",
    help: "screen-help",
    settings: "screen-settings",
    victory: "screen-victory",
    gameover: "screen-gameover"
  };

  var App = {
    state: "HOME",
    settingsReturn: "home",
    selectedCharacterId: "ranger",
    currentSelectedCharacter: "ranger",
    candidateCharacterId: "ranger",
    selectedStageId: DEFAULT_STAGE_ID,
    currentStageId: DEFAULT_STAGE_ID,
    stageSwipeStartX: null,
    pendingCharacterStats: { attack: 0, speed: 0, hp: 0 },
    gachaDrawing: false,

    boot: function () {
      global.Storage.load();
      if (global.TestMode && global.TestMode.unlockStages && global.GameData && global.GameData.stages) {
        global.GameData.stages.forEach(function (stage) { global.Storage.markStageCleared(stage.id); });
      }
      if (global.AudioManager) global.AudioManager.init();   // 在 Storage.load 之後再同步一次設定

      this.selectedCharacterId = this.loadSelectedCharacter();
      this.currentSelectedCharacter = this.selectedCharacterId;
      this.candidateCharacterId = this.selectedCharacterId;
      this.selectedChar = this.selectedCharacterId; // 相容既有測試與舊程式碼
      this.currentChar = this.selectedCharacterId;
      this.selectedStageId = this.loadSelectedStage();
      this.currentStageId = this.selectedStageId;

      this.canvas = document.getElementById("game-canvas");
      this.ui = global.UI;
      this.ui.init(this);
      global.Game.init(this.canvas, this);
      if (global.Input && global.Input.attachMouse) global.Input.attachMouse(this.canvas);

      this.wireButtons();
      this.wireStageSelector();
      this.bindKeys();
      this.ui.updateCoinLabels();
      if (this.ui.updateAchievementMenuBadge) this.ui.updateAchievementMenuBadge();
      this.ui.updateHomeCharacterPreview(this.selectedCharacterId);
      this.updateStageSelector();
      this.ui.refreshSettings();
      this.showScreen("menu");
      this.setState("HOME");
    },

    setState: function (s) { this.state = s; },

    loadSelectedCharacter: function () {
      var id = global.Storage.loadSelectedCharacter ? global.Storage.loadSelectedCharacter() : global.Storage.getLastChar();
      var character = global.GameData.getCharacter(id) || global.GameData.getCharacter("ranger");
      return character ? character.id : "ranger";
    },

    saveSelectedCharacter: function (id) {
      var character = global.GameData.getCharacter(id) || global.GameData.getCharacter("ranger");
      id = character ? character.id : "ranger";
      if (global.Storage.isCharacterOwned && !global.Storage.isCharacterOwned(id)) return false;
      var saved = true;
      if (global.Storage.saveSelectedCharacter) saved = global.Storage.saveSelectedCharacter(id);
      else global.Storage.setLastChar(id);
      if (saved === false) return false;
      this.selectedCharacterId = id;
      this.currentSelectedCharacter = id;
      this.selectedChar = id;
      if (this.ui) this.ui.updateHomeCharacterPreview(id);
      return true;
    },

    loadSelectedStage: function () {
      var testStage = global.TestMode && global.TestMode.enabled && global.TestMode.stageId;
      if (testStage && global.GameData.getStage(testStage)) return testStage;
      return global.Storage.loadSelectedStage ? global.Storage.loadSelectedStage() : DEFAULT_STAGE_ID;
    },

    stageUnlocked: function (id) {
      if (global.TestMode && global.TestMode.enabled && global.TestMode.stageId === id) return true;
      return global.Storage.isStageUnlocked ? global.Storage.isStageUnlocked(id) : id === DEFAULT_STAGE_ID;
    },

    saveSelectedStage: function (id) {
      if (!global.GameData.getStage(id) || !this.stageUnlocked(id)) return false;
      this.selectedStageId = id;
      if (global.Storage.saveSelectedStage) global.Storage.saveSelectedStage(id);
      this.updateStageSelector();
      return true;
    },

    characterPreviewData: function (id) {
      id = id || this.selectedCharacterId || "ranger";
      var ch = global.GameData.getCharacter(id) || global.GameData.getCharacter("ranger") || global.GameData.characters[0];
      var skill = ch ? global.GameData.getSkill(ch.startingSkill) : null;
      var skin = ch && global.Storage.getEquippedSkin ? global.GameData.getSkin(global.Storage.getEquippedSkin(ch.id)) : null;
      return { character: ch, skill: skill, skin: skin };
    },

    wireButtons: function () {
      var self = this;
      var root = document.getElementById("game-root");
      root.addEventListener("click", function (e) {
        var t = e.target;
        while (t && t !== root && !(t.dataset && t.dataset.action)) t = t.parentNode;
        if (!t || !t.dataset || !t.dataset.action) return;
        if (global.AudioManager) global.AudioManager.playSfx("click");
        self.handleAction(t.dataset.action, t);
      });
    },

    wireStageSelector: function () {
      var self = this;
      var card = document.getElementById("stage-carousel-card");
      if (!card) return;
      card.addEventListener("pointerdown", function (e) {
        if (e.target && e.target.closest && e.target.closest("button")) return;
        self.stageSwipeStartX = e.clientX;
        if (card.setPointerCapture) card.setPointerCapture(e.pointerId);
      });
      card.addEventListener("pointerup", function (e) {
        if (self.stageSwipeStartX == null) return;
        var delta = e.clientX - self.stageSwipeStartX;
        self.stageSwipeStartX = null;
        if (card.releasePointerCapture && card.hasPointerCapture && card.hasPointerCapture(e.pointerId)) {
          card.releasePointerCapture(e.pointerId);
        }
        if (Math.abs(delta) < 48) return;
        self.cycleStage(delta < 0 ? 1 : -1);
      });
      card.addEventListener("pointercancel", function () { self.stageSwipeStartX = null; });
      card.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        self.cycleStage(e.key === "ArrowRight" ? 1 : -1);
      });
    },

    bindKeys: function () {
      var self = this;
      global.addEventListener("keydown", function (e) {
        if (e.repeat) return;
        var c = e.code;
        if (c !== "Escape" && c !== "KeyP") return;
        if (c === "Escape" && self.ui.isGachaResultVisible && self.ui.isGachaResultVisible()) {
          e.preventDefault();
          self.confirmGachaResult();
          return;
        }
        if (self.ui.isKnowledgeVisible && self.ui.isKnowledgeVisible()) { e.preventDefault(); return; }
        // 升級選擇進行中：ESC/P 不作用，交給升級面板（避免破壞升級流程）
        if (self.ui.isLevelUpVisible()) return;

        var st = self.state;
        if (st === "PLAYING") { e.preventDefault(); self.pause(); }
        else if (st === "PAUSED") { e.preventDefault(); self.resume(); }
        else if (c === "Escape") {
          if (st === "SETTINGS_FROM_PAUSE" || st === "SETTINGS_FROM_HOME") { e.preventDefault(); self.closeSettings(); }
          else if (st === "CONFIRM_HOME" || st === "CONFIRM_RESTART" || st === "CONFIRM_RESET") { e.preventDefault(); self.confirmCancel(); }
          else if (st === "CHARACTER_SELECT" || st === "GACHA" || st === "SHOP" || st === "ACHIEVEMENTS" || st === "CODEX" || st === "HELP") { e.preventDefault(); self.handleAction("back"); }
        }
      });
    },

    handleAction: function (action, source) {
      switch (action) {
        // 首頁
        case "play":          this.startSelectedStage(); break;
        case "stage-prev":    this.cycleStage(-1); break;
        case "stage-next":    this.cycleStage(1); break;
        case "characters":    this.openCharacterSelect(); break;
        case "gacha":         this.openGacha(); break;
        case "gacha-pull":    this.pullGacha(); break;
        case "gacha-result-confirm": this.confirmGachaResult(); break;
        case "commerce-hub":
        case "shop":          this.showScreen("shop"); this.ui.buildShop(); this.ui.updateCoinLabels(); this.setState("SHOP"); break;
        case "achievements":  this.openAchievements(); break;
        case "achievement-claim-all": this.claimAllAchievements(); break;
        case "records-hub":
        case "codex":         this.showScreen("codex"); this.ui.buildCodex(); this.setState("CODEX"); break;
        case "help":          this.showScreen("help"); this.setState("HELP"); break;
        case "settings-home": this.openSettings("home"); break;
        case "start":         this.startSelectedStage(); break;
        case "confirm-character": this.confirmCharacterSelection(); break;
        case "back":          this.showScreen("menu"); this.ui.updateCoinLabels(); this.setState("HOME"); break;
        case "menu":          this.showScreen("menu"); this.ui.updateCoinLabels(); this.setState("HOME"); break;
        case "retry":         this.retryRun(); break;
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
      if (source && source.classList && source.classList.contains("btn-page-switch") && this.ui.focusVisiblePageSwitch) {
        this.ui.focusVisiblePageSwitch();
      }
    },

    showScreen: function (name) {
      for (var key in SCREENS) {
        var s = document.getElementById(SCREENS[key]);
        if (s) s.classList.add("hidden");
      }
      this.ui.showHUD(false);
      this.ui.hideLevelUp();
      if (this.ui.hideKnowledgeCard) this.ui.hideKnowledgeCard(false);
      if (this.ui.hideRunIntro) this.ui.hideRunIntro();
      if (this.ui.hideGachaResult) this.ui.hideGachaResult();
      this.ui.showPause(false);
      this.ui.showConfirm(false);

      // 大廳、子選單與結算畫面皆由同一張大廳背景完整覆蓋。
      // 從暫停開啟設定時保留當局 canvas，關閉設定後仍可回到正確的暫停畫面。
      var shouldClearGameplay = !!name && !(name === "settings" && this.settingsReturn === "pause");
      if (shouldClearGameplay && global.Game && global.Game.clearForLobby) global.Game.clearForLobby();

      if (name && SCREENS[name]) {
        document.getElementById(SCREENS[name]).classList.remove("hidden");
      }
      if (name === "menu" && this.ui) this.ui.updateHomeCharacterPreview(this.selectedCharacterId);
      if (name === "menu" && this.ui && this.ui.updateAchievementMenuBadge) this.ui.updateAchievementMenuBadge();
      if (name === "menu") this.updateStageSelector();
    },

    openAchievements: function () {
      this.showScreen("achievements");
      if (this.ui.setAchievementGroup) this.ui.setAchievementGroup(this.ui._achievementGroup || "all");
      else if (this.ui.buildAchievements) this.ui.buildAchievements();
      this.setState("ACHIEVEMENTS");
    },

    claimAchievement: function (id) {
      if (!global.Achievements) return;
      var result = global.Achievements.claim(id);
      if (!result.ok) {
        var message = result.reason === "claimed" ? "這份獎勵已經領取。" :
          (result.reason === "locked" ? "尚未完成這項成就。" : "獎勵暫時無法領取，請稍後再試。");
        this.ui.showToast("無法領取", message);
      } else {
        var parts = [];
        if (result.coins) parts.push("循環幣 ♻ " + result.coins.toLocaleString("zh-TW"));
        if (result.points) {
          var character = global.GameData.getCharacter(result.targetCharacterId);
          parts.push((character ? character.name : "角色") + "技能點 ×" + result.points);
        }
        this.ui.showToast("成就獎勵已領取", parts.join("、") || "獎勵已加入存檔。");
      }
      this.ui.updateCoinLabels();
      if (this.ui.buildAchievements) this.ui.buildAchievements();
    },

    claimAllAchievements: function () {
      if (!global.Achievements) return;
      var claimable = global.Achievements.getAll({ claimable: true });
      var claimed = 0;
      var coins = 0;
      var points = 0;
      claimable.forEach(function (item) {
        var result = global.Achievements.claim(item.id);
        if (!result.ok) return;
        claimed += 1;
        coins += result.coins || 0;
        points += result.points || 0;
      });
      if (claimed) {
        var detail = "共 " + claimed + " 項、循環幣 ♻ " + coins.toLocaleString("zh-TW");
        if (points) detail += "、角色技能點 ×" + points;
        this.ui.showToast("成就獎勵已全部領取", detail);
      }
      this.ui.updateCoinLabels();
      if (this.ui.buildAchievements) this.ui.buildAchievements();
    },

    cycleStage: function (delta) {
      var stages = global.GameData.stages || [];
      if (!stages.length) return;
      var index = stages.findIndex(function (stage) { return stage.id === this.selectedStageId; }, this);
      if (index < 0) index = 0;
      index = (index + delta + stages.length) % stages.length;
      this.selectedStageId = stages[index].id;
      if (this.stageUnlocked(this.selectedStageId) && global.Storage.saveSelectedStage) {
        global.Storage.saveSelectedStage(this.selectedStageId);
      }
      this.updateStageSelector();
    },

    updateStageSelector: function () {
      var stages = global.GameData.stages || [];
      var stage = global.GameData.getStage(this.selectedStageId) || stages[0];
      if (!stage) return;
      this.selectedStageId = stage.id;
      var unlocked = this.stageUnlocked(stage.id);
      var image = document.getElementById("stage-card-image");
      var number = document.getElementById("stage-card-number");
      var name = document.getElementById("stage-card-name");
      var concept = document.getElementById("stage-card-concept");
      var duration = document.getElementById("stage-card-duration");
      var difficulty = document.getElementById("stage-card-difficulty");
      var boss = document.getElementById("stage-card-boss");
      var lock = document.getElementById("stage-card-lock");
      var card = document.getElementById("stage-carousel-card");
      var play = document.querySelector('#screen-menu [data-action="play"]');
      if (image) {
        image.src = stage.previewImage;
        image.alt = stage.name + "地圖與 " + stage.bossName + " 預覽";
      }
      if (number) number.textContent = "第 " + stage.order + " 關";
      if (name) name.textContent = stage.name;
      if (concept) concept.textContent = stage.concept;
      if (duration) duration.textContent = Math.round(stage.duration / 60) + " 分鐘";
      if (difficulty) difficulty.textContent = stage.difficulty;
      if (boss) boss.textContent = "BOSS：" + stage.bossName;
      if (lock) {
        var requirement = stage.unlockAfter ? global.GameData.getStage(stage.unlockAfter) : null;
        lock.classList.toggle("hidden", unlocked);
        lock.textContent = unlocked ? "" : "擊敗「" + (requirement ? requirement.bossName : "前一關 BOSS") + "」後解鎖";
      }
      if (card) {
        card.classList.toggle("locked", !unlocked);
        card.setAttribute("aria-label", stage.name + "，" + (unlocked ? "已解鎖" : "尚未解鎖"));
      }
      if (play) {
        play.disabled = !unlocked;
        var playLabel = play.querySelector(".btn-label");
        if (playLabel) playLabel.textContent = "開始遊戲";
        else play.textContent = "開始遊戲";
        play.setAttribute("aria-label", unlocked ? "開始遊戲：" + stage.name : stage.name + "尚未解鎖");
      }
      var dots = document.getElementById("stage-carousel-dots");
      if (dots) {
        dots.innerHTML = "";
        stages.forEach(function (item) {
          var dot = document.createElement("span");
          dot.className = "stage-dot";
          dot.classList.toggle("active", item.id === stage.id);
          dot.classList.toggle("cleared", global.Storage.isStageCleared && global.Storage.isStageCleared(item.id));
          dot.classList.toggle("locked", !this.stageUnlocked(item.id));
          dot.setAttribute("aria-hidden", "true");
          dots.appendChild(dot);
        }, this);
      }
    },

    startSelectedStage: function () {
      var stage = global.GameData.getStage(this.selectedStageId);
      if (!stage || !this.stageUnlocked(stage.id)) {
        var required = stage && stage.unlockAfter ? global.GameData.getStage(stage.unlockAfter) : null;
        this.ui.showToast("關卡尚未解鎖", required ? "先擊敗「" + required.bossName + "」。" : "請先完成前一關。");
        return false;
      }
      this.saveSelectedStage(stage.id);
      this.startRun(this.selectedCharacterId, stage.id);
      return true;
    },

    /* ---------------- 角色 / 商店 ---------------- */
    openCharacterSelect: function () {
      this.candidateCharacterId = this.selectedCharacterId;
      this.pendingCharacterStats = { attack: 0, speed: 0, hp: 0 };
      this.showScreen("characters");
      this.ui.buildCharacters(this.candidateCharacterId);
      this.ui.updateCoinLabels();
      this.setState("CHARACTER_SELECT");
    },

    selectCharacter: function (id) {
      var character = global.GameData.getCharacter(id);
      if (!character) return;
      this.candidateCharacterId = character.id;
      this.pendingCharacterStats = { attack: 0, speed: 0, hp: 0 };
      this.ui.buildCharacters(character.id);
    },

    confirmCharacterSelection: function () {
      var id = this.candidateCharacterId || this.selectedCharacterId || "ranger";
      if (!global.Storage.isCharacterOwned(id)) {
        this.ui.showToast("角色尚未解鎖", "請從生態扭蛋取得這名守護者。");
        return;
      }
      this.saveSelectedCharacter(id);
      this.showScreen("menu");
      this.ui.updateCoinLabels();
      this.setState("HOME");
    },

    changePendingCharacterStat: function (stat, delta) {
      if (["attack", "speed", "hp"].indexOf(stat) === -1) return;
      var progress = global.Storage.getCharacterProgress(this.candidateCharacterId);
      var pending = this.pendingCharacterStats;
      var used = pending.attack + pending.speed + pending.hp;
      if (delta > 0 && used >= progress.availablePoints) return;
      pending[stat] = Math.max(0, pending[stat] + (delta > 0 ? 1 : -1));
      this.ui.buildCharacters(this.candidateCharacterId);
    },

    confirmCharacterStats: function () {
      var result = global.Storage.allocateCharacterStats(this.candidateCharacterId, this.pendingCharacterStats);
      if (!result.ok) return;
      this.pendingCharacterStats = { attack: 0, speed: 0, hp: 0 };
      this.ui.showToast("能力強化完成", "已使用 " + result.spent + " 點角色技能點。");
      this.ui.buildCharacters(this.candidateCharacterId);
    },

    equipCharacterSkin: function (skinId) {
      var result = global.Storage.equipSkin(this.candidateCharacterId, skinId);
      if (!result.ok) {
        this.ui.showToast("尚無法裝備", result.reason === "character" ? "請先解鎖角色。" : "請先從扭蛋取得這個 Skin。");
        return;
      }
      if (this.selectedCharacterId === this.candidateCharacterId) this.ui.updateHomeCharacterPreview(this.selectedCharacterId);
      this.ui.buildCharacters(this.candidateCharacterId);
    },

    openGacha: function () {
      this.gachaDrawing = false;
      this.showScreen("gacha");
      this.ui.buildGacha();
      this.ui.updateCoinLabels();
      this.setState("GACHA");
    },

    pullGacha: function () {
      if (this.gachaDrawing) return;
      var result = global.Gacha.pull();
      if (!result.ok) {
        if (result.reason === "coins") this.ui.showToast("循環幣不足", "每次抽取需要 1,000 枚循環幣。");
        return;
      }
      try { global.dispatchEvent(new Event("gacha-progress")); } catch (e) {}
      var self = this;
      this.gachaDrawing = true;
      this.ui.setGachaDrawing(true);
      global.setTimeout(function () {
        self.ui.setGachaDrawing(false);
        self.ui.buildGacha(result);
        self.ui.updateCoinLabels();
        if (!self.ui.showGachaResult || !self.ui.showGachaResult(result)) {
          self.gachaDrawing = false;
        }
      }, 720);
    },

    confirmGachaResult: function () {
      if (this.ui.hideGachaResult) this.ui.hideGachaResult();
      this.gachaDrawing = false;
      this.ui.setGachaDrawing(false);
      this.ui.buildGacha();
      this.ui.updateCoinLabels();
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
      this.ui.setConfirm(
        "確定重置所有存檔？",
        "循環幣會恢復為測試預設的 1,000,000；角色與造型、技能點、永久升級、關卡進度與圖鑑都會重置。此操作無法復原。",
        "確認重置"
      );
      this.ui.showConfirm(true);
      this.setState("CONFIRM_RESET");
    },

    doResetSave: function () {
      this.ui.showConfirm(false);
      global.Storage.reset();
      if (global.AudioManager) global.AudioManager.init();
      this.selectedCharacterId = "ranger";
      this.currentSelectedCharacter = "ranger";
      this.candidateCharacterId = "ranger";
      this.pendingCharacterStats = { attack: 0, speed: 0, hp: 0 };
      this.selectedChar = "ranger";
      this.currentChar = "ranger";
      this.selectedStageId = DEFAULT_STAGE_ID;
      this.currentStageId = DEFAULT_STAGE_ID;
      this.ui.updateCoinLabels();
      this.ui.updateHomeCharacterPreview("ranger");
      this.updateStageSelector();
      this.ui.refreshSettings();
      try { global.dispatchEvent(new Event("gacha-progress")); } catch (e) {}
      this.showScreen("menu");
      this.setState("HOME");
    },

    /* ---------------- 設定畫面 ---------------- */
    openSettings: function (origin) {
      this.settingsReturn = origin;
      this.ui.showPause(false);
      this.showScreen("settings");
      this.ui.renderSettingsScreen(origin);
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
        this.ui.setConfirm("確定要回到首頁嗎？", "已取得的循環幣會保存；其他本局進度將不會保存。", "確認回首頁");
      } else {
        this.ui.setConfirm("確定要重新開始本關嗎？", "目前這局進度將重置；永久升級與存檔不受影響。", "確認重新開始");
      }
      this.ui.showPause(false);
      this.ui.showConfirm(true);
      this.setState(type === "home" ? "CONFIRM_HOME" : "CONFIRM_RESTART");
    },

    confirmCancel: function () {
      var resetConfirm = this.state === "CONFIRM_RESET";
      this.ui.showConfirm(false);
      if (resetConfirm) {
        this.setState("HOME");
        return;
      }
      this.ui.showPause(true);
      this.setState("PAUSED");
    },

    confirmOk: function () {
      if (this.state === "CONFIRM_HOME") this.doReturnHome();
      else if (this.state === "CONFIRM_RESTART") this.doRestart();
      else if (this.state === "CONFIRM_RESET") this.doResetSave();
    },

    doReturnHome: function () {
      this.ui.showConfirm(false);
      this.ui.showPause(false);
      if (global.AudioManager) global.AudioManager.stopMusic();
      var banked = global.Game.abort({ bankCoins: true });
      this.showScreen("menu");
      this.ui.updateCoinLabels();
      if (banked > 0) {
        this.ui.showToast("循環幣已保存", "本局獲得的 ♻ " + banked.toLocaleString("zh-TW") + " 已存入。");
      }
      this.setState("HOME");
    },

    doRestart: function () {
      this.ui.showConfirm(false);
      this.ui.showPause(false);
      global.Game.abort();
      this.startRun(this.currentChar || this.selectedCharacterId, this.currentStageId);   // 不重置商店升級 / localStorage
    },

    /* ---------------- 一局生命週期 ---------------- */
    startRun: function (charId, stageId) {
      var baseCharacter = global.GameData.getCharacter(charId) || global.GameData.characters[0];
      if (!global.Storage.isCharacterOwned(baseCharacter.id)) baseCharacter = global.GameData.getCharacter("ranger") || global.GameData.characters[0];
      var equippedSkinId = global.Storage.getEquippedSkin(baseCharacter.id);
      var character = global.GameData.makePlayableCharacter
        ? global.GameData.makePlayableCharacter(baseCharacter.id, equippedSkinId)
        : baseCharacter;
      this.currentChar = baseCharacter.id;
      var stage = global.GameData.getStage(stageId || this.selectedStageId) || global.GameData.getStage(DEFAULT_STAGE_ID);
      this.currentStageId = stage.id;
      var meta = global.Storage.getMetaBonuses();
      meta.characterGrowth = global.Storage.getCharacterBonuses(baseCharacter.id);
      var player = new global.Player(character, meta);

      this.showScreen(null);     // 隱藏所有選單與覆蓋層
      this.ui.showHUD(true);
      this.ui._hudSig = "";
      this.ui._passiveHudSig = null;
      global.Game.resize();
      global.Game.start(stage.id, player);
      if (global.AudioManager) global.AudioManager.playMusic("stage");
      this.setState("PLAYING");
    },

    retryRun: function () {
      var characterId = this.currentChar || this.selectedCharacterId || "ranger";
      global.Game.abort();
      this.startRun(characterId, this.currentStageId);
    },

    onLevelUp: function (options, cb) {
      this.ui.showLevelUp(options, cb);
    },

    onSustainabilityQuiz: function (question, cb) {
      this.ui.showSustainabilityQuiz(question, cb);
    },

    onRunEnd: function (stats) {
      this.ui.showHUD(false);
      if (global.AudioManager) global.AudioManager.stopMusic();
      if (stats.result === "victory" && global.Storage.markStageCleared) {
        var unlocked = global.Storage.markStageCleared(stats.stageId || this.currentStageId);
        if (unlocked) {
          stats.unlockedStage = unlocked;
          this.selectedStageId = unlocked.id;
          if (global.Storage.saveSelectedStage) global.Storage.saveSelectedStage(unlocked.id);
        }
      }
      if (global.Achievements && global.Achievements.recordRun) {
        var achievementResult = global.Achievements.recordRun(stats);
        stats.newAchievements = achievementResult && achievementResult.unlockedAchievements
          ? achievementResult.unlockedAchievements
          : [];
      }
      this.ui.buildResult(stats);
      this.showScreen(stats.result === "victory" ? "victory" : "gameover");
      this.ui.updateCoinLabels();
      if (this.ui.updateAchievementMenuBadge) this.ui.updateAchievementMenuBadge();
      this.updateStageSelector();
      if (stats.newAchievements && stats.newAchievements.length) {
        this.ui.showToast("完成 " + stats.newAchievements.length + " 項新成就", "返回主畫面後可前往成就頁領取獎勵。");
      }
      this.setState(stats.result === "victory" ? "VICTORY" : "GAME_OVER");
    },

    onKnowledgeUnlocked: function (entry, onContinue) {
      if (this.ui.showKnowledgeCard) this.ui.showKnowledgeCard(entry, onContinue);
      else {
        this.ui.showToast("解鎖永續知識", entry.title + "（已收入圖鑑）");
        if (onContinue) onContinue();
      }
    },

    onEnemyIntroduced: function (intro, onContinue) {
      if (this.ui.showEnemyIntro) this.ui.showEnemyIntro(intro, onContinue);
      else if (onContinue) onContinue();
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
