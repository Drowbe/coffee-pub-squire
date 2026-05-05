# Performance and Memory Review

Last reviewed: May 4, 2026

This document replaces the earlier static review. Several of the original findings were already fixed during the Application V2 and panel cleanup work, so this version focuses on the current live risks in the codebase.

## Already Addressed

### Listener accumulation in Spells, Features, and Favorites panels
- Status: fixed
- File refs:
`scripts/panel-spells.js:223`
`scripts/panel-features.js:160`
`scripts/panel-favorites.js:758`
- Notes:
All three panels now use `AbortController`-based teardown before rebinding listeners on render. The original “listeners pile up every render” finding is no longer current.

### Quest panel destroy-time listener cleanup
- Status: fixed
- File refs:
`scripts/panel-quest.js:615`
`scripts/panel-quest.js:623`
`scripts/panel-quest.js:626`
- Notes:
`QuestPanel.destroy()` now clears active pin-placement listeners and aborts container listeners.

### Note window local event handler cleanup
- Status: fixed
- File refs:
`scripts/window-note.js:592`
`scripts/window-note.js:1197`
`scripts/window-note.js:1205`
- Notes:
The note window now clears tracked DOM handlers on rerender and on close. The earlier leak concern here is no longer current.

## Current Findings

### 1) High: Duplicate cleanup intervals still run in PanelManager
- File refs:
`scripts/manager-panel.js:222`
`scripts/manager-panel.js:2160`
- Issue:
There are still two independent periodic cleanup loops for `cleanupNewlyAddedItems()`:
- a 30s interval created from `PanelManager.initialize()`
- a 60s global interval created at module load
- Impact:
Redundant wakeups, duplicate actor/item scans, and overlapping `unsetFlag()` work. This is not catastrophic, but it is unnecessary churn in a central manager that is always alive.
- Recommendation:
Keep a single interval. Prefer the instance-managed path and remove the global module-load interval.

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
Combined with the duplicate interval issue, this can create repeated document updates for bookkeeping cleanup, even when the tray is idle.
- Recommendation:
Fix the duplicate interval first. After that, consider only sweeping when `newlyAddedItems.size > 0` or when a tracked actor actually changed.

### 9) Low: `codex-pin-events.js` is dead duplicate pin-handler code
- File refs:
`scripts/codex-pin-events.js`
- Issue:
This file contains an alternate codex pin event/sync implementation, but it is not imported anywhere in the module. The live codex pin handler path is the one embedded in `panel-codex.js`.
- Impact:
No runtime cost today, but it increases maintenance risk and makes future debugging harder because there are two implementations to compare.
- Recommendation:
Either remove it or explicitly migrate to it and delete the older embedded codex pin handler path.

## No Longer Relevant From The Previous Plan

These earlier findings should not drive current work:

1. Spells panel listener accumulation
2. Features panel listener accumulation
3. Favorites panel listener accumulation as a leak
4. Quest panel destroy missing active-listener cleanup
5. Note window local `_eventHandlers` leak

They have been addressed in current code.

## Priority Order

### Recommended Execution Plan
1. Fix the duplicate `PanelManager` cleanup intervals first.
2. Then do one combined hook-and-rerender pass for Notes, Codex, Quest, and tray selection flows:
- migrate remaining long-lived native hooks to Blacksmith Hook Manager where practical
- add explicit teardown where Hook Manager migration is not the right fit
- debounce/coalesce noisy note pin lifecycle refreshes in `squire.js`
- stop `_updateHealthPanelFromSelection()` from forcing unrelated panel rerenders
3. After that pass is stable, tackle journal-scale optimization separately.

### Do Next
1. Collapse the duplicate `PanelManager` cleanup intervals into one.
2. Combine hook lifecycle cleanup with performance cleanup in a single pass:
- address quest/note/codex pin hook teardown or Hook Manager migration
- debounce note pin lifecycle refreshes
- narrow selection-driven rerenders to only the panels that actually need updates

### Do Soon
1. Reduce full-journal rescans in Notes, Codex, and Quest by introducing entry-level invalidation and cached parse results.

### Do Later
1. Replace remaining Favorites DOM cloning with delegated listeners.
2. Remove or consolidate the unused `codex-pin-events.js` path.

## Suggested Verification

1. Profile token multiselect with the Performance tab and verify whether selection still rerenders Notes/Codex/Quest.
2. Drag or repeatedly update note pins and confirm whether notes panel refreshes collapse to one repaint.
3. Test with large journals:
- 100+ notes
- 100+ codex entries
- 50+ quests with many objectives
4. After hook cleanup work, verify hook counts stay stable across actor switches, tray reinitialization, and module disable/enable flows.
