# Squire Tray TODO List

## Critical Issues (Fix First)

### Tray State Management
- [x] **FIXED** ~~Tray opens/closes on token changes when it should stay in current state~~
- [x] **FIXED** ~~Content not updating to new token data after token changes~~
- [x] **FIXED** ~~Tray collapse/expand functionality broken after token changes~~
- [x] **FIXED** ~~Tray automatically expanding/flashing on token selection~~

### Animation Issues
- [x] **FIXED** ~~Expand animation: tray fades out and in with small slide from bottom instead of sliding open~~
- [x] **WORKING** Collapse animation: tray slides closed correctly
- [x] **WORKING** Pin/unpin functionality: tray stays pinned and shifts Foundry UI correctly

## Content Update Issues

### Favorites System
- [x] **FIXED** ~~Clicking favorites adds items to favorites but doesn't update the "favorite" heart icon in their actual category panels~~
- [x] **FIXED** ~~Handle favorite logic: currently adds ALL favorited items to handle, but should only add items marked for handle inclusion~~
- [x] **FIXED** ~~Event listener duplication causing exponential performance degradation~~
- [x] **FIXED** ~~Legacy auto-sync logic conflicting with manual handle favorite control~~
- [x] **FIXED** ~~Heart icon states not updating correctly across all panels~~
- [x] **FIXED** ~~Handle favorites not showing unavailable state for unequipped/unprepared items~~
- [x] **FIXED** ~~Handle favorites order not matching panel favorites order~~

### Panel Functionality
- [ ] **BROKEN** Manual refresh button on codex panel doesn't seem to do anything
- [ ] **BROKEN** Feather icon in party view opens character sheet AND changes tray to that actor (should only open sheet)
- [x] **FIXED** ~~Toggle View Mode in handle doesn't update handle data properly - seems to always change to quests~~
- [x] **FIXED** ~~Spell level filtering broken in Spells panel~~
- [x] **FIXED** ~~Spell slot system not working for GMs~~
- [x] **FIXED** ~~Token selection in Party tab selecting all tokens of same actor type~~
- [x] **FIXED** ~~Monster names showing generic actor names instead of specific token names~~
- [x] **FIXED** ~~Dice tray button not showing in handle~~

## UI/UX Improvements

### Quests
- [ ] **GM Notes** We should find a way to show the gm notes for objextis since they may mention pin locations.

### Auto-Favorites Enhancement
- [x] **COMPLETED** ~~Auto-add NPC/monster favorites to handle favorites for immediate access~~

### Spells
- [x] **COMPLETED** ~~Interactive spell slot management for GMs~~
- [x] **COMPLETED** ~~Visual feedback for available vs expended spell slots~~
- [x] **COMPLETED** ~~Click to use/restore spell slots with proper limits~~
- [x] **COMPLETED** ~~Correct visual order matching character sheet (available left, expended right)~~

### Windows
- [ ] **Planned** Popped out windows should ignore "esc" keypresses.

### Tray Handle
- [x] **COMPLETED** ~~Make tray handle clickable only on chevron or character panel container - too easy to mis-click other elements~~

### Content Transitions
- [x] **COMPLETED** Implement fade transitions for content changes while keeping tray stable
- [x] **COMPLETED** Quick fade out → fade in for token data changes
- [x] **COMPLETED** ~~No animation for panel visibility toggles (filters, categories)~~

## Architecture & Code Quality

### Panel-Focused Updates
- [ ] **DEFERRED** Optimize panel-focused updates (deferred until tray state management is stable)
- [ ] **DEFERRED** Implement targeted content updates without full tray recreation

### Code Cleanup
- [ ] **PLANNED** Remove legacy code from our fixes
- [ ] **PLANNED** Modularize manager-panel.js (too large, not modular enough)
- [ ] **PLANNED** Review and clean up any remaining unnecessary `updateTray()` calls

### Performance Optimization
- [ ] **INVESTIGATE** Disabled tabs still load/render all data even when hidden - consider skipping panel construction for disabled tabs

## Completed Tasks

- [x] **COMPLETED** Removed unnecessary `updateTray()` calls from item hooks
- [x] **COMPLETED** Fixed `controlToken` hook to preserve tray state
- [x] **COMPLETED** Replaced `PanelManager.initialize()` with direct actor updates
- [x] **COMPLETED** Added `renderPanels` and `activateListeners` calls after actor changes
- [x] **COMPLETED** Fixed refresh button to prevent full tray recreation
- [x] **COMPLETED** Added explicit `this` context binding for event listeners
- [x] **COMPLETED** Fixed favorites overlap issue (layout/spacing)
- [x] **COMPLETED** Fixed Handlebars template syntax error
- [x] **COMPLETED** Moved Macro button click handler to `#macros-button`
- [x] **COMPLETED** Moved Conditions button click handler to `#conditions-button`
- [x] **COMPLETED** Moved Dice Tray button click handler to `#dice-tray-button`
- [x] **COMPLETED** Moved Health Tray button click handler to `#health-tray-button`
- [x] **COMPLETED** Implemented fade animations for tray content when changing tokens
- [x] **COMPLETED** Adjusted fade animation target from `.tray-content` to `.tray-panel-wrapper`
- [x] **COMPLETED** Added CSS styling for new `.tray-panel-wrapper` structure
- [x] **COMPLETED** Updated all JavaScript fade animation targeting to use new wrapper
- [x] **COMPLETED** Fixed toggle view mode in handle to respect tab visibility settings
- [x] **COMPLETED** Added validation to prevent switching to disabled tabs
- [x] **COMPLETED** Fixed tab change sound volume issue when clicking already selected tab
- [x] **COMPLETED** Implemented conditional fade animations (only for player/party views)
- [x] **COMPLETED** Created and registered 9 handle partials for modularity
- [x] **COMPLETED** Refactored handle templates to use new partials
- [x] **COMPLETED** Fixed event listener duplication in favoriting system
- [x] **COMPLETED** Removed legacy auto-sync logic for handle favorites
- [x] **COMPLETED** Fixed heart icon state updates across all panels
- [x] **COMPLETED** Added unavailable class for unequipped/unprepared handle favorites
- [x] **COMPLETED** Fixed handle favorites order to match panel favorites
- [x] **COMPLETED** Fixed spell level filtering in Spells panel
- [x] **COMPLETED** Implemented interactive spell slot management for GMs
- [x] **COMPLETED** Fixed token selection to use unique token IDs instead of actor IDs
- [x] **COMPLETED** Fixed monster name display to show specific token names
- [x] **COMPLETED** Fixed dice tray button display in all handle templates
- [x] **COMPLETED** Cleaned up debug code and verbose logging for production readiness

## Next Steps Priority

1. ~~**Fix favorites heart icons**~~ - User experience issue ✅ **COMPLETED**
2. ~~**Fix handle favorite logic**~~ - Functionality issue ✅ **COMPLETED**
3. **Fix codex refresh** - Panel functionality issue
4. **Fix party view feather icon** - Unexpected behavior
5. ~~**Fix toggle view mode in handle**~~ - Handle functionality issue ✅ **COMPLETED**
6. ~~**Implement content fade transitions**~~ - Polish ✅ **COMPLETED**
7. ~~**Fix spell level filtering**~~ - Panel functionality ✅ **COMPLETED**
8. ~~**Implement spell slot management**~~ - GM functionality ✅ **COMPLETED**
9. ~~**Fix token selection logic**~~ - Party panel functionality ✅ **COMPLETED**
10. ~~**Fix monster name display**~~ - Party panel display ✅ **COMPLETED**
11. ~~**Fix dice tray button display**~~ - Handle functionality ✅ **COMPLETED**
12. **Code cleanup and modularization** - Technical debt

## Investigation Needed

- [ ] Investigate why expand animation changed from sliding to fading
- [x] **FIXED** ~~Investigate favorites system to understand heart icon update mechanism~~
- [x] **FIXED** ~~Investigate handle favorite logic to understand inclusion criteria~~
- [ ] Investigate codex refresh button implementation
- [ ] Investigate party view feather icon event handling
- [x] **FIXED** ~~Investigate toggle view mode logic in handle to understand why it defaults to quests~~
- [x] **FIXED** Tab change sound gets very loud when clicking an already selected tab - added check to prevent unnecessary sound playback when mode doesn't change
- [x] **FIXED** ~~Investigate spell level filtering event listener target mismatch~~
- [x] **FIXED** ~~Investigate spell slot visual states and order logic~~
- [x] **FIXED** ~~Investigate token selection using actor IDs instead of token IDs~~
- [x] **FIXED** ~~Investigate monster name display using actor names instead of token names~~
- [x] **FIXED** ~~Investigate dice tray button display condition typo in templates~~

## Notes

- **Current Status**: Tray state management is working correctly after recent fixes
- **Animation Issue**: Expand animation broke during hook optimization changes
- **Favorites**: ✅ **FIXED** - Event listener duplication and legacy auto-sync logic resolved
- **Handle Logic**: ✅ **FIXED** - Manual control implemented with proper unavailable states and order
- **Spell System**: ✅ **FIXED** - Level filtering and interactive spell slot management working
- **Party Panel**: ✅ **FIXED** - Token selection and monster name display working correctly
- **Handle Display**: ✅ **FIXED** - Dice tray button now showing in all handle templates
- **Codex Refresh**: Could be missing event handler or broken refresh logic
- **Party View**: Feather icon likely has unintended side effects in event handling
