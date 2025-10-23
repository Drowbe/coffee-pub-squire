# Squire Tray TODO List

## 🎉 HOOK RESTORATION PROJECT COMPLETE! 🎉

**Status:** ✅ **COMPLETED**  
**Completed:** 2025-01-27  
**All 5 Phases Complete:** Critical hooks restored, performance optimized, code cleaned up

---

## Current Issues (Fix First)

### TOKEN NAME DISPLAY ISSUE
- [ ] **CRITICAL** Fix token name display inconsistency - handle shows actor name instead of token name
  - Handle shows "CULTIST" instead of "Belix (Cultist)" when token is selected
  - Health panel shows "HEALTH: CULTIST" instead of token-specific name
  - Token Configuration correctly shows "Belix (Cultist)" - this data is available
  - Need simple fix: ensure handle gets correct token reference when tokens are selected
  - Previous attempt overcomplicated the solution - need minimal, targeted approach
  - Consider rolling back recent changes and starting fresh

### COMBAT INTEGRATION ISSUE ✅ REMOVED
- [x] **HIGH** Fix "Add to Combat" button error: `token.actor.addToCombat is not a function`
  - ✅ Error occurs when clicking "Add to Combat" button in tray
  - ✅ `manager-panel.js:703:43` - `token.actor.addToCombat()` method doesn't exist
  - ✅ Need to check D&D 5e system API for correct combat integration method
  - ✅ May need to use `CombatTracker.createCombatant()` or similar FoundryVTT API
  - ✅ Error prevents GMs from easily adding tokens to combat from tray
  - ✅ **DECISION:** Removed combat integration feature entirely
  - ✅ **REASON:** Redundant functionality - FoundryVTT already provides this
  - ✅ **REASON:** Other modules handle combat management better
  - ✅ **REASON:** Feature was broken and provided limited value

### QUESTS TAB
- [ ] **CRITICAL** Objective status changes in quest list do not update on canvas pins (pins don't reflect completed/failed/hidden states)
- [ ] **BROKEN** Dragging quests or objectives to the canvas no longer works (pins do not show up on the canvas)

### PLAYER/TOKEN TAB
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