# Squire Tray TODO List

## Tracking

| Item | Priority | LOE | Status |
|------|----------|-----|--------|
| Migrate 5 legacy V1 `Application` windows to the Blacksmith window framework | **Critical** | L | Open |
| Macros: dedupe `panel-macros.css` / `window-macros.css` drop-target styles | Medium | M | Open |
| Quest: drop write-only `sceneId` mirror flag from `_syncQuestPinMirror` | Medium | S | Open |
| Notes tab: shared note, character note, scratchpad | Medium | L | Open |
| Codex: clicking a tag filters list by that tag | Medium | M | Open |
| Codex: “new” flag on added items until client refresh | Medium | S | Open |
| Codex: drag token to manual add fills description from bio | Medium | M | Open |
| Notes future: templates, linking, export, sharing, reactions, mentions | Low | XL | Open |
| Quest future: relationships, timeline, templates, automation, chains, etc. | Low | XL | Open |
| Base panel class (`base-panel.js`) + refactor Codex/Notes/Quest panels | Low | L | Open |
| Code cleanup: remove legacy fix code | Low | M | Open |
| Modularize `manager-panel.js` | Low | L | Open |
| Party transfer refactor follow-up (`panel-party.js` vs `TransferUtils`) | Low | M | Open |
| Break `HandleManager` ↔ `PanelManager` circular import | Low | M | Open |
| Remove jQuery detection where DOM is native-only | Low | S | Open |
| Perf: skip construction/data for disabled tray tabs | Medium | M | Open |
| Perf: Phase 4 async in `CharacterPanel.render()` — cache biography enrich (renders more often since AC/movement changes route here) | High | L | Open |
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

### CHARACTER PANEL RENDER COST
- [ ] **OPTIMIZE** `CharacterPanel.render()` enriches the biography HTML (`TextEditor.enrichHTML`) on every render. Bumped to High: since the 13.3.6 perf work routes AC/movement changes to a targeted character-panel render, this now runs on routine effect/condition churn. Cache the enriched biography by actor + `_stats.modifiedTime` (same pattern as the pinned-quest and journal-page caches), or move enrichment behind the element-validation checks.

## MEDIUM PRIORITY

### MACROS CSS DUPLICATION
- [ ] **CLEANUP** Remove duplicate CSS definitions for drop target styles between `panel-macros.css` and `window-macros.css`:
  - `.macro-slot.drop-target-slot` is duplicated identically in both files (should be in `panel-macros.css` only)
  - `[data-panel="macros"].macro-drop-target` in `window-macros.css` is too general and conflicts with specific selectors in `panel-macros.css`
  - Keep window-specific `#squire-macros-window.macro-drop-target` in `window-macros.css`
  - Keep tray/popout specific selectors in `panel-macros.css`
  - Consolidate shared styles to avoid conflicts and maintenance issues

### QUEST PIN FLAG HYGIENE
- [ ] **CLEANUP** `_syncQuestPinMirror` (`panel-quest.js`) writes a `sceneId` flag on quest pages that nothing reads — quest scene resolution comes from live Blacksmith pin records (`pins.get(pinId).sceneId`), per the migration's pinId-only contract. Each write is a pointless world document update whose `updateJournalEntryPage` cascade also bumps `modifiedTime` and needlessly invalidates the page-parse cache (13.3.7) for that page. Remove the `sceneId` half (keep `pinId`); quest-side only — Notes legitimately uses its own `sceneId` flag as note metadata (`panel-notes.js`, `utility-notes-parser.js`, `window-note.js`). Existing stale `sceneId` values on quest pages are inert; optional future migration can sweep them.

### NOTES TAB
- [ ] **ENHANCEMENT** Expand and optimize this section. It needs to have a shared note, character note, and scratchpad

### CODEX TAB
- [ ] **ENHANCEMENT** Clicking a tag on a codex item should filter the codex by that tag
- [ ] **ENHANCEMENT** Need to add a "new" flag to added items that goes away at next client refresh
- [ ] **ENHANCEMENT** When dragging a token to the manual add, pull the bio and put it in the description

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
- [ ] **INVESTIGATE** Disabled tabs still load/render all data even when hidden - consider skipping panel construction for disabled tabs
- (CharacterPanel render optimization moved to HIGH PRIORITY above)

## Investigation Needed
- [ ] Investigate why expand animation changed from sliding to fading
- [ ] **INVESTIGATE** Add initialization order tests; verify panel behavior across different load conditions
- [ ] **INVESTIGATE** Test integration with other Coffee Pub modules
- [ ] **INVESTIGATE** Monitor initialization timing; track event handling efficiency; maintain responsive UI during loading
