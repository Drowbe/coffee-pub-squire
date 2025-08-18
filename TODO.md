# Squire Tray TODO List

## Critical Issues (Fix First)

### Tray State Management
- [ ] **FIXED** ~~Tray opens/closes on token changes when it should stay in current state~~
- [ ] **FIXED** ~~Content not updating to new token data after token changes~~
- [ ] **FIXED** ~~Tray collapse/expand functionality broken after token changes~~
- [ ] **FIXED** ~~Tray automatically expanding/flashing on token selection~~

### Animation Issues
- [x] **FIXED** ~~Expand animation: tray fades out and in with small slide from bottom instead of sliding open~~
- [x] **WORKING** Collapse animation: tray slides closed correctly
- [x] **WORKING** Pin/unpin functionality: tray stays pinned and shifts Foundry UI correctly

## Content Update Issues

### Favorites System
- [ ] **BROKEN** Clicking favorites adds items to favorites but doesn't update the "favorite" heart icon in their actual category panels
- [ ] **BROKEN** Handle favorite logic: currently adds ALL favorited items to handle, but should only add items marked for handle inclusion

### Panel Functionality
- [ ] **BROKEN** Manual refresh button on codex panel doesn't seem to do anything
- [ ] **BROKEN** Feather icon in party view opens character sheet AND changes tray to that actor (should only open sheet)
- [ ] **BROKEN** Toggle View Mode in handle doesn't update handle data properly - seems to always change to quests

## UI/UX Improvements

### Quests
- [ ] **GM Notes** We should wind a way to show the gm notes for objextis since they may mention pin locations.

### Windows
- [ ] **Planned** Popped out windows should ignore "esc" keypresses.

### Tray Handle
- [x] **COMPLETED** ~~Make tray handle clickable only on chevron or character panel container - too easy to mis-click other elements~~

### Content Transitions
- [x] **COMPLETED** Implement fade transitions for content changes while keeping tray stable
- [x] **COMPLETED** Quick fade out → fade in for token data changes
- [ ] **PLANNED** No animation for panel visibility toggles (filters, categories)

## Architecture & Code Quality

### Panel-Focused Updates
- [ ] **DEFERRED** Optimize panel-focused updates (deferred until tray state management is stable)
- [ ] **DEFERRED** Implement targeted content updates without full tray recreation

### Code Cleanup
- [ ] **PLANNED** Remove legacy code from our fixes
- [ ] **PLANNED** Modularize panel-manager.js (too large, not modular enough)
- [ ] **PLANNED** Review and clean up any remaining unnecessary `updateTray()` calls

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

## Next Steps Priority

1. **Fix favorites heart icons** - User experience issue
2. **Fix handle favorite logic** - Functionality issue
3. **Fix codex refresh** - Panel functionality issue
4. **Fix party view feather icon** - Unexpected behavior
5. **Fix toggle view mode in handle** - Handle functionality issue
6. **Implement content fade transitions** - Polish
7. **Code cleanup and modularization** - Technical debt

## Investigation Needed

- [ ] Investigate why expand animation changed from sliding to fading
- [ ] Investigate favorites system to understand heart icon update mechanism
- [ ] Investigate handle favorite logic to understand inclusion criteria
- [ ] Investigate codex refresh button implementation
- [ ] Investigate party view feather icon event handling
- [ ] Investigate toggle view mode logic in handle to understand why it defaults to quests
- [x] **FIXED** Tab change sound gets very loud when clicking an already selected tab - added check to prevent unnecessary sound playback when mode doesn't change

## Notes

- **Current Status**: Tray state management is working correctly after recent fixes
- **Animation Issue**: Expand animation broke during hook optimization changes
- **Favorites**: Likely related to event handling or state synchronization between panels
- **Handle Logic**: May need to review how items are marked for handle inclusion
- **Codex Refresh**: Could be missing event handler or broken refresh logic
- **Party View**: Feather icon likely has unintended side effects in event handling
