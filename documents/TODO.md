# Squire Tray TODO List


## CURRENT ISSUES (Fix First)
- Nothing critical

## HIGH PRIORITY
- None

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


## LOW PRIORITY

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
