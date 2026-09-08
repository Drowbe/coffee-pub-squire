# Gear Builds Architecture

**Audience:** anyone changing Gear Builds.

How a build is stored, drawn, applied and approved, and the one piece of Squire data another module is
meant to read. The tray as a whole is in [architecture-squire.md](architecture-squire.md).

## Overview

A **build** is a saved plan for what a character wears and prepares. A **costume** is the same record
in a different mode: it carries artwork and touches no gear. Both live in one list on the actor, are
edited in one window, and are applied by one function.

Nothing here owns anything on the character sheet. A build **points at** items by id; it has never
held one. Applying a build equips what it names and unequips what it does not, which is the whole of
its effect on the sheet.

## Project Files

| File | Purpose |
|------|---------|
| `scripts/utility-builds.js` | The data layer: the record, the doll layout, apply, drift, import planning, artwork, sound |
| `scripts/window-build.js` | `BuildWindow` — the builder: rail, doll, prepared column, all editing |
| `scripts/window-import.js` | `ImportWindow` — the slot-by-slot mapping screen for filling a build from the sheet |
| `scripts/manager-build-approval.js` | Asking the GM before a player re-kits |
| `templates/window-build.hbs` | The builder's markup |
| `templates/window-import.hbs` | The import screen's markup |
| `templates/partials/handle-builds.hbs` | Build tiles and the worn build's actions, on the tray handle |
| `styles/panel-builds.css` | Everything above |
| `assets/sounds/build-changeoutfit.mp3` | The default sound a build plays going on |

## The record

One flag on the actor, `builds`, holding an ordered array. Every read goes through `getBuilds()`,
which normalises each entry, so a record written by an older version is repaired on the way out rather
than special-cased at every use.

| Field | Meaning |
|---|---|
| `id` | Random, stable, and what everything else keys on. Names are not unique |
| `name` | Free text |
| `mode` | `'gear'` or `'costume'` |
| `slots` | Slot key → item id. 21 keys; see the doll below |
| `spells` | Ordered item ids for the prepared column, up to 26 |
| `images` | `portrait`, `token`, `main` — each a path or null |
| `token` | `width`, `height`, `fit`, `scale` — costume only, each nullable |
| `favorite` | Whether it shows on the Favorites tab |
| `sound` | What it sounds like going on, or null for the default |

**Null means "no opinion" everywhere in this record**, and that is load-bearing rather than
incidental. An unset image shows the character's own and changes nothing when applied; unset geometry
leaves the token as it is; an unset sound plays the module's. "Unset" and "set to exactly what it
already is" are different intentions, and only the second survives the fallback changing underneath
it.

### The doll

`getDollLayout(actor)` returns the slots this character gets, and it differs by kind of caster:

- **Body** — 16 core slots shared by everyone, plus a row of four that differs.
- **Big three** — a martial gets Main Hand, Both Hands, Off Hand; a **full or pact caster** gets
  Primary, Secondary, Tertiary spells.

The caster test is the class's `spellcasting.progression`: `full` and `pact` are casters, `half`,
`third` and `artificer` are martials who also cast. That is a different question from whether a
character can *prepare*, which is `canPrepareSpells()` and decides the prepared column. A ranger gets
a martial's doll and can still plan a prepared list.

### The prepared column

26 cells, filled from `build.spells`. **The list is the plan**: a build with spells in it prepares
exactly those and unprepares the rest; a build with an empty column touches no spell. There is no
switch to opt in — an empty list already says everything a switch would.

`canBuildPrepare(item)` decides what may be set, and is deliberately **not** dnd5e's
`system.countsPrepared`. That getter includes `prepared === prepared.value`, making it *"is currently
prepared"* rather than *"may be prepared"* — reading it the second way meant applying a build could
only ever unprepare. Cantrips and always-prepared spells are excluded: the first are never chosen, the
second are granted. It reads `CONFIG.DND5E.spellcasting[method].prepares` rather than a list of method
names kept here, which is the same table the system consults and the same one the tray's Spells panel
asks — so all three agree by construction.

**Whether the column appears** is `canPrepareSpells()`, and its three clauses go from inference to
fact: a class that prepares, any spell slot, or — the one that matters — owning a spell
`canBuildPrepare` accepts. The first two ask what *kind* of character this is and both miss the same
case, a fighter handed a spell by their GM with neither the class nor the slots to explain it.

**How many** is `preparedLimit()`, in the same spirit. dnd5e's `preparation.max` where the system has
an answer; otherwise the number of preparable spells the character owns. That second source
constrains nothing they could have done anyway, and it beats the alternatives: `0` put every cell past
the limit and left the column visible but unusable, and no ceiling at all showed 26 live cells to a
character with two spells.

## Applying

`applyBuild(actor, build)` is the only thing that writes to the sheet, and every route reaches it —
the builder, the tray handle, `applyFromAnywhere()`. It:

1. Equips what the build names, unequips what it does not. Skips `isUnplannable()` items (containers,
   siege and improvised weapons) so a build cannot take somebody's backpack off.
2. Prepares and unprepares, if the build names any spells.
3. Writes them in **one** `updateEmbeddedDocuments` call, not one per item.
4. Plays the build's sound, broadcast.
5. Writes portrait and token art, each verified by reading back rather than assumed.
6. Repaints tokens already on the canvas, matched on the actor's **uuid**.
7. Returns an `undo` payload the caller holds in memory for the toast.

A **costume** skips steps 1–2 entirely. Not "equips nothing", which would strip the character bare.

## Identity: uuid, not id

An unlinked token's synthetic actor **shares the base actor's id**. Only `uuid` is unique. This has
been the source of nine separate bugs in this repo, so it is a rule rather than a case:

- `BuildWindow.idFor(actor)` keys the window on uuid, punctuated to `[A-Za-z0-9-]` because a uuid is
  full of dots and a dot is a class separator in a CSS selector.
- Canvas repainting matches on uuid, or a room of identical guards all change because one did.
- The tray's own `updateItem` / `updateActor` gates compare uuid.

## Drift

`buildDrift()` compares the worn build against the character and reports what no longer matches. It
does **not** claim to know which of the two moved — the sheet was edited, or the build was — so the
rail says **Last worn** with a warning triangle rather than "modified".

A build naming no spells has no opinion about the prepared list, so it cannot drift from it. That test
reads the list from the same place `applyBuild` does, so the two can never disagree.

**Slots are split by what they hold.** `SPELL_SLOT_KEYS` marks the quick-cast slots, and their
contents are compared against what is *prepared* rather than what is *equipped*. Comparing every slot
against the equipped items meant a caster's big three were permanently drifted — a spell can never be
equipped — and each one inflated the difference count beside **Last worn**.

### A build that disagrees with itself

Separate from drift, and the distinction is the point. Drift asks *has the character moved away from
this plan*, so it exists only for the build being **worn**. `resolveSlots` also asks *does this plan
agree with itself*: a quick-cast slot holding a spell the build's own prepared column does not list
will be uncastable once equipped.

That question needs no actor, so it is answered in `resolveSlots` from the build alone and shows for
whatever build is on screen. Routing it through `buildDrift` — where it started — meant the one moment
you could not see a broken build was while you were building it.

It is deliberately **out** of `count` and `matches`. Those answer how far the character has moved from
the plan, and a fault in the plan itself would put a number there that no amount of equipping could
clear. It also checks `canBuildPrepare` first: an innate or at-will spell in a quick-cast slot is
exactly where it belongs and needs no preparing.

## Importing

Two different operations behind one button, because the question is the same and only the answer
differs.

**A build** goes through `planImport()` and the `ImportWindow`: a row per slot, head to toe, with what
would land there and a dropdown to move it. Classification is **Blacksmith's** — `api.equipLocations`
returns one of thirteen body locations and Squire maps that onto its 21 slot keys. Squire deliberately
owns no classification rules of its own; wrong imports are worse than none, and the module with the
item data is the one that should decide.

**A costume** is a snapshot: `pullCostumeFromSheet()` takes the three pictures and the token's
geometry, with no mapping window because there is nothing to map. The full-body image falls back to
the portrait.

## Artwork

Three pictures, and three places they can live. Keeping them straight is most of what this section is
for.

| Where | What it means |
|---|---|
| `build.images.portrait` / `.token` | What **this build** sets. Applied to the actor when worn |
| `build.images.main` | What **this build** looks like — the picture at the centre of the doll |
| `actor.img` / `prototypeToken.texture.src` | What the character **is** right now |
| `actor` flag `fullbody` | What the character **looks like standing there**. See below |
| `actor` flag `defaultImages` | What the **builder** starts a new entry from |

`defaultImages` is the builder's own default and holds `portrait`, `token`, `main` and the `sourceId`
of the entry it came from. **Set As Default Artwork** writes it from an entry and touches nothing
Foundry can see; **Update Prototype Token** writes the actor and the `fullbody` flag and touches
nothing the builder does. They are adjacent in the menu and are not the same action.

## Shared data: the `fullbody` flag

**This is the only Squire data another module is meant to read.** It is not an API — there is nothing
to call, no registration, and no version handshake. It is a documented flag holding a string.

```js
const path = actor.getFlag('coffee-pub-squire', 'fullbody');   // string, or null
```

A portrait is a face and a token is a piece seen from above. Neither is what a character looks like
*standing there*, and dnd5e has no field for it. Squire needed one for the centre of the paper doll;
putting it on the **actor** rather than on a build is what makes it available to a party roster, a
chat card or anything else that wants a standing figure.

**Contract, such as it is:** a path string or absent. Absent means the character has no full-body
image, and a consumer should fall back to `actor.img` rather than showing a gap. Squire writes it from
**Update Prototype Token** and reads it as the fallback behind a build's unset `main`. Nothing else in
Squire depends on it, so it can be set by hand or by another module without breaking anything here.

**Open:** the key is Squire-namespaced. If the suite wants a standing figure as a shared idea, the flag
path belongs with Blacksmith so every module agrees on where it lives — the same reasoning that put
classification there. Until then, treat this as Squire's flag that others may read rather than as a
suite convention.

## Approval

`manager-build-approval.js` asks the GM before a player applies. Two **world-scoped** settings decide
whether it asks at all — user scope would be a checkbox the person being asked about could untick.

Built on **Blacksmith's `gmRequest`**, which is the point: Foundry does not pass the caller to query
handlers, so every consumer that needed one had been putting a claimed user id in its own payload,
which is the step that makes it forgeable. `gmRequest` supplies a verified `User`. The handler
re-resolves the actor from its uuid and checks that the **verified** caller owns it.

- Registered on **every** client, not only a GM's. Any client can become the answering GM.
- A GM is never asked; they would be asking themselves.
- **Dismissing the dialog denies.** Blacksmith's dialogs resolve on dismissal rather than rejecting,
  and an unanswered request must not become an approved one.
- If Blacksmith is too old to have `gmRequest`, the change is **refused**. A gate that lapses silently
  when a dependency is a version behind is worse than one that is honestly unavailable.

**It is not a permission system**, and the code says so where somebody might mistake it. A player owns
their actor and can equip anything from their own sheet. What this stops is one-click re-kitting
through Squire mid-combat.

### The three surfaces

The rule this feature is the pilot for, and the one the rest of the module is migrating to:

| Surface | Job |
|---|---|
| **A dialog** | Decides. Blacksmith's `dialog.wait()`, arbitrary buttons, cannot be missed |
| **A toast** | Informs. One click action by design; the moment it has to be *answered* it stops being a toast |
| **A chat card** | Records. Chat is good at history and bad at attention |

An approval on a chat card works and is easy to miss in a busy log, which for a permission gate is the
failure that matters.

## The tray handle

Two independent things, each with its own condition — they shared one gate once, and a player who had
never dragged a build got no action strip either.

- **Build tiles**, from the `handleBuilds` flag. Dragged there from the rail, clicked to apply,
  right-clicked to remove. Not the same list as favourites: this one costs screen space.
- **The worn build's actions**, derived from `layout.big` and never stored. **Three**, whatever the
  character is: a martial's weapons or a caster's spells. Three is a budget on a narrow strip that
  already carries health, conditions and hand-placed favourites — adding a fourth slot reopens that
  decision rather than extending it.

## Window chrome

`BuildWindow` and `ImportWindow` are `BlacksmithToolWindowBaseV2`. The recurring lesson is to add
nothing the base already does — the body scrolls, `blacksmith-list` is a row, `blacksmith-tabs` is a
tab bar. Two things worth knowing because they look like dead code:

- **`_saveScrollPositions` / `_restoreScrollPositions` are called on every render**, on `this`, so
  grepping the name finds no caller. The base tracks one element; a nested scroller (the rail) needs
  its own key in the returned bag. Restoration happens inside a `requestAnimationFrame`, so writing
  `scrollTop` yourself in `_onRender` runs *before* it and is one reflow from being discarded.
- **A redraw replaces the contents of `this.element` and keeps the element**, so anything bound to the
  root in `_onRender` accumulates one listener per render. Guard on the element, never a boolean.

See Blacksmith's `documentation/global/global-applicationv2-traps.md`.
