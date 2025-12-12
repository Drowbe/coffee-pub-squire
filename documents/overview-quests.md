# Quest System Architecture Overview

## Introduction

The Quest system is a comprehensive adventure and task management system for FoundryVTT modules. It provides structured quest creation, progress tracking, visual scene integration via pins, and rich metadata management. The system uses FoundryVTT's native Journal system as its data store, similar to the Codex system, but adds specialized features for quest-specific workflows like task completion, status management, and canvas pin placement.

This document outlines the architecture, design patterns, and implementation details to help other module developers understand and potentially reuse similar approaches.

---

## Core Design Philosophy

### 1. **Journal as System of Record**
The quest system uses FoundryVTT's native Journal system as its data store. Each quest is a separate page within a designated journal. This approach provides:
- **Native FoundryVTT integration**: Quests are standard journal pages, accessible through normal journal workflows
- **Built-in permissions**: Leverages FoundryVTT's ownership and visibility system
- **No custom database**: Avoids creating separate data structures that need synchronization
- **User familiarity**: GMs and players already understand how journals work
- **Progress persistence**: Quest state is stored in the journal content itself

### 2. **Structured HTML Content with State Markers**
Quests are stored as HTML with semantic markup and state indicators:
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
- `<s>`, `<del>`, or `<strike>`: Completed tasks
- `<code>`: Failed tasks
- `<em>` or `<i>`: Hidden tasks (GM-only)
- Plain text: Active tasks

This approach:
- **Human-readable**: Quests can be edited directly in journal sheets
- **Parser-friendly**: Easy to extract structured data and state via DOM parsing
- **State-preserving**: Task states are embedded in the HTML structure
- **Flexible**: Can add new fields without schema changes
- **Enrichable**: Works with FoundryVTT's TextEditor enrichment system

### 3. **Separation of Concerns**
The system is divided into distinct components:
- **Parser**: Extracts structured data from HTML and determines task states
- **Form**: Handles quest creation/editing
- **Panel**: Displays and manages quests with filtering and organization
- **Pins**: Visual canvas representation of quests and objectives
- **Storage**: Journal pages (via FoundryVTT API) and scene flags (for pin positions)

### 4. **Scene Pin Integration**
Quests can be visually represented on the canvas using PIXI-based pins:
- **Quest-level pins**: Represent entire quests
- **Objective-level pins**: Represent specific objectives within quests
- **State visualization**: Pin appearance reflects quest/objective status
- **Persistence**: Pin positions stored in scene flags
- **Interactive**: Pins support drag, click, and right-click interactions

---

## Architecture Components

### 1. QuestParser (`scripts/utility-quest-parser.js`)

The parser is responsible for converting HTML journal content into structured JavaScript quest objects.

#### Key Methods

**`parseSinglePage(page, enrichedHtml)`**
- Parses a single journal page into a quest entry object
- Handles async content resolution
- Extracts all quest fields (category, description, plotHook, location, tasks, rewards, participants, tags, status)
- Determines task states from HTML markup (`<s>`, `<code>`, `<em>`)
- Extracts GM hints (`||text||`) and treasure unlocks (`((treasure))`) from task text
- Calculates quest progress based on completed tasks
- Returns a structured quest object or `null` if invalid

**Design Patterns:**
```javascript
// Uses DOMParser for safe HTML parsing
const parser = new DOMParser();
const doc = parser.parseFromString(enrichedHtml, 'text/html');

// State detection from HTML structure
if (li.querySelector('s, del, strike')) {
    state = 'completed';
} else if (li.querySelector('code')) {
    state = 'failed';
} else if (li.querySelector('em, i')) {
    state = 'hidden';
}

// Extract embedded metadata from task text
const gmHintRegex = /\|\|([^|]+)\|\|/g;
const treasureRegex = /\(\(([^)]+)\)\)/g;
```

**Key Features:**
- Case-insensitive label matching
- Handles HTML entities and formatting
- Supports both inline and list-based treasure/participants
- Extracts UUID links for participants and treasure items
- Graceful error handling for malformed entries
- Progress calculation based on task completion ratio

### 2. QuestForm (`scripts/window-quest.js` - FormApplication Class)

A FoundryVTT `FormApplication` that provides a user-friendly interface for creating and editing quests.

#### Key Features

**Quest Field Management**
- Name, category, status, description, plot hook, location
- Task list (one per line, converted to array)
- Reward fields (XP, treasure)
- Participants (comma-separated UUIDs)
- Tags (comma-separated)
- Visibility toggle (GM-only)

**Journal Integration**
- Creates new journal pages on save
- Updates existing pages when editing
- Generates structured HTML content via `_generateJournalContent()`
- Handles journal selection via settings
- Stores quest UUID in page flags for tracking

**Implementation Pattern:**
```javascript
class QuestForm extends FormApplication {
    async _updateObject(event, formData) {
        const quest = expandObject(formData);
        
        // Convert string arrays back to arrays
        if (typeof quest.tasks === 'string') {
            quest.tasks = quest.tasks.split('\n').map(t => ({
                text: t.trim(),
                completed: false,
                state: 'active'
            })).filter(t => t.text);
        }
        
        // Generate UUID if new quest
        if (!quest.uuid) {
            quest.uuid = foundry.utils.randomID();
        }
        
        // Get the journal and create/update page
        const journalId = game.settings.get(MODULE.ID, 'questJournal');
        const journal = game.journal.get(journalId);
        
        // Create or update journal page
        const pageData = {
            name: quest.name,
            type: 'text',
            text: {
                content: this._generateJournalContent(quest)
            }
        };
        
        await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
    }
}
```

### 3. QuestPanel (`scripts/panel-quest.js` - Panel Class)

The main UI component that displays and manages quests.

#### Data Structure

```javascript
{
    categories: Array,           // Quest categories (Main Quest, Side Quest, etc.)
    data: {                      // Quests grouped by category
        "Main Quest": [quest1, quest2, ...],
        "Side Quest": [quest3, quest4, ...],
        ...
    },
    statusGroups: {              // Quests grouped by status
        "In Progress": [...],
        "Not Started": [...],
        "Complete": [...],
        "Failed": [...]
    },
    filters: {
        search: "",
        tags: [],
        category: "all"
    },
    allTags: Set                // All unique tags across quests
}
```

#### Key Methods

**`_refreshData()`**
- Loads all pages from the selected journal
- Enriches HTML content using TextEditor
- Parses each page using `QuestParser.parseSinglePage()`
- Organizes quests by category and status
- Extracts all tags for filtering
- Calculates quest numbers (hash-based from UUID)
- Determines quest visibility and pinned state

**`render(element)`**
- Renders the panel using Handlebars templates
- Groups quests by status (In Progress, Not Started, Complete, Failed)
- Applies filters and search
- Handles collapsed/expanded states for sections and entries
- Manages quest visibility based on user permissions

**`_activateListeners(html)`**
- Sets up all event handlers
- Implements live search filtering
- Handles tag selection and filtering
- Manages quest entry expansion/collapse
- Handles quest actions (edit, delete, visibility, status change, pin/unpin)
- Manages objective completion/failure/hide toggles
- Handles quest export/import functionality
- Manages scene pin creation and clearing

#### Filtering Architecture

The panel implements client-side filtering for performance:

1. **Search Filter**: Text-based search across all quest fields
2. **Tag Filter**: Multi-select tag filtering
3. **Status Filter**: Automatic grouping by quest status
4. **Visibility Filter**: Respects FoundryVTT ownership levels

**Filtering Pattern:**
```javascript
// DOM-based filtering (no re-render needed)
const filterQuests = () => {
    const search = this.filters.search.trim().toLowerCase();
    nativeHtml.querySelectorAll('.quest-entry').forEach(entry => {
        let text = entry.textContent?.toLowerCase() || '';
        let searchMatch = !search || text.includes(search);
        let tagMatch = this.filters.tags.length === 0 || 
            this.filters.tags.some(tag => entry.dataset.tags?.includes(tag));
        entry.style.display = (searchMatch && tagMatch) ? '' : 'none';
    });
};
```

### 4. QuestPin (`scripts/quest-pin.js` - PIXI.Container Class)

A PIXI-based visual representation of quests and objectives on the canvas.

#### Key Features

**Pin Types**
- **Quest pins**: Represent entire quests (circular)
- **Objective pins**: Represent specific objectives (rounded rectangle)

**Visual States**
- **Quest status colors**: Not Started (blue), In Progress (white), Complete (green), Failed (red), Hidden (gray)
- **Objective state colors**: Active (white), Completed (green), Failed (red), Hidden (gray)
- **Category icons**: Main Quest vs Side Quest icons
- **Quest numbers**: Hash-based quest numbers (Q1-Q100)
- **Objective numbers**: Combined format (Q1.01, Q1.02, etc.)

**Interactive Features**
- **Drag & Drop**: GMs can drag pins to reposition them
- **Left-click**: Select pin and jump to quest in tracker
- **Left double-click**: Complete objective (GM only)
- **Right-click**: Toggle visibility (quest pins) or fail objective (objective pins)
- **Double right-click**: Delete pin (GM only)
- **Shift+Left-click**: Toggle hidden state (GM only)
- **Middle-click**: Toggle hidden state (GM only)
- **Tooltips**: Show quest/objective details on hover

**Persistence**
- Pin positions stored in scene flags (`coffee-pub-squire.questPins`)
- Pin state synchronized with quest journal content
- Automatic cleanup of orphaned pins

**Implementation Pattern:**
```javascript
export class QuestPin extends PIXI.Container {
    constructor({ x, y, questUuid, objectiveIndex, ... }) {
        super();
        this.x = x;
        this.y = y;
        this.questUuid = questUuid;
        this.objectiveIndex = objectiveIndex;
        this.pinType = (objectiveIndex === null) ? 'quest' : 'objective';
        
        // Load config and draw pin
        this._configPromise = loadPinConfig().then(config => {
            this.config = config;
            this._updatePinAppearance();
        });
        
        // Set up event handlers
        this.on('pointerdown', this._onPointerDown.bind(this));
        // ... more handlers
    }
    
    _updatePinAppearance() {
        // Draw pin based on type, state, and config
        // Uses PIXI Graphics for shapes and Text for labels
    }
}
```

### 5. Settings Integration (`scripts/settings.js`)

The quest system uses FoundryVTT settings for configuration:

```javascript
game.settings.register(MODULE.ID, 'questJournal', {
    name: "Quest Journal",
    hint: "The journal to use for quest entries...",
    scope: "world",
    config: false,  // Set programmatically, not in settings UI
    type: String,
    choices: () => {
        const choices = { 'none': '- Select Journal -' };
        game.journal.contents.forEach(j => {
            choices[j.id] = j.name;
        });
        return choices;
    },
    default: "none",
    onChange: () => {
        // Refresh panel when journal changes
        if (PanelManager.instance?.questPanel) {
            PanelManager.instance.questPanel.render(...);
        }
    }
});
```

---

## Data Flow

### Quest Creation Flow

```
1. User clicks "Add Quest"
   ↓
2. QuestForm opens with empty/default quest
   ↓
3. User fills form (name, category, tasks, rewards, etc.)
   ↓
4. Form generates HTML content via _generateJournalContent()
   ↓
5. Form creates new JournalEntryPage via createEmbeddedDocuments()
   ↓
6. Form sets quest UUID in page flags
   ↓
7. Form closes and triggers panel refresh
   ↓
8. QuestPanel._refreshData() loads new page
   ↓
9. QuestParser.parseSinglePage() extracts structured data
   ↓
10. Panel renders updated quest
```

### Quest Display Flow

```
1. Panel.render() called
   ↓
2. Panel._refreshData() loads all journal pages
   ↓
3. For each page:
   a. Enrich HTML content (TextEditor.enrichHTML)
   b. Parse with QuestParser.parseSinglePage()
   c. Determine quest status from tasks
   d. Group by status and category
   e. Extract tags
   ↓
4. Render template with organized data
   ↓
5. Apply filters (search, tags)
   ↓
6. Display quests grouped by status
```

### Objective Completion Flow

```
1. GM clicks objective checkbox or double-clicks pin
   ↓
2. Event handler updates journal page HTML
   ↓
3. Wraps task in <s> tags for completion
   ↓
4. Updates quest status if all tasks completed
   ↓
5. Journal update triggers updateJournalEntryPage hook
   ↓
6. QuestPanel._refreshData() reloads quest data
   ↓
7. Panel re-renders with updated progress
   ↓
8. QuestPin updates appearance if present
   ↓
9. Notification sent (if enabled)
```

### Pin Creation Flow

```
1. GM clicks "Pin" button on quest entry
   ↓
2. Event handler creates QuestPin instance
   ↓
3. Pin fetches quest data and draws appearance
   ↓
4. Pin added to canvas.squirePins container
   ↓
5. Pin position saved to scene flags
   ↓
6. Pin persists across scene changes
```

---

## Key Design Patterns

### 1. **Parser-Based Architecture**

Instead of storing structured JSON, the system stores HTML and parses it on-demand. This provides:
- **Flexibility**: Can add new fields without migration
- **Human-editable**: GMs can edit quests directly in journals
- **Version-tolerant**: Parser can handle missing or new fields gracefully
- **State preservation**: Task states embedded in HTML structure

### 2. **State-Based Task Management**

Tasks use HTML markup to represent states:
- **Active**: Plain text
- **Completed**: Wrapped in `<s>`, `<del>`, or `<strike>`
- **Failed**: Wrapped in `<code>`
- **Hidden**: Wrapped in `<em>` or `<i>`

This approach:
- **Visual in journal**: States are immediately visible when editing
- **Parser-friendly**: Easy to detect and extract state
- **Reversible**: Can toggle states by wrapping/unwrapping tags
- **No flags needed**: State is part of the content itself

### 3. **Status-Based Organization**

Quests are automatically grouped by status:
- **In Progress**: Has tasks and at least one completed
- **Not Started**: No tasks completed
- **Complete**: All tasks completed
- **Failed**: Has failed tasks

Status is determined dynamically from task states, not stored separately.

### 4. **Hash-Based Quest Numbering**

Quest numbers are generated from UUIDs using a hash function:
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

This provides:
- **Consistent numbering**: Same UUID always produces same number
- **No database needed**: Number calculated on-demand
- **Unique within range**: Numbers 1-100 distributed across quests

### 5. **Scene Flag Persistence**

Pin positions are stored in scene flags:
```javascript
// Save pin
scene.setFlag(MODULE.ID, 'questPins', [
    {
        pinId: 'unique-id',
        questUuid: '...',
        objectiveIndex: 0,
        x: 100,
        y: 200,
        // ... other pin data
    }
]);

// Load pins
const pinsData = scene.getFlag(MODULE.ID, 'questPins') || [];
```

This approach:
- **Scene-specific**: Pins persist per scene
- **No custom storage**: Uses FoundryVTT's built-in flag system
- **Exportable**: Scene flags included in export/import

### 6. **Event Listener Management**

Uses cloning pattern to prevent duplicate listeners:
```javascript
// Clone element to remove existing listeners
const newButton = button.cloneNode(true);
button.parentNode?.replaceChild(newButton, button);
newButton.addEventListener('click', handler);
```

This is especially important when panels re-render frequently.

### 7. **Notification Integration**

Integrates with Coffee Pub Blacksmith for notifications:
```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
blacksmith.addNotification(
    'Quest completed!',
    'fa-solid fa-trophy',
    5, // duration
    MODULE.ID
);
```

---

## Template Structure

### Panel Template (`templates/panel-quest.hbs`)

The panel template uses Handlebars with a hierarchical structure:

```
Quest Panel
├── Toolbar (add, refresh, settings, import, export, pin controls)
├── Filters
│   ├── Search input
│   └── Tag cloud (collapsible)
└── Content
    └── Status Sections (collapsible)
        ├── In Progress
        ├── Not Started
        ├── Complete
        └── Failed
            └── Quest Entries (collapsible items)
                ├── Header (name, actions, status menu)
                ├── Progress bar
                └── Content (description, tasks, rewards, etc.)
```

**Key Template Features:**
- Conditional rendering based on user role (`{{#if isGM}}`)
- Dynamic status grouping
- Collapsible sections with state persistence
- Rich content rendering (HTML from enriched journal content)
- Participant portraits
- Task state indicators

### Quest Entry Partial (`templates/partials/quest-entry.hbs`)

The quest entry template provides:
- Quest header with name, category icon, quest number
- Action buttons (pin, edit, visibility, status menu, clear pins)
- Progress bar for task completion
- Description with optional image
- Task list with state indicators
- Plot hook (GM-only)
- Treasure list with unlock states
- XP reward
- Location and timeframe
- Participants with portraits
- Tags

### Form Template (`templates/quest-form.hbs`)

The form template provides:
- All quest fields (name, category, status, description, etc.)
- Task textarea (one per line)
- Reward fields (XP, treasure)
- Participants input (comma-separated UUIDs)
- Tags input (comma-separated)
- Visibility checkbox (GM-only)

---

## Integration Points

### 1. **Journal Hooks**

The system listens to journal updates to refresh the panel:
- `updateJournalEntry` hook: Refreshes when journal is updated
- `updateJournalEntryPage` hook: Refreshes when page is updated
- `deleteJournalEntryPage` hook: Removes quest from panel

These hooks are typically managed by a centralized HookManager (Coffee Pub Blacksmith).

### 2. **Scene Hooks**

The system listens to scene changes to load pins:
- `canvasReady` hook: Loads persisted pins when canvas is ready
- `updateScene` hook: Refreshes pins when scene is updated

### 3. **Settings Integration**

- Journal selection via settings
- User preferences (collapsed categories, tag cloud state)
- Pin appearance settings (scale, title visibility, etc.)
- Module configuration

### 4. **External Module Integration**

The system can integrate with other modules:
- **Coffee Pub Blacksmith**: For notifications and hook management
- **Other modules**: Can extend QuestParser or add custom fields

### 5. **Export/Import System**

The system supports JSON import/export:
- **Export**: Converts all quests and scene pins to JSON
- **Import**: Creates journal pages from JSON and restores pin positions
- **Smart merging**: Updates existing quests, creates new ones
- **Progress preservation**: Maintains quest states and completion
- **Scene pin restoration**: Restores pin positions on matching scenes

**Export Format:**
```json
{
  "quests": [...],           // Array of quest objects
  "scenePins": {             // Scene pin data
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

---

## Best Practices

### 1. **Error Handling**

Always wrap parsing and data operations in try-catch:
```javascript
try {
    const quest = await QuestParser.parseSinglePage(page, enriched);
    if (quest) {
        // Process quest
    }
} catch (error) {
    console.error('Error parsing quest entry:', error);
    // Continue processing other quests
}
```

### 2. **Async Content Handling**

Journal page content can be async in FoundryVTT v13+:
```javascript
let content = '';
if (typeof page.text?.content === 'string') {
    content = page.text.content;
} else if (page.text?.content) {
    content = await page.text.content;
}
```

### 3. **Performance Considerations**

- Use client-side filtering (DOM manipulation) instead of re-rendering
- Cache parsed quests when possible
- Batch journal page operations
- Use `Set` for efficient tag lookups
- Debounce rapid state changes (notifications, pin updates)

### 4. **User Experience**

- Provide visual feedback during operations (progress bars, notifications)
- Show loading states during data refresh
- Persist user preferences (collapsed states, filters)
- Support keyboard navigation where possible
- Use tooltips for action buttons

### 5. **Pin Management**

- Always check for existing pins before creating new ones
- Clean up orphaned pins (reference non-existent quests)
- Update pin appearance when quest state changes
- Save pin positions immediately after drag operations
- Handle scene changes gracefully

### 6. **State Synchronization**

- Keep journal content and parsed data in sync
- Update pins when quest state changes
- Refresh panel when journal is updated
- Handle concurrent updates gracefully

---

## Extension Points

### Adding Custom Fields

1. **Update Parser**: Add field extraction in `QuestParser.parseSinglePage()`
2. **Update Form**: Add form field in `quest-form.hbs` and form logic
3. **Update Template**: Add display section in `quest-entry.hbs`
4. **Update Content Generator**: Add field to `_generateJournalContent()`

### Custom Quest Categories

Extend category handling:
```javascript
// In QuestPanel constructor
this.categories = game.settings.get(MODULE.ID, 'questCategories') || [
    "Main Quest",
    "Side Quest",
    "Completed",
    "Failed"
];
```

### Custom Pin Appearance

Modify pin config JSON (`themes/quest-pins.json`):
```json
{
  "quest": {
    "colors": {
      "ring": {
        "customStatus": 0xFF00FF
      }
    }
  }
}
```

### Custom Task States

Add new state markers in parser:
```javascript
// In QuestParser.parseSinglePage()
if (li.querySelector('mark')) {
    state = 'highlighted';
}
```

Then update form to support new state in task editing.

---

## Migration Considerations

### From Custom Database to Journal-Based

If migrating from a custom database system:

1. **Export existing data** to JSON format
2. **Use import functionality** to create journal pages
3. **Verify parser** handles your data structure
4. **Update UI** to use journal-based workflows
5. **Migrate pin data** to scene flags

### Version Compatibility

- Parser should handle missing fields gracefully
- Use feature detection for FoundryVTT version differences
- Provide migration utilities for data structure changes
- Support both legacy and enhanced export formats

### Scene Pin Migration

When migrating pin systems:
1. Export existing pin data
2. Convert to scene flag format
3. Import using `loadPersistedPins()` function
4. Verify pin positions and states

---

## Lessons Learned

### What Works Well

1. **Journal-based storage**: Leverages native FoundryVTT systems, no custom sync needed
2. **HTML parsing**: Flexible, human-editable, version-tolerant
3. **State-based tasks**: HTML markup provides visual state representation
4. **Client-side filtering**: Fast, responsive user experience
5. **Status organization**: Intuitive grouping without rigid schemas
6. **Scene pin integration**: Visual quest representation enhances gameplay
7. **Export/import**: Enables world transfer and backup/restore

### Challenges and Solutions

1. **Async content**: Handle both sync and async journal content
2. **Event listener duplication**: Use cloning pattern to prevent duplicates
3. **Performance with many quests**: Client-side filtering, efficient data structures
4. **Pin state synchronization**: Update pins when quest state changes
5. **Scene flag persistence**: Handle scene changes and cleanup orphaned pins
6. **Export/import complexity**: Support both legacy and enhanced formats
7. **State detection**: Robust parsing of HTML markup for task states

### Future Enhancements

1. **Quest relationships**: Link quests to each other (prerequisites, follow-ups)
2. **Timeline view**: Chronological organization for quest events
3. **Quest templates**: Pre-built quest structures for common scenarios
4. **Automated rewards**: Auto-grant XP and items on quest completion
5. **Quest chains**: Automatic progression through quest sequences
6. **Player notes**: Allow players to add personal notes to quests
7. **Quest sharing**: Share quests between GMs or worlds
8. **Advanced filtering**: Filter by participants, location, timeframe
9. **Quest analytics**: Track completion rates, average time, etc.
10. **Integration APIs**: Hook into other modules for enhanced functionality

---

## Conclusion

The Quest system demonstrates a flexible, journal-based approach to adventure management in FoundryVTT. By leveraging native systems (journals, ownership, TextEditor, scene flags) and using parser-based architecture, it provides a robust foundation that can be extended and adapted for various use cases.

Key takeaways for other module developers:
- **Use native systems** when possible (journals, settings, ownership, scene flags)
- **Parser-based architecture** provides flexibility and version tolerance
- **State-based markup** enables visual state representation in content
- **Client-side filtering** improves performance and UX
- **Scene integration** enhances visual gameplay experience
- **Separation of concerns** makes the system maintainable and extensible
- **Error handling** is critical for user-facing data operations
- **Export/import** enables data portability and backup/restore

For questions or contributions, refer to the main module documentation or GitHub repository.

