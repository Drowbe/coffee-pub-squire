# Squire Tray TODO List

## Current Issues (Fix First)

### QUESTS TAB
- [ ] **BROKEN** Dragging quests or objectives to the canvas no longer works (pins do not show up on the canvas)

### PLAYER/TOKEN TAB
- [ ] **BROKEN** "Print Character Sheet" icon button no longer works
- [ ] **ENHANCEMENT** Need to add the "send item" icon to the weapons panel just like we did the inventory panel

### NOTES TAB
- [ ] **ENHANCEMENT** Expand and optimize this section. It needs to have a shared note, character note, and scratchpad

### CODEX TAB
- [ ] **ENHANCEMENT** Clicking a tag on a codex item should filter the codex by that tag
- [ ] **ENHANCEMENT** Need to add a "new" flag to added items that goes away at next client refresh
- [ ] **ENHANCEMENT** When dragging a token to the manual add, we need to pull the bio and put it in the description

## Remaining Issues

### Panel Functionality
- [ ] **BROKEN** Manual refresh button on codex panel doesn't seem to do anything
- [ ] **BROKEN** Feather icon in party view opens character sheet AND changes tray to that actor (should only open sheet)

### UI/UX Improvements

#### Quests
- [ ] **GM Notes** We should find a way to show the gm notes for objectives since they may mention pin locations

#### Windows
- [ ] **Planned** Popped out windows should ignore "esc" keypresses

## Architecture & Code Quality

### Code Cleanup
- [ ] **PLANNED** Remove legacy code from our fixes
- [ ] **PLANNED** Modularize manager-panel.js (too large, not modular enough)
- [ ] **PLANNED** Review and clean up any remaining unnecessary `updateTray()` calls

### Performance Optimization
- [ ] **INVESTIGATE** Disabled tabs still load/render all data even when hidden - consider skipping panel construction for disabled tabs

## Investigation Needed

- [ ] Investigate why expand animation changed from sliding to fading
- [ ] Investigate codex refresh button implementation
- [ ] Investigate party view feather icon event handling

## Notes

- **Current Status**: Tray state management is working correctly after recent fixes
- **Animation Issue**: Expand animation broke during hook optimization changes
- **Memory Management**: ✅ **FIXED** - Severe memory leaks resolved, duplicate event handlers removed
- **Quest Notifications**: ✅ **FIXED** - Duplicate notifications resolved with global notification IDs
- **Codex Refresh**: Could be missing event handler or broken refresh logic
- **Party View**: Feather icon likely has unintended side effects in event handling