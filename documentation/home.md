# Coffee Pub Squire

**Audience:** everyone -- players and GMs using the tray, and contributors changing it.

A character tray for Foundry VTT that follows the token you have selected. Spells, weapons,
inventory, features, favourites, health and conditions sit one click away instead of behind a
character sheet, and a second tab turns the same tray into a party view with item transfers,
reputation and the GM's party tools. Squire is part of the Coffee Pub suite and requires Coffee Pub
Blacksmith.

![The tray open on the Character tab: the character block, GM Details, Summary, the Character Sheet strip with its search box, section tabs and filter bar, then the open section, with the handle beside it and a transfer in progress](assets/product-expanded.webp)

This page routes. Each section points at the document that answers the question rather than answering
it here.

## Using Squire at the table

[Getting started](userguides/userguide-getting-started.md) covers what changes on screen the moment
the module is enabled, how to open, pin and resize the tray, what each panel does, and the things a
player can do that a GM cannot and the other way round.

[Settings](userguides/userguide-settings.md) covers every control on Squire's settings page, by its
on-screen name: what it does, who it affects, and whether it is yours alone or the whole world's.

## Working on Squire itself

[The architecture map](architecture/architecture-squire.md) is the entry point: how the tray is
assembled, which class owns what, and where Squire ends and Blacksmith begins. The two tabs then have
their own documents -- [the Character tab](architecture/architecture-character.md) and
[the Party tab](architecture/architecture-party.md).

Squire exposes no API to other modules; it is a leaf consumer of Blacksmith rather than a provider.
For the surfaces it builds on -- the core utilities, chat cards, inventory, campaign context,
compendiums, windows and the hook manager -- see the
[Blacksmith wiki](https://github.com/Drowbe/coffee-pub-blacksmith/wiki). That is the source of truth;
Squire does not keep its own copy of it.

## Where Quests, the Codex and Notes went

They were Squire's until 13.7.0. Quests and the Codex are
[Coffee Pub Librarian](https://github.com/Drowbe/coffee-pub-librarian)'s now, and Notes are
[Coffee Pub Blacksmith](https://github.com/Drowbe/coffee-pub-blacksmith)'s. Existing data was
migrated rather than dropped. Squire's charter is narrower on purpose: help me understand what my
character can do, and let me do it with ease.

## Known issues

Defects that are real and unfixed are in [known issues](known-issues.md).
