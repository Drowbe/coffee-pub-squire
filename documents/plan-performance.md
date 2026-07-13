# Performance and Memory Review

Last reviewed: July 12, 2026

This document tracks **remaining** performance and lifecycle risks. Previously tracked findings that are now resolved have been removed: listener teardown on Spells/Features/Favorites/Quest/note window, `PanelManager` cleanup-interval hygiene, note pin refresh debouncing (now coalesced via `_scheduleNotesPanelRefresh`/`_scheduleCodexPanelRefresh`/`_scheduleQuestPanelRefresh` in `manager-pins.js`), selection-driven full tray rerenders (selection now early-returns and renders only actor-dependent panels via `renderActorPanels()`), pin hook teardown (all pin handlers register with an `AbortController` and `teardownPinManager()` unwinds them), and the dead `codex-pin-events.js`/`quest-pin-events.js` files (deleted in the pin manager refactor).

### Rollup

| # | Topic | Rank | Effort | Risk | Status |
|---|--------|------|--------|------|--------|
| 1 | Notes / Codex / Quest full journal rescan each render | High | Large | High | Open |
| 2 | Favorites panel `cloneNode` churn on render | Medium | Medium | Medium | Open |
| 3 | `cleanupNewlyAddedItems()` repeated world writes in sweeps | Medium | Small | Low | Open |

**Rank** — impact if left unfixed (matches each finding’s severity). **Effort** — rough size of a good fix (Small ≈ localized; Large ≈ architectural or many call sites). **Risk** — chance of regressions or tricky edge cases when landing the change (selection flows, pin sync, journal refresh).

## Current Findings

### 1) High: Notes, Codex, and Quest panels fully rescan their journals on each render
- File refs:
`scripts/panel-notes.js:468`
`scripts/panel-codex.js:210`
`scripts/panel-quest.js:1718`
- Issue:
Each panel render path starts with `_refreshData()`, and each `_refreshData()` clears its cached state and walks the entire selected journal page collection. Notes, Codex, and Quest all enrich/parse page HTML per page. The quest panel calls `_refreshData()` from roughly ten sites.
- Impact:
Any action that rerenders these panels scales with total journal size, not with the specific entry that changed. As notes/codex/quest journals grow, the UI cost of otherwise small actions will keep rising. Note that the debounced pin-event refreshes in `manager-pins.js` fixed the refresh *frequency*, but each refresh still pays this full-rescan cost.
- Recommendation:
Move these panels toward incremental refresh:
- cache parsed page data
- invalidate by page UUID on relevant hooks
- avoid full journal rescans for local UI-only changes

### 2) Medium: Favorites panel still clones many nodes on every render
- File refs:
`scripts/panel-favorites.js` (7 `cloneNode(true)` call sites)
- Issue:
The listener leak is fixed, but Favorites still uses repeated `cloneNode(true)` replacement for many controls and item sub-elements on every render.
- Impact:
This is functionally safe, but it is still heavier than delegated binding on a stable container. On large favorites lists, it creates avoidable DOM churn.
- Recommendation:
Convert remaining direct per-node bindings to delegated container listeners where practical.

### 3) Medium: `cleanupNewlyAddedItems()` can perform repeated world writes during timer sweeps
- File refs:
`scripts/manager-panel.js:225` (30s sweep registration)
`scripts/manager-panel.js:1447` (`cleanupNewlyAddedItems()`)
- Issue:
The 30s sweep not only prunes `PanelManager.newlyAddedItems`, it also iterates all actor items and calls `item.unsetFlag(...)` for stale `isNew` flags — with no `newlyAddedItems.size > 0` guard. The same sweep also force-renders the inventory panel every 30 seconds regardless of whether anything changed.
- Impact:
The cleanup routine can still perform document updates and panel rerenders for bookkeeping during each sweep, even when the tray is idle.
- Recommendation:
Only sweep (and only rerender the inventory panel) when `newlyAddedItems.size > 0` or when a tracked actor actually changed.

## Priority Order

1. **Finding 1 — full-journal rescans** — Architectural; biggest win for large campaigns but not a small patch. The pin-event debouncing already in place means this is now the dominant cost on every notes/codex/quest refresh.
2. **Finding 3 — `cleanupNewlyAddedItems()` sweep cost** — Small guard-clause fix; cheap win for idle worlds.
3. **Finding 2 — Favorites `cloneNode` churn** — Polish once hot paths above are stable.

## Suggested Verification

1. Test with large journals:
- 100+ notes
- 100+ codex entries
- 50+ quests with many objectives
2. Profile a single note/codex/quest edit and confirm render cost stops scaling with total journal size once incremental refresh lands.
3. With the tray idle and no new items, confirm the 30s sweep performs no document writes and no inventory rerenders.
