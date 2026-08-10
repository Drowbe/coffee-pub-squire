# Squire Tray TODO List

## Tracking

| Item | Priority | LOE | Status |
|------|----------|-----|--------|
| Migrate remaining legacy V1 `Application` windows to the Blacksmith window framework | **Critical** | M | Done (13.3.19) |
| v14/v15 readiness: migrate remaining V1 Dialog call sites to Blacksmith `api.dialog` | High | M | Done (13.3.19) |
| Notes tab: shared note + character note (scratchpad scrapped) | Medium | L | Open |
| Pins: audit note pin visibility for the same silent no-op that was fixed for codex | Medium | S | Open |
| Notes tray: drop card view; list + hover tooltip preview | Medium | M | Done (13.3.11) |
| `module.json`: declare a Blacksmith `13.8.4` minimum — link resolution silently no-ops below it | Medium | S | Open |
| Blacksmith (other repo): `JournalSheet` global is a hard break in v15 (`ui-journal-encounter.js:378`) | Medium | S | Open |
| Blacksmith (other repo): pin renderer leaks elements — `unplace()` GM path and `delete()` unplaced path never call `PinRenderer.removePin()` | Medium | S | Open |
| Keep a link-resolution test fixture in the repo (this capability broke silently once already) | Low | S | Open |
| Watch: AC/movement re-render branch went live in 13.3.14 (was dead) — real cost in combat | High | S | Open |
| `PanelManager`: static-vs-instance state is unresolved; it's what let `element` go unassigned | Medium | M | Open |
| Notes future: templates, linking, export, sharing, reactions, mentions | Low | XL | Open |
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

### NOTES TAB
- [ ] **ENHANCEMENT** Expand and optimize this section with shared party note and per-character note support (scratchpad idea dropped).
- [x] **CLEANUP** Notes tray is list-only with hover preview tooltips (no card view / card theme).

### PERFORMANCE

The codex measurements that used to anchor this section went to Librarian with the codex. What remains applies to Notes, which shares the same panel shell and the same render-everything-on-any-change design.


### PERFORMANCE: clone-and-rebind is dead weight (found July 15, 2026)

- [ ] **PERF (High, S)** Panel `_activateListeners()` clones and replaces every node before binding to it — **17 sites in `panel-notes.js`**:
  ```js
  const newBtn = pinBtn.cloneNode(true);
  pinBtn.parentNode?.replaceChild(newBtn, pinBtn);
  newBtn.addEventListener('click', ...);
  ```
  The clone-and-replace idiom exists to strip **pre-existing** listeners when re-binding to live nodes. But `_activateListeners` runs **once, immediately after `container.innerHTML = html`** — every node it touches was created microseconds earlier and has no listeners to strip. The whole dance is a no-op with a cost, paid on every render.
  - Fix: delete the clone/replace; `addEventListener` on the original node. Mechanical and safe **so long as the one-call-site-after-innerHTML invariant holds** — that was confirmed for codex, but `panel-notes.js` has a different call structure and needs its own check first.
  - Better still, per the handle: **delegate**. 13.3.6 fixed this exact pattern on `HandleManager` — it "cloned the whole `.tray-handle` (plus ~10 individual buttons) and re-attached ~15 listeners on every `updateHandle()`"; handlers are now bound once to the stable parent. Panels never got the same treatment.
  - Related, and the bigger prize: `render()` rebuilds the entire panel via `innerHTML` for any change at all. Delegation is a prerequisite for ever rendering incrementally.

### FALLOUT FROM THE `instance.element` FIX (13.3.14)

`PanelManager.instance.element` was permanently `null` — the field was declared in the constructor to match the convention every panel class follows (`this.element = html` in `render()`) and then never assigned, because `createTray`/`updateTray` only ever wrote the **static** `PanelManager.element`. Ten call sites read it. All failed silently: passing `null` to a `render()` is a no-op, and `&& instance.element` is just false. Nothing ever threw. 13.3.14 makes `element` a getter onto the static, which **revives ten code paths that have never executed in production**. Two need eyes:

- [ ] **WATCH (High, S)** `squire.js:727-731` — the global `updateActor` hook's AC/movement branch now re-renders the character and stats panels. Its own comment says AC and movement *"recompute constantly (active effects, conditions, mounts)"*, which is what the 13.3.6 perf pass was built around — but those two renders were dead, so that optimisation was never actually load-bearing. **This is new work in combat.** If the tray feels heavier, start here. (`updateHandle()` in the same branch was NOT gated and has always run.) Measure before assuming it's wrong — it may just be the intended behaviour finally working.
- [ ] **VERIFY (Medium, S)** `panel-party.js:506` — item transfer re-renders the inventory panel. Should simply be correct now, but it has never run.
- Already handled in the same change: a redundant `updateTray()` immediately after `initialize()` in `initializeSquireAfterSettings` (comment: "force a complete tray refresh") was a no-op while the field was null. Reviving the field would have made it rebuild the entire tray a second time on every startup. Removed.
- **Lesson for the base-panel work**: a declared-but-never-assigned field fails *silently* here, because both things that consume it (`render(el)` and `if (el)`) no-op on `null`. Worth an assert or a guard when panel lifecycle gets refactored — this bug was invisible for as long as it existed.

- [ ] **REFACTOR (Medium, M)** `PanelManager` keeps its state static (`element`, `currentActor`, `instance`, `viewMode`) while also being instantiated and carrying instance fields. That unresolved "singleton or object?" ambiguity is exactly what let `element` be declared on the instance and only ever assigned on the class. The getter bridges the two spellings; it does not settle the question. Settle it as part of **Modularize `manager-panel.js`** — pick one home for tray state and delete the other.

### DUPLICATION TAX (found while fixing 13.3.12)

Notes is the only one of the three panels left in Squire, so the tax itself is now Librarian's. Kept here because the *lesson* is Squire's: three panels each carried their own copy of the shell (`_refreshData` + cache, scroll preservation, collapse persistence, progress bar, import/export, filtering), and the same bug was then found and fixed independently in each.


### RELEASE / COMPATIBILITY

- [ ] **CHORE (Medium)** `module.json` declares `requires: coffee-pub-blacksmith` with **no version constraint**. 13.3.12's link resolution needs `api.compendiums` (Blacksmith **13.8.4+**); below that, `getCompendiums()` returns null and every name silently falls back to plain text with no error — exactly the failure mode 13.3.12 was written to delete. Add `"compatibility": { "minimum": "13.8.4" }` so Foundry refuses to enable Squire against a Blacksmith too old to serve it.
- [ ] **BUG (Medium — other repo: coffee-pub-blacksmith, 13.9.1) — root cause UNCONFIRMED.** Symptom, reproduced in a live world: after a note pin/unpin/re-pin cycle as GM, `PinRenderer._pins` holds a DOM element for a pin id that exists in **neither** the scene's flag list **nor** the unplaced store, so every `loadScenePins` logs `updateAllPositions: No pin data for <id>` forever, and the freshly placed pin flickers and disappears. Verified with console dumps taken before and after: the scene list is byte-identical and every id in it resolves — the leak is renderer-side only.
  - **One provable gap** (`manager-pins.js:2267`): `delete()`'s `loc.location === 'unplaced'` branch removes the data and clears tags but never calls `PinRenderer.removePin()`, unlike the scene branch at `:2275`. Whether that is *this* symptom's cause is unproven — `unplace()` (`:2181`) does remove the element on both the GM and non-GM paths, so by delete-time there should be nothing left to leak. Worth closing regardless as a defensive fix.
  - **The real puzzle**: the newly created pin's scene entry vanishes without its element being removed — i.e. something drops a pin from the scene flag list on a path that doesn't go through `delete()`. Suspect a read-modify-write race on `scene.setFlag(FLAG_KEY, …)` (both `unplace()` and `delete()` read the list, filter, and write it back — a stale read would clobber a concurrently-added pin).
  - Squire 13.3.13 sidesteps the whole area (notes unpin now deletes instead of unplacing), so this is no longer blocking us; it likely still affects any consumer that unplaces.
- [ ] **BUG (Medium — other repo: coffee-pub-blacksmith)** `ui-journal-encounter.js:378` reads the bare `JournalSheet` global (`Object.values(ui.windows).find(w => w instanceof JournalSheet && ...)`). Deprecated since v13, **removed in v15** — it becomes a hard `ReferenceError` inside a hook that fires on every journal-page write, which Squire triggers constantly (imports, pin flags). Needs `foundry.appv1.sheets.JournalSheet`, and `ui.windows` on the same line is also v13-deprecated in favour of `foundry.applications.instances`.

### PINS
- [ ] **AUDIT** Note pins likely share the silent no-op that was fixed for codex pins in 13.3.12. Pin visibility in Squire is *derived*, never configured — and the pin's `ownership`, not `config.blacksmithVisibility`, is what actually gates players. A GM editing visibility in Blacksmith's Configure Pin therefore changes nothing for players and gets silently reverted by the next sync. Codex grew a warning for this before it left for Librarian; notes never did, and derive visibility differently:
  - `createNotePin` — **hardcodes `'visible'`**, ignoring even `PIN_DEFAULTS.note.config.blacksmithVisibility`. Probably the most silent of the three: nothing derives or re-asserts it, so a GM's edit may actually stick — meaning notes may want the opposite treatment (honor it) rather than a warning.
  - Related: `pin-defaults.json` declares `config.blacksmithVisibility` for both remaining kinds and **no create path reads it** — only `.blacksmithAccess` is. In fact **no code reads the file at all**; the live defaults are `PIN_DEFAULTS` in `manager-pins.js`. Either wire the file up or delete it.
  - Also unread: no create path reads `design.config` at all, so a GM's saved "Default for [type]" **Permissions** section (which Blacksmith *does* store — see `window-pin-configuration.js`, the `has('permissions')` branch) is discarded for both pin kinds. Design/text/animation defaults are honored; permissions defaults are not. Decide whether that's intentional and document it either way.

## LOW PRIORITY

### Notes Future Enhancements
- [ ] **ENHANCEMENT** Note templates
- [ ] **ENHANCEMENT** Note linking
- [ ] **ENHANCEMENT** Export formats for notes
- [ ] **ENHANCEMENT** Note sharing
- [ ] **ENHANCEMENT** Note reactions
- [ ] **ENHANCEMENT** Note mentions

## Architecture & Code Quality

### Base Panel Class (Phase 1.4 from plan-notes)
- [ ] **PLANNED** Create `scripts/base-panel.js` — with Codex and Quests gone, Notes is the only panel this would serve in Squire. Reassess whether it belongs here at all, or travels with Notes to Blacksmith:
  - Common methods: `constructor`, `_refreshData()`, `_activateListeners(html)`, `_setupSearchFilter(html)`, `_setupTagFilter(html)`
  - Refactor `NotesPanel` to extend `BasePanel`
  - Lower priority - deferred until needed (~6-8 hours)

**Evidence from 13.3.12 that "Low" is the wrong priority** — three of that release's fixes were pure duplication tax:
  - *Scroll preservation on re-render*: quest and notes both already had it, with a comment describing the exact symptom. Codex didn't, so pinning an entry threw the GM to the top of the list. The same bug, already solved twice, shipped a third time.

Also see **FALLOUT FROM THE `instance.element` FIX** above: `PanelManager` declared `this.element` to match the very convention this base class would formalise, then never assigned it — and nothing caught that for as long as it existed, because `render(null)` and `if (null)` both no-op. A base class that owns the element lifecycle is the natural place to make that impossible rather than merely fixed.

**Suggested change of approach**: a base class over 8,328 lines is a big-bang refactor of three panels at once, which is why this has sat at Low and will keep sitting there. Extract the duplicated **concerns** one at a time instead — scroll preservation, collapse persistence, progress bar, refresh-cache — each independently shippable, each permanently deleting one bug class across all three panels. That is exactly what `manager-pins.js` did for the four pin systems, and it worked. Best first candidates (both small, both would have prevented a real 13.3.12 bug): a shared `preserveScroll()` and a shared collapse-state helper.

### Code Cleanup
- [ ] **PLANNED** Remove legacy code from our fixes
- [ ] **PLANNED** Modularize manager-panel.js (too large, not modular enough)
- [ ] **PLANNED** Revisit party transfer refactor goals (`panel-party.js`) now that `TransferUtils` handles most workflows; decide what parts of the old plan still add value
- [ ] **PLANNED** Break the `HandleManager` ↔ `PanelManager` circular import by passing required data via constructors or shared context
- [ ] **PLANNED** Remove jQuery detection patterns where elements are guaranteed to be native DOM (technical debt cleanup)

### Performance Optimization
- (Disabled-tab skip, lazy tab rendering, and CharacterPanel biography optimization shipped in 13.3.8)
