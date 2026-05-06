# Quest Pin Migration Plan: Completion Pass

**System of record:** This document is the single source of truth for the remaining quest pin migration work.

## Authoritative Reference

- **Blacksmith Pins API**: [API: Pins · coffee-pub-blacksmith Wiki](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/API:-Pins)
- **Notes implementation reference**: `documents/quest-pin-migration-findings.md`

## Overview

Quest pins were the original pin system and later became the foundation for the Blacksmith Pins API. The remaining work is not a rendering migration. It is the removal of Squire's legacy quest-side pin runtime.

The target model is now explicit:

- Blacksmith is the only runtime source of truth for quest/objective canvas pin state.
- Squire quest UI must identify live pins by `config.questUuid` and `config.objectiveIndex`.
- Quest/objective page flags are optional mirror/repair data only.
- Hook handlers should rerender quest UI, not reconstruct a second pin state machine.
- Reconciliation is a repair tool, not part of ordinary placement/update/unplace behavior.

## What Is Already Done

- Quest pins render through Blacksmith, not custom PIXI rendering.
- Quest/objective pin creation, placement, unplacement, deletion, and configuration go through the Blacksmith Pins API.
- The panel uses explicit "Pin to Scene" style placement rather than legacy drag-created quest pins.
- Ownership, style, and taxonomy data are already mapped onto Blacksmith pin records.

## Current Problems

The remaining bugs come from legacy quest-side state handling, not from the Blacksmith API itself.

Symptoms of the unfinished migration:

- quest/objective pin state can drift after scene changes or reloads
- a placed pin can exist on the canvas while the quest panel shows it as unpinned
- hook-driven flag sync can overwrite or disagree with live Blacksmith pin state
- mirrored flags such as `pinId`, `sceneId`, and `objectivePins` still act too much like a second pin system
- some helpers still assume module/type/scene constraints that are weaker than "this pin belongs to quest UUID X"

## Revised Target Model

### Source of truth

- Blacksmith owns:
  - whether a pin exists
  - whether it is placed or unplaced
  - which scene it is on
  - the live pin payload and metadata

### Runtime identification

- A quest pin is any live Blacksmith pin with:
  - `config.questUuid === page.uuid`
  - no numeric `config.objectiveIndex`
- An objective pin is any live Blacksmith pin with:
  - `config.questUuid === page.uuid`
  - `config.objectiveIndex === objectiveIndex`

Runtime helpers should answer pin questions from those live pin records first.

### Mirrored quest flags

Squire may still keep:

- `flags.coffee-pub-squire.pinId`
- `flags.coffee-pub-squire.sceneId`
- `flags.coffee-pub-squire.objectivePins`

But these are not runtime inputs for pinned/unpinned UI. They are a mirror/cache for repair, migration, or compatibility only.

### Lifecycle model

Quest/objective pins should behave like Notes:

1. create unplaced pin
2. place with `pins.place(...)`
3. unplace with `pins.unplace(...)`
4. update with `pins.update(...)`
5. delete with `pins.delete(...)`

### Sync model

- ordinary pin lifecycle changes should trigger quest panel rerender from live Blacksmith state
- mirrored quest flags should not be required for ordinary pin placement UI
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
- pin lifecycle events do not invent a second placement model
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
- [ ] Remove remaining panel-side recovery and flag fallback code from normal runtime
- [ ] Identify quest/objective pins by `config.questUuid` / `config.objectiveIndex` across all scenes and unplaced pins

### Phase 3: Event-Driven Sync
**Status:** In Progress

- [x] Register quest pin lifecycle handlers on Blacksmith pin events
- [ ] Reduce normal quest pin hook handling to rerender/refresh from live Blacksmith state
- [ ] Remove quest hook-driven page-flag reconstruction from the normal runtime path
- [x] Reserve `reconcileQuestPins()` for repair flows such as bulk delete or legacy drift
- [ ] Add GM-proxy/error-path handling wherever quest pin operations still lag behind Notes

### Phase 4: Cross-Scene Consistency
**Status:** In Progress

- [x] Reconcile across all scenes plus unplaced pins
- [x] Update visibility/style refresh helpers to operate across all scenes
- [ ] Remove remaining current-scene-only assumptions from quest panel actions and helpers
- [ ] Stop relying on module/type-only filters when quest config identity is the stronger key

### Phase 5: Simplification Cleanup
**Status:** In Progress

- [ ] Reduce `objectivePins` to a mirrored reference cache, not a custom state machine
- [ ] Remove duplicate recovery logic made unnecessary by live Blacksmith-backed runtime
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
- Runtime quest pin state must come from live Blacksmith pin records, not mirrored page flags.
- Identify quest/objective pins by `config.questUuid` and `config.objectiveIndex`.
- Prefer rerender-from-live-state over hook-driven state reconstruction.
- When a repair pass is needed, derive from live Blacksmith pins across the whole world, not from the current scene.
