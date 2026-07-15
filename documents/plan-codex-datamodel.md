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

### Phase 3 — Verification (in progress July 14, 2026)
- [x] Import creates typed pages; tray card reads `system`; Read More opens the journal reading view
- [x] Page sheet: view mode (field block + lore + TOC) and edit mode (fields, `string-tags` chips, ProseMirror lore editor)
- [x] Edit Entry window: prefill including lore, location combos, multi-link display, mandatory-field validation
- [ ] Export → JSON carries `summary`/`links`/`expandedDetails`; wipe → re-import round trip
- [ ] New-entry creation from a blank Edit Entry window (post-validation save path)
- [ ] Journal page edit form's links drop zone (drag to add, ✕ to remove)
- [ ] Auto-discovery scan: `system.discoveredBy` written, ownership flipped, Discovered By shows on card/page
- [ ] Player-permission pass: hidden entries invisible; discovered entries readable; plot hook GM-only; Read More works for players
- [ ] Codex pins on typed pages: place, unplace, double-click navigation
- [ ] New category creation with icon via Edit Entry window
- [ ] Console clean: no codex-attributed deprecation warnings or errors during the above

## Phase 4 — Related entries + resolve-later links (designed July 15, 2026; not built)

13.3.10 wired codex `links` to Blacksmith's `api.compendiums` resolver (plain-text name → UUID at import). Feeding it a real AI-authored codex surfaced two things.

**1. The AI's "mistake" is the feature.** Asked to link a "Phlan" entry, it emitted 22 links — 19 of which pointed at *other codex entries* (Moonsea, Valjevo Castle, Black Fist, Mantor's Library…). Every one of those is structurally unresolvable: `type: "journal"` resolves against `game.journal`, i.e. **JournalEntry documents**, while codex entries are `JournalEntryPage`s living inside one journal (`compendium-types.js:174` — `JournalEntry: () => game.journal`). The model wasn't over-linking; it was describing a **relationship graph** the schema has no field for. Phlan→Moonsea is the most valuable link in the entry and the one we can't express.

**2. Dropping unresolved names is wrong.** A codex is authored incrementally: "Moonsea" may not exist *yet*. Today an unresolved link is discarded at import (`resolveCodexLinks`) and at render (`panel-codex.js:1613`, `if (!link?.uuid) continue;`), so the stated relationship is destroyed and can never be recovered — the JSON is gone by then. Quest treasure already does the right thing (falls back to plain text); codex links are the outlier.

### Design

Two corpora, resolved at different times. Keeping them apart is what keeps this small.

**A. Codex-internal (`related` + `location` segments) — resolved at RENDER, nothing stored.**

- Build a `Map<normalizedName, pageUuid>` once per `_refreshData()` from `selectedJournal.pages`. The panel already caches parsed pages by uuid + `_stats.modifiedTime`, so one O(n) index pass is noise.
- **`related` is plain strings**: `"related": ["Moonsea", "Black Fist"]`. No `type` (they're all codex entries), no stored `uuid`. Renders as its own **Related** section — kept distinct from `links` ("documents this entry references") because it means "entries near this one in the story".
- **Location segments link through the same index.** Phlan's `location` is `"Faerûn > Moonsea > Phlan"` and the card already renders REALM/REGION/SITE/AREA rows; each segment becomes a link when a codex entry by that name exists. This is the precondition for the next bullet.
- **`related` is non-hierarchical only.** Because location now carries the hierarchy *as links*, Related must not repeat it — otherwise every entry duplicates its own path. Related is for Black Fist, Mantor's Library, Spanky, Goblin Caves.
- **Self-healing, and that's the whole trick.** A name with no page yet is a Map miss → renders as plain text → becomes a link the moment that entry is added. This satisfies "plain-text what isn't present but don't lose the relationship" **by not storing the answer**: no second pass, no import-ordering problem (Phlan may reference Moonsea before Moonsea exists), and no rescan for this corpus.
- Legitimately Squire's lookup: pages inside one journal are a corpus `api.compendiums` does not model and should not. Does not contradict the 13.3.10 rule (never search *compendiums* ourselves). Page UUIDs are ordinary links: `@UUID[JournalEntry.abc.JournalEntryPage.xyz]{Moonsea}`.

**B. Compendium documents (`links`) — resolved at IMPORT + RESCAN, uuid stored.**

- **Retain, don't drop**: `links` keeps `{ name, type, uuid? }` — `name`/`type` always, `uuid` once resolved. Resolved → enriched link; unresolved → plain text, same contract as quest treasure. Requires `linkList` (`codex-page-model.js:46`) to stop filtering uuid-less entries and the render guard at `panel-codex.js:1613` to render text instead of skipping.
- Can't resolve at render: it's a Blacksmith call across configured packs, far too expensive per-render, and it can't self-heal — hence the rescan.
- **`journal` links are now nearly vestigial.** Expanded Details carries the lore inline and `related` carries entry→entry, so a `journal` link only makes sense for a genuine standalone `JournalEntry` document. It is the type that produced all 19 dead links; the prompt should treat it as rare, not as the default for "lore and locations".

### Rescan tool ("auto-link")

Manual GM action. Crawls the codex and re-resolves unresolved `links` (corpus B only — A self-heals). Reuses the inventory auto-discovery progress-bar pattern (`panel-codex.js` — progress area, `_updateProgressBar`, `moduleDelay(100)` every 5 entries) and import's asserted/speculative miss reporting.

**Trigger: manual, prompted.** After an import, notify the GM that auto-linking is available and how many names are unresolved. Running it automatically is a future *option* — deliberately not the default, so the GM stays in control of a bulk write to journal pages. First step toward broader codex automation.

### Open questions

- **Backlinks**: symmetric or one-way? If Phlan lists Moonsea, Moonsea could gain Phlan for free — valuable, because the AI will not be consistent in both directions. Cheap under design A (the index is already bidirectional in memory — it can be a render-time union rather than a stored mutation), which is another argument for not storing `related`.
- **Prompt shape**: `related` as plain names; `links` restricted to documents that genuinely exist (actor/item/spell/feature/rolltable); `journal` demoted to rare. The current wording — *"`journal` for lore pages and locations"* — is what produced the 19 dead links and should be corrected regardless of when this phase lands.

## Out of scope (follow-on)

- **Notes** and **Quest** panels have the same HTML-as-database disease. Notes is the natural second adopter (similar field shape). Quest is last and largest (task states/progress live in HTML and are *edited* by rewriting it) — do it only once the codex pattern is proven.
- The 13.3.9 divider-format Expanded Details never accumulated content (confirmed) — it ships only as the Summary rename + Read more UX, and its HTML-storage half is superseded by this plan.
