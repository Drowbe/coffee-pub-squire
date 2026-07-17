# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [13.3.15]

### Added
- **Quest menubar notifications are clickable**: Blacksmith 13.9.3 lets menubar notifications carry an `onClick`, and every quest notification now uses it. Clicking the persistent pinned-quest or active-objective notification opens the quest panel and scrolls to that quest — highlighting the specific objective for the objective tracker; the transient "objective completed" / "quest completed" toasts jump to their quest too, and quest-completed pulses for attention. The navigation is the same flow the canvas pin double-click has always used, now extracted into `focusQuestInPanel()` in `manager-pins.js` so both callers share one implementation (filter fallback, expand, scroll, highlight) instead of growing a second copy. The persistent notifications' handlers are set once at creation and deliberately **not** passed to `updateNotification` — instead they resolve the pinned quest / active objective from user flags at click time, so the text-only updates that swap which quest is tracked can never leave the handler pointing at the old one. Clicking removes the notification (Blacksmith behavior), and dismissal via timeout or the × now fires `onDismiss` — both paths null the stored static notification ID, which fixes a small pre-existing wart: closing the tracker with the × left a stale ID that the next update call had to trip over (a warning-and-recreate path) before recovering. Requires Blacksmith 13.9.3; on older builds the extra options argument is simply ignored and everything behaves as before.
- **Transient notifications for party-visible events** (new `manager-notifications.js`): short-lived menubar toasts now announce the moments the party cares about — a quest becoming active, available, completed (pulses), or failed; an objective completed, failed, reopened, or newly revealed (all linked: click jumps to the quest, highlighting the objective); a codex entry unlocked, i.e. its ownership raised to Observer (linked to the entry; a burst of unlocks from auto-discover collapses into one "*N* codex entries unlocked" toast instead of a barrage); an active effect landing on an actor you own (no link — there's nothing to open); and a party-visible note being edited (linked via the notes panel's existing `showNote`). The initiating user is always skipped — the GM who clicked the checkbox already got the local notification the panel has always shown; these toasts are for everyone *else*, riding the document hooks that broadcast the change to every client. Status changes need a before-state that update hooks don't carry, so quest statuses/objective states and codex visibility are snapshotted once at ready and diffed per update; pages first seen later enter the baseline silently. Player-facing guards: no toasts for quests flagged invisible, hidden objectives, private notes, or objectives *becoming* hidden (GM housekeeping). The codex pin double-click navigation moved to `focusCodexInPanel()` in manager-pins.js so pins and notifications share it, same as `focusQuestInPanel()`.
- **GM pins and active objectives now reach the players**: pinning a quest or setting an active objective as the GM changed nothing on any player's screen, which defeats the point of a party-wide quest tracker. Both are stored as per-user flags, so the GM's write only ever landed on the GM's own User document — no player tray, handle, or menubar notification could see it, and no hook existed to tell them anyway. Two halves fix it: the GM's pin/active/clear actions now mirror the flag onto every player's User document (`_mirrorTrackerFlagToPlayers` — GMs can write User documents; players' own pin actions stay local), and a new `updateUser` hook on each player's client reacts when *their* document is changed by *someone else* — the same asked-the-world pattern as the ownership hook, including the operator-prefix diff-key handling. The hook lifts the ×-dismissal suppression for whichever tracker actually changed (a GM broadcast is as deliberate as a local repin), explicitly clears an emptied tracker (the notify paths only create or update), re-renders the quest panel if it has rendered — or drives the notifications directly if the tab is still lazy, via the newly extracted `_checkAndNotifyActiveObjective()` — and refreshes the handle. Bonus: the GM hiding a quest already cleared player pin flags (`_unpinHiddenQuestFromPlayers`), but players never found out until reload; the same hook now picks that up too.
- **Dismissing a quest tracker notification now sticks**: previously the persistent pinned-quest and active-objective notifications came back on the next panel refresh no matter how the user got rid of them — any objective change re-ran the render-path notify and recreated what the user had just closed. The × is now remembered for the session (a static `…Dismissed` flag set in `onDismiss`, checked before recreating), and only a deliberate act lifts it: repinning a quest clears the pinned-quest suppression, setting an active objective clears the objective suppression. Clicking the notification body is *not* treated as dismissal — that's navigation, and the tracker returning on the next update is the point of a persistent tracker. A reload clears both flags, so the notifications reappear next session as before.

### Added
- **Drag items out of the character tray**: inventory, weapons, spells, features, and favorites are now draggable — to chat, a journal page, a Squire note, the hotbar, another actor's sheet, or any of Squire's own drop zones (codex links, quest participants and treasure, favorites). Nothing in Foundry drags unless it is explicitly wired to, and the tray never was: no `draggable` attribute, no `dragstart` handler. The payload is `item.toDragData()` — the canonical `{type, uuid, data}` shape every Foundry drop target already understands, rather than a hand-rolled object that would rot the moment core changed. The row carries `draggable="true"` in the template so it survives a re-render for free, and a single delegated `dragstart` on the stable tray root supplies the payload — bound once rather than per item per render, which is the pattern that keeps leaving handlers attached to markup that no longer exists.

- **Show a pinned codex entry on the canvas**: a codex entry pinned to the scene you're viewing now shows a crosshairs button that pans and pings its pin — the same control the Notes list gained. Available to players, not just GMs: the panel only shows an entry to someone who can observe it, and the pin inherits that ownership, so if they can see the card they can see the pin. `panTo` now lives in `manager-pins.js` (`panToPin()`) and both panels call it, rather than each reaching into the pins API themselves — that file is meant to be the single gateway, and this was about to become the third hand-rolled copy. `panToPin()` verifies the pin is on the scene you're actually viewing instead of trusting the caller, and says which scene it's on if not.

### Changed
- **Notes rows: a `...` menu instead of five buttons**: Give, Edit, and Delete move into a per-note `...` menu (the same Blacksmith context menu the codex entries and titlebars use), leaving the row as `[Show on Canvas] [Pin/Unpin] [...]`. Pin/Unpin is a single toggle again, exactly as before. "Give Note To..." only appears for a private note you author (or any private note, if you're the GM) — the same rule the old inline button used, now computed once in the note data instead of nested in the template, so the control and the menu can't disagree.

### Fixed
- **Handle condition click shows its icon and description again**: clicking a status icon in the tray handle produced a dialog with a broken image and "No description available." Two independent breaks, one dialog. The image read `event.currentTarget.src` — correct when each icon had its own listener, but the v13 refactor moved the handler to a delegated listener on the handle container, where `currentTarget` *is* the container div and `.src` is undefined; the src now comes from the clicked `<img>` itself. The description matched conditions on `condition.label`, a field dnd5e 4+ renamed to `name` (pre-localized at i18nInit), so the lookup matched nothing and the rules-journal reference was never followed; the match now checks `name` with a `label` fallback for older systems. The same rename had also silenced a dormant fallback: the handle icon map read `conditionTypes[...]?.icon`, which dnd5e renamed to `img`. The description is also readable now: it prefers the rule page's short `system.tooltip` over the full article (for pseudo-conditions like Diseased the referenced article is DM lore about plagues as plot devices, not a stat blurb — that's what dnd5e links to, so the tooltip is the sane cut), runs the text through `enrichHTML` so `&Reference[...]` and `@UUID[...]` render as proper reference chips and content links instead of raw enricher syntax, and drops the newline-split `<p>` re-wrapping that was mangling what is already paragraph HTML.
- **Codex and notes pin state no longer describes the scene you just left**: the "Show on Canvas" button, the pin icon's active/dim state, and the "pinned on *scene*" tooltip are all computed when the panel refreshes — and nothing refreshed those panels on a scene change. `canvasReady` only re-rendered the character panel, and the tray rebuild it calls first returns early whenever the current actor has a token on the new scene (the common case), so it couldn't be relied on. The stale control was live: clicking "Show on Canvas" for a pin left behind on the previous scene panned the *current* canvas to coordinates that meant nothing there and pinged empty ground. Both panels now refresh on `canvasReady` (only if they've actually rendered, so the lazy tabs stay lazy), and `panToPin()` re-checks the scene at click time rather than trusting the button — belt and braces, since any stale render would otherwise reintroduce it.
- **`PanelManager.instance.element` was permanently null, silently killing ~10 render paths**: every panel class assigns `this.element` in its own `render()`; `PanelManager` declared the same field to match that convention and then never assigned it — `createTray()`/`updateTray()` only ever wrote the **static** `PanelManager.element`. So `instance.element` sat at its constructor `null` forever while ten call sites across `squire.js`, `panel-party.js` and `manager-panel.js` read it to decide whether to render, or passed it straight into `render()`. All failed silently, with no error, because passing `null` to a render is a no-op and `&& instance.element` is just false. Casualties: **`updateTray()` could never run at all** (it guarded on `this.element`, then used `PanelManager.element` to do the work — mixing the two in one method); the global `updateActor` hook's AC/movement branch was gated behind `&& instance.element`; and the item-transfer drop handler re-rendered five panels into `null`. `element` is now a getter onto the static, so the two can never drift apart again.
- **Players see ownership changes without reloading**: when a GM granted or revoked a player's ownership of an actor, the character switcher didn't change until that player reloaded their client. The switcher is built from `game.actors.filter(a => a.isOwner)` in the **tray's** render data, and every existing `updateActor` hook is scoped to something that is false in exactly this case — the party and party-stats hooks bail on `hasPlayerOwner`, and the global hook bails unless the changed actor *is* the one being viewed. Granting a player a new actor while they were looking at a different one therefore reached nothing. Ownership changes now get their own hook that re-renders the tray. It decides whether to act by recomputing which actors the user owns and comparing that to the last rendered set — asking the world rather than parsing the diff. That matters, because the diff is not shaped the way it reads: a permission change arrives as `{ "==ownership": {...} }` — Foundry prefixes diff keys with operators (`==` replaces an object wholesale, `-=` deletes) and may flatten paths — so `changes.ownership` is simply `undefined` and any check for it silently drops every grant. Asking `actor.isOwner` instead sidesteps the whole encoding, and folds in default permission, per-user grants, removals, and GM status for free. Comparing the owned set also collapses a GM's bulk permission edit into a single rebuild instead of one per actor. If the revoked actor is the one the player is *currently* viewing, the tray now falls back — assigned character, then any owned character, then anything else owned, then the no-character state — rather than leaving them on a sheet they can no longer open.
- **Codex auto-discovery now sees items inside containers, and weapons**: the scan filtered inventory to `['equipment','consumable','tool','loot','backpack']`. dnd5e 5.x migrates the `backpack` item type to `container` on load (`dnd5e.mjs:75937`), so a modern world has no `backpack` items at all — containers were excluded from the scan outright, and `weapon` was never in the list, so an artifact that happened to be a sword could never be discovered. The code that was *meant* to walk container contents was dead three times over: it tested `item.type === 'backpack'` (now `container`), read `item.contents` (the getter lives on the data model, `item.system.contents`), and guarded with `Array.isArray()` on what dnd5e returns as a `Collection`. It has been removed rather than repaired — dnd5e stores a contained item as an ordinary embedded item on the actor tagged with `system.container`, never nested inside the container, and `Container#contents` is itself derived by filtering `actor.items`. So `actor.items` already holds everything in every container at any depth; the walk was redundant as well as broken. Both the matching pass and the "Discovered By" attribution pass now share one item-type list, so they can no longer disagree about what counts as owned.
- **Notes: unpin no longer strands an orphan pin**: unpin used `pins.unplace()`, which moves a pin into Blacksmith's *unplaced* store rather than deleting it. Notes have no UI that can ever re-place an unplaced pin, so every unpin left an orphan there with the page's `pinId` flag still pointing at it — and the GM's every-refresh ownership sync calls `pins.update()` for any note carrying a `pinId`, which is the source of the repeated *"Pin not found — it may have been deleted externally"* in the console. Unpin now **deletes** the pin, which is what the button has always claimed to do; the `deleted` hook clears the flag, so no orphan and no stale flag. Deleting also happens while the pin is still on the scene — the path that tears the canvas element down properly.
- **Notes: you can find a pinned note on the map again**: dropping the card view in 13.3.11 removed `.note-location-section` — the element whose click handler panned the canvas to a note's pin. The handler survived the refactor and kept binding to a selector that no longer matched anything, so the capability silently vanished with no error and no replacement control. A pinned note on the current scene now shows a **Show on Canvas** crosshair button that pans and pings the pin. It appears only when the pin is on the scene you're looking at, which is the only time panning can do anything.

## [13.3.13]

### Changed
- **One journal picker, sorted, everywhere**: `showJournalPicker()` had two UIs — a clean dropdown and a wall of book cards — and the **grid was the default**, so Quests and Notes got it purely because they never passed `mode: 'select'`. Only Codex opted into the dropdown. The grid is deleted (121 lines → 73), along with the gold thumbtack it drew on the current selection (tooltip: "Pinned for players" — it did nothing) and the "Refresh List" button, which existed because the grid was built once and went stale. Every picker is now the same dropdown, **sorted alphabetically** with the clear option pinned first — Codex's list was unsorted because the caller hand-built its own `choices` in `game.journal` order; the helper now builds and sorts them, so that call site loses its inline copy too. Journal names are escaped on the way into the `<option>`. The hint above the control is plain text in Foundry's native `.notes` style instead of a hand-styled panel of `<p>` tags with inline colours, and it no longer restates the dialog title: Notes says *"Players need Observer ownership on this journal to create notes."*, Quests says *"Each page in this journal is one quest."*


### Fixed
- **Codex pins use their category's icon again**: the tray card and the canvas pin each kept their own category→icon map, and they drifted — 13.3.9 added `Establishments` (fa-shop) and `Landmarks` (fa-monument) to the tray's map only, so pinning either produced the `fa-book` fallback, and `Lore` was in neither. The pin also ignored an entry's custom `system.categoryIcon`, which the tray has always honoured, so a custom icon appeared on the card but not on the map. There is now one map (`CODEX_CATEGORY_ICONS` in `const.js`) used by both surfaces, plus `Lore` (fa-scroll); adding a category in one place now covers card and pin together. Existing pins keep their old image until re-pinned or until their entry is edited (`updateCodexPin` refreshes it).
- **Codex auto-discovery scans the party, not the canvas**: the inventory scan built its actor list from `canvas.tokens.placeables`, so it only ever saw player characters deployed on the currently-open scene — a PC who wasn't on the map was silently skipped, and anything in their pack failed to reveal its codex entry. Worse, the result depended on which scene happened to be open when the GM ran it. Discovery is about what the party *owns*, so it now uses the same `getPartyActors()` (Blacksmith's configured campaign party) as the rest of the module. The scan no longer touches the canvas at all, and the "Discovered By" attribution covers every party member rather than the deployed subset.

## [13.3.12]

### Added
- **Quest and Codex imports turn plain-text names into document links**: Squire had no name→document lookup of any kind. An imported treasure entry `{ "name": "Arcanic Wayfinder Part 2: Casing" }` was written into the journal as plain text and stayed plain forever; the only links that ever appeared were ones that arrived pre-baked as `@UUID[...]` in the JSON or were dragged in by hand. Both import paths now resolve bare names through Blacksmith's Compendiums API (`api.compendiums.resolveMany`), which owns the GM's compendium mapping and all of the search semantics — world-first/world-last ordering, exact-across-all-sources-then-prefix tiering, and Spell/Feature subtype filtering. Squire still contains zero compendium search code: names go in, UUIDs come out. Quest treasure resolves as `item`, participants as `actor`. Entries already carrying a UUID pass through untouched, and anything that fails to resolve falls back to its plain name, so the worst case is exactly the previous behaviour. New `scripts/utility-resolver.js` is the single place Squire touches the API; resolution is batched by type via `resolveMany`, and Blacksmith caches each pack index after first read, so a large import doesn't re-read them per name.
  - **Requires Blacksmith 13.8.4+** for `api.compendiums`. On an older Blacksmith the resolver simply isn't there and every name falls back to plain text — no error, no links.
  - **Requires the GM's Blacksmith Compendium Mapping to include the world for the type being resolved.** Player characters and most NPCs live in the world, not a compendium, so an Actor mapping with world search disabled resolves *nothing* — quest participants and Characters codex entries stay plain text even though the actors plainly exist. If names aren't linking, check Compendium Mapping in Blacksmith's settings before suspecting the import. Nothing in Squire can detect this and warn you; the import reports the names as unresolved and is otherwise silent.
- **Codex: `related` entries — a relationship graph between codex entries**: a new `related` field holds plain names of other codex entries (`"related": ["Valjevo Castle", "Black Fist"]`), rendered as a **Related** section on the card and as links. Codex entries are `JournalEntryPage`s inside one journal, so they can never be found by the compendium resolver (`type: "journal"` searches `game.journal`, i.e. JournalEntry *documents*) — feeding a real AI-authored codex to the resolver above produced 22 links on one entry of which **19 were structurally unresolvable**, every one of them a place, faction, or district. The model wasn't over-linking; it was describing a graph the schema had no field for. Resolution is a `Map<name, page>` built once per render from the codex journal's pages, which is also why `related` stores **only names**: a name whose entry doesn't exist yet renders as plain text and becomes a link the moment that entry is created — no rescan, no stored UUID, and no import-ordering problem (an entry may reference one defined later in the same JSON array). The index respects the viewer, so players never see links to entries they can't open.
- **Codex: location levels are links**: the REALM / REGION / SITE / AREA rows on a card resolve through the same page index, so an entry whose location is `"Faerûn > Moonsea > Phlan"` links each level to that entry when it exists. Related and location references open the target **in the tray** — expanded, scrolled to, and flashed, exactly as double-clicking its codex pin does — because they name codex entries, not documents. Document `links` are unchanged and still open the document itself. This is what makes `related` non-hierarchical: the path is already a relationship and is now navigable as one, so `related` is reserved for connections the hierarchy doesn't carry.
- **Codex: "Auto-Link Unresolved Links" (GM)**: a codex-menu action that retries every unresolved *document* link against Blacksmith's compendium mapping, using the same progress bar as inventory auto-discovery and the same asserted/speculative reporting as import. Only document links need it — `related` and location levels self-heal at render. Manual by design: it is a bulk write to journal pages, so an import now *reports* how many links are still unresolved and points at the action rather than running it unasked.
- **Codex: typed cross-reference links, and a self-link derived from the category**: `links` entries may now be `{ "name": "...", "type": "actor" | "item" | "spell" | "feature" | "journal" | "rolltable" }` — plain names the importer resolves, instead of UUIDs a generator has no way to know. Each link carries its **own** type because codex links are heterogeneous cross-references (an NPC entry may point at the actor, their faction's journal, and their sword); a category describes the entry, not the documents it points at. Separately, an entry's own name is resolved using its category (Characters → actor, Items/Artifacts → item, everything else → journal), so an entry about a real document links to it with no authoring at all. The AI prompt's standing instruction — *"Always leave `links` as an empty array — document links are attached inside Foundry by dragging documents onto the entry, never generated here"* — is removed: it was a workaround for the missing resolver, codified as policy. **Unresolved names are retained, not discarded**: `links` stores `{name, type, uuid?}`, an unresolved link renders as plain (dimmed, italic) text, and "Auto-Link Unresolved Links" retries it later. A codex is authored incrementally — a name written before its document exists is a real statement, and the source JSON is gone by the time it would matter. Link identity is therefore the **name**, not the uuid: a uuid is the *result* of resolution, so keying on it would give one link two identities either side of Auto-Link and duplicate it on merge. Legacy links (uuid + label, no name) backfill `name` from `label`, so old data stays stable with no migration.
- **Imports report what linked and what didn't**: quest and codex imports now notify the GM (`linked 3 references. 1 named reference did not resolve.`) with a full report — resolved count, misses, and inexact (`startsWith`/`includes`) matches — logged via `postConsoleAndNotification`. Misses are split by kind: an explicit `{name, type}` link is an **assertion** that a document exists, so its miss is reported; an entry's category-derived self-link is **speculation** (most Locations and Factions legitimately have no same-named journal), so its miss stays in the debug payload only. Without the split a 50-entry codex import would announce "3 of 50 linked" and train the GM to ignore the notification. Inexact matches are surfaced separately because `startsWith` can silently grab the wrong document.


### Fixed
- **HTML escaping no longer builds a DOM node per call**: `escapeHtml()` used a `createElement`/`textContent`/`innerHTML` round-trip. It runs up to twice per related name and per location level, so a real 314-entry codex was paying thousands of DOM node constructions on **every** render — every pin toggle, visibility flip, and import step. Now a regex replace. It also closes a correctness hole: the DOM approach leaves `"` and `'` unescaped, and the escaped value is interpolated into a `data-uuid="…"` attribute.
- **Codex no longer jumps to the top when you pin, unpin, or reveal an entry**: `render()` replaces the panel's `innerHTML`, which destroys the `.codex-content` scroll container and recreates it at `scrollTop` 0 — so any action that re-renders threw the GM back to the top of the codex. Scroll position is now captured before the rebuild and restored after listeners are attached (the notes and quest panels already did this; codex was the one that didn't).
- **Codex categories no longer collapse on every render (pinning, unpinning, importing, revealing an entry)**: `render()` applied collapsed state **twice** — once correctly from the template (`cat.collapsed`, an exact key lookup on `codexCollapsedCategories`), and then again in a second pass that iterated *every* key in the flag and matched sections with `.trim()`. That mattered because an older version derived those keys from rendered element text, so real worlds have flags polluted with entries like `" Locations\n "`, `" Artifacts\n \n Browse\n \n \n "`, and HTML-escaped `"Crafting &amp; gathering"`. Trim-matching made a junk key saying *collapsed* silently override the real key saying *expanded* — on every single render. The redundant pass is removed (the template already does this correctly), and malformed keys are pruned once per session so the flag stops growing and no future trim-style matching can revive the bug. Separately, jumping to an entry via a Related/location reference or a codex pin double-click now *records* the category it opens, instead of only removing a CSS class the next render would undo; all category-collapse writes go through one helper rather than three copies of the same update.
- **Codex entries no longer collapse themselves when you touch anything**: the card template hard-coded `class="codex-entry collapsed"` and expansion lived only as a DOM class, so *any* re-render — pinning an entry, toggling its visibility, an import, an Auto-Link pass — slammed every open card shut. Which entries are expanded is now tracked per entry and persisted to the `codexExpandedEntries` user flag, so it survives both re-render and reload (matching how `codexCollapsedCategories` already worked for category headers). Stale ids are pruned on write, since re-import replaces pages with new uuids. Double-clicking a codex pin records the expansion too, so the entry it opens also stays open — it previously reopened and then closed itself on the next refresh.
- **Editing a codex pin's visibility in Configure Pin now says it does nothing, instead of silently doing nothing**: codex pin visibility is *derived* from the codex entry's ownership, not configured — and the pin's `ownership` (not `blacksmithVisibility`) is what actually gates players. So setting a codex pin to "visible" on a hidden entry was a triple no-op: it didn't reveal the entry in the tray, it didn't show the pin to players (ownership still excluded them), and `updateCodexPinVisibility()` silently reverted it the next time the entry's visibility changed. The GM saw the pin change in their own view and concluded it had worked. The edit is now detected on the `pins.updated` event (gated on `patch.config.blacksmithVisibility`, so Squire's own sync writes never trip it) and answered with a notification pointing at the entry's visibility toggle in the tray, which is the control that actually does this. Behaviour is unchanged — visibility still follows the entry; only the silence is fixed.
- **Re-importing a codex entry no longer destroys hand-dragged links**: the importer rebuilt `system.links` from the JSON alone and handed it to `page.update()`, which replaces arrays wholesale — so any document a GM had dragged onto an entry vanished on the next re-import of that codex, unrecoverably (the link never existed in the JSON). Dragging was the *only* way to add a codex link before this release, so every link in an existing codex was exposed to this. Links already on the page that an import doesn't produce are now preserved. The trade-off is that a link can no longer be removed by re-importing — remove it in the Edit Entry window instead; silently destroying manual work is the worse failure. (The same defect on quest treasure is fixed below; they were one bug wearing two hats.)
- **Re-importing a quest no longer strips hand-dropped treasure links**: `_mergeJournalContent` carefully preserved existing task state, status, and participants, but rebuilt the treasure list from the import JSON alone — so a UUID a GM had dragged onto a quest was silently downgraded to dead plain text on the next re-import of that quest, with no way to recover it (the link isn't in the JSON). Existing treasure UUIDs are now extracted from the journal and re-attached by name before resolution. The import remains the source of truth for *which* treasure exists; the journal keeps the *link* for anything it already had. A UUID a human picked by hand outranks whatever the resolver would guess for the same name.
- **Codex auto-discovery: entry names containing a double space never matched party inventory**: item names were normalized with `.toLowerCase().replace(/\s+/g, ' ').trim()` in four places, but the codex entry name they were compared against got only `.toLowerCase().trim()` — no interior-whitespace collapse — so any entry whose name contained a run of two or more spaces could never be discovered, even against an identically-named item. All five sites now share one `normalizeItemName()` helper; inlining the expression is how the two sides drifted apart in the first place.

### Changed
- **Party roster comes from Blacksmith's Campaign API**: four sites independently rebuilt "the party" as `game.actors.filter(a => a.type === 'character' && a.hasPlayerOwner)` — the quest participant picker, both `autoAddPartyMembers` import paths, and the MVP leaderboard — and had already drifted apart (only the leaderboard excluded token actors). All four now call one `getPartyActors()` in `helpers.js`, which returns `api.campaign.getParty().members` resolved to actors in the GM's configured order. Worlds with no configured party fall back to the historical heuristic (now including the `!isToken` guard everywhere) so nothing silently empties. Note this is the *configured* party — "tokens on the canvas" and "actors I own" remain separate concepts with their own call sites and are unchanged.
- **Blacksmith API docs are referenced, not vendored**: `documents/blacksmith/` held four copies of Blacksmith's API docs (`api-core.md`, `api-canvas.md`, `api-chatcards.md`, plus a Squire-authored `blacksmith-apis.md` index). The `api-core.md` copy predated the Compendiums API and still taught the `BLACKSMITH.arrSelected*Compendiums` iteration pattern that Blacksmith's own current doc opens by marking **"⚠️ Superseded by the Compendiums API"** — and the index listed the Campaign API but no Compendiums entry at all, which is a fair part of why the resolver was never wired. All four are deleted in favour of a pointer in `documents/architecture-squire.md`: the Blacksmith repo's `documentation/api/*.md` is the source of truth, the wiki is a convenience mirror in a separate repo that does not auto-update, and where they disagree the repo wins.

### Removed
- **Dead "Item Lookup" compendium settings**: `itemCompendium1`–`itemCompendium5` ("The #N compendium to use for item linking. Searched in order.") and `searchWorldItemsFirst` were registered in Squire's own namespace and read by **no code anywhere in the module** — they described an item-linking search that did not exist. A GM could configure all five and get silence. `searchWorldItemsFirst` was additionally registered **twice**, at two separate points in `settings.js`, with identical definitions. Blacksmith's compendium mapping replaces all six: configure compendiums once in Blacksmith and every Coffee Pub module resolves against them. Existing stored values become inert.
- **Dead `_getItemUUID()` helper** (`manager-panel.js`): hand-built `@UUID[Compendium.${pack}.Item.${id}]{...}` strings and was never called from anywhere.

## [13.3.11]

### Changed
- **Notes tray is list-only**: Removed the card / list view toggle. The Notes tab always uses the compact list rows (title, visibility, pin/edit actions). The light / dark list theme toggle remains in the notes `…` menu (still stored as `notesCardTheme` so existing prefs keep working).

### Added
- **Notes list hover preview**: Hovering a note title shows a Foundry `data-tooltip` with a plain-text excerpt of the note body (stripped HTML, truncated). Opening the note window still shows the full enriched content.

### Fixed
- **Notes tray refresh cost**: `_refreshData()` no longer runs `enrichHTML` for every changed note just to paint cards. The list builds from flags + raw page text; enrichment stays in the note window.
- **Note window view mode – `@UUID` links not enriching**: Read-only note content was injected as raw HTML (`{{{note.content}}}`), so `@UUID[...]{Label}` strings stayed literal. View mode now runs `TextEditor.enrichHTML` (documents/links/rolls) before render; edit mode still uses raw content for ProseMirror.

### Removed
- **Notes card view UI**: Card templates, card CSS, and the `notesViewMode` user flag. Existing `notesViewMode` values become inert; `notesCardTheme` continues to drive list light/dark.

## [13.3.9]

### Added
- **Codex data model — custom journal page type**: Codex entries are now a real Foundry page subtype (`coffee-pub-squire.codex`) instead of parsed HTML. Structured fields (summary, category, plot hook, location, link, tags, image, discovered-by) live in `page.system` with a `TypeDataModel` schema — nothing is scraped from page HTML anymore, so a hand-edit can no longer silently break an entry. The page's native `text.content` holds **Expanded Details**: free-form rich lore edited with the standard ProseMirror editor and rendered below a styled field block by a custom page sheet (extends the v13 `JournalEntryPageTextSheet`). "Codex Entry" appears as a page type in the journal's Add Page dialog.
- **Codex: Expanded Details + "Read More"**: The tray card stays bite-size and gains a **Read More** pill button (book icon, animated chevron, orange accent) on every entry — right-aligned below the summary — that opens the entry's journal page in the reading view (the custom sheet: image, summary, meta fields, then the full lore). The tooltip notes when expanded details are present.
- **Codex: card layout — links and location**: The entry card lists each link on its own line under the LINKS label, and the location renders as labeled hierarchy rows (REALM / REGION / SITE / AREA) matching the picker's levels; empty levels don't render.
- **Codex: location picker polish**: Each level's dropdown includes a "+ New …" item (clears and focuses the segment); level labels and inputs carry Foundry tooltips defining Realm/Region/Site/Area with examples; placeholders read as hints ("e.g. Faerûn", italic and dimmed) instead of resembling entered values.
- **Codex: Edit Entry window validation**: Saving with a missing name or category no longer reaches the document layer (previously a `DataModelValidationError`) — the save action now runs the form's native required-field validation (`reportValidity`, with the standard browser cues) plus a hard guard with a clear warning notification.
- **Codex: Expanded Details editor height**: The Edit Entry window's lore editor grew from 280px to a 700px minimum (capped at 75% of viewport height) — comfortable for long-form writing.
- **Codex: Expanded Details editable in the Edit Entry window**: The tray's Edit Entry window gains an "Expanded Details" section with a full ProseMirror rich-text editor bound to the page's `text.content` — create or edit an entry's lore without leaving the form. The editor is mounted programmatically via `HTMLProseMirrorElement.create({ value })` (the same pattern as the note window) because the `<prose-mirror>` element discards innerHTML, and its live state is read directly on submit (`prose-mirror` elements aren't reliably captured by `FormData`).
- **Codex: journal page edit form restyled**: The typed page's edit mode now renders as a structured form — "Codex Fields" section header, full-width Summary/Plot Hook, a two-column grid for Category/Location/Link, a `<string-tags>` chip input for tags (submits a real array — a plain text input was saving the whole comma string as one giant tag), uppercase field labels, and an "Expanded Details" divider ahead of the standard ProseMirror content editor.
- **Codex: multiple links with drag-to-link**: The single Link UUID field is replaced by a `links` array in the data model. The Edit Entry window's Links area is a drop zone — drag actors, items, journal entries, or pages onto it to link them (deduped by UUID), shown as removable chips; the auto-populate drop zone now *adds* a link instead of overwriting one. The tray card and journal page render all links as enriched content links, and the journal page's edit mode has its own links drop zone (chips with remove, drag documents to add — writes `system.links` directly). Import/export use `links` (legacy single `link` still accepted on import); the AI prompt pins `links` to an empty array — links are attached in Foundry, not generated.
- **Codex: hierarchical location picker**: The Edit Entry window's location select is replaced with a segmented Realm > Region > Site > Area path — four combo inputs joined by chevrons, each offering every value already used at that depth across the codex (caret shows the full list, typing filters it, free text creates new values). Custom dropdowns, not native `<datalist>` — Chromium positions datalist popups in pre-transform viewport coordinates, which renders them nowhere near the input inside Foundry's transformed windows. Segments join to the canonical `"A > B > C"` string on save. The AI prompt now defines the hierarchy's makeup (Realm/Region/Site/Area, broadest to most specific, reuse exact spellings so levels group).
- **Codex: Edit Entry window layout**: The image section is compact — thumbnail preview and Browse button side by side instead of a tall stacked block.
- **Codex: entry image derives from the first Expanded Details illustration**: Restored the pre-data-model behavior — the tray card image is `system.img` if explicitly set, otherwise the first `<img>` in the page's Expanded Details. The journal page edit form has no image field (the illustration IS the image); the Edit Entry window previews the resolved image and only writes `system.img` when the user explicitly picks a different one, so a lore-derived image stays dynamic rather than being frozen on save. Export emits only the explicit `system.img` (a derived image already travels inside `expandedDetails`).
- **Codex: category icons for Establishments and Landmarks**: `getCategoryIcon()` gains `Establishments` (fa-shop) and `Landmarks` (fa-monument); the AI prompt template now instructs place-related entries to be split — Establishments for businesses/services, Landmarks for distinctive named sites, Locations reserved for broad geography — to keep the Locations category from absorbing everything.
- **Codex: import/export on the new model**: The JSON schema gains optional `expandedDetails` (HTML string → `text.content`); export emits the clean schema (name/img/category/summary/plotHook/location/link/tags/uuid/expandedDetails) instead of dumping internal panel state. Import creates typed pages; when it matches an existing **legacy text page** (by `codexUuid` flag or name) it **replaces** it with a typed page, preserving ownership and sort — **re-import is the conversion path** (no automated migration, by decision). The AI prompt template documents `summary` and `expandedDetails`.

### Fixed
- **`ImagePopout` deprecation warnings eliminated (v13 AppV2 signature)**: All four call sites (codex entry image, character portrait, party card portrait, quest window image preview) used the legacy `new ImagePopout(src, { title })` constructor, which logs deprecation warnings since v13 and breaks in v15. All now use `new foundry.applications.apps.ImagePopout({ src, uuid, window: { title } })`.

### Changed
- **Codex: "Description" renamed to "Summary"**: The tray card label, the Edit Entry window field, the data model field, and the import/export schema all use *summary*. Import still accepts JSON with legacy `description`.
- **Codex panel reads typed pages only**: Legacy text pages in the codex journal are no longer displayed; the GM gets a one-time notice with the count and the re-import instruction. The Edit Entry window prefills from and saves to `page.system` (it never touches Expanded Details), and refuses to save over a legacy page. Auto-discovery records discoverers in `system.discoveredBy` instead of injecting an HTML paragraph.

## [13.3.8]

### Fixed
- **Journal/party tabs render lazily**: `renderPanels()` built and rendered the Notes, Codex, Quest, and Party panels on every full tray render even when their tabs were disabled in settings or simply not the active tab. Disabled tabs now never render; enabled-but-inactive tabs defer their first render until the tab is actually opened (or an event-driven refresh renders them), then stay warm. The persistent pinned-quest menubar notification — previously restored from the quest render path — is still established on load without paying for a full quest panel render.
- **GM Details biography: cleaned block-formatted text instead of raw HTML, cached**: The biography rendered as raw enriched HTML (images, embeds, and all) via `{{{biographyHtmlRaw}}}`, which displayed poorly in the narrow GM panel — and `CharacterPanel.render()` re-ran `TextEditor.enrichHTML` on it every render, which since 13.3.6 includes every AC/movement/effect tick. The biography is now enriched (so `@UUID` links resolve to display names and `@Embed[...]` references expand to their content), stripped of media only (images, video, audio, iframes — NOT `<figure>` wrappers, which is how Foundry delivers embedded journal content and dnd5e 2024 monster descriptions), and extracted **block-aware**: one paragraph per source block element, headings kept distinct (bold uppercase), figure captions preserved as text, list items bulleted, and table rows joined cell-by-cell with separators — a flat plain-text extraction was mashing headings into adjacent sentences and collapsing table rows into unreadable fragments. All extracted text is HTML-escaped before rendering. The result is cached by the raw source string so the enrich+parse cost is paid only when the biography actually changes. `biographyHtmlRaw` is removed from the data flow entirely.
- **Quest pins: removed the write-only `sceneId` mirror flag**: `_syncQuestPinMirror` wrote a `sceneId` flag on quest pages after every pin place/unplace that no code ever read — quest scene resolution comes from live Blacksmith pin records per the pinId-only contract. Each write was a pointless world document update whose cascade also invalidated the new page-parse cache for that page. Only `pinId` is mirrored now; existing stale `sceneId` values on quest pages are inert. (Notes' own `sceneId` flag is unrelated note metadata and is untouched.)

## [13.3.7]

### Fixed
- **Notes/Codex/Quest panels no longer re-parse the entire journal on every render**: Each panel's `_refreshData()` re-enriched (`TextEditor.enrichHTML`) and re-parsed every page of its journal on every refresh — cost scaled with total journal size, not with what changed (the quest panel calls `_refreshData()` from ~10 sites). All three panels now cache parsed page data keyed by page UUID + `_stats.modifiedTime`: unchanged pages skip enrich+parse entirely, and any document update (content, flags like `pinId`/`visible`, ownership) invalidates exactly that page. Volatile state is still recomputed on every refresh — live pin/scene lookups, codex ownership and active-scene pin flags, quest numbers, notes editor avatars — so nothing canvas- or Blacksmith-dependent is served stale. Caches prune against the journal's current pages, which also handles switching journals. With a 100-entry journal, editing one note now costs one enrich+parse instead of one hundred.
- **Party panel renders debounced and gated**: The panel re-rendered fully on every token movement step, every HP tick, and once per token during multi-select (`controlToken` fires per token). The three handlers now coalesce through a 100ms debounced render, and the hook wiring ignores tokens/actors without player owners — NPC movement and NPC updates no longer touch the party panel at all. With this, all four of Squire's `updateActor` hook registrations (character, party, party-stats, global) cheap-exit on irrelevant updates.


## [13.3.6]

### Fixed
- **Handle no longer renders the entire tray template on every update**: `HandleManager.updateHandle()` rendered `TEMPLATES.TRAY` — the markup for every panel — into a temp div just to slice out the handle wrapper, on nearly every actor/item/effect hook (many times per second in combat). It now renders only the view-specific handle template (`handle-player`/`handle-party`/`handle-notes`/`handle-codex`/`handle-quest`) directly into the wrapper.
- **Handle listeners bound once instead of clone-and-rebind per update**: `_attachHandleEventListeners()` cloned the whole `.tray-handle` (plus ~10 individual buttons) and re-attached ~15 listeners on every `updateHandle()`. All handle handlers are now delegated to the stable `.tray-handle` element and bound once per tray. This also fixes two silently broken handlers: the party-member portrait click was attached to the detached pre-clone element, and the pinned-quest objective tooltips used non-bubbling `mouseenter`/`mouseleave` with delegation (now `mouseover`/`mouseout` with a `relatedTarget` guard, so the tooltips actually work).
- **Pinned quest no longer re-parsed on every handle update**: With a quest pinned, every `updateHandle()` ran `fromUuid` + `enrichHTML` + `QuestParser.parseSinglePage`. The parsed result is now cached by quest UUID + page `modifiedTime` and only re-parsed when the pinned quest changes or its journal page is actually edited.
- **Party-stats leaderboard recompute debounced and filtered**: Every `updateActor`, `updateCombat`, and `createChatMessage` triggered an immediate full leaderboard recompute with one sequential `getStats` await per party member. Updates are now debounced (250ms trailing), stats fetch concurrently via `Promise.all`, NPC/monster actor updates are ignored, and plain chat messages (no rolls) no longer trigger a recompute at all.
- **Item updates re-render less**: A single item change re-rendered weapons/inventory (already type-gated) plus the favorites panel plus a full handle rebuild regardless of what changed. Now: invisible changes (e.g. description edits) skip all re-renders; the favorites panel only re-renders when the changed item is actually favorited; and the handle only rebuilds when the item is a handle favorite (the handle displays nothing else item-derived).
- **Handle quest objectives now number 1→n top-to-bottom**: The handle content wrapper renders vertically via `writing-mode: vertical-lr` + `rotate(180deg)`, which reverses the visual order of flex children — so objective 1 appeared at the bottom. A scoped `flex-direction: row-reverse` on `.handle-pinnedquests` cancels the rotation for the quest progress strip. (Fixed in CSS deliberately — reversing the tasks array in JS would have broken `data-task-index` and the `{{add @index 1}}` numbering.)
- **AC/movement changes no longer rebuild the whole tray**: `changes.system.attributes.ac`/`movement` were in the "major change" set that triggered full `PanelManager.initialize()` + `renderPanels()` — but both recompute constantly from active effects, conditions, and mounts. They now do a targeted character-panel + stats-panel render plus a handle update. Full re-initialization is reserved for name/image/proficiency/level changes.
- **`blacksmith.pins.resolveOwnership` hook no longer duplicates on module re-enable**: The ownership resolver was registered with a bare `Hooks.on(...)` — no stored ID, no teardown in `teardownPinManager()`, and no duplicate guard, so each disable→re-enable cycle stacked another resolver. Now tracked in `_resolveOwnershipHookId`, guarded on registration, and removed on teardown, mirroring the `updateScene` sync hook pattern.
- **Health window: no more scrollbar-inside-a-scrollbar on multiselect**: The popped-out health window reuses the tray's `panel-health.hbs`, whose `.tray-panel-content` wrapper gets a tray-sized `max-height: 200px; overflow-y: auto` from common.css — nesting its own scrollbox inside the window's scrolling `.window-content` when many tokens are selected. The tray scope already had an `overflow: visible` override (panel-health.css) but the popout scope never got it; the override is now mirrored for `.squire-popout`/`.squire-window-health`, so the window's own scrollbar is the only one. (Root-cause follow-up tracked in TODO.md: migrate the five legacy V1 `Application` windows to the Blacksmith window framework.)
- **Favorites panel: removed all seven `cloneNode` listener-rebind sites**: Every listener was already registered with an `AbortController` signal that `_activateListeners` aborts before rebinding, making the clone-and-replace dance (the pre-signal listener-stripping mechanism) pure redundant DOM churn on every render. The filter toggles and clear-all button now bind directly; the per-item roll-overlay and detail-icon bindings became single delegated listeners on the panel, so listener setup no longer scales with favorites-list size.

## [13.3.5]

### Fixed
- **Tray: handle no longer updates twice per HP/effect change**: The `globalUpdateActor` handler called `updateHandle()` for HP/effect changes, then fell into a separate `if (spells) ... else updateHandle()` branch that ran it **again** for any update without a spell-slot change — two full handle rebuilds per HP tick during combat. The branches are now structured so the handle updates at most once per actor update; spells-only changes still skip the handle and re-render just the spells panel.
- **Memory leak: Health, Dice Tray, and Macros panels stranded `actor.apps` registrations on actor switch**: All three panels self-register via `actor.apps[this.id] = this` so Foundry re-renders them on actor updates, but `HealthPanel` and `DiceTrayPanel` had no `destroy()` method and `MacrosPanel.destroy()` never deleted its `apps` entry. Every hard actor switch stranded a dead panel — holding detached DOM — on the previous actor, and Foundry kept invoking `render()` on those dead panels on every future update of that actor (a GM cycling NPC tokens accumulated one dead panel per actor per panel type). All three now unregister from `actor.apps` in `destroy()`; `PanelManager.cleanup()` also now delegates panel destruction to `_cleanupOldInstance()` so the full panel set is torn down on module disable.
- **Tray: half-updated state after multiple token deletions**: When the GM deleted several tokens at once (e.g. both characters a player owns), the per-event `deleteToken` handler raced against itself — one event's direct panel-field reassignment interleaved with another's rebuild, leaving the handle showing one actor and the panels another. The handler now coalesces deletion bursts with a 100ms debounce and performs one full rebuild through `PanelManager.initialize()`. The old direct-reassignment branch (which also skipped the `actor.apps` handoff) is deleted.
- **Tray: deleting the last owned token left a stale tray**: The `deleteToken` handler nulled `PanelManager.instance` directly — skipping panel destruction and leaving the tray showing the deleted actor. Worse, the rebuild was silently swallowed by the 100ms init debounce, which the `controlToken` release event stamps just before `deleteToken` fires. `initialize()` now accepts a `force` option for deliberate rebuilds, and the `controlToken` handler ignores release events for tokens that no longer exist in the scene.
- **Inventory: NEW badge now appears for drag-dropped items**: The `isNew` flag behind the inventory panel's NEW badge was only ever set by transfer flows — plain drag-drop from the sidebar or a compendium never set it (the `markItemAsNew()` method built for this had no callers). The `createItem` hook now sets the flag before panels render, only on the creating client (avoiding duplicate flag writes from other connected clients) and directly on the item document (so it also works on unlinked NPC tokens). The badge clears after ~5 minutes via the existing sweep.
- **Idle 30s sweep no longer writes documents or re-renders**: `cleanupNewlyAddedItems()` iterated all actor items calling `unsetFlag(...)` every 30 seconds with no idle guard, and the sweep force-rendered the inventory panel every pass regardless of change. The sweep now early-returns when nothing is tracked and the current actor's flags were already swept, scans for stray `isNew` flags once per actor (flags persist across reloads while the tracking map doesn't), and only re-renders the inventory panel when a NEW marker actually expired or was cleared.

### Added
- **Character switcher**: Players who own more than one actor get a row of portrait chips directly under the tab bar, above the character identity block. Any owned actor is included — NPCs like pets and companions, not just characters — sorted assigned character first, then characters, then the rest. Chips are grouped — actors with a token on the current scene first, then a thin divider, then off-scene actors rendered slightly desaturated with a "(not on this scene)" tooltip; all remain clickable (switching to an off-scene actor changes the tray without selecting anything on canvas). Chip grouping refreshes on scene change. The active character is ring-highlighted; clicking another chip switches the entire tray to that character and syncs the canvas selection — the character's token is selected if one is on the current scene, otherwise the current selection is released so selection-driven updates don't drag the tray back to the previously selected token. (Supporting this, `controlToken` release events no longer re-initialize the tray to the released actor — only control *gains* initialize.) The chips also appear in the no-character message, turning the "select a token" dead end into a recovery path — there they show even for single-character players. The choice is remembered per user (`lastCharacterId` user flag) and becomes the first preference in the tray's fallback order (last chosen → assigned character → any owned character). Hidden entirely for single-character players with an active tray, and for GMs (the GM tray stays selection-driven).
- **Tray actor fallback rules**: A single shared resolver (`reinitializeTrayForCanvas()`) now decides which actor the tray shows whenever canvas state changes — token deletion, scene load (`canvasReady`, which previously never re-evaluated the tray), and world load. Rules: if the current actor still has a token on the scene, leave the tray alone; a still-controlled token wins; players fall back to their token on the scene, then their assigned character, then any character they own; GMs get the no-character tray until they select a token.

### Changed
- **GM tray is now strictly selection-driven**: Deleting the current token no longer auto-jumps the GM's tray to a random remaining token, and loading a world/scene with tokens present but nothing selected shows the no-character tray instead of auto-picking the first owned token. Selecting a token populates the tray as before.


## [13.3.4]

### Fixed
- **Quest/objective pins: legacy status-colored borders cleared**: Pins created before the 13.3.0 Blacksmith migration had their old per-state ring color (failed = red, completed = green, hidden = grey) baked into `style.stroke` and frozen there — Blacksmith renders the border purely from `style.stroke` and has no status-based border logic, so those stale colors persisted indefinitely while newly-created pins correctly used the white design default. A new one-time GM migration (`migrateSquirePinStyles`) resets `style.stroke`/`strokeWidth`/`iconColor` on all existing quest and objective pins (placed and unplaced) to what the current create path writes, via `_buildMergedDesign` so any GM-saved "default for type" still wins. `fill`, ownership, and `blacksmithVisibility` are left untouched (Blacksmith continues to own visible/hidden rendering). The migration is idempotent and gated by the new world flag `pinStrokeMigrationDone`, so it runs exactly once and a GM's own later stroke customizations persist.

## [13.3.3]

### Fixed
- **Quests: panel no longer jumps to the top after pin/visibility actions**: `QuestPanel.render()` rebuilds the panel by replacing `questContainer.innerHTML`, which destroys and recreates the `.quest-content` scroll container at `scrollTop` 0. Placing/unplacing a quest or objective pin and toggling quest visibility all re-render, so the GM was thrown back to the top of the list each time. Collapse states were already restored from flags, but scroll position was not. `render()` now captures `.quest-content`'s scroll position before the `innerHTML` swap and restores it after all collapse/expand states are reapplied, so the panel stays where the GM left it. This covers every quest-panel re-render, not just pin clicks.

## [13.3.2]

### Fixed
- **Codex: toggling entry visibility no longer collapses the panel**: Clicking the "Show to Players" / "Hide from Players" eye icon updated the page's `ownership.default`, which fired the `updateJournalEntryPage` hook and forced a full codex panel re-render. The re-render reset every entry's expand/collapse state and scroll position, so the GM had to scroll back down, re-expand the section, and find their place again. The visibility toggle now opts out of the re-render (via a `squireSkipCodexRender` update option that `_routeToCodexPanel` honors) and patches the eye icon, its title, and the sibling menu's `data-visible` attribute in place instead. The panel keeps its scroll position and expanded entries.

## [13.3.1]

### Fixed
- **Note sharing: ownership update now succeeds**: `syncNoteOwnership` was passing the nested `{ default, users: {...} }` structure returned by `buildNoteOwnership` directly to Foundry's `page.update()`. Foundry expects a flat mapping `{ default, userId: level }` — the `users` key was treated as a literal user ID, causing a validation error. The nested object is now flattened before the update call.

### Added
- **Note sharing: success notification**: After successfully sharing a note with another player, a `ui.notifications.info` message confirms who the note was shared with.
- **`pins.on()` lifecycle events**: All Blacksmith pin lifecycle handling migrated from raw Foundry Hooks (`Hooks.on('blacksmith.pins.*')`) to the `pins.on()` API, following the Blacksmith 13.7.6+ API update that added `'created'`, `'placed'`, `'unplaced'`, `'updated'`, `'deleted'`, `'deletedAll'`, and `'deletedAllByType'` lifecycle events. All handlers are now scoped by `moduleId` and cleaned up automatically via `AbortSignal`. The Foundry Hooks remain as legacy fallbacks in Blacksmith but are no longer used by Squire. The `_registerBlacksmithHooks()` function and `_syncHookIds` tracking array have been removed; teardown is handled entirely by `AbortController`.
- **Dynamic codex category tags**: Codex pins no longer use a hardcoded `CODEX_CATEGORY_TAG_MAP` to assign tags. Tags are now derived dynamically from the entry's category name via slug normalization (`'Characters'` → `'characters'`, `'My Custom'` → `'my-custom'`). This means user-created categories automatically get a matching tag without any code changes.

### Changed
- **Notes: `blacksmith.pins.updated` no longer triggers panel re-renders**: Removed notes from the `updated` lifecycle handler entirely. Blacksmith owns pin design after initial create — syncing the `noteIcon` flag back on every pin update was wrong in principle and caused unbounded panel re-renders on hover (Blacksmith fires `updated` on animation state changes). Notes now correctly ignore `updated` events.
- **Notes: `placed` and `created` lifecycle events are no-ops**: `createNotePin` writes the `pinId` flag itself; the resulting `updateJournalEntryPage` hook cascade drives the panel render. Listening to `placed`/`created` for notes was redundant and added extra renders.
- **Notes: `createNotePin` writes `pinId` flag internally**: The flag is now written inside `manager-pins.js` (after `pins.reload()` so the canvas data is populated before the render fires), matching how `createCodexPin` works. `panel-notes.js` no longer calls `page.setFlag('pinId', ...)` after `createNotePin` — the double-write was causing a render cascade.
- **Notes: removed explicit renders from `_createNotePin` and `_unpinNote`**: Both methods now delegate refresh entirely to the `created`/`unplaced` lifecycle hooks and the `updateJournalEntryPage` cascade. Removed the explicit `_refreshData()` + `render()` calls that were causing 4+ renders per pin operation.
- **Notes: removed legacy `sceneId` flag checks**: `_beginNotePinPlacement`, the pin button click handler, and the delete handler all previously read `page.getFlag('sceneId')` — a flag that was never written by the new code. Replaced with live API checks (`pins.get(pinId)?.sceneId`) and `deleteNotePin()`.
- **Notes: `window-note.js` no longer writes `pinId` flag after `createNotePinForPage`**: Four call sites that manually called `page.setFlag('pinId', pinId)` after `createNotePinForPage` have been cleaned up. The flag is written by `createNotePin` internally; the extra writes were causing redundant `updateJournalEntryPage` events.
- **Codex pin visibility now sets `blacksmithVisibility`**: `updateCodexPinVisibility` and `createCodexPin` now update `config.blacksmithVisibility` (`'visible'`/`'hidden'`) in addition to `ownership`, matching the pattern quests use. Previously codex pins always created with `blacksmithVisibility: 'visible'` and never updated it, so hiding a codex entry had no effect on the canvas pin.
- **Codex interaction changed from `click` to `doubleClick`**: The `pins.on('click')` handler for codex has been changed to `pins.on('doubleClick')`, matching the quest panel pattern.
- **Pin defaults updated**: `PIN_DEFAULTS` updated for all four pin types (quest, objective, note, codex) with revised colors, text sizes, drop shadow, and event animations to reflect the agreed design language.
- **Quest and objective taxonomy updated**: Quest and objective suggested tags changed from `['quest', 'main', 'side', 'optional', 'backstory']` to `['quest', 'main', 'side', 'faction', 'backstory']` and objective taxonomy expanded from `['objective']` to `['objective', 'main', 'side', 'faction', 'backstory']`. `QUEST_CATEGORY_TAG_MAP` updated accordingly (`'Optional'` → `'Faction'`).
- **Notes pin active state style**: The `note-pin-active` CSS class now applies the same orange color and glow (`color: var(--color-border-highlight)`, `text-shadow`) as quest, objective, and codex pin active states.

### Removed
- **`_registerBlacksmithHooks()`**: Removed entirely. All lifecycle handling moved to `pins.on()` calls in `_registerEventHandlers()`.
- **`_syncHookIds` array**: No longer needed; `AbortSignal` handles all `pins.on()` cleanup.
- **`CODEX_CATEGORY_TAG_MAP`**: Replaced by the dynamic `_codexCategoryToTag()` normalizer.

## [13.3.0]

### Added
- **Unified pin manager (`manager-pins.js`)**: All Blacksmith Pins API interaction is now routed through a single gateway module (`scripts/manager-pins.js`). Quest, objective, note, and codex pins share one consistent implementation for create, delete, update, event handling, context menus, taxonomy registration, ownership, reconciliation, and lifecycle hooks. Panels import from `manager-pins.js` and never call the Blacksmith API directly.
- **Initial pin defaults (`PIN_DEFAULTS`)**: Per-type design defaults (size, shape, style, text layout, event animations, access/visibility config) are declared inline in `manager-pins.js`. These apply only on first create — all subsequent appearance changes are owned by the GM via Blacksmith's Configure Pin tool.

### Changed
- **Pin placement — single-step API create**: All pin placement (quest, objective, note, codex) now uses a single `pins.create({ ..., sceneId, x, y })` call instead of the previous two-step create-unplaced → `pins.place()` pattern. The two-step pattern was silently failing — pins showed a success notification but never appeared on the canvas. The fix matches the pattern used by Artificer and the Blacksmith API documentation.
- **Pre-placement cleanup**: Before entering placement mode, any existing pin for the quest/objective/codex entry is now **deleted** (not unplaced). On pointer-down a fresh pin is created directly at the clicked position. This eliminates the accumulation of stale unplaced pins in the Blacksmith store.
- **Flag contract enforcement**: Squire stores only `pinId` on journal page flags. Position (`x`, `y`, `sceneId`), design, and visibility are owned by Blacksmith and never cached in page flags or written back from Squire.
- **Note pin placement preview**: The `_beginNotePinPlacement` preview element now uses hardcoded note defaults (`60×60`, `rgba(205,200,117,0.9)`, circle, drop-shadow) instead of calling deleted design-getter functions, eliminating a `ReferenceError` that crashed placement entirely.
- **Permission model**: Quest and codex pins use `blacksmithAccess: 'gm'`; note pins use `blacksmithAccess: 'private'`. Visibility uses `blacksmithVisibility: 'visible' | 'hidden'` (schema v7 — `'owner'` removed).
- **Tags replace group**: All pins use `tags[]` for classification. The legacy `group` field is no longer written.
- **`module.json` esmodules**: Removed the four deleted legacy scripts and added `scripts/manager-pins.js`.

### Removed
- **`scripts/utility-quest-pins.js`** (~1,084 lines): Replaced by `manager-pins.js`.
- **`scripts/quest-pin-events.js`** (~513 lines): Replaced by `manager-pins.js`.
- **`scripts/utility-codex-pins.js`** (~648 lines): Replaced by `manager-pins.js`.
- **`scripts/codex-pin-events.js`** (~178 lines): Replaced by `manager-pins.js`.
- **Six pin design settings**: `notesPinDefaultDesign`, `questPinDefaultDesign`, `questPinTitleSize`, `questPinTitleMaxWidth`, `questPinTitleOffset`, `questPinScale` removed from `settings.js`. Initial appearance is now defined in `PIN_DEFAULTS`; the GM uses Blacksmith's Configure Pin (with "Use as Default" toggle) for persistent customization.
- **`updateQuestPinStylesForPage`**: Removed entirely. Quest and objective pin updates now call `updateQuestPinText()` which only updates text, tags, and config — never style. All appearance decisions after initial create belong to Blacksmith.

## [13.2.7]

### Fixed
- **GitHub tag releases – release body size limit**: Tag builds no longer publish the entire `CHANGELOG.md` as the GitHub Release description (GitHub rejects bodies over 125,000 characters). The workflow now writes only the changelog section for the tagged version into `release-body.md` before `softprops/action-gh-release` runs, so releases succeed instead of failing with HTTP 422 and “Too many retries.” The release zip still includes the full `CHANGELOG.md`.

## [13.2.6]

### Fixed
- **Quest panel – objective pin state now reads from live API**: `_refreshData()` no longer reads `task.hasPinOnScene` from the `objectivePins` journal page flag (a manually-maintained mirror). A `liveObjectivePins` map is now built from `listAllQuestPins()` during the same pass that populates `liveQuestPins`, keyed by `questUuid|objectiveIndex`. Render-time objective pin state now matches the live Blacksmith pin store, eliminating the class of drift bugs where the flag and the store disagreed.
- **Quest panel – canvas deletion not reflected in panel**: `renderQuestPanelIfOpen()` now calls `_refreshData()` before `render()`. Previously it only called `render()`, which repainted the UI from the existing (stale) `this.data` — the rebuilt live map never ran. Manual tray refresh called `_refreshData()` first, which is why it worked while the hook-triggered path did not.
- **Quest panel – objective unplace silent failure**: Removed the `pins.exists({ sceneId })` pre-check in `unplaceObjectivePinForPage` that would bail out entirely if the stored `sceneId` was stale, leaving the pin on the canvas without error. Also stripped `sceneId` from the fallback `pins.update({ unplace: true })` paths in both objective and quest unplace functions, so the API resolves placement across all scenes rather than failing silently against the wrong scene.
- **Quest panel – deletion hook no longer manually patches flags**: The `blacksmith.pins.deleted` handler and `syncQuestForDeletedPins` no longer read or write `objectivePins` flags. Single-delete, bulk-delete, and scene-sync paths now all trigger a re-render via `renderQuestPanelIfOpen()` and let the live API drive state, matching the pattern used for quest-level pins.
- **Quest/objective pins – no longer override pin appearance on create or update**: Quest and objective pins no longer force `fill` or `stroke` colors when created or when quest content changes. `createQuestPin`, `createObjectivePin`, and `updateQuestPinStylesForPage` now only set layout defaults (`strokeWidth`, `iconColor`) and leave color entirely to Blacksmith pin tool defaults and user configuration. Status and objective state changes update `config`, `tags`, and `text` only — appearance is never touched.

### Removed
- **`_syncObjectivePinMirror` and `objectivePins` flag**: Removed the `_syncObjectivePinMirror` method, all flag writes to `objectivePins`, and the `objectivePins` reconciliation block in `reconcileQuestPins`. The flag was a stale mirror of placement state the Blacksmith API already owns; nothing reads it anymore.
- **`getQuestPinColor`, `getObjectivePinColor`, `QUEST_STATUS_COLORS`, `OBJECTIVE_STATE_COLORS`**: Removed the status-to-color lookup maps and their exported functions. Color is no longer derived from or driven by quest/objective status.
- **`pinStyleUsesSquireBootstrap`, `pinHasConfiguredAppearance`**: Removed both internal helpers that gated color application. No longer needed since Squire does not set pin colors.

## [13.2.5]

### Changed
- **Quest tray – status labels vs tabs**: User-visible quest status text now matches the tray filter tabs: **Available** (stored `Not Started`), **Active** (stored `In Progress`), **Succeeded** (stored `Complete`), and **Failed**. Applies to the quest card “…” → Change Status submenu, the quest window status dropdown, expanded entry status line, export preview HTML, and quest pin tooltips. Journal content and parsed values remain the canonical strings (`Not Started`, `In Progress`, `Complete`, `Failed`) for compatibility.

### Fixed why
- **Codex tray – unplace vs pin on another scene**: The map-pin control now treats “pinned” as **any** scene with `codexPinId` + `codexSceneId`, not only the active canvas, so you always get **Unplace** when a pin exists elsewhere. When the pin is on a different scene than the one you’re viewing, the tooltip names that scene (e.g. “Unplace pin (pinned on City Map)”). `unplaceCodexPin` resolves the real placed pin/scene from the Pins API (matching quest pins), uses the same `unplace` → `update({ unplace: true }, { sceneId })` fallback as quests, and only clears `codexSceneId` after a successful API call. Placement mode checks live pins across scenes so stale journal flags do not strand pins on the map or block re-pinning with a misleading “unpin first” message.
- **PanelManager – new-item cleanup interval**: The 30s `cleanupNewlyAddedItems` / inventory refresh sweep is no longer double-registered in timer bookkeeping (`trackModuleInterval` + `trackInterval`), and `PanelManager.cleanup()` no longer calls `clearInterval` on the same handle after `clearTrackedInterval` already cleared it. There is only one periodic sweep in the current tree (no separate module-load interval).
- **Blacksmith Manage Pins – Squire note pin taxonomy**: Legacy note pins stored with non-taxonomy `type` values (for example `note-pin`, `coffee-pub-squire-sticky-notes`, or display-style labels such as `Note Pin`) no longer break visibility filtering in Blacksmith’s Manage Pins window. On `ready`, the GM client runs a one-time migration (`migrateSquireNotePinTypes` in `scripts/utility-quest-pins.js`) that rewrites matching pins to the canonical `moduleId` / `type: note` keys expected by the pin taxonomy JSON. New note pins were already created with `type: note`; this corrects existing worlds only.

## [13.2.4]

### Added
- **Notes tray – sort control**: Added a sort toggle next to the filter icon in the notes tab search bar. Click to switch between **date added** (newest first, default) and **alphabetical** order by note title. The choice is saved per user (`notesSortMode`).

### Fixed
- **Quest panel – objective pin canvas deletion**: Deleting an objective pin directly from the canvas now correctly reflects in the quest panel without requiring a manual tray refresh. The `blacksmith.pins.deleted` hook now clears the matching `objectivePins` journal flag entry by pin ID directly, bypassing the Blacksmith cache (which does not reliably refresh objective-type pins via `pins.reload()`).
- **Quest panel – objective pin state source of truth**: `_refreshData()` now reads `task.hasPinOnScene` from the `objectivePins` journal page flag instead of from the Blacksmith pin cache (`pins.list()`). This matches the flag-based pattern used by Notes and eliminates cache-staleness as a failure mode for objective pin display.
- **Quest panel – objective pin placement flag**: The `objectivePins` flag is now written with an explicit `canvas.scene.id` on placement rather than relying on the sceneId returned by `pins.place()`, which may be absent depending on the Blacksmith version.


## [13.2.3]

### Changed
- **Notes window – view-mode privacy control**: The note header `Private` switch is now available outside edit mode for users who own the note. Visibility changes persist immediately from the view state instead of requiring an edit/save cycle.

### Fixed
- **Notes window – visibility sync path**: Unified the note visibility update flow so the live header toggle and the normal save path both apply the same `visibility`, `editorIds`, and ownership synchronization logic.
- **Notes window – long note view layout**: Fixed view mode so long note content scrolls inside the note body instead of pushing the tags panel and action bar out of place.


## [13.2.2]

### Changed
- **Notes window – Blacksmith Application V2 editor migration**: Reworked the sticky note window (`scripts/window-note.js`, `templates/window-note.hbs`, `styles/window-note.css`) to use a V13/Application V2-compatible ProseMirror mount path instead of the legacy helper/form behavior. Existing notes now round-trip through the shared Blacksmith window shell while preserving view/edit toggle behavior.
- **Notes window – tag UX simplification**: Replaced the split `Suggested` / `Common Tags` note tag groups with a single clickable tag cloud below the tags input. Core note tags are shown first, then existing world note tags are appended after case-insensitive de-duplication.
- **Notes window – tags panel presentation**: Wrapped the note tags area in a standard Blacksmith section so the note body stays visually open while the taxonomy controls match the Codex / Quest window treatment.

### Fixed
- **Notes window – ProseMirror content loading**: Fixed the migrated note editor so existing note HTML loads into edit mode correctly instead of opening with an empty ProseMirror document.
- **Notes window – editor interactivity**: Fixed the note editor state so the rich text area and HTML source mode are actually editable in edit mode rather than rendering as a non-interactive surface.
- **Notes window – editor layout sizing**: Fixed the note window flex/layout chain so the editor expands to fill the available vertical space down to the tags section instead of leaving a large dead gap below the note content.
- **Notes window – tag active state consistency**: Fixed note tag chip highlighting to behave case-insensitively and align with the shared Blacksmith active-chip styling used by Codex and Quest.

## [13.2.1]

### Changed
- **Quest window – Blacksmith Application V2 migration**: Replaced the legacy Quest import/edit form path with a registered Blacksmith Window API / Application V2 window (`scripts/window-quest.js`, `templates/window-quest.hbs`, `styles/window-quest.css`). Quest create/edit now opens through the shared Blacksmith window system and follows the same shell, section, action bar, and button patterns as Codex.
- **Quest window – structured editing workflow**: Rebuilt the quest editor around form-first sections instead of large text blocks. Objectives are now edited as individual cards, participants use selectable party portraits, the hidden flag uses the shared Blacksmith header switch, and the image area uses the same persistent preview/browse workflow as Codex.
- **Quest window – identity and world layout**: Cleaned up the quest form layout by splitting information into clearer sections, putting `Category`, `Status`, and `Timeframe` on a single row, and tightening the location/category flows to reduce dead space in the form.
- **Quest window – fixed taxonomy behavior**: Removed `+ New Category` from quests. Quest categories are now treated as fixed values in the quest window.
- **Quest window – objective UX**: Objective cards now have a clearer stacked layout with numbered titles, compact status controls, field tooltips, reorder controls, explicit `Delete Objective` actions, and a separate `Current` / `Set Current` control.
- **Quest tray – spacing and presentation**: Added visible spacing rhythm between quest cards so the quest list reads more like the Codex tray instead of appearing tightly stacked.
- **Party tray – selection state cleanup**: Removed the old shared multi-select action bar path from the tray so the party tab now relies only on the working `tokens selected / Clear All` state instead of a second broken `Clear / Combat` bar.

### Fixed
- **Quest save/objective serialization**: Fixed a critical quest save bug where editing and saving objectives could serialize structured objective data back into broken `[object Object]` journal content instead of valid quest objective text.
- **Quest objectives – add/reorder/delete behavior**: Fixed the `Add Objective` action and stabilized objective card state so blank draft objectives can be created, reordered, and deleted reliably before save.
- **Quest objectives – active vs status semantics**: Fixed the quest window so `Active` is no longer treated as an objective status. “Current objective” is now tracked separately and synced to the same active-objective flag used by the quest tray.
- **Quest treasure drop targets**: Added proper item drop support for both the main quest treasure area and per-objective treasure inputs so quest rewards can be populated directly from dragged items.
- **Quest edit round-tripping**: Improved quest edit round-tripping for objectives, participants, treasure, and related parsed quest data so existing quest pages survive edits more faithfully.
- **Codex startup/window compatibility**: Fixed early Codex window bootstrap issues during module load and completed follow-up compatibility fixes around save handling and HTML entity decoding for category/location values.

### Removed
- **Legacy Quest form assets**: Removed the old Quest form template and stylesheet (`templates/quest-form.hbs`, `styles/quest-form.css`) and their legacy load path after the Blacksmith window migration.
- **Legacy tray selection wrapper**: Removed the unused shared selection-wrapper template, runtime wiring, and related styling for the broken `Clear / Combat` multi-select bar.

## [13.2.0]

### Changed
- **Codex window – Blacksmith Application V2 migration**: Replaced the legacy Codex add form path with a registered Blacksmith Window API / Application V2 window (`scripts/window-codex.js`, `templates/window-codex.hbs`, `styles/window-codex.css`). Codex now opens through `registerWindow` / `openWindow`, uses the shared Blacksmith window shell and section classes, and exposes `openCodexWindow` on the module API.
- **Codex window – Blacksmith-aligned layout**: Rebuilt the window internals to match the shared Blacksmith window patterns instead of the older custom Codex chrome. Header, body, sections, action bar, and buttons now use the shared window template structure, and the oversized drag/drop hero was reduced to a compact callout.
- **Codex window – create/edit workflow**: Codex now supports both creating and editing entries in the same window. The header title reflects the current entry name when editing and uses `New Codex Entry` when creating.
- **Codex window – image workflow**: Added a persistent image section with preview, remove action, and native Foundry `FilePicker` browse action so entries can set artwork without drag/drop.
- **Codex window – category/location UX**: Category and location controls now use dedicated rows. `+ New Category` and `+ New Location` appear as the second option in their dropdowns, and the conditional create-new inputs appear inline beside the dropdown when needed (`[dropdown] [new value] [icon]` for category, `[dropdown] [new value]` for location).
- **Codex window – custom category icon**: New categories can now define a Font Awesome icon class (for example `fa-solid fa-map`) alongside the category name. The icon field is shown only when `+ New Category` is selected and is required together with the new category name.
- **Codex window – suggested tags**: Added clickable suggested tag chips in the Tags section. Clicking a chip adds or removes it from the tags input, and manual edits in the input keep chip active state in sync.
- **Codex tray – entry interactions**: Clicking an entry title now toggles the entry open/closed, and clicking a category title now toggles the category section. Entry images in the tray now open in Foundry’s native `ImagePopout`.
- **Codex tray – image presentation**: Expanded Codex tray images now render full width and scale to entry width without the prior max-height clamp.
- **Codex tray – edit action**: Added `Edit Entry` to the per-entry `...` menu so existing Codex pages can be loaded directly into the Codex window for editing.

### Fixed
- **Codex drag/drop field mapping**: Expanded drag/drop population for actors, items, journal entries, and journal pages so more Codex fields are filled consistently, including description text, link UUID/label data, and related metadata.
- **Codex drag/drop descriptions**: Dropped descriptions now append plain text to the existing description instead of overwriting it, with normalization for line breaks and duplicate content.
- **Codex drag/drop link persistence**: Fixed cases where dropped linked-document UUID data could be lost because the form state and rendered inputs were not fully synchronized.
- **Codex category list normalization**: Category dropdown options are now normalized and deduplicated case-insensitively so values like `Artifacts` and `artifacts` do not appear as separate options.
- **Codex new-category / new-location reveal**: Fixed the conditional new-category and new-location inputs so they actually appear when selected.
- **Codex save action handler**: Fixed the Application V2 save action path after the Blacksmith migration (`_ref` resolution for `ACTION_HANDLERS`).
- **Codex save compatibility warning**: Replaced deprecated global `expandObject(...)` calls with `foundry.utils.expandObject(...)` in Codex and Quest window save paths.
- **Codex category/location entity decoding**: Fixed category and location values containing HTML entities so characters like `&` round-trip correctly instead of reappearing as escaped entity text.
- **Codex panel pointer affordance**: Added pointer cursor styling for clickable entry and category titles so hover feedback matches the new click behavior.

### Removed
- **Legacy Codex form assets**: Removed the old Codex form template and stylesheet (`templates/codex-form.hbs`, `styles/codex-form.css`) and their CSS import path after the Blacksmith window migration.


## [13.1.15]
  - **Codex Panel - Image display**: Codex entries now display their associated image in the panel if available.
  - **Codex Panel - Visibility toggle**: Codex entries now display their associated visibility toggle in the panel if available.
  - **Codex Panel - Link display**: Codex entries now display their associated link in the panel if available.
  - **Codex Panel - Discovered by display**: Codex entries now display their associated discovered by in the panel if available.
  - **Codex Panel - Category display**: Codex entries now display their associated category in the panel if available.
  - **Codex Panel - Name display**: Codex entries now display their associated name in the panel if available.
  - **Codex Panel - Description display**: Codex entries now display their associated description in the panel if available.
  - **Codex Panel - Tags display**: Codex entries now display their associated tags in the panel if available.

## [13.1.14]

### Added
- **Codex pin lifecycle utilities**: Added dedicated codex pin utilities and sync handling (`scripts/utility-codex-pins.js`) to keep codex page pin flags aligned with Blacksmith pin create/update/place/unplace/delete events.
- **Codex linked-document field**: Codex entry form now supports a **Link UUID** field (`templates/codex-form.hbs`), and codex entries render that link in the panel for quick navigation to related documents.

### Changed
- **Codex pin open interaction**: Codex pins now open/navigate the Codex entry on **single click** (`scripts/codex-pin-events.js`) instead of requiring double-click.
- **Codex panel UX and layout**: Updated codex panel markup and styling (`templates/panel-codex.hbs`, `styles/panel-codex.css`, `scripts/panel-codex.js`) for improved entry readability, toolbar actions, and category/entry visibility behavior.
- **GM visibility controls in entries**: Added direct per-entry visibility eye toggles in Codex and Quest entry toolbars (`templates/panel-codex.hbs`, `templates/partials/quest-entry.hbs`) with supporting panel logic.

### Fixed
- **Codex pin navigation reliability**: Codex pin handlers now consistently switch to the Codex tray view, render the panel, and focus/highlight the matching entry after click.


## [13.1.13]

### Changed
- **Quest / objective pins – tray navigation**: Double-clicking a quest or objective pin (Blacksmith **`doubleClick`**) opens the Squire tray on the **Quests** view, switches the **quest status filter** (Active / Available / Complete) so the target quest is in a **visible** section, then scrolls to the entry and applies the existing highlight behavior. Pin handling no longer relies on a strict **`moduleId`** match when the pin is clearly a Squire quest/objective pin (type or **`config.questUuid`**).

### Fixed
- **Quest tab vs pin status**: Fix for when the panel was on e.g. **Complete** but the pin’s quest lived under **Active** — the code previously treated a quest as “found” if its DOM node existed, even when that status section was hidden. Visibility is now based on the parent **`.quest-section`**, and the handler falls back across status filters until the quest is actually shown.
- **Quest status button switching from pin open**: Double-click pin open now resolves the destination tab from live quest data (`entry.status`) instead of relying only on pin config, then applies the same UI path as clicking a status button (`_applyStatusFilter` + `.quest-status-button.active` sync). This fixes cases where the quest list stayed on the wrong tab even though scroll/highlight logic ran.

## [13.1.12]

### Changed
- **Quest / objective pin styling**: Merges Blacksmith **`pins.getDefaultPinDesign(MODULE.ID, 'quest' | 'objective')`** (Configure Pin “Default for [type]”) into quest design resolution before module setting and page flags. Squire’s legacy brown fill + status stroke is applied **only** when the merged style has **no** `fill` and **no** `stroke`; otherwise appearance is left to the pin tool / defaults. **`updateQuestPinStylesForPage`** no longer overwrites `style` when the pin already has a configured fill or stroke (still updates `config`, `text`, and `tags`). Objective pin creation now respects type defaults for size, shape, image, text options, and style when present. On **`pins.create`**, type defaults also supply **`eventAnimations`**, **`allowDuplicatePins`**, **`lockProportions`**, and **`iconText`** when saved for that type (PinData fields Squire did not previously forward).
- **Objective pin Squire baseline**: When Blacksmith has no saved default for the **`objective`** pin type, new pins use **50×50 circle**, **#8c2d0d** fill, **5px** white border (state-colored stroke on updates), no drop shadow, text below / hover / 100 max chars / 25 chars per line, scale-with-pin off, **event animations** (ripple + `interface-pop-01` on hover; scale-small + `book-open-02` on click; fade + `interface-pop-03` on delete). **`pins.getDefaultPinDesign`** still overrides any of these when the user sets “Default for objective pin”. Quest placement preview uses the same circle size and border width.
- **Pin type migrations removed**: Dropped **`pinTypeMigrationV1`**, **`pinTypeMigrationTaxonomyV2`**, and **`pinTypeMigrationTaxonomyV3`** world settings and all **`ready`** migration loops; creation relies on correct **`pin.type`** plus **`enforceSquirePinTaxonomyType`** when needed.
- **Note “Use as default” + Foundry settings**: **`NotesForm`** **`pins.configure`** calls pass **`defaultSettingKey: notesPinDefaultDesign`** (via **`NOTES_PIN_DEFAULT_DESIGN_SETTING_KEY`**) so Blacksmith’s default-for-type flow lines up with Squire’s **`game.settings`** key, matching the quest panel’s **`questPinDefaultDesign`** pattern.

### Fixed
- **Pin `type` vs Blacksmith taxonomy**: `pin.type` for Squire pins uses the same keys as Blacksmith’s module taxonomy JSON — **`quest`**, **`objective`**, **`note`**, **`codex`** — not `*-pin` suffixes. **`pins.create`**, **`getDefaultPinDesign`**, **`getModuleTaxonomy`**, **`registerPinType`**, list filters, context menus, and note flows use **`getSquirePinType()`** (validated against **`getModuleTaxonomy(MODULE.ID)`** when available) plus **`isSquirePinCategory`** / **`listSquirePinsByKind`** so pins still stored with legacy **`quest-pin`** / **`objective-pin`** / **`note-pin`** strings are still recognized where needed.
- **Pin `type` showing “Quest Pin” / “Objective Pin”**: Saved **`getDefaultPinDesign`** blobs could carry **`type`** as a **display label**; Blacksmith **`pins.create`** can merge that over Squire’s **`quest` / `objective`** key. **`getPinTypeDefaultDesign`** strips **`type`**, **`id`**, and **`moduleId`** from defaults; objective structural merge omits **`type`**; **`enforceSquirePinTaxonomyType`** runs after quest/objective/note **`pins.create`**; internal **`SQUIRE_PIN_TYPE_FIX_MAP`** maps label and legacy strings to taxonomy keys for that enforcement path.

## [13.1.11]

### Changed
- **Pin taxonomy – Blacksmith-owned**: Removed all hardcoded pin tag lists from Squire. Taxonomy (types + tags) is now owned entirely by Blacksmith's global JSON and read at runtime via `pins.getModuleTaxonomy(MODULE.ID)`. Squire no longer calls `registerPinTaxonomy`.
- **Pin type names**: Renamed pin type strings to match Blacksmith's taxonomy keys — `'quest'` → `'quest-pin'`, `'objective'` → `'objective-pin'`, `'coffee-pub-squire-sticky-notes'` → `'note-pin'`. Updated across all creation, filtering, and event-handler code (`utility-quest-pins.js`, `panel-notes.js`, `panel-quest.js`, `quest-pin-events.js`).
- **Pin tags – quest and objective pins**: Quest and objective pins now carry taxonomy-driven tags derived from `questCategory` at creation and on style refresh. `'Main Quest'` → `['quest', 'main']`, `'Side Quest'` → `['quest', 'side']`, etc. Tags are validated against the live Blacksmith taxonomy and fall back gracefully if unavailable.
- **Pin tags – note pins**: Note pins now carry a taxonomy-driven tag derived from the note's visibility flag (`'party'` → `'party'`, `'private'` → `'personal'`), sourced from `getModuleTaxonomy` with fallback. Tag is kept in sync on pin update.
- **Pin taxonomy registration**: Added `registerPinType` calls for all four Squire pin types (`quest-pin`, `objective-pin`, `note-pin`, `codex-pin`) so Blacksmith's UI labels them correctly. `codex-pin` is registered but has no creation code yet.

### Fixed
- **Existing pin migration**: One-time GM-only migration runs on `ready` to rename existing world pins from old type strings to new taxonomy keys. Guarded by a `pinTypeMigrationV1` world setting so it runs exactly once per world.
- **Note pin console spam**: Removed `logPinPackage` debug logging function and all three of its call sites from `panel-notes.js`.

## [13.1.10]

### Fixed
- **Blacksmith bootstrap order**: When Squire’s `ready` ran before Blacksmith finished wiring window globals, `BlacksmithModuleManager.registerModule` and `BlacksmithHookManager.registerHook` could throw on `null`. Squire now `await`s `BlacksmithAPI.waitForReady()` when Blacksmith is active, registers via `game.modules.get('coffee-pub-blacksmith').api.registerModule` with a `BlacksmithModuleManager` fallback, and routes hook registration through `api.HookManager` (with global fallback). The delayed tray `trackModuleTimeout` callback also waits for Blacksmith before registering `controlToken`. See [API: Core Blacksmith](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/API:-Core-Blacksmith).

## [13.1.9]

### Added
- **PanelManager – menubar readiness**: `ensureReadyForMenubar()` and `actorForMenubarFallback()` so Blacksmith menubar actions can bootstrap the tray when `PanelManager.instance` is not ready yet (same actor resolution as delayed init: controlled owned token, first owned token, then assigned character).

### Changed
- **Blacksmith menubar registration**: Dice tray, macros, and quick note tools are registered only after the excluded-user check (they depend on the tray). Explicit `groupOrder: 999` on those tools per Blacksmith menubar API guidance. Calls `renderMenubar(true)` after registration so the bar picks up tools when registration runs later in `ready`.

### Fixed
- **Blacksmith menubar – macros and dice tray**: Fixed `TypeError: Cannot set properties of null (setting 'macrosPanel')` / equivalent dice tray failure when opening from the menubar before delayed tray init or while another `initialize()` was in flight. `openMacros` and `openDiceTray` now await `ensureReadyForMenubar()` and show a clear warning if the tray is unavailable (e.g. excluded user).

## [13.1.8]

### Changed
- **Macros icon**: Replaced macros icon with `fa-solid fa-code` in the tray handle and in the Blacksmith menubar tool registration.
- **Unfavorited heart icon**: Unfavorited (dimmed) heart in Favorites/Character tab now uses the same neutral color and dimness as the prepared and shield icons (`#9f9275` at 0.3 opacity) instead of dimmed red.
- **Icon hover color**: Tray, party panel, and handle icon mouseover color set to `rgba(231, 91, 1, 1.0)` (tray buttons, spell/weapon controls, search clear, party card actions, handle pin/viewcycle/toggle, chevron, pinned quest name).
- **Shield icon hover**: Equipped (non-dimmed) shield icon now uses the same orange hover color instead of staying blue.
- **Dimmed icon hover**: Tray and spell/weapon control icons in dimmed (faded) state now go to full opacity on hover so the hover color is visible.

### Fixed
- **Party panel – portrait and open-sheet clicks**: "Click to share portrait with all players" and "Open character sheet" (feather icon) did nothing when clicked. Listener setup order was corrected so card replacement no longer removes those handlers; portrait and open-sheet listeners are now attached after card replacement.



### Changed
- **Tray panels - shared item structure and styling**: Unified stacked tray item markup and selectors across Favorites, Weapons, Spells, Features, and Inventory to use shared classes (`panel-item`, `panel-item-row`, `panel-item-name`, `panel-item-image-container`, `panel-item-roll-overlay`) and shared `data-item-id` targeting.
- **Item context badges**: Normalized action/components/count display to `panel-item-context` + `panel-item-badge` variants. Action badges are round and color-coded, spell component badges are square and color-coded, and count/use/level values use shared `context-count`.
- **Top panel shells**: Consolidated duplicated tray shell styles for Health, Experience, Abilities, Attributes, GM, Global Filters, Dice Tray, and Macros into one shared rule in `styles/tray.css`.

### Fixed
- **Quest pins – journal permission on reconcile**: Fixed "User lacks permission to update JournalEntryPage" when a player triggered quest pin reconcile (e.g. double-click gather pin flow). `reconcileQuestPins` was writing `pinId`, `sceneId`, and `objectivePins` flags to journal pages on the client; those writes require edit permission. Reconcile now runs only for GMs (`if (!game.user.isGM) return`), so player-triggered reconcile no-ops without throwing.
- **GM Details empty state spacing**: Removed empty header/content gap by hiding the entire GM details panel when no resistances, immunities, or biography data exist.

### Removed
- **Legacy tray item hooks/classes**: Removed unused per-panel item/count class hooks and legacy inline/partial remnants that duplicated shared tray item behavior.


## [13.1.6]

### Changed
- **Tray**: Cleaned up tray CSS (`styles/tray.css`).

### Fixed
- **Codex Panel - Invalid selector on restore**: Fixed `SyntaxError: Failed to execute 'querySelector' on 'Element'` when restoring collapsed category state. Category names stored in `codexCollapsedCategories` can include newlines/whitespace (e.g. from "Characters" / "Browse" UI), making attribute selectors like `[data-category="${category}"]` invalid. Replaced `querySelector` with the same safe approach used elsewhere: select all `.codex-section[data-category]` and find by matching trimmed `data-category` to the stored category.

### Removed
- **Quest pin legacy (Blacksmith migration)**: Removed unused quest pin tooltip template `tooltip-pin-quests-quest.hbs` (only objective tooltip is used, from the tray handle). Removed `themes/quest-pins.json` and `TEMPLATES.TOOLTIP_QUEST_PIN`; pin appearance is fully handled by Blacksmith and module settings.


## [13.1.5]

### Fixed
- **Spells Panel - Undefined spellbook**: Fixed `TypeError: Cannot read properties of undefined (reading 'spell1')` when rendering the spells panel for actors without spell data (e.g. NPCs, loot, vehicles). Added guards for `actor.system.spells` in `_getSpellSlots()` and the spell slot pip click handler.
- **Panel Manager - Token deletion race**: Fixed `TypeError: Cannot read properties of null (reading 'macrosPanel')` and `Cannot read properties of null (reading 'renderPanels')` when deleting a controlled token. Race between `controlToken` and `deleteToken` hooks caused null access. Added abort checks after each `await` in `PanelManager.initialize()` and null guard before `renderPanels` in the `deleteToken` callback.
- **Spells Panel - Duplicate listeners on re-render**: Added `AbortController`-based listener lifecycle so delegated click handlers are torn down before rebind. Prevents stacked handlers, double actions, and gradual memory/performance degradation during frequent panel renders.
- **Features Panel - Duplicate listeners on re-render**: Added `AbortController`-based listener cleanup and panel `destroy()` teardown to prevent listener accumulation and repeated callback execution after multiple renders.
- **Favorites Panel - Duplicate listeners on re-render**: Added centralized listener abort/rebind flow for panel-level and cloned-control listeners, plus explicit `destroy()` cleanup (including context menu close) to prevent stale handlers and retained references.
- **Quest Panel - Incomplete destroy teardown**: Updated `destroy()` to call `_clearQuestPinPlacement()` and abort `_questListenersAbort`, ensuring canvas/window listeners are removed when panel instances are replaced.

## [13.1.4]

### Added
- **Print Character - Cover Page**: Cover page with character name, race • class • level subtitle, and full-width portrait. Uses `page-break-after` for separate first page when printing.
- **Print Character - Biography Section**: Biography tab data after Skills: physical traits (eyes, hair, skin, height, weight, age, gender, faith), character details (race, background, size), personality traits, ideals, bonds, flaws, and biography text.
- **Print Character - Stats & Combat**: Initiative, speed (walk/fly/swim/climb/burrow), hit dice, temporary HP, experience points, saving throws, and trait badges (senses, resistances, armor proficiencies, weapon proficiencies, languages).
- **Print Character - Inventory Extras**: Encumbrance, currency (PP/GP/EP/SP/CP), and dedicated Weapons section (separate from equipment) with damage formulas.
- **Print Character - Image Overflow Fix**: CSS for images inside item descriptions, additional details, biography content, and features so they scale to fit (`max-width: 100%`) and do not overflow.

### Changed
- **Print Character - Cover Subtitle**: Replaced pipe (`|`) with bullet (`•`) between race and class/level on cover page.
- **Print Character - Ability Labels**: Ability Scores section now uses prepared abilities with proper labels (Strength, Dexterity, etc.) from CONFIG.DND5E instead of raw system data.
- **Print Character - Appearance Section**: Removed duplicate Appearance block; physical traits remain in the Biography section grid only.

### Fixed
- **Print Character - ES5 Compatibility**: Replaced nullish coalescing (`??`) and optional chaining (`?.`) in `utility-print-character.js` with ES5-safe patterns to fix SyntaxError in environments that do not support ES2020.
- **Print Character - Missing Ability Labels**: Ability score boxes now display labels (Strength, Dexterity, etc.); template was using `actor.system.abilities` which lacks a `.label` property.

## [13.1.3]

### Added
- **Quest Status Filter Buttons**: Quest tab now uses filter buttons (like Notes) to show one status at a time: Active, Available, Complete. Removed "All" option.
- **Quest Subgroup Headers**: Complete section shows "Succeeded" and "Failed" as subgroup headers instead of expandable title bars.

### Changed
- **Quest Status Labels**: Renamed "In Progress" → "Active", "Not Started" → "Available", "Completed" → "Complete". "Failed" unchanged.
- **Quest Active/Available Sections**: Removed redundant expandable title bars; these sections are always expanded (no collapse).
- **Quest Complete Section**: Merged Failed into Complete; both appear under the Complete button with "Succeeded" and "Failed" subgroup headers. Replaced expandable Complete title bar with subgroup headers.
- **Character Panel Search**: Search term is now persisted and re-applied when stacked panels (Favorites, Weapons, Spells, Features, Inventory) re-render (e.g. 30s cleanup, item drops). Added `reapplySearch()` to restore filtered view after panel refreshes.
- **Quest Pin Sync**: Debounced quest-pin-sync handler (50ms) to reduce rapid successive panel refreshes.

### Fixed
- **Quest Panel Collapse/Expand**: Fixed quests becoming un-expandable after setting an objective active or placing a pin. Duplicate event listeners on re-render caused double-toggle (expand then collapse). Now uses `AbortController` to clear previous listeners before adding new ones.
- **Quest Panel Redundant Renders**: Removed duplicate full re-renders after placing/unplacing quest and objective pins; sync hooks alone now trigger the refresh.

## [13.1.2]
### Added
- Notes now create a note + unplaced pin immediately on open (no draft hiding); "Untitled Note" behavior matches typical note apps.
- Save-and-place flow in Notes window: **Save and Place Pin** launches the canvas placement cursor after save.
- Quick Note tool registered in the Blacksmith menubar (left/general group).
- Unplaced pin support across the notes system (create, update, delete, and configure without a scene).
- Pins API hooks wired for create/place/unplace/update/delete to keep note flags in sync.
- Note edit locks with “being edited” indicators (tray + window). Locks are per-note flags and auto-expire after 30 minutes of idle time.

### Changed
- Notes pin workflow fully migrated to Blacksmith Pins API (create/update/delete/placement/ownership sync).
- Note icon configuration uses Blacksmith `pins.configure()` (legacy NoteIconPicker removed).
- Default note visibility set to **private**.
- Default sticky note pin fill set to `rgba(205, 200, 117, 0.9)` when no user default is set.
- Notes pin defaults now pull from Blacksmith per-user defaults via `pins.getDefaultPinDesign()` with world default fallback.
- Note edit locks now clear on save/close, on client load for the current user, and when a user disconnects.

### Fixed
- Pin configuration now works for unplaced pins (recovery + create-on-demand in note window).
- Prevented pin ownership/visibility desyncs and improved unpin behavior using `unplace`.
- Normalized note icon storage to avoid `fa-solid` spam and `<img>` 404s.
- Reduced log spam and sync loops caused by pin updates.
- Players can save pin design defaults without world-setting permission errors (client-scope defaults).
- Player pin updates for **unplaced** pins now route through GM (prevents world-setting permission errors; GM must be online).
- GM edits no longer convert a player’s private note into a GM private note.
- Early-load settings guard prevents startup errors when `notesJournal` is not yet registered.
- Pin placement/unplacement now reloads the scene so pins disappear/appear immediately.
- Player pin placement now routes through GM, with fallback for older proxy actions.
- Save and Place Pin button reliably triggers the placement flow.

## [13.1.1] 
### Added
- Notes view mode with Edit toggle in the header (view/read-only vs edit).
- Notes list view with dedicated template/layout and view toggle.
- Pin context menu items: View Note, Edit Note, Delete Pin and Note.
- Note form header meta now shows editor avatars, location, and formatted date.

### Changed
- Notes window title now shows "Edit Note" / "View Note" (title shown in header body).
- Notes pin creation sends size, icon, style, ownership consistently; note updates sync pin data.
- Notes styling reorganized with clear Card/List sections and theme-specific blocks.
- Notes CSS loading moved to `styles/default.css` imports (removed runtime injection).
- Removed legacy pin reload workaround now that `pins.update()` handles icon/image swaps.
- Removed unused note pin color constant.

### Fixed
- Note pin placement cursor behavior and pin preview alignment.
- Notes view mode layout to keep content scrollable above tags.
- Removed duplicate note pin text scale writes during pin configuration and note icon updates.
- Player pin placement now routes through a GM socket when direct pin creation is denied.

## [13.1.0] - Sticky Notes

### Added
- **Complete Notes System Redesign**: New card-based notes panel matching Codex and Quest styling
  - Dark theme with transparent content container and bordered cards
  - Header layout: visibility badge (icon-only) | title | action buttons (edit, pin, delete)
  - Footer layout: editor avatars (left) | timestamp (right)
  - Tags displayed at bottom of cards with Codex-style formatting
- **NotesForm Class**: New FormApplication for creating and editing notes
  - Supports both create and edit modes with proper data loading
  - Window title updates dynamically ("New Note" vs "Edit Note: [Title]")
  - Form remembers window size and position
- **Notes Ownership Sync**: GM-mediated ownership updates via Blacksmith sockets with owner/none model
  - Non-GM users can create notes; GM syncs ownership based on visibility
  - Socket handler `squire:updateNoteOwnership` for cross-client synchronization
- **Notes Window Persistence**: Notes form now remembers size and position
- **Notes Footer Avatars**: Note cards display editor avatars instead of author icon
  - Shows multiple editor avatars when note has been edited by multiple users
  - Falls back to author name with icon if no avatars available
- **Notes Filter Toggle**: Collapsible filter section with toggle button
  - Filters can be hidden/shown via filter icon in search bar
  - Matches Codex/Quest filter UX patterns

### Changed
- **Notes Panel Styling**: Complete visual overhaul to match Codex and Quest panels
  - Content container: transparent background, 6px border radius, 2px white border
  - Note cards: dark charcoal background (rgba(0,0,0,0.3)), light borders, golden-brown text
  - Filters: dark background (rgba(0,0,0,0.6)), matching Codex/Quest filter styling
  - Search input: white text on dark background, clear button, filter toggle
  - Tags: red-tinted styling matching Codex/Quest tag appearance
- **Notes Editor**: Switched to Foundry ProseMirror editor for note content
  - Rich text editing with full FoundryVTT editor capabilities
  - Native image handling through editor (drag/drop, paste from clipboard)
- **Notes Form Layout**: Complete redesign matching XP window patterns
  - Header section with banner image background and circular portrait/icon
  - Title input in header with meta information
  - Visibility toggle switch in header controls
  - Sectioned body with collapsible headers (CONTENT, TAGS, etc.)
  - Styled form actions footer with Save/Cancel buttons
- **Notes Visibility UI**: Replaced dropdown with full-width icon+label button group
  - Three buttons: All, Party, Private with icons
  - Active state highlighting with golden-brown accent
  - Matches modern UI patterns from other Blacksmith modules
- **Notes Filters**: Codex/Quest-style filter UX with clear button and tag cloud toggle
  - Clear search button (X icon) that resets search and filters
  - Filter toggle button to show/hide filter section
  - Tag cloud with clickable tags for filtering
  - Scene filter dropdown (when scenes available)
- **Tags Normalization**: Notes tags forced to uppercase for consistent filtering
  - Tags displayed in uppercase on cards and in filter cloud
  - Tag matching is case-insensitive but display is normalized
- **Note Header Image**: Uses first note image as header portrait when available
  - Circular portrait in form header shows note's first image
  - Falls back to icon if no image present
- **Image Handling**: Removed custom image upload UI in favor of editor-native behavior
  - Images handled directly through ProseMirror editor
  - Drag-and-drop and clipboard paste supported
  - No separate image upload section in form
- **Note Card Layout**: Reorganized card structure for better information hierarchy
  - Actions moved to header (right side) for quick access
  - Footer moved after tags for better visual flow
  - Visibility badge icon-only (no text) positioned before title
  - Removed separate image display section (images in content only)

### Fixed
- **Notes Filters**: Tag filtering now uses precomputed tag CSV and additive matching
  - Tags stored as comma-separated string in data attribute for efficient filtering
  - Multiple tag selection works correctly with additive logic
- **Notes Clear Search**: Clear button now resets search and filters
  - Properly clears search input and resets all filter states
  - Button disabled state when search is empty
- **Notes Tag Interactions**: Clicking a note tag filters by that tag
  - Tag clicks in cards and filter cloud properly update filter state
  - Active tag highlighting shows selected filters
- **Notes Panel Refresh**: Panel now refreshes automatically on note create/update/delete
  - Hooks registered for `createJournalEntryPage` and `deleteJournalEntryPage`
  - Panel refreshes when notes are modified via form or journal
- **Notes Form Editing**: Edit mode properly loads existing note data
  - Title, content, tags, visibility, and location correctly populated
  - Image extraction from content works for editing
  - Ownership updates correctly when visibility changes (GM only)


## [13.0.8] - Settings Scope Migration

### Changed
- **Settings Scope Migration**: Converted 36 user preference settings from `client` scope to `user` scope for cross-device synchronization
  - User preferences now sync across devices when logging in from different browsers or computers
  - Settings affected include:
    - Tab visibility settings (Party, Notes, Codex, Quests)
    - Panel visibility settings (Experience, Party Stats, Health, Abilities, Stats, Dice Tray, Macros)
    - Handle display settings (Conditions, Primary/Secondary Stats, Favorites, Health Bar, Dice Tray Icon, Macros Icon)
    - Panel visibility preferences (Favorites, Weapons, Spells, Inventory, Features)
    - Filter states (Prepared Spells, Equipped Weapons/Inventory, Favorites filters)
    - View modes (Default Tab, View Mode)
    - User macros and favorite macros
    - Quest pin text display preference
    - Hide Foundry hotbar preference
  - Device-specific settings remain as `client` scope (window positions, sizes, offsets, collapsed states, sound paths)
  - This change ensures user preferences follow them across all devices while maintaining device-specific UI state

## [13.0.7] - Macro Drag & Drop Improvements

### Fixed
- **Macro Window Layout**: Fixed macros window content not filling the entire container
  - Updated CSS in `window-macros.css` to ensure `macros-content` expands to fill `panel-container`
  - Changed height from `auto` to `100%` for proper flexbox expansion
  - Content now properly fills the window without empty space at the bottom
- **Internal Drag Detection**: Fixed drop target showing during internal macro reordering
  - Added `isInternalDrag` flag tracking to distinguish internal vs external drags
  - Drop target (green border and last slot highlight) now only appears for external macro drags
  - Internal reordering no longer triggers the drop target visual feedback

### Changed
- **Simplified Macro Drop System**: Completely refactored macro drag-and-drop for better reliability
  - Removed complex `showAddSlot` logic with timeouts and multiple state management paths
  - Simplified to window-wide drop target approach: drag anywhere over window shows drop target
  - External macros always add to the last slot regardless of where dropped
  - Internal reordering still works per-slot (drag from one slot to another)
- **Drop Target Visual Feedback**: Improved visual feedback for external macro drops
  - Added green dotted border overlay (`::before` pseudo-element) on window/panel when dragging external macros
  - Added green glow highlight on last slot to indicate where macro will be added
  - Visual feedback uses overlay approach to prevent content shifting
  - Drop target only appears for external macro drags, not internal reordering

### Technical
- **Code Cleanup**: Removed unused `showAddSlot` state management and related cleanup handlers
- **Event Handling**: Improved drag event handlers with better state tracking and cleanup
- **CSS Organization**: Identified duplicate CSS definitions between `panel-macros.css` and `window-macros.css` (documented in TODO.md for future cleanup)

## [13.0.6] 

### Fixed
- **PanelManager jQuery Method Error**: Fixed `PanelManager.element.addClass is not a function` error
  - Replaced jQuery `.addClass('expanded')` with native DOM `classList.add('expanded')` in `manager-panel.js` (line 2178)
  - Error occurred when restoring expanded state after token selection changes
  - Now uses consistent native DOM methods matching other parts of the codebase

## [13.0.5] 

### Changed
- **Menubar Tools**: Update our menubar tools sto support the changes to the blacksmith API.


## [13.0.4] - Build Fix
### Fixed
- forgot to include the new resources folder with the light source mapping.

## [13.0.3] - Event Listener Fixes & jQuery Migration

### Fixed
- **Duplicate Event Listeners in Weapons Panel**: Fixed item/weapon action buttons triggering multiple times when clicked
  - Implemented proper event listener management in `panel-weapons.js`
  - Added `_eventHandlers` array to store handler references for cleanup
  - Updated `_removeEventListeners()` to explicitly remove stored handlers using `removeEventListener`
  - Modified `_activateListeners()` to store handler references before adding them
  - Prevents accumulation of duplicate listeners on panel re-renders
- **Duplicate Event Listeners in Inventory Panel**: Fixed inventory item action buttons triggering multiple times when clicked
  - Implemented proper event listener management in `panel-inventory.js`
  - Added `_eventHandlers` array to store handler references for cleanup
  - Updated `_removeEventListeners()` to explicitly remove stored handlers using `removeEventListener`
  - Modified `_activateListeners()` to store handler references before adding them
  - Prevents accumulation of duplicate listeners on panel re-renders
  - Action buttons (use, equip, favorite, send) now trigger only once per click
- **Light Icon State Synchronization**: Fixed light icons sometimes showing incorrect state
  - Simplified to use actor flag as single source of truth (matching favorites pattern)
  - Removed token state checking that caused timing issues
  - Icons now reliably reflect active light source state
- **Quest Entry Expand/Collapse Button**: Fixed quest entry expand/collapse button not working
  - Updated `_activateListeners()` in `panel-quest.js` to use `getNativeElement()` helper for consistency
  - Fixed event handler to properly stop propagation and prevent header click handler interference
  - Quest entries now properly expand and collapse when clicking the chevron icon
- **Party Panel jQuery Migration**: Completed jQuery to native DOM migration in `panel-party.js`
  - Fixed Dialog callback (line 663) to use native DOM `querySelector()` instead of `html.find()`
  - Migrated GM approval buttons (lines 843-855) to use `querySelectorAll()` and `addEventListener()`
  - Migrated transfer request buttons to native DOM with proper handler attachment tracking
  - Fixed disabled button state (lines 964-965) to use native DOM `disabled` property and `classList`
  - Fixed processing message (lines 1288-1290) to use `createElement()` and `appendChild()` instead of jQuery `append()`
  - All jQuery patterns replaced with native DOM methods for FoundryVTT v13 compatibility
- **Party Panel Syntax Error**: Fixed missing closing parenthesis in `panel-party.js` forEach loop
  - Corrected event handler closure structure for transfer request button handlers
  - File now loads without syntax errors
- **Favorites Panel Async/Await Issues**: Fixed "Cannot read properties of undefined (reading 'forEach')" errors
  - Added missing `await` keywords to all async method calls in `panel-favorites.js`
  - Fixed `_getItems()`, `_getWeapons()`, `_getSpells()`, and `_getFeatures()` calls to properly await results
  - Updated `panel-inventory.js` and `panel-features.js` to return proper object structure when actor is missing
  - Prevents panels from trying to iterate over Promise objects instead of data arrays
- **Favorites Not Removed on Item Deletion**: Fixed favorited items remaining in favorites panel after deletion
  - Updated `deleteItem` hook in `squire.js` to remove deleted items from both panel and handle favorites
  - Added favorites panel refresh when items are deleted
  - Ensures favorites list stays synchronized with actual actor items
- **Favoriting Performance**: Fixed favoriting operations taking 3-10 seconds to update icons
  - Removed duplicate `_getItems()`, `_getWeapons()`, `_getSpells()`, and `_getFeatures()` calls from heart icon handlers
  - `manageFavorite()` already refreshes all panels, making duplicate calls redundant
  - Favoriting is now near-instant instead of taking several seconds
- **Event Propagation Issues**: Fixed multiple click events firing when clicking icons in favorites panel
  - Added `event.preventDefault()` and `event.stopPropagation()` to all icon handlers in favorites panel
  - Added processing guards to light icon handlers to prevent multiple rapid clicks
  - Applied fixes to light, heart, shield, sun, feather, and roll overlay handlers
  - Prevents "Item does not exist" errors from multiple consumption attempts
  - Applied same fixes to inventory and weapons panels for consistency
- **CharactersWindow onClose Callback**: Fixed "Cannot set properties of undefined (setting 'onClose')" error
  - Added `onClose` callback support to `CharactersWindow` constructor
  - Overrode `close()` method to call `onClose` callback if provided
  - Updated `panel-inventory.js` to pass `onClose` through constructor instead of accessing non-existent `app` property
- **mergeObject Deprecation Warnings**: Fixed deprecation warnings for global `mergeObject` access
  - Updated `panel-codex.js` and `window-quest.js` to use `foundry.utils.mergeObject` instead of global `mergeObject`
  - All files now use namespaced FoundryVTT v13 API

### Changed
- **Inventory Panel**: Added light icon support with state management
  - Light icons appear before shield icon in item buttons
  - Icons update automatically when light state changes
  - Integrated with existing favorite and equipped state management
- **Weapons Panel**: Added light icon support matching inventory panel functionality
  - Light icons for weapons that are light sources (e.g., Flame Tongue, Sun Blade)
  - Same visual feedback and toggle behavior as inventory panel
- **Favorites Panel**: Added light icon support for favorited light sources
  - Consistent behavior across all panels
  - Light state synchronized with actor flags
- **Quest Panel**: Improved event handler consistency
  - Updated to use `getNativeElement()` helper method for jQuery detection
  - Standardized with other migrated panels for better maintainability
- **Party Panel**: Complete jQuery to native DOM migration
  - All Dialog callbacks now use native DOM methods
  - Event handlers use `addEventListener()` with proper cleanup tracking
  - Button state management uses native DOM properties (`disabled`, `classList`)
  - Message creation uses `createElement()` and `appendChild()` instead of jQuery

### Added
- **Token Lighting System**: Comprehensive light source management for items and weapons
  - New light icon in inventory, weapons, and favorites panels for items that can be used as light sources
  - Light icon appears orange/yellow when light is active, faded when inactive
  - Clicking light icon toggles light on/off for player's token
  - Switching between different light sources automatically replaces the previous light
  - Light state persists across sessions using actor flags
- **Light Sources Configuration**: New `resources/light-sources.json` file defining all available light sources
  - Supports all FoundryVTT light configuration fields (dim, bright, angle, color, alpha, animation, etc.)
  - Includes base light sources: torch, candle, lamp, lantern, oil
  - Includes magical light sources: driftglobe, moon-touched sword, flame tongue, sun blade, holy avenger, lightbringer, gem of brightness, midnight oil
  - Each light source can have aliases for name variations (e.g., "Hooded Lantern" vs "Lantern, Hooded")
  - `consumable` field (boolean) to mark items that should be consumed when used
  - `actionable` field (boolean) to mark items that should trigger their action when light is activated
- **Fuzzy Matching**: Base light source fallback system
  - When `tokenLightingFuzzyMatch` setting is enabled, items with light-related keywords automatically match base light sources
  - Supports fuzzy matching for: candle, lantern, oil, lamp
  - Only activates when no exact match is found (last resort)
- **Light Utility Module**: New `scripts/utility-lights.js` with comprehensive light management
  - `LightUtility` class for all light-related operations
  - Name normalization for case-insensitive, punctuation-agnostic matching
  - Alias support for handling item name variations
  - Actor flag-based persistence for active light source tracking
  - Token light application and removal with full configuration support
- **Settings Integration**: Three new world settings for light system
  - `tokenLightingFuzzyMatch`: Enable fuzzy matching for base light sources (default: true)
  - `tokenLightingConsumeResource`: Consume items when light is used (default: false)
  - `tokenLightingLinktoAction`: Trigger item action when light is activated (default: false)
- **Quest System Architecture Documentation**: Created comprehensive `overview-quests.md` documentation
  - Documents the complete quest system architecture for reuse by other modules
  - Covers core design philosophy (journal-based storage, HTML state markers, scene pin integration)
  - Details all architecture components (QuestParser, QuestForm, QuestPanel, QuestPin)
  - Explains data flow for quest creation, display, completion, and pin management
  - Documents key design patterns (parser-based architecture, state-based tasks, hash-based numbering)
  - Provides template structure documentation and integration points
  - Includes best practices, extension points, and migration considerations
  - Follows the same format as `overview-codex.md` for consistency

### Technical Improvements
- **jQuery Migration Progress**: Continued migration from jQuery to native DOM methods
  - `panel-party.js`: Fully migrated all remaining jQuery usage (Dialog callbacks, button handlers, DOM manipulation)
  - `panel-quest.js`: Standardized jQuery detection using `getNativeElement()` helper
  - `panel-experience.js`: Complete jQuery to native DOM migration
    - Replaced all jQuery methods (`.find()`, `.html()`, `.click()`, `.addClass()`, `.toggleClass()`, `.hasClass()`, `.css()`)
    - Added `getNativeElement()` helper usage for consistent jQuery detection
    - Converted event handlers to use `addEventListener()` with proper null checks
    - Matches migration pattern used in `panel-stats.js` for consistency
  - `panel-party-stats.js`: Complete jQuery to native DOM migration
    - Removed jQuery detection pattern (`instanceof jQuery`)
    - Replaced `.find()` and `.html()` with native DOM equivalents
    - Converted `.length` check to native DOM null check
    - Simplified code by removing jQuery dependency
  - All migrated files now use consistent patterns for jQuery detection and native DOM operations
  - Improved code consistency and maintainability across panel files
  - **All standard panels now fully migrated** - jQuery usage eliminated from all panel files
- **jQuery Detection Pattern Audit**: Completed comprehensive audit of all jQuery detection patterns
  - Reviewed all files for unnecessary detection patterns on `querySelector()` results
  - Verified all remaining jQuery detection patterns are necessary and correctly placed
  - Updated JSDoc comments for accuracy (`panel-codex.js`)
  - **Result:** All detection patterns are necessary for FoundryVTT v13 compatibility
  - No unnecessary patterns found - codebase follows best practices
- **Event Handler Optimization**: Improved event handling across all panels
  - Removed duplicate data fetching calls that were causing performance issues
  - Added proper event propagation control to prevent multiple click events
  - Implemented processing guards to prevent rapid-fire clicks on async operations
  - Enhanced error handling for deleted items and missing actors

## [13.0.2] - Panel Normalization & Bug Fixes

### Changed
- **Panel CSS Normalization**: Refactored all collapsible panels to use shared CSS classes and IDs
  - Created normalized `.tray-panel-content` class for all panel content containers
  - Standardized toggle icons with IDs (`#gm-toggle`, `#abilities-toggle`, `#stats-toggle`, `#macros-toggle`, `#dicetray-toggle`, `#exp-toggle`, `#health-toggle`)
  - Added centralized CSS rules in `common.css` for consistent panel behavior
  - Removed duplicate CSS from individual panel stylesheets (abilities, stats, macros, dicetray, experience, health, GM)
  - Updated all panel templates to use IDs and shared content class
  - Panels now share consistent expand/collapse animations and styling
- **Panel Structure Refactoring**: Updated panel templates and JavaScript to use normalized pattern
  - All panels now use `id="[panel]-content"` and `class="tray-panel-content"` for content areas
  - All toggle icons use `id="[panel]-toggle"` for consistent targeting
  - JavaScript updated to query by IDs instead of classes
  - Health panel refactored to match normalized pattern

### Fixed
- **Stats Panel Animation**: Fixed expand/collapse animation visual inconsistencies
  - Corrected chevron positioning and layout to match abilities panel
  - Fixed CSS `display`, `position`, `width`, and `height` properties for `.stats-toggle`
  - Chevron now properly positioned and rotates correctly
- **GM Tools Content Scrolling**: Fixed GM Tools panel content not scrolling when larger than container
  - Added `overflow-y: auto` and `overflow-x: hidden` to `.tray-panel-content` in GM panel
  - Content now scrolls properly when exceeding container height
- **Macro Panel Content Scrolling**: Fixed Macro panel content not scrolling when larger than container
  - Added `max-height: 200px`, `overflow-y: auto`, and `overflow-x: hidden` to macro panel content
  - Macros list now scrolls when there are many macros
- **Panel Collapse/Expand Issues**: Fixed panels not collapsing/expanding after CSS normalization
  - Fixed GM panel inverted toggle logic (`isCollapsed` assignment corrected)
  - Fixed dice tray duplicate listeners by cloning `trayTitle` element
  - Fixed health panel not using normalized CSS (refactored to use IDs and shared class)
  - All panels now properly collapse and expand with consistent animations
- **Health Panel Controls Layout**: Fixed health panel controls not filling width and buttons not flexing
  - Added `width: 100%` to `.hp-controls` container
  - Added `flex: 1` to `.hp-btn` buttons for equal width distribution
  - Added `flex: 1` with `min-width: 60px` to `.hp-amount` input
  - Controls now properly fill tray width and buttons expand correctly
- **Ability Roll API Errors**: Fixed `Error: One of original or other are not Objects!` when rolling ability checks
  - Updated `rollAbilityCheck` and `rollSavingThrow` calls to use correct D&D5e v5.2.2 API format
  - Changed from string parameter to object with `ability` property: `{ ability: abilityKey }`
  - Applied fix to both `panel-abilities.js` and `panel-character.js`
- **Ability Save Method**: Fixed `TypeError: this.actor.rollAbilitySave is not a function`
  - Changed `rollAbilitySave` to `rollSavingThrow` (correct method name in D&D5e v5.2.2)
  - Updated both ability panel and character panel save handlers
- **Double-Click Issue**: Fixed ability buttons triggering duplicate roll dialogs
  - Added button cloning in `panel-character.js` to prevent duplicate event listeners
  - Cloned toggle button in `panel-abilities.js` to prevent duplicate toggle listeners
  - Ensures clean event handler setup when `_activateListeners` is called multiple times
- **Health Panel Update Error**: Fixed `TypeError: this.element?.find is not a function` in `_onActorUpdate`
  - Migrated remaining jQuery code in `panel-character.js._onActorUpdate()` to native DOM
  - Replaced `.find()` with `querySelector()` using `getNativeElement()` helper
  - Replaced `.css()` with direct `style.height` assignment
  - Replaced `.append()` with `createElement()` and `appendChild()`
  - Replaced `.remove()` with native `remove()` method

## [13.0.1] - Quick fix

### Changed
- Added the themes folder to the release.yml

## [13.0.0] - v13 Migration

### Important Notice
- **FoundryVTT v13 Required**: This version requires FoundryVTT v13 or later
- **D&D5e v5.1+ Required**: This version requires D&D5e system v5.1 or later
- **Breaking Changes**: All deprecated APIs have been migrated to new namespaced APIs

### Added
- **API Helper Functions**: Created centralized helper functions in `scripts/helpers.js` for FoundryVTT v13 namespaced APIs
  - `renderTemplate()`: Wraps `foundry.applications.handlebars.renderTemplate`
  - `getTextEditor()`: Wraps `foundry.applications.ux.TextEditor.implementation`
  - `getContextMenu()`: Wraps `foundry.applications.ux.ContextMenu.implementation`
- **Quest Pin Configuration System**: Externalized quest pin appearance configuration to `themes/quest-pins.json`
  - Hybrid structure with shared properties and type-specific overrides (quest/objective)
  - Supports theming and easier maintenance without code changes
  - All visual properties (dimensions, colors, fonts, icons, offsets, shapes) are now configurable
- **Handlebars Partial Registration**: Implemented asynchronous partial registration system for handle components
  - Ensures partials are available before template rendering
  - Prevents "partial not found" errors during module initialization
  - Supports `handle-character-portrait` and other handle partials

### Changed
- **FoundryVTT v13 API Migration**: Updated all deprecated global API access to namespaced versions
  - `renderTemplate` → `foundry.applications.handlebars.renderTemplate` (via helper)
  - `TextEditor` → `foundry.applications.ux.TextEditor.implementation` (via helper)
  - `ContextMenu` → `foundry.applications.ux.ContextMenu.implementation` (via helper)
  - `JournalTextPageSheet.activateListeners` → `foundry.applications.sheets.JournalTextPageSheet.activateListeners`
- **D&D5e v5.1+ API Migration**: Updated spell data and movement type access
  - `spell.system.preparation.mode` → `spell.system.method`
  - `spell.system.preparation.prepared` → `spell.system.prepared`
  - `CONFIG.DND5E.movementTypes[type]` → `CONFIG.DND5E.movementTypes[type].label` (with fallback for legacy string values)
- **jQuery to Native DOM Migration**: Replaced all jQuery usage with native DOM methods
  - `scripts/panel-macros.js`: Migrated `.find()`, `.on()`, `.off()`, `.each()`, `.toggleClass()`, `.hasClass()`, `.css()`, `.html()`, `.val()`, `.append()`, `.remove()` to native equivalents
  - `scripts/panel-health.js`: Migrated all jQuery selectors and methods to native DOM
  - `scripts/panel-dicetray.js`: Migrated all jQuery selectors and methods to native DOM
  - `scripts/panel-stats.js`: Migrated all jQuery selectors and methods to native DOM
  - `scripts/panel-abilities.js`: Migrated all jQuery selectors and methods to native DOM
- **Context Menu API**: Updated context menus to use native DOM elements instead of jQuery
  - Added `{ jQuery: false }` option to ContextMenu constructor
  - Updated callbacks to use `li.dataset.itemId` instead of `$(li).data('item-id')`
- **Quest Pin Font Awesome**: Migrated to Font Awesome 6 Pro
  - Updated font family from `"FontAwesome"` to `"Font Awesome 6 Pro"`
  - Added `fontWeight: '900'` to PIXI.Text icon styles to render solid icons
  - Made font weight configurable via `quest-pins.json`
- **Quest Pin Configuration**: Refactored from hardcoded values to JSON-based configuration
  - All pin appearance values now load from `themes/quest-pins.json`
  - Game settings still override JSON config values (maintains backward compatibility)
  - Scale factor applies to all dimensions except title vertical offset

### Fixed
- **Window Rendering Errors**: Fixed `Cannot read properties of undefined (reading 'parentElement')` errors
  - Added `_activateCoreListeners` override in `window-macros.js`, `window-health.js`, and `window-dicetray.js`
  - Prevents FoundryVTT's default form listener activation for non-form windows
  - Wrapped `super.activateListeners(html)` in try-catch blocks for graceful error handling
- **Panel jQuery Errors**: Fixed `panel.find is not a function` errors in all panels
  - Migrated all jQuery selectors to native DOM `querySelector()` and `querySelectorAll()`
  - Replaced jQuery event handlers with native `addEventListener()` and `removeEventListener()`
  - Updated DOM manipulation to use native methods (`classList`, `style`, `innerHTML`, `value`, etc.)
- **Quest Pin Hide Button**: Fixed `TypeError: Cannot read properties of null (reading 'classList')` when clicking "hide quest pins"
  - Added fallback to `newButton` if `event.currentTarget` is null
  - Added null checks before accessing `classList` on icon element
- **Handle Button Actions**: Fixed handle buttons (pin, toggle tray, etc.) not working
  - Corrected variable references after element cloning (`handle` → `handleElement`)
  - Fixed "pin" button `classList` access with proper null checks
  - Extracted `toggleTray()` helper function to reduce duplication
  - Added dedicated event listener for toggle tray button separate from general handle click
  - Updated `toggleTray()` to use correct tray element reference
- **Condition Management**: Fixed multiple issues with condition/effect management
  - Improved condition icon loading to check multiple properties (`icon`, `img`, `image`) from `CONFIG.DND5E.conditionTypes`
  - Added fallback paths for common D&D 5e conditions
  - Added `onerror` handler to condition `<img>` tags for graceful fallback
  - Fixed `DataModelValidationError: ActiveEffect5e validation errors: name: may not be undefined`
    - Ensured `name` and `icon` properties are always defined when creating `ActiveEffect` documents
    - Added fallback logic: `condition.label || condition.name || conditionId` for name
  - Fixed `TypeError: Cannot read properties of null (reading 'classList')` in condition management
    - Stored `e.currentTarget` reference before async operations
    - Added null checks before accessing `classList`
- **Quest Pin Icons**: Fixed quest pins on canvas no longer showing icons
  - Updated Font Awesome font family name to match v6
  - Added `fontWeight: '900'` to ensure solid icon rendering
  - Made font weight configurable in JSON for future customization
- **Handlebars Partial Error**: Fixed `Uncaught (in promise) Error: The partial handle-character-portrait could not be found` on first player load
  - Added safeguard in `createTray()` to ensure partial is registered before rendering
  - Fetches and registers partial if not already present

### Technical Improvements
- **Code Organization**: Centralized API access through helper functions for easier future migrations
- **Error Handling**: Enhanced error handling with null checks and fallback logic throughout
- **Event Delegation**: Improved event handling using native DOM methods and proper event delegation
- **Configuration Management**: Externalized hardcoded values to JSON for better maintainability and theming support
- **Asynchronous Safety**: Added safeguards for race conditions during module initialization and partial loading

## [12.1.14] - Final v12 Release

### Important Notice
- **FINAL v12 RELEASE:** This is the final build of Coffee Pub Squire compatible with FoundryVTT v12
- **v13 Migration:** All future builds will require FoundryVTT v13 or later
- **Breaking Changes:** Users must upgrade to FoundryVTT v13 to use future versions of this module

## [12.1.13] - Character Panel Render Safety Fix

### Fixed
- **Character Panel Render Crash**: Fixed `TypeError: Cannot read properties of null (reading 'find')` error in `CharacterPanel.render()` method
  - Added comprehensive safety checks after async operations to validate `this.element` exists and is a valid jQuery object
  - Added validation for character panel container existence in DOM before attempting DOM manipulation
  - Prevents crashes when element becomes null during async operations (TextEditor.enrichHTML, renderTemplate)
  - Added graceful error handling with early returns when element is invalid

### Added
- **Render Cancellation System**: Implemented render cancellation flag to prevent race conditions
  - Added `_renderInProgress` flag and `_renderCancellationToken` tracking to prevent overlapping renders
  - Cancels stale renders when new render starts, preventing race conditions during rapid token selection
  - Ensures only the most recent render completes, preventing UI inconsistencies
  - Added `try/finally` block to guarantee render flag is always cleared, even on errors

### Changed
- **Error Handling**: Enhanced `CharacterPanel.render()` with comprehensive validation and error logging
  - Added validation checks after async operations to ensure element is still valid before DOM manipulation
  - Added error logging using Blacksmith API for better debugging when render issues occur
  - Improved error messages with actor context (actorId, actorName) for easier troubleshooting

### Technical Improvements
- **Memory Safety**: Verified no memory leaks introduced - all new properties are primitives (boolean, Symbol) that are properly garbage collected
- **Performance**: Improved performance by preventing wasted async computation and DOM manipulation when element is invalid
- **Race Condition Prevention**: Implemented token-based cancellation system to prevent overlapping renders from interfering with each other
- **Code Quality**: Removed redundant flag clearing (finally block handles cleanup), improved code clarity



## [12.1.12] - Auto-Favor Actions for NPCs

### Fixed
- **NPC Auto-Favoring**: Fixed auto-favoring not working when items were created on NPCs before the panel was initialized
  - Updated `createItem` hook to trigger `initializeNpcFavorites` for NPCs even when panel isn't active
  - Added deferred execution pattern using `Promise.resolve().then()` to prevent race conditions during actor/item creation
  - Re-fetches actor to ensure latest state before initializing favorites
  - Added duplicate work prevention to avoid re-initializing if favorites already exist
- **Item Creation Race Conditions**: Fixed potential race conditions when items are created as part of actor creation by deferring auto-favor initialization until after synchronous hook cycle completes

### Changed
- **Error Handling**: Enhanced `createItem` hook with comprehensive try-catch error handling to prevent hook failures from breaking other functionality
- **Safety Checks**: Added validation for item and parent existence before processing in `createItem` hook

### Technical Improvements
- **Deferred Execution**: Implemented microtask-based deferred execution to ensure items are fully initialized before auto-favoring logic runs
- **Actor State Verification**: Added actor re-fetch and state verification to ensure accurate favorite initialization

## [12.1.11] - Timer Tracking & Memory Leak Fixes

### Added
- **Timer Utilities**: Introduced `scripts/timer-utils.js` with shared helpers (`trackModuleTimeout`, `trackModuleInterval`, `moduleDelay`, etc.) so every timeout/interval is registered and automatically cleaned up during `cleanupModule()`.

### Changed
- **Global Timer Usage**: Updated `squire.js`, `manager-panel.js`, quest panels, notes/codex/macro panels, quest pins, helpers, and transfer flows to use the new timer helpers, ensuring consistent cleanup and easier diagnostics.
- **Cleanup Module**: Replaced the zero-delay `setInterval(() => {}, 0)` sweep with targeted `clearAllModuleTimers()` plus tracked animation-frame cancellation to avoid spawning a runaway interval.

### Fixed
- **Canvas Selection Leak**: Wrapped `canvas.selectObjects` only once per session and restored the native method during cleanup so scene swaps no longer stack wrappers or timers.
- **Quest Pin Drags**: Added `_forceEndDrag()` plus PIXI removal hooks to guarantee document-level `pointermove`/`pointerup` listeners are removed even when pins are deleted or scenes change mid-drag; hover tooltips now auto-hide on drag start/end.
- **Quest Tooltips**: Added auto-hide timers and proper cancellation, preventing hover tooltips from lingering indefinitely when events are missed.

## [12.1.10] - Party Stats Panel Improvements

### Changed
- **Party Stats Panel**: Updated MVP leaderboard to use Blacksmith lifetime data, removing the obsolete stats code path.

## [12.1.9] - Multi-Select Performance Improvements & Name Fixes

### Added
- **GM Details Panel**: Introduced a dedicated, collapsible GM-only panel that surfaces resistances, immunities, and enriched biography content with a fixed-height, scrollable layout.
- **GM Panel State Setting**: Added a persistent `isGmPanelCollapsed` client setting so each GM retains their preferred panel state between sessions.
- **Token Display Helper**: New shared utility normalises token display names (token document → token → prototype → actor) for use across panels and handle logic.

### Changed
- **Panel Manager Lifecycle**: Updated `PanelManager` to instantiate, track, and destroy the new `GmPanel`, including shared caching via `PanelManager.setGmDetails` and tray template updates.
- **Stylesheet Organization**: Hooked the new GM panel stylesheet into the default bundle to keep styling centralized and consistent.
- **Handle & Panel Names**: Character panel, handle manager, health panel, and tray headers now rely on the token display helper so UI labels always match placed tokens.
- **Party Panel Namespace**: Renamed party panel classes and selectors to a dedicated `party-` prefix, avoiding CSS bleed from the character panel.
- **Party Feather Click**: Suppressed tray re-initialization when the party-view feather icon opens an actor sheet so the tray no longer jumps actors.
- **Party Stats Panel**: Replaced the legacy combat/session aggregates with a streamlined MVP leaderboard sourced from Blacksmith lifetime data, removing the obsolete stats code path.

### Fixed
- **Multi-Select Performance**: Eliminated 5-10 second lag during multi-token selection with early return optimization
  - Added smart early return check in `_updateHealthPanelFromSelection` to skip expensive operations when nothing changed
  - Prevents unnecessary full panel re-renders, animations, and sounds during rapid multi-select
  - Reduces ~80% of unnecessary DOM operations during multi-token selection
- **Macros Panel Crash**: Fixed "Cannot read properties of null" error in macros panel during multi-select
  - Added null safety check to prevent rendering when DOM placeholder doesn't exist
  - Prevents crashes when tray is being rebuilt during rapid token selection events
- **Token Name Display**: Restored token-based naming across handle portrait, party listings, character panel, health, macros, and dice tray panels so custom token labels appear everywhere.

## [12.1.8] - Hook Restoration & Critical Sync Fixes

### Added
- **Critical Hook Restoration**: Restored missing `globalUpdateActor` hook that was causing major synchronization issues
- **Token Deletion Handling**: Restored `globalDeleteToken` hook to prevent tray crashes when tokens are deleted
- **Active Effect Hooks**: Added `createActiveEffect` and `deleteActiveEffect` hooks for proper condition synchronization
- **Comprehensive Hook Audit**: Created detailed audit report identifying 5-6 missing critical hooks
- **Multi-Token Selection Support**: Enhanced `globalControlToken` hook with optimized multi-select handling and debouncing
- **Bulk Selection Tools**: Added canvas selection support for lasso and box selection tools via `globalCanvasReady` enhancement
- **New Token Detection**: Restored `globalCreateToken` hook for automatic handle updates when new tokens are created
- **Auto-Favoriting for NPCs**: Restored automatic favoriting of equipped weapons and prepared spells for NPCs/monsters
- **Pause Game Handling**: Restored `globalPauseGame` hook to prevent stale data after game pause/resume
- **Item Transfer System**: Added "send item" functionality to weapons panel matching inventory panel capabilities
- **Panel Refresh Optimization**: Implemented targeted panel refresh for item transfers (weapons/inventory only) instead of full panel re-render

### Fixed
- **Health Panel Sync**: Health bars now update immediately when HP changes externally (spells, damage, healing)
- **Handle Synchronization**: Handle now refreshes when actor attributes change (AC, level, movement, etc.)
- **Effect Display**: Status effects in handle now update when conditions are added/removed via token HUD
- **Spell Slot Updates**: Spells panel now refreshes when spell slots are modified
- **Token Deletion Crashes**: Tray no longer crashes when active token is deleted, gracefully switches to next available token
- **Memory Leaks**: Removed legacy dead code from panel cleanup methods that was causing hook accumulation
- **Multi-Select Performance**: Fixed 3-5 second lag during multi-token selection with optimized update logic
- **Selection Display Updates**: Fixed selection display not updating properly during rapid token selection
- **Canvas Selection Tools**: Fixed lasso and box selection tools not updating tray display
- **New Token Integration**: Fixed handle not updating when new tokens are created on canvas
- **NPC Equipment Management**: Fixed NPCs/monsters not auto-favoriting equipped weapons and prepared spells
- **Game Pause Issues**: Fixed stale data display after game pause/resume cycles
- **Item Transfer Panel Updates**: Fixed weapons and inventory panels not refreshing after item transfers
- **"New" Badge Display**: Fixed "new" badges not appearing on weapons panel after item transfers
- **Transfer Performance**: Eliminated 5+ second delay during item transfers by optimizing panel refresh logic

### Changed
- **Hook Management**: Migrated to centralized BlacksmithHookManager for consistent hook lifecycle management
- **Panel Lifecycle**: Enhanced PanelManager to properly track and update token references alongside actor references
- **Legacy Code Cleanup**: Removed outdated hook cleanup comments and dead code from panel destroy methods
- **Performance Optimization**: Simplified multi-select logic to eliminate complex debouncing that was causing delays
- **Debug Logging**: Removed excessive console.log statements and replaced with clean, production-ready comments
- **Documentation**: Updated false comments about "moved" or "centralized" hooks to reflect actual architecture
- **Code Quality**: Cleaned up temporary debug comments, keeping only durable, necessary documentation

### Technical Improvements
- **Hook Architecture**: Restored proper hook registration pattern following established BlacksmithHookManager conventions
- **Token Reference Tracking**: Enhanced system to maintain both actor and token references for proper name display
- **Error Prevention**: Added comprehensive null checks and fallbacks in hook implementations
- **Performance**: Eliminated unnecessary re-renders by implementing targeted updates for specific change types
- **Multi-Select Optimization**: Implemented efficient selection handling that scales with token count
- **Canvas Integration**: Enhanced canvas selection tools integration with proper event handling
- **Auto-Favoriting Logic**: Restored intelligent auto-favoriting system for NPCs with compendium safety checks
- **Code Cleanup**: Comprehensive removal of debug logging, false comments, and legacy code references
- **Production Readiness**: Cleaned up all temporary development artifacts for production deployment

## [12.1.7] - Bug Squashing

### Fixed
- **Duplicate Quest Notifications**: Fixed multiple identical quest/objective notifications appearing in menubar when selecting tokens
- **Memory Leaks**: Fixed severe memory leaks caused by PanelManager creating new instances without cleaning up old ones
- **Quest Panel Instance Management**: Made notification IDs global static properties to prevent duplicates across QuestPanel instances
- **Panel Cleanup**: Added proper cleanup of old PanelManager instances before creating new ones to prevent memory accumulation
- **Event Listener Leaks**: Fixed event listeners and hooks not being properly cleaned up when switching between tokens

### Changed
- **Quest Notification System**: QuestPanel now uses static notification IDs instead of instance properties to prevent duplicates
- **PanelManager Lifecycle**: Added `_cleanupOldInstance()` method to properly destroy old instances before creating new ones
- **Memory Management**: Enhanced cleanup to destroy all panel instances (questPanel, characterPanel, etc.) when switching tokens


## [12.1.6] - Item Transfer Improvements

### Added
- **GM Approval System**: New setting to require GM approval for all player-to-player transfers
- **Transfer Request Cards**: Interactive chat cards for transfer requests with Accept/Reject buttons
- **GM Approval Cards**: Dedicated approval interface for GMs with Approve/Deny buttons
- **Transfer Validation**: Items are validated before transfer to ensure they still exist and have sufficient quantity
- **Automatic Expiration**: Transfer requests automatically expire after configurable timeout (10-180 seconds, default 30)
- **Transfer Timeout Setting**: New world setting to configure how long transfer requests remain valid
- **Personalized Messages**: Different chat messages for senders, receivers, and GMs for all transfer outcomes
- **Transfer Status Messages**: Clear feedback for waiting, accepted, rejected, expired, and failed transfers
- **Failure Notifications**: Detailed error messages when transfers fail due to missing items or insufficient quantity
- **Transfer from Tray**: New "Send" icon in inventory panel to initiate transfers via character selection window
- **Character Selection Window**: Reusable window for selecting transfer recipients with resizable interface
- **Actor Type Visualization**: Color-coded borders for different actor types (green=characters, red=monsters, blue=NPCs)
- **Unified Transfer System**: Centralized TransferUtils for consistent transfer behavior across all flows
- **Hostility-Based Classification**: NPCs classified as monsters (red) or friendly NPCs (blue) based on disposition

### Changed
- **Transfer Flow**: Completely redesigned transfer system with proper approval workflows
- **Chat Card System**: All transfer messages now use consistent chat card templates instead of hardcoded HTML
- **Message Targeting**: Improved whisper targeting to ensure correct users receive appropriate messages
- **GM Bypass**: GMs can transfer items between characters without requiring self-approval
- **Transfer Cleanup**: Automatic cleanup of request messages and waiting messages after transfer completion
- **Timer Management**: Background timer system for proactive transfer expiration with proper cleanup
- **Code Architecture**: Extracted transfer logic into reusable TransferUtils module for consistency
- **Character Window Logic**: GMs now see all actor types (characters, monsters, NPCs) while players see only party members
- **Transfer Unification**: Both drag-and-drop and send flows now use identical transfer logic

### Fixed
- **Duplicate Messages**: Fixed GM receiving duplicate transfer complete messages
- **Message Persistence**: Fixed sender "waiting" messages persisting after transfer completion
- **Deleted Item Handling**: Fixed crashes when attempting to transfer deleted items
- **Quantity Validation**: Fixed transfers proceeding when insufficient quantity available
- **Template Errors**: Fixed duplicate closing tags in chat card templates
- **Null Reference Errors**: Added proper null checks and fallbacks for deleted items
- **GM Approval for Offline Players**: Fixed GM not receiving approval cards when target player is offline in send flow
- **Transfer Data Consistency**: Fixed "Transfer request data not found" errors by ensuring proper data structure
- **Code Duplication**: Eliminated duplicate transfer methods across different panels



## [12.1.5] - Bug Squashing

### Fixed
- **Codex Import Template**: Updated codex import to load template from `prompts/prompt-codex.txt` file instead of hardcoded template
- **Rulebooks Replacement**: Codex import now properly replaces `[ADD-RULEBOOKS-HERE]` placeholder with user's default rulebooks setting
- **Build Workflow**: Added `prompts/` folder to GitHub workflow build process to ensure prompt files are included in releases

### Changed
- **Consistent Template Loading**: Both quest and codex imports now use the same dynamic template loading approach
- **Template Management**: Moved codex template from hardcoded JavaScript to external text file for easier maintenance

## [12.1.4] - Bug Squashing

### Added
- **Active Objective Notifications**: QuestPanel now manages active objective notifications using Blacksmith API
- **Quest Notification Management**: Enhanced quest notification system with proper creation, updates, and cleanup
- **Party Panel Integration**: Added party and partyStats panels to PanelManager for improved party management
- **Menubar Tool Registration**: Integrated macros functionality with Blacksmith menubar system

### Changed
- **Menubar Tool Titles**: Updated menubar tool titles for clarity - "Open Dice Tray" → "Dice Tray", "Open Macros" → "Macros"
- **Tray Positioning**: Enhanced CSS positioning to account for Blacksmith menubar interface offset
- **Quest Notification Messages**: Improved clarity of quest notification messages for better user feedback
- **Panel Manager Structure**: Enhanced panel management system with proper party panel integration

### Fixed
- **Tray Layout Issues**: Fixed tray positioning conflicts with Blacksmith menubar interface
- **Quest Notification Cleanup**: Improved quest notification cleanup when module is disabled
- **Panel Registration**: Fixed party and partyStats panel registration in PanelManager
- **Active Objective Management**: Enhanced active objective notification handling with proper ID tracking


## [12.1.3] - Quest Improvements

### Added
- GM notes now display inline with objectives instead of requiring hover tooltips
- GM notes use certificate icon (fa-file-certificate) and golden styling for easy identification
- GM notes are only visible to GMs, maintaining privacy

### Changed
- Objective pins on canvas now display objective text instead of quest title
- Improved objective highlighting with yellow border and background when selected from canvas pins
- Enhanced visual styling for GM notes and treasure indicators

### Fixed
- Objective pins now correctly show the actual objective description rather than generic "Objective X" text
- Improved CSS specificity for treasure and GM note icons


## [12.1.2] - Bug Fixes

### Fixed
- Fixed tag

## [12.1.1] - Bug Fixes

### Fixed
- Fixed tag


## [12.1.0] - MAJOR UPDATE - Blacksmith API Migration

### Added
- **Blacksmith API Integration**: Full migration to use Blacksmith API for enhanced functionality and consistency
- **New Favoriting System**: Completely redesigned favoriting system with separate regular favorites and handle favorites
- **Handle Favorite Toggle**: New square-heart icon in favorites panel to toggle items for handle display
- **Auto-Handle Favorites for NPCs**: NPCs and monsters now automatically add their key abilities to both panel and handle favorites
- **Performance Optimizations**: Dramatically improved favoriting performance with targeted DOM updates instead of full panel re-renders
- **Interactive Spell Slot Management**: GM-only click system for managing spell slot usage with visual feedback
- **Party Health Integration**: Clicking party health bar now opens/populates health panel with entire party data

### Changed
- **Favoriting Architecture**: Separated regular favorites (shows in favorites panel) from handle favorites (shows in handle)
- **Heart Icon Behavior**: Heart icons in all panels now correctly reflect regular favorite status
- **Handle Display Logic**: Handle now only shows items that are explicitly handle-favorited, not all favorites
- **Module Structure**: Reorganized module.json to follow standardized structure with proper field grouping
- **Spell Slot Visual States**: Implemented correct visual representation matching character sheet (filled=available, unfilled=expended)
- **Token Selection System**: Migrated from actor ID-based to token ID-based selection for proper multi-token support

### Fixed
- **Heart Icon State**: Fixed heart icons in inventory, weapons, and spells panels not showing correct favorited state
- **Performance Issues**: Eliminated massive over-rendering that caused favoriting operations to be very slow
- **Handle Favorite Logic**: Fixed handle showing all favorites instead of only handle-favorited items
- **Missing Handlebars Helper**: Added missing `getHandleFavorites` helper for handle template functionality
- **Event Listener Duplication**: Fixed critical event listener duplication issue that caused exponential performance degradation
- **Legacy Auto-Sync Logic**: Removed conflicting auto-sync logic for handle favorites to allow full manual control
- **Visual State Updates**: Fixed heart icon states not updating correctly across all panels after favoriting changes
- **Handle Item Availability**: Added "unavailable" class to handle favorites for unequipped/unprepared items
- **Handle Order Consistency**: Fixed handle favorites order to match panel favorites (with visual reversal for handle rotation)
- **Spell Level Filtering**: Fixed broken spell level filtering in Spells panel by correcting event listener target
- **Spell Slot System**: Implemented interactive spell slot management for GMs with correct visual states and click logic
- **Token Selection Logic**: Fixed token selection in Party tab to use unique token IDs instead of shared actor IDs
- **Monster Name Display**: Fixed Party tab to show specific token names instead of generic actor names
- **Dice Tray Button**: Fixed dice tray button not showing in handle due to typo in template condition
- **Memory Leaks**: Fixed severe hook accumulation causing game slowdown by implementing proper cleanup in all panel destroy methods
- **Duplicate Event Handlers**: Removed duplicate event handlers for conditions button, macro icons, party member icons, and print character button
- **NPC Favorites Initialization**: Fixed TypeError in NPC auto-favorite system when accessing actor collection
- **Party Health Bar Click**: Fixed party overview health bar to properly select all player-owned tokens and populate health panel
- **Handle Favorites Order**: Fixed handle favorites to display in correct order matching panel favorites (reversed for handle rotation)

### Technical Improvements
- **Targeted DOM Updates**: Replaced 4 full panel re-renders with smart DOM updates for 10-20x performance improvement
- **Data Consistency**: Ensured all panel data structures stay synchronized without full re-renders
- **Event Handler Optimization**: Streamlined event handling for favoriting operations
- **Memory Management**: Improved cleanup and data synchronization between panels
- **Namespaced Events**: Implemented proper event namespacing to prevent duplicate event listeners
- **Spell Slot Management**: Added comprehensive spell slot system with visual feedback and real-time updates
- **Token ID System**: Migrated from actor ID-based to token ID-based selection for proper multi-token support
- **Template Condition Fixes**: Corrected Handlebars template conditions for proper conditional rendering
- **Debug Code Cleanup**: Removed verbose debug logging and debug comments for cleaner production code
- **Hook Cleanup System**: Implemented comprehensive destroy methods for all panels to prevent FoundryVTT hook accumulation
- **Module-Level Cleanup**: Added module disable hooks to clean up global hooks and prevent memory leaks
- **Panel Lifecycle Management**: Enhanced PanelManager cleanup to properly destroy all instantiated panels

### Files Modified
- `scripts/panel-favorites.js` - Complete favoriting system overhaul with performance optimizations and NPC auto-favorites
- `scripts/panel-inventory.js` - Updated to check correct favorites flag for heart icon state
- `scripts/panel-spells.js` - Updated to check correct favorites flag for heart icon state and added spell slot management
- `scripts/panel-weapons.js` - Updated to check correct favorites flag for heart icon state
- `scripts/panel-party.js` - Fixed token selection logic, monster name display, and party health bar integration
- `scripts/panel-character.js` - Removed duplicate event handlers and added destroy method for hook cleanup
- `scripts/panel-macros.js` - Removed duplicate event handlers and added destroy method for hook cleanup
- `scripts/panel-party-stats.js` - Added destroy method for hook cleanup
- `scripts/manager-panel.js` - Enhanced cleanup method to destroy all instantiated panels
- `scripts/manager-handle.js` - Removed debug code and optimized event handling
- `scripts/helpers.js` - Added missing `getHandleFavorites` Handlebars helper
- `scripts/squire.js` - Removed verbose debug logging
- `scripts/manager-hooks.js` - Removed debug comments
- `scripts/quest-pin.js` - Added module-level cleanup hooks for global hook management
- `styles/panel-favorites.css` - Added styling for handle favorite toggle icons
- `styles/panel-spells.css` - Added spell slot styling and hover effects
- `styles/tray.css` - Updated handle favorite icon colors for consistency
- `templates/partials/handle-favorites.hbs` - Updated to use handleFavorites data source and added unavailable class logic
- `templates/panel-spells.hbs` - Added spell slot template with proper visual states and order
- `templates/panel-party.hbs` - Fixed monster name display to use token names and token ID selection
- `templates/handle-player.hbs` - Fixed dice tray button display condition
- `templates/handle-codex.hbs` - Fixed dice tray button display condition
- `templates/handle-notes.hbs` - Fixed dice tray button display condition
- `templates/handle-party.hbs` - Fixed dice tray button display condition
- `templates/handle-quest.hbs` - Fixed dice tray button display condition
- `module.json` - Reorganized to follow standardized structure

### Breaking Changes
- **Favoriting System**: The way favorites work has fundamentally changed - regular favorites and handle favorites are now separate
- **Handle Display**: Items in the handle must now be explicitly handle-favorited, not just regular favorites
- **Performance**: Favoriting operations are now much faster but use different update mechanisms

## [12.0.22] - Quest Import/Export Fix & Major Code Refactoring

### Fixed
- **Quest Import/Export Field Mapping**: Fixed critical mismatch between export and import field names that prevented rich quest data from being properly restored
  - **Field Name Alignment**: Import now correctly maps `gmnotes` → `gmHint` and `tasktreasure` → `treasureUnlocks`
  - **Treasure Format Conversion**: Import converts export format `[[treasure]]` to expected format `((treasure))`
  - **Progress Preservation**: Existing quest completion status, task states, visibility settings, and scene pin positions are fully preserved during import
  - **Backward Compatibility**: Import works with both old and new export formats
  - **Files Modified**: `scripts/panel-quest.js` - Updated both `_mergeJournalContent()` and `_generateJournalContentFromImport()` methods

### Technical Improvements
- **Smart Field Mapping**: Import logic now checks for both field name formats to ensure compatibility
- **Rich Data Restoration**: GM notes and task treasure are now properly restored during import operations
- **State Preservation**: Enhanced import system maintains all existing quest progress and player states
- **Format Consistency**: Treasure format is automatically converted to match QuestParser expectations

### Added
- **New HandleManager Class**: Created dedicated `scripts/manager-handle.js` to centralize all handle-related functionality
- **Separation of Concerns**: Cleanly separated handle UI logic from overall tray management
- **Enhanced Event Handling**: Implemented `.off().on()` pattern to prevent duplicate event listeners on re-renders
- **Handle Fade Logic**: Added automatic handle overflow detection with fade effect and resize listener management

### Changed
- **Panel Manager Refactoring**: Moved all handle-related methods and event handlers from `PanelManager` to `HandleManager`
- **Event Handler Consolidation**: Centralized all handle click events, condition management, health interactions, and quest handling
- **Template Improvements**: Fixed typo in `handle-conditions.hbs` ("Condtitions" → "Conditions")
- **Party View Enhancement**: Updated `handle-party.hbs` to properly pass member context to health partials
- **Quest Data Loading**: Enhanced quest parsing with fallback data and improved error handling

### Additional Fixes
- **Initial Handle Data Loading**: Fixed issue where handle data was missing on initial client load by ensuring `HandleManager.updateHandle()` is called after tray creation
- **Duplicate Event Handlers**: Eliminated duplicate click handlers that were causing conflicts between `PanelManager` and `HandleManager`
- **Condition Click Events**: Fixed condition icon clicks (left-click for description, right-click for remove) and conditions button functionality
- **Quest Data Parsing**: Resolved NaN values and missing quest names by improving quest data fallbacks and template handling
- **Party Member Health Bar Clicks**: Fixed party member health bars loading current player's health instead of clicked member's data
- **Import/Export Issues**: Resolved module import errors for `SQUIRE`, `Dialog`, `getBlacksmith`, and other dependencies
- **Handle Fade Errors**: Fixed `TypeError` in `_updateHandleFade` by adding robust null checks and proper initialization timing

### Additional Technical Improvements
- **Code Organization**: Eliminated code duplication between `PanelManager` and `HandleManager`
- **Event Management**: Improved event listener lifecycle management with proper cleanup and reattachment
- **Error Handling**: Enhanced error handling throughout handle operations with comprehensive logging
- **Template System**: Added Handlebars `add` helper for quest objective numbering
- **Memory Management**: Added proper cleanup methods to prevent memory leaks from event listeners

### Files Modified
- `scripts/panel-quest.js` - Updated both `_mergeJournalContent()` and `_generateJournalContentFromImport()` methods
- `scripts/manager-panel.js` - Removed handle-related code, added HandleManager integration
- `scripts/manager-handle.js` - New file with all handle functionality
- `scripts/helpers.js` - Exported `getBlacksmith()` function
- `scripts/squire.js` - Added Handlebars `add` helper
- `templates/partials/handle-conditions.hbs` - Fixed typo
- `templates/handle-party.hbs` - Enhanced member context passing
- `templates/partials/handle-quest.hbs` - Improved quest data handling


## [12.0.21] - Enhanced Codex

### Added
- **Phase 1: Enhanced Add Window with Drag & Drop**
  - Drag & drop functionality for tokens, items, and journal entries to auto-populate form fields
  - Smart auto-population: Name, Category, Tags, and Image fields automatically filled based on dropped entity
  - Category detection: Auto-suggests "Characters" for actors, "Items" for items, and extracts categories from journal content
  - Tag generation: Auto-generates relevant tags based on entity properties (actor type/race/class, item type/rarity)
  - Image handling: Automatically sets entity images and provides preview with remove functionality
  - Enhanced form layout with organized sections and improved visual hierarchy

### Changed
- **Complete UI Redesign**: Modernized codex form with card-based layout, better spacing, and visual hierarchy
- **Form Structure**: Reorganized into logical sections (Basic Information, Content, Tags) with clear headings
- **Label Positioning**: Moved all form labels above their respective form elements for better readability
- **Dropdown System**: Replaced text inputs with smart dropdowns for categories and locations, including existing options and "New" options
- **Window Naming**: Renamed window ID to `codex-entry-window` for clarity and added corresponding CSS class

### Fixed
- **Critical CSS Issue**: Fixed global CSS selectors that were breaking ALL other forms in FoundryVTT by properly namespacing all styles to `.codex-form` only
- **Dropdown Visibility**: Fixed dropdown text not being visible by using FoundryVTT's proven CSS approach with `var(--color-text-light-highlight)` variables
- **Description Field**: Fixed description and plot hook fields not being properly saved by implementing robust form data handling
- **Location Formatting**: Fixed HTML entities (`&gt;`) displaying instead of actual `>` characters in location dropdowns
- **Form Submission**: Enhanced form submission with manual FormData processing to ensure all fields are captured correctly
- **Category Selection**: Fixed category dropdown not properly registering selected values
- **Tag Handling**: Improved tag processing to handle undefined/null values gracefully

### Technical Improvements
- **Proper Namespacing**: All CSS now properly scoped to avoid conflicts with other FoundryVTT modules
- **Form Data Handling**: Implemented robust FormData capture and processing for reliable form submission
- **Error Handling**: Added comprehensive debugging and error logging throughout the form submission process
- **Code Organization**: Cleaner, more maintainable code structure following FoundryVTT best practices

## [12.0.20] - Readiness

### Added
- Quest pin labels toggle functionality for both GMs and players with independent user preferences
- Auto-show quest pins feature that automatically displays pins when GMs drag quests/objectives to canvas while pins are hidden
- Enhanced quest pin visibility system with proper GM and player control

### Changed
- Renamed quest tooltip templates for better clarity: `tooltip-quest-pin.hbs` → `tooltip-pin-quests-quest.hbs`, `tooltip-quest.hbs` → `tooltip-pin-quests-objective.hbs`
- Updated quest pin tooltips to use Font Awesome icons instead of unicode characters for consistency
- Redesigned objective pins to be square with large quest type icons and improved layout
- Enhanced quest pin tooltips with better participant portrait display and improved styling
- Updated quest pin icon colors to use state-based coloring matching ring colors
- Improved quest pin title system with configurable font size, max width, vertical offset, and drop shadows
- Enhanced quest status dropdown positioning with boundary checking to prevent off-screen display
- Improved quest pin click behavior to automatically expand collapsed sections when navigating to quests

### Fixed
- Fixed deprecated `EffectsCanvasGroup#visibility` API usage in quest pins, now using `Canvas#visibility` for FoundryVTT v12+ compatibility
- Fixed settings registration timing issue that caused "excludedUsers is not a registered game setting" error by adding safety checks for unregistered settings
- Fixed error when attempting to modify actors from compendiums during auto-favorite operations for NPCs/monsters, now properly detecting compendium actors using both `actor.pack` and `actor.collection.locked` checks
- Enhanced compendium detection across all favorite management functions to prevent "You may not modify the Compendium which is currently locked" errors
- Fixed quest pin visibility toggle to work for both GMs and players (was previously restricted to players only)
- Fixed quest pin visibility logic to properly respect user preferences for all users including GMs
- Fixed quest status dropdown menu positioning and boundary issues
- Fixed quest status changes via dropdown not updating pin icons and appearance
- Fixed quest pin labels toggle to only hide/show titles while keeping quest numbers visible
- Fixed quest pin tooltip visibility reporting to use actual pin states instead of parsed journal data
- Fixed quest pin icon colors and rings for different quest statuses (Hidden, In Progress, Not Started, Failed, Completed)
- Fixed quest pin title positioning and anchoring for better text placement control
- Fixed quest pin click navigation to automatically expand collapsed sections
- Fixed quest pin title display to show actual quest names instead of "Unknown Quest/Objective"

### Cleaned Up
- Removed unnecessary debug logging from quest pin system while maintaining error trapping for actual problems
- Cleaned up console noise from constructor, state changes, click events, and loading operations
- Kept essential error logging for data fetching, persistence operations, and state management failures

## [1.0.19] - Debug Removal

### Fixed
- Debug removal

## [1.0.18] - Quest Overhaul

### Added
- Comprehensive quest management tools: clear all quest pins (scene-level and all-scenes), clear quest pins for specific quests, hide/show objective pins toggle for players.
- Pin visibility class to handle quest progress: objectives with visible pins are now visually marked.
- Player toggle button for pin visibility with icon state changes and user flag persistence.
- GM scene-level and quest-level buttons with confirmation dialogs for pin management.
- Player notifications when quests are automatically unpinned.
- Proper quest state synchronization across all components.
- Persistent window state management for macros, dice tray, and health windows, including viewport validation and error handling.
- Tools are now accessible regardless of context.

### Changed
- Unified tooltip data for quests: all tooltips now use a shared Handlebars template and QuestParser as the source of truth.
- Enhanced pin visibility updates with proper appearance refresh and automatic unpinning when quests are hidden from players.
- Quest-level visibility now properly controls all objective pin visibility for players.
- Enhanced health window update detection for real-time HP changes.
- Improved error handling and Blacksmith logging for window state restoration.

### Fixed
- Fixed syntax error in quest pin state update (panel-quest.js).
- Removed duplicate event handler setup in manager-panel.js.
- Fixed duplicate class attribute in partials/quest-entry.hbs.
- Fixed tray window click issue that caused the tray to disappear.
- Fixed squire tray disappearing on scene change.
- Fixed handle quest progress order and index mapping.
- Fixed handle quest data loading on scene change.
- Fixed tooltip data consistency between handle and pin.
- Fixed quest visibility toggle pin refresh and pin appearance for GM/players.
- Fixed excludedUsers settings issue and critical startup error.
- Fixed quest import/export and tooltip data consistency.
- Fixed most critical bugs and improved data consistency and code architecture.

## [1.0.17] - Printing Character Sheets

### Added
- New character sheet printing functionality accessible from the character panel
- Comprehensive print template with professional styling and layout
- Print button (scroll icon) in character panel header for easy access
- Detailed character information including portrait, basic info, and class details
- Complete ability scores display with modifiers and visual icons
- Skills section with dual-column layout and ability score associations
- Inventory management with item details, quantities, weights, and prices
- Spell listing with school, level, and usage information
- Features and traits section with detailed descriptions
- Print-optimized CSS with proper page breaks and A4 formatting
- Image loading timeout handling for reliable printing
- Error handling for popup blockers and invalid actor data

### Changed
- Enhanced character panel with print functionality integration
- Improved item description parsing to separate main content from additional details
- Updated template system to support comprehensive character data export
- Optimized print layout for both screen viewing and physical printing

### Fixed
- Resolved item weight display issues for various data structures
- Fixed skill icon mapping for all D&D 5e skills
- Improved error handling for missing or invalid character data
- Enhanced template rendering reliability with proper validation

## [1.0.16] - Macros and Handles

### Added
- Added empty macro slot placeholder with "Add" button when no macros are present
- Added visual feedback for macro handles during drag operations
- Added proper event handling for macro creation and updates

### Changed
- Improved macro panel rendering to always show at least one empty slot
- Enhanced macro handle functionality with proper drag and drop support
- Improved macro handle positioning and interaction areas
- Enhanced macro panel refresh logic to maintain UI state
- Improved macro panel performance with optimized rendering

### Fixed
- Fixed macro panel layout to maintain consistent spacing and alignment
- Fixed macro handle visibility and interaction states

## [1.0.15] - Drag and Drop Fix

### Fixed
- Fixed persistent issue with drag and drop functionality where subsequent drops wouldn't work until switching tabs
- Implemented proper event handler reattachment after DOM updates in the panel manager
- Ensured drag and drop handlers are explicitly removed and reattached after tray updates
- Added dedicated method for attaching drag handlers to improve code organization
- Added debug logging to track event handler reattachment

## [1.0.13] - Quests and Codex

### Added
- Visual feedback for drag and drop operations with highlighted drop targets
- CSS styling for drop targets with green borders and animations
- Improved quest journal entry handling with better section management

### Changed
- Modified tag system to only include explicit tags from quest entries
- Removed automatic inclusion of participant names and status as tags
- Improved persistence of collapsed/expanded state for quest categories
- Enhanced drag and drop functionality for actors and items
- Updated quest panel data attribute selectors for better state tracking

### Fixed
- Fixed issue with collapsed/expanded state not persisting between sessions
- Resolved problem with duplicate "Participants:" sections when dragging actors
- Fixed drag and drop functionality for adding actors as participants
- Fixed drag and drop functionality for adding items as treasure
- Improved drag handler implementation using DOM-based approach instead of regex

## [1.0.12] - Bug Fixees

### Fixed
- Fixed participant issue
- Fixed missing tasks for players

## [1.0.11] - Notes Panel & Quest Improvements

### Added
- New journal notes panel in the tray for easy access to journal entries
- Read-only journal content display with proper formatting
- Journal page selection dropdown for multi-page journals
- Custom toolbar with edit and open buttons to access Foundry's native journal editor
- Live content updates when journal entries are modified
- Visual overlay indicating when content is being edited by any user
- Proper hooks integration to refresh content when journal pages are updated
- Auto-favorite equipped weapons and prepared spells for monsters/NPCs when first selected (only if they don't already have favorites)
- Dynamic codex category icons based on category (Characters, Locations, Artifacts)
- Always-enabled clear (X) button that clears both search and tag filters and resets results
- Clicking a tag in an entry now clears all filters and filters by that tag only
- Reorganized quests by status (In Progress, Not Started, Completed, Failed) rather than by category
- Quest counts now display in section headers (e.g., "In Progress (3)")
- Pinning functionality for quests in the "In Progress" section with auto-expansion
- JSON export/import functionality for both quest and codex panels
- Added feather icon to quest cards to open the quest journal directly

### Changed
- Improved CSS organization and removed duplicate styles
- Plot Hook and other fields are now robustly parsed regardless of colon placement or HTML structure
- Improved tag/search/expand/collapse logic for all filter states
- Changed progress bar to only display when progress is greater than 0%
- Modified the border styling for expanded quest entries
- Enhanced quest import functionality to check for existing entries and update them
- Quest export now includes quests from all status groups, not just category groupings
- Cleaned up the codebase by removing unnecessary console.log debug statements

### Fixed
- Fixed scrollbar issues to ensure only one scrollbar appears in the notes panel
- Resolved content refresh issues when journal entries are edited
- Fixed critical hook function naming issue that was preventing content updates
- Improved CSS styling for better integration with Foundry's UI
- Consolidated duplicate CSS to improve maintainability
- Fixed event handler binding to prevent odd expand/collapse behavior after filtering
- Fixed quest import to properly handle UUID and preserve original category information

## [1.0.10] - Transfers and More

### Fixed
- Fixed issue where players were receiving both sender and receiver transfer messages
- Resolved permission errors when players attempted to delete or update chat messages
- Improved handling of socketlib for transfer message management
- Fixed duplicate chat messages during item transfers between characters
- Addressed transfer chat messages not being removed after acceptance/rejection
- Fixed message ordering in chat log to maintain logical conversation flow

### Changed
- Improved transfer chat messages with personalized text based on sender/receiver status
- Enhanced the chat templates to properly handle singular/plural item descriptions
- Restructured socket handlers for more reliable GM-mediated message delivery
- Improved handling of transfer request buttons to prevent double-clicking
- Updated chat message flow to ensure logical ordering of acceptance and completion messages

### Added
- Added notes in the tray... very alpha
- Added GM-mediated message deletion for transfer request cleanup
- Implemented visual feedback during transfer processing with disabled buttons
- Added replacement messages for transfer requests after processing
- Created new socket handler for GM-executed message cleanup
- Added proper error handling and fallbacks for socket communication

## [1.0.9] - Event Handler Fixes

### Fixed
- Fixed multiple click events being triggered when using weapons, spells, features, and inventory items
- Added proper event cleanup and namespacing to prevent event handler accumulation
- Improved event delegation consistency across all panels

## [1.0.8] - Bug Fixes

### Fixed
- Fixed tray behavior when switching between tokens to prevent disappearing and re-sliding
- Resolved issue with panel settings not being properly registered
- Improved tray state preservation during token switches
- Fixed animation glitches during tray updates
- Ensured proper panel instance management during token transitions

### Changed
- Refactored tray update logic to maintain consistent state
- Improved panel instance handling for better stability
- Enhanced tray element management to prevent duplicate elements
- Updated panel visibility settings handling for better reliability

## [1.0.7] - Unified cards

### Changed
- Unified all item transfer chat cards to use a single utility for consistent data and appearance.
- Updated transfer card types to: `transfer-gm` (GM/compendium/world drops), `transfer-complete` (actor-to-actor transfers), and `transfer-request` (transfer requests with accept/reject).
- Refactored `panel-party.js` and `manager-panel.js` to use the new card system for all transfer scenarios.
- Reverted transfer request chat message logic to its original, pre-card-system form for stability and compatibility.

### Fixed
- Fixed duplication of transfer request chat messages in GM and sender clients.
- Fixed "Transfer request not found" error when accepting/rejecting a transfer.
- Fixed ReferenceError for `sourceActor` in transfer request button handler by fetching all data from chat message flags.
- Ensured only the correct clients receive transfer request messages (GM and receiver get the actionable message, sender gets a confirmation).

## [1.0.6] - Transfers

### Added
- New item transfer system between characters
- Party panel for managing item transfers and player interactions
- Support for quantity selection when transferring stackable items
- Dialog confirmation for item transfer requests
- Chat message notifications for completed transfers
- Transfer history tracking with timestamps
- Flag-based transfer request system for persistent state

### Changed
- Improved drag and drop handling for items
- Enhanced user permissions checking for item transfers
- Added ability for GMs to facilitate transfers between players

## [1.0.5] - Exclude Users

### Fixed
- Fixed critical issue where excluded users would still see the tray
- Improved handling of user exclusion to prevent any tray elements from displaying

## [1.0.4] - Cleanup

### Added
- Proper cleanup of CSS variables and UI margins for excluded users

### Changed
- Improved module initialization to handle excluded users properly
- Moved CSS variable setup to after user exclusion check
- Enhanced handling of Handlebars partials for excluded users

### Fixed
- Fixed issue where excluded users would still see the tray
- Improved handling of user exclusion to prevent any tray elements from displaying

## [1.0.3] - Uswer contxt

### Changed
- Updated initialization process to better handle user context
- Improved error handling for template registration

### Fixed
- Fixed issues with user visibility and initialization
- Resolved template registration timing issues

## [1.0.2] - Improved panels

### Changed
- Updated dice tray icon to match the style of condition icons
- Enhanced dice tray icon with improved hover effects and animations
- Standardized icon sizes and visual feedback across the handle bar

### Fixed
- Fixed critical issue with panel manager initialization timing
- Improved event handling in all panels (Spells, Features, Weapons, Inventory)
- Added comprehensive debug logging for troubleshooting
- Ensured proper cleanup of event listeners

### Added
- Created CONSIDERATIONS.md with development guidelines and best practices
- Added AI development guidelines for future maintenance
- Enhanced logging system for better debugging

## [1.0.1] - Apells, weapons and Items

### Changed
- Removed "'s Squire" suffix from character names for cleaner display
- Modified tray initialization to load automatically when client connects
- Added automatic character selection based on owned tokens
- Updated UI to show "Select a Character" when no token is selected
- Improved event handling to prevent tray from closing unexpectedly
- Updated spell usage to support DnD5e 4.0+ API changes

### Fixed
- Fixed issue with tray closing when interacting with health controls
- Fixed deprecation warning for Item5e#use method
- Improved click handling within the tray content

### Added
- Enhanced tooltips for favorite items in the handle bar showing detailed information based on item type:
  - Spells: Level, school, materials, damage, and scaling information
  - Weapons: Attack type, damage, and range
  - Features: Requirements and description

## [1.0.0] - Initial Release

### Added
- Initial release
- Sliding tray interface with three panels (Spells, Weapons, Info)
- Spell management with spell slot tracking
- Weapon management with ammunition tracking
- Character info panel with HP, ability scores, and resource tracking
- Customizable settings for tray position, theme, and behavior
- Integration with Coffee Pub Blacksmith API 
