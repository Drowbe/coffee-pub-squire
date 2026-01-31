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
│   ├── utility-quest-pins.js  # Quest pin creation, update, ownership
│   ├── utility-quest-pin-migration.js  # Legacy pin migration to Blacksmith
│   ├── quest-pin-events.js    # Pin click handler, context menu
│   ├── panel-*.js             # Panel classes (see Panels below)
│   ├── window-*.js            # Window/form classes (Notes, Quest, etc.)
│   ├── utility-*-parser.js    # Parsers (codex, notes, quest, base)
│   ├── utility-journal.js
│   ├── utility-lights.js
│   └── utility-print-character.js
├── styles/
│   ├── default.css            # Main entry; imports all others
│   ├── common.css, tray.css, handle.css
│   ├── panel-*.css            # Panel-specific styles
│   ├── window-*.css           # Window/form styles
│   └── quest-markers.css, quest-form.css, codex-form.css, window-note.css, notes-metadata-box.css
├── templates/
│   ├── tray.hbs               # Main tray layout (handle + content)
│   ├── handle-*.hbs           # Handle content per view (player, party, notes, codex, quest)
│   ├── panel-*.hbs            # Panel templates
│   ├── window-*.hbs           # Window templates
│   ├── partials/              # Reusable partials
│   ├── chat-cards.hbs, print-character.hbs
│   └── tooltip-pin-quests-*.hbs
├── resources/
│   ├── light-sources.json
│   └── pin-icons.json
├── themes/
│   └── quest-pins.json
└── documents/                 # Architecture and planning docs
```

## Core Components

### Main Module (squire.js)

- Registers with Blacksmith via `BlacksmithModuleManager.registerModule()`
- Hooks: `init`, `ready`, `canvasReady`, `setup`, `getActorDirectoryEntryContext`, etc.
- Wraps `canvas.selectObjects` for multi-select / selection display
- Registers menubar tools (dice tray, macros, quick note)
- Handles note edit locks, Blacksmith pin hooks (`pins.created`, `pins.updated`, `pins.resolveOwnership`)
- Registers socketlib module for cross-client operations

### Panel Manager (manager-panel.js)

- `PanelManager` singleton: controls tray visibility, panel switching, state
- Creates and owns all panels; coordinates `updateTray()` and `render()`
- Manages view modes: `player`, `party`, `notes`, `codex`, `quest`
- Handles multi-select, GM details, selection display
- Uses `timer-utils` for tracked timeouts/intervals; cleans up on `cleanupModule`

### Handle Manager (manager-handle.js)

- `HandleManager`: renders tray handle content based on `viewMode`
- Handle partials: `handle-player`, `handle-party`, `handle-notes`, `handle-codex`, `handle-quest`
- Handles resize for fade effect; resolves token for actor display

### Panels

| Panel | Script | Description |
|-------|--------|-------------|
| Character | panel-character.js | Portrait, name, class/level, speeds, quick actions |
| GM | panel-gm.js | GM-only actor details |
| Control | panel-control.js | Favorites/Weapons/Spells/Features/Inventory tabs |
| Health | panel-health.js | HP bar, popout window |
| Experience | panel-experience.js | XP progress |
| Abilities | panel-abilities.js | Ability scores |
| Stats | panel-stats.js | AC, speed, senses |
| Dice Tray | panel-dicetray.js | Dice roller, popout |
| Macros | panel-macros.js | Macro slots, popout |
| Favorites | panel-favorites.js | Pinned items |
| Weapons | panel-weapons.js | Weapon attacks |
| Spells | panel-spells.js | Spell slots, casting |
| Features | panel-features.js | Class/race features |
| Inventory | panel-inventory.js | Items |
| Party | panel-party.js | Party members, transfers |
| Party Stats | panel-party-stats.js | Party overview |
| Notes | panel-notes.js | Journal-based notes, Blacksmith pins |
| Codex | panel-codex.js | World reference items |
| Quest | panel-quest.js | Quest tracking, quest pins |

### Windows / Forms

| Window | Script | Description |
|--------|--------|-------------|
| Notes | window-note.js | NotesForm – note editor, pin creation |
| Quest | window-quest.js | QuestForm – quest create/edit |
| Characters | window-characters.js | Character picker |
| Users | window-users.js | User picker |
| Health | window-health.js | Health popout |
| Dice Tray | window-dicetray.js | Dice tray popout |
| Macros | window-macros.js | Macros popout |
| Transfer | (panel-party.js, transfer-utils.js) | Transfer dialog (window-transfer.hbs) |

### Utilities

- **Parsers**: `utility-base-parser`, `utility-codex-parser`, `utility-notes-parser`, `utility-quest-parser`
- **Journal**: `utility-journal.js`
- **Lights**: `utility-lights.js`
- **Print**: `utility-print-character.js`
- **Transfer**: `transfer-utils.js`
- **Timers**: `timer-utils.js` (for cleanup)
- **Quest Pins**: `utility-quest-pins.js`, `utility-quest-pin-migration.js`, `quest-pin-events.js`

## Tray Layout

The tray has a collapsible handle (left edge) and main content:

- **Handle**: Pin, toggle, view-cycle buttons; handle content (player portrait, party list, notes icon, etc.)
- **Content**: View tabs (Player, Party, Notes, Codex, Quest) and stacked panel containers
- **Player view**: Character, GM (if GM), Health, Experience, Abilities, Stats, Dice Tray, Macros, Control, Favorites/Weapons/Spells/Features/Inventory

## Blacksmith Integration

### Registration

```javascript
BlacksmithModuleManager.registerModule(MODULE.ID, {
    name: MODULE.NAME,
    version: MODULE.VERSION
});
```

### Menubar Tools

- `squire-dice-tray` – Dice tray launcher
- `squire-macros` – Macros window launcher
- `squire-quick-note` – Quick note creation

### Pins

- **Notes**: Notes stored as JournalEntry pages; pins via Blacksmith Pin API; `blacksmith.pins.resolveOwnership`, `pins.created`, `pins.updated`
- **Quests**: Quest pins via Blacksmith API; `utility-quest-pins.js`, `quest-pin-events.js`

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
