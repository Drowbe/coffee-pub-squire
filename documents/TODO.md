# Squire Tray TODO List

---

## 🚧 FOUNDRYVTT v13 MIGRATION (IN PROGRESS)

### Migration Overview
- **Status:** Active Migration - Core APIs and Critical Panels Complete
- **Target:** FoundryVTT v13.0.0
- **Strategy:** Clean v13-only migration (no dual compatibility)
- **Reference:** See `documents/migration-v13-plan.md` for full details

### Completed Work Summary
- ✅ **API Migrations**: All FoundryVTT v13 and D&D5e v5.1+ API migrations complete
  - `renderTemplate`, `TextEditor`, `ContextMenu` helpers created and integrated
  - `SpellData#preparation` → `SpellData#method` and `SpellData#prepared`
  - `CONFIG.DND5E.movementTypes` → `.label` property access
  - `JournalTextPageSheet` API migration
- ✅ **jQuery to Native DOM**: Complete migration for critical panels
  - `panel-macros.js`, `panel-health.js`, `panel-dicetray.js`, `panel-stats.js`, `panel-abilities.js`
- ✅ **Window Fixes**: All window classes updated with `_activateCoreListeners` overrides
  - `window-macros.js`, `window-health.js`, `window-dicetray.js`
- ✅ **Handle Manager**: All handle button actions and condition management fixed
- ✅ **Quest Pins**: Font Awesome 6 migration, JSON configuration system, solid icon rendering
- ✅ **Handlebars Partials**: Registration system implemented for handle components
- ✅ **Documentation**: CHANGELOG updated with all migration changes

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

#### FoundryVTT v13 API Migrations

- [x] **API Helper Functions** ✅
  - [x] Created `renderTemplate()` helper in `scripts/helpers.js` wrapping `foundry.applications.handlebars.renderTemplate`
  - [x] Created `getTextEditor()` helper wrapping `foundry.applications.ux.TextEditor.implementation`
  - [x] Created `getContextMenu()` helper wrapping `foundry.applications.ux.ContextMenu.implementation`
  - [x] Updated all files using `renderTemplate` to import and use helper
  - [x] Updated all files using `TextEditor` to import and use helper
  - [x] Updated all files using `ContextMenu` to import and use helper

- [x] **D&D5e v5.1+ API Migrations** ✅
  - [x] Updated `spell.system.preparation.mode` → `spell.system.method` in `panel-favorites.js`, `panel-spells.js`, `squire.js`
  - [x] Updated `spell.system.preparation.prepared` → `spell.system.prepared` in `panel-favorites.js`, `panel-spells.js`, `squire.js`
  - [x] Updated `CONFIG.DND5E.movementTypes` access to use `.label` property with fallback in `panel-character.js`
  - [x] Updated Handlebars templates to use new spell data properties

- [x] **JournalSheet API Migration** ✅
  - [x] Updated `JournalTextPageSheet.activateListeners` to use `foundry.applications.sheets.JournalTextPageSheet.activateListeners` with fallback in `panel-notes.js`

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

- [x] **`scripts/manager-handle.js`** ✅
  - [x] Import `getNativeElement` helper
  - [x] Convert `_updateHandleFade` to use native DOM (`querySelector`)
  - [x] Convert `_attachHandleEventListeners` entry point to native DOM
  - [x] Fixed pin button `classList` access with proper variable references and null checks
  - [x] Fixed toggle tray button with dedicated event listener and `toggleTray()` helper function
  - [x] Fixed condition icon loading with multiple property checks and fallback paths
  - [x] Fixed `ActiveEffect` validation errors by ensuring `name` and `icon` properties are always defined
  - [x] Fixed condition management null reference errors with proper async handling
  - [x] Added Handlebars partial registration for handle components

#### Application/FormApplication Classes

- [x] **`scripts/window-characters.js`** ✅
  - [x] Modified `_renderInner` to return native DOM element
  - [x] Implemented jQuery detection in `activateListeners`
  - [x] Replaced jQuery selectors and DOM manipulation

- [x] **`scripts/window-health.js`** ✅
  - [x] Modified `_renderInner` to return native DOM element
  - [x] Implemented jQuery detection in `activateListeners`
  - [x] Replaced jQuery selectors and DOM manipulation

- [x] **`scripts/window-macros.js`** ✅
  - [x] Added `_activateCoreListeners` override to prevent form listener errors
  - [x] Wrapped `super.activateListeners(html)` in try-catch for graceful error handling
  - [x] Verified panel integration with native DOM

- [x] **`scripts/window-dicetray.js`** ✅
  - [x] Added `_activateCoreListeners` override to prevent form listener errors
  - [x] Wrapped `super.activateListeners(html)` in try-catch for graceful error handling
  - [x] Verified panel integration

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

- [x] **`scripts/panel-favorites.js`** ✅
  - [x] Added `getNativeElement` import and usage
  - [x] Converted `.html()` to `.innerHTML`
  - [x] Converted `.find().each()` to `.querySelectorAll().forEach()`
  - [x] Converted jQuery class manipulation to native DOM
  - [x] Made `_removeEventListeners` a no-op for v13
  - [x] Migrated `ContextMenu` to use `getContextMenu()` helper with `{ jQuery: false }`
  - [x] Updated context menu callbacks to use native DOM (`li.dataset.itemId` instead of `$(li).data('item-id')`)
  - [x] Updated `SpellData#preparation` to `SpellData#method` and `SpellData#prepared`

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
  - [x] Updated `TextEditor.enrichHTML()` to use `getTextEditor().enrichHTML()`
  - [x] Updated `JournalTextPageSheet.activateListeners` to use `foundry.applications.sheets.JournalTextPageSheet.activateListeners` with fallback
  - [ ] **TODO:** Complete migration of remaining jQuery usage (20+ instances of `html.find()`)

- [x] **`scripts/panel-quest.js`** 🔄 (Partially Complete)
  - [x] Added `getNativeElement` import and usage
  - [x] Converted `.html()` to `.innerHTML`
  - [x] Added jQuery detection in `_activateListeners` (entry point)
  - [x] Converted search input handler to native `addEventListener`
  - [x] Updated `TextEditor.enrichHTML()` to use `getTextEditor().enrichHTML()`
  - [x] Fixed "hide quest pins" button null reference error with proper fallback and null checks
  - [ ] **TODO:** Complete migration of extensive jQuery usage (100+ instances of `html.find()`, drag handlers, etc.)

- [x] **`scripts/panel-codex.js` - `CodexPanel` class** 🔄 (Partially Complete)
  - [x] Removed unnecessary jQuery detection (element guaranteed native from `querySelector`)
  - [x] Converted `.html()` to `.innerHTML`
  - [x] Added jQuery detection in `_activateListeners` entry point
  - [x] Converted search input handler to native `addEventListener`
  - [ ] **TODO:** Complete migration of remaining jQuery usage (search functionality, tag handlers, etc.)
  - [ ] **TODO:** Fix remaining jQuery usage at line 1924 (`codexContainer.find()`)

- [x] **`scripts/panel-spells.js`** ✅
  - [x] Added `getNativeElement` import and usage
  - [x] Converted `.html()` to `.innerHTML`
  - [x] Added jQuery detection in `_activateListeners` (entry point)
  - [x] Made `_removeEventListeners` a no-op for v13
  - [x] Updated `SpellData#preparation.mode` to `SpellData#method`
  - [x] Updated `SpellData#preparation.prepared` to `SpellData#prepared`

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

- [x] **`scripts/panel-character.js`** ✅
  - [x] Added `getNativeElement` usage in `render` method
  - [x] Updated `CONFIG.DND5E.movementTypes` access to use `.label` property with fallback for legacy string values

- [x] **`scripts/panel-gm.js`**
  - [x] Added `getNativeElement` usage in `render` method
  - [x] Migrated all jQuery usage to native DOM

- [x] **`scripts/panel-control.js`** 🔄 (Partially Complete)
  - [x] Added `getNativeElement` usage
  - [x] Converted `_updateVisibility` to native DOM methods
  - [x] Converted `_activateListeners` entry points to native DOM

#### Standard Panels (Lower Priority)

- [x] **`scripts/panel-macros.js`** ✅
  - [x] Replaced all jQuery selectors with native DOM (`querySelector`, `querySelectorAll`)
  - [x] Replaced `.append()` with native DOM (`appendChild`, `replaceChild`)
  - [x] Replaced `.each()` with native DOM (`forEach`)
  - [x] Replaced all event handlers (`.on()`, `.off()`) with native DOM (`addEventListener`, `removeEventListener`)
  - [x] Replaced DOM manipulation (`.toggleClass()`, `.hasClass()`, `.css()`, `.html()`, `.val()`) with native methods
  - [x] Migrated drag/drop handlers to native DOM
  - [x] Migrated document-level event handlers to native DOM

- [x] **`scripts/panel-health.js`** ✅
  - [x] Replaced all jQuery selectors with native DOM
  - [x] Replaced `.append()` with native DOM
  - [x] Replaced all event handlers with native DOM
  - [x] Replaced DOM manipulation with native methods

- [x] **`scripts/panel-abilities.js`** ✅
  - [x] Migrated all jQuery usage to native DOM
  - [x] Replaced `.find()`, `.on()`, `.off()`, `.each()`, `.toggleClass()`, `.hasClass()` with native equivalents
  - [x] Used `cloneNode(true)` and `replaceChild()` for event listeners

- [x] **`scripts/panel-stats.js`** ✅
  - [x] Migrated all jQuery usage to native DOM
  - [x] Replaced `.find()`, `.on()`, `.off()`, `.each()` with native equivalents

- [ ] **`scripts/panel-experience.js`**
  - [ ] Add jQuery detection in `_activateListeners(html)`

- [x] **`scripts/panel-dicetray.js`** ✅
  - [x] Replaced all jQuery selectors with native DOM
  - [x] Replaced `.append()` with native DOM
  - [x] Replaced all event handlers with native DOM
  - [x] Replaced DOM manipulation with native methods

- [ ] **`scripts/panel-party-stats.js`**
  - [ ] Replace jQuery detection for `this.element` (already has some detection)
  - [ ] Verify native DOM usage

---

### Phase 4: Utility & Helper Files (Priority: MEDIUM)

- [x] **`scripts/helpers.js`** ✅
  - [x] Added `getNativeElement` helper function
  - [x] Added `renderTemplate()` helper wrapping `foundry.applications.handlebars.renderTemplate`
  - [x] Added `getTextEditor()` helper wrapping `foundry.applications.ux.TextEditor.implementation`
  - [x] Added `getContextMenu()` helper wrapping `foundry.applications.ux.ContextMenu.implementation`
  - [x] Updated internal `TextEditor` usage to use `getTextEditor().enrichHTML()`

- [x] **`scripts/quest-pin.js`** ✅
  - [x] Reviewed PixiJS event handlers (`.on()`, `.off()` on PixiJS objects) - no changes needed (PixiJS API, not jQuery)
  - [x] Migrated Font Awesome from v5 to v6 Pro (updated font family name)
  - [x] Added `fontWeight: '900'` to PIXI.Text icon styles to render solid icons
  - [x] Refactored from hardcoded values to JSON-based configuration (`themes/quest-pins.json`)
  - [x] Implemented `loadPinConfig()` to asynchronously load configuration
  - [x] Made all visual properties (dimensions, colors, fonts, icons, offsets, shapes) configurable via JSON
  - [x] Made font weight configurable via JSON for future customization

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
- [ ] **`panel-quest.js`** - Extensive jQuery usage in search/filter handlers needs complete migration
- [ ] **`panel-notes.js`** - Many remaining `html.find()` calls throughout the file
- [ ] **`panel-party.js`** - Remaining jQuery usage in drag handlers and other event handlers

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
- [x] Update CHANGELOG with migration notes ✅
- [x] Document any breaking changes for users ✅ (in CHANGELOG)
- [x] Update module version to stable v13.0.0 ✅
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
