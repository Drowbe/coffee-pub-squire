# Squire Architecture

**Audience:** anyone changing Squire, and the rest of the suite.

The map of the module: how the tray is assembled, which class owns what, and where Squire ends and
Blacksmith begins. The Character and Party tabs have their own documents --
[architecture-character.md](architecture-character.md) and
[architecture-party.md](architecture-party.md).

## Overview

Squire is a FoundryVTT module in the Coffee Pub suite. It puts a character's own tools within reach
through a sliding tray that follows the selected token: spells, weapons, inventory, features,
favourites, health and conditions, plus a party view and item transfers. Notes, the Codex and Quests
were Squire's until 13.7.0; they are Librarian's and Blacksmith's now.

**Gear Builds** is the one feature that is not a tray panel: a window of its own for planning what a
character wears and prepares, reachable from the Character Sheet strip and from the handle. It has its
own document -- [architecture-builds.md](architecture-builds.md) -- which also covers the `fullbody`
flag, the only piece of Squire data another module is meant to read.

## Project Structure

```
coffee-pub-squire/
├── module.json
├── scripts/
│   ├── squire.js              # Main module: hooks, Blacksmith registration
│   ├── const.js               # MODULE, TEMPLATES, CSS_CLASSES, PANELS, etc.
│   ├── helpers.js             # Shared utilities (renderTemplate, etc.)
│   ├── settings.js            # Foundry settings registration
│   ├── manager-panel.js       # PanelManager: tray, panel switching, state
│   ├── manager-handle.js      # HandleManager: handle content per view mode
│   ├── timer-utils.js         # Tracked timeouts/intervals for cleanup
│   ├── transfer-utils.js      # Party transfer workflows
│   ├── manager-cards.js       # Chat cards, composed from Blacksmith card parts
│   ├── manager-favorites-sync.js # Keeps Squire favorites and the sheet's own in step
│   ├── manager-notifications.js # Transient menubar notifications for party-visible events
│   ├── panel-*.js             # Panel classes (see Panels below)
│   ├── window-cleanup.js      # Character sheet cleanup: plan, apply, receipt
│   ├── window-transfer-tool.js # Ephemeral transfer Tool
│   ├── utility-cleanup.js, utility-cleanup-merge.js
│   ├── utility-compendium-search.js # Adapter over Blacksmith's Compendiums API
│   ├── utility-lights.js, utility-quantity.js, utility-statblock.js
│   └── utility-print-character.js
├── styles/
│   ├── default.css            # Main entry; imports all others, in a load-bearing order
│   ├── common.css, handle.css
│   ├── tray-*.css             # The tray shell, split by concern (see default.css)
│   ├── panel-*.css            # Panel-specific styles
│   └── window-*.css           # Window/Tool styles
├── templates/
│   ├── tray.hbs               # Main tray layout (handle + content)
│   ├── handle-player.hbs, handle-party.hbs
│   ├── panel-*.hbs            # Panel templates
│   ├── window-*.hbs           # Window templates
│   ├── partials/              # Reusable partials
│   └── print-character.hbs
├── resources/
│   └── light-sources.json
└── documentation/             # Architecture and planning docs
```

## Core Components

### Main Module (squire.js)

- Registers with Blacksmith via `BlacksmithModuleManager.registerModule()`
- Hooks: `init`, `ready`, `canvasReady`, `controlToken`, `closeGame`, `disableModule`, plus document CRUD — all through Blacksmith's HookManager except three native `Hooks.once`
- Wraps `canvas.selectObjects` for multi-select / selection display
- Registers the `gmRequest` ops for cross-client operations (transfers, GM-posted cards, cleanup requests)

**The sheet hook is `renderActorSheetV2`, and the name matters.** ApplicationV2 fires
`render<ClassName>` for a sheet's class and each of its ancestors. dnd5e's character sheet is
`CharacterActorSheet` now, so on dnd5e 5.3.3 / Foundry 14.367 the hooks that fire are
`renderCharacterActorSheet`, `renderBaseActorSheet`, `renderPrimarySheet5e`, `renderActorSheetV2` and
`renderDocumentSheetV2` — and **`renderActorSheet5e`, which Squire used through 13.x, does not**.
Registering a hook nobody calls succeeds silently, so the tray simply stopped initialising from a
sheet and said nothing about why. Of the names that do fire this is core's rather than dnd5e's, which
is why it was chosen: it survives the system renaming its own classes again.

**Both names are registered.** The manifest says `minimum: 13`, and the evidence above is from v14
only — v13 ships an older dnd5e, which is what `renderActorSheet5e` was named for. Dropping the old
name on v14 evidence alone would have broken the version we still claim to support, in exactly the
way v14 was broken and just as quietly. Whichever fires reaches the same guarded callback, so a
version where both fire costs one extra early return. **Drop `renderActorSheet5e` when someone has
measured a v13 world and can say it is dead there too** — not before.

Two consequences worth keeping:

- The callback reads `app?.document ?? app?.actor`. ApplicationV2 sheets carry `document`.
- **`html` is a native `HTMLElement`, never jQuery.** It is unused, and must stay unused unless it is
  treated as an element — `html.find(...)` would throw.

**The one piece of core DOM Squire touches** is `document.querySelector('#ui-left')`, in
`manager-panel.js` and `settings.js`: setting its `marginLeft` is how a pinned tray pushes Foundry's
interface across rather than covering it. Both calls are null-guarded, which means a selector that
stops resolving fails **silently** — the tray simply stops making room. If the tray ever overlaps the
toolbar when pinned, check that selector before anything else.

### Panel Manager (manager-panel.js)

- `PanelManager` singleton: controls tray visibility, panel switching, state
- Creates and owns all panels; coordinates `updateTray()` and `render()`
- Manages view modes: `player` and `party`. Notes, Codex and Quest moved to Librarian in 13.7.0
- Handles multi-select, GM details, selection display
- Uses `timer-utils` for tracked timeouts/intervals; cleans up on `cleanupModule`

**`initialize(actor)` is called more often than you would expect, and is guarded three times over.**
`renderActorSheetV2` fires **twice** for a single sheet open — measured on Foundry 14.367 — so
anything with a side effect has to sit behind all three gates:

1. A **100ms debounce** on `_lastInitTime`, which `force` bypasses for deliberate rebuilds.
2. `_initializationInProgress`, set synchronously at the top of the `try` and cleared in a `finally`,
   so a call arriving while another is mid-`await` returns rather than interleaving.
3. The **same-actor gate**, which returns when the tray is already showing this actor.

**Gate 3 is keyed on `uuid`, never `id`, and that is load-bearing.** An unlinked token's actor is
synthetic — the base actor plus that token's delta — and it carries the BASE actor's id. Paste a
goblin four times and all four report the same `.id`, so an id-keyed gate answered "same actor,
nothing to do" every time a player selected a different one, and the tray never switched. The uuid is
per token and is the only field that separates them. This is a recurring trap across the module: see
`BuildWindow.idFor`, which had the same bug and the same fix.

Everything with a side effect is downstream of those gates — the 30s cleanup interval (itself created
only once), `syncFavorites(actor)`, and `StatblockUtility.autoFixIfEnabled(actor)` for NPCs. There are
no socket sends anywhere in Squire.

### Handle Manager (manager-handle.js)

- `HandleManager`: renders tray handle content based on `viewMode`
- Handle templates: `handle-player.hbs`, `handle-party.hbs`
- Handles resize for fade effect; resolves token for actor display

### Panels

| Panel | Script | Description |
|-------|--------|-------------|
| Character | panel-character.js | Portrait, name, class/level, speeds, quick actions |
| GM | panel-gm.js | GM-only actor details |
| Character Summary | panel-character-summary.js | Portrait, HP, abilities, AC/speed/senses, XP |
| Control | panel-control.js | Search, the three view modes (sheet / favourites / compendium quick-add), the section tabs, the action-cost chips and the two availability switches |
| Compendium Search | panel-compendium-search.js | Quick-add search over Blacksmith's Compendiums API |
| Favorites | panel-favorites.js | Pinned items, in their own view rather than the panel stack. Two layouts (list or tiles), three sort orders, and a per-item tile footprint set from Blacksmith's context menu |
| Builds | panel-builds.js | The favourited gear builds and costumes, under Favorites. Always rendered and empty when nothing is starred, so it costs no space — the only panel in `ALWAYS_VISIBLE_PANELS`. Same layouts and tile footprints as Favorites; see `architecture-builds.md` |
| Weapons | panel-weapons.js | Weapon attacks |
| Spells | panel-spells.js | Spell slots, casting |
| Features | panel-features.js | Class/race features |
| Inventory | panel-inventory.js | Items, in one of two views: a flat list, or grouped by container (General plus one section per bag). Toggled from the panel's title bar, stored per user in `inventoryViewMode`. `INVENTORY_CATEGORIES` is the single ordered category list both views read. |
| Party | panel-party.js | Party members, transfers |
| Party Stats | panel-party-stats.js | Party overview |

### Windows / Forms

| Window | Script | Description |
|--------|--------|-------------|
| Transfer Tool | window-transfer-tool.js | Ephemeral Blacksmith Tool for item recipients, quantity splits, fixed-target drops, and approvals |
| Cleanup | window-cleanup.js | Character sheet cleanup: the plan, the per-row ticks, and the receipt |

Squire owns two windows. Dice Tray, Macros, Health and Status Effects are **Blacksmith's** — opened
through `openWindow()` (see `helpers.js`), never re-implemented here. Notes, Codex and Quest are
Librarian's.

### Utilities

- **Cleanup**: `utility-cleanup.js` (currency, compendium links), `utility-cleanup-merge.js` (duplicate stacks, snapshot-first)
- **Compendium search**: `utility-compendium-search.js` — the only place that touches `api.compendiums`
- **Statblock**: `utility-statblock.js`
- **Quantity**: `utility-quantity.js`
- **Lights**: `utility-lights.js`
- **Print**: `utility-print-character.js`
- **Transfer**: `transfer-utils.js`
- **Timers**: `timer-utils.js` (for cleanup)
- **Item menu**: `manager-item-menu.js` — the one `⋯` / right-click menu every list panel shows. Weapons, Spells, Inventory, Features and Favourites get the same entries in the same order with the same words; `buildItemMenu` returns the entries so a panel can append its own, which is how Favourites adds reorder and tile size without replacing the shared set
- **Tile spans**: `utility-tile-spans.js` — the four tile footprints, their icons and the Tile Size menu, shared by every panel with a tile layout. The CSS half is `styles/tray-tiles.css`, keyed on `squire-tile-grid`
- **Cards**: `manager-cards.js` (chat cards composed from Blacksmith card parts)
- **Notifications**: `manager-notifications.js` (transient menubar toasts for party-visible events; skips the initiating user)

## Tray Layout

The tray has a collapsible handle (left edge) and main content:

- **Handle**: Pin, collapse and view-cycle buttons; handle content (portrait, health bar, favorites, conditions, health-tray button)
- **Content**: View tabs (Character, Party) and stacked panel containers
- **Player view**: Character Summary, GM (if GM), Control, then whichever the Control panel's mode selects — the open section tab's panel, the Favorites panel, or the compendium results. Health and Status Effects open as Blacksmith windows.

## Blacksmith Integration

### API Documentation

Do not vendor copies of Blacksmith's API docs into this repo — they go stale silently and get followed anyway.

- **Source of truth**: `documentation/api/*.md` in the [coffee-pub-blacksmith](https://github.com/Drowbe/coffee-pub-blacksmith) repo.
- **Convenience mirror**: the [wiki](https://github.com/Drowbe/coffee-pub-blacksmith/wiki). It lives in a separate repo and does **not** auto-update. Where the two disagree, the repo wins.

Blacksmith owns compendium mapping and plain-text → UUID resolution (`api.compendiums`), and campaign/party/party-leader context (`api.campaign`). Squire should never read Blacksmith's settings directly, iterate `BLACKSMITH.arrSelected*Compendiums`, or write its own name → document search. See `api-compendiums.md` and `api-campaign.md`.

### Registration

```javascript
BlacksmithModuleManager.registerModule(MODULE.ID, {
    name: MODULE.NAME,
    version: MODULE.VERSION
});
```

### Menubar Tools

Squire registers **none**. It had three — dice tray, macros, quick note — and all three went
upstream: the first two with the windows Blacksmith adopted, the third with Notes to Librarian.
Squire's own tools are reached from the tray handle, because they are about the selected token.

### Windows Squire Opens But Does Not Own

`helpers.js` wraps `blacksmith.openWindow()` for each, so a missing Blacksmith is one warning
rather than a thrown call: `blacksmith-health`, `blacksmith-status-effects`, `blacksmith-xp`,
`blacksmith-stats-party`, `blacksmith-stats-player`.

### Menubar Notifications

- **Transient events** (manager-notifications.js): party-visible events, such as effects applied to owned actors — short toasts on every client except the initiator.

### Utility Usage

```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
blacksmith?.utils?.postConsoleAndNotification(MODULE.NAME, "message", ...);
```

## Panel Initialization Pattern

Managers and system references are initialized at render time, not in constructors:

1. **Constructors** – Only basic property setup
2. **Render** – Initialize `panelManager`, system references, listeners
3. **Availability** – Verify system/manager availability before use

This avoids timing issues where Foundry system managers are not ready yet. The Favorites panel is the reference implementation for this pattern.

## Development Guidelines

### Code Modification

- Do not change code unrelated to the current task
- Do not optimize or refactor without an explicit request
- Preserve whitespace and formatting
- Discuss significant changes before implementing

### Standards

- Use `postConsoleAndNotification` from Blacksmith utils; prefix messages with `SQUIRE | `
- Target the Foundry v13+ API; use Application V2 patterns, and the namespaced globals (`foundry.applications.*`) rather than the deprecated bare ones
- Ask a GM through Blacksmith `gmRequest`, never a raw socket: it supplies a verified caller identity
- Target D&D 5e version 5.5+

### References

- [Foundry API](https://foundryvtt.com/api/)
- [Application V2 Guide](https://foundryvtt.wiki/en/development/guides/applicationV2-conversion-guide)
- [D&D 5e System](https://github.com/foundryvtt/dnd5e/wiki)

## Technical Requirements

- FoundryVTT v13 or v14 (the manifest declares `minimum` 13, `verified` 14, `maximum` 14 -- v15 needs a bump)
- D&D 5e system 5.5+
- Required: `coffee-pub-blacksmith`
- Recommended: `coffee-pub-bibliosoph`, `coffee-pub-crier`, `coffee-pub-monarch`, `coffee-pub-scribe`
