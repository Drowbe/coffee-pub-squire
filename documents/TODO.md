# Squire Tray TODO List

## Tracking

| Item | Priority | LOE | Status |
|------|----------|-----|--------|
| Migrate 5 legacy V1 `Application` windows to the Blacksmith window framework | **Critical** | L | Open |
| v14/v15 readiness: migrate remaining V1 `Dialog`/`Dialog.confirm` call sites to `DialogV2` (`ImagePopout` ✓ done — all 4 sites on AppV2 signature) | High | M | Open |
| Codex data model: custom `JournalEntryPage` subtype, no migration — re-import converts (see `plan-codex-datamodel.md`) | High | L | Planned |
| Macros: dedupe `panel-macros.css` / `window-macros.css` drop-target styles | Medium | M | Open |
| Notes tab: shared note + character note (scratchpad scrapped) | Medium | L | Open |
| Notes tray: drop card view; list + hover tooltip preview | Medium | M | Done (13.3.11) |
| Codex: clicking a tag filters list by that tag | Medium | M | Open |
| Codex: “new” flag on added items until client refresh | Medium | S | Open |
| Codex: drag token to manual add fills description from bio | Medium | M | Open |
| Codex + Quest: resolve plain-text names to UUIDs on import via Blacksmith `api.compendiums` | Medium | M | Done (13.3.10) |
| Pins: audit quest/note pin visibility for the same silent no-op fixed for codex | Medium | S | Open |
| Quest: same latent trim-match collapse bug that was live in codex (`panel-quest.js:4117`) | Medium | S | Open |
| Codex: applying a tag filter permanently wipes `codexCollapsedCategories` (`panel-codex.js:717`) | Medium | S | Open |
| `module.json`: declare a Blacksmith `13.8.4` minimum — link resolution silently no-ops below it | Medium | S | Open |
| Blacksmith (other repo): `JournalSheet` global is a hard break in v15 (`ui-journal-encounter.js:378`) | Medium | S | Open |
| Keep a link-resolution test fixture in the repo (this capability broke silently once already) | Low | S | Open |
| Perf: delete pointless clone-and-rebind in panel `_activateListeners` (~2,200 needless DOM clones/render at 314 entries) | High | S | Open |
| Perf: cache codex link enrichment — ~314 sequential `enrichHTML` awaits on every render | High | S | Open |
| Codex: `related` entries + retain-unresolved links + Auto-Link tool (see `plan-codex-datamodel.md` Phase 4) | High | L | Implemented (13.3.10) — needs in-game verification |
| Notes future: templates, linking, export, sharing, reactions, mentions | Low | XL | Open |
| Quest future: relationships, timeline, templates, automation, chains, etc. | Low | XL | Open |
| Base panel class (`base-panel.js`) + refactor Codex/Notes/Quest panels | Low | L | Open |
| Code cleanup: remove legacy fix code | Low | M | Open |
| Modularize `manager-panel.js` | Low | L | Open |
| Party transfer refactor follow-up (`panel-party.js` vs `TransferUtils`) | Low | M | Open |
| Break `HandleManager` ↔ `PanelManager` circular import | Low | M | Open |
| Remove jQuery detection where DOM is native-only | Low | S | Open |
| Investigate expand animation (slide vs fade regression) | Medium | S | Open |
| Init order tests / load-condition panel behavior | Medium | L | Open |
| Integration tests with other Coffee Pub modules | Medium | M | Open |
| Monitor init timing / event efficiency during load | Medium | M | Open |

**Priority:** urgency scale from **Critical** down to **Low** (matches section intent below).

**LOE (level of effort):** `S` small (about a couple of hours), `M` medium (about half a day to a day), `L` large (multi-day), `XL` epic / many days.


---

## CURRENT ISSUES (Fix First)

### LEGACY V1 WINDOW MIGRATION → BLACKSMITH WINDOW FRAMEWORK
- [ ] **REFACTOR (Critical)** Migrate the five remaining legacy `Application` (V1) windows to the Blacksmith window framework (`registerWindow`/`openWindow`, base `HandlebarsApplicationMixin(ApplicationV2)`, five-zone layout — see https://github.com/Drowbe/coffee-pub-blacksmith/wiki/API:-Window). The notes/codex/quest windows are already on the framework; these are the holdouts:
  - `window-health.js` (`HealthWindow`) — **do first**; used mid-combat. Carries a `_activateCoreListeners()` override hack to suppress a V1 form-handling crash, hand-rolled position persistence (`healthWindowPosition` setting), and shares `panel-health.hbs` with the in-tray panel via `position`/`isHealthPopped` branching — the migration should split the window template out (body zone = the one scroll region, which structurally prevents the nested-scrollbox class of bug patched in CSS for 13.3.6).
  - `window-dicetray.js` (`DiceTrayWindow`)
  - `window-macros.js` (`MacrosWindow`)
  - `window-characters.js` (`CharactersWindow`)
  - `window-users.js` (`UsersWindow`)
  - Why critical: V1 `Application` is deprecated and on Foundry's removal path — this becomes forced breakage at a future core update; migrating now is on our schedule, later is on Foundry's. Also unifies Squire on one window stack (framework handles positioning, sizing constraints, theming, `data-action` delegation) and lets us delete the V1 workaround code.
  - Per window: rewrite template into the zone contract (no shared tray template), convert listeners to `data-action` delegation, register via `registerWindow` + `unregisterWindow` in the `disableModule` hook, drop hand-rolled position-saving where the framework covers it. Preserve the `actor.apps` registration/cleanup behavior added in 13.3.5.

## HIGH PRIORITY

### V14/V15 READINESS (audited July 13, 2026 — world moves to v14 within weeks)
- [x] **AUDIT** v14 removes the *v12*-deprecated globals (AudioHelper, Sound, grid/dice/canvas-source classes, etc.) — grep confirms **zero uses** in this module. helpers.js already namespaces `renderTemplate`/`TextEditor`/`ContextMenu` (v13 style, v14-safe). The codex data model, page subtype, and sheet use v13+ AppV2 APIs that carry into v14 unchanged. module.json already declares `maximum: 14`.
- [ ] **REFACTOR** The *v13*-deprecated APIs still run in v14 with console warnings but are removed in v15/16 — this is the real deadline for: the 5 V1 `Application` windows (Critical item above) and the V1 `Dialog`/`Dialog.confirm` call sites across ~14 files (heaviest: panel-quest ×5, panel-codex ×4, panel-notes ×3, utility-journal ×3). Migrate dialogs to `foundry.applications.api.DialogV2`. Mechanical work; batch by file. (`ImagePopout` ✓ completed July 14, 2026 — all 4 call sites use `foundry.applications.apps.ImagePopout` with the AppV2 options signature.)
- [ ] **VERIFY** First v14 session: watch the console for deprecation warnings from Squire paths and log any not already covered by the two items above.

### CODEX DATA MODEL (custom page subtype)
- [ ] **REFACTOR** Replace HTML-parsing of codex journal pages with a module-defined `JournalEntryPage` subtype (`coffee-pub-squire.codex`): structured fields in `page.system` via a `TypeDataModel` (schema validation, no parsing), Expanded Details in native `page.text.content`, custom page sheet for view/edit. **No migration** — content will be re-imported and re-pinned; import replaces legacy text pages with typed pages, making re-import the conversion path. Full design and phased plan in `documents/plan-codex-datamodel.md`. Notes and Quest panels adopt the same pattern afterward, in that order.

## MEDIUM PRIORITY

### MACROS CSS DUPLICATION
- [ ] **CLEANUP** Remove duplicate CSS definitions for drop target styles between `panel-macros.css` and `window-macros.css`:
  - `.macro-slot.drop-target-slot` is duplicated identically in both files (should be in `panel-macros.css` only)
  - `[data-panel="macros"].macro-drop-target` in `window-macros.css` is too general and conflicts with specific selectors in `panel-macros.css`
  - Keep window-specific `#squire-macros-window.macro-drop-target` in `window-macros.css`
  - Keep tray/popout specific selectors in `panel-macros.css`
  - Consolidate shared styles to avoid conflicts and maintenance issues

### NOTES TAB
- [ ] **ENHANCEMENT** Expand and optimize this section with shared party note and per-character note support (scratchpad idea dropped).
- [x] **CLEANUP** Notes tray is list-only with hover preview tooltips (no card view / card theme).

### CODEX TAB
- [ ] **ENHANCEMENT (Designed — `plan-codex-datamodel.md` Phase 4)** `related` codex-to-codex entries, retain-unresolved links, and a rescan tool. Three connected pieces: (1) `links` keeps `{name, type, uuid?}` and renders unresolved names as plain text instead of discarding them — a codex is authored incrementally, so "Moonsea" may not exist *yet*, and today the relationship is destroyed at import; (2) a `related` field for entry→entry relations, resolved against pages in the codex journal (Squire's own lookup — a corpus `api.compendiums` doesn't model — in a second pass after all pages exist); (3) a GM rescan that crawls the codex and links whatever has since become linkable, reusing the inventory auto-discovery progress bar. Discovered by feeding the 13.3.10 resolver a real AI-authored codex: 19 of 22 links on one entry pointed at other codex entries and were structurally unresolvable (`type: "journal"` finds `JournalEntry` documents; codex entries are `JournalEntryPage`s). The AI wasn't over-linking — it was describing a graph the schema can't hold.
- [ ] **ENHANCEMENT** Clicking a tag on a codex item should filter the codex by that tag
- [ ] **ENHANCEMENT** Need to add a "new" flag to added items that goes away at next client refresh
- [ ] **ENHANCEMENT** When dragging a token to the manual add, pull the bio and put it in the description
- [x] **ENHANCEMENT — DONE (13.3.10)** ~~Auto-link codex entry names to the assigned actor/item compendiums on import.~~ The blocking prerequisite landed: Blacksmith 13.8.4 shipped `api.compendiums` (`resolve`/`resolveMany`/`resolveLink`), which owns the mapping *and* the search semantics — a better contract than the `api.resolveEntityByName(name, type)` wrapper anticipated here, since world-first/last ordering and Spell/Feature subtype filtering live inside it rather than in each caller. Shipped as specced: prompt now emits `links: [{name, type}]` instead of a hard-coded empty array; import resolves names → UUIDs → `system.links`; the "N of M linked, K unmatched" report exists (split into asserted vs speculative misses, so a self-link that legitimately matches nothing doesn't drown the signal). Squire reads none of Blacksmith's settings — `scripts/utility-resolver.js` is the only contact point. Scope grew past codex: quest treasure (`item`) and participants (`actor`) had the same dead end and are wired too.
  - **Caveat worth remembering**: resolution needs the GM's Blacksmith Compendium Mapping to include the *world* for the type. PCs/NPCs live in the world, so an Actor mapping with world search off resolves nothing and looks like a Squire bug. Nothing in Squire can detect this.

### PERFORMANCE (measured against a real 314-entry codex, July 15, 2026)

Real vault: **314 entries** — Characters 120, Books 47, Locations 40, Artifacts 32, Items 31, Factions 11, Events 11, Establishments 9, Landmarks 9, Lore 4. Every number below is per **render**, and render fires on every pin place/unplace, visibility toggle, and import step.

- [ ] **PERF (High, S)** Link enrichment runs on every render, sequentially. `panel-codex.js:2014` awaits `TextEditor.enrichHTML()` once per resolved link, inside `for (const entry of entries)` — categories are parallel (`Promise.all`) but entries within a category are not, so **Characters alone is up to 120 sequential awaits**, ~314 across the codex. The output of `@UUID[uuid]{label}` is deterministic given `uuid` + `label`, both of which are stored on the link — so it can be cached in a `Map` keyed `` `${uuid}|${label}` `` for the session, taking a full render from ~314 enrich calls to ~0. (Parallelising with `Promise.all` would help too, but caching removes the work rather than overlapping it.) Note codex has no parse cache and needs none — the data model removed HTML parsing, so `_refreshData` just reads `page.system`; the cost is all in render.

### PERFORMANCE: clone-and-rebind is dead weight (found July 15, 2026)

- [ ] **PERF (High, S)** Panel `_activateListeners()` clones and replaces every node before binding to it — **14 sites in `panel-codex.js`, 19 in `panel-quest.js`**, ~7 of codex's running *per entry*:
  ```js
  const newBtn = pinBtn.cloneNode(true);
  pinBtn.parentNode?.replaceChild(newBtn, pinBtn);
  newBtn.addEventListener('click', ...);
  ```
  The clone-and-replace idiom exists to strip **pre-existing** listeners when re-binding to live nodes. But `_activateListeners` has exactly **one call site in each panel, immediately after `container.innerHTML = html`** — every node it touches was created microseconds earlier and has no listeners to strip. The whole dance is a no-op with a cost: against the real 314-entry codex that is **~2,200 deep subtree clones plus ~2,200 `replaceChild`** (each invalidating layout) on **every** render — every pin toggle, visibility flip, and import step. `.codex-entry-image img` is cloned too, which can force image re-decode.
  - Fix: delete the clone/replace; `addEventListener` on the original node. Mechanical and safe **so long as the one-call-site-after-innerHTML invariant holds** — verify per panel before touching it (confirmed for codex and quest; `panel-notes.js` has 17 clone sites but a different call structure and needs its own check).
  - Better still, per the handle: **delegate**. 13.3.6 fixed this exact pattern on `HandleManager` — it "cloned the whole `.tray-handle` (plus ~10 individual buttons) and re-attached ~15 listeners on every `updateHandle()`"; handlers are now bound once to the stable parent. Panels never got the same treatment.
  - Related, and the bigger prize: `render()` rebuilds the entire panel via `innerHTML` for any change at all. Delegation is a prerequisite for ever rendering incrementally.

### DUPLICATION TAX (found while fixing 13.3.10)

These are all the *same* defect wearing different hats, and each exists because Notes/Codex/Quest each carry their own copy of the panel shell (8,328 lines across three files: `_refreshData` + cache, scroll preservation, collapse persistence, progress bar, import/export, filtering). See "Base panel class" below.

- [ ] **BUG (Medium)** `panel-quest.js:4117` has the identical post-render collapse restore that was live in codex until 13.3.10: it iterates every key in `questCollapsedCategories` and matches sections with `.trim()`, on top of the template already applying collapse by exact key. It is **latent, not live**, only because quest's keys come from a fixed status set (`Active`/`Complete`/…) rather than user-authored category names, so they never got polluted. Codex's did — the flag held junk like `" Locations\n "` and `" Artifacts\n \n Browse\n \n \n "` from an older version that derived keys from rendered element text, and trim-matching let a junk key saying *collapsed* override the real key saying *expanded* on every single render. Delete the redundant pass (the template is correct); the same trim-match also sits at `:2043` and `:2200`.
- [ ] **BUG (Medium)** `panel-codex.js:717` — applying a tag filter does `setFlag('codexCollapsedCategories', {})`. The comment says "temporarily clear ... while filtering", but nothing restores it: filter by any tag once and every category is permanently expanded. Needs the pre-filter state stashed somewhere rather than destroyed. Quest likely has the same shape.
- [ ] **CHORE (Low)** Keep a link-resolution test fixture in the repo (a quest JSON with a known-good name **and a guaranteed-miss control**; a codex JSON exercising self-link, typed links, and a speculative miss). Name resolution silently did nothing for years and nobody noticed — "it linked" alone can't distinguish a working resolver from indiscriminate linking. The control is the test.

### RELEASE / COMPATIBILITY

- [ ] **CHORE (Medium)** `module.json` declares `requires: coffee-pub-blacksmith` with **no version constraint**. 13.3.10's link resolution needs `api.compendiums` (Blacksmith **13.8.4+**); below that, `getCompendiums()` returns null and every name silently falls back to plain text with no error — exactly the failure mode 13.3.10 was written to delete. Add `"compatibility": { "minimum": "13.8.4" }` so Foundry refuses to enable Squire against a Blacksmith too old to serve it.
- [ ] **BUG (Medium — other repo: coffee-pub-blacksmith)** `ui-journal-encounter.js:378` reads the bare `JournalSheet` global (`Object.values(ui.windows).find(w => w instanceof JournalSheet && ...)`). Deprecated since v13, **removed in v15** — it becomes a hard `ReferenceError` inside a hook that fires on every journal-page write, which Squire triggers constantly (imports, pin flags). Needs `foundry.appv1.sheets.JournalSheet`, and `ui.windows` on the same line is also v13-deprecated in favour of `foundry.applications.instances`.

### PINS
- [ ] **AUDIT** Quest and note pins likely share the silent no-op fixed for codex pins in 13.3.10. Pin visibility in Squire is *derived*, never configured — and the pin's `ownership`, not `config.blacksmithVisibility`, is what actually gates players. A GM editing visibility in Blacksmith's Configure Pin therefore changes nothing for players and gets silently reverted by the next sync. Codex now warns (`_warnIfCodexPinVisibilityEdited()` in `manager-pins.js`, gated on `evt.patch.config.blacksmithVisibility` so Squire's own writes never trip it). The other three derive it differently and may each fail differently:
  - `createQuestPin` (`manager-pins.js:528`) — derives from the page's `visible` flag; `_syncQuestPinVisibility` re-asserts it.
  - `createObjectivePin` (`:607`) — derives from quest/objective state.
  - `createNotePin` (`:910`) — **hardcodes `'visible'`**, ignoring even `PIN_DEFAULTS.note.config.blacksmithVisibility`. Probably the most silent of the three: nothing derives or re-asserts it, so a GM's edit may actually stick — meaning notes may want the opposite treatment (honor it) rather than a warning.
  - Related: `pin-defaults.json` declares `config.blacksmithVisibility` for all four kinds and **no create path reads it** — only `.blacksmithAccess` is. Dead config; either wire it or delete it.
  - Also unread: no create path reads `design.config` at all, so a GM's saved "Default for [type]" **Permissions** section (which Blacksmith *does* store — see `window-pin-configuration.js`, the `has('permissions')` branch) is discarded for every pin kind. Design/text/animation defaults are honored; permissions defaults are not. Decide whether that's intentional and document it either way.

## LOW PRIORITY

### Notes Future Enhancements
- [ ] **ENHANCEMENT** Note templates
- [ ] **ENHANCEMENT** Note linking
- [ ] **ENHANCEMENT** Export formats for notes
- [ ] **ENHANCEMENT** Note sharing
- [ ] **ENHANCEMENT** Note reactions
- [ ] **ENHANCEMENT** Note mentions

### Quest Future Enhancements
- [ ] **ENHANCEMENT** Quest relationships (link quests: prerequisites, follow-ups)
- [ ] **ENHANCEMENT** Timeline view (chronological quest events)
- [ ] **ENHANCEMENT** Quest templates (pre-built structures)
- [ ] **ENHANCEMENT** Automated rewards (auto-grant XP/items on completion)
- [ ] **ENHANCEMENT** Quest chains (automatic progression through sequences)
- [ ] **ENHANCEMENT** Player notes (allow players to add personal notes to quests)
- [ ] **ENHANCEMENT** Quest sharing (share between GMs or worlds)
- [ ] **ENHANCEMENT** Advanced filtering (by participants, location, timeframe)
- [ ] **ENHANCEMENT** Quest analytics (completion rates, average time)

## Architecture & Code Quality

### Base Panel Class (Phase 1.4 from plan-notes)
- [ ] **PLANNED** Create `scripts/base-panel.js` - Extract common panel patterns from Codex, Notes, Quest:
  - Common methods: `constructor`, `_refreshData()`, `_activateListeners(html)`, `_setupSearchFilter(html)`, `_setupTagFilter(html)`
  - Refactor `CodexPanel`, `NotesPanel`, `QuestPanel` to extend `BasePanel`
  - Lower priority - deferred until needed (~6-8 hours)

**Evidence from 13.3.10 that "Low" is the wrong priority** — three of that release's fixes were pure duplication tax:
  - *Scroll preservation on re-render*: quest and notes both already had it, with a comment describing the exact symptom. Codex didn't, so pinning an entry threw the GM to the top of the list. The same bug, already solved twice, shipped a third time.
  - *Trim-match collapse restore*: live in codex, latent in quest (see DUPLICATION TAX above). One bug, two copies, one of them lucky.
  - *State destroyed on rebuild*: hit five separate sites for codex links alone (import merge, page-sheet drop + remove, Edit window `_normalizeLinks` + `_addLink`).

**Suggested change of approach**: a base class over 8,328 lines is a big-bang refactor of three panels at once, which is why this has sat at Low and will keep sitting there. Extract the duplicated **concerns** one at a time instead — scroll preservation, collapse persistence, progress bar, refresh-cache — each independently shippable, each permanently deleting one bug class across all three panels. That is exactly what `manager-pins.js` did for the four pin systems, and it worked. Best first candidates (both small, both would have prevented a real 13.3.10 bug): a shared `preserveScroll()` and a shared collapse-state helper.

### Code Cleanup
- [ ] **PLANNED** Remove legacy code from our fixes
- [ ] **PLANNED** Modularize manager-panel.js (too large, not modular enough)
- [ ] **PLANNED** Revisit party transfer refactor goals (`panel-party.js`) now that `TransferUtils` handles most workflows; decide what parts of the old plan still add value
- [ ] **PLANNED** Break the `HandleManager` ↔ `PanelManager` circular import by passing required data via constructors or shared context
- [ ] **PLANNED** Remove jQuery detection patterns where elements are guaranteed to be native DOM (technical debt cleanup)

### Performance Optimization
- (Disabled-tab skip, lazy tab rendering, and CharacterPanel biography optimization shipped in 13.3.8)
