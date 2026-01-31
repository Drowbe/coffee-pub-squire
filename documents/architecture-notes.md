# Coffee Pub Squire – Notes System Architecture

## Overview

The Notes system is a player-authored memory system: quick capture, private or party visibility, optional canvas pins via the Blacksmith Pin API, and tag/scene filtering. Each note is a JournalEntryPage with metadata in flags and content in page text. It is not a replacement for Journals (GM lore) or Codex (structured world-building).

## Placement in the Tray

- **View**: Notes tab (`viewMode === 'notes'`).
- **Visibility**: Controlled by `showTabNotes` (user setting).
- **Container**: `templates/tray.hbs` includes `<div class="panel-container" data-panel="panel-notes"></div>`; `PanelManager` injects the notes panel HTML there.

## Project Files

| File | Class/Purpose |
|------|---------------|
| `scripts/panel-notes.js` | `NotesPanel` – main panel UI; note pin helpers, ownership, create/update pin logic |
| `scripts/window-note.js` | `NotesForm` – FormApplication for create/edit/view notes (ProseMirror, optional collaborate) |
| `scripts/utility-notes-parser.js` | `NotesParser` – extends BaseParser; metadata from flags, content/image from HTML |
| `templates/panel-notes.hbs` | Panel template |
| `templates/window-note.hbs` | Form/window template (editor, metadata, actions) |
| `templates/handle-notes.hbs` | Handle content for notes view |
| `templates/notes-icon-picker.hbs` | Icon picker for note/pin icon |
| `styles/panel-notes.css` | Panel styles |
| `styles/window-note.css` | Form/window styles |
| `styles/notes-metadata-box.css` | Metadata box styles |

## Core Design

### Journal as System of Record

Each note is a JournalEntryPage in a designated journal (`notesJournal` setting). The page has:

- **Content**: `page.text.content` (HTML); edited with ProseMirror in the form (optional collaborative editing when editing an existing note).
- **Metadata in flags** (`page.flags[MODULE.ID]`): see Page Flags below.

### Page Flags (metadata)

| Flag | Purpose |
|------|---------|
| `noteType` | Must be `'sticky'` for notes (parser ignores other pages) |
| `visibility` | `'private'` or `'party'` (drives ownership and pin visibility) |
| `tags` | Array of tag strings |
| `authorId` | User ID of creator |
| `editorIds` | Array of user IDs (co-editors) |
| `sceneId`, `x`, `y` | Canvas pin scene and position |
| `timestamp` | ISO timestamp |
| `pinId` | Blacksmith pin ID when pinned |
| `noteIcon` | Icon for note/pin (FA class or HTML) |
| Pin appearance | `notePinSize`, `notePinShape`, `notePinStyle`, `notePinDropShadow`, `notePinTextLayout`, `notePinTextDisplay`, `notePinTextColor`, `notePinTextSize`, `notePinTextMaxLength`, `notePinTextScaleWithPin` |
| `editLock` | Optional edit lock (userId, at) for collaborative safety |

### Ownership and Pin Visibility

- **Private note**: GM and the note author are OWNERS; others NONE.
- **Party note**: GM and all party members (non-GM players) are OWNERS.
- Ownership is synced to the journal page and to the Blacksmith pin (via `blacksmith.pins.resolveOwnership` and `buildNoteOwnership(visibility, authorId)`).

## Components

### NotesParser (`utility-notes-parser.js`)

Extends **BaseParser**. Metadata is read from flags; only content and first image are taken from HTML.

**`parseSinglePage(page, enrichedHtml)`**
- Returns `null` if `page.getFlag(MODULE.ID, 'noteType') !== 'sticky'`.
- Reads from flags: visibility, tags, authorId, editorIds, sceneId, x, y, timestamp.
- Uses `BaseParser.extractImage(enrichedHtml)` for image.
- Resolves sceneName from sceneId, authorName from authorId.
- Returns `{ name, content, img, tags, sceneId, sceneName, x, y, authorId, authorName, visibility, timestamp, uuid }` (content is the enriched HTML passed in).

### NotesForm (`window-note.js`)

**FormApplication** for creating and editing notes. Template: `window-note.hbs`; classes: `window-note`, `squire-window`.

**Modes**
- **New note**: No page; draft can be created in journal on first interaction; on save, creates JournalEntryPage with flags and optional pin.
- **Edit/View**: Existing page; `this.page` set from `pageUuid`/`pageId`; view mode (read-only) vs edit mode.

**Editor**
- ProseMirror editor (`engine: 'prosemirror'`). When editing an existing note and `page` exists: `collaborate: true`, `document: page`, `fieldName: 'text.content'` for real-time collaboration. New notes use a non-collab editor; content is written on save.

**Key behavior**
- `getData()`: Loads page for existing note; prepares `note` (title, content, tags, visibility, icon, etc.) and `isEditMode` / `isViewMode`; configures `this.options.editors.content` for collab when applicable.
- `_updateObject()`: Updates `page.text.content` and metadata flags; syncs ownership; creates or updates Blacksmith pin when placement/location is set; pin updates wrapped in try/catch so save can succeed even if pin fails.
- Icon picker, tag input, visibility toggle, “Place on canvas” flow (pin creation), edit lock handling.

### NotesPanel (`panel-notes.js`)

Main UI for listing and filtering notes.

**Data structure**
```javascript
{
  notes: [],           // Parsed note objects
  filters: { search: '', tags: [], scene: 'all', visibility: 'all' },
  allTags: Set,
  scenes: Set,
  filtersOpen: false
}
```

**Key methods**
- `_refreshData()`: Loads pages from `notesJournal`; for each page with `noteType === 'sticky'`, enriches HTML, parses with `NotesParser.parseSinglePage()`, filters by visibility (private only for author), pushes to `this.notes`, collects tags and scenes.
- `render(element)`: Finds `[data-panel="panel-notes"]`; runs `_refreshData()`; renders `TEMPLATES.PANEL_NOTES` with notes, filters, tags, scenes, cardTheme, viewMode; restores scroll; calls `activateListeners()`.

**Listeners**
- Search, tag filter, scene filter, visibility filter; new note (opens NotesForm); edit/view/delete per note; set journal, open journal; card theme and view mode toggles; pin placement (register note pin handlers); “Place on canvas” creates pin and updates page flags.

**Pin helpers (in panel-notes.js)**
- Pin creation/update/removal via Blacksmith `pins.create`, `pins.update`, etc.; payload includes `config.noteUuid`, ownership from `getNotePinOwnershipForPage(page)`; pin appearance from page flags or `getDefaultNotePinDesign()`.
- `createNotePinForPage`, `updateNotePinForPage`, `removeNotePinForPage`; `getNotePinOwnershipForPage` (merges page ownership with module rules).

### Blacksmith Pin Integration

- **Resolve ownership**: Hook `blacksmith.pins.resolveOwnership` returns `buildNoteOwnership(visibility, authorId)` for `moduleId === MODULE.ID`.
- **Sync pin → page**: Hooks `blacksmith.pins.created` and `blacksmith.pins.updated` update page flags (pinId, sceneId, x, y, noteIcon, pin appearance flags) and refresh the notes panel (with `suppressNotesPanelRoute` to avoid double refresh).
- **Pin creation**: From form “Place on canvas” or panel “Place on canvas”; uses `pins.getDefaultPinDesign('coffee-pub-squire')` with world fallback; ownership set so GM and allowed users can create/update.

## Settings and User Flags

| Setting | Key | Scope | Description |
|---------|-----|-------|-------------|
| Show Notes Tab | `showTabNotes` | user | Show/hide Notes tab on tray |
| Notes Journal | `notesJournal` | world | Journal for note pages |
| Notes window position | `notesWindowPosition` | user | Last position/size of NotesForm |

**User flags**
- `notesCardTheme` – Card theme (e.g. 'dark').
- `notesViewMode` – View mode (e.g. 'cards').

## Hooks Integration

**Blacksmith HookManager (squire.js)**
- **Journal:** `updateJournalEntryPage`, `createJournalEntryPage`, `deleteJournalEntryPage` route to `_routeToNotesPanel(page, …)` when the page is in the selected notes journal and has `noteType === 'sticky'`. Guarded by `suppressNotesPanelRoute` during pin sync. Panel runs `_refreshData()` and `codexPanel.render(panelManager.element)` (conceptually same for notes panel).
- **Blacksmith pins:** `blacksmith.pins.resolveOwnership`, `blacksmith.pins.created`, `blacksmith.pins.updated` as above.

## Data Flow

### Note creation
1. User clicks “New Note” → NotesForm opens (no page).
2. User edits content (ProseMirror), sets title, tags, visibility, optional icon.
3. On save: journal page created with flags; ownership set; optional pin created via Blacksmith.
4. Panel refresh → NotesParser runs on new page → note appears in list.

### Note edit
1. User clicks edit on a note card → NotesForm opens with `note` (pageUuid/pageId).
2. Form loads `this.page`; getData() configures collaborative ProseMirror (`document: page`, `fieldName: 'text.content'`).
3. On save: `page.update({ 'text.content', name, flags })`; pin updated if present; ownership synced.

### Pin creation/update
- “Place on canvas”: user picks position; `createNotePinForPage(page, sceneId, x, y)` builds payload (ownership, icon, appearance from page/defaults), calls Blacksmith `pins.create`; pin IDs and position stored in page flags.
- Blacksmith `pins.updated` / `pins.created` sync pin state back to page flags and refresh panel.

## Template Structure

- **Panel** (`panel-notes.hbs`): Toolbar (new note, refresh, set journal, open journal), filters (search, tags, scene, visibility), notes content (cards or list by viewMode).
- **Form** (`window-note.hbs`): Title, ProseMirror editor (or static content in view mode), metadata (tags, visibility, icon), actions (save, cancel, place on canvas, etc.). Uses `window-note-*` CSS classes.

## Technical Requirements

- FoundryVTT v13+
- D&D 5e system 5.5+
- Required: `coffee-pub-blacksmith` (for pins and hooks)

## Best Practices

- **Error handling**: Wrap pin create/update in try/catch so note save can succeed even if pin fails; notify user on pin failure.
- **Async content**: Resolve `page.text.content` when it may be a Promise (v13+).
- **Ownership**: Keep page ownership and pin ownership in sync with visibility (private: GM + author; party: GM + party).
- **Listeners**: Use clone-before-attach where panels re-render to avoid duplicate handlers.

## Future Enhancements (from TODO)

- Note templates, note linking, export formats, note sharing, note reactions, note mentions (see TODO.md).
