# Coffee Pub Squire

![Latest Release](https://img.shields.io/github/v/release/Drowbe/coffee-pub-squire)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/Drowbe/coffee-pub-squire/release.yml)
![GitHub all releases](https://img.shields.io/github/downloads/Drowbe/coffee-pub-squire/total)
![MIT License](https://img.shields.io/badge/license-MIT-blue)
![Foundry v13](https://img.shields.io/badge/foundry-v13-green)

Play your character without opening the character sheet.

Squire is a tray that follows the token you have selected. Your spells, weapons, inventory, features
and favourites sit one click away down the left edge of the screen, with hit points and conditions
readable at a glance even when the tray is closed. A second tab turns the same tray into a party view
with item transfers, reputation, and the GM's party tools.

![The tray open on the Character tab: the character block, GM Details, Summary, the Character Sheet strip with its search box, section tabs and filter bar, then the open section, with the handle beside it and a transfer in progress](documentation/assets/product-expanded.webp)

## What it does

- **A tray that follows your token.** Select a character and the tray is theirs -- portrait, health,
  conditions, and everything they can do. Players get their own character without selecting anything.
- **Roll from the tray.** Click a row to attack, cast, or drink it. Hover it for the D&D 5e system's
  own item card, without opening a sheet.
- **Favourites that agree with the sheet.** Favourite something in either place and it appears in both.
  Drag one onto the handle and it stays reachable with the tray closed. They get a view of their own,
  as a list or as a wall of tiles you can size and sort.
- **Filters that answer a question.** Section tabs pick what you are looking at; five chips ask what
  it costs to use; two switches narrow to what is equipped or prepared right now.
- **Item transfers between characters.** Drag an item onto a party member, or use the send arrow.
  Optionally routed through the GM for approval, with chat cards carrying each step.
- **A party view.** Everyone on the scene with their health, plus per-scene party reputation and, for
  the GM, awarding experience, calling a vote, and deploying or clearing the party.
- **Character sheet cleanup.** Consolidate coins, link items to their compendium entries, and merge
  duplicate stacks -- previewed row by row before anything is written, with one step of undo.
- **Statblock checks for NPCs.** A warning badge on the bow with no arrows or the caster with no spell
  slots, repairable in a click.

Quests, the Codex and Notes were Squire's until 13.7.0. Quests and the Codex are now
[Coffee Pub Librarian](https://github.com/Drowbe/coffee-pub-librarian)'s, and Notes are
[Coffee Pub Blacksmith](https://github.com/Drowbe/coffee-pub-blacksmith)'s. Existing data was migrated
rather than dropped. Squire's charter is narrower on purpose: help me understand what my character can
do, and let me do it with ease.

## Requirements

- **Foundry VTT** version 13. Squire 12.1.14 was the last build compatible with v12, and there are no
  plans to maintain that line.
- **The D&D 5e system.** Squire is built for it and does not work without it.
- **[Coffee Pub Blacksmith](https://github.com/Drowbe/coffee-pub-blacksmith)**, version 13.19.1 or
  later, installed and enabled. Squire will not run without it.
- **[socketlib](https://github.com/manuelVo/foundryvtt-socketlib)**, installed and enabled.

Optional: [Coffee Pub Librarian](https://github.com/Drowbe/coffee-pub-librarian), if you want the
quests and codex Squire used to provide.

## Install

Inside Foundry VTT, add this manifest URL:

```
https://github.com/Drowbe/coffee-pub-squire/releases/latest/download/module.json
```

Then enable Squire in your world's module settings, with Coffee Pub Blacksmith and socketlib enabled
alongside it.

## Where to read more

The [wiki](https://github.com/Drowbe/coffee-pub-squire/wiki) has the detail:

- [Getting started](https://github.com/Drowbe/coffee-pub-squire/wiki/userguide-getting-started) --
  what appears on screen, how to open and pin the tray, what each panel does, and what a player can do
  that a GM cannot.
- [Settings](https://github.com/Drowbe/coffee-pub-squire/wiki/userguide-settings) -- every control on
  the settings page, by its on-screen name.
- [Architecture](https://github.com/Drowbe/coffee-pub-squire/wiki/architecture-squire) -- how the
  module is built, for anyone changing it.
- [Known issues](https://github.com/Drowbe/coffee-pub-squire/wiki/known-issues).

## The Coffee Pub suite

Squire is one of a family of modules for D&D 5e on Foundry. Blacksmith is required by all of them; the
rest are optional and independent.

| Module | What it does |
|---|---|
| [Blacksmith](https://github.com/Drowbe/coffee-pub-blacksmith) | Quality of life, gameplay frameworks, automation, and aesthetic improvements |
| [Minstrel](https://github.com/Drowbe/coffee-pub-minstrel) | A music, environment and one-shot audio console for live play |
| [Crier](https://github.com/Drowbe/coffee-pub-crier) | Combat turn announcements with turn cards and round summaries |
| [Librarian](https://github.com/Drowbe/coffee-pub-librarian) | A campaign codex of people, places, factions and artifacts, and the quests running through them |
| [Scribe](https://github.com/Drowbe/coffee-pub-scribe) | Journal and chat card formatting for sharing narrative |
| [Bibliosoph](https://github.com/Drowbe/coffee-pub-bibliosoph) | In-game player messaging with journal-backed conversations |
| [Curator](https://github.com/Drowbe/coffee-pub-curator) | Image management: token, portrait and map image placement |
| [Merchant](https://github.com/Drowbe/coffee-pub-merchant) | Shops: mark an actor as a merchant and let players browse their stock |
| [Artificer](https://github.com/Drowbe/coffee-pub-artificer) | A crafting, recipe and blueprint system |
| [Cartographer](https://github.com/Drowbe/coffee-pub-cartographer) | Party strategic planning and sketching |
| [Herald](https://github.com/Drowbe/coffee-pub-herald) | A streaming and broadcast view with a designated cameraman user |
| [Monarch](https://github.com/Drowbe/coffee-pub-monarch) | Save and load sets of enabled modules |
| [Regent](https://github.com/Drowbe/coffee-pub-regent) | Optional AI tools and worksheets |
| [Vault](https://github.com/Drowbe/coffee-pub-vault) | Optional assets for the suite |

<!-- global:ai-assistance -->
## AI Assistance and the Illusion of Good Code

I started writing Foundry modules for use at my own table back in 2020. There were already a ton of amazing modules out there, but they either didn't quite do what I wanted or didn't deliver the kind of user experience I was looking for.

I've been a design leader for more than 20 years, but I spent the first half of my career as a developer, so building my own modules seemed like a fun way to kill some time. I'm a pretty good designer. I'm a decent developer. But, over time, my hand-written code and hacks got a little messy (and memory-leaky, and a little buggy. Feels good to say it out loud.).

Today, the Coffee Pub suite of modules is developed with AI assistance, primarily Claude and Cursor, for documentation, refactoring, debugging, and other development work. Every change is reviewed and committed by me, and nothing reaches a release that I haven't crawled and run at my own table. I can't seem to give up my IDE. The UX design, architecture, and ideas still come from my own fever dreams and chronic lack of sleep.

Testing and verifying a change means running it in Foundry so I can watch the console, break things, fix them, and hone the experience. The repositories carry a set of tools for testing the things that are difficult to catch through review and manual testing alone. They help ensure styles don't conflict, shared coding and documentation standards stay consistent, and the suite of modules continues to work well as a system without silently breaking.

Those checks are there because AI-assisted development can move very quickly, and without oversight, engagement, and planning, it can also go confidently off the rails and deliver the illusion of good code. The AI helps me build faster. It doesn't decide what gets built, its architecture, or how it should work. You can blame this human for that.

If the idea of AI-assisted development keeps you up at night or just isn't your jam, no worries at all. I get it. You do you.
<!-- /global:ai-assistance -->

## License

MIT. See [LICENSE](LICENSE).

This is a personal project built for my own table. If you find it useful, please do use it -- but I
make no guarantees about stability, compatibility, or ongoing support, and you use it at your own
risk.
