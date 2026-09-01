# Squire Settings

**Audience:** anyone configuring Squire, player or GM.

Every control on Squire's settings page, in the order it appears there, with what it does and who it
affects. If you are looking for how to use the tray rather than how to configure it, start with
[getting started](userguide-getting-started.md).

## Who a setting belongs to

Squire's settings divide three ways, and the difference matters because it decides who you are
changing things for.

- **Yours.** Saved against your user, and follows you between browsers and machines. Most of the
  appearance settings.
- **This browser's.** Saved against the browser you are sitting at, so the same account on a different
  machine gets its own value. Tray Width is the only one.
- **The world's.** Set once by the GM and applied to everyone. Every setting under Run the Game and
  Canvas.

Only a GM sees the world settings. If a control described below is not on your page, it is a GM one.

## The Tray

### Tray Configuration

**Default Tab** -- yours. Which tab the tray opens on when Foundry loads: Character Tab, Party Tab, or
Last Tab Viewed. Last Tab Viewed is the default.

**Show Party Tab** -- yours. Whether the Party tab appears at all. On by default. Changing it needs a
reload.

**Excluded Users** -- the world's. A comma-separated list of user IDs who never see the tray. For a
player who does not want it, or a display account.

**Tray Width** -- this browser's. How wide the open tray is, from 350 to 600 pixels in steps of 25.
400 by default. It takes effect immediately, and a pinned tray pushes Foundry's interface across by
the new amount.

**Collapse Tray When You Click Away** -- yours. When the tray is not pinned, close it shortly after you
click somewhere else. On by default. Turn it off to leave the tray open until you close it yourself.

**Open Tray on Hover** -- yours. Open the tray when your mouse crosses the handle, and close it again
shortly after you move off. Off by default, and ignored entirely while the tray is pinned.

**Tray Collapse Delay** -- yours. How long "shortly after" is, for both of the settings above, in
seconds. 0 to 5 in quarter-second steps, 0.75 by default.

### Panel Configuration

These decide which panels appear at the top of the Character tab, above the item sections.

**Show GM Details Panel** -- yours. The GM Details panel. On by default. GM only regardless: a player
never sees this panel whatever they set here.

**Show Character Summary Panel** -- yours. The compact card carrying experience, core statistics,
abilities and skills. On by default.

**Show Party Stats Panel** -- yours. The lifetime MVP leaderboard on the Party tab. Off by default, and
it needs Blacksmith's statistics to have anything to show.

### Handle Configuration

The handle is the strip that stays visible when the tray is closed. Turning a group off here does not
remove the feature -- it removes it from the handle.

**Show Conditions in Handle** -- yours. The grid of condition icons. On by default. All or nothing:
there is no way to show some effects and hide others.

**Show Favorites in Handle** -- yours. Your favourite items as icons on the handle. On by default. The
handle shows as many as fit and hides the rest.

**Show Health Bar in Handle** -- yours. The hit-point bar under the portrait. On by default. The thin
coloured strip down the outer edge of the handle is separate and always there.

## Run the Game

Everything in this section is the world's, so a GM sets it once for everyone.

### NPC Auto-Favorites

**Auto-Favorite NPC Statblock Content** -- automatically favourite an NPC's attacks, castable spells and
activated features, so selecting a monster gives you its actions without any setup. On by default. It
keeps up with newly added items, and anything you unfavourite by hand stays unfavourited.

**Also Ignore These Actions** -- comma-separated feature names to treat as rules reminders rather than
statblock content, added to the built-in list. Matched exactly, ignoring case. Use this when an
actions compendium spells something differently from the built-in list.

**Generic Actions to Keep** -- comma-separated exceptions to the list above: generic actions worth a
favourite slot anyway. This replaces the built-in list rather than adding to it, so it can only
narrow. Leave it blank for the default, which is Ready and Disengage.

**Confirm Deleting Items Worth More Than** -- setting an item's quantity to zero deletes it. Deletion is
always confirmed for magical, attuned, or better-than-common items; this adds a confirmation for
anything whose total value in gold exceeds this number. 0 to 1000, 50 by default. Set it to 0 to never
confirm on value.

### NPC Statblock Checks

Checks for statblocks that cannot actually be used in play -- a bow with no arrows, a crossbow with no
bolts, a slot-casting spell list with no spell slots. Problems show as a warning badge on the affected
item.

**Inventory Warnings** -- flag player characters whose weapons have no usable ammunition. On by default.
The owning player sees the warning on their own characters, but only the GM can act on it: clicking the
badge asks the GM rather than adding anything.

**Players Can Request Cleanup** -- let players run the character sheet cleanup on characters they own.
They never write to their own sheet. Applying sends the plan to the GM as an approval window, and the
GM decides row by row.

**Show Statblock Warnings** -- the clickable warning badge on NPC weapons and spells that cannot be used
as configured. GM only. Player characters are covered by Inventory Warnings instead.

**Repair Statblocks Automatically** -- repair these problems as soon as an NPC is selected, instead of
waiting for a click. Off by default. It adds missing ammunition and grants the spell slots the
creature's own spell list requires, and never removes or changes anything else. NPCs only: a player
character is never repaired without the GM clicking.

**Ammunition Restock Quantity** -- how many arrows, bolts, bullets or needles to give an NPC when
repairing missing or depleted ammunition. 20 by default.

### Compendiums

**Let Players Use Compendiums** -- what players may do with the tray's compendium search on characters
they own. The GM can always search and add. Four positions:

- **Off** -- no compendium mode for players.
- **Look only** -- search and read details, no adding.
- **Ask the GM** -- adding sends a request to approve or deny.
- **Add freely** -- players add straight to their own sheet.

Which compendiums are searched is Blacksmith's setting, not Squire's.

### Transfer Configuration

**GM Approves Transfers** -- the GM must approve item transfers between characters. On by default. With
it off, a transfer between characters someone has permission over happens directly.

**Transfer Request Timeout (seconds)** -- how long a transfer request stays valid before it expires on
its own.

## Canvas

Things Squire does outside the tray. All of these are the world's.

### Token Light Settings

These govern the lightbulb on an inventory row, which turns a torch or a lantern into token light.

**Fuzzy Match** -- if common light-source words appear in an item's name and there is no exact match,
use the closest one.

**Consume Resource** -- consume the item's own resource when the light is used.

**Link to Action** -- take the item's action when the light source is used.

## Settings that are not on this page

Three things Squire remembers are deliberately not here, because each is already a control somewhere
it means something:

- **The handle's narrow or wide shape**, toggled by the left-right arrow on the handle itself.
- **The inventory's flat or grouped-by-container view**, toggled from the Inventory panel's own title
  bar.
- **The filter chips** on the Character Sheet strip. The five item-type chips are remembered between
  sessions; the action-cost ones deliberately are not.

Squire has no colour theme setting. It had one once, offering Dark, Light and Custom; the control is
gone and the tray has a single appearance.
