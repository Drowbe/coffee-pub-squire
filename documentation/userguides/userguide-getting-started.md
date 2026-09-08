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
4. **Character Sheet** -- a thin strip carrying the search box, the section tabs and the filter bar.
   This is the control strip for everything below.
5. Whichever section the open tab shows. **Favorites** has a view of its own -- the heart in the
   Character Sheet strip.

### Do something with an item

Click the die on a row's image. For anything with an activity that makes the attack, casts the spell,
drinks the potion -- the normal thing. For a container it opens the bag instead, because a backpack
has nothing to roll.

Hover a row and the D&D 5e system's own item card appears, the same one the character sheet shows. You
do not have to open a sheet to read what something does. Middle-click the card to lock it open.

![The Favorites and Weapons sections, each row carrying its action-cost badge and its equip, favourite and send controls](../assets/userguide-favorites-weapons.webp)

The Spells section groups by level and shows the slots you have left on each.

Spells that are **not** cast from a slot get sections of their own above the levels. **At-Will** is for
the ones with no limit at all, marked with an infinity sign. **Innate** is for the ones a feature, a
racial trait or an item granted you -- a fighter's Misty Step, a tiefling's Hellish Rebuke. They are
kept apart from the levelled spells because nothing prepares them: they are yours whatever your
prepared list says, and the sun that toggles Prepared does not appear on them. Any limit on their uses
belongs to the spell rather than the group, so the Innate heading claims nothing about how often you
can cast them.

![The Spells section: cantrips and levelled spells, with the remaining slots shown against each level](../assets/userguide-spells.webp)

Inventory can be read as a flat list or grouped by container. The toggle is on the Inventory section's
own title bar, next to its category filters.

![The Inventory section grouped by container, with the currency row and its send and consolidate controls](../assets/userguide-inventory.webp)

### Favourite something

Click the heart on a row. Click it again to remove it.

### Plan a set of gear

The **shirt** in the Character Sheet strip opens the builder. The first time you open it for a
character, Squire makes two things for you: **Original Gear**, a build holding whatever they have
equipped right now, and a **Default Costume** holding their own portrait and token. Between them you
can always get back to where you started -- which matters, because equipping a build takes off
everything the build does not name. Neither is made again after that, and you can delete or rename
either.

The **shirt** in the Character Sheet strip opens the builder. Down its left is every build you have --
click one to work on it -- the list scrolls when it outgrows the space rather than stretching the
window. **New Build** and **New Costume** start another of either kind, and right-click a tile for
duplicate and delete. The rest
of the window is that build: a figure of your character surrounded by slots -- head, face, neck, back, chest, arms, hands, rings, hips, waist, feet,
and the three big slots along the bottom. Drag items from the tray into the slots to say what this
build is made of. **What those big three hold depends on your character.** If you do not prepare
spells they are your main hand, both hands and off hand, and the row above them carries a quick-use
slot at each end, a **sheath** for the dagger or hand axe you draw without thinking, and your
ammunition. If you do prepare spells the emphasis flips: the big three become quick-cast slots for the
spell or feature you reach for first, second and third, and your weapons move up into the smaller row. **The picture in the middle is the build's own.** Click it to choose one, right-click to reset. Until you set one it borrows the build's portrait, or your character's own face -- and once set it stays put no matter what outfit you put on, because it belongs to the build rather than the character. The two circles beside the head hold a **portrait** and a **token** image. Click either to pick a picture, right-click to reset it. Until you set one, each shows what your character already uses. Right-click a gear slot to empty it; right-click a build's tile to open, duplicate or delete it. Duplicating is the quick way to try a variant -- the same set with one thing swapped -- without building it again from nothing. The foot of the window totals what the gear weighs.

**If your character has any spell worth preparing**, a column of twenty-six small squares runs down
the right of the doll, past a dividing rule, starting level with the top of the neck slot. That is your prepared list
-- drag spells into it the same way you drag gear. An empty square shows a glyph and its number, so
you can see at a glance which are open and how far down the list you are; both go once there is a
spell in it. All twenty-six squares are always drawn, and the ones past what you can prepare are
dimmed and will not take a spell -- they are there to show what levelling up will buy. How many you
can prepare comes from your class where D&D 5e can work it out. Where it cannot -- a fighter handed a
spell by the GM, say -- the limit is simply the number of preparable spells you own, so you can plan
every one of them and no more. A multiclass
caster gets one list rather than one per class, because preparing a spell in this game is a fact about
the spell rather than about the class that taught it. Your spell slots sit in the square at the top of
the column: a three by three of all nine ranks, first in the corner and ninth in the far one, with the
ranks you cannot cast yet dimmed and marked `--`. They are for reference only -- a prepared spell is
not tied to a particular slot in this game, so they are something to read rather than something to
fill in. Cantrips are not shown at all, being always available and never
prepared.

A character with nothing to prepare has no such column, and their window is narrower by exactly that
much. Their build is the doll. Cantrips, innate and at-will spells do not count towards this -- none
of them is ever prepared, so having only those is the same as having none.

**A quick-cast slot warns if the build does not prepare the spell in it.** Put a spell in one of the
big three and then leave it out of the prepared column, and the slot is marked straight away: equipping
the build would prepare the column and leave that slot uncastable. The warning shows while you are
building rather than after you equip, and it does not appear for a spell that needs no preparing --
an innate spell in a quick-cast slot is exactly where it belongs.

The column is sized off the doll rather than chosen: four of its squares, with the gaps between them,
come to exactly one gear slot -- you could drop them into the neck box and they would fit it. That is
what keeps everything in the window on the same grid.

Magic items glow in their slot, coloured by rarity, and anything needing attunement carries a gem --
lit if it is attuned, warm and hollow if it is not, which means it would do nothing if you wore this
set. The foot of the window totals the attunement the build would spend against what your character
has, so you can see at a glance whether the set actually fits.

Most slots will take anything you could wear or carry -- a helm, a cloak, a belt and a pair of boots
look identical to the game, so Squire does not pretend to tell them apart. The ones it *can* check, it
does: the ammo slots take ammunition, Both Hands takes a weapon, and nothing that is not a physical
object -- a spell, a feat, a class feature -- goes anywhere. If a slot turns
something down it says what it was expecting.

Under a costume's picture are three settings for how the token is **drawn**: its **dimensions** in grid
spaces, the **image fit** mode, and the **scale**. A costume changes what your character looks like, and
the picture is only half of that -- a giant in disguise is not the same size on the map. They sit on one row, with a line beneath saying what the fit
mode you picked does to the scale. Each can be left alone -- an untouched control shows what your token
uses now, and right-clicking one puts it back to that. **Anything that will actually change something
carries an amber warning triangle**, so a costume with no mark on it changes nothing but the picture. Equipping a gear build never touches any of it. Your **Default Costume**
records your token's own size and framing when it is made, so it is the one that puts everything back.

The **download** button beside a build's name fills it from your character *right now* -- useful if you
set something up on the sheet before finding this window, or changed it there and want this to catch
up. It is on builds and costumes both; what it takes is what differs.

On a **build** it opens a screen listing every slot from head to toe with what would land in each, and
a dropdown on every row to move it somewhere else. Nothing is written until you press **Fill Build**,
and a slot can only hold one thing -- give a slot to something else and whatever held it drops to the
**Not mapped** list at the bottom, where you can watch it happen. Hover any row's picture for the full
item card, because "where should a Rod of Lordly Might go" is not a question anybody can answer from
the name.

**It will not guess.** Where an item goes is decided from what the system actually knows about it, and
anything that cannot be worked out is left unmapped and shown to you rather than dropped into whichever
slot happened to be free. A build with two things missing tells you exactly what to fix; a build with
two things in the wrong holes tells you nothing. Each unmapped row says which of two reasons applied --
nothing could say where it goes, or it knew and the slot was already taken, which is what happens when
a character has two amulets and one neck.

Items left **Not mapped** stay equipped on your character. They are simply not part of this build, so
equipping the build later would take them off.

On a **costume** there is nothing to map, so it asks once and takes a snapshot: your portrait, your
token picture, your full-body image, and the size, fit and scale your token is drawn at. If you have no
full-body image set, it uses your portrait and the message says so.

A **Costume** changes only your portrait and token when applied and leaves your gear and spells
completely alone -- useful for a disguise, a wild shape, or a change of clothes. The window changes
with it: no slots, no spells, just the pictures it will set and how the token should be drawn. A
**Build** does the lot.

You choose which you are making when you make it -- there are two buttons under the list -- and the
right-click menu has **Convert to Costume** / **Convert to Build** for changing your mind afterwards.
Converting clears the other mode's contents and says so first: what carries over is the name, the
pictures, the heart and the sound.

Each entry in the rail shows its estimated armour class and how many slots are filled. The **shirt**
button on it equips it -- a **masks** button on a costume, the same two glyphs used everywhere in this
window for the two kinds of thing. Equipping puts everything in the build on and takes everything else
off, prepares its spells, and unprepares anything else that counts against a preparation limit.

**A build asks first and tells you exactly what it will do; a costume does not.** Equipping takes
things off, which is worth naming before it happens. A costume changes artwork and touches no gear, so
the question stood between you and the fast thing you came to do -- and the toast still carries the
undo either way. Attunement is never changed for you -- that is a decision for your table. Tokens already on the map are repainted too, not just the portrait. If you
change your mind, the toast that appears afterwards can be clicked to undo the whole thing; ignore it
and the change stays.

The AC is marked **est.** because it is worked out from the build's armour, shield and your Dexterity
alone. It cannot see Unarmoured Defence, a fighting style, or a bonus from an effect, so use it to
compare two builds rather than as the number for your sheet.

Your armour class sits on a shield at the foot of the portrait. **Drag an item over a slot and watch it
move** -- the badge shows what the swap would give you and by how much, before you let go. Hover
anything already in a slot for its full item card.

**Drag a build from the rail onto the tray handle** to keep it within reach. It joins a strip above your
favourites, and clicking it there equips it -- so you can switch your whole kit with the tray shut.
Right-click takes it back off.

The build you last equipped is marked **Worn** in the rail. If you then change something outside the
builder -- unequipping a sword from your sheet, or editing the build after putting it on -- the mark
drops to **Last worn** and tells you how many things differ. The slots holding items you are not
actually wearing get an amber warning, and a badge on the portrait counts anything you have equipped
that the build never mentioned. Equipping the build again puts it all back. None of this is an error:
picking up a torch is a perfectly reasonable thing to do, and the marks are only there so the window
never claims you are wearing something you are not.

**Find the one you want.** The list has three tabs -- **Favorites**, **Costumes** and **Builds** --
and the window opens on Favorites. Right-click any entry and **Add to Favorites** puts a red heart on
it and lists it there; it is nothing more than that, and it is the way back to the two or three you
actually use once you have twenty. Switching tabs clears what is on the figure, so you are never
looking at a costume while standing on the Builds tab.

**The buttons along the bottom** act on whatever is showing: **Equip Build** or **Wear Costume** on the
far right, **Add to Handle** beside it, and **Delete** at the opposite end on purpose.

**Add to Handle** is the button version of dragging a tile onto the handle -- the same thing, without
having to know that dragging does it. Once an entry is there the button reads **Remove from Handle**. New entries join the end of the strip.

**Every entry can have its own sound**, played when you put it on. The speaker button beside the
download button opens a file browser; right-click it to go back to the one the module ships with. A
build that has chosen its own sound shows a full speaker rather than a low one.

### The three pictures

A build carries up to three: your **portrait**, your **token**, and a **full-body** picture that fills
the middle of the figure. Click any of them to choose a file, right-click to clear it. A picture you
have not set is drawn with a dashed edge and shows what your character already has -- meaning this
entry changes nothing there. Everywhere in this window, **a dashed edge means nothing is set here**.

Two entries on the right-click menu deal with pictures, and they are not the same thing:

- **Set As Default Artwork** decides what a *new* build or costume starts from. It changes nothing
  about your character -- only what this tool offers you next time. The entry it came from is marked
  **Default** in the list, and says **Default (changed)** if you edit its pictures afterwards.
- **Update Prototype Token** (costumes only) writes the pictures onto your *character*: the portrait,
  the token art that every token placed from now on will use, and the full-body image. Tokens already
  on the map are left alone, and nothing about the token's size changes.

**Reset Default Artwork** puts the builder's defaults back to whatever is on your character sheet.

### When the GM has to say yes

Your GM can require approval before you change kit -- swapping gear costs an action and a prepared list
needs a rest, so at some tables that is a decision to make together rather than a click. If it is
switched on, equipping shows a message while your GM is asked, and a dialog appears on their screen
with what you are asking for. Approve and it goes ahead exactly as normal; deny and you are told, and
nothing changes.

Builds and costumes are set separately, so a table can require approval for a change of gear and not
for a change of clothes. If no GM is online, or they close the dialog without answering, the change
does not happen and you are told which it was.

**Until you equip it, a build is a plan, not a state.** Nothing in it changes what your character is actually wearing --
it is somewhere to work out a set of gear, not a switch that puts it on. Only items already on your
sheet can go in a slot, and if one later leaves your sheet the slot says so rather than quietly
emptying itself.

### Work with your favourites

The **heart in the Character Sheet strip** opens your favourites on their own: no tabs, no search box
and no filter bar, just the list and its **Clear All Favorites** button. The person icon beside the
heart goes back to the sheet. Squire opens on whichever of the two you were last in, and on favourites
the first time.

Favourites draw two ways, and the pair of icons at the right of the Favorites header switches between
them. **List** is the ordinary row, the same one every other section uses. **Tiles** is a grid of
squares, each one the item's own artwork with its name across the bottom and what it is under that --
"Weapon - 4 lb", or a spell's level. The controls sit top-right, and hovering a tile brings up the die,
exactly as hovering a row's picture does. Whichever you pick is remembered.

The icon beside those two sets the order, and shows which order you are in: **Manual** is the one you
arrange yourself, **Alphabetical** is by name, and **By Category** groups weapons, spells, feats and
gear in that order with names alphabetised inside each group, under headings like the ones the Weapons
and Inventory sections use. Sorting never disturbs your manual
order -- switch back to Manual and your arrangement is exactly as you left it. While a sort is on, the
move-up and move-down options leave the right-click menu, because they would be rearranging an order
you are not currently looking at.

Right-click a tile and open **Tile Size** to change how much room it takes: **1 x 1**, **2 x 1**,
**1 x 2** or **2 x 2**, width first.
Give the thing you reach for every round a big square and let the rest sit small around it. The same
menu carries the move-up and move-down options it always has.

Hovering an item's name shows Foundry's own card for it, in the tiles and in every list. The feather
shows the same card, so you can see what opening the sheet will give you before you click it.

Favourites are shared with the character sheet in both directions: favourite something in the tray and
it appears on the sheet, favourite it on the sheet and it appears in the tray, and removing it in
either place removes it in both. The activity, effect and resource favourites the sheet owns are left
alone.

To get a favourite onto the handle so it is reachable with the tray closed, drag it there. Dropping it
on top of an existing icon inserts it above; dropping past the end adds it at the bottom. The handle
shows as many as fit and hides the rest, so a short list is a usable list.

### Choose a section

Five tabs sit under the search box: **All**, **Weapons**, **Spells**, **Feats** and **Inventory**. They
pick which section you are looking at, and the one you are on stays lit. **All** shows every section at
once, which is where the tray starts.

Favourites are not one of the tabs. A favourite is a flag rather than a kind of item, so it never
belonged in the same row as the other four -- it gets the heart in the strip above instead.

The tab you are on is remembered between sessions. That is safe in a way the old type filters were not,
because a lit, labelled tab explains itself the moment you look at it.

### Narrow down what you are looking at

The filter bar under the tabs is five action-cost icons -- action, bonus action, reaction, special and
passive. Each names a bucket to show, and with all five on you see everything. Passive covers gear and
anything slower than a turn, so everything you own falls into one of the five. Shift-click one to show
only that cost, and shift-click it again to put the rest back. These are deliberately forgotten when
you log out, so you never come back to a half-empty tray.

Beside them sit up to two buttons, and which ones appear depends on the tab:

- **Equipped** -- on the Weapons, Inventory and All tabs. Pressed, it hides gear you are carrying but
  not wearing or wielding. It says nothing about spells or features.
- **Prepared** -- on the Spells and All tabs. Pressed, it hides spells you know but have not prepared;
  cantrips and anything always available stay. It says nothing about gear.

Both are off until you press them, they light up while they are hiding something, and they are
forgotten when you log out. They are the same two switches wherever they appear -- pressing Equipped on
the Weapons tab also applies on Inventory, because it is one question about gear asked in two places.
The **All** tab is the only one showing both, so it is the place to look if something seems to be
missing.

The search box above the tabs -- **Search All Sections...** -- filters every section at once. The cross
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

If the GM has allowed it, the Character Sheet strip carries a magnifying glass alongside the heart and
the person. Click it and the tabs, the filter bar and the panel stack are all replaced by a search box
and **Add from Compendiums**, listing matches grouped by the compendium they came from. Each row has a plus that adds it. The person icon next to the
magnifying glass goes back to the character's own items. Adding something switches to the tab that
will hold it, so you land on the new row rather than on whichever tab you happened to leave open.

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
