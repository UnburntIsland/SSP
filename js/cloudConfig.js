/* ============================================================
   v1.3 雲端設定
   只可填 Supabase Project URL 與 publishable / anon key。
   絕對不要把 service_role、secret key 或 Google client secret 放在前端。
   ============================================================ */
(function (global) {
  global.SENLOOP_CLOUD_CONFIG = Object.freeze({
    url: "",
    publishableKey: "",
    googleEnabled: true,
    autoSync: true,
    requestTimeoutMs: 12000
  });
})(window);
