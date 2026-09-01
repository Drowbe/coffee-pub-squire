# Known Issues

**Audience:** anyone running Squire who hits something that looks broken.

Defects and limitations that are real and unfixed. What is fixed is in the CHANGELOG; what we intend
to build is not here.

## Coins can only be sent between characters one person owns

The send arrow on a currency row opens the same recipient picker item transfers use, but the move
itself needs write access to both characters. A GM can send coins from anyone to anyone, and a player
can move coins between two characters they own. A player sending coins to another player's character
fails.

Items are not affected -- they go through the request-and-approval path, which coins do not, because
that path is built around an item document.

Workaround: hand the coins to the GM, who passes them on. Or convert to an item.

## A container row still shows a die, and clicking it opens the container

Every row in Favorites, Inventory, Spells, Weapons and Features carries a die overlay on its image,
and on a container that overlay opens the bag instead of rolling anything. Opening is the intended
behaviour -- a backpack has no activity, so rolling it would just post a description to chat -- but
the icon promises a roll it does not perform.

Workaround: none needed; the click does the useful thing. Only the icon is wrong.

## The handle shows every active effect, or none

The conditions grid on the tray handle renders every active effect on the actor. There is no way to
show conditions but hide passive item effects, or to pick individual ones. Show Conditions in Handle
turns the whole grid on or off and nothing finer.

Workaround: turn the grid off if a character with many passive effects makes it unreadable.
