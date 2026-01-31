# Coffee Pub Squire – Character Tab Architecture

## Overview

The Character tab is the **Player** view of the Squire tray. It shows the currently selected character (token/actor) and is the first panel when a token is selected. It displays portrait, name, class/level, movement speeds, and quick actions; it also feeds GM-only details to the GM panel and reacts to actor/token updates for live HP overlay updates.

## Placement in the Tray

- **View**: Player tab (`viewMode === 'player'`).
- **Order**: First panel when `actor` exists: Character → GM (if GM) → Health → Experience → Abilities → Stats → Dice Tray → Macros → Control → Favorites/Weapons/Spells/Features/Inventory.
- **Container**: `templates/tray.hbs` includes `<div class="panel-container" data-panel="character" data-clickable="true"></div>`; `PanelManager` injects the character panel HTML there.

## Project Files

| File | Purpose |
|------|---------|
| `scripts/panel-character.js` | `CharacterPanel` – data, render, listeners, HP overlay updates |
| `templates/panel-character.hbs` | Character panel markup (portrait, info, actions) |
| `templates/partials/handle-character-portrait.hbs` | Portrait in tray handle (player view) |
| `templates/handle-player.hbs` | Full handle content for player view (includes portrait, health, conditions, stats, macros, etc.) |
| `styles/panel-character.css` | Character panel styles |

## CharacterPanel (`panel-character.js`)

### Constructor

- **`constructor(actor)`**  
  Stores `actor`, `displayName`, render-cancellation state, and binds `_onActorUpdate`.

### Data and Render

- **`async render(html)`**  
  - Uses `html` (tray element) as `this.element`; finds `[data-panel="character"]` and sets its `innerHTML` to the rendered template.  
  - **Token resolution**: Prefers controlled token for `this.actor`, then active token on current scene; uses `token.actor` (synthetic) when available for movement/traits.  
  - **Display name**: From `getTokenDisplayName(token, this.actor)` or `actor.name`.  
  - **Movement**: Reads `sourceActor.system.attributes.movement`; supports DND5E `CONFIG.DND5E.movementTypes` (array or object with `.label`); builds `speeds` (walk, fly, swim, climb, burrow) with labels and units.  
  - **Traits**: Resistances/immunities from `sourceActor.system.traits` (dr/di); uses `CONFIG.DND5E` damage/resistance/immunity labels; normalizes arrays, Sets, Maps, and custom text.  
  - **Biography**: From `sourceActor.system.details.biography`; enriched via `TextEditor.enrichHTML`; plain text for GM details.  
  - **GM details**: If `game.user.isGM`, calls `PanelManager.setGmDetails({ resistances, immunities, biography, biographyHtml, biographyHtmlRaw })` for use by `GmPanel`.  
  - **Template**: `TEMPLATES.PANEL_CHARACTER` with `actor`, `displayName`, `position`, `isGM`, `speeds`, `speedUnits`, `canHover`, `resistances`, `immunities`, `biography`, `biographyHtml`, `biographyHtmlRaw`.  
  - **Cancellation**: Uses `_renderInProgress` and `_renderCancellationToken` to avoid race conditions; after async work, checks token and container validity before updating DOM.

### Template Data (panel-character.hbs)

- **Portrait**: `actor.img`, health overlay height via Handlebars helper `healthOverlayHeight(actor.system.attributes.hp)`, death skull when `hp.value === 0`.
- **Info**: `displayName`; primary line: class + level (from `actor.items` type `class`) or CR; alignment; secondary line: speeds with units and optional “(hover)”.
- **Actions**: Print character (`.print-character`), Open character sheet (`.character-sheet-toggle`).

### Handlebars Helper

- **`healthOverlayHeight(hp)`** (registered in panel-character.js): Returns CSS height percentage for the red overlay (inverse of HP percentage); `0%` when no max.

### Listeners (`_activateListeners(html)`)

- **`.character-sheet-toggle`** → `this.actor.sheet.render(true)`.
- **`.print-character`** → `PrintCharacterSheet.print(this.actor)` (dynamic import).
- **`.character-portrait`** → `ImagePopout` for portrait, shareable.
- **`.tray-refresh`** → Toggle spinning, `PanelManager.initialize(this.actor)`, then `renderPanels`; error notification on failure.
- **`.death-toggle`** → Toggle dead (hp 0 ↔ 1, reset death failure).
- **`.hp-amount`** → Clear on click.
- **`.hp-up` / `.hp-down`** → Adjust HP by input value, clamp 0–max, then `_updateHPDisplay()`.
- **`.hp-full`** → Set HP to max, then `_updateHPDisplay()`.
- **`.ability-btn`** → Left-click: `actor.rollAbilityCheck({ ability })`; right-click: `actor.rollSavingThrow({ ability })`. Buttons are cloned before attaching to avoid duplicate listeners.

Note: HP and ability controls may live in other panels (e.g. Health, Abilities); listeners are attached only if the elements exist in the given `html`.

### HP Overlay Updates

- **`_onActorUpdate(document, change)`**  
  Runs when Blacksmith fires `updateActor` / `updateToken` for this actor and `change` touches `system.attributes.hp`. Updates `.health-overlay` height and toggles `.death-skull` in the character portrait (no full re-render).

- **`_updateHPDisplay()`**  
  Updates `.hp-bar` (current, max, fill width) from `this.actor.system.attributes.hp`; used after HP button actions.

### Lifecycle

- **`destroy()`**  
  Clears `this.element`; hooks are managed by Blacksmith HookManager, not unregistered here.

## Hooks (squire.js)

Character panel updates are driven by Blacksmith HookManager:

- **`updateActor`** (character): Routes to `PanelManager.instance.characterPanel._onActorUpdate(document, change)` when the document is the panel’s actor.
- **`updateToken`** (character): Same routing so token-driven HP changes update the portrait overlay.

## Handle Integration

- **Player view handle** (`handle-player.hbs`): Shows actor name, then `handle-character-portrait` (same actor), health bar (if enabled), favorites, conditions, primary/secondary stats, macros, health tray (GM), dice tray.
- **`handle-character-portrait.hbs`**: Single portrait image; optional `clickable` and `data-actor-id` for opening character sheet (handled by HandleManager).

## GM Details Flow

- **CharacterPanel** (when GM): Calls `PanelManager.setGmDetails(...)` with resistances, immunities, and biography strings after each render.
- **PanelManager**: Stores in `PanelManager.gmDetails`; **GmPanel** receives it and uses it in its template (`panel-gm.hbs`).

## Related UI

- **CharactersWindow** (`window-characters.js`): “Select Character” window used by Inventory and Weapons panels (e.g. give item to another character). Not part of the Character tab; separate Application.
- **PrintCharacterSheet** (`utility-print-character.js`): Used by the character panel’s print button.

## Technical Notes

- **v13**: Native DOM only (`querySelector`, `addEventListener`, `innerHTML`); no jQuery.
- **D&D 5e**: Uses `actor.rollAbilityCheck({ ability })`, `actor.rollSavingThrow({ ability })`, `CONFIG.DND5E.movementTypes` and damage/resistance/immunity config; supports both object-with-`.label` and string movement types.
- **Actor source**: Prefers `token.actor` over `this.actor` for movement and traits when a token is available (synthetic actor).
