/* ============================================================
   gameClock.js — 每日獎勵共用時間來源
   登入且連線時使用 Supabase 校時；離線／訪客模式使用本機時間。
   日期只允許往前，避免裝置時鐘倒退後重複領取同一天獎勵。
   ============================================================ */
(function (global) {
  "use strict";

  function now() {
    if (global.CloudSync && global.CloudSync.getTrustedNow) return global.CloudSync.getTrustedNow();
    return Date.now();
  }

  function rawDateKey(value) {
    var date = new Date(value == null ? now() : value);
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }

  function dateKey(previousKey, value) {
    var key = rawDateKey(value);
    return typeof previousKey === "string" && previousKey > key ? previousKey : key;
  }

  global.GameClock = Object.freeze({ now: now, dateKey: dateKey, rawDateKey: rawDateKey });
})(window);
