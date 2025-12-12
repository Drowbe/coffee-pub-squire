# Codex System Architecture Overview

## Introduction

The Codex system is a flexible, journal-based world-building and reference management system for FoundryVTT modules. It provides a structured way to organize characters, locations, items, events, and other game entities with rich metadata, search capabilities, and visual presentation.

This document outlines the architecture, design patterns, and implementation details to help other module developers understand and potentially reuse similar approaches.

---

## Core Design Philosophy

### 1. **Journal as System of Record**
The codex system uses FoundryVTT's native Journal system as its data store. Each codex entry is a separate page within a designated journal. This approach provides:
- **Native FoundryVTT integration**: Entries are standard journal pages, accessible through normal journal workflows
- **Built-in permissions**: Leverages FoundryVTT's ownership and visibility system
- **No custom database**: Avoids creating separate data structures that need synchronization
- **User familiarity**: GMs and players already understand how journals work

### 2. **Structured HTML Content**
Entries are stored as HTML with semantic markup using `<strong>` labels and structured paragraphs:
```html
<p><strong>Category:</strong> Characters</p>
<p><strong>Description:</strong> A mysterious figure...</p>
<p><strong>Location:</strong> Phlan > Thorne Island</p>
<p><strong>Tags:</strong> npc, informant, phlan</p>
```

This approach:
- **Human-readable**: Entries can be edited directly in journal sheets
- **Parser-friendly**: Easy to extract structured data via DOM parsing
- **Flexible**: Can add new fields without schema changes
- **Enrichable**: Works with FoundryVTT's TextEditor enrichment system

### 3. **Separation of Concerns**
The system is divided into distinct components:
- **Parser**: Extracts structured data from HTML
- **Form**: Handles entry creation/editing
- **Panel**: Displays and manages entries
- **Storage**: Journal pages (via FoundryVTT API)

---

## Architecture Components

### 1. CodexParser (`scripts/utility-codex-parser.js`)

The parser is responsible for converting HTML journal content into structured JavaScript objects.

#### Key Methods

**`parseSinglePage(page, enrichedHtml)`**
- Parses a single journal page into a codex entry object
- Handles async content resolution
- Extracts all codex fields (category, description, plotHook, location, tags, link, image)
- Returns a structured entry object or `null` if invalid

**Design Patterns:**
```javascript
// Uses DOMParser for safe HTML parsing
const parser = new DOMParser();
const doc = parser.parseFromString(enrichedHtml, 'text/html');

// Robust field extraction with fallbacks
const strong = p.querySelector('strong');
if (!strong) continue;
let label = strong.textContent.trim();
if (label.endsWith(':')) label = label.slice(0, -1);

// Handles both UUID format and data-attribute links
const uuidMatch = value.match(/@UUID\[(.*?)\]{(.*?)}/);
```

**Key Features:**
- Case-insensitive label matching
- Handles HTML entities and formatting
- Supports both `<p><strong>Label:</strong> value</p>` and `<li><strong>Label:</strong> value</li>` formats
- Extracts images, links (UUID format), and tags
- Graceful error handling for malformed entries

### 2. CodexForm (`scripts/panel-codex.js` - FormApplication Class)

A FoundryVTT `FormApplication` that provides a user-friendly interface for creating and editing codex entries.

#### Key Features

**Drag & Drop Auto-Population**
- Accepts tokens, items, and journal entries
- Automatically extracts relevant data (name, image, description)
- Pre-fills form fields to reduce manual entry

**Smart Field Management**
- Category and location dropdowns with "New" option
- Auto-complete from existing entries
- Tag suggestions and comma-separated input
- Image preview and management

**Journal Integration**
- Creates new journal pages on save
- Generates structured HTML content
- Handles journal selection via settings

**Implementation Pattern:**
```javascript
class CodexForm extends FormApplication {
    async _updateObject(event, formData) {
        // Convert form data to entry object
        const entry = expandObject(formData);
        
        // Get selected journal from settings
        const journalId = game.settings.get(MODULE.ID, 'codexJournal');
        const journal = game.journal.get(journalId);
        
        // Generate HTML content
        const pageData = {
            name: entry.name,
            type: 'text',
            text: {
                content: this._generateJournalContent(entry)
            }
        };
        
        // Create journal page
        await journal.createEmbeddedDocuments('JournalEntryPage', [pageData]);
    }
}
```

### 3. CodexPanel (`scripts/panel-codex.js` - Panel Class)

The main UI component that displays and manages codex entries.

#### Data Structure

```javascript
{
    categories: Set,           // Unique category names
    data: {                   // Entries grouped by category
        "Characters": [entry1, entry2, ...],
        "Locations": [entry3, entry4, ...],
        ...
    },
    filters: {
        search: "",
        tags: [],
        category: "all"
    },
    allTags: Set              // All unique tags across entries
}
```

#### Key Methods

**`_refreshData()`**
- Loads all pages from the selected journal
- Enriches HTML content using TextEditor
- Parses each page using `CodexParser.parseSinglePage()`
- Organizes entries by category
- Extracts all tags for filtering

**`render(element)`**
- Renders the panel using Handlebars templates
- Groups entries by category
- Applies filters and search
- Handles collapsed/expanded states

**`_activateListeners(html)`**
- Sets up all event handlers
- Implements live search filtering
- Handles tag selection and filtering
- Manages entry expansion/collapse
- Handles entry actions (edit, delete, visibility)

#### Filtering Architecture

The panel implements client-side filtering for performance:

1. **Search Filter**: Text-based search across all entry fields
2. **Tag Filter**: Multi-select tag filtering
3. **Category Filter**: Filter by category (future enhancement)
4. **Visibility Filter**: Respects FoundryVTT ownership levels

**Filtering Pattern:**
```javascript
// DOM-based filtering (no re-render needed)
const filterEntries = () => {
    const search = this.filters.search.trim().toLowerCase();
    nativeHtml.querySelectorAll('.codex-entry').forEach(entry => {
        let text = entry.textContent?.toLowerCase() || '';
        let searchMatch = !search || text.includes(search);
        entry.style.display = searchMatch ? '' : 'none';
    });
};
```

### 4. Settings Integration (`scripts/settings.js`)

The codex system uses FoundryVTT settings for configuration:

```javascript
game.settings.register(MODULE.ID, 'codexJournal', {
    name: "Codex Journal",
    hint: "The journal to use for codex entries...",
    scope: "world",
    config: false,  // Set programmatically, not in settings UI
    type: String,
    choices: () => {
        // Dynamic choices based on available journals
        const choices = { 'none': '- Select Journal -' };
        game.journal.contents.forEach(j => {
            choices[j.id] = j.name;
        });
        return choices;
    },
    default: "none",
    onChange: () => {
        // Refresh panel when journal changes
        if (PanelManager.instance?.codexPanel) {
            PanelManager.instance.codexPanel.render(...);
        }
    }
});
```

---

## Data Flow

### Entry Creation Flow

```
1. User clicks "Add Codex Entry"
   ↓
2. CodexForm opens with empty/default entry
   ↓
3. User fills form (optionally drags token/item/journal)
   ↓
4. Form generates HTML content via _generateJournalContent()
   ↓
5. Form creates new JournalEntryPage via createEmbeddedDocuments()
   ↓
6. Form closes and triggers panel refresh
   ↓
7. CodexPanel._refreshData() loads new page
   ↓
8. CodexParser.parseSinglePage() extracts structured data
   ↓
9. Panel renders updated entry
```

### Entry Display Flow

```
1. Panel.render() called
   ↓
2. Panel._refreshData() loads all journal pages
   ↓
3. For each page:
   a. Enrich HTML content (TextEditor.enrichHTML)
   b. Parse with CodexParser.parseSinglePage()
   c. Group by category
   d. Extract tags
   ↓
4. Render template with organized data
   ↓
5. Apply filters (search, tags)
   ↓
6. Display entries grouped by category
```

---

## Key Design Patterns

### 1. **Parser-Based Architecture**

Instead of storing structured JSON, the system stores HTML and parses it on-demand. This provides:
- **Flexibility**: Can add new fields without migration
- **Human-editable**: GMs can edit entries directly in journals
- **Version-tolerant**: Parser can handle missing or new fields gracefully

### 2. **Category-Based Organization**

Entries are automatically grouped by category:
- Categories are extracted from entries (no predefined list)
- "No Category" is used as default for entries without category
- Categories can be collapsed/expanded per user preference
- Category icons are mapped via `getCategoryIcon()`

### 3. **Tag-Based Filtering**

Tags provide flexible, multi-dimensional filtering:
- Tags are extracted from entries and aggregated
- Tag cloud UI allows multi-select filtering
- Tags can be clicked from entries to filter
- Search and tags work together (AND logic)

### 4. **Ownership and Visibility**

Leverages FoundryVTT's native ownership system:
- Entries respect journal page ownership levels
- GMs see all entries with visibility toggle
- Players only see entries they have permission to view
- Visibility icon shows current permission level

### 5. **Event Listener Management**

Uses cloning pattern to prevent duplicate listeners:
```javascript
// Clone element to remove existing listeners
const newButton = button.cloneNode(true);
button.parentNode?.replaceChild(newButton, button);
newButton.addEventListener('click', handler);
```

This is especially important when panels re-render frequently.

---

## Template Structure

### Panel Template (`templates/panel-codex.hbs`)

The panel template uses Handlebars with a hierarchical structure:

```
Codex Panel
├── Toolbar (refresh, add, import, export, settings)
├── Filters
│   ├── Search input
│   └── Tag cloud (collapsible)
└── Content
    └── Categories (collapsible sections)
        └── Entries (collapsible items)
            ├── Header (name, actions)
            └── Content (description, plotHook, location, tags, etc.)
```

**Key Template Features:**
- Conditional rendering based on user role (`{{#if isGM}}`)
- Dynamic category icons
- Collapsible sections with state persistence
- Rich content rendering (HTML from enriched journal content)

### Form Template (`templates/codex-form.hbs`)

The form template provides:
- Drag & drop zone for auto-population
- Image preview section
- Category/location dropdowns with "New" option
- Tag input with suggestions
- Form validation

---

## Integration Points

### 1. **Journal Hooks**

The system listens to journal updates to refresh the panel:
- `updateJournalEntry` hook: Refreshes when journal is updated
- `updateJournalEntryPage` hook: Refreshes when page is updated
- `deleteJournalEntryPage` hook: Removes entry from panel

These hooks are typically managed by a centralized HookManager.

### 2. **Settings Integration**

- Journal selection via settings
- User preferences (collapsed categories, tag cloud state)
- Module configuration

### 3. **External Module Integration**

The system can integrate with other modules:
- **Coffee Pub Blacksmith**: For item discovery and auto-population
- **Other modules**: Can extend CodexParser or add custom fields

### 4. **Import/Export**

The system supports JSON import/export:
- **Export**: Converts all entries to JSON array
- **Import**: Creates journal pages from JSON array
- Useful for bulk entry creation or module migration

---

## Best Practices

### 1. **Error Handling**

Always wrap parsing and data operations in try-catch:
```javascript
try {
    const entry = await CodexParser.parseSinglePage(page, enriched);
    if (entry) {
        // Process entry
    }
} catch (error) {
    console.error('Error parsing codex entry:', error);
    // Continue processing other entries
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
- Cache parsed entries when possible
- Batch journal page operations
- Use `Set` for efficient tag/category lookups

### 4. **User Experience**

- Provide visual feedback during operations (progress bars)
- Show loading states during data refresh
- Persist user preferences (collapsed states, filters)
- Support keyboard navigation where possible

### 5. **Extensibility**

- Use configuration objects for category icons
- Allow custom field parsers
- Support plugin-style extensions
- Document extension points

---

## Extension Points

### Adding Custom Fields

1. **Update Parser**: Add field extraction in `CodexParser.parseSinglePage()`
2. **Update Form**: Add form field in `codex-form.hbs` and form logic
3. **Update Template**: Add display section in `panel-codex.hbs`
4. **Update Content Generator**: Add field to `_generateJournalContent()`

### Custom Category Icons

Extend `getCategoryIcon()` method:
```javascript
getCategoryIcon(category) {
    const map = {
        'Custom Category': 'fa-custom-icon',
        // ... existing mappings
    };
    return map[category] || 'fa-book';
}
```

### Custom Parsers

Create specialized parsers for different entry types:
```javascript
class CustomCodexParser extends CodexParser {
    static async parseCustomEntry(page, enrichedHtml) {
        // Custom parsing logic
    }
}
```

---

## Migration Considerations

### From Custom Database to Journal-Based

If migrating from a custom database system:

1. **Export existing data** to JSON format
2. **Use import functionality** to create journal pages
3. **Verify parser** handles your data structure
4. **Update UI** to use journal-based workflows

### Version Compatibility

- Parser should handle missing fields gracefully
- Use feature detection for FoundryVTT version differences
- Provide migration utilities for data structure changes

---

## Lessons Learned

### What Works Well

1. **Journal-based storage**: Leverages native FoundryVTT systems, no custom sync needed
2. **HTML parsing**: Flexible, human-editable, version-tolerant
3. **Client-side filtering**: Fast, responsive user experience
4. **Category organization**: Intuitive grouping without rigid schemas
5. **Tag system**: Flexible multi-dimensional filtering

### Challenges and Solutions

1. **Async content**: Handle both sync and async journal content
2. **Event listener duplication**: Use cloning pattern to prevent duplicates
3. **Performance with many entries**: Client-side filtering, efficient data structures
4. **Ownership complexity**: Leverage FoundryVTT's native system, don't reinvent

### Future Enhancements

1. **Full-text search**: Index entries for faster searching
2. **Relationships**: Link entries to each other
3. **Timeline view**: Chronological organization for events
4. **Map integration**: Visual location mapping
5. **Export formats**: PDF, Markdown, etc.

---

## Conclusion

The Codex system demonstrates a flexible, journal-based approach to world-building data management in FoundryVTT. By leveraging native systems (journals, ownership, TextEditor) and using parser-based architecture, it provides a robust foundation that can be extended and adapted for various use cases.

Key takeaways for other module developers:
- **Use native systems** when possible (journals, settings, ownership)
- **Parser-based architecture** provides flexibility and version tolerance
- **Client-side filtering** improves performance and UX
- **Separation of concerns** makes the system maintainable and extensible
- **Error handling** is critical for user-facing data operations

For questions or contributions, refer to the main module documentation or GitHub repository.

