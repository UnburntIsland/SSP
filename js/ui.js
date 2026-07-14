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

  var SKILL_STAT_KEYS = {
    projectile: ["damage", "count", "cooldown", "speed", "pierce", "eliteMult"],
    aura: ["dps", "radius", "duration", "cooldown", "pull"],
    pulse: ["damage", "radius", "cooldown"],
    orbit: ["dps", "count", "radius", "hitRadius", "knockback", "rotSpeed"],
    zone: ["dps", "radius", "duration", "cooldown"],
    deployable: ["damage", "duration", "cooldown", "fireCooldown", "range"],
    trail: ["damage", "tickCooldown", "radius", "duration"]
  };

  var SKILL_STAT_LABELS = {
    damage: "傷害", dps: "每秒傷害", count: "數量", cooldown: "冷卻",
    speed: "速度", pierce: "貫穿", eliteMult: "精英倍率", radius: "範圍",
    duration: "持續時間", pull: "吸力", hitRadius: "命中範圍",
    knockback: "擊退", rotSpeed: "轉速", fireCooldown: "射擊間隔", range: "射程",
    tickCooldown: "扣血間隔"
  };

  function compactNumber(value) {
    var rounded = Math.round(value * 100) / 100;
    return Math.abs(rounded - Math.round(rounded)) < 0.001 ? String(Math.round(rounded)) : String(rounded);
  }

  function formatSkillStat(key, value, player, skill) {
    if (key === "cooldown") {
      var rawMult = player && player.cooldownMult != null ? Number(player.cooldownMult) : 1;
      if (!isFinite(rawMult)) rawMult = 1;
      var minMult = player && player.minCooldownMult != null ? player.minCooldownMult : 0.60;
      value = Math.max(skill && skill.minCooldown || 0.45, value * Math.max(minMult, rawMult));
    }
    if (key === "damage" || key === "dps") value *= player && player.damageMult != null ? player.damageMult : 1;
    if (key === "cooldown" || key === "duration" || key === "fireCooldown" || key === "tickCooldown") return compactNumber(value) + " 秒";
    if (key === "eliteMult" || key === "pull") return "×" + compactNumber(value);
    return compactNumber(value);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function makeCharacterVisual(character, skinId, className, fallbackScale) {
    var skin = global.GameData && global.GameData.getSkin ? global.GameData.getSkin(skinId) : null;
    if (skin && skin.characterId === character.id) {
      var img = document.createElement("img");
      img.className = className || "";
      img.src = skin.previewImage;
      img.alt = character.name + "・" + skin.name;
      img.draggable = false;
      img.addEventListener("error", function () {
        if (!img.parentNode || !global.Sprites || !global.Sprites.makeCanvas) return;
        var canvas = global.Sprites.makeCanvas(character.spriteId, fallbackScale || 5);
        canvas.className = className || "";
        img.parentNode.replaceChild(canvas, img);
      }, { once: true });
      return img;
    }
    var fallback = global.Sprites.makeCanvas(character.spriteId, fallbackScale || 5);
    fallback.className = className || "";
    return fallback;
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
        "#screen-menu .stage-start-button",
        "#screen-characters .screen-footer .btn",
        "#screen-characters .guardian-apply",
        "#screen-gacha .btn",
        "#screen-achievements .screen-footer .btn",
        "#screen-achievements .achievement-claim",
        "#screen-help .screen-footer .btn",
        "#screen-settings .screen-footer .btn",
        "#overlay-pause .btn",
        "#overlay-knowledge .btn",
        "#overlay-gacha-result .btn",
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
    "achievement-claim-all": "ui_icon_confirm",
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

  function focusWithoutScroll(target) {
    if (!target || !target.focus) return;
    try { target.focus({ preventScroll: true }); }
    catch (e) { target.focus(); }
  }

  function dialogFocusableElements(overlay) {
    if (!overlay) return [];
    return Array.prototype.filter.call(overlay.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ), function (item) {
      var style = global.getComputedStyle ? global.getComputedStyle(item) : null;
      return !style || (style.display !== "none" && style.visibility !== "hidden");
    });
  }

  function openDialog(overlay, preferredSelector) {
    if (!overlay) return;
    var wasHidden = overlay.classList.contains("hidden");
    if (wasHidden && document.activeElement && !overlay.contains(document.activeElement)) {
      overlay._returnFocus = document.activeElement;
    }
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    global.requestAnimationFrame(function () {
      if (overlay.classList.contains("hidden")) return;
      var target = preferredSelector ? overlay.querySelector(preferredSelector) : null;
      if (!target) target = dialogFocusableElements(overlay)[0];
      if (!target) target = overlay.querySelector('[tabindex="-1"]') || overlay;
      focusWithoutScroll(target);
    });
  }

  function closeDialog(overlay) {
    if (!overlay) return;
    var wasOpen = !overlay.classList.contains("hidden");
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    if (!wasOpen) return;
    var returnFocus = overlay._returnFocus;
    overlay._returnFocus = null;
    if (returnFocus && document.contains(returnFocus) && !returnFocus.disabled) {
      focusWithoutScroll(returnFocus);
    }
  }

  function installDialogFocusTrap() {
    if (document.documentElement.dataset.dialogFocusTrap === "true") return;
    document.documentElement.dataset.dialogFocusTrap = "true";
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var dialogs = Array.prototype.filter.call(document.querySelectorAll('[role="dialog"]'), function (dialog) {
        return !dialog.classList.contains("hidden") && dialog.getAttribute("aria-hidden") !== "true";
      });
      var overlay = dialogs[dialogs.length - 1];
      if (!overlay) return;
      var focusable = dialogFocusableElements(overlay);
      if (!focusable.length) {
        e.preventDefault();
        focusWithoutScroll(overlay.querySelector('[tabindex="-1"]') || overlay);
        return;
      }
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        focusWithoutScroll(last);
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        focusWithoutScroll(first);
      }
    });
  }

  var UI = {
    init: function (app) {
      this.app = app;
      this.normalizeSettingsRows();
      this.normalizeActionButtons();
      this.dom = {
        menuCoins: $("menu-coins"),
        shopCoins: $("shop-coins"),
        characterCoins: $("character-coins"),
        gachaCoins: $("gacha-coins"),
        characterList: $("character-list"),
        characterDetail: $("character-detail"),
        gachaCollection: $("gacha-collection"),
        gachaMachine: $("gacha-machine"),
        gachaResult: $("gacha-result"),
        gachaPool: $("gacha-pool"),
        gachaPull: $("gacha-pull"),
        gachaRewardOverlay: $("overlay-gacha-result"),
        gachaRewardPanel: $("gacha-reward-panel"),
        gachaRewardVisual: $("gacha-reward-visual"),
        gachaRewardEyebrow: $("gacha-reward-eyebrow"),
        gachaRewardTitle: $("gacha-reward-title"),
        gachaRewardDesc: $("gacha-reward-desc"),
        gachaRewardBonus: $("gacha-reward-bonus"),
        shopList: $("shop-list"),
        achievementList: $("achievement-list"),
        achievementCompleteCount: $("achievement-complete-count"),
        achievementTotalCount: $("achievement-total-count"),
        achievementClaimableCount: $("achievement-claimable-count"),
        achievementMenuBadge: $("achievement-menu-badge"),
        achievementCodexBadge: $("achievement-codex-badge"),
        achievementClaimAll: $("achievement-claim-all"),
        codexList: $("codex-list"), codexDesc: $("codex-view-desc"),
        hud: $("hud"),
        hpFill: $("hp-fill"), hpText: $("hp-text"),
        timer: $("hud-timer"), objective: $("hud-objective"), zone: $("hud-zone"),
        runIntroOverlay: $("overlay-run-intro"), runIntroGoal: $("run-intro-goal"),
        runIntroCountdown: $("run-intro-countdown"), runIntroSkipHint: $("run-intro-skip-hint"),
        enemyIntroOverlay: $("overlay-enemy-intro"), enemyIntroCard: $("enemy-intro-card"),
        enemyIntroEyebrow: $("enemy-intro-eyebrow"), enemyIntroPortrait: $("enemy-intro-portrait"),
        enemyIntroThreat: $("enemy-intro-threat"), enemyIntroTitle: $("enemy-intro-title"),
        enemyIntroText: $("enemy-intro-text"), enemyIntroHint: $("enemy-intro-hint"),
        level: $("hud-level"), xpFill: $("xp-fill"),
        coins: $("hud-coins"), purified: $("hud-purified"),
        quizStreak: $("hud-quiz-streak"),
        skills: $("hud-skills"), passives: $("hud-passives"), charname: $("hud-charname"),
        skillDetail: $("hud-skill-detail"), skillDetailIcon: $("hud-skill-detail-icon"),
        skillDetailType: $("hud-skill-detail-type"), skillDetailLevel: $("hud-skill-detail-level"),
        skillDetailTitle: $("hud-skill-detail-title"), skillDetailDesc: $("hud-skill-detail-desc"),
        skillDetailStats: $("hud-skill-detail-stats"),
        dashButton: $("dash-btn"), dashCooldown: $("dash-cooldown"),
        levelupOverlay: $("overlay-levelup"), levelupOptions: $("levelup-options"),
        levelupTitle: $("levelup-title"), levelupFeedback: $("levelup-feedback"),
        knowledgeOverlay: $("overlay-knowledge"),
        knowledgeIcon: $("knowledge-card-icon"),
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
      installDialogFocusTrap();
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
      if (this.dom.enemyIntroOverlay) {
        this.dom.enemyIntroOverlay.addEventListener("click", function (e) {
          if (uiSelf.dom.enemyIntroOverlay.classList.contains("hidden")) return;
          e.preventDefault();
          e.stopPropagation();
          uiSelf.hideEnemyIntro(true);
        });
        this.dom.enemyIntroOverlay.addEventListener("keydown", function (e) {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          uiSelf.hideEnemyIntro(true);
        });
      }
      if (this.dom.skillDetail) {
        this.dom.skillDetail.addEventListener("click", function (e) { e.stopPropagation(); });
        global.addEventListener("click", function (e) {
          if (!uiSelf.dom || !uiSelf.dom.skillDetail || uiSelf.dom.skillDetail.classList.contains("hidden")) return;
          if (e.target && e.target.closest && e.target.closest(".skill-chip, .passive-chip, .hud-skill-detail")) return;
          uiSelf.hideHudSkillDetail();
        });
      }
      if (this.dom.knowledgeContinue) {
        this.dom.knowledgeContinue.addEventListener("click", function (e) {
          e.preventDefault();
          uiSelf.hideKnowledgeCard(true);
        });
      }
      Array.prototype.forEach.call(document.querySelectorAll("[data-codex-view]"), function (tab) {
        tab.addEventListener("click", function () {
          uiSelf.setCodexView(tab.dataset.codexView);
        });
        tab.addEventListener("keydown", function (e) {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
          var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-codex-view]"));
          var current = tabs.indexOf(tab);
          var next = e.key === "Home" ? 0 : (e.key === "End" ? tabs.length - 1 : current + (e.key === "ArrowRight" ? 1 : -1));
          next = (next + tabs.length) % tabs.length;
          e.preventDefault();
          uiSelf.setCodexView(tabs[next].dataset.codexView);
          focusWithoutScroll(tabs[next]);
        });
      });
      Array.prototype.forEach.call(document.querySelectorAll("[data-achievement-group]"), function (tab) {
        tab.addEventListener("click", function () {
          uiSelf.setAchievementGroup(tab.dataset.achievementGroup);
        });
        tab.addEventListener("keydown", function (e) {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
          var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-achievement-group]"));
          var current = tabs.indexOf(tab);
          var next = e.key === "Home" ? 0 : (e.key === "End" ? tabs.length - 1 : current + (e.key === "ArrowRight" ? 1 : -1));
          next = (next + tabs.length) % tabs.length;
          e.preventDefault();
          uiSelf.setAchievementGroup(tabs[next].dataset.achievementGroup);
          focusWithoutScroll(tabs[next]);
        });
      });
      this._achievementGroup = "all";
      this.applyUiAssets();
      this.updateHomeCharacterPreview(app && app.selectedCharacterId);
      this.updateAchievementMenuBadge();
      this.scheduleUiAssetRefresh();
    },

    updateCoinLabels: function () {
      var c = global.Storage.getCoins();
      if (this.dom.menuCoins) this.dom.menuCoins.textContent = c;
      if (this.dom.shopCoins) this.dom.shopCoins.textContent = c;
      if (this.dom.characterCoins) this.dom.characterCoins.textContent = c;
      if (this.dom.gachaCoins) this.dom.gachaCoins.textContent = c;
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

      var equippedSkin = global.Storage && global.Storage.getEquippedSkin ? global.Storage.getEquippedSkin(ch.id) : null;
      replaceWithCanvas(this.dom.homeCharacterPortrait, makeCharacterVisual(ch, equippedSkin, "current-character-canvas", 5), "current-character-canvas");
      if (this.dom.menuArt) {
        var art = makeCharacterVisual(ch, equippedSkin, "menu-character-canvas", 6);
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
      if (this.dom.knowledgeIcon) {
        this.dom.knowledgeIcon.innerHTML = "";
        if (entry.iconPath) {
          var knowledgeImg = document.createElement("img");
          knowledgeImg.src = entry.iconPath;
          knowledgeImg.alt = "";
          knowledgeImg.decoding = "async";
          this.dom.knowledgeIcon.appendChild(knowledgeImg);
        }
      }
      this.dom.knowledgeTitle.textContent = entry.title;
      this.dom.knowledgeText.textContent = entry.text;
      openDialog(overlay, "#knowledge-card-continue");
    },

    hideKnowledgeCard: function (notify) {
      if (this.dom && this.dom.knowledgeOverlay) closeDialog(this.dom.knowledgeOverlay);
      var cb = this._knowledgeContinue;
      this._knowledgeContinue = null;
      if (notify !== false && cb) cb();
    },

    isKnowledgeVisible: function () {
      return !!(this.dom && this.dom.knowledgeOverlay && !this.dom.knowledgeOverlay.classList.contains("hidden"));
    },

    showEnemyIntro: function (intro, onContinue) {
      var d = this.dom;
      var overlay = d && d.enemyIntroOverlay;
      if (!overlay) {
        if (onContinue) onContinue();
        return;
      }
      this._enemyIntroContinue = onContinue || null;
      overlay.classList.remove("elite", "boss");
      if (intro.isBoss) overlay.classList.add("boss");
      else if (intro.isElite) overlay.classList.add("elite");

      if (d.enemyIntroEyebrow) d.enemyIntroEyebrow.textContent = intro.isBoss ? "BOSS 污染警報" : "新污染物出現";
      if (d.enemyIntroThreat) d.enemyIntroThreat.textContent = intro.isBoss ? "大型污染源" : (intro.isElite ? "精英污染物" : "一般污染物");
      if (d.enemyIntroTitle) d.enemyIntroTitle.textContent = intro.name;
      if (d.enemyIntroText) d.enemyIntroText.textContent = intro.text || "新的污染物進入潮間帶。";
      if (d.enemyIntroHint) d.enemyIntroHint.textContent = intro.hint || "觀察行動模式，再選擇淨化方式。";
      if (d.enemyIntroPortrait) {
        d.enemyIntroPortrait.innerHTML = "";
        var enemyDef = global.GameData && global.GameData.getEnemy ? global.GameData.getEnemy(intro.id) : null;
        var portraitBase = enemyDef && enemyDef.spriteBasePath;
        var introImage = null;

        function appendCanvasFallback() {
          if (!global.Sprites || !global.Sprites.makeCanvas) return;
          var portrait = global.Sprites.makeCanvas(intro.spriteId, intro.isBoss ? 12 : 10);
          portrait.className = "enemy-intro-portrait-canvas";
          d.enemyIntroPortrait.appendChild(portrait);
        }

        if (portraitBase) {
          introImage = document.createElement("img");
          introImage.className = "enemy-intro-portrait-image";
          introImage.alt = intro.name;
          introImage.decoding = "async";
          introImage.src = portraitBase + "idle_S_0.png?v=" + (enemyDef.spriteVersion || "intro1");
          introImage.onerror = function () {
            introImage.remove();
            appendCanvasFallback();
          };
          d.enemyIntroPortrait.appendChild(introImage);
        } else {
          appendCanvasFallback();
        }
      }

      overlay.classList.remove("hidden");
      overlay.setAttribute("aria-hidden", "false");
      if (overlay.focus) overlay.focus({ preventScroll: true });
    },

    hideEnemyIntro: function (notify) {
      var overlay = this.dom && this.dom.enemyIntroOverlay;
      if (overlay) {
        overlay.classList.add("hidden");
        overlay.setAttribute("aria-hidden", "true");
        void overlay.offsetWidth;
      }
      var cb = this._enemyIntroContinue;
      this._enemyIntroContinue = null;
      if (notify !== false && cb) cb();
    },

    isEnemyIntroVisible: function () {
      return !!(this.dom && this.dom.enemyIntroOverlay && !this.dom.enemyIntroOverlay.classList.contains("hidden"));
    },

    buildCharacters: function (selectedId) {
      var list = this.dom.characterList;
      var detail = this.dom.characterDetail;
      var previousScrollTop = list.scrollTop;
      var previousScrollLeft = list.scrollLeft;
      var focusedCharacterId = document.activeElement && document.activeElement.closest
        ? (document.activeElement.closest("#character-list .guardian-list-card") || {}).dataset
        : null;
      focusedCharacterId = focusedCharacterId && focusedCharacterId.id;
      list.innerHTML = "";
      detail.innerHTML = "";
      var chars = global.GameData.characters;
      var self = this;
      var selected = global.GameData.getCharacter(selectedId) || chars[0];
      chars.forEach(function (ch) {
        var owned = global.Storage.isCharacterOwned(ch.id);
        var progress = global.Storage.getCharacterProgress(ch.id);
        var card = el("div", "char-card guardian-list-card" + (owned ? "" : " locked"));
        if (ch.id === selectedId) card.classList.add("selected");
        card.dataset.id = ch.id;
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-pressed", ch.id === selectedId ? "true" : "false");
        card.setAttribute("aria-label", ch.name + "，" + (owned ? ch.role : "尚未解鎖，需從扭蛋取得") + (progress.availablePoints > 0 ? "，可用技能點 " + progress.availablePoints : ""));
        var portrait = makeCharacterVisual(ch, global.Storage.getEquippedSkin(ch.id), "char-portrait", 4);
        card.appendChild(portrait);
        var brief = el("div", "guardian-list-copy");
        brief.appendChild(el("div", "char-name", ch.name));
        brief.appendChild(el("div", "char-role", owned ? ch.role : "🔒 扭蛋取得"));
        card.appendChild(brief);
        if (progress.availablePoints > 0) card.appendChild(el("span", "guardian-point-badge", String(progress.availablePoints)));
        if (self.app.selectedCharacterId === ch.id) card.appendChild(el("span", "guardian-current-mark", "使用中"));
        card.addEventListener("click", function () { self.app.selectCharacter(ch.id); });
        card.addEventListener("keydown", function (e) {
          if (e.code === "Enter" || e.code === "Space") {
            e.preventDefault();
            self.app.selectCharacter(ch.id);
          }
        });
        list.appendChild(card);
      });

      var owned = global.Storage.isCharacterOwned(selected.id);
      var skill = global.GameData.getSkill(selected.startingSkill);
      var equippedSkinId = global.Storage.getEquippedSkin(selected.id);
      var equippedSkin = global.GameData.getSkin(equippedSkinId);
      var progress = global.Storage.getCharacterProgress(selected.id);
      var pending = this.app.pendingCharacterStats || { attack: 0, speed: 0, hp: 0 };
      var pendingTotal = pending.attack + pending.speed + pending.hp;
      var pointsLeft = Math.max(0, progress.availablePoints - pendingTotal);

      var showcase = el("div", "guardian-showcase");
      var stateLabel = el("div", "guardian-state", owned ? (this.app.selectedCharacterId === selected.id ? "目前使用" : "已解鎖") : "🔒 尚未解鎖");
      showcase.appendChild(stateLabel);
      showcase.appendChild(makeCharacterVisual(selected, equippedSkinId, "guardian-main-portrait", 7));
      showcase.appendChild(el("h3", "guardian-name", selected.name));
      showcase.appendChild(el("div", "guardian-role", "定位：" + selected.role));
      showcase.appendChild(el("div", "guardian-skill", "初始技能：" + (skill ? skill.name : selected.startingSkill)));
      showcase.appendChild(el("div", "guardian-passive", "被動：" + selected.passiveText));
      if (!owned) showcase.appendChild(el("div", "guardian-unlock-hint", "可從生態扭蛋解鎖；已抽到的 Skin 會先保留。"));
      detail.appendChild(showcase);

      var manage = el("div", "guardian-manage");
      manage.appendChild(el("h3", "guardian-section-title", "造型 Skin"));
      var skinGrid = el("div", "guardian-skins");
      var defaultCard = el("button", "guardian-skin-card" + (!equippedSkinId ? " active" : ""));
      defaultCard.type = "button";
      defaultCard.setAttribute("aria-pressed", String(!equippedSkinId));
      defaultCard.setAttribute("aria-label", "預設造型，無額外加成" + (!equippedSkinId ? "，目前裝備" : ""));
      defaultCard.title = "預設造型｜無額外加成";
      defaultCard.appendChild(makeCharacterVisual(selected, null, "guardian-skin-thumb", 3));
      defaultCard.appendChild(el("span", "guardian-skin-name", "預設造型"));
      defaultCard.appendChild(el("span", "guardian-skin-bonus", "無額外加成"));
      defaultCard.disabled = !owned;
      defaultCard.addEventListener("click", function () { self.app.equipCharacterSkin("default"); });
      skinGrid.appendChild(defaultCard);

      global.GameData.getCharacterSkins(selected.id).forEach(function (skin) {
        var skinOwned = global.Storage.isSkinOwned(skin.id);
        var active = equippedSkinId === skin.id;
        var card = el("button", "guardian-skin-card" + (active ? " active" : "") + (skinOwned ? "" : " locked"));
        card.type = "button";
        card.setAttribute("aria-pressed", String(active));
        card.setAttribute("aria-label", skin.name + "，" + skin.statName + "加成 10%，" + (active ? "目前裝備" : (skinOwned ? "已取得" : "尚未取得")));
        card.title = skin.name + "｜" + skin.statName + " +10%";
        card.disabled = !skinOwned || !owned;
        if (skinOwned) card.appendChild(makeCharacterVisual(selected, skin.id, "guardian-skin-thumb", 3));
        else card.appendChild(el("span", "guardian-skin-silhouette", "?"));
        card.appendChild(el("span", "guardian-skin-name", skinOwned ? skin.name : "尚未取得"));
        card.appendChild(el("span", "guardian-skin-bonus", skin.statName + " +10%"));
        card.addEventListener("click", function () { self.app.equipCharacterSkin(skin.id); });
        skinGrid.appendChild(card);
      });
      manage.appendChild(skinGrid);

      var upgradeHeader = el("div", "guardian-upgrade-header");
      upgradeHeader.appendChild(el("h3", "guardian-section-title", "能力強化"));
      upgradeHeader.appendChild(el("div", "guardian-points", "可用技能點：" + pointsLeft));
      manage.appendChild(upgradeHeader);

      var statDefs = [
        { id: "attack", label: "攻擊力", icon: "⚔" },
        { id: "speed", label: "移動速度", icon: "➤" },
        { id: "hp", label: "最大生命", icon: "♥" }
      ];
      var stats = el("div", "guardian-stats");
      statDefs.forEach(function (def) {
        var row = el("div", "guardian-stat-row");
        row.appendChild(el("span", "guardian-stat-icon", def.icon));
        var copy = el("div", "guardian-stat-copy");
        copy.appendChild(el("span", "guardian-stat-name", def.label));
        var skinExtra = equippedSkin && equippedSkin.stat === def.id ? 10 : 0;
        var totalPercent = (progress.stats[def.id] + pending[def.id]) * 5 + skinExtra;
        copy.appendChild(el("span", "guardian-stat-value", "Lv." + progress.stats[def.id] + (pending[def.id] ? " → " + (progress.stats[def.id] + pending[def.id]) : "") + "　總加成 +" + totalPercent + "%"));
        row.appendChild(copy);
        var minus = el("button", "guardian-stat-button", "−");
        minus.type = "button";
        minus.setAttribute("aria-label", "減少" + def.label + "的待分配技能點");
        minus.title = "減少" + def.label;
        minus.disabled = pending[def.id] <= 0;
        minus.addEventListener("click", function () { self.app.changePendingCharacterStat(def.id, -1); });
        row.appendChild(minus);
        var plus = el("button", "guardian-stat-button", "+");
        plus.type = "button";
        plus.setAttribute("aria-label", "增加" + def.label + " 5% 的待分配技能點");
        plus.title = "增加" + def.label + " 5%";
        plus.disabled = !owned || pointsLeft <= 0;
        plus.addEventListener("click", function () { self.app.changePendingCharacterStat(def.id, 1); });
        row.appendChild(plus);
        stats.appendChild(row);
      });
      manage.appendChild(stats);
      var apply = el("button", "btn btn-primary guardian-apply", "確認分配" + (pendingTotal ? "（" + pendingTotal + "）" : ""));
      apply.type = "button";
      apply.disabled = !owned || pendingTotal <= 0;
      apply.addEventListener("click", function () { self.app.confirmCharacterStats(); });
      manage.appendChild(apply);
      detail.appendChild(manage);

      var confirm = $("confirm-character");
      if (confirm) confirm.disabled = !owned;
      this.normalizeActionButtons();
      this.applyUiAssets();

      // 清單每次重建都保留原本的捲動與鍵盤焦點；若從其他頁面直接選到後段角色，
      // 再把選取卡片移到清單可視範圍內，不讓整個角色詳情頁跟著跳動。
      global.requestAnimationFrame(function () {
        list.scrollTop = previousScrollTop;
        list.scrollLeft = previousScrollLeft;
        var selectedCard = list.querySelector(".guardian-list-card.selected");
        if (selectedCard) {
          var listRect = list.getBoundingClientRect();
          var cardRect = selectedCard.getBoundingClientRect();
          if (cardRect.top < listRect.top) list.scrollTop -= listRect.top - cardRect.top + 4;
          else if (cardRect.bottom > listRect.bottom) list.scrollTop += cardRect.bottom - listRect.bottom + 4;
          if (cardRect.left < listRect.left) list.scrollLeft -= listRect.left - cardRect.left + 4;
          else if (cardRect.right > listRect.right) list.scrollLeft += cardRect.right - listRect.right + 4;
        }
        if (focusedCharacterId) {
          var focusCards = list.querySelectorAll(".guardian-list-card");
          for (var i = 0; i < focusCards.length; i++) {
            if (focusCards[i].dataset.id === focusedCharacterId) {
              try { focusCards[i].focus({ preventScroll: true }); }
              catch (e) { focusCards[i].focus(); }
              break;
            }
          }
        }
      });
    },

    showGachaResult: function (result) {
      var d = this.dom;
      if (!result || !result.ok || !d.gachaRewardOverlay) return false;
      var character = result.character || (result.skin && global.GameData.getCharacter(result.skin.characterId));
      var skinId = result.kind === "new-skin" && result.skin ? result.skin.id : null;
      var eyebrow = "扭蛋結果";
      var title = result.item && result.item.name ? result.item.name : "獲得物品";
      var desc = "獎勵已加入收藏。";
      var bonus = "";
      var accent = "#78d66b";

      if (result.kind === "new-character") {
        eyebrow = "新角色解鎖";
        title = result.character.name;
        desc = "已永久解鎖，可前往角色選擇使用。";
        bonus = "角色已加入隊伍";
      } else if (result.kind === "duplicate-character") {
        eyebrow = "重複角色轉換";
        title = result.character.name;
        desc = "已自動轉換為該角色的專用技能點。";
        bonus = result.character.name + " 技能點 +" + (result.points || 1);
        accent = "#ffd84a";
      } else if (result.kind === "new-skin") {
        eyebrow = "新造型獲得";
        title = result.skin.name;
        desc = "造型已永久加入收藏，並從扭蛋獎池移除。";
        bonus = result.skin.statName + " +10%";
        accent = result.skin.accent || "#4dd0c4";
      }

      if (d.gachaRewardPanel) {
        d.gachaRewardPanel.classList.remove("new-character", "duplicate-character", "new-skin");
        if (result.kind) d.gachaRewardPanel.classList.add(result.kind);
        d.gachaRewardPanel.style.setProperty("--reward-accent", accent);
      }
      if (d.gachaRewardEyebrow) d.gachaRewardEyebrow.textContent = eyebrow;
      if (d.gachaRewardTitle) d.gachaRewardTitle.textContent = title;
      if (d.gachaRewardDesc) d.gachaRewardDesc.textContent = desc;
      if (d.gachaRewardBonus) d.gachaRewardBonus.textContent = bonus;
      if (d.gachaRewardVisual) {
        d.gachaRewardVisual.innerHTML = "";
        if (character) {
          d.gachaRewardVisual.appendChild(makeCharacterVisual(
            character,
            skinId,
            "gacha-reward-image",
            6
          ));
        }
      }
      this.normalizeActionButtons();
      this.applyUiAssets();
      openDialog(d.gachaRewardOverlay, '[data-action="gacha-result-confirm"]');
      return true;
    },

    hideGachaResult: function () {
      if (this.dom && this.dom.gachaRewardOverlay) closeDialog(this.dom.gachaRewardOverlay);
    },

    isGachaResultVisible: function () {
      return !!(this.dom && this.dom.gachaRewardOverlay && !this.dom.gachaRewardOverlay.classList.contains("hidden"));
    },

    setGachaDrawing: function (drawing) {
      if (this.dom.gachaMachine) this.dom.gachaMachine.classList.toggle("drawing", !!drawing);
      if (this.dom.gachaPull) this.dom.gachaPull.disabled = !!drawing;
      if (drawing && this.dom.gachaResult) this.dom.gachaResult.textContent = "扭蛋轉動中…";
    },

    buildGacha: function (result) {
      if (!this.dom.gachaPool) return;
      var pool = global.Gacha.getPool();
      var chance = pool.length ? 100 / pool.length : 0;
      var ownedSkins = global.Storage.data.ownedSkins.length;
      var ownedCharacters = global.GameData.characters.filter(function (ch) { return global.Storage.isCharacterOwned(ch.id); }).length;
      this.dom.gachaCollection.innerHTML = "<span>角色 " + ownedCharacters + "/" + global.GameData.characters.length + "</span><span>Skin " + ownedSkins + "/" + global.GameData.skins.length + "</span><span>獎池 " + pool.length + " 項</span>";
      this.dom.gachaPool.innerHTML = "";
      pool.forEach(function (item) {
        var row = el("div", "gacha-pool-item " + item.type);
        var visualCharacter = item.type === "character"
          ? item.character
          : global.GameData.getCharacter(item.skin.characterId);
        var visual = el("span", "gacha-pool-thumb");
        row.setAttribute("role", "listitem");
        if (item.skin && item.skin.accent) row.style.setProperty("--gacha-item-accent", item.skin.accent);
        visual.setAttribute("aria-hidden", "true");
        if (visualCharacter) {
          visual.appendChild(makeCharacterVisual(
            visualCharacter,
            item.type === "skin" ? item.id : null,
            "gacha-pool-thumb-image",
            4
          ));
        }
        row.appendChild(visual);
        row.appendChild(el("span", "gacha-pool-kind", item.type === "character" ? "角色" : "Skin"));
        row.appendChild(el("span", "gacha-pool-name", item.name));
        row.appendChild(el("span", "gacha-pool-chance", chance.toFixed(chance < 10 ? 2 : 1) + "%"));
        global.UI.dom.gachaPool.appendChild(row);
      });

      if (result && result.ok) {
        var title = "";
        var desc = "";
        if (result.kind === "new-character") {
          title = "新角色解鎖：" + result.character.name;
          desc = "現在可以前往角色選擇使用。";
        } else if (result.kind === "duplicate-character") {
          title = "重複角色：" + result.character.name;
          desc = "已轉換為該角色技能點 +1。";
        } else {
          title = "新 Skin：" + result.skin.name;
          desc = result.skin.statName + " +10%，已永久移出獎池。";
        }
        this.dom.gachaResult.innerHTML = "<strong>" + title + "</strong><span>" + desc + "</span>";
        this.dom.gachaMachine.classList.add("revealed");
        global.setTimeout(function () {
          if (global.UI && global.UI.dom.gachaMachine) global.UI.dom.gachaMachine.classList.remove("revealed");
        }, 900);
      } else if (!this.dom.gachaResult.textContent) {
        this.dom.gachaResult.textContent = "準備好後轉動扭蛋機！";
      }
      this.dom.gachaPull.textContent = "抽取一次　♻ " + global.Gacha.getCost().toLocaleString("zh-TW");
      this.dom.gachaPull.disabled = global.Storage.getCoins() < global.Gacha.getCost();
      this.updateCoinLabels();
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
          btn.setAttribute("aria-label", "升級" + item.name + "，花費 " + price + " 枚循環幣");
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

    setAchievementGroup: function (group) {
      if (group !== "guardian" && group !== "challenge") group = "all";
      this._achievementGroup = group;
      Array.prototype.forEach.call(document.querySelectorAll("[data-achievement-group]"), function (tab) {
        var active = tab.dataset.achievementGroup === group;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      if (this.dom.achievementList) {
        this.dom.achievementList.setAttribute("aria-labelledby", "achievement-tab-" + group);
      }
      this.buildAchievements();
    },

    updateAchievementMenuBadge: function () {
      if (!this.dom || !global.Achievements) return;
      var summary = global.Achievements.getSummary();
      var count = summary.claimable || 0;
      var label = count > 99 ? "99+" : String(count);
      var badges = [this.dom.achievementMenuBadge, this.dom.achievementCodexBadge];
      badges.forEach(function (badge) {
        if (!badge) return;
        badge.textContent = label;
        badge.classList.toggle("hidden", count <= 0);
        badge.setAttribute("aria-hidden", String(count <= 0));
      });
      var menuButton = this.dom.achievementMenuBadge && this.dom.achievementMenuBadge.closest("button");
      if (menuButton) menuButton.setAttribute("aria-label", count ? ("圖鑑/成就，有 " + count + " 項獎勵可領取") : "圖鑑/成就");
      var codexButton = this.dom.achievementCodexBadge && this.dom.achievementCodexBadge.closest("button");
      if (codexButton) codexButton.setAttribute("aria-label", count ? ("切換至成就，有 " + count + " 項獎勵可領取") : "切換至成就");
    },

    updateAchievementSummary: function () {
      if (!global.Achievements) return;
      var summary = global.Achievements.getSummary();
      if (this.dom.achievementCompleteCount) this.dom.achievementCompleteCount.textContent = summary.completed;
      if (this.dom.achievementTotalCount) this.dom.achievementTotalCount.textContent = summary.total;
      if (this.dom.achievementClaimableCount) this.dom.achievementClaimableCount.textContent = summary.claimable;
      if (this.dom.achievementClaimAll) this.dom.achievementClaimAll.disabled = summary.claimable <= 0;
      this.updateAchievementMenuBadge();
    },

    buildAchievements: function () {
      var list = this.dom && this.dom.achievementList;
      if (!list || !global.Achievements) return;
      var group = this._achievementGroup || "all";
      var filter = group === "all" ? null : { group: group };
      var tierNames = { bronze: "標準", silver: "進階", gold: "菁英" };
      var self = this;
      var items = global.Achievements.getAll(filter);

      function available(item) {
        if (item.unlocked) return true;
        if (item.characterId && global.Storage.isCharacterOwned && !global.Storage.isCharacterOwned(item.characterId)) return false;
        if (item.stageId && global.Storage.isStageUnlocked && !global.Storage.isStageUnlocked(item.stageId)) return false;
        return true;
      }

      function stateRank(item) {
        if (item.claimable) return 0;
        if (!item.claimed && available(item)) return 1;
        if (!item.claimed) return 2;
        return 3;
      }

      items.sort(function (a, b) {
        var rank = stateRank(a) - stateRank(b);
        return rank || a.order - b.order;
      });
      list.innerHTML = "";

      items.forEach(function (item) {
        var isAvailable = available(item);
        var stateClass = item.claimed ? "is-claimed" : (item.claimable ? "is-claimable" : (isAvailable ? "is-progressing" : "is-locked"));
        var statusText = item.claimed ? "已領取" : (item.claimable ? "可領取" : (isAvailable ? "進行中" : "尚未開放"));
        var current = item.unlocked ? item.target : Math.min(item.target, Math.max(0, item.progress || 0));
        var percent = item.target > 0 ? Math.min(100, current / item.target * 100) : 0;
        var titleId = "achievement-title-" + item.id;

        var card = el("article", "achievement-card " + stateClass);
        card.dataset.achievementId = item.id;
        card.setAttribute("role", "listitem");
        card.setAttribute("aria-labelledby", titleId);

        var iconFrame = el("div", "achievement-icon-frame");
        var icon = document.createElement("img");
        icon.className = "achievement-icon";
        icon.src = item.icon;
        icon.alt = "";
        icon.loading = "lazy";
        icon.decoding = "async";
        iconFrame.appendChild(icon);
        iconFrame.appendChild(el("span", "achievement-tier " + item.tier, tierNames[item.tier] || item.tier));
        card.appendChild(iconFrame);

        var copy = el("div", "achievement-copy");
        var titleRow = el("div", "achievement-title-row");
        var title = el("h3", "achievement-name", item.title);
        title.id = titleId;
        titleRow.appendChild(title);
        titleRow.appendChild(el("span", "achievement-status", statusText));
        copy.appendChild(titleRow);
        copy.appendChild(el("p", "achievement-desc", item.description));

        var progressRow = el("div", "achievement-progress-row");
        var progress = el("div", "achievement-progress");
        progress.setAttribute("role", "progressbar");
        progress.setAttribute("aria-label", item.title + "進度");
        progress.setAttribute("aria-valuemin", "0");
        progress.setAttribute("aria-valuemax", String(item.target));
        progress.setAttribute("aria-valuenow", String(current));
        progress.setAttribute("aria-valuetext", current.toLocaleString("zh-TW") + " / " + item.target.toLocaleString("zh-TW") + " " + item.unit);
        var fill = el("span");
        fill.style.width = percent + "%";
        progress.appendChild(fill);
        progressRow.appendChild(progress);
        var output = el("output", "achievement-progress-value", current.toLocaleString("zh-TW") + " / " + item.target.toLocaleString("zh-TW") + " " + item.unit);
        progressRow.appendChild(output);
        copy.appendChild(progressRow);
        card.appendChild(copy);

        var reward = el("div", "achievement-reward");
        reward.appendChild(el("span", "achievement-reward-label", "獎勵"));
        reward.appendChild(el("strong", "achievement-reward-value", item.rewardLabel));
        var button = el("button", "btn btn-primary achievement-claim", item.claimed ? "已領取" : (item.claimable ? "領取" : (isAvailable ? "進行中" : "未解鎖")));
        button.type = "button";
        button.disabled = !item.claimable;
        button.setAttribute("aria-label", (item.claimable ? "領取" : statusText) + "：" + item.title);
        if (item.claimable) {
          button.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            self.app.claimAchievement(item.id);
          });
        }
        reward.appendChild(button);
        card.appendChild(reward);
        list.appendChild(card);
      });

      if (!items.length) list.appendChild(el("p", "achievement-empty", "這個分類目前沒有成就。"));
      this.updateAchievementSummary();
      this.normalizeActionButtons();
      this.applyUiAssets();
    },

    setCodexView: function (view) {
      if (view !== "knowledge") view = "enemies";
      this._codexView = view;
      Array.prototype.forEach.call(document.querySelectorAll("[data-codex-view]"), function (tab) {
        var active = tab.dataset.codexView === view;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      this.buildCodex();
    },

    buildCodex: function () {
      var list = this.dom.codexList;
      if (!list) return;
      this.updateAchievementMenuBadge();
      var view = this._codexView === "knowledge" ? "knowledge" : "enemies";
      list.innerHTML = "";
      list.className = "codex-list " + (view === "knowledge" ? "codex-knowledge-list" : "codex-enemy-list");
      list.setAttribute("aria-labelledby", view === "knowledge" ? "codex-tab-knowledge" : "codex-tab-enemies");
      if (this.dom.codexDesc) {
        this.dom.codexDesc.textContent = view === "knowledge"
          ? "在關卡中拾取知識卡，逐步解鎖永續行動與環境知識。"
          : "查看各關卡出現的污染物、威脅類型與行動提示。";
      }
      if (view === "knowledge") this.buildKnowledgeCodex(list);
      else this.buildEnemyCodex(list);
    },

    buildKnowledgeCodex: function (list) {
      var all = global.GameData.knowledge || [];
      all.forEach(function (k, idx) {
        var unlocked = global.Storage.isKnowledgeUnlocked(k.id);
        var item = el("article", "codex-item codex-knowledge-card" + (unlocked ? "" : " locked"));

        var art = el("div", "codex-knowledge-art");
        if (k.iconPath) {
          var img = document.createElement("img");
          img.src = k.iconPath;
          img.alt = unlocked ? k.title : "";
          img.loading = "lazy";
          img.decoding = "async";
          art.appendChild(img);
        }
        art.appendChild(el("span", "codex-num", unlocked ? String(idx + 1) : "?"));
        item.appendChild(art);

        var body = el("div", "codex-body");
        body.appendChild(el("div", "codex-title", unlocked ? k.title : "未解鎖的知識卡"));
        body.appendChild(el("div", "codex-text", unlocked ? k.text : "在關卡中拾取知識卡，即可解鎖這一則永續知識。"));
        item.appendChild(body);
        list.appendChild(item);
      });
    },

    buildEnemyCodex: function (list) {
      var defs = global.GameData.enemies || {};
      var stages = global.GameData.stages || [];
      var entries = [];
      var added = {};

      function addEnemy(id, stage) {
        if (!id || added[id] || !defs[id]) return;
        added[id] = true;
        entries.push({ enemy: defs[id], stage: stage });
      }

      stages.forEach(function (stage) {
        (stage.fallbackEnemies || []).forEach(function (id) { addEnemy(id, stage); });
        (stage.waves || []).forEach(function (wave) {
          (wave.types || []).forEach(function (entry) { addEnemy(entry.enemy, stage); });
        });
        (stage.events || []).forEach(function (event) { addEnemy(event.enemy, stage); });
        addEnemy(stage.bossId, stage);
      });
      Object.keys(defs).forEach(function (id) { addEnemy(id, null); });

      entries.forEach(function (entry) {
        var def = entry.enemy;
        var type = def.isBoss ? "BOSS" : (def.isElite ? "精英污染物" : (def.ranged ? "遠程污染物" : "一般污染物"));
        var item = el("article", "codex-enemy-card" + (def.isBoss ? " boss" : (def.isElite ? " elite" : "")));

        var art = el("div", "codex-enemy-art");
        var img = document.createElement("img");
        var base = def.spriteBasePath || ("assets/images/enemies/" + def.id + "/");
        img.src = base + "idle_S_0.png?v=" + (def.spriteVersion || "codex1");
        img.alt = def.name;
        img.loading = "lazy";
        img.decoding = "async";
        img.onerror = function () {
          img.remove();
          if (!global.Sprites || !global.Sprites.makeCanvas) return;
          var fallback = global.Sprites.makeCanvas(def.spriteId, def.isBoss ? 9 : 7);
          fallback.className = "codex-enemy-canvas";
          art.appendChild(fallback);
        };
        art.appendChild(img);
        art.appendChild(el("span", "codex-enemy-type", type));
        item.appendChild(art);

        var body = el("div", "codex-enemy-body");
        body.appendChild(el("div", "codex-enemy-stage", entry.stage ? ("第 " + entry.stage.order + " 關 · " + entry.stage.shortName) : "特殊污染物"));
        body.appendChild(el("div", "codex-enemy-name", def.name));
        body.appendChild(el("div", "codex-enemy-text", def.introHint || def.introText || "觀察移動方式並保持安全距離。"));
        item.appendChild(body);
        list.appendChild(item);
      });
    },

    showHUD: function (show) {
      this.dom.hud.classList.toggle("hidden", !show);
      if (!show) this.hideHudSkillDetail();
    },

    hideHudSkillDetail: function () {
      if (!this.dom || !this.dom.skillDetail) return;
      this.dom.skillDetail.classList.add("hidden");
      this.dom.skillDetail.setAttribute("aria-hidden", "true");
      if (this._hudDetailOrigin) this._hudDetailOrigin.classList.remove("selected");
      this._hudDetailOrigin = null;
    },

    showHudSkillDetail: function (origin, detail) {
      var d = this.dom;
      if (!d || !d.skillDetail || !origin || !detail) return;
      if (this._hudDetailOrigin === origin && !d.skillDetail.classList.contains("hidden")) {
        this.hideHudSkillDetail();
        return;
      }

      if (this._hudDetailOrigin) this._hudDetailOrigin.classList.remove("selected");
      this._hudDetailOrigin = origin;
      origin.classList.add("selected");

      d.skillDetail.classList.toggle("passive-side", detail.side === "passive");
      d.skillDetailType.textContent = detail.type;
      d.skillDetailLevel.textContent = detail.level;
      d.skillDetailTitle.textContent = detail.name;
      d.skillDetailDesc.textContent = detail.desc;
      d.skillDetailIcon.innerHTML = "";
      var icon = global.Sprites.makeIconCanvas(detail.icon, 46);
      icon.className = "hud-skill-detail-icon-canvas";
      d.skillDetailIcon.appendChild(icon);

      d.skillDetailStats.innerHTML = "";
      (detail.stats || []).forEach(function (stat) {
        var row = el("div", "hud-skill-detail-stat");
        row.appendChild(el("span", "hud-skill-detail-stat-label", stat.label));
        row.appendChild(el("strong", "hud-skill-detail-stat-value", stat.value));
        d.skillDetailStats.appendChild(row);
      });
      d.skillDetailStats.classList.toggle("hidden", !detail.stats || !detail.stats.length);
      d.skillDetail.classList.remove("hidden");
      d.skillDetail.setAttribute("aria-hidden", "false");
    },

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
        if (remaining <= 0 && game.stage.bossId && !game.bossDefeated) {
          d.objective.textContent = "時間到：擊敗 " + (game.stage.bossName || "BOSS") + "！";
        } else if (finalCountdown) d.objective.textContent = "最後 " + Math.ceil(remaining) + " 秒，撐住！";
        else if (game.runIntroActive) d.objective.textContent = "準備迎接污染潮";
        else if (game.mapObjectiveStatus) d.objective.textContent = game.mapObjectiveStatus();
        d.objective.classList.toggle("final-warning", finalCountdown);
      }
      if (d.runIntroOverlay) {
        d.runIntroOverlay.classList.toggle("hidden", !game.runIntroActive);
        if (game.runIntroActive) {
          if (d.runIntroGoal) d.runIntroGoal.textContent = game.stage.objective || objectiveTimeLabel(game.stage.duration);
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
        this.hideHudSkillDetail();
        this._hudSig = sig;
        d.skills.innerHTML = "";
        var detailUi = this;
        p.weapons.forEach(function (w) {
          var chip = el("button", "skill-chip");
          chip.type = "button";
          chip.title = w.skill.name + " Lv." + w.level;
          chip.setAttribute("aria-label", chip.title + "，查看技能資訊");
          var icon = global.Sprites.makeIconCanvas(w.skill.iconId, 40);
          chip.appendChild(icon);
          chip.appendChild(el("span", "lv", "Lv" + w.level));
          chip.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            var current = w.stats();
            var keys = SKILL_STAT_KEYS[w.skill.type] || Object.keys(current);
            var stats = keys.filter(function (key) { return current[key] != null && SKILL_STAT_LABELS[key]; }).map(function (key) {
              var label = key === "damage" && w.skill.damageMode === "volley" ? "每輪總傷害" : SKILL_STAT_LABELS[key];
              return { label: label, value: formatSkillStat(key, current[key], p, w.skill) };
            });
            detailUi.showHudSkillDetail(chip, {
              side: "skill", type: "攻擊技能", name: w.skill.name,
              level: "Lv." + w.level + " / " + w.skill.maxLevel,
              desc: w.skill.desc, icon: w.skill.iconId, stats: stats
            });
          });
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
          this.hideHudSkillDetail();
          this._passiveHudSig = passiveSig;
          d.passives.innerHTML = "";
          var passiveDetailUi = this;
          passiveOrder.forEach(function (id) {
            var passive = passiveMap[id];
            if (!passive || passive.level < 1) return;
            var chip = el("button", "passive-chip" + (passive.oneShot ? " maxed" : ""));
            chip.type = "button";
            var levelLabel = passive.oneShot ? "MAX" : "Lv" + passive.level;
            chip.title = passive.name + " " + levelLabel + "｜" + passive.effect;
            chip.setAttribute("aria-label", chip.title);
            var icon = global.Sprites.makeIconCanvas(passive.icon, 38);
            icon.className = "passive-icon";
            chip.appendChild(icon);
            chip.appendChild(el("span", "lv", levelLabel));
            chip.addEventListener("click", function (e) {
              e.preventDefault();
              e.stopPropagation();
              passiveDetailUi.showHudSkillDetail(chip, {
                side: "passive", type: "被動能力", name: passive.name,
                level: passive.oneShot ? "MAX" : "Lv." + passive.level,
                desc: passive.effect, icon: passive.icon,
                stats: [{
                  label: passive.oneShot ? "狀態" : "累積次數",
                  value: passive.oneShot ? "已滿級" : passive.level + " 次"
                }]
              });
            });
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
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        var icon = global.Sprites.makeIconCanvas(opt.icon, 56);
        icon.className = "levelup-icon";
        card.appendChild(icon);
        card.appendChild(el("div", "levelup-name", opt.name));
        card.appendChild(el("div", "levelup-tag", opt.tag));
        card.appendChild(el("div", "levelup-effect", opt.effect));
        card.appendChild(el("div", "levelup-edu", "永續知識：" + opt.edu));
        card.appendChild(el("div", "levelup-key", "按 " + (i + 1) + " 或點擊選擇"));
        card.addEventListener("click", function () { pick(opt); });
        card.addEventListener("keydown", function (e) {
          if (e.code === "Enter" || e.code === "Space") { e.preventDefault(); pick(opt); }
        });
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
      openDialog(this.dom.levelupOverlay, ".levelup-card");
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
      openDialog(this.dom.levelupOverlay, ".quiz-card");
    },

    hideLevelUp: function () {
      closeDialog(this.dom.levelupOverlay);
      if (this.dom.levelupOptions) this.dom.levelupOptions.classList.remove("quiz-options");
      if (this.dom.levelupFeedback) this.dom.levelupFeedback.classList.add("hidden");
      if (this._keyHandler) { global.removeEventListener("keydown", this._keyHandler); this._keyHandler = null; }
    },

    isLevelUpVisible: function () {
      return this.dom.levelupOverlay && !this.dom.levelupOverlay.classList.contains("hidden");
    },

    focusVisiblePageSwitch: function () {
      global.requestAnimationFrame(function () {
        var target = document.querySelector(".screen:not(.hidden) .btn-page-switch");
        if (target) focusWithoutScroll(target);
      });
    },

    /* ---------------- 暫停選單 ---------------- */
    showPause: function (show) {
      if (show) { this.normalizeActionButtons(); this.applyUiAssets(); }
      if (show) openDialog(this.dom.overlayPause, '[data-action="resume"]');
      else closeDialog(this.dom.overlayPause);
    },

    /* ---------------- 確認視窗 ---------------- */
    showConfirm: function (show) {
      if (show) { this.normalizeActionButtons(); this.applyUiAssets(); }
      if (show) openDialog(this.dom.overlayConfirm, '[data-action="confirm-cancel"]');
      else closeDialog(this.dom.overlayConfirm);
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
      var root = document.documentElement;
      var responsiveGrid = root.classList.contains("compact-visible") ||
        (root.classList.contains("is-mobile") &&
          (root.classList.contains("short-visible") || root.classList.contains("mobile-low-scale")));
      var stage = rectInfo($("stage")) || { x: 0, y: 0, right: global.innerWidth, bottom: global.innerHeight };
      var sliderXs = [];
      var sliderRights = [];
      var valueRights = [];

      if (!panel) errors.push("missing settings panel");
      if (!inner) errors.push("missing settings inner area");
      if (panel && inner) {
        if (responsiveGrid) {
          if (inner.x < panel.x - 1 || inner.right > panel.right + 1 ||
              inner.y < panel.y - 1 || inner.bottom > panel.bottom + 1) {
            errors.push("responsive settings area exceeds the panel");
          }
        } else {
          if (inner.x < panel.x + 60) errors.push("inner area is too close to the panel left edge");
          if (inner.right > panel.right - 30) errors.push("inner area exceeds the panel readable right edge");
        }
      }

      layout.rowOrder.forEach(function (key) {
        var r = layout.rows[key];
        if (!r || !r.row || !r.icon || !r.label) {
          errors.push(key + " row is missing a required visual part");
          return;
        }
        if (panel && responsiveGrid) {
          if (r.row.x < panel.x - 1 || r.row.right > panel.right + 1 ||
              r.row.y < panel.y - 1 || r.row.bottom > panel.bottom + 1) {
            errors.push(key + " row is outside the responsive panel");
          }
        } else if (panel) {
          if (r.label.x <= panel.x + 60) errors.push(key + " label is too far left");
          if (r.icon.x <= panel.x + 40) errors.push(key + " icon is too far left");
          if (r.row.right >= panel.right - 24) errors.push(key + " row exceeds panel readable right edge");
        }

        if (r.slider) {
          sliderXs.push(r.slider.x);
          sliderRights.push(r.slider.right);
          if (panel && (r.slider.x < panel.x || r.slider.right > panel.right)) errors.push(key + " slider is outside panel");
          if (!responsiveGrid && Math.abs(r.slider.centerY - r.row.centerY) > 3) errors.push(key + " slider center is not aligned with row");
          if (root.classList.contains("is-mobile") && r.slider.height < 44) errors.push(key + " slider touch area is below 44px");
        }
        if (r.value) {
          valueRights.push(r.value.right);
          if (!responsiveGrid && panel && r.value.right >= panel.right - 30) errors.push(key + " value is too close to the right edge");
          if (!responsiveGrid && Math.abs(r.value.centerY - r.row.centerY) > 3) errors.push(key + " value is not aligned with row");
        }
        if (r.toggle && root.classList.contains("is-mobile") && r.toggle.height < 44) {
          errors.push(key + " toggle touch area is below 44px");
        }
      });

      if (!responsiveGrid && !aligned(sliderXs, 1)) errors.push("volume slider left edges are not aligned");
      if (!responsiveGrid && !aligned(sliderRights, 1)) errors.push("volume slider right edges are not aligned");
      if (!responsiveGrid && !aligned(valueRights, 1)) errors.push("volume values are not right aligned");
      if (!responsiveGrid && layout.rows.mute && layout.rows.master && layout.rows.mute.label && layout.rows.master.label) {
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
        if (root.classList.contains("is-mobile") && back.height < 44) {
          errors.push("settings back button touch area is below 44px");
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
      var expectedCards = (global.GameData && global.GameData.characters ? global.GameData.characters.length : 0);
      if (cards.length !== expectedCards) errors.push("character select should show " + expectedCards + " cards");
      if (cards.length) {
        var widths = cards.map(function (c) { return c.card ? c.card.width : 0; });
        if (!aligned(widths, 1)) errors.push("character cards are not equal width");
        cards.forEach(function (c, i) {
          if (!c.card || !c.portrait || !c.name || !c.role) {
            errors.push("character card " + i + " is missing required content");
            return;
          }
          if (c.portrait.x < c.card.x || c.portrait.right > c.card.right || c.name.x < c.card.x || c.name.right > c.card.right) {
            errors.push("character card " + i + " content escapes its bounds");
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
        d.btnMute.setAttribute("aria-pressed", String(!!s.mute));
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
      if (stats.result === "victory") {
        var victoryTitle = $("victory-title");
        var victoryFlavour = $("victory-flavour");
        if (victoryTitle) victoryTitle.textContent = (stats.stageName || "關卡") + "已淨化！";
        if (victoryFlavour) {
          victoryFlavour.textContent = stats.unlockedStage
            ? "通往「" + stats.unlockedStage.name + "」的行動路線已開放。"
            : "你已完成目前所有淨化行動。";
        }
      }
      box.innerHTML = "";
      function row(label, value) {
        var r = el("div", "row");
        r.appendChild(el("span", "k", label));
        r.appendChild(el("span", "v", value));
        return r;
      }
      if (stats.stageName) box.appendChild(row("行動地點", stats.stageName));
      if (stats.bossName) box.appendChild(row("關卡 BOSS", stats.bossName + (stats.bossDefeated ? "（已淨化）" : "（未淨化）")));
      box.appendChild(row("存活時間", fmtTime(stats.survived)));
      box.appendChild(row("淨化污染物", stats.purified + " 個"));
      box.appendChild(row("清理地圖物件", (stats.mapCleaned || 0) + " 個"));
      box.appendChild(row("本局有效傷害", Math.round(stats.damageDealt || 0).toLocaleString("zh-TW")));
      box.appendChild(row("本局承受傷害", stats.noDamage ? "0（無傷）" : Math.round(stats.damageTaken || 0).toLocaleString("zh-TW")));
      box.appendChild(row("永續問答", (stats.quizCorrect || 0) + " 對 / " + (stats.quizIncorrect || 0) + " 錯"));
      box.appendChild(row("最佳答題連勝", (stats.bestQuizStreak || 0) + " 題"));
      box.appendChild(row("達到等級", "Lv." + stats.level));
      box.appendChild(row("拾取循環幣", "♻ " + stats.collected));
      box.appendChild(row("淨化獎勵", "♻ " + stats.purifyBonus));
      box.appendChild(row("存活時間獎勵", "♻ " + stats.timeBonus));
      if (stats.winBonus > 0) box.appendChild(row("通關獎勵", "♻ " + stats.winBonus));
      if (stats.unlockedStage) box.appendChild(row("新關卡解鎖", stats.unlockedStage.name));
      if (stats.newAchievements && stats.newAchievements.length) {
        box.appendChild(row("本局完成成就", stats.newAchievements.length + " 項（可至成就頁領取）"));
      }
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
