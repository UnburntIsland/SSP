/* ============================================================
   audioManager.js  —  音量設定與播放（master / music / sfx / mute）
   - 設定值來自 storage.js（localStorage），重整後保留。
   - 音量範圍 0～100，data-driven：音效/音樂清單集中在 SFX / MUSIC。
   - 目前若尚無音檔，playSfx/playMusic 會安靜地略過，不會報錯（之後放檔即生效）。
   ============================================================ */
(function (global) {

  // 預設值（與 storage 的預設一致）
  var DEFAULTS = { master: 80, music: 70, sfx: 80, mute: false };

  // 音效清單（之後把檔案放到這些路徑即可自動接上）
  var SFX = {
    click:   "assets/audio/ui_click.wav",
    pickup:  "assets/audio/pickup.wav",
    levelup: "assets/audio/levelup.wav",
    purify:  "assets/audio/purify.wav"
  };
  // 背景音樂清單
  var MUSIC = {
    stage: "assets/audio/bgm_stage.mp3"
  };

  function clamp100(v) { v = Math.round(+v || 0); return v < 0 ? 0 : (v > 100 ? 100 : v); }

  var AudioManager = {
    settings: null,
    sfxList: SFX,
    musicList: MUSIC,
    _cache: {},
    _music: null,
    _musicKey: null,
    _canAudio: (typeof Audio !== "undefined"),

    init: function () { this.settings = this._read(); return this.settings; },

    _read: function () {
      var s = (global.Storage && global.Storage.data && global.Storage.getAudioSettings)
        ? global.Storage.getAudioSettings() : null;
      var out = {};
      for (var k in DEFAULTS) out[k] = (s && s[k] != null) ? s[k] : DEFAULTS[k];
      out.master = clamp100(out.master);
      out.music = clamp100(out.music);
      out.sfx = clamp100(out.sfx);
      out.mute = !!out.mute;
      return out;
    },

    getSettings: function () { return this.settings || (this.settings = this._read()); },

    _persist: function () {
      if (global.Storage && global.Storage.setAudioSettings) {
        global.Storage.setAudioSettings(this.getSettings());
      }
    },

    /* -------- 有效增益（0~1），已套用靜音與主音量 -------- */
    masterGain: function () { var s = this.getSettings(); return s.mute ? 0 : s.master / 100; },
    musicGain: function () { var s = this.getSettings(); return s.mute ? 0 : (s.master / 100) * (s.music / 100); },
    sfxGain: function () { var s = this.getSettings(); return s.mute ? 0 : (s.master / 100) * (s.sfx / 100); },

    /* -------- 設定（會持久化並即時套用到正在播放的音樂） -------- */
    setMaster: function (v) { this.getSettings().master = clamp100(v); this._persist(); this._applyMusicVol(); },
    setMusic: function (v) { this.getSettings().music = clamp100(v); this._persist(); this._applyMusicVol(); },
    setSfx: function (v) { this.getSettings().sfx = clamp100(v); this._persist(); },
    setMute: function (b) { this.getSettings().mute = !!b; this._persist(); this._applyMusicVol(); },
    toggleMute: function () { this.setMute(!this.getSettings().mute); return this.getSettings().mute; },
    isMuted: function () { return !!this.getSettings().mute; },

    /* -------- 播放（缺檔時安靜略過） -------- */
    playSfx: function (name) {
      if (!this._canAudio) return;
      var path = SFX[name]; if (!path) return;
      var g = this.sfxGain(); if (g <= 0) return;
      try {
        var base = this._cache[name];
        if (!base) { base = new Audio(path); base.preload = "auto"; this._cache[name] = base; }
        var node = (base.cloneNode) ? base.cloneNode(true) : new Audio(path);
        node.volume = g;
        var pr = node.play(); if (pr && pr.catch) pr.catch(function () {});
      } catch (e) { /* 缺檔或瀏覽器限制 → 靜默 */ }
    },

    playMusic: function (key) {
      if (!this._canAudio) return;
      key = key || "stage";
      var path = MUSIC[key]; if (!path) return;
      try {
        if (this._musicKey !== key || !this._music) {
          this.stopMusic();
          this._music = new Audio(path);
          this._music.loop = true;
          this._musicKey = key;
        }
        this._applyMusicVol();
        var pr = this._music.play(); if (pr && pr.catch) pr.catch(function () {});
      } catch (e) { /* 靜默 */ }
    },

    stopMusic: function () {
      try { if (this._music) this._music.pause(); } catch (e) {}
      this._music = null; this._musicKey = null;
    },

    _applyMusicVol: function () { try { if (this._music) this._music.volume = this.musicGain(); } catch (e) {} }
  };

  AudioManager.init();
  global.AudioManager = AudioManager;
})(window);
