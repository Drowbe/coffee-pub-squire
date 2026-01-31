# API Needs: Blacksmith Pins (for Squire Quest Pins)

**Audience:** Blacksmith Pins API developer  
**From:** Coffee Pub Squire (quest pin consumer)  
**Date:** 2026-01-26

Squire has migrated its quest pin system to the Blacksmith Pins API. The following are our **API needs** (enhancements that would simplify our integration or restore behavior we had before migration). We have workarounds where noted; these are requests for a better long-term story.

---

## 1. Global “Hide All Pins” by Module (or Type)

**Need:** A way for a user to hide *all* pins from a given module (e.g. all Squire quest pins) without each pin’s ownership being recalculated and without a full reload.

**Current workaround:** We set `ownership.default = NONE` and `ownership.users = {}` when `game.user.getFlag(MODULE.ID, 'hideQuestPins')` is true, and call `pins.reload({ moduleId })` when the user toggles. That works but forces a full reload and re-evaluation of every pin.

**Ideal API (example):** Something like:
- `pins.setVisibilityFilter(moduleId, visible)` (user-level “hide all pins for this module”), or
- A supported place to pass a “hide all for module” flag that the API respects when deciding whether to render pins, so we don’t have to mutate ownership on every pin and trigger a reload.

**Priority:** Nice-to-have. We can keep the current workaround if needed.

---

## 2. GM-Only Visual Indicator for “Hidden from Players” Pins

**Need:** A way to show GMs a different appearance for pins that are hidden from players (e.g. “second ring” or distinct stroke/badge), while players do not see those pins at all.

**Current state:** We pass ownership so only GMs see the pin when it’s “hidden from players.” GMs see the same visual as a normal pin; we no longer have a second ring or other GM-only cue.

**Ideal API (example):** One of:
- A pin option like `gmOnlyOverlay: true` or `hiddenFromPlayersStyle: { stroke, ... }` that the API renders only for users with sufficient ownership (e.g. OWNER), or
- A convention (e.g. a specific `config` or `style` field) that the API interprets as “render an extra ring/outline for GM viewers only.”

**Priority:** Nice-to-have. We can live without it; documenting for future enhancement.

---

## 3. Context Menu Items: GM-Only Visibility

**Need:** A way to register context menu items that are **shown only to GMs** (e.g. “Complete Objective”, “Fail Objective”, “Toggle Hidden from Players”, “Delete Pin”). Players would only see items that are safe for them (e.g. “View quest” if we add it).

**Current state:** We use `pins.registerContextMenuItem()` with `visible: (pinData) => pinData?.type === 'objective'` etc. We have no way to indicate “this item is GM-only,” so we rely on our own permission checks inside `onClick`. The menu item still appears for players; they would get no-op or errors if we didn’t guard in `onClick`.

**Ideal API (example):** An option on the registered item, e.g. `gmOnly: true`, so the API does not show that item to non-GM users.

**Priority:** Medium. We can keep guarding in `onClick`, but hiding GM-only items from the menu would be clearer and safer.

---

## 4. Optional: Ownership Resolver Hook

**Need:** If the API supported something like `blacksmith.pins.resolveOwnership(pinData)`, we could return ownership from a single place (e.g. based on quest/objective visibility and `hideQuestPins`) instead of passing `ownership` on every `pins.create()` and `pins.update()`.

**Current state:** We compute ownership in `calculateQuestPinOwnership(page, objective)` and pass it in each create/update. This is fine; a hook would just reduce duplication and keep ownership logic in one place.

**Priority:** Low. Optional convenience.

---

## 5. What We’re Not Asking For

- **Filter by `config` in `pins.list()`:** We’re fine with `pins.list({ moduleId, sceneId })` and filtering by `config.questUuid` (and similar) in our code.
- **Double right-click:** We moved “Delete pin” into the context menu; no need for double right-click in the API.
- **Change to event payload:** Using `evt.pin.moduleId` and `evt.pin.config` works for us.

---

## Summary Table

| Need | Priority | We have workaround? |
|------|----------|---------------------|
| Hide-all by module/type | Nice-to-have | Yes (ownership + reload) |
| GM-only visual for hidden pins | Nice-to-have | No (we dropped second ring) |
| GM-only context menu items | Medium | Yes (guard in onClick) |
| Ownership resolver hook | Low | N/A (convenience only) |

If you want to tackle one first, **GM-only context menu items** would give the clearest UX improvement for the least change on our side.
