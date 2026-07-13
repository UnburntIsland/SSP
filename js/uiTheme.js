/* ============================================================
   uiTheme.js  —  UI 設計系統（單一來源的視覺樣式）
   顏色 / 字級 / 間距 / 圖示尺寸 / 按鈕 → 同步成 CSS 變數供 style.css 使用。
   另提供 canvas 用的描邊文字 drawOutlinedText（給世界層飄字等）。
   與 config.js（版面尺寸/攝影機/繪製尺寸）互補，兩者都是集中設定，避免散落 magic number。
   ============================================================ */
(function (global) {

  var UI_THEME = {
    colors: {
      textPrimary: '#fff7d6',
      textDark:    '#4a2f18',
      textAccent:  '#ffd84a',
      panelText:   '#5a3a1e',
      danger:      '#ff6b5f',
      success:     '#78d66b',
      shadow:      'rgba(0,0,0,0.55)'
    },
    font: {
      family:       '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif',
      titleSize:    34,
      subtitleSize: 22,
      bodySize:     18,
      smallSize:    14,
      buttonSize:   20
    },
    spacing: { xs: 6, sm: 10, md: 16, lg: 24, xl: 36 },
    icon:    { small: 20, normal: 28, large: 40 },
    button:  { width: 300, height: 56, gap: 14, radius: 12 }
  };

  // 把 theme 同步為 CSS 變數（style.css 用 var(--...) 取用）
  UI_THEME.applyCssVars = function () {
    if (typeof document === "undefined" || !document.documentElement) return;
    var s = document.documentElement.style, T = UI_THEME;
    // 顏色
    s.setProperty('--c-text', T.colors.textPrimary);
    s.setProperty('--c-text-dark', T.colors.textDark);
    s.setProperty('--c-accent', T.colors.textAccent);
    s.setProperty('--c-panel-text', T.colors.panelText);
    s.setProperty('--c-danger', T.colors.danger);
    s.setProperty('--c-success', T.colors.success);
    s.setProperty('--c-shadow', T.colors.shadow);
    // 字級
    s.setProperty('--f-family', T.font.family);
    s.setProperty('--f-title', T.font.titleSize + 'px');
    s.setProperty('--f-subtitle', T.font.subtitleSize + 'px');
    s.setProperty('--f-body', T.font.bodySize + 'px');
    s.setProperty('--f-small', T.font.smallSize + 'px');
    s.setProperty('--f-button', T.font.buttonSize + 'px');
    // 間距 / 圖示 / 按鈕
    s.setProperty('--sp-xs', T.spacing.xs + 'px');
    s.setProperty('--sp-sm', T.spacing.sm + 'px');
    s.setProperty('--sp-md', T.spacing.md + 'px');
    s.setProperty('--sp-lg', T.spacing.lg + 'px');
    s.setProperty('--sp-xl', T.spacing.xl + 'px');
    s.setProperty('--ic-small', T.icon.small + 'px');
    s.setProperty('--ic-normal', T.icon.normal + 'px');
    s.setProperty('--ic-large', T.icon.large + 'px');
    s.setProperty('--btn-radius', T.button.radius + 'px');
    // 統一「文字描邊」陰影（四向描邊 + 落影），中文在亮背景也清楚
    var sh = T.colors.shadow;
    s.setProperty('--text-outline',
      '1px 1px 0 ' + sh + ', -1px 1px 0 ' + sh + ', 1px -1px 0 ' + sh + ', -1px -1px 0 ' + sh + ', 0 2px 4px rgba(0,0,0,.6)');
    s.setProperty('--text-outline-soft', '1px 1px 0 rgba(0,0,0,.5), 0 1px 3px rgba(0,0,0,.5)');
  };

  // canvas 用：描邊文字（世界層飄字、任何 canvas 文字都可走這個）
  UI_THEME.drawOutlinedText = function (ctx, text, x, y, o) {
    o = o || {};
    var fs = o.fontSize || UI_THEME.font.bodySize;
    ctx.font = '700 ' + fs + 'px ' + (o.fontFamily || UI_THEME.font.family);
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.baseline || 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = o.strokeWidth || 4;
    ctx.strokeStyle = o.stroke || 'rgba(0,0,0,0.65)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = o.fill || UI_THEME.colors.textPrimary;
    ctx.fillText(text, x, y);
  };

  UI_THEME.applyCssVars();
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("DOMContentLoaded", UI_THEME.applyCssVars);
  }

  global.UI_THEME = UI_THEME;
})(window);
