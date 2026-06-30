/* ============================================================
   assets.js  —  圖片素材載入器（AssetLoader）
   - 非同步預載 assets/images/ 下的圖片，載入成功才會被使用。
   - 每個素材可設定多個候選路徑（candidate paths），依序嘗試：
       第 1 個 = 建議的「正式素材路徑」，把最終圖放這裡即可覆蓋；
       後續    = 目前已存在、可立即使用的素材；
       全部失敗 → Sprites 會自動 fallback 回程式碼繪製的 placeholder。
   - 大圖在載入後一次性下採樣（bake）到 BAKE_MAX，之後每幀繪製較省效能。
   - 任何載入失敗都不會中斷遊戲（這是 fallback 機制的核心）。

   素材對照表（key 對應 sprites 的 id）：
     角色  char_ranger   森林巡守員     enemy 之外於世界中以 Sprites.draw 繪製
     角色  char_beach    海岸淨灘者
     角色  char_solar    太陽能工程師
     敵人  enemy_bag     塑膠袋怪
     敵人  enemy_butt    菸蒂蟲
     敵人  enemy_battery 廢電池史萊姆
     敵人  enemy_oil     油污團塊 (Boss)
     道具  pickup_xp     經驗晶體
     道具  pickup_coin   循環幣
     道具  pickup_health 淨水瓶
     道具  pickup_card   知識卡
     技能  skill_seed/net/solar/wind/compost   技能圖示（HUD / 升級卡）
     升級  shop_soil/recycle/energy/eco/rain   商店升級圖示
   ============================================================ */
(function (global) {

  var BAKE_MAX = 200;   // 下採樣上限（像素）：兼顧清晰度與每幀繪製效能

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

    // -------- 商店升級圖示（目前尚無對應圖檔 → 自動 fallback 向量繪製）--------
    shop_soil:    { label: "健康土壤", paths: ["assets/images/ui/upgrade_healthy_soil.png"] },
    shop_recycle: { label: "回收分類", paths: ["assets/images/ui/upgrade_recycling_sort.png"] },
    shop_energy:  { label: "節能行動", paths: ["assets/images/ui/upgrade_energy_saving.png"] },
    shop_eco:     { label: "生態感知", paths: ["assets/images/ui/upgrade_eco_sense.png"] },
    shop_rain:    { label: "雨水收集", paths: ["assets/images/ui/upgrade_rainwater.png"] }
  };

  var store = {};   // key -> { ok, src, w, h, path }
  var stats = { total: 0, loaded: 0, failed: 0 };

  function hasDOM() { return typeof document !== "undefined" && !!document.createElement && typeof Image !== "undefined"; }

  // 將大圖一次性下採樣到 BAKE_MAX，回傳可供 drawImage 使用的來源（canvas 或原圖）
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
      return { src: img, w: w, h: h };   // 退而求其次，直接用原圖
    }
  }

  function tryLoad(key, paths, idx) {
    if (idx >= paths.length) { store[key] = { ok: false }; stats.failed++; return; }
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
    get: function (key) { var e = store[key]; return (e && e.ok) ? e : null; },

    // 置中、等比例縮放繪入 (cx,cy) 為中心、boxW×boxH 的方框；成功回傳 true
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

    // 等比例縮放填入 (x,y,boxW,boxH) 方框（給 DOM 圖示 canvas 用）；成功回傳 true
    drawInRect: function (ctx, key, x, y, boxW, boxH) {
      var e = this.get(key);
      if (!e) return false;
      var sc = Math.min(boxW / e.w, boxH / e.h);
      var dw = e.w * sc, dh = e.h * sc;
      try { ctx.drawImage(e.src, x + (boxW - dw) / 2, y + (boxH - dh) / 2, dw, dh); }
      catch (err) { return false; }
      return true;
    },

    // 偵錯：回傳每個 key 是否成功載入、用了哪個路徑
    report: function () {
      var out = [];
      for (var key in MANIFEST) {
        var e = store[key] || { ok: false };
        out.push({ key: key, label: MANIFEST[key].label, ok: !!e.ok, path: e.path || null });
      }
      return out;
    }
  };

  Assets.load();          // assets.js 在 sprites.js 之前載入；圖片於背景非同步載入
  global.Assets = Assets;
})(window);
