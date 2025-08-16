# Squire Quest System Todo List

## Critical Bugs (Immediate Fixes Needed)

### ✅ Completed
9. **Add proper error handling for tooltip data** - `getObjectiveTooltipData()` doesn't handle null/undefined cases
   - **Status**: COMPLETED - Added comprehensive null checks, input validation, and error handling with graceful fallbacks
   - **Files**: `scripts/helpers.js`

10. **Fix quest import/export field mapping** - Import expected `gmHint`/`treasureUnlocks` but export provided `gmnotes`/`tasktreasure`
    - **Status**: COMPLETED - Fixed field name mapping and treasure format conversion
    - **Files**: `scripts/panel-quest.js` - Updated both `_mergeJournalContent()` and `_generateJournalContentFromImport()` methods
    - **Features**:
      - Field mapping: `gmnotes` → `gmHint`, `tasktreasure` → `treasureUnlocks`
      - Format conversion: `[[treasure]]` → `((treasure))`
      - Progress preservation: Existing quest states and completion preserved
      - Backward compatibility: Works with both old and new export formats

## Handle Quest Progress Order & UI Issues

## Quest Visibility & Pin Management

## Code Architecture & Maintenance

### ✅ Completed
12. **Implement unified hook system** - Centralized all journal-related hooks in HookManager for better coordination and maintenance
    - **Status**: COMPLETED - Created centralized hook management system
    - **Files**: `scripts/hooks.js` - Comprehensive HookManager class
    - **Benefits Achieved**: 
      - Single source of truth for all hooks ✅
      - Better coordination between modules ✅
      - Easier debugging and maintenance ✅
      - Reduced duplicate hook registrations ✅
    - **Features**:
      - Consolidated journal entry page update hooks
      - Intelligent routing to appropriate panels (codex, quest, notes, quest pins)
      - Quest-specific logic handling (visibility, pin updates, status changes)
      - Centralized error handling and logging
      - Proper hook cleanup management

## New Feature Requests

### Player / General Features
14. **Remember last tab** - Persist the last active tab across sessions
    - **Status**: PENDING - New feature request
    - **Priority**: Medium

16. **Select multiple tokens for bulk health update** - Allow selecting multiple tokens on canvas for health management
    - **Status**: PENDING - New feature request
    - **Priority**: Medium

### Notes Toolbar Features
17. **Add current note name to toolbar** - Display the name of the currently active note
    - **Status**: PENDING - New feature request
    - **Priority**: Medium

18. **Add note tools to toolbar** - Include note-specific tools in the toolbar
    - **Status**: PENDING - New feature request
    - **Priority**: Medium

19. **Drag fragments to notes** - Allow dragging text fragments directly to notes
    - **Status**: PENDING - New feature request
    - **Priority**: Medium

20. **Add note functionality** - Quick add note feature
    - **Status**: PENDING - New feature request
    - **Priority**: Medium

21. **Quick toggle between notes** - Fast switching between different notes
    - **Status**: PENDING - New feature request
    - **Priority**: Medium

22. **Pin notes** - Ability to pin specific notes for quick access
    - **Status**: PENDING - New feature request
    - **Priority**: Medium

### Quest Features
26. **Add canvas tokens to handle** - Include tokens from canvas in the handle
    - **Status**: PENDING - New feature request
    - **Priority**: Medium

27. **Auto-enable codex for canvas tokens** - Automatically enable codex entries for tokens on canvas
    - **Status**: PENDING - New feature request
    - **Priority**: Medium

28. **Pin codex to handle** - Ability to pin codex entries to the handle
    - **Status**: PENDING - New feature request
    - **Priority**: Medium

## Summary
- **Completed**: 18 out of 29 items (62%)
- **Pending**: 10 items
- **Deferred**: 1 item
- **Next Priority**: New feature requests or thorough testing

## Notes
- All critical bugs have been resolved ✅
- Quest import/export system is fully functional ✅
- Hook system is centralized and robust ✅
- Code architecture is well-organized and maintainable ✅
- Module is production-ready with focus on new features
