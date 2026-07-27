# UX Regression QA

Date: 2026-07-26

## Scope

- Repeat-clear stage unlock messaging
- Victory result layout at 1280 x 720
- Keyboard event capture boundaries
- First-run lobby onboarding and persistent objective
- Phone and tablet onboarding layout

## Results

### Repeat clear

Pass.

- First clear of `tidal_flat` returned `recycle_works` as the newly unlocked stage.
- A second clear returned no newly unlocked stage.
- The repeat-clear result text is `再次完成本區淨化，既有關卡進度維持不變。`
- No `新關卡解鎖` row is rendered on the repeat-clear result.

Evidence:

- `screenshots/victory-result-1280x720-fixed.png`
- `screenshots/repeat-clear-no-new-unlock.png`

### Victory result layout

Pass at 1280 x 720 with the boss material reward and new-stage reward visible together.

- The victory title remains visible.
- The result body owns the overflow and can scroll independently.
- The footer remains outside the scrolling result body.
- The `回到主畫面` button remains fully visible.

### Keyboard capture

Pass.

Direct event-boundary checks produced the following results:

| State | Target | Key | preventDefault |
| --- | --- | --- | --- |
| SETTINGS | normal page target | ArrowRight | false |
| PLAYING | game target | ArrowRight | true |
| PLAYING | input/button target | ArrowRight | false |
| PLAYING | scrollable target | ArrowRight | false |
| LOBBY | game target | Space | false |
| PLAYING | game target | Space | true |
| PLAYING | input/button target | Space | false |

Movement tracking remained active during `PLAYING`: `ArrowRight` produced `{ x: 1, y: 0 }`.

### Lobby onboarding

Pass.

- The three-step guide explains lobby movement, portal entry and automatic attacks, and idle materials/building.
- Completing the guide persists `guideCompleted`.
- Reloading after completion does not reopen the guide.
- The persistent `目前任務` banner remains visible after the guide is complete.
- The full help screen contains the same essential instructions for later reference.

Evidence:

- `screenshots/lobby-first-run-guide-desktop.png`
- `screenshots/lobby-first-run-guide-mobile.png`
- `screenshots/lobby-first-run-guide-tablet.png`

### Responsive layout

Pass.

- Desktop: 1280 x 720
- Phone landscape: 844 x 390 with mobile mode enabled
- Tablet landscape: 1024 x 768 with mobile mode enabled

The guide title, text, progress marker, visual, and action button remain visible without overlap or clipping.

## Static checks

`js/storage.js`, `js/input.js`, `js/main.js`, `js/ui.js`, and `js/lobby.js` passed syntax parsing through Node's `vm.Script`.

The sandboxed `node --check` executable could not resolve the parent user directory and returned `EPERM`; this was an environment restriction rather than a JavaScript parse error.
