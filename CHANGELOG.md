# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).



## [Unreleased]

### Fixed
- **The resting dim was applied to the control, not to the art inside it.** `filter: brightness(0.9)` sat on the element that owns the border, the 4px radius and the `overflow` clip — which forces that element into its own compositing layer, so the rounded corners and the 1px rim were rasterised separately from everything around them, inside a parent rotated 180°. Dimming a picture never needed the frame to come with it. Every filter in the handle now lands on the `img` (or the glyph), and nothing that paints a border also carries one.
- **Handle control borders rendered thicker on one side and swapped sides when the window was resized.** A device-pixel problem, not a CSS one. At fractional OS display scaling — Windows at 125% or 150% — one CSS pixel is 1.25 or 1.5 device pixels, so a 1px rim physically cannot rasterise evenly: one device pixel on some edges, two on others, and which edges get which shifts as the window moves. The control border is 2px now, which divides cleanly enough at those ratios for the variance to stop showing, and reads better at 32px besides.
  - This is why several source-level fixes did not touch it, and why the computed-styles panel looked correct throughout — computed styles report CSS pixels, and the defect was in device pixels. The diagnosis came from resizing the window and watching the heavy edge move, which no amount of reading the stylesheet would have produced.
  - Separately, the tray's `top` and `height` are snapped with CSS `round()`. They derive from `100vh` and Blacksmith's menubar offset, neither obliged to be a whole number, and that fraction cascades into every control in the handle. The plain `calc()` is kept above each as the fallback for engines without `round()`. This is defence in depth rather than the fix.
- **Handle controls hard-reset `outline` and `box-shadow`** across rest, hover, focus, focus-visible and active. Two of them are real `<button>`s and core Foundry styles `button:focus` with both an outline *and* a 4px shadow, which would have arrived on click. Our rules already out-specified it; this is the one place `!important` is earned, and it is what Foundry itself does for hotbar buttons.
- **The handle's health bar is an ordinary box again.** It had accumulated four things that are each fine alone and unpredictable together: an absolutely-positioned percentage-height fill, an `overflow` clip, a border radius, and an inherited `writing-mode: vertical-lr` — all inside an ancestor rotated 180°. In a vertical writing mode, percentage sizing, static position and flex axes all resolve against the block axis, and the block axis was horizontal; the fill's placement was falling out of that. It resisted four separate fixes because the geometry was genuinely not predictable, not because any one value was wrong.
  - Writing mode is a text concern, so it moved to the two elements that hold text and off the box that does layout. The HP number and the skull read exactly as before.
  - The fill is a normal flow child now — full width, `height` from its inline style, clipped like any other child — instead of an absolutely-positioned overlay.
  - The control's edge is one set of tokens: `--squire-handle-border-width` and `--squire-handle-radius`, with anything painting *inside* a control using `--squire-handle-radius-inner`, the outer radius less the border it sits behind. The fill's radius had been 2px, a third curve agreeing with neither the border nor the clip; the correct inner curve is derived now rather than guessed.
- **Hovering a handle icon never scaled it.** The rule said `transform: scale(1.1, 1.1) rotate(inherit)`, and `inherit` is not a legal value inside a transform function — the whole declaration was invalid and dropped, so the effect had never once run. It is gone rather than repaired: the border is the hover signal now.
- **The tray handle had no width.** `handle.css` asked for `var(--tray-handle-width)`, and nothing has ever defined that variable — the real one is `--squire-tray-handle-width`. The declaration was therefore invalid and the width fell back to `auto`, so the strip was as wide as whatever content happened to be widest inside it, and `TRAY_HANDLE_ADJUSTMENT` had been quietly propping up the collapsed-tray arithmetic to compensate. The handle is now the width it says it is, and that fudge factor is back to zero.
- **The chevron closes a pinned tray instead of scolding you.** Clicking it while pinned popped a warning telling you to unpin first, which is a worse version of what you asked for: it now unpins and closes in one click. The pin button still only unpins, leaving the tray open, so nothing you were reading disappears when you press it.
- **Clicking the handle toggles the tray.** It was supposed to already — but the handler asked for `[data-clickable="true"]`, and the only element carrying that attribute lives in the tray *content*, while the listener was bound to the handle. It could never match, so the whole strip was inert except for the three buttons. Bare handle now toggles, and the portraits, health bars, favourites and condition icons on it keep their own clicks.
- **The pin, collapse and view-cycle buttons hover alike.** The caret took its colour from `.tray-handle:hover`, so it lit up when you hovered anywhere on the handle — including while you were aiming at one of the other two — and the pinned pin's white overrode the shared hover rule entirely, leaving it the one button that didn't react.

### Added
- **The tray collapses shortly after you click somewhere else** (`Collapse Tray When You Click Away`, on by default, unpinned trays only). The delay is `Tray Collapse Delay`, shared with the option below.
- **Optional hover-to-open** (`Open Tray on Hover`, off by default): moving onto the handle expands the tray, moving off the tray collapses it after the same delay. Hover-opening is silent — sweeping the pointer past the handle on the way to the canvas shouldn't chirp the open sound every time.

### Changed
- **The pin, width toggle and caret stopped responding to clicks once you had enough favorites.** The favorites trim measured against `.tray-handle-content-container` — which *contains* the bottom two buttons. So the column was allowed to run all the way down over them, and the overflowing art swallowed their clicks. It only happened once the list was long enough to reach them, which is why it read as intermittent. The trim (and the overflow fade with it) measures the content *wrapper* now: the flex item that actually stops above the buttons.
  - The wrapper also clips, as belt to that braces. The trim runs *after* a render, so between painting and measuring — or on any frame where a re-render beats it — the column could still spill over the buttons. Clipping means the worst case is an icon that vanishes rather than two controls that stop working.
- **In full mode the conditions count sits beside the glyph instead of on top of it.** Covering the glyph is the right trade at 20px, where a control cannot hold both and a corner badge would hang half outside the column. At 44px there is room for both, so nothing has to be hidden and nothing has to be traded.
- **The empty part of the HP rail reads as a channel now.** The track was `rgba(0, 0, 0, 0.45)` on a dark strip — very nearly the strip — so at full health the rail looked like a floating colored stub with nothing above it, which reads as a broken element rather than a full bar. A bar has to show its own extent to mean anything.
- **Handle entries can be dragged to reorder, and drops land where you aim.** Dropping on an existing icon inserts *above* it; dropping over none of them appends to the end. Same rule whether you're moving an icon already on the strip or dragging a new item in from a panel — an accent line across the top edge of the icon you're over shows where it will land.
  - Adding and reordering are one function, because they're the same operation: an id lands before another id, or at the end. The item is pulled out of the list before being re-inserted, which is what makes a reorder a reorder rather than a duplicate — and is a no-op when it wasn't there, which is what makes the same call serve an add. Two implementations would be two places to get the index arithmetic wrong.
  - Dropping an icon on **itself** is a no-op, guarded explicitly. Without it the removal takes the item out of the list, the lookup for its own id then fails, and it silently teleports to the end — a mind changed mid-drag punished as a reorder.
  - A handle drag sets a Squire-only payload, deliberately **not** `item.toDragData()`. Some data has to be set or the drag never starts, and a real Foundry payload would let "move this icon up two places" drop on the canvas and create a second copy of the item.
  - Handle reorders carry their own flag rather than reusing the panels' one. `dragover` can't read `dataTransfer` — the data is protected until drop — so a flag set at `dragstart` is the only thing available at hover time, and the two drags want different drop effects.
  - The insertion line is an `::before` inside the icon's top edge, not a `box-shadow` and not a line in the gap above. The gap is outside the icon's `overflow: hidden` art clip, and the shared control reset sets `box-shadow: none !important` to kill Foundry's focus ring — which would have killed the indicator too.
- **The handle has a width toggle, above the collapse caret.** Minimal is a single 20px column at 34px wide — everything shrinks with it, the two tray buttons included, because a 32px control cannot sit in a 20px column and a strip that widens for its own buttons is not minimal. Full is a 44px column at 60px — bigger portrait and favorites, and conditions packed two to a row. Same zones in the same order either way; only the sizes change. The choice is per-user and stored in a `handleMode` setting that is deliberately not on the settings page, since the only place the difference is visible is the handle itself.
  - **The setting holds in every tray state** — open, closed and pinned. Nothing overrides it.
  - This is the third and last version of an idea that kept failing in the same place. It first changed the *content* when the tray was open (controls only, everything else hidden), which died on the pinned tray, since pinned is open permanently. Then it changed the *width* when open, which died on the same rock more quietly: pinning meant never seeing your own setting. The lesson isn't about width or content — it's that "while the tray is open" is not a temporary state for anybody who pins, so nothing should be conditioned on it.
  - A wide strip beside an open tray does cost the panels 26px for nothing. That's true, and it still isn't ours to decide: a control that silently disagrees with the button you just pressed is worse than a strip that's wider than it strictly needs to be.
  - Dragging onto the handle and right-clicking to remove work identically in both modes.
  - `SQUIRE.TRAY_HANDLE_WIDTH` is now `TRAY_HANDLE_WIDTH_MINIMAL` / `_FULL` plus a `getHandleWidth()` that knows which is in force. Every consumer goes through it: the collapsed transform and the `#ui-left` margin are both measured off the closed handle, so both move with the mode. `PanelManager.applyHandleMode()` is the one place that sets the class, the custom property and the margin together — change the class alone and the tray slides to the wrong place; change the property alone and the strip is the wrong width behind a correctly-placed edge.
  - How many favorites fit is re-decided on the handle's `width` transition rather than in the toggle handler. What invalidates the count is the width changing, not the click that caused it, so anything else that ever resizes the strip is covered for free.
  - **The conditions count is a badge on the corner of the glyph**, a small colored circle rather than a numeral sharing the box. Sharing only ever worked in the wide layout — at 20px the pair doesn't fit, and hiding the glyph to make room cost the button the only thing that said what it was. Overlapping buys the room back, since a badge doesn't have to fit *beside* anything.
- **Drag anything onto the tray handle.** Pick up a row in Weapons, Spells, Features, Inventory or Favorites and drop it on the handle; right-click an icon on the handle to take it off again. That replaces "favorite it, then handle it" — two gestures to express one intent, with the second one hiding as a dagger icon inside a list.
  - **The handle and the Favorites panel are now unrelated.** The handle used to be a strict *subset* of the panel favorites: adding to it favorited the item first. That rule existed for one reason — the only way off the handle was the dagger in the favorites row, so a handle entry that was not a favorite could never be removed. The handle owns its own removal now, so the rule has nothing left to protect. The heart puts things in the Favorites panel; the handle holds whatever you dragged onto it, favorite or not. Unfavoriting no longer silently empties a handle slot.
  - **Handle order is the order you dropped them in.** It used to be re-sorted to match the Favorites panel, which was only meaningful while the handle was a subset of it. Since the trim drops from the end, the first thing you dragged on is the last to disappear on a short window.
  - **Compendium search results are rejected, and nothing had to be written to reject them.** The whole drop path is gated on `PanelManager._trayItemDragActive`, which the tray's own dragstart sets for `.panel-item[data-item-id]` rows only. Compendium rows carry `data-uuid` and no `data-item-id`, so the flag never goes up for them — and the same gate rejects drags from the canvas, a sheet, or another module, and stops the tray body's transfer drop zone from claiming the same drag.
  - The dropped item must belong to the handle's actor, compared **by uuid, not by actor id**: an unlinked token's synthetic actor shares the base actor's id, so an id check would accept an item from a different token of the same prototype and store a slot pointing at something this actor does not have.
  - Deleting an item now clears its handle slot unconditionally. That cleanup used to be nested inside "was it a panel favorite?", which is exactly the entry that can now exist without ever having been favorited.
- **The Character Sheet header icons were all drawn as the selected one, and the defect was a comma.** The rule for `.control-mode-toggle` ended with a trailing comma before a comment, which folded the base selector into the `.active` rule below it. So the person and the magnifying glass were both permanently painted in the selected style, each sitting in its own filled box, and there was no way to see which mode you were actually in. The same comma dropped `.control-cleanup` out of the selector list entirely — the broom had no rule at all, only a `:hover` two files away, in `rgba(194, 86, 61, 0.9)`: one of the five drifted oranges `--squire-color-hover` exists to have replaced.
  - All three now take the filter chips' vocabulary exactly — the chips' tan, on is full opacity, off is dimmed, no background anywhere. They are the same kind of control as the chips one row below them, so looking like a different kind was the whole bug.
  - CSS will not warn you about this. A trailing comma before a comment leaves the rule perfectly valid; it just silently applies to the wrong elements, forever.
- **The conditions button is the group's summary row again**, spanning the handle's column with the active-condition count inline beside the glyph. It spent a version as a single 20px grid cell with the count as a corner badge, which was wrong twice over: 20px is under a comfortable click target for the one thing in that group that is actually a control rather than something you read, and the count is the one number that survives the grid running out of room — the icons stop answering "how many am I under" the moment the column clips them. A summary line above its own detail earns its row.
- **A dead `[data-panel="health"]` selector**, which survived the pass that was specifically hunting dead panel selectors because a comment sat *between* two selectors in the list and read as though the list began below it. Comments go above a rule, never inside its selector.
- **The tray handle is rebuilt: 60px, one layout, laid out top to bottom.** It was a 42px column of nine identical squares, authored upside down, with a rotated character name taking roughly a third of its height.
  - **One column edge.** The portrait, the HP chip, each favorite and the conditions grid are all exactly the column's width and line up flush on both sides. Only the two tray controls keep Foundry's 32px, because they are Foundry's controls rather than status readouts.
  - **An HP rail** runs the full height of the handle's outer edge — 4px, colored by severity, filled from the bottom. It costs no vertical space, it is readable from peripheral vision while you are looking at the canvas, and it is the one status that stays when the tray opens. The precise number is on the chip under the portrait, which is what you look *at* rather than past.
  - **The handle takes as many favorites as it has room for, and no more.** The cap is gone — the five-item limit, the `Maximum Handle Favorites` setting behind it, the toast that turned the sixth item away, and the startup pass that quietly truncated the stored list. A fixed number was wrong in both directions at once: it cut a big statblock down to a fraction of its kit, and on a tall window it left an empty bar under the last icon. The strip measures itself after every render and every resize and hides what does not fit, so the column ends on a whole icon and grows when you grow the window. Auto-favoriting an NPC no longer discards what it cannot show either — the rest wait in the flag for a taller window.
    - Once one icon does not fit, everything after it is hidden too, even if it would fit alone. Hiding one pulls the next up into its place, so "does this fit" stops being a stable question after the first no — and a column that skips an icon to squeeze in a later one has silently reordered your favorites.
  - **The conditions button is one cell and carries the count.** It used to span both columns of the grid, spending an entire row on a button. It now sits in the grid like anything else with the number of active conditions as a corner badge — which it has to carry, because the grid shows as many icons as fit and "how many am I actually under" stops being answerable from the icons the moment the column runs out.
  - **Conditions pack two to a row** at half the column width. They are the group most likely to overflow and the one you most need to see all of, so they get the densest packing — and because the *group* is still full width, the column's edge stays unbroken.
  - **The character name is gone from the handle.** A rotated string spending the tallest element on the strip to tell you which token you just selected. The portrait answers that, and the tray's own header says it in full.
  - **Pin at the head, collapse caret at the foot** — the foot being where core Foundry keeps its own sidebar collapse control. The caret was briefly moved up beside the pin, on the argument that two controls doing the same category of thing shouldn't sit a screen apart; that loses to the stronger argument, which is that Foundry has already taught everyone where a collapse control lives, and moving it turns a control people know into one they have to find. Both are placed by DOM order now rather than by `order: 1 / 2 / 3`, so the template reads in the order it renders.
  - **The 180° rotation is gone.** The handle used to be authored bottom-up and flipped with `transform: rotate(180deg)` on the content wrapper, so the template read name → portrait → favorites → conditions and the screen showed the exact reverse, with every box inside reasoned about in a rotated vertical writing mode. That one trick is the common ancestor of the health-bar geometry bug, the writing-mode inheritance bug and the filter-compositing bug, all fixed separately above. The health bar is an ordinary horizontal bar under a portrait now, because with the rotation gone that is all it ever needed to be.
  - `SQUIRE.TRAY_HANDLE_WIDTH` is 60px, up from 42 — the handle is what stays on screen when the tray collapses, so that is what the collapsed transform and the `#ui-left` margin are measured off. Foundry's left UI sits 18px further right.
  - **A two-layout version of this was built and withdrawn before shipping**, recorded because the reasoning is worth keeping: the handle would have dropped to 46px and shown only the controls when the tray was open, on the argument that an open tray duplicates the handle. It doesn't survive contact. A *pinned* tray is open permanently, so anyone who pins gets the reduced handle forever; and the duplication was only ever true of favorites, since HP and conditions appear nowhere in the tray. The width change went with it — it was only ever paid for by the content change, and 18px of tray content does not buy an animated edge that has to stay in step with the tray's own slide. The duplicated favorites are accepted rather than solved, and may stop being duplication if the handle becomes a drag-a-favorite-here target.
  - Deleted with the old layout: the three separator variants (in a column this narrow every one rendered as "a line"), the rotated empty-state sentence, and `handle-health-tray.hbs` — a partial no template has rendered since the Health window moved to Blacksmith, along with the `#health-tray-button` click handler that had been waiting for it.
- **Squire requires Coffee Pub Blacksmith 13.19.0**, up from 13.12.2. The old floor was never true: Squire calls `api.inventory.registerTransientFlag` and depends on 13.19.0's stack-merge behaviour to keep identical stacks stacking. With the pin honest, the fallback to `api.compendiums.search()` in `utility-compendium-search.js` is gone — `searchDetailed()` has been there since 13.14.2, and it was the better call anyway, since dropping its report is what forced the truncation guess this file stopped making.
- **The tool windows take their base class from Blacksmith's bridge module** (`api/blacksmith-api.js`) instead of reading it off `module.api` at module scope. `extends` is evaluated when the file is evaluated, and `game` does not exist then; the read threw, ESM cached the failed evaluation, and the module stayed dead for the rest of the session rather than being retried. Squire had been working around that with a dynamic import and a throw-if-absent guard in each window. The guards are gone, the imports stay dynamic for lazy loading, and their comments now say which of the two reasons still applies.
  - Also removed: a `ready`-hook probe that tested `blacksmith.BlacksmithWindowBaseV2` and abandoned the entire tray setup if it was missing. Squire's windows no longer come from that surface, so the check could only ever produce a false negative — and the cost of a false negative was the user's tray.
- **The last of the adopted-tool residue is gone.** Blacksmith confirmed the Dice Tray, Macros, Health and Status Effects tools passed a live functional check with Squire disabled, and cleared us to delete our copies. Those copies went at the time of the move — what was still standing was everything that isn't code and so never failed loudly: hover rules for `#macros-toggle`, `#dicetray-toggle` and `#health-toggle`, panel-container rules for `dicetray`, `macros`, `experience`, `abilities` and `stats`, and two settings headings (`Menubar Configuration`, `Health Configuration`) rendering an empty section apiece. Squire registers no menubar tools at all now; the tray handle is where its tools live, because they are about the selected token.
- **The architecture docs describe the module that exists.** `architecture-squire.md` listed fifteen scripts that are not in the repo — `panel-dicetray.js`, `window-health.js`, `window-status-effects.js` and the rest of the adopted tools, plus the notes, codex and quest panels that went to Librarian in 13.7.0. Its Panels, Windows, Utilities, project tree, Menubar Tools and Pins sections are now checked against the file system rather than against memory, and the handle sections of `architecture-character.md` and `architecture-party.md` no longer promise stat blocks, a macros icon and a dice-tray icon that were removed with their settings.
- **Cleanup now checks that consolidating coins kept their value, instead of trusting that it did.** The before/after strip in the Cleanup window is Squire's own mirror of the conversion arithmetic; the write itself goes through dnd5e's `CurrencyManager`. Two implementations of one sum, and a homebrew denomination or a system change is all it takes to put them out of step — at which point the window would have promised "total value, unchanged" over a write that quietly changed it, and nothing downstream would ever have noticed a player becoming poorer.
  - The total is re-read from the sheet after the conversion and compared with the total before it. If they differ, the coins are put back exactly as they were, the step is reported as not applied, and both totals go to the console. Squire started that write, so undoing it is not a repair of someone else's data — the alternative is leaving a sheet in a state the GM never approved and cannot see is wrong.
  - Compared with a tolerance rather than for equality, because the ratios are floating point and a homebrew rate of 1/3 would fail an exact check while being perfectly correct. The tolerance sits far below one of the smallest coins, so a real loss cannot hide inside it.
  - The preview and the check share one function, `currencyTotal()`, so the safeguard cannot become a third opinion about the same arithmetic.
  - **No dry-run mode was added, deliberately.** The Cleanup window already *is* the dry run — it scans without writing, shows the actual plan, and applies only the rows left ticked. A separate `dryRun` path would be a second implementation of the write that nobody exercises in play, which is how a dry run ends up lying.
- **One hover colour, in one variable.** `--squire-color-hover` in `common.css` replaces six that had drifted apart — `rgba(231,91,1)`, `rgba(185,38,37)`, `rgba(181,80,57)`, `rgba(194,86,61)`, `rgba(255,100,0)` and Foundry's `--color-border-highlight` — two of which read as red rather than orange, so "the pointer is on this" looked like a different thing depending on which panel you were in. Sixteen declarations across nine stylesheets consume it: panel row icons, section and category header icons, filter chips, the search clear button, panel toggles, slot pips, the party card actions, the reputation adjusters, the party toolbar and the handle controls. Change it in one place now.
  - Deliberately left alone: state colours that mean something other than "hovered" (the lit lightbulb, the favourite heart, the statblock warning's amber) and hovers that fill the control and put white text on it rather than tinting an icon.
- **The handle's pin follows the tack idiom.** Lying at an angle means unpinned, upright and accented means pinned — which is what makes it readable at a glance rather than needing the tooltip. The angle is what carries the state, so the pin can share the accent colour with hover without the two becoming ambiguous: a hovered unpinned tack is orange *and* tilted, a pinned one is orange *and* upright.
- **The handle's two buttons hover in the shared accent** like every other icon in the module, rather than going near-white on their own.
- **`tray.css` is eight files.** It was 1,376 lines holding the tray shell, the heading bars, item rows, the control panel, the compendium browser, the view tabs, the party toolbar and the drag-and-drop states — the one file that had never been given a shape, and the one that kept surprising us. It is now `tray-shell`, `tray-headers`, `tray-item`, `tray-controls`, `tray-compendium`, `tray-tabs`, `tray-party-tools` and `tray-interactions`.
  - **The split is a pure move.** Every seam falls between rules and source order is preserved exactly. This was verified mechanically rather than by eye: a script flattens the whole `@import` graph into the ordered list of (selector, declarations) a browser would see and diffs it against the pre-split state — 461 rules, identical order, identical declarations. Every later edit was checked the same way, so the only differences in this pass are the ones described here.
  - **The import order is load-bearing** and is commented as such in `default.css`. Several rules depend on being read after ones in an earlier file; sorting the imports alphabetically would break them.
- **`!important` is down to nine, from thirty-five.** Five more went tonight, each only after checking what could actually compete: nothing anywhere sets `background` on `.section-header`; `.slot-pip.filled` is written above `.slot-pip:hover`, so order already decides the border colour; nothing sets `font-weight` on `.panel-item-name`; and the lit-lightbulb colours are (0,3,0) against a (0,1,1) rule they already beat.
  - The tray is `document.body.appendChild`, not inside a Foundry application window, so dnd5e's sheet-scoped rules cannot reach it — which is what made these safe to judge from source.
  - `.hidden { display: none !important }` is **earned, and now says so**: a (0,1,0) utility that has to beat `.squire-tray .tray-view-content { display: flex }` at (0,2,0). Without it, `.hidden` cannot hide a view.
  - The six on `.squire-tool-row-img` are left deliberately. The evidence says they are unearned too, but they sit inside a Foundry application window where other modules' CSS lands, and that is not a thing to change without seeing the window.
- **The collapse control is core Foundry's caret**, the same `fa-caret` glyph the sidebar uses, pointing out of the tray when closed and back into it when open.
- **The handle is a column of core Foundry controls.** 32px squares with a 4px gutter either side — Foundry's own control geometry — and Foundry's own palette variables rather than a hardcoded orange, so the handle tracks a theme change. Everything else in the strip fills the same column: the portrait, the party portraits, the condition and health-tray buttons, the health bar and the separators all size off one token instead of eight hardcoded numbers. Pinned reads as pressed — filled warm, like the active sidebar tab — and keeps that fill while you hover the button that would unpin it.
  - **Favourite icons went from 22px to 32px**, which is the smallest size the art actually reads at. Below that you were navigating the list by position rather than recognising anything in it. The handle favourites cap comes down to 5 to pay for the height — it is a space limit rather than a preference, so it is now the ceiling as well as the default, and worlds holding a larger number from before are clamped on read.
  - **The collapse caret moved to the foot of the handle**, where core Foundry keeps its sidebar's. The pin stays at the top, where people look for it.
  - **One class, `squire-handle-control`, owns the edge of everything you can click in the handle** — pin, caret, portrait, party portraits, favourites, conditions, the conditions and health-tray buttons, the health bar. Hover changes exactly one property: the border goes orange.
    - It replaces six rules that each drew their own edge and had drifted apart: the image icons drew a highlight border *and* a 1px ring in a second, slightly different red; the group buttons drew a soft 2px glow instead; the health bar drew a third variant on a 2px rim where everything else used 1px; the two buttons drew no border at all.
    - **They could not have been reconciled by editing them, because they were not the same shape.** `.handle-condition-icon` was a bare `<img>` with padding while every other image control was a `div` wrapping an `img` — a rule written for one physically could not apply to the other, which is why this resisted fixing for so long. The markup is uniform now, and one class can own the edge because there is finally one thing to own.
    - The click catch-all that decides "is this bare handle?" keys off the same class. It used to be a hand-maintained list of nine selectors that had to be updated whenever the handle grew a control; it can no longer fall behind the markup.
  - **Removed three sources of the doubled edge.** Inside every image control the `<img>` carried its own background, its own inherited `border-radius` and `object-fit: contain`, so non-square art letterboxed onto a dark ground with a slightly different curve than its container's — a second edge drawn inside the first. The health bar's fill had a 2px radius of its own inside the container's 4px one, drawing a rounded green rectangle inside a rounded dark one. And the `<img>` rule said `transform: rotate(inherit)`, which is not a legal value inside a transform function: invalid, dropped, and never doing anything — the image had been riding its parent's rotation all along.
  - **Orange means "the pointer is here", and nothing wears it at rest.** So pinned brightens rather than turning orange — a permanently orange pin was saying "you are hovering me" for as long as the tray was pinned. Unavailable favourites lost their bright rim for the same reason; the grey already says it, and it said it in the one place a rim means something else.
  - **What is deliberately *not* copied is the direction of the hover.** Foundry's controls float on the canvas, so it hovers them by darkening the ground and lifting the rim to a muted purple. Both are near-black-on-dark against our strip, so mirroring the values literally produced a hover you could not see. The ground now lifts toward the light instead of away from it — the same idea, inverted for the background it sits on.
- **Open, close, pin and unpin are one state machine** on `PanelManager` rather than five call sites each toggling `.expanded` and recomputing the `#ui-left` margin. They had drifted into disagreeing about what "open" meant, which is where the pinned-chevron warning came from.

### Fixed
- **The handle's health bar was squashed to 32x32 and its HP number turned upside down.** Self-inflicted, by the rule that gave every control in the handle's content wrapper one shared box: at (0,3,0) it out-specified the health bar's own (0,2,0) rule, so it imposed a 32px height and a 180 degree counter-rotation on the one control in the strip that is neither square nor rotated — it is 32x80 and orients its text with `writing-mode` instead. It is excluded from that rule now, by name and with the reason written next to it.
- **Three more rules that silently did nothing.** The same class of defect as the undefined `--tray-handle-width` and the invalid `rotate(inherit)` — found this time by linting for the pattern rather than by stumbling over it:
  - The handle's "subtle dots" texture was declared as `background-image` + `background-size` and then wiped two lines later by the `background` shorthand. It has never once rendered. Kept as a comment rather than deleted, since it was labelled "Option 1" — someone was choosing, and the choice is now visible instead of silently lost.
  - `.panel-containers` carried two `!important` declarations that were fighting *its own block*: `margin: 0`, four lines below `margin-top: 8px !important`, would have wiped the gap; the `border-radius !important` competed with nothing at all. It also declared `flex: 1` twice and said `overflow: hidden` then `overflow-y: auto`, which is the long way round of "the two axes differ". Same computed result now, none of the argument.
  - A party card's drop-target state declared `filter` twice, so `grayscale(50%)` was overwritten by `hue-rotate(290deg)` and never applied. Left out rather than merged into one filter chain, which would be a visual change nobody asked for.
- **Squire was overriding a core Foundry animation for every world that installed it.** `@keyframes` names are global — no scoping of any kind, last definition of a name wins for the whole document. `pulse` was defined three times in this module and a fourth time by core Foundry. Module CSS loads after core and `panel-party.css` loads last of ours, so panel-party's definition won everywhere:
  - Foundry's paused indicator (`#pause.paused`) asks for a subtle `scale(1.025)` and was getting `translate(-50%, -50%) scale(1.2)` instead.
  - Squire's own "NEW" badge asked for a gentle opacity fade and got the same displacement, throwing it half its own size up and to the left.
  - Every keyframe in the module is `squire-`-prefixed now, and the two identical copies of the death-skull pulse are defined once in `common.css`.

- **The "NEW" badge had padding it never asked for.** It was a bare inline `<span>` with vertical padding and no `line-height`, and an inline box paints its background across the *font's* content area — ascent plus descent — rather than across the glyphs. With all-caps text the entire ascender gap above the letters was painted as background on top of the declared 2px, so most of the "top padding" was never padding. It is built like `.panel-item-badge` now, the badge sitting directly beside it in the same row: `inline-flex`, `line-height: 1`, matching height. Its `border-radius: 15%` is 3px too — percentage radii resolve against width for the horizontal and height for the vertical, which on a box that small is an ellipse rather than a rounded corner.
  - The gap on its right was the newline between `{{/if}}` and the next element collapsing into a real space character, on top of the 4px margin `.panel-item-context` already had. Handlebars whitespace control removes it at all seven sites, so the spacing now comes from CSS alone. This also tightens the label-to-badges gap slightly when no NEW tag is present, which is the same 4px it was always meant to be.

- **Shared components are defined once instead of per panel.** Panels had drifted into each styling their own copy of things they share, so the same object could look different depending on which panel you were looking at — and fixing one never fixed the others.
  - **Portrait** — frame, health tint and death skull. The character panel and the party card each carried their own; the two overlays were byte-identical, differing only in the ancestor each was scoped to.
  - **Roll overlay** — the d20 that fades in over item art. The handle's was white on a half-black scrim and the panel rows' was blue on a much darker one; they now agree on white at 0.5, which dims the art enough to read the die against without hiding what you are pointing at. Only sizing differs per context.
  - **Badges** — the action-cost, component and quantity markers and the NEW tag are one object. The NEW tag being built differently from the badges beside it is exactly what let it drift into painting an ascender's worth of background as "padding".
  - **Headers** — the panel title and the category bar are the same bar at two volumes.
  - **Empty state** — `.no-character-message` and `.no-party-message` were byte-identical; both keep their name as a hook, the look is shared.
  - **Handle controls** — the box shared by the group buttons and the four image controls moves onto the control class. Scoped to the content wrapper on purpose: the pin and caret wear that class too but are siblings of the wrapper rather than children, so the counter-rotation that keeps controls upright inside it would have turned those two upside down.
  - **Party cards and control-panel toggles** — three near-identical card surfaces and two identical affordances, each stated once with only the real differences after it.

### Removed
- **`panel-control.css`** — an empty file that was still being imported.
- **A stylesheet, 27 dead rules and 13 unearned `!important` declarations.** Every deletion was verified as having zero references in any template or script first — and the verification mattered: three candidates that looked dead were live (`.hidden-by-*` is composed at runtime, `.blacksmith-window-tool-*` belongs to Blacksmith, `.window-content` to Foundry) and are all still there, with a comment on the first explaining why a search for it finds nothing.
  - `panel-favorites.css` was two drop-indicator rules for a favourites drag-reorder that no longer exists. The file and its `@import` are gone.
  - `@keyframes spin` and `@keyframes squire-completion-pulse` had no users.
  - `.squire-tray` was declared three times in thirty lines of `tray.css`, the third block restating every property of the first two at the same values. Two of the three did nothing.
  - The seven `!important`s on the party HP fill were fighting nothing — it is the only rule in the module that touches that element's geometry.
  - The five on the shared health colours only existed to out-weigh a `background: inherit` on the handle's own fill, which itself only resolved to the track's dark ground. Removing that declaration let all five become ordinary rules.
- **Dead rules in `handle.css`**, all verified as having zero references in any template or script: `.tray-handle-label`, `.handle-no-character`, `.tray-handle-content`, and the `.condition-details` dialog styling left behind when conditions moved to Blacksmith's Status Effects window.
- **Seven of the ten handle separator styles.** Solid, dotted, double and ridge in thick and thin, plus a bullet — of which templates have ever asked for three. In a 32px column all ten render as "a line". The three that are used now say what they are for: a gap, a rule between groups, and a rule between peers within a group.
- **The party/character toggle on the handle.** The tray has CHARACTER and PARTY tabs an inch away doing the same job; a third control that cycles between two things saves one click and costs a permanent slot in a one-control-wide column. The tabs remain the only way to switch, and `setViewMode` no longer syncs an icon that isn't there.
- **The Top Offset and Bottom Offset settings.** Two sliders spending settings-page real estate on a gap nobody moved off its default. They are `SQUIRE.TRAY_TOP_OFFSET` and `TRAY_BOTTOM_OFFSET` in `const.js` now, both 10px — one place to change if the tray ever needs to clear something. The stylesheet's own defaults said 70px and 300px, which had been dead numbers ever since the settings started overwriting them at startup; they now agree.
- The dead click-to-collapse affordance on the character panel — a `data-clickable` attribute and a pointer-cursor hover style advertising a listener that was bound to the wrong element and never fired.

## [13.8.1]

### Fixed
- **Tray filters compose instead of overwriting each other.** Search, the equipped/prepared filters and category collapse each wrote `item.style.display` outright, so whichever ran last erased the others' verdict. Searching for a weapon and then toggling the equipped filter wiped the search; the reverse ordering was worse, because a panel re-render ran its own filter first and `reapplySearch()` second, so the search un-hid rows the equipped filter had just hidden. Every source now toggles only its own `hidden-by-*` class and a row stays hidden while any one of them holds, which makes the filters mathematically incapable of clobbering one another.
- **Category headings are derived rather than stamped.** Search and category collapse both used to decide independently which headings survived, with the same last-writer-wins result — and the spells panel needed a second pass of its own because its headings are structured differently. One owner, `_updateHeadersVisibility()`, now works it out from row state for every panel, so the special case is gone.

### Added
- **A filter bar under the tray title, replacing the panel-toggle row.** Fourteen chips in three groups — five item types, five action-economy costs, and four availability buckets — all obeying one rule: *every chip names a bucket, a row hides when its bucket is off, and a row in no bucket in a group is untouched by that group.* The groups differ only in how completely they cover the rows, and that falls out of the data rather than out of behaviour anyone has to learn. They are the same control as the category filters in a panel heading — a bare glyph that dims when it is off — and are styled from the same rules rather than given a look of their own; the action chips use `fa-square-a` through `fa-square-p`, the same family as the spell-level filters' `fa-square-0` through `fa-square-9`. Every one of them is the same kind of control — a predicate over rows — which is what lets them share a row; the old row mixed section toggles with nothing else and the real filters lived elsewhere.
  - **A chip only judges rows that can answer it.** Prepared says nothing about a rope and Equipped says nothing about a spell, so those rows pass untouched instead of vanishing. This is recorded as the absence of a data attribute on the row rather than as a rule anyone has to remember to write.
  - **Item-type chips reach everywhere, favourites included.** Turning off Weapons hides weapons in the favourites list too, and the weapons panel collapses because nothing is left in it. Favourites is the odd one of the five — a flag rather than a type — so its chip hides only its own section.
  - **Items with no activation are selected by the Passive chip.** It is also what makes the action group a complete cover of every row, which is what lets that group start with every chip on and behave exactly like the item-type group beside it. Without it, "no chip lit" would have had to mean "show everything" — so all-off would have meant *nothing* in one group and *everything* in its neighbour, 4px apart and looking identical.
  - **Availability is four buckets rather than two toggles.** A toggle can only ever hide one side, so "what am I carrying but not wearing" and "what could I prepare that I haven't" were unaskable. Equipped, Unequipped, Prepared and Unprepared are chips like every other chip, all on by default, and the two pairs are separated in the bar because they are two questions rather than one group of four — which is also the scope shift-click solos within.
  - **Shift-click a chip to show only that bucket**, and shift-click it again to put its siblings back. With every group on by default, isolating one bucket otherwise means switching off its siblings one at a time, and "only bonus actions" is something you want mid-turn rather than after four clicks. Availability solos within its question: shift-clicking Equipped means "equipped rather than stowed" and says nothing about spells.
  - **Action chips don't persist, deliberately.** "What can I do this turn" is a question about this moment; logging in a week later to a half-empty sheet with one dimmed chip as the only clue is a bad morning. Item-type and Equipped/Prepared chips are remembered per user, as their predecessors were.

### Changed
- **Clearing all favourites asks first.** One click on the header icon emptied the whole list — panel favourites and handle favourites both — with nothing to undo it, from a row where every other control only changes what you're looking at. It now confirms, naming the character and the number of favourites, in the same shape of dialog the quantity editor uses before deleting an item.
- **The search box now sits below the filter bar.** The bar is the primary control surface and search refines what it leaves. In compendium quick-add mode the bar collapses and the search box moves up into the gap — that mode is a different place, not the same panel with things switched off.
- **A section a filter has emptied is suppressed outright, rather than left standing over a "no matches" line.** Asking for bonus actions means you want the bonus actions, not a tour of every section that hasn't got one — and in a tall narrow column, five headings over five apologies buries the one section that answered. The same applies to search.
  - Only when a filter is doing it. A character who simply owns no weapons still gets the "No weapons available" line, because that is a fact about the sheet rather than about the question asked.
  - Category collapse is deliberately excluded: those chips live inside the panel's own heading, so hiding the panel would take away the only control that could bring it back.

### Removed
- **The per-panel filter icons.** An equipped toggle inside weapons and another inside inventory answered the same question twice, and neither reached favourites — where, with every item kind in one list, the answer is most useful. Favourites' own four type toggles used the same four glyphs as the tray-wide row 40px above them, meaning something different; they're gone, and the panel honours the bar instead. Its header keeps its clear button.
- Seven settings that backed those controls (`showOnlyEquippedWeapons`, `showOnlyEquippedInventory`, `showOnlyPreparedSpells`, and the four `show*Favorites`), and the five `show*Panel` settings, replaced by `filterType*` and `filterState*`. No values are migrated — the chips start at their defaults.
- `FavoritesPanel._handleSearch()` — unreferenced, and written against jQuery on a native element, so it would have thrown if anything had called it.
- A second local copy of `getBlacksmith()` in `panel-favorites.js`, duplicating the one in `helpers.js`.
- The "No matches found" line in all five panels, its stylesheet rules, and `PanelManager._updateEmptyMessage()` — all unreachable once an emptied panel hides itself.

### Added
- **Favourites rows show what an item costs to use.** The action badge existed in four panels and not in the one list that mixes spells, weapons, features and gear together — so favourites, where "what can I do as a bonus action" is the most useful question, was the only place you couldn't tell. The badge is now a shared partial rather than a fifth copy of the same markup.
- Panel rows carry `data-action-types`, `data-equip-state` and `data-prepare-state`, which the filter bar reads. A row omits `data-equip-state` or `data-prepare-state` entirely when the concept doesn't apply to it — that absence is how a row tells a chip to skip it, so filtering by Prepared won't empty the weapons panel.

### Changed
- **One answer to "what does this cost to use", instead of four that disagreed.** Each panel had grown its own `_getActionType()`: spells called an activity-less item an Action, weapons did too but returned null for an activation type they didn't recognise, and features and inventory returned null. Harmless while the answer only picked a badge; as a filter, those disagreements decide what a chip shows. `getActionTypes()` in `helpers.js` is now the single source.
  - **Items with no activation are `passive` — a real answer, not a missing one.** A rope, a suit of armour and Darkvision genuinely cost nothing to use, and under the old code they fell into a gap no filter could reach.
  - **Long casting times no longer read as Actions.** A spell taking a minute or an hour used to show the "A" badge because `default:` swept it up with everything else. It now shows no badge, which is what it always should have done.
  - **Every activity counts, not just the first.** An item usable as either an action or a bonus action answers to both filters; its badge still shows the first, because a row has room for one.

### Removed
- `PanelManager.updateSearchVisibility()` — unreferenced since the panels grew their own `_updateVisibility()`, and one of the `display` writers this change exists to retire.

## [13.8.0]

### Changed
- **Chat cards are now composed from Blacksmith's parts rather than rendered from Squire's own template.** `templates/chat-cards.hbs` is deleted. It was a 505-line fork of Blacksmith's `cards-common.hbs` — same variant names in the same order, the same invalid `visibility: none` on line 1 — that had drifted 231 lines from its original, so every fix to a card in Blacksmith stopped at Squire's border. All 26 posting sites now call `chatCards.post()` and Squire writes no card HTML at all. Composition lives in one place, `scripts/manager-cards.js`, the way the template used to.
  - **Over half the deleted template was already dead.** The entire public half — planning start/paused/resumed, combat timer, round announcement, loot drop, movement change, leader change — was unreachable: nothing had set `isPlanningStart`, `isTimer`, `isLootDrop`, `isMovementChange` or `isLeaderChange` for a long time. It was carried forward untouched every time the file was edited because nobody had reason to check. Fourteen card types were actually live, all of them whispered.
  - **World names can no longer reach the enricher.** Item and actor names are renamed by users, so they are untrusted text, and the old template interpolated them straight into card HTML. An item called `Ring of *Power*` italicised the rest of the sentence; one containing `@UUID[...]` or `[[/r 99d6]]` was obeyed. Every name now goes through a literal — escaped, never read as marks or enricher syntax — and still renders bold, because a mark names a treatment rather than supplying markup. The sentences read exactly as they did.
  - **A card can no longer show anybody an empty body.** The old template gated blocks on `isTransferSender`/`isTransferReceiver` with no `else`, so a reader who was neither got a card with a header and nothing under it. Each of these messages is whispered to exactly one audience, so each now carries one unconditional sentence written for that audience — the failure is gone by construction rather than patched.
  - Themes are passed as ids rather than hardcoded `theme-green`/`theme-red` classes, so the cards look the same but the world's theme setting governs the ones that never had an opinion.
- **Request cards retire in place instead of vanishing.** Answering an Accept/Reject, Approve/Deny or ammunition/compendium request used to delete the message, which left whoever pressed the button looking at a gap and the log holding no record of the decision. The buttons are now replaced, on the same message, by a band reading **Accepted**, **Rejected**, **Approved**, **Denied**, **Expired** or **Failed**. The composition and the baked HTML are rewritten together, so chat search and exports agree with the table rather than keeping live buttons forever.
  - This also fixes the double-click guard. Disabling the buttons was a change to one browser's DOM, so a second client showing the same whisper still had live ones; rewriting the message takes them away everywhere.
- **Card buttons are registered once per client at startup, not wired onto each rendered message.** The transfer buttons were attached by walking every chat render for `.transfer-request-button` and routing through the party panel instance — so a transfer could only be answered while a tray happened to be open. They are now registered actions, resolved from Blacksmith's registry each time a card paints, which means they also work on cards already in the log and survive a browser reload.

### Fixed
- **A GM approving a transfer never sent the receiver their card.** The approval called `this._sendTransferReceiverMessage`, which does not exist on the party panel — it lives on `TransferUtils` — so the call threw every time and the transfer stopped dead after the GM said yes. It has been broken for as long as the method has been on the other class.
- **Anyone could accept a transfer addressed to somebody else.** The Accept/Reject handler trusted the whisper to decide who could press: but a whispered message is still a document on every client, so any player could invoke the action for a request meant for another character. The card already records who it was sent to, and the handler now checks that.
- **A player rejecting a transfer announced it to the whole table.** The rejection card is meant for the sender alone; the whisper list was chosen by a condition that path does not satisfy, so it came out `undefined` — which posts publicly rather than failing.
- **The "received via the Squire tray" card named the wrong character.** It reported whichever actor the tray was showing rather than the one the item was dropped on — the same actor only by coincidence.
- **A GM denying a transfer said so on their own screen but not on the player's.** The reason ("The GM denied this transfer request.") was passed to the socket and then dropped on the way into the card, so the sender saw a bare rejection with no explanation whenever the denial was routed through a GM.
- **A receiver rejecting a transfer read as third-person when a GM was the one relaying it.** The two paths posted different wording for the same event; both now say "You rejected the transfer of…" to the person who did it.

### Removed
- **The transfer expiration timer subsystem.** `_scheduleTransferExpiration` had no callers, so no timer was ever created and `_expireTransfer`, `_clearTransferTimer` and `_cleanupTransferTimers` formed a closed loop nothing could enter. Expiry still works — it is the timestamp check made when the button is pressed, which was always the live mechanism.
- `deleteTransferRequestMessage` (its last caller went with the retire change), both copies of `_getTransferCardData`, and the `TEMPLATES.CHAT_CARD` constant.
- An unreachable socket branch in the GM deny path, which sat behind a non-GM test inside a GM-only handler.

## [13.7.1]

### Added
- **Character sheet cleanup** — a broom in the Character Sheet title, beside the mode toggles. GM only, current character only. Phase 1 does the two things that cannot lose anything:
  - **Consolidates currency** to the fewest coins, via dnd5e's own `CurrencyManager.convertCurrency()` rather than a reimplementation — so homebrew currencies convert correctly and the result matches the sheet's own button. Value-preserving: the same money in fewer rows.
  - **Backfills `_stats.compendiumSource`** on items that have none, so an item records where it came from. Resolution goes through Blacksmith's `resolveMany` — one pack-index load for the batch, and it already owns the GM's configured search order, so Squire is not forming a second opinion about which compendium wins.
  - **A preview, not an "are you sure".** A yes/no on a bulk operation is the weakest useful safeguard, because nobody can evaluate a question that doesn't say what will happen. The window shows the actual plan and every row can be unticked; afterwards it becomes the receipt rather than closing behind a toast.
  - **Exact matches arrive ticked, looser ones don't.** A `startsWith` hit on "Potion of Healing" against "Potion of Healing (Greater)" is exactly the case that needs a person.
  - **An item that already records a source is never re-written**, even when the resolver is confident it knows better. A wrong link is worse than a missing one: merging duplicates (phase 2) will treat the source as identity.
- **Character sheet cleanup, phase 2 — merge duplicate stacks.** The same item recorded on three rows becomes one row with the quantities added up. Behind the same broom, in the same preview, and every group can be unticked.
  - **Identity is a fingerprint, not a field list.** A shared `_stats.compendiumSource` (which phase 1 backfills) is necessary but not sufficient — two copies of one compendium entry can still be different things. So both copies are serialised, the handful of per-instance properties are stripped (`_id`, `sort`, `flags`, `ownership`, `_stats`, `system.quantity`, and effect ids/origins), and **the rest must be byte-identical**. A field-by-field comparison can only catch differences somebody thought of in advance; this catches the edited description nobody thought of. The named fields exist only to explain a mismatch in English, never to decide one.
  - **Limited uses do not block a merge, with two exceptions.** Charges look like they should — one stack, one uses tracker — but dnd5e's own `consumeItemUses` decrements the quantity and resets `spent` when a stacked item runs dry, so for anything marked `uses.autoDestroy` uses are per-unit-of-quantity in the system's model and three fresh torches merge to exactly nine uses. What still blocks: items **without** `autoDestroy`, where nothing decrements the quantity and the stack really does share one tracker; and items that are **partly used**, because the sum is only exact from full — three torches at 1 of 3 spent hold 6 uses, but merged would hold 8, since only the first unit carries the spend. Inventing charges is a quieter bug than losing them, not a smaller one.
  - **Equipped state is the one field the fingerprint looks past.** A stack can be equipped — a handful of throwing daggers is one row, carried and thrown as one row — so refusing to merge an equipped copy with an unequipped one was wrong. It costs a rule to relax: the merged row has to be *given* an equipped state, and no answer preserves both copies. **Equipped wins.** The alternative would silently unequip somebody's weapon or armour, which is a far worse trade than losing "one of these was a spare" — a distinction a single row cannot express anyway. The plan row says "will stay equipped" so it is visible before Apply rather than discovered after. Nothing else is relaxed this way, and the cases where being equipped actually does something (attuned items, items carrying active effects) are refused outright regardless, which is what keeps the carve-out narrow.
  - **Active effects are refused outright**, because the loser's effects are deleted with it — and two *equipped* identical items fingerprint the same, so without the rule a merge would halve what the character actually has. **Containers are never considered at all**: each has contents, and merging two bags orphans a bagful.
  - **Anything skipped says why.** A "Duplicates left alone" section lists them with the reason — *one copy is equipped and another is not*, *they are in different containers*, *their descriptions differ*. Silently omitting them would make the window look like it had missed them.
  - **References are remapped to the survivor before the loser is deleted, not cleaned up after.** Deleting an item breaks every reference to its id, and favourites are the immediate casualty: Squire's `favoritePanel` holds raw ids and dnd5e's `system.favorites` holds `.Item.<id>`, so a merge that only deletes would silently unfavourite things — undoing the sync those two share. Order matters, because Squire prunes deleted ids on its own; remapping afterwards would find nothing left to move. `favoritesSyncState`, contained-item parents, and ActiveEffect origins are remapped too, and the survivor is chosen as a favourited copy where there is one, so the fewest references have to move at all.
  - **It can be undone.** Every stack involved — survivors as well as the rows removed — is written to a snapshot flag *before* anything else happens, so a failure halfway through still leaves a way back. Restoring re-creates the deleted items with `keepId`, which is what makes the undo complete rather than approximate: the ids favourites and effect origins pointed at come back too, so the restored favourites resolve. The undo is offered on every state of the window, not just the receipt — the moment somebody wants a merge back is rarely the moment they finished it.
  - **Every group is re-validated at apply time.** Equipping one copy between the preview and the click is exactly the kind of thing that makes two items stop being the same item.
  - **Players can request a restore too.** The undo was GM-only, which left a player able to ask for a merge and then unable to ask for it back — the half of the exchange that matters most when something looks wrong. They now see the same undo section, with the button reading **Request Restore** rather than Restore, and the GM gets the same approval popup the cleanup request uses. A restore is all-or-nothing, so there is nothing to tick: the popup states what would come back and when it was saved, and offers Approve or Deny. If the snapshot has since been used or replaced by a newer merge, it says so instead of pretending it can still be undone.
- **Restoring a merge ends the window rather than re-opening the plan.** It used to re-scan and render a fresh plan under the restore notice, which put **Cancel** and **Apply** directly beneath it — and in that position they read as "cancel the restore" and "apply the restore" rather than as a new cleanup. A restore now shows only what it put back, with a single Close; tidying again means opening the broom again. The scan is skipped entirely in that state, so the window is not building a plan nobody asked for either.
- **The window re-scans after applying and offers what that unlocked**, rather than making you close and reopen. Linking an item is what lets Squire tell whether it duplicates another, so the moment a pass finishes is exactly the moment there is new work to show — sending someone back round for something we already know is busywork. The receipt and the follow-up plan are now sibling blocks rather than two branches of one condition, and the plan's banner changes when it sits under a receipt: **"Nothing below has been done yet"**, because a fresh plan under a list of completed work would otherwise read as more things that already happened. The footer follows the same rule — it offers Apply while work remains and Close only when none does.
- **Players can run character sheet cleanup on characters they own — as a request.** The broom is no longer GM-only. A player gets the same window, the same preview, and the same tickable rows; what they do not get is a write. Applying sends the plan to the GM, whose primary button reads **Request Approval** rather than Apply so the difference is visible before the click.
  - Same reasoning as the ammunition request. Foundry would permit it — a player owns their character and could make every one of these edits by hand — but consolidating coins, rewriting item provenance and deleting rows in one click is a table decision, not a permissions one.
  - **The GM gets a popup, not a chat card**, and it is literally the same window: the same sections, rows and wording the player was looking at. A summary card would be a second description of the plan that could quietly disagree with the plan itself.
  - **The approval shows only what was asked for.** Rows the player left unticked are filtered out rather than shown unticked — otherwise "approve this request" turns into "do a cleanup", and the player would have no idea things they declined had happened anyway.
  - Review rows (the ones whose compendium entry has a different name) arrive **ticked** in the approval, unlike on the player's own plan. The player already made that judgement; the GM is confirming it, and an unticked row would read as rejected before they had looked.
  - Closing the approval without answering counts as a refusal — the player is waiting either way, and silence is the one outcome that helps nobody. Ownership is re-checked when the request arrives, so a character reassigned between the send and the answer drops the request rather than applying it.
  - Gated on `actor.isOwner`, not on "is a player": the tray follows canvas selection, so without it a player able to select another character's token could propose changes to it. New **Players Can Request Cleanup** setting, on by default.
  - The undo stays with the GM. It writes to the actor, and inside an approval window it would be answering a different question than the one on screen.
- **Inventory warnings for player characters.** A character whose weapon has no usable ammunition now gets the same warning badge NPCs do — the owning player sees it on their own characters, and clicking it **asks the GM** rather than adding anything. The GM gets a whispered Approve/Deny card, the same shape as a compendium add request, because it is the same decision: whether this character may have this equipment now. New **Inventory Warnings** setting, on by default.
  - Deliberately not "let the player fix it". Foundry would allow it — a player owns their character and could create the arrows themselves — but restocking is a table decision, not a permissions one. The GM may want them to have searched the area, or to have stocked up before the fight.
  - **Ammunition only.** The spell-slot check asks "can every known spell be cast right now", which for a statblock means it is broken and for a character is routine — a wizard scribes spells above their casting level, a multiclass or a feat grants one with no matching slots. It would fire constantly and teach people to ignore the badge.
  - **Never auto-repaired.** `statblockAutoFix` exists to save the GM doing at the table what they would have done while building a statblock; on a player character the same write invents equipment nobody acquired, and it would happen the moment their tray opened. It is now NPC-only.
  - Only characters the player **owns** — the tray follows canvas selection, so without that a player who can select another PC's token would see a badge about someone else's quiver.
  - The badge clears as soon as the ammunition lands, on the player's screen as well as the GM's. Panel refreshes are keyed on "which panels does the changed item appear in", which is right for the item's own row and wrong here: an ammunition warning hangs off the **weapon**, so restocking arrows changes a consumable while the stale badge sits on a bow. Neither the weapons panel (arrows aren't a weapon) nor favourites (arrows aren't favourited) would re-render, and the warning survived until the tray was rebuilt.
  - Approval re-detects the problem and re-checks ownership before writing, so a request that has been sitting in chat cannot restock a character who has since bought arrows, or one reassigned to someone else in the meantime.
- **The tray shows the same item cards the character sheet does.** Hovering an item in Favourites, Inventory, Spells, Weapons or Features — or a favourite on the collapsed handle — brings up dnd5e's own rich tooltip, with the full statblock and description.
  - No sheet internals are touched. dnd5e's tooltip layer is declarative and application-agnostic: it fires for any tooltip whose content is a `.loading[data-uuid]` placeholder, resolves that uuid and swaps in the document's `richTooltip()`. Squire sets three dataset attributes and the system renders the card, so it stays correct when dnd5e changes what a card contains.
  - The card attaches to a new `.panel-item-label` span around the item's words. Its parent `.panel-item-name` is `flex: 1` and spans the whole row, so hanging the card there fired it from anywhere except the icons — the same behaviour as putting it on the row, which was the thing being avoided.
  - That span also gave the search a precise thing to read. Three places asked for "the item's name" three different ways: one stripped every child element from `.panel-item-name` to shed the NEW and quantity badges, and two read the container's text and matched the badges along with the name — so searching `new` matched every recently added item. All three now call `getPanelItemName()`, which reads the label.
  - The handle's favourite icons had a hand-built tooltip — a long template expression re-deriving spell/weapon/equipment/feat details. The system card replaces it where dnd5e can do better, and the old one is left as a fallback: `module.json` does not declare dnd5e as required, so Squire must not lose its tooltips under a system that has no `richTooltip()`.
  - Cards open **rightward**, since the tray is pinned to the left edge; dnd5e's sheet defaults leftward for the mirror-image reason.
- **Squire's favourites now sync with the dnd5e character sheet's**, both ways. Favourite something in the tray and it appears on the sheet; favourite it on the sheet and it appears in the tray. On an actor that has never synced, the two lists are merged; after that, each side's changes are honoured — including removals.
  - It is a **three-way merge**, not a union. With only two lists in hand, "they differ" does not say which side moved: an item in Squire but not on the sheet is either a Squire addition or a sheet removal, and guessing wrong undoes a real edit. Each sync records the agreed list in `favoritesSyncState` and the next one diffs both sides against that ancestor. `testing/test-favorites-merge.py` pins the cases that are indistinguishable by inspection.
  - **Squire wins on order, not on membership.** Order is the only thing the two can genuinely disagree about; for membership there is no conflict to arbitrate, since "still has it" is the absence of an edit rather than a competing one. Resolving removals in Squire's favour would have made unfavouriting on the character sheet impossible — the item would reappear on the next sync.
  - **Activities, effects and resource favourites are carried through untouched.** They live in the same `system.favorites` array as items, and Squire has no concept of any of them; rebuilding that array from Squire's item list alone would silently delete data Squire never owned and could not reconstruct.
  - Character actors only — `system.favorites` is a character-sheet field, so NPCs have nothing to sync — and only for actors you own, since both halves are actor writes and a half-applied sync is worse than none.
  - A sync that changes Squire's list repaints the tray. Nothing in the tray watches the favourites flag — the heart icons live in four other panels and on the handle — so the writer has to say so. `manageFavorite` did this inline; that block is now `FavoritesPanel.refreshFavoritesUI()` and both writers call it.
- **Party reputation, in the Party tab.** Blacksmith owns the value; Squire shows it with the thing that makes it readable — **the scene it belongs to.** Reputation is stored per scene (`blacksmithPartyData.scenes[id].reputation`), so a bare number invites the assumption that it is campaign-wide. The readout shows the scene name, the band label (Neutral, Respected, Revered…), and the value. The bar is a **balance, not a progress bar**: the track carries the whole −100..+100 spectrum and a triangle marks where the party sits, because a left-anchored fill implies reputation accumulates from nothing when its resting state is the middle. The centre is gold rather than a straight red-to-green ramp: that ramp puts muddy orange at zero, and a bright yellow would read as traffic-light "caution" — a mild kind of bad — when neutral means no opinion either way. Pitched near the tray's own `#9f9275`, it reads as absence instead. The three band colours are `--squire-rep-hostile` / `-neutral` / `-friendly` if you want to retune them. GMs get **−5 / −1 / +1 / +5** controls; `setPartyReputation` is GM-only in Blacksmith, so players get the readout rather than buttons that would silently do nothing. Clicking the readout posts the current standing to chat.
  - It stays in step with Blacksmith's own bar in both directions, via the `blacksmith.partyReputationChanged` hook they added for this. The payload is deliberately ignored: its `sceneId` is always the *active* scene, so changing reputation for a scene nobody is viewing still reports the active one. The tray only ever shows the active scene's standing, so re-reading is correct where trusting the payload would be correct only by luck. The panel also re-reads on scene change.
- **A Vote button** in the Party toolbar, opening Blacksmith's vote window. Shown to the GM and the party leader.
- **Deploy Party and Clear Party** buttons, using `api.deployParty()` and `api.clearPartyFromCanvas()` (Blacksmith 13.16.1+). Blacksmith keeps the GM guard inside the functions and returns an empty result rather than throwing, so Squire adds no second guard that could drift out of step — it simply does not render the buttons for non-GMs, or against a Blacksmith too old to have them.

### Changed
- **Squire's tool windows share one set of components instead of each inventing its own.** Transfer and Cleanup had grown two separate implementations of the same idea — a section with a heading, and a clickable row with a picture, a name, and something on the right — which had already drifted apart in padding, corner radius, and type size. There is now one `styles/window-tool-shared.css` defining `.squire-tool-section`, `-row`, `-row-select`, `-count`, `-coins`, `-total`, `-flag`, `-note` and `-banner`, and both windows consume it. The measurements match Curator's Loot window, which is the house reference for this shape. It belongs in Blacksmith next to `.blacksmith-list` so every module gets it; that ask is recorded in the TODO.
- **Both tool windows are resizable, and neither can grow to fill the screen.** They opened at `height: auto` with `resizable: false`, so a sheet with forty unlinked items produced a window as tall as the monitor and no way to drag it smaller. They now open at an explicit height, are resizable, and cap at `100vh - 80px`. An explicit height is the point: `auto` plus a `max-height` lets the cap silently refuse the drag. The scroll chain (`window-content` → tool root → tool body, each allowed to shrink) is part of the shared stylesheet, so a window only has to opt in with the `squire-tool-window` class.
- **The interface is no longer set in italics.** Italic was carrying whole paragraphs of explanatory copy in the Cleanup window, which is where it is least legible; it is now reserved for the odd word.
- **Cleanup's `EXACT` / `STARTSWITH` tags are gone.** They were bordered, filled rectangles that read as buttons, and they published the resolver's internal tier names — an implementation detail the GM had to learn in order to read their own sheet. The rows are now split into two labelled runs: the ones whose compendium entry has a different name, which lead and arrive unticked, and the ones matched by exactly the same name, which follow and arrive ticked. What was a tag is now the heading that explains the tick.
- **Cleanup's checkboxes are drawn, not restyled.** The native input is visually hidden and the box is a plain span. Overriding the input in place meant competing with Foundry's own checkbox rules, and Foundry styles `:checked` separately — so ticked and unticked ended up different sizes with different fills. As one span, the two states are the same element at the same size, differing only by a border colour, a faint tint, and the tick. Selection also paints the row, driven by `:has(input:checked)` rather than a JS-applied class — the approach Blacksmith's own entity list uses, and for the same reason: a class can drift out of step with the input, a `:has()` cannot. The tick and the box use `--blacksmith-color-brand-accent`, **not** `--blacksmith-tool-accent`: the latter is a *text* colour that resolves to `#2f241a` under the Light theme, so using it for borders drew a near-black box on every ticked row and turned a 200-row list into a wall of boxes. Blacksmith's own `window-tool.css` flags the same trap. A ticked row now takes a faint wash and keeps its transparent border — ticked is the resting state for most of the list, so it must not shout.
- **Clicking a row no longer leaves a hard outline around it.** The focus ring was on `:focus-within`, which fires on every mouse click, because clicking a `<label>` focuses the input it wraps. It is now `:has(input:focus-visible)` — a checkbox focused by pointer does not match `:focus-visible`, so the ring appears on Tab and not on click.
- **Transfer puts Party and NPCs in separate sections**, the way the Loot window separates Items and Currency, rather than running both under headings inside a single box. They are two entity lists sharing one input name, so radio grouping still makes the choice a single recipient across both.
- **Cleanup shows the money.** The before/after coin strip rendered every denomination on both sides, so denominations that were not changing looked like they were; it now marks only the ones that move. And the window states the **total value**, unchanged before and after — "same money, fewer coins" is a claim, and a claim nobody can check at a glance is worth nothing.
- **Cleanup says there is no undo, and to back up first.** Phase 1 cannot lose anything, but it also cannot be reversed: a consolidated coin split is not recoverable from the total, and a written source is afterwards indistinguishable from one that was always there. Telling someone an operation is safe without telling them it is one-way is the half of the truth that gets them burned, so the banner now says to duplicate or export the actor before applying.
- **Cleanup says what linking is for.** It was the most consequential thing in the window and the least explained. An item dragged onto a sheet is a copy that keeps no record of what it is a copy of, which means it can never be repaired: if the entry behind it is edited, renamed, or deleted, it is stranded with whatever it happened to hold that day. Recording the link is what lets it be refreshed from the compendium later. The window also says plainly that nothing is replaced now — this only writes the link.
- **Cleanup names compendiums the way the sidebar does.** It was printing pack ids: `dnd-players-handbook.feats` is a key, not a name anybody chose, and it is not enough to judge whether a match came from a book you trust. It now reads "D&D Player's Handbook · Feats".
- **"No compendium match" has a denominator and a breakdown.** "30 items could not be found" gives no way to tell whether that is fine or alarming; it now reads *30 of 47* and lists what they are, because seeing that they are class features and species traits is what makes it obviously fine.
- **Warning text adapts to who is reading it.** "…but this creature has none" is right for a GM auditing a monster and wrong for a player looking at their own character; it now says "you have none", or names the character when a GM is looking at someone else's. The badge heading reads *Inventory Problem* on a character and *Statblock Problem* on an NPC, and a player's badge offers "Click to ask the GM" rather than promising a fix its click will not perform.
- **`StatblockUtility`'s single permission gate became three** — may this user *see* problems, may they *repair* them, may they be repaired *unattended*. For an NPC all three collapse to "GM, warnings on"; for a player character they come apart completely, and conflating them is how a GM authoring aid ends up writing to a player's sheet.
- **The party-leader check asks Blacksmith** (`api.isCurrentUserPartyLeader()`) instead of reading its `partyLeader` setting and reimplementing the test. The reimplementation agreed with theirs by coincidence, not construction, and would have diverged the next time that shape changed. Their wrapper takes no arguments deliberately — the internal version has a `moduleId` parameter that returns a silent `false` if a caller passes its own id.
- **"Award" is now "Experience"**, and opens Blacksmith's XP distribution window instead of the dnd5e Award dialog. The old handler reflected over four possible paths to the Award class (`game.dnd5e.applications.Award` and three fallbacks) and guessed the party from controlled tokens; Blacksmith owns XP and decides its own recipients.
- **The Party toolbar no longer wraps.** Every button had `flex: 1`, so three of them split the row three ways and "Select Party" broke onto two lines. It is now one labelled primary action with a right-aligned rail of fixed-width icon buttons: only the primary carries a word, so the row cannot wrap however many tools end up on it, and the rail grows leftward into empty space rather than squeezing the label.
- **The MVP leaderboard shows every party member**, including those with no recorded combats — dimmed, sorted last, with dashes instead of zeroes. It was filtering them out, which made the board answer "who has scored?" when the question it is asked is "how is the party doing?" A character silently missing from the roster reads as a bug.


### Removed
- **Notes moved to Coffee Pub Blacksmith.** Squire is now character and party — the tray, the handle, and the panels that describe the token you have selected. Nothing else.
  - **Run Blacksmith's notes migration before updating.** Note pages are plain journal pages with no document subtype, so unlike the codex move there is no validation cliff: an unmigrated world loses the tray's view of its notes but the pages themselves are untouched and Blacksmith can adopt them at any point.
  - Notes was the last tenant of Squire's journal/pin substrate, so the substrate went with it: `panel-notes.js`, `window-note.js`, `utility-notes-parser.js`, `utility-base-parser.js`, `utility-journal.js`, `manager-pins.js`, `campaign-panels.js`, `window-campaign-browser.js`, two templates, four stylesheets, and `pin-defaults.json`.
  - **Squire no longer uses Blacksmith's Pins API, and no longer watches journals at all.** Five journal hooks and four native ones went, including the note metadata box embedded in the journal page sheet and the `blacksmith.pins.resolveOwnership` responder.
  - Six settings removed: `notesJournal`, `notesPersistentJournal`, `notesGMJournal`, `notesSharedJournalPage`, `notesWindowPosition`, `headingH3NotesConfiguration`.
  - The transfer tool loses its **`note` mode** — "Give Note", and the user-recipient list that only note transfers used. Item transfer and transfer approval are unaffected.
- **Five dead exports.** `escapeHtml` was orphaned by this change; `fillCampaignPlaceholders` and `showBlacksmithWait` had been dead since the codex removal, and `MULTI_SELECT_DELAY` / `SINGLE_SELECT_THRESHOLD` longer than that. Found by sweeping every export for a consumer rather than by reading.



## [13.7.0]

Squire is now character, party and notes. Quests and Codex both moved to
**[Coffee Pub Librarian](https://github.com/Drowbe/coffee-pub-librarian)** in this release.

> **Upgrading a world that used them: install Librarian and run its migration macros FIRST.**
> `macros/migrate-quests-from-squire.js` and `macros/migrate-codex-from-squire.js`, with both
> modules enabled, each defaulting to a dry run. The codex one matters most — Squire no longer
> declares the `coffee-pub-squire.codex` page subtype, so an unmigrated world will fail
> validation on every codex page. Those pages are refused, not damaged: migrating (or
> re-enabling Squire 13.6.1) brings them back.

### Added
- **`testing/preflight.py`** — a static pre-flight run from the module root before loading a world. It checks that every script parses **as an ES module**, that every manifest path exists, that every static and dynamic import resolves *and* that the target actually exports each named binding, and that every stylesheet `@import` and `modules/coffee-pub-squire/...` asset path resolves on disk. It exists because this class of mistake has shipped a broken build twice. Note it checks a `.mjs` copy of each file: `node --check foo.js` parses as CommonJS *script* and accepted a real `SyntaxError` that broke the world at load — checking the `.js` directly is worse than no check, because it reports success.
- **`coffee-pub-librarian` is declared as a recommended module**, so Foundry surfaces it where Quests and Codex used to be.

### Fixed
- **Squire no longer recommends itself.** `coffee-pub-squire` was in its own `relationships.recommends` list — a copy-paste artifact that offered users a module they already had installed.

### Changed
- **`testing/preflight.py` skips `_backups/` and other ignored directories.** It was scanning gitignored scratch copies and reporting their stale asset paths as failures — a false positive is as corrosive to a pre-flight check as a false pass.

### Removed
- **Codex moved to Coffee Pub Librarian**, following Quests. Squire is now character, party and notes.
  - **Run Librarian's `macros/migrate-codex-from-squire.js` with both modules enabled before updating.** This migration is not like the quest one: codex pages are a declared document subtype, so it rewrites `type` on live documents from `coffee-pub-squire.codex` to `coffee-pub-librarian.codex`. It updates in place so page ids — and the `codexUuid` every codex pin references — survive, force-replaces `system` in the same update so entries are not reset to model defaults, and backs both up in a flag so it can be reverted.
  - **`documentTypes` is gone from Squire's manifest.** Any world that has not migrated will find its codex pages failing validation once this ships, one error per page. The pages are refused, not damaged, and re-enabling an older Squire or running the migration restores them.
  - Removed here: `panel-codex.js`, `window-codex.js`, `utility-codex-parser.js`, `utility-resolver.js`, `window-data-export.js`, the codex page model and sheet, five templates, three stylesheets, the codex half of `manager-pins.js` and `manager-notifications.js`, the codex browser-window kind and menubar tool, and the `codexJournal` setting — about 1,000 lines.
  - `initTransientNotifications()` and `recordCreatedPageBaseline()` went with it: both existed only to snapshot codex visibility, and had nothing left to track.
  - `utility-base-parser.js` and `utility-journal.js` **stay** — the Notes panel still uses both. They move, or dissolve, when Notes goes to Blacksmith.

- **Quests moved to Coffee Pub Librarian.** Quests are campaign knowledge, not character sheet, and they belong beside the Codex rather than beside inventory. Librarian now owns the quest log, the single-quest editor, the parser, and the quest/objective pins; Squire's copies are gone. A migration macro shipped with Librarian copies the journal setting, the categories, the per-page and per-user quest flags, and re-stamps every existing quest and objective pin — **run it with both modules enabled before updating Squire**, or the pins stay addressed to a module that no longer claims them.
  - Removed here: `panel-quest.js`, `window-quest.js`, `utility-quest-parser.js`, four templates, three stylesheets, the quest half of `manager-pins.js`, the quest notifier, the quest browser-window kind, the quest settings, and the quest tooltip and task helpers — about 2,300 lines.
  - Settings removed: `questJournal`, `questCategories`, `headingH3QuestConfiguration`, and `pinStrokeMigrationDone` (a one-time quest-pin repair that had nothing left to repair). `autoAddPartyMembers` went too — it was registered but never read by anything.
  - The codex list and the codex pin-placement cursor turned out to be borrowing quest CSS class names, so removing the quest stylesheets would have silently un-styled the Codex. They were given their own; those rules have since travelled to Librarian with the codex itself.


## [13.6.1]


### Changed
- **Health percentages come from Blacksmith too.** Squire divided `(value / max) * 100` in four places that disagreed at the edges — one guarded `max > 0`, one clamped, two did neither and rendered `NaN%` for an actor with no max. All four now use `getHealthPercent` / `getHealthPercentForHP`, so Squire's bars and Blacksmith's windows cannot draw the same actor differently. An actor with unreadable HP now reads as unknown rather than as a corpse: the severity call is passed raw values instead of coercing a missing one to zero, which is what used to make it report `dead`.
- **The tray handle now refreshes when conditions change, whoever changed them.** It used to be told, by three `updateHandle()` calls inside Squire's Status Effects window — so a condition toggled from the token HUD, the character sheet, or another module left the handle stale until something else rebuilt the tray. It now reacts to Foundry's `createActiveEffect` / `deleteActiveEffect` / `updateActiveEffect` for the current actor, which is both more correct and what lets the Status Effects window move to Blacksmith without carrying a Squire dependency.
- **The Status Effects window moved to Blacksmith too.** Conditions are a Foundry concept, not a character-sheet one, and any module holding a token can want the editor. Squire keeps the handle's condition icons and the conditions panel — the display — and opens Blacksmith's window for editing. The `blacksmith-status-effects` id Squire briefly claimed is gone: Blacksmith registers it natively, so the Health window's conditions button is now an ordinary call rather than a slot waiting for a satellite to fill it.
  - It no longer refuses to open without an actor, follows canvas selection when no actor is named, and retargets rather than rebuilding when reopened — so clicking a second condition icon no longer flashes the window closed.


## [13.6.0]

### Changed
- **Quests, Codex, and Notes moved out of the tray into their own windows**: each is launched from the Blacksmith menubar rather than a tray tab. They are campaign content — they describe the world, not the selected token — and the tray is about the token you have selected. The tray now carries Character and Party only.
  - The panels were **re-hosted, not rewritten**. They were always `render(hostElement)` classes that look for their own container inside whatever they are given; the tray was one such host and a window is another. Their stylesheets moved from `.squire-tray[data-position="left"]` to `.squire-panel-host[data-position="left"]`, a class both hosts carry, so one set of rules still serves both — 304 rules, same specificity, no duplicated stylesheet.
  - Reaching a panel no longer means reaching through the tray. A new registry (`campaign-panels.js`) replaced 21 `PanelManager` lookups across 8 files: callers ask for a *kind*, and whichever host is showing it supplies the element and decides what "reveal" means. Clicking a quest, codex, or note pin now **opens** the relevant browser if it isn't already open, instead of doing nothing.
  - **Campaign code now makes no calls into character UI at all.** The one apparent exception, the pinned quest on the tray handle, turned out to be dead: neither `handle-player.hbs` nor `handle-party.hbs` has rendered it since the handle was simplified, so `_getPinnedQuestData`, its cache, a click handler and two handlers bound to a class that no longer exists were all removed — `manager-handle.js` lost 205 lines and four unused imports.
  - Removed with the tabs: the `showTabNotes` / `showTabCodex` / `showTabQuests` settings, the Notes/Codex/Quest entries in Default Tab and view mode, and the three `handle-*.hbs` partials. A client whose saved view mode was one of the removed tabs falls back to Character on load.
- **The tray's first tab is now called "Character"** rather than "Token", and its tooltip matches. The stored value is unchanged, so nothing needs reconfiguring.

### Added
- **Transfer recipients are grouped and named properly**: the recipient list is split into **Party** and **NPCs** sections, sorted alphabetically within each, using each token's own name and artwork. Grouping is a new optional `group` field on Blacksmith's shared entity list, so it is available to every consumer rather than faked here.
- **Macro favourites show their own artwork** in the menubar list instead of a column of identical play triangles, falling back to the triangle when a macro has no image.

### Fixed
- **Quest and codex cards would not expand once a browser window was open**: a panel keeps one `AbortController` and aborts it on every render, so with both the tray and a window hosting the same panel instance, whichever rendered last silently killed the other's event listeners — the markup stayed and the interactivity did not. Only one host renders a given panel now.
- **Deprecation warning on every pin click**: the browser windows called `bringToTop`, which v13 shims to `bringToFront` and logs about. They call the current name where it exists.
- **Party panel health shortcuts threw instead of opening the Health window**: both the "select the party" button and a click on any party member's HP bar called `healthPanel._onPopOut()`, which stopped existing when Health became a standalone window — `_onPopOut is not a function`. Both call sites now use `openWindow()`, and force the token update so the window cannot show a stale selection.
- **Dragging an item off an unlinked token copied it instead of transferring it**: the drop classifier tested `data.uuid.startsWith("Actor.")`, but an item on an unlinked token is `Scene.x.Token.y.Actor.z.Item.i` — it contains `Actor.` without starting with it. Any NPC token's item was therefore classified as a *world item*: created on the target, left on the source, and past every transfer guard on the way. A packed sack arrived with none of its contents and the original stayed put. Both classifiers now match `/Actor\.[^.]+\.Item\./`.
- **The container guard sat too far forward.** It ran at the drop handlers only, so any path reaching the mutation directly skipped it — the same shape as the quantity bug fixed in 13.5.2. It now also runs inside all three `_completeItemTransfer` copies, where it cannot be routed around.
- **Chat cards and toasts showed the prototype name for token actors**: `actor.name` on a synthetic actor is the prototype's, so every NPC reported itself as "Cultist". New `getActorDisplayName()` asks a synthetic actor's own TokenDocument; linked actors keep the sheet name rather than picking arbitrarily among several placed tokens.
- **Transfer chat cards did not match Blacksmith's**: ours used `class="section-header"` where Blacksmith's cards use `class="card-header"`, so the theme applied but the header typography never did. All 27 headers corrected.
- **One transfer produced up to three chat messages**: a "you sent" card, a "you received" card and a GM copy, so every GM read the same event three times. Now a single card whispered to both owners and the GMs, using wording that reads correctly for all of them. `transfer-utils.js` already did this; the panel copies had drifted.
- **Every Cultist on the scene was disabled as "the source"**: the transfer tool compared `actor.id`, and unlinked tokens from one prototype share the base actor's id. Compared on `uuid` now, so only the actual source is greyed out.
- **Objective and quest pins could be placed repeatedly**: the panel re-rendered immediately after placing, but `pins.list()` is served from a cache the create has not landed in, so the icon still read "unpinned" and another click placed a duplicate. Both placement and both unpin paths now reload the pin cache first.
- **Placing a pin for a hidden objective looked like a failure**: it is created hidden, correctly, but nothing appeared on the canvas and the toast said only "Objective pin placed." Both placement paths now say when a pin was created hidden and where to find it.


### Removed
- **The Dice Tray, Macros, and Health windows now live in Blacksmith.** They were hub tools sitting in a character module: none of them is about the selected token in the way the tray is, and two of them booted the entire tray just to read one actor. Blacksmith adopted the settings and macro data before Squire's copies were deleted, so nothing needs reconfiguring.
  - Removed here: six scripts, three templates, five stylesheets, three menubar registrations, three window registrations, and roughly 2,000 lines of panel wiring inside `PanelManager` — including a 109-line block that reattached open windows across actor switches, which existed only because the windows belonged to a tray that rebuilt itself.
  - Ten settings removed. Moved to Blacksmith: `diceTrayShowRecentRolls`, `userMacros`, `userFavoriteMacros`, `showHealthMenubarTool`, `healthAdjustmentAmount`, and the three health thresholds. Dead and simply deleted: `showMacrosPanel`, `showHealthPanel`, `showDiceTrayPanel`. `showHandleHealthBar` stays — it drives the handle, not the window.
  - **`userFavoriteMacros` is client-scoped**, so it lives per browser. A user on a second machine sees an empty favourites list there, as they did before; no migration on either side can change that.

### Changed
- **These windows now follow canvas selection**, with `game.user.character` as the fallback, rather than the tray's current character. The visible difference: opening an actor sheet no longer re-points the Dice Tray. Squire's tray keeps its own behaviour — sheet opens still re-point *it*.
- **Health thresholds now govern more than Squire's bars.** Because the thresholds moved with the window, a customised threshold changes Blacksmith's combat bar rings and canvas blood indicators alongside the health bars. They previously disagreed.
- **Health colours come from Blacksmith.** The handle and party panel now ask `getHealthSeverityForHP()` and map the result to Squire's own `squire-tray-healthbar-*` classes, so the thresholds are configured in one place. Two consequences: a new `hurt` band (damaged but above Injured) maps to healthy so appearance is unchanged, and threshold boundaries are now inclusive — a creature sitting exactly on the bloodied threshold reads as bloodied, where the old comparison put it one band lighter.
- **Squire's health bars open Blacksmith's Health window, showing the token you clicked.** The handle's health bar, a party member's bar, and the party panel's health button each pass their tokens to `openWindow('blacksmith-health', { tokens })` rather than selecting tokens on the canvas to make the point. Clicking a health bar no longer changes what you have selected. The set isn't sticky by design — the next canvas selection takes over, since the window resumes following the user.
- **Renamed `_updateHealthPanelFromSelection` to `_updateTrayFromSelection`.** Re-pointing the tray was always the part that mattered; the health update was the part that left.

## [13.5.3]

### Added
- **`isNew` is declared as a transient flag to Blacksmith**: Squire calls `inventory.registerTransientFlag('coffee-pub-squire.isNew')` on ready, telling Blacksmith's stack-merge predicate that the flag carries no identity. Without it, an item Squire has stamped and an identical one it hasn't compare as different documents, so identical stacks merge or don't depending on timing — and no other module can compensate, since none of them know Squire stamps items at all. Optional-chained, so it is inert until a Blacksmith build with `api.inventory` is installed.

### Fixed
- **Every item creation, not just transfers, stops colliding with dnd5e's encumbrance effect**: 13.5.2 fixed Squire's own six creation call sites by putting the arrival flag in the create payload. The generic `createItem` hook still stamped **every** item created on an owned actor with a follow-up `setFlag`, so any module or system action creating items on a loaded actor could still produce `The _id [dnd5eencumbered0] already exists` — one rejection per document created, not per call. Found by Blacksmith's harness after the transfer-path fix landed.
  - The flag is now injected at `preCreateItem` via `updateSource`, making it part of the original write. One create, one encumbrance recompute, no follow-up write anywhere. Awaiting the first write was never a fix: the recompute is triggered by the write and completes after it resolves.
  - The hook is registered natively rather than through Blacksmith's hook manager. `preCreate` hooks cancel the operation when a handler returns `false`, and routing a cancel-capable hook through a wrapper whose return value Squire does not control risks silently blocking item creation world-wide. This is deliberate and stays that way — see the note in Blacksmith's TODO.
  - Beyond the console error, the follow-up write made stack-merge identity timing-dependent for anything comparing item flags. Injecting at creation removes the cause rather than compensating for it.

### Changed
- **`withArrivalFlag` removed**: the helper 13.5.2 added, and its six call sites, were a second mechanism doing what the `preCreateItem` hook now does for every creation path. One place decides what stamping means.


## [13.5.2]

### Added
- **Players can research without being able to add**: The single "Let Players Add From Compendiums" switch is now a four-rung setting — **Off**, **Look only**, **Ask the GM**, **Add freely** — because "may they add things" and "may they look things up" are different questions. A player who doesn't understand how grappling works, or who wants to read the spell another character just cast, needs the compendium open, not write access to their own sheet. The GM is always on the top rung.
  - **Look only** keeps search and the details button and removes the add button. Drag-to-sheet is disabled at the same time: dropping a result onto a sheet performs the same creation the add button does, so leaving it live would be an unguarded second door into what the setting just closed. The row's `draggable` attribute goes false and the drag handler re-checks permission, so editing the attribute in devtools doesn't reopen it.
  - **Ask the GM** is the new default. Clicking add sends the GM a whispered card naming the player, the character, the item, and its source compendium, with Approve and Deny; approval performs the add and tells the player, denial tells them it was declined, and either way the request card is removed rather than left in the log as a decision already made. Requests carry actor and item **UUIDs** rather than ids, so a request against an unlinked token actor resolves — `game.actors.get()` returns nothing for those. Ownership is re-checked at approval time, since a request can outlive the ownership that justified it if a character is reassigned in between. With no GM online the player is told so instead of the request vanishing.
  - Existing worlds that had the old switch **on** keep that permission — it migrates to Add freely. Worlds that never touched it move from no access to Ask the GM, which is a live behavior change on upgrade rather than new-world-only. The legacy setting is read out of world storage once and its stored document deleted, rather than being kept registered as a vestigial switch.

### Changed
- **Compendium settings have their own section**: "Let Players Use Compendiums" was rendering under **NPC Auto-Favorites**, having been registered between the auto-favorite settings and the next heading. It now sits under a **Compendiums** heading placed beside Transfer Configuration, since both govern how content arrives on a character sheet.
- **Transfers no longer thread `hasQuantity` through the mutation**: the three direct-transfer paths derive the available quantity from the live document instead. The GM socket path's existing check was gated on the client's `hasQuantity` claim, so a caller reporting an item as non-stackable skipped validation entirely; it now checks unconditionally.

### Fixed
- **Handing over a packed container no longer orphans its contents**: dnd5e stores containment on the child as `system.container`, pointing at the parent's id. Copying a backpack to another actor minted a new id there, so the contents stayed behind on the source pointing at an id that no longer existed — the bag arrived empty and the source kept items no panel would render, with nothing reversible once both halves had run. Transfers of a container holding anything are now refused, in front of the quantity dialog rather than after it, with a message naming how many items to unpack first. Empty containers hand over normally: the block is about contents, not about being a container. Enforced at all four entry points plus the GM socket handler.
- **A stale quantity could duplicate items**: only the GM socket path re-checked the requested quantity against the stack at the moment of mutation. The three direct-permission paths took the value the dialog produced, so if the stack had been spent, sold, or partly handed to someone else in between, the transfer created the full requested amount on the target and deleted the source stack. All three now validate against the live document and refuse rather than mutate.
- **Transfers no longer collide with dnd5e's encumbrance effect**: a transfer that pushed the recipient over an encumbrance threshold could throw `The _id [dnd5eencumbered0] already exists within the parent collection`. dnd5e recomputes encumbrance after every item create, update, and delete, and that recompute is a check-then-create against one fixed effect id with no lock. Squire wrote twice in a row — create the item, then set the `isNew` flag on it — and the second recompute read the same still-empty effects collection and tried the same id. Both writes were individually awaited and still collided, because the recompute outlives the write that triggered it. The arrival flag now rides along in the create payload at Squire's six item-creation call sites, so those paths are one write per actor. The badge behaves identically; the durable half just arrives with the document.
- **Compendium results respect pack visibility**: search runs on the requesting client, and a GM-only pack is still present in a player's `game.packs`. Now that players can search, results are filtered against `pack.visible` so a player can't see names out of packs they aren't allowed to open. Compendium results whose pack won't resolve are dropped rather than kept.


## [13.5.1]

### Changed
- **Health tool claims the shared party-health capability**: The Squire Health menubar registration now declares Blacksmith's `party-health` intent, allowing compatible Blacksmith surfaces to discover the handler without coupling to Squire's tool id.
- **Tool windows follow Blacksmith themes automatically**: Dice Tray, Health, and Transfer now use Blacksmith's theme-aware field, raised, sunken, hover, selected, and muted-text properties for neutral content surfaces. Removed redundant Light/Dark/Glass workarounds while retaining deliberate semantic colors for health actions, advantage/disadvantage, warnings, and drag targets.
- **Tray Position hidden pending removal**: The single-option Tray Position setting remains registered for runtime and stored-setting compatibility but is no longer shown in Settings. A follow-up TODO records the required JavaScript, template-data, and position-scoped CSS cleanup before the setting can be removed safely.

### Fixed
- **Players retain the settings heading hierarchy**: Introduction, The Tray, Tray Configuration, Panel Configuration, Handle Configuration, and Menubar Configuration headings are now user-scoped, so player-visible user/client settings no longer appear as an unexplained flat list. Only heading scopes changed; the scopes and behavior of the settings beneath them are unchanged.


## [13.5.0]

### Added
- **Compendium quick-add**: A `+` beside the global search box swaps the stacked panels for a results view; typing searches the compendiums configured in Blacksmith and lists matches grouped by compendium in the GM's configured priority order, each with an add button and a details button. Adding copies the item onto the character at quantity 1 — adjust it afterwards with the inline count badge rather than filling the results list with quantity fields for a value that is almost always 1.
  - Built on Blacksmith's `api.compendiums.search()`, which reuses the pack indexes Blacksmith already caches and invalidates. Squire deliberately does not read pack indexes itself: a second cache would drift out of sync after any compendium edit. All API contact is funnelled through one adapter, so the panel only ever sees a normalized result shape.
  - Group headers render the API's `sourceLabel` and `sourcePackage` as two elements — pack name leading, package name quiet and right-aligned — rather than deriving or concatenating a label. Several packages ship a pack called "Equipment", so the pack name alone is ambiguous; the package name is suppressed when it merely repeats it. Groups are keyed on `source`, never on the label, since two packs can share a name but never an id.
  - `limit` stops the API's scan rather than just capping output, so a broad query can leave lower-priority compendiums unindexed entirely. The panel reports this from the API's own `truncated`/`skippedSources` via `searchDetailed()`, naming how many compendiums went unsearched. Not inferred from a full result page: a scan that fills the cap with the last available candidate is complete, so that test would raise a false "content is missing" on any query landing on a round number.
  - Results can be dragged onto a character sheet, the canvas, or a journal, using Foundry's native `{type, uuid}` payload. `type` is the API's `documentClass`, not the subtype on the row badge — a spell result is class `Item`, so deriving it from the searched type token would produce payloads no sheet accepts, and only for spell rows.
  - No "items vs spells" mode. Item, Spell, and Feature are searched together in a single multi-type call, and grouping by source separates them anyway — a type toggle would be a second organizational scheme competing with the compendium headers. One call rather than one per type is load-bearing: synthetic types have no packs of their own, so a pack mapped to both Item and Spell would return its spells through both passes and list every one twice, and merging separately-grouped result sets would re-interleave the packs the source ordering exists to keep together.
  - The panel-visibility toggle row collapses in quick-add mode rather than sitting greyed out, since it has nothing to act on and vertical space in the tray column is scarce.
  - The section is now titled **Character Sheet** rather than Global Filters, which stopped being accurate once the search box did double duty — and matches how players use it, as the thing they reach for instead of opening the sheet. Mode is chosen by a two-state switch in the title bar's right zone (a person icon for the character's own items, a magnifying glass for compendium search), the same slot the GM Details and Character Summary chevrons occupy, so a right-edge icon consistently means the header has an action. The previous `+` sat inside the search field, where it read as acting on the search box rather than on the section.
  - A **Clear search and keep open on add** checkbox below the search box chooses what happens after adding. On (default): the query empties and the caret returns, so adding several things is type-add-type rather than type-add-select-all-retype. Off: the tray returns to the character sheet and scrolls the new item into view with a brief highlight. Remembered per user, only shown in search mode, and neither branch fires on a failed add — the query is what you need to retry with, and there is no item to go look at.
  - Restricted to the GM by default. A world setting allows players to add to characters they own, off by default since who may pull arbitrary compendium content onto a sheet is a table policy question.
- **Inline quantity editing**: Click the `x12` count badge on any item in the Inventory, Favorites, or Weapons panel and it becomes an editable field — type a value, Enter commits, Escape cancels, clicking away commits. Setting the quantity to zero deletes the item, since "I used the last one" and "I have zero of these" are the same statement about a stack. Requires ownership of the actor. Favorites and Weapons rows gained a count badge to hang this off; Inventory already had one, and its badge is now shown at zero so an emptied stack is still reachable.
  - Deleting is confirmed only when losing the item would hurt: magical, attuned, requiring attunement, better than common rarity, or worth more than a configurable gold threshold (default 50gp, settable to 0 to disable the value check). Ordinary stackables — arrows, rations — delete without a dialog so mid-combat edits stay frictionless. If Blacksmith's dialog API is unavailable, a deletion that *would* have been confirmed is refused rather than performed silently.
  - Deliberately not built on Blacksmith's `api.quantitySplit`: that control is a Give/Keep *split* for transfers, with a floor of 1 and no mutation of its own. It can't express an absolute quantity and can't reach zero. This stays local to Squire as row presentation rather than shared window chrome; if another module needs the same control later, it can be contributed upward the way `quantitySplit` itself was.
- **Handle favorites are capped**: The tray handle is a narrow strip, and past a handful the icons shrink below a comfortable click target. It now holds five by default (configurable up to twelve). Adding another once full is refused with a toast naming the item and asking you to remove one first, rather than silently evicting an existing pick — which one to drop is the user's call. NPC auto-favoriting truncates to the same limit, so a large statblock fills the handle with its first few entries and leaves the rest in the favorites panel. Worlds that exceed the limit are normalized down to the top entries on actor selection.
- **GM toast for player quantity edits**: When a player changes an item's quantity from the tray, the GM gets a Blacksmith toast naming the player, actor, item, and new value — or that the item was removed. No socket is involved; the document hooks already fire on every client and carry the acting user's id, so the GM's client notifies itself. Only deliberate tray edits are reported: the editor tags its own updates, so dnd5e consuming ammunition during a ranged attack stays silent. Repeated edits to the same item replace in place via `stackKey` rather than piling up.
- **NPC statblock checks with one-click repair**: NPCs are routinely imported or hand-built with a bow and no arrows, a crossbow and no bolts, or a slot-casting spell list and no spell slots — each of which only surfaces at the moment someone clicks the thing mid-combat. Affected weapons and spells now carry a GM-only warning badge in the Favorites, Weapons, and Spells panels; clicking it repairs the problem. A new world setting repairs automatically on token selection instead, and another sets the restock quantity. Warnings are never shown to players — these are authoring problems, and "this monster has no arrows" isn't theirs to see.
  - Ammunition detection uses dnd5e's own `system.ammunitionOptions`, so arrows-vs-bolts-vs-needles subtype matching stays correct without Squire maintaining a weapon-to-ammo table, and distinguishes "no ammunition at all" from "ammunition present but depleted". Repairs pull the standard item from `CONFIG.DND5E.ammoIds`.
  - Spell-slot detection reads `CONFIG.DND5E.spellcasting` to decide which casting methods consume slots, so at-will, innate, and ritual casters — most modern statblocks — correctly stay silent, and homebrew methods registered by other modules are handled without a code change. Repairs set the NPC caster level, which is the single field dnd5e derives the whole slot table from; the required level is found by inverting the system's own slot table rather than assuming the 5e progression.
  - Pact-magic NPCs with no slots are reported but marked unrepairable, since one caster-level field can't correctly express pact progression. The badge renders inert rather than pretending to offer a fix.

### Changed
- **Campaign details now come from Blacksmith**: Removed Squire's six campaign settings — campaign name, party name, party size, party makeup, party level, and rulebooks — along with the Campaign Common heading they sat under. Four of the six were registered and shown in the settings UI but never read by any code. The two that were read duplicated fields Blacksmith already owns, so a GM configured the same campaign twice and the two copies could silently disagree. Blacksmith's campaign data is now the only source, read through a single `getCampaignContext()` helper; when it isn't configured there, Squire simply doesn't have the value rather than offering a second place to set it. The party tab keeps its existing "Party" fallback for an unconfigured world.
- **Codex and Quest import templates fill more placeholders**: The template copy button substituted one token, `[ADD-RULEBOOKS-HERE]`, from Squire's own setting. It now fills campaign name, party name, size, level, makeup, class list, and the realm/region/site/area geography from Blacksmith's flattened prompt context — none of which Squire could previously supply. A placeholder whose value isn't configured is left in place rather than blanked, so the template still shows what's missing.
- **Settings grouped under second-level headings**: Fourteen H3 sections previously hung directly off the introduction with a single H2 (Campaign Settings) appearing near the bottom, so most of the list read as flat. Sections are now grouped under four H2s — **The Tray** (tray, panels, handle, menubar), **Run the Game** (auto-favorites, statblock checks, health, transfers), **Campaign** (campaign details, notes, codex, quests), and **Canvas** (token lighting). Token lighting moved out of Campaign, where it had been the trailing section despite governing canvas behavior rather than campaign records. No setting keys changed, so nothing needs reconfiguring.
- **Handle simplified to token state only**: Removed Primary Stats, Secondary Stats, the Dice Tray icon, and the Macros icon from the tray handle, along with their four settings, four partials, event handlers, template context, and CSS. The handle is a narrow strip whose value is showing what *this* token has; the Dice Tray and Macros are global tools that ignore selection, and both are already one click away in the Blacksmith menubar. Conditions, Favorites, and the Health Bar remain.
- **Favorited macros moved to the menubar**: Macro favoriting is unchanged, but favorites are now reached by right-clicking the Macros tool in the Blacksmith menubar — Show Macro Window, then each favorite listed directly. The list is supplied as a function so it rebuilds on each open rather than being frozen at registration. Left-click still opens the Macros window.
- **Removed the Hide Foundry Hotbar setting**: Squire injected its own `#hotbar { display: none }` style from a setting that competed with Blacksmith's hide-UI feature — a dependency that already owns this. Two modules writing the same element meant the result depended on which ran last. Blacksmith is now the only owner. The separate logic that *moves* the hotbar as the tray opens and closes is untouched.

### Fixed
- **Favorites filter toggles threw on every click**: All four read `event.currentTarget` after an `await`, and the browser nulls `currentTarget` once dispatch completes — so each threw `Cannot read properties of null` and left the filter half-applied. The element is now captured before awaiting.
- **Three settings were registered twice**: `codexJournal`, `headingH3NotesConfiguration`, and (introduced this release) `handleFavoritesMax` each had two registrations. A duplicate key keeps its **first** registration's position in the settings list but takes the **last** one's values, which is why the Notes heading rendered in an unrelated part of the list with nothing beneath it while the Notes Journal picker appeared much later with no heading above it.
- **Codex and Quest journal pickers were unreachable**: Both were `config: false` while their section headings were `config: true`, so Codex Configuration and Quest Configuration rendered as empty back-to-back headers with no way to choose a journal from the settings UI. Both pickers are now exposed under their own headings.

### Added
- **Container indicator on stored items**: dnd5e keeps a container's contents in `actor.items` like everything else — membership is only a `system.container` id — so the tray was listing a bag's entire contents flat, indistinguishable from what the character is actually carrying. Items stored in a container now show a box icon in the Inventory, Weapons, and Favorites panels, with a tooltip naming the container; clicking it opens that container's sheet. Dimmer than the action icons by default, since it's primarily informational.
- **Show GM Details Panel setting**: The GM panel had no visibility toggle — it appeared for every GM unconditionally. It now sits with the other panel toggles in Panel Configuration. Still GM-only regardless of the setting.

### Fixed
- **Panel filters no longer overwrite each other**: Every panel's `_updateVisibility` queried `.panel-item` across the whole tray and set `display` on any row whose id it recognised. Favorited items render in both the Favorites panel and their source panel under the same `data-item-id`, so the Favorites type filters and the Spells prepared / Weapons and Inventory equipped filters were writing over each other's results — whichever panel rendered last won. The visible symptom was a filter appearing to apply to only some categories, inconsistently. All five panels now scope to their own container, as `_updateHeartIcons` already did for the same reason, and their category-header and empty-message updates are scoped with them.
- **Prepared filter hid castable spells**: The Spells panel's prepared filter tested `system.prepared` directly, which is 0 for innate and pact spells even though they are always castable, so "show only prepared" hid them. It now uses the shared `isSpellPrepared` helper, matching the handle and the favorites panel.
- **The NEW badge now appears in every panel**: The `isNew` flag has always been written for every item added to an owned actor, but only the Inventory panel rendered it — so a newly added weapon, spell, or feature was marked as new with nothing to show for it. Weapons, Spells (all four row layouts), Features, and Favorites now render the badge too. Inventory tested the session map and the persisted flag as two separate conditions and could draw two badges at once; both sources are now folded into one `isNew` value in the view model, so it draws once.
- **Handle favorites now read in the same order as the Favorites panel**: The handle's 180° rotation was being cancelled by sorting the favorites list backwards in JavaScript. That rendered correctly but left the underlying array reversed, so ordering logic downstream operated on it upside down — capping the handle to its "top" entries would have kept the lowest-priority ones. The rotation is now cancelled in CSS with `flex-direction: row-reverse`, matching the fix pinned quests already used, and the sort is a plain ascending one.
- **Auto-favorites no longer undo themselves**: Auto-favoriting is now incremental instead of all-or-nothing. Each NPC records which items it has already considered in an `autoFavoriteSeen` flag, so re-selecting a token no longer repopulates a list the user cleared, and an item added to an NPC after the first pass is now picked up instead of being ignored because favorites already existed. Manual removals stick. Actors favorited under the old rule adopt their current sheet as already-considered on first sync, so existing curation is preserved.
- **Equipping an NPC weapon could un-favorite it**: The `updateItem` auto-favorite path called `manageFavorite`, which toggles, and tested the item's current state rather than the change payload. Any unrelated edit to an already-equipped weapon (a description tweak) therefore silently removed it from favorites, and a second edit added it back. It now fires only on the actual equip/prepare transition and only ever adds. The same path's prepared check compared against `true`, which never matched dnd5e 5.x's numeric `prepared`, so preparing an NPC spell never favorited it at all.
- **At-will, innate, and pact spells showed as unavailable**: The handle greyed out any spell whose `system.prepared` was falsy. Those three casting methods sit at `prepared: 0` and are castable regardless — and are exactly what NPC auto-favorites selects — so most of a monster caster's handle rendered dimmed. Availability is now computed in the view model via a shared `isSpellPrepared` helper, which the favorites panel's prepared indicator also uses.
- **Prepared toggles wrote a boolean into a numeric field**: The sun icons in the Favorites and Spells panels set `system.prepared` to `true`/`false`; dnd5e 5.x models it as 0 (unprepared) / 1 (prepared) / 2 (always prepared). Both now read and write numbers.
- **Racing auto-favorite calls**: `FavoritesPanel`'s constructor fired auto-favoriting without awaiting it, racing the awaited calls in `PanelManager` and the `createItem` hook for the same actor flag. The constructor call is removed; the two awaited entry points remain.
- **Orphaned handle favorites**: `addHandleFavorite` no longer creates a handle entry for an item that isn't a panel favorite. The handle sorts by panel order and the panel is the only place to manage favorites, so such an entry was unremovable from the UI; the item is promoted to a panel favorite instead.

### Changed
- **Fewer generic actions auto-favorited**: The built-in actions an actions-compendium drops onto NPC sheets are rules reminders, not statblock content. `Jump`, `Mount`, `Dismount`, `Swim`, `Long Jump`, `High Jump`, `Break an Object`, `End Concentration`, `Travel Pace`, and others were missing from the ignore list and were being favorited as though they were creature features. They are now recognized, and the set kept anyway has been narrowed from seven to the two that actually come up mid-turn — Ready and Disengage. Dash, Grapple, and Shove no longer take a favorite slot.
- **Generic-action list extended, and its setting now extends rather than replaces**: Stabilize and Suffocation were still being auto-favorited — Stabilize was missing from the ignore list outright, and the list carried "Suffocating" while the compendium in use spells it "Suffocation". Matching is exact, so any unlisted spelling silently becomes a favorite. Added those plus Take Cover, Don/Doff Armor, Short/Long Rest, Disarm, Use a Magic Item, Climb Onto a Bigger Creature, Shove Aside, and several variant spellings. The **Also Ignore These Actions** setting now ADDS to the built-in list instead of replacing it, so covering a future miss costs one word rather than restating sixty-six names.
- **Auto-favorites are configurable**: Added a world-scoped **NPC Auto-Favorites** settings section — an on/off toggle plus editable comma-separated name lists. The ignore list extends the built-in set; the keep list replaces it, since the useful edit there is narrowing rather than extending. The keep default is exactly Ready and Disengage.
- **Removed dead handle-favorites pipeline**: `HandleManager` built a second, differently-shaped `handleFavorites` array into its template context that no template ever read; the handle partial calls the `getHandleFavorites` Handlebars helper directly. Removed it along with a redundant dynamic import of `FavoritesPanel` that shadowed the module's static one.

## [13.4.0]

### Fixed
- **Instance-safe Application V2 actions**: Codex, Note, and Quest editors now bind Save, Cancel, Delete, and Save & Place actions to the window that rendered them instead of resolving Blacksmith's class-static `_ref`. Opening multiple editors can no longer redirect an action to the most recently rendered window, discard edits from an older window, or leave its controls inactive after another closes. Status Effects now uses the same per-instance action binding while retaining its intentional singleton opener through an explicit Squire-owned reference.
- **Macros Tool drag stability**: Dragging a Macro from Foundry's directory into the ApplicationV2 Macros Tool no longer decorates or changes the positioning mode of any Application frame, which could make the sidebar or surrounding UI flash and jump. Non-layout-changing feedback is scoped to Squire's body content, Foundry's native drag-data reader now resolves directory payloads before a defensive MIME fallback, internal macro drags stop at their slots, and successful drops, reorders, favorites, and removals perform one render instead of two consecutive full window renders.
- **Window V2 startup ordering**: Squire's window-registration `ready` handler now waits for Blacksmith independently before importing any Window V2 subclass. Foundry runs async hook callbacks concurrently, so the separate Squire callback that already waited for Blacksmith did not protect window registration; Notes could consequently evaluate before `BlacksmithWindowBaseV2` was published and fail for the remainder of the client session.

### Changed
- **Toast-first transfer feedback**: Giving a private note now confirms through Blacksmith's themed toast API with the recipient portrait instead of Foundry's core notification queue. Transfer accepted/declined status confirmations use the same toast convention; validation failures and actionable warnings remain Foundry warnings/errors.
- **Unified Blacksmith Transfer Tool**: Replaced the separate Character/User pickers and transfer quantity/approval dialogs with one ephemeral, multi-instance `BlacksmithToolWindowBaseV2` used by Inventory, Weapons, private Notes, Party drops, direct tray drops, and incoming approvals. The Tool combines details, optional `api.quantitySplit`, selectable `api.entityList` or a fixed recipient, and action buttons in one Light/Dark/Glass-compatible flow. Every instance has a unique id, does not persist position, guards duplicate submission, remains open on failure, and clears its host lock on every close path. Removed the obsolete picker classes/templates/styles, transfer dialog template/CSS, and Squire's local quantity-control contribution now that Blacksmith owns and has verified it.
- **Blacksmith minimum version**: Squire now requires Blacksmith 13.12.2, the first supported contract floor for the verified Dialog, Entity List, Quantity Split, Tool-window, and per-instance action APIs consumed by 13.3.19.
- **Quest kind and status normalization**: Quest categories are now the two supported kinds—Main Quest and Side Quest. Main quests use the flag icon and Side Quests use the map-signs icon in both the tray and Blacksmith quest pins, while `main`/`side` taxonomy tags remain intact. Quest statuses are Available, Active, Succeeded, or Failed; the tray groups the two terminal statuses beneath its Complete filter, and the status context menu lists Active, Available, Succeeded, then Failed. Legacy `Not Started`, `In Progress`, `Complete`, and obsolete completion-category data are normalized on read. A repeat-safe GM migration API and pasteable `macros/migrate-quest-journal.js` macro rewrite the configured journal and remove obsolete category/outcome flags.
- **Character and User picker Application V2 migrations**: Migrated the final two custom legacy `Application` windows to Blacksmith's `BlacksmithWindowBaseV2`, with a direct base-module fallback so their eagerly imported panels can load safely before Blacksmith publishes its ready-time API. Inventory and weapon transfers retain quantity selection and actor callbacks, including synthetic-token Actor resolution; cancelling either picker now always clears its transfer lock, including after choosing a stack quantity. Giving a private note retains its player-recipient callback. Blacksmith now supplies the shared frame, title bar, minimize/close behavior, viewport handling, and per-user position persistence. Removed the V1 render wrappers, jQuery compatibility, manual close/minimize/listener handling, custom viewport and position persistence, obsolete picker position settings and template constants, and the old frame-level CSS overrides. Picker CSS is now limited to the compact portrait grids and their interactive states.
- **Legacy Dialog migration**: Removed all 22 remaining V1 Dialog call sites in favor of Blacksmith's `api.dialog` dismissal contract. Destructive confirmations now use explicit critical actions; Notes and Quest scene-scope choices use `choose`; clipboard fallback uses DOM content so copied text cannot be parsed as markup; journal and journal-page selection share one DialogV2-backed utility; current Codex/Quest imports and transfer quantity/approval flows retain their behavior through `wait`. Codex and Quest exports now share a multi-instance-safe `DataExportWindow` on `BlacksmithWindowBaseV2`, with JSON preview, copy, download, summary, and Quest scene-pin information. Removed the unreachable duplicate Quest import/export listener implementation. The future Blacksmith importer and unified Transfer Tool remain separately tracked until their public APIs and shared components exist.
- **GM integration test harness**: Added a pasteable, persistent tabbed Script Macro under `testing/test-harness-macro.js`. It exercises real Squire windows, Blacksmith confirm/choose/prompt/wait dismissal contracts, journal pickers, transfer quantity and recipient previews, Quest normalization/data audits, the shared export window, current API capabilities, and a browser-side source scan for legacy Dialog calls. State-changing transfer and Quest migration scenarios are clearly marked LIVE and require a second destructive confirmation.
- **Blacksmith integration verification and quantity contribution**: Extended the GM harness with the two upstream acceptance checks needed by the final Transfer Tool: a real `api.entityList` hosted in a Tool window and cycled through Light, Dark, and Glass, plus two simultaneous Tool instances whose `ACTION_HANDLERS` clicks are programmatically asserted to reach the correct instance. Added an exact, accessible Give/Keep quantity-control contribution under `contributions/blacksmith/`, including Handlebars markup, Tool-theme CSS, an attachable per-instance controller, lifecycle contract, and verification matrix.
- **Public window-base resolution**: Character picker, User picker, Note editor, and shared Export window now resolve `BlacksmithWindowBaseV2` only from Blacksmith's public runtime API. Removed direct imports of Blacksmith's internal `scripts/window-base.js` path so a future internal file move cannot silently break Squire.

## [13.3.18]

### Fixed
- **Quest category selector safety**: Restoring collapsed quest categories no longer inserts category text into a CSS selector. Status matching now uses one DOM-safe helper, preventing whitespace, quotes, or formatted names such as Side Quests from causing `querySelector` syntax errors.

### Changed
- **Notes panel theme cleanup**: Removed the Notes-only Light card theme, its title-bar toggle, per-user `notesCardTheme` flag reads and writes, conditional template classes, and Light-theme CSS. Notes now consistently use the tray's native dark presentation without carrying a separate theme system.
- **Dice Tray Blacksmith tool-window migration**: Migrated the standalone Dice Tray from legacy `Application` V1 to Blacksmith's compact `BlacksmithToolWindowBaseV2` using its new Micro title bar. The tray keeps its existing formula builder, advantage/disadvantage rolls, modifiers, and recent-roll controls while gaining the shared parchment shell, thin native drag rail, hover/focus ellipsis menu, native focus and minimize/close behavior, viewport constraints, and automatic per-user position persistence. Its fixed compact layout shows roughly three recent rolls, keeps the formula and dice controls stationary, and scrolls only the history list when additional rolls exceed the available space. Dice Tray now follows Blacksmith's persisted Light, Dark, and Glass Tool themes through the shared Tool variables and theme-state classes, with readable theme-aware fields, controls, history, scrollbar, and green/red roll accents. A native Tool title-bar action hides or restores Recent Rolls and contracts the window when hidden; roll history now lives in panel state so theme/action rerenders do not erase it. Registered it with the Blacksmith Window API for menubar, macro, and cross-module opening; removed the legacy tray wrappers and their 200px content cap along with the V1 listener/frame/position workarounds, redundant dark frame/body and tray-era styling, adaptive height experiments, and obsolete `diceTrayWindowPosition` setting.
- **Macros Blacksmith tool-window migration**: Migrated the standalone Macros window from legacy `Application` V1 to `BlacksmithToolWindowBaseV2` with the Micro title bar and Window API registration. Macro execution, favorites, internal reordering, external macro drops, slot removal, actor updates, and singleton reopening are preserved; the Macros Folder action is exposed through Blacksmith's tool-titlebar controls. Blacksmith now owns native dragging, focus, minimize/close behavior, title-bar mode switching, and per-user position persistence. The macro grid uses compact body padding and true border-box 40px slots so resizing aligns cleanly with complete icon columns without premature wrapping or excess gutters; its normal opening height fits one row in Micro mode without a scrollbar and its maximum width is 2400px. Consumer minimum-height constraints were removed from Macros and Dice Tray so Blacksmith can collapse their Application frames completely when minimized. Removed the V1 listener workaround, custom minimize/close and position code, obsolete `macrosWindowPosition` setting, legacy tray/popout wrappers and template branches, dark frame overrides, and duplicated drop-target CSS.
- **Health Blacksmith tool-window migration**: Migrated the standalone Health window from legacy `Application` V1 to `BlacksmithToolWindowBaseV2` with the Micro title bar, a dedicated body template, and Window API registration. Single- and multi-token HP changes, full healing, death toggling, live Actor updates, selection switching, actor display names, and singleton reopening are preserved. The window remains registered against every displayed Actor so any selected Actor's HP update refreshes the same tool, while Blacksmith now owns dragging, focus, minimize/close behavior, viewport constraints, and per-user position persistence. Party, handle, and Health-tool bars now resolve the same configured thresholds through one helper and consume the same global semantic color classes; the healthy color is unified at `rgba(42, 100, 48, 1.0)`, and duplicate handle colors and animation were removed. Health rows combine a compact portrait with a single readable name/current/maximum bar on a darker, tighter track and sit on tightly padded card backgrounds that carry the hover and selected states; each individual row also exposes the handle's Conditions control, including a centered red ActiveEffect count badge when more than one is present, and opens Status Effects for that row's Actor. Aggregate rows use Blacksmith's helmet and dragon encounter icons and show the bare canvas Party or Monster CR value from `getCombatAssessment`, falling back to group counts when that API is unavailable. Multi-selection prepends aggregate Party and/or NPC bars as applicable. With no token selection, the tool remains useful by showing live Party and NPC scene summaries (including empty groups), registering against their Actors for updates, and treating all scene tokens with HP as its default operation set. Clicking an individual or aggregate row exclusively highlights and targets it for every HP toolbar action, clicking it again clears the target, and changing the displayed selection clears any target that no longer exists. The GM toolbar adds scene-wide Party and NPC selection, fixed ±10 adjustments, and a per-client remembered adjustment amount whose text auto-selects on entry. Removed the V1 listener workaround, custom minimize/close and position code, obsolete `healthWindowPosition` setting, legacy tray/popout wrappers and template branches, dark frame overrides, and the unused tray-era Health template and stylesheet.
- **Health Tool themes and menubar access**: Health now follows Blacksmith's persisted Light, Dark, and Glass Tool themes with readable theme-aware rows, controls, inputs, state colors, and translucent Glass surfaces. A new per-user **Show Health Tool in Menubar** setting adds a heart-pulse launcher immediately after Dice Tray and refreshes the menubar live when changed.
- **One useful Character Summary instead of three disconnected panels**: Replaced the separate Experience, Abilities, and Attributes panels—and their three visibility settings, three collapse settings, templates, scripts, and styles—with one default-enabled **Show Character Summary Panel** setting and one remembered collapse state. Its outer title uses the same top-level `tray-title-small` treatment as GM Details and Global Filters, while its contents reuse the tray's established Weapons/Inventory presentation classes: labeled category dividers, left-aligned dark list rows, compact typography, context badges, and hover treatment. A labeled, 24px Health-style XP progress bar leads the pane with current/maximum values overlaid on its fill and extra separation below. Full-width Core, Abilities, and Skills sections are stacked beneath it, while each section arranges its compact data rows in two columns. Core includes Level/CR, Initiative, Speed, Armor, Proficiency, and Passive Perception for an even six-row grid. Abilities uses dnd5e labels with modifiers and score badges; Skills adds dnd5e labels, modifiers, proficiency badges, and the same leading 24px hover-d20 click target. Ability targets roll checks on click and saves on right-click; skill targets roll their skill check. Its body scrolls only when content exceeds the cap, preventing character data from pushing the high-use spell and item panels down the tray. Actor switching and relevant stat, ability, movement, armor, initiative, XP, and skill updates refresh the unified panel directly.

## [13.3.17]

### Added
- **Status Effects window – Blacksmith Application V2 migration and effect management**: Replaced the inline legacy Add Effect dialog with a registered Blacksmith Window API window. The window enumerates only core-toggleable statuses from `CONFIG.statusEffects` and uses `Actor#toggleStatusEffect`, ensuring dnd5e creates and removes canonical condition effects instead of Squire manufacturing lookalikes. Changes are gated by actor ownership, active state comes from `actor.statuses`, Exhaustion displays its current level, duplicate operations are guarded, and Remove All clears official statuses through the core API.
- **Other Effects management**: Added a removal-only section for the actor's remaining ActiveEffects, including temporary, custom, disabled, and suppressed effects without duplicating canonical conditions. Effects are removed by stable document ID, and the handle's existing right-click removal was updated to use the same ID-safe lookup and ownership rules.
- **Real effect descriptions in a master/detail layout**: Official conditions and Other Effects now show their real, enriched descriptions—including dnd5e `@Embed` rules content—in a persistent, independently scrolling right-hand pane. Handle effect clicks open the window directly to the relevant description. The two-column layout keeps condition/effect controls visible, uses a narrower detail pane, highlights the current selection, clamps long condition names, and aligns the applied and information indicators.

### Removed
- **Legacy status-effect UI and description code**: Removed the V1 Add Effect and condition-description dialogs, hand-built official ActiveEffects, pseudo-condition toggles, manual compendium/journal parsing, generated dialog markup and inline CSS, and the obsolete `window-descriptions.css` stylesheet.

## [13.3.16]

### Fixed
- **Dragging a tray item over the tray no longer offers (or performs) a self-transfer**: the drag-out feature made every tray row draggable, but the tray is also the item-transfer drop zone — so starting a drag immediately lit the tray up as a drop target, and dropping there ran the transfer flow with the same actor as both source and target, duplicating the item (drag a shortsword two inches, get two shortswords). A `_trayItemDragActive` flag set on tray `dragstart` (cleared on `dragend`) now makes the transfer zone ignore the whole gesture: no highlight, no hover sound, and no `preventDefault` on dragover, so the browser itself refuses the drop. Belt-and-braces, the drop handler also early-returns whenever source and target resolve to the same actor — which additionally covers dragging an item from this actor's own character sheet onto the tray, a second route to the same duplicate.
- **NPC auto-favorites actually pick up spells and monster features again**: `initializeNpcFavorites()` was still filtering on dnd5e 2.x-era data paths, and on dnd5e 5.x two of its three rules matched nothing. Spells checked `system.prepared === true`, but `prepared` is now a *number* (0 unprepared / 1 prepared / 2 always) — a number is never strictly equal to `true`, so zero spells ever qualified, even though dnd5e defaults every NPC spell to `prepared: 1`. Monster features checked `system.featureType` and `system.activation` — fields that no longer exist (`system.type.value === "monster"` and per-activity activation replaced them), so no features qualified either; that's the worst miss, because 2024-style statblocks express monster *attacks* as feat items with attack activities rather than weapon items. Only the equipped-weapon rule still worked, which is exactly why auto-favorites looked mostly empty. The rules are now: weapons that are equipped *or* carry an attack activity; spells with `prepared > 0` or an at-will/innate/pact casting method; and feats with at least one activation-typed activity — actions, bonus actions, and reactions in, passive traits out. The feat rule is deliberately not gated on `system.type.value === "monster"`: dnd5e only stamps that on feats created directly on an NPC, so hand-built companions and drag-copied abilities never carry it, and on an NPC anything usable is statblock content anyway. Universal actions (Dash, Dodge, Help, Hide, Search, Check Cover, …) are the exception — when an actions compendium drops the full set onto every NPC they all carry usable activities and would flood favorites with rules reminders, so they're matched by name against a closed list and only a curated few auto-favorite: Dash, Disengage, Grapple, Shove, and Ready (Action/Spell). Real statblock features are never name-filtered. Both lists are constants at the top of `panel-favorites.js`. The curated generic actions sort to the bottom of the favorites list — weapons, spells, and statblock features are what the creature *is*; the generic actions are rules reminders — and they are excluded from handle favorites entirely, since handle slots are scarce and Dash/Disengage belong to every creature rather than this one's kit.
- **Action badges (A/B/R/S) show again — activities were being read as a plain object**: dnd5e 4+ initializes `system.activities` as an `ActivityCollection`, a Map subclass, and `Object.values()` on a Map returns an empty array — so every `_getActionType()` silently saw "no activities". The failure was invisible because the spells panel *defaults* to "A" when the lookup fails (which is why spells looked fine) while weapons defaulted the same way and inventory/features returned null (no badge at all). All seven activity-reading sites now go through one `getActivityList()` helper in helpers.js that normalizes the collection to an array. This also revives two handle-favorite tooltip helpers that were doubly stale: `getWeaponType()` checked the pre-4.0 `rwak`/`mwak` activity types (now `attack.type.value` on an attack activity), and `getDamageInfo()` read damage parts as `[formula, type]` tuples (now DamageData objects with a `formula` getter and a `types` set) — the melee/ranged label and damage line in handle tooltips had quietly stopped rendering with them.
- **Favorite hearts (and the other row icons) click reliably again**: making the tray rows draggable in 13.3.14 quietly broke clicking the icons inside them. With `draggable="true"` on the row, Chromium commits the gesture to a drag after only a few pixels of mouse travel — and once a drag starts, the `click` event is never dispatched. A quick click on a small icon almost always includes that much travel, so the heart (and shield, lightbulb, share, feather) read as dead. A delegated `mousedown` on the tray root now turns the row's draggability off whenever a press begins inside `.tray-buttons`, so the action icons can never start a row drag; every fresh mousedown recomputes the flag and re-renders restore the template's `draggable="true"`, so dragging by the item image or name is unaffected.
- **The heart you click now repaints — the update was landing on the wrong heart**: a pre-existing bug the dead clicks had been masking. `_updateHeartIcons()` in the inventory, weapons, spells, and features panels searched the *entire tray* with `querySelector`, which returns the first match in DOM order — and the favorites panel sits above all four in the tray. Since `manageFavorite()` re-renders the favorites list *before* updating the hearts, the just-added favorites row stole the match: the class toggle landed on the favorites panel's always-solid heart while the icon actually clicked stayed stale until the next full render (the flag itself was always saved correctly, which is why a refresh showed the right state). Each panel now scopes the lookup to its own `[data-panel]` container. The same first-match hazard existed in `_updateLightIcons()` for inventory and weapons — a favorited torch renders a lightbulb in the favorites list too — and is scoped the same way.

## [13.3.15]

### Added
- **Quest menubar notifications are clickable**: Blacksmith 13.9.3 lets menubar notifications carry an `onClick`, and every quest notification now uses it. Clicking the persistent pinned-quest or active-objective notification opens the quest panel and scrolls to that quest — highlighting the specific objective for the objective tracker; the transient "objective completed" / "quest completed" toasts jump to their quest too, and quest-completed pulses for attention. The navigation is the same flow the canvas pin double-click has always used, now extracted into `focusQuestInPanel()` in `manager-pins.js` so both callers share one implementation (filter fallback, expand, scroll, highlight) instead of growing a second copy. The persistent notifications' handlers are set once at creation and deliberately **not** passed to `updateNotification` — instead they resolve the pinned quest / active objective from user flags at click time, so the text-only updates that swap which quest is tracked can never leave the handler pointing at the old one. Clicking removes the notification (Blacksmith behavior), and dismissal via timeout or the × now fires `onDismiss` — both paths null the stored static notification ID, which fixes a small pre-existing wart: closing the tracker with the × left a stale ID that the next update call had to trip over (a warning-and-recreate path) before recovering. Requires Blacksmith 13.9.3; on older builds the extra options argument is simply ignored and everything behaves as before.
- **Transient notifications for party-visible events** (new `manager-notifications.js`): short-lived menubar toasts now announce the moments the party cares about — a quest becoming active, available, completed (pulses), or failed; an objective completed, failed, reopened, or newly revealed (all linked: click jumps to the quest, highlighting the objective); a codex entry unlocked, i.e. its ownership raised to Observer (linked to the entry; a burst of unlocks from auto-discover collapses into one "*N* codex entries unlocked" toast instead of a barrage); an active effect landing on an actor you own (no link — there's nothing to open); and a party-visible note being edited (linked via the notes panel's existing `showNote`). The initiating user is always skipped — the GM who clicked the checkbox already got the local notification the panel has always shown; these toasts are for everyone *else*, riding the document hooks that broadcast the change to every client. Status changes need a before-state that update hooks don't carry, so quest statuses/objective states and codex visibility are snapshotted once at ready and diffed per update; pages first seen later enter the baseline silently. Player-facing guards: no toasts for quests flagged invisible, hidden objectives, private notes, or objectives *becoming* hidden (GM housekeeping). The codex pin double-click navigation moved to `focusCodexInPanel()` in manager-pins.js so pins and notifications share it, same as `focusQuestInPanel()`.
- **GM pins and active objectives now reach the players**: pinning a quest or setting an active objective as the GM changed nothing on any player's screen, which defeats the point of a party-wide quest tracker. Both are stored as per-user flags, so the GM's write only ever landed on the GM's own User document — no player tray, handle, or menubar notification could see it, and no hook existed to tell them anyway. Two halves fix it: the GM's pin/active/clear actions now mirror the flag onto every player's User document (`_mirrorTrackerFlagToPlayers` — GMs can write User documents; players' own pin actions stay local), and a new `updateUser` hook on each player's client reacts when *their* document is changed by *someone else* — the same asked-the-world pattern as the ownership hook, including the operator-prefix diff-key handling. The hook lifts the ×-dismissal suppression for whichever tracker actually changed (a GM broadcast is as deliberate as a local repin), explicitly clears an emptied tracker (the notify paths only create or update), re-renders the quest panel if it has rendered — or drives the notifications directly if the tab is still lazy, via the newly extracted `_checkAndNotifyActiveObjective()` — and refreshes the handle. Bonus: the GM hiding a quest already cleared player pin flags (`_unpinHiddenQuestFromPlayers`), but players never found out until reload; the same hook now picks that up too.
- **Dismissing a quest tracker notification now sticks**: previously the persistent pinned-quest and active-objective notifications came back on the next panel refresh no matter how the user got rid of them — any objective change re-ran the render-path notify and recreated what the user had just closed. The × is now remembered for the session (a static `…Dismissed` flag set in `onDismiss`, checked before recreating), and only a deliberate act lifts it: repinning a quest clears the pinned-quest suppression, setting an active objective clears the objective suppression. Clicking the notification body is *not* treated as dismissal — that's navigation, and the tracker returning on the next update is the point of a persistent tracker. A reload clears both flags, so the notifications reappear next session as before.

### Added
- **Drag items out of the character tray**: inventory, weapons, spells, features, and favorites are now draggable — to chat, a journal page, a Squire note, the hotbar, another actor's sheet, or any of Squire's own drop zones (codex links, quest participants and treasure, favorites). Nothing in Foundry drags unless it is explicitly wired to, and the tray never was: no `draggable` attribute, no `dragstart` handler. The payload is `item.toDragData()` — the canonical `{type, uuid, data}` shape every Foundry drop target already understands, rather than a hand-rolled object that would rot the moment core changed. The row carries `draggable="true"` in the template so it survives a re-render for free, and a single delegated `dragstart` on the stable tray root supplies the payload — bound once rather than per item per render, which is the pattern that keeps leaving handlers attached to markup that no longer exists.

- **Show a pinned codex entry on the canvas**: a codex entry pinned to the scene you're viewing now shows a crosshairs button that pans and pings its pin — the same control the Notes list gained. Available to players, not just GMs: the panel only shows an entry to someone who can observe it, and the pin inherits that ownership, so if they can see the card they can see the pin. `panTo` now lives in `manager-pins.js` (`panToPin()`) and both panels call it, rather than each reaching into the pins API themselves — that file is meant to be the single gateway, and this was about to become the third hand-rolled copy. `panToPin()` verifies the pin is on the scene you're actually viewing instead of trusting the caller, and says which scene it's on if not.

### Changed
- **Notes rows: a `...` menu instead of five buttons**: Give, Edit, and Delete move into a per-note `...` menu (the same Blacksmith context menu the codex entries and titlebars use), leaving the row as `[Show on Canvas] [Pin/Unpin] [...]`. Pin/Unpin is a single toggle again, exactly as before. "Give Note To..." only appears for a private note you author (or any private note, if you're the GM) — the same rule the old inline button used, now computed once in the note data instead of nested in the template, so the control and the menu can't disagree.

### Fixed
- **Handle condition click shows its icon and description again**: clicking a status icon in the tray handle produced a dialog with a broken image and "No description available." Two independent breaks, one dialog. The image read `event.currentTarget.src` — correct when each icon had its own listener, but the v13 refactor moved the handler to a delegated listener on the handle container, where `currentTarget` *is* the container div and `.src` is undefined; the src now comes from the clicked `<img>` itself. The description matched conditions on `condition.label`, a field dnd5e 4+ renamed to `name` (pre-localized at i18nInit), so the lookup matched nothing and the rules-journal reference was never followed; the match now checks `name` with a `label` fallback for older systems. The same rename had also silenced a dormant fallback: the handle icon map read `conditionTypes[...]?.icon`, which dnd5e renamed to `img`. The description is also readable now: it prefers the rule page's short `system.tooltip` over the full article (for pseudo-conditions like Diseased the referenced article is DM lore about plagues as plot devices, not a stat blurb — that's what dnd5e links to, so the tooltip is the sane cut), runs the text through `enrichHTML` so `&Reference[...]` and `@UUID[...]` render as proper reference chips and content links instead of raw enricher syntax, and drops the newline-split `<p>` re-wrapping that was mangling what is already paragraph HTML.
- **Codex and notes pin state no longer describes the scene you just left**: the "Show on Canvas" button, the pin icon's active/dim state, and the "pinned on *scene*" tooltip are all computed when the panel refreshes — and nothing refreshed those panels on a scene change. `canvasReady` only re-rendered the character panel, and the tray rebuild it calls first returns early whenever the current actor has a token on the new scene (the common case), so it couldn't be relied on. The stale control was live: clicking "Show on Canvas" for a pin left behind on the previous scene panned the *current* canvas to coordinates that meant nothing there and pinged empty ground. Both panels now refresh on `canvasReady` (only if they've actually rendered, so the lazy tabs stay lazy), and `panToPin()` re-checks the scene at click time rather than trusting the button — belt and braces, since any stale render would otherwise reintroduce it.
- **`PanelManager.instance.element` was permanently null, silently killing ~10 render paths**: every panel class assigns `this.element` in its own `render()`; `PanelManager` declared the same field to match that convention and then never assigned it — `createTray()`/`updateTray()` only ever wrote the **static** `PanelManager.element`. So `instance.element` sat at its constructor `null` forever while ten call sites across `squire.js`, `panel-party.js` and `manager-panel.js` read it to decide whether to render, or passed it straight into `render()`. All failed silently, with no error, because passing `null` to a render is a no-op and `&& instance.element` is just false. Casualties: **`updateTray()` could never run at all** (it guarded on `this.element`, then used `PanelManager.element` to do the work — mixing the two in one method); the global `updateActor` hook's AC/movement branch was gated behind `&& instance.element`; and the item-transfer drop handler re-rendered five panels into `null`. `element` is now a getter onto the static, so the two can never drift apart again.
- **Players see ownership changes without reloading**: when a GM granted or revoked a player's ownership of an actor, the character switcher didn't change until that player reloaded their client. The switcher is built from `game.actors.filter(a => a.isOwner)` in the **tray's** render data, and every existing `updateActor` hook is scoped to something that is false in exactly this case — the party and party-stats hooks bail on `hasPlayerOwner`, and the global hook bails unless the changed actor *is* the one being viewed. Granting a player a new actor while they were looking at a different one therefore reached nothing. Ownership changes now get their own hook that re-renders the tray. It decides whether to act by recomputing which actors the user owns and comparing that to the last rendered set — asking the world rather than parsing the diff. That matters, because the diff is not shaped the way it reads: a permission change arrives as `{ "==ownership": {...} }` — Foundry prefixes diff keys with operators (`==` replaces an object wholesale, `-=` deletes) and may flatten paths — so `changes.ownership` is simply `undefined` and any check for it silently drops every grant. Asking `actor.isOwner` instead sidesteps the whole encoding, and folds in default permission, per-user grants, removals, and GM status for free. Comparing the owned set also collapses a GM's bulk permission edit into a single rebuild instead of one per actor. If the revoked actor is the one the player is *currently* viewing, the tray now falls back — assigned character, then any owned character, then anything else owned, then the no-character state — rather than leaving them on a sheet they can no longer open.
- **Codex auto-discovery now sees items inside containers, and weapons**: the scan filtered inventory to `['equipment','consumable','tool','loot','backpack']`. dnd5e 5.x migrates the `backpack` item type to `container` on load (`dnd5e.mjs:75937`), so a modern world has no `backpack` items at all — containers were excluded from the scan outright, and `weapon` was never in the list, so an artifact that happened to be a sword could never be discovered. The code that was *meant* to walk container contents was dead three times over: it tested `item.type === 'backpack'` (now `container`), read `item.contents` (the getter lives on the data model, `item.system.contents`), and guarded with `Array.isArray()` on what dnd5e returns as a `Collection`. It has been removed rather than repaired — dnd5e stores a contained item as an ordinary embedded item on the actor tagged with `system.container`, never nested inside the container, and `Container#contents` is itself derived by filtering `actor.items`. So `actor.items` already holds everything in every container at any depth; the walk was redundant as well as broken. Both the matching pass and the "Discovered By" attribution pass now share one item-type list, so they can no longer disagree about what counts as owned.
- **Notes: unpin no longer strands an orphan pin**: unpin used `pins.unplace()`, which moves a pin into Blacksmith's *unplaced* store rather than deleting it. Notes have no UI that can ever re-place an unplaced pin, so every unpin left an orphan there with the page's `pinId` flag still pointing at it — and the GM's every-refresh ownership sync calls `pins.update()` for any note carrying a `pinId`, which is the source of the repeated *"Pin not found — it may have been deleted externally"* in the console. Unpin now **deletes** the pin, which is what the button has always claimed to do; the `deleted` hook clears the flag, so no orphan and no stale flag. Deleting also happens while the pin is still on the scene — the path that tears the canvas element down properly.
- **Notes: you can find a pinned note on the map again**: dropping the card view in 13.3.11 removed `.note-location-section` — the element whose click handler panned the canvas to a note's pin. The handler survived the refactor and kept binding to a selector that no longer matched anything, so the capability silently vanished with no error and no replacement control. A pinned note on the current scene now shows a **Show on Canvas** crosshair button that pans and pings the pin. It appears only when the pin is on the scene you're looking at, which is the only time panning can do anything.

## [13.3.13]

### Changed
- **One journal picker, sorted, everywhere**: `showJournalPicker()` had two UIs — a clean dropdown and a wall of book cards — and the **grid was the default**, so Quests and Notes got it purely because they never passed `mode: 'select'`. Only Codex opted into the dropdown. The grid is deleted (121 lines → 73), along with the gold thumbtack it drew on the current selection (tooltip: "Pinned for players" — it did nothing) and the "Refresh List" button, which existed because the grid was built once and went stale. Every picker is now the same dropdown, **sorted alphabetically** with the clear option pinned first — Codex's list was unsorted because the caller hand-built its own `choices` in `game.journal` order; the helper now builds and sorts them, so that call site loses its inline copy too. Journal names are escaped on the way into the `<option>`. The hint above the control is plain text in Foundry's native `.notes` style instead of a hand-styled panel of `<p>` tags with inline colours, and it no longer restates the dialog title: Notes says *"Players need Observer ownership on this journal to create notes."*, Quests says *"Each page in this journal is one quest."*


### Fixed
- **Codex pins use their category's icon again**: the tray card and the canvas pin each kept their own category→icon map, and they drifted — 13.3.9 added `Establishments` (fa-shop) and `Landmarks` (fa-monument) to the tray's map only, so pinning either produced the `fa-book` fallback, and `Lore` was in neither. The pin also ignored an entry's custom `system.categoryIcon`, which the tray has always honoured, so a custom icon appeared on the card but not on the map. There is now one map (`CODEX_CATEGORY_ICONS` in `const.js`) used by both surfaces, plus `Lore` (fa-scroll); adding a category in one place now covers card and pin together. Existing pins keep their old image until re-pinned or until their entry is edited (`updateCodexPin` refreshes it).
- **Codex auto-discovery scans the party, not the canvas**: the inventory scan built its actor list from `canvas.tokens.placeables`, so it only ever saw player characters deployed on the currently-open scene — a PC who wasn't on the map was silently skipped, and anything in their pack failed to reveal its codex entry. Worse, the result depended on which scene happened to be open when the GM ran it. Discovery is about what the party *owns*, so it now uses the same `getPartyActors()` (Blacksmith's configured campaign party) as the rest of the module. The scan no longer touches the canvas at all, and the "Discovered By" attribution covers every party member rather than the deployed subset.

## [13.3.12]

### Added
- **Quest and Codex imports turn plain-text names into document links**: Squire had no name→document lookup of any kind. An imported treasure entry `{ "name": "Arcanic Wayfinder Part 2: Casing" }` was written into the journal as plain text and stayed plain forever; the only links that ever appeared were ones that arrived pre-baked as `@UUID[...]` in the JSON or were dragged in by hand. Both import paths now resolve bare names through Blacksmith's Compendiums API (`api.compendiums.resolveMany`), which owns the GM's compendium mapping and all of the search semantics — world-first/world-last ordering, exact-across-all-sources-then-prefix tiering, and Spell/Feature subtype filtering. Squire still contains zero compendium search code: names go in, UUIDs come out. Quest treasure resolves as `item`, participants as `actor`. Entries already carrying a UUID pass through untouched, and anything that fails to resolve falls back to its plain name, so the worst case is exactly the previous behaviour. New `scripts/utility-resolver.js` is the single place Squire touches the API; resolution is batched by type via `resolveMany`, and Blacksmith caches each pack index after first read, so a large import doesn't re-read them per name.
  - **Requires Blacksmith 13.8.4+** for `api.compendiums`. On an older Blacksmith the resolver simply isn't there and every name falls back to plain text — no error, no links.
  - **Requires the GM's Blacksmith Compendium Mapping to include the world for the type being resolved.** Player characters and most NPCs live in the world, not a compendium, so an Actor mapping with world search disabled resolves *nothing* — quest participants and Characters codex entries stay plain text even though the actors plainly exist. If names aren't linking, check Compendium Mapping in Blacksmith's settings before suspecting the import. Nothing in Squire can detect this and warn you; the import reports the names as unresolved and is otherwise silent.
- **Codex: `related` entries — a relationship graph between codex entries**: a new `related` field holds plain names of other codex entries (`"related": ["Valjevo Castle", "Black Fist"]`), rendered as a **Related** section on the card and as links. Codex entries are `JournalEntryPage`s inside one journal, so they can never be found by the compendium resolver (`type: "journal"` searches `game.journal`, i.e. JournalEntry *documents*) — feeding a real AI-authored codex to the resolver above produced 22 links on one entry of which **19 were structurally unresolvable**, every one of them a place, faction, or district. The model wasn't over-linking; it was describing a graph the schema had no field for. Resolution is a `Map<name, page>` built once per render from the codex journal's pages, which is also why `related` stores **only names**: a name whose entry doesn't exist yet renders as plain text and becomes a link the moment that entry is created — no rescan, no stored UUID, and no import-ordering problem (an entry may reference one defined later in the same JSON array). The index respects the viewer, so players never see links to entries they can't open.
- **Codex: location levels are links**: the REALM / REGION / SITE / AREA rows on a card resolve through the same page index, so an entry whose location is `"Faerûn > Moonsea > Phlan"` links each level to that entry when it exists. Related and location references open the target **in the tray** — expanded, scrolled to, and flashed, exactly as double-clicking its codex pin does — because they name codex entries, not documents. Document `links` are unchanged and still open the document itself. This is what makes `related` non-hierarchical: the path is already a relationship and is now navigable as one, so `related` is reserved for connections the hierarchy doesn't carry.
- **Codex: "Auto-Link Unresolved Links" (GM)**: a codex-menu action that retries every unresolved *document* link against Blacksmith's compendium mapping, using the same progress bar as inventory auto-discovery and the same asserted/speculative reporting as import. Only document links need it — `related` and location levels self-heal at render. Manual by design: it is a bulk write to journal pages, so an import now *reports* how many links are still unresolved and points at the action rather than running it unasked.
- **Codex: typed cross-reference links, and a self-link derived from the category**: `links` entries may now be `{ "name": "...", "type": "actor" | "item" | "spell" | "feature" | "journal" | "rolltable" }` — plain names the importer resolves, instead of UUIDs a generator has no way to know. Each link carries its **own** type because codex links are heterogeneous cross-references (an NPC entry may point at the actor, their faction's journal, and their sword); a category describes the entry, not the documents it points at. Separately, an entry's own name is resolved using its category (Characters → actor, Items/Artifacts → item, everything else → journal), so an entry about a real document links to it with no authoring at all. The AI prompt's standing instruction — *"Always leave `links` as an empty array — document links are attached inside Foundry by dragging documents onto the entry, never generated here"* — is removed: it was a workaround for the missing resolver, codified as policy. **Unresolved names are retained, not discarded**: `links` stores `{name, type, uuid?}`, an unresolved link renders as plain (dimmed, italic) text, and "Auto-Link Unresolved Links" retries it later. A codex is authored incrementally — a name written before its document exists is a real statement, and the source JSON is gone by the time it would matter. Link identity is therefore the **name**, not the uuid: a uuid is the *result* of resolution, so keying on it would give one link two identities either side of Auto-Link and duplicate it on merge. Legacy links (uuid + label, no name) backfill `name` from `label`, so old data stays stable with no migration.
- **Imports report what linked and what didn't**: quest and codex imports now notify the GM (`linked 3 references. 1 named reference did not resolve.`) with a full report — resolved count, misses, and inexact (`startsWith`/`includes`) matches — logged via `postConsoleAndNotification`. Misses are split by kind: an explicit `{name, type}` link is an **assertion** that a document exists, so its miss is reported; an entry's category-derived self-link is **speculation** (most Locations and Factions legitimately have no same-named journal), so its miss stays in the debug payload only. Without the split a 50-entry codex import would announce "3 of 50 linked" and train the GM to ignore the notification. Inexact matches are surfaced separately because `startsWith` can silently grab the wrong document.


### Fixed
- **HTML escaping no longer builds a DOM node per call**: `escapeHtml()` used a `createElement`/`textContent`/`innerHTML` round-trip. It runs up to twice per related name and per location level, so a real 314-entry codex was paying thousands of DOM node constructions on **every** render — every pin toggle, visibility flip, and import step. Now a regex replace. It also closes a correctness hole: the DOM approach leaves `"` and `'` unescaped, and the escaped value is interpolated into a `data-uuid="…"` attribute.
- **Codex no longer jumps to the top when you pin, unpin, or reveal an entry**: `render()` replaces the panel's `innerHTML`, which destroys the `.codex-content` scroll container and recreates it at `scrollTop` 0 — so any action that re-renders threw the GM back to the top of the codex. Scroll position is now captured before the rebuild and restored after listeners are attached (the notes and quest panels already did this; codex was the one that didn't).
- **Codex categories no longer collapse on every render (pinning, unpinning, importing, revealing an entry)**: `render()` applied collapsed state **twice** — once correctly from the template (`cat.collapsed`, an exact key lookup on `codexCollapsedCategories`), and then again in a second pass that iterated *every* key in the flag and matched sections with `.trim()`. That mattered because an older version derived those keys from rendered element text, so real worlds have flags polluted with entries like `" Locations\n "`, `" Artifacts\n \n Browse\n \n \n "`, and HTML-escaped `"Crafting &amp; gathering"`. Trim-matching made a junk key saying *collapsed* silently override the real key saying *expanded* — on every single render. The redundant pass is removed (the template already does this correctly), and malformed keys are pruned once per session so the flag stops growing and no future trim-style matching can revive the bug. Separately, jumping to an entry via a Related/location reference or a codex pin double-click now *records* the category it opens, instead of only removing a CSS class the next render would undo; all category-collapse writes go through one helper rather than three copies of the same update.
- **Codex entries no longer collapse themselves when you touch anything**: the card template hard-coded `class="codex-entry collapsed"` and expansion lived only as a DOM class, so *any* re-render — pinning an entry, toggling its visibility, an import, an Auto-Link pass — slammed every open card shut. Which entries are expanded is now tracked per entry and persisted to the `codexExpandedEntries` user flag, so it survives both re-render and reload (matching how `codexCollapsedCategories` already worked for category headers). Stale ids are pruned on write, since re-import replaces pages with new uuids. Double-clicking a codex pin records the expansion too, so the entry it opens also stays open — it previously reopened and then closed itself on the next refresh.
- **Editing a codex pin's visibility in Configure Pin now says it does nothing, instead of silently doing nothing**: codex pin visibility is *derived* from the codex entry's ownership, not configured — and the pin's `ownership` (not `blacksmithVisibility`) is what actually gates players. So setting a codex pin to "visible" on a hidden entry was a triple no-op: it didn't reveal the entry in the tray, it didn't show the pin to players (ownership still excluded them), and `updateCodexPinVisibility()` silently reverted it the next time the entry's visibility changed. The GM saw the pin change in their own view and concluded it had worked. The edit is now detected on the `pins.updated` event (gated on `patch.config.blacksmithVisibility`, so Squire's own sync writes never trip it) and answered with a notification pointing at the entry's visibility toggle in the tray, which is the control that actually does this. Behaviour is unchanged — visibility still follows the entry; only the silence is fixed.
- **Re-importing a codex entry no longer destroys hand-dragged links**: the importer rebuilt `system.links` from the JSON alone and handed it to `page.update()`, which replaces arrays wholesale — so any document a GM had dragged onto an entry vanished on the next re-import of that codex, unrecoverably (the link never existed in the JSON). Dragging was the *only* way to add a codex link before this release, so every link in an existing codex was exposed to this. Links already on the page that an import doesn't produce are now preserved. The trade-off is that a link can no longer be removed by re-importing — remove it in the Edit Entry window instead; silently destroying manual work is the worse failure. (The same defect on quest treasure is fixed below; they were one bug wearing two hats.)
- **Re-importing a quest no longer strips hand-dropped treasure links**: `_mergeJournalContent` carefully preserved existing task state, status, and participants, but rebuilt the treasure list from the import JSON alone — so a UUID a GM had dragged onto a quest was silently downgraded to dead plain text on the next re-import of that quest, with no way to recover it (the link isn't in the JSON). Existing treasure UUIDs are now extracted from the journal and re-attached by name before resolution. The import remains the source of truth for *which* treasure exists; the journal keeps the *link* for anything it already had. A UUID a human picked by hand outranks whatever the resolver would guess for the same name.
- **Codex auto-discovery: entry names containing a double space never matched party inventory**: item names were normalized with `.toLowerCase().replace(/\s+/g, ' ').trim()` in four places, but the codex entry name they were compared against got only `.toLowerCase().trim()` — no interior-whitespace collapse — so any entry whose name contained a run of two or more spaces could never be discovered, even against an identically-named item. All five sites now share one `normalizeItemName()` helper; inlining the expression is how the two sides drifted apart in the first place.

### Changed
- **Party roster comes from Blacksmith's Campaign API**: four sites independently rebuilt "the party" as `game.actors.filter(a => a.type === 'character' && a.hasPlayerOwner)` — the quest participant picker, both `autoAddPartyMembers` import paths, and the MVP leaderboard — and had already drifted apart (only the leaderboard excluded token actors). All four now call one `getPartyActors()` in `helpers.js`, which returns `api.campaign.getParty().members` resolved to actors in the GM's configured order. Worlds with no configured party fall back to the historical heuristic (now including the `!isToken` guard everywhere) so nothing silently empties. Note this is the *configured* party — "tokens on the canvas" and "actors I own" remain separate concepts with their own call sites and are unchanged.
- **Blacksmith API docs are referenced, not vendored**: `documents/blacksmith/` held four copies of Blacksmith's API docs (`api-core.md`, `api-canvas.md`, `api-chatcards.md`, plus a Squire-authored `blacksmith-apis.md` index). The `api-core.md` copy predated the Compendiums API and still taught the `BLACKSMITH.arrSelected*Compendiums` iteration pattern that Blacksmith's own current doc opens by marking **"⚠️ Superseded by the Compendiums API"** — and the index listed the Campaign API but no Compendiums entry at all, which is a fair part of why the resolver was never wired. All four are deleted in favour of a pointer in `documents/architecture-squire.md`: the Blacksmith repo's `documentation/api/*.md` is the source of truth, the wiki is a convenience mirror in a separate repo that does not auto-update, and where they disagree the repo wins.

### Removed
- **Dead "Item Lookup" compendium settings**: `itemCompendium1`–`itemCompendium5` ("The #N compendium to use for item linking. Searched in order.") and `searchWorldItemsFirst` were registered in Squire's own namespace and read by **no code anywhere in the module** — they described an item-linking search that did not exist. A GM could configure all five and get silence. `searchWorldItemsFirst` was additionally registered **twice**, at two separate points in `settings.js`, with identical definitions. Blacksmith's compendium mapping replaces all six: configure compendiums once in Blacksmith and every Coffee Pub module resolves against them. Existing stored values become inert.
- **Dead `_getItemUUID()` helper** (`manager-panel.js`): hand-built `@UUID[Compendium.${pack}.Item.${id}]{...}` strings and was never called from anywhere.

## [13.3.11]

### Changed
- **Notes tray is list-only**: Removed the card / list view toggle. The Notes tab always uses the compact list rows (title, visibility, pin/edit actions). The light / dark list theme toggle remains in the notes `…` menu (still stored as `notesCardTheme` so existing prefs keep working).

### Added
- **Notes list hover preview**: Hovering a note title shows a Foundry `data-tooltip` with a plain-text excerpt of the note body (stripped HTML, truncated). Opening the note window still shows the full enriched content.

### Fixed
- **Notes tray refresh cost**: `_refreshData()` no longer runs `enrichHTML` for every changed note just to paint cards. The list builds from flags + raw page text; enrichment stays in the note window.
- **Note window view mode – `@UUID` links not enriching**: Read-only note content was injected as raw HTML (`{{{note.content}}}`), so `@UUID[...]{Label}` strings stayed literal. View mode now runs `TextEditor.enrichHTML` (documents/links/rolls) before render; edit mode still uses raw content for ProseMirror.

### Removed
- **Notes card view UI**: Card templates, card CSS, and the `notesViewMode` user flag. Existing `notesViewMode` values become inert; `notesCardTheme` continues to drive list light/dark.

## [13.3.9]

### Added
- **Codex data model — custom journal page type**: Codex entries are now a real Foundry page subtype (`coffee-pub-squire.codex`) instead of parsed HTML. Structured fields (summary, category, plot hook, location, link, tags, image, discovered-by) live in `page.system` with a `TypeDataModel` schema — nothing is scraped from page HTML anymore, so a hand-edit can no longer silently break an entry. The page's native `text.content` holds **Expanded Details**: free-form rich lore edited with the standard ProseMirror editor and rendered below a styled field block by a custom page sheet (extends the v13 `JournalEntryPageTextSheet`). "Codex Entry" appears as a page type in the journal's Add Page dialog.
- **Codex: Expanded Details + "Read More"**: The tray card stays bite-size and gains a **Read More** pill button (book icon, animated chevron, orange accent) on every entry — right-aligned below the summary — that opens the entry's journal page in the reading view (the custom sheet: image, summary, meta fields, then the full lore). The tooltip notes when expanded details are present.
- **Codex: card layout — links and location**: The entry card lists each link on its own line under the LINKS label, and the location renders as labeled hierarchy rows (REALM / REGION / SITE / AREA) matching the picker's levels; empty levels don't render.
- **Codex: location picker polish**: Each level's dropdown includes a "+ New …" item (clears and focuses the segment); level labels and inputs carry Foundry tooltips defining Realm/Region/Site/Area with examples; placeholders read as hints ("e.g. Faerûn", italic and dimmed) instead of resembling entered values.
- **Codex: Edit Entry window validation**: Saving with a missing name or category no longer reaches the document layer (previously a `DataModelValidationError`) — the save action now runs the form's native required-field validation (`reportValidity`, with the standard browser cues) plus a hard guard with a clear warning notification.
- **Codex: Expanded Details editor height**: The Edit Entry window's lore editor grew from 280px to a 700px minimum (capped at 75% of viewport height) — comfortable for long-form writing.
- **Codex: Expanded Details editable in the Edit Entry window**: The tray's Edit Entry window gains an "Expanded Details" section with a full ProseMirror rich-text editor bound to the page's `text.content` — create or edit an entry's lore without leaving the form. The editor is mounted programmatically via `HTMLProseMirrorElement.create({ value })` (the same pattern as the note window) because the `<prose-mirror>` element discards innerHTML, and its live state is read directly on submit (`prose-mirror` elements aren't reliably captured by `FormData`).
- **Codex: journal page edit form restyled**: The typed page's edit mode now renders as a structured form — "Codex Fields" section header, full-width Summary/Plot Hook, a two-column grid for Category/Location/Link, a `<string-tags>` chip input for tags (submits a real array — a plain text input was saving the whole comma string as one giant tag), uppercase field labels, and an "Expanded Details" divider ahead of the standard ProseMirror content editor.
- **Codex: multiple links with drag-to-link**: The single Link UUID field is replaced by a `links` array in the data model. The Edit Entry window's Links area is a drop zone — drag actors, items, journal entries, or pages onto it to link them (deduped by UUID), shown as removable chips; the auto-populate drop zone now *adds* a link instead of overwriting one. The tray card and journal page render all links as enriched content links, and the journal page's edit mode has its own links drop zone (chips with remove, drag documents to add — writes `system.links` directly). Import/export use `links` (legacy single `link` still accepted on import); the AI prompt pins `links` to an empty array — links are attached in Foundry, not generated.
- **Codex: hierarchical location picker**: The Edit Entry window's location select is replaced with a segmented Realm > Region > Site > Area path — four combo inputs joined by chevrons, each offering every value already used at that depth across the codex (caret shows the full list, typing filters it, free text creates new values). Custom dropdowns, not native `<datalist>` — Chromium positions datalist popups in pre-transform viewport coordinates, which renders them nowhere near the input inside Foundry's transformed windows. Segments join to the canonical `"A > B > C"` string on save. The AI prompt now defines the hierarchy's makeup (Realm/Region/Site/Area, broadest to most specific, reuse exact spellings so levels group).
- **Codex: Edit Entry window layout**: The image section is compact — thumbnail preview and Browse button side by side instead of a tall stacked block.
- **Codex: entry image derives from the first Expanded Details illustration**: Restored the pre-data-model behavior — the tray card image is `system.img` if explicitly set, otherwise the first `<img>` in the page's Expanded Details. The journal page edit form has no image field (the illustration IS the image); the Edit Entry window previews the resolved image and only writes `system.img` when the user explicitly picks a different one, so a lore-derived image stays dynamic rather than being frozen on save. Export emits only the explicit `system.img` (a derived image already travels inside `expandedDetails`).
- **Codex: category icons for Establishments and Landmarks**: `getCategoryIcon()` gains `Establishments` (fa-shop) and `Landmarks` (fa-monument); the AI prompt template now instructs place-related entries to be split — Establishments for businesses/services, Landmarks for distinctive named sites, Locations reserved for broad geography — to keep the Locations category from absorbing everything.
- **Codex: import/export on the new model**: The JSON schema gains optional `expandedDetails` (HTML string → `text.content`); export emits the clean schema (name/img/category/summary/plotHook/location/link/tags/uuid/expandedDetails) instead of dumping internal panel state. Import creates typed pages; when it matches an existing **legacy text page** (by `codexUuid` flag or name) it **replaces** it with a typed page, preserving ownership and sort — **re-import is the conversion path** (no automated migration, by decision). The AI prompt template documents `summary` and `expandedDetails`.

### Fixed
- **`ImagePopout` deprecation warnings eliminated (v13 AppV2 signature)**: All four call sites (codex entry image, character portrait, party card portrait, quest window image preview) used the legacy `new ImagePopout(src, { title })` constructor, which logs deprecation warnings since v13 and breaks in v15. All now use `new foundry.applications.apps.ImagePopout({ src, uuid, window: { title } })`.

### Changed
- **Codex: "Description" renamed to "Summary"**: The tray card label, the Edit Entry window field, the data model field, and the import/export schema all use *summary*. Import still accepts JSON with legacy `description`.
- **Codex panel reads typed pages only**: Legacy text pages in the codex journal are no longer displayed; the GM gets a one-time notice with the count and the re-import instruction. The Edit Entry window prefills from and saves to `page.system` (it never touches Expanded Details), and refuses to save over a legacy page. Auto-discovery records discoverers in `system.discoveredBy` instead of injecting an HTML paragraph.

## [13.3.8]

### Fixed
- **Journal/party tabs render lazily**: `renderPanels()` built and rendered the Notes, Codex, Quest, and Party panels on every full tray render even when their tabs were disabled in settings or simply not the active tab. Disabled tabs now never render; enabled-but-inactive tabs defer their first render until the tab is actually opened (or an event-driven refresh renders them), then stay warm. The persistent pinned-quest menubar notification — previously restored from the quest render path — is still established on load without paying for a full quest panel render.
- **GM Details biography: cleaned block-formatted text instead of raw HTML, cached**: The biography rendered as raw enriched HTML (images, embeds, and all) via `{{{biographyHtmlRaw}}}`, which displayed poorly in the narrow GM panel — and `CharacterPanel.render()` re-ran `TextEditor.enrichHTML` on it every render, which since 13.3.6 includes every AC/movement/effect tick. The biography is now enriched (so `@UUID` links resolve to display names and `@Embed[...]` references expand to their content), stripped of media only (images, video, audio, iframes — NOT `<figure>` wrappers, which is how Foundry delivers embedded journal content and dnd5e 2024 monster descriptions), and extracted **block-aware**: one paragraph per source block element, headings kept distinct (bold uppercase), figure captions preserved as text, list items bulleted, and table rows joined cell-by-cell with separators — a flat plain-text extraction was mashing headings into adjacent sentences and collapsing table rows into unreadable fragments. All extracted text is HTML-escaped before rendering. The result is cached by the raw source string so the enrich+parse cost is paid only when the biography actually changes. `biographyHtmlRaw` is removed from the data flow entirely.
- **Quest pins: removed the write-only `sceneId` mirror flag**: `_syncQuestPinMirror` wrote a `sceneId` flag on quest pages after every pin place/unplace that no code ever read — quest scene resolution comes from live Blacksmith pin records per the pinId-only contract. Each write was a pointless world document update whose cascade also invalidated the new page-parse cache for that page. Only `pinId` is mirrored now; existing stale `sceneId` values on quest pages are inert. (Notes' own `sceneId` flag is unrelated note metadata and is untouched.)

## [13.3.7]

### Fixed
- **Notes/Codex/Quest panels no longer re-parse the entire journal on every render**: Each panel's `_refreshData()` re-enriched (`TextEditor.enrichHTML`) and re-parsed every page of its journal on every refresh — cost scaled with total journal size, not with what changed (the quest panel calls `_refreshData()` from ~10 sites). All three panels now cache parsed page data keyed by page UUID + `_stats.modifiedTime`: unchanged pages skip enrich+parse entirely, and any document update (content, flags like `pinId`/`visible`, ownership) invalidates exactly that page. Volatile state is still recomputed on every refresh — live pin/scene lookups, codex ownership and active-scene pin flags, quest numbers, notes editor avatars — so nothing canvas- or Blacksmith-dependent is served stale. Caches prune against the journal's current pages, which also handles switching journals. With a 100-entry journal, editing one note now costs one enrich+parse instead of one hundred.
- **Party panel renders debounced and gated**: The panel re-rendered fully on every token movement step, every HP tick, and once per token during multi-select (`controlToken` fires per token). The three handlers now coalesce through a 100ms debounced render, and the hook wiring ignores tokens/actors without player owners — NPC movement and NPC updates no longer touch the party panel at all. With this, all four of Squire's `updateActor` hook registrations (character, party, party-stats, global) cheap-exit on irrelevant updates.


## [13.3.6]

### Fixed
- **Handle no longer renders the entire tray template on every update**: `HandleManager.updateHandle()` rendered `TEMPLATES.TRAY` — the markup for every panel — into a temp div just to slice out the handle wrapper, on nearly every actor/item/effect hook (many times per second in combat). It now renders only the view-specific handle template (`handle-player`/`handle-party`/`handle-notes`/`handle-codex`/`handle-quest`) directly into the wrapper.
- **Handle listeners bound once instead of clone-and-rebind per update**: `_attachHandleEventListeners()` cloned the whole `.tray-handle` (plus ~10 individual buttons) and re-attached ~15 listeners on every `updateHandle()`. All handle handlers are now delegated to the stable `.tray-handle` element and bound once per tray. This also fixes two silently broken handlers: the party-member portrait click was attached to the detached pre-clone element, and the pinned-quest objective tooltips used non-bubbling `mouseenter`/`mouseleave` with delegation (now `mouseover`/`mouseout` with a `relatedTarget` guard, so the tooltips actually work).
- **Pinned quest no longer re-parsed on every handle update**: With a quest pinned, every `updateHandle()` ran `fromUuid` + `enrichHTML` + `QuestParser.parseSinglePage`. The parsed result is now cached by quest UUID + page `modifiedTime` and only re-parsed when the pinned quest changes or its journal page is actually edited.
- **Party-stats leaderboard recompute debounced and filtered**: Every `updateActor`, `updateCombat`, and `createChatMessage` triggered an immediate full leaderboard recompute with one sequential `getStats` await per party member. Updates are now debounced (250ms trailing), stats fetch concurrently via `Promise.all`, NPC/monster actor updates are ignored, and plain chat messages (no rolls) no longer trigger a recompute at all.
- **Item updates re-render less**: A single item change re-rendered weapons/inventory (already type-gated) plus the favorites panel plus a full handle rebuild regardless of what changed. Now: invisible changes (e.g. description edits) skip all re-renders; the favorites panel only re-renders when the changed item is actually favorited; and the handle only rebuilds when the item is a handle favorite (the handle displays nothing else item-derived).
- **Handle quest objectives now number 1→n top-to-bottom**: The handle content wrapper renders vertically via `writing-mode: vertical-lr` + `rotate(180deg)`, which reverses the visual order of flex children — so objective 1 appeared at the bottom. A scoped `flex-direction: row-reverse` on `.handle-pinnedquests` cancels the rotation for the quest progress strip. (Fixed in CSS deliberately — reversing the tasks array in JS would have broken `data-task-index` and the `{{add @index 1}}` numbering.)
- **AC/movement changes no longer rebuild the whole tray**: `changes.system.attributes.ac`/`movement` were in the "major change" set that triggered full `PanelManager.initialize()` + `renderPanels()` — but both recompute constantly from active effects, conditions, and mounts. They now do a targeted character-panel + stats-panel render plus a handle update. Full re-initialization is reserved for name/image/proficiency/level changes.
- **`blacksmith.pins.resolveOwnership` hook no longer duplicates on module re-enable**: The ownership resolver was registered with a bare `Hooks.on(...)` — no stored ID, no teardown in `teardownPinManager()`, and no duplicate guard, so each disable→re-enable cycle stacked another resolver. Now tracked in `_resolveOwnershipHookId`, guarded on registration, and removed on teardown, mirroring the `updateScene` sync hook pattern.
- **Health window: no more scrollbar-inside-a-scrollbar on multiselect**: The popped-out health window reuses the tray's `panel-health.hbs`, whose `.tray-panel-content` wrapper gets a tray-sized `max-height: 200px; overflow-y: auto` from common.css — nesting its own scrollbox inside the window's scrolling `.window-content` when many tokens are selected. The tray scope already had an `overflow: visible` override (panel-health.css) but the popout scope never got it; the override is now mirrored for `.squire-popout`/`.squire-window-health`, so the window's own scrollbar is the only one. (Root-cause follow-up tracked in TODO.md: migrate the five legacy V1 `Application` windows to the Blacksmith window framework.)
- **Favorites panel: removed all seven `cloneNode` listener-rebind sites**: Every listener was already registered with an `AbortController` signal that `_activateListeners` aborts before rebinding, making the clone-and-replace dance (the pre-signal listener-stripping mechanism) pure redundant DOM churn on every render. The filter toggles and clear-all button now bind directly; the per-item roll-overlay and detail-icon bindings became single delegated listeners on the panel, so listener setup no longer scales with favorites-list size.

## [13.3.5]

### Fixed
- **Tray: handle no longer updates twice per HP/effect change**: The `globalUpdateActor` handler called `updateHandle()` for HP/effect changes, then fell into a separate `if (spells) ... else updateHandle()` branch that ran it **again** for any update without a spell-slot change — two full handle rebuilds per HP tick during combat. The branches are now structured so the handle updates at most once per actor update; spells-only changes still skip the handle and re-render just the spells panel.
- **Memory leak: Health, Dice Tray, and Macros panels stranded `actor.apps` registrations on actor switch**: All three panels self-register via `actor.apps[this.id] = this` so Foundry re-renders them on actor updates, but `HealthPanel` and `DiceTrayPanel` had no `destroy()` method and `MacrosPanel.destroy()` never deleted its `apps` entry. Every hard actor switch stranded a dead panel — holding detached DOM — on the previous actor, and Foundry kept invoking `render()` on those dead panels on every future update of that actor (a GM cycling NPC tokens accumulated one dead panel per actor per panel type). All three now unregister from `actor.apps` in `destroy()`; `PanelManager.cleanup()` also now delegates panel destruction to `_cleanupOldInstance()` so the full panel set is torn down on module disable.
- **Tray: half-updated state after multiple token deletions**: When the GM deleted several tokens at once (e.g. both characters a player owns), the per-event `deleteToken` handler raced against itself — one event's direct panel-field reassignment interleaved with another's rebuild, leaving the handle showing one actor and the panels another. The handler now coalesces deletion bursts with a 100ms debounce and performs one full rebuild through `PanelManager.initialize()`. The old direct-reassignment branch (which also skipped the `actor.apps` handoff) is deleted.
- **Tray: deleting the last owned token left a stale tray**: The `deleteToken` handler nulled `PanelManager.instance` directly — skipping panel destruction and leaving the tray showing the deleted actor. Worse, the rebuild was silently swallowed by the 100ms init debounce, which the `controlToken` release event stamps just before `deleteToken` fires. `initialize()` now accepts a `force` option for deliberate rebuilds, and the `controlToken` handler ignores release events for tokens that no longer exist in the scene.
- **Inventory: NEW badge now appears for drag-dropped items**: The `isNew` flag behind the inventory panel's NEW badge was only ever set by transfer flows — plain drag-drop from the sidebar or a compendium never set it (the `markItemAsNew()` method built for this had no callers). The `createItem` hook now sets the flag before panels render, only on the creating client (avoiding duplicate flag writes from other connected clients) and directly on the item document (so it also works on unlinked NPC tokens). The badge clears after ~5 minutes via the existing sweep.
- **Idle 30s sweep no longer writes documents or re-renders**: `cleanupNewlyAddedItems()` iterated all actor items calling `unsetFlag(...)` every 30 seconds with no idle guard, and the sweep force-rendered the inventory panel every pass regardless of change. The sweep now early-returns when nothing is tracked and the current actor's flags were already swept, scans for stray `isNew` flags once per actor (flags persist across reloads while the tracking map doesn't), and only re-renders the inventory panel when a NEW marker actually expired or was cleared.

### Added
- **Character switcher**: Players who own more than one actor get a row of portrait chips directly under the tab bar, above the character identity block. Any owned actor is included — NPCs like pets and companions, not just characters — sorted assigned character first, then characters, then the rest. Chips are grouped — actors with a token on the current scene first, then a thin divider, then off-scene actors rendered slightly desaturated with a "(not on this scene)" tooltip; all remain clickable (switching to an off-scene actor changes the tray without selecting anything on canvas). Chip grouping refreshes on scene change. The active character is ring-highlighted; clicking another chip switches the entire tray to that character and syncs the canvas selection — the character's token is selected if one is on the current scene, otherwise the current selection is released so selection-driven updates don't drag the tray back to the previously selected token. (Supporting this, `controlToken` release events no longer re-initialize the tray to the released actor — only control *gains* initialize.) The chips also appear in the no-character message, turning the "select a token" dead end into a recovery path — there they show even for single-character players. The choice is remembered per user (`lastCharacterId` user flag) and becomes the first preference in the tray's fallback order (last chosen → assigned character → any owned character). Hidden entirely for single-character players with an active tray, and for GMs (the GM tray stays selection-driven).
- **Tray actor fallback rules**: A single shared resolver (`reinitializeTrayForCanvas()`) now decides which actor the tray shows whenever canvas state changes — token deletion, scene load (`canvasReady`, which previously never re-evaluated the tray), and world load. Rules: if the current actor still has a token on the scene, leave the tray alone; a still-controlled token wins; players fall back to their token on the scene, then their assigned character, then any character they own; GMs get the no-character tray until they select a token.

### Changed
- **GM tray is now strictly selection-driven**: Deleting the current token no longer auto-jumps the GM's tray to a random remaining token, and loading a world/scene with tokens present but nothing selected shows the no-character tray instead of auto-picking the first owned token. Selecting a token populates the tray as before.


## [13.3.4]

### Fixed
- **Quest/objective pins: legacy status-colored borders cleared**: Pins created before the 13.3.0 Blacksmith migration had their old per-state ring color (failed = red, completed = green, hidden = grey) baked into `style.stroke` and frozen there — Blacksmith renders the border purely from `style.stroke` and has no status-based border logic, so those stale colors persisted indefinitely while newly-created pins correctly used the white design default. A new one-time GM migration (`migrateSquirePinStyles`) resets `style.stroke`/`strokeWidth`/`iconColor` on all existing quest and objective pins (placed and unplaced) to what the current create path writes, via `_buildMergedDesign` so any GM-saved "default for type" still wins. `fill`, ownership, and `blacksmithVisibility` are left untouched (Blacksmith continues to own visible/hidden rendering). The migration is idempotent and gated by the new world flag `pinStrokeMigrationDone`, so it runs exactly once and a GM's own later stroke customizations persist.

## [13.3.3]

### Fixed
- **Quests: panel no longer jumps to the top after pin/visibility actions**: `QuestPanel.render()` rebuilds the panel by replacing `questContainer.innerHTML`, which destroys and recreates the `.quest-content` scroll container at `scrollTop` 0. Placing/unplacing a quest or objective pin and toggling quest visibility all re-render, so the GM was thrown back to the top of the list each time. Collapse states were already restored from flags, but scroll position was not. `render()` now captures `.quest-content`'s scroll position before the `innerHTML` swap and restores it after all collapse/expand states are reapplied, so the panel stays where the GM left it. This covers every quest-panel re-render, not just pin clicks.

## [13.3.2]

### Fixed
- **Codex: toggling entry visibility no longer collapses the panel**: Clicking the "Show to Players" / "Hide from Players" eye icon updated the page's `ownership.default`, which fired the `updateJournalEntryPage` hook and forced a full codex panel re-render. The re-render reset every entry's expand/collapse state and scroll position, so the GM had to scroll back down, re-expand the section, and find their place again. The visibility toggle now opts out of the re-render (via a `squireSkipCodexRender` update option that `_routeToCodexPanel` honors) and patches the eye icon, its title, and the sibling menu's `data-visible` attribute in place instead. The panel keeps its scroll position and expanded entries.

## [13.3.1]

### Fixed
- **Note sharing: ownership update now succeeds**: `syncNoteOwnership` was passing the nested `{ default, users: {...} }` structure returned by `buildNoteOwnership` directly to Foundry's `page.update()`. Foundry expects a flat mapping `{ default, userId: level }` — the `users` key was treated as a literal user ID, causing a validation error. The nested object is now flattened before the update call.

### Added
- **Note sharing: success notification**: After successfully sharing a note with another player, a `ui.notifications.info` message confirms who the note was shared with.
- **`pins.on()` lifecycle events**: All Blacksmith pin lifecycle handling migrated from raw Foundry Hooks (`Hooks.on('blacksmith.pins.*')`) to the `pins.on()` API, following the Blacksmith 13.7.6+ API update that added `'created'`, `'placed'`, `'unplaced'`, `'updated'`, `'deleted'`, `'deletedAll'`, and `'deletedAllByType'` lifecycle events. All handlers are now scoped by `moduleId` and cleaned up automatically via `AbortSignal`. The Foundry Hooks remain as legacy fallbacks in Blacksmith but are no longer used by Squire. The `_registerBlacksmithHooks()` function and `_syncHookIds` tracking array have been removed; teardown is handled entirely by `AbortController`.
- **Dynamic codex category tags**: Codex pins no longer use a hardcoded `CODEX_CATEGORY_TAG_MAP` to assign tags. Tags are now derived dynamically from the entry's category name via slug normalization (`'Characters'` → `'characters'`, `'My Custom'` → `'my-custom'`). This means user-created categories automatically get a matching tag without any code changes.

### Changed
- **Notes: `blacksmith.pins.updated` no longer triggers panel re-renders**: Removed notes from the `updated` lifecycle handler entirely. Blacksmith owns pin design after initial create — syncing the `noteIcon` flag back on every pin update was wrong in principle and caused unbounded panel re-renders on hover (Blacksmith fires `updated` on animation state changes). Notes now correctly ignore `updated` events.
- **Notes: `placed` and `created` lifecycle events are no-ops**: `createNotePin` writes the `pinId` flag itself; the resulting `updateJournalEntryPage` hook cascade drives the panel render. Listening to `placed`/`created` for notes was redundant and added extra renders.
- **Notes: `createNotePin` writes `pinId` flag internally**: The flag is now written inside `manager-pins.js` (after `pins.reload()` so the canvas data is populated before the render fires), matching how `createCodexPin` works. `panel-notes.js` no longer calls `page.setFlag('pinId', ...)` after `createNotePin` — the double-write was causing a render cascade.
- **Notes: removed explicit renders from `_createNotePin` and `_unpinNote`**: Both methods now delegate refresh entirely to the `created`/`unplaced` lifecycle hooks and the `updateJournalEntryPage` cascade. Removed the explicit `_refreshData()` + `render()` calls that were causing 4+ renders per pin operation.
- **Notes: removed legacy `sceneId` flag checks**: `_beginNotePinPlacement`, the pin button click handler, and the delete handler all previously read `page.getFlag('sceneId')` — a flag that was never written by the new code. Replaced with live API checks (`pins.get(pinId)?.sceneId`) and `deleteNotePin()`.
- **Notes: `window-note.js` no longer writes `pinId` flag after `createNotePinForPage`**: Four call sites that manually called `page.setFlag('pinId', pinId)` after `createNotePinForPage` have been cleaned up. The flag is written by `createNotePin` internally; the extra writes were causing redundant `updateJournalEntryPage` events.
- **Codex pin visibility now sets `blacksmithVisibility`**: `updateCodexPinVisibility` and `createCodexPin` now update `config.blacksmithVisibility` (`'visible'`/`'hidden'`) in addition to `ownership`, matching the pattern quests use. Previously codex pins always created with `blacksmithVisibility: 'visible'` and never updated it, so hiding a codex entry had no effect on the canvas pin.
- **Codex interaction changed from `click` to `doubleClick`**: The `pins.on('click')` handler for codex has been changed to `pins.on('doubleClick')`, matching the quest panel pattern.
- **Pin defaults updated**: `PIN_DEFAULTS` updated for all four pin types (quest, objective, note, codex) with revised colors, text sizes, drop shadow, and event animations to reflect the agreed design language.
- **Quest and objective taxonomy updated**: Quest and objective suggested tags changed from `['quest', 'main', 'side', 'optional', 'backstory']` to `['quest', 'main', 'side', 'faction', 'backstory']` and objective taxonomy expanded from `['objective']` to `['objective', 'main', 'side', 'faction', 'backstory']`. `QUEST_CATEGORY_TAG_MAP` updated accordingly (`'Optional'` → `'Faction'`).
- **Notes pin active state style**: The `note-pin-active` CSS class now applies the same orange color and glow (`color: var(--color-border-highlight)`, `text-shadow`) as quest, objective, and codex pin active states.

### Removed
- **`_registerBlacksmithHooks()`**: Removed entirely. All lifecycle handling moved to `pins.on()` calls in `_registerEventHandlers()`.
- **`_syncHookIds` array**: No longer needed; `AbortSignal` handles all `pins.on()` cleanup.
- **`CODEX_CATEGORY_TAG_MAP`**: Replaced by the dynamic `_codexCategoryToTag()` normalizer.

## [13.3.0]

### Added
- **Unified pin manager (`manager-pins.js`)**: All Blacksmith Pins API interaction is now routed through a single gateway module (`scripts/manager-pins.js`). Quest, objective, note, and codex pins share one consistent implementation for create, delete, update, event handling, context menus, taxonomy registration, ownership, reconciliation, and lifecycle hooks. Panels import from `manager-pins.js` and never call the Blacksmith API directly.
- **Initial pin defaults (`PIN_DEFAULTS`)**: Per-type design defaults (size, shape, style, text layout, event animations, access/visibility config) are declared inline in `manager-pins.js`. These apply only on first create — all subsequent appearance changes are owned by the GM via Blacksmith's Configure Pin tool.

### Changed
- **Pin placement — single-step API create**: All pin placement (quest, objective, note, codex) now uses a single `pins.create({ ..., sceneId, x, y })` call instead of the previous two-step create-unplaced → `pins.place()` pattern. The two-step pattern was silently failing — pins showed a success notification but never appeared on the canvas. The fix matches the pattern used by Artificer and the Blacksmith API documentation.
- **Pre-placement cleanup**: Before entering placement mode, any existing pin for the quest/objective/codex entry is now **deleted** (not unplaced). On pointer-down a fresh pin is created directly at the clicked position. This eliminates the accumulation of stale unplaced pins in the Blacksmith store.
- **Flag contract enforcement**: Squire stores only `pinId` on journal page flags. Position (`x`, `y`, `sceneId`), design, and visibility are owned by Blacksmith and never cached in page flags or written back from Squire.
- **Note pin placement preview**: The `_beginNotePinPlacement` preview element now uses hardcoded note defaults (`60×60`, `rgba(205,200,117,0.9)`, circle, drop-shadow) instead of calling deleted design-getter functions, eliminating a `ReferenceError` that crashed placement entirely.
- **Permission model**: Quest and codex pins use `blacksmithAccess: 'gm'`; note pins use `blacksmithAccess: 'private'`. Visibility uses `blacksmithVisibility: 'visible' | 'hidden'` (schema v7 — `'owner'` removed).
- **Tags replace group**: All pins use `tags[]` for classification. The legacy `group` field is no longer written.
- **`module.json` esmodules**: Removed the four deleted legacy scripts and added `scripts/manager-pins.js`.

### Removed
- **`scripts/utility-quest-pins.js`** (~1,084 lines): Replaced by `manager-pins.js`.
- **`scripts/quest-pin-events.js`** (~513 lines): Replaced by `manager-pins.js`.
- **`scripts/utility-codex-pins.js`** (~648 lines): Replaced by `manager-pins.js`.
- **`scripts/codex-pin-events.js`** (~178 lines): Replaced by `manager-pins.js`.
- **Six pin design settings**: `notesPinDefaultDesign`, `questPinDefaultDesign`, `questPinTitleSize`, `questPinTitleMaxWidth`, `questPinTitleOffset`, `questPinScale` removed from `settings.js`. Initial appearance is now defined in `PIN_DEFAULTS`; the GM uses Blacksmith's Configure Pin (with "Use as Default" toggle) for persistent customization.
- **`updateQuestPinStylesForPage`**: Removed entirely. Quest and objective pin updates now call `updateQuestPinText()` which only updates text, tags, and config — never style. All appearance decisions after initial create belong to Blacksmith.

## [13.2.7]

### Fixed
- **GitHub tag releases – release body size limit**: Tag builds no longer publish the entire `CHANGELOG.md` as the GitHub Release description (GitHub rejects bodies over 125,000 characters). The workflow now writes only the changelog section for the tagged version into `release-body.md` before `softprops/action-gh-release` runs, so releases succeed instead of failing with HTTP 422 and “Too many retries.” The release zip still includes the full `CHANGELOG.md`.

## [13.2.6]

### Fixed
- **Quest panel – objective pin state now reads from live API**: `_refreshData()` no longer reads `task.hasPinOnScene` from the `objectivePins` journal page flag (a manually-maintained mirror). A `liveObjectivePins` map is now built from `listAllQuestPins()` during the same pass that populates `liveQuestPins`, keyed by `questUuid|objectiveIndex`. Render-time objective pin state now matches the live Blacksmith pin store, eliminating the class of drift bugs where the flag and the store disagreed.
- **Quest panel – canvas deletion not reflected in panel**: `renderQuestPanelIfOpen()` now calls `_refreshData()` before `render()`. Previously it only called `render()`, which repainted the UI from the existing (stale) `this.data` — the rebuilt live map never ran. Manual tray refresh called `_refreshData()` first, which is why it worked while the hook-triggered path did not.
- **Quest panel – objective unplace silent failure**: Removed the `pins.exists({ sceneId })` pre-check in `unplaceObjectivePinForPage` that would bail out entirely if the stored `sceneId` was stale, leaving the pin on the canvas without error. Also stripped `sceneId` from the fallback `pins.update({ unplace: true })` paths in both objective and quest unplace functions, so the API resolves placement across all scenes rather than failing silently against the wrong scene.
- **Quest panel – deletion hook no longer manually patches flags**: The `blacksmith.pins.deleted` handler and `syncQuestForDeletedPins` no longer read or write `objectivePins` flags. Single-delete, bulk-delete, and scene-sync paths now all trigger a re-render via `renderQuestPanelIfOpen()` and let the live API drive state, matching the pattern used for quest-level pins.
- **Quest/objective pins – no longer override pin appearance on create or update**: Quest and objective pins no longer force `fill` or `stroke` colors when created or when quest content changes. `createQuestPin`, `createObjectivePin`, and `updateQuestPinStylesForPage` now only set layout defaults (`strokeWidth`, `iconColor`) and leave color entirely to Blacksmith pin tool defaults and user configuration. Status and objective state changes update `config`, `tags`, and `text` only — appearance is never touched.

### Removed
- **`_syncObjectivePinMirror` and `objectivePins` flag**: Removed the `_syncObjectivePinMirror` method, all flag writes to `objectivePins`, and the `objectivePins` reconciliation block in `reconcileQuestPins`. The flag was a stale mirror of placement state the Blacksmith API already owns; nothing reads it anymore.
- **`getQuestPinColor`, `getObjectivePinColor`, `QUEST_STATUS_COLORS`, `OBJECTIVE_STATE_COLORS`**: Removed the status-to-color lookup maps and their exported functions. Color is no longer derived from or driven by quest/objective status.
- **`pinStyleUsesSquireBootstrap`, `pinHasConfiguredAppearance`**: Removed both internal helpers that gated color application. No longer needed since Squire does not set pin colors.

## [13.2.5]

### Changed
- **Quest tray – status labels vs tabs**: User-visible quest status text now matches the tray filter tabs: **Available** (stored `Not Started`), **Active** (stored `In Progress`), **Succeeded** (stored `Complete`), and **Failed**. Applies to the quest card “…” → Change Status submenu, the quest window status dropdown, expanded entry status line, export preview HTML, and quest pin tooltips. Journal content and parsed values remain the canonical strings (`Not Started`, `In Progress`, `Complete`, `Failed`) for compatibility.

### Fixed why
- **Codex tray – unplace vs pin on another scene**: The map-pin control now treats “pinned” as **any** scene with `codexPinId` + `codexSceneId`, not only the active canvas, so you always get **Unplace** when a pin exists elsewhere. When the pin is on a different scene than the one you’re viewing, the tooltip names that scene (e.g. “Unplace pin (pinned on City Map)”). `unplaceCodexPin` resolves the real placed pin/scene from the Pins API (matching quest pins), uses the same `unplace` → `update({ unplace: true }, { sceneId })` fallback as quests, and only clears `codexSceneId` after a successful API call. Placement mode checks live pins across scenes so stale journal flags do not strand pins on the map or block re-pinning with a misleading “unpin first” message.
- **PanelManager – new-item cleanup interval**: The 30s `cleanupNewlyAddedItems` / inventory refresh sweep is no longer double-registered in timer bookkeeping (`trackModuleInterval` + `trackInterval`), and `PanelManager.cleanup()` no longer calls `clearInterval` on the same handle after `clearTrackedInterval` already cleared it. There is only one periodic sweep in the current tree (no separate module-load interval).
- **Blacksmith Manage Pins – Squire note pin taxonomy**: Legacy note pins stored with non-taxonomy `type` values (for example `note-pin`, `coffee-pub-squire-sticky-notes`, or display-style labels such as `Note Pin`) no longer break visibility filtering in Blacksmith’s Manage Pins window. On `ready`, the GM client runs a one-time migration (`migrateSquireNotePinTypes` in `scripts/utility-quest-pins.js`) that rewrites matching pins to the canonical `moduleId` / `type: note` keys expected by the pin taxonomy JSON. New note pins were already created with `type: note`; this corrects existing worlds only.

## [13.2.4]

### Added
- **Notes tray – sort control**: Added a sort toggle next to the filter icon in the notes tab search bar. Click to switch between **date added** (newest first, default) and **alphabetical** order by note title. The choice is saved per user (`notesSortMode`).

### Fixed
- **Quest panel – objective pin canvas deletion**: Deleting an objective pin directly from the canvas now correctly reflects in the quest panel without requiring a manual tray refresh. The `blacksmith.pins.deleted` hook now clears the matching `objectivePins` journal flag entry by pin ID directly, bypassing the Blacksmith cache (which does not reliably refresh objective-type pins via `pins.reload()`).
- **Quest panel – objective pin state source of truth**: `_refreshData()` now reads `task.hasPinOnScene` from the `objectivePins` journal page flag instead of from the Blacksmith pin cache (`pins.list()`). This matches the flag-based pattern used by Notes and eliminates cache-staleness as a failure mode for objective pin display.
- **Quest panel – objective pin placement flag**: The `objectivePins` flag is now written with an explicit `canvas.scene.id` on placement rather than relying on the sceneId returned by `pins.place()`, which may be absent depending on the Blacksmith version.


## [13.2.3]

### Changed
- **Notes window – view-mode privacy control**: The note header `Private` switch is now available outside edit mode for users who own the note. Visibility changes persist immediately from the view state instead of requiring an edit/save cycle.

### Fixed
- **Notes window – visibility sync path**: Unified the note visibility update flow so the live header toggle and the normal save path both apply the same `visibility`, `editorIds`, and ownership synchronization logic.
- **Notes window – long note view layout**: Fixed view mode so long note content scrolls inside the note body instead of pushing the tags panel and action bar out of place.


## [13.2.2]

### Changed
- **Notes window – Blacksmith Application V2 editor migration**: Reworked the sticky note window (`scripts/window-note.js`, `templates/window-note.hbs`, `styles/window-note.css`) to use a V13/Application V2-compatible ProseMirror mount path instead of the legacy helper/form behavior. Existing notes now round-trip through the shared Blacksmith window shell while preserving view/edit toggle behavior.
- **Notes window – tag UX simplification**: Replaced the split `Suggested` / `Common Tags` note tag groups with a single clickable tag cloud below the tags input. Core note tags are shown first, then existing world note tags are appended after case-insensitive de-duplication.
- **Notes window – tags panel presentation**: Wrapped the note tags area in a standard Blacksmith section so the note body stays visually open while the taxonomy controls match the Codex / Quest window treatment.

### Fixed
- **Notes window – ProseMirror content loading**: Fixed the migrated note editor so existing note HTML loads into edit mode correctly instead of opening with an empty ProseMirror document.
- **Notes window – editor interactivity**: Fixed the note editor state so the rich text area and HTML source mode are actually editable in edit mode rather than rendering as a non-interactive surface.
- **Notes window – editor layout sizing**: Fixed the note window flex/layout chain so the editor expands to fill the available vertical space down to the tags section instead of leaving a large dead gap below the note content.
- **Notes window – tag active state consistency**: Fixed note tag chip highlighting to behave case-insensitively and align with the shared Blacksmith active-chip styling used by Codex and Quest.

## [13.2.1]

### Changed
- **Quest window – Blacksmith Application V2 migration**: Replaced the legacy Quest import/edit form path with a registered Blacksmith Window API / Application V2 window (`scripts/window-quest.js`, `templates/window-quest.hbs`, `styles/window-quest.css`). Quest create/edit now opens through the shared Blacksmith window system and follows the same shell, section, action bar, and button patterns as Codex.
- **Quest window – structured editing workflow**: Rebuilt the quest editor around form-first sections instead of large text blocks. Objectives are now edited as individual cards, participants use selectable party portraits, the hidden flag uses the shared Blacksmith header switch, and the image area uses the same persistent preview/browse workflow as Codex.
- **Quest window – identity and world layout**: Cleaned up the quest form layout by splitting information into clearer sections, putting `Category`, `Status`, and `Timeframe` on a single row, and tightening the location/category flows to reduce dead space in the form.
- **Quest window – fixed taxonomy behavior**: Removed `+ New Category` from quests. Quest categories are now treated as fixed values in the quest window.
- **Quest window – objective UX**: Objective cards now have a clearer stacked layout with numbered titles, compact status controls, field tooltips, reorder controls, explicit `Delete Objective` actions, and a separate `Current` / `Set Current` control.
- **Quest tray – spacing and presentation**: Added visible spacing rhythm between quest cards so the quest list reads more like the Codex tray instead of appearing tightly stacked.
- **Party tray – selection state cleanup**: Removed the old shared multi-select action bar path from the tray so the party tab now relies only on the working `tokens selected / Clear All` state instead of a second broken `Clear / Combat` bar.

### Fixed
- **Quest save/objective serialization**: Fixed a critical quest save bug where editing and saving objectives could serialize structured objective data back into broken `[object Object]` journal content instead of valid quest objective text.
- **Quest objectives – add/reorder/delete behavior**: Fixed the `Add Objective` action and stabilized objective card state so blank draft objectives can be created, reordered, and deleted reliably before save.
- **Quest objectives – active vs status semantics**: Fixed the quest window so `Active` is no longer treated as an objective status. “Current objective” is now tracked separately and synced to the same active-objective flag used by the quest tray.
- **Quest treasure drop targets**: Added proper item drop support for both the main quest treasure area and per-objective treasure inputs so quest rewards can be populated directly from dragged items.
- **Quest edit round-tripping**: Improved quest edit round-tripping for objectives, participants, treasure, and related parsed quest data so existing quest pages survive edits more faithfully.
- **Codex startup/window compatibility**: Fixed early Codex window bootstrap issues during module load and completed follow-up compatibility fixes around save handling and HTML entity decoding for category/location values.

### Removed
- **Legacy Quest form assets**: Removed the old Quest form template and stylesheet (`templates/quest-form.hbs`, `styles/quest-form.css`) and their legacy load path after the Blacksmith window migration.
- **Legacy tray selection wrapper**: Removed the unused shared selection-wrapper template, runtime wiring, and related styling for the broken `Clear / Combat` multi-select bar.

## [13.2.0]

### Changed
- **Codex window – Blacksmith Application V2 migration**: Replaced the legacy Codex add form path with a registered Blacksmith Window API / Application V2 window (`scripts/window-codex.js`, `templates/window-codex.hbs`, `styles/window-codex.css`). Codex now opens through `registerWindow` / `openWindow`, uses the shared Blacksmith window shell and section classes, and exposes `openCodexWindow` on the module API.
- **Codex window – Blacksmith-aligned layout**: Rebuilt the window internals to match the shared Blacksmith window patterns instead of the older custom Codex chrome. Header, body, sections, action bar, and buttons now use the shared window template structure, and the oversized drag/drop hero was reduced to a compact callout.
- **Codex window – create/edit workflow**: Codex now supports both creating and editing entries in the same window. The header title reflects the current entry name when editing and uses `New Codex Entry` when creating.
- **Codex window – image workflow**: Added a persistent image section with preview, remove action, and native Foundry `FilePicker` browse action so entries can set artwork without drag/drop.
- **Codex window – category/location UX**: Category and location controls now use dedicated rows. `+ New Category` and `+ New Location` appear as the second option in their dropdowns, and the conditional create-new inputs appear inline beside the dropdown when needed (`[dropdown] [new value] [icon]` for category, `[dropdown] [new value]` for location).
- **Codex window – custom category icon**: New categories can now define a Font Awesome icon class (for example `fa-solid fa-map`) alongside the category name. The icon field is shown only when `+ New Category` is selected and is required together with the new category name.
- **Codex window – suggested tags**: Added clickable suggested tag chips in the Tags section. Clicking a chip adds or removes it from the tags input, and manual edits in the input keep chip active state in sync.
- **Codex tray – entry interactions**: Clicking an entry title now toggles the entry open/closed, and clicking a category title now toggles the category section. Entry images in the tray now open in Foundry’s native `ImagePopout`.
- **Codex tray – image presentation**: Expanded Codex tray images now render full width and scale to entry width without the prior max-height clamp.
- **Codex tray – edit action**: Added `Edit Entry` to the per-entry `...` menu so existing Codex pages can be loaded directly into the Codex window for editing.

### Fixed
- **Codex drag/drop field mapping**: Expanded drag/drop population for actors, items, journal entries, and journal pages so more Codex fields are filled consistently, including description text, link UUID/label data, and related metadata.
- **Codex drag/drop descriptions**: Dropped descriptions now append plain text to the existing description instead of overwriting it, with normalization for line breaks and duplicate content.
- **Codex drag/drop link persistence**: Fixed cases where dropped linked-document UUID data could be lost because the form state and rendered inputs were not fully synchronized.
- **Codex category list normalization**: Category dropdown options are now normalized and deduplicated case-insensitively so values like `Artifacts` and `artifacts` do not appear as separate options.
- **Codex new-category / new-location reveal**: Fixed the conditional new-category and new-location inputs so they actually appear when selected.
- **Codex save action handler**: Fixed the Application V2 save action path after the Blacksmith migration (`_ref` resolution for `ACTION_HANDLERS`).
- **Codex save compatibility warning**: Replaced deprecated global `expandObject(...)` calls with `foundry.utils.expandObject(...)` in Codex and Quest window save paths.
- **Codex category/location entity decoding**: Fixed category and location values containing HTML entities so characters like `&` round-trip correctly instead of reappearing as escaped entity text.
- **Codex panel pointer affordance**: Added pointer cursor styling for clickable entry and category titles so hover feedback matches the new click behavior.

### Removed
- **Legacy Codex form assets**: Removed the old Codex form template and stylesheet (`templates/codex-form.hbs`, `styles/codex-form.css`) and their CSS import path after the Blacksmith window migration.


## [13.1.15]
  - **Codex Panel - Image display**: Codex entries now display their associated image in the panel if available.
  - **Codex Panel - Visibility toggle**: Codex entries now display their associated visibility toggle in the panel if available.
  - **Codex Panel - Link display**: Codex entries now display their associated link in the panel if available.
  - **Codex Panel - Discovered by display**: Codex entries now display their associated discovered by in the panel if available.
  - **Codex Panel - Category display**: Codex entries now display their associated category in the panel if available.
  - **Codex Panel - Name display**: Codex entries now display their associated name in the panel if available.
  - **Codex Panel - Description display**: Codex entries now display their associated description in the panel if available.
  - **Codex Panel - Tags display**: Codex entries now display their associated tags in the panel if available.

## [13.1.14]

### Added
- **Codex pin lifecycle utilities**: Added dedicated codex pin utilities and sync handling (`scripts/utility-codex-pins.js`) to keep codex page pin flags aligned with Blacksmith pin create/update/place/unplace/delete events.
- **Codex linked-document field**: Codex entry form now supports a **Link UUID** field (`templates/codex-form.hbs`), and codex entries render that link in the panel for quick navigation to related documents.

### Changed
- **Codex pin open interaction**: Codex pins now open/navigate the Codex entry on **single click** (`scripts/codex-pin-events.js`) instead of requiring double-click.
- **Codex panel UX and layout**: Updated codex panel markup and styling (`templates/panel-codex.hbs`, `styles/panel-codex.css`, `scripts/panel-codex.js`) for improved entry readability, toolbar actions, and category/entry visibility behavior.
- **GM visibility controls in entries**: Added direct per-entry visibility eye toggles in Codex and Quest entry toolbars (`templates/panel-codex.hbs`, `templates/partials/quest-entry.hbs`) with supporting panel logic.

### Fixed
- **Codex pin navigation reliability**: Codex pin handlers now consistently switch to the Codex tray view, render the panel, and focus/highlight the matching entry after click.


## [13.1.13]

### Changed
- **Quest / objective pins – tray navigation**: Double-clicking a quest or objective pin (Blacksmith **`doubleClick`**) opens the Squire tray on the **Quests** view, switches the **quest status filter** (Active / Available / Complete) so the target quest is in a **visible** section, then scrolls to the entry and applies the existing highlight behavior. Pin handling no longer relies on a strict **`moduleId`** match when the pin is clearly a Squire quest/objective pin (type or **`config.questUuid`**).

### Fixed
- **Quest tab vs pin status**: Fix for when the panel was on e.g. **Complete** but the pin’s quest lived under **Active** — the code previously treated a quest as “found” if its DOM node existed, even when that status section was hidden. Visibility is now based on the parent **`.quest-section`**, and the handler falls back across status filters until the quest is actually shown.
- **Quest status button switching from pin open**: Double-click pin open now resolves the destination tab from live quest data (`entry.status`) instead of relying only on pin config, then applies the same UI path as clicking a status button (`_applyStatusFilter` + `.quest-status-button.active` sync). This fixes cases where the quest list stayed on the wrong tab even though scroll/highlight logic ran.

## [13.1.12]

### Changed
- **Quest / objective pin styling**: Merges Blacksmith **`pins.getDefaultPinDesign(MODULE.ID, 'quest' | 'objective')`** (Configure Pin “Default for [type]”) into quest design resolution before module setting and page flags. Squire’s legacy brown fill + status stroke is applied **only** when the merged style has **no** `fill` and **no** `stroke`; otherwise appearance is left to the pin tool / defaults. **`updateQuestPinStylesForPage`** no longer overwrites `style` when the pin already has a configured fill or stroke (still updates `config`, `text`, and `tags`). Objective pin creation now respects type defaults for size, shape, image, text options, and style when present. On **`pins.create`**, type defaults also supply **`eventAnimations`**, **`allowDuplicatePins`**, **`lockProportions`**, and **`iconText`** when saved for that type (PinData fields Squire did not previously forward).
- **Objective pin Squire baseline**: When Blacksmith has no saved default for the **`objective`** pin type, new pins use **50×50 circle**, **#8c2d0d** fill, **5px** white border (state-colored stroke on updates), no drop shadow, text below / hover / 100 max chars / 25 chars per line, scale-with-pin off, **event animations** (ripple + `interface-pop-01` on hover; scale-small + `book-open-02` on click; fade + `interface-pop-03` on delete). **`pins.getDefaultPinDesign`** still overrides any of these when the user sets “Default for objective pin”. Quest placement preview uses the same circle size and border width.
- **Pin type migrations removed**: Dropped **`pinTypeMigrationV1`**, **`pinTypeMigrationTaxonomyV2`**, and **`pinTypeMigrationTaxonomyV3`** world settings and all **`ready`** migration loops; creation relies on correct **`pin.type`** plus **`enforceSquirePinTaxonomyType`** when needed.
- **Note “Use as default” + Foundry settings**: **`NotesForm`** **`pins.configure`** calls pass **`defaultSettingKey: notesPinDefaultDesign`** (via **`NOTES_PIN_DEFAULT_DESIGN_SETTING_KEY`**) so Blacksmith’s default-for-type flow lines up with Squire’s **`game.settings`** key, matching the quest panel’s **`questPinDefaultDesign`** pattern.

### Fixed
- **Pin `type` vs Blacksmith taxonomy**: `pin.type` for Squire pins uses the same keys as Blacksmith’s module taxonomy JSON — **`quest`**, **`objective`**, **`note`**, **`codex`** — not `*-pin` suffixes. **`pins.create`**, **`getDefaultPinDesign`**, **`getModuleTaxonomy`**, **`registerPinType`**, list filters, context menus, and note flows use **`getSquirePinType()`** (validated against **`getModuleTaxonomy(MODULE.ID)`** when available) plus **`isSquirePinCategory`** / **`listSquirePinsByKind`** so pins still stored with legacy **`quest-pin`** / **`objective-pin`** / **`note-pin`** strings are still recognized where needed.
- **Pin `type` showing “Quest Pin” / “Objective Pin”**: Saved **`getDefaultPinDesign`** blobs could carry **`type`** as a **display label**; Blacksmith **`pins.create`** can merge that over Squire’s **`quest` / `objective`** key. **`getPinTypeDefaultDesign`** strips **`type`**, **`id`**, and **`moduleId`** from defaults; objective structural merge omits **`type`**; **`enforceSquirePinTaxonomyType`** runs after quest/objective/note **`pins.create`**; internal **`SQUIRE_PIN_TYPE_FIX_MAP`** maps label and legacy strings to taxonomy keys for that enforcement path.

## [13.1.11]

### Changed
- **Pin taxonomy – Blacksmith-owned**: Removed all hardcoded pin tag lists from Squire. Taxonomy (types + tags) is now owned entirely by Blacksmith's global JSON and read at runtime via `pins.getModuleTaxonomy(MODULE.ID)`. Squire no longer calls `registerPinTaxonomy`.
- **Pin type names**: Renamed pin type strings to match Blacksmith's taxonomy keys — `'quest'` → `'quest-pin'`, `'objective'` → `'objective-pin'`, `'coffee-pub-squire-sticky-notes'` → `'note-pin'`. Updated across all creation, filtering, and event-handler code (`utility-quest-pins.js`, `panel-notes.js`, `panel-quest.js`, `quest-pin-events.js`).
- **Pin tags – quest and objective pins**: Quest and objective pins now carry taxonomy-driven tags derived from `questCategory` at creation and on style refresh. `'Main Quest'` → `['quest', 'main']`, `'Side Quest'` → `['quest', 'side']`, etc. Tags are validated against the live Blacksmith taxonomy and fall back gracefully if unavailable.
- **Pin tags – note pins**: Note pins now carry a taxonomy-driven tag derived from the note's visibility flag (`'party'` → `'party'`, `'private'` → `'personal'`), sourced from `getModuleTaxonomy` with fallback. Tag is kept in sync on pin update.
- **Pin taxonomy registration**: Added `registerPinType` calls for all four Squire pin types (`quest-pin`, `objective-pin`, `note-pin`, `codex-pin`) so Blacksmith's UI labels them correctly. `codex-pin` is registered but has no creation code yet.

### Fixed
- **Existing pin migration**: One-time GM-only migration runs on `ready` to rename existing world pins from old type strings to new taxonomy keys. Guarded by a `pinTypeMigrationV1` world setting so it runs exactly once per world.
- **Note pin console spam**: Removed `logPinPackage` debug logging function and all three of its call sites from `panel-notes.js`.

## [13.1.10]

### Fixed
- **Blacksmith bootstrap order**: When Squire’s `ready` ran before Blacksmith finished wiring window globals, `BlacksmithModuleManager.registerModule` and `BlacksmithHookManager.registerHook` could throw on `null`. Squire now `await`s `BlacksmithAPI.waitForReady()` when Blacksmith is active, registers via `game.modules.get('coffee-pub-blacksmith').api.registerModule` with a `BlacksmithModuleManager` fallback, and routes hook registration through `api.HookManager` (with global fallback). The delayed tray `trackModuleTimeout` callback also waits for Blacksmith before registering `controlToken`. See [API: Core Blacksmith](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/API:-Core-Blacksmith).

## [13.1.9]

### Added
- **PanelManager – menubar readiness**: `ensureReadyForMenubar()` and `actorForMenubarFallback()` so Blacksmith menubar actions can bootstrap the tray when `PanelManager.instance` is not ready yet (same actor resolution as delayed init: controlled owned token, first owned token, then assigned character).

### Changed
- **Blacksmith menubar registration**: Dice tray, macros, and quick note tools are registered only after the excluded-user check (they depend on the tray). Explicit `groupOrder: 999` on those tools per Blacksmith menubar API guidance. Calls `renderMenubar(true)` after registration so the bar picks up tools when registration runs later in `ready`.

### Fixed
- **Blacksmith menubar – macros and dice tray**: Fixed `TypeError: Cannot set properties of null (setting 'macrosPanel')` / equivalent dice tray failure when opening from the menubar before delayed tray init or while another `initialize()` was in flight. `openMacros` and `openDiceTray` now await `ensureReadyForMenubar()` and show a clear warning if the tray is unavailable (e.g. excluded user).

## [13.1.8]

### Changed
- **Macros icon**: Replaced macros icon with `fa-solid fa-code` in the tray handle and in the Blacksmith menubar tool registration.
- **Unfavorited heart icon**: Unfavorited (dimmed) heart in Favorites/Character tab now uses the same neutral color and dimness as the prepared and shield icons (`#9f9275` at 0.3 opacity) instead of dimmed red.
- **Icon hover color**: Tray, party panel, and handle icon mouseover color set to `rgba(231, 91, 1, 1.0)` (tray buttons, spell/weapon controls, search clear, party card actions, handle pin/viewcycle/toggle, chevron, pinned quest name).
- **Shield icon hover**: Equipped (non-dimmed) shield icon now uses the same orange hover color instead of staying blue.
- **Dimmed icon hover**: Tray and spell/weapon control icons in dimmed (faded) state now go to full opacity on hover so the hover color is visible.

### Fixed
- **Party panel – portrait and open-sheet clicks**: "Click to share portrait with all players" and "Open character sheet" (feather icon) did nothing when clicked. Listener setup order was corrected so card replacement no longer removes those handlers; portrait and open-sheet listeners are now attached after card replacement.



### Changed
- **Tray panels - shared item structure and styling**: Unified stacked tray item markup and selectors across Favorites, Weapons, Spells, Features, and Inventory to use shared classes (`panel-item`, `panel-item-row`, `panel-item-name`, `panel-item-image-container`, `panel-item-roll-overlay`) and shared `data-item-id` targeting.
- **Item context badges**: Normalized action/components/count display to `panel-item-context` + `panel-item-badge` variants. Action badges are round and color-coded, spell component badges are square and color-coded, and count/use/level values use shared `context-count`.
- **Top panel shells**: Consolidated duplicated tray shell styles for Health, Experience, Abilities, Attributes, GM, Global Filters, Dice Tray, and Macros into one shared rule in `styles/tray.css`.

### Fixed
- **Quest pins – journal permission on reconcile**: Fixed "User lacks permission to update JournalEntryPage" when a player triggered quest pin reconcile (e.g. double-click gather pin flow). `reconcileQuestPins` was writing `pinId`, `sceneId`, and `objectivePins` flags to journal pages on the client; those writes require edit permission. Reconcile now runs only for GMs (`if (!game.user.isGM) return`), so player-triggered reconcile no-ops without throwing.
- **GM Details empty state spacing**: Removed empty header/content gap by hiding the entire GM details panel when no resistances, immunities, or biography data exist.

### Removed
- **Legacy tray item hooks/classes**: Removed unused per-panel item/count class hooks and legacy inline/partial remnants that duplicated shared tray item behavior.


## [13.1.6]

### Changed
- **Tray**: Cleaned up tray CSS (`styles/tray.css`).

### Fixed
- **Codex Panel - Invalid selector on restore**: Fixed `SyntaxError: Failed to execute 'querySelector' on 'Element'` when restoring collapsed category state. Category names stored in `codexCollapsedCategories` can include newlines/whitespace (e.g. from "Characters" / "Browse" UI), making attribute selectors like `[data-category="${category}"]` invalid. Replaced `querySelector` with the same safe approach used elsewhere: select all `.codex-section[data-category]` and find by matching trimmed `data-category` to the stored category.

### Removed
- **Quest pin legacy (Blacksmith migration)**: Removed unused quest pin tooltip template `tooltip-pin-quests-quest.hbs` (only objective tooltip is used, from the tray handle). Removed `themes/quest-pins.json` and `TEMPLATES.TOOLTIP_QUEST_PIN`; pin appearance is fully handled by Blacksmith and module settings.


## [13.1.5]

### Fixed
- **Spells Panel - Undefined spellbook**: Fixed `TypeError: Cannot read properties of undefined (reading 'spell1')` when rendering the spells panel for actors without spell data (e.g. NPCs, loot, vehicles). Added guards for `actor.system.spells` in `_getSpellSlots()` and the spell slot pip click handler.
- **Panel Manager - Token deletion race**: Fixed `TypeError: Cannot read properties of null (reading 'macrosPanel')` and `Cannot read properties of null (reading 'renderPanels')` when deleting a controlled token. Race between `controlToken` and `deleteToken` hooks caused null access. Added abort checks after each `await` in `PanelManager.initialize()` and null guard before `renderPanels` in the `deleteToken` callback.
- **Spells Panel - Duplicate listeners on re-render**: Added `AbortController`-based listener lifecycle so delegated click handlers are torn down before rebind. Prevents stacked handlers, double actions, and gradual memory/performance degradation during frequent panel renders.
- **Features Panel - Duplicate listeners on re-render**: Added `AbortController`-based listener cleanup and panel `destroy()` teardown to prevent listener accumulation and repeated callback execution after multiple renders.
- **Favorites Panel - Duplicate listeners on re-render**: Added centralized listener abort/rebind flow for panel-level and cloned-control listeners, plus explicit `destroy()` cleanup (including context menu close) to prevent stale handlers and retained references.
- **Quest Panel - Incomplete destroy teardown**: Updated `destroy()` to call `_clearQuestPinPlacement()` and abort `_questListenersAbort`, ensuring canvas/window listeners are removed when panel instances are replaced.

## [13.1.4]

### Added
- **Print Character - Cover Page**: Cover page with character name, race • class • level subtitle, and full-width portrait. Uses `page-break-after` for separate first page when printing.
- **Print Character - Biography Section**: Biography tab data after Skills: physical traits (eyes, hair, skin, height, weight, age, gender, faith), character details (race, background, size), personality traits, ideals, bonds, flaws, and biography text.
- **Print Character - Stats & Combat**: Initiative, speed (walk/fly/swim/climb/burrow), hit dice, temporary HP, experience points, saving throws, and trait badges (senses, resistances, armor proficiencies, weapon proficiencies, languages).
- **Print Character - Inventory Extras**: Encumbrance, currency (PP/GP/EP/SP/CP), and dedicated Weapons section (separate from equipment) with damage formulas.
- **Print Character - Image Overflow Fix**: CSS for images inside item descriptions, additional details, biography content, and features so they scale to fit (`max-width: 100%`) and do not overflow.

### Changed
- **Print Character - Cover Subtitle**: Replaced pipe (`|`) with bullet (`•`) between race and class/level on cover page.
- **Print Character - Ability Labels**: Ability Scores section now uses prepared abilities with proper labels (Strength, Dexterity, etc.) from CONFIG.DND5E instead of raw system data.
- **Print Character - Appearance Section**: Removed duplicate Appearance block; physical traits remain in the Biography section grid only.

### Fixed
- **Print Character - ES5 Compatibility**: Replaced nullish coalescing (`??`) and optional chaining (`?.`) in `utility-print-character.js` with ES5-safe patterns to fix SyntaxError in environments that do not support ES2020.
- **Print Character - Missing Ability Labels**: Ability score boxes now display labels (Strength, Dexterity, etc.); template was using `actor.system.abilities` which lacks a `.label` property.

## [13.1.3]

### Added
- **Quest Status Filter Buttons**: Quest tab now uses filter buttons (like Notes) to show one status at a time: Active, Available, Complete. Removed "All" option.
- **Quest Subgroup Headers**: Complete section shows "Succeeded" and "Failed" as subgroup headers instead of expandable title bars.

### Changed
- **Quest Status Labels**: Renamed "In Progress" → "Active", "Not Started" → "Available", "Completed" → "Complete". "Failed" unchanged.
- **Quest Active/Available Sections**: Removed redundant expandable title bars; these sections are always expanded (no collapse).
- **Quest Complete Section**: Merged Failed into Complete; both appear under the Complete button with "Succeeded" and "Failed" subgroup headers. Replaced expandable Complete title bar with subgroup headers.
- **Character Panel Search**: Search term is now persisted and re-applied when stacked panels (Favorites, Weapons, Spells, Features, Inventory) re-render (e.g. 30s cleanup, item drops). Added `reapplySearch()` to restore filtered view after panel refreshes.
- **Quest Pin Sync**: Debounced quest-pin-sync handler (50ms) to reduce rapid successive panel refreshes.

### Fixed
- **Quest Panel Collapse/Expand**: Fixed quests becoming un-expandable after setting an objective active or placing a pin. Duplicate event listeners on re-render caused double-toggle (expand then collapse). Now uses `AbortController` to clear previous listeners before adding new ones.
- **Quest Panel Redundant Renders**: Removed duplicate full re-renders after placing/unplacing quest and objective pins; sync hooks alone now trigger the refresh.

## [13.1.2]
### Added
- Notes now create a note + unplaced pin immediately on open (no draft hiding); "Untitled Note" behavior matches typical note apps.
- Save-and-place flow in Notes window: **Save and Place Pin** launches the canvas placement cursor after save.
- Quick Note tool registered in the Blacksmith menubar (left/general group).
- Unplaced pin support across the notes system (create, update, delete, and configure without a scene).
- Pins API hooks wired for create/place/unplace/update/delete to keep note flags in sync.
- Note edit locks with “being edited” indicators (tray + window). Locks are per-note flags and auto-expire after 30 minutes of idle time.

### Changed
- Notes pin workflow fully migrated to Blacksmith Pins API (create/update/delete/placement/ownership sync).
- Note icon configuration uses Blacksmith `pins.configure()` (legacy NoteIconPicker removed).
- Default note visibility set to **private**.
- Default sticky note pin fill set to `rgba(205, 200, 117, 0.9)` when no user default is set.
- Notes pin defaults now pull from Blacksmith per-user defaults via `pins.getDefaultPinDesign()` with world default fallback.
- Note edit locks now clear on save/close, on client load for the current user, and when a user disconnects.

### Fixed
- Pin configuration now works for unplaced pins (recovery + create-on-demand in note window).
- Prevented pin ownership/visibility desyncs and improved unpin behavior using `unplace`.
- Normalized note icon storage to avoid `fa-solid` spam and `<img>` 404s.
- Reduced log spam and sync loops caused by pin updates.
- Players can save pin design defaults without world-setting permission errors (client-scope defaults).
- Player pin updates for **unplaced** pins now route through GM (prevents world-setting permission errors; GM must be online).
- GM edits no longer convert a player’s private note into a GM private note.
- Early-load settings guard prevents startup errors when `notesJournal` is not yet registered.
- Pin placement/unplacement now reloads the scene so pins disappear/appear immediately.
- Player pin placement now routes through GM, with fallback for older proxy actions.
- Save and Place Pin button reliably triggers the placement flow.

## [13.1.1] 
### Added
- Notes view mode with Edit toggle in the header (view/read-only vs edit).
- Notes list view with dedicated template/layout and view toggle.
- Pin context menu items: View Note, Edit Note, Delete Pin and Note.
- Note form header meta now shows editor avatars, location, and formatted date.

### Changed
- Notes window title now shows "Edit Note" / "View Note" (title shown in header body).
- Notes pin creation sends size, icon, style, ownership consistently; note updates sync pin data.
- Notes styling reorganized with clear Card/List sections and theme-specific blocks.
- Notes CSS loading moved to `styles/default.css` imports (removed runtime injection).
- Removed legacy pin reload workaround now that `pins.update()` handles icon/image swaps.
- Removed unused note pin color constant.

### Fixed
- Note pin placement cursor behavior and pin preview alignment.
- Notes view mode layout to keep content scrollable above tags.
- Removed duplicate note pin text scale writes during pin configuration and note icon updates.
- Player pin placement now routes through a GM socket when direct pin creation is denied.

## [13.1.0] - Sticky Notes

### Added
- **Complete Notes System Redesign**: New card-based notes panel matching Codex and Quest styling
  - Dark theme with transparent content container and bordered cards
  - Header layout: visibility badge (icon-only) | title | action buttons (edit, pin, delete)
  - Footer layout: editor avatars (left) | timestamp (right)
  - Tags displayed at bottom of cards with Codex-style formatting
- **NotesForm Class**: New FormApplication for creating and editing notes
  - Supports both create and edit modes with proper data loading
  - Window title updates dynamically ("New Note" vs "Edit Note: [Title]")
  - Form remembers window size and position
- **Notes Ownership Sync**: GM-mediated ownership updates via Blacksmith sockets with owner/none model
  - Non-GM users can create notes; GM syncs ownership based on visibility
  - Socket handler `squire:updateNoteOwnership` for cross-client synchronization
- **Notes Window Persistence**: Notes form now remembers size and position
- **Notes Footer Avatars**: Note cards display editor avatars instead of author icon
  - Shows multiple editor avatars when note has been edited by multiple users
  - Falls back to author name with icon if no avatars available
- **Notes Filter Toggle**: Collapsible filter section with toggle button
  - Filters can be hidden/shown via filter icon in search bar
  - Matches Codex/Quest filter UX patterns

### Changed
- **Notes Panel Styling**: Complete visual overhaul to match Codex and Quest panels
  - Content container: transparent background, 6px border radius, 2px white border
  - Note cards: dark charcoal background (rgba(0,0,0,0.3)), light borders, golden-brown text
  - Filters: dark background (rgba(0,0,0,0.6)), matching Codex/Quest filter styling
  - Search input: white text on dark background, clear button, filter toggle
  - Tags: red-tinted styling matching Codex/Quest tag appearance
- **Notes Editor**: Switched to Foundry ProseMirror editor for note content
  - Rich text editing with full FoundryVTT editor capabilities
  - Native image handling through editor (drag/drop, paste from clipboard)
- **Notes Form Layout**: Complete redesign matching XP window patterns
  - Header section with banner image background and circular portrait/icon
  - Title input in header with meta information
  - Visibility toggle switch in header controls
  - Sectioned body with collapsible headers (CONTENT, TAGS, etc.)
  - Styled form actions footer with Save/Cancel buttons
- **Notes Visibility UI**: Replaced dropdown with full-width icon+label button group
  - Three buttons: All, Party, Private with icons
  - Active state highlighting with golden-brown accent
  - Matches modern UI patterns from other Blacksmith modules
- **Notes Filters**: Codex/Quest-style filter UX with clear button and tag cloud toggle
  - Clear search button (X icon) that resets search and filters
  - Filter toggle button to show/hide filter section
  - Tag cloud with clickable tags for filtering
  - Scene filter dropdown (when scenes available)
- **Tags Normalization**: Notes tags forced to uppercase for consistent filtering
  - Tags displayed in uppercase on cards and in filter cloud
  - Tag matching is case-insensitive but display is normalized
- **Note Header Image**: Uses first note image as header portrait when available
  - Circular portrait in form header shows note's first image
  - Falls back to icon if no image present
- **Image Handling**: Removed custom image upload UI in favor of editor-native behavior
  - Images handled directly through ProseMirror editor
  - Drag-and-drop and clipboard paste supported
  - No separate image upload section in form
- **Note Card Layout**: Reorganized card structure for better information hierarchy
  - Actions moved to header (right side) for quick access
  - Footer moved after tags for better visual flow
  - Visibility badge icon-only (no text) positioned before title
  - Removed separate image display section (images in content only)

### Fixed
- **Notes Filters**: Tag filtering now uses precomputed tag CSV and additive matching
  - Tags stored as comma-separated string in data attribute for efficient filtering
  - Multiple tag selection works correctly with additive logic
- **Notes Clear Search**: Clear button now resets search and filters
  - Properly clears search input and resets all filter states
  - Button disabled state when search is empty
- **Notes Tag Interactions**: Clicking a note tag filters by that tag
  - Tag clicks in cards and filter cloud properly update filter state
  - Active tag highlighting shows selected filters
- **Notes Panel Refresh**: Panel now refreshes automatically on note create/update/delete
  - Hooks registered for `createJournalEntryPage` and `deleteJournalEntryPage`
  - Panel refreshes when notes are modified via form or journal
- **Notes Form Editing**: Edit mode properly loads existing note data
  - Title, content, tags, visibility, and location correctly populated
  - Image extraction from content works for editing
  - Ownership updates correctly when visibility changes (GM only)


## [13.0.8] - Settings Scope Migration

### Changed
- **Settings Scope Migration**: Converted 36 user preference settings from `client` scope to `user` scope for cross-device synchronization
  - User preferences now sync across devices when logging in from different browsers or computers
  - Settings affected include:
    - Tab visibility settings (Party, Notes, Codex, Quests)
    - Panel visibility settings (Experience, Party Stats, Health, Abilities, Stats, Dice Tray, Macros)
    - Handle display settings (Conditions, Primary/Secondary Stats, Favorites, Health Bar, Dice Tray Icon, Macros Icon)
    - Panel visibility preferences (Favorites, Weapons, Spells, Inventory, Features)
    - Filter states (Prepared Spells, Equipped Weapons/Inventory, Favorites filters)
    - View modes (Default Tab, View Mode)
    - User macros and favorite macros
    - Quest pin text display preference
    - Hide Foundry hotbar preference
  - Device-specific settings remain as `client` scope (window positions, sizes, offsets, collapsed states, sound paths)
  - This change ensures user preferences follow them across all devices while maintaining device-specific UI state

## [13.0.7] - Macro Drag & Drop Improvements

### Fixed
- **Macro Window Layout**: Fixed macros window content not filling the entire container
  - Updated CSS in `window-macros.css` to ensure `macros-content` expands to fill `panel-container`
  - Changed height from `auto` to `100%` for proper flexbox expansion
  - Content now properly fills the window without empty space at the bottom
- **Internal Drag Detection**: Fixed drop target showing during internal macro reordering
  - Added `isInternalDrag` flag tracking to distinguish internal vs external drags
  - Drop target (green border and last slot highlight) now only appears for external macro drags
  - Internal reordering no longer triggers the drop target visual feedback

### Changed
- **Simplified Macro Drop System**: Completely refactored macro drag-and-drop for better reliability
  - Removed complex `showAddSlot` logic with timeouts and multiple state management paths
  - Simplified to window-wide drop target approach: drag anywhere over window shows drop target
  - External macros always add to the last slot regardless of where dropped
  - Internal reordering still works per-slot (drag from one slot to another)
- **Drop Target Visual Feedback**: Improved visual feedback for external macro drops
  - Added green dotted border overlay (`::before` pseudo-element) on window/panel when dragging external macros
  - Added green glow highlight on last slot to indicate where macro will be added
  - Visual feedback uses overlay approach to prevent content shifting
  - Drop target only appears for external macro drags, not internal reordering

### Technical
- **Code Cleanup**: Removed unused `showAddSlot` state management and related cleanup handlers
- **Event Handling**: Improved drag event handlers with better state tracking and cleanup
- **CSS Organization**: Identified duplicate CSS definitions between `panel-macros.css` and `window-macros.css` (documented in TODO.md for future cleanup)

## [13.0.6] 

### Fixed
- **PanelManager jQuery Method Error**: Fixed `PanelManager.element.addClass is not a function` error
  - Replaced jQuery `.addClass('expanded')` with native DOM `classList.add('expanded')` in `manager-panel.js` (line 2178)
  - Error occurred when restoring expanded state after token selection changes
  - Now uses consistent native DOM methods matching other parts of the codebase

## [13.0.5] 

### Changed
- **Menubar Tools**: Update our menubar tools sto support the changes to the blacksmith API.


## [13.0.4] - Build Fix
### Fixed
- forgot to include the new resources folder with the light source mapping.

## [13.0.3] - Event Listener Fixes & jQuery Migration

### Fixed
- **Duplicate Event Listeners in Weapons Panel**: Fixed item/weapon action buttons triggering multiple times when clicked
  - Implemented proper event listener management in `panel-weapons.js`
  - Added `_eventHandlers` array to store handler references for cleanup
  - Updated `_removeEventListeners()` to explicitly remove stored handlers using `removeEventListener`
  - Modified `_activateListeners()` to store handler references before adding them
  - Prevents accumulation of duplicate listeners on panel re-renders
- **Duplicate Event Listeners in Inventory Panel**: Fixed inventory item action buttons triggering multiple times when clicked
  - Implemented proper event listener management in `panel-inventory.js`
  - Added `_eventHandlers` array to store handler references for cleanup
  - Updated `_removeEventListeners()` to explicitly remove stored handlers using `removeEventListener`
  - Modified `_activateListeners()` to store handler references before adding them
  - Prevents accumulation of duplicate listeners on panel re-renders
  - Action buttons (use, equip, favorite, send) now trigger only once per click
- **Light Icon State Synchronization**: Fixed light icons sometimes showing incorrect state
  - Simplified to use actor flag as single source of truth (matching favorites pattern)
  - Removed token state checking that caused timing issues
  - Icons now reliably reflect active light source state
- **Quest Entry Expand/Collapse Button**: Fixed quest entry expand/collapse button not working
  - Updated `_activateListeners()` in `panel-quest.js` to use `getNativeElement()` helper for consistency
  - Fixed event handler to properly stop propagation and prevent header click handler interference
  - Quest entries now properly expand and collapse when clicking the chevron icon
- **Party Panel jQuery Migration**: Completed jQuery to native DOM migration in `panel-party.js`
  - Fixed Dialog callback (line 663) to use native DOM `querySelector()` instead of `html.find()`
  - Migrated GM approval buttons (lines 843-855) to use `querySelectorAll()` and `addEventListener()`
  - Migrated transfer request buttons to native DOM with proper handler attachment tracking
  - Fixed disabled button state (lines 964-965) to use native DOM `disabled` property and `classList`
  - Fixed processing message (lines 1288-1290) to use `createElement()` and `appendChild()` instead of jQuery `append()`
  - All jQuery patterns replaced with native DOM methods for FoundryVTT v13 compatibility
- **Party Panel Syntax Error**: Fixed missing closing parenthesis in `panel-party.js` forEach loop
  - Corrected event handler closure structure for transfer request button handlers
  - File now loads without syntax errors
- **Favorites Panel Async/Await Issues**: Fixed "Cannot read properties of undefined (reading 'forEach')" errors
  - Added missing `await` keywords to all async method calls in `panel-favorites.js`
  - Fixed `_getItems()`, `_getWeapons()`, `_getSpells()`, and `_getFeatures()` calls to properly await results
  - Updated `panel-inventory.js` and `panel-features.js` to return proper object structure when actor is missing
  - Prevents panels from trying to iterate over Promise objects instead of data arrays
- **Favorites Not Removed on Item Deletion**: Fixed favorited items remaining in favorites panel after deletion
  - Updated `deleteItem` hook in `squire.js` to remove deleted items from both panel and handle favorites
  - Added favorites panel refresh when items are deleted
  - Ensures favorites list stays synchronized with actual actor items
- **Favoriting Performance**: Fixed favoriting operations taking 3-10 seconds to update icons
  - Removed duplicate `_getItems()`, `_getWeapons()`, `_getSpells()`, and `_getFeatures()` calls from heart icon handlers
  - `manageFavorite()` already refreshes all panels, making duplicate calls redundant
  - Favoriting is now near-instant instead of taking several seconds
- **Event Propagation Issues**: Fixed multiple click events firing when clicking icons in favorites panel
  - Added `event.preventDefault()` and `event.stopPropagation()` to all icon handlers in favorites panel
  - Added processing guards to light icon handlers to prevent multiple rapid clicks
  - Applied fixes to light, heart, shield, sun, feather, and roll overlay handlers
  - Prevents "Item does not exist" errors from multiple consumption attempts
  - Applied same fixes to inventory and weapons panels for consistency
- **CharactersWindow onClose Callback**: Fixed "Cannot set properties of undefined (setting 'onClose')" error
  - Added `onClose` callback support to `CharactersWindow` constructor
  - Overrode `close()` method to call `onClose` callback if provided
  - Updated `panel-inventory.js` to pass `onClose` through constructor instead of accessing non-existent `app` property
- **mergeObject Deprecation Warnings**: Fixed deprecation warnings for global `mergeObject` access
  - Updated `panel-codex.js` and `window-quest.js` to use `foundry.utils.mergeObject` instead of global `mergeObject`
  - All files now use namespaced FoundryVTT v13 API

### Changed
- **Inventory Panel**: Added light icon support with state management
  - Light icons appear before shield icon in item buttons
  - Icons update automatically when light state changes
  - Integrated with existing favorite and equipped state management
- **Weapons Panel**: Added light icon support matching inventory panel functionality
  - Light icons for weapons that are light sources (e.g., Flame Tongue, Sun Blade)
  - Same visual feedback and toggle behavior as inventory panel
- **Favorites Panel**: Added light icon support for favorited light sources
  - Consistent behavior across all panels
  - Light state synchronized with actor flags
- **Quest Panel**: Improved event handler consistency
  - Updated to use `getNativeElement()` helper method for jQuery detection
  - Standardized with other migrated panels for better maintainability
- **Party Panel**: Complete jQuery to native DOM migration
  - All Dialog callbacks now use native DOM methods
  - Event handlers use `addEventListener()` with proper cleanup tracking
  - Button state management uses native DOM properties (`disabled`, `classList`)
  - Message creation uses `createElement()` and `appendChild()` instead of jQuery

### Added
- **Token Lighting System**: Comprehensive light source management for items and weapons
  - New light icon in inventory, weapons, and favorites panels for items that can be used as light sources
  - Light icon appears orange/yellow when light is active, faded when inactive
  - Clicking light icon toggles light on/off for player's token
  - Switching between different light sources automatically replaces the previous light
  - Light state persists across sessions using actor flags
- **Light Sources Configuration**: New `resources/light-sources.json` file defining all available light sources
  - Supports all FoundryVTT light configuration fields (dim, bright, angle, color, alpha, animation, etc.)
  - Includes base light sources: torch, candle, lamp, lantern, oil
  - Includes magical light sources: driftglobe, moon-touched sword, flame tongue, sun blade, holy avenger, lightbringer, gem of brightness, midnight oil
  - Each light source can have aliases for name variations (e.g., "Hooded Lantern" vs "Lantern, Hooded")
  - `consumable` field (boolean) to mark items that should be consumed when used
  - `actionable` field (boolean) to mark items that should trigger their action when light is activated
- **Fuzzy Matching**: Base light source fallback system
  - When `tokenLightingFuzzyMatch` setting is enabled, items with light-related keywords automatically match base light sources
  - Supports fuzzy matching for: candle, lantern, oil, lamp
  - Only activates when no exact match is found (last resort)
- **Light Utility Module**: New `scripts/utility-lights.js` with comprehensive light management
  - `LightUtility` class for all light-related operations
  - Name normalization for case-insensitive, punctuation-agnostic matching
  - Alias support for handling item name variations
  - Actor flag-based persistence for active light source tracking
  - Token light application and removal with full configuration support
- **Settings Integration**: Three new world settings for light system
  - `tokenLightingFuzzyMatch`: Enable fuzzy matching for base light sources (default: true)
  - `tokenLightingConsumeResource`: Consume items when light is used (default: false)
  - `tokenLightingLinktoAction`: Trigger item action when light is activated (default: false)
- **Quest System Architecture Documentation**: Created comprehensive `overview-quests.md` documentation
  - Documents the complete quest system architecture for reuse by other modules
  - Covers core design philosophy (journal-based storage, HTML state markers, scene pin integration)
  - Details all architecture components (QuestParser, QuestForm, QuestPanel, QuestPin)
  - Explains data flow for quest creation, display, completion, and pin management
  - Documents key design patterns (parser-based architecture, state-based tasks, hash-based numbering)
  - Provides template structure documentation and integration points
  - Includes best practices, extension points, and migration considerations
  - Follows the same format as `overview-codex.md` for consistency

### Technical Improvements
- **jQuery Migration Progress**: Continued migration from jQuery to native DOM methods
  - `panel-party.js`: Fully migrated all remaining jQuery usage (Dialog callbacks, button handlers, DOM manipulation)
  - `panel-quest.js`: Standardized jQuery detection using `getNativeElement()` helper
  - `panel-experience.js`: Complete jQuery to native DOM migration
    - Replaced all jQuery methods (`.find()`, `.html()`, `.click()`, `.addClass()`, `.toggleClass()`, `.hasClass()`, `.css()`)
    - Added `getNativeElement()` helper usage for consistent jQuery detection
    - Converted event handlers to use `addEventListener()` with proper null checks
    - Matches migration pattern used in `panel-stats.js` for consistency
  - `panel-party-stats.js`: Complete jQuery to native DOM migration
    - Removed jQuery detection pattern (`instanceof jQuery`)
    - Replaced `.find()` and `.html()` with native DOM equivalents
    - Converted `.length` check to native DOM null check
    - Simplified code by removing jQuery dependency
  - All migrated files now use consistent patterns for jQuery detection and native DOM operations
  - Improved code consistency and maintainability across panel files
  - **All standard panels now fully migrated** - jQuery usage eliminated from all panel files
- **jQuery Detection Pattern Audit**: Completed comprehensive audit of all jQuery detection patterns
  - Reviewed all files for unnecessary detection patterns on `querySelector()` results
  - Verified all remaining jQuery detection patterns are necessary and correctly placed
  - Updated JSDoc comments for accuracy (`panel-codex.js`)
  - **Result:** All detection patterns are necessary for FoundryVTT v13 compatibility
  - No unnecessary patterns found - codebase follows best practices
- **Event Handler Optimization**: Improved event handling across all panels
  - Removed duplicate data fetching calls that were causing performance issues
  - Added proper event propagation control to prevent multiple click events
  - Implemented processing guards to prevent rapid-fire clicks on async operations
  - Enhanced error handling for deleted items and missing actors

## [13.0.2] - Panel Normalization & Bug Fixes

### Changed
- **Panel CSS Normalization**: Refactored all collapsible panels to use shared CSS classes and IDs
  - Created normalized `.tray-panel-content` class for all panel content containers
  - Standardized toggle icons with IDs (`#gm-toggle`, `#abilities-toggle`, `#stats-toggle`, `#macros-toggle`, `#dicetray-toggle`, `#exp-toggle`, `#health-toggle`)
  - Added centralized CSS rules in `common.css` for consistent panel behavior
  - Removed duplicate CSS from individual panel stylesheets (abilities, stats, macros, dicetray, experience, health, GM)
  - Updated all panel templates to use IDs and shared content class
  - Panels now share consistent expand/collapse animations and styling
- **Panel Structure Refactoring**: Updated panel templates and JavaScript to use normalized pattern
  - All panels now use `id="[panel]-content"` and `class="tray-panel-content"` for content areas
  - All toggle icons use `id="[panel]-toggle"` for consistent targeting
  - JavaScript updated to query by IDs instead of classes
  - Health panel refactored to match normalized pattern

### Fixed
- **Stats Panel Animation**: Fixed expand/collapse animation visual inconsistencies
  - Corrected chevron positioning and layout to match abilities panel
  - Fixed CSS `display`, `position`, `width`, and `height` properties for `.stats-toggle`
  - Chevron now properly positioned and rotates correctly
- **GM Tools Content Scrolling**: Fixed GM Tools panel content not scrolling when larger than container
  - Added `overflow-y: auto` and `overflow-x: hidden` to `.tray-panel-content` in GM panel
  - Content now scrolls properly when exceeding container height
- **Macro Panel Content Scrolling**: Fixed Macro panel content not scrolling when larger than container
  - Added `max-height: 200px`, `overflow-y: auto`, and `overflow-x: hidden` to macro panel content
  - Macros list now scrolls when there are many macros
- **Panel Collapse/Expand Issues**: Fixed panels not collapsing/expanding after CSS normalization
  - Fixed GM panel inverted toggle logic (`isCollapsed` assignment corrected)
  - Fixed dice tray duplicate listeners by cloning `trayTitle` element
  - Fixed health panel not using normalized CSS (refactored to use IDs and shared class)
  - All panels now properly collapse and expand with consistent animations
- **Health Panel Controls Layout**: Fixed health panel controls not filling width and buttons not flexing
  - Added `width: 100%` to `.hp-controls` container
  - Added `flex: 1` to `.hp-btn` buttons for equal width distribution
  - Added `flex: 1` with `min-width: 60px` to `.hp-amount` input
  - Controls now properly fill tray width and buttons expand correctly
- **Ability Roll API Errors**: Fixed `Error: One of original or other are not Objects!` when rolling ability checks
  - Updated `rollAbilityCheck` and `rollSavingThrow` calls to use correct D&D5e v5.2.2 API format
  - Changed from string parameter to object with `ability` property: `{ ability: abilityKey }`
  - Applied fix to both `panel-abilities.js` and `panel-character.js`
- **Ability Save Method**: Fixed `TypeError: this.actor.rollAbilitySave is not a function`
  - Changed `rollAbilitySave` to `rollSavingThrow` (correct method name in D&D5e v5.2.2)
  - Updated both ability panel and character panel save handlers
- **Double-Click Issue**: Fixed ability buttons triggering duplicate roll dialogs
  - Added button cloning in `panel-character.js` to prevent duplicate event listeners
  - Cloned toggle button in `panel-abilities.js` to prevent duplicate toggle listeners
  - Ensures clean event handler setup when `_activateListeners` is called multiple times
- **Health Panel Update Error**: Fixed `TypeError: this.element?.find is not a function` in `_onActorUpdate`
  - Migrated remaining jQuery code in `panel-character.js._onActorUpdate()` to native DOM
  - Replaced `.find()` with `querySelector()` using `getNativeElement()` helper
  - Replaced `.css()` with direct `style.height` assignment
  - Replaced `.append()` with `createElement()` and `appendChild()`
  - Replaced `.remove()` with native `remove()` method

## [13.0.1] - Quick fix

### Changed
- Added the themes folder to the release.yml

## [13.0.0] - v13 Migration

### Important Notice
- **FoundryVTT v13 Required**: This version requires FoundryVTT v13 or later
- **D&D5e v5.1+ Required**: This version requires D&D5e system v5.1 or later
- **Breaking Changes**: All deprecated APIs have been migrated to new namespaced APIs

### Added
- **API Helper Functions**: Created centralized helper functions in `scripts/helpers.js` for FoundryVTT v13 namespaced APIs
  - `renderTemplate()`: Wraps `foundry.applications.handlebars.renderTemplate`
  - `getTextEditor()`: Wraps `foundry.applications.ux.TextEditor.implementation`
  - `getContextMenu()`: Wraps `foundry.applications.ux.ContextMenu.implementation`
- **Quest Pin Configuration System**: Externalized quest pin appearance configuration to `themes/quest-pins.json`
  - Hybrid structure with shared properties and type-specific overrides (quest/objective)
  - Supports theming and easier maintenance without code changes
  - All visual properties (dimensions, colors, fonts, icons, offsets, shapes) are now configurable
- **Handlebars Partial Registration**: Implemented asynchronous partial registration system for handle components
  - Ensures partials are available before template rendering
  - Prevents "partial not found" errors during module initialization
  - Supports `handle-character-portrait` and other handle partials

### Changed
- **FoundryVTT v13 API Migration**: Updated all deprecated global API access to namespaced versions
  - `renderTemplate` → `foundry.applications.handlebars.renderTemplate` (via helper)
  - `TextEditor` → `foundry.applications.ux.TextEditor.implementation` (via helper)
  - `ContextMenu` → `foundry.applications.ux.ContextMenu.implementation` (via helper)
  - `JournalTextPageSheet.activateListeners` → `foundry.applications.sheets.JournalTextPageSheet.activateListeners`
- **D&D5e v5.1+ API Migration**: Updated spell data and movement type access
  - `spell.system.preparation.mode` → `spell.system.method`
  - `spell.system.preparation.prepared` → `spell.system.prepared`
  - `CONFIG.DND5E.movementTypes[type]` → `CONFIG.DND5E.movementTypes[type].label` (with fallback for legacy string values)
- **jQuery to Native DOM Migration**: Replaced all jQuery usage with native DOM methods
  - `scripts/panel-macros.js`: Migrated `.find()`, `.on()`, `.off()`, `.each()`, `.toggleClass()`, `.hasClass()`, `.css()`, `.html()`, `.val()`, `.append()`, `.remove()` to native equivalents
  - `scripts/panel-health.js`: Migrated all jQuery selectors and methods to native DOM
  - `scripts/panel-dicetray.js`: Migrated all jQuery selectors and methods to native DOM
  - `scripts/panel-stats.js`: Migrated all jQuery selectors and methods to native DOM
  - `scripts/panel-abilities.js`: Migrated all jQuery selectors and methods to native DOM
- **Context Menu API**: Updated context menus to use native DOM elements instead of jQuery
  - Added `{ jQuery: false }` option to ContextMenu constructor
  - Updated callbacks to use `li.dataset.itemId` instead of `$(li).data('item-id')`
- **Quest Pin Font Awesome**: Migrated to Font Awesome 6 Pro
  - Updated font family from `"FontAwesome"` to `"Font Awesome 6 Pro"`
  - Added `fontWeight: '900'` to PIXI.Text icon styles to render solid icons
  - Made font weight configurable via `quest-pins.json`
- **Quest Pin Configuration**: Refactored from hardcoded values to JSON-based configuration
  - All pin appearance values now load from `themes/quest-pins.json`
  - Game settings still override JSON config values (maintains backward compatibility)
  - Scale factor applies to all dimensions except title vertical offset

### Fixed
- **Window Rendering Errors**: Fixed `Cannot read properties of undefined (reading 'parentElement')` errors
  - Added `_activateCoreListeners` override in `window-macros.js`, `window-health.js`, and `window-dicetray.js`
  - Prevents FoundryVTT's default form listener activation for non-form windows
  - Wrapped `super.activateListeners(html)` in try-catch blocks for graceful error handling
- **Panel jQuery Errors**: Fixed `panel.find is not a function` errors in all panels
  - Migrated all jQuery selectors to native DOM `querySelector()` and `querySelectorAll()`
  - Replaced jQuery event handlers with native `addEventListener()` and `removeEventListener()`
  - Updated DOM manipulation to use native methods (`classList`, `style`, `innerHTML`, `value`, etc.)
- **Quest Pin Hide Button**: Fixed `TypeError: Cannot read properties of null (reading 'classList')` when clicking "hide quest pins"
  - Added fallback to `newButton` if `event.currentTarget` is null
  - Added null checks before accessing `classList` on icon element
- **Handle Button Actions**: Fixed handle buttons (pin, toggle tray, etc.) not working
  - Corrected variable references after element cloning (`handle` → `handleElement`)
  - Fixed "pin" button `classList` access with proper null checks
  - Extracted `toggleTray()` helper function to reduce duplication
  - Added dedicated event listener for toggle tray button separate from general handle click
  - Updated `toggleTray()` to use correct tray element reference
- **Condition Management**: Fixed multiple issues with condition/effect management
  - Improved condition icon loading to check multiple properties (`icon`, `img`, `image`) from `CONFIG.DND5E.conditionTypes`
  - Added fallback paths for common D&D 5e conditions
  - Added `onerror` handler to condition `<img>` tags for graceful fallback
  - Fixed `DataModelValidationError: ActiveEffect5e validation errors: name: may not be undefined`
    - Ensured `name` and `icon` properties are always defined when creating `ActiveEffect` documents
    - Added fallback logic: `condition.label || condition.name || conditionId` for name
  - Fixed `TypeError: Cannot read properties of null (reading 'classList')` in condition management
    - Stored `e.currentTarget` reference before async operations
    - Added null checks before accessing `classList`
- **Quest Pin Icons**: Fixed quest pins on canvas no longer showing icons
  - Updated Font Awesome font family name to match v6
  - Added `fontWeight: '900'` to ensure solid icon rendering
  - Made font weight configurable in JSON for future customization
- **Handlebars Partial Error**: Fixed `Uncaught (in promise) Error: The partial handle-character-portrait could not be found` on first player load
  - Added safeguard in `createTray()` to ensure partial is registered before rendering
  - Fetches and registers partial if not already present

### Technical Improvements
- **Code Organization**: Centralized API access through helper functions for easier future migrations
- **Error Handling**: Enhanced error handling with null checks and fallback logic throughout
- **Event Delegation**: Improved event handling using native DOM methods and proper event delegation
- **Configuration Management**: Externalized hardcoded values to JSON for better maintainability and theming support
- **Asynchronous Safety**: Added safeguards for race conditions during module initialization and partial loading

## [12.1.14] - Final v12 Release

### Important Notice
- **FINAL v12 RELEASE:** This is the final build of Coffee Pub Squire compatible with FoundryVTT v12
- **v13 Migration:** All future builds will require FoundryVTT v13 or later
- **Breaking Changes:** Users must upgrade to FoundryVTT v13 to use future versions of this module

## [12.1.13] - Character Panel Render Safety Fix

### Fixed
- **Character Panel Render Crash**: Fixed `TypeError: Cannot read properties of null (reading 'find')` error in `CharacterPanel.render()` method
  - Added comprehensive safety checks after async operations to validate `this.element` exists and is a valid jQuery object
  - Added validation for character panel container existence in DOM before attempting DOM manipulation
  - Prevents crashes when element becomes null during async operations (TextEditor.enrichHTML, renderTemplate)
  - Added graceful error handling with early returns when element is invalid

### Added
- **Render Cancellation System**: Implemented render cancellation flag to prevent race conditions
  - Added `_renderInProgress` flag and `_renderCancellationToken` tracking to prevent overlapping renders
  - Cancels stale renders when new render starts, preventing race conditions during rapid token selection
  - Ensures only the most recent render completes, preventing UI inconsistencies
  - Added `try/finally` block to guarantee render flag is always cleared, even on errors

### Changed
- **Error Handling**: Enhanced `CharacterPanel.render()` with comprehensive validation and error logging
  - Added validation checks after async operations to ensure element is still valid before DOM manipulation
  - Added error logging using Blacksmith API for better debugging when render issues occur
  - Improved error messages with actor context (actorId, actorName) for easier troubleshooting

### Technical Improvements
- **Memory Safety**: Verified no memory leaks introduced - all new properties are primitives (boolean, Symbol) that are properly garbage collected
- **Performance**: Improved performance by preventing wasted async computation and DOM manipulation when element is invalid
- **Race Condition Prevention**: Implemented token-based cancellation system to prevent overlapping renders from interfering with each other
- **Code Quality**: Removed redundant flag clearing (finally block handles cleanup), improved code clarity



## [12.1.12] - Auto-Favor Actions for NPCs

### Fixed
- **NPC Auto-Favoring**: Fixed auto-favoring not working when items were created on NPCs before the panel was initialized
  - Updated `createItem` hook to trigger `initializeNpcFavorites` for NPCs even when panel isn't active
  - Added deferred execution pattern using `Promise.resolve().then()` to prevent race conditions during actor/item creation
  - Re-fetches actor to ensure latest state before initializing favorites
  - Added duplicate work prevention to avoid re-initializing if favorites already exist
- **Item Creation Race Conditions**: Fixed potential race conditions when items are created as part of actor creation by deferring auto-favor initialization until after synchronous hook cycle completes

### Changed
- **Error Handling**: Enhanced `createItem` hook with comprehensive try-catch error handling to prevent hook failures from breaking other functionality
- **Safety Checks**: Added validation for item and parent existence before processing in `createItem` hook

### Technical Improvements
- **Deferred Execution**: Implemented microtask-based deferred execution to ensure items are fully initialized before auto-favoring logic runs
- **Actor State Verification**: Added actor re-fetch and state verification to ensure accurate favorite initialization

## [12.1.11] - Timer Tracking & Memory Leak Fixes

### Added
- **Timer Utilities**: Introduced `scripts/timer-utils.js` with shared helpers (`trackModuleTimeout`, `trackModuleInterval`, `moduleDelay`, etc.) so every timeout/interval is registered and automatically cleaned up during `cleanupModule()`.

### Changed
- **Global Timer Usage**: Updated `squire.js`, `manager-panel.js`, quest panels, notes/codex/macro panels, quest pins, helpers, and transfer flows to use the new timer helpers, ensuring consistent cleanup and easier diagnostics.
- **Cleanup Module**: Replaced the zero-delay `setInterval(() => {}, 0)` sweep with targeted `clearAllModuleTimers()` plus tracked animation-frame cancellation to avoid spawning a runaway interval.

### Fixed
- **Canvas Selection Leak**: Wrapped `canvas.selectObjects` only once per session and restored the native method during cleanup so scene swaps no longer stack wrappers or timers.
- **Quest Pin Drags**: Added `_forceEndDrag()` plus PIXI removal hooks to guarantee document-level `pointermove`/`pointerup` listeners are removed even when pins are deleted or scenes change mid-drag; hover tooltips now auto-hide on drag start/end.
- **Quest Tooltips**: Added auto-hide timers and proper cancellation, preventing hover tooltips from lingering indefinitely when events are missed.

## [12.1.10] - Party Stats Panel Improvements

### Changed
- **Party Stats Panel**: Updated MVP leaderboard to use Blacksmith lifetime data, removing the obsolete stats code path.

## [12.1.9] - Multi-Select Performance Improvements & Name Fixes

### Added
- **GM Details Panel**: Introduced a dedicated, collapsible GM-only panel that surfaces resistances, immunities, and enriched biography content with a fixed-height, scrollable layout.
- **GM Panel State Setting**: Added a persistent `isGmPanelCollapsed` client setting so each GM retains their preferred panel state between sessions.
- **Token Display Helper**: New shared utility normalises token display names (token document → token → prototype → actor) for use across panels and handle logic.

### Changed
- **Panel Manager Lifecycle**: Updated `PanelManager` to instantiate, track, and destroy the new `GmPanel`, including shared caching via `PanelManager.setGmDetails` and tray template updates.
- **Stylesheet Organization**: Hooked the new GM panel stylesheet into the default bundle to keep styling centralized and consistent.
- **Handle & Panel Names**: Character panel, handle manager, health panel, and tray headers now rely on the token display helper so UI labels always match placed tokens.
- **Party Panel Namespace**: Renamed party panel classes and selectors to a dedicated `party-` prefix, avoiding CSS bleed from the character panel.
- **Party Feather Click**: Suppressed tray re-initialization when the party-view feather icon opens an actor sheet so the tray no longer jumps actors.
- **Party Stats Panel**: Replaced the legacy combat/session aggregates with a streamlined MVP leaderboard sourced from Blacksmith lifetime data, removing the obsolete stats code path.

### Fixed
- **Multi-Select Performance**: Eliminated 5-10 second lag during multi-token selection with early return optimization
  - Added smart early return check in `_updateHealthPanelFromSelection` to skip expensive operations when nothing changed
  - Prevents unnecessary full panel re-renders, animations, and sounds during rapid multi-select
  - Reduces ~80% of unnecessary DOM operations during multi-token selection
- **Macros Panel Crash**: Fixed "Cannot read properties of null" error in macros panel during multi-select
  - Added null safety check to prevent rendering when DOM placeholder doesn't exist
  - Prevents crashes when tray is being rebuilt during rapid token selection events
- **Token Name Display**: Restored token-based naming across handle portrait, party listings, character panel, health, macros, and dice tray panels so custom token labels appear everywhere.

## [12.1.8] - Hook Restoration & Critical Sync Fixes

### Added
- **Critical Hook Restoration**: Restored missing `globalUpdateActor` hook that was causing major synchronization issues
- **Token Deletion Handling**: Restored `globalDeleteToken` hook to prevent tray crashes when tokens are deleted
- **Active Effect Hooks**: Added `createActiveEffect` and `deleteActiveEffect` hooks for proper condition synchronization
- **Comprehensive Hook Audit**: Created detailed audit report identifying 5-6 missing critical hooks
- **Multi-Token Selection Support**: Enhanced `globalControlToken` hook with optimized multi-select handling and debouncing
- **Bulk Selection Tools**: Added canvas selection support for lasso and box selection tools via `globalCanvasReady` enhancement
- **New Token Detection**: Restored `globalCreateToken` hook for automatic handle updates when new tokens are created
- **Auto-Favoriting for NPCs**: Restored automatic favoriting of equipped weapons and prepared spells for NPCs/monsters
- **Pause Game Handling**: Restored `globalPauseGame` hook to prevent stale data after game pause/resume
- **Item Transfer System**: Added "send item" functionality to weapons panel matching inventory panel capabilities
- **Panel Refresh Optimization**: Implemented targeted panel refresh for item transfers (weapons/inventory only) instead of full panel re-render

### Fixed
- **Health Panel Sync**: Health bars now update immediately when HP changes externally (spells, damage, healing)
- **Handle Synchronization**: Handle now refreshes when actor attributes change (AC, level, movement, etc.)
- **Effect Display**: Status effects in handle now update when conditions are added/removed via token HUD
- **Spell Slot Updates**: Spells panel now refreshes when spell slots are modified
- **Token Deletion Crashes**: Tray no longer crashes when active token is deleted, gracefully switches to next available token
- **Memory Leaks**: Removed legacy dead code from panel cleanup methods that was causing hook accumulation
- **Multi-Select Performance**: Fixed 3-5 second lag during multi-token selection with optimized update logic
- **Selection Display Updates**: Fixed selection display not updating properly during rapid token selection
- **Canvas Selection Tools**: Fixed lasso and box selection tools not updating tray display
- **New Token Integration**: Fixed handle not updating when new tokens are created on canvas
- **NPC Equipment Management**: Fixed NPCs/monsters not auto-favoriting equipped weapons and prepared spells
- **Game Pause Issues**: Fixed stale data display after game pause/resume cycles
- **Item Transfer Panel Updates**: Fixed weapons and inventory panels not refreshing after item transfers
- **"New" Badge Display**: Fixed "new" badges not appearing on weapons panel after item transfers
- **Transfer Performance**: Eliminated 5+ second delay during item transfers by optimizing panel refresh logic

### Changed
- **Hook Management**: Migrated to centralized BlacksmithHookManager for consistent hook lifecycle management
- **Panel Lifecycle**: Enhanced PanelManager to properly track and update token references alongside actor references
- **Legacy Code Cleanup**: Removed outdated hook cleanup comments and dead code from panel destroy methods
- **Performance Optimization**: Simplified multi-select logic to eliminate complex debouncing that was causing delays
- **Debug Logging**: Removed excessive console.log statements and replaced with clean, production-ready comments
- **Documentation**: Updated false comments about "moved" or "centralized" hooks to reflect actual architecture
- **Code Quality**: Cleaned up temporary debug comments, keeping only durable, necessary documentation

### Technical Improvements
- **Hook Architecture**: Restored proper hook registration pattern following established BlacksmithHookManager conventions
- **Token Reference Tracking**: Enhanced system to maintain both actor and token references for proper name display
- **Error Prevention**: Added comprehensive null checks and fallbacks in hook implementations
- **Performance**: Eliminated unnecessary re-renders by implementing targeted updates for specific change types
- **Multi-Select Optimization**: Implemented efficient selection handling that scales with token count
- **Canvas Integration**: Enhanced canvas selection tools integration with proper event handling
- **Auto-Favoriting Logic**: Restored intelligent auto-favoriting system for NPCs with compendium safety checks
- **Code Cleanup**: Comprehensive removal of debug logging, false comments, and legacy code references
- **Production Readiness**: Cleaned up all temporary development artifacts for production deployment

## [12.1.7] - Bug Squashing

### Fixed
- **Duplicate Quest Notifications**: Fixed multiple identical quest/objective notifications appearing in menubar when selecting tokens
- **Memory Leaks**: Fixed severe memory leaks caused by PanelManager creating new instances without cleaning up old ones
- **Quest Panel Instance Management**: Made notification IDs global static properties to prevent duplicates across QuestPanel instances
- **Panel Cleanup**: Added proper cleanup of old PanelManager instances before creating new ones to prevent memory accumulation
- **Event Listener Leaks**: Fixed event listeners and hooks not being properly cleaned up when switching between tokens

### Changed
- **Quest Notification System**: QuestPanel now uses static notification IDs instead of instance properties to prevent duplicates
- **PanelManager Lifecycle**: Added `_cleanupOldInstance()` method to properly destroy old instances before creating new ones
- **Memory Management**: Enhanced cleanup to destroy all panel instances (questPanel, characterPanel, etc.) when switching tokens


## [12.1.6] - Item Transfer Improvements

### Added
- **GM Approval System**: New setting to require GM approval for all player-to-player transfers
- **Transfer Request Cards**: Interactive chat cards for transfer requests with Accept/Reject buttons
- **GM Approval Cards**: Dedicated approval interface for GMs with Approve/Deny buttons
- **Transfer Validation**: Items are validated before transfer to ensure they still exist and have sufficient quantity
- **Automatic Expiration**: Transfer requests automatically expire after configurable timeout (10-180 seconds, default 30)
- **Transfer Timeout Setting**: New world setting to configure how long transfer requests remain valid
- **Personalized Messages**: Different chat messages for senders, receivers, and GMs for all transfer outcomes
- **Transfer Status Messages**: Clear feedback for waiting, accepted, rejected, expired, and failed transfers
- **Failure Notifications**: Detailed error messages when transfers fail due to missing items or insufficient quantity
- **Transfer from Tray**: New "Send" icon in inventory panel to initiate transfers via character selection window
- **Character Selection Window**: Reusable window for selecting transfer recipients with resizable interface
- **Actor Type Visualization**: Color-coded borders for different actor types (green=characters, red=monsters, blue=NPCs)
- **Unified Transfer System**: Centralized TransferUtils for consistent transfer behavior across all flows
- **Hostility-Based Classification**: NPCs classified as monsters (red) or friendly NPCs (blue) based on disposition

### Changed
- **Transfer Flow**: Completely redesigned transfer system with proper approval workflows
- **Chat Card System**: All transfer messages now use consistent chat card templates instead of hardcoded HTML
- **Message Targeting**: Improved whisper targeting to ensure correct users receive appropriate messages
- **GM Bypass**: GMs can transfer items between characters without requiring self-approval
- **Transfer Cleanup**: Automatic cleanup of request messages and waiting messages after transfer completion
- **Timer Management**: Background timer system for proactive transfer expiration with proper cleanup
- **Code Architecture**: Extracted transfer logic into reusable TransferUtils module for consistency
- **Character Window Logic**: GMs now see all actor types (characters, monsters, NPCs) while players see only party members
- **Transfer Unification**: Both drag-and-drop and send flows now use identical transfer logic

### Fixed
- **Duplicate Messages**: Fixed GM receiving duplicate transfer complete messages
- **Message Persistence**: Fixed sender "waiting" messages persisting after transfer completion
- **Deleted Item Handling**: Fixed crashes when attempting to transfer deleted items
- **Quantity Validation**: Fixed transfers proceeding when insufficient quantity available
- **Template Errors**: Fixed duplicate closing tags in chat card templates
- **Null Reference Errors**: Added proper null checks and fallbacks for deleted items
- **GM Approval for Offline Players**: Fixed GM not receiving approval cards when target player is offline in send flow
- **Transfer Data Consistency**: Fixed "Transfer request data not found" errors by ensuring proper data structure
- **Code Duplication**: Eliminated duplicate transfer methods across different panels



## [12.1.5] - Bug Squashing

### Fixed
- **Codex Import Template**: Updated codex import to load template from `prompts/prompt-codex.txt` file instead of hardcoded template
- **Rulebooks Replacement**: Codex import now properly replaces `[ADD-RULEBOOKS-HERE]` placeholder with user's default rulebooks setting
- **Build Workflow**: Added `prompts/` folder to GitHub workflow build process to ensure prompt files are included in releases

### Changed
- **Consistent Template Loading**: Both quest and codex imports now use the same dynamic template loading approach
- **Template Management**: Moved codex template from hardcoded JavaScript to external text file for easier maintenance

## [12.1.4] - Bug Squashing

### Added
- **Active Objective Notifications**: QuestPanel now manages active objective notifications using Blacksmith API
- **Quest Notification Management**: Enhanced quest notification system with proper creation, updates, and cleanup
- **Party Panel Integration**: Added party and partyStats panels to PanelManager for improved party management
- **Menubar Tool Registration**: Integrated macros functionality with Blacksmith menubar system

### Changed
- **Menubar Tool Titles**: Updated menubar tool titles for clarity - "Open Dice Tray" → "Dice Tray", "Open Macros" → "Macros"
- **Tray Positioning**: Enhanced CSS positioning to account for Blacksmith menubar interface offset
- **Quest Notification Messages**: Improved clarity of quest notification messages for better user feedback
- **Panel Manager Structure**: Enhanced panel management system with proper party panel integration

### Fixed
- **Tray Layout Issues**: Fixed tray positioning conflicts with Blacksmith menubar interface
- **Quest Notification Cleanup**: Improved quest notification cleanup when module is disabled
- **Panel Registration**: Fixed party and partyStats panel registration in PanelManager
- **Active Objective Management**: Enhanced active objective notification handling with proper ID tracking


## [12.1.3] - Quest Improvements

### Added
- GM notes now display inline with objectives instead of requiring hover tooltips
- GM notes use certificate icon (fa-file-certificate) and golden styling for easy identification
- GM notes are only visible to GMs, maintaining privacy

### Changed
- Objective pins on canvas now display objective text instead of quest title
- Improved objective highlighting with yellow border and background when selected from canvas pins
- Enhanced visual styling for GM notes and treasure indicators

### Fixed
- Objective pins now correctly show the actual objective description rather than generic "Objective X" text
- Improved CSS specificity for treasure and GM note icons


## [12.1.2] - Bug Fixes

### Fixed
- Fixed tag

## [12.1.1] - Bug Fixes

### Fixed
- Fixed tag


## [12.1.0] - MAJOR UPDATE - Blacksmith API Migration

### Added
- **Blacksmith API Integration**: Full migration to use Blacksmith API for enhanced functionality and consistency
- **New Favoriting System**: Completely redesigned favoriting system with separate regular favorites and handle favorites
- **Handle Favorite Toggle**: New square-heart icon in favorites panel to toggle items for handle display
- **Auto-Handle Favorites for NPCs**: NPCs and monsters now automatically add their key abilities to both panel and handle favorites
- **Performance Optimizations**: Dramatically improved favoriting performance with targeted DOM updates instead of full panel re-renders
- **Interactive Spell Slot Management**: GM-only click system for managing spell slot usage with visual feedback
- **Party Health Integration**: Clicking party health bar now opens/populates health panel with entire party data

### Changed
- **Favoriting Architecture**: Separated regular favorites (shows in favorites panel) from handle favorites (shows in handle)
- **Heart Icon Behavior**: Heart icons in all panels now correctly reflect regular favorite status
- **Handle Display Logic**: Handle now only shows items that are explicitly handle-favorited, not all favorites
- **Module Structure**: Reorganized module.json to follow standardized structure with proper field grouping
- **Spell Slot Visual States**: Implemented correct visual representation matching character sheet (filled=available, unfilled=expended)
- **Token Selection System**: Migrated from actor ID-based to token ID-based selection for proper multi-token support

### Fixed
- **Heart Icon State**: Fixed heart icons in inventory, weapons, and spells panels not showing correct favorited state
- **Performance Issues**: Eliminated massive over-rendering that caused favoriting operations to be very slow
- **Handle Favorite Logic**: Fixed handle showing all favorites instead of only handle-favorited items
- **Missing Handlebars Helper**: Added missing `getHandleFavorites` helper for handle template functionality
- **Event Listener Duplication**: Fixed critical event listener duplication issue that caused exponential performance degradation
- **Legacy Auto-Sync Logic**: Removed conflicting auto-sync logic for handle favorites to allow full manual control
- **Visual State Updates**: Fixed heart icon states not updating correctly across all panels after favoriting changes
- **Handle Item Availability**: Added "unavailable" class to handle favorites for unequipped/unprepared items
- **Handle Order Consistency**: Fixed handle favorites order to match panel favorites (with visual reversal for handle rotation)
- **Spell Level Filtering**: Fixed broken spell level filtering in Spells panel by correcting event listener target
- **Spell Slot System**: Implemented interactive spell slot management for GMs with correct visual states and click logic
- **Token Selection Logic**: Fixed token selection in Party tab to use unique token IDs instead of shared actor IDs
- **Monster Name Display**: Fixed Party tab to show specific token names instead of generic actor names
- **Dice Tray Button**: Fixed dice tray button not showing in handle due to typo in template condition
- **Memory Leaks**: Fixed severe hook accumulation causing game slowdown by implementing proper cleanup in all panel destroy methods
- **Duplicate Event Handlers**: Removed duplicate event handlers for conditions button, macro icons, party member icons, and print character button
- **NPC Favorites Initialization**: Fixed TypeError in NPC auto-favorite system when accessing actor collection
- **Party Health Bar Click**: Fixed party overview health bar to properly select all player-owned tokens and populate health panel
- **Handle Favorites Order**: Fixed handle favorites to display in correct order matching panel favorites (reversed for handle rotation)

### Technical Improvements
- **Targeted DOM Updates**: Replaced 4 full panel re-renders with smart DOM updates for 10-20x performance improvement
- **Data Consistency**: Ensured all panel data structures stay synchronized without full re-renders
- **Event Handler Optimization**: Streamlined event handling for favoriting operations
- **Memory Management**: Improved cleanup and data synchronization between panels
- **Namespaced Events**: Implemented proper event namespacing to prevent duplicate event listeners
- **Spell Slot Management**: Added comprehensive spell slot system with visual feedback and real-time updates
- **Token ID System**: Migrated from actor ID-based to token ID-based selection for proper multi-token support
- **Template Condition Fixes**: Corrected Handlebars template conditions for proper conditional rendering
- **Debug Code Cleanup**: Removed verbose debug logging and debug comments for cleaner production code
- **Hook Cleanup System**: Implemented comprehensive destroy methods for all panels to prevent FoundryVTT hook accumulation
- **Module-Level Cleanup**: Added module disable hooks to clean up global hooks and prevent memory leaks
- **Panel Lifecycle Management**: Enhanced PanelManager cleanup to properly destroy all instantiated panels

### Files Modified
- `scripts/panel-favorites.js` - Complete favoriting system overhaul with performance optimizations and NPC auto-favorites
- `scripts/panel-inventory.js` - Updated to check correct favorites flag for heart icon state
- `scripts/panel-spells.js` - Updated to check correct favorites flag for heart icon state and added spell slot management
- `scripts/panel-weapons.js` - Updated to check correct favorites flag for heart icon state
- `scripts/panel-party.js` - Fixed token selection logic, monster name display, and party health bar integration
- `scripts/panel-character.js` - Removed duplicate event handlers and added destroy method for hook cleanup
- `scripts/panel-macros.js` - Removed duplicate event handlers and added destroy method for hook cleanup
- `scripts/panel-party-stats.js` - Added destroy method for hook cleanup
- `scripts/manager-panel.js` - Enhanced cleanup method to destroy all instantiated panels
- `scripts/manager-handle.js` - Removed debug code and optimized event handling
- `scripts/helpers.js` - Added missing `getHandleFavorites` Handlebars helper
- `scripts/squire.js` - Removed verbose debug logging
- `scripts/manager-hooks.js` - Removed debug comments
- `scripts/quest-pin.js` - Added module-level cleanup hooks for global hook management
- `styles/panel-favorites.css` - Added styling for handle favorite toggle icons
- `styles/panel-spells.css` - Added spell slot styling and hover effects
- `styles/tray.css` - Updated handle favorite icon colors for consistency
- `templates/partials/handle-favorites.hbs` - Updated to use handleFavorites data source and added unavailable class logic
- `templates/panel-spells.hbs` - Added spell slot template with proper visual states and order
- `templates/panel-party.hbs` - Fixed monster name display to use token names and token ID selection
- `templates/handle-player.hbs` - Fixed dice tray button display condition
- `templates/handle-codex.hbs` - Fixed dice tray button display condition
- `templates/handle-notes.hbs` - Fixed dice tray button display condition
- `templates/handle-party.hbs` - Fixed dice tray button display condition
- `templates/handle-quest.hbs` - Fixed dice tray button display condition
- `module.json` - Reorganized to follow standardized structure

### Breaking Changes
- **Favoriting System**: The way favorites work has fundamentally changed - regular favorites and handle favorites are now separate
- **Handle Display**: Items in the handle must now be explicitly handle-favorited, not just regular favorites
- **Performance**: Favoriting operations are now much faster but use different update mechanisms

## [12.0.22] - Quest Import/Export Fix & Major Code Refactoring

### Fixed
- **Quest Import/Export Field Mapping**: Fixed critical mismatch between export and import field names that prevented rich quest data from being properly restored
  - **Field Name Alignment**: Import now correctly maps `gmnotes` → `gmHint` and `tasktreasure` → `treasureUnlocks`
  - **Treasure Format Conversion**: Import converts export format `[[treasure]]` to expected format `((treasure))`
  - **Progress Preservation**: Existing quest completion status, task states, visibility settings, and scene pin positions are fully preserved during import
  - **Backward Compatibility**: Import works with both old and new export formats
  - **Files Modified**: `scripts/panel-quest.js` - Updated both `_mergeJournalContent()` and `_generateJournalContentFromImport()` methods

### Technical Improvements
- **Smart Field Mapping**: Import logic now checks for both field name formats to ensure compatibility
- **Rich Data Restoration**: GM notes and task treasure are now properly restored during import operations
- **State Preservation**: Enhanced import system maintains all existing quest progress and player states
- **Format Consistency**: Treasure format is automatically converted to match QuestParser expectations

### Added
- **New HandleManager Class**: Created dedicated `scripts/manager-handle.js` to centralize all handle-related functionality
- **Separation of Concerns**: Cleanly separated handle UI logic from overall tray management
- **Enhanced Event Handling**: Implemented `.off().on()` pattern to prevent duplicate event listeners on re-renders
- **Handle Fade Logic**: Added automatic handle overflow detection with fade effect and resize listener management

### Changed
- **Panel Manager Refactoring**: Moved all handle-related methods and event handlers from `PanelManager` to `HandleManager`
- **Event Handler Consolidation**: Centralized all handle click events, condition management, health interactions, and quest handling
- **Template Improvements**: Fixed typo in `handle-conditions.hbs` ("Condtitions" → "Conditions")
- **Party View Enhancement**: Updated `handle-party.hbs` to properly pass member context to health partials
- **Quest Data Loading**: Enhanced quest parsing with fallback data and improved error handling

### Additional Fixes
- **Initial Handle Data Loading**: Fixed issue where handle data was missing on initial client load by ensuring `HandleManager.updateHandle()` is called after tray creation
- **Duplicate Event Handlers**: Eliminated duplicate click handlers that were causing conflicts between `PanelManager` and `HandleManager`
- **Condition Click Events**: Fixed condition icon clicks (left-click for description, right-click for remove) and conditions button functionality
- **Quest Data Parsing**: Resolved NaN values and missing quest names by improving quest data fallbacks and template handling
- **Party Member Health Bar Clicks**: Fixed party member health bars loading current player's health instead of clicked member's data
- **Import/Export Issues**: Resolved module import errors for `SQUIRE`, `Dialog`, `getBlacksmith`, and other dependencies
- **Handle Fade Errors**: Fixed `TypeError` in `_updateHandleFade` by adding robust null checks and proper initialization timing

### Additional Technical Improvements
- **Code Organization**: Eliminated code duplication between `PanelManager` and `HandleManager`
- **Event Management**: Improved event listener lifecycle management with proper cleanup and reattachment
- **Error Handling**: Enhanced error handling throughout handle operations with comprehensive logging
- **Template System**: Added Handlebars `add` helper for quest objective numbering
- **Memory Management**: Added proper cleanup methods to prevent memory leaks from event listeners

### Files Modified
- `scripts/panel-quest.js` - Updated both `_mergeJournalContent()` and `_generateJournalContentFromImport()` methods
- `scripts/manager-panel.js` - Removed handle-related code, added HandleManager integration
- `scripts/manager-handle.js` - New file with all handle functionality
- `scripts/helpers.js` - Exported `getBlacksmith()` function
- `scripts/squire.js` - Added Handlebars `add` helper
- `templates/partials/handle-conditions.hbs` - Fixed typo
- `templates/handle-party.hbs` - Enhanced member context passing
- `templates/partials/handle-quest.hbs` - Improved quest data handling


## [12.0.21] - Enhanced Codex

### Added
- **Phase 1: Enhanced Add Window with Drag & Drop**
  - Drag & drop functionality for tokens, items, and journal entries to auto-populate form fields
  - Smart auto-population: Name, Category, Tags, and Image fields automatically filled based on dropped entity
  - Category detection: Auto-suggests "Characters" for actors, "Items" for items, and extracts categories from journal content
  - Tag generation: Auto-generates relevant tags based on entity properties (actor type/race/class, item type/rarity)
  - Image handling: Automatically sets entity images and provides preview with remove functionality
  - Enhanced form layout with organized sections and improved visual hierarchy

### Changed
- **Complete UI Redesign**: Modernized codex form with card-based layout, better spacing, and visual hierarchy
- **Form Structure**: Reorganized into logical sections (Basic Information, Content, Tags) with clear headings
- **Label Positioning**: Moved all form labels above their respective form elements for better readability
- **Dropdown System**: Replaced text inputs with smart dropdowns for categories and locations, including existing options and "New" options
- **Window Naming**: Renamed window ID to `codex-entry-window` for clarity and added corresponding CSS class

### Fixed
- **Critical CSS Issue**: Fixed global CSS selectors that were breaking ALL other forms in FoundryVTT by properly namespacing all styles to `.codex-form` only
- **Dropdown Visibility**: Fixed dropdown text not being visible by using FoundryVTT's proven CSS approach with `var(--color-text-light-highlight)` variables
- **Description Field**: Fixed description and plot hook fields not being properly saved by implementing robust form data handling
- **Location Formatting**: Fixed HTML entities (`&gt;`) displaying instead of actual `>` characters in location dropdowns
- **Form Submission**: Enhanced form submission with manual FormData processing to ensure all fields are captured correctly
- **Category Selection**: Fixed category dropdown not properly registering selected values
- **Tag Handling**: Improved tag processing to handle undefined/null values gracefully

### Technical Improvements
- **Proper Namespacing**: All CSS now properly scoped to avoid conflicts with other FoundryVTT modules
- **Form Data Handling**: Implemented robust FormData capture and processing for reliable form submission
- **Error Handling**: Added comprehensive debugging and error logging throughout the form submission process
- **Code Organization**: Cleaner, more maintainable code structure following FoundryVTT best practices

## [12.0.20] - Readiness

### Added
- Quest pin labels toggle functionality for both GMs and players with independent user preferences
- Auto-show quest pins feature that automatically displays pins when GMs drag quests/objectives to canvas while pins are hidden
- Enhanced quest pin visibility system with proper GM and player control

### Changed
- Renamed quest tooltip templates for better clarity: `tooltip-quest-pin.hbs` → `tooltip-pin-quests-quest.hbs`, `tooltip-quest.hbs` → `tooltip-pin-quests-objective.hbs`
- Updated quest pin tooltips to use Font Awesome icons instead of unicode characters for consistency
- Redesigned objective pins to be square with large quest type icons and improved layout
- Enhanced quest pin tooltips with better participant portrait display and improved styling
- Updated quest pin icon colors to use state-based coloring matching ring colors
- Improved quest pin title system with configurable font size, max width, vertical offset, and drop shadows
- Enhanced quest status dropdown positioning with boundary checking to prevent off-screen display
- Improved quest pin click behavior to automatically expand collapsed sections when navigating to quests

### Fixed
- Fixed deprecated `EffectsCanvasGroup#visibility` API usage in quest pins, now using `Canvas#visibility` for FoundryVTT v12+ compatibility
- Fixed settings registration timing issue that caused "excludedUsers is not a registered game setting" error by adding safety checks for unregistered settings
- Fixed error when attempting to modify actors from compendiums during auto-favorite operations for NPCs/monsters, now properly detecting compendium actors using both `actor.pack` and `actor.collection.locked` checks
- Enhanced compendium detection across all favorite management functions to prevent "You may not modify the Compendium which is currently locked" errors
- Fixed quest pin visibility toggle to work for both GMs and players (was previously restricted to players only)
- Fixed quest pin visibility logic to properly respect user preferences for all users including GMs
- Fixed quest status dropdown menu positioning and boundary issues
- Fixed quest status changes via dropdown not updating pin icons and appearance
- Fixed quest pin labels toggle to only hide/show titles while keeping quest numbers visible
- Fixed quest pin tooltip visibility reporting to use actual pin states instead of parsed journal data
- Fixed quest pin icon colors and rings for different quest statuses (Hidden, In Progress, Not Started, Failed, Completed)
- Fixed quest pin title positioning and anchoring for better text placement control
- Fixed quest pin click navigation to automatically expand collapsed sections
- Fixed quest pin title display to show actual quest names instead of "Unknown Quest/Objective"

### Cleaned Up
- Removed unnecessary debug logging from quest pin system while maintaining error trapping for actual problems
- Cleaned up console noise from constructor, state changes, click events, and loading operations
- Kept essential error logging for data fetching, persistence operations, and state management failures

## [1.0.19] - Debug Removal

### Fixed
- Debug removal

## [1.0.18] - Quest Overhaul

### Added
- Comprehensive quest management tools: clear all quest pins (scene-level and all-scenes), clear quest pins for specific quests, hide/show objective pins toggle for players.
- Pin visibility class to handle quest progress: objectives with visible pins are now visually marked.
- Player toggle button for pin visibility with icon state changes and user flag persistence.
- GM scene-level and quest-level buttons with confirmation dialogs for pin management.
- Player notifications when quests are automatically unpinned.
- Proper quest state synchronization across all components.
- Persistent window state management for macros, dice tray, and health windows, including viewport validation and error handling.
- Tools are now accessible regardless of context.

### Changed
- Unified tooltip data for quests: all tooltips now use a shared Handlebars template and QuestParser as the source of truth.
- Enhanced pin visibility updates with proper appearance refresh and automatic unpinning when quests are hidden from players.
- Quest-level visibility now properly controls all objective pin visibility for players.
- Enhanced health window update detection for real-time HP changes.
- Improved error handling and Blacksmith logging for window state restoration.

### Fixed
- Fixed syntax error in quest pin state update (panel-quest.js).
- Removed duplicate event handler setup in manager-panel.js.
- Fixed duplicate class attribute in partials/quest-entry.hbs.
- Fixed tray window click issue that caused the tray to disappear.
- Fixed squire tray disappearing on scene change.
- Fixed handle quest progress order and index mapping.
- Fixed handle quest data loading on scene change.
- Fixed tooltip data consistency between handle and pin.
- Fixed quest visibility toggle pin refresh and pin appearance for GM/players.
- Fixed excludedUsers settings issue and critical startup error.
- Fixed quest import/export and tooltip data consistency.
- Fixed most critical bugs and improved data consistency and code architecture.

## [1.0.17] - Printing Character Sheets

### Added
- New character sheet printing functionality accessible from the character panel
- Comprehensive print template with professional styling and layout
- Print button (scroll icon) in character panel header for easy access
- Detailed character information including portrait, basic info, and class details
- Complete ability scores display with modifiers and visual icons
- Skills section with dual-column layout and ability score associations
- Inventory management with item details, quantities, weights, and prices
- Spell listing with school, level, and usage information
- Features and traits section with detailed descriptions
- Print-optimized CSS with proper page breaks and A4 formatting
- Image loading timeout handling for reliable printing
- Error handling for popup blockers and invalid actor data

### Changed
- Enhanced character panel with print functionality integration
- Improved item description parsing to separate main content from additional details
- Updated template system to support comprehensive character data export
- Optimized print layout for both screen viewing and physical printing

### Fixed
- Resolved item weight display issues for various data structures
- Fixed skill icon mapping for all D&D 5e skills
- Improved error handling for missing or invalid character data
- Enhanced template rendering reliability with proper validation

## [1.0.16] - Macros and Handles

### Added
- Added empty macro slot placeholder with "Add" button when no macros are present
- Added visual feedback for macro handles during drag operations
- Added proper event handling for macro creation and updates

### Changed
- Improved macro panel rendering to always show at least one empty slot
- Enhanced macro handle functionality with proper drag and drop support
- Improved macro handle positioning and interaction areas
- Enhanced macro panel refresh logic to maintain UI state
- Improved macro panel performance with optimized rendering

### Fixed
- Fixed macro panel layout to maintain consistent spacing and alignment
- Fixed macro handle visibility and interaction states

## [1.0.15] - Drag and Drop Fix

### Fixed
- Fixed persistent issue with drag and drop functionality where subsequent drops wouldn't work until switching tabs
- Implemented proper event handler reattachment after DOM updates in the panel manager
- Ensured drag and drop handlers are explicitly removed and reattached after tray updates
- Added dedicated method for attaching drag handlers to improve code organization
- Added debug logging to track event handler reattachment

## [1.0.13] - Quests and Codex

### Added
- Visual feedback for drag and drop operations with highlighted drop targets
- CSS styling for drop targets with green borders and animations
- Improved quest journal entry handling with better section management

### Changed
- Modified tag system to only include explicit tags from quest entries
- Removed automatic inclusion of participant names and status as tags
- Improved persistence of collapsed/expanded state for quest categories
- Enhanced drag and drop functionality for actors and items
- Updated quest panel data attribute selectors for better state tracking

### Fixed
- Fixed issue with collapsed/expanded state not persisting between sessions
- Resolved problem with duplicate "Participants:" sections when dragging actors
- Fixed drag and drop functionality for adding actors as participants
- Fixed drag and drop functionality for adding items as treasure
- Improved drag handler implementation using DOM-based approach instead of regex

## [1.0.12] - Bug Fixees

### Fixed
- Fixed participant issue
- Fixed missing tasks for players

## [1.0.11] - Notes Panel & Quest Improvements

### Added
- New journal notes panel in the tray for easy access to journal entries
- Read-only journal content display with proper formatting
- Journal page selection dropdown for multi-page journals
- Custom toolbar with edit and open buttons to access Foundry's native journal editor
- Live content updates when journal entries are modified
- Visual overlay indicating when content is being edited by any user
- Proper hooks integration to refresh content when journal pages are updated
- Auto-favorite equipped weapons and prepared spells for monsters/NPCs when first selected (only if they don't already have favorites)
- Dynamic codex category icons based on category (Characters, Locations, Artifacts)
- Always-enabled clear (X) button that clears both search and tag filters and resets results
- Clicking a tag in an entry now clears all filters and filters by that tag only
- Reorganized quests by status (In Progress, Not Started, Completed, Failed) rather than by category
- Quest counts now display in section headers (e.g., "In Progress (3)")
- Pinning functionality for quests in the "In Progress" section with auto-expansion
- JSON export/import functionality for both quest and codex panels
- Added feather icon to quest cards to open the quest journal directly

### Changed
- Improved CSS organization and removed duplicate styles
- Plot Hook and other fields are now robustly parsed regardless of colon placement or HTML structure
- Improved tag/search/expand/collapse logic for all filter states
- Changed progress bar to only display when progress is greater than 0%
- Modified the border styling for expanded quest entries
- Enhanced quest import functionality to check for existing entries and update them
- Quest export now includes quests from all status groups, not just category groupings
- Cleaned up the codebase by removing unnecessary console.log debug statements

### Fixed
- Fixed scrollbar issues to ensure only one scrollbar appears in the notes panel
- Resolved content refresh issues when journal entries are edited
- Fixed critical hook function naming issue that was preventing content updates
- Improved CSS styling for better integration with Foundry's UI
- Consolidated duplicate CSS to improve maintainability
- Fixed event handler binding to prevent odd expand/collapse behavior after filtering
- Fixed quest import to properly handle UUID and preserve original category information

## [1.0.10] - Transfers and More

### Fixed
- Fixed issue where players were receiving both sender and receiver transfer messages
- Resolved permission errors when players attempted to delete or update chat messages
- Improved handling of socketlib for transfer message management
- Fixed duplicate chat messages during item transfers between characters
- Addressed transfer chat messages not being removed after acceptance/rejection
- Fixed message ordering in chat log to maintain logical conversation flow

### Changed
- Improved transfer chat messages with personalized text based on sender/receiver status
- Enhanced the chat templates to properly handle singular/plural item descriptions
- Restructured socket handlers for more reliable GM-mediated message delivery
- Improved handling of transfer request buttons to prevent double-clicking
- Updated chat message flow to ensure logical ordering of acceptance and completion messages

### Added
- Added notes in the tray... very alpha
- Added GM-mediated message deletion for transfer request cleanup
- Implemented visual feedback during transfer processing with disabled buttons
- Added replacement messages for transfer requests after processing
- Created new socket handler for GM-executed message cleanup
- Added proper error handling and fallbacks for socket communication

## [1.0.9] - Event Handler Fixes

### Fixed
- Fixed multiple click events being triggered when using weapons, spells, features, and inventory items
- Added proper event cleanup and namespacing to prevent event handler accumulation
- Improved event delegation consistency across all panels

## [1.0.8] - Bug Fixes

### Fixed
- Fixed tray behavior when switching between tokens to prevent disappearing and re-sliding
- Resolved issue with panel settings not being properly registered
- Improved tray state preservation during token switches
- Fixed animation glitches during tray updates
- Ensured proper panel instance management during token transitions

### Changed
- Refactored tray update logic to maintain consistent state
- Improved panel instance handling for better stability
- Enhanced tray element management to prevent duplicate elements
- Updated panel visibility settings handling for better reliability

## [1.0.7] - Unified cards

### Changed
- Unified all item transfer chat cards to use a single utility for consistent data and appearance.
- Updated transfer card types to: `transfer-gm` (GM/compendium/world drops), `transfer-complete` (actor-to-actor transfers), and `transfer-request` (transfer requests with accept/reject).
- Refactored `panel-party.js` and `manager-panel.js` to use the new card system for all transfer scenarios.
- Reverted transfer request chat message logic to its original, pre-card-system form for stability and compatibility.

### Fixed
- Fixed duplication of transfer request chat messages in GM and sender clients.
- Fixed "Transfer request not found" error when accepting/rejecting a transfer.
- Fixed ReferenceError for `sourceActor` in transfer request button handler by fetching all data from chat message flags.
- Ensured only the correct clients receive transfer request messages (GM and receiver get the actionable message, sender gets a confirmation).

## [1.0.6] - Transfers

### Added
- New item transfer system between characters
- Party panel for managing item transfers and player interactions
- Support for quantity selection when transferring stackable items
- Dialog confirmation for item transfer requests
- Chat message notifications for completed transfers
- Transfer history tracking with timestamps
- Flag-based transfer request system for persistent state

### Changed
- Improved drag and drop handling for items
- Enhanced user permissions checking for item transfers
- Added ability for GMs to facilitate transfers between players

## [1.0.5] - Exclude Users

### Fixed
- Fixed critical issue where excluded users would still see the tray
- Improved handling of user exclusion to prevent any tray elements from displaying

## [1.0.4] - Cleanup

### Added
- Proper cleanup of CSS variables and UI margins for excluded users

### Changed
- Improved module initialization to handle excluded users properly
- Moved CSS variable setup to after user exclusion check
- Enhanced handling of Handlebars partials for excluded users

### Fixed
- Fixed issue where excluded users would still see the tray
- Improved handling of user exclusion to prevent any tray elements from displaying

## [1.0.3] - Uswer contxt

### Changed
- Updated initialization process to better handle user context
- Improved error handling for template registration

### Fixed
- Fixed issues with user visibility and initialization
- Resolved template registration timing issues

## [1.0.2] - Improved panels

### Changed
- Updated dice tray icon to match the style of condition icons
- Enhanced dice tray icon with improved hover effects and animations
- Standardized icon sizes and visual feedback across the handle bar

### Fixed
- Fixed critical issue with panel manager initialization timing
- Improved event handling in all panels (Spells, Features, Weapons, Inventory)
- Added comprehensive debug logging for troubleshooting
- Ensured proper cleanup of event listeners

### Added
- Created CONSIDERATIONS.md with development guidelines and best practices
- Added AI development guidelines for future maintenance
- Enhanced logging system for better debugging

## [1.0.1] - Apells, weapons and Items

### Changed
- Removed "'s Squire" suffix from character names for cleaner display
- Modified tray initialization to load automatically when client connects
- Added automatic character selection based on owned tokens
- Updated UI to show "Select a Character" when no token is selected
- Improved event handling to prevent tray from closing unexpectedly
- Updated spell usage to support DnD5e 4.0+ API changes

### Fixed
- Fixed issue with tray closing when interacting with health controls
- Fixed deprecation warning for Item5e#use method
- Improved click handling within the tray content

### Added
- Enhanced tooltips for favorite items in the handle bar showing detailed information based on item type:
  - Spells: Level, school, materials, damage, and scaling information
  - Weapons: Attack type, damage, and range
  - Features: Requirements and description

## [1.0.0] - Initial Release

### Added
- Initial release
- Sliding tray interface with three panels (Spells, Weapons, Info)
- Spell management with spell slot tracking
- Weapon management with ammunition tracking
- Character info panel with HP, ability scores, and resource tracking
- Customizable settings for tray position, theme, and behavior
- Integration with Coffee Pub Blacksmith API 
