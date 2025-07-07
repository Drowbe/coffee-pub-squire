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

5. **Fix squire tray disappearing on scene change** - The squire tray is removed from the DOM when changing scenes
   - **Status**: COMPLETED - Fixed by removing duplicate canvasReady hook that was calling PanelManager.cleanup() during scene transitions
   - **Files**: `scripts/panel-manager.js`

6. **Fix handle quest progress order and index mapping** - The handle shows objectives in reverse order (1st on top) but click events and mouseover events have them reversed
   - **Status**: COMPLETED - Fixed by removing array reversal and using correct index mapping

7. **Add pin visibility class to handle quest progress** - Mark which objectives have pins on the canvas
   - **Status**: COMPLETED - Added `objective-pins-oncanvas` class for objectives with visible pins

8. **Fix handle quest data loading on scene change** - Pinned quest in handle disappears when changing scenes, handle quest items not loading properly on scene change
   - **Status**: COMPLETED - Fixed by ensuring proper data loading and pin visibility checks
   - **Changes**: Added proper pin visibility logic and data loading on scene changes

### 🔄 Pending
9. **Add proper error handling for tooltip data** - `getObjectiveTooltipData()` doesn't handle null/undefined cases
   - **Status**: COMPLETED - Added comprehensive null checks, input validation, and error handling with graceful fallbacks
   - **Files**: `scripts/helpers.js`

## Handle Quest Progress Order & UI Issues

### ✅ Completed
7. **Add pin visibility class to handle quest progress** - Mark which objectives have pins on the canvas
   - **Status**: COMPLETED - Added `objective-pins-oncanvas` class for objectives with visible pins

### ✅ Completed
10. **Fix tooltip data consistency** - Tooltip shows different data in handle vs pin (may be related to index issue)
   - **Status**: COMPLETED - Unified tooltip data using QuestParser.parseSinglePage as source of truth
   - **Files**: `scripts/helpers.js`, `scripts/quest-pin.js`
   - **Changes**: 
     - Updated `getObjectiveTooltipData` to use parser instead of manual HTML parsing
     - Removed legacy HTML parsing code from quest pin tooltip
     - All tooltips now use shared Handlebars template `tooltip-quest.hbs`
     - Added proper text transformations in JS (zero-padding, capitalization)
     - Added hidden objective override for players ("Objective Not Discovered")
     - Added "Objective Nearby" indicator for hidden objectives with pins

## Quest Visibility & Pin Management

### ✅ Completed
11. **Fix quest visibility toggle pin refresh** - When hiding/showing entire quest, function doesn't call pin refresh to change pin style for GM and hide/show pins for players
    - **Status**: COMPLETED - Added comprehensive quest visibility handling with automatic unpinning, pin appearance updates, and proper state synchronization
    - **Files**: `scripts/panel-quest.js`, `scripts/quest-pin.js`
    - **Changes**:
      - Enhanced `updateJournalEntryPage` hook to detect quest visibility changes
      - Added `_unpinHiddenQuestFromPlayers()` method for automatic unpinning
      - Added player notifications when quests are automatically unpinned
      - Enhanced pin visibility updates with proper appearance refresh
      - Fixed second ring (orange ring) display for hidden quests
      - Added proper quest state synchronization across all components
      - Added `renderQuestPanel` hook for additional pin updates

12. **Fix excludedUsers settings issue** - "coffee-pub-squire.excludedUsers" is not a registered game setting error
    - **Status**: COMPLETED - Consolidated canvasReady hooks to fix timing issue
    - **Files**: `scripts/squire.js`, `scripts/settings.js`, `scripts/panel-manager.js`, `scripts/quest-pin.js`
    - **Root Cause**: PanelManager.initialize() was called during canvasReady hook before registerSettings() completed in the ready hook
    - **Solution**: 
      - Consolidated all initialization into a single delayed call in the ready hook
      - Removed duplicate canvasReady hooks from panel-manager.js and quest-pin.js
      - Added 1-second delay to ensure settings are registered before initialization
      - Exported quest pin loading function for proper coordination
    - **Impact**: Fixed critical startup error for all users

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
13. **Make some tools always available** - Ensure certain tools are accessible regardless of context
    - **Status**: COMPLETED - Tools are now accessible regardless of context
    - **Priority**: Medium

14. **Remember last tab** - Persist the last active tab across sessions
    - **Status**: PENDING - New feature request
    - **Priority**: Medium

15. **Remember window states** - Remember if macros, dice tray, and health windows were open
    - **Status**: COMPLETED - Implemented persistent window state management
    - **Priority**: Medium
    - **Files**: `scripts/panel-manager.js`, `scripts/panel-health.js`, `scripts/panel-dicetray.js`, `scripts/panel-macros.js`
    - **Implementation**:
      - Added user flags to store window states (`windowStates` flag)
      - Save window states when windows are opened/closed
      - Restore window states when panel manager initializes
      - Added `_saveWindowState()` method to each panel class
      - Proper error handling with Blacksmith logging

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
23. **Quest tools** - Add quest management tools
    - **Status**: COMPLETED - Implemented comprehensive quest management tools
    - **Priority**: Medium
    - **Features**:
      - Clear all quest pins (scene-level and all-scenes options)
      - Clear quest pins for specific quests
      - Hide/show objective pins toggle for players
    - **Files**: `scripts/panel-quest.js`, `scripts/quest-pin.js`, `templates/panel-quest.hbs`, `templates/partials/quest-entry.hbs`
    - **Implementation**:
      - GM scene-level button with dialog for "This Scene" or "All Scenes"
      - GM quest-level button with confirmation dialog
      - Player toggle button with icon state changes
      - Proper pin removal from scene flags and canvas
      - User flag persistence for pin visibility preferences

24. **Quest visibility logic** - If quest is not visible to player, no pins are visible regardless of state
    - **Status**: COMPLETED - Implemented comprehensive quest visibility logic with automatic pin hiding
    - **Priority**: Medium
    - **Note**: Quest-level visibility now properly controls all objective pin visibility for players
    - **Files**: `scripts/quest-pin.js`, `scripts/panel-quest.js`
    - **Implementation**: 
      - `shouldBeVisible()` method checks quest-level visibility first
      - `updateVisibility()` properly hides pins from players when quest is hidden
      - Automatic unpinning when quests are hidden from players

25. **Quest assignment visibility** - Should quests only be visible if player is assigned?
    - **Status**: DEFERRED - Major feature with broad system impact
    - **Priority**: Low
    - **Impact**: Would affect quest panels, handles, pins, and overall quest visibility system
    - **Complexity**: Requires changes to multiple systems and data structures

### Codex Features
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
