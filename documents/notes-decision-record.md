# Decision Record: Notes v1 Storage, Visibility, and Pin Strategy

Date: 2024-12-19
Status: Accepted

## Decision 1: Storage Model
We will store Notes as JournalEntryPages inside a dedicated "Player Notes" journal.
- Notes are identified by `flags[MODULE.ID].noteType === 'sticky'`.
- The journal is a container; each page is the note.
- Regular journal pages in the notes journal (without `noteType === 'sticky'`) are ignored by the Notes system.

Rationale:
- Reuses Foundry's native permissions and UI.
- Lowest implementation risk for v1.
- Allows GMs to use the same journal for other purposes if needed.

## Decision 2: Visibility and Permissions
We will enforce visibility via per-page ownership, not client-only filtering.
- Private notes are visible only to the author and GM.
- Party notes are visible to all players (Observer or better).

Implementation:
- Journal ownership: All Players = Observer (allows players to create pages).
- Page ownership for party notes: author = Owner, all other players = Observer.
- Page ownership for private notes: author = Owner, all other players = None, GM = Owner (inherited from journal).
- Ownership is set programmatically when notes are created/updated.

Rationale:
- True privacy, avoids "security by UI."
- Leverages Foundry's native permission system.
- GMs can always see all notes (useful for moderation).

## Decision 3: Source of Truth
Flags are authoritative; HTML contains only note content.
- All metadata (tags, scene, location, visibility, author, timestamp) is stored in flags.
- HTML contains only the note content (markdown/rich text).
- Parser is NOT used for metadata extraction from HTML; only for content rendering.
- Editing metadata happens only via NotesForm / custom sheet UI.

Rationale:
- Avoids dual-source drift and fragile HTML parsing.
- Ensures consistency between flags and display.
- Simplifies data model (single source of truth).

## Decision 4: Metadata Storage Location
All note metadata is stored in flags, not in HTML.
- `flags[MODULE.ID].tags` - Array of tag strings
- `flags[MODULE.ID].visibility` - 'private' or 'party'
- `flags[MODULE.ID].sceneId` - Scene UUID if pinned (null if not pinned)
- `flags[MODULE.ID].x` - Canvas X coordinate (null if not pinned)
- `flags[MODULE.ID].y` - Canvas Y coordinate (null if not pinned)
- `flags[MODULE.ID].authorId` - User ID who created the note
- `flags[MODULE.ID].timestamp` - ISO timestamp string
- `flags[MODULE.ID].noteType` - 'sticky' (identifies this as a note)

Rationale:
- Single source of truth in flags.
- Easy to query and filter.
- No parsing required for metadata.

## Decision 5: Note Content Structure
Note content is stored as markdown/HTML in the journal page text content.
- HTML contains only the note body text (no metadata).
- Images are embedded via `<img>` tags with relative paths.
- Content is enriched using FoundryVTT's TextEditor for display.
- Parser is used only for content rendering, not metadata extraction.

Rationale:
- Human-readable and editable in journal sheets.
- Works with FoundryVTT's enrichment system.
- Separates content from metadata.

## Decision 6: Image Storage
Images are stored as part of the journal page content.
- Images are embedded in HTML via `<img>` tags.
- Image paths are relative to FoundryVTT data directory.
- Images are uploaded to a module-owned folder or user-specific folder.
- No separate image management system needed.

Rationale:
- Simple implementation using FoundryVTT's file system.
- Images are part of the journal entry (portable).
- No additional database or storage layer needed.

## Decision 7: Pin Strategy
Notes use Blacksmith Pin API (if available).
Quests continue using existing `canvas.squirePins`.
- Coexistence is intentional; cross-links are handled via UUID references.
- If Blacksmith Pin API is not available, Notes work without canvas pinning.
- Pin metadata (x, y, sceneId) is stored in note flags for reference.

Rationale:
- Avoids refactor risk for Quest pins while Notes ships.
- Allows Notes to ship independently of Blacksmith API availability.
- Graceful degradation if Blacksmith is not loaded.

## Decision 8: notesJournal Setting
`notesJournal` is world-scoped and required.
- If unset, note creation prompts the GM to select/create a journal.
- Players can create notes only if they have access to that journal (Observer or better).
- If the selected journal is deleted, GM is prompted to select a new one.
- Journal selection is handled via settings UI (config true).

Rationale:
- Ensures a reliable container and avoids silent failures.
- Clear user experience for journal management.
- Prevents orphaned notes.

## Decision 9: Note Identification
Notes are identified by `flags[MODULE.ID].noteType === 'sticky'`.
- Parser checks this flag before processing a page.
- Pages without this flag are ignored by the Notes system.
- This allows the notes journal to contain regular journal pages if needed.

Rationale:
- Clear identification without relying on journal name or structure.
- Flexible - journal can contain other content.
- Easy to filter and query.

## Decision 10: Parser Usage
Parser is used for content rendering only, not metadata extraction.
- NotesParser extracts content from HTML for display.
- Metadata comes directly from flags (no parsing needed).
- Parser handles markdown/HTML enrichment for display.
- Parser is NOT used to extract tags, scene, location, etc. from HTML.

Rationale:
- Aligns with Decision 3 (flags are authoritative).
- Simpler parser implementation.
- No risk of HTML/flag mismatch.

## Follow-ups
- Add a "Notes Metadata" sheet section to edit flags (future enhancement).
- Add a migration note if v2 moves to a custom document.
- Document flag structure in code comments.
- Consider flag validation on note creation/update.
