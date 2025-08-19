# Coffee Pub Squire Refactor Plan

## Current State Analysis

### What's Working
- Basic panel functionality
- Panel popout windows
- Some handle functionality (when it works)

### What's Broken
- Handle data not loading on client load
- Handle data not refreshing on token changes
- Handle data only updates on tab switches
- Circular import issues between HandleManager and PanelManager

### Current Architecture Problems
- `PanelManager` is a "god object" doing too many things
- `HandleManager` imports `PanelManager` while `PanelManager` creates `HandleManager` (circular dependency)
- Mixed responsibilities: panel management, view switching, handle management, hook management

## Target Architecture

### Manager Structure
```
ManagerTray (coordinator - squire.js)
├── ManagerView (tab switching, view state)
├── ManagerHandle (handle content & interactions)
├── ManagerPanel (panel lifecycle & coordination)
├── Hooks (event handling)
├── Helpers (shared utilities)
├── Common (shared components)
└── Settings (configuration)
```

### Responsibilities

#### ManagerTray (squire.js)
- Load and initialize other managers
- Coordinate between managers
- Handle high-level application flow
- **NOT**: Direct panel/handle management

#### ManagerView
- Tab switching logic
- View mode state management
- Tab validation
- Tab-specific UI updates

#### ManagerPanel (current PanelManager)
- Panel lifecycle (create/destroy/show/hide)
- Panel popout window management
- Panel data sharing coordination
- Panel state management
- **NOT**: View switching, handle management, hook management

#### ManagerHandle
- Handle data preparation
- Handle rendering
- Handle event listeners
- Handle state management

## Current Refactor Status

### Phase 1: HandleManager Extraction ✅ COMPLETED
- Created `scripts/manager-handle.js`
- Moved handle logic from PanelManager to HandleManager
- Modified PanelManager to delegate handle updates to HandleManager

### Phase 2: Fix Circular Import Issues 🔄 IN PROGRESS
- **Problem**: HandleManager imports PanelManager while PanelManager creates HandleManager
- **Solution**: Pass data through constructor instead of importing PanelManager
- **Status**: Need to implement

### Phase 3: Restore Functionality 🔄 PENDING
- Fix handle data loading on client load
- Fix handle data refreshing on token changes
- Verify all buttons and interactions work
- **Goal**: Get back to working state for Thursday's game

### Phase 4: Full Architectural Refactor 🔄 PENDING
- Extract ManagerView from PanelManager
- Extract ManagerPanel from PanelManager
- Extract Hooks management
- Reorganize into proper manager structure
- **Timeline**: After Thursday's game

## Technical Decisions Made

### 1. HandleManager Data Access
- **Decision**: Pass data through constructor instead of importing PanelManager
- **Reason**: Avoid circular dependencies and tight coupling
- **Implementation**: 
  ```javascript
  new HandleManager({
      element: PanelManager.element,
      viewMode: PanelManager.viewMode,
      actor: this.actor,
      // other needed data
  });
  ```

### 2. Template Rendering
- **Decision**: Keep using `renderTemplate` (global FoundryVTT function)
- **Reason**: No need to import, it's built into FoundryVTT
- **Status**: Confirmed working

### 3. Static vs Instance Properties
- **Decision**: Use static properties for shared state (PanelManager.element, PanelManager.viewMode)
- **Reason**: These are application-wide references that don't belong to instances
- **Status**: Confirmed working

## File Structure Decisions

### Current Files
- `scripts/squire.js` → **BECOMES**: ManagerTray (coordinator)
- `scripts/panel-manager.js` → **BECOMES**: ManagerPanel (panel management only)
- `scripts/manager-handle.js` → **STAYS**: ManagerHandle (handle management)
- `scripts/hooks.js` → **STAYS**: Hooks management

### New Files to Create
- `scripts/manager-view.js` → View/tab management
- `scripts/manager-tray.js` → High-level coordination (if squire.js becomes this)

## Import Strategy

### Avoid Circular Imports
- Managers should not import each other
- Data should be passed through constructors or method parameters
- Shared utilities should be in separate modules (helpers, common)

### Current Import Issues
- `HandleManager` imports `PanelManager` ❌
- `PanelManager` creates `HandleManager` ❌
- **Solution**: Remove import, pass data through constructor

## Testing Strategy

### Phase 2 Testing
- Handle updates on client load
- Handle updates on token changes
- Handle updates on tab switches
- All handle buttons functional

### Phase 3 Testing
- All panel functionality restored
- No console errors
- Full application working as before

### Phase 4 Testing
- New architecture functional
- No performance regressions
- Cleaner separation of concerns

## Rollback Plan

### If Phase 2 Fails
- Revert HandleManager changes
- Return to monolithic PanelManager
- Focus on minimal fixes for Thursday's game

### If Phase 3 Fails
- Revert to last known working state
- Document what broke
- Plan simpler refactor approach

## Success Criteria

### Phase 2 Success
- No circular import errors
- Handle functionality restored
- Ready for Thursday's game

### Phase 3 Success
- All functionality restored
- No regressions
- Clean, maintainable code

### Phase 4 Success
- Proper separation of concerns
- No "god objects"
- Easier to maintain and extend

## Notes

- **Priority**: Get working for Thursday's game
- **Approach**: Fix what's broken first, then refactor
- **Risk**: Don't break working functionality during refactor
- **Timeline**: Phase 2-3 before Thursday, Phase 4 after
