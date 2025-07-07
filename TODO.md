# Squire Quest System Todo List

## Critical Bugs (Immediate Fixes Needed)

### ✅ Completed
1. **Fix syntax error in quest pin state update** - Missing opening brace after `try` in `panel-quest.js` line 89
   - **Status**: COMPLETED - The syntax error has already been fixed. The `try` block now properly opens with `try {` on line 91.

2. **Remove duplicate event handler setup** - Objective click handlers are set up twice in `panel-manager.js`
   - **Status**: COMPLETED - Fixed by adding proper `.off()` cleanup before `.on()` in `_attachObjectiveClickHandlers` method

3. **Fix duplicate class attribute in template** - In `quest-entry.hbs` line 47
   - **Status**: COMPLETED - Fixed duplicate `class` attribute in `partials/quest-entry.hbs`

4. **Fix tray window click issue** - Clicking any open tray window (macros, effects, dice tray, etc.) makes the tray completely disappear
   - **Status**: COMPLETED - Fixed by removing problematic cleanup hooks that were triggered on every window close

5. **Fix handle quest progress order and index mapping** - The handle shows objectives in reverse order (1st on top) but click events and mouseover events have them reversed
   - **Status**: COMPLETED - Fixed by removing array reversal and using correct index mapping

6. **Add pin visibility class to handle quest progress** - Mark which objectives have pins on the canvas
   - **Status**: COMPLETED - Added `objective-pins-oncanvas` class for objectives with visible pins

7. **Fix handle quest data loading on scene change** - Pinned quest in handle disappears when changing scenes, handle quest items not loading properly on scene change
   - **Status**: COMPLETED - Added missing `canvasSceneChange` hook to `panel-manager.js` to refresh handle quest data

### 🔄 Pending
8. **Add proper error handling for tooltip data** - `getObjectiveTooltipData()` doesn't handle null/undefined cases
   - **Status**: PENDING - Need to add null/undefined checks to tooltip data functions
   - **Files**: `scripts/helpers.js`

## Handle Quest Progress Order & UI Issues

### ✅ Completed
6. **Add pin visibility class to handle quest progress** - Mark which objectives have pins on the canvas
   - **Status**: COMPLETED - Added `objective-pins-oncanvas` class for objectives with visible pins

### 🔄 Pending
9. **Fix tooltip data consistency** - Tooltip shows different data in handle vs pin (may be related to index issue)
   - **Status**: PENDING - Need to investigate tooltip data differences between handle and pin displays
   - **Files**: `scripts/helpers.js`, `scripts/quest-pin.js`

## Quest Visibility & Pin Management

### 🔄 Pending
10. **Fix quest visibility toggle pin refresh** - When hiding/showing entire quest, function doesn't call pin refresh to change pin style for GM and hide/show pins for players
    - **Status**: PENDING - Need to add pin refresh call when quest visibility is toggled
    - **Files**: `scripts/panel-quest.js`

## Code Architecture & Maintenance

### 🔄 Pending
11. **Implement unified hook system** - Currently each part of Squire (panel-manager, quest-pin, panel-quest) registers its own hooks, leading to scattered logic and potential conflicts
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

## Summary
- **Completed**: 7 out of 11 items (64%)
- **Pending**: 4 items
- **Next Priority**: Item #8 (Error handling for tooltip data) or #11 (Unified hook system)

## Notes
- Most critical bugs have been resolved
- Focus should now be on data consistency and code architecture
- Unified hook system would improve long-term maintainability
