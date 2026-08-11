# Manual test checklist

Things that need a live world and a human. Tick as you go; delete a section once
its release has shipped and nothing in it regressed.

---

## 13.6.1 — Quests removed (Librarian now owns them)

**Run Librarian's migration macro first, with both modules enabled.** Pins are found by
`moduleId`; until it has run, existing quest pins still say `coffee-pub-squire` and nothing
in either module will be looking for them once this build is in.

### Nothing quest-shaped is left in Squire

- [x] World loads with no console errors, Squire enabled.
- [x] Settings → Squire: no Quest Configuration heading, no Quest Journal, no Quest Categories.
- [x] Menubar middle zone shows Codex and Notes from Squire, Quests from Librarian — one Quests
  ```
  button, not two.
  ```
- [x] Tray cycles Character → Party only; the handle shows no quest row.



### The Codex did not lose anything on the way out

The codex list and the codex pin cursor were styled by rules that lived in the quest
stylesheets, so these are the things most likely to break silently.

- [x] Codex browser opens and entries expand/collapse.
- [x] The pin icon on a codex entry is dim when unpinned and highlighted-orange when pinned.
- [x] "Pin to scene" gives a crosshair cursor and a round preview marker that follows the
  ```
  mouse; Esc and right-click both cancel it.
  ```
- [x] Placing, locating (crosshairs), and unplacing a codex pin all still work.
- [x] Codex export dialog opens and its title reads "Codex JSON".



### Notes are untouched

- [x] Note pins: click opens the card, double-click opens the window, context menu offers
  ```
  View / Edit / Delete.
  ```
- [x] A note updated by another user still raises a menubar notification.



### Cross-module

- [x] Librarian's quest pins and Squire's note/codex pins coexist on one scene: both render,
  ```
  both respond to their own module's double-click.
  ```
- [x] Codex unlock notification still fires and clicking it opens the Codex browser.## Codex removed (Librarian now owns it)

**Run Librarian's `macros/migrate-codex-from-squire.js` before loading this build.** Codex
pages are a declared subtype and Squire no longer declares it, so an unmigrated world will
fail validation on every codex page. Note the manifest change needs Foundry to re-read
module manifests — return to Setup and re-enter the world, an F5 is not enough.

### Nothing codex-shaped is left in Squire
- [ ] World loads with no console errors, Squire enabled, after migrating.
- [ ] Settings → Squire: no Codex Configuration heading, no Codex Journal.
- [ ] Menubar middle zone: Notes from Squire; Quests and Codex from Librarian. One of each.
- [ ] Tray cycles Character → Party only.

### Notes survived the extraction
Notes shares `utility-journal.js`, `utility-base-parser.js` and the pin manager with the
departed codex, so this is where a bad cut would show.
- [ ] Notes browser opens, lists notes, filters and sorts.
- [ ] Create, edit and delete a note; the list updates.
- [ ] Note pins: place, click (opens the card), double-click (opens the window), context
      menu View / Edit / Delete, unplace.
- [ ] Change a note's visibility — ownership still follows.
- [ ] A note updated by another user raises a menubar notification.
- [ ] Switch scenes with the notes browser open: pin state re-reads for the new scene.

### Cross-module
- [ ] Librarian's quest and codex pins coexist with Squire's note pins on one scene.
- [ ] Codex still works in Librarian with Squire enabled (both installed is the normal case).

## Favourites sync with the character sheet

`system.favorites` is real sheet data, so the first sync on each character
**writes to the actor**. Try it on a character you can afford to fiddle with first.

### First sync merges
- [ ] Take a character with favourites in Squire but not on the sheet. Open the tray:
      the sheet's Favourites tab now lists them.
- [ ] Reverse case: favourites on the sheet, none in Squire. Open the tray: they
      appear in the tray, in sheet order.
- [ ] Both populated and different: the merged list is the union, Squire's order first.

### Then each side is honoured
- [ ] Favourite an item in the tray → it appears on the sheet.
- [ ] Unfavourite it in the tray → it disappears from the sheet.
- [ ] Favourite an item on the sheet → it appears in the tray.
- [ ] **Unfavourite an item on the sheet → it stays gone.** If it reappears, the
      merge is treating a removal as an addition; stop and say so.
- [ ] Reorder favourites in the tray → the sheet follows.

### What must NOT be touched
- [ ] Favourite an **activity** on the sheet (a spell's cast activity, say), and a
      **feature/effect**. Toggle some Squire favourites. The activity and effect
      favourites are still there afterwards.
- [ ] Set a resource favourite (Primary/Secondary/Tertiary) — still there.
- [ ] An NPC with the tray open: no errors, nothing written. NPCs have no
      `system.favorites`.
- [ ] As a player who does not own a character, that character's favourites are
      not modified.

### Housekeeping
- [ ] Delete a favourited item from the actor: it leaves both lists.
- [ ] Reload with both sides already in agreement — no console errors, and no
      actor updates fired (nothing should be written when there is nothing to do).

