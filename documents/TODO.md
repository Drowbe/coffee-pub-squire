# Squire Tray TODO List

## Tracking

| Item | Priority | LOE | Status |
|------|----------|-----|--------|
| Migrate 5 legacy V1 `Application` windows to the Blacksmith window framework | **Critical** | L | Open |
| v14/v15 readiness: migrate remaining V1 `Dialog`/`Dialog.confirm` call sites to `DialogV2` (`ImagePopout` ✓ done — all 4 sites on AppV2 signature) | High | M | Open |
| Codex data model: custom `JournalEntryPage` subtype, no migration — re-import converts (see `plan-codex-datamodel.md`) | High | L | Planned |
| Macros: dedupe `panel-macros.css` / `window-macros.css` drop-target styles | Medium | M | Open |
| Notes tab: shared note, character note, scratchpad | Medium | L | Open |
| Codex: clicking a tag filters list by that tag | Medium | M | Open |
| Codex: “new” flag on added items until client refresh | Medium | S | Open |
| Codex: drag token to manual add fills description from bio | Medium | M | Open |
| Codex: auto-link entry names to assigned compendiums on import (blocked on Blacksmith API) | Medium | M | Blocked |
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
- [ ] **ENHANCEMENT** Expand and optimize this section. It needs to have a shared note, character note, and scratchpad

### CODEX TAB
- [ ] **ENHANCEMENT** Clicking a tag on a codex item should filter the codex by that tag
- [ ] **ENHANCEMENT** Need to add a "new" flag to added items that goes away at next client refresh
- [ ] **ENHANCEMENT** When dragging a token to the manual add, pull the bio and put it in the description
- [ ] **ENHANCEMENT (BLOCKED — needs Blacksmith API)** Auto-link codex entry names to the assigned actor/item compendiums on import. AI emits plain-text names; the tool resolves them to `@UUID` links (like Blacksmith's own journal importer does today). The name→compendium-UUID matcher already exists in Blacksmith as `JournalTools._findEntityInCompendiums(name, type)` (`manager-journal-tools.js`), driven by the `monsterCompendium1..N` / `itemCompendium1..N` settings — but it's a private static, NOT on the public `blacksmith.api`. Blocking prerequisite: Blacksmith exposes a public wrapper (e.g. `api.resolveEntityByName(name, type)`). Then, Squire side: (1) prompt change — emit candidate names (e.g. `linkNames: []`) instead of hard-coded empty `links`; (2) import wiring — after creating each typed page, resolve names → UUIDs → write `system.links`, with a per-entry "N of M linked, K unmatched" report since name matching is fuzzy. Do NOT reach into Blacksmith's settings directly from Squire (brittle cross-module coupling) — wait for the public API.

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

### Code Cleanup
- [ ] **PLANNED** Remove legacy code from our fixes
- [ ] **PLANNED** Modularize manager-panel.js (too large, not modular enough)
- [ ] **PLANNED** Revisit party transfer refactor goals (`panel-party.js`) now that `TransferUtils` handles most workflows; decide what parts of the old plan still add value
- [ ] **PLANNED** Break the `HandleManager` ↔ `PanelManager` circular import by passing required data via constructors or shared context
- [ ] **PLANNED** Remove jQuery detection patterns where elements are guaranteed to be native DOM (technical debt cleanup)

### Performance Optimization
- (Disabled-tab skip, lazy tab rendering, and CharacterPanel biography optimization shipped in 13.3.8)
