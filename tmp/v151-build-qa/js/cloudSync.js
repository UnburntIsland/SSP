/* ============================================================
   cloudSync.js — v1.3 帳號、Google OAuth 與跨裝置雲端存檔
   正式環境：Supabase Auth + PostgREST RPC；測試環境：隔離的模擬雲端。
   ============================================================ */
(function (global) {
  var SESSION_KEY = "senloop_cloud_session_v1";
  var SYNC_META_KEY = "senloop_cloud_sync_meta_v1";
  var MOCK_USERS_KEY = "senloop_mock_cloud_users_v1";
  var MOCK_SAVES_KEY = "senloop_mock_cloud_saves_v1";
  var AUTO_SYNC_DELAY = 5000;
  var MIN_SYNC_INTERVAL = 15000;

  function record(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { try { return JSON.parse(JSON.stringify(value)); } catch (error) { return null; } }
  function readJson(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) { return fallback; }
  }
  function writeJson(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { return false; }
  }
  function removeKey(key) { try { global.localStorage.removeItem(key); } catch (error) {} }
  function randomId() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return "device-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function redirectUrl() {
    var url = new URL(global.location.href);
    url.hash = "";
    ["error", "error_code", "error_description"].forEach(function (key) { url.searchParams.delete(key); });
    return url.toString();
  }
  function errorMessage(error, fallback) {
    if (!error) return fallback || "發生未知錯誤。";
    var message = error.message || error.error_description || error.msg || String(error);
    var lower = message.toLowerCase();
    if (lower.indexOf("invalid login") !== -1 || lower.indexOf("invalid credentials") !== -1) return "Email 或密碼不正確。";
    if (lower.indexOf("email not confirmed") !== -1) return "請先到信箱完成 Email 驗證。";
    if (lower.indexOf("already registered") !== -1 || lower.indexOf("already exists") !== -1) return "這個 Email 已經註冊。";
    if (lower.indexOf("password") !== -1 && lower.indexOf("least") !== -1) return "密碼至少需要 8 個字元。";
    if (lower.indexOf("fetch") !== -1 || lower.indexOf("network") !== -1 || lower.indexOf("offline") !== -1) return "目前無法連線，進度已保留在本機。";
    return message || fallback || "操作失敗，請稍後再試。";
  }
  function passwordValid(password) { return typeof password === "string" && password.length >= 8 && password.length <= 128; }
  function emailValid(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim()); }

  function SupabaseBackend(config) {
    this.url = String(config.url || "").replace(/\/+$/, "");
    this.key = String(config.publishableKey || "");
    this.timeout = Math.max(3000, Number(config.requestTimeoutMs) || 12000);
    this.session = null;
  }
  SupabaseBackend.prototype.configured = function () {
    return /^https:\/\/.+\.supabase\.co$/i.test(this.url) && this.key.length > 20;
  };
  SupabaseBackend.prototype.headers = function (token) {
    var headers = { "apikey": this.key, "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    return headers;
  };
  SupabaseBackend.prototype.request = async function (path, options) {
    options = options || {};
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = controller ? global.setTimeout(function () { controller.abort(); }, this.timeout) : 0;
    try {
      var headers = this.headers(options.token);
      Object.keys(options.headers || {}).forEach(function (key) { headers[key] = options.headers[key]; });
      var response = await global.fetch(this.url + path, {
        method: options.method || "GET",
        headers: headers,
        body: options.body == null ? undefined : JSON.stringify(options.body),
        signal: controller ? controller.signal : undefined
      });
      var text = await response.text();
      var data = text ? (function () { try { return JSON.parse(text); } catch (error) { return text; } })() : null;
      if (!response.ok) {
        var failure = record(data) ? data : { message: String(data || response.statusText) };
        failure.status = response.status;
        throw failure;
      }
      return data;
    } catch (error) {
      if (error && error.name === "AbortError") throw { message: "network timeout" };
      throw error;
    } finally {
      if (timer) global.clearTimeout(timer);
    }
  };
  SupabaseBackend.prototype.saveSession = function (session) {
    this.session = session;
    if (session) writeJson(SESSION_KEY, session); else removeKey(SESSION_KEY);
    return session;
  };
  SupabaseBackend.prototype.normalizeSession = function (data) {
    if (!data || !data.access_token) return null;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Number(data.expires_at) || Math.floor(Date.now() / 1000) + (Number(data.expires_in) || 3600),
      user: data.user || null,
      provider: data.provider || null
    };
  };
  SupabaseBackend.prototype.refresh = async function () {
    if (!this.session || !this.session.refresh_token) return null;
    var data = await this.request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST", body: { refresh_token: this.session.refresh_token }
    });
    return this.saveSession(this.normalizeSession(data));
  };
  SupabaseBackend.prototype.token = async function () {
    if (!this.session) return null;
    if ((this.session.expires_at || 0) * 1000 - Date.now() < 60000) await this.refresh();
    return this.session && this.session.access_token;
  };
  SupabaseBackend.prototype.getUser = async function () {
    var token = await this.token();
    if (!token) return null;
    var user = await this.request("/auth/v1/user", { token: token });
    if (this.session) { this.session.user = user; this.saveSession(this.session); }
    return user;
  };
  SupabaseBackend.prototype.serverTime = async function () {
    var token = await this.token();
    if (!token) return null;
    var value = await this.request("/rest/v1/rpc/get_game_server_time", { method: "POST", token: token, body: {} });
    var parsed = new Date(value).getTime();
    return isFinite(parsed) ? parsed : null;
  };
  SupabaseBackend.prototype.restoreSession = async function () {
    var hash = new URLSearchParams(String(global.location.hash || "").replace(/^#/, ""));
    if (hash.get("error") || hash.get("error_code")) {
      var oauthError = { message: hash.get("error_description") || hash.get("error") || "OAuth 登入失敗" };
      if (global.history && global.history.replaceState) global.history.replaceState(null, "", redirectUrl());
      throw oauthError;
    }
    if (hash.get("access_token")) {
      this.saveSession(this.normalizeSession({
        access_token: hash.get("access_token"), refresh_token: hash.get("refresh_token"),
        expires_in: hash.get("expires_in"), provider: hash.get("provider")
      }));
      await this.getUser();
      if (global.history && global.history.replaceState) global.history.replaceState(null, "", redirectUrl());
      return this.session;
    }
    this.session = readJson(SESSION_KEY, null);
    if (!this.session) return null;
    try { await this.getUser(); return this.session; }
    catch (error) {
      if (error && (error.status === 401 || error.status === 403)) this.saveSession(null);
      else throw error;
      return null;
    }
  };
  SupabaseBackend.prototype.signUp = async function (email, password) {
    var data = await this.request("/auth/v1/signup", {
      method: "POST", body: { email: email, password: password, data: { game: "senloop" } }
    });
    var session = this.normalizeSession(data);
    if (session) this.saveSession(session);
    return { session: session, user: data && data.user, confirmationRequired: !session && !!(data && data.user) };
  };
  SupabaseBackend.prototype.signIn = async function (email, password) {
    var data = await this.request("/auth/v1/token?grant_type=password", {
      method: "POST", body: { email: email, password: password }
    });
    var session = this.normalizeSession(data);
    this.saveSession(session);
    return session;
  };
  SupabaseBackend.prototype.google = async function (link) {
    if ((global.SENLOOP_CLOUD_CONFIG || {}).googleEnabled === false) throw { message: "Google 登入尚未啟用。" };
    if (global.location.protocol === "file:") throw { message: "Google 登入需要從已設定的 HTTPS 網址開啟遊戲。" };
    var target = this.url + "/auth/v1/authorize?provider=google&redirect_to=" + encodeURIComponent(redirectUrl());
    if (link) {
      var token = await this.token();
      var result = await this.request("/auth/v1/user/identities/authorize?provider=google&redirect_to=" + encodeURIComponent(redirectUrl()), { token: token });
      target = result && result.url;
    }
    if (!target) throw { message: "無法取得 Google 授權網址。" };
    global.location.assign(target);
    return null;
  };
  SupabaseBackend.prototype.signOut = async function () {
    var token = await this.token();
    if (token) {
      try { await this.request("/auth/v1/logout", { method: "POST", token: token, body: {} }); }
      catch (error) { if (!error || (error.status !== 401 && error.status !== 403)) throw error; }
    }
    this.saveSession(null);
  };
  SupabaseBackend.prototype.pullSave = async function () {
    var token = await this.token();
    var rows = await this.request("/rest/v1/game_saves?select=payload,revision,updated_at,client_id&limit=1", { token: token });
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  };
  SupabaseBackend.prototype.pushSave = async function (payload, baseRevision, clientId, force) {
    var token = await this.token();
    return await this.request("/rest/v1/rpc/sync_game_save", {
      method: "POST", token: token,
      body: { p_payload: payload, p_base_revision: baseRevision | 0, p_client_id: clientId, p_force: force === true }
    });
  };

  async function mockPassword(password) {
    if (global.crypto && global.crypto.subtle && global.TextEncoder) {
      var bytes = await global.crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
      return Array.from(new Uint8Array(bytes)).map(function (n) { return n.toString(16).padStart(2, "0"); }).join("");
    }
    var hash = 0;
    for (var i = 0; i < password.length; i++) hash = ((hash << 5) - hash + password.charCodeAt(i)) | 0;
    return "qa-" + Math.abs(hash);
  }
  function MockBackend() { this.session = null; }
  MockBackend.prototype.configured = function () { return true; };
  MockBackend.prototype.serverTime = async function () { return Date.now(); };
  MockBackend.prototype.restoreSession = async function () { this.session = readJson(SESSION_KEY, null); return this.session; };
  MockBackend.prototype.signUp = async function (email, password) {
    var users = readJson(MOCK_USERS_KEY, {});
    if (users[email]) throw { message: "already registered" };
    var user = { id: "qa-" + Math.abs(Array.from(email).reduce(function (n, c) { return ((n << 5) - n + c.charCodeAt(0)) | 0; }, 7)), email: email, identities: [{ provider: "email" }] };
    users[email] = { user: user, passwordHash: await mockPassword(password) };
    writeJson(MOCK_USERS_KEY, users);
    this.session = { access_token: "qa-access-" + user.id, refresh_token: "qa-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: user };
    writeJson(SESSION_KEY, this.session);
    return { session: this.session, user: user, confirmationRequired: false };
  };
  MockBackend.prototype.signIn = async function (email, password) {
    var entry = readJson(MOCK_USERS_KEY, {})[email];
    if (!entry || entry.passwordHash !== await mockPassword(password)) throw { message: "invalid login credentials" };
    this.session = { access_token: "qa-access-" + entry.user.id, refresh_token: "qa-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: entry.user };
    writeJson(SESSION_KEY, this.session);
    return this.session;
  };
  MockBackend.prototype.google = async function (link) {
    if (link && this.session) {
      this.session.user.identities = this.session.user.identities || [];
      if (!this.session.user.identities.some(function (identity) { return identity.provider === "google"; })) this.session.user.identities.push({ provider: "google" });
      var linkedUsers = readJson(MOCK_USERS_KEY, {});
      var linkedEmail = this.session.user.email;
      if (linkedEmail && linkedUsers[linkedEmail]) {
        linkedUsers[linkedEmail].user = clone(this.session.user);
        writeJson(MOCK_USERS_KEY, linkedUsers);
      }
      writeJson(SESSION_KEY, this.session);
      return this.session;
    }
    var email = "google.player@example.com";
    var users = readJson(MOCK_USERS_KEY, {});
    if (!users[email]) users[email] = { user: { id: "qa-google-player", email: email, identities: [{ provider: "google" }] }, passwordHash: null };
    writeJson(MOCK_USERS_KEY, users);
    this.session = { access_token: "qa-google-access", refresh_token: "qa-google-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: users[email].user };
    writeJson(SESSION_KEY, this.session);
    return this.session;
  };
  MockBackend.prototype.signOut = async function () { this.session = null; removeKey(SESSION_KEY); };
  MockBackend.prototype.pullSave = async function () {
    if (!this.session) throw { status: 401, message: "not signed in" };
    return clone(readJson(MOCK_SAVES_KEY, {})[this.session.user.id] || null);
  };
  MockBackend.prototype.pushSave = async function (payload, baseRevision, clientId, force) {
    if (!this.session) throw { status: 401, message: "not signed in" };
    var saves = readJson(MOCK_SAVES_KEY, {});
    var current = saves[this.session.user.id] || null;
    // 即使玩家已選「保留本機」，也只能覆蓋剛才比較過的 revision；
    // 若第三台裝置在對話框開啟後又寫入，必須重新顯示衝突。
    if (current && (baseRevision | 0) !== (current.revision | 0)) {
      return { status: "conflict", revision: current.revision, updated_at: current.updated_at, payload: clone(current.payload), client_id: current.client_id };
    }
    var revision = current ? current.revision + 1 : 1;
    var row = { status: "saved", revision: revision, updated_at: new Date().toISOString(), payload: clone(payload), client_id: clientId };
    saves[this.session.user.id] = row;
    writeJson(MOCK_SAVES_KEY, saves);
    return clone(row);
  };
  MockBackend.prototype.reset = function () { removeKey(MOCK_USERS_KEY); removeKey(MOCK_SAVES_KEY); removeKey(SESSION_KEY); };
  MockBackend.prototype.seed = function (payload, revision, userId) {
    var saves = readJson(MOCK_SAVES_KEY, {});
    saves[userId || (this.session && this.session.user.id)] = { status: "saved", revision: revision || 1, updated_at: new Date().toISOString(), payload: clone(payload), client_id: "qa-other-device" };
    writeJson(MOCK_SAVES_KEY, saves);
  };

  var CloudSync = {
    app: null,
    backend: null,
    configured: false,
    qa: false,
    status: "starting",
    message: "正在檢查帳號…",
    session: null,
    user: null,
    syncing: false,
    conflict: null,
    lastError: null,
    _timer: 0,
    _lastSyncAttempt: 0,
    _applyingRemote: false,
    _deviceId: null,
    _clockAnchor: null,

    init: function (app) {
      this.app = app;
      var params = new URLSearchParams(global.location.search);
      this.qa = !!(global.TestMode && global.TestMode.enabled && params.get("qaCloud") === "1");
      var config = global.SENLOOP_CLOUD_CONFIG || {};
      this.backend = this.qa ? new MockBackend() : new SupabaseBackend(config);
      this.configured = this.backend.configured();
      this._deviceId = readJson("senloop_device_v1", null) || randomId();
      writeJson("senloop_device_v1", this._deviceId);
      this.bind();
      if (!this.configured) {
        this.setState("unavailable", "尚未設定雲端服務；目前仍會安全保存在這台裝置。 ");
        return Promise.resolve(null);
      }
      return this.restore();
    },

    bind: function () {
      var self = this;
      global.addEventListener("game-save-changed", function (event) {
        if (self._applyingRemote || !self.user) return;
        var meta = self.meta();
        meta.pending = true;
        self.writeMeta(meta);
        self.emit();
        if (meta.autoSync) self.schedule();
      });
      global.addEventListener("online", function () { if (self.user) self.schedule(250); });
      global.addEventListener("offline", function () { if (self.user) self.setState("offline", "離線中；進度會在恢復連線後同步。 "); });
    },

    restore: async function () {
      try {
        this.session = await this.backend.restoreSession();
        this.user = this.session && this.session.user || null;
        if (!this.user) { this.setState("guest", "以訪客身分遊玩；進度只保存在這台裝置。 "); return null; }
        this.setState("ready", "帳號已登入，正在檢查雲端進度。 ");
        await this.syncNow({ initial: true });
        return this.session;
      } catch (error) {
        this.lastError = errorMessage(error);
        this.setState(global.navigator && global.navigator.onLine === false ? "offline" : "error", this.lastError);
        return null;
      }
    },

    setState: function (status, message) {
      this.status = status;
      if (message != null) this.message = message;
      this.emit();
    },

    emit: function () {
      try { global.dispatchEvent(new CustomEvent("cloud-state-changed", { detail: this.getState() })); } catch (error) {}
      if (global.UI && global.UI.updateCloudBadge) global.UI.updateCloudBadge(this.getState());
      if (global.UI && global.UI.renderAccount && this.app && this.app.state === "ACCOUNT") global.UI.renderAccount(this.getState());
    },

    getState: function () {
      var meta = this.meta();
      return {
        configured: this.configured,
        qa: this.qa,
        status: this.status,
        message: this.message,
        syncing: this.syncing,
        user: this.user ? clone(this.user) : null,
        signedIn: !!this.user,
        autoSync: meta.autoSync,
        pending: meta.pending,
        lastSyncedAt: meta.lastSyncedAt,
        trustedTime: !!this._clockAnchor,
        baseRevision: meta.baseRevision,
        deviceId: this._deviceId,
        conflict: this.conflict ? {
          local: global.Storage.describeSave(global.Storage.data),
          cloud: global.Storage.describeSave(this.conflict.payload),
          revision: this.conflict.revision
        } : null
      };
    },

    meta: function () {
      var root = readJson(SYNC_META_KEY, {});
      var key = this.user && this.user.id || "guest";
      var value = record(root[key]) ? root[key] : {};
      return {
        baseRevision: Math.max(0, value.baseRevision | 0),
        lastSyncedLocalRevision: Math.max(0, value.lastSyncedLocalRevision | 0),
        lastSyncedAt: Number(value.lastSyncedAt) || null,
        autoSync: Object.prototype.hasOwnProperty.call(value, "autoSync")
          ? value.autoSync !== false
          : (global.SENLOOP_CLOUD_CONFIG || {}).autoSync !== false,
        pending: value.pending === true
      };
    },

    writeMeta: function (value) {
      var root = readJson(SYNC_META_KEY, {});
      var key = this.user && this.user.id || "guest";
      root[key] = value;
      writeJson(SYNC_META_KEY, root);
    },

    validateCredentials: function (email, password) {
      email = String(email || "").trim().toLowerCase();
      if (!emailValid(email)) throw { message: "請輸入有效的 Email。" };
      if (!passwordValid(password)) throw { message: "密碼需要 8～128 個字元。" };
      return { email: email, password: password };
    },

    signUp: async function (email, password) {
      if (!this.configured) return this.fail({ message: "尚未設定雲端服務。" });
      try {
        var credentials = this.validateCredentials(email, password);
        this.setState("authenticating", "正在建立帳號…");
        var result = await this.backend.signUp(credentials.email, credentials.password);
        if (result.confirmationRequired) {
          this.setState("guest", "註冊完成，請到信箱點擊驗證連結後再登入。 ");
          return result;
        }
        this.session = result.session;
        this.user = result.user || this.session && this.session.user;
        await this.syncNow({ initial: true });
        return result;
      } catch (error) { return this.fail(error); }
    },

    signIn: async function (email, password) {
      if (!this.configured) return this.fail({ message: "尚未設定雲端服務。" });
      try {
        var credentials = this.validateCredentials(email, password);
        this.setState("authenticating", "正在登入…");
        this.session = await this.backend.signIn(credentials.email, credentials.password);
        this.user = this.session && this.session.user;
        await this.syncNow({ initial: true });
        return this.session;
      } catch (error) { return this.fail(error); }
    },

    google: async function (link) {
      if (!this.configured) return this.fail({ message: "尚未設定雲端服務。" });
      if ((global.SENLOOP_CLOUD_CONFIG || {}).googleEnabled === false) return this.fail({ message: "Google 登入尚未啟用。" });
      try {
        this.setState("authenticating", link ? "正在連結 Google 帳號…" : "正在前往 Google 登入…");
        var session = await this.backend.google(link === true);
        if (session) {
          this.session = session;
          this.user = session.user;
          if (!link) await this.syncNow({ initial: true });
          else this.setState("ready", "Google 帳號已連結。 ");
        }
        return session;
      } catch (error) { return this.fail(error); }
    },

    signOut: async function () {
      try { await this.backend.signOut(); }
      catch (error) { this.lastError = errorMessage(error); }
      this.session = null;
      this.user = null;
      this._clockAnchor = null;
      this.conflict = null;
      if (this._timer) global.clearTimeout(this._timer);
      this.setState("guest", "已登出；本機存檔仍然保留。 ");
      return true;
    },

    fail: function (error) {
      this.lastError = errorMessage(error);
      this.setState(global.navigator && global.navigator.onLine === false ? "offline" : "error", this.lastError);
      return null;
    },

    schedule: function (delay) {
      if (!this.user || this.conflict || !this.meta().autoSync) return;
      if (this._timer) global.clearTimeout(this._timer);
      var self = this;
      this._timer = global.setTimeout(function () {
        self._timer = 0;
        var since = Date.now() - self._lastSyncAttempt;
        if (since < MIN_SYNC_INTERVAL) return self.schedule(MIN_SYNC_INTERVAL - since);
        self.syncNow();
      }, delay == null ? AUTO_SYNC_DELAY : Math.max(0, delay));
    },

    toggleAutoSync: function () {
      var meta = this.meta();
      meta.autoSync = !meta.autoSync;
      this.writeMeta(meta);
      this.emit();
      if (meta.autoSync && meta.pending) this.schedule(100);
      return meta.autoSync;
    },

    syncNow: async function (options) {
      options = options || {};
      if (!this.user || this.syncing || !this.configured) return null;
      if (global.navigator && global.navigator.onLine === false && !this.qa) {
        this.setState("offline", "離線中；進度會在恢復連線後同步。 ");
        return null;
      }
      this.syncing = true;
      this._lastSyncAttempt = Date.now();
      this.setState("syncing", "正在同步雲端存檔…");
      try {
        await this.refreshTrustedTime();
        var remote = await this.backend.pullSave();
        var meta = this.meta();
        var localRevision = global.Storage.data && global.Storage.data.saveMeta ? global.Storage.data.saveMeta.revision | 0 : 0;
        if (!remote) return await this.pushLocal(0, false);
        var remoteRevision = remote.revision | 0;
        var localDirty = meta.pending || localRevision !== meta.lastSyncedLocalRevision;
        var remoteChanged = meta.baseRevision > 0 && remoteRevision !== meta.baseRevision;

        if (options.initial && meta.baseRevision === 0) {
          if (!global.Storage.hasMeaningfulProgress()) return this.applyRemote(remote);
          this.conflict = remote;
          this.setState("conflict", "這台裝置與雲端都有進度，請選擇要保留哪一份。 ");
          return { status: "conflict" };
        }
        if (remoteChanged && localDirty) {
          this.conflict = remote;
          this.setState("conflict", "另一台裝置也有新進度，請選擇要保留哪一份。 ");
          return { status: "conflict" };
        }
        if (remoteChanged && !localDirty) return this.applyRemote(remote);
        if (localDirty) return await this.pushLocal(remoteRevision, false);
        meta.baseRevision = remoteRevision;
        meta.lastSyncedAt = Date.now();
        meta.pending = false;
        this.writeMeta(meta);
        this.setState("synced", "雲端進度已是最新。 ");
        return { status: "unchanged", revision: remoteRevision };
      } catch (error) {
        return this.fail(error);
      } finally {
        this.syncing = false;
        this.emit();
      }
    },

    pushLocal: async function (baseRevision, force) {
      var payload = global.Storage.exportCloudData();
      if (!payload) throw { message: "無法讀取本機存檔。" };
      var result = await this.backend.pushSave(payload, baseRevision, this._deviceId, force === true);
      if (result && result.status === "conflict") {
        this.conflict = result;
        this.setState("conflict", "雲端已有較新的進度，請選擇要保留哪一份。 ");
        return result;
      }
      var meta = this.meta();
      meta.baseRevision = result.revision | 0;
      meta.lastSyncedLocalRevision = payload.saveMeta && payload.saveMeta.revision | 0;
      meta.lastSyncedAt = Date.now();
      meta.pending = false;
      this.writeMeta(meta);
      this.conflict = null;
      this.setState("synced", "已安全同步到雲端。 ");
      return result;
    },

    applyRemote: function (remote) {
      var result;
      this._applyingRemote = true;
      try { result = global.Storage.replaceFromCloud(remote && remote.payload); }
      finally { this._applyingRemote = false; }
      if (!result || !result.ok) throw { message: "雲端存檔格式不相容，已保留本機進度。" };
      var meta = this.meta();
      meta.baseRevision = remote.revision | 0;
      meta.lastSyncedLocalRevision = global.Storage.data.saveMeta.revision | 0;
      meta.lastSyncedAt = Date.now();
      meta.pending = false;
      this.writeMeta(meta);
      this.conflict = null;
      this.setState("synced", "已套用雲端進度。 ");
      if (this.app && this.app.reloadFromCloudSave) this.app.reloadFromCloudSave();
      return { status: "downloaded", revision: remote.revision };
    },

    resolveConflict: async function (choice) {
      if (!this.conflict) return null;
      var remote = this.conflict;
      if (choice === "cloud") return this.applyRemote(remote);
      if (choice === "local") {
        this.syncing = true;
        this.setState("syncing", "正在以這台裝置的進度更新雲端…");
        try { return await this.pushLocal(remote.revision | 0, true); }
        catch (error) { return this.fail(error); }
        finally { this.syncing = false; this.emit(); }
      }
      this.setState("conflict", "尚未選擇版本；自動同步已暫停。 ");
      return null;
    },

    rest: async function (path, options) {
      options = options || {};
      if (!this.configured || !this.user || this.qa || !this.backend || !this.backend.request) {
        throw { message: "目前無法使用正式雲端資料服務。" };
      }
      var token = await this.backend.token();
      return await this.backend.request("/rest/v1/" + String(path || "").replace(/^\/+/, ""), {
        method: options.method || "GET",
        token: token,
        body: options.body,
        headers: options.headers || {}
      });
    },

    refreshTrustedTime: async function () {
      if (!this.user || !this.backend || !this.backend.serverTime) return null;
      try {
        var serverNow = await this.backend.serverTime();
        if (!isFinite(serverNow)) return null;
        this._clockAnchor = {
          serverNow: Number(serverNow),
          monotonicAt: global.performance && global.performance.now ? global.performance.now() : 0,
          verifiedAt: Date.now()
        };
        return this._clockAnchor.serverNow;
      } catch (error) {
        // 舊資料庫尚未套用 v1.5.1 migration 時仍可同步存檔，只退回本機時間。
        return null;
      }
    },

    getTrustedNow: function () {
      if (!this._clockAnchor) return Date.now();
      var current = global.performance && global.performance.now ? global.performance.now() : this._clockAnchor.monotonicAt;
      return this._clockAnchor.serverNow + Math.max(0, current - this._clockAnchor.monotonicAt);
    },

    __qaResetCloud: function () {
      if (this.backend && this.backend.reset) this.backend.reset();
      removeKey(SYNC_META_KEY);
      this.session = null;
      this.user = null;
      this._clockAnchor = null;
      this.conflict = null;
      this.setState(this.configured ? "guest" : "unavailable", this.configured ? "測試雲端已重置。" : "尚未設定雲端服務。");
    },
    __qaSeedRemote: function (payload, revision) { if (this.backend && this.backend.seed) this.backend.seed(payload, revision); },
    __qaSetTrustedTime: function (value) {
      if (!(global.TestMode && global.TestMode.enabled)) return false;
      this._clockAnchor = { serverNow: Number(value), monotonicAt: global.performance && global.performance.now ? global.performance.now() : 0, verifiedAt: Date.now() };
      return isFinite(this._clockAnchor.serverNow);
    }
  };

  global.CloudSync = CloudSync;
})(window);
