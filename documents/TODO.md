# Squire Tray TODO List

---

## 🚧 FOUNDRYVTT v13 MIGRATION (IN PROGRESS)

### Migration Overview
- **Status:** Active Migration
- **Target:** FoundryVTT v13.0.0
- **Strategy:** Clean v13-only migration (no dual compatibility)
- **Reference:** See `documents/migration-v13-plan.md` for full details

---

### Phase 1: Pre-Migration Setup

- [x] Verify `module.json` has `"minimum": "13.0.0"` ✅
- [ ] Create v13 testing FoundryVTT instance
- [ ] Create feature branch: `v13-migration`
- [ ] Document baseline functionality (screenshots, feature list)
- [ ] Backup current working codebase
- [ ] Update module version in `module.json` to `13.0.0` (or `13.0.0-beta.1` for testing)
- [ ] Review CHANGELOG structure for v13 entry

---

### Phase 2: Critical Path Migration (Priority: HIGH)

#### Core Manager Files

- [x] **`scripts/squire.js`** ✅
  - [x] Replace `$('.squire-tray').remove()` with native DOM removal
  - [x] Replace `$('.squire-questpin-tooltip').remove()` with native DOM removal
  - [x] Add jQuery detection to `_routeToNotesPanel`

- [x] **`scripts/manager-panel.js`** ✅ (Core functionality migrated)
  - [x] Replace jQuery DOM cleanup with native DOM
  - [x] Modify `createTray` and `updateTray` to use native DOM methods
  - [x] Rewrite `activateListeners` to use native event listeners
  - [x] Migrate jQuery selectors to native DOM (`querySelector`, `querySelectorAll`)
  - [x] Migrate DOM manipulation (classList, innerHTML, etc.)
  - [x] Implement jQuery detection pattern for `element` parameters
  - [x] Fix duplicate `case 'quest'` block in `setViewMode`
  - [x] Add null check in `resetCategories` method
  - [ ] **TODO:** Complete migration of remaining internal jQuery usage (if any)

- [ ] **`scripts/manager-handle.js`** 🔄 (Partially Complete)
  - [x] Import `getNativeElement` helper
  - [x] Convert `_updateHandleFade` to use native DOM (`querySelector`)
  - [x] Convert `_attachHandleEventListeners` entry point to native DOM
  - [ ] **TODO:** Complete migration of all event handlers inside `_attachHandleEventListeners` (extensive jQuery usage remaining)

#### Application/FormApplication Classes

- [x] **`scripts/window-characters.js`** ✅
  - [x] Modified `_renderInner` to return native DOM element
  - [x] Implemented jQuery detection in `activateListeners`
  - [x] Replaced jQuery selectors and DOM manipulation

- [x] **`scripts/window-health.js`** ✅
  - [x] Modified `_renderInner` to return native DOM element
  - [x] Implemented jQuery detection in `activateListeners`
  - [x] Replaced jQuery selectors and DOM manipulation

- [ ] **`scripts/window-macros.js`**
  - [ ] Add jQuery detection in `activateListeners(html)`
  - [ ] Verify panel integration with native DOM

- [ ] **`scripts/window-dicetray.js`**
  - [ ] Add jQuery detection in `activateListeners(html)`
  - [ ] Verify panel integration

- [ ] **`scripts/panel-codex.js` - `CodexForm` class**
  - [ ] Add `_getNativeElement()` helper method
  - [ ] Add jQuery detection in `activateListeners(html)`
  - [ ] Replace ALL `html.find()` patterns (extensive usage)
  - [ ] Replace `.on()`, `.off()` event handlers
  - [ ] Replace `.val()`, `.attr()`, form manipulation
  - [ ] Replace `.append()` with native DOM
  - [ ] Convert `.each()` to `.forEach()`

- [ ] **`scripts/window-quest.js` - `QuestForm` class**
  - [ ] Add `_getNativeElement()` helper method
  - [ ] Add jQuery detection in `activateListeners(html)`
  - [ ] Replace jQuery patterns in form handling

---

### Phase 3: Core Panel Migration (Priority: HIGH)

#### High-Usage Panels

- [x] **`scripts/panel-favorites.js`** 🔄 (Partially Complete)
  - [x] Added `getNativeElement` import and usage
  - [x] Converted `.html()` to `.innerHTML`
  - [x] Converted `.find().each()` to `.querySelectorAll().forEach()`
  - [x] Converted jQuery class manipulation to native DOM
  - [x] Made `_removeEventListeners` a no-op for v13
  - [ ] **TODO:** Complete migration of remaining jQuery usage in `_activateListeners` and other methods

- [x] **`scripts/panel-party.js`** 🔄 (Partially Complete)
  - [x] Added `getNativeElement` import and usage
  - [x] Converted `.html()` to `.innerHTML`
  - [x] Added jQuery detection in `activateListeners`
  - [x] Converted character card click handlers to native DOM
  - [ ] **TODO:** Complete migration of remaining jQuery usage (drag handlers, etc.)

- [x] **`scripts/panel-notes.js`** 🔄 (Partially Complete)
  - [x] Added `getNativeElement` import and usage
  - [x] Converted `.html()` to `.innerHTML`
  - [x] Added jQuery detection in `activateListeners`
  - [x] Converted character sheet toggle and journal button handlers
  - [x] Fixed syntax errors (missing closing braces)
  - [ ] **TODO:** Complete migration of remaining jQuery usage (20+ instances of `html.find()`)

- [x] **`scripts/panel-quest.js`** 🔄 (Partially Complete)
  - [x] Added `getNativeElement` import and usage
  - [x] Converted `.html()` to `.innerHTML`
  - [x] Added jQuery detection in `_activateListeners` (entry point)
  - [x] Converted search input handler to native `addEventListener`
  - [ ] **TODO:** Complete migration of extensive jQuery usage (100+ instances of `html.find()`, drag handlers, etc.)

- [x] **`scripts/panel-codex.js` - `CodexPanel` class** 🔄 (Partially Complete)
  - [x] Removed unnecessary jQuery detection (element guaranteed native from `querySelector`)
  - [x] Converted `.html()` to `.innerHTML`
  - [x] Added jQuery detection in `_activateListeners` entry point
  - [x] Converted search input handler to native `addEventListener`
  - [ ] **TODO:** Complete migration of remaining jQuery usage (search functionality, tag handlers, etc.)
  - [ ] **TODO:** Fix remaining jQuery usage at line 1924 (`codexContainer.find()`)

- [ ] **`scripts/panel-spells.js`** 🔄 (Partially Complete)
  - [x] Added `getNativeElement` import and usage
  - [x] Converted `.html()` to `.innerHTML`
  - [x] Added jQuery detection in `_activateListeners` (entry point)
  - [x] Made `_removeEventListeners` a no-op for v13
  - [ ] **TODO:** Convert `panel.on()` event delegation to native DOM event listeners
  - [ ] **TODO:** Migrate all internal jQuery usage in `_activateListeners`

- [x] **`scripts/panel-weapons.js`** 🔄 (Partially Complete)
  - [x] Added `getNativeElement` import and usage
  - [x] Converted `.html()` to `.innerHTML`
  - [x] Made `_removeEventListeners` a no-op for v13

- [x] **`scripts/panel-inventory.js`** 🔄 (Partially Complete)
  - [x] Added `getNativeElement` import and usage
  - [x] Converted `.html()` to `.innerHTML`
  - [x] Made `_removeEventListeners` a no-op for v13

- [x] **`scripts/panel-features.js`** 🔄 (Partially Complete)
  - [x] Added `getNativeElement` import and usage
  - [x] Converted `.html()` to `.innerHTML`
  - [x] Made `_removeEventListeners` a no-op for v13

- [x] **`scripts/panel-character.js`**
  - [x] Added `getNativeElement` usage in `render` method

- [x] **`scripts/panel-gm.js`**
  - [x] Added `getNativeElement` usage in `render` method
  - [x] Migrated all jQuery usage to native DOM

- [x] **`scripts/panel-control.js`** 🔄 (Partially Complete)
  - [x] Added `getNativeElement` usage
  - [x] Converted `_updateVisibility` to native DOM methods
  - [x] Converted `_activateListeners` entry points to native DOM

#### Standard Panels (Lower Priority)

- [ ] **`scripts/panel-macros.js`**
  - [ ] Replace `$('#macros-panel-placeholder')` patterns
  - [ ] Replace `$('<div>')` element creation
  - [ ] Replace `.append()` patterns
  - [ ] Replace `.each()` patterns
  - [ ] Replace extensive drag/drop handlers
  - [ ] Replace `$(document).off().on()` patterns
  - [ ] Add jQuery detection in `_activateListeners(html)`

- [ ] **`scripts/panel-health.js`**
  - [ ] Replace `$('#health-panel-placeholder')` patterns
  - [ ] Replace `$('<div>')` element creation
  - [ ] Replace `.append()` patterns
  - [ ] Add jQuery detection in `_activateListeners(html)`

- [ ] **`scripts/panel-abilities.js`**
  - [ ] Add jQuery detection in `_activateListeners(html)`

- [ ] **`scripts/panel-stats.js`**
  - [ ] Add jQuery detection in `_activateListeners(html)`

- [ ] **`scripts/panel-experience.js`**
  - [ ] Add jQuery detection in `_activateListeners(html)`

- [ ] **`scripts/panel-dicetray.js`**
  - [ ] Replace `.append()` patterns
  - [ ] Add jQuery detection in `_activateListeners(html)`

- [ ] **`scripts/panel-party-stats.js`**
  - [ ] Replace jQuery detection for `this.element` (already has some detection)
  - [ ] Verify native DOM usage

---

### Phase 4: Utility & Helper Files (Priority: MEDIUM)

- [x] **`scripts/helpers.js`**
  - [x] Added `getNativeElement` helper function

- [ ] **`scripts/quest-pin.js`**
  - [ ] Review PixiJS event handlers (`.on()`, `.off()` on PixiJS objects)
  - [ ] **Note:** PixiJS `.on()/.off()` are different from jQuery - verify if changes needed
  - [ ] Check if any DOM manipulation exists

- [ ] **`scripts/timer-utils.js`**
  - [ ] Review for any jQuery usage
  - [ ] Update if needed

- [ ] **`scripts/transfer-utils.js`**
  - [ ] Review for any jQuery usage
  - [ ] Update if needed

- [ ] **`scripts/utility-*.js` files**
  - [ ] `utility-codex-parser.js` - Review for jQuery usage
  - [ ] `utility-print-character.js` - Review for jQuery usage
  - [ ] `utility-quest-parser.js` - Review for jQuery usage

---

### Phase 5: Post-Migration Cleanup & Technical Debt

#### jQuery Detection Pattern Audit

- [ ] **Audit and remove unnecessary jQuery detection patterns**
  - [x] Removed unnecessary detection in `panel-codex.js` `_activateListeners` (element guaranteed native from `querySelector`)
  - [ ] Review all files for similar cases where elements come from `querySelector()` (guaranteed native DOM)
  - [ ] Remove jQuery detection where source is guaranteed to be native DOM
  - [ ] Document which detection patterns are truly necessary vs. transitional

#### Known Issues Discovered During Migration

- [ ] **`panel-codex.js:1924`** - Still has `codexContainer.find()` usage (needs native DOM conversion)
- [ ] **`panel-spells.js`** - Extensive `panel.on()` event delegation needs conversion to native DOM
- [ ] **`panel-quest.js`** - Extensive jQuery usage in search/filter handlers needs complete migration
- [ ] **`panel-notes.js`** - Many remaining `html.find()` calls throughout the file
- [ ] **`panel-party.js`** - Remaining jQuery usage in drag handlers and other event handlers
- [ ] **`manager-handle.js`** - Extensive jQuery usage in `_attachHandleEventListeners` needs completion

---

### Phase 6: Testing & Validation

#### Per-File Testing Checklist
After migrating each file, test:
- [x] `scripts/squire.js` - File loads without errors ✅
- [x] `scripts/manager-panel.js` - File loads, core functionality works ✅
- [x] `scripts/window-characters.js` - File loads without errors ✅
- [x] `scripts/window-health.js` - File loads without errors ✅
- [ ] All remaining files - File loads without console errors
- [ ] All files - Functionality works as expected
- [ ] All files - No deprecation warnings
- [ ] All files - Event handlers fire correctly
- [ ] All files - DOM manipulation works correctly

#### Integration Testing
- [ ] Test all panels render correctly
- [ ] Test all windows open and close correctly
- [ ] Test drag and drop functionality
- [ ] Test search/filter functionality
- [ ] Test form submissions
- [ ] Test with popout windows
- [ ] Test with different user permissions (GM vs Player)

#### Edge Case Testing
- [ ] Test with empty data
- [ ] Test with large datasets
- [ ] Test error handling
- [ ] Test with other v13 modules
- [ ] Test module compatibility (Blacksmith, etc.)

---

### Phase 7: Documentation & Release

- [ ] Update README with v13 requirements
- [ ] Update CHANGELOG with migration notes
- [ ] Document any breaking changes for users
- [ ] Update module version to stable v13.0.0
- [ ] Create GitHub release
- [ ] Tag release
- [ ] Announce v13 support

---

## Current Issues (Fix First)

## MEDIUM PRIORITY

### NOTES TAB
- [ ] **ENHANCEMENT** Expand and optimize this section. It needs to have a shared note, character note, and scratchpad

### CODEX TAB
- [ ] **ENHANCEMENT** Clicking a tag on a codex item should filter the codex by that tag
- [ ] **ENHANCEMENT** Need to add a "new" flag to added items that goes away at next client refresh
- [ ] **ENHANCEMENT** When dragging a token to the manual add, we need to pull the bio and put it in the description
- [ ] **BUG** Guard the `canvas.selectObjects` override (`squire.js` canvasReady hook) so we don't stack wrappers and timers every scene load; restore original during cleanup.
- [ ] **BUG** Replace `cleanupModule`'s zero-delay interval sweep (`squire.js`) with targeted tracked timers; avoid spawning the extra `setInterval(() => {}, 0)` that never clears.
- [ ] **BUG** Ensure quest-pin drag listeners on `document` are always removed (`quest-pin.js`); call `_endDrag` when pins are destroyed/scene changes so pointermove/up handlers don't leak.




### LOW PRIORITY ISSUES

### Biography Tab - Add Details Section
- **Issue**: Add a "details" section to the biography tab (similar to the details section in the narrative template)
- **Status**: PENDING - Needs implementation
- **Priority**: LOW - UI/UX enhancement
- **Current State**: Biography tab only shows biography content, no separate details section
- **Location**: `templates/partial-character-biography.hbs`, character worksheet templates
- **Tasks Needed**:
  - Add a "Details" section to the biography tab
  - Include similar functionality to the narrative details section (e.g., "Specifics" field)
  - Ensure proper styling and layout consistency with other sections
  - Test integration with character worksheet
- **Related Files**: 
  - `templates/partial-character-biography.hbs`
  - `templates/window-query-workspace-character.hbs`
  - Character worksheet JavaScript (if needed for functionality)
- **Notes**: This would provide a dedicated space for character-specific details separate from the main biography content



## Architecture & Code Quality

### Code Cleanup
- [ ] **PLANNED** Remove legacy code from our fixes
- [ ] **PLANNED** Modularize manager-panel.js (too large, not modular enough)
- [ ] **PLANNED** Review and clean up any remaining unnecessary `updateTray()` calls
- [ ] **PLANNED** Revisit party transfer refactor goals (`panel-party.js`) now that `TransferUtils` handles most workflows; decide what parts of the old plan still add value.
- [ ] **PLANNED** Break the `HandleManager` ↔ `PanelManager` circular import by passing required data via constructors or shared context.
- [ ] **PLANNED** Remove jQuery detection patterns where elements are guaranteed to be native DOM (technical debt cleanup)

### Performance Optimization
- [ ] **INVESTIGATE** Disabled tabs still load/render all data even when hidden - consider skipping panel construction for disabled tabs
- [ ] **OPTIMIZE** Phase 4: Optimize async work in `CharacterPanel.render()` - Move expensive async operations (TextEditor.enrichHTML, renderTemplate) after element validation, or cache template results if element becomes invalid to avoid wasted computation

## Investigation Needed

- [ ] Investigate why expand animation changed from sliding to fading
