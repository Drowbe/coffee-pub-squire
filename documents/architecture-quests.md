# Coffee Pub Squire – Quest System Architecture

## Overview

The Quest system provides structured adventure and task management for FoundryVTT. It features quest creation, progress tracking, visual scene integration via canvas pins, and rich metadata management. The system uses FoundryVTT's native Journal system as its data store. Pins are rendered and persisted via the **Blacksmith Pins API** (coffee-pub-blacksmith).

## Project Files

| File | Class/Purpose |
|------|---------------|
| `scripts/panel-quest.js` | `QuestPanel` – Main panel UI, filtering, organization, Pin to Scene, menubar quest trackers |
| `scripts/window-quest.js` | `QuestWindow` – Blacksmith Application V2 window for quest create/edit |
| `scripts/utility-quest-parser.js` | `QuestParser` – Parses HTML journal content to JS objects |
| `scripts/manager-pins.js` | Unified Blacksmith Pins gateway – pin CRUD, events, context menus, panel navigation (`focusQuestInPanel`, `focusCodexInPanel`) |
| `scripts/manager-notifications.js` | Transient menubar notifications for party-visible events (quest/objective status, codex unlocks, effects, notes) |
| `templates/panel-quest.hbs` | Panel template |
| `templates/window-quest.hbs` | Blacksmith V2 quest window template |
| `templates/handle-quest.hbs` | Handle content for quest view (tray handle) |
| `templates/partials/quest-entry.hbs` | Quest entry partial |
| `templates/tooltip-pin-quests-objective.hbs` | Objective pin tooltip (tray handle hover) |
| `styles/panel-quest.css` | Panel styles |
| `styles/window-quest.css` | Quest window styles |
| `styles/quest-markers.css` | Pin marker styles |

## Core Design

### Journal as System of Record

Each quest is a separate page within a designated journal (`questJournal` setting). This approach provides:
- Native FoundryVTT integration (standard journal pages)
- Built-in permissions (ownership and visibility)
- User familiarity (GMs/players already understand journals)
- Progress persistence (quest state stored in content)

### Structured HTML Content with State Markers

Quests are stored as HTML with semantic markup:

```html
<p><strong>Category:</strong> Main Quest</p>
<p><strong>Status:</strong> In Progress</p>
<p><strong>Tasks:</strong></p>
<ul>
  <li>Objective 1</li>
  <li><s>Completed Objective</s></li>
  <li><code>Failed Objective</code></li>
  <li><em>Hidden Objective</em></li>
</ul>
```

**State Markers:**
- Plain text: Active tasks
- `<s>`, `<del>`, `<strike>`: Completed tasks
- `<code>`: Failed tasks
- `<em>` or `<i>`: Hidden tasks (GM-only)

**Embedded Metadata:**
- `||text||`: GM hints
- `((treasure))`: Treasure unlocks

### Scene Pin Integration (Blacksmith API)

Pins are created and placed via the Blacksmith Pins API. Position persistence is handled by Blacksmith.

## Components

### QuestParser (`utility-quest-parser.js`)

Converts HTML journal content into structured JavaScript objects.

**Key Method: `parseSinglePage(page, enrichedHtml)`**
- Uses `DOMParser` for safe HTML parsing
- Extracts all quest fields (category, description, plotHook, location, tasks, rewards, participants, tags, status)
- Determines task states from HTML markup
- Extracts GM hints and treasure unlocks from task text
- Calculates quest progress based on completed tasks
- Returns structured quest object or `null` if invalid

### QuestWindow (`window-quest.js`)

Blacksmith Application V2 window for creating and editing quests.

**Key Features:**
- All quest fields (name, category, status, description, plot hook, location, tasks, rewards, participants, tags, visibility)
- Generates structured HTML via `_generateJournalContent()`
- Creates/updates journal pages via `createEmbeddedDocuments()`
- Stores quest UUID in page flags

### QuestPanel (`panel-quest.js`)

Main UI component for displaying and managing quests.

**Data Structure:**
```javascript
{
  categories: ["Pinned", "Main Quest", "Side Quest", "Completed", "Failed"],
  data: { "Main Quest": [...], "Side Quest": [...] },
  statusGroups: { "In Progress": [...], "Not Started": [...], "Complete": [...], "Failed": [...] },
  filters: { search: "", tags: [], category: "all" },
  allTags: Set
}
```

**Key Methods:**
- `_refreshData()` – Loads journal pages, enriches HTML, parses with `QuestParser`
- `render(element)` – Renders panel with Handlebars, groups by status, applies filters
- `_activateListeners(html)` – Sets up event handlers for all interactions

**Filtering:** Client-side DOM filtering for performance (no re-render needed).

### Quest Pins (Blacksmith API)

Visual representation of quests and objectives on the canvas via `pins.create()`, `pins.place()`, `pins.update()`, `pins.delete()`.

**Pin Types:**
- **Quest pins** (`type: 'quest'`, `shape: 'circle'`): Represent entire quests
- **Objective pins** (`type: 'objective'`, `shape: 'square'`): Represent specific objectives

**Data Passed to Blacksmith API**

| Field | Quest Pin | Objective Pin |
|-------|-----------|---------------|
| `moduleId` | `coffee-pub-squire` | `coffee-pub-squire` |
| `type` | `'quest'` | `'objective'` |
| `shape` | `'circle'` | `'square'` |
| `text` | `Q{questIndex}` | `Q{questIndex}.{objectiveIndex+1}` |
| `size` | 32 | 28 |
| `style.fill` | From status/state (see below) | From objective state |
| `config.questUuid` | ✓ | ✓ |
| `config.questIndex` | ✓ | ✓ |
| `config.questCategory` | ✓ | ✓ |
| `config.questStatus` | ✓ | — |
| `config.questState` | ✓ (`visible`/`hidden`) | ✓ |
| `config.objectiveIndex` | — | ✓ |
| `config.objectiveState` | — | ✓ |
| `config.objectiveText` | — | ✓ |
| `ownership` | `calculateQuestPinOwnership(page)` | `calculateQuestPinOwnership(page, objective)` |

**Quest Status → Pin Color:**
| Status | Color (hex) |
|--------|-------------|
| Complete | `#00ff00` (Green) |
| Failed | `#ff0000` (Red) |
| In Progress | `#ffff00` (Yellow) |
| Not Started | `#ffffff` (White) |
| Hidden state | `#000000` (Black) |

**Objective State → Pin Color:**
| State | HTML Marker | Color (hex) |
|-------|-------------|-------------|
| active | Plain text | `#ffff00` (Yellow) |
| completed | `<s>`, `<del>`, `<strike>` | `#00ff00` (Green) |
| failed | `<code>` | `#ff0000` (Red) |
| hidden | `<em>`, `<i>` | `#000000` (Black) |

**Ownership Calculation** (`calculateQuestPinOwnership(page, objective)`):
- **Note**: Global hide-all is handled by Blacksmith via `pins.setModuleVisibility()`; no ownership mutation.
1. **Layer 1**: GMs always see (`users[gmId]: OWNER`)
2. **Layer 2**: Quest `visible` flag false → Hidden from players, GMs only (crown badge)
3. **Layer 3**: Objective `state === 'hidden'` → Hidden from players, GMs only (crown badge)
4. **Layer 4**: Otherwise → Everyone `OBSERVER`

**Interactive Features:**
- **Left-click**: Open quest tab, expand entry, scroll to quest/objective, flash highlight
- **Right-click**: Context menu (GM-only items) – Complete Objective, Fail Objective, Toggle Hidden from Players (quest), Toggle Objective Hidden (objective), Delete Pin
- **Pin to Scene**: GM clicks icon on quest/objective in panel → crosshair mode → click canvas to place
- **Drag**: GMs can reposition (Blacksmith persists position)

**Quest Numbering:** Hash-based from UUID (Q1–Q100), via `getQuestNumber(questUuid)` in `helpers.js`.

## Data Flow

### Quest Creation
1. User clicks "Add Quest" → `QuestWindow` opens through Blacksmith
2. User fills form → `_generateJournalContent()` creates HTML
3. Form creates `JournalEntryPage` via `createEmbeddedDocuments()`
4. Form sets quest UUID in page flags
5. Panel refresh → `QuestParser.parseSinglePage()` extracts data
6. Panel renders updated quest

### Objective Completion
1. GM clicks objective checkbox in panel **or** right-clicks pin → context menu → Complete/Fail Objective
2. Event handler updates journal HTML (`<s>`, `<code>`, `<em>`, or plain text) via `updateObjectiveStateInJournal`
3. Updates quest status if all tasks completed
4. Journal update triggers `updateJournalEntryPage` hook → `_routeToQuestPins` → `updateQuestPinStylesForPage`
5. Panel re-renders; pin style (color) syncs via `pins.update()`
6. The acting client shows its local notification; every *other* client gets a transient toast from `manager-notifications.js` (see Notifications below)

### Pin Creation
1. GM clicks "Pin to Scene" icon on quest or objective in panel
2. Crosshair mode activates; preview element follows mouse
3. GM clicks canvas at desired position
4. `createQuestPin` or `createObjectivePin` calls `pins.create()` then `pins.place()`
5. Blacksmith persists position; pin persists across scene changes

## Notifications

Quest state surfaces in the Blacksmith menubar two ways: two **persistent trackers** owned by `QuestPanel`, and **transient event toasts** owned by `manager-notifications.js`. All of them use Blacksmith `addNotification()` options (Blacksmith 13.9.3+): `onClick` navigates, `onDismiss` handles the ×, `pulse` draws attention. On older Blacksmith builds the options argument is ignored and notifications degrade to display-only.

### Persistent trackers (pinned quest, active objective)

- One notification each, deduped via static IDs (`QuestPanel.questNotificationId`, `QuestPanel.activeObjectiveNotificationId`); update-or-recreate on change, `duration: 0`.
- **Click** opens the quest panel and scrolls to the quest/objective via `focusQuestInPanel()` (manager-pins.js — the same flow as pin double-click). Handlers are set once at creation and resolve the pinned quest / active objective **from user flags at click time**, so text-only `updateNotification` refreshes can never leave them pointing at a stale quest. Blacksmith removes a clicked notification, so `onClick` also nulls the stored ID; the next update recreates cleanly.
- **× dismissal sticks for the session**: `onDismiss` sets `QuestPanel.questNotificationDismissed` / `activeObjectiveNotificationDismissed`, which the notify paths check before recreating. Only a deliberate act lifts suppression — repinning a quest, or setting an active objective. Clicking the body is navigation, not dismissal, and does not suppress. A reload clears both flags.

### GM → player sync

The pinned quest and active objective are party-wide state stored in per-user flags (`pinnedQuests`, `activeObjectives`). Two halves keep clients in agreement:

1. **Broadcast**: GM pin/active/clear actions mirror the flag onto every player's User document (`QuestPanel._mirrorTrackerFlagToPlayers`). Players' own pin actions stay local.
2. **Receive**: an `updateUser` hook (squire.js) fires on a player's client when *their* user document is changed by *someone else*. It lifts the ×-dismissal suppression for whichever tracker changed, explicitly clears an emptied tracker, re-renders the quest panel (or drives `_checkAndNotifyPinnedQuest` / `_checkAndNotifyActiveObjective` directly if the tab is still lazy), and refreshes the handle. Diff keys are matched operator-stripped (`==`/`-=` prefixes, flattened paths) — same caution as the actor-ownership hook.

### Transient event toasts (`manager-notifications.js`)

Short-lived (5s) toasts for party-visible events, shown on every client **except the initiator** (the acting client already has its local notification):

| Event | Toast | Link |
|-------|-------|------|
| Quest status → In Progress / Not Started / Complete / Failed | "Quest active/available/completed (pulses)/failed" | `focusQuestInPanel(uuid)` |
| Objective completed / failed / reopened / revealed | "Objective completed: …", hidden→active reads "New objective" | `focusQuestInPanel(uuid, index)` |
| Codex entry unlocked (ownership → Observer) | "Codex unlocked: X"; bursts within 1.5s collapse to "*N* codex entries unlocked" | `focusCodexInPanel(uuid)` |
| Active effect applied to an owned actor | "Actor: Effect" (non-GM owners only) | none |
| Party note updated (visibility `party`/`all`, content/title edits only) | "Note updated: X" | `notesPanel.showNote(uuid)` |

Change detection needs a before-state that update hooks don't carry, so `initTransientNotifications()` (ready) snapshots quest statuses/objective states and codex visibility; each update diffs against the snapshot and replaces it. Pages first seen later enter the baseline silently. Guards: no toasts for quests flagged invisible (players), objectives becoming hidden, private notes, or objective lists whose length changed (index diff would mislabel shifted tasks).

## Export/Import System

The quest system supports full JSON export/import including scene pins.

### Export Format (v1.1)
```json
{
  "quests": [...],
  "scenePins": {
    "sceneId1": {
      "sceneName": "Scene Name",
      "sceneId": "sceneId1",
      "questPins": [...]
    }
  },
  "exportVersion": "1.1",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "metadata": {
    "totalQuests": 15,
    "totalScenesWithPins": 3,
    "totalPins": 25
  }
}
```

### What's Exported
- Quest content (tasks, rewards, participants, etc.)
- Quest progress (completed/failed objectives, status)
- Scene pins (positions on all scenes) – *Note: Export currently reads from legacy scene flags. Pins created after Blacksmith migration are stored by Blacksmith; a future update may source from `pins.list()`.*
- Pin states (objective completion, visibility)

### Import Logic
- **Detects format**: Legacy (quests only) or Enhanced (quests + pins)
- **Updates existing**: Matches quests by name, updates them
- **Creates new**: Adds quests that don't exist
- **Merges pins**: Intelligently combines scene pin data
- **Preserves progress**: Maintains existing quest states

### Use Cases
- **World transfer**: Export from source, import to target
- **Backup/restore**: Save current state, restore later
- **Multi-GM collaboration**: Share world state between GMs
- **Compendium workaround**: Export pins before compendium, import after placing scene

### Troubleshooting
- **Pins not appearing**: Check if scenes exist with matching names; refresh canvas
- **Duplicate pins**: System should prevent; clear all pins and re-import if needed
- **Progress reset**: Should not happen; verify importing to correct world

## Settings

| Setting | Key | Scope | Description |
|---------|-----|-------|-------------|
| Quest Journal | `questJournal` | world | Journal for quest pages |
| Quest Categories | `questCategories` | world | Available categories (default includes Pinned, Main Quest, Side Quest, Completed, Failed) |
| Show Quest Pin Titles | `showQuestPinText` | user | Display quest/objective names below pins; when off, only numbers (Q85, Q85.03) and icons |

**Pin visibility toggle:** Uses Blacksmith `pins.setModuleVisibility(moduleId, visible)` / `pins.getModuleVisibility(moduleId)` for per-user hide/show without ownership mutation.

## Hooks Integration

**Blacksmith HookManager (squire.js):**
- **Journal:** `updateJournalEntryPage`, `createJournalEntryPage`, `deleteJournalEntryPage` – route to quest panel refresh and/or quest pin updates (`_routeToQuestPanel`, `_routeToQuestPins`), plus `routeTransientJournalUpdate` / `recordCreatedPageBaseline` for the transient notifications. On visibility or content change, `_routeToQuestPins` calls `updateQuestPinVisibility` and `updateQuestPinStylesForPage`.
- **User:** `updateUser` – receiving half of the GM → player tracker sync (see Notifications above); reacts only when the client's own user document is changed by someone else.
- **Panel:** After render, `QuestPanel` calls `Hooks.call('renderQuestPanel')`. Blacksmith handles pin visibility; `showQuestPinText` and `hideQuestPins` apply via `pins.reload({ moduleId })` when settings change.
- **Scene/canvas:** `canvasReady` runs `registerQuestPinEvents()`. Blacksmith manages pin lifecycle; no PIXI containers.

## Technical Requirements

- FoundryVTT v13+
- D&D 5e system 5.5+
- Required: `coffee-pub-blacksmith`

## Best Practices

### Error Handling
```javascript
try {
  const quest = await QuestParser.parseSinglePage(page, enriched);
  if (quest) { /* process */ }
} catch (error) {
  console.error('Error parsing quest entry:', error);
}
```

### Async Content (v13+)
```javascript
let content = '';
if (typeof page.text?.content === 'string') {
  content = page.text.content;
} else if (page.text?.content) {
  content = await page.text.content;
}
```

### Performance
- Client-side filtering (DOM manipulation) instead of re-rendering
- Cache parsed quests when possible
- Batch journal page operations
- Debounce rapid state changes

### Pin Management
- Check for existing pins before creating (avoid duplicates)
- Clean up orphaned pins (reference non-existent quests)
- Update pin appearance when quest state changes via `updateQuestPinStylesForPage`
- Blacksmith persists pin positions; no manual save needed
