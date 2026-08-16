# Squire Tray TODO List

## Tracking

| Item | Priority | LOE | Status |
|------|----------|-----|--------|
| Migrate remaining legacy V1 `Application` windows to the Blacksmith window framework | **Critical** | M | Done (13.3.19) |
| v14/v15 readiness: migrate remaining V1 Dialog call sites to Blacksmith `api.dialog` | High | M | Done (13.3.19) |
| Blacksmith (other repo): `JournalSheet` global is a hard break in v15 (`ui-journal-encounter.js:378`) | Medium | S | Open |
| Blacksmith (other repo): pin renderer leaks elements — `unplace()` GM path and `delete()` unplaced path never call `PinRenderer.removePin()` | Medium | S | Open |
| Blacksmith (other repo): `api.inventory` has no `requestGM` escape, so every write fails for a non-owner | Medium | S | Open |
| Blacksmith (other repo): promote the shared tool-window row/section components out of Squire and Curator | Medium | M | Open |
| Migrate the four hand-rolled item-transfer copies to Blacksmith `api.inventory` | High | M | Open |
| Pressure-test the transfer flow end to end after the chat card migration (player → GM approval → receiver accept) | **Critical** | S | Open |
| `executeItemTransfer` socket takes actor/item ids from any client and moves items as GM without checking the caller is entitled | High | M | Open |
| Blacksmith (other repo): a throwing card action handler is logged and swallowed, so a card that already retired reads as success | Medium | S | Open |
| Migrate chat cards to the Blacksmith Chat Cards API | High | L | Done (unreleased) |
| Blacksmith (other repo): co-sign the dnd5e `updateEncumbrance` upstream report after v14 | Low | S | Open |
| Let the handle filter which statuses it shows (`showHandleConditions` is all-or-nothing) | Low | M | Open |
| Unified tray filter bar: global type / action / equipped-prepared chips replacing the per-panel filter icons | High | L | In progress (bar is live, 14 chips on one bucket rule; remaining: inert-chip states and polish) |
| Watch: AC/movement re-render branch went live in 13.3.14 (was dead) — real cost in combat | High | S | Open |
| `PanelManager`: static-vs-instance state is unresolved; it's what let `element` go unassigned | Medium | M | Open |
| Code cleanup: remove legacy fix code | Low | M | Open |
| Modularize `manager-panel.js` | Low | L | Open |
| Party transfer refactor follow-up (`panel-party.js` vs `TransferUtils`) | Low | M | Open |
| Break `HandleManager` ↔ `PanelManager` circular import | Low | M | Open |
| Remove jQuery detection where DOM is native-only | Low | S | Open |
| Investigate expand animation (slide vs fade regression) | Medium | S | Open |
| Init order tests / load-condition panel behavior | Medium | L | Open |
| Integration tests with other Coffee Pub modules | Medium | M | Open |
| Maintain the pasteable GM integration harness (`testing/test-harness-macro.js`) as workflows evolve | Medium | S | Implemented (13.3.19) |
| Monitor init timing / event efficiency during load | Medium | M | Open |

**Priority:** urgency scale from **Critical** down to **Low** (matches section intent below).

**LOE (level of effort):** `S` small (about a couple of hours), `M` medium (about half a day to a day), `L` large (multi-day), `XL` epic / many days.


---

## CURRENT ISSUES (Fix First)

### LEGACY V1 WINDOW MIGRATION → BLACKSMITH WINDOW FRAMEWORK
- [x] **Dice Tray undocking and V2 migration (13.3.18)**: Removed the tray slot, legacy tray wrappers, and docking lifecycle, then migrated the standalone tool to `BlacksmithToolWindowBaseV2` with the Micro title bar, Window API registration, and Blacksmith-owned position persistence. The fixed compact body keeps its controls stationary and makes only the recent-roll list scroll.
- [x] **Macros undocking and V2 migration (13.3.18)**: Removed the tray slot and docking lifecycle, then migrated the standalone tool to `BlacksmithToolWindowBaseV2` with the Micro title bar, Window API registration, a dedicated body template, and Blacksmith-owned position persistence. Macro execution, favorites, reordering, external drops, slot removal, and the Macros Folder action are preserved.
- [x] **Health undocking and V2 migration (13.3.18)**: Removed the tray slot and docking lifecycle, then migrated the standalone tool to `BlacksmithToolWindowBaseV2` with the Micro title bar, Window API registration, a dedicated body template, and Blacksmith-owned position persistence. HP controls, multi-token operations, selection switching, and registration against every displayed Actor are preserved.
- [x] **Status Effects (13.3.17)**: Migrated the inline Add Effect and condition-description dialogs from `manager-handle.js` to the registered Blacksmith `StatusEffectsWindow` (`window-status-effects.js`). Uses core `CONFIG.statusEffects` / `Actor#toggleStatusEffect`, manages other ActiveEffects by ID, enriches real effect and dnd5e `@Embed` descriptions, and uses a persistent master/detail layout. Removed the legacy dialog markup, compendium parsing, and `window-descriptions.css`.
- [x] **Unified Transfer Tool (13.3.19)**: Replaced the temporary Character/User picker windows and transfer quantity/approval dialogs with one ephemeral, multi-instance `BlacksmithToolWindowBaseV2`. Inventory, Weapons, Notes, Party drops, direct tray drops, and incoming approvals share the same details/configuration/recipient/action layout using verified `api.entityList` and `api.quantitySplit`; fixed-recipient flows omit the picker, single items omit quantity, failures remain open, and every close path releases its lock. Removed the two picker classes/templates/styles, the old transfer template/CSS, and the upstreamed local quantity-control copy.

## HIGH PRIORITY

### CHAT CARDS — MIGRATED, NOT YET PROVEN IN PLAY
- [x] **Migrate to the Blacksmith Chat Cards API (unreleased).** `templates/chat-cards.hbs` deleted — a 505-line fork of Blacksmith's `cards-common.hbs`, over half of which (the whole public half: planning, timers, round, loot, movement, leader) was already unreachable. All 26 posting sites now call `chatCards.post()`; composition lives in `scripts/manager-cards.js` and Squire writes no card HTML. Buttons are registered actions rather than per-render DOM wiring, and request cards retire in place to an outcome band instead of being deleted.
- [ ] **Pressure-test transfers end to end.** Nothing here has run in a live world; verification was static only. The path that most needs exercising is player → GM approval → receiver accept, because **the GM-approval leg never worked before this change** (it called `this._sendTransferReceiverMessage`, which lives on `TransferUtils`, so it threw every time). That leg is new behaviour, not a regression risk. Also worth exercising: rejection, denial, expiry, and both the ammunition and compendium request flows.
- [ ] **`executeItemTransfer` is an unauthenticated socket.** It accepts arbitrary `sourceActorId` / `targetActorId` / `itemId` from any client and moves items with GM authority. It re-validates that the item exists and the quantity is available, but never that the caller was entitled to the transfer. The card button is now guarded against acting on someone else's request; the socket underneath is still reachable by a crafted call. Needs a decision on what authorization should look like rather than a patch — probably checking the caller against the transfer's recorded participants GM-side.
- [ ] **Blacksmith (other repo): a throwing card action handler is swallowed.** `bindCardActions` logs and continues, which is right for card robustness, but it means a handler that retires the card and *then* throws leaves a card asserting success. That is exactly how the broken GM-approval leg above went silent. Raised with Blacksmith; either surfacing the throw or offering consumers a "this action failed" path would fix it.

### V14/V15 READINESS (audited July 13, 2026 — world moves to v14 within weeks)
- [x] **AUDIT** v14 removes the *v12*-deprecated globals (AudioHelper, Sound, grid/dice/canvas-source classes, etc.) — grep confirms **zero uses** in this module. helpers.js already namespaces `renderTemplate`/`TextEditor`/`ContextMenu` (v13 style, v14-safe). (The codex data model, page subtype and sheet, audited here at the time, have since moved to Librarian.) module.json already declares `maximum: 14`.
- [x] **REFACTOR (13.3.19)** Removed all 22 legacy V1 Dialog call sites. Simple confirmations, short choices, clipboard fallback, journal selection, current JSON import forms, and current transfer quantity/approval forms now route through Blacksmith `api.dialog`. A source audit now finds zero `new Dialog`, `Dialog.confirm`, `Dialog.wait`, or `Dialog.prompt` calls in `scripts/`.

  **Follow-ups intentionally remain:**
  - Squire no longer has a JSON import surface — codex took the last one to Librarian. This stays as the standing rule: when Blacksmith publishes `api.importer`, consumers adopt it rather than deep-importing Blacksmith internals.
  - [x] Blacksmith verified `api.entityList`, `api.quantitySplit`, and per-instance action delegation; Squire built the unified ephemeral Transfer Tool and removed its upstreamed quantity-control copy.
  - The shared Export window and journal picker are Squire-owned surfaces; they do not expand Blacksmith's scope.

  **Resolved Blacksmith proposal:** See `documents/proposal-blacksmith-transfer-dialog-api.md`. The authoritative dialog behavior comes from Blacksmith's local `documentation/api/api-dialog.md`: DialogV2 closes on activation; prompt validation is a bounded reopen loop; `choose` and `wait` callbacks run after close; only a Tool window may promise in-place failure recovery and duplicate-submit protection.

- [ ] **VERIFY** First v14 session: watch the console for deprecation warnings from Squire paths and log any not already covered by the two items above.

## MEDIUM PRIORITY

### FALLOUT FROM THE `instance.element` FIX (13.3.14)

`PanelManager.instance.element` was permanently `null` — the field was declared in the constructor to match the convention every panel class follows (`this.element = html` in `render()`) and then never assigned, because `createTray`/`updateTray` only ever wrote the **static** `PanelManager.element`. Ten call sites read it. All failed silently: passing `null` to a `render()` is a no-op, and `&& instance.element` is just false. Nothing ever threw. 13.3.14 makes `element` a getter onto the static, which **revives ten code paths that have never executed in production**. Two need eyes:

- [ ] **WATCH (High, S)** `squire.js:727-731` — the global `updateActor` hook's AC/movement branch now re-renders the character and stats panels. Its own comment says AC and movement *"recompute constantly (active effects, conditions, mounts)"*, which is what the 13.3.6 perf pass was built around — but those two renders were dead, so that optimisation was never actually load-bearing. **This is new work in combat.** If the tray feels heavier, start here. (`updateHandle()` in the same branch was NOT gated and has always run.) Measure before assuming it's wrong — it may just be the intended behaviour finally working.
- [ ] **VERIFY (Medium, S)** `panel-party.js:506` — item transfer re-renders the inventory panel. Should simply be correct now, but it has never run.
- Already handled in the same change: a redundant `updateTray()` immediately after `initialize()` in `initializeSquireAfterSettings` (comment: "force a complete tray refresh") was a no-op while the field was null. Reviving the field would have made it rebuild the entire tray a second time on every startup. Removed.
- **Lesson for the base-panel work**: a declared-but-never-assigned field fails *silently* here, because both things that consume it (`render(el)` and `if (el)`) no-op on `null`. Worth an assert or a guard when panel lifecycle gets refactored — this bug was invisible for as long as it existed.

- [ ] **REFACTOR (Medium, M)** `PanelManager` keeps its state static (`element`, `currentActor`, `instance`, `viewMode`) while also being instantiated and carrying instance fields. That unresolved "singleton or object?" ambiguity is exactly what let `element` be declared on the instance and only ever assigned on the class. The getter bridges the two spellings; it does not settle the question. Settle it as part of **Modularize `manager-panel.js`** — pick one home for tray state and delete the other.

### CHARACTER SHEET CLEANUP

- [ ] **ASK (other repo: coffee-pub-blacksmith)** `api.inventory` writes to actors directly and
  has no GM-routing escape, so every call fails for a non-owner. Their `api.pins` already solves
  exactly this with `pins.requestGM('create', ...)`, so the pattern exists in their own codebase.
  With `requestGM` on inventory, Squire would not need permission checks at all — only the
  approval *experience*, which is Squire's by charter. What it blocks:
  - Player-to-player currency transfer. Today `transferCurrency` needs ownership of BOTH actors,
    so it works for a GM, or for a player moving coins between their own characters, and not
    otherwise.
  - CORRECTION (2026-08-11): this was also recorded as blocking cleanup phase 2. It does not.
    `canCleanup` is `game.user.isGM && actor.type === 'character'` (scripts/panel-control.js:36),
    so the runner is always a GM and always has write permission. Phase 2 is not gated on this.

- [x] **PHASE 2 — merge duplicate stacks.** Built 2026-08-11 in
  `scripts/utility-cleanup-merge.js`. Everything the design called for is in: snapshot-first with a
  `keepId` restore, reference remapping before deletion (favouritePanel, favoritesSyncState,
  `system.favorites`, contained-item parents, effect origins), containers excluded, uses and effects
  refused outright, and blocked groups shown with a reason rather than omitted.
  - Identity ended up as a **fingerprint** rather than the field list the design sketched: serialise
    both copies, strip per-instance bookkeeping, require the rest to be byte-identical. The named
    fields survive only to explain a mismatch in English. This is stricter than planned and that is
    the intended failure direction — the blocked list tells us which rule to relax based on what is
    actually on real sheets.

- [ ] **PHASE 2 FOLLOW-UPS**, deliberately not built yet — wait for the blocked list on real sheets:
  - **`system.identified` and `system.container` still split a group.** Equipped was relaxed on the
    reasoning that a stack can be equipped and the merged state can be resolved safely. The same
    argument may hold for those two and was deliberately not extended to them in the same pass —
    wait for real sheets to say whether it matters.
  - **Partial groups are not reported.** If three copies split into a mergeable pair and one loner,
    the pair merges and the loner is silently not mentioned. Correct, but possibly confusing.
  - **Only one level of undo.** The snapshot flag holds the last merge; a second merge overwrites it.
    Enough for the "oh no" case, not a history.
  - **The snapshot is never garbage-collected.** It holds full item data on the actor flag until the
    next merge replaces it. Worth an expiry, or clearing it once the GM has moved on.
  - **"Prefer the compendium version" is still a separate, more dangerous feature.** Merging
    quantities is arithmetic; swapping the survivor for a compendium copy is a re-import that
    discards every GM customisation. Opt-in, separately, possibly never. Phase 1's source links are
    what would make it possible.

### SHARED TOOL-WINDOW COMPONENTS

- [ ] **ASK (other repo: coffee-pub-blacksmith)** The row-and-section vocabulary every tool window
  needs now exists three times: Curator's Loot window, Squire's `styles/window-tool-shared.css`,
  and — partially — Blacksmith's own `styles/window-list.css`. Squire's copy matches Loot's
  measurements by hand, which is the interim step, not the answer: two files that agree today
  because somebody copied numbers will disagree the first time either is touched.
  - `.blacksmith-list` already covers the plain row (`-row`, `-row-img`, `-row-main`, `-row-title`,
    `-row-meta`, `-row-action`, `.is-active`) and `.blacksmith-entity` covers the selectable row.
    What is missing is the **section** — the bordered box with an uppercase accent heading, an
    optional count pill, and a head-actions slot — plus the **height chain** that lets a capped,
    resizable tool window scroll instead of growing, and a **drawn checkbox** so multi-select rows
    stop inheriting Foundry's theming of bare inputs.
  - Also missing: `-note` / `-banner` copy styles, the coin strip, and the totals rule. Those are
    less obviously general, and the coin strip in particular may belong to whoever owns currency.
  - Once it lands, Squire's `window-tool-shared.css` should shrink to nothing and be deleted.

### CROSS-MODULE WORK

- [ ] **Migrate item mutation to Blacksmith `api.inventory`.** Unblocked since 2026-08-08: the API
  shipped with `transferItem`, `transferItems`, `grantItem`, `grantItems`, currency, `stack: 'merge'`
  by default, `ignoreFlags`, and a `flags` parameter so arrival flags ride the create.
  - Four copies of `_completeItemTransfer` collapse into `transferItem` calls — `transfer-utils.js`,
    `panel-party.js`, `manager-panel.js`, and the `squire.js` socket handler. The four drop-create
    sites become `grantItem`.
  - Pass `ignoreFlags: ['coffee-pub-squire.isNew', 'coffee-pub-squire.isHandleFavorite']`, and
    `flags` for `isNew`, on every call. The quantity re-checks in the three copies become redundant.
  - The container guard in `getTransferBlocker()` **stays**: it puts the refusal in front of the
    quantity dialog rather than after it, and Blacksmith refuses the same case with
    `CONTAINER_HAS_CONTENTS`.
  - Worth doing sooner than later. One session found four separate bugs across those hand-rolled
    copies — unlinked-token classification, guard placement, prototype names, duplicate chat cards —
    every one of which the API handles centrally.

- [ ] **Revisit the dnd5e `updateEncumbrance` upstream report after the v14 migration.**
  `Actor5e#updateEncumbrance` is an unguarded check-then-create against a fixed effect id, so any two
  writes to one actor can collide. Blacksmith holds a prepared report in its `TODO-GLOBAL.md`; filing
  was deferred because a report against a system version this world cannot run earns "upgrade and
  retry". Squire offered to co-sign. Blacksmith's `enableEncumbranceGuard` mitigates it meanwhile.

### RELEASE / COMPATIBILITY

- [x] **CHORE — DONE.** `module.json` now declares `"compatibility": { "minimum": "13.12.2" }` on the Blacksmith requirement, so Foundry refuses to enable Squire against a Blacksmith too old to serve it. (The original driver, codex link resolution needing `api.compendiums` 13.8.4+, has since left for Librarian — but Squire's window, dialog, pin-free menubar and inventory usage set a higher floor anyway.)
- [ ] **BUG (other repo: coffee-pub-blacksmith) — root cause UNCONFIRMED, and no longer Squire's to chase.** Squire has no pins as of the Notes removal; kept because the analysis is worth having when Blacksmith looks at it. Symptom, reproduced in a live world: after a note pin/unpin/re-pin cycle as GM, `PinRenderer._pins` holds a DOM element for a pin id that exists in **neither** the scene's flag list **nor** the unplaced store, so every `loadScenePins` logs `updateAllPositions: No pin data for <id>` forever, and the freshly placed pin flickers and disappears. Verified with console dumps taken before and after: the scene list is byte-identical and every id in it resolves — the leak is renderer-side only.
  - **One provable gap** (`manager-pins.js:2267`): `delete()`'s `loc.location === 'unplaced'` branch removes the data and clears tags but never calls `PinRenderer.removePin()`, unlike the scene branch at `:2275`. Whether that is *this* symptom's cause is unproven — `unplace()` (`:2181`) does remove the element on both the GM and non-GM paths, so by delete-time there should be nothing left to leak. Worth closing regardless as a defensive fix.
  - **The real puzzle**: the newly created pin's scene entry vanishes without its element being removed — i.e. something drops a pin from the scene flag list on a path that doesn't go through `delete()`. Suspect a read-modify-write race on `scene.setFlag(FLAG_KEY, …)` (both `unplace()` and `delete()` read the list, filter, and write it back — a stale read would clobber a concurrently-added pin).
  - Squire 13.3.13 sidesteps the whole area (notes unpin now deletes instead of unplacing), so this is no longer blocking us; it likely still affects any consumer that unplaces.
- [ ] **BUG (Medium — other repo: coffee-pub-blacksmith)** `ui-journal-encounter.js:378` reads the bare `JournalSheet` global (`Object.values(ui.windows).find(w => w instanceof JournalSheet && ...)`). Deprecated since v13, **removed in v15** — it becomes a hard `ReferenceError` inside a hook that fires on every journal-page write, which Squire triggers constantly (imports, pin flags). Needs `foundry.appv1.sheets.JournalSheet`, and `ui.windows` on the same line is also v13-deprecated in favour of `foundry.applications.instances`.

## LOW PRIORITY

- [ ] **Manage which statuses the handle shows.** The handle renders every active effect on the actor
  (`manager-handle.js`, the `effects:` map). Add a way to filter which ones appear — conditions only
  vs all effects, hide passive item effects, or a per-condition toggle. `showHandleConditions` is
  all-or-nothing and does not cover this.

## Architecture & Code Quality

### Code Cleanup
- [ ] **PLANNED** Remove legacy code from our fixes
- [ ] **PLANNED** Modularize manager-panel.js (too large, not modular enough)
- [ ] **PLANNED** Revisit party transfer refactor goals (`panel-party.js`) now that `TransferUtils` handles most workflows; decide what parts of the old plan still add value
- [ ] **PLANNED** Break the `HandleManager` ↔ `PanelManager` circular import by passing required data via constructors or shared context
- [ ] **PLANNED** Remove jQuery detection patterns where elements are guaranteed to be native DOM (technical debt cleanup)

### Performance Optimization
- (Disabled-tab skip, lazy tab rendering, and CharacterPanel biography optimization shipped in 13.3.8)
