# Notes System Architecture

This document describes the architecture for the new Notes system in Coffee Pub Squire. This system will replace the current simple journal viewer with a player-facing codex + spatial annotation system that supports fast capture, mixed ownership, image-first content, and spatial pinning.

## Overview

The Notes system is a **player-authored memory system** that allows:
- **Fast capture**: Quick note creation with minimal friction
- **Mixed ownership**: Private notes (creator-only) and party notes (shared with all players)
- **Image-first content**: Support for image paste/drag with markdown text
- **Spatial pinning**: Optional canvas placement like sticky notes
- **Retrieval-first design**: Tag-based filtering, search, and scene grouping

This is **not** a replacement for Journals (GM-authored lore) or Codex (structured world-building). It's specifically for what players *notice* and want to remember.

## Core Design Philosophy

### 1. **Journal as System of Record (Option A)**
Each note is a JournalEntry page with:
- `flags[MODULE.ID].noteType = 'sticky'`
- Flags for: tags, visibility (private/party), sceneId, authorId, timestamp
- **Pros**: Native permissions, ownership, export, compendium support
- **Cons**: Journals are heavier than ideal for quick notes

**Decision**: Start with Option A (Journal-backed) for v1, evaluate Option B (Custom Document) for v2 if performance becomes an issue.

### 2. **Structured HTML Content**
Notes use markdown/HTML with semantic structure:
```html
<p><strong>Tags:</strong> npc, phlan, informant</p>
<p><strong>Scene:</strong> Phlan Market</p>
<p><strong>Location:</strong> x: 1200, y: 800</p>
<p><strong>Created:</strong> 2024-01-15 by PlayerName</p>
<p><strong>Visibility:</strong> party</p>

[Image if present]

Note content in markdown...
```

This approach:
- **Human-readable**: Can be edited directly in journal sheets
- **Parser-friendly**: Easy to extract metadata via DOM parsing
- **Flexible**: Can add new fields without schema changes
- **Enrichable**: Works with FoundryVTT's TextEditor enrichment

### 3. **Separation of Concerns**
- **Parser**: Extracts structured data from HTML (reuse CodexParser patterns)
- **Form**: Lightweight Application V2 panel for quick capture
- **Panel**: Displays notes as cards with filtering/search
- **Canvas Pins**: Optional spatial markers (via Blacksmith Pin API)
- **Storage**: Journal pages (via FoundryVTT API)

## Architecture Components

### 1. NotesParser (`scripts/utility-notes-parser.js`)

Extracts structured data from note journal pages. **Reuses patterns from CodexParser**.

**Key Methods**:
- `parseSinglePage(page, enrichedHtml)` - Parses a note page into structured object
- `extractMetadata(content)` - Extracts tags, scene, location, visibility, etc.

**Data Structure**:
```javascript
{
    name: string,              // Note title
    content: string,           // Markdown/HTML content
    img: string|null,          // Image path if present
    tags: string[],            // Array of tags
    sceneId: string|null,      // Scene UUID if pinned
    sceneName: string|null,    // Scene name for display
    x: number|null,            // Canvas X coordinate
    y: number|null,            // Canvas Y coordinate
    authorId: string,           // User ID who created it
    authorName: string,        // Display name
    visibility: 'private'|'party', // Ownership level
    timestamp: string,           // ISO timestamp
    uuid: string                // Journal page UUID
}
```

**Shared Code Opportunity**: Extract common parsing logic from CodexParser into a base parser utility.

### 2. NotesForm (`scripts/panel-notes.js` - Application V2)

Lightweight panel for quick note capture. Should feel like Slack, not a journal editor.

**Key Features**:
- **Multiline markdown editor**: Simple textarea with markdown preview
- **Inline image paste**: Paste from clipboard or drag file
- **Tag input with autocomplete**: Comma-separated with suggestions
- **Party/Private toggle**: Simple checkbox or button
- **Scene/Location auto-stamp**: If created from canvas, auto-fill location
- **Quick save**: Minimal friction, auto-saves to journal

**Implementation Pattern**:
```javascript
class NotesForm extends Application {
    static get defaultOptions() {
        return {
            id: 'notes-quick-form',
            title: 'New Note',
            template: 'modules/coffee-pub-squire/templates/notes-form.hbs',
            width: 500,
            height: 'auto',
            resizable: true
        };
    }
    
    async _updateObject(event, formData) {
        // Get selected journal from settings
        const journalId = game.settings.get(MODULE.ID, 'notesJournal');
        const journal = game.journal.get(journalId);
        
        // Generate HTML content with metadata
        const pageData = {
            name: formData.title,
            type: 'text',
            text: {
                content: this._generateNoteContent(formData)
            },
            flags: {
                [MODULE.ID]: {
                    noteType: 'sticky',
                    tags: formData.tags.split(','),
                    visibility: formData.visibility,
                    sceneId: formData.sceneId,
                    x: formData.x,
                    y: formData.y,
                    authorId: game.user.id,
                    timestamp: new Date().toISOString()
                }
            }
        };
        
        // Create journal page
        await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
    }
}
```

**Shared Code Opportunity**: Reuse journal selection patterns from NotesPanel and CodexPanel.

### 3. NotesPanel (`scripts/panel-notes.js` - Panel Class)

Main UI component that displays notes as cards with filtering.

**Data Structure**:
```javascript
{
    notes: [],                  // All notes
    filters: {
        search: "",
        tags: [],
        scene: "all",
        visibility: "all"       // all, private, party
    },
    allTags: Set,               // All unique tags
    scenes: Set                 // All scenes with notes
}
```

**Key Methods**:
- `_refreshData()` - Loads all note pages, parses with NotesParser
- `render(element)` - Renders notes as cards grouped by scene/date
- `_activateListeners(html)` - Sets up filtering, search, tag selection

**Display Modes**:
- **List view**: Cards grouped by scene or date
- **Grid view**: Visual card grid (future)
- **Timeline view**: Chronological (future)

**Shared Code Opportunity**: 
- Reuse filtering patterns from CodexPanel
- Reuse journal content rendering from current NotesPanel
- Reuse permission checking from current NotesPanel

### 4. Canvas Pin Integration (Blacksmith Pin API)

Optional canvas markers for spatially-pinned notes. **Uses Blacksmith Pin API** (upcoming feature from Coffee Pub Blacksmith module).

**Key Features**:
- Leverages Blacksmith's pin system for canvas markers
- Renders as sticky note visual on canvas
- Click to open note in panel
- Drag to reposition (handled by Blacksmith)
- Right-click to delete/unpin (handled by Blacksmith)

**Integration Pattern**:
```javascript
// Register note pins with Blacksmith
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith?.PinAPI) {
    blacksmith.PinAPI.createPin({
        type: 'note',
        uuid: noteUuid,
        x: x,
        y: y,
        sceneId: sceneId,
        config: {
            icon: 'fa-sticky-note',
            color: 0xFFFF00,
            // ... other visual config
        },
        onClick: () => {
            // Open note in panel
        }
    });
}
```

**Note**: Implementation details depend on Blacksmith Pin API specification. See `documents/notes-pin-requirements.md` for detailed requirements that should be shared with the Blacksmith developer.

### 5. Settings Integration

Uses FoundryVTT settings for configuration:

```javascript
// Notes journal selection
game.settings.register(MODULE.ID, 'notesJournal', {
    name: "Notes Journal",
    hint: "The journal to use for player notes...",
    scope: "world",
    config: false,
    type: String,
    default: "none"
});

// User preferences
game.user.setFlag(MODULE.ID, 'notesViewMode', 'list'); // list, grid, timeline
game.user.setFlag(MODULE.ID, 'notesCollapsedScenes', {});
```

**Shared Code Opportunity**: Reuse journal selection UI from current NotesPanel and CodexPanel.

## Data Flow

### Note Creation Flow

```
1. User clicks "New Note" or drags to canvas
   ↓
2. NotesForm opens (lightweight Application V2)
   ↓
3. User types markdown, pastes image, adds tags
   ↓
4. User selects Party/Private visibility
   ↓
5. Form generates HTML content with metadata
   ↓
6. Form creates JournalEntryPage with flags
   ↓
7. If canvas location provided, registers pin with Blacksmith Pin API
   ↓
8. Form closes, triggers panel refresh
   ↓
9. NotesPanel._refreshData() loads new note
   ↓
10. NotesParser.parseSinglePage() extracts data
   ↓
11. Panel renders updated note card
```

### Note Display Flow

```
1. Panel.render() called
   ↓
2. Panel._refreshData() loads all note pages
   ↓
3. For each page:
   a. Check noteType flag (must be 'sticky')
   b. Enrich HTML content (TextEditor.enrichHTML)
   c. Parse with NotesParser.parseSinglePage()
   d. Filter by visibility (private notes only for creator)
   e. Group by scene or date
   ↓
4. Render template with organized data
   ↓
5. Apply filters (search, tags, scene)
   ↓
6. Display notes as cards
```

## Shared Code Opportunities

### 1. Journal Content Utilities (`scripts/utility-journal.js`)

Extract common journal operations:

**Functions**:
- `enrichJournalContent(content, options)` - Wraps TextEditor.enrichHTML
- `getJournalPageContent(page)` - Handles async content resolution
- `userCanAccessPage(page, user)` - Permission checking (from NotesPanel)
- `renderJournalContent(container, page, options)` - Content rendering with fallbacks
- `showJournalPicker(callback)` - Journal selection dialog (from NotesPanel/CodexPanel)
- `showPagePicker(journal, callback)` - Page selection dialog (from NotesPanel)

**Benefits**:
- Single source of truth for journal operations
- Consistent error handling
- Easier to maintain and test

### 2. Base Parser Class (`scripts/utility-base-parser.js`)

Extract common parsing patterns:

**Base Class**:
```javascript
export class BaseParser {
    static async parseSinglePage(page, enrichedHtml) {
        // Common: Extract name, uuid, image
        // Subclasses: Extract specific fields
    }
    
    static extractFieldFromHTML(html, label) {
        // Common: Find <strong>Label:</strong> value pattern
    }
    
    static extractImage(html) {
        // Common: Find first <img> tag
    }
}
```

**Subclasses**:
- `CodexParser extends BaseParser`
- `NotesParser extends BaseParser`
- `QuestParser extends BaseParser` (future)

### 3. ~~Base Pin Class~~ (Not Needed for Notes)

**Note**: Notes system will use Blacksmith Pin API instead of implementing custom pins. QuestPin may still benefit from a base class refactor, but this is not required for Notes implementation.

### 4. Panel Base Class (`scripts/base-panel.js`)

Extract common panel patterns:

**Base Class**:
```javascript
export class BasePanel {
    constructor() {
        this.element = null;
        this.filters = { search: "", tags: [] };
    }
    
    async _refreshData() {
        // Common: Load journal, parse pages, organize data
    }
    
    _activateListeners(html) {
        // Common: Search, filter, event handlers
    }
    
    _setupSearchFilter(html) {
        // Common: DOM-based filtering
    }
}
```

**Subclasses**:
- `CodexPanel extends BasePanel`
- `NotesPanel extends BasePanel`
- `QuestPanel extends BasePanel` (future)

## Integration Points

### 1. Journal Hooks

The system listens to journal updates:
- `updateJournalEntryPage` - Refresh panel when note is updated
- `deleteJournalEntryPage` - Remove note from panel
- `createJournalEntryPage` - Add new note to panel

**Shared Code**: Reuse hook routing patterns from `squire.js`.

### 2. Canvas Integration (Blacksmith Pin API)

- `dropCanvasData` - Handle note creation from canvas drag, register with Blacksmith
- Blacksmith Pin API handles pin persistence and loading
- Scene activation - Blacksmith handles pin loading for new scenes

**Integration**: Use Blacksmith Pin API for all canvas pin operations. No custom pin code needed.

### 3. Settings Integration

- Journal selection via settings
- User preferences (view mode, collapsed states)
- Module configuration

**Shared Code**: Reuse settings patterns from existing panels.

## Key Design Patterns

### 1. **Parser-Based Architecture**

Stores HTML, parses on-demand (same as Codex):
- **Flexibility**: Add fields without migration
- **Human-editable**: GMs can edit in journals
- **Version-tolerant**: Parser handles missing fields

### 2. **Tag-Based Filtering**

Multi-dimensional filtering:
- Tags extracted from entries
- Tag cloud UI for multi-select
- Search and tags work together (AND logic)

**Shared Code**: Reuse filtering logic from CodexPanel.

### 3. **Ownership and Visibility**

Leverages FoundryVTT's native ownership:
- Private notes: Creator only
- Party notes: All players with Observer permission
- GMs see all notes

**Shared Code**: Reuse permission checking from current NotesPanel.

### 4. **Event Listener Management**

Uses cloning pattern to prevent duplicates:
```javascript
const newButton = button.cloneNode(true);
button.parentNode?.replaceChild(newButton, button);
newButton.addEventListener('click', handler);
```

**Shared Code**: Standardize this pattern across all panels.

## Template Structure

### Notes Form Template (`templates/notes-form.hbs`)

```
Notes Form
├── Title input
├── Content editor (textarea with markdown preview)
├── Image drop zone / preview
├── Tag input (comma-separated with autocomplete)
├── Visibility toggle (Private/Party)
├── Scene/Location display (if from canvas)
└── Actions (Save, Cancel)
```

### Notes Panel Template (`templates/panel-notes.hbs`)

```
Notes Panel
├── Toolbar (new note, refresh, settings)
├── Filters
│   ├── Search input
│   ├── Tag cloud (collapsible)
│   └── Scene filter
└── Content
    └── Notes (grouped by scene/date)
        └── Note cards
            ├── Header (title, author, timestamp, actions)
            ├── Image (if present)
            ├── Content (markdown rendered)
            ├── Tags
            └── Location (if pinned)
```

## Best Practices

### 1. **Error Handling**

Always wrap parsing and data operations:
```javascript
try {
    const note = await NotesParser.parseSinglePage(page, enriched);
    if (note) {
        // Process note
    }
} catch (error) {
    console.error('Error parsing note:', error);
    // Continue processing other notes
}
```

### 2. **Async Content Handling**

Journal page content can be async:
```javascript
let content = '';
if (typeof page.text?.content === 'string') {
    content = page.text.content;
} else if (page.text?.content) {
    content = await page.text.content;
}
```

**Shared Code**: Extract to utility function.

### 3. **Performance Considerations**

- Use client-side filtering (DOM manipulation)
- Cache parsed notes when possible
- Batch journal page operations
- Use `Set` for efficient tag/scene lookups

**Shared Code**: Reuse filtering patterns from CodexPanel.

### 4. **User Experience**

- Provide visual feedback during operations
- Show loading states during data refresh
- Persist user preferences (collapsed states, filters)
- Support keyboard navigation

## Migration from Current Notes

The current NotesPanel is a simple journal viewer. Migration strategy:

1. **Phase 1**: Keep current NotesPanel, add new NotesPanel alongside
2. **Phase 2**: Add feature flag to switch between old/new
3. **Phase 3**: Migrate existing notes (if any) to new format
4. **Phase 4**: Remove old NotesPanel, rename new to NotesPanel

**Reusable from Current Notes**:
- Journal selection UI (`_showJournalPicker`)
- Page selection UI (`_showPagePicker`)
- Permission checking (`_userCanAccessPage`)
- Content rendering (`_renderJournalContent` with fallbacks)
- Journal content container structure

## Extension Points

### Adding Custom Fields

1. Update Parser: Add field extraction in `NotesParser.parseSinglePage()`
2. Update Form: Add form field in `notes-form.hbs`
3. Update Template: Add display section in `panel-notes.hbs`
4. Update Content Generator: Add field to `_generateNoteContent()`

### Custom Note Types

Extend parser to support different note types:
```javascript
if (noteType === 'sticky') {
    // Standard note
} else if (noteType === 'bookmark') {
    // Bookmark to journal entry
} else if (noteType === 'reminder') {
    // Time-based reminder
}
```

## Testing Considerations

- Test note creation from form
- Test note creation from canvas drag
- Test private vs party visibility
- Test tag filtering and search
- Test canvas pin creation/removal
- Test note persistence across scene changes
- Test permission boundaries
- Test with missing journal entries
- Test image upload and display

## Future Enhancements

1. **Rich text editor**: Replace textarea with ProseMirror
2. **Note templates**: Pre-filled note types (NPC, Location, etc.)
3. **Note linking**: Link notes to each other
4. **Export formats**: PDF, Markdown, HTML
5. **Note sharing**: Share individual notes between players
6. **Note reactions**: Emoji reactions to party notes
7. **Note mentions**: @mention players in notes
