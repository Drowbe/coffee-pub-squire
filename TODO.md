# TODO

## Bugs

- **Quest/objective pin legacy color data**: Pinning is broken and existing pins still render with colored borders. The code changes to stop forcing colors only affect new API calls — pins already stored in Blacksmith have fill/stroke colors baked into their style data from previous builds. Need to audit the full pin creation/update pipeline for any remaining color writes, and likely run a one-time GM migration to strip `fill` and `stroke` from all existing Squire quest/objective pins so they fall back to Blacksmith defaults.

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
