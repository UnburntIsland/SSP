/* ============================================================
   tutorial.js — v1.2 跨畫面的漸進式、操作驅動教學
   每一步必須完成實際操作才前進，狀態會保存並可從說明頁重播。
   ============================================================ */
(function (global) {
  var STEPS = [
    {
      id: "move", event: "lobby-moved", screen: "LOBBY", iconPath: "assets/images/ui/navigation/character.webp",
      title: "先走動看看",
      text: "使用 WASD／方向鍵；觸控裝置可拖曳畫面移動。走一小段路就會完成這一步。"
    },
    {
      id: "recycle", event: "recycle-collected", screen: "LOBBY", iconPath: "assets/images/ui/navigation/recycle.webp",
      title: "領取自動回收材料",
      text: "回收站會自己累積材料，不必站著掛機。走到右側回收站，按 E 或點互動提示一次領取。"
    },
    {
      id: "build", event: "building-placed", screen: "LOBBY", iconPath: "assets/images/ui/navigation/build.webp",
      title: "用材料建造",
      text: "打開建造工作台，選擇一件物品並完成放置。建造會消耗再生材料。",
      target: '.lobby-topright [data-action="build"]'
    },
    {
      id: "portal", event: "portal-opened", screen: "LOBBY", iconPath: "assets/images/ui/navigation/portal.webp",
      title: "前往行動傳送門",
      text: "走到大廳上方的傳送門互動，開啟台灣守護行動地圖。"
    },
    {
      id: "play", event: "stage-started", screen: "PORTAL_SELECT", iconPath: "assets/images/ui/navigation/portal.webp",
      title: "開始第一場行動",
      text: "選擇已解鎖的地點並開始。戰鬥會自動攻擊，你只要移動、閃避並收集經驗。",
      target: '#screen-portal [data-action="play"]'
    },
    {
      id: "quiz", event: "quiz-answered", screen: "PLAYING", iconPath: "assets/images/ui/navigation/help.webp",
      title: "升級時完成永續問答",
      text: "收集經驗升級後回答題目。作答後會顯示正確答案與詳解，答錯也能稍後訂正。"
    },
    {
      id: "review", event: "review-opened", screen: "LOBBY", iconPath: "assets/images/ui/navigation/records.webp",
      title: "回顧與訂正",
      text: "回到大廳後打開「圖鑑／成就」，切到「題目複習」。查看答對率並重新回答錯題。",
      target: '.lobby-topright [data-action="records-hub"]'
    }
  ];

  function indexOf(id) {
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) return i;
    return 0;
  }

  var Tutorial = {
    app: null,
    root: null,
    _target: null,
    _moveDistance: 0,

    init: function (app) {
      this.app = app;
      this.root = document.getElementById("tutorial-coach");
      this.render();
    },

    startIfNeeded: function () {
      var queryForce = false;
      try { queryForce = new URLSearchParams(global.location.search).get("qaTutorial") === "1"; } catch (error) {}
      if (global.TestMode && global.TestMode.enabled && !queryForce) return;
      var state = global.Storage.getTutorial();
      if (state.completed || state.skipped) return;
      if (!state.active) global.Storage.startTutorial(false);
      this.render();
    },

    restart: function () {
      this._moveDistance = 0;
      global.Storage.startTutorial(true);
      if (this.app && this.app.enterLobby) this.app.enterLobby();
      this.render();
      if (global.UI) global.UI.showToast("新手教學已重新開始", "請先在大廳走動一小段距離。");
    },

    skip: function () {
      global.Storage.finishTutorial(true);
      this.clearTarget();
      this.render();
      if (global.UI) global.UI.showToast("已略過新手教學", "可隨時從遊戲說明重新開始。");
    },

    notify: function (eventName, detail) {
      var state = global.Storage && global.Storage.getTutorial ? global.Storage.getTutorial() : null;
      if (!state || !state.active || state.completed || state.skipped) return;
      var stepIndex = indexOf(state.stepId);
      var step = STEPS[stepIndex];
      if (step.id === "move" && eventName === "lobby-moved") {
        this._moveDistance += Math.max(0, Number(detail && detail.distance) || 0);
        if (this._moveDistance < 56) return;
      } else if (eventName !== step.event) {
        this.render();
        return;
      }

      var completed = Array.isArray(state.completedSteps) ? state.completedSteps.slice() : [];
      if (completed.indexOf(step.id) === -1) completed.push(step.id);
      if (stepIndex >= STEPS.length - 1) {
        global.Storage.finishTutorial(false);
        this.clearTarget();
        this.render();
        if (global.UI) global.UI.showToast("新手教學完成！", "自動回收、建造、行動與題目複習都已解鎖。");
        return;
      }
      global.Storage.setTutorialStep(STEPS[stepIndex + 1].id, completed);
      this.render();
    },

    onStateChange: function () { this.render(); },

    clearTarget: function () {
      if (this._target) this._target.classList.remove("tutorial-target");
      this._target = null;
    },

    render: function () {
      if (!this.root || !global.Storage || !global.Storage.data) return;
      var state = global.Storage.getTutorial();
      this.clearTarget();
      if (!state.active || state.completed || state.skipped) {
        this.root.classList.add("hidden");
        this.root.setAttribute("aria-hidden", "true");
        return;
      }
      var stepIndex = indexOf(state.stepId);
      var step = STEPS[stepIndex];
      var appState = this.app ? this.app.state : "";
      if (step.screen !== "ANY" && step.screen !== appState) {
        this.root.classList.add("hidden");
        this.root.setAttribute("aria-hidden", "true");
        return;
      }
      var title = this.root.querySelector("[data-tutorial-title]");
      var text = this.root.querySelector("[data-tutorial-text]");
      var progress = this.root.querySelector("[data-tutorial-progress]");
      var icon = this.root.querySelector("[data-tutorial-icon]");
      if (title) title.textContent = step.title;
      if (text) text.textContent = step.text;
      if (progress) progress.textContent = "教學 " + (stepIndex + 1) + " / " + STEPS.length;
      if (icon) {
        icon.innerHTML = "";
        var iconImage = document.createElement("img");
        iconImage.src = step.iconPath;
        iconImage.alt = "";
        iconImage.decoding = "async";
        icon.appendChild(iconImage);
      }
      this.root.classList.remove("hidden");
      this.root.setAttribute("aria-hidden", "false");

      var canHighlight = step.screen === "ANY" || step.screen === appState;
      if (canHighlight && step.target) {
        var candidate = document.querySelector(step.target);
        if (candidate && !candidate.closest(".hidden")) {
          candidate.classList.add("tutorial-target");
          this._target = candidate;
        }
      }
    },

    getSteps: function () { return STEPS.slice(); }
  };

  global.Tutorial = Tutorial;
})(window);
