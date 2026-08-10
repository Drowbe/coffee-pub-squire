# Manual test checklist

Things that need a live world and a human. Tick as you go; delete a section once
its release has shipped and nothing in it regressed.

---

## 13.6.1 — Quests removed (Librarian now owns them)

**Run Librarian's migration macro first, with both modules enabled.** Pins are found by
`moduleId`; until it has run, existing quest pins still say `coffee-pub-squire` and nothing
in either module will be looking for them once this build is in.

### Nothing quest-shaped is left in Squire
- [ ] World loads with no console errors, Squire enabled.
- [ ] Settings → Squire: no Quest Configuration heading, no Quest Journal, no Quest Categories.
- [ ] Menubar middle zone shows Codex and Notes from Squire, Quests from Librarian — one Quests
      button, not two.
- [ ] Tray cycles Character → Party only; the handle shows no quest row.

### The Codex did not lose anything on the way out
The codex list and the codex pin cursor were styled by rules that lived in the quest
stylesheets, so these are the things most likely to break silently.
- [ ] Codex browser opens and entries expand/collapse.
- [ ] The pin icon on a codex entry is dim when unpinned and highlighted-orange when pinned.
- [ ] "Pin to scene" gives a crosshair cursor and a round preview marker that follows the
      mouse; Esc and right-click both cancel it.
- [ ] Placing, locating (crosshairs), and unplacing a codex pin all still work.
- [ ] Codex export dialog opens and its title reads "Codex JSON".

### Notes are untouched
- [ ] Note pins: click opens the card, double-click opens the window, context menu offers
      View / Edit / Delete.
- [ ] A note updated by another user still raises a menubar notification.

### Cross-module
- [ ] Librarian's quest pins and Squire's note/codex pins coexist on one scene: both render,
      both respond to their own module's double-click.
- [ ] Codex unlock notification still fires and clicking it opens the Codex browser.

