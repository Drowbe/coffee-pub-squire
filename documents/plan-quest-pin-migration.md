# Quest Pin Migration Plan: Removing Custom Pin System, Using Blacksmith API

**System of record:** This document is the single source of truth for the quest pin migration. Supporting reference for Notes implementation detail and code examples: **`documents/quest-pin-migration-findings.md`** (use when implementing; not the plan).

## Authoritative Reference

- **Blacksmith Pins API**: [API: Pins · coffee-pub-blacksmith Wiki](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/API:-Pins)  
  Use this as the source of truth for availability checks, CRUD, events, ownership, and drag-and-drop.

## Overview

This document outlines the migration plan for **removing** Coffee Pub Squire's custom quest pin rendering and management system and **replacing it entirely** with the Blacksmith Pin API. 

### Key Principle

**We are NOT migrating rendering code - we are DELETING it.**

- **DELETE**: ~1800 lines of PIXI rendering code (`QuestPin` class)
- **DELETE**: All container management (`canvas.squirePins`)
- **DELETE**: All visual appearance code
- **DELETE**: All drag-to-canvas creation (replaced with "Pin to Scene" button, same as Notes)
- **REPLACE WITH**: Simple API calls to Blacksmith (`pins.create()`, `pins.update()`, `pins.delete()`, `pins.place()`, `pins.unplace()`)
- **KEEP**: Quest-specific business logic (complete objective, toggle visibility, etc.)

**Underlying quest system is unchanged**: Journal-based quests, QuestParser, QuestForm, QuestPanel, and all quest business logic (complete objective, toggle visibility, etc.) stay as-is. Only **how pins are rendered and stored** changes: we stop using PIXI and scene flags for pins and use the Blacksmith Pin API instead.

**Result**: We will have **zero pin rendering code** in this module. Blacksmith handles:
- All DOM rendering
- All CSS styling  
- All visual appearance
- Container management
- Persistence
- Event dispatching
- Visibility filtering

**We only**: Call the API and handle quest-specific interactions.

## Current System Summary

### Architecture
- **Rendering**: PIXI.Container + PIXI.Graphics (custom rendering)
- **Container**: `canvas.squirePins` (PIXI.Container)
- **Storage**: Scene flags under `MODULE.ID` with key `questPins`
- **Class**: `QuestPin` extends `PIXI.Container` (~1800 lines)
- **Config**: JSON file at `themes/quest-pins.json`

### Key Features
- Quest-level pins (circular) and objective-level pins (square/rounded)
- State-aware appearance (status, visibility, completion)
- Complex visual structure (shadow, rings, icons, labels, titles)
- Multiple interaction types (click, double-click, right-click, drag)
- Visibility filtering (user flags, quest states, GM overrides)
- Tooltip system integration
- Drag-and-drop creation from quest panel
- Automatic state synchronization with journal entries

## Target System Summary

### Architecture
- **Rendering**: **Handled entirely by Blacksmith** (we don't render anything)
- **Container**: **Managed by Blacksmith** (we don't manage containers)
- **Storage**: **Handled by Blacksmith** (scene flags under `coffee-pub-blacksmith` with key `pins`)
- **API**: Blacksmith Pin API (`game.modules.get('coffee-pub-blacksmith')?.api?.pins`)
- **Our Code**: Only API calls and quest-specific business logic

### What We Do
- Call `pins.create()` to create pins (unplaced by default, like Notes)
- Call `pins.place()` / `pins.unplace()` to add/remove pins from the canvas (no drag-to-canvas)
- Call `pins.update()` to update pin state/appearance
- Call `pins.delete()` to remove pins
- Register `pins.on('click', ...)` for left-click only (open quest tab, scroll, flash)
- Register `pins.registerContextMenuItem()` for all other actions (complete, fail, toggle hidden, delete)
- Map quest/objective data to Blacksmith's `PinData` format; follow Notes pattern for ownership
- Handle quest-specific business logic (complete objective, toggle visibility, etc.)

### What Blacksmith Does
- All rendering (DOM-based)
- All styling (CSS)
- All visual appearance
- Container management
- Persistence
- Event dispatching
- Visibility filtering
- Drag handling

## Feature Comparison: From/To

### ✅ Features to Transition

| Current Feature | Target Implementation | Status | Notes |
|----------------|----------------------|--------|-------|
| **Pin Creation** | | | |
| Pin quest to scene | `pins.create()` (unplaced) then `pins.place(pinId, { sceneId, x, y })` via "Pin to Scene" button | ⏳ | Same pattern as Notes; no drag-to-canvas |
| Pin objective to scene | Same as quest; "Pin to Scene" on objective opens scene picker, places pin | ⏳ | Remove drag-to-canvas creation |
| **Pin Appearance** | | | |
| Quest pin (circular) | `shape: 'circle'` | ⏳ | Direct mapping |
| Objective pin (square) | `shape: 'square'` | ⏳ | Direct mapping |
| Font Awesome icons | `image: '<i class="fa-solid fa-..."></i>'` | ⏳ | Direct mapping |
| State-based colors | `style.fill` and `style.stroke` | ⏳ | Map quest/objective states to colors |
| Quest number label | `text` property | ⏳ | Format: "Q85" or "Q85.03" |
| Quest title text | `text` property (if enabled) | ⏳ | Conditional based on setting |
| **Pin Interactions** | | | |
| Left-click (select & jump) | `pins.on('click', ...)` | ⏳ | **Only** left-click: open quest tab, scroll to quest, flash entry (same as today) |
| All other actions | `pins.registerContextMenuItem()` | ⏳ | Right-click context menu: Complete objective, Fail objective, Toggle hidden, Delete pin (no double-click, shift-click, middle-click) |
| Drag to reposition | Blacksmith handles | ⏳ | API manages drag; we do not store position |
| Hover tooltip | Blacksmith or `pins.on('hoverIn', ...)` | ⏳ | Per API; show quest/objective tooltip |
| **Pin State Management** | | | |
| Quest status updates | `pins.update(pinId, { style, ... })` | ⏳ | On journal entry update |
| Objective state updates | `pins.update(pinId, { style, ... })` | ⏳ | On journal entry update |
| Visibility filtering | `ownership` property | ⏳ | Map quest/objective visibility |
| User hide-all flag | Request API enhancement | ⏳ | If API has no "hide all by type", remove toggle; document and request enhancement |
| **Pin Persistence** | | | |
| Save to scene flags | Automatic (Blacksmith) | ⏳ | No manual save needed |
| Load on scene change | Automatic (Blacksmith) | ⏳ | Call `pins.reload()` if needed |
| **Pin Data** | | | |
| Quest UUID | `config.questUuid` | ⏳ | Store in config |
| Objective index | `config.objectiveIndex` | ⏳ | Store in config |
| Quest index | `config.questIndex` | ⏳ | Store in config |
| Quest category | `config.questCategory` | ⏳ | Store in config |
| Quest state | `config.questState` | ⏳ | Store in config |
| Quest status | `config.questStatus` | ⏳ | Store in config |
| Objective state | `config.objectiveState` | ⏳ | Store in config |
| Participants | `config.participants` | ⏳ | Store in config |
| **Pin type (API)** | `type: 'quest' \| 'objective'` | ⏳ | Use for `list({ type })` and `deleteAllByType()` |

### ⚠️ Features to Adapt/Change

| Current Feature | Target Implementation | Status | Notes |
|----------------|----------------------|--------|-------|
| **Visual Appearance** | | | |
| All visual rendering | **Handled by Blacksmith** | ⏳ | We only provide data via API |
| State-based colors | `style.fill` and `style.stroke` in `pins.create()`/`update()` | ⏳ | Map quest/objective states to colors |
| Icons | `image` property with Font Awesome HTML | ⏳ | Map quest category to icon |
| Labels/Text | `text` property | ⏳ | Format: "Q85" or "Q85.03" |
| **Configuration** | | | |
| JSON config file | **REMOVED** - Blacksmith handles styling | ⏳ | Delete `themes/quest-pins.json` |
| Scale factor setting | `size` property in API calls | ⏳ | Apply via `size: { w, h }` |
| Title settings | `text` property (if enabled) | ⏳ | Conditional based on setting |
| **State Synchronization** | | | |
| Journal entry updates | `updateJournalEntryPage` hook | ⏳ | Update pins via API |
| Quest visibility flag | `ownership` property | ⏳ | Map visibility to ownership |
| Objective state parsing | HTML parsing (unchanged) | ⏳ | Update pin via API |
| **Visibility System** | | | |
| User hide flag | Filter before render | ⏳ | Check flag before create/update |
| Quest hidden state | `ownership.default: 0` | ⏳ | NONE = hidden |
| Objective hidden state | `ownership.default: 0` | ⏳ | NONE = hidden |
| GM override (see hidden) | `ownership` per user | ⏳ | Set GM to LIMITED+ |
| Second ring indicator | Not directly supported | ⏳ | May need alternative visual |

### ❌ Features to DELETE (Not Migrate)

| Current Feature | Reason | What Happens |
|----------------|--------|--------------|
| **All PIXI Rendering Code** | Blacksmith handles all rendering | **DELETE** `QuestPin` class entirely |
| `canvas.squirePins` container | Blacksmith manages containers | **DELETE** all container creation/management code |
| Custom `QuestPin` class (~1800 lines) | Use Blacksmith API instead | **DELETE** `scripts/quest-pin.js` |
| All graphics rendering code | Blacksmith handles visuals | **DELETE** all `_updatePinAppearance()` and rendering methods |
| Manual container management | Blacksmith handles it | **DELETE** container hooks and management |
| Manual persistence | Blacksmith handles it | **DELETE** `_saveToPersistence()` and `_removeFromPersistence()` |
| PIXI event system | Blacksmith event system | **DELETE** PIXI event handlers, use `pins.on()` |
| Custom hit area calculation | Blacksmith handles it | **DELETE** hit area code |
| Global drag event listeners | Blacksmith handles it | **DELETE** drag handlers, use `pins.on('dragEnd')` |
| Manual cleanup on scene change | Blacksmith handles it | **DELETE** cleanup code |
| Config loading system | Blacksmith handles styling | **DELETE** `loadPinConfig()` and `themes/quest-pins.json` |
| `loadPersistedPins()` function | Blacksmith handles loading | **DELETE** pin loading code |

### ➕ New Features Available

| New Feature | Description | Use Case |
|------------|-------------|----------|
| **Pin Animation** | `pins.ping(pinId, options)` | Highlight pins, navigation feedback |
| **Pan to Pin** | `pins.panTo(pinId, options)` | Navigate to pin from quest panel |
| **Context Menu** | `pins.registerContextMenuItem()` | Add custom menu items |
| **Broadcast Animations** | `ping()` with `broadcast: true` | Show animations to all users |
| **Ownership System** | `ownership` property | Fine-grained permissions |
| **Icon-only Pins** | `shape: 'none'` | Minimal visual footprint |
| **Sound Support** | `ping()` with `sound` option | Audio feedback for interactions |

## Gaps: Current System vs Blacksmith API

These are the main gaps between our current quest pin behavior and the API; the plan addresses each.

| Gap | API behavior | Our approach |
|-----|--------------|-------------|
| **Lookup by quest** | `pins.list(options)` only supports `sceneId`, `moduleId`, `type`, `unplacedOnly`. No filter by `config.questUuid`. | Call `pins.list({ moduleId: 'coffee-pub-squire', sceneId })` then filter in code by `pin.config?.questUuid` (and `pin.config?.objectiveIndex` for objectives). |
| **Second ring (hidden quest)** | API has no “second ring” or extra border for “hidden but GM-visible”. | Accept single-pin appearance or use an alternative (e.g. distinct `style.stroke` or `shape` for hidden). Document as trade-off. |
| **Double right-click** | API has no built-in double right-click. | Implement in our `pins.on('rightClick', ...)` handler with a short timeout (e.g. 300 ms) like current code; second right-click within window = delete pin. |
| **User hide-all flag** | API filters by `ownership` only, not by a separate “hide all quest pins” flag. | Before creating/updating pins, check `game.user.getFlag(MODULE.ID, 'hideQuestPins')`. If set, either skip creating or set ownership so pin is not visible; in UI, keep toggle that shows/hides pins (e.g. filter which pins we create, or use a dedicated layer/visibility approach per API capabilities). |
| **Placed vs unplaced** | API treats unplaced pins as the default; we only need pins on the canvas. | We always create **placed** pins: pass `sceneId` and `x`,`y` (e.g. via `pins.create(pinData, { sceneId })` or `pins.place()` after create). No need for unplace/place flow unless we add “remove from canvas but keep in journal” later. |
| **Drag position save** | Blacksmith persists position on drag. | We do not store pin positions in our own flags. Use `pins.get(pinId)` / `pins.list()` when we need pin data; no extra persistence step. |
| **Event payload** | `evt.pin` has top-level `moduleId`, not inside `config`. | In handlers, use `evt.pin.moduleId === 'coffee-pub-squire'` and `evt.pin.config` for quest/objective fields. |

**Optional:** Use Blacksmith’s **ownership resolver hook** (`blacksmith.pins.resolveOwnership`) to map quest/objective visibility to pin `ownership` so we don’t have to pass ownership on every `pins.create()` / `pins.update()`.

### Notes Pattern Reference

We follow the **Notes tab** implementation for pin lifecycle and ownership. The Notes tab already uses the Blacksmith Pins API with: unplaced pins by default; `pins.place()` / `pins.unplace()` for canvas; `getNotePinOwnershipForPage(page)` for ownership; GM proxy (`pins.requestGM()`) for non-GM users. For quests we add **left-click only** (open tab, scroll, flash) and put all other actions in **context menu** via `pins.registerContextMenuItem()`. For code-level detail and examples, see **`documents/quest-pin-migration-findings.md`** (supporting reference; use when implementing).

## Migration Phases

### Phase 1: Preparation & Analysis ✅
**Status**: In Progress  
**Goal**: Understand current system and plan migration

- [x] Review Blacksmith Pin API documentation
- [x] Analyze current quest pin implementation
- [x] Document current features and requirements
- [x] Create feature comparison matrix
- [x] Identify migration challenges
- [ ] Create test plan for migration
- [ ] Set up migration branch

### Phase 2: Data Migration & API Integration
**Status**: Not Started  
**Goal**: Migrate pin data format and integrate Blacksmith API

- [ ] Create data migration function (one-time per scene)
  - [ ] Run when canvas is ready and `pins.whenReady()` resolves
  - [ ] Read `scene.getFlag(MODULE.ID, 'questPins')` (legacy array)
  - [ ] For each entry: build `PinData` (id, x, y, moduleId, type, shape, image, text, size, style, ownership, config), then `pins.create(pinData, { sceneId: scene.id })`
  - [ ] Preserve all quest/objective metadata in `config`; use existing `pinId` as pin `id` if valid
  - [ ] Handle orphaned pins: skip or delete entries whose quest UUID no longer resolves
  - [ ] After successful migration: clear `scene.setFlag(MODULE.ID, 'questPins', [])` (or remove flag)
  - [ ] Call `pins.reload()` for current scene
- [ ] Implement API availability checks
  - [ ] Add `pins.isAvailable()` before any API use; add `await pins.whenReady()` when creating pins at init/ready
  - [ ] Graceful degradation: if Blacksmith unavailable, quest pins are disabled (no rendering, no errors)
- [ ] Update pin creation logic (drop handler and any other creation paths)
  - [ ] In `dropCanvasData` handler: replace `new QuestPin(...)` + `canvas.squirePins.addChild(pin)` + `pin._saveToPersistence()` with `await pins.create(pinData, { sceneId: canvas.scene.id })`; use drop event coordinates for `x`, `y`
  - [ ] Map quest/objective data to `PinData`: `id` (e.g. existing pinId or `crypto.randomUUID()`), `x`, `y`, `moduleId: 'coffee-pub-squire'`, `type: 'quest' | 'objective'`, `shape`, `image`, `text`, `size`, `style`, `ownership`, `config` (questUuid, objectiveIndex, questIndex, etc.)
  - [ ] Store all quest/objective metadata in `config`; do not store position in our flags (Blacksmith persists it)
- [ ] Update pin update logic
  - [ ] Replace `pin.updateObjectiveState()` with `pins.update()`
  - [ ] Replace `pin.updateQuestStatus()` with `pins.update()`
  - [ ] Update style/colors based on state changes
- [ ] Update pin deletion logic
  - [ ] Replace `pin._removeFromPersistence()` with `pins.delete()`
  - [ ] Handle cleanup on quest/objective deletion

### Phase 3: Visual Appearance - REMOVED
**Status**: Not Needed  
**Goal**: ~~Recreate pin visual appearance~~ - **Blacksmith handles all rendering**

**No work needed** - Blacksmith handles:
- All DOM rendering
- All CSS styling
- All visual appearance
- All visual effects

**We only provide:**
- Data via `pins.create()` and `pins.update()` API calls
- State-based colors via `style.fill` and `style.stroke` properties
- Icons via `image` property (Font Awesome HTML)
- Text via `text` property

### Phase 4: Interaction System Migration
**Status**: Not Started  
**Goal**: Replace PIXI event handlers with Blacksmith event handlers

- [ ] Delete PIXI event handlers
  - [ ] Remove `_onPointerDown()`, `_onPointerOver()`, `_onPointerOut()`
  - [ ] Remove `_onDragStart()`, `_onDragMove()`, `_onDragEnd()`
  - [ ] Remove all PIXI event listener code
- [ ] Implement Blacksmith event handlers
  - [ ] Register `pins.on('click', ...)` for select & jump to quest
  - [ ] Register `pins.on('doubleClick', ...)` for complete objective
  - [ ] Register `pins.on('rightClick', ...)` for toggle/fail/delete
  - [ ] Register `pins.on('middleClick', ...)` for toggle hidden
  - [ ] Register `pins.on('dragEnd', ...)` for position updates (Blacksmith handles drag)
  - [ ] Register `pins.on('hoverIn', ...)` for tooltip
  - [ ] Register `pins.on('hoverOut', ...)` for tooltip hide
- [ ] Implement quest-specific logic
  - [ ] Select & jump to quest (existing logic)
  - [ ] Complete objective (existing logic)
  - [ ] Toggle visibility (existing logic)
  - [ ] Fail objective (existing logic)
  - [ ] Delete pin (use `pins.delete()`)
- [ ] Filter events by module
  - [ ] Use `evt.pin.moduleId === 'coffee-pub-squire'` (moduleId is on the pin, not in config)
  - [ ] Use `evt.pin.config` for quest/objective data (questUuid, objectiveIndex, etc.)
- [ ] Implement context menu (optional)
  - [ ] Register custom menu items via `pins.registerContextMenuItem()`
  - [ ] Add "Complete Objective", "Fail Objective", "Toggle Hidden", "Delete Pin"

### Phase 5: State Synchronization Migration
**Status**: Not Started  
**Goal**: Migrate journal entry update handlers

- [ ] Update `updateJournalEntryPage` hook
  - [ ] Find pins via `pins.list({ moduleId: 'coffee-pub-squire', sceneId })` then filter by `pin.config?.questUuid` (and `objectiveIndex` for objectives)
  - [ ] Update quest status pins via `pins.update(pinId, { style, text, ... })`
  - [ ] Update objective state pins via `pins.update()`
  - [ ] Update visibility via `ownership` property
- [ ] Update quest visibility flag handler
  - [ ] Update `ownership` property based on visibility flag
  - [ ] Use `ownership.default: 0` for hidden, `2` for visible
  - [ ] Set GM-specific ownership if needed
- [ ] Update objective state parser
  - [ ] Keep existing HTML parsing logic
  - [ ] Update pins via `pins.update()` with new state
  - [ ] Update style colors based on state

### Phase 6: Visibility System Migration
**Status**: Not Started  
**Goal**: Migrate visibility filtering to Blacksmith ownership system

- [ ] Map visibility to ownership
  - [ ] Hidden quest/objective → `ownership.default: 0` (NONE)
  - [ ] Visible quest/objective → `ownership.default: 2` (OBSERVER)
  - [ ] GM override → `ownership.users[gmId]: 2` (OBSERVER)
- [ ] Implement user hide flag filtering
  - [ ] Check `hideQuestPins` flag before creating/updating pins
  - [ ] Filter pins in event handlers if flag is set
  - [ ] Update toggle button in quest panel
- [ ] Remove custom visibility methods
  - [ ] Remove `shouldBeVisible()` method
  - [ ] Remove `updateVisibility()` method
  - [ ] Rely on Blacksmith's automatic filtering

### Phase 7: Cleanup & Removal
**Status**: Not Started  
**Goal**: Delete all pin rendering/management code and mark legacy code for deletion

**Legacy code marked for deletion:**

| Location | What to remove |
|---------|----------------|
| **`scripts/quest-pin.js`** | **DELETE FILE** – `QuestPin` class, `loadPinConfig()`, `PIN_CONFIG_CACHE`, `loadPersistedPins()`, `loadPersistedPinsOnCanvasReady()`, `cleanupQuestPins()`, `cleanupOrphanedPins()`, `getQuestNumber()` (move to helper if still needed). |
| **`scripts/squire.js`** | Remove import of `QuestPin`, `loadPersistedPins`, `loadPersistedPinsOnCanvasReady`. Remove all `canvas.squirePins` creation/positioning (PIXI.Container). In `dropCanvasData`: replace QuestPin instantiation with `pins.create()`. In `_routeToQuestPins`: replace `canvas.squirePins.children.filter(...)` with `pins.list({ moduleId, sceneId })` + filter by `config.questUuid`; replace pin method calls with `pins.update()`. Replace `loadPersistedPins()` / `loadPersistedPinsOnCanvasReady()` with migration + `pins.reload()` where appropriate. Remove `canvasSceneChange` / `updateScene` logic that calls `loadPersistedPins`. |
| **`scripts/panel-quest.js`** | Remove import of `QuestPin`, `loadPersistedPins`. Replace `canvas.squirePins` usage: `_clearAllQuestPins`, `_clearQuestPins`, toggle visibility, `showQuestPinText` callback – use `pins.list()`, `pins.delete()`, `pins.deleteAllByType()` or update pin visibility via `pins.update()`. |
| **`scripts/panel-notes.js`** | Replace `canvas.squirePins?.toLocal(...)` with Blacksmith canvas API or equivalent if still needed for note pin placement. |
| **`scripts/helpers.js`** | Remove import of `QuestPin`; replace “objective near pin” check with `pins.list()` + filter by `config`. |
| **`scripts/manager-handle.js`** | Replace `canvas.squirePins.children.filter(QuestPin)` with `pins.list()` + filter; use `pins.panTo(pinId)` or equivalent for “pan to pin”. |
| **`scripts/manager-panel.js`** | Remove import of `QuestPin` if only used for type checks. |
| **`scripts/settings.js`** | Replace `canvas.squirePins.children.forEach(...)` (showQuestPinText, etc.) with `pins.list()` + per-pin update or document that Blacksmith handles styling. |
| **`themes/quest-pins.json`** | **DELETE FILE** – pin appearance comes from API (shape, style, image, text). |

- [ ] Delete `QuestPin` class and `scripts/quest-pin.js`
- [ ] Remove all imports/usages of `QuestPin`, `loadPersistedPins`, `loadPersistedPinsOnCanvasReady` from squire.js, panel-quest.js, helpers.js, manager-handle.js, manager-panel.js, settings.js
- [ ] Delete `canvas.squirePins` container creation and all references
- [ ] Delete `themes/quest-pins.json` and any `loadPinConfig()` usage
- [ ] Update documentation (`architecture-quests.md`, any overview docs) to describe Blacksmith pin API usage only

### Phase 8: Testing & Validation
**Status**: Not Started  
**Goal**: Ensure all functionality works correctly

- [ ] Test pin creation
  - [ ] Drag quest to canvas
  - [ ] Drag objective to canvas
  - [ ] Verify pin appears correctly
  - [ ] Verify pin persists across scene changes
- [ ] Test pin interactions
  - [ ] Click to select & jump
  - [ ] Double-click to complete
  - [ ] Right-click actions
  - [ ] Middle-click toggle
  - [ ] Shift+click toggle
  - [ ] Drag to reposition
  - [ ] Hover tooltip
- [ ] Test state synchronization
  - [ ] Update quest status → pin updates
  - [ ] Update objective state → pin updates
  - [ ] Toggle quest visibility → pin updates
  - [ ] Toggle objective visibility → pin updates
- [ ] Test visibility system
  - [ ] Hidden quests not visible to players
  - [ ] Hidden objectives not visible to players
  - [ ] GM can see hidden pins
  - [ ] User hide flag works
- [ ] Test edge cases
  - [ ] Orphaned pins (missing quests)
  - [ ] Multiple pins for same quest
  - [ ] Rapid state changes
  - [ ] Scene switching with many pins
  - [ ] Blacksmith not available (graceful degradation)

### Phase 9: Polish & Optimization
**Status**: Not Started  
**Goal**: Improve user experience and performance

- [ ] Add pin animations
  - [ ] Use `pins.ping()` for navigation feedback
  - [ ] Use `pins.panTo()` for quest panel navigation
  - [ ] Add sound effects (optional)
- [ ] Optimize performance
  - [ ] Batch pin updates when possible
  - [ ] Debounce rapid state changes
  - [ ] Cache quest data lookups
- [ ] Improve error handling
  - [ ] Handle missing Blacksmith API gracefully
  - [ ] Handle invalid pin data
  - [ ] Handle missing quests/objectives
- [ ] Add user feedback
  - [ ] Notifications for pin creation/deletion
  - [ ] Visual feedback for state changes
  - [ ] Loading states during migration

## Implementation Details

### API Methods We Use (per [API: Pins](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/API:-Pins))

| Method | Use |
|--------|-----|
| `pins.isAvailable()` | Guard before any API use. |
| `pins.whenReady()` | Wait for canvas + scene before creating/reloading pins. |
| `pins.create(pinData, options?)` | Create placed quest/objective pins (with `sceneId`). |
| `pins.update(pinId, patch, options?)` | Update style, text, ownership, config after journal/state changes. |
| `pins.delete(pinId, options?)` | Remove pin (e.g. double right-click, clear pins). |
| `pins.get(pinId)` | Resolve pin by ID when we have it (e.g. from config). |
| `pins.exists(pinId)` | Check before create or delete. |
| `pins.list({ moduleId, sceneId, type? })` | Find pins for a scene; filter in code by `config.questUuid` / `objectiveIndex`. |
| `pins.on(eventType, handler, { moduleId, signal })` | Click, doubleClick, rightClick, middleClick, hoverIn, hoverOut, dragEnd (with `dragEvents: true`). |
| `pins.reload(options?)` | Re-render pins after migration or scene load. |
| `pins.panTo(pinId, options?)` | Pan to pin from quest panel / handle. |
| `pins.ping(pinId, options?)` | Optional: highlight pin (e.g. after pan). |
| `pins.registerContextMenuItem(itemId, itemData)` | Optional: "Complete objective", "Fail objective", "Delete pin". |
| `pins.findScene(pinId)` | Optional: resolve scene when we only have pinId. |
| `pins.refreshPin(pinId)` | Optional: force re-render after update. |

We do **not** use unplaced pins for quests: all quest pins are placed on a scene when created.

### What We Provide to Blacksmith API

We call `pins.create()` with quest/objective data. Blacksmith handles all rendering.

**Current Format** (our scene flags - to be migrated):
```javascript
scene.setFlag(MODULE.ID, 'questPins', [
  {
    pinId: string,
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
  }
]);
```

**What We Pass to Blacksmith API** (via `pins.create()`):
```javascript
await pins.create({
  id: string,                    // From pinId (or generate new UUID)
  x: number,                     // Direct mapping
  y: number,                     // Direct mapping
  moduleId: 'coffee-pub-squire', // Fixed - identifies our pins
  shape: 'circle' | 'square',    // 'circle' for quest, 'square' for objective
  image: string,                 // Font Awesome HTML: '<i class="fa-solid fa-map-pin"></i>'
  text: string,                  // "Q85" for quest, "Q85.03" for objective
  size: { w: number, h: number }, // Optional: pin size
  style: {                       // State-based colors (Blacksmith applies these)
    fill: string,                // Hex color for background
    stroke: string,              // Hex color for border
    strokeWidth: number,
    alpha: number
  },
  ownership: {                   // Visibility/permissions (Blacksmith enforces)
    default: number,             // 0 = hidden, 2 = visible
    users?: Record<string, number>
  },
  config: {                      // Quest metadata (stored but not rendered)
    questUuid: string,
    objectiveIndex: number|null,
    questIndex: string,
    questCategory: string,
    questState: string,
    questStatus: string,
    objectiveState: string,
    participants: array,
    pinType: string
  }
});
```

**Note**: Blacksmith handles all rendering, styling, and visual appearance based on the data we provide.

### State to Color Mapping

**Quest Status Colors**:
- `Not Started` → Blue (`#3779FF`)
- `In Progress` → White (`#FFFFFF`)
- `Complete` → Green (`#3C9245`)
- `Failed` → Red (`#D41A1A`)
- `hidden` → Black (`#000000`)

**Objective State Colors**:
- `active` → White (`#FFFFFF`)
- `completed` → Green (`#3C9245`)
- `failed` → Red (`#D41A1A`)
- `hidden` → Gray (`#AAA79A`)

### Icon Mapping

**Quest Icons**:
- Main Quest → `\uf024` → `<i class="fa-solid fa-map-pin"></i>`
- Side Quest → `\uf277` → `<i class="fa-solid fa-flag"></i>`

**Objective Icons**:
- Use same as quest category (Main/Side)

### Event Handler Structure

```javascript
// Get API
const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
if (!pins?.isAvailable()) return;

// Wait for ready
await pins.whenReady();

// Register handlers
const controller = new AbortController();

pins.on('click', async (evt) => {
  if (evt.pin.moduleId !== 'coffee-pub-squire') return;
  
  const { questUuid, objectiveIndex } = evt.pin.config || {};
  
  if (evt.modifiers.shift && game.user.isGM) {
    // Toggle hidden state
    await toggleHiddenState(questUuid, objectiveIndex);
  } else {
    // Select & jump to quest
    await selectAndJumpToQuest(questUuid, objectiveIndex);
  }
}, { 
  moduleId: 'coffee-pub-squire',
  signal: controller.signal 
});

// Cleanup on module unload
Hooks.on('unloadModule', (id) => {
  if (id === MODULE.ID) {
    controller.abort();
  }
});
```

## Migration Challenges

### 1. Data Migration
**Challenge**: Converting existing `questPins` scene flags to Blacksmith format  
**Solution**: Create migration function that reads old format and calls `pins.create()` for each pin

### 2. State-Based Colors
**Challenge**: Need to map quest/objective states to colors dynamically  
**Solution**: Update `style.fill` and `style.stroke` via `pins.update()` when state changes

### 3. Double Right-Click Detection
**Challenge**: Blacksmith doesn't have built-in double right-click  
**Solution**: Implement timeout-based detection in right-click handler (similar to current code)

### 4. Visibility System
**Challenge**: Current system has multiple visibility layers  
**Solution**: Map to Blacksmith's `ownership` system, may need filtering for user hide flag

### 5. Event Handler Cleanup
**Challenge**: Need to properly clean up event handlers on module unload  
**Solution**: Use `AbortController` with `signal` option in `pins.on()` calls

### 6. Tooltip Integration
**Challenge**: Current tooltip system is custom  
**Solution**: Use existing tooltip functions in `pins.on('hoverIn')` handler

### 7. Pin Lookup
**Challenge**: Need to find pins by quest UUID or objective index  
**Solution**: Use `pins.list({ moduleId, config: { questUuid } })` to find pins

### 8. Visual Appearance Differences
**Challenge**: Blacksmith pins may look different than current PIXI pins  
**Solution**: Accept Blacksmith's default appearance, or configure via API properties (shape, style, image, text)

### 9. Export/Import (Quest JSON)
**Challenge**: Current export includes `scenePins[sceneId].questPins`; after migration, pin data lives in Blacksmith scene flags, not Squire flags.  
**Solution**: Decide and document: (a) export pin payloads (id, x, y, config) and on import re-call `pins.create()` per pin for each scene, or (b) do not export pins and document that GMs re-place pins after import. Prefer (a) for seamless world transfer.

## Testing Checklist

### Basic Functionality
- [ ] Create quest pin via drag-and-drop
- [ ] Create objective pin via drag-and-drop
- [ ] Pin appears with correct shape and icon
- [ ] Pin shows quest/objective number
- [ ] Pin shows title (if enabled)
- [ ] Pin persists across scene changes
- [ ] Pin loads when scene is activated

### Interactions
- [ ] Left-click selects quest and jumps to tracker
- [ ] Left double-click completes objective
- [ ] Right-click toggles visibility (quest) or fails objective
- [ ] Double right-click deletes pin
- [ ] Middle-click toggles hidden state
- [ ] Shift+Left-click toggles hidden state
- [ ] Drag pin to reposition
- [ ] Hover shows tooltip
- [ ] Hover out hides tooltip

### State Synchronization
- [ ] Quest status change updates pin appearance
- [ ] Objective state change updates pin appearance
- [ ] Quest visibility toggle updates pin visibility
- [ ] Objective visibility toggle updates pin visibility
- [ ] Journal entry update triggers pin update

### Visibility System
- [ ] Hidden quests not visible to players
- [ ] Hidden objectives not visible to players
- [ ] GMs can see hidden pins
- [ ] User hide flag hides all pins
- [ ] Toggle hide flag shows/hides pins

### Edge Cases
- [ ] Orphaned pins (missing quests) are cleaned up
- [ ] Multiple pins for same quest work correctly
- [ ] Rapid state changes don't cause issues
- [ ] Scene switching with many pins is performant
- [ ] Blacksmith not available (graceful degradation)
- [ ] Invalid pin data is handled gracefully

## Success Criteria

- [ ] All quest pin functionality works via Blacksmith API
- [ ] **Zero pin rendering code** remains in this module
- [ ] All interactions work correctly via Blacksmith event system
- [ ] State synchronization works via `pins.update()` calls
- [ ] Visibility system works via `ownership` property
- [ ] Performance is equal or better (Blacksmith handles optimization)
- [ ] Code is **significantly simpler** (removed ~1800 lines of rendering code)
- [ ] No breaking changes for users (data migration is seamless)
- [ ] Graceful degradation if Blacksmith is not available

## Timeline Estimate

- **Phase 1**: 0.5 day (Preparation) - Mostly done
- **Phase 2**: 2-3 days (Data Migration & API Integration)
- **Phase 3**: ~~3-4 days~~ **REMOVED** - Blacksmith handles all rendering
- **Phase 4**: 2-3 days (Interactions - replacing event handlers)
- **Phase 5**: 1 day (State Synchronization)
- **Phase 6**: 1 day (Visibility System)
- **Phase 7**: 1 day (Cleanup - deleting code)
- **Phase 8**: 1-2 days (Testing)
- **Phase 9**: 0.5 day (Polish)

**Total Estimate**: 7-10 days (reduced from 14-21 days)

## What We're Actually Doing

### DELETE (Remove Entirely)
- `QuestPin` class (~1800 lines in `scripts/quest-pin.js`)
- `canvas.squirePins` container creation and management
- All PIXI rendering code (`_updatePinAppearance()`, graphics drawing, etc.)
- All PIXI event handlers (`_onPointerDown()`, `_onDragStart()`, etc.)
- Config loading system (`loadPinConfig()`, `themes/quest-pins.json`)
- Persistence code (`_saveToPersistence()`, `_removeFromPersistence()`, `loadPersistedPins()`)
- All container management hooks

### REPLACE WITH (API Calls)
- `pins.create()` - Create pins via API
- `pins.update()` - Update pin state/appearance via API
- `pins.delete()` - Remove pins via API
- `pins.on()` - Register event handlers for interactions
- `pins.list()` - Query pins by quest UUID or other criteria
- `pins.reload()` - Reload pins if needed

### KEEP (Quest-Specific Logic)
- Quest-specific business logic (complete objective, toggle visibility, etc.)
- Tooltip system (use in `pins.on('hoverIn')` handler)
- Journal entry parsing (use for state updates)
- Quest panel integration (drag-and-drop creation)

## Notes

- **We are NOT migrating rendering code** - we are **deleting it**
- Blacksmith handles ALL visual appearance, rendering, and styling
- We only provide data via API calls and handle quest-specific business logic
- Migration should be done incrementally, testing each phase
- Create migration branch and test thoroughly before merging
- Data migration should be automatic and seamless
- Graceful degradation if Blacksmith is not available (pins simply won't work)

## Questions to Resolve

1. **Second Ring for Hidden Quests**: How to handle? CSS overlay, alternative visual, or remove?
2. **Title Positioning**: Can we use CSS to position titles below pins with offset?
3. **User Hide Flag**: Should we filter pins before creation or in event handlers?
4. **Performance**: Will DOM rendering be performant with 100+ pins?
5. **Migration Timing**: When should we migrate? After Blacksmith API is stable?
6. **Backward Compatibility**: Should we support both systems during transition?
