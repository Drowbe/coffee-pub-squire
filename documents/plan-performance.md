# Performance and Memory Review

Last reviewed: May 12, 2026

This document tracks **remaining** performance and lifecycle risks. Listener teardown on Spells, Features, Favorites, Quest panel destroy, and the note window is already in place; the sections below are still open.

### Rollup

| # | Topic | Rank | Effort | Risk | Status |
|---|--------|------|--------|------|--------|
| 1 | `PanelManager` new-item cleanup interval hygiene | High | Small | Low | **Done** |
| 2 | Note pin hooks → full notes refresh each event | High | Small–medium | Medium | Open |
| 3 | Token selection forces full tray rerender | High | Large | High | Open |
| 4 | Notes / Codex / Quest full journal rescan each render | High | Large | High | Open |
| 5 | Quest pin sync hooks — no unregister | Medium | Medium | Medium | Open |
| 6 | Notes & Codex pin `updateScene` hooks — no teardown | Medium | Medium | Medium | Open |
| 7 | Favorites panel `cloneNode` churn on render | Medium | Medium | Medium | Open |
| 8 | `cleanupNewlyAddedItems()` repeated world writes in sweeps | Medium | Small | Low | Open |
| 9 | Dead `codex-pin-events.js` duplicate implementation | Low | Small | Low | Open |

**Rank** — impact if left unfixed (matches each finding’s severity). **Effort** — rough size of a good fix (Small ≈ localized; Large ≈ architectural or many call sites). **Risk** — chance of regressions or tricky edge cases when landing the change (selection flows, pin sync, journal refresh). **Status** — whether the rollup row has been addressed in code (Finding 1: single 30s timer; removed redundant `trackInterval` double-registration and redundant `clearInterval` after `clearTrackedInterval` in `cleanup()`; no separate 60s module-load loop exists in the current tree).

## Current Findings

### 1) ~~High: Duplicate cleanup intervals in `PanelManager`~~ **(addressed)**

- **What was wrong:** The new-item sweep used `trackModuleInterval` *and* `trackInterval`, which registered the same interval id twice in timer bookkeeping, and `cleanup()` cleared it with `clearTrackedInterval` (via `_intervals`) *and* again with raw `clearInterval` on `_cleanupInterval`. A second 60s module-load timer described in older notes is **not** present in the current codebase.
- **What we did:** Register the 30s sweep once (`trackModuleInterval` + `_intervals.add` only). On `PanelManager.cleanup()`, null `_cleanupInterval` after the shared `_intervals` pass—no second `clearInterval`.
- File refs: `scripts/manager-panel.js` (`initialize` cleanup timer, `cleanup()`).

### 2) High: Note pin lifecycle hooks trigger full notes refresh/render on every pin event
- File refs:
`scripts/squire.js:186`
`scripts/squire.js:222`
`scripts/squire.js:231`
`scripts/squire.js:254`
`scripts/squire.js:263`
`scripts/squire.js:286`
`scripts/squire.js:295`
`scripts/squire.js:318`
`scripts/squire.js:327`
`scripts/squire.js:354`
- Issue:
Each note pin lifecycle hook (`updated`, `created`, `placed`, `unplaced`, `deleted`) resolves the page, writes flags, then does `notesPanel._refreshData()` and `notesPanel.render(...)`.
- Impact:
If pin updates are noisy, especially during move/update flows, the entire notes panel can be reloaded and rerendered repeatedly. This is the highest-probability UI churn issue still in the module.
- Recommendation:
Debounce panel refreshes for note pin lifecycle events and coalesce multiple pin updates into a single refresh pass.

### 3) High: Token selection changes still force a full tray panel rerender
- File refs:
`scripts/manager-panel.js:2014`
`scripts/manager-panel.js:2123`
`scripts/manager-panel.js:2139`
- Issue:
`_updateHealthPanelFromSelection()` still ends by calling:
- `updateHandle()`
- `renderPanels(PanelManager.element)`
- `activateListeners(...)`
- `setViewMode(currentViewMode)`
Even though there is an early-return optimization, any real token-set change still forces a full tray rerender.
- Impact:
Selecting or multiselecting tokens can refresh every tray panel, including Notes, Codex, and Quest, even though those views are unrelated to token health/actor changes.
- Recommendation:
Split selection updates by concern. Health/handle updates should not automatically force full notes/codex/quest rerenders.

### 4) High: Notes, Codex, and Quest panels fully rescan their journals on each render
- File refs:
`scripts/panel-notes.js:1296`
`scripts/panel-notes.js:1351`
`scripts/panel-codex.js:1654`
`scripts/panel-codex.js:333`
`scripts/panel-quest.js:4065`
`scripts/panel-quest.js:1861`
- Issue:
Each panel render path starts with `_refreshData()`, and each `_refreshData()` walks the entire selected journal page collection. Quest and Codex also enrich/parse page HTML per page.
- Impact:
Any action that rerenders these panels scales with total journal size, not with the specific entry that changed. As notes/codex/quest journals grow, the UI cost of otherwise small actions will keep rising.
- Recommendation:
Move these panels toward incremental refresh:
- cache parsed page data
- invalidate by page UUID on relevant hooks
- avoid full journal rescans for local UI-only changes

### 5) Medium: Quest pin sync hooks have no unregister path
- File refs:
`scripts/quest-pin-events.js:378`
`scripts/quest-pin-events.js:401`
`scripts/quest-pin-events.js:411`
- Issue:
`registerQuestPinSync()` installs multiple `Hooks.on(...)` listeners and an `updateScene` hook, but only the click/context-menu handler path has an unregister function. The sync hooks do not.
- Impact:
In normal play this is mostly a lifecycle hygiene issue, not an immediate leak. But it makes teardown/reinit harder to reason about and increases the chance of duplicate sync if this code path is ever reused differently.
- Recommendation:
Either migrate these to Blacksmith HookManager with `context`/`key`, or store hook ids and remove them explicitly.

### 6) Medium: Notes and Codex pin scene-sync hooks also lack teardown
- File refs:
`scripts/panel-notes.js:821`
`scripts/panel-notes.js:827`
`scripts/panel-codex.js:97`
`scripts/panel-codex.js:104`
`scripts/panel-codex.js:241`
- Issue:
Both Notes and Codex register module-scoped `updateScene` hooks for pin reconciliation. These are guarded against duplicate registration, but there is no matching `Hooks.off(...)` path.
- Impact:
This is lower-risk than per-render listener leaks, but still leaves global hook lifetime unmanaged. `CodexPanel.destroy()` in particular only nulls `this.element` and does not participate in pin-hook teardown.
- Recommendation:
Move these to Blacksmith HookManager or add explicit unregister functions parallel to the quest/codex pin event unregister pattern.

### 7) Medium: Favorites panel still clones many nodes on every render
- File refs:
`scripts/panel-favorites.js:758`
`scripts/panel-favorites.js:781`
`scripts/panel-favorites.js:816`
`scripts/panel-favorites.js:864`
`scripts/panel-favorites.js:897`
- Issue:
The listener leak is fixed, but Favorites still uses repeated `cloneNode(true)` replacement for many controls and item sub-elements on every render.
- Impact:
This is functionally safe, but it is still heavier than delegated binding on a stable container. On large favorites lists, it creates avoidable DOM churn.
- Recommendation:
Convert remaining direct per-node bindings to delegated container listeners where practical.

### 8) Medium: `cleanupNewlyAddedItems()` can perform repeated world writes during timer sweeps
- File refs:
`scripts/manager-panel.js:1440`
`scripts/manager-panel.js:2160`
- Issue:
The cleanup routine not only prunes `PanelManager.newlyAddedItems`, it also iterates actor items and calls `item.unsetFlag(...)` for stale `isNew` flags.
- Impact:
The cleanup routine can still perform document updates for bookkeeping during each sweep, even when the tray is idle.
- Recommendation:
Consider only sweeping when `newlyAddedItems.size > 0` or when a tracked actor actually changed.

### 9) Low: `codex-pin-events.js` is dead duplicate pin-handler code
- File refs:
`scripts/codex-pin-events.js`
- Issue:
This file contains an alternate codex pin event/sync implementation, but it is not imported anywhere in the module. The live codex pin handler path is the one embedded in `panel-codex.js`.
- Impact:
No runtime cost today, but it increases maintenance risk and makes future debugging harder because there are two implementations to compare.
- Recommendation:
Either remove it or explicitly migrate to it and delete the older embedded codex pin handler path.

## Priority Order

### Strong candidates before the next release
1. **Finding 2 — debounce note pin lifecycle refreshes** — High user-visible payoff if pins move or sync often; `scheduleNotesPanelRefresh` already exists and could be extended/coalesced for pin hooks.

### Reasonable if time allows (otherwise next milestone)
2. **Finding 9 — dead `codex-pin-events.js`** — Quick housekeeping; no runtime win, fewer wrong turns for maintainers.
3. **Findings 5 and 6 — pin hook teardown** — Hygiene before bigger refactors; matters most if you expect module disable/reinit or duplicate-hook edge cases.

### Larger refactors (usually after release unless you have a dedicated slice)
4. **Finding 3 — selection-driven full tray rerender** — Touches core `manager-panel` flow; test multiselect and tray state carefully.
5. **Finding 4 — full-journal rescans** — Architectural; biggest win for large campaigns but not a small patch.
6. **Finding 7 — Favorites `cloneNode` churn** — Polish once hot paths above are stable.
7. **Finding 8 — `cleanupNewlyAddedItems()` sweep cost** — Optional follow-up after monitoring idle worlds.

## Suggested Verification

1. Profile token multiselect with the Performance tab and verify whether selection still rerenders Notes/Codex/Quest.
2. Drag or repeatedly update note pins and confirm whether notes panel refreshes collapse to one repaint.
3. Test with large journals:
- 100+ notes
- 100+ codex entries
- 50+ quests with many objectives
4. After hook cleanup work, verify hook counts stay stable across actor switches, tray reinitialization, and module disable/enable flows.
