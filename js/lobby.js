/* ============================================================
   lobby.js  —  可走動大廳場景（LobbyScene）
   與戰鬥 Game 完全分離：共用 Canvas / Input / Animation / Assets 與
   目前選定角色，但沒有敵人、傷害、技能與經驗系統。
   - 玩家用 8 方向動畫在大廳移動；靠近傳送門 / 工作台顯示互動提示。
   - 掛機回收區站立累積再生材料（lobbyEconomy.js）。
   - 建造模式：目錄選擇 → ghost 吸附格線 → 驗證 → 放置 / 收納 / 移動。
   ============================================================ */
(function (global) {

  /* 大廳角色比例：背景圖中的門約 100 world px 高，
     角色以 AVATAR_WORLD 繪製才不會像小人國。速度略高於戰鬥基礎值,
     補償較大的角色與較廣的視野（不套任何被動 / 商店 / 建築加成）。 */
  var AVATAR_WORLD = 100;         /* 角色繪製尺寸（world px） */
  var LOBBY_SPEED = 205;          /* 大廳固定移動速度 */
  var AVATAR_RADIUS = 20;         /* 腳底碰撞圓半徑 */
  var SAVE_POS_INTERVAL = 4;      /* 秒；行走時定期保存位置 */

  function W() { return global.LobbyWorld; }
  function P() { return global.LobbyPlacement; }

  /* ---------------- 大廳素材（缺圖自動 fallback 程式繪製） ---------------- */
  var LOBBY_ASSETS = {
    lobby_bg:              "assets/images/backgrounds/lobby_background.png?v=lobby-20260711a",
    lobby_portal:          "assets/images/lobby/portal/portal.png",
    lobby_workbench:       "assets/images/lobby/stations/workbench.png",
    lobby_recycle_station: "assets/images/lobby/stations/recycle_station.png",
    lobby_material_icon:   "assets/images/lobby/icons/icon_recycled_material.png"
  };

  var Lobby = {
    running: false,
    mode: "idle",                 /* idle | catalog | ghost */
    ghost: null,
    editTarget: null,
    _looping: false,
    _floaters: [],
    _savePosTimer: 0,
    _catalogTab: "functional",

    /* ---------------- 初始化（App.boot 呼叫一次） ---------------- */
    init: function (canvas, app) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.app = app;
      this._loop = this.loop.bind(this);
      this.camera = { x: 0, y: 0 };
      this.avatar = null;
      this.time = 0;

      var A = global.Assets;
      if (A && A.register) {
        Object.keys(LOBBY_ASSETS).forEach(function (key) { A.register(key, [LOBBY_ASSETS[key]]); });
        (global.GameData.lobbyBuildings || []).forEach(function (def) {
          A.register("lobbybld_" + def.id, [def.assetBasePath + "base.png"]);
        });
        /* 傳送門待機 6 幀、掛機回收裝置 4 幀；有幾幀用幾幀，
           一幀都沒有 → 靜態單圖 → 仍缺 → 程式繪製 fallback */
        for (var pf = 0; pf < 6; pf++) {
          A.register("lobby_portal_" + pf, ["assets/images/lobby/portal/portal_idle_" + pf + ".png"]);
        }
        for (var rf = 0; rf < 4; rf++) {
          A.register("lobby_recycle_" + rf, ["assets/images/lobby/stations/recycle_station_" + rf + ".png"]);
        }
      }

      /* 背景直接載入原圖：Assets 會把大圖下採樣到 256px（給小物件用），
         當作整張世界背景會變糊，因此大廳背景不走 bake 流程。 */
      this._bgImage = null;
      var self = this;
      try {
        var bgImg = new Image();
        bgImg.onload = function () { if (bgImg.naturalWidth > 0) self._bgImage = bgImg; };
        bgImg.src = LOBBY_ASSETS.lobby_bg;
      } catch (e) {}

      this.dom = {
        hud: document.getElementById("lobby-hud"),
        coins: document.getElementById("lobby-coins"),
        materials: document.getElementById("lobby-materials"),
        daily: document.getElementById("lobby-daily"),
        interact: document.getElementById("lobby-interact"),
        idleStatus: document.getElementById("lobby-idle-status"),
        buildRoot: document.getElementById("build-root"),
        buildSheet: document.getElementById("build-sheet"),
        buildList: document.getElementById("build-list"),
        buildTabs: document.getElementById("build-tabs"),
        buildMaterials: document.getElementById("build-materials"),
        ghostBar: document.getElementById("build-ghost-bar"),
        ghostHint: document.getElementById("ghost-hint"),
        editPanel: document.getElementById("build-edit"),
        editName: document.getElementById("build-edit-name"),
        editEffect: document.getElementById("build-edit-effect")
      };
      this.bindDom();
      this.bindPointer();
    },

    bindDom: function () {
      var self = this;
      if (this.dom.interact) {
        this.dom.interact.addEventListener("click", function (e) {
          e.preventDefault();
          self.triggerInteraction();
        });
      }
      if (this.dom.buildTabs) {
        this.dom.buildTabs.addEventListener("click", function (e) {
          var tab = e.target.closest("[data-build-tab]");
          if (!tab) return;
          self._catalogTab = tab.dataset.buildTab;
          self.buildCatalog();
        });
      }
    },

    /* ---------------- 生命週期 ---------------- */
    start: function () {
      if (!global.Storage.data) global.Storage.load();
      var characterId = this.app ? this.app.selectedCharacterId : "ranger";
      var character = global.GameData.getCharacter(characterId) || global.GameData.characters[0];

      var lobby = global.Storage.getLobby();
      var pos = lobby.playerPosition;
      var spawn = W().spawn;
      var x = pos && pos.x ? pos.x : spawn.x;
      var y = pos && pos.y ? pos.y : spawn.y;
      /* 存檔位置若落在阻擋內（例如配置更新後），退回出生點 */
      var fixed = P().resolveCircle(x, y, spawn.x, spawn.y, AVATAR_RADIUS, P().collisionRects());
      if (Math.abs(fixed.x - x) > 48 || Math.abs(fixed.y - y) > 48) { x = spawn.x; y = spawn.y; }
      else { x = fixed.x; y = fixed.y; }

      /* 角色切換立即生效：每次進大廳都以目前角色重建 animator */
      this.avatar = {
        x: x, y: y,
        character: character,
        animator: global.CharacterAnimator ? new global.CharacterAnimator(character) : null,
        bobT: 0
      };
      if (this.avatar.animator && pos && pos.direction) this.avatar.animator.dir = pos.direction;

      this.mode = "idle";
      this.ghost = null;
      this.editTarget = null;
      this._floaters = [];
      this._savePosTimer = 0;
      this.time = 0;
      this.nearestInteraction = null;

      global.LobbyEconomy.ensureDaily();
      global.LobbyEconomy.leaveZone();

      if (this.dom.hud) this.dom.hud.classList.remove("hidden");
      this.hideBuildDom();
      this.updateHud();
      this.updateIdleStatus(global.LobbyEconomy.getStatus());
      this.setPrompt(null);

      if (this.canvas.width !== (global.Config ? global.Config.GAME_WIDTH : 1280)) {
        this.canvas.width = global.Config ? global.Config.GAME_WIDTH : 1280;
        this.canvas.height = global.Config ? global.Config.GAME_HEIGHT : 720;
      }
      this.ctx.imageSmoothingEnabled = false;

      this.running = true;
      this.lastTs = 0;
      this.updateCamera(true);
      if (!this._looping) { this._looping = true; global.requestAnimationFrame(this._loop); }
    },

    /* 離開大廳（進戰鬥 / 開子畫面）。保存位置、關 HUD、停止迴圈。 */
    stop: function () {
      if (!this.running && !this._looping) {
        if (this.dom.hud) this.dom.hud.classList.add("hidden");
        return;
      }
      this.savePosition(true);
      global.LobbyEconomy.leaveZone();
      this.running = false;
      this.mode = "idle";
      this.ghost = null;
      this.editTarget = null;
      if (this.dom.hud) this.dom.hud.classList.add("hidden");
      this.hideBuildDom();
      this.setPrompt(null);
      if (this.dom.idleStatus) this.dom.idleStatus.classList.add("hidden");
    },

    savePosition: function (immediate) {
      if (!this.avatar) return;
      var dir = this.avatar.animator ? this.avatar.animator.dir : "S";
      global.Storage.setLobbyPlayerPosition(this.avatar.x, this.avatar.y, dir, immediate !== false);
    },

    /* ---------------- 主迴圈 ----------------
       _looping 的意義是「已排定下一幀」。進入 loop 先清旗標、
       結尾要繼續才重新排定；因此就算 stop() 是在 update() 內部
       被觸發（例如按 E 開傳送門），旗標也不會卡在 true，
       之後 start() 一定能重新啟動迴圈（修正：返回大廳後畫面凍結）。 */
    loop: function (ts) {
      this._looping = false;
      if (!this.running) return;
      if (!this.lastTs) this.lastTs = ts;
      var dt = (ts - this.lastTs) / 1000;
      this.lastTs = ts;
      if (dt > 0.05) dt = 0.05;
      this.update(dt);
      this.render();
      if (this.running && !this._looping) {
        this._looping = true;
        global.requestAnimationFrame(this._loop);
      }
    },

    update: function (dt) {
      this.time += dt;
      var av = this.avatar;
      if (!av) return;

      if (this.mode === "idle") {
        var mv = global.Input.getMoveVector();
        var prevX = av.x, prevY = av.y;
        if (mv.x || mv.y) {
          av.x += mv.x * LOBBY_SPEED * dt;
          av.y += mv.y * LOBBY_SPEED * dt;
          var solved = P().resolveCircle(av.x, av.y, prevX, prevY, AVATAR_RADIUS, P().collisionRects());
          av.x = solved.x; av.y = solved.y;
          av.bobT += dt;
        }
        if (av.animator) av.animator.update(dt, mv.x, mv.y);

        this.updateInteractions();
        this.updateIdleEconomy();

        this._savePosTimer += dt;
        if (this._savePosTimer >= SAVE_POS_INTERVAL) {
          this._savePosTimer = 0;
          this.savePosition(true);
        }

        if (global.Input.consumePress("KeyE")) this.triggerInteraction();
        if (global.Input.consumePress("KeyB")) this.app.handleAction("build");
      } else {
        if (av.animator) av.animator.update(dt, 0, 0);
        global.LobbyEconomy.leaveZone();          /* 建造模式不計掛機 */
        if (this.mode === "ghost") this.updateGhostKeys();
      }

      /* 飄字 */
      for (var i = 0; i < this._floaters.length; i++) {
        var f = this._floaters[i];
        f.age += dt; f.y -= 20 * dt;
      }
      this._floaters = this._floaters.filter(function (f) { return f.age < f.life; });

      this.updateCamera(false);
    },

    /* ---------------- 互動偵測（傳送門 / 工作台） ---------------- */
    updateInteractions: function () {
      var av = this.avatar;
      var candidates = [
        { kind: "portal", def: W().portal, label: "選擇行動地點", icon: "▶" },
        { kind: "workbench", def: W().workbench, label: "開啟建造工作台", icon: "🔨" }
      ];
      var nearest = null;
      candidates.forEach(function (c) {
        var dx = av.x - c.def.x, dy = av.y - c.def.y;
        var d2 = dx * dx + dy * dy;
        var r = c.def.interactRadius;
        if (d2 <= r * r && (!nearest || d2 < nearest.d2)) {
          nearest = { kind: c.kind, label: c.label, d2: d2 };
        }
      });
      if ((nearest && nearest.kind) !== (this.nearestInteraction && this.nearestInteraction.kind)) {
        this.setPrompt(nearest ? nearest.label : null);
      }
      this.nearestInteraction = nearest;
    },

    triggerInteraction: function () {
      if (!this.running || this.mode !== "idle" || !this.nearestInteraction) return;
      if (global.AudioManager) global.AudioManager.playSfx("click");
      if (this.nearestInteraction.kind === "portal") this.app.openPortalSelect();
      else if (this.nearestInteraction.kind === "workbench") this.app.handleAction("build");
    },

    setPrompt: function (label) {
      var btn = this.dom.interact;
      if (!btn) return;
      if (!label) { btn.classList.add("hidden"); return; }
      var touch = global.Input && global.Input.isTouchDevice && global.Input.isTouchDevice();
      btn.innerHTML = touch
        ? "<span class='interact-label'>" + label + "</span>"
        : "<span class='interact-key'>E</span><span class='interact-label'>" + label + "</span>";
      btn.classList.remove("hidden");
    },

    /* ---------------- 掛機回收 ---------------- */
    updateIdleEconomy: function () {
      var av = this.avatar;
      var inZone = W().inIdleZone(av.x, av.y);
      var eco = global.LobbyEconomy;
      if (inZone) eco.enterZone(); else eco.leaveZone();
      var gained = inZone ? eco.update() : 0;
      if (gained > 0) {
        this.addFloater(av.x, av.y - 40, "+" + gained + " 再生材料", "#8fd06a");
        this.updateHud();
        if (global.AudioManager) global.AudioManager.playSfx("click");
      }
      var status = eco.getStatus();
      this._idleStatusSig = this._idleStatusSig || "";
      var sig = [inZone, status.earned, status.secondsToNext, status.capped].join("|");
      if (sig !== this._idleStatusSig) {
        this._idleStatusSig = sig;
        this.updateIdleStatus(status);
        if (this.dom.daily) this.dom.daily.textContent = "今日回收 " + status.earned + " / " + status.cap;
      }
    },

    updateIdleStatus: function (status) {
      var box = this.dom.idleStatus;
      if (!box) return;
      if (!status.inZone) { box.classList.add("hidden"); return; }
      box.classList.remove("hidden");
      box.innerHTML = status.capped
        ? "<strong>今日回收已完成</strong><span>明日可再取得 " + status.cap + " 份</span>"
        : "<strong>資源回收中…</strong><span>下一份材料：" + (status.secondsToNext != null ? status.secondsToNext : "--") + " 秒</span><span>今日：" + status.earned + " / " + status.cap + "</span>";
    },

    /* ---------------- HUD ---------------- */
    updateHud: function () {
      if (this.dom.coins) this.dom.coins.textContent = global.Storage.getCoins().toLocaleString("zh-TW");
      if (this.dom.materials) this.dom.materials.textContent = global.Storage.getRecycled();
      if (this.dom.buildMaterials) this.dom.buildMaterials.textContent = global.Storage.getRecycled();
      if (this.dom.daily) {
        var status = global.LobbyEconomy.getStatus();
        this.dom.daily.textContent = "今日回收 " + status.earned + " / " + status.cap;
      }
    },

    addFloater: function (x, y, text, color) {
      this._floaters.push({ x: x, y: y, text: text, color: color || "#fff", age: 0, life: 1.3 });
    },

    /* ============================================================
       建造模式
       ============================================================ */
    enterBuild: function () {
      if (!this.running) return;
      this.mode = "catalog";
      this.ghost = null;
      this.closeEditPanel();
      global.LobbyEconomy.leaveZone();
      this.setPrompt(null);
      if (this.dom.buildRoot) this.dom.buildRoot.classList.remove("hidden");
      if (this.dom.buildSheet) this.dom.buildSheet.classList.remove("hidden");
      if (this.dom.ghostBar) this.dom.ghostBar.classList.add("hidden");
      this.buildCatalog();
      this.updateHud();
    },

    exitBuild: function () {
      this.mode = "idle";
      this.ghost = null;
      this.closeEditPanel();
      this.hideBuildDom();
      if (global.Input && global.Input.clearPresses) global.Input.clearPresses();
    },

    hideBuildDom: function () {
      if (this.dom.buildRoot) this.dom.buildRoot.classList.add("hidden");
      if (this.dom.buildSheet) this.dom.buildSheet.classList.add("hidden");
      if (this.dom.ghostBar) this.dom.ghostBar.classList.add("hidden");
      this.closeEditPanel();
    },

    /* ESC 逐層退出：ghost → 編輯 → 目錄 → 離開建造模式。回傳是否已處理 */
    handleEscape: function () {
      if (this.mode === "ghost") { this.cancelGhost(); return true; }
      if (this.editTarget) { this.closeEditPanel(); return true; }
      if (this.mode === "catalog") { this.app.exitBuildMode(); return true; }
      return false;
    },

    /* ---------------- 建造目錄 ---------------- */
    buildCatalog: function () {
      var list = this.dom.buildList;
      if (!list) return;
      var self = this;
      var tab = this._catalogTab;
      if (this.dom.buildTabs) {
        Array.prototype.forEach.call(this.dom.buildTabs.querySelectorAll("[data-build-tab]"), function (b) {
          b.classList.toggle("active", b.dataset.buildTab === tab);
        });
      }
      list.innerHTML = "";
      var defs = (global.GameData.lobbyBuildings || []).filter(function (d) { return d.category === tab; });
      var materials = global.Storage.getRecycled();

      defs.forEach(function (def) {
        var owned = global.Storage.countLobbyBuilding(def.id);
        var stock = global.Storage.getLobbyInventoryCount(def.id);
        var cost = (def.cost && def.cost.recycled) | 0;
        var builtOut = def.unique && owned > 0 && stock === 0;   /* 已建造且在場上 */
        var canBuy = (!def.unique || owned === 0) && materials >= cost;

        var card = document.createElement("div");
        card.className = "build-card";
        card.setAttribute("role", "listitem");

        var icon = document.createElement("canvas");
        icon.className = "build-card-icon";
        icon.width = 96; icon.height = 96;
        self.drawCatalogIcon(icon, def);
        card.appendChild(icon);

        var info = document.createElement("div");
        info.className = "build-card-info";
        var tagText = def.category === "functional" ? "功能 · 每種限 1 棟" : "裝飾 · 可重複";
        var size = def.footprint.w + "×" + def.footprint.h;
        info.innerHTML =
          "<div class='build-card-name'>" + def.name + "</div>" +
          "<div class='build-card-tag'>" + tagText + " · " + size + " 格" + (def.collision === false ? " · 可走過" : "") + "</div>" +
          "<div class='build-card-effect'>" + (def.effectText || "純裝飾") + "</div>";
        card.appendChild(info);

        var actions = document.createElement("div");
        actions.className = "build-card-actions";
        if (stock > 0) {
          var placeBtn = document.createElement("button");
          placeBtn.className = "btn build-card-btn";
          placeBtn.textContent = "擺放（庫存 " + stock + "）";
          placeBtn.addEventListener("click", function () { self.startGhost(def, "inventory", null); });
          actions.appendChild(placeBtn);
        }
        var buyBtn = document.createElement("button");
        buyBtn.className = "btn build-card-btn" + (canBuy ? " btn-primary" : "");
        if (builtOut) {
          buyBtn.textContent = "已建造";
          buyBtn.disabled = true;
        } else if (def.unique && owned > 0) {
          buyBtn.textContent = "已擁有（收納中）";
          buyBtn.disabled = true;
        } else {
          buyBtn.innerHTML = "建造 <span class='build-cost'>⬢ " + cost + "</span>";
          buyBtn.disabled = !canBuy;
          if (!canBuy) buyBtn.title = "再生材料不足，還差 " + (cost - materials);
        }
        buyBtn.addEventListener("click", function () {
          if (buyBtn.disabled) return;
          self.startGhost(def, "buy", null);
        });
        actions.appendChild(buyBtn);
        if (!canBuy && !builtOut && !(def.unique && owned > 0) && stock === 0) {
          var lack = document.createElement("div");
          lack.className = "build-card-lack";
          lack.textContent = "還差 ⬢ " + (cost - materials);
          actions.appendChild(lack);
        }
        card.appendChild(actions);
        list.appendChild(card);
      });
    },

    drawCatalogIcon: function (canvas, def) {
      var ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var key = "lobbybld_" + def.id;
      if (global.Assets && global.Assets.drawInRect && global.Assets.drawInRect(ctx, key, 6, 6, 84, 84)) return;
      var size = P().footprintSize(def, 0);
      var scale = Math.min(72 / (size.w * 24), 72 / (size.h * 30), 1.6);
      var w = size.w * 24 * scale, h = size.h * 24 * scale;
      this.drawBuildingShape(ctx, def, (96 - w) / 2, 96 - 14 - h, w, h, 1);
    },

    /* ---------------- Ghost 擺放 ---------------- */
    startGhost: function (def, mode, excludeInstanceId, startCellX, startCellY) {
      this.closeEditPanel();
      this.mode = "ghost";
      var size = P().footprintSize(def, 0);
      var cell;
      if (startCellX != null) {
        cell = { cx: startCellX, cy: startCellY };
      } else {
        cell = W().toCell(this.avatar.x - size.w * W().CELL / 2, this.avatar.y + 40);
      }
      this.ghost = {
        def: def, mode: mode,
        excludeInstanceId: excludeInstanceId || null,
        rotation: 0,
        cellX: cell.cx, cellY: cell.cy,
        valid: false, reasons: []
      };
      this.validateGhost();
      if (this.dom.buildSheet) this.dom.buildSheet.classList.add("hidden");
      if (this.dom.ghostBar) this.dom.ghostBar.classList.remove("hidden");
      this.updateGhostHint();
    },

    validateGhost: function () {
      var g = this.ghost;
      if (!g) return;
      var result = P().validate({
        def: g.def, rotation: g.rotation, cellX: g.cellX, cellY: g.cellY,
        excludeInstanceId: g.excludeInstanceId,
        playerX: this.avatar.x, playerY: this.avatar.y,
        mode: g.mode
      });
      g.valid = result.ok;
      g.reasons = result.reasons;
      this.updateGhostHint();
    },

    updateGhostHint: function () {
      if (!this.dom.ghostHint || !this.ghost) return;
      var g = this.ghost;
      var name = g.def.name + (g.mode === "move" ? "（移動中）" : "");
      this.dom.ghostHint.innerHTML = g.valid
        ? "<strong>" + name + "</strong><span class='ghost-ok'>可以放置</span>"
        : "<strong>" + name + "</strong><span class='ghost-bad'>" + (g.reasons[0] || "不可放置") + "</span>";
    },

    moveGhostTo: function (worldX, worldY) {
      var g = this.ghost;
      if (!g) return;
      var size = P().footprintSize(g.def, g.rotation);
      var cx = Math.round(worldX / W().CELL - size.w / 2);
      var cy = Math.round(worldY / W().CELL - size.h / 2);
      if (cx !== g.cellX || cy !== g.cellY) {
        g.cellX = cx; g.cellY = cy;
        this.validateGhost();
      }
    },

    nudgeGhost: function (dx, dy) {
      var g = this.ghost;
      if (!g) return;
      g.cellX += dx; g.cellY += dy;
      this.validateGhost();
    },

    rotateGhost: function () {
      var g = this.ghost;
      if (!g) return;
      var rots = g.def.rotations && g.def.rotations.length ? g.def.rotations : [0];
      var index = rots.indexOf(g.rotation);
      g.rotation = rots[(index + 1) % rots.length];
      this.validateGhost();
      if (global.AudioManager) global.AudioManager.playSfx("click");
    },

    confirmGhost: function () {
      var g = this.ghost;
      if (!g) return;
      this.validateGhost();
      if (!g.valid) {
        if (global.UI) global.UI.showToast("還不能放置", g.reasons[0] || "請換個位置。");
        return;
      }
      var x = g.cellX * W().CELL, y = g.cellY * W().CELL;
      var result;
      if (g.mode === "buy") result = global.Storage.buildLobbyBuilding(g.def, x, y, g.rotation);
      else if (g.mode === "inventory") result = global.Storage.placeLobbyFromInventory(g.def, x, y, g.rotation);
      else result = global.Storage.updateLobbyBuilding(g.excludeInstanceId, { x: x, y: y, rotation: g.rotation });

      if (!result.ok) {
        var msg = result.reason === "materials" ? "再生材料不足。" :
                  result.reason === "unique" ? "這種功能建築只能建造一棟。" :
                  result.reason === "inventory" ? "庫存中沒有這個物件。" : "請稍後再試。";
        if (global.UI) global.UI.showToast("無法放置", msg);
        return;
      }
      this.addFloater(x + 40, y - 8, g.mode === "buy" ? "建造完成！" : "放置完成！", "#ffd45c");
      if (global.AudioManager) global.AudioManager.playSfx("click");
      this.ghost = null;
      this.mode = "catalog";
      if (this.dom.ghostBar) this.dom.ghostBar.classList.add("hidden");
      if (this.dom.buildSheet) this.dom.buildSheet.classList.remove("hidden");
      this.buildCatalog();
      this.updateHud();
    },

    cancelGhost: function () {
      /* 取消：不扣任何材料；移動模式則原地不動 */
      this.ghost = null;
      this.mode = "catalog";
      if (this.dom.ghostBar) this.dom.ghostBar.classList.add("hidden");
      if (this.dom.buildSheet) this.dom.buildSheet.classList.remove("hidden");
      this.buildCatalog();
    },

    updateGhostKeys: function () {
      var I = global.Input;
      if (I.consumePress("KeyR")) this.rotateGhost();
      if (I.consumePress("ArrowLeft")) this.nudgeGhost(-1, 0);
      if (I.consumePress("ArrowRight")) this.nudgeGhost(1, 0);
      if (I.consumePress("ArrowUp")) this.nudgeGhost(0, -1);
      if (I.consumePress("ArrowDown")) this.nudgeGhost(0, 1);
      if (I.consumePress("Enter") || I.consumePress("NumpadEnter")) this.confirmGhost();
    },

    /* ---------------- 已放置建築的編輯（移動 / 旋轉 / 收納） ---------------- */
    openEditPanel: function (inst) {
      var def = global.GameData.getLobbyBuilding(inst.buildingId);
      if (!def) return;
      this.editTarget = inst.instanceId;
      var panel = this.dom.editPanel;
      if (!panel) return;
      if (this.dom.editName) this.dom.editName.textContent = def.name;
      if (this.dom.editEffect) this.dom.editEffect.textContent = def.effectText || "純裝飾";
      panel.classList.remove("hidden");
    },

    closeEditPanel: function () {
      this.editTarget = null;
      if (this.dom.editPanel) this.dom.editPanel.classList.add("hidden");
    },

    editAction: function (action) {
      var inst = this.editTarget ? global.Storage.getLobbyBuildingInstance(this.editTarget) : null;
      if (!inst) return;
      var def = global.GameData.getLobbyBuilding(inst.buildingId);
      if (!def) return;
      if (action === "move") {
        var cell = W().toCell(inst.x + 1, inst.y + 1);
        this.closeEditPanel();
        this.startGhost(def, "move", inst.instanceId, cell.cx, cell.cy);
        this.ghost.rotation = inst.rotation;
        this.validateGhost();
      } else if (action === "rotate") {
        var rots = def.rotations && def.rotations.length ? def.rotations : [0];
        var next = rots[(rots.indexOf(inst.rotation) + 1) % rots.length];
        var cell2 = W().toCell(inst.x + 1, inst.y + 1);
        var check = P().validate({
          def: def, rotation: next, cellX: cell2.cx, cellY: cell2.cy,
          excludeInstanceId: inst.instanceId,
          playerX: this.avatar.x, playerY: this.avatar.y, mode: "move"
        });
        if (!check.ok) {
          if (global.UI) global.UI.showToast("無法旋轉", check.reasons[0] || "旋轉後會卡到其他東西。");
          return;
        }
        global.Storage.updateLobbyBuilding(inst.instanceId, { rotation: next });
      } else if (action === "stow") {
        global.Storage.stowLobbyBuilding(inst.instanceId);
        this.closeEditPanel();
        this.addFloater(inst.x + 40, inst.y, "已收納（材料不返還）", "#cdeef5");
        this.buildCatalog();
      }
    },

    /* ---------------- 指標 / 觸控 ---------------- */
    bindPointer: function () {
      var self = this;
      var canvas = this.canvas;

      function toWorld(clientX, clientY) {
        var p = global.Input.clientToInternal
          ? global.Input.clientToInternal(clientX, clientY)
          : null;
        if (!p) return null;
        var z = W().ZOOM;
        return { x: self.camera.x + p.x / z, y: self.camera.y + p.y / z, inside: p.inside };
      }
      this.toWorld = toWorld;

      canvas.addEventListener("mousemove", function (e) {
        if (!self.running || self.mode !== "ghost") return;
        var w = toWorld(e.clientX, e.clientY);
        if (w) self.moveGhostTo(w.x, w.y);
      });

      canvas.addEventListener("click", function (e) {
        if (!self.running) return;
        var w = toWorld(e.clientX, e.clientY);
        if (!w) return;
        if (self.mode === "ghost") {
          self.moveGhostTo(w.x, w.y);
          self.confirmGhost();
        } else if (self.mode === "catalog") {
          var inst = self.findBuildingAt(w.x, w.y);
          if (inst) self.openEditPanel(inst);
          else self.closeEditPanel();
        }
      });

      /* 觸控：單指拖曳 ghost；雙指平移鏡頭（建造模式限定） */
      var touchState = { panning: false, lastCx: 0, lastCy: 0 };
      canvas.addEventListener("touchstart", function (e) {
        if (!self.running || (self.mode !== "ghost" && self.mode !== "catalog")) return;
        if (e.touches.length === 2) {
          touchState.panning = true;
          touchState.lastCx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          touchState.lastCy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          e.preventDefault();
        } else if (e.touches.length === 1 && self.mode === "ghost") {
          var w = toWorld(e.touches[0].clientX, e.touches[0].clientY);
          if (w) self.moveGhostTo(w.x, w.y);
          e.preventDefault();
        }
      }, { passive: false });
      canvas.addEventListener("touchmove", function (e) {
        if (!self.running || (self.mode !== "ghost" && self.mode !== "catalog")) return;
        if (touchState.panning && e.touches.length === 2) {
          var cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          var cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          var rect = canvas.getBoundingClientRect();
          var scaleX = canvas.width / rect.width;
          self.panCamera((touchState.lastCx - cx) * scaleX / W().ZOOM, (touchState.lastCy - cy) * scaleX / W().ZOOM);
          touchState.lastCx = cx; touchState.lastCy = cy;
          e.preventDefault();
        } else if (e.touches.length === 1 && self.mode === "ghost") {
          var w2 = toWorld(e.touches[0].clientX, e.touches[0].clientY);
          if (w2) self.moveGhostTo(w2.x, w2.y);
          e.preventDefault();
        }
      }, { passive: false });
      canvas.addEventListener("touchend", function (e) {
        if (e.touches.length < 2) touchState.panning = false;
        if (!self.running || self.mode !== "catalog" || e.changedTouches.length !== 1) return;
        var w = toWorld(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
        if (!w) return;
        var inst = self.findBuildingAt(w.x, w.y);
        if (inst) self.openEditPanel(inst);
      });
    },

    findBuildingAt: function (wx, wy) {
      var hits = P().placedInstances(null).filter(function (inst) {
        var def = global.GameData.getLobbyBuilding(inst.buildingId);
        if (!def) return false;
        var r = P().instanceRect(inst, def);
        /* 點擊判定含建築視覺上緣（高出 footprint 的部分） */
        return wx >= r.x && wx < r.x + r.w && wy >= r.y - r.h * 0.9 && wy < r.y + r.h;
      });
      return hits.length ? hits[hits.length - 1] : null;
    },

    panCamera: function (dx, dy) {
      this._cameraPan = this._cameraPan || { x: 0, y: 0 };
      this._cameraPan.x += dx;
      this._cameraPan.y += dy;
    },

    updateCamera: function (snap) {
      var z = W().ZOOM;
      var vw = this.canvas.width / z, vh = this.canvas.height / z;
      var target = this.avatar || W().spawn;
      var tx = target.x - vw / 2, ty = target.y - vh / 2;
      if (this.mode === "ghost" || this.mode === "catalog") {
        /* 建造模式：以 ghost / 平移偏移為中心 */
        if (this.ghost) {
          var size = P().footprintSize(this.ghost.def, this.ghost.rotation);
          tx = (this.ghost.cellX + size.w / 2) * W().CELL - vw / 2;
          ty = (this.ghost.cellY + size.h / 2) * W().CELL - vh / 2;
        }
        if (this._cameraPan) { tx += this._cameraPan.x; ty += this._cameraPan.y; }
      } else {
        this._cameraPan = null;
      }
      tx = Math.max(0, Math.min(W().W - vw, tx));
      ty = Math.max(0, Math.min(W().H - vh, ty));
      if (snap) { this.camera.x = tx; this.camera.y = ty; }
      else {
        this.camera.x += (tx - this.camera.x) * 0.18;
        this.camera.y += (ty - this.camera.y) * 0.18;
      }
    },

    /* ============================================================
       繪製
       ============================================================ */
    render: function () {
      var ctx = this.ctx;
      var cw = this.canvas.width, ch = this.canvas.height;
      var z = W().ZOOM;
      var vw = cw / z, vh = ch / z;
      var cam = this.camera;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#071b24";
      ctx.fillRect(0, 0, cw, ch);

      ctx.save();
      ctx.scale(z, z);
      ctx.translate(-cam.x, -cam.y);

      /* 背景：1280x720 圖等比放大鋪滿 1600x900 世界（直載原圖，不經 bake） */
      if (this._bgImage) {
        try { ctx.drawImage(this._bgImage, 0, 0, W().W, W().H); } catch (e) { this.drawFallbackGround(ctx); }
      } else {
        this.drawFallbackGround(ctx);
      }

      this.drawIdleZone(ctx);
      this.drawWorkbench(ctx);
      this.drawPortal(ctx);

      /* 建築與角色以 y 排序繪製（腳底基準），維持前後遮擋關係 */
      var drawables = [];
      var self = this;
      P().placedInstances(null).forEach(function (inst) {
        var def = global.GameData.getLobbyBuilding(inst.buildingId);
        if (!def) return;
        var r = P().instanceRect(inst, def);
        drawables.push({ baseY: r.y + r.h, draw: function () { self.drawBuilding(ctx, inst, def, r); } });
      });
      if (this.avatar && this.mode === "idle") {
        drawables.push({ baseY: this.avatar.y + AVATAR_WORLD * 0.44, draw: function () { self.drawAvatar(ctx); } });
      } else if (this.avatar) {
        drawables.push({ baseY: this.avatar.y + AVATAR_WORLD * 0.44, draw: function () { self.drawAvatar(ctx, 0.85); } });
      }
      drawables.sort(function (a, b) { return a.baseY - b.baseY; });
      drawables.forEach(function (d) { d.draw(); });

      if (this.mode === "ghost") this.drawGhost(ctx, cam, vw, vh);

      /* 飄字 */
      for (var i = 0; i < this._floaters.length; i++) {
        var f = this._floaters[i];
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - f.age / f.life);
        if (global.UI_THEME) global.UI_THEME.drawOutlinedText(ctx, f.text, f.x, f.y, { fontSize: 15, fill: f.color, strokeWidth: 3 });
        else { ctx.textAlign = "center"; ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y); }
        ctx.restore();
      }

      ctx.restore();
    },

    drawFallbackGround: function (ctx) {
      ctx.fillStyle = "#d9c491";
      ctx.fillRect(0, 0, W().W, W().H);
      ctx.fillStyle = "rgba(84,140,90,0.35)";
      W().blockedRects.forEach(function (r) { ctx.fillRect(r.x, r.y, r.w, r.h); });
    },

    /* ---------------- 固定設施 ---------------- */
    /* 連號動畫幀：從 0 起算連續 ready 的幀數；≥2 幀才播動畫。回傳是否已繪製 */
    drawAnimatedStation: function (ctx, keyPrefix, maxFrames, fps, cx, cy, w, h) {
      var A = global.Assets;
      if (!A || !A.ready) return false;
      var count = 0;
      while (count < maxFrames && A.ready(keyPrefix + count)) count++;
      if (count < 2) return false;
      var frame = Math.floor(this.time * fps) % count;
      return A.drawCentered(ctx, keyPrefix + frame, cx, cy, w, h);
    },

    drawPortal: function (ctx) {
      var p = W().portal;
      var t = this.time;
      var near = this.nearestInteraction && this.nearestInteraction.kind === "portal";

      /* 石台（尺寸對齊 100px 角色比例） */
      ctx.save();
      ctx.fillStyle = "rgba(20,40,46,0.4)";
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 46, 70, 21, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#8b95a0";
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 41, 62, 17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#a9b3bd";
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 36, 54, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      var portalDrawn = this.drawAnimatedStation(ctx, "lobby_portal_", 6, 5, p.x, p.y - 22, 132, 132);
      if (!portalDrawn) portalDrawn = !!(global.Assets && global.Assets.drawCentered(ctx, "lobby_portal", p.x, p.y - 22, 132, 132));
      if (!portalDrawn) {
        /* fallback：旋轉的雙色能量環 */
        ctx.save();
        ctx.translate(p.x, p.y - 22);
        ctx.scale(1.35, 1.35);
        for (var ring = 0; ring < 2; ring++) {
          ctx.save();
          ctx.rotate(t * (ring ? -0.9 : 1.3));
          ctx.strokeStyle = ring ? "rgba(157,246,229,0.9)" : "rgba(77,208,196,0.9)";
          ctx.lineWidth = 5 - ring * 2;
          for (var arc = 0; arc < 3; arc++) {
            ctx.beginPath();
            ctx.arc(0, 0, 26 + ring * 8, arc * 2.1, arc * 2.1 + 1.5);
            ctx.stroke();
          }
          ctx.restore();
        }
        var glow = 0.45 + Math.sin(t * 2.4) * 0.18;
        ctx.fillStyle = "rgba(140,236,220," + glow.toFixed(2) + ")";
        ctx.beginPath(); ctx.arc(0, 0, 17 + Math.sin(t * 3) * 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      if (near) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,212,92," + (0.5 + Math.sin(t * 5) * 0.3) + ")";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 41, 70, 22, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      if (global.UI_THEME) global.UI_THEME.drawOutlinedText(ctx, "行動傳送門", p.x, p.y - 92, { fontSize: 16, fill: "#c9f5ec", strokeWidth: 3 });
    },

    drawWorkbench: function (ctx) {
      var wb = W().workbench;
      var near = this.nearestInteraction && this.nearestInteraction.kind === "workbench";
      ctx.save();
      ctx.fillStyle = "rgba(20,40,46,0.35)";
      ctx.beginPath(); ctx.ellipse(wb.x, wb.y + 32, 56, 16, 0, 0, Math.PI * 2); ctx.fill();
      if (!(global.Assets && global.Assets.drawCentered(ctx, "lobby_workbench", wb.x, wb.y - 10, 108, 108))) {
        /* fallback：木作工作台（放大 1.4 對齊角色比例） */
        ctx.save();
        ctx.translate(wb.x, wb.y);
        ctx.scale(1.4, 1.4);
        ctx.translate(-wb.x, -wb.y);
        ctx.fillStyle = "#6b4f30";
        ctx.fillRect(wb.x - 30, wb.y - 2, 60, 20);
        ctx.fillStyle = "#8a6b45";
        ctx.fillRect(wb.x - 34, wb.y - 12, 68, 12);
        ctx.fillStyle = "#5d4327";
        ctx.fillRect(wb.x - 28, wb.y + 18, 8, 8);
        ctx.fillRect(wb.x + 20, wb.y + 18, 8, 8);
        /* 鎚子 */
        ctx.save();
        ctx.translate(wb.x + 8, wb.y - 18);
        ctx.rotate(-0.5);
        ctx.fillStyle = "#c9a063"; ctx.fillRect(-2, -2, 4, 18);
        ctx.fillStyle = "#9aa7b2"; ctx.fillRect(-8, -8, 16, 8);
        ctx.restore();
        /* 木板 */
        ctx.fillStyle = "#c9a063";
        ctx.fillRect(wb.x - 26, wb.y - 16, 22, 5);
        ctx.restore();
      }
      if (near) {
        ctx.strokeStyle = "rgba(255,212,92," + (0.5 + Math.sin(this.time * 5) * 0.3) + ")";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.ellipse(wb.x, wb.y + 22, 62, 21, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      if (global.UI_THEME) global.UI_THEME.drawOutlinedText(ctx, "建造工作台", wb.x, wb.y - 58, { fontSize: 16, fill: "#ffe1b3", strokeWidth: 3 });
    },

    drawIdleZone: function (ctx) {
      var zone = W().idleZone;
      var t = this.time;
      var status = global.LobbyEconomy.getStatus();
      var active = status.inZone && !status.capped;
      ctx.save();
      ctx.fillStyle = active ? "rgba(77,208,196,0.20)" : "rgba(77,208,196,0.11)";
      ctx.strokeStyle = active ? "rgba(77,208,196,0.85)" : "rgba(77,208,196,0.45)";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 7]);
      ctx.lineDashOffset = -t * 18;
      var radius = 12;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(zone.x, zone.y, zone.w, zone.h, radius);
      else ctx.rect(zone.x, zone.y, zone.w, zone.h);
      ctx.fill();
      ctx.stroke();

      /* 中央回收標誌（三箭頭旋轉） */
      var cx = zone.x + zone.w / 2, cy = zone.y + zone.h / 2;
      var stationDrawn = this.drawAnimatedStation(ctx, "lobby_recycle_", 4, active ? 5 : 2, cx, cy, 96, 96);
      if (!stationDrawn) stationDrawn = !!(global.Assets && global.Assets.drawCentered(ctx, "lobby_recycle_station", cx, cy, 96, 96, 0.95));
      if (!stationDrawn) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1.3, 1.3);
        ctx.rotate(active ? t * 0.9 : t * 0.25);
        ctx.strokeStyle = active ? "#4dd0c4" : "rgba(77,208,196,0.7)";
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        for (var a = 0; a < 3; a++) {
          ctx.save();
          ctx.rotate(a * Math.PI * 2 / 3);
          ctx.beginPath();
          ctx.arc(0, 0, 22, -0.3, 1.35);
          ctx.stroke();
          /* 箭頭 */
          var ang = 1.35;
          var ax = Math.cos(ang) * 22, ay = Math.sin(ang) * 22;
          ctx.beginPath();
          ctx.moveTo(ax + Math.cos(ang + 2.6) * 9, ay + Math.sin(ang + 2.6) * 9);
          ctx.lineTo(ax, ay);
          ctx.lineTo(ax + Math.cos(ang + 4.2) * 9, ay + Math.sin(ang + 4.2) * 9);
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      }
      ctx.restore();
      if (global.UI_THEME) {
        global.UI_THEME.drawOutlinedText(ctx, "資源回收區", cx, zone.y - 12, { fontSize: 16, fill: "#bdf4ec", strokeWidth: 3 });
      }
    },

    /* ---------------- 建築繪製 ---------------- */
    drawBuilding: function (ctx, inst, def, rect, alpha) {
      alpha = alpha == null ? 1 : alpha;
      /* 陰影 */
      ctx.save();
      ctx.globalAlpha = 0.28 * alpha;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(rect.x + rect.w / 2, rect.y + rect.h - 4, rect.w * 0.46, Math.min(14, rect.h * 0.2), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      var key = "lobbybld_" + def.id;
      var img = global.Assets ? global.Assets.get(key) : null;
      if (img) {
        /* 圖片：寬對齊 footprint，高依比例，底部對齊（圖可高出 footprint） */
        var dw = rect.w * 1.02;
        var dh = dw * (img.h / img.w);
        ctx.save();
        if (alpha !== 1) ctx.globalAlpha = alpha;
        try {
          ctx.drawImage(img.src, rect.x + (rect.w - dw) / 2, rect.y + rect.h - dh, dw, dh);
          ctx.restore();
          return;
        } catch (e) { ctx.restore(); }
      }
      /* 佔位圖比例：功能建築畫高一點、裝飾略放大，
         與 100px 角色及背景圖建物的視覺比例一致（視覺可超出 footprint） */
      var functional = def.category === "functional";
      var visW = rect.w * (functional ? 1.06 : 1.5);
      var visH = rect.h * (functional ? 1.9 : 1.5);
      this.drawBuildingShape(ctx, def, rect.x + (rect.w - visW) / 2, rect.y + rect.h - visH, visW, visH, alpha);
    },

    /* fallback 造型：資料驅動（fallback.body / roof / accent / glyph） */
    drawBuildingShape: function (ctx, def, x, y, w, h, alpha) {
      var fb = def.fallback || { body: "#8a8f96", roof: "#5b6570", accent: "#cfd6dd", glyph: "sign" };
      ctx.save();
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      var g = fb.glyph;

      if (g === "tree") {
        ctx.fillStyle = fb.body;
        ctx.fillRect(x + w * 0.42, y + h * 0.55, w * 0.16, h * 0.4);
        ctx.fillStyle = fb.roof;
        ctx.beginPath(); ctx.arc(x + w * 0.5, y + h * 0.38, w * 0.34, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = fb.accent;
        ctx.beginPath(); ctx.arc(x + w * 0.38, y + h * 0.3, w * 0.16, 0, Math.PI * 2); ctx.fill();
      } else if (g === "lamp") {
        ctx.fillStyle = fb.body;
        ctx.fillRect(x + w * 0.46, y + h * 0.28, w * 0.08, h * 0.66);
        ctx.fillStyle = fb.roof;
        ctx.fillRect(x + w * 0.3, y + h * 0.1, w * 0.4, h * 0.2);
        ctx.fillStyle = fb.accent;
        ctx.globalAlpha *= 0.85;
        ctx.beginPath(); ctx.arc(x + w * 0.5, y + h * 0.2, w * 0.26, 0, Math.PI * 2); ctx.fill();
      } else if (g === "sign") {
        ctx.fillStyle = fb.roof;
        ctx.fillRect(x + w * 0.44, y + h * 0.4, w * 0.12, h * 0.55);
        ctx.fillStyle = fb.body;
        ctx.fillRect(x + w * 0.12, y + h * 0.12, w * 0.76, h * 0.4);
        ctx.strokeStyle = fb.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.08);
        ctx.strokeRect(x + w * 0.2, y + h * 0.34, w * 0.44, h * 0.06);
      } else if (g === "bench") {
        ctx.fillStyle = fb.body;
        ctx.fillRect(x + w * 0.08, y + h * 0.4, w * 0.84, h * 0.18);
        ctx.fillStyle = fb.roof;
        ctx.fillRect(x + w * 0.1, y + h * 0.58, w * 0.1, h * 0.32);
        ctx.fillRect(x + w * 0.8, y + h * 0.58, w * 0.1, h * 0.32);
        ctx.fillStyle = fb.accent;
        ctx.fillRect(x + w * 0.08, y + h * 0.22, w * 0.84, h * 0.12);
      } else if (g === "bin") {
        var cols = ["#43a047", "#1e88e5", "#fb8c00"];
        var bw = w * 0.26;
        for (var b = 0; b < 3; b++) {
          var bx = x + w * 0.08 + b * (bw + w * 0.05);
          ctx.fillStyle = cols[b];
          ctx.fillRect(bx, y + h * 0.35, bw, h * 0.55);
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.fillRect(bx, y + h * 0.35, bw, h * 0.12);
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fillRect(bx + bw * 0.3, y + h * 0.55, bw * 0.4, h * 0.06);
        }
      } else if (g === "flower") {
        ctx.fillStyle = fb.body;
        ctx.fillRect(x + w * 0.04, y + h * 0.5, w * 0.92, h * 0.42);
        ctx.fillStyle = "#5d8f56";
        ctx.fillRect(x + w * 0.04, y + h * 0.5, w * 0.92, h * 0.1);
        var petals = ["#e77fb3", "#ffd45c", "#e77fb3", "#f5f0e0", "#ffd45c"];
        for (var fl = 0; fl < 5; fl++) {
          ctx.fillStyle = petals[fl];
          ctx.beginPath();
          ctx.arc(x + w * (0.14 + fl * 0.18), y + h * (0.36 + (fl % 2) * 0.1), w * 0.06, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (g === "pond") {
        ctx.fillStyle = "#3a6b4a";
        ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.62, w * 0.48, h * 0.34, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = fb.body;
        ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.6, w * 0.42, h * 0.28, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = fb.accent;
        ctx.beginPath(); ctx.ellipse(x + w * 0.38, y + h * 0.52, w * 0.12, h * 0.07, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#6dc06d";
        ctx.beginPath(); ctx.ellipse(x + w * 0.62, y + h * 0.66, w * 0.09, h * 0.05, 0, 0, Math.PI * 2); ctx.fill();
      } else if (g === "drop" && def.footprint.w === 1) {
        /* 雨水桶 */
        ctx.fillStyle = fb.roof;
        ctx.fillRect(x + w * 0.14, y + h * 0.3, w * 0.72, h * 0.62);
        ctx.fillStyle = fb.body;
        ctx.fillRect(x + w * 0.14, y + h * 0.3, w * 0.72, h * 0.14);
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + w * 0.14, y + h * 0.52, w * 0.72, 0);
        ctx.fillStyle = fb.accent;
        ctx.beginPath();
        ctx.arc(x + w * 0.5, y + h * 0.68, w * 0.13, 0, Math.PI * 2);
        ctx.fill();
      } else {
        /* 通用小屋（功能建築） */
        var bodyTop = y + h * 0.34;
        ctx.fillStyle = fb.body;
        ctx.fillRect(x + w * 0.06, bodyTop, w * 0.88, h - (bodyTop - y) - h * 0.04);
        ctx.strokeStyle = "rgba(16,36,42,0.55)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + w * 0.06, bodyTop, w * 0.88, h - (bodyTop - y) - h * 0.04);
        /* 屋頂 */
        ctx.fillStyle = fb.roof;
        ctx.beginPath();
        ctx.moveTo(x, bodyTop + 2);
        ctx.lineTo(x + w * 0.5, y + h * 0.04);
        ctx.lineTo(x + w, bodyTop + 2);
        ctx.closePath();
        ctx.fill();
        /* 門 */
        ctx.fillStyle = "rgba(16,36,42,0.5)";
        ctx.fillRect(x + w * 0.42, y + h * 0.68, w * 0.16, h * 0.28);
        /* 屋頂圖示 */
        var gx = x + w * 0.5, gy = y + h * 0.22, gs = Math.min(w, h) * 0.14;
        ctx.fillStyle = fb.accent;
        ctx.strokeStyle = fb.accent;
        ctx.lineWidth = 3;
        if (g === "sun") {
          ctx.beginPath(); ctx.arc(gx, gy, gs * 0.6, 0, Math.PI * 2); ctx.fill();
          for (var s = 0; s < 8; s++) {
            var sa = s * Math.PI / 4;
            ctx.beginPath();
            ctx.moveTo(gx + Math.cos(sa) * gs * 0.85, gy + Math.sin(sa) * gs * 0.85);
            ctx.lineTo(gx + Math.cos(sa) * gs * 1.25, gy + Math.sin(sa) * gs * 1.25);
            ctx.stroke();
          }
        } else if (g === "drop") {
          ctx.beginPath();
          ctx.moveTo(gx, gy - gs);
          ctx.quadraticCurveTo(gx + gs, gy + gs * 0.5, gx, gy + gs);
          ctx.quadraticCurveTo(gx - gs, gy + gs * 0.5, gx, gy - gs);
          ctx.fill();
        } else if (g === "fan") {
          for (var fbl = 0; fbl < 3; fbl++) {
            ctx.save();
            ctx.translate(gx, gy);
            ctx.rotate(this.time * 2 + fbl * Math.PI * 2 / 3);
            ctx.beginPath();
            ctx.ellipse(0, -gs * 0.7, gs * 0.32, gs * 0.75, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
          ctx.beginPath(); ctx.arc(gx, gy, gs * 0.25, 0, Math.PI * 2); ctx.fill();
        } else if (g === "shield") {
          ctx.beginPath();
          ctx.moveTo(gx, gy - gs);
          ctx.lineTo(gx + gs * 0.9, gy - gs * 0.4);
          ctx.lineTo(gx + gs * 0.7, gy + gs * 0.7);
          ctx.lineTo(gx, gy + gs * 1.05);
          ctx.lineTo(gx - gs * 0.7, gy + gs * 0.7);
          ctx.lineTo(gx - gs * 0.9, gy - gs * 0.4);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    },

    /* ---------------- Ghost 與格線 ---------------- */
    drawGhost: function (ctx, cam, vw, vh) {
      var g = this.ghost;
      if (!g) return;
      var CELL = W().CELL;

      /* 格線（只畫可視範圍） */
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      var startX = Math.floor(cam.x / CELL) * CELL;
      var startY = Math.floor(cam.y / CELL) * CELL;
      for (var gx = startX; gx <= cam.x + vw; gx += CELL) {
        ctx.beginPath(); ctx.moveTo(gx, cam.y); ctx.lineTo(gx, cam.y + vh); ctx.stroke();
      }
      for (var gy = startY; gy <= cam.y + vh; gy += CELL) {
        ctx.beginPath(); ctx.moveTo(cam.x, gy); ctx.lineTo(cam.x + vw, gy); ctx.stroke();
      }

      /* 保留區提示 */
      ctx.fillStyle = "rgba(255,212,92,0.10)";
      W().reservedRects.forEach(function (r) { ctx.fillRect(r.x, r.y, r.w, r.h); });

      /* footprint 顏色：綠 = 合法、紅 = 不可 */
      var size = P().footprintSize(g.def, g.rotation);
      var rx = g.cellX * CELL, ry = g.cellY * CELL;
      var rw = size.w * CELL, rh = size.h * CELL;
      var pulse = 0.16 + Math.sin(this.time * 6) * 0.05;
      ctx.fillStyle = g.valid ? "rgba(110,220,130," + (0.22 + pulse) + ")" : "rgba(240,90,90," + (0.24 + pulse) + ")";
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = g.valid ? "rgba(110,220,130,0.95)" : "rgba(240,90,90,0.95)";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);

      /* 半透明建築預覽 */
      this.drawBuilding(ctx, null, g.def, { x: rx, y: ry, w: rw, h: rh }, 0.6);
      ctx.restore();
    },

    /* ---------------- 角色 ---------------- */
    drawAvatar: function (ctx, alpha) {
      var av = this.avatar;
      alpha = alpha == null ? 1 : alpha;
      var ps = AVATAR_WORLD;   /* 對齊背景圖比例，不用戰鬥的 RENDER_SIZES */

      ctx.save();
      ctx.globalAlpha = 0.3 * alpha;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(av.x, av.y + ps * 0.44, ps * 0.3, ps * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      var moving = av.animator ? av.animator.action === "walk" : false;
      var bob = moving ? Math.abs(Math.sin(av.bobT * 9)) * (ps * 0.07) : 0;
      var dy = av.y - bob;
      var resolution = av.animator && av.animator.resolveSprite ? av.animator.resolveSprite() : null;
      var drawn = false;
      if (resolution && resolution.key && global.Animation && global.Animation.drawResolvedSprite) {
        drawn = global.Animation.drawResolvedSprite(ctx, resolution, av.x, dy, ps, ps, alpha);
      }
      if (drawn && global.Animation && global.Animation.recordResolved) {
        global.Animation.recordResolved(av.animator, resolution);
      }
      if (!drawn && global.Animation && global.Animation.drawFallbackSprite) {
        global.Animation.drawFallbackSprite(ctx, {
          animator: av.animator,
          spriteId: av.character.spriteId,
          x: av.x, y: av.y, w: ps, h: ps,
          alpha: alpha,
          entityType: "Player"
        });
      }
      if (av.animator && global.Animation && global.Animation.drawAnimationDebugLabel) {
        global.Animation.drawAnimationDebugLabel(ctx, {
          animator: av.animator,
          resolution: drawn ? resolution : null,
          x: av.x, y: av.y, offsetY: ps * 0.82
        });
      }
    }
  };

  global.Lobby = Lobby;
})(window);
