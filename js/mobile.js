/* ============================================================
   mobile.js  —  手機 / 平板顯示適配（顯示層，不動玩法）
   - 觸控裝置：#stage 固定 1280x720，整體 transform:scale 等比縮放
     填滿螢幕（所有 DOM UI 與 canvas 一起縮放，不會爆版）。
   - 直向（portrait）時顯示「請轉橫向」提示。
   - 桌機（非觸控）完全不受影響。
   ============================================================ */
(function (global) {
  var BASE_W = 1280, BASE_H = 720;

  function isTouchDevice() {
    return ("ontouchstart" in global) || !!(global.navigator && navigator.maxTouchPoints > 0);
  }

  function fitStage() {
    var stage = document.getElementById("stage");
    if (!stage) return;
    var w = global.innerWidth, h = global.innerHeight;
    var scale = Math.min(w / BASE_W, h / BASE_H);
    stage.style.transform = "scale(" + scale.toFixed(4) + ")";
  }

  function updateRotateHint() {
    var hint = document.getElementById("rotate-hint");
    if (!hint) return;
    var portrait = global.innerHeight > global.innerWidth;
    hint.classList.toggle("hidden", !portrait);
  }

  function onViewportChange() {
    fitStage();
    updateRotateHint();
  }

  /* ---------------- 手機大廳：角色摺疊選單 + 金幣角標 ----------------
     - 隱藏「角色選擇」按鈕（CSS），改為點擊右側角色卡展開清單，點角色即切換。
     - 金幣改顯示於左上角 chip（與 #menu-coins 同步）。
     只在觸控裝置生效；桌機大廳完全不變。 */
  function setupMobileLobby() {
    var menu = document.getElementById("screen-menu");
    var preview = document.getElementById("home-character-preview");
    if (!menu || !preview) return;

    // 展開箭頭提示
    var chevron = document.createElement("div");
    chevron.className = "mobile-char-chevron";
    chevron.textContent = "▼ 點擊切換角色";
    preview.appendChild(chevron);

    // 能力值面板（取代原本的定位/初始文字列；原列以 CSS 隱藏）
    var stats = document.createElement("div");
    stats.id = "mobile-char-stats";
    var infoBox = preview.querySelector(".current-character-info") || preview;
    infoBox.appendChild(stats);
    function statRow(label, value) {
      return "<div class='mobile-stat-row'><span class='mobile-stat-label'>" + label +
             "</span><span class='mobile-stat-value'>" + (value || "—") + "</span></div>";
    }
    function syncStats() {
      var GD = global.GameData;
      if (!GD || !GD.getCharacter) return;
      var id = (global.App && global.App.selectedCharacterId) || "ranger";
      var ch = GD.getCharacter(id);
      if (!ch) return;
      var skill = GD.getSkill ? GD.getSkill(ch.startingSkill) : null;
      stats.innerHTML =
        statRow("定位", ch.role) +
        statRow("被動", ch.passiveText) +
        statRow("初始", skill ? skill.name : ch.startingSkill);
    }
    setTimeout(syncStats, 500);

    // 角色清單（首次展開時才建立，確保 GameData / Sprites / App 已就緒）
    var list = null;
    function buildList() {
      list = document.createElement("div");
      list.id = "mobile-char-list";
      list.className = "hidden";
      var chars = (global.GameData && global.GameData.characters) || [];
      chars.forEach(function (ch) {
        var item = document.createElement("div");
        item.className = "mobile-char-item";
        item.dataset.charId = ch.id;
        if (global.Sprites && global.Sprites.makeCanvas) {
          var icon = global.Sprites.makeCanvas(ch.spriteId, 3);
          icon.className = "mobile-char-item-icon";
          item.appendChild(icon);
        }
        var txt = document.createElement("div");
        txt.className = "mobile-char-item-text";
        txt.innerHTML = "<div class='mobile-char-item-name'>" + ch.name + "</div>" +
                        "<div class='mobile-char-item-role'>" + ch.role + "・" + (ch.passiveText || "") + "</div>";
        item.appendChild(txt);
        var mark = document.createElement("div");
        mark.className = "mobile-char-item-mark";
        mark.textContent = "✓";
        item.appendChild(mark);
        item.addEventListener("click", function (e) {
          e.stopPropagation();
          var app = global.App;
          if (app && app.saveSelectedCharacter) app.saveSelectedCharacter(ch.id);
          if (app && app.ui && app.ui.updateHomeCharacterPreview) app.ui.updateHomeCharacterPreview(ch.id);
          syncStats();
          refreshMarks();
          toggle(false);
          if (global.AudioManager) global.AudioManager.playSfx("click");
        });
        list.appendChild(item);
      });
      menu.appendChild(list);
    }
    function refreshMarks() {
      if (!list) return;
      var cur = global.App ? global.App.selectedCharacterId : null;
      Array.prototype.forEach.call(list.children, function (it) {
        it.classList.toggle("active", it.dataset.charId === cur);
      });
    }
    function toggle(show) {
      if (!list) buildList();
      var willShow = (show != null) ? show : list.classList.contains("hidden");
      list.classList.toggle("hidden", !willShow);
      preview.classList.toggle("expanded", willShow);
      if (willShow) refreshMarks();
    }
    preview.addEventListener("click", function () { toggle(); });
    // 點其他地方收合
    menu.addEventListener("click", function (e) {
      if (list && !list.classList.contains("hidden") &&
          !preview.contains(e.target) && !list.contains(e.target)) toggle(false);
    });

    // 左上角金幣 chip（同步 #menu-coins）
    var chip = document.createElement("div");
    chip.id = "mobile-coin-chip";
    chip.innerHTML = "♻ <span id='mobile-coin-amount'>0</span>";
    menu.appendChild(chip);
    var src = document.getElementById("menu-coins");
    function syncCoins() {
      var el = document.getElementById("mobile-coin-amount");
      if (el && src) el.textContent = src.textContent;
    }
    if (src && global.MutationObserver) {
      new MutationObserver(syncCoins).observe(src, { childList: true, characterData: true, subtree: true });
    }
    setTimeout(syncCoins, 600);
  }

  function init() {
    if (!isTouchDevice()) return;   // 桌機不做任何事
    document.documentElement.classList.add("is-mobile");
    if (document.body) document.body.classList.add("is-mobile");
    onViewportChange();
    setupMobileLobby();
    global.addEventListener("resize", onViewportChange);
    global.addEventListener("orientationchange", function () {
      // 轉向後尺寸更新有延遲，稍等再重算
      setTimeout(onViewportChange, 120);
      setTimeout(onViewportChange, 400);
    });
    // 防 iOS 雙擊縮放（點擊 UI 按鈕不受影響）
    var lastTouch = 0;
    document.addEventListener("touchend", function (e) {
      var now = Date.now();
      if (now - lastTouch < 320) e.preventDefault();
      lastTouch = now;
    }, { passive: false });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.MobileFit = { fitStage: fitStage, isTouchDevice: isTouchDevice };
})(window);
