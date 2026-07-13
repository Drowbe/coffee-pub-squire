# Plan: Codex Data Model — Custom JournalEntryPage Subtype

**Status:** Planned (not started)
**Reference:** [Module Sub-Types](https://foundryvtt.com/article/module-sub-types/) | [JournalEntryPage API v13](https://foundryvtt.com/api/v13/classes/foundry.documents.JournalEntryPage.html)

## Why

Today the codex's database is journal page HTML: `<p><strong>Field:</strong> value</p>` lines scraped back out by `CodexParser` on every refresh. ProseMirror rewrites that HTML on every manual save, so one hand-edit can silently break an entry's fields. The parser, the import's DOM surgery, the Edit window's HTML generation, and the 13.3.7 parse cache all exist to serve this fragility.

The correct architecture is a **module-defined JournalEntryPage subtype** with a real DataModel: fields live in `page.system` with schema validation; the page renders through a custom sheet; nothing is ever parsed.

## Target Architecture

### Document type

- `module.json` gains:
  ```json
  "documentTypes": { "JournalEntryPage": { "codex": {} } }
  ```
  The resulting type string is `coffee-pub-squire.codex` (auto-prefixed).
- Localization key: `TYPES.JournalEntryPage.coffee-pub-squire.codex` → "Codex Entry".

### Data model (`scripts/data/codex-page-model.js`)

`class CodexPageModel extends foundry.abstract.TypeDataModel`, registered at `init`:
`CONFIG.JournalEntryPage.dataModels['coffee-pub-squire.codex'] = CodexPageModel;`

| Field | Type | Notes |
|-------|------|-------|
| `summary` | StringField | The bite-size card text (was "Description") |
| `category` | StringField | Grouping key |
| `categoryIcon` | StringField | FA icon class |
| `plotHook` | StringField | GM-only in tray |
| `location` | StringField | `A > B > C` convention |
| `link` | SchemaField `{ uuid: DocumentUUIDField, label: StringField }` | Nullable |
| `tags` | ArrayField(StringField) | |
| `img` | FilePathField (categories: IMAGE) | Card/page image |
| `discoveredBy` | ArrayField(StringField) | Replaces the "Discovered By:" HTML paragraph |

**Expanded Details lives in `page.text.content`** — the base page schema's native text field (present on every page type). This keeps ProseMirror editing, Foundry's journal text search indexing, and `@UUID` enrichment all first-class, with zero custom storage. With fields in `system`, the text content is *pure* expanded details — no field block, no divider markers, nothing to parse. `hasExpandedDetails` = non-empty `page.text.content`.

### Sheet (`scripts/sheets/codex-page-sheet.js`)

Custom page sheet registered via `DocumentSheetConfig.registerSheet(JournalEntryPage, MODULE.ID, CodexPageSheet, { types: ['coffee-pub-squire.codex'], makeDefault: true })`.

- **View mode:** styled field block (image, summary, plot hook [GM], location, link, tags, discovered-by) followed by the rendered expanded-details text. This is what "Read more" opens — it should look *good*, not like scraped paragraphs.
- **Edit mode:** form inputs for the system fields + a ProseMirror editor bound to `text.content` for expanded details.
- v13 journal sheets are ApplicationV2-based — verify the current base class (`JournalEntryPageHandlebarsSheet` vs legacy `JournalPageSheet`) against the v13 API during implementation and follow the modern one.

### Consumers simplified

| Consumer | Today | After |
|----------|-------|-------|
| `CodexPanel._refreshData()` | enrich + parse HTML per page (w/ cache) | read `page.system` directly; enrich only `summary` if links are wanted in the card. The 13.3.7 parse cache becomes unnecessary for typed pages |
| Import | DOM surgery on page HTML | write `system` + `text.content`; JSON schema unchanged from 13.3.9 (`summary`, `expandedDetails`, legacy `description` accepted) |
| Export | re-derive from parsed entries + raw splits | serialize `page.system` + `page.text.content` |
| Edit Entry window | `_generateJournalContent()` HTML builder | update `system` directly; delete the HTML builder |
| Auto-discovery | HTML paragraph injection for "Discovered By" | push names into `system.discoveredBy` |
| Pins | `codexUuid`/`pinId` flags on page | unchanged (UUID-keyed) |
| `CodexParser` | runtime dependency | demoted to migration-only legacy reader |

## Migration: none (decision)

**Existing codex content will be re-imported and re-pinned manually** — no automated migration, no in-place type-conversion spike, no pin remapping or `@UUID` rewrite sweeps. This removes the plan's largest risk and effort entirely. Consequences the implementation must honor:

- **Import creates typed pages.** When the upsert match (by `codexUuid` flag or name) finds a legacy `text` page, it **replaces** it — delete the old page, create a typed page — since a text page cannot simply receive `system` data. This makes re-import itself the conversion path.
- **Old export JSON keeps working.** The JSON schema (`summary` + optional `expandedDetails`, legacy `description` accepted) imports unchanged into typed pages: fields → `system`, `expandedDetails` → `text.content`. In practice the expanded content will come from fresh AI-generated imports (the `prompt-codex.txt` template already teaches `expandedDetails`) — **no world content exists in the 13.3.9 divider format**, so nothing needs `splitExpandedDetails` at export time and that helper can be deleted along with the rest of the parsing machinery.
- **The panel reads typed pages only.** Legacy text pages in the codex journal are ignored, with a one-time GM notice ("N legacy codex pages found — re-import to convert").
- Replaced pages get new UUIDs — acceptable per the decision: pins are being re-placed and any hand-made `@UUID` links to codex pages will need re-linking.
- **Interim-format guidance:** until the data model lands, do not author Expanded Details in the 13.3.9 divider format — the Summary rename and Read more UX carry forward, but divider-stored lore would just become content to re-enter.

## Phases

### Phase 1 — Model + Sheet **(implemented July 13, 2026 — pending in-game verification)**
- [x] Confirmed v13 base: `foundry.applications.sheets.journal.JournalEntryPageTextSheet` (AppV2, `VIEW_PARTS`/`EDIT_PARTS`) — extending the text sheet keeps stock ProseMirror editing for `text.content`
- [x] `documentTypes` in module.json; `TYPES.JournalEntryPage.coffee-pub-squire.codex` localization
- [x] `CodexPageModel` (`scripts/data/codex-page-model.js`) + registration at `init` (dataModels + `DocumentSheetConfig.registerSheet`, makeDefault)
- [x] `CodexPageSheet` (`scripts/sheets/codex-page-sheet.js`) with `codexFields` part prepended to the text sheet's view/edit parts; templates `page-codex-fields-view/edit.hbs`; styles in panel-codex.css
- [ ] Verify "Add Page" type picker shows "Codex Entry" and creates with sane defaults (in-game)

Model decisions: `img` and `link.uuid` are lenient `StringField`s (not `FilePathField`/`DocumentUUIDField`) so imported data with external URLs or dangling UUIDs can't fail schema validation; `hasExpandedDetails`/`linkData` are model getters.

### Phase 2 — Consumers **(implemented July 13, 2026 — pending in-game verification)**
- [x] `_refreshData()` reads `page.system` (typed pages only + one-time legacy-page GM notice); codex page-parse cache removed (system reads are cheap)
- [x] Edit Entry window: prefills from `system` for typed pages, saves `{ name, system }` only (never touches `text.content`); `_generateJournalContent` deleted; refuses to save over a legacy page (directs to re-import)
- [x] Import creates typed pages; legacy text page matched by name/codexUuid → **replaced** with a typed page (ownership + sort preserved); `expandedDetails` → `text.content` (present replaces, absent preserves)
- [x] Export serializes the clean schema; `expandedDetails` = raw `page.text.content`
- [x] Auto-discovery merges into `system.discoveredBy` (HTML paragraph injection deleted)
- [x] Read more opens the typed page sheet (no change needed)

### Phase 3 — Verification
- [ ] Round-trip: create typed entry via Edit window → tray card → Read more → journal sheet → export → wipe → import
- [ ] Re-import the real campaign's exported codex JSON; re-pin a sample; verify hidden/discovered defaults, categories, tags
- [ ] Player-permission pass: hidden entries invisible; discovered entries readable; plot hook GM-only
- [ ] Legacy text pages in the journal: ignored cleanly with the GM notice, no errors

## Out of scope (follow-on)

- **Notes** and **Quest** panels have the same HTML-as-database disease. Notes is the natural second adopter (similar field shape). Quest is last and largest (task states/progress live in HTML and are *edited* by rewriting it) — do it only once the codex pattern is proven.
- The 13.3.9 divider-format Expanded Details never accumulated content (confirmed) — it ships only as the Summary rename + Read more UX, and its HTML-storage half is superseded by this plan.
