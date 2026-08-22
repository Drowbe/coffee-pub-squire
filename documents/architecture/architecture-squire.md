# Coffee Pub Squire – Architecture

## Overview

Coffee Pub Squire is a FoundryVTT module in the Coffee Pub suite. It provides quick access to character-specific combat information and world tools (Notes, Codex, Quests) through a sliding tray interface. It serves as both a practical tool and a reference implementation of the Blacksmith API integration.

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
└── documents/                 # Architecture and planning docs
```

## Core Components

### Main Module (squire.js)

- Registers with Blacksmith via `BlacksmithModuleManager.registerModule()`
- Hooks: `init`, `ready`, `canvasReady`, `setup`, `getActorDirectoryEntryContext`, etc.
- Wraps `canvas.selectObjects` for multi-select / selection display
- Registers socketlib module for cross-client operations (transfers, cleanup requests)

### Panel Manager (manager-panel.js)

- `PanelManager` singleton: controls tray visibility, panel switching, state
- Creates and owns all panels; coordinates `updateTray()` and `render()`
- Manages view modes: `player` and `party`. Notes, Codex and Quest moved to Librarian in 13.7.0
- Handles multi-select, GM details, selection display
- Uses `timer-utils` for tracked timeouts/intervals; cleans up on `cleanupModule`

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
| Control | panel-control.js | Search, type chips, action and state filters |
| Compendium Search | panel-compendium-search.js | Quick-add search over Blacksmith's Compendiums API |
| Favorites | panel-favorites.js | Pinned items |
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
- **Cards**: `manager-cards.js` (chat cards composed from Blacksmith card parts)
- **Notifications**: `manager-notifications.js` (transient menubar toasts for party-visible events; skips the initiating user)

## Tray Layout

The tray has a collapsible handle (left edge) and main content:

- **Handle**: Pin, collapse and view-cycle buttons; handle content (portrait, health bar, favorites, conditions, health-tray button)
- **Content**: View tabs (Character, Party) and stacked panel containers
- **Player view**: Character Summary, GM (if GM), Control, Favorites/Weapons/Spells/Features/Inventory. Health and Status Effects open as Blacksmith windows.

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
- Target Foundry v13 API; use Application V2 patterns
- Maintain compatibility with socketlib
- Target D&D 5e version 5.5+

### References

- [Foundry v13 API](https://foundryvtt.com/api/)
- [Application V2 Guide](https://foundryvtt.wiki/en/development/guides/applicationV2-conversion-guide)
- [D&D 5e System](https://github.com/foundryvtt/dnd5e/wiki)

## Technical Requirements

- FoundryVTT v13+
- D&D 5e system 5.5+
- Required: `coffee-pub-blacksmith`, `socketlib`
- Recommended: `coffee-pub-bibliosoph`, `coffee-pub-crier`, `coffee-pub-monarch`, `coffee-pub-scribe`
