# Plan: splitting Squire

Working doc. Delete it when the split is done.

## The shape

Squire is two products sharing a bootstrap. Character/party is per-token, per-session, selection-driven, player-facing. Codex/quests/notes is campaign authoring: GM-facing, journal-backed, canvas-pinned, indifferent to which token is selected. They share almost no data and no lifecycle.

| Destination | Gets | Why |
|---|---|---|
| **Squire** (stays) | Character, party, tray, handle, transfer, compendium search, statblock repair, inventory/quantity | Everything driven by the selected token |
| **Librarian** (new) | Quests, codex, notes UI, pin adapter, journal parsers | Campaign content authoring — one coherent product |
| **Blacksmith** | Dice tray, HP window, macros, **note-binding service** | Primitives any module composes |

### The notes boundary

Notes split in two, and the seam is the point:

- **Blacksmith gets the service.** Bind a journal page to an arbitrary document uuid, resolve it back, manage its ownership. Cartographer wants notes on map drawings; Artificer wants notes on items. Nobody orchestrates that today, and orchestration is the hub's job.
- **Librarian gets the experience.** The notes panel, browsing, filtering, tag cloud, sort modes, the editor window. That's content authoring, and it sits beside codex and quests where the parsers and storage model already live.

The rule this follows: **Blacksmith owns primitives, not content types.** A note-binding service is a primitive. A notes panel is a content type.

## Evidence

37,122 lines of JS:

| Cluster | Lines | Share |
|---|---|---|
| Quest + Codex + Notes + pins + journal/parsers | 15,766 | **42%** |
| Character + party panels | 6,171 | 17% |
| Dice tray + macros + health | 2,075 | 6% |
| Bootstrap, tray, settings, helpers, transfer, compendium | ~13,000 | 35% |

Coupling is already thin. Every import in the six campaign files resolves to six shared modules — `helpers`, `const`, `timer-utils`, `utility-resolver`, `utility-journal`, `manager-pins`. **None import the tray.** `panel-codex.js` never references `PanelManager`; quest and notes reference it 2 and 3 times.

The dependency runs core → campaign, not the reverse:

- `manager-panel.js:17-19` imports NotesPanel, CodexPanel, QuestPanel to mount them
- `squire.js:6,8,21` imports QuestPanel, QuestParser, pin manager; lazily imports the three windows at 2036/2050/2061
- `manager-handle.js:3` imports QuestParser for the pinned quest on the handle

Three seams, all thin. The last one is the only genuine cross-product feature.

## Inventory

### Moves to Librarian

**Scripts** (15,766 lines): `panel-quest.js` (4137), `manager-pins.js` (2342), `panel-codex.js` (2061), `window-quest.js` (1701), `panel-notes.js` (1602), `window-codex.js` (1268), `window-note.js` (1144), `utility-journal.js` (569), `utility-quest-parser.js` (425), `utility-codex-parser.js` (260), `utility-notes-parser.js`, `utility-base-parser.js`, `data/codex-page-model.js`

**Templates**: `panel-{quest,codex,notes}.hbs`, `window-{quest,codex,note}.hbs`, `handle-{quest,codex,notes}.hbs`, `page-codex-fields-{edit,view}.hbs`, `tooltip-pin-quests-objective.hbs`

**Styles**: `panel-{quest,codex,notes}.css`, `window-{quest,codex,note}.css`, `quest-markers.css`, `notes-metadata-box.css`

**Settings**: `showTabNotes`, `showTabCodex`, `showTabQuests`, `notesPersistentJournal`, `notesGMJournal`, `notesSharedJournalPage`, `notesJournal`, `notesSortMode`, `notesWindowPosition`, `codexJournal`, `questJournal`, `questCategories`, `pinStrokeMigrationDone`, `pinSound`, `unpinSound`, and the three H3 headings

### Moves to Blacksmith

`panel-dicetray.js`, `window-dicetray.js`, `panel-macros.js`, `window-macros.js`, `panel-health.js`, `window-health.js` (2,075 lines), plus the note-binding primitives currently living inside `manager-pins.js`: `buildNoteOwnership()`, `syncNoteOwnership()`, and the edit-lock machinery (`getNoteEditLockInfo`, `clearNoteEditLocks`, the `editorIds` flag).

### Stays in Squire

Everything else. Note `manager-pins.js` leaves entirely — it is Squire's adapter over Blacksmith's pins API and every caller is campaign code.

## Contracts to design

Three, and only the first is hard.

1. **Handle pinned quest.** `manager-handle.js` reads `game.user`'s `pinnedQuests` flag and calls `QuestParser` to render a quest summary on the character handle. This is the only real character↔campaign feature. It becomes a read-only contract, Blacksmith-brokered since both modules depend on the hub anyway: Librarian publishes "the current user's pinned quest, rendered", Squire's handle consumes it and renders nothing if absent.

2. **Note binding.** Blacksmith exposes create/attach/resolve/ownership for a journal page bound to a document uuid. Librarian consumes it for its notes panel; Cartographer and Artificer consume it directly. This is a new API, not a move — design it with those three consumers in the room.

3. **Pins ownership.** Already a Blacksmith API. `manager-pins.js` moves to Librarian unchanged and keeps calling it.

## The real cost: flag namespace

Campaign data lives under `coffee-pub-squire.*` flags on journal pages, journal entries, pins, and users. Moving to a new module id puts all of it in the wrong namespace.

Flags written by campaign code:

`activeObjectives`, `authorId`, `codexCollapsedCategories`, `codexExpandedEntries`, `codexPinId`, `codexSceneId`, `codexTagCloudCollapsed`, `codexUuid`, `draft`, `editorIds`, `noteIcon`, `notesSortMode`, `originalCategory`, `pinId`, `pinnedQuests`, `questCardCollapsed`, `questCollapsedCategories`, `questIcon`, `questPins`, `questTagCloudCollapsed`, `questUuid`, `sceneId`, `tags`, `visibility`, `visible`, `x`, `y`

Two options, both bad on their own: read the old namespace forever (a vestigial switch at scale), or migrate every journal page and every pin in every existing world.

**So don't pay for it twice.** The TODO already carries a Critical item to rewrite quest storage — stable `questId`/`taskId`, structured flags instead of HTML parsing, new schema with migration. That is *already* a migration touching every quest in every world. Do it as part of the extraction: new module, new namespace, new schema, one migration, once.

## Sequence

**Phase 0 — make the boundary real inside Squire.** No new module, no user-visible change, fully reversible.

- Move campaign files under `scripts/campaign/`
- Route every core→campaign import through one barrel, so the surface is countable and visible in one file
- Remove the 5 `PanelManager` references in campaign code so nothing reaches back across the seam
- Put the handle's pinned-quest read behind a small interface instead of a direct `QuestParser` import

At the end of Phase 0 the extraction is a folder move plus a manifest. If it stalls here, Squire is still better organised than it was.

**Phase 1 — shared services to Blacksmith.** Dice tray, HP, macros. Cheap, no data migration, and it proves the cross-module pattern on something affordable to get wrong. Partly underway already: macro favorites are on the menubar, health registers `party-health`.

**Phase 2 — design the note-binding API.** Blacksmith-side, with Cartographer and Artificer's needs in scope, not just Squire's.

**Phase 3 — extract Librarian**, absorbing the quest persistence refactor. One migration for users.

## Open questions

- **Librarian vs Scribe.** Scribe exists and is under-developed. Reviving it beats minting a new id if its scope is compatible — worth reading before naming anything.
- **Does the tray keep campaign tabs?** Cleanest is no: Librarian owns its own windows, which it already has (`window-quest`, `window-codex`, `window-note` are standalone). But the quest tab in the tray is a habit for players, and dropping it is a real UX change.
- **Three modules to install.** Blacksmith is already required, so it's two-to-three. Worth a bundle story.
