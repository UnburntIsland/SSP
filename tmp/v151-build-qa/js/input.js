/* ============================================================
   input.js  —  鍵盤 + 滑鼠輸入
   鍵盤：WASD / 方向鍵移動；數字鍵 1/2/3 給升級選單。
   滑鼠：把畫面（CSS）座標換算成 Canvas「內部邏輯座標」，
        不受 CSS 縮放、置中黑邊或高 DPI 影響，供 UI hitbox / debug 使用。
   ============================================================ */
(function (global) {
  var keys = {};
  var pressedOnce = {};
  var dashRequested = false;

  function norm(code) { return code; }

  function isScrollable(element) {
    if (!element || element === document.body || element === document.documentElement) return false;
    var style = global.getComputedStyle ? global.getComputedStyle(element) : null;
    var overflowY = style ? style.overflowY : "";
    var overflowX = style ? style.overflowX : "";
    return ((overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1) ||
      ((overflowX === "auto" || overflowX === "scroll") && element.scrollWidth > element.clientWidth + 1);
  }

  function usesNativeKeyboard(target) {
    if (!target || target === global || target === document) return false;
    if (target.closest && target.closest(
      "input, textarea, select, button, a[href], [contenteditable='true'], " +
      "[role='slider'], [role='button'], [role='tab'], [role='option'], [data-native-keys]"
    )) return true;
    var current = target;
    while (current && current !== document.body) {
      if (isScrollable(current)) return true;
      current = current.parentElement;
    }
    return false;
  }

  function inputContext() {
    var state = global.App && global.App.state;
    if (state) return state;
    if (global.Game && global.Game.running) return "PLAYING";
    if (global.Lobby && global.Lobby.running) return "LOBBY";
    return "";
  }

  function capturesMovement() {
    var state = inputContext();
    return state === "PLAYING" || state === "LOBBY" || state === "LOBBY_BUILD";
  }

  global.addEventListener("keydown", function (e) {
    if (!capturesMovement() || usesNativeKeyboard(e.target)) return;
    if (!keys[e.code]) pressedOnce[e.code] = true;
    keys[e.code] = true;
    var isArrow = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.code) !== -1;
    var isBattleDash = e.code === "Space" && inputContext() === "PLAYING";
    if (isArrow || isBattleDash) {
      e.preventDefault();
    }
  });
  global.addEventListener("keyup", function (e) { keys[e.code] = false; });
  global.addEventListener("blur", function () {
    keys = {}; pressedOnce = {}; dashRequested = false;
    if (global.Input && global.Input.cancelTouch) global.Input.cancelTouch();
  });

  var Input = {
    // 內部座標的滑鼠位置（0..canvas.width, 0..canvas.height）
    mouse: { x: 0, y: 0, clientX: 0, clientY: 0, inside: false, down: false },
    keyLayout: "wasd",
    touchSensitivity: 100,
    floatingJoystick: true,
    haptics: true,

    setKeyLayout: function (layout) {
      this.keyLayout = ["wasd", "arrows", "ijkl"].indexOf(layout) >= 0 ? layout : "wasd";
    },

    getMovementLabel: function () {
      if (this.keyLayout === "arrows") return "方向鍵移動";
      if (this.keyLayout === "ijkl") return "IJKL 移動";
      return "WASD / 方向鍵移動";
    },

    setTouchSensitivity: function (value) {
      value = Number(value);
      this.touchSensitivity = Math.max(50, Math.min(150, isFinite(value) ? value : 100));
    },

    setFloatingJoystick: function (enabled) {
      this.floatingJoystick = enabled !== false;
      if (!this.floatingJoystick) this.hideTouchVisual();
    },

    setHaptics: function (enabled) {
      this.haptics = enabled !== false;
    },

    haptic: function (kind) {
      if (!this.haptics || !global.navigator || typeof global.navigator.vibrate !== "function") return false;
      var pattern = kind === "hurt" ? [18, 18, 28] : (kind === "level" ? [12, 24, 18] : 12);
      try { return !!global.navigator.vibrate(pattern); }
      catch (e) { return false; }
    },

    isDown: function (code) { return !!keys[norm(code)]; },

    consumePress: function (code) {
      if (pressedOnce[code]) { pressedOnce[code] = false; return true; }
      return false;
    },

    clearPresses: function () { pressedOnce = {}; dashRequested = false; },

    isKeyboardCaptureActive: function () { return capturesMovement(); },

    requestDash: function () { dashRequested = true; },

    consumeDash: function () {
      if (dashRequested) {
        dashRequested = false;
        return true;
      }
      if (this.consumePress("Space")) return true;
      if (this.consumePress("ShiftLeft")) return true;
      if (this.consumePress("ShiftRight")) return true;
      return false;
    },

    getMoveVector: function () {
      var x = 0, y = 0;
      var layout = this.keyLayout || "wasd";
      var up = layout === "ijkl" ? keys["KeyI"] : (layout === "arrows" ? keys["ArrowUp"] : (keys["KeyW"] || keys["ArrowUp"]));
      var down = layout === "ijkl" ? keys["KeyK"] : (layout === "arrows" ? keys["ArrowDown"] : (keys["KeyS"] || keys["ArrowDown"]));
      var left = layout === "ijkl" ? keys["KeyJ"] : (layout === "arrows" ? keys["ArrowLeft"] : (keys["KeyA"] || keys["ArrowLeft"]));
      var right = layout === "ijkl" ? keys["KeyL"] : (layout === "arrows" ? keys["ArrowRight"] : (keys["KeyD"] || keys["ArrowRight"]));
      if (up) y -= 1;
      if (down) y += 1;
      if (left) x -= 1;
      if (right) x += 1;
      if (x !== 0 && y !== 0) {
        var inv = 1 / Math.sqrt(2);
        x *= inv; y *= inv;
      }
      // 鍵盤沒有輸入時，改用觸控滑動向量（手機）；鍵盤 mapping 不受影響
      if (x === 0 && y === 0 && this.touch && this.touch.active) {
        return this.getTouchVector();
      }
      return { x: x, y: y };
    },

    /* ---------------- 觸控：滑動移動（手機 / 平板） ----------------
       按住畫面任一點為「搖桿原點」，往任意方向滑動即朝該方向移動；
       離原點越遠速度越快（滿速半徑 64px），放開即停止。
       僅在觸控裝置上綁定，不影響滑鼠與鍵盤。 */
    touch: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 },

    cancelTouch: function () {
      this.touch.active = false;
      this.touch.id = null;
      this.touch.ox = this.touch.oy = this.touch.x = this.touch.y = 0;
      this.hideTouchVisual();
    },

    hideTouchVisual: function () {
      var visual = document.getElementById("touch-joystick");
      if (visual) visual.classList.add("hidden");
    },

    updateTouchVisual: function () {
      var visual = document.getElementById("touch-joystick");
      var knob = document.getElementById("touch-joystick-knob");
      var stage = document.getElementById("stage");
      var t = this.touch;
      if (!visual || !knob || !stage || !this.floatingJoystick || !t.active) {
        this.hideTouchVisual();
        return;
      }
      var rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var scale = rect.width / Math.max(1, stage.offsetWidth || rect.width);
      var localX = (t.ox - rect.left) / scale;
      var localY = (t.oy - rect.top) / scale;
      var dx = t.x - t.ox;
      var dy = t.y - t.oy;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var visualDistance = Math.min(36, len);
      var knobX = dx / len * visualDistance / scale;
      var knobY = dy / len * visualDistance / scale;
      visual.style.left = localX + "px";
      visual.style.top = localY + "px";
      visual.style.setProperty("--touch-ui-scale", String(1 / Math.max(0.05, scale)));
      knob.style.transform = "translate(calc(-50% + " + knobX + "px), calc(-50% + " + knobY + "px))";
      visual.classList.remove("hidden");
      visual.classList.toggle("full-strength", len >= 64);
    },

    isTouchDevice: function () {
      return ("ontouchstart" in global) ||
        !!(global.navigator && navigator.maxTouchPoints > 0) ||
        !!(document.documentElement && document.documentElement.classList.contains("is-mobile"));
    },

    attachTouch: function (canvas) {
      if (!canvas || this._touchCanvas === canvas || !this.isTouchDevice()) return;
      this._touchCanvas = canvas;
      var t = this.touch;
      function findTouch(e) {
        for (var i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === t.id) return e.changedTouches[i];
        }
        return null;
      }
      canvas.addEventListener("touchstart", function (e) {
        if (t.active) return;
        var p = e.changedTouches[0];
        t.active = true; t.id = p.identifier;
        t.ox = p.clientX; t.oy = p.clientY;
        t.x = p.clientX; t.y = p.clientY;
        Input.updateTouchVisual();
        e.preventDefault();
      }, { passive: false });
      canvas.addEventListener("touchmove", function (e) {
        if (!t.active) return;
        var p = findTouch(e);
        if (!p) return;
        t.x = p.clientX; t.y = p.clientY;
        Input.updateTouchVisual();
        e.preventDefault();
      }, { passive: false });
      function onEnd(e) {
        if (!t.active) return;
        var p = findTouch(e);
        if (!p) return;
        t.active = false; t.id = null;
        Input.hideTouchVisual();
      }
      canvas.addEventListener("touchend", onEnd);
      canvas.addEventListener("touchcancel", onEnd);
    },

    getTouchVector: function () {
      var t = this.touch;
      if (!t.active) return { x: 0, y: 0 };
      var DEAD = 12;    // 死區（px），避免手指微顫
      var FULL = 64;    // 滿速半徑（px）
      var dx = t.x - t.ox, dy = t.y - t.oy;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < DEAD) return { x: 0, y: 0 };
      FULL = FULL / Math.max(0.5, (this.touchSensitivity || 100) / 100);
      var m = Math.min(1, (len - DEAD) / FULL);
      return { x: dx / len * m, y: dy / len * m };
    },

    /* ---------------- 滑鼠：CSS 座標 → Canvas 內部座標 ---------------- */
    // 綁定一個 canvas；之後 mouse.x / mouse.y 即為內部邏輯座標。
    attachMouse: function (canvas) {
      if (!canvas || this._mouseCanvas === canvas) return;
      this._mouseCanvas = canvas;
      var self = this;

      function toInternal(clientX, clientY) {
        var r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        // 依「顯示尺寸 → 內部解析度」比例換算，DPR / 縮放 / 黑邊皆自動吸收
        var x = (clientX - r.left) / r.width * canvas.width;
        var y = (clientY - r.top) / r.height * canvas.height;
        var inside = clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
        return { x: x, y: y, inside: inside };
      }

      function onMove(e) {
        var p = toInternal(e.clientX, e.clientY);
        if (!p) return;
        self.mouse.x = p.x; self.mouse.y = p.y; self.mouse.inside = p.inside;
        self.mouse.clientX = e.clientX; self.mouse.clientY = e.clientY;
      }
      global.addEventListener("mousemove", onMove, { passive: true });
      global.addEventListener("mousedown", function (e) { onMove(e); self.mouse.down = true; });
      global.addEventListener("mouseup", function () { self.mouse.down = false; });

      // 供外部主動換算（例如 canvas 內按鈕點擊）
      this.clientToInternal = toInternal;

      // 觸控裝置：同一個 canvas 順便綁定滑動移動
      this.attachTouch(canvas);
    },

    getMouse: function () { return this.mouse; },

    // 與需求一致的顯式換算：CSS 座標 → 遊戲內部座標
    getMousePos: function (canvas, event) {
      var rect = canvas.getBoundingClientRect();
      var scaleX = canvas.width / rect.width;
      var scaleY = canvas.height / rect.height;
      return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
    },

    // 點 (mx,my) 是否落在矩形內（皆為內部座標）—— 供未來 canvas UI hitbox 使用
    hitTest: function (mx, my, rx, ry, rw, rh) {
      return mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh;
    }
  };

  global.Input = Input;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) Input.cancelTouch();
  });
  global.addEventListener("pagehide", function () { Input.cancelTouch(); });
})(window);
