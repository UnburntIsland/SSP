/* ============================================================
   config.js  —  單一來源的可調參數（畫面 / 攝影機 / UI / 繪製尺寸）
   最先載入。世界層使用 CAMERA_ZOOM 放大；UI 層（HUD/選單）不受影響，
   一律以 1280x720 的 UI 座標與 CSS 版面繪製。
   UI 尺寸會同步成 CSS 變數，讓 style.css 直接引用（避免散落 magic number）。
   ============================================================ */
(function (global) {

  var Config = {
    // 內部邏輯解析度（Canvas buffer 固定，CSS 只負責等比例填滿）
    GAME_WIDTH: 1280,
    GAME_HEIGHT: 720,

    // 世界層放大倍率（可調 1.6 ~ 2.2）。只影響世界（角色/敵人/道具/背景），不影響 UI。
    CAMERA_ZOOM: 1.8,

    // 暫停/選單等 UI 版面尺寸（會同步成 CSS 變數）
    UI: {
      pausePanelWidth: 460,
      pausePanelHeight: 420,
      pauseButtonWidth: 300,
      pauseButtonHeight: 54,
      pauseButtonGap: 14,
      iconSize: 26,
      fontSize: 20
    },

    // 世界物件在「螢幕上的目標尺寸（px）」。繪製時會換算成世界單位（÷CAMERA_ZOOM），
    // 因此不論 zoom 多少，物件在畫面上的大小都等於這裡的數值；zoom 只改變「看多遠 / 世界遠近」。
    RENDER_SIZES: {
      player: 72,
      enemySmall: 48,
      enemyMedium: 64,
      enemyBoss: 144,
      projectile: 18,
      pickup: 30,
      interactable: 52,
      propSmall: 48,
      propMedium: 96,
      propLarge: 160,
      skillIcon: 40
    }
  };

  // 把 UI 尺寸同步為 CSS 變數（單一來源：Config）
  Config.applyCssVars = function () {
    if (typeof document === "undefined" || !document.documentElement) return;
    var s = document.documentElement.style, u = Config.UI;
    s.setProperty("--pause-panel-w", u.pausePanelWidth + "px");
    s.setProperty("--pause-panel-h", u.pausePanelHeight + "px");
    s.setProperty("--ui-btn-w", u.pauseButtonWidth + "px");
    s.setProperty("--ui-btn-h", u.pauseButtonHeight + "px");
    s.setProperty("--ui-gap", u.pauseButtonGap + "px");
    s.setProperty("--ui-icon-sm", u.iconSize + "px");
    s.setProperty("--ui-font", u.fontSize + "px");
  };

  Config.applyCssVars();
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("DOMContentLoaded", Config.applyCssVars);
  }

  global.Config = Config;
})(window);
