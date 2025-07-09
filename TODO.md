# Squire Quest System Todo List

## Critical Bugs (Immediate Fixes Needed)

### 🔄 Pending
9. **Add proper error handling for tooltip data** - `getObjectiveTooltipData()` doesn't handle null/undefined cases
   - **Status**: COMPLETED - Added comprehensive null checks, input validation, and error handling with graceful fallbacks
   - **Files**: `scripts/helpers.js`

## Handle Quest Progress Order & UI Issues

## Quest Visibility & Pin Management

## Code Architecture & Maintenance

### 🔄 Pending
12. **Implement unified hook system** - Currently each part of Squire (panel-manager, quest-pin, panel-quest) registers its own hooks, leading to scattered logic and potential conflicts
    - **Status**: PENDING - Need to create centralized hook management system
    - **Files**: Create new `scripts/hooks.js`, refactor existing hook registrations
    - **Benefits**: 
      - Single source of truth for all hooks
      - Better coordination between modules
      - Easier debugging and maintenance
      - Reduced duplicate hook registrations
    - **Current Issues**:
      - Duplicate `canvasReady` and `canvasSceneChange` hooks across files
      - Scattered hook logic makes maintenance difficult
      - Potential for hook conflicts or race conditions

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
- **Completed**: 16 out of 28 items (57%)
- **Pending**: 11 items
- **Deferred**: 1 item
- **Next Priority**: New feature requests

## Notes
- Most critical bugs have been resolved
- Focus should now be on data consistency and code architecture
- Unified hook system would improve long-term maintainability
