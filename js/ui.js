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
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var UI = {
    init: function (app) {
      this.app = app;
      this.dom = {
        menuCoins: $("menu-coins"),
        shopCoins: $("shop-coins"),
        characterList: $("character-list"),
        shopList: $("shop-list"),
        codexList: $("codex-list"),
        hud: $("hud"),
        hpFill: $("hp-fill"), hpText: $("hp-text"),
        timer: $("hud-timer"),
        level: $("hud-level"), xpFill: $("xp-fill"),
        coins: $("hud-coins"), purified: $("hud-purified"),
        skills: $("hud-skills"),
        levelupOverlay: $("overlay-levelup"), levelupOptions: $("levelup-options"),
        victoryStats: $("victory-stats"), gameoverStats: $("gameover-stats"),
        toast: $("toast"), menuArt: $("menu-art"),
        overlayPause: $("overlay-pause"),
        overlayConfirm: $("overlay-confirm"),
        confirmTitle: $("confirm-title"), confirmDesc: $("confirm-desc"),
        confirmOk: $("confirm-ok"), confirmOkLabel: $("confirm-ok-label"),
        volMaster: $("vol-master"), volMusic: $("vol-music"), volSfx: $("vol-sfx"),
        valMaster: $("val-master"), valMusic: $("val-music"), valSfx: $("val-sfx"),
        btnMute: $("btn-mute")
      };
      if (this.dom.menuArt) {
        var art = global.Sprites.makeCanvas("char_ranger", 7);
        art.style.width = "96px"; art.style.height = "auto";
        this.dom.menuArt.appendChild(art);
      }
      this._hudSig = "";
      this.initSettings();
      this.applyUiAssets();
    },

    updateCoinLabels: function () {
      var c = global.Storage.getCoins();
      if (this.dom.menuCoins) this.dom.menuCoins.textContent = c;
      if (this.dom.shopCoins) this.dom.shopCoins.textContent = c;
    },

    showToast: function (title, text) {
      var t = this.dom.toast;
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

    buildCharacters: function (selectedId) {
      var list = this.dom.characterList;
      list.innerHTML = "";
      var chars = global.GameData.characters;
      var self = this;
      chars.forEach(function (ch) {
        var card = el("div", "char-card");
        if (ch.id === selectedId) card.classList.add("selected");
        card.dataset.id = ch.id;
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
        list.appendChild(card);
      });
    },

    buildShop: function () {
      var list = this.dom.shopList;
      list.innerHTML = "";
      var self = this;
      global.GameData.shop.forEach(function (item) {
        var lvl = global.Storage.getShopLevel(item.id);
        var row = el("div", "shop-item");
        var icon = global.Sprites.makeIconCanvas(item.iconId, 48);
        icon.className = "shop-icon";
        row.appendChild(icon);
        var info = el("div", "shop-info");
        info.appendChild(el("div", "shop-name", item.name));
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

    updateHUD: function (game) {
      var p = game.player;
      var d = this.dom;
      d.hpFill.style.width = Math.max(0, (p.hp / p.maxHp) * 100) + "%";
      d.hpText.textContent = Math.ceil(p.hp) + " / " + p.maxHp;
      d.timer.textContent = fmtTime(game.stage.duration - game.time);
      d.level.textContent = p.level;
      d.xpFill.style.width = Math.min(100, (p.xp / p.xpToNext) * 100) + "%";
      d.coins.textContent = game.runCoins;
      d.purified.textContent = game.purifiedCount;
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
    },

    showLevelUp: function (options, onPick) {
      var box = this.dom.levelupOptions;
      box.innerHTML = "";
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
        card.appendChild(el("div", "levelup-edu", "種子 " + opt.edu));
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

    hideLevelUp: function () {
      this.dom.levelupOverlay.classList.add("hidden");
      if (this._keyHandler) { global.removeEventListener("keydown", this._keyHandler); this._keyHandler = null; }
    },

    isLevelUpVisible: function () {
      return this.dom.levelupOverlay && !this.dom.levelupOverlay.classList.contains("hidden");
    },

    /* ---------------- 暫停選單 ---------------- */
    showPause: function (show) {
      if (show) this.applyUiAssets();
      if (this.dom.overlayPause) this.dom.overlayPause.classList.toggle("hidden", !show);
    },

    /* ---------------- 確認視窗 ---------------- */
    showConfirm: function (show) {
      if (show) this.applyUiAssets();
      if (this.dom.overlayConfirm) this.dom.overlayConfirm.classList.toggle("hidden", !show);
    },
    setConfirm: function (title, desc, okLabel) {
      if (this.dom.confirmTitle) this.dom.confirmTitle.textContent = title;
      if (this.dom.confirmDesc) this.dom.confirmDesc.textContent = desc;
      if (this.dom.confirmOkLabel) this.dom.confirmOkLabel.textContent = okLabel;
      else if (this.dom.confirmOk) this.dom.confirmOk.textContent = okLabel;
    },

    /* ---------------- 設定畫面 ---------------- */
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
      bind(this.dom.volMaster, this.dom.valMaster, "setMaster");
      bind(this.dom.volMusic, this.dom.valMusic, "setMusic");
      bind(this.dom.volSfx, this.dom.valSfx, "setSfx");
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
      var root = document.getElementById("game-root");
      var rs = document.documentElement.style;
      var ICON = { size: "contain" };

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

      var bn = A.path("ui_button_normal"), bh = A.path("ui_button_hover"), bp = A.path("ui_button_pressed");
      if (root && bn && bh && bp) {
        rs.setProperty("--ui-btn-normal", "url('" + bn + "')");
        rs.setProperty("--ui-btn-hover", "url('" + bh + "')");
        rs.setProperty("--ui-btn-pressed", "url('" + bp + "')");
        root.classList.add("has-ui-buttons");
      }

      var sb = A.path("ui_slider_bar"), sk = A.path("ui_slider_knob");
      if (root && sb && sk) {
        rs.setProperty("--ui-slider-bar", "url('" + sb + "')");
        rs.setProperty("--ui-slider-knob", "url('" + sk + "')");
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

  global.UI = UI;
})(window);
