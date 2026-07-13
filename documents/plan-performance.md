# Performance and Memory Review

Last reviewed: July 12, 2026 (full three-track audit: lifecycle/teardown, render-path hot spots, memory retention)

This document tracks **remaining** performance and lifecycle risks, stack-ranked — findings are listed in recommended fix order (payoff weighted against effort and regression risk). Previously resolved findings have been removed: listener teardown on Spells/Features/Favorites/Quest/note window, `PanelManager` cleanup-interval hygiene, note pin refresh debouncing (coalesced via the `_schedule*PanelRefresh` debouncers in `manager-pins.js`), selection-driven full tray rerenders (selection now early-returns and renders only actor-dependent panels via `renderActorPanels()`), pin hook teardown (AbortController + `teardownPinManager()`), and the dead `codex-pin-events.js`/`quest-pin-events.js` files.

Verified clean in the July 2026 audit (do not re-investigate): no Handlebars recompilation (Foundry caches compiled templates); no MutationObserver/ResizeObserver leaks; timer-utils used consistently (three trivial self-completing 500ms `setTimeout`s aside); popped-out windows (`window-health.js`, `window-dicetray.js`, `window-macros.js`) correctly `delete actor.apps[appId]` on close; `PanelManager` static maps are pruned; no unbounded module-level caches; socketlib registered once.

### Rollup (stack-ranked)

| # | Topic | Type | Rank | Effort | Risk | Status |
|---|--------|------|------|--------|------|--------|
| 1 | Double `updateHandle()` on every HP/effect change | Perf | High | Tiny | Low | Open |
| 2 | `HealthPanel`/`DiceTrayPanel`/`MacrosPanel` strand `actor.apps` entries (no/incomplete `destroy()`) | Leak | High | Small | Low | Open |
| 3 | `deleteToken` last-token path bypasses `PanelManager.cleanup()` | Leak | High | Small | Low | Open |
| 4 | `updateHandle()` renders the entire tray template per call | Perf | High | Medium–large | Medium | Open |
| 5 | Pinned quest re-enriched/re-parsed on every `updateHandle()` | Perf | High | Small–medium | Low | Open |
| 6 | Party-stats full recompute on every chat message / actor update, undebounced | Perf | Medium–high | Small | Low | Open |
| 7 | One item change rerenders weapons + inventory + favorites + handle | Perf | Medium–high | Medium | Medium | Open |
| 8 | AC/movement changes trigger full `initialize()` + `renderPanels()` | Perf | Medium | Small | Medium | Open |
| 9 | Notes / Codex / Quest full journal rescan each render | Perf | High | Large | High | Open |
| 10 | Four separate `updateActor` hooks, no shared relevance gate; party panel undebounced | Perf | Medium | Medium | Medium | Open |
| 11 | `blacksmith.pins.resolveOwnership` hook — no teardown, no duplicate guard | Leak | Medium | Small | Low | Open |
| 12 | `deleteToken` fallback reassigns `panel.actor` without moving `actor.apps` | Leak | Low–medium | Small | Low | Open |
| 13 | Favorites panel `cloneNode` churn on render | Perf | Medium | Medium | Medium | Open |
| 14 | `cleanupNewlyAddedItems()` repeated world writes + unconditional inventory rerender | Perf | Medium | Small | Low | Open |

**Rank** — impact if left unfixed. **Effort** — rough size of a good fix. **Risk** — chance of regressions when landing the change. Ordering favors payoff-per-effort: 1–3 are cheap, high-certainty wins; 4–8 are the combat-time hot path; 9 is the biggest architectural win for large campaigns; 10–14 are hygiene and polish.

## Current Findings

### 1) High / Tiny: `updateHandle()` runs twice for every HP or effect change
- File refs:
`scripts/squire.js:681-693`
- Issue:
In the `globalUpdateActor` handler, HP/effect changes call `updateHandle()` at line 682, then fall into a separate `if (changes.system?.spells) ... else updateHandle()` at line 692. Any actor update without a spell-slot change (the common case: HP tick, condition applied) runs the full handle update **twice**.
- Impact:
Doubles the cost of finding 4 on the most frequent hook in combat.
- Recommendation:
Make the branches mutually exclusive (`else if`) so `updateHandle()` runs at most once per update. One-line fix.

### 2) High / Small: In-tray sub-panels strand `actor.apps` registrations on hard actor switch
- File refs:
`scripts/panel-health.js:31` (register; no `destroy()` method exists)
`scripts/panel-dicetray.js:58` (register; no `destroy()` method exists)
`scripts/panel-macros.js:79` (register), `scripts/panel-macros.js:716-720` (`destroy()` nulls `element` but never `delete this.actor.apps[this.id]`)
- Issue:
All three panels self-register via `actor.apps[this.id] = this` so Foundry rerenders them on actor updates. `HealthPanel` and `DiceTrayPanel` have **no `destroy()` at all**, so `_cleanupOldInstance()` (which only calls `destroy()` where it exists) never unregisters them; `MacrosPanel.destroy()` forgets the `apps` deletion. They clean up correctly on *soft* token/actor updates, but the hard `PanelManager.initialize()` path leaks.
- Impact:
Every hard actor switch strands a dead panel — holding detached DOM — on the previous actor's document, and **Foundry keeps invoking `render()` on those dead panels** on every future update of that actor. A GM cycling through NPC tokens accumulates one dead panel per actor per panel type. This is the module's clearest true memory leak.
- Recommendation:
Add `destroy()` to `HealthPanel` and `DiceTrayPanel` that does `delete this.actor.apps[this.id]` (and nulls `element`/`tokens`); add the `apps` deletion to `MacrosPanel.destroy()`. The popped-out window classes already do this correctly on `close()` — mirror that pattern.

### 3) High / Small: `deleteToken` last-token path bypasses all cleanup
- File refs:
`scripts/squire.js:753-756`
- Issue:
When the current actor's last token is deleted and no fallback token exists, the handler does `panelManager.instance = null; panelManager.currentActor = null;` directly instead of calling `PanelManager.cleanup()`.
- Impact:
Skips tray DOM removal, tracked interval/timeout clearing (the 30s sweep keeps firing against a null instance), and panel destruction — so the `actor.apps` entries from finding 2 are never released even once fixed there.
- Recommendation:
Replace the direct nulling with the existing cleanup path.

### 4) High / Medium–large: `updateHandle()` renders the entire tray template on every call
- File refs:
`scripts/manager-handle.js:224-229` (full-tray render + slice)
`scripts/manager-handle.js:184-194` (~13 `game.settings.get` per call)
`scripts/manager-handle.js:108-147` (party context built unconditionally)
- Issue:
`updateHandle()` renders `TEMPLATES.TRAY` — the markup for **every** panel — into a temp div, extracts only `.tray-handle-content-wrapper`, and discards the rest. It then clones the handle element and re-binds ~15 listeners, re-reads ~13 settings, and builds `otherPartyMembers` (per-member health calc) even in player view where it's unused.
- Impact:
`updateHandle()` fires on nearly every hook: `updateItem`, `updateActor`, `createItem`, `deleteItem`, active-effect create/delete, `createToken`, and every `setViewMode`. During combat this runs many times per second (doubled until finding 1 lands). This is the single worst render hot spot in the module.
- Recommendation:
Render a dedicated handle-only template instead of the full tray; use delegated listeners on a stable handle container instead of clone+rebind; batch/cache the settings reads; only build party context when `viewMode === 'party'`.

### 5) High / Small–medium: Pinned quest re-enriched and re-parsed on every `updateHandle()`
- File refs:
`scripts/manager-handle.js:102-104`, `scripts/manager-handle.js:1107-1145`
- Issue:
When a quest is pinned, every `updateHandle()` call runs `fromUuid` + `TextEditor.enrichHTML` + `QuestParser.parseSinglePage` on the pinned quest page — heavyweight async work for data that rarely changes.
- Impact:
Adds enrich+parse cost to every HP tick / item update for the entire duration a quest is pinned (multiplied by findings 1 and 4).
- Recommendation:
Cache the parsed pinned-quest entry keyed by UUID + page `_stats.modifiedTime`; invalidate from the quest pin/journal hooks that already exist.

### 6) Medium–high / Small: Party-stats panel recomputes the full leaderboard on every chat message, undebounced
- File refs:
`scripts/panel-party-stats.js:21-73`
`scripts/squire.js:416-442` (hook wiring)
- Issue:
`_boundUpdateHandler` is attached without debounce to `updateActor`, `updateCombat`, **and** `createChatMessage`. Each fire awaits `BlacksmithAPI.waitForReady()`, then sequentially awaits `getStats(actor.id)` per party member, then does a full `innerHTML` replace.
- Impact:
Every chat message in the session triggers a full stats recompute scaling with party size.
- Recommendation:
Debounce the handler; parallelize with `Promise.all`; skip recompute on `createChatMessage` unless the message carries combat/score-relevant data.

### 7) Medium–high / Medium: One item change rerenders three panels plus the handle
- File refs:
`scripts/squire.js:499-561`
- Issue:
`globalUpdateItem` on the current actor awaits full rerenders of the weapons, inventory, and favorites panels, then `updateHandle()`, regardless of which item fields changed. Ammo decrements and equip toggles — the most frequent combat item updates — pay the full cost.
- Impact:
Frequent multi-panel `innerHTML` rebuilds during combat.
- Recommendation:
Inspect `changes` and skip rerender when only non-visible fields changed; render only the panel(s) matching the item type; coalesce burst updates with a short debounce.

### 8) Medium / Small: AC and movement changes trigger full `initialize()` + `renderPanels()`
- File refs:
`scripts/squire.js:664-677`
- Issue:
The `needsFullUpdate` set includes `changes.system?.attributes?.ac` and `...movement`. AC and movement recompute constantly (active effects, conditions, mounts), and each occurrence re-initializes the PanelManager and rerenders every panel plus the handle.
- Impact:
A "major change" path that actually fires on routine effect churn.
- Recommendation:
Drop `ac`/`movement` from the full-update set; route them to a targeted stats/handle update.

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

### 12) Low–medium / Small: `deleteToken` fallback reassigns `panel.actor` without moving `actor.apps` registrations
- File refs:
`scripts/squire.js:730-731`
- Issue:
When falling back to another token, `dicetrayPanel.actor` and `macrosPanel.actor` are set directly instead of via `updateActor()`, so the panels stay registered under the deleted actor's `apps` and are never registered on the new actor. `HealthPanel` isn't updated in this path at all.
- Impact:
Dangling `apps` entries on the deleted actor; sub-panels stop receiving render notifications for the new actor.
- Recommendation:
Call each panel's `updateActor()` (which handles the `apps` handoff) instead of assigning the field.

### 13) Medium / Medium: Favorites panel still clones many nodes on every render
- File refs:
`scripts/panel-favorites.js` (7 `cloneNode(true)` call sites)
- Issue:
The listener leak is fixed, but Favorites still uses repeated `cloneNode(true)` replacement for many controls and item sub-elements on every render.
- Impact:
Functionally safe but heavier than delegated binding on a stable container; avoidable DOM churn on large favorites lists.
- Recommendation:
Convert remaining direct per-node bindings to delegated container listeners where practical.

### 14) Medium / Small: `cleanupNewlyAddedItems()` performs world writes and an unconditional inventory rerender every 30s
- File refs:
`scripts/manager-panel.js:225` (30s sweep registration), `scripts/manager-panel.js:1447` (`cleanupNewlyAddedItems()`)
- Issue:
The 30s sweep prunes `PanelManager.newlyAddedItems` but also iterates all actor items calling `unsetFlag(...)` for stale `isNew` flags with no `newlyAddedItems.size > 0` guard, and force-renders the inventory panel every sweep regardless of change.
- Impact:
Document writes and panel rerenders for bookkeeping while the tray is idle; item iteration scales with NPC item counts.
- Recommendation:
Only sweep (and only rerender inventory) when `newlyAddedItems.size > 0` or a tracked actor actually changed.

## Suggested Batching

- **Batch A — quick wins (1, 2, 3, 14):** small, low-risk fixes; findings 2+3 together eliminate the module's real memory leak. Ship in one patch release.
- **Batch B — combat hot path (4, 5, 6, 7, 8):** the handle rework (4) is the anchor; 5 rides along in the same file. 6–8 are independent hook-level fixes. Test HP ticks, ammo use, effect application, and multi-select during combat.
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
