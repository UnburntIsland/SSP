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
  var FORCE_MOBILE_QA = new URLSearchParams(global.location.search).get("forceMobile") === "1";
  var MOBILE_CANVAS_SCALE_MODE = "cover";   // 手機：cover（滿版）；桌機維持原 CSS contain
  var UI_SAFE_MARGIN = 24;
  var COMPACT_VISIBLE_WIDTH = 780;
  var state = {
    scale: 1, mode: "contain",
    visible: { x: 0, y: 0, width: BASE_W, height: BASE_H, centerX: BASE_W / 2, centerY: BASE_H / 2 },
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    lastPointer: null
  };

  function isTouchDevice() {
    return FORCE_MOBILE_QA || ("ontouchstart" in global) || !!(global.navigator && navigator.maxTouchPoints > 0);
  }

  function getViewportSize() {
    var vv = global.visualViewport;
    return {
      width: vv ? vv.width : global.innerWidth,
      height: vv ? vv.height : global.innerHeight,
      offsetLeft: vv ? (vv.offsetLeft || 0) : 0,
      offsetTop: vv ? (vv.offsetTop || 0) : 0
    };
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
    if (!v.width || !v.height || !isFinite(v.width) || !isFinite(v.height)) return;
    var mobile = isTouchDevice();
    var mode = mobile ? MOBILE_CANVAS_SCALE_MODE : "contain";
    var scale = mode === "cover"
      ? Math.max(v.width / BASE_W, v.height / BASE_H)
      : Math.min(v.width / BASE_W, v.height / BASE_H);
    state.scale = scale; state.mode = mode;
    var stageX = v.offsetLeft + (v.width - BASE_W * scale) / 2;
    var stageY = v.offsetTop + (v.height - BASE_H * scale) / 2;
    stage.style.left = "0px";
    stage.style.top = "0px";
    stage.style.transform = "translate(" + stageX.toFixed(2) + "px, " + stageY.toFixed(2) + "px) scale(" + scale.toFixed(4) + ")";

    readSafeArea();
    // 可見遊戲區（stage 座標）：cover 時對稱裁切
    var visW = Math.min(BASE_W, v.width / scale);
    var visH = Math.min(BASE_H, v.height / scale);
    var visX = (BASE_W - visW) / 2;
    var visY = (BASE_H - visH) / 2;
    state.visible = { x: visX, y: visY, width: visW, height: visH,
                      centerX: visX + visW / 2, centerY: visY + visH / 2 };
    // 版面類別依「舞台實際可見寬」判斷，避免只看實體 viewport 的 media query
    // 而在 transform 後發生二次縮小或直向裁切。
    document.documentElement.classList.toggle("narrow-visible", visW < 520);
    document.documentElement.classList.toggle("compact-visible", visW < COMPACT_VISIBLE_WIDTH);
    document.documentElement.classList.toggle("short-visible", visH < 650);
    document.documentElement.classList.toggle("mobile-low-scale", mobile && scale < 0.82);
    // 輸出給 CSS：邊緣內縮 = 裁切量 + safe-area（換算成 stage px）
    var s = stage.style;
    s.setProperty("--vis-inset-top",    (visY + state.safe.top    / scale).toFixed(1) + "px");
    s.setProperty("--vis-inset-bottom", (visY + state.safe.bottom / scale).toFixed(1) + "px");
    s.setProperty("--vis-inset-left",   (visX + state.safe.left   / scale).toFixed(1) + "px");
    s.setProperty("--vis-inset-right",  (visX + state.safe.right  / scale).toFixed(1) + "px");
    s.setProperty("--stage-scale", scale.toFixed(4));
    s.setProperty("--visible-stage-width", visW.toFixed(1) + "px");
    s.setProperty("--visible-stage-height", visH.toFixed(1) + "px");

    // DOM 介面會跟著 stage 一起縮放，因此反向補償，確保最終螢幕上的
    // 主要觸控區接近 48px、正文約 16px，不再於小手機縮成難點的小字。
    var touchTarget = Math.min(120, Math.max(32, 48 / scale));
    var readableFont = Math.min(40, Math.max(12, 16 / scale));
    var captionFont = Math.min(35, Math.max(10, 14 / scale));
    s.setProperty("--mobile-touch-target", touchTarget.toFixed(1) + "px");
    s.setProperty("--mobile-readable-font", readableFont.toFixed(1) + "px");
    s.setProperty("--mobile-caption-font", captionFont.toFixed(1) + "px");
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
    var show = portrait && !hintDismissed && hint.dataset.dismissed !== "true";
    hint.classList.toggle("hidden", !show);
    hint.setAttribute("aria-hidden", String(!show));
  }
  function setupRotateHintDismiss() {
    var hint = document.getElementById("rotate-hint");
    if (!hint) return;
    function dismiss() {
      hintDismissed = true;
      hint.dataset.dismissed = "true";
      hint.classList.add("hidden");
      hint.setAttribute("aria-hidden", "true");
    }
    var tip = document.createElement("button");
    tip.type = "button";
    tip.className = "rotate-hint-close";
    tip.textContent = "繼續直向遊玩";
    tip.addEventListener("click", dismiss);
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
    var root = document.documentElement;
    if (!root.requestFullscreen && !root.webkitRequestFullscreen) return;
    var btn = document.createElement("button");
    btn.id = "mobile-fullscreen-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "切換全螢幕");
    btn.innerHTML = "⛶ 全螢幕";
    btn.addEventListener("click", function (e) { e.stopPropagation(); enterFullscreen(); });
    menu.appendChild(btn);
    document.addEventListener("fullscreenchange", function () { setTimeout(fitStage, 120); });
    document.addEventListener("webkitfullscreenchange", function () { setTimeout(fitStage, 120); });
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

  /* ---------------- 手機 / 平板大廳：點擊目前角色展開選單 ---------------- */
  function setupMobileLobby() {
    var menu = document.getElementById("screen-menu");
    var preview = document.getElementById("home-character-preview");
    if (!menu || !preview) return;

    var picker = document.createElement("div");
    picker.className = "mobile-character-picker";
    preview.parentNode.insertBefore(picker, preview);
    picker.appendChild(preview);

    var chevron = document.createElement("div");
    chevron.className = "mobile-char-chevron";
    chevron.textContent = "切換 ▾";
    chevron.setAttribute("aria-hidden", "true");
    preview.appendChild(chevron);

    var list = document.createElement("div");
    list.id = "mobile-char-list";
    list.className = "hidden";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "切換角色");
    picker.appendChild(list);

    preview.setAttribute("role", "button");
    preview.setAttribute("tabindex", "0");
    preview.setAttribute("aria-haspopup", "listbox");
    preview.setAttribute("aria-controls", "mobile-char-list");
    preview.setAttribute("aria-expanded", "false");

    function setListOpen(open) {
      open = !!open;
      list.classList.toggle("hidden", !open);
      preview.classList.toggle("expanded", open);
      preview.setAttribute("aria-expanded", String(open));
      chevron.textContent = open ? "收起 ▴" : "切換 ▾";
    }

    function refreshList() {
      var cur = global.App ? global.App.selectedCharacterId : null;
      var current = global.GameData && global.GameData.getCharacter
        ? global.GameData.getCharacter(cur)
        : null;
      preview.setAttribute("aria-label", "目前角色：" + (current ? current.name : "森林巡守員") + "，點擊切換角色");
      Array.prototype.forEach.call(list.children, function (item) {
        var active = item.dataset.charId === cur;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
      });
    }

    function buildList() {
      var chars = (global.GameData && global.GameData.characters) || [];
      list.innerHTML = "";
      chars.forEach(function (ch) {
        var owned = !global.Storage || !global.Storage.isCharacterOwned || global.Storage.isCharacterOwned(ch.id);
        var item = document.createElement("button");
        item.type = "button";
        item.className = "mobile-char-item" + (owned ? "" : " locked");
        item.dataset.charId = ch.id;
        item.setAttribute("role", "option");
        item.setAttribute("aria-disabled", String(!owned));
        if (global.Sprites && global.Sprites.makeCanvas) {
          var icon = global.Sprites.makeCanvas(ch.spriteId, 3);
          icon.className = "mobile-char-item-icon";
          item.appendChild(icon);
        }

        var text = document.createElement("span");
        text.className = "mobile-char-item-text";
        var name = document.createElement("span");
        name.className = "mobile-char-item-name";
        name.textContent = ch.name;
        var role = document.createElement("span");
        role.className = "mobile-char-item-role";
        role.textContent = owned ? ch.role : "🔒 生態扭蛋取得";
        text.appendChild(name);
        text.appendChild(role);
        item.appendChild(text);

        var mark = document.createElement("span");
        mark.className = "mobile-char-item-mark";
        mark.textContent = "✓";
        mark.setAttribute("aria-hidden", "true");
        item.appendChild(mark);

        item.addEventListener("click", function (e) {
          e.stopPropagation();
          if (!owned) {
            if (global.UI && global.UI.showToast) global.UI.showToast("角色尚未解鎖", "請從生態扭蛋取得這名守護者。");
            return;
          }
          var app = global.App;
          if (app && app.saveSelectedCharacter) app.saveSelectedCharacter(ch.id);
          refreshList();
          setListOpen(false);
          preview.focus();
          if (global.AudioManager) global.AudioManager.playSfx("click");
        });
        list.appendChild(item);
      });
      refreshList();
    }

    preview.addEventListener("click", function (e) {
      e.stopPropagation();
      setListOpen(list.classList.contains("hidden"));
    });
    preview.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        setListOpen(false);
        return;
      }
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      setListOpen(list.classList.contains("hidden"));
    });
    document.addEventListener("click", function (e) {
      if (!picker.contains(e.target)) setListOpen(false);
    });

    // App.boot 讀完存檔後再建立清單，確保 active 角色正確。
    setTimeout(buildList, 400);
    global.addEventListener("gacha-progress", buildList);

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

  var viewportFrame = 0;
  function onViewportChange() {
    if (viewportFrame) return;
    viewportFrame = global.requestAnimationFrame(function () {
      viewportFrame = 0;
      fitStage();
      updateRotateHint();
      if (global.Input && global.Input.cancelTouch) global.Input.cancelTouch();
    });
  }

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
    if (global.visualViewport) {
      global.visualViewport.addEventListener("resize", onViewportChange);
      global.visualViewport.addEventListener("scroll", onViewportChange);
    }
    global.addEventListener("pageshow", onViewportChange);
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
      if (!btn || e.pointerType === "mouse" || btn.disabled || btn.getAttribute("aria-disabled") === "true") return;
      var t0 = Date.now();
      setTimeout(function () {
        if ((btn.__lastClick || 0) < t0 && document.contains(btn) && !btn.disabled) btn.click();
      }, 220);
    }, true);

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
