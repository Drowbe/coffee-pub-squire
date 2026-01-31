# Squire Tray TODO List

## CURRENT ISSUES (Fix First)
- Nothing critical

## HIGH PRIORITY
- None

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
- [ ] **BUG** Guard the `canvas.selectObjects` override (`squire.js` canvasReady hook) so we don't stack wrappers and timers every scene load; restore original during cleanup
- [ ] **BUG** Replace `cleanupModule`'s zero-delay interval sweep (`squire.js`) with targeted tracked timers; avoid spawning the extra `setInterval(() => {}, 0)` that never clears
- [x] ~~**BUG** Ensure quest-pin drag listeners on `document` are always removed~~ Resolved: PIXI-based quest pins removed; Blacksmith API handles pin interactions.

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
- [ ] **PLANNED** Review and clean up any remaining unnecessary `updateTray()` calls
- [ ] **PLANNED** Revisit party transfer refactor goals (`panel-party.js`) now that `TransferUtils` handles most workflows; decide what parts of the old plan still add value
- [ ] **PLANNED** Break the `HandleManager` ↔ `PanelManager` circular import by passing required data via constructors or shared context
- [ ] **PLANNED** Remove jQuery detection patterns where elements are guaranteed to be native DOM (technical debt cleanup)

### Performance Optimization
- [ ] **INVESTIGATE** Disabled tabs still load/render all data even when hidden - consider skipping panel construction for disabled tabs
- [ ] **OPTIMIZE** Phase 4: Optimize async work in `CharacterPanel.render()` - Move expensive async operations (TextEditor.enrichHTML, renderTemplate) after element validation, or cache template results if element becomes invalid to avoid wasted computation

## Investigation Needed
- [ ] Investigate why expand animation changed from sliding to fading
- [ ] **INVESTIGATE** Add initialization order tests; verify panel behavior across different load conditions
- [ ] **INVESTIGATE** Test integration with other Coffee Pub modules
- [ ] **INVESTIGATE** Monitor initialization timing; track event handling efficiency; maintain responsive UI during loading
