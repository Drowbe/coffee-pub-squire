# Getting Started with Squire

**Audience:** anyone who has just installed Squire and wants to use it at the table.

Your first five minutes: what appears on screen, how to open and pin the tray, how to point it at a
character, and the handful of things you will do with it every session. Every control on the settings
page is in [the settings guide](userguide-settings.md).

![The tray open on the Character tab: the character block, GM Details, Summary, the Character Sheet strip with its filter bar and search, then Favorites and Weapons, with the handle beside it and a transfer in progress](../assets/product-expanded.webp)

## What Squire needs

Coffee Pub Blacksmith, installed and enabled, and socketlib. Squire will not run without them.
Everything below assumes the D&D 5e system.

## What appears when you enable it

A narrow vertical strip down the left edge of the screen, over the top of Foundry's own left toolbar.
That strip is the tray handle, and it is there whether the tray is open or closed. On it, top to
bottom:

- A thumbtack, which pins the tray open.
- The character's portrait and name, and a bar under it carrying their current hit points. If you own
  the character, clicking that bar opens the Health window.
- Their conditions, two to a row, with a sparkles button above them -- **Add or Remove Conditions** --
  that opens the status effects window. When there are more conditions than fit, the button carries
  the count.
- Your favourites, as icons.
- A left-right arrow -- **Handle Width** -- which switches the closed handle between its narrow and
  wide shapes. It only changes the closed handle; open, the strip is always narrow.
- A caret at the foot, which opens and closes the tray. Foundry keeps its own sidebar collapse
  control in the same place.

The conditions grid, the favourites and the health bar can each be turned off on the settings page.

![The closed handle: the pin at the head, then the portrait, the health chip, the conditions button with its count, the conditions grid and the favourites, with the width and collapse controls at the foot](../assets/product-collapsed.webp)

Down the outer edge of the handle runs a thin coloured bar. That is the same hit points again, filled
from the bottom and coloured by how bad things are. It is the one readout that stays visible when the
tray is open.

## Open and close the tray

Click the caret at the foot of the handle. Click it again to close.

Two settings change this, and both are yours alone rather than the world's. **Open Tray on Hover**
opens the tray when your mouse crosses the handle and closes it shortly after you leave. **Collapse
Tray When You Click Away** closes an unpinned tray a moment after you click elsewhere; **Tray Collapse
Delay** is how many seconds that moment lasts.

To stop it closing at all, click the thumbtack. A pinned tray stays open, ignores hover, and pushes
Foundry's interface across to make room rather than covering it.

**Tray Width** sets how wide the open tray is, in pixels. It is a slider on the settings page and it
is yours, not the world's -- your screen, your number.

## Point the tray at a character

The tray shows one character at a time.

**As a GM:** select a token on the canvas. The tray follows your selection, and it follows it
strictly -- deselect everything and you get the empty tray back rather than the last character you
looked at. Opening a character sheet also switches the tray to that character.

**As a player:** the tray finds a character for you. It prefers the last one you picked, then the
character assigned to your user, then any character you own. Selecting one of your tokens switches to
it.

**If you own more than one character**, a row of portrait chips appears, and clicking one switches the
tray to it. Characters with a token on the scene you are viewing come first, then a divider, then the
ones who are elsewhere -- picking one of those switches the tray without moving anything on the
canvas. Squire remembers the choice, so a scene change or a deleted token comes back to the character
you chose rather than guessing again.

If nothing is selected and you own nothing, the tray says so.

## The two tabs

At the top of the open tray: **Character** and **Party**. The Party tab can be turned off from the
settings page, and turning it off needs a reload.

## The Character tab

Stacked down the tray, in this order:

1. **The character panel** -- portrait, name, class and level, alignment, speeds.
2. **GM Details** -- GM only, and players never see it whatever the setting says.
3. **Summary** -- one compact card carrying level, initiative, speed, armour, proficiency, the
   ability scores and experience. The ability scores are clickable: they roll the check or the save.
   Its setting is called Show Character Summary Panel; the panel header on screen says Summary.
4. **Character Sheet** -- a thin strip with the filter bar and the search box under it. This is the
   control strip for everything below.
5. **Favorites**, then **Weapons**, **Spells**, **Features** and **Inventory**.

### Do something with an item

Click the die on a row's image. For anything with an activity that makes the attack, casts the spell,
drinks the potion -- the normal thing. For a container it opens the bag instead, because a backpack
has nothing to roll.

Hover a row and the D&D 5e system's own item card appears, the same one the character sheet shows. You
do not have to open a sheet to read what something does. Middle-click the card to lock it open.

![The Favorites and Weapons sections, each row carrying its action-cost badge and its equip, favourite and send controls](../assets/userguide-favorites-weapons.webp)

The Spells section groups by level and shows the slots you have left on each.

![The Spells section: cantrips and levelled spells, with the remaining slots shown against each level](../assets/userguide-spells.webp)

Inventory can be read as a flat list or grouped by container. The toggle is on the Inventory section's
own title bar, next to its category filters.

![The Inventory section grouped by container, with the currency row and its send and consolidate controls](../assets/userguide-inventory.webp)

### Favourite something

Click the heart on a row. Click it again to remove it.

Favourites are shared with the character sheet in both directions: favourite something in the tray and
it appears on the sheet, favourite it on the sheet and it appears in the tray, and removing it in
either place removes it in both. The activity, effect and resource favourites the sheet owns are left
alone.

To get a favourite onto the handle so it is reachable with the tray closed, drag it there. Dropping it
on top of an existing icon inserts it above; dropping past the end adds it at the bottom. The handle
shows as many as fit and hides the rest, so a short list is a usable list.

### Narrow down what you are looking at

The filter bar on the Character Sheet strip is fourteen small icons in four groups, and every one of
them names a bucket to show. A group with all of its icons on shows everything.

- **Five item types** -- Favorites, Weapons, Spells, Features, Inventory. Turning one off hides those
  items everywhere, favourites included.
- **Five action costs** -- action, bonus action, reaction, special, and passive. Passive covers gear
  and anything slower than a turn, so everything you own falls into one of the five.
- **Equipped and unequipped**, which are about gear and say nothing about spells.
- **Prepared and unprepared**, which are about spells and say nothing about gear.

Shift-click an icon to show only that one within its group. The type filters are remembered between
sessions; the action-cost ones deliberately are not, so you never log in a week later to a half-empty
tray.

The search box under the bar -- **Search All Sections...** -- filters every section at once. The cross
at its right clears it.

![A search across every section at once, with each section showing only its matching rows](../assets/userguide-search.webp)

### Send an item to another character

Two ways, and they do the same thing.

- Click the share arrow on an inventory or weapon row. **Transfer Item** opens: a quantity slider
  reading Give and Keep at its ends, and the party underneath. Pick who gets it and confirm with
  **Transfer**. Your own character is listed but cannot be chosen.
- Or open the Party tab and drag the item onto a party member's card.

What happens next depends on **GM Approves Transfers**, which is the GM's setting for the whole world.
With it on, the request goes to the GM, who approves or denies it, and then to the recipient, who
accepts or rejects. Chat cards carry each step, and a request that nobody answers expires after
**Transfer Request Timeout**. With it off, characters you have permission over move things directly.

Coins work slightly differently. The send arrow on a currency row opens the same picker, but the move
needs write access to both characters -- so a GM can send coins from anyone to anyone, and a player
can move coins between two characters they own, but player to player does not work. The coins icon
next to it consolidates your money into the fewest pieces.

You cannot send a container that still has things in it. Empty it first.

![The Transfer Item window: the item, a quantity slider between Give and Keep, and the party list with the recipient selected](../assets/userguide-transfer.webp)

### Add something from a compendium

If the GM has allowed it, the Character Sheet strip carries a magnifying glass. Click it and the filter
bar and the panel stack are both replaced by a search box and **Add from Compendiums**, listing matches
grouped by the compendium they came from. Each row has a plus that adds it. The person icon next to the
magnifying glass goes back to the character's own items.

**Let Players Use Compendiums** is the GM's setting and has four positions: off, look only, ask the GM
-- where adding sends a request to approve or deny -- and add freely. The GM can always search and add.

The tickbox directly under the search box, **Clear search and keep open on add**, decides what happens
after you add something: leave it ticked to stay in search and add several things, untick it to go back
to the character and land on the new item.

![Add from Compendiums: a search for a sword, with results grouped under the compendium each came from and a plus on every row](../assets/userguide-compendium-search.webp)

## Tidy up a character sheet

The broom on the Character Sheet strip opens Cleanup. It does three things, and it shows you the whole
plan before it does any of them:

- **Consolidate currency** into the fewest coins, with the total before and after so you can check
  that nothing changed but the shape of it.
- **Link items to their compendium entry**, so an item records what it is a copy of.
- **Merge duplicate stacks**, with anything it declined to merge explained in plain language, and one
  step of undo.

Every row can be unticked, and it reports what it did rather than closing behind a notification.

Read the warning in the window before you apply: **there is no undo** for the run as a whole, and it
tells you to duplicate the actor, or export its data from the sidebar, if you want a way back. The one
exception is the merge, which keeps a snapshot -- **Undo the Last Merge** appears at the top of the
window afterwards, with a **Restore** button, and it holds only the most recent one.

![The Cleanup window: the undo-the-last-merge banner, Consolidate Currency showing the coins before and after, and Link Items to Their Compendium Entry with its rows](../assets/userguide-cleanup.webp)

By default only the GM can run it. If the GM turns on **Players Can Request Cleanup**, a player can run
it on a character they own -- but applying sends the plan to the GM, who reviews the same rows in the
same window and decides. A player never writes to their own sheet this way.

## The Party tab

The Party tab lists everyone with a token on the current scene: player characters always, and for a GM
the other tokens too. Each card carries a portrait, the character's class, level and speed, a hit-point
bar, and a coloured disposition dot on anything that is not a friendly player character. The card for
the character the tray is showing is outlined.

The list is sorted, not in the order tokens were dropped on the scene: the living first, then the dead,
alphabetical within each. A character who drops to zero hit points sinks to the bottom of the list --
which is the point, because that is a change worth noticing. The GM's monster and NPC list under the
divider is sorted the same way.

**Party Health** sits above the cards: one bar totalling the party's current and maximum hit points, so
you can see how the group as a whole is doing without adding it up.

**Search Party**, below Party Health, filters the list down to the names that match what you type. It
matches on the name only, anywhere in it, and ignores capitals. **Escape** or the **x** in the box
clears it. Reputation, Party Health and the search box stay put while the list below them scrolls, so
you can keep typing however long the roster is.

Along the top:

- **Experience** -- GM only. Awards XP.
- **Select Party** -- selects the whole party for a GM, or the characters you own for a player.
- **Vote** -- starts a vote, for the GM and the party leader.
- **Deploy Party** and **Clear Party** -- puts every party member's token on the canvas, or takes them
  all off.

**Party Reputation** sits at the top. Reputation is stored per scene, so the card names the scene it
belongs to; the bar runs the whole range from hostile to friendly with a marker showing where the party
sits, rather than filling up like a progress bar. A GM gets four buttons -- **-5** and **-1** to the
left of the bar, **+1** and **+5** to its right.

**Lifetime MVP Leaderboard** is the Party Stats panel, off by default. It ranks players by total,
average, best and battles, and it needs Blacksmith's statistics to have anything to show.

![The Party tab: the Experience button and party tools, Party Reputation with its scene, Party Health, the member cards, and the Lifetime MVP Leaderboard](../assets/userguide-party.webp)

## Read or print a character sheet

The printer icon on the character panel builds a full sheet -- abilities, stats, saving throws,
languages, skills in two columns, and the biography -- and opens it in its own window. Read it there,
resize it, leave it open beside the tray.

**Print or Save as PDF** at the foot of that window hands the sheet to your browser's print dialog,
which is where saving a PDF lives as well as printing one. It prints the sheet rather than Foundry
around it.

Each character gets one window, so clicking the icon again brings the same one back rather than
stacking another on top. Two different characters get two windows.

![The character sheet window: header, Ability Scores, Stats with saving throws and languages, and Skills in two columns](../assets/userguide-print.webp)

## Who can do what

| | GM | Player |
|---|---|---|
| Point the tray at a character | Selecting a token | Automatic, or the portrait chips |
| GM Details panel | Yes | Never, whatever the setting says |
| Run Cleanup | Yes | Only if the GM allows it, and only as a request |
| Add from a compendium | Always | Whatever **Let Players Use Compendiums** says |
| Send an item | Yes | Yes, through approval if the GM requires it |
| Send coins | Anyone to anyone | Only between characters they own |
| Award experience, deploy or clear the party | Yes | No |
| Start a vote | Yes | Party leader only |
| Adjust reputation | Yes | No |
| Repair an NPC statblock | Yes | No |

## Squire and the rest of the suite

Several things you reach through Squire are not Squire's. The Health window and the status effects
window belong to Blacksmith, and the handle simply opens them. The dice tray and macros are
Blacksmith's too, and they are reached from the Blacksmith menubar rather than from the handle,
because they are global tools that do not care which token you have selected.

Quests and the Codex are Coffee Pub Librarian's, and Notes are Blacksmith's. All three were Squire's
until 13.7.0, and the data was migrated rather than dropped.
