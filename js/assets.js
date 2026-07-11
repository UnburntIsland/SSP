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
    char_mechanic: { label: "循環機械師", paths: [
      "assets/images/characters/circular_mechanic/idle_S_0.png?v=mechanic_1" ] },

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
    boss_oil_barrage_projectile: { label: "油污團塊彈幕", paths: [
      "assets/images/enemies/oil_blob/attacks/oil_barrage_projectile.png?v=oil_barrage_1" ] },
    boss_oil_barrage_telegraph: { label: "油污團塊十向預警", paths: [
      "assets/images/enemies/oil_blob/attacks/oil_barrage_telegraph.png?v=oil_barrage_1" ] },

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
    skill_sentry: { label: "回收哨兵", paths: [
      "assets/images/deployables/recycle_sentry/turret_S_0.png?v=sentry_1" ] },

    // -------- 回收哨兵 8 方向（GPT-image） --------
    deployable_recycle_sentry_N:  { label: "回收哨兵 N",  paths: ["assets/images/deployables/recycle_sentry/turret_N_0.png?v=sentry_1"] },
    deployable_recycle_sentry_NE: { label: "回收哨兵 NE", paths: ["assets/images/deployables/recycle_sentry/turret_NE_0.png?v=sentry_1"] },
    deployable_recycle_sentry_E:  { label: "回收哨兵 E",  paths: ["assets/images/deployables/recycle_sentry/turret_E_0.png?v=sentry_1"] },
    deployable_recycle_sentry_SE: { label: "回收哨兵 SE", paths: ["assets/images/deployables/recycle_sentry/turret_SE_0.png?v=sentry_1"] },
    deployable_recycle_sentry_S:  { label: "回收哨兵 S",  paths: ["assets/images/deployables/recycle_sentry/turret_S_0.png?v=sentry_1"] },
    deployable_recycle_sentry_SW: { label: "回收哨兵 SW", paths: ["assets/images/deployables/recycle_sentry/turret_SW_0.png?v=sentry_1"] },
    deployable_recycle_sentry_W:  { label: "回收哨兵 W",  paths: ["assets/images/deployables/recycle_sentry/turret_W_0.png?v=sentry_1"] },
    deployable_recycle_sentry_NW: { label: "回收哨兵 NW", paths: ["assets/images/deployables/recycle_sentry/turret_NW_0.png?v=sentry_1"] },

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

    // -------- 局內被動能力圖示（GPT-image；缺圖 → Sprites Canvas fallback）--------
    passive_vitality:       { label: "強健體魄", paths: ["assets/images/ui/passives/passive_vitality.png"] },
    passive_swift:          { label: "輕巧步伐", paths: ["assets/images/ui/passives/passive_swift.png"] },
    passive_sense:          { label: "敏銳感知", paths: ["assets/images/ui/passives/passive_sense.png"] },
    passive_efficiency:     { label: "高效節能", paths: ["assets/images/ui/passives/passive_efficiency.png"] },
    passive_mend:           { label: "淨水補給", paths: ["assets/images/ui/passives/passive_mend.png"] },
    passive_eco_sneakers:   { label: "輕量步鞋", paths: ["assets/images/ui/passives/passive_eco_sneakers.png"] },
    passive_sorting_pouch:  { label: "分類小袋", paths: ["assets/images/ui/passives/passive_sorting_pouch.png"] },
    passive_refill_snack:   { label: "補給點心", paths: ["assets/images/ui/passives/passive_refill_snack.png"] },

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

    // -------- 隨機地圖拾取物（GPT-image；缺圖時 StageRenderer 使用 Canvas fallback） --------
    prop_map_plastic_bottle_01:    { label: "散落塑膠瓶", paths: ["assets/images/map_objects/map_plastic_bottle_01.png"] },
    prop_map_aluminum_can_01:      { label: "散落鋁罐",   paths: ["assets/images/map_objects/map_aluminum_can_01.png"] },
    prop_map_glass_bottle_01:      { label: "散落玻璃瓶", paths: ["assets/images/map_objects/map_glass_bottle_01.png"] },
    prop_map_discarded_battery_01: { label: "散落廢電池", paths: ["assets/images/map_objects/map_discarded_battery_01.png"] }
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
