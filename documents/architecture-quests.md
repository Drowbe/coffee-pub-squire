# Coffee Pub Squire – Quest System Architecture

## Overview

The Quest system provides structured adventure and task management for FoundryVTT. It features quest creation, progress tracking, visual scene integration via canvas pins, and rich metadata management. The system uses FoundryVTT's native Journal system as its data store and stores pin positions in scene flags.

## Project Files

| File | Class/Purpose |
|------|---------------|
| `scripts/panel-quest.js` | `QuestPanel` – Main panel UI, filtering, organization |
| `scripts/window-quest.js` | `QuestForm` – FormApplication for quest create/edit |
| `scripts/utility-quest-parser.js` | `QuestParser` – Parses HTML journal content to JS objects |
| `scripts/quest-pin.js` | `QuestPin`, `loadPersistedPins`, `loadPersistedPinsOnCanvasReady`, `cleanupQuestPins` |
| `templates/panel-quest.hbs` | Panel template |
| `templates/quest-form.hbs` | Form template |
| `templates/handle-quest.hbs` | Handle content for quest view (tray handle) |
| `templates/partials/quest-entry.hbs` | Quest entry partial |
| `templates/tooltip-pin-quests-objective.hbs` | Objective pin tooltip |
| `templates/tooltip-pin-quests-quest.hbs` | Quest pin tooltip |
| `styles/panel-quest.css` | Panel styles |
| `styles/quest-form.css` | Form styles |
| `styles/quest-markers.css` | Pin marker styles |
| `themes/quest-pins.json` | Pin appearance configuration |

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

### Scene Pin Integration

Pin positions are stored in scene flags (`coffee-pub-squire.questPins`):

```javascript
scene.setFlag(MODULE.ID, 'questPins', [
  {
    pinId: 'unique-id',
    questUuid: '...',
    objectiveIndex: 0,  // null for quest-level pin
    x: 100,
    y: 200
  }
]);
```

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

### QuestPin (`quest-pin.js`)

PIXI-based visual representation of quests and objectives on the canvas.

**Pin Types:**
- **Quest pins** (circular): Represent entire quests
- **Objective pins** (rounded rectangle): Represent specific objectives

**Visual States:**
- Quest status colors: Not Started (blue), In Progress (white), Complete (green), Failed (red), Hidden (gray)
- Objective state colors: Active (white), Completed (green), Failed (red), Hidden (gray)
- Category icons: Main Quest vs Side Quest

**Interactive Features:**
- **Drag**: GMs can reposition pins
- **Left-click**: Select pin, jump to quest in tracker
- **Double-click**: Complete objective (GM only)
- **Right-click**: Toggle visibility (quest) or fail objective (objective)
- **Double right-click**: Delete pin (GM only)
- **Shift+Left-click** / **Middle-click**: Toggle hidden state (GM only)

**Quest Numbering:** Hash-based from UUID (Q1–Q100)
```javascript
function getQuestNumber(questUuid) {
  let hash = 0;
  for (let i = 0; i < questUuid.length; i++) {
    hash = ((hash << 5) - hash) + questUuid.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) % 100 + 1;
}
```

## Data Flow

### Quest Creation
1. User clicks "Add Quest" → `QuestForm` opens
2. User fills form → `_generateJournalContent()` creates HTML
3. Form creates `JournalEntryPage` via `createEmbeddedDocuments()`
4. Form sets quest UUID in page flags
5. Panel refresh → `QuestParser.parseSinglePage()` extracts data
6. Panel renders updated quest

### Objective Completion
1. GM clicks objective checkbox or double-clicks pin
2. Event handler wraps task in `<s>` tags in journal HTML
3. Updates quest status if all tasks completed
4. Journal update triggers `updateJournalEntryPage` hook
5. Panel re-renders with updated progress
6. Pin updates appearance; notification sent (if enabled)

### Pin Creation
1. GM clicks "Pin" button on quest entry
2. `QuestPin` instance created, fetches quest data
3. Pin added to `canvas.squirePins` container
4. Pin position saved to scene flags (`questPins`)
5. Pin persists across scene changes

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
- Scene pins (positions on all scenes)
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
- **Journal:** `updateJournalEntryPage`, `createJournalEntryPage`, `deleteJournalEntryPage` – route to quest panel refresh and/or quest pin updates (`_routeToQuestPanel`, `_routeToQuestPins`).
- **Panel:** After render, `QuestPanel` calls `Hooks.call('renderQuestPanel')`; `quest-pin.js` registers a `renderQuestPanel` listener to apply pin visibility (`hideQuestPins`) and label visibility (`showQuestPinText`).
- **Scene/canvas:** `canvasReady` runs `loadPersistedPinsOnCanvasReady`; `updateScene` refreshes pins; scene change and token create/update/delete hooks manage pin lifecycle and cleanup.

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
- Check for existing pins before creating
- Clean up orphaned pins (reference non-existent quests)
- Update pin appearance when quest state changes
- Save pin positions immediately after drag
