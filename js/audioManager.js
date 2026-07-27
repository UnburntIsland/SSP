/* Central audio playback for lobby music, battle music, and event SFX. */
(function (global) {
  "use strict";

  var DEFAULTS = { master: 80, music: 70, sfx: 80, mute: false };

  var SFX = {
    click: "assets/audio/ui_click.wav",
    pickup: "assets/audio/pickup.wav",
    levelup: "assets/audio/levelup.wav",
    purify: "assets/audio/purify.wav",
    hurt: "assets/audio/hurt.wav",
    quiz_correct: "assets/audio/quiz_correct.wav",
    quiz_wrong: "assets/audio/quiz_wrong.wav",
    boss_intro: "assets/audio/boss_intro.wav",
    victory: "assets/audio/victory.wav"
  };

  var SFX_COOLDOWN = {
    click: 30,
    pickup: 55,
    purify: 90,
    hurt: 100
  };

  var MUSIC = {
    lobby: "assets/audio/bgm_lobby.wav",
    stage: "assets/audio/bgm_stage.wav"
  };

  function clamp100(value) {
    value = Math.round(+value || 0);
    return value < 0 ? 0 : (value > 100 ? 100 : value);
  }

  var AudioManager = {
    settings: null,
    sfxList: SFX,
    musicList: MUSIC,
    _cache: {},
    _lastSfxAt: {},
    _music: null,
    _musicKey: null,
    _gestureUnlockInstalled: false,
    _canAudio: typeof Audio !== "undefined",

    init: function () {
      this.settings = this._read();
      this._installGestureUnlock();
      return this.settings;
    },

    _installGestureUnlock: function () {
      if (!this._canAudio || this._gestureUnlockInstalled || !global.addEventListener) return;
      this._gestureUnlockInstalled = true;
      var self = this;
      var unlock = function () {
        self._resumeMusic();
      };
      global.addEventListener("pointerdown", unlock, { passive: true });
      global.addEventListener("keydown", unlock);
    },

    _resumeMusic: function () {
      if (!this._music || !this._music.paused || this.musicGain() <= 0) return;
      try {
        var playResult = this._music.play();
        if (playResult && playResult.catch) playResult.catch(function () {});
      } catch (error) {}
    },

    _read: function () {
      var stored = global.Storage && global.Storage.data && global.Storage.getAudioSettings
        ? global.Storage.getAudioSettings()
        : null;
      var output = {};
      for (var key in DEFAULTS) {
        output[key] = stored && stored[key] != null ? stored[key] : DEFAULTS[key];
      }
      output.master = clamp100(output.master);
      output.music = clamp100(output.music);
      output.sfx = clamp100(output.sfx);
      output.mute = !!output.mute;
      return output;
    },

    getSettings: function () {
      return this.settings || (this.settings = this._read());
    },

    _persist: function () {
      if (global.Storage && global.Storage.setAudioSettings) {
        global.Storage.setAudioSettings(this.getSettings());
      }
    },

    masterGain: function () {
      var settings = this.getSettings();
      return settings.mute ? 0 : settings.master / 100;
    },

    musicGain: function () {
      var settings = this.getSettings();
      return settings.mute ? 0 : (settings.master / 100) * (settings.music / 100);
    },

    sfxGain: function () {
      var settings = this.getSettings();
      return settings.mute ? 0 : (settings.master / 100) * (settings.sfx / 100);
    },

    setMaster: function (value) {
      this.getSettings().master = clamp100(value);
      this._persist();
      this._applyMusicVol();
    },

    setMusic: function (value) {
      this.getSettings().music = clamp100(value);
      this._persist();
      this._applyMusicVol();
    },

    setSfx: function (value) {
      this.getSettings().sfx = clamp100(value);
      this._persist();
    },

    setMute: function (muted) {
      this.getSettings().mute = !!muted;
      this._persist();
      this._applyMusicVol();
    },

    toggleMute: function () {
      this.setMute(!this.getSettings().mute);
      return this.getSettings().mute;
    },

    isMuted: function () {
      return !!this.getSettings().mute;
    },

    playSfx: function (name) {
      if (!this._canAudio) return;
      this._resumeMusic();
      var path = SFX[name];
      var gain = this.sfxGain();
      if (!path || gain <= 0) return;

      var now = Date.now();
      var cooldown = SFX_COOLDOWN[name] || 0;
      if (cooldown && now - (this._lastSfxAt[name] || 0) < cooldown) return;
      this._lastSfxAt[name] = now;

      try {
        var base = this._cache[name];
        if (!base) {
          base = new Audio(path);
          base.preload = "auto";
          this._cache[name] = base;
        }
        var node = base.cloneNode ? base.cloneNode(true) : new Audio(path);
        node.volume = gain;
        var playResult = node.play();
        if (playResult && playResult.catch) playResult.catch(function () {});
      } catch (error) {}
    },

    playMusic: function (key) {
      if (!this._canAudio) return;
      key = key || "stage";
      var path = MUSIC[key];
      if (!path) return;

      try {
        if (this._musicKey !== key || !this._music) {
          this.stopMusic();
          this._music = new Audio(path);
          this._music.preload = "auto";
          this._music.loop = true;
          this._musicKey = key;
        }
        this._applyMusicVol();
        var playResult = this._music.play();
        if (playResult && playResult.catch) playResult.catch(function () {});
      } catch (error) {}
    },

    stopMusic: function () {
      try {
        if (this._music) this._music.pause();
      } catch (error) {}
      this._music = null;
      this._musicKey = null;
    },

    _applyMusicVol: function () {
      try {
        if (this._music) this._music.volume = this.musicGain();
      } catch (error) {}
    }
  };

  AudioManager.init();
  global.AudioManager = AudioManager;
})(window);
