# Canvas Pin System Architecture

This document describes how the Coffee Pub Squire module implements pins on the FoundryVTT canvas. This architecture can be used as a reference for other modules that want to implement their own pin system.

## Overview

The pin system allows placing interactive markers on the canvas that represent quests and objectives. Pins are:
- **Persistent**: Saved to scene flags and restored when scenes are loaded
- **Interactive**: Support drag, click, double-click, and right-click interactions
- **Configurable**: Appearance controlled via JSON configuration file
- **State-aware**: Automatically update appearance based on quest/objective states
- **Visibility-controlled**: Respect user preferences and quest visibility settings

## Core Components

### 1. Canvas Container (`canvas.squirePins`)

A PIXI.Container that holds all pins for the current scene. Created during canvas initialization.

**Location**: `scripts/squire.js` (lines 91-142, 950-991)

**Key Properties**:
- `sortableChildren = true` - Allows z-ordering of pins
- `interactive = true` - Enables pointer events
- `eventMode = 'static'` - Required for FoundryVTT v12+ compatibility

**Creation Pattern**:
```javascript
if (!canvas.squirePins) {
    const squirePins = new PIXI.Container();
    squirePins.sortableChildren = true;
    squirePins.interactive = true;
    squirePins.eventMode = 'static';
    
    // Add to foreground group if available (v12+), otherwise stage
    if (canvas.foregroundGroup) {
        canvas.foregroundGroup.addChild(squirePins);
    } else {
        canvas.stage.addChild(squirePins);
    }
    
    canvas.squirePins = squirePins;
}

// Ensure container is at top of display order
if (canvas.squirePins) {
    const parent = canvas.squirePins.parent;
    if (parent && parent.children[parent.children.length - 1] !== canvas.squirePins) {
        parent.addChild(canvas.squirePins);
    }
}
```

**Hooks Used**:
- `init` - Initial creation attempt
- `ready` - Fallback creation
- `canvasReady` - Final fallback and positioning

**⚠️ Issues & Improvements**:
- Container creation is duplicated across multiple hooks - should be centralized
- No cleanup when scenes change - container persists but should be cleared
- No validation that container exists before use in all locations

### 2. Pin Class (`QuestPin`)

Extends `PIXI.Container` to create interactive pin objects.

**Location**: `scripts/quest-pin.js`

**Constructor Parameters**:
```javascript
new QuestPin({
    x: number,                    // Canvas X coordinate
    y: number,                    // Canvas Y coordinate
    questUuid: string,            // UUID of journal entry
    objectiveIndex: number|null,   // Index of objective (null for quest-level pins)
    objectiveState: string|null,   // 'active', 'completed', 'failed', 'hidden'
    questIndex: string,            // Quest number for display
    questCategory: string,         // 'Main Quest' or 'Side Quest'
    questState: string,           // 'visible' or 'hidden'
    questStatus: string,           // 'Not Started', 'In Progress', 'Complete', 'Failed'
    participants: array,           // Array of participant objects
    config: object                 // Optional config override
})
```

**Key Methods**:
- `_updatePinAppearance()` - Redraws pin based on current state and config
- `updateVisibility()` - Updates pin visibility based on user/quest settings
- `updateObjectiveState(newState)` - Updates objective state and appearance
- `updateQuestStatus(newStatus)` - Updates quest status and appearance
- `_saveToPersistence()` - Saves pin data to scene flags
- `_removeFromPersistence()` - Removes pin from scene flags

**Pin Types**:
- **Quest pins** (`pinType === 'quest'`): Circular, represent entire quest
- **Objective pins** (`pinType === 'objective'`): Square/rounded rectangle, represent specific objectives

**Visual Structure** (rendered bottom-to-top):
1. Contact shadow (PIXI.Graphics)
2. Outer ring(s) (PIXI.Graphics) - state-colored border
3. Inner shape (PIXI.Graphics) - filled background
4. Icon (PIXI.Text) - Font Awesome icon
5. Label (PIXI.Text) - Quest/objective number
6. Title (PIXI.Text) - Optional quest/objective name

**⚠️ Issues & Improvements**:
- Async config loading handled via promises but could cause race conditions
- `_updatePinAppearance()` completely removes and recreates children - inefficient for frequent updates
- No debouncing for rapid state changes
- Hit area only covers inner shape, not title text (makes clicking titles difficult)

### 3. Configuration System

Pin appearance is controlled by a JSON configuration file.

**Location**: `themes/quest-pins.json`

**Structure**:
```json
{
  "inner": { /* Inner shape dimensions and styling */ },
  "outer": { /* Ring dimensions and styling */ },
  "font": { /* Font family, size, color */ },
  "title": { /* Title text styling */ },
  "icons": { /* Icon unicode characters */ },
  "quest": { /* Quest-specific styling */ },
  "objective": { /* Objective-specific styling */ },
  "mouseover": { /* Hover effects */ }
}
```

**Loading**:
- Cached after first load (`PIN_CONFIG_CACHE`)
- Unicode escape sequences converted from `\uf024` format to actual characters
- Merged with optional constructor config parameter

**Location**: `scripts/quest-pin.js` (lines 12-74)

**⚠️ Issues & Improvements**:
- Cache never invalidated - changes to JSON require module reload
- No validation of config structure
- Unicode conversion is fragile - depends on exact JSON format
- No way to hot-reload config for testing

### 4. Persistence System

Pins are saved to scene flags and restored when scenes load.

**Storage Format**:
```javascript
scene.setFlag(MODULE.ID, 'questPins', [
    {
        pinId: string,              // Unique identifier
        questUuid: string,
        objectiveIndex: number|null,
        x: number,
        y: number,
        objectiveState: string,
        questIndex: string,
        questCategory: string,
        questState: string,
        pinType: string,
        questStatus: string,
        participants: array
    },
    // ... more pins
]);
```

**Saving**: `QuestPin._saveToPersistence()` (lines 760-799)
- Only GMs can save
- Finds existing pin by `pinId` or adds new entry
- Saves entire pin data object

**Loading**: `loadPersistedPins()` (lines 1646-1762)
- Called on scene activation
- Clears existing pins first
- Creates new `QuestPin` instances from saved data
- Updates pin states from current journal entry content
- Cleans up orphaned pins (references to deleted quests)

**⚠️ Issues & Improvements**:
- No migration system for pin data format changes
- Orphaned pin cleanup only runs for GMs
- Loading is async but doesn't await pin creation - could cause timing issues
- No validation of saved pin data structure
- Pin IDs generated with timestamp - could collide if created simultaneously

### 5. Drag & Drop Creation

Pins are created by dragging quests/objectives from the quest panel to the canvas.

**Location**: `scripts/squire.js` (lines 687-806)

**Hook**: `dropCanvasData`

**Data Format**:
```javascript
// For objectives
{
    type: 'quest-objective',
    questUuid: string,
    objectiveIndex: number,
    objectiveState: string,
    questIndex: string,
    questCategory: string,
    questState: string
}

// For quests
{
    type: 'quest-quest',
    questUuid: string,
    questIndex: string,
    questCategory: string,
    questState: string,
    questStatus: string,
    participants: array
}
```

**Process**:
1. Hook intercepts drop with matching type
2. Only GMs can create pins
3. Creates new `QuestPin` instance
4. Adds to `canvas.squirePins` container
5. Saves to persistence
6. Auto-shows pins if currently hidden

**⚠️ Issues & Improvements**:
- No validation that questUuid exists before creating pin
- No check for duplicate pins at same location
- Auto-show behavior might be unexpected for users
- No undo/redo support

### 6. State Synchronization

Pins automatically update when journal entries change.

**Location**: `scripts/squire.js` (lines 1086-1173)

**Hook**: `updateJournalEntryPage`

**Update Triggers**:
- Quest visibility flag changes (`flags[MODULE.ID].visible`)
- Quest content changes (status, objective states)
- Any text content modification

**Update Process**:
1. Find all pins for the updated quest (`questUuid` match)
2. Update quest state from flags
3. Parse quest content for status/objective states
4. Call `updateQuestStatus()` or `updateObjectiveState()` on pins
5. Refresh pin appearance
6. Update visibility for all pins

**⚠️ Issues & Improvements**:
- Parsing HTML with regex is fragile - should use DOM parser consistently
- No debouncing for rapid journal updates
- Updates all pins even if only one changed
- No way to batch multiple updates

### 7. Interaction System

Pins support various mouse interactions.

**Click Actions** (GM only):
- **Left-click**: Select pin and jump to quest in tracker
- **Left double-click**: Complete objective
- **Shift+Left-click**: Toggle hidden state
- **Middle-click**: Toggle hidden state
- **Right-click**: Toggle visibility (quest) or fail objective (objective)
- **Double right-click**: Delete pin

**Drag** (GM only):
- Left mouse button drag to reposition
- Uses global event listeners to continue drag outside pin bounds
- Saves position on drag end
- Prevents Foundry selection box during drag

**Location**: `scripts/quest-pin.js` (lines 824-989, 992-1174)

**⚠️ Issues & Improvements**:
- Global event listeners (`document.addEventListener`) must be manually cleaned up
- `_forceEndDrag()` called on pin removal but could be missed in edge cases
- Click timeout (100ms) might interfere with fast double-clicks
- Right-click timeout (300ms) for single vs double-click detection is fragile
- No visual feedback during drag operations
- Cursor changes but could be more obvious

### 8. Visibility System

Pins respect multiple visibility layers.

**Visibility Checks** (`shouldBeVisible()`):
1. User flag: `game.user.getFlag(MODULE.ID, 'hideQuestPins')` - hides all pins
2. Quest state: `questState === 'hidden'` - hides quest and its objectives
3. Objective state: `objectiveState === 'hidden'` - hides specific objective
4. GM override: GMs can see hidden quests (with visual indicator)

**Location**: `scripts/quest-pin.js` (lines 195-240)

**Visual Indicators**:
- Hidden quests show second outer ring (GM only)
- Ring colors change based on state
- Icon colors match ring colors

**⚠️ Issues & Improvements**:
- Visibility logic scattered across multiple methods
- No way to preview hidden pins without toggling visibility
- Second ring for hidden quests only visible to GMs - players see nothing

## Best Practices for Implementation

### 1. Container Management
- Create container in `canvasReady` hook (most reliable)
- Always check `canvas.squirePins` exists before use
- Clear container when scenes change
- Keep container at top of display order

### 2. Pin Lifecycle
- Generate unique IDs for persistence
- Save immediately after creation/modification
- Clean up event listeners on removal
- Update appearance after state changes

### 3. Configuration
- Use JSON for easy customization
- Cache loaded config
- Provide fallback defaults
- Validate config structure

### 4. Persistence
- Store minimal required data
- Include unique identifiers
- Validate loaded data
- Handle missing/invalid data gracefully

### 5. State Synchronization
- Use Foundry hooks for automatic updates
- Parse journal content carefully (use DOM parser, not regex)
- Update only affected pins
- Debounce rapid updates

### 6. Event Handling
- Clean up global event listeners
- Use Foundry's timer utilities for timeouts
- Prevent event bubbling where needed
- Provide visual feedback for interactions

### 7. Performance
- Avoid recreating graphics on every update
- Cache parsed journal content
- Batch multiple pin updates
- Use PIXI's object pooling for frequently created/destroyed objects

## Things to Do Differently

### 1. Container Creation
**Current**: Duplicated across multiple hooks
**Better**: Single initialization function called from `canvasReady` only

### 2. Pin Appearance Updates
**Current**: Removes all children and recreates
**Better**: Update existing graphics objects, only recreate when structure changes

### 3. Config Loading
**Current**: Cached forever, no invalidation
**Better**: Add cache invalidation, config validation, hot-reload support

### 4. Persistence
**Current**: Saves entire pin object
**Better**: Save only essential data, add migration system, validate on load

### 5. State Parsing
**Current**: Regex parsing of HTML
**Better**: Use DOM parser consistently, cache parsed results

### 6. Event Cleanup
**Current**: Manual cleanup in multiple places
**Better**: Use AbortController for event listeners, automatic cleanup on pin destruction

### 7. Visibility System
**Current**: Multiple checks scattered across code
**Better**: Centralized visibility manager, clearer separation of concerns

### 8. Error Handling
**Current**: Try-catch blocks with silent failures
**Better**: Proper error logging, user notifications for critical failures

## Integration Points

### For Other Modules

If another module wants to implement a similar pin system:

1. **Container**: Create your own container (e.g., `canvas.myModulePins`) to avoid conflicts
2. **Hooks**: Use `dropCanvasData` for creation, `updateJournalEntryPage` for updates
3. **Persistence**: Use scene flags with your module ID as namespace
4. **Configuration**: Follow similar JSON structure for consistency
5. **Events**: Use PIXI event system, clean up properly

### Potential Conflicts

- Multiple modules using `canvas.squirePins` - use unique container names
- Drag & drop data types - use unique `type` values
- Scene flag namespaces - use module ID prefix
- Hook priorities - coordinate with other modules if needed

## Testing Considerations

- Test pin creation on empty canvas
- Test pin persistence across scene changes
- Test pin updates when journal entries change
- Test visibility toggles for GMs and players
- Test drag operations with rapid movements
- Test cleanup when pins are deleted
- Test orphaned pin cleanup
- Test config loading failures
- Test with missing journal entries
