# Manual test checklist

Things that need a live world and a human. Tick as you go; delete a section once
its release has shipped and nothing in it regressed.

Two clients make most of this faster: your GM window plus a private/incognito
window logged in as a player. Keep the console open on both.

---

## Unreleased — campaign content out of the tray

The three campaign browsers moved from tray tabs to their own windows, launched
from the menubar. Panels were re-hosted, not rewritten, so the risk is in the
*hosting* — styling, listeners, and anything that used to reach through the tray.

### Menubar and windows

- [ ] Three icons appear in the menubar **middle** zone: Quests, Codex, Notes
- [ ] Each opens its window
- [ ] Each window's content is **fully styled** — not an unstyled list. (The panel
      stylesheets were re-keyed from `.squire-tray[data-position="left"]` to
      `.squire-panel-host[data-position="left"]`; if a section looks raw, a rule
      was missed.)
- [ ] Clicking a menubar icon again focuses the existing window rather than
      opening a second one
- [ ] Each window resizes, minimises, and restores
- [ ] Window position and size are remembered across a reload

### The bug this release fixes

Both the tray and a window hosting the same panel killed each other's listeners
(one panel instance, one `AbortController`, aborted on every render).

- [ ] Quest cards expand and collapse on chevron click
- [ ] Quest cards expand and collapse on header click
- [ ] Expansion state survives closing and reopening the window
- [ ] Codex entries expand and collapse
- [ ] Notes rows open

### Pins → panels

The interesting case is with the browser **closed** — reveal should open it.

- [ ] Click a quest pin with the Quests window closed → window opens, quest is
      focused and highlighted
- [ ] Click a quest pin with the window already open → focuses without reopening
- [ ] Click an objective pin → the right objective is highlighted
- [ ] Click a codex pin → codex window opens and scrolls to the entry, and the
      entry stays expanded through the next re-render
- [ ] Click a note pin → notes window opens and highlights the row
- [ ] Complete an objective from the pin context menu → toast appears naming the
      objective

### Tray after the removal

- [ ] Tray shows only **Character** and **Party** tabs, with no empty gap where
      the three tabs were
- [ ] The Character tab is labelled "Character", not "Token"
- [ ] Handle view-cycle button cycles Character ↔ Party only
- [ ] A client whose saved view mode was `quest` / `codex` / `notes` lands on
      Character rather than a blank tray (test by reloading a client that had a
      campaign tab open before the update)
- [ ] Settings no longer offer Notes/Codex/Quest under Default Tab
- [ ] Pin a quest → the pinned quest still shows on the tray handle
- [ ] Reload with a quest pinned → the pinned-quest menubar notification still
      appears (it used to be restored by the tray's quest render)

### Editors still reach their browsers

- [ ] Edit a quest in the Quest window and save → the Quests browser reflects it
- [ ] Edit a codex entry and save → the Codex browser reflects it
- [ ] Save a note with "place pin" → pin placement starts
- [ ] Delete a quest from its editor → it disappears from the browser

---

## 13.5.3 — compendium access and item transfers

- [ ] **Encumbrance**: transfer something heavy to a character sitting just under
      an encumbrance threshold → no `dnd5eencumbered0` error in the console
- [ ] Same check for a compendium add onto a near-loaded character
- [ ] **Container guard**: drag a backpack holding items onto another character →
      refused, naming how many items to unpack. Nothing moves.
- [ ] Empty the backpack and drag it again → transfers normally
- [ ] **Stale quantity**: open a transfer dialog for 5 arrows, reduce the stack to
      2 from another client, then confirm → refused, source keeps 2, target gets
      nothing
- [ ] **Compendium — Off**: player sees no magnifying-glass toggle
- [ ] **Look only**: search works, view (feather) opens the item sheet, no plus
      icon, rows will not drag onto a sheet
- [ ] **Ask the GM**: player clicks the paper-plane → GM gets a whispered card →
      **Approve** puts the item on their sheet and the request card disappears
- [ ] **Ask the GM** → **Deny** → player is told, nothing is created
- [ ] With no GM logged in, a request says "No GM is online"
- [ ] **Add freely**: plus icon adds immediately, drag works
- [ ] **Pack visibility**: set a compendium to be invisible to players → a player
      search that would match it returns nothing; the same search as GM still finds it
