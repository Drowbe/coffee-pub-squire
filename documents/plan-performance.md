# Performance and Memory Review

Last reviewed: July 12, 2026 (full three-track audit: lifecycle/teardown, render-path hot spots, memory retention)

This document tracks **remaining** performance and lifecycle risks, stack-ranked — findings are listed in recommended fix order (payoff weighted against effort and regression risk). Previously resolved findings have been removed: listener teardown on Spells/Features/Favorites/Quest/note window, `PanelManager` cleanup-interval hygiene, note pin refresh debouncing (coalesced via the `_schedule*PanelRefresh` debouncers in `manager-pins.js`), selection-driven full tray rerenders (selection now early-returns and renders only actor-dependent panels via `renderActorPanels()`), pin hook teardown (AbortController + `teardownPinManager()`), and the dead `codex-pin-events.js`/`quest-pin-events.js` files.

Verified clean in the July 2026 audit (do not re-investigate): no Handlebars recompilation (Foundry caches compiled templates); no MutationObserver/ResizeObserver leaks; timer-utils used consistently (three trivial self-completing 500ms `setTimeout`s aside); popped-out windows (`window-health.js`, `window-dicetray.js`, `window-macros.js`) correctly `delete actor.apps[appId]` on close; `PanelManager` static maps are pruned; no unbounded module-level caches; socketlib registered once.

### Rollup (stack-ranked)

| # | Topic | Type | Rank | Effort | Risk | Status |
|---|--------|------|------|--------|------|--------|
| 1 | Double `updateHandle()` on every HP/effect change | Perf | High | Tiny | Low | **Done** |
| 2 | `HealthPanel`/`DiceTrayPanel`/`MacrosPanel` strand `actor.apps` entries (no/incomplete `destroy()`) | Leak | High | Small | Low | **Done** |
| 3 | `deleteToken` last-token path bypasses `PanelManager.cleanup()` | Leak | High | Small | Low | **Done** |
| 4 | `updateHandle()` renders the entire tray template per call | Perf | High | Medium–large | Medium | **Done** |
| 5 | Pinned quest re-enriched/re-parsed on every `updateHandle()` | Perf | High | Small–medium | Low | **Done** |
| 6 | Party-stats full recompute on every chat message / actor update, undebounced | Perf | Medium–high | Small | Low | **Done** |
| 7 | One item change rerenders weapons + inventory + favorites + handle | Perf | Medium–high | Medium | Medium | **Done** |
| 8 | AC/movement changes trigger full `initialize()` + `renderPanels()` | Perf | Medium | Small | Medium | **Done** |
| 9 | Notes / Codex / Quest full journal rescan each render | Perf | High | Large | High | Open |
| 10 | Four separate `updateActor` hooks, no shared relevance gate; party panel undebounced | Perf | Medium | Medium | Medium | Open |
| 11 | `blacksmith.pins.resolveOwnership` hook — no teardown, no duplicate guard | Leak | Medium | Small | Low | Open |
| 12 | `deleteToken` fallback reassigns `panel.actor` without moving `actor.apps` | Leak | Low–medium | Small | Low | **Done** |
| 13 | Favorites panel `cloneNode` churn on render | Perf | Medium | Medium | Medium | Open |
| 14 | `cleanupNewlyAddedItems()` repeated world writes + unconditional inventory rerender | Perf | Medium | Small | Low | **Done** |

**Rank** — impact if left unfixed. **Effort** — rough size of a good fix. **Risk** — chance of regressions when landing the change. Ordering favors payoff-per-effort: 1–3 are cheap, high-certainty wins; 4–8 are the combat-time hot path; 9 is the biggest architectural win for large campaigns; 10–14 are hygiene and polish.

## Current Findings

### 1) ~~High / Tiny: `updateHandle()` runs twice for every HP or effect change~~ **(addressed)**
- **What was wrong:** In the `globalUpdateActor` handler, HP/effect changes called `updateHandle()`, then a separate `if (changes.system?.spells) ... else updateHandle()` ran it **again** for any update without a spell-slot change.
- **What we did:** Restructured so the handle updates at most once per actor update (`hp || effects || !spells` → single call); spells-only updates still skip the handle and rerender just the spells panel.
- File refs: `scripts/squire.js` (`globalUpdateActor` handler).

### 2) ~~High / Small: In-tray sub-panels strand `actor.apps` registrations on hard actor switch~~ **(addressed)**
- **What was wrong:** `HealthPanel`, `DiceTrayPanel`, and `MacrosPanel` self-register via `actor.apps[this.id] = this`, but Health/DiceTray had no `destroy()` at all and `MacrosPanel.destroy()` never deleted the `apps` entry — so every hard actor switch stranded a dead panel (holding detached DOM) that Foundry kept rendering on the old actor's updates.
- **What we did:** Added `destroy()` to `HealthPanel` (unregisters from all token actors + primary actor, clears `tokens`/`element`) and `DiceTrayPanel`; added the `apps` deletion to `MacrosPanel.destroy()`. `_cleanupOldInstance()` already invoked `destroy()` where present, so the existing teardown paths now release them.
- File refs: `scripts/panel-health.js`, `scripts/panel-dicetray.js`, `scripts/panel-macros.js`.

### 3) ~~High / Small: `deleteToken` last-token path bypasses all cleanup~~ **(addressed)**
- **What was wrong:** When the current actor's last token was deleted with no fallback, the handler nulled `panelManager.instance`/`currentActor` directly — skipping tray DOM removal, timer clearing, and panel destruction. Separately, `PanelManager.cleanup()` only destroyed a subset of panels (missing health/dicetray and others).
- **What we did:** Token deletion now routes through the shared `reinitializeTrayForCanvas()` resolver (debounced 100ms to coalesce deletion bursts), which rebuilds via `initialize(..., { force: true })` — players fall back to a remaining owned token, then their assigned/owned character; GMs get the no-character tray (selection-driven). The same resolver runs on `canvasReady` (scene load) and world load. `initialize()` destroys the old instance's panels first (via `_cleanupOldInstance()`, releasing `actor.apps` registrations and listeners); `force` bypasses the 100ms init debounce that the `controlToken` release event stamps just before `deleteToken` fires (this was silently swallowing the rebuild), and the `controlToken` handler ignores releases for tokens that no longer exist in the scene. `PanelManager.cleanup()` (module disable) also now delegates panel destruction to `_cleanupOldInstance()` so the full panel set, including the finding-2 `destroy()` methods, is torn down there too. **Verified in-game July 12, 2026.**
- File refs: `scripts/squire.js` (`deleteToken` handler), `scripts/manager-panel.js` (`cleanup()`).

### 4) ~~High / Medium–large: `updateHandle()` renders the entire tray template on every call~~ **(addressed)**
- **What was wrong:** `updateHandle()` rendered `TEMPLATES.TRAY` — every panel's markup — into a temp div just to slice out the handle wrapper, then cloned the whole `.tray-handle` (plus ~10 individual buttons) and re-bound ~15 listeners, on nearly every hook.
- **What we did:** Renders only the view-specific handle template (`HANDLE_PLAYER`/`HANDLE_PARTY`/`HANDLE_NOTES`/`HANDLE_CODEX`/`HANDLE_QUEST`, added to `TEMPLATES`) directly into the wrapper. All handle handlers are now delegated to the stable `.tray-handle` element and bound once per tray (`_boundHandleElement` guard) — zero clone churn per update. Bonus fixes: the party-member portrait handler was attached to the detached pre-clone element (dead), and objective tooltips used non-bubbling `mouseenter`/`mouseleave` with delegation (dead) — both now work via `mouseover`/`mouseout` + `relatedTarget` guards. Not done (deemed not worth it): settings-read batching (`game.settings.get` is an in-memory lookup) and skipping party context in player view (the player handle shows party portraits).
- File refs: `scripts/manager-handle.js` (`updateHandle`, `_attachHandleEventListeners`), `scripts/const.js`.

### 5) ~~High / Small–medium: Pinned quest re-enriched and re-parsed on every `updateHandle()`~~ **(addressed)**
- **What was wrong:** With a quest pinned, every `updateHandle()` ran `fromUuid` + `enrichHTML` + `QuestParser.parseSinglePage`.
- **What we did:** `_getPinnedQuestData()` caches the parsed result keyed by quest UUID + page `_stats.modifiedTime`; re-parses only when the pinned quest changes or its page is edited (objective state changes edit page content, so they bump `modifiedTime` and invalidate naturally).
- File refs: `scripts/manager-handle.js` (`_getPinnedQuestData`).

### 6) ~~Medium–high / Small: Party-stats recompute on every chat message, undebounced~~ **(addressed)**
- **What we did:** `_onStatsUpdate` is debounced (250ms trailing, tracked timer cleared in `destroy()`); `getData()` fetches all members' stats concurrently via `Promise.all`; the `updateActor` hook ignores non-player-character actors; the `createChatMessage` hook skips messages without rolls.
- File refs: `scripts/panel-party-stats.js`, `scripts/squire.js` (party-stats hook wiring).

### 7) ~~Medium–high / Medium: One item change rerenders three panels plus the handle~~ **(addressed)**
- **What we did:** `globalUpdateItem` now short-circuits when no visible field changed (name/img/sort/equipped/prepared/uses/quantity/weight/attunement/module flags — description edits skip everything); weapons/inventory renders stay type-gated; the favorites panel only rerenders when the changed item is actually favorited; the handle only rebuilds when the item is a handle favorite (the handle displays nothing else item-derived).
- File refs: `scripts/squire.js` (`globalUpdateItem`).

### 8) ~~Medium / Small: AC and movement changes trigger full `initialize()` + `renderPanels()`~~ **(addressed)**
- **What we did:** Removed `ac`/`movement` from the `needsFullUpdate` set (now name/img/proficiency/level only). AC/movement changes take a new `needsStatsUpdate` branch: targeted character-panel + stats-panel render plus a handle update — no re-initialization, no full-tray rerender.
- File refs: `scripts/squire.js` (`globalUpdateActor`).

### 9) High / Large: Notes, Codex, and Quest panels fully rescan their journals on each render
- File refs:
`scripts/panel-notes.js:468`
`scripts/panel-codex.js:210`
`scripts/panel-quest.js:1718`
- Issue:
Each panel render path starts with `_refreshData()`, which clears cached state and walks the entire selected journal page collection, enriching/parsing page HTML per page. The quest panel calls `_refreshData()` from roughly ten sites.
- Impact:
Any action that rerenders these panels scales with total journal size, not with the entry that changed. The debounced pin-event refreshes in `manager-pins.js` fixed refresh *frequency*, but each refresh still pays this full-rescan cost. Biggest win for large campaigns.
- Recommendation:
Move to incremental refresh: cache parsed page data, invalidate by page UUID on relevant hooks, avoid full rescans for local UI-only changes.

### 10) Medium / Medium: Four separate `updateActor` hooks with no shared relevance gate; party panel undebounced
- File refs:
`scripts/squire.js:287` (character), `scripts/squire.js:330` (party), `scripts/squire.js:416` (party-stats), `scripts/squire.js:647` (global)
`scripts/panel-party.js:560-586` (`_onTokenUpdate`/`_onActorUpdate`/`_onControlToken`)
- Issue:
A single actor HP change dispatches four independent Squire callbacks: targeted character-panel update (fine — good model to copy), full party panel rebuild, party-stats recompute (finding 6), and the global handler (findings 1/8). The party panel's handlers rerender the whole panel per event — `_onControlToken` fires once per token during multi-select — scanning all `canvas.tokens.placeables` and reading health-threshold settings per token each time.
- Impact:
Redundant fan-out per actor update; multi-select bursts cause repeated full party renders.
- Recommendation:
Consolidate into one `updateActor` dispatcher that computes relevance once and fans out only to affected panels; debounce party panel handlers; do a targeted healthbar update for the changed token instead of a full rebuild.

### 11) Medium / Small: `blacksmith.pins.resolveOwnership` hook has no teardown and no duplicate guard
- File refs:
`scripts/manager-pins.js:2156` (registration), `scripts/manager-pins.js:2174-2199` (`teardownPinManager()` — only removes the `updateScene` hook)
- Issue:
Registered with a bare `Hooks.on(...)` in `initPinManager()`; the hook ID is never captured, `teardownPinManager()` never removes it, and unlike the sibling `_sceneSyncHookId` there is no idempotency guard.
- Impact:
Each module disable→re-enable cycle registers a duplicate resolver.
- Recommendation:
Store the hook ID and remove it in `teardownPinManager()`, mirroring the `_sceneSyncHookId` pattern.

### 12) ~~Low–medium / Small: `deleteToken` fallback reassigns `panel.actor` without moving `actor.apps` registrations~~ **(addressed)**
- **What was wrong:** The `deleteToken` fallback branch set ~14 `panel.actor` fields directly (skipping `updateActor()`'s `actor.apps` handoff), and the per-event execution raced against itself when the GM deleted several tokens at once — leaving the tray half-updated across two actors.
- **What we did:** Deleted the direct-reassignment branch entirely. The handler now coalesces deletion bursts with a 100ms debounce and performs ONE rebuild via `initialize(nextToken?.actor ?? getFallbackActor(), { force: true })` — a remaining owned token wins, then players fall back to their assigned/owned character, and GMs get the no-character tray. The rebuild re-checks canvas state when it fires (skipping if the current actor regained a token or the user selected something else meanwhile), and `initialize()` handles the full panel teardown/re-registration.
- File refs: `scripts/squire.js` (`deleteToken` handler).

### 13) Medium / Medium: Favorites panel still clones many nodes on every render
- File refs:
`scripts/panel-favorites.js` (7 `cloneNode(true)` call sites)
- Issue:
The listener leak is fixed, but Favorites still uses repeated `cloneNode(true)` replacement for many controls and item sub-elements on every render.
- Impact:
Functionally safe but heavier than delegated binding on a stable container; avoidable DOM churn on large favorites lists.
- Recommendation:
Convert remaining direct per-node bindings to delegated container listeners where practical.

### 14) ~~Medium / Small: `cleanupNewlyAddedItems()` performs world writes and an unconditional inventory rerender every 30s~~ **(addressed)**
- **What was wrong:** The 30s sweep iterated all actor items calling `unsetFlag(...)` with no idle guard, and force-rendered the inventory panel every sweep regardless of change.
- **What we did:** `cleanupNewlyAddedItems()` now early-returns when the map is empty and the current actor's flags were already swept; the stray-`isNew`-flag scan runs once per actor (tracked via `_lastFlagSweepActorId` — flags persist across reloads while the map is in-memory, so the once-per-actor scan still clears stale flags after a reload); the method returns whether anything changed, and the interval only rerenders the inventory panel when it did.
- File refs: `scripts/manager-panel.js` (sweep registration in `initialize`, `cleanupNewlyAddedItems()`).

## Suggested Batching

- **Batch A — quick wins (1, 2, 3, 14):** ✅ **Done and verified in-game (July 12, 2026)** — plus finding 12 landed as part of the finding-3 rework. Shipped in 13.3.5 alongside the NEW-badge wiring and the tray actor fallback rules (see CHANGELOG).
- **Batch B — combat hot path (4, 5, 6, 7, 8):** ✅ **Done (July 12, 2026, targeted for 13.3.6)** — needs in-game verification (steps 1, 3, 4 below, plus a full handle interaction pass: pin/toggle/view-cycle buttons, dice tray/macros/conditions/health buttons, favorites, condition icons, party portraits and health bars, pinned-quest name and objective icons — every handle control was migrated to delegated listeners).
- **Batch C — architectural (9, 10):** incremental journal refresh and the consolidated `updateActor` dispatcher. Largest payoff for big campaigns; needs a dedicated slice and careful regression testing.
- **Batch D — hygiene/polish (11, 12, 13):** land opportunistically alongside nearby work.

## Suggested Verification

1. Combat profile (Performance tab): apply damage repeatedly and confirm `updateHandle()` fires once per update (finding 1) and no full-tray template render appears in the flame chart (finding 4).
2. Actor-switch leak check: as GM, cycle through 20+ NPC tokens, take a heap snapshot, and confirm no accumulation of detached `HealthPanel`/`DiceTrayPanel`/`MacrosPanel` instances or growth in `actor.apps` entries (findings 2, 3, 12).
3. Pin a quest, then apply damage repeatedly — confirm no `enrichHTML`/`QuestParser` calls per HP tick (finding 5).
4. Spam chat messages — confirm party-stats does not recompute per message (finding 6).
5. Large-journal test (100+ notes, 100+ codex entries, 50+ quests): confirm a single entry edit no longer scales with total journal size once finding 9 lands.
6. Module disable→enable cycle: confirm `blacksmith.pins.resolveOwnership` has exactly one registration (finding 11).
7. With the tray idle and no new items, confirm the 30s sweep performs no document writes and no inventory rerenders (finding 14).
