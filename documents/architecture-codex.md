# Coffee Pub Squire – Codex System Architecture

## Overview

The Codex system is a journal-based world-building and reference system. It organizes characters, locations, items, events, and other entities with rich metadata, search, and filtering. Each entry is a journal page in a designated codex journal; the panel displays entries by category with tag-based filtering and supports import/export and auto-discovery from party inventories.

## Placement in the Tray

- **View**: Codex tab (`viewMode === 'codex'`).
- **Visibility**: Controlled by `showTabCodex` (user setting).
- **Container**: `templates/tray.hbs` includes `<div class="panel-container" data-panel="panel-codex"></div>`; `PanelManager` injects the codex panel HTML there.

## Project Files

| File | Class/Purpose |
|------|---------------|
| `scripts/panel-codex.js` | `CodexPanel` – main panel UI; `CodexForm` – FormApplication for creating entries |
| `scripts/utility-codex-parser.js` | `CodexParser` – extends `BaseParser`, parses HTML journal content to entry objects |
| `scripts/utility-base-parser.js` | `BaseParser` – shared `extractFieldFromHTML`, `extractImage`, `extractTags`, `extractLink` |
| `templates/panel-codex.hbs` | Panel template |
| `templates/codex-form.hbs` | Form template (add entry) |
| `templates/handle-codex.hbs` | Handle content for codex view |
| `styles/panel-codex.css` | Panel styles |
| `styles/codex-form.css` | Form styles |
| `prompts/prompt-codex.txt` | Optional AI-assisted import prompt text |

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

Extends **`BaseParser`** (`utility-base-parser.js`). Converts HTML journal content into structured entry objects using `BaseParser.extractFieldFromHTML`, `BaseParser.extractImage`, `BaseParser.extractTags`, `BaseParser.extractLink`.

#### Key Methods

**`parseSinglePage(page, enrichedHtml)`**
- Parses a single journal page into a codex entry object
- Extracts: category, description, plotHook, location, tags, link (UUID or `data-uuid`), image (first `<img>`)
- Normalizes category (capitalize first letter)
- Returns a structured entry object (always; no mandatory fields beyond page name)

**`parseContent(html)`** (legacy)
- Parses multi-entry HTML (e.g. by `<h1>` sections) into an array of entries; used for alternate formats.

**Key Features:**
- Case-insensitive label matching; supports `<p><strong>Label:</strong> value</p>` and `<li>` formats
- Link extraction: `@UUID[type.id]{label}` or `<a data-uuid="...">`
- Graceful handling of missing fields

### 2. CodexForm (`scripts/panel-codex.js`)

`FormApplication` for **creating** codex entries (edit is done via journal sheet or “Open Journal”).

#### Key Features

**Drag & Drop**
- Accepts tokens, items, and journal entries; extracts name, image, description and pre-fills form (e.g. token drag sets category “Characters” and tags).

**Fields**
- Category and location dropdowns built from existing entries (`_getExistingCategories`, `_getExistingLocations`); tag input comma-separated; image preview and remove.

**Journal Integration**
- Uses `codexJournal` setting; creates new journal pages via `journal.createEmbeddedDocuments('JournalEntryPage', [pageData])`; content from `_generateJournalContent(entry)` (img, category, description, plotHook, location, tags). Does not write a Link field.

**After Save**
- Closes form; refreshes `CodexPanel` (`_refreshData()` then `render(element)`).

### 3. CodexPanel (`scripts/panel-codex.js`)

Main UI component that displays and manages codex entries.

#### Data Structure

```javascript
{
    categories: Set,           // Unique category names
    data: {},                 // Entries grouped by category, e.g. data["Characters"] = [entry1, ...]
    filters: { search: "", tags: [], category: "all" },
    allTags: Set,
    selectedJournal: JournalEntry | null,
    isImporting: false        // Suppresses refresh during import
}
```

#### Key Methods

**`_refreshData()`**
- Clears categories, data, allTags; loads `codexJournal` into `selectedJournal`
- For each page: resolves content (sync/async), enriches with TextEditor, parses with `CodexParser.parseSinglePage()`, groups by category (default “No Category”), collects tags

**`render(element)`**
- Finds `[data-panel="panel-codex"]`; loads `_refreshData()` then renders `TEMPLATES.PANEL_CODEX` with categories, entries, filters, collapsed state (`codexCollapsedCategories`), tag cloud collapsed (`codexTagCloudCollapsed`)
- Injects HTML and calls `_activateListeners(codexContainer)`

**`_activateListeners(html)`**
- Search input → DOM filter on `.codex-entry`; tag cloud `.codex-tag` → toggle selected, filter entries and sections; `.codex-section` collapse/expand (persist to `codexCollapsedCategories`); set journal, open journal, add entry, edit (feather), delete, visibility toggle; refresh button; import/export dialogs; auto-discover from party inventories

**Helpers**
- **`_isPageInSelectedJournal(page)`** – `page.parent.id === this.selectedJournal.id`
- **`_isCodexEntry(page)`** – Heuristic: has Category field or ≥2 of Description/Tags/Plot Hook/Location
- **`getCategoryIcon(category)`** – Returns FontAwesome class (e.g. Characters → fa-user, Locations → fa-location-pin); default `fa-book`

#### Filtering

Client-side DOM filtering: search (text across entry content), tag multi-select; section visibility updated from visible entries. No full re-render.

### 4. Settings and User Flags

| Setting | Key | Scope | Description |
|---------|-----|-------|-------------|
| Show Codex Tab | `showTabCodex` | user | Show/hide Codex tab on tray |
| Codex Journal | `codexJournal` | world | Journal for codex pages; chosen via panel “Set Journal” or settings; onChange refreshes panel |

**User flags (not in settings UI):**
- `codexCollapsedCategories` – Object mapping category name to collapsed boolean; persists section expand/collapse
- `codexTagCloudCollapsed` – Boolean for tag cloud collapse

**Page flag:** `codexUuid` – Set on imported entries for deduplication on re-import.

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

## Hooks Integration

**Blacksmith HookManager (squire.js):**
- **Journal:** `updateJournalEntryPage` (and create/delete journal page hooks) route to `_routeToCodexPanel(page, changes, options, userId)` when the page is in the selected codex journal and `codexPanel._isCodexEntry(page)` is true. If not `isImporting`, panel runs `_refreshData()` and `codexPanel.render(panelManager.element)`.

## Import/Export and Auto-Discover

### Import
- **JSON import**: Dialog with paste area; expects array of codex entry objects. Creates journal pages via `createEmbeddedDocuments`; sets `codexUuid` flag for deduplication. Progress bar via tray progress area. Optional AI-assisted import using `prompts/prompt-codex.txt` template.
- **Deduplication**: On import, existing pages are matched by `page.getFlag(MODULE.ID, 'codexUuid') === entry.uuid`; matching entries are updated, others created.

### Export
- **JSON export**: Converts all entries (from `_refreshData()`-style parsing) to JSON array; copy to clipboard or download file (e.g. `COFFEEPUB-SQUIRE-codex-export-{timestamp}.json`).

### Auto-Discover from Party Inventories
- Button in panel: scans all player-owned character tokens on the canvas, collects inventory item UUIDs and names, then for each codex entry checks if any party member has that item; updates entry “discoverers” and progress. Uses global progress bar; notifies when no party tokens or no inventory items found.

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

- **Custom fields:** Add extraction in `CodexParser.parseSinglePage()`, form field in `codex-form.hbs`, display in panel template, and output in `CodexForm._generateJournalContent()`.
- **Category icons:** Extend `CodexPanel.getCategoryIcon(category)` map (e.g. `'Custom Category': 'fa-custom-icon'`; default `'fa-book'`).

## Technical Requirements

- FoundryVTT v13+
- D&D 5e system 5.5+
- Required: `coffee-pub-blacksmith`

