# TODO

## Enhancements

- **Manage which statuses the handle shows**: the handle currently renders every active effect on the actor (`manager-handle.js` `effects:` map). Add a way to manage/filter which statuses appear — e.g. a setting or per-condition toggle (conditions only vs. all effects, hide passive item effects, etc.).
- **Support third-party statuses (e.g. Bibliosoph "injury" statuses)**: effects from other modules show in the handle but the click dialog has no description — the lookup only knows `CONFIG.DND5E.conditionTypes`. Fall back to the effect's own data (`effect.description`, enriched) when the name doesn't match a dnd5e condition, and consider `CONFIG.statusEffects` as a second lookup source so any module-registered status resolves.

## Bugs

- ~~**Quest/objective pin legacy color data**: existing pins still render with colored borders.~~ **RESOLVED (13.3.3)**. Root cause was not a stray color write — the current create path writes a white stroke and update paths never touch style, and Blacksmith renders the border purely from `style.stroke` with no status-based logic. The colored borders were the pre-13.3.0 per-state ring colors (red/green/grey) baked into `style.stroke` by the 13.3.0 migration and frozen there. Fixed with the one-time `migrateSquirePinStyles` GM migration (gated by `pinStrokeMigrationDone`) that resets stroke on existing quest/objective pins to the current design. Note: the original "strip fill/stroke so pins fall back to Blacksmith defaults" plan was stale — the 13.3.1 design language deliberately assigns per-type colors, so the migration normalizes to those instead.

## Critical

- Quest persistence refactor: separate quest definition data (imported/updatable content) from quest runtime state (progress, status, visibility, active objective, pin bindings), and migrate to stable IDs.
  - Add persistent `questId` and `taskId` fields; merge updates by ID instead of task index/name.
  - Store state in structured module flags (do not parse task state from HTML tags).
  - Keep pins/state keyed by `questId` + `taskId`, with reconcile as recovery only.
  - Add import mode: "update definitions only" to protect live campaign progress during compendium/content updates.
  - Include migration from current HTML/flag state to new schema with backward compatibility.
- Quest taxonomy management: create a way to manage quest locations and tags centrally, including migrating those changes to existing quests.
- Leverage the Blacksmith tag system for quests instead of the local quest tag implementation, reusing the same tag model already used for pins.
- **Pin default tags from API**: Replace `QUEST_CATEGORY_TAG_MAP` and the hardcoded tag logic in `_questCategoryToPinTags()` with a pattern that reads default tags directly from the registered taxonomy via `pins.getModuleTaxonomy()`. Currently the taxonomy (what shows as Suggested in Configure Pin) and the tag-assignment map are kept in sync manually — the API should be the single source of truth for both.
- **Codex tag migration**: Codex tags were changed from hardcoded singular slugs (`'character'`, `'faction'`, `'artifact'`, etc.) to dynamic category-derived slugs (`'characters'`, `'factions'`, `'artifacts'`, etc.). Existing pins in Blacksmith still carry the old singular tags. A one-time GM migration is needed to rename the old tags on all existing Squire codex pins to match the new naming convention.
