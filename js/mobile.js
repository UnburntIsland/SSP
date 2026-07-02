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

  function init() {
    if (!isTouchDevice()) return;   // 桌機不做任何事
    document.documentElement.classList.add("is-mobile");
    if (document.body) document.body.classList.add("is-mobile");
    onViewportChange();
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
