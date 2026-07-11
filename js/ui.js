/* ============================================================
   ui.js  —  介面：選單/角色/商店/圖鑑/HUD/升級/結算/暫停/設定/確認
   只負責「畫」與把點擊轉交給 App（main.js）。
   暫停/設定/確認：優先使用 assets/images/ui/ 圖片，缺圖則回退 CSS。
   按鈕文字一律由 DOM 繪製（不依賴圖片中的文字）。
   ============================================================ */
(function (global) {

  function $(id) { return document.getElementById(id); }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function objectiveTimeLabel(sec) {
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return "存活 " + sec + " 秒";
    if (sec % 60 === 0) return "存活 " + (sec / 60) + " 分鐘";
    return "存活 " + fmtTime(sec);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var SETTINGS_ROWS = [
    { key: "master", iconId: "icon-master", label: "主音量", sliderId: "vol-master", valueId: "val-master", setter: "setMaster" },
    { key: "music", iconId: "icon-music", label: "音樂音量", sliderId: "vol-music", valueId: "val-music", setter: "setMusic" },
    { key: "sfx", iconId: "icon-sfx", label: "音效音量", sliderId: "vol-sfx", valueId: "val-sfx", setter: "setSfx" },
    { key: "mute", iconId: "icon-mute", label: "靜音", buttonId: "btn-mute", toggle: true }
  ];

  var UI_LAYOUT = {
    stage: { width: 1280, height: 720 },
    button: { width: 300, height: 54, icon: 26, gap: 10 },
    readableInset: { panelX: 60, panelRight: 30 },
    selectors: {
      skinnedButtons: [
        "#screen-menu .menu-buttons .btn",
        "#screen-characters .screen-footer .btn",
        "#screen-help .screen-footer .btn",
        "#screen-settings .screen-footer .btn",
        "#overlay-pause .btn",
        "#overlay-knowledge .btn",
        "#overlay-confirm .btn",
        ".result-screen .screen-footer .btn"
      ].join(",")
    }
  };

  var ACTION_ICONS = {
    play: "ui_icon_confirm",
    "settings-home": "ui_icon_settings",
    "settings-pause": "ui_icon_settings",
    resume: "ui_icon_confirm",
    "ask-restart": "ui_icon_restart",
    "ask-home": "ui_icon_home",
    "settings-back": "ui_icon_back",
    "confirm-cancel": "ui_icon_cancel",
    "confirm-ok": "ui_icon_confirm",
    "confirm-character": "ui_icon_confirm",
    back: "ui_icon_back",
    start: "ui_icon_confirm",
    menu: "ui_icon_home"
  };

  function rectInfo(node) {
    if (!node || !node.getBoundingClientRect) return null;
    var r = node.getBoundingClientRect();
    return {
      x: r.left,
      y: r.top,
      width: r.width,
      height: r.height,
      right: r.right,
      bottom: r.bottom,
      centerY: r.top + r.height / 2
    };
  }

  function directChildWithClass(parent, className) {
    if (!parent || !parent.children) return null;
    for (var i = 0; i < parent.children.length; i++) {
      if (parent.children[i].classList && parent.children[i].classList.contains(className)) return parent.children[i];
    }
    return null;
  }

  function rectCenter(rect) {
    if (!rect) return null;
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }

  function buttonParts(button) {
    var icon = directChildWithClass(button, "btn-icon");
    var label = directChildWithClass(button, "btn-label");
    return {
      button: rectInfo(button),
      icon: rectInfo(icon),
      label: rectInfo(label),
      action: button && button.dataset ? button.dataset.action || "" : ""
    };
  }

  function aligned(values, tolerance) {
    if (values.length < 2) return true;
    return values.every(function (v) { return Math.abs(v - values[0]) <= tolerance; });
  }

  function ensureActionButton(button) {
    if (!button || !button.dataset) return;
    var action = button.dataset.action || "";
    var iconKey = ACTION_ICONS[action] || button.dataset.iconKey || "";
    button.classList.add("ui-button");

    var icon = directChildWithClass(button, "btn-icon");
    if (iconKey && !icon) {
      icon = el("span", "btn-icon");
      button.insertBefore(icon, button.firstChild);
    }
    if (icon) {
      if (iconKey) icon.dataset.iconKey = iconKey;
      icon.setAttribute("aria-hidden", "true");
    }

    var label = directChildWithClass(button, "btn-label");
    if (!label) {
      label = el("span", "btn-label");
      var nodes = Array.prototype.slice.call(button.childNodes);
      nodes.forEach(function (node) {
        if (node === icon) return;
        if (node.nodeType === 1 && node.classList && node.classList.contains("btn-icon")) return;
        if (node.nodeType === 3 && !node.nodeValue.trim()) {
          button.removeChild(node);
          return;
        }
        label.appendChild(node);
      });
      button.appendChild(label);
    }
  }

  function drawSettingsRow(row, def) {
    if (!row || !def) return;
    row.className = "setting-row";
    row.dataset.setting = def.key;

    var icon = row.querySelector(".setting-icon");
    if (!icon) {
      icon = el("span", "setting-icon");
      row.appendChild(icon);
    }
    icon.id = def.iconId;
    icon.setAttribute("aria-hidden", "true");

    var label = row.querySelector(".setting-label");
    if (!label) {
      label = el("label", "setting-label");
      row.appendChild(label);
    }
    label.textContent = def.label;

    var slider = def.sliderId ? row.querySelector(".slider") : null;
    if (def.sliderId) {
      if (!slider) {
        slider = document.createElement("input");
        slider.type = "range";
        slider.className = "slider";
        slider.min = "0";
        slider.max = "100";
        row.appendChild(slider);
      }
      slider.id = def.sliderId;
      slider.setAttribute("aria-label", def.label);
      label.setAttribute("for", def.sliderId);
    } else if (slider) {
      slider.remove();
    }

    var value = def.valueId ? row.querySelector(".setting-val") : null;
    if (def.valueId) {
      if (!value) {
        value = el("span", "setting-val");
        row.appendChild(value);
      }
      value.id = def.valueId;
      value.setAttribute("aria-hidden", "true");
    } else if (value) {
      value.remove();
    }

    var button = def.buttonId ? row.querySelector(".toggle") : null;
    if (def.toggle) {
      if (!button) {
        button = el("button", "btn toggle");
        row.appendChild(button);
      }
      button.id = def.buttonId;
      button.type = "button";
      button.setAttribute("aria-label", def.label);
    } else if (button) {
      button.remove();
    }
  }

  var UI = {
    init: function (app) {
      this.app = app;
      this.normalizeSettingsRows();
      this.normalizeActionButtons();
      this.dom = {
        menuCoins: $("menu-coins"),
        shopCoins: $("shop-coins"),
        characterList: $("character-list"),
        shopList: $("shop-list"),
        codexList: $("codex-list"),
        hud: $("hud"),
        hpFill: $("hp-fill"), hpText: $("hp-text"),
        timer: $("hud-timer"), objective: $("hud-objective"), zone: $("hud-zone"),
        runIntroOverlay: $("overlay-run-intro"), runIntroGoal: $("run-intro-goal"),
        runIntroCountdown: $("run-intro-countdown"), runIntroSkipHint: $("run-intro-skip-hint"),
        level: $("hud-level"), xpFill: $("xp-fill"),
        coins: $("hud-coins"), purified: $("hud-purified"),
        quizStreak: $("hud-quiz-streak"),
        skills: $("hud-skills"), passives: $("hud-passives"), charname: $("hud-charname"),
        dashButton: $("dash-btn"), dashCooldown: $("dash-cooldown"),
        levelupOverlay: $("overlay-levelup"), levelupOptions: $("levelup-options"),
        levelupTitle: $("levelup-title"), levelupFeedback: $("levelup-feedback"),
        knowledgeOverlay: $("overlay-knowledge"),
        knowledgeTitle: $("knowledge-card-title"), knowledgeText: $("knowledge-card-text"),
        knowledgeContinue: $("knowledge-card-continue"),
        victoryStats: $("victory-stats"), gameoverStats: $("gameover-stats"),
        toast: $("toast"), menuArt: $("menu-art"),
        homeCharacterPreview: $("home-character-preview"),
        homeCharacterPortrait: $("home-character-portrait"),
        homeCharacterName: $("home-character-name"),
        homeCharacterRole: $("home-character-role"),
        homeCharacterSkillIcon: $("home-character-skill-icon"),
        homeCharacterSkillName: $("home-character-skill-name"),
        overlayPause: $("overlay-pause"),
        overlayConfirm: $("overlay-confirm"),
        confirmTitle: $("confirm-title"), confirmDesc: $("confirm-desc"),
        confirmOk: $("confirm-ok"), confirmOkLabel: $("confirm-ok-label"),
        settingsScreen: $("screen-settings"),
        settingsPanel: $("settings-panel"),
        volMaster: $("vol-master"), volMusic: $("vol-music"), volSfx: $("vol-sfx"),
        valMaster: $("val-master"), valMusic: $("val-music"), valSfx: $("val-sfx"),
        btnMute: $("btn-mute")
      };
      this._hudSig = "";
      this._passiveHudSig = null;
      this.initSettings();
      if (this.dom.dashButton) {
        this.dom.dashButton.addEventListener("pointerdown", function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (global.Input && global.Input.requestDash) global.Input.requestDash();
        });
      }
      if (this.dom.runIntroOverlay) {
        this.dom.runIntroOverlay.addEventListener("click", function (e) {
          if (!global.Game || !global.Game.runIntroActive || !global.Game.skipRunIntro) return;
          e.preventDefault();
          e.stopPropagation();
          global.Game.skipRunIntro();
        });
      }
      var uiSelf = this;
      if (this.dom.knowledgeContinue) {
        this.dom.knowledgeContinue.addEventListener("click", function (e) {
          e.preventDefault();
          uiSelf.hideKnowledgeCard(true);
        });
      }
      this.applyUiAssets();
      this.updateHomeCharacterPreview(app && app.selectedCharacterId);
      this.scheduleUiAssetRefresh();
    },

    updateCoinLabels: function () {
      var c = global.Storage.getCoins();
      if (this.dom.menuCoins) this.dom.menuCoins.textContent = c;
      if (this.dom.shopCoins) this.dom.shopCoins.textContent = c;
    },

    updateHomeCharacterPreview: function (characterId) {
      if (!this.dom) return;
      var data = this.app && this.app.characterPreviewData
        ? this.app.characterPreviewData(characterId)
        : null;
      var ch = data && data.character ? data.character : (global.GameData.getCharacter(characterId) || global.GameData.getCharacter("ranger"));
      var skill = data && data.skill ? data.skill : (ch ? global.GameData.getSkill(ch.startingSkill) : null);
      if (!ch) return;

      if (this.dom.homeCharacterPreview) this.dom.homeCharacterPreview.dataset.characterId = ch.id;
      if (this.dom.homeCharacterName) this.dom.homeCharacterName.textContent = ch.name;
      if (this.dom.homeCharacterRole) this.dom.homeCharacterRole.textContent = "定位：" + ch.role;
      if (this.dom.homeCharacterSkillName) this.dom.homeCharacterSkillName.textContent = "初始：" + (skill ? skill.name : ch.startingSkill);

      function replaceWithCanvas(container, canvas, className) {
        if (!container || !canvas) return;
        container.innerHTML = "";
        canvas.className = className;
        container.appendChild(canvas);
      }

      replaceWithCanvas(this.dom.homeCharacterPortrait, global.Sprites.makeCanvas(ch.spriteId, 5), "current-character-canvas");
      if (this.dom.menuArt) {
        var art = global.Sprites.makeCanvas(ch.spriteId, 6);
        art.style.width = "88px";
        art.style.height = "auto";
        replaceWithCanvas(this.dom.menuArt, art, "menu-character-canvas");
      }
      if (skill) {
        replaceWithCanvas(this.dom.homeCharacterSkillIcon, global.Sprites.makeIconCanvas(skill.iconId, 24), "current-character-skill-canvas");
      }
    },

    showToast: function (title, text) {
      var t = this.dom.toast;
      t.classList.remove("knowledge-toast");
      t.innerHTML = "";
      t.appendChild(el("span", "t-title", title));
      t.appendChild(document.createTextNode(text));
      t.classList.remove("hidden");
      void t.offsetWidth;
      t.classList.add("show");
      var self = this;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(function () {
        t.classList.remove("show");
        setTimeout(function () { t.classList.add("hidden"); }, 300);
      }, 2600);
    },

    showKnowledgeCard: function (entry, onContinue) {
      var overlay = this.dom.knowledgeOverlay;
      if (!overlay) {
        this.showToast("解鎖永續知識", entry.title + "（已收入圖鑑）");
        if (onContinue) onContinue();
        return;
      }
      clearTimeout(this._toastTimer);
      if (this.dom.toast) {
        this.dom.toast.classList.remove("show", "knowledge-toast");
        this.dom.toast.classList.add("hidden");
      }
      this._knowledgeContinue = onContinue || null;
      this.dom.knowledgeTitle.textContent = entry.title;
      this.dom.knowledgeText.textContent = entry.text;
      overlay.classList.remove("hidden");
      if (this.dom.knowledgeContinue) this.dom.knowledgeContinue.focus();
    },

    hideKnowledgeCard: function (notify) {
      if (this.dom && this.dom.knowledgeOverlay) this.dom.knowledgeOverlay.classList.add("hidden");
      var cb = this._knowledgeContinue;
      this._knowledgeContinue = null;
      if (notify !== false && cb) cb();
    },

    isKnowledgeVisible: function () {
      return !!(this.dom && this.dom.knowledgeOverlay && !this.dom.knowledgeOverlay.classList.contains("hidden"));
    },

    buildCharacters: function (selectedId) {
      var list = this.dom.characterList;
      list.innerHTML = "";
      var chars = global.GameData.characters;
      var self = this;
      chars.forEach(function (ch) {
        var card = el("div", "char-card");
        if (ch.id === selectedId) card.classList.add("selected");
        card.dataset.id = ch.id;
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-pressed", ch.id === selectedId ? "true" : "false");
        var portrait = global.Sprites.makeCanvas(ch.spriteId, 7);
        portrait.className = "char-portrait";
        card.appendChild(portrait);
        card.appendChild(el("div", "char-name", ch.name));
        card.appendChild(el("div", "char-role", "定位：" + ch.role));
        var skill = global.GameData.getSkill(ch.startingSkill);
        var l1 = el("div", "char-line");
        l1.innerHTML = "初始技能：<span class='k'>" + (skill ? skill.name : ch.startingSkill) + "</span>";
        card.appendChild(l1);
        var l2 = el("div", "char-line");
        l2.innerHTML = "被動：<span class='k'>" + ch.passiveText + "</span>";
        card.appendChild(l2);
        card.appendChild(el("div", "char-flavour", ch.flavour));
        card.addEventListener("click", function () { self.app.selectCharacter(ch.id); });
        card.addEventListener("keydown", function (e) {
          if (e.code === "Enter" || e.code === "Space") {
            e.preventDefault();
            self.app.selectCharacter(ch.id);
          }
        });
        list.appendChild(card);
      });
      var confirm = $("confirm-character");
      if (confirm) confirm.disabled = !global.GameData.getCharacter(selectedId);
      this.normalizeActionButtons();
      this.applyUiAssets();
    },

    buildShop: function () {
      var list = this.dom.shopList;
      list.innerHTML = "";
      var self = this;
      global.GameData.shop.forEach(function (item) {
        var lvl = global.Storage.getShopLevel(item.id);
        var row = el("div", "shop-item");
        row.dataset.shopId = item.id;
        row.dataset.iconKey = item.iconId;
        row.tabIndex = 0;
        var iconBox = el("div", "shop-icon-frame");
        var icon = global.Sprites.makeIconCanvas(item.iconId, 48);
        icon.className = "shop-icon";
        icon.dataset.iconKey = item.iconId;
        icon.setAttribute("aria-label", item.name + " icon");
        iconBox.appendChild(icon);
        row.appendChild(iconBox);

        var info = el("div", "shop-info");
        var title = el("div", "shop-title-row");
        title.appendChild(el("div", "shop-name", item.name));
        title.appendChild(el("div", "shop-level-badge", "Lv " + lvl + "/" + item.maxLevel));
        info.appendChild(title);
        var curVal = lvl > 0 ? item.values[lvl - 1] : 0;
        var effTxt = lvl > 0 ? ("目前：" + item.format(curVal)) : "尚未升級";
        if (lvl < item.maxLevel) effTxt += "　→　下一級：" + item.format(item.values[lvl]);
        info.appendChild(el("div", "shop-effect", effTxt));
        info.appendChild(el("div", "shop-edu", item.eduText));
        var dots = el("div", "shop-level-dots");
        var dh = "";
        for (var i = 0; i < item.maxLevel; i++) dh += "<span class='" + (i < lvl ? "dot-on" : "dot-off") + "'>●</span>";
        dots.innerHTML = dh;
        info.appendChild(dots);
        row.appendChild(info);
        var buy = el("div", "shop-buy");
        if (lvl >= item.maxLevel) {
          buy.appendChild(el("div", "shop-max", "已滿級"));
        } else {
          var price = item.prices[lvl];
          buy.appendChild(el("div", "shop-price", "♻ " + price));
          var btn = el("button", "btn btn-primary", "升級");
          if (!global.Storage.canBuy(item)) btn.disabled = true;
          btn.addEventListener("click", function () { self.app.buyUpgrade(item.id); });
          buy.appendChild(btn);
        }
        row.appendChild(buy);
        list.appendChild(row);
      });
      this.scheduleShopIconRefresh();
    },

    refreshShopIcons: function () {
      Array.prototype.forEach.call(document.querySelectorAll("#shop-list .shop-icon[data-icon-key]"), function (oldIcon) {
        var key = oldIcon.dataset.iconKey;
        var size = oldIcon.width || 48;
        var fresh = global.Sprites.makeIconCanvas(key, size);
        fresh.className = oldIcon.className;
        fresh.dataset.iconKey = key;
        fresh.setAttribute("aria-label", oldIcon.getAttribute("aria-label") || "shop icon");
        oldIcon.replaceWith(fresh);
      });
    },

    scheduleShopIconRefresh: function () {
      var self = this;
      var attempts = 0;
      clearInterval(this._shopIconRefreshTimer);
      this._shopIconRefreshTimer = setInterval(function () {
        attempts++;
        self.refreshShopIcons();
        var allSettled = !global.Assets || global.GameData.shop.every(function (item) {
          var report = global.Assets.report().find(function (entry) { return entry.key === item.iconId; });
          return report && (report.ok || attempts >= 20);
        });
        if (allSettled || attempts >= 20) {
          clearInterval(self._shopIconRefreshTimer);
          self._shopIconRefreshTimer = null;
        }
      }, 100);
    },

    buildCodex: function () {
      var list = this.dom.codexList;
      list.innerHTML = "";
      var all = global.GameData.knowledge;
      all.forEach(function (k, idx) {
        var unlocked = global.Storage.isKnowledgeUnlocked(k.id);
        var item = el("div", "codex-item" + (unlocked ? "" : " locked"));
        item.appendChild(el("div", "codex-num", unlocked ? String(idx + 1) : "?"));
        var body = el("div", "codex-body");
        body.appendChild(el("div", "codex-title", unlocked ? k.title : "未解鎖的知識卡"));
        body.appendChild(el("div", "codex-text", unlocked ? k.text : "在「海廢潮間帶」中拾取知識卡即可解鎖這一則永續知識。"));
        item.appendChild(body);
        list.appendChild(item);
      });
    },

    showHUD: function (show) { this.dom.hud.classList.toggle("hidden", !show); },

    hideRunIntro: function () {
      if (this.dom && this.dom.runIntroOverlay) this.dom.runIntroOverlay.classList.add("hidden");
    },

    updateHUD: function (game) {
      var p = game.player;
      var d = this.dom;
      d.hpFill.style.width = Math.max(0, (p.hp / p.maxHp) * 100) + "%";
      d.hpText.textContent = Math.ceil(p.hp) + " / " + p.maxHp;
      var remaining = Math.max(0, game.stage.duration - game.time);
      var finalCountdown = !game.runIntroActive && remaining > 0 && remaining <= 10;
      d.timer.textContent = fmtTime(Math.ceil(remaining));
      d.timer.classList.toggle("final-countdown", finalCountdown);
      d.timer.setAttribute("aria-live", finalCountdown ? "assertive" : "off");
      d.timer.setAttribute("aria-label", finalCountdown ? "最後 " + Math.ceil(remaining) + " 秒" : "剩餘時間 " + d.timer.textContent);
      if (d.objective) {
        if (finalCountdown) d.objective.textContent = "最後 " + Math.ceil(remaining) + " 秒，撐住！";
        else if (game.runIntroActive) d.objective.textContent = "準備迎接污染潮";
        else if (game.mapObjectiveStatus) d.objective.textContent = game.mapObjectiveStatus();
        d.objective.classList.toggle("final-warning", finalCountdown);
      }
      if (d.runIntroOverlay) {
        d.runIntroOverlay.classList.toggle("hidden", !game.runIntroActive);
        if (game.runIntroActive) {
          if (d.runIntroGoal) d.runIntroGoal.textContent = objectiveTimeLabel(game.stage.duration);
          if (d.runIntroCountdown) d.runIntroCountdown.textContent = Math.max(1, Math.ceil(game.runIntroRemaining || 0));
        }
      }
      if (d.zone && game.contaminationStatus) {
        d.zone.textContent = game.contaminationStatus();
        d.zone.classList.toggle("danger", !!(game.contamination && game.contamination.outside));
        d.zone.classList.toggle("warning", !!(game.contamination && !game.contamination.outside &&
          (game.contamination.phase === "warning" || game.contamination.phase === "shrinking")));
      }
      d.level.textContent = p.level;
      d.xpFill.style.width = Math.min(100, (p.xp / p.xpToNext) * 100) + "%";
      d.coins.textContent = game.runCoins;
      d.purified.textContent = game.purifiedCount;
      if (d.quizStreak) {
        var streak = game.quizStreak || 0;
        var eliteMult = p.eliteDamageMult || 1;
        d.quizStreak.textContent = eliteMult > 1
          ? "精英解析 ×" + eliteMult.toFixed(2) + "｜連勝 " + streak
          : "答題連勝 " + streak + "（5 題解鎖）";
        d.quizStreak.classList.toggle("active", eliteMult > 1);
      }
      if (d.dashButton && d.dashCooldown) {
        var dashReady = (p.dashCooldown || 0) <= 0;
        d.dashButton.classList.toggle("cooldown", !dashReady);
        d.dashButton.setAttribute("aria-label", dashReady ? "衝刺，已就緒" : "衝刺冷卻中");
        d.dashCooldown.textContent = dashReady ? "" : Math.ceil(p.dashCooldown) + "s";
      }
      if (d.charname && p.character) d.charname.textContent = p.character.name;
      var sig = p.weapons.map(function (w) { return w.skill.id + w.level; }).join(",");
      if (sig !== this._hudSig) {
        this._hudSig = sig;
        d.skills.innerHTML = "";
        p.weapons.forEach(function (w) {
          var chip = el("div", "skill-chip");
          chip.title = w.skill.name + " Lv." + w.level;
          var icon = global.Sprites.makeIconCanvas(w.skill.iconId, 40);
          chip.appendChild(icon);
          chip.appendChild(el("span", "lv", "Lv" + w.level));
          d.skills.appendChild(chip);
        });
      }

      if (d.passives) {
        var passiveMap = p.passiveUpgrades || {};
        var passiveOrder = p.passiveUpgradeOrder || Object.keys(passiveMap);
        var passiveSig = passiveOrder.map(function (id) {
          var passive = passiveMap[id];
          return passive ? id + ":" + passive.level : "";
        }).join(",");
        if (passiveSig !== this._passiveHudSig) {
          this._passiveHudSig = passiveSig;
          d.passives.innerHTML = "";
          passiveOrder.forEach(function (id) {
            var passive = passiveMap[id];
            if (!passive || passive.level < 1) return;
            var chip = el("div", "passive-chip" + (passive.oneShot ? " maxed" : ""));
            var levelLabel = passive.oneShot ? "MAX" : "Lv" + passive.level;
            chip.title = passive.name + " " + levelLabel + "｜" + passive.effect;
            chip.setAttribute("aria-label", chip.title);
            var icon = global.Sprites.makeIconCanvas(passive.icon, 38);
            icon.className = "passive-icon";
            chip.appendChild(icon);
            chip.appendChild(el("span", "lv", levelLabel));
            d.passives.appendChild(chip);
          });
        }
      }
    },

    showLevelUp: function (options, onPick) {
      var box = this.dom.levelupOptions;
      box.innerHTML = "";
      box.classList.remove("quiz-options");
      if (this.dom.levelupTitle) this.dom.levelupTitle.textContent = "升級！選擇你的成長";
      if (this.dom.levelupFeedback) {
        this.dom.levelupFeedback.classList.add("hidden");
        this.dom.levelupFeedback.innerHTML = "";
      }
      if (this._keyHandler) { global.removeEventListener("keydown", this._keyHandler); this._keyHandler = null; }
      var self = this;
      function pick(opt) { self.hideLevelUp(); onPick(opt); }
      options.forEach(function (opt, i) {
        var card = el("div", "levelup-card");
        var icon = global.Sprites.makeIconCanvas(opt.icon, 56);
        icon.className = "levelup-icon";
        card.appendChild(icon);
        card.appendChild(el("div", "levelup-name", opt.name));
        card.appendChild(el("div", "levelup-tag", opt.tag));
        card.appendChild(el("div", "levelup-effect", opt.effect));
        card.appendChild(el("div", "levelup-edu", "永續知識：" + opt.edu));
        card.appendChild(el("div", "levelup-key", "按 " + (i + 1) + " 或點擊選擇"));
        card.addEventListener("click", function () { pick(opt); });
        box.appendChild(card);
      });
      this._keyHandler = function (e) {
        var n = -1;
        if (e.code === "Digit1" || e.code === "Numpad1") n = 0;
        else if (e.code === "Digit2" || e.code === "Numpad2") n = 1;
        else if (e.code === "Digit3" || e.code === "Numpad3") n = 2;
        if (n >= 0 && options[n]) { e.preventDefault(); pick(options[n]); }
      };
      global.addEventListener("keydown", this._keyHandler);
      this.dom.levelupOverlay.classList.remove("hidden");
    },

    showSustainabilityQuiz: function (question, onAnswer) {
      var box = this.dom.levelupOptions;
      var feedback = this.dom.levelupFeedback;
      var title = this.dom.levelupTitle;
      var self = this;
      var answered = false;
      var proceeded = false;
      box.innerHTML = "";
      box.classList.add("quiz-options");
      if (title) title.textContent = "永續快問快答";
      if (feedback) { feedback.innerHTML = ""; feedback.classList.add("hidden"); }
      if (this._keyHandler) { global.removeEventListener("keydown", this._keyHandler); this._keyHandler = null; }

      function choose(index) {
        if (answered) return;
        answered = true;
        var correct = index === question.answer;
        var cards = box.querySelectorAll(".quiz-card");
        Array.prototype.forEach.call(cards, function (card, i) {
          card.classList.add(i === question.answer ? "correct" : (i === index ? "wrong" : "muted"));
          card.setAttribute("aria-disabled", "true");
          card.tabIndex = -1;
        });
        if (self._keyHandler) { global.removeEventListener("keydown", self._keyHandler); self._keyHandler = null; }
        if (!feedback) { onAnswer({ correct: correct, selected: index, question: question }); return; }

        feedback.innerHTML = "";
        feedback.classList.remove("hidden");
        feedback.classList.toggle("correct", correct);
        feedback.classList.toggle("wrong", !correct);
        feedback.appendChild(el("div", "quiz-result", correct
          ? "答對了：回復生命、獲得 ♻2，並累積連勝"
          : "答錯了：承受少量污染壓力，連勝重新計算"));
        feedback.appendChild(el("div", "quiz-explanation", question.explanation));
        var proceed = el("button", "btn btn-primary quiz-continue", "查看升級選項");
        proceed.type = "button";
        proceed.addEventListener("click", function () {
          if (proceeded) return;
          proceeded = true;
          proceed.disabled = true;
          onAnswer({ correct: correct, selected: index, question: question });
        });
        feedback.appendChild(proceed);
        proceed.focus();
      }

      box.appendChild(el("div", "quiz-question", question.prompt));
      question.options.forEach(function (option, i) {
        var card = el("div", "levelup-card quiz-card");
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.appendChild(el("div", "quiz-index", String(i + 1)));
        card.appendChild(el("div", "quiz-answer", option));
        card.addEventListener("click", function () { choose(i); });
        card.addEventListener("keydown", function (e) {
          if (e.code === "Enter" || e.code === "Space") { e.preventDefault(); choose(i); }
        });
        box.appendChild(card);
      });
      this._keyHandler = function (e) {
        var n = -1;
        if (e.code === "Digit1" || e.code === "Numpad1") n = 0;
        else if (e.code === "Digit2" || e.code === "Numpad2") n = 1;
        else if (e.code === "Digit3" || e.code === "Numpad3") n = 2;
        if (n >= 0 && question.options[n]) { e.preventDefault(); choose(n); }
      };
      global.addEventListener("keydown", this._keyHandler);
      this.dom.levelupOverlay.classList.remove("hidden");
    },

    hideLevelUp: function () {
      this.dom.levelupOverlay.classList.add("hidden");
      if (this.dom.levelupOptions) this.dom.levelupOptions.classList.remove("quiz-options");
      if (this.dom.levelupFeedback) this.dom.levelupFeedback.classList.add("hidden");
      if (this._keyHandler) { global.removeEventListener("keydown", this._keyHandler); this._keyHandler = null; }
    },

    isLevelUpVisible: function () {
      return this.dom.levelupOverlay && !this.dom.levelupOverlay.classList.contains("hidden");
    },

    /* ---------------- 暫停選單 ---------------- */
    showPause: function (show) {
      if (show) { this.normalizeActionButtons(); this.applyUiAssets(); }
      if (this.dom.overlayPause) this.dom.overlayPause.classList.toggle("hidden", !show);
    },

    /* ---------------- 確認視窗 ---------------- */
    showConfirm: function (show) {
      if (show) { this.normalizeActionButtons(); this.applyUiAssets(); }
      if (this.dom.overlayConfirm) this.dom.overlayConfirm.classList.toggle("hidden", !show);
    },
    setConfirm: function (title, desc, okLabel) {
      if (this.dom.confirmTitle) this.dom.confirmTitle.textContent = title;
      if (this.dom.confirmDesc) this.dom.confirmDesc.textContent = desc;
      if (this.dom.confirmOkLabel) this.dom.confirmOkLabel.textContent = okLabel;
      else if (this.dom.confirmOk) this.dom.confirmOk.textContent = okLabel;
      this.normalizeActionButtons();
      this.applyUiAssets();
    },

    normalizeActionButtons: function () {
      var buttons = document.querySelectorAll(UI_LAYOUT.selectors.skinnedButtons);
      Array.prototype.forEach.call(buttons, ensureActionButton);
    },

    scheduleUiAssetRefresh: function () {
      var self = this;
      var attempts = 0;
      clearInterval(this._assetRefreshTimer);
      this._assetRefreshTimer = setInterval(function () {
        attempts++;
        self.applyUiAssets();
        var root = document.getElementById("game-root");
        var coreReady = root && root.classList.contains("has-ui-buttons") &&
          $("pause-panel") && $("pause-panel").classList.contains("has-asset") &&
          $("settings-panel") && $("settings-panel").classList.contains("has-asset") &&
          $("confirm-panel") && $("confirm-panel").classList.contains("has-asset");
        if (coreReady || attempts >= 20) {
          if (self.app && self.app.selectedCharacterId) self.updateHomeCharacterPreview(self.app.selectedCharacterId);
          clearInterval(self._assetRefreshTimer);
          self._assetRefreshTimer = null;
        }
      }, 100);
    },

    getButtonLayout: function (selector) {
      var buttons = document.querySelectorAll(selector);
      return Array.prototype.map.call(buttons, buttonParts);
    },

    /* ---------------- 設定畫面 ---------------- */
    normalizeSettingsRows: function () {
      var panel = $("settings-panel");
      if (!panel) return;

      var inner = $("settings-inner");
      if (!inner) {
        inner = el("div", "settings-inner");
        inner.id = "settings-inner";
        var children = Array.prototype.slice.call(panel.children);
        panel.appendChild(inner);
        children.forEach(function (child) {
          if (child.classList && child.classList.contains("setting-row")) inner.appendChild(child);
        });
      }

      var rows = Array.prototype.slice.call(inner.children).filter(function (child) {
        return child.classList && child.classList.contains("setting-row");
      });

      SETTINGS_ROWS.forEach(function (def, index) {
        var row = rows[index];
        if (!row) {
          row = el("div", "setting-row");
          inner.appendChild(row);
        }
        drawSettingsRow(row, def);
      });

      Array.prototype.slice.call(inner.children).forEach(function (child, index) {
        if (index >= SETTINGS_ROWS.length) child.remove();
      });
    },

    renderSettingsScreen: function (returnTarget) {
      this.normalizeSettingsRows();
      this.normalizeActionButtons();
      if (this.dom && this.dom.settingsScreen) {
        this.dom.settingsScreen.dataset.returnTarget = returnTarget || "home";
      }
      this.refreshSettings();
      return this.getSettingsLayout();
    },

    getSettingsLayout: function () {
      var screen = $("screen-settings");
      var panel = $("settings-panel");
      var inner = $("settings-inner");
      var back = screen ? screen.querySelector('[data-action="settings-back"]') : null;
      var rows = {};

      SETTINGS_ROWS.forEach(function (def) {
        var row = inner ? inner.querySelector('[data-setting="' + def.key + '"]') : null;
        rows[def.key] = {
          row: rectInfo(row),
          icon: rectInfo(row ? row.querySelector(".setting-icon") : null),
          label: rectInfo(row ? row.querySelector(".setting-label") : null),
          slider: rectInfo(def.sliderId ? $(def.sliderId) : null),
          value: rectInfo(def.valueId ? $(def.valueId) : null),
          toggle: rectInfo(def.buttonId ? $(def.buttonId) : null)
        };
      });

      return {
        panel: rectInfo(panel),
        inner: rectInfo(inner),
        backButton: rectInfo(back),
        rows: rows,
        rowOrder: SETTINGS_ROWS.map(function (def) { return def.key; }),
        sharedRenderer: true
      };
    },

    validateSettingsLayout: function () {
      var layout = this.getSettingsLayout();
      var errors = [];
      var panel = layout.panel;
      var inner = layout.inner;
      var back = layout.backButton;
      var stage = rectInfo($("stage")) || { x: 0, y: 0, right: global.innerWidth, bottom: global.innerHeight };
      var sliderXs = [];
      var sliderRights = [];
      var valueRights = [];

      if (!panel) errors.push("missing settings panel");
      if (!inner) errors.push("missing settings inner area");
      if (panel && inner) {
        if (inner.x < panel.x + 60) errors.push("inner area is too close to the panel left edge");
        if (inner.right > panel.right - 30) errors.push("inner area exceeds the panel readable right edge");
      }

      layout.rowOrder.forEach(function (key) {
        var r = layout.rows[key];
        if (!r || !r.row || !r.icon || !r.label) {
          errors.push(key + " row is missing a required visual part");
          return;
        }
        if (panel && r.label.x <= panel.x + 60) errors.push(key + " label is too far left");
        if (panel && r.icon.x <= panel.x + 40) errors.push(key + " icon is too far left");
        if (panel && r.row.right >= panel.right - 24) errors.push(key + " row exceeds panel readable right edge");

        if (r.slider) {
          sliderXs.push(r.slider.x);
          sliderRights.push(r.slider.right);
          if (panel && (r.slider.x < panel.x || r.slider.right > panel.right)) errors.push(key + " slider is outside panel");
          if (Math.abs(r.slider.centerY - r.row.centerY) > 3) errors.push(key + " slider center is not aligned with row");
        }
        if (r.value) {
          valueRights.push(r.value.right);
          if (panel && r.value.right >= panel.right - 30) errors.push(key + " value is too close to the right edge");
          if (Math.abs(r.value.centerY - r.row.centerY) > 3) errors.push(key + " value is not aligned with row");
        }
      });

      if (!aligned(sliderXs, 1)) errors.push("volume slider left edges are not aligned");
      if (!aligned(sliderRights, 1)) errors.push("volume slider right edges are not aligned");
      if (!aligned(valueRights, 1)) errors.push("volume values are not right aligned");
      if (layout.rows.mute && layout.rows.master && layout.rows.mute.label && layout.rows.master.label) {
        if (Math.abs(layout.rows.mute.label.x - layout.rows.master.label.x) > 1) errors.push("mute row is not aligned with the volume labels");
      }

      if (!back) errors.push("missing settings back button");
      else {
        if (back.x < stage.x || back.right > stage.right || back.y < stage.y || back.bottom > stage.bottom) {
          errors.push("settings back button is outside the stage");
        }
        if (panel && Math.abs((back.x + back.width / 2) - (panel.x + panel.width / 2)) > 2) {
          errors.push("settings back button is not centered with the panel");
        }
      }

      return { ok: errors.length === 0, errors: errors, layout: layout };
    },

    getPauseLayout: function () {
      var panel = $("pause-panel");
      var title = panel ? panel.querySelector(".pause-title") : null;
      return {
        panel: rectInfo(panel),
        title: rectInfo(title),
        buttons: this.getButtonLayout("#overlay-pause .pause-buttons .btn")
      };
    },

    validatePauseLayout: function () {
      var layout = this.getPauseLayout();
      var errors = [];
      var panel = layout.panel;
      var buttons = layout.buttons || [];
      if (!panel) errors.push("missing pause panel");
      if (!layout.title) errors.push("missing pause title");
      if (panel && layout.title) {
        var titleCenter = rectCenter(layout.title);
        if (Math.abs(titleCenter.x - (panel.x + panel.width / 2)) > 3) errors.push("pause title is not centered");
      }
      if (buttons.length !== 4) errors.push("pause menu should have four buttons");
      if (buttons.length) {
        var widths = [], centers = [], gaps = [];
        buttons.forEach(function (b, i) {
          if (!b.button) return;
          widths.push(b.button.width);
          centers.push(b.button.x + b.button.width / 2);
          if (panel && (b.button.x < panel.x || b.button.right > panel.right || b.button.y < panel.y || b.button.bottom > panel.bottom)) {
            errors.push("pause button " + i + " is outside the panel");
          }
          if (b.label) {
            var bc = rectCenter(b.button), lc = rectCenter(b.label);
            if (Math.abs(lc.y - bc.y) > 3) errors.push("pause button " + i + " label is not vertically centered");
          }
          if (b.icon && b.label && b.icon.right > b.label.x) errors.push("pause button " + i + " icon overlaps label");
          if (i > 0 && buttons[i - 1].button) gaps.push(b.button.y - buttons[i - 1].button.bottom);
        });
        if (!aligned(widths, 1)) errors.push("pause buttons are not equal width");
        if (!aligned(centers, 2)) errors.push("pause buttons are not center aligned");
        if (!aligned(gaps, 2)) errors.push("pause button gaps are not even");
      }
      return { ok: errors.length === 0, errors: errors, layout: layout };
    },

    getConfirmLayout: function () {
      var panel = $("confirm-panel");
      return {
        panel: rectInfo(panel),
        title: rectInfo($("confirm-title")),
        desc: rectInfo($("confirm-desc")),
        buttons: this.getButtonLayout("#overlay-confirm .confirm-buttons .btn")
      };
    },

    validateConfirmLayout: function () {
      var layout = this.getConfirmLayout();
      var errors = [];
      var panel = layout.panel;
      var buttons = layout.buttons || [];
      if (!panel) errors.push("missing confirm panel");
      if (!layout.title) errors.push("missing confirm title");
      if (!layout.desc) errors.push("missing confirm description");
      [layout.title, layout.desc].forEach(function (r, i) {
        if (panel && r && Math.abs((r.x + r.width / 2) - (panel.x + panel.width / 2)) > 3) {
          errors.push((i === 0 ? "confirm title" : "confirm description") + " is not centered");
        }
      });
      if (buttons.length !== 2) errors.push("confirm dialog should have two buttons");
      if (buttons.length === 2) {
        if (Math.abs(buttons[0].button.width - buttons[1].button.width) > 1) errors.push("confirm buttons are not equal width");
        if (Math.abs(buttons[0].button.height - buttons[1].button.height) > 1) errors.push("confirm buttons are not equal height");
        if (Math.abs((buttons[0].button.y + buttons[0].button.height / 2) - (buttons[1].button.y + buttons[1].button.height / 2)) > 1) {
          errors.push("confirm buttons are not on the same row");
        }
      }
      buttons.forEach(function (b, i) {
        if (panel && b.button && (b.button.x < panel.x || b.button.right > panel.right || b.button.bottom > panel.bottom)) {
          errors.push("confirm button " + i + " is outside the panel");
        }
        if (b.icon && b.label && b.icon.right > b.label.x) errors.push("confirm button " + i + " icon overlaps label");
      });
      return { ok: errors.length === 0, errors: errors, layout: layout };
    },

    getCharacterLayout: function () {
      return {
        screen: rectInfo($("screen-characters")),
        cards: Array.prototype.map.call(document.querySelectorAll("#screen-characters .char-card"), function (card) {
          return {
            card: rectInfo(card),
            portrait: rectInfo(card.querySelector(".char-portrait")),
            name: rectInfo(card.querySelector(".char-name")),
            role: rectInfo(card.querySelector(".char-role")),
            selected: card.classList.contains("selected")
          };
        }),
        footerButtons: this.getButtonLayout("#screen-characters .screen-footer .btn")
      };
    },

    validateCharacterLayout: function () {
      var layout = this.getCharacterLayout();
      var errors = [];
      var cards = layout.cards || [];
      if (cards.length !== 3) errors.push("character select should show three cards");
      if (cards.length) {
        var widths = cards.map(function (c) { return c.card ? c.card.width : 0; });
        if (!aligned(widths, 1)) errors.push("character cards are not equal width");
        cards.forEach(function (c, i) {
          if (!c.card || !c.portrait || !c.name || !c.role) {
            errors.push("character card " + i + " is missing required content");
            return;
          }
          if (Math.abs((c.portrait.x + c.portrait.width / 2) - (c.card.x + c.card.width / 2)) > 2) {
            errors.push("character portrait " + i + " is not centered");
          }
          if (c.name.y < c.portrait.bottom) {
            errors.push("character card " + i + " name overlaps portrait");
          }
        });
      }
      if (layout.footerButtons.length === 2) {
        var y0 = layout.footerButtons[0].button.y + layout.footerButtons[0].button.height / 2;
        var y1 = layout.footerButtons[1].button.y + layout.footerButtons[1].button.height / 2;
        if (Math.abs(y0 - y1) > 1) errors.push("character footer buttons are not aligned");
      }
      return { ok: errors.length === 0, errors: errors, layout: layout };
    },

    validateVisibleUILayout: function () {
      var checks = [];
      function isVisible(node) { return node && !node.classList.contains("hidden"); }
      if (isVisible($("screen-settings"))) checks.push(this.validateSettingsLayout());
      if (isVisible($("overlay-pause"))) checks.push(this.validatePauseLayout());
      if (isVisible($("overlay-confirm"))) checks.push(this.validateConfirmLayout());
      if (isVisible($("screen-characters"))) checks.push(this.validateCharacterLayout());
      var errors = [];
      checks.forEach(function (check) { errors = errors.concat(check.errors || []); });
      return { ok: errors.length === 0, errors: errors, checks: checks };
    },

    initSettings: function () {
      var self = this;
      var A = global.AudioManager;
      function bind(slider, valEl, setter) {
        if (!slider) return;
        slider.addEventListener("input", function () {
          var v = parseInt(slider.value, 10) || 0;
          if (valEl) valEl.textContent = v;
          if (A && A[setter]) A[setter](v);
        });
        slider.addEventListener("change", function () { if (A) A.playSfx("click"); });
      }
      SETTINGS_ROWS.forEach(function (def) {
        if (!def.sliderId) return;
        bind($(def.sliderId), $(def.valueId), def.setter);
      });
      if (this.dom.btnMute) {
        this.dom.btnMute.addEventListener("click", function () {
          if (A) A.toggleMute();
          self.refreshSettings();
          if (A) A.playSfx("click");
        });
      }
    },

    refreshSettings: function () {
      this.applyUiAssets();
      var A = global.AudioManager;
      var s = A ? A.getSettings() : { master: 80, music: 70, sfx: 80, mute: false };
      var d = this.dom;
      if (d.volMaster) { d.volMaster.value = s.master; d.valMaster.textContent = s.master; }
      if (d.volMusic) { d.volMusic.value = s.music; d.valMusic.textContent = s.music; }
      if (d.volSfx) { d.volSfx.value = s.sfx; d.valSfx.textContent = s.sfx; }
      if (d.btnMute) {
        d.btnMute.textContent = s.mute ? "已靜音" : "未靜音";
        d.btnMute.classList.toggle("on", !!s.mute);
      }
    },

    /* ---------------- UI 圖片素材：有圖用圖、缺圖回退 CSS ---------------- */
    applyUiAssets: function () {
      var A = global.Assets;
      if (!A || !A.applyBg) return;
      this.normalizeActionButtons();
      var root = document.getElementById("game-root");
      var rs = document.documentElement.style;
      var ICON = { size: "contain" };
      function cssAssetUrl(path) {
        return "url('" + new URL(path, global.location.href).href.replace(/'/g, "%27") + "')";
      }

      A.applyBg("pause-panel", "ui_panel_pause");
      A.applyBg("settings-panel", "ui_panel_settings");
      A.applyBg("confirm-panel", "ui_panel_confirm");

      A.applyBg("icon-master", "ui_icon_settings", ICON);
      A.applyBg("icon-music", "ui_icon_music", ICON);
      A.applyBg("icon-sfx", "ui_icon_sfx", ICON);
      A.applyBg("icon-mute", "ui_icon_mute", ICON);

      A.applyBg("ic-presettings", "ui_icon_settings", ICON);
      A.applyBg("ic-restart", "ui_icon_restart", ICON);
      A.applyBg("ic-home", "ui_icon_home", ICON);
      A.applyBg("ic-back", "ui_icon_back", ICON);
      A.applyBg("ic-cancel", "ui_icon_cancel", ICON);
      A.applyBg("ic-ok", "ui_icon_confirm", ICON);

      Array.prototype.forEach.call(document.querySelectorAll(".btn-icon[data-icon-key]"), function (icon) {
        A.applyBg(icon, icon.dataset.iconKey, ICON);
      });

      var bn = A.path("ui_button_normal"), bh = A.path("ui_button_hover"), bp = A.path("ui_button_pressed");
      if (root && bn && bh && bp) {
        rs.setProperty("--ui-btn-normal", cssAssetUrl(bn));
        rs.setProperty("--ui-btn-hover", cssAssetUrl(bh));
        rs.setProperty("--ui-btn-pressed", cssAssetUrl(bp));
        root.classList.add("has-ui-buttons");
      }

      var sb = A.path("ui_slider_bar"), sk = A.path("ui_slider_knob");
      if (root && sb && sk) {
        rs.setProperty("--ui-slider-bar", cssAssetUrl(sb));
        rs.setProperty("--ui-slider-knob", cssAssetUrl(sk));
        root.classList.add("has-ui-slider");
      }
    },

    /* ---------------- 結算 ---------------- */
    buildResult: function (stats) {
      var box = (stats.result === "victory") ? this.dom.victoryStats : this.dom.gameoverStats;
      box.innerHTML = "";
      function row(label, value) {
        var r = el("div", "row");
        r.appendChild(el("span", "k", label));
        r.appendChild(el("span", "v", value));
        return r;
      }
      box.appendChild(row("存活時間", fmtTime(stats.survived)));
      box.appendChild(row("淨化污染物", stats.purified + " 個"));
      box.appendChild(row("清理地圖物件", (stats.mapCleaned || 0) + " 個"));
      box.appendChild(row("永續問答", (stats.quizCorrect || 0) + " 對 / " + (stats.quizIncorrect || 0) + " 錯"));
      box.appendChild(row("最佳答題連勝", (stats.bestQuizStreak || 0) + " 題"));
      box.appendChild(row("達到等級", "Lv." + stats.level));
      box.appendChild(row("拾取循環幣", "♻ " + stats.collected));
      box.appendChild(row("淨化獎勵", "♻ " + stats.purifyBonus));
      box.appendChild(row("存活時間獎勵", "♻ " + stats.timeBonus));
      if (stats.winBonus > 0) box.appendChild(row("通關獎勵", "♻ " + stats.winBonus));
      if (stats.multiplier > 1) box.appendChild(row("回收分類加成", "×" + stats.multiplier.toFixed(2)));
      var total = el("div", "row total");
      total.appendChild(el("span", "k", "本局獲得"));
      total.appendChild(el("span", "v", "♻ " + stats.total));
      box.appendChild(total);
    }
  };

  global.getSettingsLayout = function () { return UI.getSettingsLayout(); };
  global.validateSettingsLayout = function () { return UI.validateSettingsLayout(); };
  global.getUILayoutConfig = function () { return UI_LAYOUT; };
  global.validatePauseLayout = function () { return UI.validatePauseLayout(); };
  global.validateConfirmLayout = function () { return UI.validateConfirmLayout(); };
  global.validateCharacterLayout = function () { return UI.validateCharacterLayout(); };
  global.validateVisibleUILayout = function () { return UI.validateVisibleUILayout(); };
  global.UI = UI;
})(window);
