# Coffee Pub Squire – Quest System Architecture

## Overview

The Quest system provides structured adventure and task management for FoundryVTT. It features quest creation, progress tracking, visual scene integration via canvas pins, and rich metadata management. The system uses FoundryVTT's native Journal system as its data store. Pins are rendered and persisted via the **Blacksmith Pins API** (coffee-pub-blacksmith).

## Project Files

| File | Class/Purpose |
|------|---------------|
| `scripts/panel-quest.js` | `QuestPanel` – Main panel UI, filtering, organization, Pin to Scene |
| `scripts/window-quest.js` | `QuestForm` – FormApplication for quest create/edit |
| `scripts/utility-quest-parser.js` | `QuestParser` – Parses HTML journal content to JS objects |
| `scripts/utility-quest-pins.js` | Quest pin utilities – create, update, delete, ownership, colors |
| `scripts/utility-quest-pin-migration.js` | One-time migration of legacy scene-flag pins to Blacksmith |
| `scripts/quest-pin-events.js` | Click handler, context menu registration for quest pins |
| `templates/panel-quest.hbs` | Panel template |
| `templates/quest-form.hbs` | Form template |
| `templates/handle-quest.hbs` | Handle content for quest view (tray handle) |
| `templates/partials/quest-entry.hbs` | Quest entry partial |
| `templates/tooltip-pin-quests-objective.hbs` | Objective pin tooltip |
| `templates/tooltip-pin-quests-quest.hbs` | Quest pin tooltip |
| `styles/panel-quest.css` | Panel styles |
| `styles/quest-form.css` | Form styles |
| `styles/quest-markers.css` | Pin marker styles |
| `themes/quest-pins.json` | Pin appearance configuration (TODO: wire to pins) |

## Core Design

### Journal as System of Record

Each quest is a separate page within a designated journal (`questJournal` setting). This approach provides:
- Native FoundryVTT integration (standard journal pages)
- Built-in permissions (ownership and visibility)
- User familiarity (GMs/players already understand journals)
- Progress persistence (quest state stored in content)

### Structured HTML Content with State Markers

Quests are stored as HTML with semantic markup:

```html
<p><strong>Category:</strong> Main Quest</p>
<p><strong>Status:</strong> In Progress</p>
<p><strong>Tasks:</strong></p>
<ul>
  <li>Objective 1</li>
  <li><s>Completed Objective</s></li>
  <li><code>Failed Objective</code></li>
  <li><em>Hidden Objective</em></li>
</ul>
```

**State Markers:**
- Plain text: Active tasks
- `<s>`, `<del>`, `<strike>`: Completed tasks
- `<code>`: Failed tasks
- `<em>` or `<i>`: Hidden tasks (GM-only)

**Embedded Metadata:**
- `||text||`: GM hints
- `((treasure))`: Treasure unlocks

### Scene Pin Integration (Blacksmith API)

Pins are created and placed via the Blacksmith Pins API. Position persistence is handled by Blacksmith. Legacy pins from scene flags (`coffee-pub-squire.questPins`) are migrated to Blacksmith on scene load; see `utility-quest-pin-migration.js`.

## Components

### QuestParser (`utility-quest-parser.js`)

Converts HTML journal content into structured JavaScript objects.

**Key Method: `parseSinglePage(page, enrichedHtml)`**
- Uses `DOMParser` for safe HTML parsing
- Extracts all quest fields (category, description, plotHook, location, tasks, rewards, participants, tags, status)
- Determines task states from HTML markup
- Extracts GM hints and treasure unlocks from task text
- Calculates quest progress based on completed tasks
- Returns structured quest object or `null` if invalid

### QuestForm (`window-quest.js`)

`FormApplication` for creating and editing quests.

**Key Features:**
- All quest fields (name, category, status, description, plot hook, location, tasks, rewards, participants, tags, visibility)
- Generates structured HTML via `_generateJournalContent()`
- Creates/updates journal pages via `createEmbeddedDocuments()`
- Stores quest UUID in page flags

### QuestPanel (`panel-quest.js`)

Main UI component for displaying and managing quests.

**Data Structure:**
```javascript
{
  categories: ["Pinned", "Main Quest", "Side Quest", "Completed", "Failed"],
  data: { "Main Quest": [...], "Side Quest": [...] },
  statusGroups: { "In Progress": [...], "Not Started": [...], "Complete": [...], "Failed": [...] },
  filters: { search: "", tags: [], category: "all" },
  allTags: Set
}
```

**Key Methods:**
- `_refreshData()` – Loads journal pages, enriches HTML, parses with `QuestParser`
- `render(element)` – Renders panel with Handlebars, groups by status, applies filters
- `_activateListeners(html)` – Sets up event handlers for all interactions

**Filtering:** Client-side DOM filtering for performance (no re-render needed).

### Quest Pins (Blacksmith API)

Visual representation of quests and objectives on the canvas via `pins.create()`, `pins.place()`, `pins.update()`, `pins.delete()`.

**Pin Types:**
- **Quest pins** (`type: 'quest'`, `shape: 'circle'`): Represent entire quests
- **Objective pins** (`type: 'objective'`, `shape: 'square'`): Represent specific objectives

**Data Passed to Blacksmith API**

| Field | Quest Pin | Objective Pin |
|-------|-----------|---------------|
| `moduleId` | `coffee-pub-squire` | `coffee-pub-squire` |
| `type` | `'quest'` | `'objective'` |
| `shape` | `'circle'` | `'square'` |
| `text` | `Q{questIndex}` | `Q{questIndex}.{objectiveIndex+1}` |
| `size` | 32 | 28 |
| `style.fill` | From status/state (see below) | From objective state |
| `config.questUuid` | ✓ | ✓ |
| `config.questIndex` | ✓ | ✓ |
| `config.questCategory` | ✓ | ✓ |
| `config.questStatus` | ✓ | — |
| `config.questState` | ✓ (`visible`/`hidden`) | ✓ |
| `config.objectiveIndex` | — | ✓ |
| `config.objectiveState` | — | ✓ |
| `config.objectiveText` | — | ✓ |
| `ownership` | `calculateQuestPinOwnership(page)` | `calculateQuestPinOwnership(page, objective)` |

**Quest Status → Pin Color:**
| Status | Color (hex) |
|--------|-------------|
| Complete | `#00ff00` (Green) |
| Failed | `#ff0000` (Red) |
| In Progress | `#ffff00` (Yellow) |
| Not Started | `#ffffff` (White) |
| Hidden state | `#000000` (Black) |

**Objective State → Pin Color:**
| State | HTML Marker | Color (hex) |
|-------|-------------|-------------|
| active | Plain text | `#ffff00` (Yellow) |
| completed | `<s>`, `<del>`, `<strike>` | `#00ff00` (Green) |
| failed | `<code>` | `#ff0000` (Red) |
| hidden | `<em>`, `<i>` | `#000000` (Black) |

**Ownership Calculation** (`calculateQuestPinOwnership(page, objective)`):
1. **Layer 1**: Global `hideQuestPins` user flag → All hidden (`default: NONE`)
2. **Layer 2**: GMs always see (`users[gmId]: OWNER`)
3. **Layer 3**: Quest `visible` flag false → Hidden from players, GMs only
4. **Layer 4**: Objective `state === 'hidden'` → Hidden from players, GMs only
5. **Layer 5**: Otherwise → Everyone `OBSERVER`

**Interactive Features:**
- **Left-click**: Open quest tab, expand entry, scroll to quest/objective, flash highlight
- **Right-click**: Context menu – Complete Objective, Fail Objective, Toggle Hidden from Players (quest), Toggle Objective Hidden (objective), Delete Pin
- **Pin to Scene**: GM clicks icon on quest/objective in panel → crosshair mode → click canvas to place
- **Drag**: GMs can reposition (Blacksmith persists position)

**Quest Numbering:** Hash-based from UUID (Q1–Q100), via `getQuestNumber(questUuid)` in `helpers.js`.

## Data Flow

### Quest Creation
1. User clicks "Add Quest" → `QuestForm` opens
2. User fills form → `_generateJournalContent()` creates HTML
3. Form creates `JournalEntryPage` via `createEmbeddedDocuments()`
4. Form sets quest UUID in page flags
5. Panel refresh → `QuestParser.parseSinglePage()` extracts data
6. Panel renders updated quest

### Objective Completion
1. GM clicks objective checkbox in panel **or** right-clicks pin → context menu → Complete/Fail Objective
2. Event handler updates journal HTML (`<s>`, `<code>`, `<em>`, or plain text) via `updateObjectiveStateInJournal`
3. Updates quest status if all tasks completed
4. Journal update triggers `updateJournalEntryPage` hook → `_routeToQuestPins` → `updateQuestPinStylesForPage`
5. Panel re-renders; pin style (color) syncs via `pins.update()`
6. Notification sent (if enabled)

### Pin Creation
1. GM clicks "Pin to Scene" icon on quest or objective in panel
2. Crosshair mode activates; preview element follows mouse
3. GM clicks canvas at desired position
4. `createQuestPin` or `createObjectivePin` calls `pins.create()` then `pins.place()`
5. Blacksmith persists position; pin persists across scene changes

## Export/Import System

The quest system supports full JSON export/import including scene pins.

### Export Format (v1.1)
```json
{
  "quests": [...],
  "scenePins": {
    "sceneId1": {
      "sceneName": "Scene Name",
      "sceneId": "sceneId1",
      "questPins": [...]
    }
  },
  "exportVersion": "1.1",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "metadata": {
    "totalQuests": 15,
    "totalScenesWithPins": 3,
    "totalPins": 25
  }
}
```

### What's Exported
- Quest content (tasks, rewards, participants, etc.)
- Quest progress (completed/failed objectives, status)
- Scene pins (positions on all scenes) – *Note: Export currently reads from legacy scene flags. Pins created after Blacksmith migration are stored by Blacksmith; a future update may source from `pins.list()`.*
- Pin states (objective completion, visibility)

### Import Logic
- **Detects format**: Legacy (quests only) or Enhanced (quests + pins)
- **Updates existing**: Matches quests by name, updates them
- **Creates new**: Adds quests that don't exist
- **Merges pins**: Intelligently combines scene pin data
- **Preserves progress**: Maintains existing quest states

### Use Cases
- **World transfer**: Export from source, import to target
- **Backup/restore**: Save current state, restore later
- **Multi-GM collaboration**: Share world state between GMs
- **Compendium workaround**: Export pins before compendium, import after placing scene

### Troubleshooting
- **Pins not appearing**: Check if scenes exist with matching names; refresh canvas
- **Duplicate pins**: System should prevent; clear all pins and re-import if needed
- **Progress reset**: Should not happen; verify importing to correct world

## Settings

| Setting | Key | Scope | Description |
|---------|-----|-------|-------------|
| Quest Journal | `questJournal` | world | Journal for quest pages |
| Quest Categories | `questCategories` | world | Available categories (default includes Pinned, Main Quest, Side Quest, Completed, Failed) |
| Show Quest Pin Titles | `showQuestPinText` | user | Display quest/objective names below pins; when off, only numbers (Q85, Q85.03) and icons |

**User flag (not in settings UI):** `hideQuestPins` – toggles pin visibility on canvas (e.g. from panel toolbar).

## Hooks Integration

**Blacksmith HookManager (squire.js):**
- **Journal:** `updateJournalEntryPage`, `createJournalEntryPage`, `deleteJournalEntryPage` – route to quest panel refresh and/or quest pin updates (`_routeToQuestPanel`, `_routeToQuestPins`). On visibility or content change, `_routeToQuestPins` calls `updateQuestPinVisibility` and `updateQuestPinStylesForPage`.
- **Panel:** After render, `QuestPanel` calls `Hooks.call('renderQuestPanel')`. Blacksmith handles pin visibility; `showQuestPinText` and `hideQuestPins` apply via `pins.reload({ moduleId })` when settings change.
- **Scene/canvas:** `canvasReady` runs `migrateLegacyQuestPins(scene)` then `registerQuestPinEvents()`. Blacksmith manages pin lifecycle; no PIXI containers.

## Technical Requirements

- FoundryVTT v13+
- D&D 5e system 5.5+
- Required: `coffee-pub-blacksmith`

## Best Practices

### Error Handling
```javascript
try {
  const quest = await QuestParser.parseSinglePage(page, enriched);
  if (quest) { /* process */ }
} catch (error) {
  console.error('Error parsing quest entry:', error);
}
```

### Async Content (v13+)
```javascript
let content = '';
if (typeof page.text?.content === 'string') {
  content = page.text.content;
} else if (page.text?.content) {
  content = await page.text.content;
}
```

### Performance
- Client-side filtering (DOM manipulation) instead of re-rendering
- Cache parsed quests when possible
- Batch journal page operations
- Debounce rapid state changes

### Pin Management
- Check for existing pins before creating (avoid duplicates)
- Clean up orphaned pins (reference non-existent quests)
- Update pin appearance when quest state changes via `updateQuestPinStylesForPage`
- Blacksmith persists pin positions; no manual save needed
