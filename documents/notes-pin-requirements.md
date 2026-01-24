# Notes Pin Requirements for Blacksmith Pin API

This document outlines the requirements for the Notes system's integration with the Blacksmith Pin API. This information should be shared with the Blacksmith developer to ensure the API supports Notes use cases.

## Overview

The Notes system needs to create optional canvas markers (pins) for spatially-pinned notes. These pins should:
- Represent notes on the canvas
- Be clickable to open the note in the panel
- Be draggable to reposition
- Persist across scene changes
- Support visual customization (sticky note appearance)

## Use Cases

### 1. Note Creation from Canvas
**Scenario**: User drags a note from the Notes panel to the canvas
- Pin should be created at drop location
- Pin should be associated with the note's UUID
- Pin should be saved to scene flags for persistence

### 2. Note Creation from Form with Location
**Scenario**: User creates a note via form and specifies canvas coordinates
- Pin should be created at specified coordinates
- Pin should be associated with the note's UUID
- Pin should be saved to scene flags for persistence

### 3. Pin Interaction
**Scenario**: User clicks on a note pin
- Pin should trigger a callback/event
- Notes system needs to open the note in the panel
- Notes system needs to scroll to the note card

### 4. Pin Repositioning
**Scenario**: User drags a pin to a new location
- Pin should be draggable (handled by Blacksmith)
- Pin position should be saved to scene flags
- Notes system needs to update note location flags

### 5. Pin Deletion
**Scenario**: User deletes a note or unpins it
- Pin should be removable via API call
- Pin should be cleaned up from scene flags
- Notes system needs to update note location flags

### 6. Scene Persistence
**Scenario**: User switches scenes
- Pins should be loaded for the new scene
- Pins should be filtered by scene ID
- Pins should be hidden when switching to a different scene

## API Requirements

### Pin Creation

**Method**: `pins.create(pinData, options?)`

**PinData Object**:
```javascript
{
    id: string,               // Required: UUID for the pin
    x: number,                // Canvas X coordinate
    y: number,                // Canvas Y coordinate
    moduleId: string,         // Required: 'coffee-pub-squire'
    image: string,            // Note header icon/image HTML (image if present, else '<i class="fa-solid fa-note-sticky"></i>')
    size: { w: number, h: number }, // Optional: defaults to { w: 32, h: 32 }
    style: {                  // Optional visual styling
        fill: string,         // Hex color string
        stroke: string,       // Hex color string
        strokeWidth: number,
        alpha: number
    },
    config: {
        noteUuid: string      // Journal page UUID for lookup
    }
}
```

**Options**:
- `sceneId` (string, optional): target scene; defaults to active scene
- `silent` (boolean, optional): skip event emission

**Returns**: PinData (created pin)

**Example**:
```javascript
const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
if (pins?.isAvailable()) {
    await pins.whenReady();
    const pin = await pins.create({
        id: crypto.randomUUID(),
        x: dropX,
        y: dropY,
        moduleId: 'coffee-pub-squire',
        image: '<i class="fa-solid fa-note-sticky"></i>',
        size: { w: 48, h: 48 },
        style: { fill: '#000000', stroke: '#ffff00', strokeWidth: 2, alpha: 0.9 },
        config: { noteUuid }
    }, { sceneId: canvas.scene.id });
    await pins.reload({ sceneId: canvas.scene.id });
}
```

### Pin Update

**Method**: `pins.update(pinId, patch, options?)`

**Patch Object**:
```javascript
{
    x: number,                 // New X coordinate (optional)
    y: number,                 // New Y coordinate (optional)
    image: string,             // Updated Font Awesome HTML (optional)
    style: {                   // Updated visual style (optional)
        fill: string,
        stroke: string,
        strokeWidth: number,
        alpha: number
    },
    config: object             // Updated config (optional)
}
```

**Use Cases**:
- Update pin position after drag
- Update pin appearance when note visibility changes
- Update pin metadata when note is edited

### Pin Deletion

**Method**: `pins.delete(pinId, options?)`

**Use Cases**:
- Delete pin when note is deleted
- Delete pin when note is unpinned
- Clean up orphaned pins

**Example**:
```javascript
await pins.delete(pinId, { sceneId: canvas.scene.id });
```

### Pin Query

**Method**: `pins.get(pinId)` or `pins.list(options?)`

**Use Cases**:
- Check if note already has a pin
- Get all note pins for a scene
- Get pin for a specific note

**Example**:
```javascript
// Get pin for specific note if you stored pinId
const pin = pins.get(pinId);

// Get all note pins for current scene
const notePins = pins.list({ moduleId: 'coffee-pub-squire', sceneId: canvas.scene.id });
```

### Pin Persistence

**Requirement**: Pins should be automatically persisted to scene flags

**Storage Format** (suggested):
```javascript
scene.setFlag('coffee-pub-blacksmith', 'pins', [
    {
        id: string,            // Unique pin ID
        x: number,
        y: number,
        size: { w: number, h: number },
        style: object,
        image: string,
        moduleId: string,
        config: { noteUuid: string }
    },
    // ... more pins
]);
```

**Notes System Requirements**:
- Pins should persist across scene changes
- Pins should be loaded when scene is activated
- Pins should be filtered by scene ID
- Pins should be cleaned up when scenes are deleted

## Visual Requirements

### Sticky Note Appearance

**Default Configuration**:
- **Icon**: `fa-sticky-note` (Font Awesome)
- **Color**: Yellow (`0xFFFF00`) or configurable
- **Size**: Standard size (configurable via size multiplier)
- **Shape**: Square or rounded rectangle (sticky note shape)

**Customization Needs**:
- Ability to change icon based on note type/tags
- Ability to change color based on note visibility (private vs party)
- Ability to change size based on user preference
- Ability to add text label (note title) below icon

**Visual States**:
- **Normal**: Standard appearance
- **Hover**: Slight scale increase or color change
- **Selected**: Highlighted border or background
- **Hidden**: Faded/transparent (for private notes visible to GM only)

## Interaction Requirements

### Click Behavior

**Left Click**:
- Should trigger `onClick` callback
- Notes system will handle opening note in panel
- Should not interfere with canvas selection

**Right Click**:
- Should trigger `onRightClick` callback (if provided)
- Notes system will show context menu (delete, unpin, edit)
- Should not interfere with canvas context menu

**Double Click**:
- Optional: Could trigger edit mode
- Notes system will handle if needed

### Drag Behavior

**Drag Start**:
- Should be draggable by default (or configurable)
- Should provide visual feedback (cursor change, slight scale)
- Should not interfere with canvas panning

**Drag Move**:
- Should update pin position in real-time
- Should snap to grid if configured (optional)

**Drag End**:
- Should trigger `onDragEnd` callback with new coordinates
- Notes system will update note location flags
- Pin position should be saved to scene flags

### Selection Behavior

**Canvas Selection**:
- Pins should not be selectable via canvas selection box
- Pins should not interfere with token/item selection
- Pins should be on a separate layer (foreground or dedicated layer)

## Integration Points

### 1. Canvas Drop Handler

**Location**: `scripts/squire.js` - `dropCanvasData` hook

**Flow**:
1. User drags note from panel to canvas
2. Notes system creates note journal page
3. Notes system calls `pins.create()` with drop coordinates
4. Pin is created and persisted

### 2. Note Creation from Form

**Location**: `scripts/panel-notes.js` - `NotesForm._updateObject()`

**Flow**:
1. User creates note via form with optional canvas coordinates
2. Notes system creates note journal page
3. If coordinates provided, Notes system calls `pins.create()`
4. Pin is created and persisted

### 3. Note Deletion

**Location**: `scripts/panel-notes.js` - Note deletion handler

**Flow**:
1. User deletes note
2. Notes system calls `pins.delete(pinId)` or deletes by list+config.noteUuid lookup
3. Pin is removed from canvas and scene flags

### 4. Note Unpin

**Location**: `scripts/panel-notes.js` - Unpin handler

**Flow**:
1. User clicks "Unpin" on a note
2. Notes system calls `pins.delete(pinId)` or deletes by list+config.noteUuid lookup
3. Pin is removed, note location flags are cleared

### 5. Scene Activation

**Location**: `scripts/squire.js` - Scene activation hooks

**Flow**:
1. Scene is activated
2. Blacksmith loads pins for the scene (handled by Blacksmith)
3. Notes system queries pins via `pins.list({ moduleId, sceneId })`
4. Notes system updates note location flags if needed

## Error Handling

### Missing API

**Scenario**: Blacksmith module not loaded or Pin API not available

**Handling**:
```javascript
const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
if (!pins?.isAvailable()) {
    // Graceful degradation: Notes work without pins
    console.warn('Blacksmith Pins API not available. Canvas pinning disabled.');
    return;
}
```

### Invalid Coordinates

**Scenario**: Pin coordinates are outside canvas bounds

**Handling**: Blacksmith should validate coordinates and clamp to canvas bounds

### Missing Note

**Scenario**: Pin references a note that no longer exists

**Handling**: 
- Blacksmith should provide cleanup method for orphaned pins
- Notes system will call cleanup on note deletion

## Performance Considerations

### Pin Limit

**Requirement**: Should support 100+ pins per scene without performance degradation

### Rendering

**Requirement**: Pins should use efficient rendering (PIXI sprites, not complex graphics)

### Updates

**Requirement**: Pin updates should be batched when possible

## Testing Scenarios

### Basic Functionality
- [ ] Create pin from canvas drop
- [ ] Create pin from form with coordinates
- [ ] Click pin to open note
- [ ] Drag pin to reposition
- [ ] Delete pin when note is deleted
- [ ] Unpin note removes pin

### Persistence
- [ ] Pin persists across scene changes
- [ ] Pin loads when scene is activated
- [ ] Pin is removed when scene is deleted
- [ ] Pin position is saved after drag

### Edge Cases
- [ ] Create pin for note that doesn't exist (should fail gracefully)
- [ ] Delete note with pin (pin should be cleaned up)
- [ ] Switch scenes with many pins (should load quickly)
- [ ] Create duplicate pins (should be prevented or handled)

### Visual
- [ ] Pin appears with correct icon and color
- [ ] Pin scales correctly
- [ ] Pin hover state works
- [ ] Pin is visible above tokens/items
- [ ] Pin doesn't interfere with canvas selection

## Questions for Blacksmith Developer

1. **API Availability**: When will the Pin API be available? What's the timeline?

2. **API Stability**: Will the API be stable, or should we expect changes?

3. **Persistence Format**: What format will pins be stored in? Can we customize the storage structure?

4. **Layer Management**: Will pins be on a dedicated layer? Can we control z-ordering?

5. **Performance**: What's the expected performance with 100+ pins? Any optimization recommendations?

6. **Customization**: How much visual customization is supported? Can we add text labels?

7. **Events**: What events are available? Can we listen for pin creation/deletion?

8. **Migration**: If pin storage format changes, how will migration be handled?

9. **Multi-Module**: How will pins from different modules (Notes, Quests, etc.) coexist?

10. **Documentation**: Where will API documentation be available?

## Implementation Notes

### Phase 1: Research (Before Implementation)
- Review Blacksmith Pin API documentation
- Understand API methods and options
- Identify any gaps or missing features
- Document integration approach

### Phase 2: Basic Integration
- Implement pin creation from canvas drop
- Implement pin creation from form
- Test basic functionality

### Phase 3: Full Integration
- Implement pin deletion
- Implement pin updates
- Implement scene persistence
- Test all scenarios

### Phase 4: Polish
- Add error handling
- Add loading states
- Optimize performance
- Test edge cases

## Success Criteria

- [ ] Notes can be pinned to canvas via drag-and-drop
- [ ] Notes can be pinned to canvas via form
- [ ] Pins are clickable and open notes in panel
- [ ] Pins are draggable and save position
- [ ] Pins persist across scene changes
- [ ] Pins are cleaned up when notes are deleted
- [ ] No performance issues with 100+ pins
- [ ] Graceful degradation if Blacksmith is not available

