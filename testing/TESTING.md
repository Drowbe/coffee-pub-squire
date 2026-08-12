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
- [ ] Favourite an item on the sheet → it appears in the tray **immediately**, without
      switching characters and back.
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

### Search
- [ ] Type in the tray's search box: items filter as you type, across Favourites,
      Inventory, Spells, Weapons and Features.
- [ ] Clear the search: everything comes back.
- [ ] Search for `new` — it should match items whose NAME contains "new", not
      every item wearing a NEW badge.

### Item hover cards
- [ ] Hover an item name in Favourites, Inventory, Spells, Weapons, Features: the
      dnd5e rich card appears, matching what the sheet shows for the same item.
- [ ] The card opens to the RIGHT of the tray, not off the left edge of the screen.
- [ ] Hovering the roll / equip / favourite icons on a row still shows their own
      small tooltips, not the big card.
- [ ] Collapse the tray and hover a favourite on the handle: the rich card appears
      there too.
- [ ] Spells show casting time, range, components, duration; weapons show damage
      and range — i.e. the card is the system's, not an approximation.

### Inventory warnings on player characters

New **Inventory Warnings** setting (on by default). NPC statblock warnings are
unchanged and still use **Show Statblock Warnings**.

#### As a player, on your own character
- [ ] Give the character an ammo-using weapon (bow) and no arrows: a warning badge
      appears on the weapon in Weapons/Favourites.
- [ ] The tooltip reads **Inventory Problem**, says *you* have none (not "this
      creature"), and offers **Click to ask the GM**.
- [ ] Click it: you get a "waiting for the GM" toast and **nothing is added to your
      inventory**.
- [ ] A spell you cannot currently cast (a scroll-scribed spell above your level)
      shows **no** warning. Ammunition only.
- [ ] Select another player's token: no badge for their equipment.

#### As the GM
- [ ] The request arrives as a whispered card with Approve / Deny.
- [ ] **Deny**: the player is told, nothing is added.
- [ ] **Approve**: the ammunition is added, both of you see the confirmation, and
      the request card disappears.
- [ ] **The player's badge clears immediately** — no tray refresh, no switching
      characters. Check both the Weapons panel and Favourites if the weapon is
      favourited.
- [ ] Restocking an existing empty stack (quantity 0 → 20) clears it too, not just
      adding a missing one.
- [ ] Buy the arrows on the sheet *before* approving an outstanding request, then
      approve: it declines gracefully rather than adding a second stack.
- [ ] Looking at a player's character yourself, the badge says **Click to fix** and
      repairs directly.

#### Auto-fix stays NPC-only
- [ ] Turn on **Repair Statblocks Automatically**. Open a player character with no
      arrows: **nothing is added**, the badge stays.
- [ ] Select an NPC with the same problem: it is repaired automatically, as before.

### Character sheet cleanup (phase 1)

A broom in the **Character Sheet** title bar, left of the mode toggles. GM only,
and only on a character. Nothing here creates or deletes anything.

- [ ] As a player: no broom. As GM on an NPC: no broom. As GM on a character: broom.
- [ ] Give a character messy coins (say 1247 cp, 30 sp) and open it: the plan shows
      a NOW strip and an AFTER strip, and the total value stated once, identical
      before and after.
- [ ] A denomination that does not change must look the same in both strips — only
      the ones that actually move are marked. This was the bug: every denomination
      used to look like it was changing.
- [ ] Apply, then check the sheet: same total value, fewest coins. Compare against
      the sheet's own Convert Currency button — they should agree exactly.
- [ ] Links section leads with the rows whose compendium entry has a *different*
      name, under a heading that says so; they arrive unticked. The exact-name
      matches follow, ticked. There are no EXACT / STARTSWITH tags anywhere.
- [ ] Each row names the compendium the way the sidebar does ("D&D Player's
      Handbook · Feats"), never a pack id.
- [ ] "No compendium match" shows a denominator (*30 of 47*) and a breakdown by
      item type.
- [ ] Untick everything and Apply: it says nothing is selected and writes nothing.
- [ ] Untick *some* links and Apply: only the ticked ones gain a source.
- [ ] Reopen after applying: the window says the character is tidy.
- [ ] An item that already had a compendium source is counted as "already linked"
      and is NOT re-written, even if its name would resolve elsewhere.
- [ ] Homebrew items with no compendium match are listed as unmatched and left alone.
- [ ] Open cleanup twice in quick succession: one window, not two.
- [ ] The banner warns there is no undo and says to duplicate or export the
      actor first. It appears on the plan, and not on the receipt or on the
      "already tidy" state, where there is nothing left to warn about.

### Merging duplicate stacks (phase 2)

Merging identifies duplicates by compendium entry, so items need their source
links before they are candidates. The window handles that for you: applying
re-scans and offers what the linking just unlocked, in the same visit.

- [ ] On a sheet with unlinked duplicates, Apply once. The window stays open,
      shows the receipt, and **underneath it** shows the merges that linking
      just revealed — with a banner saying nothing below has been done yet.
- [ ] The footer still offers **Apply** at that point (not just Close), and the
      secondary button reads Close rather than Cancel.
- [ ] Apply again: the merges happen, and once there is nothing left the footer
      collapses to a single Close.

- [ ] Drag the same compendium item onto a sheet three times, reopen cleanup:
      one merge group, "3 rows → 1", with the quantities summed.
- [ ] Apply, then check the sheet: one row, correct total quantity.
- [ ] **Undo.** The window offers "Undo the last merge" with a count and a
      timestamp. Restore, and all three rows come back with their original
      quantities.
- [ ] After restoring, the window shows **only** what it put back and a single
      **Close** button. There must be no Cancel/Apply pair underneath a restore
      notice — read in that position, those mean "cancel the restore".
- [ ] The undo section is gone after restoring (the snapshot was consumed), and
      reopening the broom offers a normal plan again.
- [ ] **Favourites survive a merge.** Favourite one of the three copies in the
      tray, merge, and the surviving row is still favourited — in the tray *and*
      on the dnd5e character sheet. Then undo, and the favourite is still right.
- [ ] Favourite one copy and confirm it is the one that survives (the plan row
      says "favourited").
- [ ] **Equipped daggers.** Equip one of three identical daggers: all three DO
      merge, the plan row says "will stay equipped", and the surviving stack is
      equipped afterwards. It must never come out unequipped.
- [ ] Merge three copies where NONE is equipped: the result is unequipped, and
      the plan row says nothing about equipping.
- [ ] Put one copy in a bag: listed under "Duplicates left alone" with "they are
      in different containers".
- [ ] Edit one copy's description: listed as blocked with "their descriptions
      differ" — this is the case a field-by-field check would have missed.
- [ ] Two identical **containers** (two backpacks): never offered for merging,
      whatever else is true.
- [ ] Three **full torches** (limited uses, autoDestroy): these DO merge. Then
      use the merged stack until the first one burns out — the quantity should
      drop by one and the uses refill, so the total is what you started with.
      This is the case the rule used to block wrongly.
- [ ] A **partly used** torch alongside full ones: the partly used one is not
      merged with them ("they have already been partly used"), because merging
      from anything other than full would invent charges rather than lose them.
- [ ] An item with uses but **no autoDestroy**: blocked with "their charges are
      tracked per stack rather than per item".
- [ ] An item carrying an **active effect**: blocked.
- [ ] Untick a merge group and Apply: that group is untouched.
- [ ] Open the plan, then equip one copy in another window, then Apply: the group
      is re-validated and that copy is not merged.
- [ ] Items with **no** compendium source are never merge candidates, however
      identical they look.

### Cleanup as a player request

Needs two clients. **Players Can Request Cleanup** must be on.

- [ ] As a player, the broom appears on a character you own, and NOT on one you
      do not — select another player's token and check.
- [ ] Turn the setting off: the broom is gone for players, still there for the GM.
- [ ] As a player, the primary button reads **Request Approval**, not Apply, and the
      banner says nothing is written by you.
- [ ] The backup warning ("there is no undo") does NOT appear for a player — they
      are not the one applying — and the undo section never appears for them.
- [ ] Send with some rows unticked. The GM's popup opens showing **only** the
      ticked rows. The unticked ones must not be there at all.
- [ ] **Everything in the GM's popup arrives ticked**, including rows from the
      "check these" list — the player already made that call, and the GM is
      confirming it. A row arriving unticked means the ticked state is being
      inferred from which list it is in rather than read from the request.
- [ ] The GM's popup names the requester and says nothing has been applied.
- [ ] Approve: the changes land on the character, and the player gets a toast
      naming what happened.
- [ ] Deny: nothing changes, and the player gets a declined toast.
- [ ] Close the GM popup with the X instead of answering: the player still gets
      the declined toast rather than waiting forever.
- [ ] The GM unticks a row before approving: that row is not applied, everything
      else is.
- [ ] Send a request with no GM online: the player is told, and nothing is sent.
- [ ] A GM can have their own cleanup window AND a player's request for the same
      character open at once — they are separate windows.

**Restore requests.**

- [ ] As a player, after a GM has merged something, the undo section appears with
      the button reading **Request Restore** (not Restore).
- [ ] Clicking it sends to the GM and closes the player's window with a toast.
- [ ] The GM's popup names the requester, says how many stacks would come back
      and when they were saved, and offers Approve / Deny — with **no** extra
      Restore button inside the section itself.
- [ ] Approve: the stacks come back and the player gets a toast naming the count.
- [ ] Deny, and separately close-with-X: the player is told either way.
- [ ] Have the GM restore it themselves first, THEN approve the player's pending
      request: the popup says there is nothing left to restore rather than
      claiming the request no longer applies.
- [ ] A player with a cleanup request AND a restore request in flight for the
      same character gets two separate windows on the GM's screen, not one
      overwriting the other.

### Tool window presentation (Cleanup and Transfer)

Both windows now draw from the same shared components, so check them together —
a difference between them is the bug.

- [ ] Sections, row height, thumbnail size, corner radius, and heading type are
      identical in both windows, and match Curator's Loot window.
- [ ] Both windows are **resizable** by dragging a corner.
- [ ] On a character with a lot of unlinked items, Cleanup opens at a sensible
      height and **scrolls** — it must never open as tall as the screen, and it must
      never be draggable taller than roughly the viewport.
- [ ] Same for Transfer on a crowded scene with many tokens.
- [ ] No paragraph anywhere is set in italics.
- [ ] Cleanup's checkboxes are square, theme-coloured, and the same size in every
      row; ticking one also lights the whole row. Switch the Foundry theme — they
      must not change size or colour with it.
- [ ] Switch the Blacksmith tool theme through light, dark, and glass. Every window
      stays readable, including the orange "different name" flag and the red
      "Not applied" heading.
- [ ] Transfer shows **Party** and **NPCs** as two separate bordered sections, each
      with its own count, not as headings inside one box.
- [ ] Selecting a party member then an NPC leaves exactly one selected — the choice
      is single across both sections.
- [ ] A section with nobody in it does not render at all; if there is nobody at all,
      one "No eligible characters are on this scene." appears rather than two.

