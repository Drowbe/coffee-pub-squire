# Squire Tray TODO List

## 🚨 HOOK RESTORATION PROJECT 🚨

**Status:** In Progress  
**Started:** 2025-10-21  
**Reference:** `documents/HOOK-AUDIT-REPORT.md` | `_backups/manager-hooks.js`

### PHASE 1: Critical Foundation (DO THESE FIRST)

#### Priority 1A: `globalUpdateActor` Hook ⭐⭐⭐
- [x] Add hook to `scripts/squire.js` after line 426
- [x] Copy implementation from backup lines 828-877
- [x] Test: HP changes update handle
- [x] Test: AC/level changes trigger re-render
- [x] Test: Spell slot changes update spells panel
- [x] Test: Effect changes update handle
- [x] Commit: `fix: restore globalUpdateActor hook for sync issues`
- **Impact:** Fixes 80% of sync issues (health bars, effects, stats)
- **Risk:** LOW | **Time:** 15 min

#### Priority 1B: `globalDeleteToken` Hook ⭐⭐⭐
- [x] Add hook to `scripts/squire.js` after globalUpdateActor
- [x] Copy implementation from backup lines 767-826
- [x] Test: Delete active token switches to next actor
- [x] Test: Delete last token handles gracefully
- [x] Commit: `fix: restore globalDeleteToken hook for token management`
- **Impact:** Prevents tray crashes when tokens deleted
- **Risk:** LOW | **Time:** 10 min

### PHASE 2: High-Priority Improvements ✅ COMPLETE

#### Priority 2A: Restore Full `globalControlToken` Implementation ⭐⭐ ✅
- [x] Review current implementation (lines 307-322)
- [x] Replace with full backup implementation (lines 718-765)
- [x] Verify helper functions exist
- [x] Test: Single token selection
- [x] Test: Multi-token selection (Shift+click)
- [x] Test: Canvas box selection
- [x] Monitor console for excessive renders
- [x] Optimize for performance (simplified approach)
- [x] Commit: `fix: restore globalControlToken with performance optimization`
- **Impact:** Fixes multi-select, reduces over-rendering
- **Risk:** MEDIUM | **Time:** 20 min

#### Priority 2B: `globalPauseGame` Hook ⭐⭐ ✅
- [x] Add hook to `scripts/squire.js` after globalDeleteToken
- [x] Copy implementation from backup lines 879-890
- [x] Test: Pause game, change actor, unpause - verify panels refresh
- [x] Commit: `fix: restore globalPauseGame hook`
- **Impact:** Prevents stale data after pause
- **Risk:** LOW | **Time:** 5 min

### PHASE 3: Medium-Priority Completion ✅ COMPLETE

#### Priority 3A: `globalCanvasReady` with Selection Handling ⭐ ✅
- [x] Note: Basic hook exists at line 64, needs enhancement
- [x] Add selection handling from backup lines 1070-1098
- [x] Add canvas.selectObjects monkey-patch
- [x] Test: Lasso/box selection tools
- [x] Test: Health panel updates with bulk selections
- [x] Commit: `fix: enhance globalCanvasReady with selection handling`
- **Impact:** Bulk selection support
- **Risk:** MEDIUM | **Time:** 15 min

#### Priority 3B: `globalCreateToken` Hook ⭐ ✅
- [x] Add global version (quest pin version exists at line 604)
- [x] Copy implementation from backup lines 1100-1119
- [x] Test: Drag new token to canvas - verify handle updates
- [x] Commit: `fix: add globalCreateToken hook`
- **Impact:** New token detection
- **Risk:** LOW | **Time:** 5 min

### PHASE 4: Optional Enhancements ✅ COMPLETE

#### Priority 4A: Restore Auto-Favoriting in `globalUpdateItem` ✅
- [x] **DECISION REQUIRED:** Do we want auto-favoriting back? **YES**
- [x] Replace implementation (lines 346-364) with backup (lines 957-999)
- [x] Test: NPC equips weapon → auto-favorited
- [x] Test: NPC prepares spell → auto-favorited
- [x] Commit: `feat: restore auto-favoriting for NPCs`
- **Impact:** QoL for NPCs/monsters
- **Risk:** LOW | **Time:** 10 min
- **Note:** Adds "magic" behavior that could be unexpected

### PHASE 5: Cleanup & Documentation ✅ COMPLETE

#### Priority 5A: Update False Comments ✅
- [x] Update `scripts/manager-panel.js` lines 2046-2078
- [x] Mark implemented hooks as "✅ Implemented"
- [x] Remove or correct false claims
- [x] Commit: `docs: update hook management comments`
- **Time:** 10 min

#### Priority 5B: Remove Old HookManager Code ✅
- [x] Search for any old HookManager references
- [x] Archive `_backups/manager-hooks.js` as reference only
- [x] Document in architecture that hooks now in `scripts/squire.js`
- [x] Commit: `docs: document hook migration completion`
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

### TOKEN NAME DISPLAY ISSUE
- [ ] **CRITICAL** Fix token name display inconsistency - handle shows actor name instead of token name
  - Handle shows "CULTIST" instead of "Belix (Cultist)" when token is selected
  - Health panel shows "HEALTH: CULTIST" instead of token-specific name
  - Token Configuration correctly shows "Belix (Cultist)" - this data is available
  - Need simple fix: ensure handle gets correct token reference when tokens are selected
  - Previous attempt overcomplicated the solution - need minimal, targeted approach
  - Consider rolling back recent changes and starting fresh

### COMBAT INTEGRATION ISSUE
- [ ] **HIGH** Fix "Add to Combat" button error: `token.actor.addToCombat is not a function`
  - Error occurs when clicking "Add to Combat" button in tray
  - `manager-panel.js:703:43` - `token.actor.addToCombat()` method doesn't exist
  - Need to check D&D 5e system API for correct combat integration method
  - May need to use `CombatTracker.createCombatant()` or similar FoundryVTT API
  - Error prevents GMs from easily adding tokens to combat from tray

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