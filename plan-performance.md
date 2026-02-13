# Performance and Memory Leak Review Plan

## Findings

### 1) High: Event listener accumulation in Spells panel
- File refs:
`scripts/panel-spells.js:252`
`scripts/panel-spells.js:277`
`scripts/panel-spells.js:288`
`scripts/panel-spells.js:301`
`scripts/panel-spells.js:316`
`scripts/panel-spells.js:329`
`scripts/panel-spells.js:344`
`scripts/panel-spells.js:368`
- Issue:
`_removeEventListeners()` is a no-op, but `_activateListeners()` adds multiple delegated `click` handlers on each render.
- Impact:
Duplicate actions, growing memory retention, and degraded UI performance over time.

### 2) High: Event listener accumulation in Features panel
- File refs:
`scripts/panel-features.js:180`
`scripts/panel-features.js:205`
`scripts/panel-features.js:216`
`scripts/panel-features.js:239`
`scripts/panel-features.js:252`
- Issue:
Same pattern as Spells: listeners are repeatedly attached without teardown.
- Impact:
Duplicate behavior and increasing handler overhead.

### 3) High: Event listener accumulation in Favorites panel
- File refs:
`scripts/panel-favorites.js:554`
`scripts/panel-favorites.js:757`
`scripts/panel-favorites.js:781`
`scripts/panel-favorites.js:816`
`scripts/panel-favorites.js:864`
`scripts/panel-favorites.js:897`
- Issue:
Panel-level delegated handlers are reattached every render and not removed.
- Impact:
Repeated callbacks and memory/perf degradation as rerenders accumulate.

### 4) High: Quest panel destroy misses cleanup for active listeners
- File refs:
`scripts/panel-quest.js:604`
`scripts/panel-quest.js:1529`
`scripts/panel-quest.js:1704`
`scripts/panel-quest.js:1719`
`scripts/panel-quest.js:2004`
- Issue:
`destroy()` does not call `_clearQuestPinPlacement()` and does not abort `_questListenersAbort`.
- Impact:
If panel switches while pin placement/listeners are active, window/canvas listeners can remain attached.

### 5) Medium: Duplicate periodic cleanup intervals
- File refs:
`scripts/manager-panel.js:178`
`scripts/manager-panel.js:187`
`scripts/manager-panel.js:2188`
`scripts/manager-panel.js:2195`
- Issue:
A 30s cleanup interval is created in `initialize()` and a second 60s global cleanup interval is created at module load.
- Impact:
Redundant wakeups and overlapping cleanup work.

### 6) Medium: Quest pin sync hooks registered without teardown path
- File refs:
`scripts/quest-pin-events.js:348`
`scripts/quest-pin-events.js:349`
`scripts/quest-pin-events.js:350`
`scripts/quest-pin-events.js:351`
`scripts/quest-pin-events.js:352`
`scripts/quest-pin-events.js:353`
`scripts/quest-pin-events.js:354`
`scripts/quest-pin-events.js:358`
- Issue:
`registerQuestPinSync()` installs multiple `Hooks.on(...)` handlers; `unregisterQuestPinEvents()` does not remove these sync hooks.
- Impact:
Stale listeners can persist across teardown/reinit flows.

### 7) Medium: Notes form tracks handlers but never clears them
- File refs:
`scripts/window-note.js:65`
`scripts/window-note.js:1048`
`scripts/window-note.js:1065`
`scripts/window-note.js:1073`
`scripts/window-note.js:1085`
`scripts/window-note.js:1098`
`scripts/window-note.js:1110`
`scripts/window-note.js:1268`
`scripts/window-note.js:1208`
- Issue:
`_eventHandlers` is appended to on activation, but not drained/removed in `close()`.
- Impact:
Detached DOM references can be retained longer than needed and grow across rerenders.

### 8) Medium (inference): Potential re-render storm on pin update path
- File refs:
`scripts/squire.js:176`
`scripts/squire.js:212`
`scripts/squire.js:213`
- Issue:
`blacksmith.pins.updated` can trigger notes data refresh and panel re-render on each event.
- Impact:
If updates are high-frequency (e.g. pin dragging), this may cause expensive UI churn.

## Open Questions / Assumptions
1. Assumes frequent panel rerenders (as indicated by changelog notes).
2. This is static review only; runtime profiling in Foundry was not performed.

## Proposed Next Steps
1. Introduce consistent listener teardown in Spells/Features/Favorites (stored handler refs or `AbortController` with `{ signal }`).
2. Update Quest panel `destroy()` to call `_clearQuestPinPlacement()` and abort `_questListenersAbort`.
3. Consolidate to a single cleanup interval in `manager-panel.js`.
4. Migrate remaining long-lived `Hooks.on(...)` registrations to `BlacksmithHookManager.registerHook(...)` with explicit `context` and `key` values.
5. Clear and detach all tracked `window-note` handlers in `close()` before `super.close()`.
6. Throttle/debounce notes panel render on pin-updated events in `squire.js`.

## Hook Manager Migration Plan (Blacksmith API)
Source reviewed: `API: Hook Manager` wiki page.

### Migration Targets
1. Move quest pin sync listeners in `scripts/quest-pin-events.js` (`blacksmith.pins.*` and `updateScene`) from native `Hooks.on(...)` to Hook Manager registrations.
2. Move note scene sync listener in `scripts/panel-notes.js` (`updateScene`) to Hook Manager.
3. Move direct pin lifecycle listeners in `scripts/squire.js` (`blacksmith.pins.updated/created/placed/unplaced/deleted/deletedAll/deletedAllByType`) to Hook Manager where possible.
4. Keep `Hooks.once('init'|'ready'|'socketlib.ready')` only where required for boot order, but avoid adding new long-lived native `Hooks.on(...)`.

### Registration Standards
1. Use `context` on every Hook Manager registration (for grouped disposal).
2. Use stable `key` values for dedupe protection, especially in any code path that can run more than once.
3. Set `priority` intentionally:
- `1-2` for cleanup/integrity and core sync hooks.
- `3` for default behavior.
- `4-5` for non-critical UI-only reactions.
4. Use `options.throttleMs` or `options.debounceMs` on noisy update hooks (`updateScene`, pin-updated flows) to reduce churn.

### Cleanup Strategy
1. Prefer context cleanup on teardown: `BlacksmithHookManager.disposeByContext('<context>')`.
2. Where granular teardown is needed, store callback IDs and call `BlacksmithHookManager.removeCallback(callbackId)`.
3. Remove remaining manual `Hooks.off(...)` management for migrated hooks.

### Verification Checklist
1. Run `BlacksmithHookManager.showHooks()` and `BlacksmithHookManager.getStats()` after initialization; confirm no duplicate entries by `key`.
2. Reinitialize panel/scene flows and confirm hook counts remain stable.
3. Disable module / close game and confirm migrated contexts are disposed cleanly.
