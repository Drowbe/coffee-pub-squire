# Notes System Implementation Plan

This document outlines the step-by-step plan for implementing the new Notes system, including refactoring opportunities to share code with Codex and existing Notes panels.

## Phase 1: Shared Code Refactoring

**Goal**: Extract common patterns into shared utilities before building Notes system.

### 1.1 Create Journal Utilities (`scripts/utility-journal.js`)

**Status**: ✅ **COMPLETE** (utility created, panel-notes updated)

**Extract from**:
- `panel-notes.js`: `_userCanAccessPage()`, `_showJournalPicker()`, `_showPagePicker()`, `_renderJournalContent()`, `_getPageContent()`
- `panel-codex.js`: Journal selection patterns, content enrichment
- `panel-quest.js`: Journal selection patterns

**Create functions**:
```javascript
// Permission checking
export function userCanAccessPage(page, user, permLevels)

// Journal selection UI
export async function showJournalPicker(options)
export async function showPagePicker(journal, options)

// Content handling
export async function getJournalPageContent(page)
export async function enrichJournalContent(content, options)
export async function renderJournalContent(container, page, options)
```

**Files to update**:
- ✅ `scripts/utility-journal.js` - **CREATED** (all functions implemented)
- ✅ `scripts/panel-notes.js` - **COMPLETE** (replaced all methods with utility calls, removed ~973 lines)
- ✅ `scripts/panel-codex.js` - **COMPLETE** (replaced `_showJournalPicker()` with `showJournalPicker()` using 'select' mode)
- ✅ `scripts/panel-quest.js` - **COMPLETE** (replaced `_showJournalPicker()` with `showJournalPicker()` using 'grid' mode)
- ✅ `scripts/helpers.js` - **NO CHANGES NEEDED** (utility imports from helpers)

**Estimated effort**: 4-6 hours
**Actual effort**: ~3 hours (utility created, all three panels updated)
**Status**: ✅ **PHASE 1.1 COMPLETE**

### 1.2 Create Base Parser Class (`scripts/utility-base-parser.js`)

**Status**: ✅ **COMPLETE** (base class created, CodexParser refactored)

**Extract from**:
- `utility-codex-parser.js`: Common parsing patterns
- Future: `utility-notes-parser.js`, `utility-quest-parser.js`

**Create base class**:
```javascript
export class BaseParser {
    static extractFieldFromHTML(html, label, containerSelector = 'p')
    static extractImage(html)
    static extractTags(html, containerSelector = 'p')
    static extractLink(html, contextElement = null)
    static async parseSinglePage(page, enrichedHtml) // Abstract - must be implemented by subclass
}
```

**Refactor**:
- ✅ `CodexParser extends BaseParser` - **COMPLETE** (uses BaseParser utilities, legacy methods updated)
- ⏳ Create `NotesParser extends BaseParser` - **PENDING** (Phase 2)
- Future: `QuestParser extends BaseParser`

**Files to update**:
- ✅ `scripts/utility-base-parser.js` - **CREATED** (all common parsing methods implemented)
- ✅ `scripts/utility-codex-parser.js` - **COMPLETE** (refactored to extend BaseParser, uses BaseParser utilities)
- ⏳ `scripts/utility-notes-parser.js` - **PENDING** (Phase 2)

**Estimated effort**: 3-4 hours
**Actual effort**: ~2 hours (base class created, CodexParser refactored)
**Status**: ✅ **PHASE 1.2 COMPLETE** (NotesParser will be created in Phase 2)

### 1.3 ~~Create Base Pin Class~~ (Deferred - Not Needed for Notes)

**Note**: Notes system will use Blacksmith Pin API instead of implementing custom pins. Base pin class refactoring may still be beneficial for QuestPin, but is not required for Notes implementation.

**Estimated effort**: 0 hours (deferred/not needed)

### 1.4 Create Base Panel Class (`scripts/base-panel.js`)

**Extract from**:
- `panel-codex.js`: Common panel patterns (filtering, search, refresh)
- `panel-notes.js`: Common panel structure

**Create base class**:
```javascript
export class BasePanel {
    constructor()
    async _refreshData()
    _activateListeners(html)
    _setupSearchFilter(html)
    _setupTagFilter(html)
}
```

**Refactor** (future, not required for Notes v1):
- `CodexPanel extends BasePanel`
- `NotesPanel extends BasePanel`
- `QuestPanel extends BasePanel`

**Note**: This is lower priority - can be done after Notes v1 is complete.

**Estimated effort**: 6-8 hours (deferred)

## Phase 2: Notes Parser Implementation

**Status**: ✅ **COMPLETE** (parser created)

**Goal**: Create parser to extract structured data from note journal pages.

### 2.1 Create NotesParser (`scripts/utility-notes-parser.js`)

**Status**: ✅ **COMPLETE** (parser created, extends BaseParser)

**Based on**: `utility-codex-parser.js` patterns

**Key methods**:
- `parseSinglePage(page, enrichedHtml)` - Parse note page (combines flags metadata with content)
- Uses `BaseParser.extractImage()` for image extraction
- Note: Metadata (tags, scene, location, visibility, author, timestamp) comes from flags, not HTML parsing

**Data structure**:
```javascript
{
    name: string,              // From page.name
    content: string,           // From page.text.content (enriched)
    img: string|null,          // Extracted from HTML
    tags: string[],            // From flags[MODULE.ID].tags
    sceneId: string|null,      // From flags[MODULE.ID].sceneId
    sceneName: string|null,    // Looked up from sceneId
    x: number|null,            // From flags[MODULE.ID].x
    y: number|null,            // From flags[MODULE.ID].y
    authorId: string,          // From flags[MODULE.ID].authorId
    authorName: string,        // Looked up from authorId
    visibility: 'private'|'party', // From flags[MODULE.ID].visibility
    timestamp: string,         // From flags[MODULE.ID].timestamp
    uuid: string               // From page.uuid
}
```

**Note**: Parser reads metadata from flags, only extracts content and images from HTML.

**Files to create**:
- ✅ `scripts/utility-notes-parser.js` - **CREATED** (extends BaseParser, reads flags for metadata, extracts images from HTML)

**Estimated effort**: 2-3 hours
**Actual effort**: ~1 hour (parser created, follows BaseParser pattern)
**Status**: ✅ **PHASE 2 COMPLETE**

**How to Test Phase 2**:

Since NotesParser requires notes with flags (which we'll create in Phase 3), testing is limited now. You can:

1. **Verify Parser Loads** (No errors):
   - Load FoundryVTT with the module
   - Open browser console (F12)
   - Check for errors — should be none
   - Verify file loads: Check Network tab → look for `utility-notes-parser.js` → should load successfully

2. **Test Parser Structure** (Console - using dynamic import):
   ```javascript
   // In browser console (FoundryVTT)
   (async () => {
       const { NotesParser } = await import('modules/coffee-pub-squire/scripts/utility-notes-parser.js');
       console.log('NotesParser loaded:', NotesParser);
       console.log('Extends BaseParser (has extractImage):', typeof NotesParser.extractImage === 'function');
       console.log('Has parseSinglePage:', typeof NotesParser.parseSinglePage === 'function');
   })();
   ```

3. **Full Testing** (After Phase 3):
   - Once we create the NotesForm in Phase 3, you can create test notes with flags
   - Then use NotesParser to parse them and verify all fields are extracted correctly

**Note**: Full functional testing will happen in Phase 3 when we can create notes with the proper flag structure.

## Phase 3: Notes Form Implementation

**Goal**: Create lightweight Application V2 form for quick note capture.

### 3.1 Create NotesForm Class (`scripts/panel-notes.js`)

**Based on**: `CodexForm` patterns, but simpler

**Key features**:
- Application V2 (not FormApplication)
- Multiline textarea with markdown preview
- Image paste/drag support
- Tag input with autocomplete
- Party/Private toggle
- Quick save button

**Methods**:
- `_updateObject(event, formData)` - Save note to journal (sets flags and content)
- `_generateNoteContent(formData)` - Generate HTML content only (no metadata in HTML)
- `_generateNoteFlags(formData)` - Generate flags object with all metadata
- `_setupImagePaste(html)` - Handle image paste/drag
- `_setupTagAutocomplete(html)` - Tag suggestions

**Files to create/update**:
- `scripts/panel-notes.js` - Add NotesForm class (alongside NotesPanel)
- `templates/notes-form.hbs` - Create form template

**Estimated effort**: 6-8 hours

### 3.2 Create Notes Form Template (`templates/notes-form.hbs`)

**Structure**:
- Title input
- Content textarea
- Image drop zone
- Tag input
- Visibility toggle
- Save/Cancel buttons

**Files to create**:
- `templates/notes-form.hbs`

**Estimated effort**: 2-3 hours

## Phase 4: Notes Panel Implementation

**Goal**: Create panel to display notes as cards with filtering.

### 4.1 Refactor NotesPanel (`scripts/panel-notes.js`)

**Current state**: Simple journal viewer
**New state**: Note card display with filtering

**Key changes**:
- Replace journal content rendering with note card rendering
- Add filtering (search, tags, scene, visibility)
- Add note creation button
- Add note actions (edit, delete, pin/unpin)

**Methods to add/modify**:
- `_refreshData()` - Load note pages, read flags for metadata, parse content
- `render(element)` - Render note cards
- `_activateListeners(html)` - Set up filtering and actions
- `_setupSearchFilter(html)` - Live search filtering
- `_setupTagFilter(html)` - Tag cloud filtering
- `_createNoteCard(note)` - Generate card HTML
- `_readNoteMetadata(page)` - Read metadata from flags (not from HTML)

**Files to update**:
- `scripts/panel-notes.js` - Major refactor
- `templates/panel-notes.hbs` - Replace with card-based template

**Estimated effort**: 8-10 hours

### 4.2 Create Notes Panel Template (`templates/panel-notes.hbs`)

**Structure**:
- Toolbar (new note, refresh, settings)
- Filters (search, tag cloud, scene filter)
- Notes container (cards grouped by scene/date)

**Files to create/update**:
- `templates/panel-notes.hbs` - Complete rewrite

**Estimated effort**: 3-4 hours

### 4.3 Create Notes Panel Styles (`styles/panel-notes.css`)

**Styles needed**:
- Note card layout
- Tag cloud styling
- Filter UI
- Image display in cards

**Files to create/update**:
- `styles/panel-notes.css` - Major update

**Estimated effort**: 4-5 hours

## Phase 5: Canvas Pin Integration (Blacksmith Pin API)

**Goal**: Integrate with Blacksmith Pin API for optional canvas markers.

### 5.1 Research Blacksmith Pin API

**Tasks**:
- Review Blacksmith Pin API documentation
- Review Notes pin requirements document (`documents/notes-pin-requirements.md`)
- Understand API methods and configuration options
- Identify integration points
- Share requirements document with Blacksmith developer if needed

**Files to review**:
- Blacksmith module documentation
- Blacksmith API examples (if available)
- `documents/notes-pin-requirements.md` - Notes system requirements

**Estimated effort**: 1-2 hours

### 5.2 Integrate Notes with Blacksmith Pin API

**Key features**:
- Register note pins with Blacksmith when created from canvas
- Configure pin appearance (sticky note visual)
- Handle pin click events (open note in panel)
- Clean up pins when notes are deleted

**Integration pattern**:
```javascript
// When creating note from canvas
const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
if (pins?.isAvailable()) {
    await pins.whenReady();
    await pins.create({
        id: crypto.randomUUID(),
        x: dropX,
        y: dropY,
        moduleId: 'coffee-pub-squire',
        image: '<i class="fa-solid fa-location-dot"></i>',
        size: { w: 48, h: 48 },
        style: { fill: '#000000', stroke: '#ffff00', strokeWidth: 2, alpha: 0.9 },
        config: { noteUuid }
    }, { sceneId: canvas.scene.id });
    await pins.reload({ sceneId: canvas.scene.id });
}
```

**Files to update**:
- `scripts/panel-notes.js` - Add Blacksmith Pin API integration
- `scripts/squire.js` - Handle `dropCanvasData` for note creation, register with Blacksmith

**Estimated effort**: 3-4 hours

**Note**: Implementation details depend on Blacksmith Pin API specification. This phase may need adjustment once the API is available.

## Phase 6: Settings Integration

**Goal**: Add settings for notes journal and user preferences.

### 6.1 Add Notes Settings (`scripts/settings.js`)

**Settings to add**:
- `notesJournal` - World setting for notes journal (config true, set via Settings UI)
- `notesViewMode` - User flag (list, grid, timeline)
- `notesCollapsedScenes` - User flag for collapsed scene groups

**Files to update**:
- `scripts/settings.js` - Add notes settings

**Estimated effort**: 1-2 hours

## Phase 7: Hook Integration

**Goal**: Connect notes system to journal update hooks.

### 7.1 Add Hook Routing (`scripts/squire.js`)

**Based on**: Existing `_routeToCodexPanel` and `_routeToQuestPanel` patterns

**Add function**:
- `_routeToNotesPanel(page, changes, options, userId)` - Refresh notes panel on journal updates

**Files to update**:
- `scripts/squire.js` - Add notes routing

**Estimated effort**: 1-2 hours

## Phase 8: Testing and Polish

**Goal**: Test all functionality and polish UX.

### 8.1 Testing Checklist

- [ ] Note creation from form
- [ ] Note creation from canvas drag
- [ ] Private vs party visibility
- [ ] Tag filtering and search
- [ ] Scene filtering
- [ ] Canvas pin creation/removal
- [ ] Pin drag and reposition
- [ ] Note persistence across scenes
- [ ] Permission boundaries (private notes)
- [ ] Image upload and display
- [ ] Journal selection UI
- [ ] Hook updates (edit note, refresh panel)

**Estimated effort**: 4-6 hours

### 8.2 UX Polish

- Loading states
- Error messages
- Success notifications
- Keyboard shortcuts
- Accessibility improvements

**Estimated effort**: 2-3 hours

## Implementation Order

### Sprint 1: Foundation (Phases 1.1, 1.2)
**Goal**: Extract shared code, create base parser
**Duration**: 1-2 days
**Dependencies**: None

### Sprint 2: Parser and Form (Phases 2, 3)
**Goal**: Create parser and form for note creation
**Duration**: 2-3 days
**Dependencies**: Phase 1.2 (BaseParser)

### Sprint 3: Panel (Phase 4)
**Goal**: Create panel to display notes
**Duration**: 3-4 days
**Dependencies**: Phase 2 (NotesParser), Phase 1.1 (Journal utilities)

### Sprint 4: Canvas Integration (Phase 5)
**Goal**: Integrate with Blacksmith Pin API for spatial notes
**Duration**: 1-2 days
**Dependencies**: Phase 3 (NotesForm), Blacksmith Pin API availability

### Sprint 5: Integration and Polish (Phases 6, 7, 8)
**Goal**: Settings, hooks, testing, polish
**Duration**: 2-3 days
**Dependencies**: All previous phases

## Total Estimated Effort

- **Phase 1 (Shared Code)**: 7-10 hours (removed BasePin: -4-5 hours)
- **Phase 2 (Parser)**: 2-3 hours
- **Phase 3 (Form)**: 8-11 hours
- **Phase 4 (Panel)**: 15-19 hours
- **Phase 5 (Canvas - Blacksmith API)**: 4-6 hours (simplified: -3-3 hours)
- **Phase 6 (Settings)**: 1-2 hours
- **Phase 7 (Hooks)**: 1-2 hours
- **Phase 8 (Testing)**: 6-9 hours

**Total**: 44-62 hours (~6-9 working days)

## Risk Mitigation

### High Risk Areas

1. **Journal content rendering**: Complex fallback logic
   - **Mitigation**: Extract to utility, reuse from current NotesPanel

2. **Permission checking**: Complex ownership logic
   - **Mitigation**: Extract to utility, reuse from current NotesPanel

3. **Blacksmith Pin API integration**: API may not be available yet or may change
   - **Mitigation**: Research API early, implement fallback if API unavailable, document integration points

4. **Image upload**: Permission and path management
   - **Mitigation**: Research FoundryVTT file upload patterns, test early

### Medium Risk Areas

1. **Base class refactoring**: May break existing functionality
   - **Mitigation**: Test thoroughly, keep old code until new is verified

2. **Template migration**: Breaking changes to existing templates
   - **Mitigation**: Use feature flag to switch between old/new

## Success Criteria

- [ ] Notes can be created quickly (< 30 seconds)
- [ ] Notes support images (paste and drag)
- [ ] Notes can be filtered by tags, scene, search
- [ ] Private notes are only visible to creator
- [ ] Party notes are visible to all players
- [ ] Notes can be pinned to canvas (via Blacksmith Pin API)
- [ ] Canvas pins are draggable and clickable (handled by Blacksmith)
- [ ] Notes persist across scene changes
- [ ] No performance degradation with 100+ notes
- [ ] All shared code utilities work for Codex and Notes

## Future Enhancements (Post-v1)

- Rich text editor (ProseMirror)
- Note templates
- Note linking
- Export formats
- Note sharing
- Note reactions
- Note mentions
- Base Panel class refactoring (Phase 1.4)
