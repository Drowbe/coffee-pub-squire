# Squire Tray TODO List

## 🚨 HOOK RESTORATION PROJECT 🚨

**Status:** In Progress  
**Started:** 2025-10-21  
**Reference:** `documents/HOOK-AUDIT-REPORT.md` | `_backups/manager-hooks.js`

### PHASE 1: Critical Foundation (DO THESE FIRST)

#### Priority 1A: `globalUpdateActor` Hook ⭐⭐⭐
- [ ] Add hook to `scripts/squire.js` after line 426
- [ ] Copy implementation from backup lines 828-877
- [ ] Test: HP changes update handle
- [ ] Test: AC/level changes trigger re-render
- [ ] Test: Spell slot changes update spells panel
- [ ] Test: Effect changes update handle
- [ ] Commit: `fix: restore globalUpdateActor hook for sync issues`
- **Impact:** Fixes 80% of sync issues (health bars, effects, stats)
- **Risk:** LOW | **Time:** 15 min

#### Priority 1B: `globalDeleteToken` Hook ⭐⭐⭐
- [ ] Add hook to `scripts/squire.js` after globalUpdateActor
- [ ] Copy implementation from backup lines 767-826
- [ ] Test: Delete active token switches to next actor
- [ ] Test: Delete last token handles gracefully
- [ ] Commit: `fix: restore globalDeleteToken hook for token management`
- **Impact:** Prevents tray crashes when tokens deleted
- **Risk:** LOW | **Time:** 10 min

### PHASE 2: High-Priority Improvements

#### Priority 2A: Restore Full `globalControlToken` Implementation ⭐⭐
- [ ] Review current implementation (lines 307-322)
- [ ] Replace with full backup implementation (lines 718-765)
- [ ] Verify helper functions exist
- [ ] Test: Single token selection
- [ ] Test: Multi-token selection (Shift+click)
- [ ] Test: Canvas box selection
- [ ] Monitor console for excessive renders
- [ ] Commit: `fix: restore full globalControlToken with multi-select debouncing`
- **Impact:** Fixes multi-select, reduces over-rendering
- **Risk:** MEDIUM | **Time:** 20 min

#### Priority 2B: `globalPauseGame` Hook ⭐⭐
- [ ] Add hook to `scripts/squire.js` after globalDeleteToken
- [ ] Copy implementation from backup lines 879-890
- [ ] Test: Pause game, change actor, unpause - verify panels refresh
- [ ] Commit: `fix: restore globalPauseGame hook`
- **Impact:** Prevents stale data after pause
- **Risk:** LOW | **Time:** 5 min

### PHASE 3: Medium-Priority Completion

#### Priority 3A: `globalCanvasReady` with Selection Handling ⭐
- [ ] Note: Basic hook exists at line 64, needs enhancement
- [ ] Add selection handling from backup lines 1070-1098
- [ ] Add canvas.selectObjects monkey-patch
- [ ] Test: Lasso/box selection tools
- [ ] Test: Health panel updates with bulk selections
- [ ] Commit: `fix: enhance globalCanvasReady with selection handling`
- **Impact:** Bulk selection support
- **Risk:** MEDIUM | **Time:** 15 min

#### Priority 3B: `globalCreateToken` Hook ⭐
- [ ] Add global version (quest pin version exists at line 604)
- [ ] Copy implementation from backup lines 1100-1119
- [ ] Test: Drag new token to canvas - verify handle updates
- [ ] Commit: `fix: add globalCreateToken hook`
- **Impact:** New token detection
- **Risk:** LOW | **Time:** 5 min

### PHASE 4: Optional Enhancements

#### Priority 4A: Restore Auto-Favoriting in `globalUpdateItem` (DECIDE)
- [ ] **DECISION REQUIRED:** Do we want auto-favoriting back?
- [ ] If YES: Replace implementation (lines 346-364) with backup (lines 957-999)
- [ ] Test: NPC equips weapon → auto-favorited
- [ ] Test: NPC prepares spell → auto-favorited
- [ ] Commit: `feat: restore auto-favoriting for NPCs`
- **Impact:** QoL for NPCs/monsters
- **Risk:** LOW | **Time:** 10 min
- **Note:** Adds "magic" behavior that could be unexpected

### PHASE 5: Cleanup & Documentation

#### Priority 5A: Update False Comments
- [ ] Update `scripts/manager-panel.js` lines 2046-2078
- [ ] Mark implemented hooks as "✅ Implemented"
- [ ] Remove or correct false claims
- [ ] Commit: `docs: update hook management comments`
- **Time:** 10 min

#### Priority 5B: Remove Old HookManager Code
- [ ] Search for any old HookManager references
- [ ] Archive `_backups/manager-hooks.js` as reference only
- [ ] Document in architecture that hooks now in `scripts/squire.js`
- [ ] Commit: `docs: document hook migration completion`
- **Time:** 15 min

### Testing Checklist (Run After Each Phase)

#### Must Test:
- [ ] Select token → panels update
- [ ] Change HP → health bars update
- [ ] Add effect via token HUD → handle updates
- [ ] Delete effect via character sheet → handle updates
- [ ] Delete active token → tray handles gracefully
- [ ] Multi-select tokens → all update correctly
- [ ] Pause/unpause game → fresh data loads

#### Regression Testing:
- [ ] All 5 view modes work (player, party, notes, codex, quest)
- [ ] Popped-out windows still functional
- [ ] Quest pins still draggable
- [ ] Favorites still manageable
- [ ] No console errors during normal operation

### Git Strategy
- [ ] Create branch: `fix/restore-missing-hooks`
- [ ] Commit current working state
- [ ] Test baseline functionality
- [ ] Implement ONE hook at a time
- [ ] Test that specific hook
- [ ] Commit with clear message
- [ ] Easy to revert individual commits if needed

---

## Current Issues (Fix First)

### GLOBAL HOOKS
- [ ] **CRITICAL** Missing `globalUpdateActor` hook causing health panel and handle sync issues
  - Health bar in handle doesn't update when HP changes externally
  - Health panel doesn't refresh when HP changes
  - Party panel health bars may not update properly
  - Handle stats don't refresh on major actor changes (name, img, level, AC, etc.)
  - Missing spell slot change handling
  - This hook was present in backup but removed from active code
  - See `_backups/manager-hooks.js` lines 828-877 for reference implementation
- [ ] **HIGH** Missing `globalDeleteToken` hook - no fallback when active token deleted (backup lines 767-826)
- [ ] **HIGH** `globalControlToken` hook degraded - lost multi-select debouncing and over-renders (backup lines 718-765)
- [ ] **MEDIUM** Missing `globalPauseGame` hook - panels show stale data after unpause (backup lines 879-890)
- [ ] **MEDIUM** Missing `globalCanvasReady` selection handling - bulk selections may not update (backup lines 1070-1098)
- [ ] **MEDIUM** Missing `globalCreateToken` hook - new tokens don't trigger handle updates (backup lines 1100-1119)
- [ ] **NOTE** See `documents/HOOK-AUDIT-REPORT.md` for complete analysis of all missing/changed hooks

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