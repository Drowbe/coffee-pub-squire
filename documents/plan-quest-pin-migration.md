# Quest Pin Migration Plan: Completion Pass

**System of record:** This document is the single source of truth for the remaining quest pin migration work.

## Authoritative Reference

- **Blacksmith Pins API**: [API: Pins · coffee-pub-blacksmith Wiki](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/API:-Pins)
- **Notes implementation reference**: `documents/quest-pin-migration-findings.md`

## Overview

Quest pins were the original pin system and later became the foundation for the Blacksmith Pins API. The migration away from custom quest pin rendering is largely complete, but the codebase still carries legacy sync assumptions from the intermediate state.

The remaining work is not a rendering migration. It is a **state-model cleanup**:

- Blacksmith must be the source of truth for pin existence and placement.
- Quest/objective page flags must be treated as a lightweight mirror only.
- Quest/objective pins must follow the same lifecycle pattern as Notes.
- Reconciliation must be a repair tool, not the normal runtime engine.

## What Is Already Done

- Quest pins render through Blacksmith, not custom PIXI rendering.
- Quest/objective pin creation, placement, unplacement, deletion, and configuration go through the Blacksmith Pins API.
- The panel uses explicit "Pin to Scene" style placement rather than legacy drag-created quest pins.
- Ownership, style, and taxonomy data are already mapped onto Blacksmith pin records.

## Current Problems

The remaining bugs come from legacy quest-side state handling, not from the Blacksmith API itself.

Symptoms of the unfinished migration:

- quest/objective pin state can drift after scene changes or reloads
- panel state sometimes depends on the current scene instead of world-wide pin state
- quest code still performs broad reconciliation to repair ordinary lifecycle changes
- mirrored flags such as `pinId`, `sceneId`, and `objectivePins` still act too much like a second pin system

## Revised Target Model

### Source of truth

- Blacksmith owns:
  - whether a pin exists
  - whether it is placed or unplaced
  - which scene it is on
  - the live pin payload and metadata

### Mirrored quest flags

Squire may still keep:

- `flags.coffee-pub-squire.pinId`
- `flags.coffee-pub-squire.sceneId`
- `flags.coffee-pub-squire.objectivePins`

But these are a **mirror/cache**, not the authority.

### Lifecycle model

Quest/objective pins should behave like Notes:

1. create unplaced pin
2. place with `pins.place(...)`
3. unplace with `pins.unplace(...)`
4. update with `pins.update(...)`
5. delete with `pins.delete(...)`

### Sync model

- ordinary pin lifecycle changes should update mirrored quest flags directly from Blacksmith pin events
- full `reconcileQuestPins()` should only run for repair cases:
  - bulk delete
  - legacy cleanup
  - unexpected desync recovery

### Cross-scene model

- any helper that answers “is this quest pinned?” or “what scene is this on?” must consider:
  - all placed scenes
  - the unplaced pin store
- no helper should assume the current canvas scene is authoritative

## Notes Comparison

Notes is the reference implementation we are converging on:

- unplaced pins are normal
- place/unplace is explicit
- pin lifecycle events update mirrored page flags directly
- reconciliation is used for resilience, not as the main runtime path

Quest/objective pins should preserve their quest-specific business logic while adopting that same lifecycle and sync discipline.

## Completion Plan

### Phase 1: Migration Audit
**Status:** Complete

- [x] Remove custom quest pin rendering/container code
- [x] Move quest pin runtime to Blacksmith Pins API
- [x] Confirm the remaining issues are state-sync issues, not rendering issues

### Phase 2: State Model Alignment
**Status:** In Progress

- [x] Treat Blacksmith as the source of truth for quest/objective pin placement
- [x] Stop scene-scoped reconciliation from clearing valid quest pin links
- [x] Restore scene-name display from mirrored/live scene data
- [ ] Remove remaining panel-side recovery code that exists only to compensate for stale mirrored flags

### Phase 3: Event-Driven Sync
**Status:** In Progress

- [x] Register quest pin lifecycle sync on Blacksmith pin events
- [x] Mirror quest/objective `pinId` and `sceneId` from live pin events instead of full rescans on every change
- [x] Reserve `reconcileQuestPins()` for repair flows such as bulk delete or legacy drift
- [ ] Add GM-proxy/error-path handling wherever quest pin operations still lag behind Notes

### Phase 4: Cross-Scene Consistency
**Status:** In Progress

- [x] Reconcile across all scenes plus unplaced pins
- [x] Update visibility/style refresh helpers to operate across all scenes
- [ ] Remove remaining current-scene-only assumptions from quest panel actions and helpers

### Phase 5: Simplification Cleanup
**Status:** Not Started

- [ ] Reduce `objectivePins` to a mirrored reference cache, not a custom state machine
- [ ] Remove duplicate recovery logic made unnecessary by direct lifecycle sync
- [ ] Review quest import/export paths for assumptions about old scene-flag persistence
- [ ] Update comments and docs that still describe the intermediate migration state

### Phase 6: Verification
**Status:** Not Started

- [ ] Pin quest and objectives, change scenes, refresh, and confirm panel state remains correct
- [ ] Unplace and re-place quest/objective pins without duplicate-placement errors
- [ ] Change quest visibility/status/objective state and confirm pins update on every scene where they exist
- [ ] Test bulk delete / clear-all paths and confirm mirrored flags repair correctly
- [ ] Verify player-facing visibility and GM-only hidden behavior still match quest rules

## API Methods We Intend to Rely On

| Method | Use |
|--------|-----|
| `pins.isAvailable()` | Guard before API use |
| `pins.whenReady()` | Wait for canvas readiness when needed |
| `pins.create(pinData, options?)` | Create quest/objective pins, normally unplaced first |
| `pins.place(pinId, placement)` | Place an unplaced pin on a scene |
| `pins.unplace(pinId)` | Remove a pin from a scene without deleting it |
| `pins.update(pinId, patch, options?)` | Update ownership, style, text, and config |
| `pins.delete(pinId, options?)` | Delete a quest/objective pin |
| `pins.get(pinId, options?)` | Resolve a pin by ID |
| `pins.exists(pinId, options?)` | Check whether a pin still exists |
| `pins.list({ moduleId, sceneId, type, unplacedOnly })` | Build live world-wide pin indexes |
| `pins.reload(options?)` | Refresh scene rendering after targeted changes |
| `pins.findScene(pinId)` | Resolve the scene for an existing pin when needed |

## Working Rules

- Use unplaced pins for quests and objectives the same way Notes does.
- Do not invent a second placement state machine in Squire.
- Prefer direct lifecycle mirroring over broad reconciliation.
- When a repair pass is needed, derive from live Blacksmith pins across the whole world, not from the current scene.
