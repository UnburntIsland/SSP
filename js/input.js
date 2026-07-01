/* ============================================================
   input.js  —  鍵盤 + 滑鼠輸入
   鍵盤：WASD / 方向鍵移動；數字鍵 1/2/3 給升級選單。
   滑鼠：把畫面（CSS）座標換算成 Canvas「內部邏輯座標」，
        不受 CSS 縮放、置中黑邊或高 DPI 影響，供 UI hitbox / debug 使用。
   ============================================================ */
(function (global) {
  var keys = {};
  var pressedOnce = {};

  function norm(code) { return code; }

  global.addEventListener("keydown", function (e) {
    if (!keys[e.code]) pressedOnce[e.code] = true;
    keys[e.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) !== -1) {
      e.preventDefault();
    }
  });
  global.addEventListener("keyup", function (e) { keys[e.code] = false; });
  global.addEventListener("blur", function () { keys = {}; });

  var Input = {
    // 內部座標的滑鼠位置（0..canvas.width, 0..canvas.height）
    mouse: { x: 0, y: 0, clientX: 0, clientY: 0, inside: false, down: false },

    isDown: function (code) { return !!keys[norm(code)]; },

    consumePress: function (code) {
      if (pressedOnce[code]) { pressedOnce[code] = false; return true; }
      return false;
    },

    clearPresses: function () { pressedOnce = {}; },

    getMoveVector: function () {
      var x = 0, y = 0;
      if (keys["KeyW"] || keys["ArrowUp"]) y -= 1;
      if (keys["KeyS"] || keys["ArrowDown"]) y += 1;
      if (keys["KeyA"] || keys["ArrowLeft"]) x -= 1;
      if (keys["KeyD"] || keys["ArrowRight"]) x += 1;
      if (x !== 0 && y !== 0) {
        var inv = 1 / Math.sqrt(2);
        x *= inv; y *= inv;
      }
      return { x: x, y: y };
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
})(window);
