/* ============================================================
   mobile.js  —  手機 / 平板顯示適配（顯示層，不動玩法）
   - 觸控裝置：#stage 固定 1280x720，transform:scale 整體縮放。
     手機採 cover 模式（塞滿螢幕、對稱裁邊、無黑邊）；桌機不受影響。
   - 可見遊戲區（visible game rect）以 CSS 變數 --vis-inset-* 輸出，
     HUD / 選單邊緣元件據此內縮，並疊加 iOS safe-area。
   - 首頁提供「全螢幕」按鈕（使用者手勢觸發）；直向顯示可關閉的轉向提示。
   - ?debugLayout=1 顯示 viewport / canvas rect / visible rect / pointer 換算。
   ============================================================ */
(function (global) {
  var BASE_W = 1280, BASE_H = 720;
  var MOBILE_CANVAS_SCALE_MODE = "cover";   // 手機：cover（滿版）；桌機維持原 CSS contain
  var UI_SAFE_MARGIN = 24;
  var state = {
    scale: 1, mode: "contain",
    visible: { x: 0, y: 0, width: BASE_W, height: BASE_H, centerX: BASE_W / 2, centerY: BASE_H / 2 },
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    lastPointer: null
  };

  function isTouchDevice() {
    return ("ontouchstart" in global) || !!(global.navigator && navigator.maxTouchPoints > 0);
  }

  function getViewportSize() {
    var vv = global.visualViewport;
    return { width: vv ? vv.width : global.innerWidth, height: vv ? vv.height : global.innerHeight };
  }

  // 讀取 iOS safe-area（env() 無法直接從 JS 取值，用 probe 元素量測）
  var probe = null;
  function readSafeArea() {
    if (!probe) {
      probe = document.createElement("div");
      probe.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
        "padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);" +
        "padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);";
      (document.body || document.documentElement).appendChild(probe);
    }
    var cs = getComputedStyle(probe);
    state.safe = {
      top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0
    };
  }

  function fitStage() {
    var stage = document.getElementById("stage");
    if (!stage) return;
    var v = getViewportSize();
    var mobile = isTouchDevice();
    var mode = mobile ? MOBILE_CANVAS_SCALE_MODE : "contain";
    var scale = mode === "cover"
      ? Math.max(v.width / BASE_W, v.height / BASE_H)
      : Math.min(v.width / BASE_W, v.height / BASE_H);
    state.scale = scale; state.mode = mode;
    stage.style.transform = "scale(" + scale.toFixed(4) + ")";

    readSafeArea();
    // 可見遊戲區（stage 座標）：cover 時對稱裁切
    var visW = Math.min(BASE_W, v.width / scale);
    var visH = Math.min(BASE_H, v.height / scale);
    var visX = (BASE_W - visW) / 2;
    var visY = (BASE_H - visH) / 2;
    state.visible = { x: visX, y: visY, width: visW, height: visH,
                      centerX: visX + visW / 2, centerY: visY + visH / 2 };
    // 窄可見區（直向等）：確認視窗等改直排、面板縮窄
    document.documentElement.classList.toggle("narrow-visible", visW < 520);
    // 輸出給 CSS：邊緣內縮 = 裁切量 + safe-area（換算成 stage px）
    var s = stage.style;
    s.setProperty("--vis-inset-top",    (visY + state.safe.top    / scale).toFixed(1) + "px");
    s.setProperty("--vis-inset-bottom", (visY + state.safe.bottom / scale).toFixed(1) + "px");
    s.setProperty("--vis-inset-left",   (visX + state.safe.left   / scale).toFixed(1) + "px");
    s.setProperty("--vis-inset-right",  (visX + state.safe.right  / scale).toFixed(1) + "px");
    updateDebugLayout();
  }

  function getVisibleGameRect() {
    var vv = state.visible;
    return { x: vv.x, y: vv.y, width: vv.width, height: vv.height, centerX: vv.centerX, centerY: vv.centerY };
  }

  // pointer / touch → 遊戲內部座標（供 canvas 內自繪 UI 使用；DOM 按鈕不需要）
  function getCanvasPointerPosition(event) {
    var canvas = document.getElementById("game-canvas");
    if (!canvas) return { x: 0, y: 0 };
    var rect = canvas.getBoundingClientRect();
    var t = event.touches && event.touches.length ? event.touches[0]
          : (event.changedTouches && event.changedTouches.length ? event.changedTouches[0] : event);
    var x = (t.clientX - rect.left) * (canvas.width / rect.width);
    var y = (t.clientY - rect.top) * (canvas.height / rect.height);
    state.lastPointer = { clientX: t.clientX, clientY: t.clientY, x: Math.round(x), y: Math.round(y) };
    return { x: x, y: y };
  }

  /* ---------------- 轉向提示（可關閉，不強制擋遊戲） ---------------- */
  var hintDismissed = false;
  function updateRotateHint() {
    var hint = document.getElementById("rotate-hint");
    if (!hint) return;
    var portrait = global.innerHeight > global.innerWidth;
    hint.classList.toggle("hidden", !portrait || hintDismissed);
  }
  function setupRotateHintDismiss() {
    var hint = document.getElementById("rotate-hint");
    if (!hint) return;
    function dismiss() {
      hintDismissed = true;
      hint.classList.add("hidden");
    }
    hint.addEventListener("click", dismiss);
    hint.addEventListener("pointerup", dismiss);
    hint.addEventListener("touchend", function (e) { e.preventDefault(); dismiss(); }, { passive: false });
    var tip = document.createElement("div");
    tip.className = "rotate-hint-close";
    tip.textContent = "（點擊任意處關閉，仍可直向遊玩）";
    var inner = hint.querySelector(".rotate-hint-inner");
    if (inner) inner.appendChild(tip);
  }

  /* ---------------- 全螢幕（需使用者手勢；iOS 不支援時靜默略過） ---------------- */
  function enterFullscreen() {
    try {
      var el = document.documentElement;
      var p = null;
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        p = (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
      } else if (el.requestFullscreen) p = el.requestFullscreen();
      else if (el.webkitRequestFullscreen) p = el.webkitRequestFullscreen();
      if (p && p.catch) p = p.catch(function () {});
      var after = function () {
        if (global.screen && screen.orientation && screen.orientation.lock) {
          try { screen.orientation.lock("landscape").catch(function () {}); } catch (e) {}
        }
        setTimeout(fitStage, 150); setTimeout(fitStage, 500);
      };
      if (p && p.then) p.then(after); else after();
    } catch (err) {
      if (global.console) console.warn("Fullscreen request failed:", err);
    }
  }
  function setupFullscreenButton() {
    var menu = document.getElementById("screen-menu");
    if (!menu) return;
    var btn = document.createElement("button");
    btn.id = "mobile-fullscreen-btn";
    btn.type = "button";
    btn.innerHTML = "⛶ 全螢幕";
    btn.addEventListener("click", function (e) { e.stopPropagation(); enterFullscreen(); });
    menu.appendChild(btn);
    document.addEventListener("fullscreenchange", function () { setTimeout(fitStage, 120); });
  }

  /* ---------------- 手機暫停按鈕（HUD 右上，遊戲中才顯示） ---------------- */
  var lastPauseTap = 0;
  function setupPauseButton() {
    var hud = document.getElementById("hud");
    if (!hud) return;
    var btn = document.createElement("button");
    btn.id = "mobile-pause-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "暫停");
    btn.innerHTML = "&#10073;&#10073;";   // Ⅱ
    hud.appendChild(btn);                  // 跟 HUD 一起顯示/隱藏
    function doPause(e) {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      var now = Date.now();
      if (now - lastPauseTap < 350) return;   // click/touch 去重
      lastPauseTap = now;
      var g = global.Game, app = global.App;
      if (!g || !g.running || g.ended) return;
      if (g.paused || g.menuPaused) return;   // 已暫停 / 升級選擇中不重複進入
      if (app && app.pause) app.pause();
    }
    btn.addEventListener("click", doPause);
    btn.addEventListener("touchend", doPause, { passive: false });
  }

  /* ---------------- 手機大廳：角色摺疊選單 + 金幣角標 ---------------- */
  function setupMobileLobby() {
    var menu = document.getElementById("screen-menu");
    var preview = document.getElementById("home-character-preview");
    if (!menu || !preview) return;

    var chevron = document.createElement("div");
    chevron.className = "mobile-char-chevron";
    chevron.textContent = "▼ 點擊切換角色";
    preview.appendChild(chevron);

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
      stats.innerHTML = statRow("定位", ch.role) + statRow("被動", ch.passiveText) +
                        statRow("初始", skill ? skill.name : ch.startingSkill);
    }
    setTimeout(syncStats, 500);

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
    menu.addEventListener("click", function (e) {
      if (list && !list.classList.contains("hidden") &&
          !preview.contains(e.target) && !list.contains(e.target)) toggle(false);
    });

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

  /* ---------------- debugLayout（?debugLayout=1，桌機/手機皆可用） ---------------- */
  var debugEl = null;
  function debugLayoutEnabled() {
    try { return new URLSearchParams(global.location.search).get("debugLayout") === "1"; }
    catch (e) { return false; }
  }
  function updateDebugLayout() {
    if (!debugEl) return;
    var v = getViewportSize();
    var stage = document.getElementById("stage");
    var canvas = document.getElementById("game-canvas");
    var sr = stage ? stage.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0 };
    var cr = canvas ? canvas.getBoundingClientRect() : sr;
    var vis = state.visible;
    var p = state.lastPointer;
    debugEl.innerHTML =
      "<b>debugLayout</b><br>" +
      "viewport: " + Math.round(v.width) + "×" + Math.round(v.height) + " dpr=" + (global.devicePixelRatio || 1) + "<br>" +
      "scaleMode: " + state.mode + " scale=" + state.scale.toFixed(4) + "<br>" +
      "canvas rect: " + Math.round(cr.left) + "," + Math.round(cr.top) + " " + Math.round(cr.width) + "×" + Math.round(cr.height) + "<br>" +
      "visible rect(stage): " + Math.round(vis.x) + "," + Math.round(vis.y) + " " + Math.round(vis.width) + "×" + Math.round(vis.height) + "<br>" +
      "visible center: " + Math.round(vis.centerX) + "," + Math.round(vis.centerY) + "<br>" +
      "safe-area: t" + state.safe.top + " r" + state.safe.right + " b" + state.safe.bottom + " l" + state.safe.left + "<br>" +
      "pointer: " + (p ? (p.clientX.toFixed(0) + "," + p.clientY.toFixed(0) + " → game " + p.x + "," + p.y) : "-") + "<br>" +
      rectLine("pauseBtn", "mobile-pause-btn") +
      rectLine("pausePanel", "pause-panel") +
      rectLine("settingsPanel", "settings-panel") +
      rectLine("confirmPanel", "confirm-panel");
    function rectLine(label, id) {
      var el = document.getElementById(id);
      if (!el || el.offsetParent === null) return label + ": -<br>";
      var r = el.getBoundingClientRect();
      return label + ": " + Math.round(r.left) + "," + Math.round(r.top) + " " +
             Math.round(r.width) + "×" + Math.round(r.height) + "<br>";
    }
  }
  function setupDebugLayout() {
    if (!debugLayoutEnabled()) return;
    debugEl = document.createElement("div");
    debugEl.id = "debug-layout";
    (document.body || document.documentElement).appendChild(debugEl);
    var track = function (e) { getCanvasPointerPosition(e); updateDebugLayout(); };
    global.addEventListener("mousemove", track, { passive: true });
    global.addEventListener("touchstart", track, { passive: true });
    global.addEventListener("touchmove", track, { passive: true });
    setInterval(updateDebugLayout, 400);
    updateDebugLayout();
  }

  function onViewportChange() { fitStage(); updateRotateHint(); }

  function init() {
    setupDebugLayout();                      // debugLayout 桌機也可用
    if (!isTouchDevice()) return;            // 其餘僅觸控裝置
    document.documentElement.classList.add("is-mobile");
    if (document.body) document.body.classList.add("is-mobile");
    onViewportChange();
    setupMobileLobby();
    setupFullscreenButton();
    setupPauseButton();
    setupRotateHintDismiss();
    global.addEventListener("resize", onViewportChange);
    if (global.visualViewport) global.visualViewport.addEventListener("resize", onViewportChange);
    global.addEventListener("orientationchange", function () {
      setTimeout(onViewportChange, 120);
      setTimeout(onViewportChange, 400);
    });
    // 觸控可靠性：部分瀏覽器在 slider 拖曳後會吞掉下一個 tap 的 click，
    // pointerup 落在按鈕上且 220ms 內沒收到 click 時補發一次（有去重，不會雙觸發）
    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-action], .btn, .mobile-char-item") : null;
      if (btn) btn.__lastClick = Date.now();
    }, true);
    document.addEventListener("pointerup", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-action], .btn, .mobile-char-item") : null;
      if (!btn) return;
      var t0 = Date.now();
      setTimeout(function () {
        if ((btn.__lastClick || 0) < t0 && document.contains(btn)) btn.click();
      }, 220);
    }, true);

    // 防 iOS 雙擊縮放：僅「同一位置附近的快速第二觸」才攔截，
    // 不影響快速點擊不同按鈕
    var lastTouch = 0, lastTx = -999, lastTy = -999;
    document.addEventListener("touchend", function (e) {
      var t = e.changedTouches && e.changedTouches[0];
      var now = Date.now();
      if (t) {
        var near = Math.abs(t.clientX - lastTx) < 30 && Math.abs(t.clientY - lastTy) < 30;
        if (now - lastTouch < 320 && near && e.cancelable) e.preventDefault();
        lastTx = t.clientX; lastTy = t.clientY;
      }
      lastTouch = now;
    }, { passive: false });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.MobileFit = {
    fitStage: fitStage,
    isTouchDevice: isTouchDevice,
    getViewportSize: getViewportSize,
    getVisibleGameRect: getVisibleGameRect,
    getCanvasPointerPosition: getCanvasPointerPosition,
    enterFullscreen: enterFullscreen,
    UI_SAFE_MARGIN: UI_SAFE_MARGIN,
    MOBILE_CANVAS_SCALE_MODE: MOBILE_CANVAS_SCALE_MODE
  };
})(window);
