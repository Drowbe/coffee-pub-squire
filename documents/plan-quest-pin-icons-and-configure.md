# Plan: Quest Pin Icons & Configure Pin (Revised)

## Feedback incorporated

- **Pin linkage**: Store `pinId` (and `sceneId` where relevant) on the quest journal page, same as notes. Blacksmith owns pin data; we reference pins by ID. Adapt quest flow to this model and capture gaps.
- **Pin types**: Register both `'quest'` and `'objective'` pin types with Blacksmith so we can have different designs per type. Rely on the pin system for all configuration; we only pass defaults.
- **Objective design**: No special “inherit from quest” logic. Pin system is fully configurable; we pass what we want as default per type.
- **Context menu**: Keep using the quest panel’s Blacksmith Context Menu (“...”); no card/row button like notes.

---

## Goal 1: Migrate quests to pin icons (notes-style)

### 1.1 Quest icon storage and helpers (panel-quest.js)

- Add constants: `QUEST_PIN_ICON = 'fa-scroll'`, `OBJECTIVE_PIN_ICON = 'fa-bullseye'`.
- Add helpers (mirror notes):
  - `getDefaultQuestIconFlag()` → `{ type: 'fa', value: 'fa-solid fa-scroll' }`.
  - `normalizeQuestIconFlag(iconFlag)`.
  - `buildQuestIconHtml(iconData, imgClass)`.
  - `resolveQuestIconHtmlFromPage(page, imgClass)` using `page.getFlag(MODULE.ID, 'questIcon')`.

### 1.2 Quest data and template

- In `_prepareQuestData()` (or equivalent), add `iconHtml` per entry via `resolveQuestIconHtmlFromPage(page, 'quest-icon-image')`.
- In **quest-entry.hbs**, replace hardcoded category icons with:
  - `{{#if entry.iconHtml}}{{{entry.iconHtml}}}{{else}}<i class="fa-solid fa-scroll"></i>{{/if}}` inside a `<span class="quest-icon">`.

### 1.3 Pin creation: use stored icon

- In **utility-quest-pins.js**, when creating quest pins, read icon from `page.getFlag(MODULE.ID, 'questIcon')` and pass to `pins.create()` as `image` (same pattern as notes).

---

## Goal 2: Store pinId on quest page (notes-style linkage)

### 2.1 Data model

- On quest journal pages, store (same as notes):
  - `pinId` – Blacksmith pin ID for the **quest-level** pin when placed.
  - `sceneId` – scene where that pin is placed (when placed).
- Objective pins: decide whether each objective has its own `pinId`/`sceneId` (e.g. `objectivePinIds[objectiveIndex]` or a single structure per objective). Recommendation: one pin per objective when placed, stored in a structure keyed by objective index (or equivalent), so we can reference them the same way we reference quest pins.

### 2.2 Creation / placement flow

- When placing a **quest** pin to the canvas: create pin via Blacksmith, then `page.setFlag(MODULE.ID, 'pinId', pin.id)` and `page.setFlag(MODULE.ID, 'sceneId', sceneId)`.
- When placing an **objective** pin: create pin, then store its ID (and scene) on the page (e.g. flag `objectivePins` or per-index flags).
- When deleting / clearing pins: use stored `pinId` (and objective pin IDs) to call `pins.delete(pinId)` and then clear the flags.

### 2.3 Lookup for Configure Pin and elsewhere

- **Configure Pin** for a quest: read `pinId` from `page.getFlag(MODULE.ID, 'pinId')`. If present, call `pins.configure(pinId, { ... })`. No need to search pins by `config.questUuid`.
- Same pattern for “Clear quest pins” and any other actions: use stored IDs from the page.

### 2.4 Gaps to capture

- When migrating from current “lookup by questUuid in config” to “store pinId on page”:
  - Existing scenes may have quest pins without flags. Plan a one-time migration or “re-link” step: for each quest page that has no `pinId` but has a pin on a scene with `config.questUuid` matching that page, set `pinId` (and `sceneId`) on the page and optionally keep `config.questUuid` on the pin for backwards compatibility during transition.
- Document: quests now follow the same pin-ownership model as notes (ID on document, Blacksmith holds pin data).

---

## Goal 3: Register quest and objective pin types

- In **squire.js** (or wherever pin types are registered), register both:
  - `pins.registerPinType(MODULE.ID, 'quest', 'Quest')` (or desired label).
  - `pins.registerPinType(MODULE.ID, 'objective', 'Objective')`.
- Use these types when creating pins so Blacksmith (and any UI) can show different designs/defaults per type.

---

## Goal 4: Configure Pin in quest context menu

### 4.1 Context menu item

- In the quest panel “...” Blacksmith Context Menu, add:
  - **Configure Pin** (e.g. icon `fa-solid fa-palette`), callback: `this._configureQuestPin(uuid)`.

### 4.2 _configureQuestPin(uuid)

- Resolve `page` from `uuid`.
- Get `pinId = page.getFlag(MODULE.ID, 'pinId')`.
- If no `pinId`, show a short message: “No pin for this quest. Pin the quest to the scene first.” (or equivalent).
- If `pinId` exists, call `pins.configure(pinId, { sceneId, moduleId: MODULE.ID, useAsDefault: true, defaultSettingKey: 'questPinDefaultDesign', onSelect: async (config) => { ... } })`.
- In `onSelect`: persist icon and pin design to quest page flags (e.g. `questIcon`, `questPinSize`, `questPinShape`, `questPinStyle`, etc.), then refresh the quest panel.

### 4.3 Default design

- Add client-scoped setting `questPinDefaultDesign` (and optionally a separate default for objectives if we want different defaults).
- When creating a new quest pin, merge `getDefaultPinDesign(MODULE.ID)` (or a quest-specific key) with type-specific defaults.

---

## Goal 5: Pin design from flags when creating pins

- In **utility-quest-pins.js**, when creating a quest or objective pin:
  - Read from page (or objective) flags: `questIcon`, `questPinSize`, `questPinShape`, `questPinStyle`, etc., and pass them into `pins.create()`.
  - If no flags, use module defaults (and/or Blacksmith’s saved default for that pin type).
- No “inherit objective from quest” logic: each type has its own defaults; user configures via Configure Pin and we persist what they choose.

---

## Files to touch (summary)

- **scripts/panel-quest.js** – Icon helpers, `_prepareQuestData` + `iconHtml`, `_configureQuestPin`, context menu “Configure Pin”, any default-design helpers.
- **scripts/utility-quest-pins.js** – Create/update/delete using `pinId`/`sceneId` from page flags; read icon and design from flags; set `pinId`/`sceneId` after create/place; support objective pin IDs storage.
- **scripts/squire.js** – Register pin types `'quest'` and `'objective'`.
- **templates/partials/quest-entry.hbs** – Use `entry.iconHtml` in `.quest-icon` with fallback.
- **scripts/settings.js** – Register `questPinDefaultDesign` (and optionally objective default).
- **styles/panel-quest.css** – `.quest-icon` if needed.
- **Migration / gaps doc** – How we handle existing pins without `pinId` on page (one-time link step or migration).

---

## Order of work (suggested)

1. Register pin types `quest` and `objective` in squire.js.
2. Add quest icon helpers and `iconHtml` in quest data + template (display only; no pinId yet).
3. Add `pinId`/`sceneId` to quest page model; update utility-quest-pins to write/read them on create/place/delete; update any “find pin by questUuid” logic to use stored pinId.
4. Add “Configure Pin” to context menu + `_configureQuestPin` using `pinId` from page; persist design to flags and default setting.
5. When creating pins, pass icon and design from flags (and defaults).
6. Handle existing pins without flags (migration or re-link) and document gaps.
