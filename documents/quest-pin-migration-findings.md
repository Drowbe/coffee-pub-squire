# Quest Pin Migration: Key Findings from Notes Implementation

**Supporting reference only.** The system of record for the migration plan is **`documents/plan-quest-pin-migration.md`**. Use this document when implementing: it contains code-level detail and examples from the Notes tab (ownership mapping, place/unplace flow, GM proxy). It is not a separate plan; it supports the single plan.

## Date: 2026-01-26

## Summary

After reviewing how the Notes tab uses the Blacksmith Pins API, here are the key findings and recommendations for migrating quest pins.

## How Notes Uses Pins API

### 1. **Unplaced by Default, Place/Unplace Pattern**

Notes creates pins **without** scene coordinates initially (unplaced):

```javascript
// Create unplaced pin
const pinPayload = {
    id: generateNotePinId(),
    moduleId: MODULE.ID,
    type: NOTE_PIN_TYPE,
    // NO x, y, sceneId here
    image: resolveNotePinImageValueFromPage(page),
    ownership: getNotePinOwnershipForPage(page),
    config: { noteUuid: page.uuid, ... }
};
pinData = await pins.create(pinPayload); // No sceneId option
```

Then uses `pins.place()` to put on canvas:

```javascript
// Place on scene
await pins.place(existingPinId, { sceneId, x, y });
await pins.reload({ sceneId });
```

And `pins.unplace()` to remove from canvas:

```javascript
// Unplace from scene
await pins.unplace(pinId);
```

**Recommendation for Quests**: Adopt this pattern. Remove drag-to-canvas. Add "Pin to Scene" button that:
1. Creates unplaced pin if doesn't exist
2. Opens scene picker + coordinate selector
3. Calls `pins.place(pinId, { sceneId, x, y })`

### 2. **Ownership Mapping**

Notes has a dedicated function that maps note visibility to pin ownership:

```javascript
export function getNotePinOwnershipForPage(page) {
    const visibility = page?.getFlag(MODULE.ID, 'visibility') || 'private';
    const authorId = page?.getFlag(MODULE.ID, 'authorId') || game.user.id;
    
    const users = {};
    
    if (visibility === 'party') {
        // PARTY: all non-GM players are OWNERS
        game.users.forEach(user => {
            if (!user.isGM) {
                users[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
            }
        });
    } else {
        // PRIVATE: only author is OWNER
        if (authorId) {
            users[authorId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        }
    }
    
    // Always include GMs as owners
    game.users.forEach(user => {
        if (user.isGM) {
            users[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        }
    });
    
    return {
        default: visibility === 'party' 
            ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER 
            : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
        users
    };
}
```

**Recommendation for Quests**: Create similar function:

```javascript
export function getQuestPinOwnershipForPage(page) {
    const visible = page?.getFlag(MODULE.ID, 'visible');
    const isVisible = visible !== false; // Default to visible
    
    const users = {};
    
    // GMs always see all pins
    game.users.forEach(user => {
        if (user.isGM) {
            users[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        }
    });
    
    return {
        default: isVisible 
            ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER  // Visible to all
            : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,     // GM-only
        users
    };
}
```

Optionally use `blacksmith.pins.resolveOwnership` hook to auto-map without passing ownership on every create/update.

### 3. **GM Proxy for Non-GM Users**

Notes uses `pins.requestGM()` when non-GM users need to create/update/delete pins:

```javascript
try {
    pinData = await pins.create(pinPayload, hasPlacement ? { sceneId } : undefined);
} catch (error) {
    if (!game.user.isGM && isPermissionDeniedError(error) && typeof pins.requestGM === 'function') {
        const gmParams = { payload: pinPayload };
        if (hasPlacement) {
            gmParams.sceneId = sceneId;
        }
        pinData = await pins.requestGM('create', gmParams);
    } else {
        throw error;
    }
}
```

**Recommendation for Quests**: Use same pattern. Wrap all pin operations in try/catch with GM proxy fallback.

### 4. **Pin Configuration & Defaults**

Notes uses `pins.getDefaultPinDesign(moduleId)` to get user's saved defaults:

```javascript
export function getDefaultNotePinDesign() {
    let stored = null;
    try {
        const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
        if (pins?.getDefaultPinDesign) {
            stored = pins.getDefaultPinDesign(MODULE.ID);
        }
    } catch (error) {
        stored = null;
    }
    // ... merge with hardcoded defaults
    return stored;
}
```

And `pins.configure(pinId)` to open the configuration window for a pin.

**Recommendation for Quests**: 
- Store quest-specific defaults (quest vs objective templates) using the same system
- Add "Configure Pin" to context menu
- Use `pins.getDefaultPinDesign()` when creating new pins

### 5. **No Custom Event Handlers**

Notes does **not** register custom event handlers with `pins.on()`. It only:
- Creates/updates/deletes pins
- Uses `pins.place()` / `pins.unplace()`
- Uses `pins.panTo()` for navigation

**Recommendation for Quests**: 
- **Left-click**: Register `pins.on('click', ...)` to open quest tab, scroll to quest, flash entry
- **All other actions**: Use `pins.registerContextMenuItem()` for context menu items:
  - Complete Objective
  - Fail Objective
  - Toggle Hidden
  - Configure Pin (built-in)
  - Delete Pin (built-in)

No more: double-click, shift-click, middle-click, double-right-click patterns.

## Gaps in Blacksmith API

Based on notes implementation and quest requirements:

### 1. **Global Hide-All by Type** ⚠️

**Current**: Notes doesn't have a "hide all note pins" toggle. API only supports ownership-based visibility.

**Quest Requirement**: Current quest system has `hideQuestPins` flag that hides all quest pins for current user.

**Options**:
1. Request API enhancement: Add global "hide all pins by type" feature
2. Remove `hideQuestPins` toggle (breaking change for users)
3. Document as unsupported and remove from quest panel

**Recommendation**: Request API enhancement. Until then, remove toggle and document.

### 2. **Batch Delete by Type** ✅

**Current**: API has `pins.deleteAllByType(type, { moduleId, sceneId })`.

**Quest Requirement**: "Clear all quest pins" feature.

**Recommendation**: Use existing API. Test with `moduleId` filter to ensure it only deletes quest pins, not all pins.

## Migration Strategy

### Phase 1: Preparation
1. ✅ Review notes implementation
2. ✅ Document ownership pattern
3. ✅ Document place/unplace pattern
4. ✅ Identify API gaps
5. Create `getQuestPinOwnershipForPage()` helper
6. Create quest pin templates (quest vs objective defaults)

### Phase 2: UI Changes
1. Remove drag-to-canvas from quest panel
2. Add "Pin to Scene" button (like notes)
3. Add "Unpin from Scene" button
4. Remove `hideQuestPins` toggle (or mark as deprecated)
5. Update quest entry template to show pin status

### Phase 3: API Integration
1. Replace `new QuestPin()` with `pins.create()` (unplaced)
2. Implement `pins.place()` flow for "Pin to Scene"
3. Implement `pins.unplace()` for "Unpin from Scene"
4. Add GM proxy fallback for all operations
5. Use `getQuestPinOwnershipForPage()` for ownership

### Phase 4: Event Handlers
1. Register `pins.on('click', ...)` for left-click (open quest tab)
2. Register context menu items via `pins.registerContextMenuItem()`:
   - Complete Objective
   - Fail Objective
   - Toggle Hidden
   - Delete Pin (if not built-in)

### Phase 5: Cleanup
1. Delete `scripts/quest-pin.js` (~1800 lines)
2. Delete `canvas.squirePins` container code
3. Delete `themes/quest-pins.json`
4. Remove all PIXI imports/code
5. Update documentation

## Conclusion

The notes implementation provides a clear blueprint for quest pin migration:

1. **Unplaced by default** → Use `place()`/`unplace()` pattern
2. **Ownership for visibility** → Map quest visibility to pin ownership
3. **GM proxy for permissions** → Use `requestGM()` for non-GM users
4. **Simple interactions** → Left-click + context menu only
5. **No rendering code** → Let Blacksmith handle everything

**Estimated effort**: 7-10 days (reduced from original 14-21 days due to simpler interaction model and following notes pattern).

**Breaking changes**:
- No drag-to-canvas (replaced with "Pin to Scene" button)
- No `hideQuestPins` toggle (until API enhancement)
- No complex click patterns (double-click, shift-click, etc.)

**Benefits**:
- ~1800 lines of code deleted
- No PIXI dependencies
- Consistent with notes UX
- Leverages Blacksmith for rendering, persistence, events
- Simpler maintenance
