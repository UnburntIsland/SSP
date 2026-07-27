# Audio Assets

These WAV files are original chiptune-style game audio generated for this project.

## Music

- `bgm_lobby.wav`: lobby loop
- `bgm_stage.wav`: battle loop

## Sound Effects

- `ui_click.wav`: buttons and selectable UI
- `pickup.wav`: experience, currency, and map-object pickups
- `levelup.wav`: level-up prompt
- `purify.wav`: enemy purification
- `hurt.wav`: player damage
- `quiz_correct.wav`: correct quiz answer
- `quiz_wrong.wav`: incorrect quiz answer
- `boss_intro.wav`: boss introduction
- `victory.wav`: stage victory

The files can be regenerated with:

```powershell
node tools/generate_audio_assets.mjs
```

Runtime paths are registered in `js/audioManager.js`. Browser autoplay is
unlocked on the first pointer or keyboard interaction.
