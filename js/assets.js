/* ============================================================
   assets.js  —  圖片素材載入器（AssetLoader）
   - 非同步預載 assets/images/ 下的圖片，載入成功才會被使用。
   - 每個素材可設定多個候選路徑（candidate paths），依序嘗試：
       第 1 個 = 建議的「正式素材路徑」，把最終圖放這裡即可覆蓋；
       後續    = 目前已存在、可立即使用的素材；
       全部失敗 → Sprites / UI 會自動 fallback 回程式碼繪製。
   - 大圖在載入後一次性下採樣（bake）到 BAKE_MAX，之後每幀繪製較省效能。
   - 任何載入失敗都不會中斷遊戲（這是 fallback 機制的核心）。
   ============================================================ */
(function (global) {

  var BAKE_MAX = 256;   // 下採樣上限（像素）

  // key -> { label, paths:[由優先到備援] }
  var MANIFEST = {
    // -------- 角色 --------
    char_ranger:  { label: "森林巡守員", paths: [
      "assets/images/characters/player_ranger.png",
      "assets/images/characters/concepts/char_forest_ranger_playable_concept_v2.png",
      "assets/images/characters/char_ranger.png" ] },
    char_beach:   { label: "海岸淨灘者", paths: [
      "assets/images/characters/player_beachcomber.png",
      "assets/images/characters/concepts/char_coastal_cleanup_volunteer_playable_concept_v2.png",
      "assets/images/characters/char_beach.png" ] },
    char_solar:   { label: "太陽能工程師", paths: [
      "assets/images/characters/player_solar_engineer.png",
      "assets/images/characters/concepts/char_solar_engineer_playable_concept_v2.png",
      "assets/images/characters/char_solar.png" ] },

    // -------- 敵人 --------
    enemy_bag:     { label: "塑膠袋怪", paths: [
      "assets/images/enemies/enemy_plastic_bag.png",
      "assets/images/enemies/concepts/enemy_plastic_bag_creature_concept_v2.png" ] },
    enemy_butt:    { label: "菸蒂蟲", paths: [
      "assets/images/enemies/enemy_cigarette_bug.png",
      "assets/images/enemies/concepts/enemy_cigarette_butt_bug_concept_v2.png" ] },
    enemy_battery: { label: "廢電池史萊姆", paths: [
      "assets/images/enemies/enemy_battery_slime.png",
      "assets/images/enemies/concepts/enemy_waste_battery_slime_concept_v2.png" ] },
    enemy_oil:     { label: "油污團塊 (Boss)", paths: [
      "assets/images/enemies/enemy_oil_blob.png",
      "assets/images/enemies/concepts/enemy_oil_slick_mass_boss_concept_v2.png" ] },

    // -------- 掉落物 --------
    pickup_xp:     { label: "經驗晶體", paths: [
      "assets/images/items/item_exp_crystal.png",
      "assets/images/items/concepts/item_experience_crystal_concept_v1.png" ] },
    pickup_coin:   { label: "循環幣", paths: [
      "assets/images/items/item_cycle_coin.png",
      "assets/images/items/concepts/item_recycle_coin_icon_concept_v1.png" ] },
    pickup_health: { label: "淨水瓶", paths: [
      "assets/images/items/item_water_bottle.png",
      "assets/images/items/concepts/item_purified_water_bottle_concept_v1.png" ] },
    pickup_card:   { label: "知識卡", paths: [
      "assets/images/items/item_knowledge_card.png",
      "assets/images/items/concepts/item_knowledge_card_concept_v1.png" ] },

    // -------- 技能圖示 --------
    skill_seed:    { label: "種子飛刃", paths: [
      "assets/images/skills/skill_seed_blade.png",
      "assets/images/skills/concepts/skill_seed_blade_icon_256.png" ] },
    skill_net:     { label: "回收磁網", paths: [
      "assets/images/skills/skill_recycle_net.png",
      "assets/images/skills/concepts/skill_recycle_magnetic_net_icon_256.png" ] },
    skill_solar:   { label: "太陽能脈衝", paths: [
      "assets/images/skills/skill_solar_pulse.png",
      "assets/images/skills/concepts/skill_solar_pulse_icon_256.png" ] },
    skill_wind:    { label: "風力葉片", paths: [
      "assets/images/skills/skill_wind_blades.png",
      "assets/images/skills/concepts/skill_wind_leaf_blades_icon_256.png" ] },
    skill_compost: { label: "堆肥孢子", paths: [
      "assets/images/skills/skill_compost_spores.png",
      "assets/images/skills/concepts/skill_compost_spores_icon_256.png" ] },

    // -------- 商店升級圖示（優先讀 assets/images/shop；缺圖 → 舊圖或向量 fallback）--------
    shop_soil:    { label: "健康土壤", paths: [
      "assets/images/shop/upgrade_healthy_soil.png",
      "assets/images/ui/upgrade_healthy_soil_single_v1.png",
      "assets/images/ui/upgrade_healthy_soil.png" ] },
    shop_recycle: { label: "回收分類", paths: [
      "assets/images/shop/upgrade_recycle_sort.png",
      "assets/images/ui/upgrade_recycling_sort_single_v1.png",
      "assets/images/ui/upgrade_recycling_sort.png" ] },
    shop_energy:  { label: "節能行動", paths: [
      "assets/images/shop/upgrade_energy_saving.png",
      "assets/images/ui/upgrade_energy_saving_action_single_v1.png",
      "assets/images/ui/upgrade_energy_saving.png" ] },
    shop_eco:     { label: "生態感知", paths: [
      "assets/images/shop/upgrade_eco_sense.png",
      "assets/images/ui/upgrade_eco_sense_single_v1.png",
      "assets/images/ui/upgrade_eco_sense.png" ] },
    shop_rain:    { label: "雨水收集", paths: [
      "assets/images/shop/upgrade_rainwater_harvest.png",
      "assets/images/ui/upgrade_rainwater_harvest_single_v1.png",
      "assets/images/ui/upgrade_rainwater.png" ] },

    // -------- 暫停 / 設定 / 確認 UI 素材（有圖用圖，缺圖 → CSS fallback）--------
    ui_panel_pause:    { label: "暫停面板底圖",     paths: ["assets/images/ui/panel_pause.png"] },
    ui_panel_settings: { label: "設定面板底圖",     paths: ["assets/images/ui/panel_settings.png?v=buttonless1"] },
    ui_panel_confirm:  { label: "確認視窗底圖",     paths: ["assets/images/ui/panel_confirm.png?v=buttonless1"] },
    ui_button_normal:  { label: "空白按鈕(一般)",   paths: ["assets/images/ui/button_blank_normal.png"] },
    ui_button_hover:   { label: "空白按鈕(滑入)",   paths: ["assets/images/ui/button_blank_hover.png"] },
    ui_button_pressed: { label: "空白按鈕(按下)",   paths: ["assets/images/ui/button_blank_pressed.png"] },
    ui_icon_music:     { label: "音樂圖示",         paths: ["assets/images/ui/icon_music.png"] },
    ui_icon_sfx:       { label: "音效圖示",         paths: ["assets/images/ui/icon_sfx.png"] },
    ui_icon_mute:      { label: "靜音圖示",         paths: ["assets/images/ui/icon_mute.png"] },
    ui_icon_settings:  { label: "設定圖示",         paths: ["assets/images/ui/icon_settings.png"] },
    ui_icon_home:      { label: "首頁圖示",         paths: ["assets/images/ui/icon_home.png"] },
    ui_icon_restart:   { label: "重新開始圖示",     paths: ["assets/images/ui/icon_restart.png"] },
    ui_icon_back:      { label: "返回圖示",         paths: ["assets/images/ui/icon_back.png"] },
    ui_icon_cancel:    { label: "取消圖示",         paths: ["assets/images/ui/icon_cancel.png"] },
    ui_icon_confirm:   { label: "確認圖示",         paths: ["assets/images/ui/icon_confirm.png"] },
    ui_icon_pause:     { label: "暫停圖示",         paths: ["assets/images/ui/icon_pause.png"] },
    ui_slider_bar:     { label: "滑桿底條",         paths: ["assets/images/ui/slider_bar.png"] },
    ui_slider_knob:    { label: "滑桿握把",         paths: ["assets/images/ui/slider_knob.png"] },

    // -------- 地圖 tiles（缺圖 → StageRenderer 程式格子 fallback）--------
    tile_beach_sand_01: { label: "沙地 1", paths: ["assets/images/tiles/beach_sand_01.png"] },
    tile_beach_sand_02: { label: "沙地 2", paths: ["assets/images/tiles/beach_sand_02.png"] },
    tile_beach_sand_03: { label: "沙地 3", paths: ["assets/images/tiles/beach_sand_03.png"] },
    tile_tide_pool_01:  { label: "潮池",   paths: ["assets/images/tiles/tide_pool_01.png"] },
    tile_shoreline_01:  { label: "海岸線", paths: ["assets/images/tiles/shoreline_01.png"] },

    // -------- 場景 props（缺圖 → 程式簡易繪製 fallback）--------
    prop_driftwood_01:     { label: "漂流木",   paths: ["assets/images/props/driftwood_01.png"] },
    prop_rock_01:          { label: "礁石",     paths: ["assets/images/props/rock_01.png"] },
    prop_recycle_bin_01:   { label: "回收桶",   paths: ["assets/images/props/recycle_bin_01.png"] },
    prop_plastic_trash_01: { label: "塑膠垃圾", paths: ["assets/images/props/plastic_trash_01.png"] },
    prop_oil_stain_01:     { label: "油污",     paths: ["assets/images/props/oil_stain_01.png"] }
  };

  var store = {};
  var stats = { total: 0, loaded: 0, failed: 0 };

  function hasDOM() { return typeof document !== "undefined" && !!document.createElement && typeof Image !== "undefined"; }

  function bake(img) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) return { src: img, w: w || 1, h: h || 1 };
    var scale = Math.min(1, BAKE_MAX / Math.max(w, h));
    var tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale));
    try {
      var cv = document.createElement("canvas");
      cv.width = tw; cv.height = th;
      var c = cv.getContext("2d");
      c.imageSmoothingEnabled = true; if ("imageSmoothingQuality" in c) c.imageSmoothingQuality = "high";
      c.drawImage(img, 0, 0, tw, th);
      return { src: cv, w: tw, h: th };
    } catch (e) {
      return { src: img, w: w, h: h };
    }
  }

  function tryLoad(key, paths, idx) {
    if (idx >= paths.length) { store[key] = { ok: false, loading: false, failed: true }; stats.failed++; return; }
    store[key] = { ok: false, loading: true, failed: false, path: paths[idx] };
    var img = new Image();
    img.onload = function () {
      if (!(img.naturalWidth > 0)) { tryLoad(key, paths, idx + 1); return; }
      var b = bake(img);
      store[key] = { ok: true, src: b.src, w: b.w, h: b.h, path: paths[idx] };
      stats.loaded++;
    };
    img.onerror = function () { tryLoad(key, paths, idx + 1); };
    try { img.src = paths[idx]; } catch (e) { tryLoad(key, paths, idx + 1); }
  }

  var Assets = {
    manifest: MANIFEST,
    stats: stats,

    load: function () {
      if (!hasDOM()) return;
      for (var key in MANIFEST) {
        stats.total++;
        tryLoad(key, MANIFEST[key].paths.slice(), 0);
      }
    },

    ready: function (key) { var e = store[key]; return !!(e && e.ok); },
    pending: function (key) { var e = store[key]; return !!(e && e.loading); },
    failed: function (key) { var e = store[key]; return !!(e && e.failed); },
    get: function (key) { var e = store[key]; return (e && e.ok) ? e : null; },
    path: function (key) { var e = store[key]; return (e && e.ok) ? e.path : null; },

    // 動態註冊素材 key（例如 8 方向動畫幀）；缺圖一樣走 fallback，不報錯
    register: function (key, paths) {
      if (!hasDOM()) return;
      if (store[key] || this.manifest[key]) return;
      this.manifest[key] = { label: key, paths: paths.slice() };
      stats.total++;
      tryLoad(key, paths.slice(), 0);
    },

    // 置中、等比例縮放繪入方框（世界繪製）；成功回傳 true
    drawCentered: function (ctx, key, cx, cy, boxW, boxH, alpha) {
      var e = this.get(key);
      if (!e) return false;
      var sc = Math.min(boxW / e.w, boxH / e.h);
      var dw = e.w * sc, dh = e.h * sc;
      var useAlpha = (alpha != null && alpha !== 1);
      if (useAlpha) { ctx.save(); ctx.globalAlpha = alpha; }
      var ok = true;
      try { ctx.drawImage(e.src, cx - dw / 2, cy - dh / 2, dw, dh); }
      catch (err) { ok = false; }
      if (useAlpha) ctx.restore();
      return ok;
    },

    // 等比例縮放填入方框（DOM 圖示 canvas）；成功回傳 true
    drawInRect: function (ctx, key, x, y, boxW, boxH) {
      var e = this.get(key);
      if (!e) return false;
      var sc = Math.min(boxW / e.w, boxH / e.h);
      var dw = e.w * sc, dh = e.h * sc;
      try { ctx.drawImage(e.src, x + (boxW - dw) / 2, y + (boxH - dh) / 2, dw, dh); }
      catch (err) { return false; }
      return true;
    },

    // 給 DOM 元素套用背景圖；若該素材尚未載入則不動作（保留 CSS fallback）。回傳是否套用。
    applyBg: function (elOrId, key, opt) {
      var el = (typeof elOrId === "string") ? document.getElementById(elOrId) : elOrId;
      if (!el) return false;
      var p = this.path(key);
      if (!p) return false;
      opt = opt || {};
      el.style.backgroundImage = "url('" + p + "')";
      el.style.backgroundSize = opt.size || "100% 100%";
      el.style.backgroundRepeat = "no-repeat";
      el.style.backgroundPosition = "center";
      el.classList.add("has-asset");
      return true;
    },

    report: function () {
      var out = [];
      for (var key in MANIFEST) {
        var e = store[key] || { ok: false };
        out.push({ key: key, label: MANIFEST[key].label, ok: !!e.ok, path: e.path || null });
      }
      return out;
    }
  };

  Assets.load();
  global.Assets = Assets;
})(window);
