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
| **coffee-pub-librarian** (new) | Quests, codex, **notes**, pin adapter, journal utils, parsers |
| **Blacksmith** | Dice tray, HP window, macros, **all import/export**, note-binding service, notification watcher |

Decisions taken:

- **Notes go to Librarian**, not Blacksmith. What goes to Blacksmith is note *binding* — attach a journal page to any document uuid, resolve it, own its permissions — because Cartographer wants notes on drawings and Artificer wants notes on items, and nobody orchestrates that today. Blacksmith owns primitives; Librarian owns the reading and authoring experience.
- **Blacksmith owns import and export of all data.** This unblocks something already waiting: `helpers.js` says Squire's two complex JSON-import surfaces are "blocked on the public Blacksmith Importer API". So `_openImportQuestsDialog` / `_openExportQuestsDialog` and `window-data-export.js` go to Blacksmith, not Librarian. The *parsers* stay with Librarian — import is JSON→page, parsing is page→data.
- **Campaign content gets its own windows and does not appear in the tray.** Done as of Phase 0.
- **`manager-pins.js` goes to Librarian, not Blacksmith.** Blacksmith already owns pins; Squire's 2,342 lines are an adapter, and every caller is campaign code.

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

## The real cost: flag namespace

Campaign data lives under `coffee-pub-squire.*` on journal pages, entries, pins, and users:

`activeObjectives`, `authorId`, `codexCollapsedCategories`, `codexExpandedEntries`, `codexPinId`, `codexSceneId`, `codexTagCloudCollapsed`, `codexUuid`, `draft`, `editorIds`, `noteIcon`, `notesSortMode`, `originalCategory`, `pinId`, `pinnedQuests`, `questCardCollapsed`, `questCollapsedCategories`, `questIcon`, `questPins`, `questTagCloudCollapsed`, `questUuid`, `sceneId`, `tags`, `visibility`, `visible`, `x`, `y`

**Don't pay for it twice.** The Critical TODO to rewrite quest storage — stable `questId`/`taskId`, structured flags instead of HTML parsing — is *already* a migration over every quest in every world. Do it as part of the extraction: new module, new namespace, new schema, one migration.

## Sequence

1. ~~**Phase 0** — campaign content out of the tray, internal boundary made real.~~ **Done.**
2. ~~**Shared services to Blacksmith** — dice tray, HP, macros.~~ **Done.** The add → verify → remove order held up; worth repeating.
3. **Import/export to Blacksmith** — unblocks the note in `helpers.js`.
4. **Design the note-binding API** — with Cartographer's and Artificer's needs in scope, not just Squire's.
5. **Stand up `coffee-pub-librarian`** — windows, panels, parsers, journal utils, pin adapter, absorbing the quest persistence refactor and the namespace migration together.

## Open questions

- **Librarian vs Scribe.** Scribe exists and is under-developed. Worth reading before minting a new id.
- **Pin taxonomy across two modules.** Blacksmith registers pin types per module. Confirm before step 5 that quest/codex pins registered by Librarian and any pins still registered by Squire coexist cleanly on one scene.
- **Three modules to install.** Blacksmith is already required, so it's two-to-three. Worth a bundle story.
