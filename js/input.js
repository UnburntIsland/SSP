/* ============================================================
   input.js  —  鍵盤輸入（WASD / 方向鍵）
   提供正規化後的移動向量；另支援數字鍵 1/2/3 給升級選單。
   ============================================================ */
(function (global) {
  var keys = {};
  var pressedOnce = {};

  function norm(code) { return code; }

  global.addEventListener("keydown", function (e) {
    if (!keys[e.code]) pressedOnce[e.code] = true;
    keys[e.code] = true;
    // 避免方向鍵 / 空白鍵捲動頁面
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) !== -1) {
      e.preventDefault();
    }
  });
  global.addEventListener("keyup", function (e) { keys[e.code] = false; });
  // 失焦時清空，避免角色卡住一直移動
  global.addEventListener("blur", function () { keys = {}; });

  var Input = {
    isDown: function (code) { return !!keys[norm(code)]; },

    // 取得一次性按下（消耗後重置），用於選單熱鍵
    consumePress: function (code) {
      if (pressedOnce[code]) { pressedOnce[code] = false; return true; }
      return false;
    },

    clearPresses: function () { pressedOnce = {}; },

    // 回傳正規化移動向量 {x,y}
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
    }
  };

  global.Input = Input;
})(window);
