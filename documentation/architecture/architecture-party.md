# Party Tab Architecture

**Audience:** anyone changing Squire's Party tab.

How the Party tab is built: what it lists, the toolbar, and the drag-and-drop transfer flow with its
request and approval path. The tray as a whole is in
[architecture-squire.md](architecture-squire.md).

## Overview

The Party tab shows all player-owned tokens on the current scene (and, for GMs, non-player tokens). It provides a party health summary, per-character cards with HP and quick actions, token selection, drag-and-drop item transfers between characters, and (optionally) an MVP leaderboard from Blacksmith stats. Item transfers use a request/approval flow when the user lacks permission on source or target actor.

## Placement in the Tray

- **View**: Party tab (`viewMode === 'party'`).
- **Visibility**: Controlled by `showTabParty` (user setting); tab can be hidden.
- **Order**: Party toolbar (Select Party / Award) → `[data-panel="party"]` (PartyPanel) → `[data-panel="party-stats"]` (PartyStatsPanel, if `showPartyStatsPanel`).
- **Container**: `templates/tray.hbs` includes party-view content; `PanelManager` injects party and party-stats HTML into their containers.

## Project Files

| File | Purpose |
|------|---------|
| `scripts/panel-party.js` | `PartyPanel` – party list, health, transfers, listeners |
| `scripts/panel-party-stats.js` | `PartyStatsPanel` – MVP leaderboard (Blacksmith stats) |
| `scripts/transfer-utils.js` | `TransferUtils` – item transfer flow (request/approve/execute) |
| `templates/panel-party.hbs` | Party panel markup (health card, party cards, GM NPC section) |
| `templates/panel-party-stats.hbs` | Party stats / MVP table markup |
| `templates/handle-party.hbs` | Handle content for party view (party name, portraits, health, macros) |
| `scripts/window-transfer-tool.js` | Shared ephemeral Transfer Tool and Blacksmith entity/quantity controllers |
| `templates/window-transfer-tool.hbs` | Transfer details, optional quantity, recipient, and approval content |
| `templates/chat-cards.hbs` | Transfer request/complete/reject/expired chat cards |
| `styles/panel-party.css` | Party panel styles |
| `styles/panel-party-stats.css` | Party stats styles |

## PartyPanel (`panel-party.js`)

### Constructor

- **`constructor()`**  
  Sets `element = null` and binds: `_onTokenUpdate`, `_onActorUpdate`, `_onControlToken`, `_handleTransferButtons`. Hooks are registered centrally (Blacksmith HookManager), not in the panel.

### Data and Render

- **`async render(element)`**  
  - Resolves native DOM; finds `[data-panel="party"]`; exits if missing.  
  - **Tokens**: `tokens = canvas.tokens.placeables.filter(t => t.actor?.hasPlayerOwner)`.  
  - **Non-player (GM only)**: `nonPlayerTokens = canvas.tokens.placeables.filter(t => t.actor && !t.actor.hasPlayerOwner)`.  
  - **Decoration**: Both lists go through one `_decorateToken(token)`, which stamps `healthbarStatus` (`_calculateHealthbarStatus(hp)`, using settings `healthThresholdCritical`, `healthThresholdBloodied`, `healthThresholdInjured`), `speedDisplay`, and `disposition` (`getTokenDisposition()`, read from the token document).  
  - **Controlled**: `controlledTokenIds` from `canvas.tokens.controlled`.  
  - **Party HP**: `partyRemainingHP`, `partyTotalHP`, `partyHealthbarStatus` (same thresholds).  
  - **Current actor**: First controlled token’s actor; `otherPartyMembers` = tokens whose actor is not current.  
  - Renders `TEMPLATES.PANEL_PARTY` with: `tokens`, `nonPlayerTokens`, `controlledTokenIds`, `isGM`, `actor`, `otherPartyMembers`, party HP fields, `showHandleHealthBar`.  
  - Sets `partyContainer.innerHTML` and calls `activateListeners(partyContainer)`.

### Template Data (panel-party.hbs)

- **Party health card**: Clickable; shows `partyRemainingHP` / `partyTotalHP` and bar with `partyHealthbarStatus`.
- **Party cards**: One per `tokens` entry – portrait (health overlay, death skull), name, class/level or CR, alignment, **disposition badge**, resistances/immunities (non-character), HP bar, open-sheet button (if owner). Cards are clickable for owners; selected state from `controlledTokenIds`.
  - The badge is drawn on every NPC card, and on a player card only when the disposition is not friendly — labelling every ally FRIENDLY labels the default. `.squire-disposition` in `common.css` is shared with the character panel.
- **GM section**: “MONSTERS & NPCs” with `nonPlayerTokens` in same card layout.

### Listeners (`activateListeners(html)`)

- **`.open-sheet`** – Clone, then click → `PanelManager._suppressSheetRender = true`, `token.actor.sheet.render(true)`.
- **`.party-card-image.party-card-clickable`** – Clone, click → `ImagePopout` for portrait.
- **`.party-card.party-card-clickable`** – Clone, click (ignore if target is open-sheet or portrait) → if `token.actor.isOwner`, `token.control({ releaseOthers: !event.shiftKey })`.
- **`.party-health-card`** – Clone, click → select all party tokens, `healthPanel.updateTokens(partyTokens)`, then `healthPanel._onPopOut()` if not already popped.
- **`.party-card`** – Drag/drop: `dragenter`/`dragleave`/`dragover` (drop target styling, sound); `drop` parses `text/plain` JSON and handles:
  - **Item (from actor)**: UUID/actorId+itemId → fixed-recipient Transfer Tool → `TransferUtils.executeTransfer` or `executeTransferWithPermissions` (or direct create + chat card for world item).
  - **ItemDirectory**: Create item on target actor, chat card, `newlyAddedItems` flag.
  - **Actor**: Same transfer flow as Item from actor.
  After drop: `this.render(this.element)`; if current tray actor is involved, refresh inventory panel.
- **`.party-card .party-hp-bar`** – Clone, click → `healthPanel.updateTokens([token])`, `healthPanel._onPopOut()`.

Buttons/cards are cloned before attaching listeners to avoid duplicates on re-render.

### Hook Handlers

- **`_onTokenUpdate(token, changes)`** – If `x`, `y`, or `hidden` changed, `this.render(this.element)`.
- **`_onActorUpdate(actor, changes)`** – If `system.attributes.hp` changed, `this.render(this.element)`.
- **`_onControlToken(token, isControlled)`** – Re-render to update selection highlight.

### Transfer Flow (Panel + TransferUtils)

- **Direct drop with permissions**: If user is owner of both source and target actor, `_executeTransferWithPermissions` → `_completeItemTransfer` (or socketlib `executeAsGM('executeItemTransfer', …)`) and transfer-complete chat.
- **Request flow**: If user lacks source or target permission, `TransferUtils.executeTransfer`:
  - Builds `transferData`; uses `transfersGMApproves` and `transferTimeout` settings.
  - Sends “waiting” message to sender; if GM approval required, sends GM approval message; else sends receiver accept/reject message.
  - `_scheduleTransferExpiration(transferId, transferData)` uses `trackModuleTimeout`; on expiry, `_expireTransfer` deletes messages and sends expired chats.
- **Chat buttons**: `_handleTransferButtons(message, html)` is invoked from the `renderChatMessage` hook. It attaches:
  - GM approve/deny on `.gm-approval-button`.
  - Accept/reject on `.transfer-request-button` (with `dataset.handlersAttached` to avoid duplicate handlers).
  Handlers read `message.getFlag(MODULE.ID, 'data')`, check expiry, then call socketlib (`executeItemTransfer`, `createTransferCompleteChat`, `createTransferRejectedChat`, `createTransferExpiredChat`, `deleteTransferRequestMessage`, etc.) or create chat messages directly when GM.

### Helpers and Cleanup

- **`_calculateHealthbarStatus(hp)`** – Returns CSS class: `squire-tray-healthbar-dead` | `-critical` | `-bloodied` | `-injured` | `-healthy` from settings thresholds.
- **`_showTransferQuantityTool(...)`** – Opens the shared fixed-recipient Transfer Tool and resolves its verified `api.quantitySplit` value (0 if cancelled).
- **`_executeTransferWithPermissions`** – If both permissions, `_completeItemTransfer`; else socketlib `executeAsGM('executeItemTransfer', …)`.
- **`_completeItemTransfer`** – Create item on target, update/delete on source, set `newlyAddedItems` and `isNew` flag; create transfer-complete chat (socket or direct) for sender/receiver/GM.
- **`destroy()`** – `_cleanupTransferTimers()`, `element = null`.

## PartyStatsPanel (`panel-party-stats.js`)

- **Role**: Optional panel below Party; shows “Lifetime MVP Leaderboard” from Blacksmith stats.
- **Data**: `getData()` uses `blacksmith?.stats?.player?.getStats(actor.id)` for each player character (`actor.type === 'character' && actor.hasPlayerOwner && !actor.isToken`). Builds `leaderboard` from `lifetime.mvp` (totalScore, combats, averageScore, highScore); sorts by totalScore, assigns rank.
- **Render**: `render(element)` → `_updateDisplay()` → `getData()` → `renderTemplate(PANEL_PARTY_STATS, data)` → inject into `[data-panel="party-stats"]`.
- **Hooks**: `updateCombat`, `updateActor`, `createChatMessage` route to `_boundUpdateHandler` (`_onStatsUpdate`) to refresh display when combat/actor/chat changes.

## TransferUtils (`transfer-utils.js`)

- **`executeTransfer({ sourceActor, targetActor, item, quantity, hasQuantity })`**  
  If user has ownership on both actors, calls `executeTransferWithPermissions`; otherwise creates transfer data, sends sender “waiting” message, then either GM approval message (if `transfersGMApproves`) or receiver accept/reject message. Used by Panel Party, Inventory, and Weapons panels.
- **`executeTransferWithPermissions(sourceActor, targetActor, item, quantity, hasQuantity)`**  
  Direct transfer (or socketlib `executeAsGM('executeItemTransfer', …)`).  
- **Other helpers**: `_createTransferData`, `_isTargetPlayerOnline`, `_sendTransferSenderMessage`, `_sendTransferReceiverMessage`, `_sendGMTransferNotification`, etc., and socketlib handlers for executing transfers and creating chat messages.

## Hooks (squire.js)

- **Party panel**:  
  - `updateToken` → `partyPanel._onTokenUpdate(document, change)`.  
  - `updateActor` → `partyPanel._onActorUpdate(document, change)`.  
  - `controlToken` → `partyPanel._onControlToken(token, controlled)`.  
  - `renderChatMessage` → `partyPanel._handleTransferButtons(message, html, data)`.
- **Party stats panel**:  
  - `updateCombat`, `updateActor`, `createChatMessage` → `partyStatsPanel._boundUpdateHandler(...)`.

## Handle Integration

- **Party view handle** (`handle-party.hbs`): The current actor's portrait (44px) and HP chip, then `otherPartyMembers` at a smaller portrait (36px) and shorter chip, clickable to switch — the size difference is what makes “which one am I playing” legible without reading a name. The party name label is gone. The full-height HP rail tracks the *current* actor only; members carry their own chip. Data (`actor`, `otherPartyMembers`, `showHandleHealthBar`, etc.) is supplied by HandleManager from the same party token list used by the panel.

## Tray Toolbar (Party View)

- **Select Party** (`.tray-tools-button[data-action="select-party"]`): GM – select all party tokens on scene; Players – select owned tokens. Implemented in `manager-panel.js`; filters `canvas.tokens.placeables` by `hasPlayerOwner` (and for players, `isOwner`).
- **Award** (GM only): Opens award experience dialog; if no tokens selected, uses all party tokens on canvas.

## Settings

| Setting | Key | Scope | Description |
|---------|-----|-------|-------------|
| Show Party Tab | `showTabParty` | user | Show/hide Party tab |
| Show Party Stats Panel | `showPartyStatsPanel` | user | Show MVP panel below party |
| Default Party Name | `defaultPartyName` | world | Label in party handle |
| Transfer Timeout | `transferTimeout` | world | Seconds before transfer request expires |
| Transfers GM Approves | `transfersGMApproves` | world | Require GM approval before receiver sees request |
| Health thresholds | `healthThresholdCritical`, etc. | world | Party/character health bar color bands |

## Technical Notes

- **v13**: Native DOM (`querySelector`, `addEventListener`, `innerHTML`); clone-before-listener pattern to avoid duplicates.
- **Socketlib**: Transfer execution, chat creation, and message deletion use `game.modules.get(MODULE.ID)?.socket` and `executeAsGM(...)` so GM performs document changes.
- **Timer cleanup**: Transfer expiration uses `trackModuleTimeout`; `_transferTimers` Map and `_cleanupTransferTimers()` in `destroy()`.
- **Health overlay**: Same Handlebars helper `healthOverlayHeight` as character panel (registered in panel-character.js).
