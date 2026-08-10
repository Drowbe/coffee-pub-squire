# Plan: splitting Squire

Working doc. Delete it when the split is done.

## Progress

**Phase 0 — campaign content out of the tray: DONE (13.5.4, unreleased).**

- `campaign-panels.js` registry replaces 21 `PanelManager` reach-throughs across 8 files. Campaign code asks for a *kind*; the host supplies the element and defines what "reveal" means.
- The one genuine campaign→character call is now `requestHandleRefresh()` — the handle's pinned-quest contract, and the line that becomes cross-module later.
- Panel stylesheets re-keyed from `.squire-tray[data-position="left"]` to `.squire-panel-host[data-position="left"]` (304 rules, one exact prefix, specificity preserved). Both hosts carry the class.
- `window-campaign-browser.js` — one parametrised V2 window hosting all three panels.
- Menubar launchers in the **middle** zone, `campaign` group.
- Tray tabs, `showTab*` settings, view-mode entries, and the three `handle-*.hbs` partials removed.

**Phase 1 — shared services to Blacksmith: DONE.** Blacksmith pulled the Dice Tray, Macros, and Health windows in and verified them live with Squire disabled; Squire then deleted its copies. ~2,000 lines of wiring went with them, including the window-reattach block in `PanelManager`. Health severity is now Blacksmith's, consumed through `getHealthSeverityForHP()` and mapped to Squire's classes locally.

Worth carrying forward: Blacksmith pulled rather than Squire pushing. That is the better shape for the rest of the split — the receiving module decides the form the code takes in its own codebase, and the sending module's job is to answer questions and then delete.

**Next:** import/export to Blacksmith (unblocks the note in `helpers.js`), then Librarian.

## Corrections to earlier versions of this doc

Both were wrong in the same direction — they made the job look smaller than it is.

1. **"The tray panels are legacy surface and can be deleted."** They are not. `panel-quest.js`, `panel-codex.js`, and `panel-notes.js` hold the browse experience *and* most of the product: import/export dialogs, pin placement and configuration, objective state, quest status, visibility, category management, notifications. The V2 windows (`window-quest`, `window-codex`, `window-note`) are **single-entry editors** — `QuestWindow` binds one `pageUuid` and has `isEditing`. Librarian inherits essentially the full 15,766 lines, not 8,000.

2. **"The journal substrate needs a merge with Blacksmith's."** It does not. Blacksmith's `manager-journal-tools.js` upgrades entity links to compendium UUIDs and `parsers/parse-journal-area.js` builds page HTML from JSON — both *write* side. Squire's `utility-journal.js` reads and renders pages with permission awareness, and `utility-base-parser.js` reads structured data back out of page HTML. Opposite directions, zero overlap. That piece is a move, not a reconciliation.

## The shape

Squire is two products sharing a bootstrap. Character/party is per-token, per-session, selection-driven, player-facing. Codex/quests/notes is campaign authoring: GM-facing, journal-backed, canvas-pinned, indifferent to which token is selected.

| Destination | Gets |
|---|---|
| **Squire** (stays) | Character, party, tray, handle, transfer, compendium search, statblock repair, inventory/quantity |
| **coffee-pub-librarian** (new) | Quests, codex, parsers, whatever survives of the pin adapter |
| **Blacksmith** | Dice tray, HP window, macros, status effects, **all import/export**, **Notes**, notification watcher |

Decisions taken:

- **Notes go to Blacksmith. Codex and Quests go to Librarian.** Decided 2026-08-09, reversing the earlier "notes with codex" position recorded here.

  The discriminator is **document subtype ownership**, not content-vs-primitive: owning a subtype means owning a domain; a surface over core documents does not. Codex declares `coffee-pub-squire.codex` with its own data model and sheet — a kind of thing. Notes writes plain `type: 'text'` pages and declares nothing — a view. Pins, Tags and GM Notes are all views over core documents, all already in Blacksmith, none declaring a subtype.

  That line is sharper than the one this doc previously argued from, and it makes "Blacksmith declares no document subtypes, ever" a rule rather than an accident — which the import/export phase depends on.

- **Notes is not a straight port, so don't plan around one.** Blacksmith's `GMNotesAPI` already attaches rich text to any Document by UUID with a per-module section registry. Squire's Notes is the opposite direction: the note is a document that references targets. Shipping both would give the hub two overlapping annotation layers. The intended shape is one relationship with several views — note as document, annotation as a link to a target, gmNotes as "notes about this thing", pins as "note on the canvas". Cartographer's hand-rolled freehand-plus-tooltip system is the third anchor: document, canvas point, map region.

  **The gate, which is the author's:** if Notes is a fancy journal it should not ship — Foundry journals are already better at narrative and GM authoring. The value has to be the relationship, and the test is whether any surface can ask *what is attached to this thing* and get an answer.
- **Blacksmith owns import and export of all data.** This unblocks something already waiting: `helpers.js` says Squire's two complex JSON-import surfaces are "blocked on the public Blacksmith Importer API". So `_openImportQuestsDialog` / `_openExportQuestsDialog` and `window-data-export.js` go to Blacksmith, not Librarian. The *parsers* stay with Librarian — import is JSON→page, parsing is page→data.
- **Campaign content gets its own windows and does not appear in the tray.** Done as of Phase 0.
- **`manager-pins.js` — most of it stops existing.** It was going to Librarian as a 2,325-line adapter. Under the annotation model, pins become one view of the same relationship, so the wrapper largely dissolves rather than moving. Librarian takes whatever is genuinely quest/codex-specific and no more. **Do not port it wholesale.**

- **`utility-base-parser.js` stays in Squire for now.** An earlier version of this doc had it hoisted to Blacksmith with the journal helpers; that is withdrawn. It is shared by Notes and Codex today, and if Notes converges on an annotation model it may not survive at all — in which case Librarian simply takes it. Leave it until the Notes shape settles.

## Evidence

37,122 lines of JS:

| Cluster | Lines | Share |
|---|---|---|
| Quest + Codex + Notes + pins + journal/parsers | 15,766 | **42%** |
| Character + party panels | 6,171 | 17% |
| Dice tray + macros + health | 2,075 | 6% |
| Bootstrap, tray, settings, helpers, transfer, compendium | ~13,000 | 35% |

## The Blacksmith ask, sized

Blacksmith is 90,848 lines and already owns `api-pins`/`manager-pins`/`pins-renderer`/`pins-schema`, `api-gmnotes`/`manager-gmnotes`, `manager-journal-tools`, `api-toast`, `api-tags`, a `parsers/` folder, and `registry-json-import-*`.

| Piece | LOE | Confidence |
|---|---|---|
| Note binding — `api-gmnotes` already does per-module sections with a merge policy; the question is generalise-vs-sibling, not build | M, design-dominated | Medium |
| Pin adapter | **not in the ask** | High |
| Journal helpers + base parser — no overlap, straight move | S | High |
| Notification watcher — 335 lines spanning quest/codex/notes/effects; `api-toast` + HookManager already there | S | High |
| Import/export surfaces | M | Medium |

## The codex page subtype

Squire declares a document subtype — `documentTypes: { JournalEntryPage: { codex: {} } }` in the manifest, with the data model and sheet registered at `squire.js:1880`. Every codex entry is stored as `type: "coffee-pub-squire.codex"`.

Disable Squire and every codex page fails validation at load, one console error each. The pages are intact — refused, not damaged — and reload normally when Squire is re-enabled. Quest and note pages are ordinary journal pages, so codex is the only content carrying this.

**This is louder than the flag namespace and needs different handling.** A flag under a dead namespace is ignored; a `type` under a dead namespace refuses to initialise. And Librarian cannot fix it after the fact — at that point the pages don't load for it to touch.

**What makes it cheap: there is exactly one world using codex — the author's.** No installed base to protect, so:

- Librarian declares `coffee-pub-librarian.codex` from day one. No dual declaration, no compatibility window, no reading both namespaces forever.
- Migration is a one-time GM macro over that world, not a shipped migration path.
- **Update the type in place; do not delete and recreate.** `DocumentTypeField` carries no `readonly` flag, so `page.update()` can change `type` — and page ids, and therefore UUIDs, survive. That matters because codex pins reference pages by `codexUuid`; recreating pages would orphan every pin on every scene.
- Write `type` and `system` in the same update, reading the existing `system` first. A subtype change can otherwise reset system data to the new model's defaults.

Sequence it as: Librarian ships declaring the new subtype → run the macro once with both modules enabled → Squire's declaration comes out in its next release.

## The real cost: flag namespace

Campaign data lives under `coffee-pub-squire.*` on journal pages, entries, pins, and users:

`activeObjectives`, `authorId`, `codexCollapsedCategories`, `codexExpandedEntries`, `codexPinId`, `codexSceneId`, `codexTagCloudCollapsed`, `codexUuid`, `draft`, `editorIds`, `noteIcon`, `notesSortMode`, `originalCategory`, `pinId`, `pinnedQuests`, `questCardCollapsed`, `questCollapsedCategories`, `questIcon`, `questPins`, `questTagCloudCollapsed`, `questUuid`, `sceneId`, `tags`, `visibility`, `visible`, `x`, `y`

**Don't pay for it twice.** The Critical TODO to rewrite quest storage — stable `questId`/`taskId`, structured flags instead of HTML parsing — is *already* a migration over every quest in every world. Do it as part of the extraction: new module, new namespace, new schema, one migration.

## Sequence

1. ~~**Phase 0** — campaign content out of the tray, internal boundary made real.~~ **Done.**
2. ~~**Shared services to Blacksmith** — dice tray, HP, macros.~~ **Done.** The add → verify → remove order held up; worth repeating.
3. **Import/export to Blacksmith** — unblocks the note in `helpers.js`.
4. **Notes → Blacksmith** — Blacksmith-led, design pass first. They will send the API shape before writing the port, since Librarian may want to reference notes.
5. **Stand up `coffee-pub-librarian`** — Codex and Quests, which leave Squire whole, absorbing the quest persistence refactor, the flag namespace, and the codex subtype migration together.

Librarian and Notes run in parallel and do not collide: Librarian's first work is Codex and Quests; Notes needs a design pass in Blacksmith before any code moves.

## Open questions

- **Librarian vs Scribe.** Scribe exists and is under-developed. Worth reading before minting a new id.
- **Pin taxonomy across two modules.** Blacksmith registers pin types per module. Confirm before step 5 that quest/codex pins registered by Librarian and any pins still registered by Squire coexist cleanly on one scene.
- **Three modules to install.** Blacksmith is already required, so it's two-to-three. Worth a bundle story.
