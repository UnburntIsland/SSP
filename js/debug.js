/* ============================================================
   debug.js
   URL flags:
     ?debugUI=1         DOM/CSS layout guides and mouse/canvas readout
     ?debugAnimation=1  animation state readout and asset audit
   ============================================================ */
(function (global) {
  var params = new URLSearchParams(global.location.search);
  var enabled = params.get("debugUI") === "1";
  var animationEnabled = params.get("debugAnimation") === "1";
  var readout = null;
  var animationRecords = [];
  var lastMouseMove = 0;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function recordAnimation(info) {
    if (!animationEnabled || !info) return;
    var item = {
      entityType: info.entityType || "Entity",
      entityId: info.entityId || "-",
      action: info.action || "-",
      direction: info.direction || "-",
      frameIndex: info.frameIndex || 0,
      frameName: info.frameName || "-",
      requestedKey: info.requestedKey || info.spriteKey || "-",
      resolvedKey: info.resolvedKey || "",
      spriteKey: info.spriteKey || "-",
      hasSprite: !!info.hasSprite,
      fallback: !!info.fallback,
      fallbackType: info.fallbackType || (info.fallback ? "fallback" : "exact"),
      fallbackKey: info.fallbackKey || "",
      approvedWalk: !!info.approvedWalk,
      flipX: !!info.flipX,
      inputVx: info.inputVx || 0,
      inputVy: info.inputVy || 0,
      t: global.performance ? global.performance.now() : Date.now()
    };
    animationRecords.unshift(item);
    if (animationRecords.length > 32) animationRecords.length = 32;
  }

  function getAnimationRecords() {
    return animationRecords.slice(0, 24);
  }

  function runAnimationAudit() {
    if (!animationEnabled || !global.Animation || !global.Animation.auditAnimations) return null;
    return global.Animation.auditAnimations();
  }

  var Debug = {
    enabled: enabled,
    animationEnabled: animationEnabled,
    recordAnimation: recordAnimation,
    getAnimationRecords: getAnimationRecords,
    auditAnimations: runAnimationAudit,
    update: update
  };
  global.Debug = Debug;

  if (!enabled && !animationEnabled) return;

  function init() {
    if (document.body) {
      if (enabled) document.body.classList.add("debug-ui");
      if (animationEnabled) document.body.classList.add("debug-animation");
    }

    readout = document.createElement("div");
    readout.id = "debug-readout";
    var root = document.getElementById("game-root") || document.body;
    root.appendChild(readout);

    global.addEventListener("mousemove", function () {
      lastMouseMove = global.performance ? global.performance.now() : Date.now();
      update();
    }, { passive: true });
    global.addEventListener("resize", update);
    global.setInterval(update, 200);
    global.setTimeout(runAnimationAudit, 800);
    update();
  }

  function formatRecords() {
    if (!animationEnabled) return "";
    var rows = getAnimationRecords().map(function (r) {
      var status = r.fallback ? "fallback" : "sprite";
      var vx = Number(r.inputVx || 0).toFixed(2);
      var vy = Number(r.inputVy || 0).toFixed(2);
      return escapeHtml(
        r.entityType + " " + r.action + "_" + r.direction +
        " f" + r.frameIndex + " " + status +
        " type=" + r.fallbackType +
        " vx=" + vx + " vy=" + vy + " flipX=" + r.flipX +
        (r.entityType === "Enemy" ? " approvedMove=" : " approvedWalk=") + r.approvedWalk
      ) +
        '<br><span class="debug-muted">' +
        escapeHtml("requested=" + r.requestedKey + " | resolved=" + (r.resolvedKey || "-") + (r.fallbackKey ? " | fallbackKey=" + r.fallbackKey : "")) +
        "</span>";
    });
    if (!rows.length) rows.push("waiting for animation draws...");
    return "<br><b>debugAnimation</b><br>" + rows.join("<br>");
  }

  function update() {
    if (!readout) return;
    var canvas = document.getElementById("game-canvas");
    if (!canvas) return;
    var r = canvas.getBoundingClientRect();
    var m = (global.Input && global.Input.getMouse) ? global.Input.getMouse() : { x: 0, y: 0, inside: false };
    var st = (global.App && global.App.state) ? global.App.state : "-";
    var scale = r.width ? (r.width / canvas.width) : 0;
    var playerAnim = (global.Game && global.Game.player && global.Animation)
      ? global.Animation.getAnimationState(global.Game.player)
      : "-";
    var lastMoveAge = lastMouseMove ? Math.round(((global.performance ? global.performance.now() : Date.now()) - lastMouseMove)) : "-";

    readout.innerHTML =
      "<b>" + (enabled ? "debugUI" : "debug") + "</b> state: " + escapeHtml(st) + "<br>" +
      "canvas CSS: " + Math.round(r.width) + " x " + Math.round(r.height) + " (scale " + scale.toFixed(2) + ")<br>" +
      "internal: " + canvas.width + " x " + canvas.height + " (16:9)<br>" +
      "camera zoom: " + escapeHtml((global.Config && global.Config.CAMERA_ZOOM) || 1) + "<br>" +
      "devicePixelRatio: " + (global.devicePixelRatio || 1).toFixed(2) + "<br>" +
      "mouse(internal): " + Math.round(m.x) + ", " + Math.round(m.y) + (m.inside ? "" : " (outside)") + "<br>" +
      "mouse age: " + escapeHtml(lastMoveAge) + "ms<br>" +
      "player anim: " + escapeHtml(playerAnim) +
      formatRecords();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
