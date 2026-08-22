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
    - **CLOSED for Squire (2026-08-21).** `api.importer` now exists, as a kind registry — register a kind, supply `onValidateEntry` and `onImportEntry`, keep document construction yourself. Squire has no importable kind, so there is nothing to adopt; the rule stands for whenever one appears. The Quest-import requirements recorded against this belong to Librarian now, not here.
  - [x] Blacksmith verified `api.entityList`, `api.quantitySplit`, and per-instance action delegation; Squire built the unified ephemeral Transfer Tool and removed its upstreamed quantity-control copy.
  - [x] **Compendium search gaps closed upstream (2026-08-21).** `documentClass` is on every result
    and `searchDetailed()` reports `truncated` / `scannedSources` / `skippedSources`. Squire already
    consumes both — `utility-compendium-search.js` takes `documentClass` as given rather than
    deriving it from the type token, and reads `truncated` rather than testing
    `results.length === limit`. Nothing to change.
  - [x] **Pin bumped and the `api.search` fallback deleted (2026-08-21).** `module.json` required
    Blacksmith **13.12.2**, which was never true — Squire calls
    `api.inventory.registerTransientFlag` and depends on the 13.19.0 stack-merge behaviour, so the
    honest floor is **13.19.0**. With the pin there, `searchDetailed` (13.14.2) is always present and
    the fallback could not run. Remember a `module.json` change needs a Foundry Setup round-trip,
    not an F5.
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

- [x] **CURRENCY CONVERSION IS VERIFIED, NOT ASSUMED.** Built 2026-08-21. `scanCurrency` mirrors the
  arithmetic for the preview while `applyCleanup` writes through dnd5e's `CurrencyManager` — two
  implementations of one sum. `applyCleanup` re-reads the total afterwards via the shared
  `currencyTotal()`, restores the original coins if it moved, marks the step failed, and reports it
  in the receipt and a toast. Decided against a `dryRun` flag in the same pass: the window is the
  dry run, and a second write path would only drift out of step with the real one.

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
  - Pass `ignoreFlags: ['coffee-pub-squire.isNew']`, and `flags` for `isNew`, on every call. The
    quantity re-checks in the three copies become redundant. `isNew` is the only per-ITEM flag
    Squire writes, so it is the only one that can affect merge identity — handle membership lives
    in the actor flag `favoriteHandle`, which items know nothing about.
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

### INVENTORY BAG VIEW (2026-08-22)

- [x] **Shipped.** A toggle at the head of the Inventory title bar switches between the flat list and
  a grouping by container: General first, then one section per bag, same categories inside each.
  Per-user (`inventoryViewMode`). A container appears only as its own heading, never also as a row;
  bag sections are flat (a bag inside a bag is its own top-level section); empty bags keep their
  section; a broken `system.container` back-reference falls into General.
  - The five copy-pasted category blocks in `panel-inventory.hbs` became one inline partial plus a
    loop over `INVENTORY_CATEGORIES` first, which is what made this a data change rather than a
    second copy of the whole list. Sorting moved into `_categorise()` with it: bag view slices the
    same items along a different axis, so it must sort after the slice.
  - `_updateHeadersVisibility()` scopes its row lookup to `.inventory-group` where there is one.
    Bag view repeats every category once per container, so a panel-wide query kept empty headings
    alive in one bag because a different bag had rows of that category.

- [x] **BUG, long-standing: containers were filtered out of the Inventory panel entirely.** The type
  filter in `_getItems()` read dnd5e's OLD container type name (`backpack`) and never gained the
  current one (`container`), so on any world running a current dnd5e no bag reached the panel — the
  Containers category has never rendered there, and bag view had nothing to group by. Both names are
  accepted now, and `itemsByType` is keyed off the category type rather than the raw item type so the
  header's filter icons resolve either way.
  - **Why it stayed invisible for so long, and the lesson:** the per-row sack icon and the click that
    opens the bag both resolve with `actor.items.get(id)` — straight off the actor, ignoring the
    panel's list. So everything that reached PAST the filtered list kept working perfectly. A list
    that is wrong is only visible to the things that read it; audit the filter, not the symptoms.
  - `squire.js` carried the same stale list twice more: the `updateItem` hook that decides which
    panels to re-render, and `getIconForItemType()`. Both fixed. If a third container-type list ever
    appears, it belongs next to `inventoryCategoryType()` in `panel-inventory.js`.

## LOW PRIORITY

- [ ] **CONSIDER an overflow menu ("...") on panel rows.** Every row's `.tray-buttons` cluster has
  grown: an inventory row can carry a lightbulb, a sack, a shield, a send arrow, a heart and a
  feather — six targets in a 400px column, most of them rarely used, all of them competing with the
  row's own name for width. Worth trying a "..." that holds the tail of that list and leaves only
  the two or three that get used every session inline.
  - The judgement to make first is **which icons are actually frequent**, not how to build the menu.
    A "..." that hides the thing people reach for is worse than six icons.
  - Note the same cluster is styled and delegated from several panels; whatever pattern this takes
    should land in one place, the way `.squire-handle-control` did for the handle.

- [ ] **Drag-and-drop reorder in the Favorites panel.** The handle got this on 2026-08-21
  (`HandleManager._insertHandleFavorite`, drop-above semantics, insertion line); the Favorites panel
  is still in whatever order `favoritePanel` happens to hold. Same interaction, different list.
  - Reuse the handle's rules rather than reinventing them: drop on a row inserts ABOVE it, drop past
    the end appends, dropping on itself is a no-op, and the item is removed before re-insertion so
    one code path serves both a reorder and an add.
  - Panel rows are already `draggable="true"` and the tray already owns a delegated `dragstart` that
    emits `item.toDragData()` for them — which is the payload that means "transfer this item", so a
    reorder must be told apart from it the way the handle does, with its own flag and its own
    Squire-only payload. Otherwise dragging a favorite onto the canvas duplicates the item.

- [ ] **Manage which statuses the handle shows.** The handle renders every active effect on the actor
  (`manager-handle.js`, the `effects:` map). Add a way to filter which ones appear — conditions only
  vs all effects, hide passive item effects, or a per-condition toggle. `showHandleConditions` is
  all-or-nothing and does not cover this.

## Architecture & Code Quality

### CSS

- [x] **DONE.** The stylesheets were audited and cleaned end to end. A live bug came out of it:
  `@keyframes` names are global, `pulse` was defined three times here and a fourth by core Foundry,
  and ours won — so Squire was displacing Foundry's own `#pause.paused` indicator for every world
  that installed it. Everything is `squire-`-prefixed now. Also gone: 28 dead rules, two dead
  stylesheets, and 26 of 35 `!important`. Shared components (portrait, roll overlay, badges,
  headers, empty state, handle controls) are defined once rather than per panel.
- [x] **DONE.** `tray.css` (1,376 lines) split into eight files by concern. The split is a verified
  pure move — `@import` order in `default.css` reproduces the original source order exactly and
  **must not be sorted or regrouped**; several rules depend on being read after ones in an earlier
  file.
- [ ] **OPEN — needs the running app, not source.** Six `!important` on `.squire-tool-row-img`
  (`window-tool-shared.css`, base and the `max-width: 430px` variant) look unearned: at (0,1,0) they
  already beat every rule that can reach them, and dnd5e's `img` sizing is all scoped to
  `.dnd5e2.sheet.*`, which the tool windows are not. Left in place because they sit inside a Foundry
  application window where other modules' CSS lands. Remove both sets together — the second exists
  only to beat the first — and check the Transfer and Cleanup windows at both widths.
- [ ] **OPEN — cosmetic.** Eight `border: 0px solid <colour>` declarations that draw nothing but read
  as though they do. Verified harmless: nothing anywhere sets `border-width` alone on those elements,
  so no stashed colour is ever revealed. Left alone rather than churn a diff for legibility.
- [ ] **OPEN — a look decision, not a cleanup.** `--squire-rep-hostile` / `-neutral` / `-friendly`
  (`panel-party.css`) are consumed with fallbacks but never defined, so the fallback always wins.
  Either define them as real theme hooks or inline the colours.

### HANDLE REDESIGN (2026-08-21)

Shipped as one pass. The handle is a **status spine, not a second menu**: status is what
changes without you touching it, a menu is what you go looking for, and a 42px column was an
excellent spine and a terrible menu.

- [x] One width (60px) and one layout, in every tray state. A two-layout version — full column
  when closed, controls only when open — was built and withdrawn the same day: a **pinned tray is
  open permanently**, so pinning meant the reduced handle forever, and the duplication argument was
  only ever true of favorites since HP and conditions are nowhere in the tray. The variable width
  went with it, being paid for entirely by the variable content.
- [x] One column edge: portrait, HP chip, favorites and the conditions grid are all exactly the
  column width and flush on both sides. Only the two tray controls keep Foundry's 32px. Conditions
  pack two to a row *inside* their own full-width group.
- [x] HP rail on the outer edge, filled by `HandleManager._updateHpRail()`. It lives in
  `tray.hbs` rather than the handle partials because it sits in the handle's right padding,
  outside `.tray-handle-content-container`, whose `overflow: hidden` would clip it.
- [x] The 180° rotation and the vertical writing mode are gone; templates are authored in
  visual order and the health bar is an ordinary horizontal chip.
- [x] Character/party name dropped from the handle. Pin at the head, collapse caret at the foot,
  matching core Foundry's sidebar collapse — grouping them at the top was tried and reverted.
- [x] **No favorites cap.** `HANDLE_FAVORITES_LIMIT`, the `handleFavoritesMax` setting, the
  "handle is full" toast, `normalizeHandleFavorites()` and the auto-favorite truncation are all
  gone; `HandleManager._trimHandleFavorites()` decides from the strip's actual height instead.
- [x] The conditions button takes one grid cell and carries the active-condition count as a
  corner badge, rather than spanning both columns.

- [x] **Conditions count as a badge on the button** — centred over the glyph in minimal (a 20px
  control cannot hold a glyph and a numeral side by side), beside it in full (44px has the room).
  The count is the one thing that survives the grid running out of space, since the icons stop
  answering "how many am I under" the moment the column clips them.
- [x] **BUG: the pin, width toggle and caret stopped responding once the favorites list was long
  enough.** The trim measured against `.tray-handle-content-container`, which CONTAINS those two
  bottom buttons, so the column was allowed to run down over them and the overflowing art ate their
  clicks. Trim and overflow fade both measure `.tray-handle-content-wrapper` now — the flex item
  that actually stops above the buttons — and the wrapper clips as belt to those braces, since the
  trim runs after a render and could otherwise spill for a frame.

- [ ] **NEEDS EYES IN A LIVE WORLD.** Most of this has now been seen rendered and iterated on;
  what remains unverified is listed below. Specifically worth
  checking:
  - Conditions at 20px: legible, or too small to recognise? The grid is one variable
    (`--squire-handle-condition-size`) if it needs to go up — but the column is 44 wide, so 2-up
    tops out at 20 with the 4px gap. Bigger than that means 1-up, or a wider handle.
  - **The favorites trim.** `_trimHandleFavorites()` measures after every render and every
    resize and hides what does not fit. Worth watching that it does not flicker on rapid
    resizes, and that the cut always lands on a whole icon. It reads every rect before writing
    any class to avoid layout thrash; if it ever feels slow with a large list, that is the first
    thing to check has not been undone.
  - **What the trim does NOT catch**: anything that changes the strip's height without a window
    resize. Pinning and the Blacksmith menubar offset are the candidates. If favorites go stale
    after one of those, the fix is another call site, not a different algorithm.
  - A large party in party view: members are 36px + a 14px chip + 8px gap, so roughly 58px
    each. Past six or seven the column will overflow and the bottom fade takes over.
  - `#ui-left` sits 18px further right than it did. If that crowds anything, the handle's
    closed width is the knob.

### HANDLE AS A DROP TARGET

**Phase 1 shipped 2026-08-21.** Drag any panel row onto the handle; right-click a handle icon to
take it off. The handle and the Favorites panel are unrelated lists now. Decisions taken:
right-click removal (not a menu); the heart stays panel-only; compendium-search drops rejected.

- [x] **Width toggle (2026-08-22).** Minimal (34px, 20px column) / Full (60px, 44px column,
  conditions 2-up), per user, stored in `handleMode`, toggled from the button above the caret. The
  setting holds in every tray state — open, closed, pinned — and nothing overrides it. Same zones
  in both; only sizes change. Dragging and right-click removal work in both.
  - Two earlier versions conditioned the handle on `.expanded` (first hiding content, then
    narrowing) and both died on the pinned tray: pinned is open permanently, so anything keyed on
    "while the tray is open" is permanent for those users. Do not reintroduce it.

- [x] **Reordering (2026-08-22).** Drag a handle icon to move it; drop on an icon to land above
  it, drop on empty strip to land at the end. Same rule for new items dragged in from a panel.
  `HandleManager._insertHandleFavorite()` is the single write path for both.
  - Known edge: because a drop always lands ABOVE the icon under the pointer, there is no way to
    aim at "after the last icon" except by dropping on empty strip below it — and when the list
    exactly fills the column there is no empty strip. Rare, and the alternative (splitting each
    icon at its midpoint) makes every other drop ambiguous. Revisit only if it bites.

- [ ] **PHASE 2 — real slots.** Phase 1 appends to a dense list, which means every add reshuffles
  nothing but every *removal* closes the gap, so position is not stable. Slots make it stable:
  index-addressed, gaps allowed, drop lands where you aimed. The data migrates for free — today's
  `[a, b, c]` already reads as slots 0/1/2 and nulls give you gaps.
  - [x] **DECIDED: slots from the top, index 0 at the top, trim from the bottom** — which is what
    phase 1 already does, so neither the trim direction nor the mental model changes. Bottom-
    anchoring gives strictly more positional stability but only works if index 0 sits at the
    bottom, and inverting reading order in a vertical list to fix a second-order problem is a bad
    trade. The drift gets fixed at its source instead: cap the conditions grid at two rows and let
    the count on the button report the rest, which bounds the movement to one step. If it still
    bites in play, bottom-anchoring is a CSS change plus reversing the trim direction.
  - [ ] Cap the conditions grid at two rows (the prerequisite for the above).
  - [ ] Placeholders during drag: show the empty slots so capacity is visible at the moment you
    need to know it. Capacity is not a stored number — it is `floor(available height / slot
    height)`, the same measurement `_trimHandleFavorites()` already makes.

- [ ] **Not in scope, decided:** dropping compendium-search results onto the handle. Rejected for
  free by the `_trayItemDragActive` gate; if it is ever wanted it means add-to-actor-then-slot.

- [ ] **NOT BUILT — favorites fan-out.** The other radical option from the design pass: hovering
  the handle pushes the favorite icons out horizontally into the canvas instead of stacking them
  vertically, so they stop paying vertical rent and the cap can rise above five. Deferred
  deliberately — the two-layout change is the one that had to land first, and this is a new
  interaction rather than a layout.

### BLACKSMITH CONTRACT CHANGES (2026-08-21)

- [x] **Base classes come from the bridge module now.**
  `import { BlacksmithToolWindowBaseV2 } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js'`
  in `window-cleanup.js` and `window-transfer-tool.js`, replacing the top-level `module.api` read
  and its throw-if-absent guard. Blacksmith's own documentation had told consumers to read the class
  off `module.api` at module scope, which cannot work — `extends` evaluates before `game` exists,
  and ESM caches the failure, so the throw disabled the module for the session. Merchant broke a
  live world on it on 2026-08-19. Also removed: the `ready`-hook probe in `squire.js` that tested
  `blacksmith.BlacksmithWindowBaseV2` and `return`ed from the whole tray setup if it was missing —
  the windows no longer come from that surface, so the probe could only ever produce a false
  negative that cost the user their tray.
  - The dynamic `import()` at each call site **stays**, and its comments now say why: lazy loading
    for a rarely-opened tool, not the timing hazard that is gone.

- [ ] **BLOCKING RELEASE — set the pin to Blacksmith's release number before Squire ships.**
  Confirmed 2026-08-22: the two modules go out in the same round, so the only step left is naming
  the number once Blacksmith's release is cut. The bridge's base-class
  re-export is in Blacksmith's **[Unreleased]** section, not in 13.19.0. Squire now requires it, so
  `module.json` must name Blacksmith's next version number the moment that release is cut. **Squire
  must not ship before Blacksmith does**; against 13.19.0 the import fails to link and the cleanup
  and transfer windows die on open.

- [x] **`canCancel` — nothing to migrate, by standing agreement.** Blacksmith made `pre*` hook
  cancellation opt-in, which removes the veto trap. Squire's position, agreed with Blacksmith on
  2026-08-08 and recorded in their TODO so nobody files it as cleanup, is unchanged: `pre*` hooks
  stay on Squire's own `registerNativeHook()` permanently. A hook that can cancel an operation
  world-wide is the one place where fewer layers between Squire and Foundry beats consistency. The
  lone native registration in `squire.js` (the `preCreateItem` `isNew` stamp) is deliberate.

- [x] **`api.inventory` merge fix — nothing to remove.** Squire has no local workaround for
  non-merging stacks, because Squire's transfers still create and delete items themselves rather
  than going through `api.inventory`. The fix lands for Squire when that migration does; the
  `registerTransientFlag` call for `isNew` is already in place for it. See the container-guard note
  in `helpers.js` → `getTransferBlocker`.

### BLACKSMITH ADOPTION — RESIDUE (closed 2026-08-21)

Blacksmith cleared us to delete the adopted tool copies (Dice Tray, Macros, Health, Status Effects),
verified live with Squire disabled on 2026-08-09. **The code copies were already gone** — deleted at
the time of the move, see `documents/plan-module-split.md`. What was still standing was the residue
nothing compiles or renders, so nothing complained:

- [x] Dead CSS: `#macros-toggle`, `#dicetray-toggle`, `#health-toggle` hover rules, and
  `[data-panel]` rules for `dicetray`, `macros`, `experience`, `abilities`, `stats`. None of those
  ids or attributes has existed in a template since the move. Checked against the twelve live
  `data-panel` values plus `PANEL_TYPES`, which is where the only runtime-composed selectors come
  from.
- [x] Two settings headings standing over nothing: `headingH3MenubarConfiguration` (Squire registers
  no menubar tools at all any more) and `headingH3HealthConfiguration` (its settings went to
  Blacksmith; `showHandleHealthBar` lives under Handle Configuration). Both rendered an empty
  subheading in the settings UI.
- [x] `documents/architecture-squire.md` listed fifteen scripts that do not exist — the adopted
  windows, and the Librarian-era notes/codex/quest panels alongside them. Panels, Windows,
  Utilities, the project tree, Menubar Tools and Pins are now checked against the file system.
  `architecture-character.md` and `architecture-party.md` had the same rot in their handle sections.

- [ ] **OPEN — `resources/pin-icons.json` has no reader in this repo.** Left in place rather than
  deleted: it is fetched by URL, not imported, so a grep here cannot prove Librarian is not fetching
  it from Squire's path. Ask before removing.

### Code Cleanup
- [ ] **PLANNED** Remove legacy code from our fixes
- [ ] **PLANNED** Modularize manager-panel.js (too large, not modular enough)
- [ ] **PLANNED** Revisit party transfer refactor goals (`panel-party.js`) now that `TransferUtils` handles most workflows; decide what parts of the old plan still add value
- [ ] **PLANNED** Break the `HandleManager` ↔ `PanelManager` circular import by passing required data via constructors or shared context
- [ ] **PLANNED** Remove jQuery detection patterns where elements are guaranteed to be native DOM (technical debt cleanup)

### Performance Optimization
- (Disabled-tab skip, lazy tab rendering, and CharacterPanel biography optimization shipped in 13.3.8)
