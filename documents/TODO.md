# Squire Tray TODO List

---

## Current Issues (Fix First)

### MULTI-SELECT PERFORMANCE & MACROS PANEL ERROR
- [ ] **CRITICAL** Fix multi-select token lag (5-10 seconds) 
  
  **Problem Analysis:**
  - Two `controlToken` hooks both firing on every token during multi-select
  - Line 325 (first hook): Lightweight `_updateSelectionDisplay()` hook - only updates selection count display
  - Line 1702 (second hook): Heavy `_updateHealthPanelFromSelection()` hook causing massive lag
  - Issue: During multi-select, both hooks fire for EVERY token selection event
  - The heavy hook calls `PanelManager.initialize()`, `updateHandle()`, `renderPanels()`, animations, sounds on EACH token
  
  **Macros Panel Null Error:**
  - Error: `Cannot read properties of null (reading 'html')` at panel-macros.js:129
  - The macros panel tries to find `#macros-panel-placeholder` but it doesn't exist in DOM yet
  - Root cause: `_updateHealthPanelFromSelection()` calls `renderPanels()` which tries to render macros panel
  - During multi-select rapid firing, the DOM may not be fully initialized when renderPanels runs
  - The panel's render method looks for placeholder, creates container if missing, but `container` ends up null
  
  **Current Behavior:**
  - When selecting 5 tokens, the heavy hook runs 5 times
  - Each run does: PanelManager.initialize(), full actor update, all panel renders, animations, sounds
  - This causes 5-10 second lag even though nothing meaningful changed
  
  **Risks of Lightweight Approach:**
  - May miss actor changes if primary token switches during multi-select
  - May not update health panel correctly for multi-selected tokens
  - Could cause inconsistent UI state
  
  **Risks of Heavy Approach:**
  - Massive performance degradation with multiple tokens
  - Unnecessary re-renders waste CPU/memory
  - Poor user experience with laggy interface
  - Macros panel null error crashes rendering
  
  **Potential Solutions:**
  1. **Debounce heavy hook** - Only run after user stops selecting (e.g., 300ms delay)
  2. **Single vs Multi-Detection** - Skip heavy operations if multi-select in progress
  3. **Minimal Updates** - Only update what changed, skip full panel renders during multi-select
  4. **Null Safety** - Add defensive checks in renderPanels to handle missing placeholders
  5. **Combine Hooks** - Merge into single hook with smart branching logic
  
  **Recommended Approach:**
  - Use debouncing or delay on heavy hook to only run once after selection completes
  - Keep lightweight hook for immediate selection display updates
  - Add null checks in all panel render methods
  - Only run expensive operations when selection is "settled" (user stopped clicking)

  **Critical Understanding from Code Review:**
  
  **Line 1712 Hook Behavior:**
  - Hook 1 (Line 1712): `await PanelManager.initialize(token.actor)` called FIRST in the heavy hook
  - If same actor: `PanelManager.initialize` returns early at line 160 (doesn't recreate)
  - If different actor: Does FULL recreation (new instance, cleanup, createTray, renderPanels)
  - Then calls `_updateHealthPanelFromSelection()`
  
  **Line 1911 Check:**
  - `_updateHealthPanelFromSelection` checks `if (PanelManager.currentActor?.id !== actorToUse.id)`
  - If actor changed: Updates all panel references, updateHandle, renderPanels, animations, sounds
  - If actor SAME: Skips actor update, but STILL does: items.flush, health panel update, updateHandle, renderPanels, animations
  
  **Multi-Select Scenario (selecting 5 same-type tokens):**
  - Click 1: Hook fires → initialize checks actor → same actor, returns early → _updateHealthPanelFromSelection → actor same, skips actor update → BUT still renders ALL panels
  - Click 2: Hook fires → initialize checks actor → same actor, returns early → _updateHealthPanelFromSelection → actor same, skips actor update → BUT still renders ALL panels  
  - Click 3-5: SAME thing happens
  
  **THE REAL PROBLEM:**
  - `PanelManager.initialize` has protection (line 160) - GOOD
  - But `_updateHealthPanelFromSelection` has NO protection - it ALWAYS does full renders
  - Line 1965-1972: ALWAYS calls `updateHandle()` and `renderPanels()` regardless of actor change
  - Line 1972: `renderPanels` renders ALL panels even if nothing changed
  - During rapid multi-select, this causes DOM thrashing and lag
  - Macros panel error happens because renderPanels tries to render before DOM is stable
  
  **Root Cause:**
  - `_updateHealthPanelFromSelection` does expensive operations EVERY time, even when nothing changed
  - No check for "is this a multi-select in progress" - it runs synchronously on every token event
  - Health panel has smart check (line 1956), but everything else is unconditionally rendered
  
  **FOCUSED FIX PLAN:**
  
  **Step 1: Add Early Return Check** (Highest ROI - immediate lag reduction)
  - At START of `_updateHealthPanelFromSelection` (line 1881)
  - Check if actor is same AND selection count is same
  - If true, return early - skip all expensive operations
  - This eliminates ~80% of unnecessary renders during multi-select
  
  **Step 2: Add Null Safety to Macros Panel** (Prevents crashes)
  - In `panel-macros.js` line 83-90, add check after finding placeholder
  - If `placeholder.length === 0`, return early (DOM not ready)
  - Prevents "Cannot read properties of null" error
  
  **Step 3: Consider Debouncing** (If Step 1 not enough)
  - Add debounce wrapper around heavy hook at line 1702
  - Use 150ms delay - only run after user stops clicking
  - Trade-off: slight delay before updates vs instant lag
  
  **Why this approach:**
  - Step 1 is surgical: single check prevents wasted work
  - Step 2 is defensive: prevents crashes during edge cases
  - Step 3 is optional: only if user still sees lag
  - Minimal code changes, maximum impact
  - No architectural changes needed

### TOKEN NAME DISPLAY ISSUE
- [ ] **CRITICAL** Fix token name display inconsistency - handle shows actor name instead of token name
  - Handle shows "CULTIST" instead of "Belix (Cultist)" when token is selected
  - Health panel shows "HEALTH: CULTIST" instead of token-specific name
  - Token Configuration correctly shows "Belix (Cultist)" - this data is available
  - Need simple fix: ensure handle gets correct token reference when tokens are selected
  - Previous attempt overcomplicated the solution - need minimal, targeted approach
  - Consider rolling back recent changes and starting fresh

### QUESTS TAB
- [ ] **CRITICAL** Objective status changes in quest list do not update on canvas pins (pins don't reflect completed/failed/hidden states)

### NOTES TAB
- [ ] **ENHANCEMENT** Expand and optimize this section. It needs to have a shared note, character note, and scratchpad

### CODEX TAB
- [ ] **ENHANCEMENT** Clicking a tag on a codex item should filter the codex by that tag
- [ ] **ENHANCEMENT** Need to add a "new" flag to added items that goes away at next client refresh
- [ ] **ENHANCEMENT** When dragging a token to the manual add, we need to pull the bio and put it in the description

## Remaining Issues

### Panel Functionality
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

