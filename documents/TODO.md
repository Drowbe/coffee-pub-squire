# Squire Tray TODO List

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

### QUESTS TAB
- [ ] **CRITICAL** Objective status changes in quest list do not update on canvas pins (pins don't reflect completed/failed/hidden states)

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

