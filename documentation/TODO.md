# Squire Tray TODO List

## Tracking

| Item | Priority | LOE | Status |
|------|----------|-----|--------|
| Migrate remaining legacy V1 `Application` windows to the Blacksmith window framework | **Critical** | M | Done (13.3.19) |
| v14/v15 readiness: migrate remaining V1 Dialog call sites to Blacksmith `api.dialog` | High | M | Done (13.3.19) |
| Migrate the four hand-rolled item-transfer copies to Blacksmith `api.inventory` | High | M | Open |
| Pressure-test the transfer flow end to end after the chat card migration (player → GM approval → receiver accept) | **Critical** | S | Open |
| `executeItemTransfer` socket takes actor/item ids from any client and moves items as GM without checking the caller is entitled | High | M | Open |
| Migrate chat cards to the Blacksmith Chat Cards API | High | L | Done (unreleased) |
| Let the handle filter which statuses it shows (`showHandleConditions` is all-or-nothing) | Low | M | Open |
| Unified tray filter bar | High | L | Done (unreleased) -- superseded by section tabs; 14 chips are now 5 tabs, 5 action chips and 2 toggles, with favourites in a view of its own |
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
| Add disposition to the character card | Medium | S | Open |
| Pinned tray on load no longer shifts the Foundry UI | **Critical** | S | Open |
| Walk both user guides in a running world; screenshots corrected five claims, the rest are unchecked | High | S | Open |
| Decide what happens to `product/`, now that `documentation/assets/` carries the real screens | Low | S | Open |

**Priority:** urgency scale from **Critical** down to **Low** (matches section intent below).

**LOE (level of effort):** `S` small (about a couple of hours), `M` medium (about half a day to a day), `L` large (multi-day), `XL` epic / many days.

---

## HIGH PRIORITY

### CHAT CARDS — MIGRATED, NOT YET PROVEN IN PLAY
- [ ] **Pressure-test transfers end to end.** Nothing here has run in a live world; verification was static only. The path that most needs exercising is player → GM approval → receiver accept, because **the GM-approval leg never worked before this change** (it called `this._sendTransferReceiverMessage`, which lives on `TransferUtils`, so it threw every time). That leg is new behaviour, not a regression risk. Also worth exercising: rejection, denial, expiry, and both the ammunition and compendium request flows.

- [ ] **`executeItemTransfer` is an unauthenticated socket.** It accepts arbitrary `sourceActorId` / `targetActorId` / `itemId` from any client and moves items with GM authority. It re-validates that the item exists and the quantity is available, but never that the caller was entitled to the transfer. The card button is now guarded against acting on someone else's request; the socket underneath is still reachable by a crafted call. Needs a decision on what authorization should look like rather than a patch — probably checking the caller against the transfer's recorded participants GM-side.

### V14/V15 READINESS (audited July 13, 2026 — world moves to v14 within weeks)

- [ ] **VERIFY** First v14 session: watch the console for deprecation warnings from Squire paths and log any not already covered by the two items above.

## MEDIUM PRIORITY

### DOCUMENTATION

- [ ] **Retire `product/`.** `documentation/assets/` now carries eleven current screens, so the seven
  in `product/` are superseded and nothing references them. Three of them document Quests, the Codex
  and Notes, which are Librarian's and Blacksmith's now, so they may be worth handing over rather than
  deleting outright. The other four show a five-tab strip against the two tabs the tray has, and are
  only misleading.

- [ ] **Finish walking the user guides in a running world.** The screenshots corrected five claims that
  reading the source could never have caught: the panel header reads Summary rather than Character
  Summary, the Party tab has a Party Health panel that was not documented at all, the compendium mode
  replaces the filter bar as well as the panel stack, the tickbox sits under the search box rather than
  under the results, and Cleanup's undo covers the merge alone -- the window says in as many words that
  there is no undo for the run.
  - Still unchecked, because no screenshot covers them: the order and grouping of the settings page's
    headings, whether shift-click solos a filter chip within its group the way the tooltips imply,
    whether the character switcher chips appear when and how they are described, and every claim in the
    who-can-do-what table from the player's side.
  - The settings guide has no screenshots at all and is entirely source-derived.

### FALLOUT FROM THE `instance.element` FIX (13.3.14)

`PanelManager.instance.element` was permanently `null` — the field was declared in the constructor to match the convention every panel class follows (`this.element = html` in `render()`) and then never assigned, because `createTray`/`updateTray` only ever wrote the **static** `PanelManager.element`. Ten call sites read it. All failed silently: passing `null` to a `render()` is a no-op, and `&& instance.element` is just false. Nothing ever threw. 13.3.14 makes `element` a getter onto the static, which **revives ten code paths that have never executed in production**. Two need eyes:

- [ ] **WATCH (High, S)** `squire.js:727-731` — the global `updateActor` hook's AC/movement branch now re-renders the character and stats panels. Its own comment says AC and movement *"recompute constantly (active effects, conditions, mounts)"*, which is what the 13.3.6 perf pass was built around — but those two renders were dead, so that optimisation was never actually load-bearing. **This is new work in combat.** If the tray feels heavier, start here. (`updateHandle()` in the same branch was NOT gated and has always run.) Measure before assuming it's wrong — it may just be the intended behaviour finally working.

- [ ] **VERIFY (Medium, S)** `panel-party.js:506` — item transfer re-renders the inventory panel. Should simply be correct now, but it has never run.
- Already handled in the same change: a redundant `updateTray()` immediately after `initialize()` in `initializeSquireAfterSettings` (comment: "force a complete tray refresh") was a no-op while the field was null. Reviving the field would have made it rebuild the entire tray a second time on every startup. Removed.
- **Lesson for the base-panel work**: a declared-but-never-assigned field fails *silently* here, because both things that consume it (`render(el)` and `if (el)`) no-op on `null`. Worth an assert or a guard when panel lifecycle gets refactored — this bug was invisible for as long as it existed.

- [ ] **REFACTOR (Medium, M)** `PanelManager` keeps its state static (`element`, `currentActor`, `instance`, `viewMode`) while also being instantiated and carrying instance fields. That unresolved "singleton or object?" ambiguity is exactly what let `element` be declared on the instance and only ever assigned on the class. The getter bridges the two spellings; it does not settle the question. Settle it as part of **Modularize `manager-panel.js`** — pick one home for tray state and delete the other.

### CHARACTER SHEET CLEANUP

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

### TRAY ROW BEHAVIOUR

- [ ] **Follow-up worth considering:** the overlay is still a d20 on a container row, which now
  promises a roll and delivers an open. A sack glyph for containers would make the icon say what
  the click does. Small, and only worth doing if the mismatch actually reads as wrong in play.

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

- [ ] **NEEDS EYES IN A LIVE WORLD.** The redesign has been iterated on in a running world; these
  are the parts that still have not been judged in play:
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

- [ ] **PHASE 2 — real slots.** Phase 1 appends to a dense list, which means every add reshuffles
  nothing but every *removal* closes the gap, so position is not stable. Slots make it stable:
  index-addressed, gaps allowed, drop lands where you aimed. The data migrates for free — today's
  `[a, b, c]` already reads as slots 0/1/2 and nulls give you gaps.
  - **DECIDED: slots from the top, index 0 at the top, trim from the bottom** — which is what
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

### Code Cleanup
- [ ] **OPEN — `resources/pin-icons.json` has no reader in this repo.** Left in place rather than
  deleted: it is fetched by URL, not imported, so a grep here cannot prove Librarian is not fetching
  it from Squire's path. Ask before removing.

- [ ] **PLANNED** Remove legacy code from our fixes

- [ ] **PLANNED** Modularize manager-panel.js (too large, not modular enough)

- [ ] **PLANNED** Revisit party transfer refactor goals (`panel-party.js`) now that `TransferUtils` handles most workflows; decide what parts of the old plan still add value

- [ ] **PLANNED** Break the `HandleManager` ↔ `PanelManager` circular import by passing required data via constructors or shared context

- [ ] **PLANNED** Remove jQuery detection patterns where elements are guaranteed to be native DOM (technical debt cleanup)

### Performance Optimization
- (Disabled-tab skip, lazy tab rendering, and CharacterPanel biography optimization shipped in 13.3.8)
