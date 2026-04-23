# Plan: Pin Taxonomy Migration

**Reference:** [Blacksmith Pins API](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/API:-Pins) | [guide-pin-migration.md](guides/guide-pin-migration.md)

## Context

Blacksmith ships default pin taxonomy definitions for `coffee-pub-squire` in its global JSON, defining four pin categories with specific type keys and tags. Squire's current implementation uses different type strings (`quest`, `objective`, `coffee-pub-squire-sticky-notes`) and never calls `registerPinTaxonomy()` or sets `tags` on any pin it creates. This means:

- Pins are invisible to the tag-based visibility system
- Configure Pin tag picker shows nothing type-scoped for Squire pins
- Pin Layers tag cloud is empty for Squire

The migration aligns Squire's pin type names with the Blacksmith taxonomy, registers the taxonomy, adds tags to every pin creation call, and migrates existing world pins to the new type names in a one-time on-ready migration.

---

## Blacksmith-Defined Taxonomy (authoritative source)

```json
"coffee-pub-squire": {
  "pinCategories": {
    "note-pin":      { "tags": ["party","personal","location","todo","sticky"] },
    "codex-pin":     { "tags": ["artifact","book","character","event","faction","location","item","map"] },
    "quest-pin":     { "tags": ["quest","main","side","optional","backstory"] },
    "objective-pin": { "tags": ["objective","main","side","optional","backstory"] }
  }
}
```

---

## Current → Target Type Mapping

| Current type string              | New type string   | Pin source                       |
|----------------------------------|-------------------|----------------------------------|
| `quest`                          | `quest-pin`       | `scripts/utility-quest-pins.js`  |
| `objective`                      | `objective-pin`   | `scripts/utility-quest-pins.js`  |
| `coffee-pub-squire-sticky-notes` | `note-pin`        | `scripts/panel-notes.js`         |
| *(not yet implemented)*          | `codex-pin`       | future — register only for now   |

---

## Files to Modify

| File | Change |
|------|--------|
| `scripts/squire.js` (lines 1938–1942) | Add `registerPinTaxonomy()`; update `registerPinType()` strings; add one-time type migration |
| `scripts/utility-quest-pins.js` | Rename type strings; add `tags` to quest and objective pin creation |
| `scripts/panel-notes.js` | Rename type string; add `tags` to note pin creation |
| `scripts/quest-pin-events.js` | Update any `type` filter/comparison strings |

---

## Step 1 — Register Taxonomy (`scripts/squire.js`, ~line 1938)

Replace the existing `registerPinType()` block with:

```javascript
// Register friendly names for UI labels
pins.registerPinType(MODULE.ID, 'quest-pin',     'Quest Pin');
pins.registerPinType(MODULE.ID, 'objective-pin', 'Objective Pin');
pins.registerPinType(MODULE.ID, 'note-pin',      'Note Pin');
pins.registerPinType(MODULE.ID, 'codex-pin',     'Codex Pin');

// Register taxonomy — drives Configure Pin tag picker and Pin Layers tag cloud
pins.registerPinTaxonomy(MODULE.ID, {
    pinCategories: {
        'note-pin':      { label: 'Note Pin',      tags: ['party','personal','location','todo','sticky'] },
        'codex-pin':     { label: 'Codex Pin',     tags: ['artifact','book','character','event','faction','location','item','map'] },
        'quest-pin':     { label: 'Quest Pin',     tags: ['quest','main','side','optional','backstory'] },
        'objective-pin': { label: 'Objective Pin', tags: ['objective','main','side','optional','backstory'] }
    }
});
```

---

## Step 2 — One-Time Type Migration (`scripts/squire.js`, same `ready` hook)

After taxonomy registration, add a migration block that runs once per world (GM only):

```javascript
const PIN_MIGRATION_FLAG = 'pinTypeMigrationV1';
const alreadyMigrated = game.settings.get(MODULE.ID, PIN_MIGRATION_FLAG) ?? false;
if (!alreadyMigrated && game.user.isGM) {
    const typeMap = {
        'quest':                          'quest-pin',
        'objective':                      'objective-pin',
        'coffee-pub-squire-sticky-notes': 'note-pin'
    };
    for (const [oldType, newType] of Object.entries(typeMap)) {
        const placed = pins.list({ moduleId: MODULE.ID, type: oldType }) ?? [];
        for (const pin of placed) {
            await pins.update(pin.id, { type: newType }, { sceneId: pin.sceneId });
        }
    }
    const unplaced = pins.list({ moduleId: MODULE.ID, unplacedOnly: true }) ?? [];
    for (const pin of unplaced) {
        const newType = typeMap[pin.type];
        if (newType) await pins.update(pin.id, { type: newType });
    }
    await game.settings.set(MODULE.ID, PIN_MIGRATION_FLAG, true);
}
```

Add the setting to `registerSettings()`:

```javascript
game.settings.register(MODULE.ID, 'pinTypeMigrationV1', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: false
});
```

---

## Step 3 — Quest & Objective Pins (`scripts/utility-quest-pins.js`)

In `createQuestPin()`:
- `type: 'quest'` → `type: 'quest-pin'`
- Add `tags: ['quest']` (verify at implementation time whether `questCategory` values match taxonomy tags `main`/`side`/`optional`/`backstory`; if so, include a second tag)

In `createObjectivePin()`:
- `type: 'objective'` → `type: 'objective-pin'`
- Add `tags: ['objective']` (same questCategory check)

In any `pins.list({ type: 'quest' })` or `type: 'objective'` calls, update to the new strings.

---

## Step 4 — Note Pins (`scripts/panel-notes.js`)

Change the `NOTE_PIN_TYPE` constant from `'coffee-pub-squire-sticky-notes'` to `'note-pin'`.

Add tags derived from the note's visibility flag:

```javascript
tags: [page.getFlag(MODULE.ID, 'visibility') === 'party' ? 'party' : 'personal'],
```

Update any `pins.list({ type: NOTE_PIN_TYPE })` calls (the constant update covers these automatically).

---

## Step 5 — Event/Filter Code (`scripts/quest-pin-events.js`)

Search for any `pin.type === 'quest'` or `pin.type === 'objective'` comparisons and update to `'quest-pin'` / `'objective-pin'`.

---

## Tags Derivation Reference

| Pin type       | Tags (minimum)      | Optional extra tag                            |
|----------------|---------------------|-----------------------------------------------|
| `quest-pin`    | `['quest']`         | Add questCategory if it matches: `main`, `side`, `optional`, `backstory` |
| `objective-pin`| `['objective']`     | Same questCategory check                      |
| `note-pin`     | from visibility flag | `'party'` visibility → `['party']`; `'private'` → `['personal']` |
| `codex-pin`    | *(no creation code yet)* | —                                        |

---

## Verification

1. Load world → no pin-related errors in browser console
2. Open Pin Layers → Squire pin types appear with correct friendly labels
3. Place a quest pin → Configure Pin tag chip row shows: `quest`, `main`, `side`, `optional`, `backstory`
4. Place a note pin → Configure Pin tag chip row shows: `party`, `personal`, `location`, `todo`, `sticky`
5. Existing pins → reload world, old pins show new type labels in Configure Pin header
6. Console check: `game.settings.get('coffee-pub-squire', 'pinTypeMigrationV1')` → `true`
7. Second reload → migration block does NOT re-run

---

## Implementation Notes

**Date implemented:** 2026-04-22

**Additional file discovered during grep:** `scripts/panel-quest.js` contained 4 more old type string references not listed in the original plan — all fixed:
- `isQuestOrObjectivePin` predicate (`'quest'`/`'objective'` → `'quest-pin'`/`'objective-pin'`)
- `pins.list({ type: 'quest', ... })` × 2 in find-existing check before pin-to-scene
- `pins.list({ type: 'objective', ... })` × 2 in find-existing check before pin-to-scene
- `pins.list({ type: 'objective', ... })` in `hasPinOnScene` detection

**False positives confirmed safe:**
- `manager-handle.js` — `viewMode === 'quest'` is a UI view mode string, unrelated to pin types
- `squire.js` migration map — old strings appear intentionally as map keys for the one-time rename

**questCategory tag enrichment deferred:** Quest and objective pins use safe single-tag defaults (`['quest']`, `['objective']`). The `questCategory` field holds human-readable values like `'Side Quest'`/`'Main Quest'` that don't match taxonomy keys directly. A future pass can map these (e.g. `'Main Quest'` → `'main'`) and add a second tag.

**tags in update patch (panel-notes.js):** Added to the update patch so a note's pin tag stays in sync if visibility changes (private ↔ party) on the next style refresh.
