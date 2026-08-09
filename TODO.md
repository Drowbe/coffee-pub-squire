# TODO

## Enhancements

- **Manage which statuses the handle shows**: the handle currently renders every active effect on the actor (`manager-handle.js` `effects:` map). Add a way to manage/filter which statuses appear — e.g. a setting or per-condition toggle (conditions only vs. all effects, hide passive item effects, etc.). `showHandleConditions` is all-or-nothing and does not cover this.
- **Remove the `trayPosition` setting**: registered `config: false` for compatibility only, since left is the only option. Removing it means untangling the panel template-data reads and the many `.squire-tray[data-position="left"]` CSS selectors first, then deleting the setting and its `onChange`. Comment lives at `settings.js:212`.

## Critical

- Quest persistence refactor: separate quest definition data (imported/updatable content) from quest runtime state (progress, status, visibility, active objective, pin bindings), and migrate to stable IDs.
  - Add persistent `questId` and `taskId` fields; merge updates by ID instead of task index/name.
  - Store state in structured module flags (do not parse task state from HTML tags).
  - Keep pins/state keyed by `questId` + `taskId`, with reconcile as recovery only.
  - Add import mode: "update definitions only" to protect live campaign progress during compendium/content updates.
  - Include migration from current HTML/flag state to new schema with backward compatibility.
- Quest taxonomy management: create a way to manage quest locations and tags centrally, including migrating those changes to existing quests.
- Leverage the Blacksmith tag system for quests instead of the local quest tag implementation, reusing the same tag model already used for pins.
- **Pin default tags from API**: Replace `QUEST_CATEGORY_TAG_MAP` (`manager-pins.js:124`) and the hardcoded tag logic in `_questCategoryToPinTags()` with a pattern that reads default tags directly from the registered taxonomy via `pins.getModuleTaxonomy()`. Partially done: the live taxonomy is already read and used to *validate* the mapping, but the category→tag map is still the source of truth and still kept in sync by hand.

## Module split

Tracked in full in `documents/plan-module-split.md`. Phase 0 (campaign content out of the tray) is done; the next step is moving the dice tray, HP window, and macros to Blacksmith.

## Cross-module work

- **Migrate item mutation to Blacksmith `api.inventory`** — **now unblocked**, the API shipped 2026-08-08 with `transferItem`, `transferItems`, `grantItem`, `grantItems`, currency, `stack: 'merge'` by default, `ignoreFlags`, and a `flags` parameter so arrival flags ride the create. The four `_completeItemTransfer` copies (`transfer-utils.js`, `panel-party.js`, `manager-panel.js`, the `squire.js` socket handler) collapse into `transferItem` calls; the four drop-create sites become `grantItem`. Pass `ignoreFlags: ['coffee-pub-squire.isNew', 'coffee-pub-squire.isHandleFavorite']` and `flags` for `isNew` on every call. The quantity re-checks in the three copies become redundant; the container guard in `getTransferBlocker()` stays, since it puts the refusal in front of the quantity dialog rather than after it, and Blacksmith refuses the same case with `CONTAINER_HAS_CONTENTS`.
  - Worth doing sooner than later: this session found four separate bugs in those hand-rolled copies (unlinked-token classification, guard placement, prototype names, duplicate chat cards), all of which the API handles centrally.
- **Revisit the dnd5e `updateEncumbrance` upstream report after the v14 migration**. `Actor5e#updateEncumbrance` is an unguarded check-then-create against a fixed effect id, so any two writes to one actor can collide. Blacksmith holds a prepared report in its `TODO-GLOBAL.md`; filing was deferred because a report against a system version this world cannot run earns "upgrade and retry". Squire offered to co-sign. Blacksmith's `enableEncumbranceGuard` mitigates it in the meantime.
