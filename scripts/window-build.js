import { MODULE, TEMPLATES } from './const.js';
import { PanelManager } from './manager-panel.js';
import { ImportWindow } from './window-import.js';
import { renderTemplate, showSquireToast, getBlacksmith } from './helpers.js';
import {
    BUILD_SLOT_KEYS, getDollLayout,
    getBuilds, getBuild, createBuild, deleteBuild, duplicateBuild, applyBuild, buildSummary,
    renameBuild, setBuildSlot, moveBuildSlot, resolveSlots, attunementSummary,
    getPreparingClasses, getSpellSlots, resolvePreparedSpells, setBuildSpell,
    refuseSlotDrop, gearWeight, resolveImageSlots, setBuildImage, captureDefaultImages,
    resolveTokenSettings, setBuildTokenSetting, setBuildPreparation,
    applyImportPlan,
    estimateArmorClass, previewSlotChange, setBuildMode, convertBuildMode, revertBuild, damageLabel,
    setActiveBuildId, getActiveBuildId, ensureDefaultCostume, ensureDefaultBuild,
    moveBuild, resolveMainImage,
    resolveTileImage,
    equippedState, buildDrift, recaptureDefaultImages, canPrepareSpells,
    adoptCostumeAsDefault, defaultArtworkState, setDefaultArtwork
} from './utility-builds.js';

/**
 * The base class comes from Blacksmith's bridge module, not from `module.api` —
 * see the note in window-cleanup.js for why `extends` cannot wait for `game`.
 */
import { BlacksmithToolWindowBaseV2, BLACKSMITH_TOOL_THEMES } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

/** How much width the build rail takes. Mirrored in panel-builds.css. */
const RAIL_WIDTH = 180;

/**
 * The window's width, in the same numbers panel-builds.css lays the doll out
 * with. They are duplicated here rather than read back from the stylesheet
 * because the width has to be known before anything is rendered — and if they
 * ever drift, the cost is a strip of empty space at one edge rather than a
 * layout that has quietly resized itself, which is the whole reason the CSS
 * stopped using fractions.
 *
 * TRACK is a gear slot. The doll is five of them plus the gaps between; the
 * prepared column adds a gutter, two gaps and one more track, and that is the
 * ONLY difference between a caster's window and anybody else's.
 */
const TRACK = 84;
const GAP = 6;
const GUTTER = 9;
const DOLL_WIDTH = 5 * TRACK + 4 * GAP;
const PACK_WIDTH = GAP + GUTTER + GAP + TRACK;
/* The rail and its rule, the workspace's inset, the window's own padding, and a
   GUESS at the frame Foundry draws around all of it. Only the last term is soft,
   and _syncWidth() corrects it against the frame that actually turned out to be
   there — so a theme with different chrome costs a reflow, not a wrong window. */
const CHROME = RAIL_WIDTH + 10 + 1 + 10 + 16 + 22;

/**
 * How wide the window has to be to show this mode without slack.
 *
 * The base size is the doll and nothing else, and it is the size for everybody:
 * a martial's build, a martial's costume, and a caster's costume are all exactly
 * this. Only a caster's BUILD is wider, by exactly the prepared column — a
 * costume has no prepared column, so switching to one takes the window back
 * down rather than leaving it stretched around empty space.
 */
function widthFor(actor, build) {
    // The column, not the doll: what widens the window is planning a prepared
    // list, which a martial who casts can do and a caster who is not doing it
    // cannot.
    const needsPack = build?.mode !== 'costume'
        && !!build?.includesPrepared
        && canPrepareSpells(actor);

    return CHROME + DOLL_WIDTH + (needsPack ? PACK_WIDTH : 0);
}


/**
 * One actor's gear builds: a rail listing them, and a paper doll for the one
 * selected.
 *
 * Editing writes only to Squire's own flag. Applying — `applySelected()` — is
 * the single place anything reaches the character, and it asks first. Every
 * other route to equipping a build, including the tray handle, goes through it
 * rather than repeating the rules.
 */
export class BuildWindow extends BlacksmithToolWindowBaseV2 {

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        foundry.utils.mergeObject({}, super.DEFAULT_OPTIONS ?? {}),
        {
            // squire-tool-window carries the shared height chain, the same way
            // the cleanup window does.
            classes: ['squire-tool-window', 'squire-build-window'],
            position: { width: 520, height: 'auto' },
            window: { title: 'Gear Build', resizable: false, minimizable: true },
            windowSizeConstraints: { minWidth: 460, maxWidth: 980 },
            toolTitlebar: 'full',
            // DARK by default, where the base class defaults to light. This
            // window is a wall of artwork — portraits, tokens, item pictures at
            // every size — and dark is the ground that lets them be the bright
            // thing in it. Glass works too; light is legible but the pictures
            // stop carrying the window.
            //
            // A default, not a lock: the titlebar's own theme control still
            // works, and the base saves whatever the player picks. Named rather
            // than left to the class-name fallback so that a rename cannot
            // silently orphan somebody's choice.
            toolTheme: BLACKSMITH_TOOL_THEMES.DARK,
            toolThemePreferenceKey: 'squire-builds-theme',
            rememberPosition: false
        }
    );

    constructor(options = {}) {
        super(options);
        this.actor = options.actor ?? null;
        this.buildId = options.buildId ?? null;

        // Which tab the rail is on: 'all', 'costume' or 'gear'. Per window and
        // not remembered between openings — a filter that survived would mean
        // opening the builder one day and finding builds you own missing, with
        // the reason a tab you last pressed weeks ago.
        this.railFilter = 'all';
    }

    /**
     * The application id for one actor's builder.
     *
     * On the actor's UUID, not its id. An unlinked token's synthetic actor
     * shares the base actor's id, so two copies of the same prototype standing
     * on a scene would ask for the same window — the second click would find the
     * first token's builder already open, bring it to the front and show that
     * token's builds while the player was looking at a different token. Builds
     * live in an actor flag, so those two genuinely have separate lists.
     *
     * Punctuated down to something usable as a DOM id: a uuid is full of dots
     * and dots are a class separator in a CSS selector, so `#squire-builds-Actor.x`
     * would never match the element it named.
     */
    static idFor(actor) {
        const key = (actor?.uuid ?? actor?.id ?? 'none').replace(/[^A-Za-z0-9]+/g, '-');
        return `squire-builds-${key}`;
    }

    /**
     * Open this actor's builds, optionally on a particular one.
     *
     * Keyed on the ACTOR. The rail down the left is the whole list, so a second
     * window would be a second copy of that list, and the two would disagree the
     * moment either created or deleted anything. A repeat call selects the build
     * asked for in the window already open.
     *
     * Uses `foundry.applications.instances` rather than the base class's
     * per-target registry, because that registry keys on a document and this is
     * keyed on one actor's flag.
     */
    static async open(actor, buildId = null) {
        if (!actor) return null;

        const id = BuildWindow.idFor(actor);
        const existing = foundry.applications.instances.get(id);
        if (existing) {
            if (buildId) await existing.selectBuild(buildId);
            existing.bringToFront?.();
            return existing;
        }

        // Before the window is even drawn. Applying a build will one day
        // overwrite the actor's portrait and token, and once it has, the
        // character's own artwork exists nowhere — so it is recorded at the
        // first moment a build is in play at all. Idempotent, so opening a
        // second window cannot overwrite what the first one captured.
        await captureDefaultImages(actor);
        // Their gear as it stands, as something they can get back to. Before the
        // costume, so it sits first in the rail — it is the thing this window is
        // mostly for, and the one that protects them from learning what applying
        // does the hard way.
        const firstRun = await ensureDefaultBuild(actor);
        // Their own face, as something they can put back on. The captured
        // defaults are a safety net nobody can see or click; this is the
        // clickable one.
        await ensureDefaultCostume(actor);

        // Whichever build was asked for, else the one the character is WEARING.
        //
        // It used to fall through to the first in the list, which is a build
        // chosen by nothing except where it happens to sit — so the window
        // opened showing a plan the character was not on, and the doll's slots
        // described gear they were not wearing. What is worn is the one build
        // that is a fact rather than a guess.
        //
        // And if nothing is worn, nothing is selected: the workspace says so and
        // asks. Picking one for the player would only be inventing an answer
        // where there is not one.
        const selected = buildId ?? getActiveBuildId(actor);

        // Opened at the size the mode it opens IN actually needs, rather than at
        // a build's size that a costume would then have to shrink out of.
        //
        // Height stays `auto`, because the content is a fixed height: the
        // workspace's second row is pinned to the doll, so a costume is exactly
        // as tall as a build and both are the same for every character. Auto
        // over a hard figure means this window cannot be the one that clips
        // itself when a theme's chrome changes.
        const width = widthFor(actor, selected ? getBuild(actor, selected) : null);
        const win = new BuildWindow({ id, actor, buildId: selected, position: { width, height: 'auto' } });

        // What the first-run snapshot could not place, shown on the doll it was
        // made for. It is the only importer path that does not ask.
        if (firstRun?.unknown?.length || firstRun?.crowded?.length) {
            win._importReport = { unknown: firstRun.unknown ?? [], crowded: firstRun.crowded ?? [] };
        }

        await win.render({ force: true });
        return win;
    }

    /**
     * The two things this window is a view OF, reachable from its title bar.
     *
     * A build is a plan about a character and a plan about their token, and both
     * of those are edited somewhere else — so the two places you end up going
     * from here are the character sheet and the prototype token. Putting them in
     * the title bar is what Blacksmith's tool windows do with actions that leave
     * the window rather than change it; the merchant's config window uses the
     * same rail for the same reason.
     */
    getToolHeaderActions() {
        if (!this.actor) return [];

        return [
            {
                id: 'squire-build-sheet',
                icon: 'fa-solid fa-user',
                label: 'Open Character Sheet',
                onClick: () => this.actor.sheet?.render(true)
            },
            {
                id: 'squire-build-token',
                icon: 'fa-solid fa-user-circle',
                label: 'Open Prototype Token',
                // Through `CONFIG.Token.prototypeSheetClass`, which is how the
                // system registers its own: dnd5e replaces it with
                // PrototypeTokenConfig5e, so constructing Foundry's base class
                // directly would open a plainer window than the same button on
                // the character sheet does.
                //
                // The option is `prototype`, NOT `document`. A PrototypeToken is
                // a DataModel rather than a Document, and this sheet reads the
                // actor off it as `options.prototype.parent` while it is still
                // building its options — so `document` threw before the window
                // existed, with a stack that named Foundry's constructor and
                // nothing of ours. Same call the merchant makes.
                onClick: () => {
                    const prototype = this.actor.prototypeToken;
                    const sheetClass = CONFIG.Token?.prototypeSheetClass;

                    // `parent` as well as the object itself. The sheet reaches
                    // for it while assembling its options, before any of its own
                    // code runs, so a parentless PrototypeToken throws inside
                    // Foundry's constructor with a stack naming nothing of ours
                    // — which is a bad way to learn that this actor had nothing
                    // to open. Cheaper to ask here.
                    if (!prototype?.parent || !sheetClass) {
                        ui.notifications.warn(`${this.actor.name} has no prototype token to open.`);
                        return;
                    }
                    new sheetClass({ prototype }).render(true);
                }
            }
        ];
    }

    /** The build this window is showing, re-read every time rather than cached. */
    get build() {
        return getBuild(this.actor, this.buildId);
    }

    /**
     * Equip a build without a window necessarily being open.
     *
     * The handle needs to apply builds too, and the confirmation, the rules and
     * the receipt should exist once rather than in every place that can trigger
     * them. An open window applies through itself so its own view refreshes;
     * anything else gets a detached instance that never renders.
     */
    static async applyFromAnywhere(actor, buildId) {
        const open = foundry.applications.instances.get(BuildWindow.idFor(actor));
        if (open) return open.applySelected(buildId);

        const detached = new BuildWindow({ id: `squire-builds-apply-${foundry.utils.randomID()}`, actor });
        await detached.applySelected(buildId);
    }

    /**
     * Move a build up or down the rail.
     *
     * Deliberately does NOT change which build is selected: reordering is about
     * the list, and having the doll jump to whatever you just nudged would make
     * a tidy-up feel like a navigation.
     */
    async moveAndKeep(buildId, delta) {
        await moveBuild(this.actor, buildId, delta);
        await this._refresh();
    }

    /** Show a different build. */
    async selectBuild(buildId) {
        if (!buildId || buildId === this.buildId) return;
        // The report describes an import into the build being left behind.
        this._importReport = null;
        this.buildId = buildId;
        await this.render(false);
    }

    /** Make one and show it. */
    /**
     * Make a build and open it.
     *
     * A costume is offered as its own button rather than as a switch to throw
     * afterwards, because it is a different kind of thing to set out to make —
     * you know which one you want before you start, and the switch beside the
     * name is for changing your mind rather than for stating the intention.
     */
    async createAndSelect(mode = 'gear') {
        const costume = mode === 'costume';
        const build = await createBuild(this.actor, costume ? 'New Costume' : 'New Build');
        if (costume) await setBuildMode(this.actor, build.id, 'costume');

        this.buildId = build.id;
        // Make sure the thing that was just made can be SEEN. Pressing New
        // Costume while the rail is filtered to Builds would otherwise create
        // it, select it, put it on the doll — and show an unchanged list that
        // does not contain it, which reads as the button having done nothing.
        if (!this._passesFilter(costume ? 'costume' : 'gear')) this.railFilter = 'all';
        await this._refresh();
    }

    /** Would the rail's current tab show an entry of this mode? */
    _passesFilter(mode) {
        return this.railFilter === 'all' || this.railFilter === mode;
    }

    /**
     * Which kinds of entry the rail lists.
     *
     * The SELECTION is deliberately left alone, even when the tab that was just
     * chosen hides it. Switching a filter is asking to see less of the list, not
     * asking to look at a different build — and quietly moving the doll to
     * whatever happened to be first in the filtered set would be a much larger
     * thing to do than what was asked for. So the entry stays on the doll and
     * simply is not listed; picking another one is still a click away.
     */
    async setRailFilter(filter) {
        if (this.railFilter === filter) return;
        this.railFilter = filter;
        await this._refresh();
    }

    /**
     * Record what the character looks like NOW as their default artwork.
     *
     * The defaults are captured once, the first time this window opens, and then
     * trusted forever — correct for what they are for, since a costume
     * overwrites `actor.img` and a record that followed it would stop being a
     * record. What they cannot survive is the file moving: the flag then names a
     * path to nothing, every unset image slot falls back to it, and the
     * character appears to have a broken portrait nobody chose.
     *
     * It asks first, and the confirmation names the hazard rather than the
     * action: this reads the character's CURRENT artwork, so pressing it while a
     * costume is on records the costume as the original, which is the one thing
     * the defaults exist to prevent.
     */
    async recaptureDefaults() {
        const confirmed = await getBlacksmith().dialog.confirm({
            title: 'Reset Default Artwork',
            content: `<p>Take the builder's default artwork back from <strong>${foundry.utils.escapeHTML(this.actor.name)}</strong>'s character sheet?</p>`
                + '<p>Their current portrait and token become what a new build or costume starts from, and any entry set as the default stops being it. The character is not touched either way — this only changes what this tool starts from.</p>'
                + '<p><strong>Make sure they are wearing their own face.</strong> This reads what they look like right now, so doing it while a costume is on would record the costume as the original.</p>',
            confirmLabel: 'Reset',
            confirmIcon: 'fa-solid fa-rotate-left'
        });
        if (!confirmed) return;

        const captured = await recaptureDefaultImages(this.actor);
        showSquireToast('Default artwork reset', {
            subtitle: captured?.portrait ? 'Taken from the character sheet' : 'Recorded',
            icon: 'fa-solid fa-rotate-left'
        });
        await this._refresh();
    }

    /**
     * Turn a build into a costume or back.
     *
     * A menu entry rather than a switch beside the name. The switch was in the
     * most prominent place in the window for an operation nobody does twice, and
     * putting it there implied the two modes were a setting on one thing —
     * whereas New Build and New Costume make the choice up front, which is when
     * it is actually made.
     *
     * It DISCARDS the other mode's contents, and says so before it does. Keeping
     * them was the obvious thing and it is what produced the ghosts: a costume
     * carrying invisible gear, a tile drawing a weapon nobody could see the
     * source of, and a converted-back build full of whatever was in it weeks
     * ago. What conversion is worth is the name and the pictures; the slots were
     * always a few drags, and a result that depends on which direction you came
     * from is worse than one that does not.
     */
    async convertSelected(buildId, mode) {
        const build = getBuild(this.actor, buildId);
        if (!build || build.mode === mode) return;

        const costume = mode === 'costume';
        const summary = buildSummary(this.actor, build);
        const losing = costume ? summary.gearCount + summary.spellCount : 0;

        const confirmed = await getBlacksmith().dialog.confirm({
            title: costume ? 'Convert to Costume' : 'Convert to Build',
            content: `<p>Turn <strong>${foundry.utils.escapeHTML(build.name)}</strong> into a ${costume ? 'costume' : 'build'}?</p>`
                + `<p>It keeps its name and its pictures. ${costume
                    ? 'A costume changes only how the character looks, so it holds no gear or spells'
                    : 'A build equips gear and prepares spells, so it starts with every slot empty'}.</p>`
                + (losing
                    ? `<p><strong>The ${losing} thing${losing === 1 ? '' : 's'} in it will be cleared, and converting back will not bring ${losing === 1 ? 'it' : 'them'} back.</strong></p>`
                    : ''),
            confirmLabel: costume ? 'Convert to Costume' : 'Convert to Build',
            confirmIcon: costume ? 'fa-solid fa-masks-theater' : 'fa-solid fa-shirt',
            destructive: losing > 0
        });
        if (!confirmed) return;

        await convertBuildMode(this.actor, buildId, mode);
        await this._refresh();
    }

    /**
     * Fill this build from what the character has on right now.
     *
     * The answer to having set a kit up on the sheet before discovering this
     * window, and to the commoner case of having changed something there and
     * wanting the build to catch up.
     *
     * Two checkboxes rather than one action, because gear and preparation are
     * two decisions on two rhythms — the same reason the preparation switch
     * exists at all. Both default on when the build already plans both.
     */
    async pullSelectedFromSheet() {
        const build = this.build;
        if (!build || build.mode === 'costume') return;

        // Classification lives in Blacksmith. Squire only maps a body location
        // onto a slot on this doll, so without that API there is nothing to map
        // and every item would come back unplaceable — which would read as a
        // broken importer rather than an out-of-date dependency. Say which.
        if (!game.modules.get('coffee-pub-blacksmith')?.api?.equipLocations) {
            ui.notifications.warn(
                'Filling a build from the sheet needs a newer Coffee Pub Blacksmith. '
                + 'Everything else in this window works as usual.'
            );
            return;
        }

        // The whole table is a window's worth of screen and behaviour — see
        // ImportWindow for why this stopped being a dialog.
        const value = await ImportWindow.ask(this.actor, build);
        if (!value) return;

        await applyImportPlan(this.actor, this.buildId, value);

        const placed = Object.values(value.slots).filter(Boolean).length;
        showSquireToast(build.name, {
            subtitle: `${placed} item${placed === 1 ? '' : 's'} placed`
                + (build.includesPrepared ? `, ${value.spells.length} spell${value.spells.length === 1 ? '' : 's'} prepared` : ''),
            icon: 'fa-solid fa-download'
        });

        // No leftovers report: nothing was left over. Every item was on the
        // table and every one of them has an answer the player chose.
        this._importReport = null;
        await this._refresh();
    }

    /**
     * Make a costume the character's DEFAULT look, without wearing it.
     *
     * Wearing a costume changes how they look now and repaints every token of
     * theirs on the canvas. This changes what a token made LATER will look like
     * and leaves the map alone — which is the difference between dressing a
     * character for a scene and deciding what they actually look like.
     *
     * It asks first and names that difference, because the two are easy to
     * confuse and only one of them is undoable from a toast.
     */
    async adoptSelected(buildId) {
        const build = getBuild(this.actor, buildId);
        if (!build || build.mode !== 'costume') return;

        const name = foundry.utils.escapeHTML(build.name);
        const who = foundry.utils.escapeHTML(this.actor.name);

        const confirmed = await getBlacksmith().dialog.confirm({
            title: 'Update Prototype Token',
            content: `<p>Put <strong>${name}</strong>'s artwork onto <strong>${who}</strong>'s prototype token?</p>`
                + '<p>This writes its portrait and its token picture onto the character, so any token '
                + 'placed from now on uses them. Nothing else about the token changes.</p>'
                + '<p><strong>Tokens already on the canvas are not touched</strong>, and this is not '
                + 'the same as wearing the costume — there is no undo on the toast for it.</p>',
            confirmLabel: 'Update Prototype Token',
            confirmIcon: 'fa-solid fa-user-circle'
        });
        if (!confirmed) return;

        const result = await adoptCostumeAsDefault(this.actor, build);
        if (!result) {
            ui.notifications.info(`${build.name} sets no artwork, so there was nothing to adopt.`);
            return;
        }

        const parts = [];
        if (result.portrait) parts.push('portrait');
        if (result.token) parts.push('token');

        showSquireToast(build.name, {
            subtitle: `Prototype token ${parts.join(' and ')} updated`,
            icon: 'fa-solid fa-user-circle'
        });
        await this._refresh();
    }

    /**
     * Make this entry's pictures what a NEW build or costume starts from.
     *
     * A setting for this tool and nothing else. It is next to Update Prototype
     * Token in the menu and is not the same action: that one writes onto the
     * character so Foundry uses the art, this one decides what the builder
     * offers next time. Saying so in the dialog is most of the dialog's job,
     * since the two sit together and sound alike.
     */
    async setDefaultsFrom(buildId) {
        const build = getBuild(this.actor, buildId);
        if (!build) return;

        const name = foundry.utils.escapeHTML(build.name);

        const confirmed = await getBlacksmith().dialog.confirm({
            title: 'Set As Default Artwork',
            content: `<p>Start every new build and costume from <strong>${name}</strong>'s artwork?</p>`
                + '<p>Its portrait, token picture and build image become the defaults here, so anything '
                + 'made from now on begins with them — and any existing build that sets no image of its '
                + 'own shows them too.</p>'
                + '<p><strong>The character is not touched.</strong> Their portrait, their prototype '
                + 'token and every token on the canvas stay exactly as they are; this only changes what '
                + 'this tool starts from. Use <em>Update Prototype Token</em> for the other one.</p>',
            confirmLabel: 'Set As Default',
            confirmIcon: 'fa-solid fa-images'
        });
        if (!confirmed) return;

        const result = await setDefaultArtwork(this.actor, build);
        if (!result) {
            ui.notifications.info(`${build.name} has no artwork to make the default.`);
            return;
        }

        showSquireToast(build.name, {
            subtitle: 'New builds now start from this artwork',
            icon: 'fa-solid fa-images'
        });
        await this._refresh();
    }

    async duplicateSelected(buildId) {
        const copy = await duplicateBuild(this.actor, buildId);
        if (copy) this.buildId = copy.id;
        await this._refresh();
    }

    async deleteSelected(buildId) {
        const build = getBuild(this.actor, buildId);
        if (!build) return;

        const confirmed = await getBlacksmith().dialog.confirm({
            title: 'Delete Build',
            content: `<p>Delete <strong>${foundry.utils.escapeHTML(build.name)}</strong>?</p><p>This cannot be undone.</p>`,
            confirmLabel: 'Delete Build',
            confirmIcon: 'fa-solid fa-trash',
            destructive: true
        });
        if (!confirmed) return;

        await deleteBuild(this.actor, buildId);
        // Fall to whatever is left rather than showing a build that is gone.
        if (this.buildId === buildId) this.buildId = getBuilds(this.actor)[0]?.id ?? null;
        await this._refresh();
    }

    /**
     * Equip the selected build, after asking — unless it is a costume.
     *
     * A BUILD is asked about because it takes things off. Equipping one
     * unequips everything it does not name, which is the correct rule and a
     * genuinely destructive one: the confirmation names what will happen rather
     * than asking "are you sure", since nobody can evaluate a prompt that does
     * not say what it will do.
     *
     * A COSTUME goes straight through. It changes artwork and how the token is
     * drawn, touches no gear and no spells, and the toast it produces carries an
     * undo — so the dialog was standing between somebody and the fast thing they
     * came here to do, to warn them about the safe one. Trying on three costumes
     * meant three dialogs and six clicks.
     */
    async applySelected(buildId) {
        const build = getBuild(this.actor, buildId);
        if (!build) return;

        const costume = build.mode === 'costume';

        // Captured before applying, so undo can put the previous build back as
        // the worn one rather than simply forgetting there was one.
        const previousActive = getActiveBuildId(this.actor);

        // All of it inside the branch, the summary included: nothing here is
        // wanted for a costume, and walking a build to count gear it does not
        // have to describe a dialog nobody will see is work done for nobody.
        if (!costume) {
            const summary = buildSummary(this.actor, build);
            const lines = [
                `<li>Equip the ${summary.gearCount} item${summary.gearCount === 1 ? '' : 's'} in this build, and unequip everything else.</li>`,
                summary.spellCount
                    ? `<li>Prepare its ${summary.spellCount} spell${summary.spellCount === 1 ? '' : 's'}, and unprepare everything else that counts against a limit.</li>`
                    : '',
                (build.images?.portrait || build.images?.token)
                    ? '<li>Change the portrait or token artwork.</li>' : ''
            ];

            const confirmed = await getBlacksmith().dialog.confirm({
                title: 'Equip Build',
                content: `<p>Equip <strong>${foundry.utils.escapeHTML(this.actor.name)}</strong> as `
                    + `<strong>${foundry.utils.escapeHTML(build.name)}</strong>?</p>`
                    + '<p>This will:</p><ul>' + lines.join('') + '</ul>'
                    + '<p>Attunement is not changed.</p>',
                confirmLabel: 'Equip Build',
                confirmIcon: 'fa-solid fa-shirt'
            });
            if (!confirmed) return;
        }

        const result = await applyBuild(this.actor, build);
        if (!result) return;

        // A costume does not change what the character is WEARING, so it is not
        // what the handle's weapon strip should follow.
        if (!costume) await setActiveBuildId(this.actor, build.id);

        const changes = [];
        if (result.equipped) changes.push(`equipped ${result.equipped}`);
        if (result.unequipped) changes.push(`unequipped ${result.unequipped}`);
        if (result.prepared) changes.push(`prepared ${result.prepared}`);
        if (result.unprepared) changes.push(`unprepared ${result.unprepared}`);
        if (result.images?.portrait) changes.push('changed portrait');
        if (result.images?.token) changes.push('changed token');

        // Undo is the toast's single click, not a pair of buttons: Blacksmith's
        // toast has one `onClick` and no button row, so "keep" is what happens
        // when you do nothing — which is the right default for the common case
        // anyway. The subtitle has to say so, since an actionable toast that
        // does not announce its action is just a toast that eats a click.
        const undoable = changes.length > 0;
        showSquireToast(
            undoable ? build.name : `${build.name} was already on`,
            {
                subtitle: undoable
                    ? `${changes.join(', ')}. Click to undo.`
                    : undefined,
                icon: costume ? 'fa-solid fa-masks-theater' : 'fa-solid fa-shirt',
                duration: undoable ? 12 : 6,
                onClick: undoable
                    ? async () => {
                        await revertBuild(this.actor, result.undo);
                        // Undo undoes everything it set, the handle's weapon
                        // strip included — it is derived from this flag, so
                        // clearing it empties the strip without a second write.
                        if (!costume) await setActiveBuildId(this.actor, previousActive);
                        showSquireToast(`${build.name} undone`, { icon: 'fa-solid fa-rotate-left' });
                        await this._refresh();
                    }
                    : undefined
            }
        );

        await this._refresh();
    }

    /**
     * Redraw this window and the tray's tile for it.
     *
     * The tile carries the name and a filled-slot count, so every change made
     * here is a change to something visible over there. Nothing else refreshes
     * it: the Builds panel has no hooks of its own, by design — a flag write
     * that fires `updateActor` would re-render the whole tray for a slot.
     */
    /**
     * Where the rail was scrolled to, kept across the redraw that is about to
     * replace it.
     *
     * Every action in this window redraws the whole thing — selecting a build,
     * renaming one, dropping an item — and a fresh DOM starts at the top. With
     * a dozen builds that put the list back at the beginning on every click, so
     * choosing two builds in a row meant scrolling down to the second one after
     * having just been there.
     *
     * Read in `_preRender`, which every render path goes through, rather than in
     * `_refresh`: the window also redraws from hooks and from the drag handlers,
     * and a save that only some of those routes performed would work for most
     * clicks and lose the position on the rest, which is worse than not doing it
     * at all.
     */
    async _preRender(context, options) {
        await super._preRender?.(context, options);
        this._railScroll = this.element?.querySelector('.squire-build-rail-list')?.scrollTop ?? null;
    }

    async _refresh() {
        // `rendered` guards the detached instance applyFromAnywhere() builds to
        // borrow the apply logic — it has no DOM and must not grow one.
        if (this.rendered) await this.render(false);

        // The handle can carry builds, and their armour class and item pictures
        // come from the same build this just changed.
        await PanelManager.instance?.handleManager?.updateHandle();
    }

    /**
     * Take the window to the width the thing it just rendered actually needs.
     *
     * Everything inside is laid out in fixed pixels, so the content has one
     * correct width — but the chrome the theme wraps around it is not this
     * module's to know, and `widthFor` can only guess at it. So this measures
     * rather than calculates: what the rail and the workspace came to, against
     * the room they were given, and the difference handed straight back.
     *
     * RELATIVE, and that is the whole of it. An earlier version subtracted the
     * slack from the width it *wanted* instead of from the width it *had*, which
     * is correct only when those two are already equal — so a mode change, where
     * they are furthest apart, over-corrected by the whole width of the prepared
     * column and then oscillated between too wide and too narrow on alternate
     * renders. Measured against the current width it converges in one pass from
     * anywhere, and needs to know nothing about which mode it is in.
     *
     * Written to `position` rather than to CSS: the frame is Foundry's, and a
     * stylesheet reaching into it would be a rule this window could not see.
     *
     * DEFERRED A FRAME, and that is not a nicety. ApplicationV2 applies the
     * position it was constructed with AFTER `_onRender` returns, so a width
     * written inline here was immediately overwritten by the opening guess on
     * the first render and only on the first render — which is why every window
     * opened at the wrong size and then snapped right the moment anything caused
     * it to render again. Measuring on the next frame puts this after the
     * position pass rather than before it, on every render alike.
     */
    _syncWidth() {
        requestAnimationFrame(() => {
            // The window can be closed between the render and the frame.
            if (this.rendered) this._measureWidth();
        });
    }

    /** The measurement itself. See _syncWidth() for why it runs a frame later. */
    _measureWidth() {
        const content = this.element?.querySelector('.squire-build');
        const rail = content?.querySelector('.squire-build-rail');
        const workspace = content?.querySelector('.squire-build-workspace');
        if (!content || !rail || !workspace) return;

        // Nothing has a width while the window is hidden, and measuring then
        // would read the whole frame as slack and collapse it.
        if (content.clientWidth < 1 || rail.offsetWidth < 1) return;

        // The padding is read rather than assumed, because it is a stylesheet's
        // decision and this is the one place that would silently disagree.
        const style = getComputedStyle(content);
        const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);

        // Positive means the window is wider than its contents — the strip of
        // nothing down one side. Negative means they are overflowing it, which
        // is where the horizontal scrollbar came from.
        const slack = Math.round(content.clientWidth - padding - rail.offsetWidth - workspace.offsetWidth);
        if (Math.abs(slack) < 2) return;

        const current = Number(this.position?.width) || content.clientWidth;
        this.setPosition({ width: current - slack });
    }

    async getData() {
        const build = this.build;

        const builds = getBuilds(this.actor);
        const activeId = getActiveBuildId(this.actor);

        // Read once for the whole render. The rail asks the same question of
        // every build it draws and the doll asks it of every slot, and walking
        // the sheet for each of them would be the same answer computed twenty
        // times.
        const state = equippedState(this.actor);

        // Only for the WORN build. Every other build is trivially "not worn",
        // and marking their slots would make the mark mean nothing.
        const worn = activeId ? getBuild(this.actor, activeId) : null;
        const drift = worn && worn.mode !== 'costume' ? buildDrift(this.actor, worn, state) : null;

        // Counted before the filter, so a tab can say how many it would show
        // and an empty one is visibly empty rather than merely missing.
        const counts = {
            all: builds.length,
            costume: builds.filter(entry => entry.mode === 'costume').length
        };
        counts.gear = counts.all - counts.costume;

        const rail = builds.filter(entry => this._passesFilter(entry.mode === 'costume' ? 'costume' : 'gear')).map(entry => {
            const summary = buildSummary(this.actor, entry);
            // Its own picture as the tile's face, and the two images wearing it
            // would produce as the marks on it. The gear thumbnails that were
            // here said what was IN the build, which the doll already shows in
            // full the moment you select it — and five item icons at 20px is a
            // row of smudges, not a summary.
            const images = resolveImageSlots(this.actor, entry);
            // Which entry the character's default artwork came from, and whether
            // it still looks like it. Same two-fact shape as the worn mark below
            // it, and for the same reason: a badge that cannot say it has gone
            // stale is a badge that quietly lies.
            const artwork = defaultArtworkState(this.actor, entry);

            return {
                mainImage: resolveMainImage(this.actor, entry).path,
                // The same face the tray handle gives it — see resolveTileImage.
                tileImage: resolveTileImage(this.actor, entry),
                portrait: images.find(slot => slot.key === 'portrait')?.path,
                token: images.find(slot => slot.key === 'token')?.path,
                id: entry.id,
                name: entry.name,
                active: entry.id === this.buildId,
                // Selected is "what this window is showing"; worn is "what the
                // character actually has on". Two different facts, and the rail
                // is the only place both can be seen at once.
                worn: entry.id === activeId,
                // The last build applied, but the character no longer matches
                // it. Called drifted rather than modified because the check
                // cannot see WHICH of the two moved — the sheet was edited, or
                // the build was — and a label should not claim more than its
                // evidence.
                drifted: entry.id === activeId && !!drift && !drift.matches,
                driftCount: entry.id === activeId ? (drift?.count ?? 0) : 0,
                isDefault: artwork.isDefault,
                defaultDrifted: artwork.drifted,
                costume: entry.mode === 'costume',
                armorClass: summary.armorClass.value,
                gearCount: summary.gearCount
            };
        });

        // `build` may be null — no builds yet, or the selected one was deleted.
        // The doll still resolves, as sixteen empty slots, and the template hides
        // it behind `hasBuilds`; resolveSlots reading a null build is exactly the
        // "never filled" case it already handles.
        // Which doll this character gets — a caster's weapons are small and
        // their spells are the big three, and a martial's are the other way up.
        const layout = getDollLayout(this.actor);
        // The drift marks belong to the build being SHOWN only when that is
        // also the one being worn. Looking at another build, its slots describe
        // a plan nobody is wearing, and "not equipped" would be true of all of
        // them and worth saying about none.
        const shownDrift = build && build.id === activeId ? drift : null;

        const bodySlots = resolveSlots(this.actor, build, layout.body, shownDrift);
        const weaponSlots = resolveSlots(this.actor, build, layout.big, shownDrift);

        // Counted across BOTH grids: a build's attunement cost is the whole set,
        // and a sword is as capable of demanding attunement as an amulet.
        const attunement = attunementSummary(this.actor, [...bodySlots, ...weaponSlots]);
        const imageSlots = resolveImageSlots(this.actor, build);

        // The prepared column, for the characters that have one. It carries no
        // heading and no count: the cells say what they hold, a cleric knows
        // they are a cleric, and a label above the grid would push every cell
        // out of line with the doll — which is the one thing it is built to do.
        // The COLUMN is not the doll's business. A ranger gets a martial's doll
        // and can still plan a prepared list; a sorcerer gets a caster's doll and
        // may be planning gear alone. The two questions are asked separately —
        // see canPrepareSpells — and only this one decides the column.
        const canPrepare = canPrepareSpells(this.actor);
        const plansPrepared = canPrepare && !!build?.includesPrepared;
        const pack = plansPrepared ? resolvePreparedSpells(this.actor, build, shownDrift) : null;

        return {
            appId: this.id,
            bodyContent: await renderTemplate(TEMPLATES.WINDOW_BUILD, {
                rail,
                // The tabs, and what each of them would show. Built here rather
                // than three flags in the template: they are one control, and a
                // list is what a loop over them wants.
                railTabs: [
                    { key: 'all', label: 'All', count: counts.all },
                    { key: 'costume', label: 'Costumes', count: counts.costume },
                    { key: 'gear', label: 'Builds', count: counts.gear }
                ].map(tab => ({ ...tab, active: this.railFilter === tab.key })),
                railFiltered: rail.length === 0 && builds.length > 0,
                railFilterLabel: this.railFilter === 'costume' ? 'costumes' : 'builds',
                hasBuilds: builds.length > 0,
                isCostume: build?.mode === 'costume',
                // Named rather than left as an array the costume view would have
                // to index: it stacks them around the main picture — portrait
                // above, token below — so their ORDER there is not the order
                // BUILD_IMAGE_SLOTS holds them in for the doll's ring.
                portraitSlot: imageSlots.find(slot => slot.key === 'portrait'),
                tokenSlot: imageSlots.find(slot => slot.key === 'token'),
                // How the token is drawn, for the costume view's controls. Each
                // one shows the token's own value until the costume sets it, and
                // says which of the two it is showing.
                tokenSettings: resolveTokenSettings(this.actor, build),
                updatesHandle: game.settings.get(MODULE.ID, 'buildsUpdateHandle'),
                build,
                actorName: this.actor?.name ?? '',
                // The BUILD's own picture, not the actor's. `actor.img` moves
                // the moment a costume is worn, and the centre of the doll is
                // the one thing here that should not.
                mainImage: resolveMainImage(this.actor, build),
                bodySlots,
                weaponSlots,
                attunement: { ...attunement, over: attunement.used > attunement.max },
                // What the character has on that this build does not name. These
                // have no slot to be marked in — there is no box on the doll for
                // an item the plan never mentioned — so they are counted on a
                // plate instead of located.
                drift: shownDrift && !shownDrift.matches ? shownDrift : null,
                weight: gearWeight(this.actor, build),
                armorClass: estimateArmorClass(this.actor, build),
                imageSlots,
                // The last import's leftovers, if it had any. See
                // pullSelectedFromSheet() for why this lives on the instance.
                importReport: this._importReport,
                pack,
                isCaster: plansPrepared,
                // The switch shows for a caster whether or not it is on; the
                // column is what the switch controls.
                canPrepare,
                includesPrepared: !!build?.includesPrepared,
                // Cantrips are gone from this window. They are always available,
                // never prepared and never chosen, so there was nothing anybody
                // could do with the row — it was a strip of pictures that only
                // took height from the list that matters.
                spellSlots: plansPrepared ? getSpellSlots(this.actor) : []
            })
        };
    }

    /**
     * Listeners are bound here rather than through ACTION_HANDLERS because these
     * are drag events and a text input, none of which `data-action` covers.
     * The API's note that scripts inside body HTML do not run is the same reason.
     */
    async _onRender(context, options) {
        await super._onRender?.(context, options);

        const root = this.element;
        if (!root) return;

        // Straight back to where it was. The new list is already in the document
        // by the time this runs, so this lands before the browser paints and
        // there is nothing to see; a rail that is now shorter clamps itself.
        if (this._railScroll) {
            const list = root.querySelector('.squire-build-rail-list');
            if (list) list.scrollTop = this._railScroll;
        }

        this._syncWidth();

        // An image path that no longer resolves. The captured defaults are
        // trusted forever and files move, so a slot can end up pointing at
        // nothing — and every unset slot falls back to the same dead path, which
        // makes one renamed file look like a broken window.
        //
        // The browser's error event is the only cheap way to learn this: knowing
        // whether a path resolves otherwise means an async browse per render.
        // What it does NOT do is heal the flag. A transient failure would then
        // overwrite a good default with whatever the character has on, and if
        // that were a costume it would record the costume as the original — the
        // exact thing the defaults exist to prevent. The repair is deliberate,
        // from the rail's menu.
        root.querySelectorAll('img[data-image-kind]').forEach(img => {
            img.addEventListener('error', () => {
                const live = img.dataset.imageKind === 'token'
                    ? this.actor?.prototypeToken?.texture?.src
                    : this.actor?.img;

                // One attempt at the live artwork, then give up and get out of
                // the way — a hidden image leaves the slot's own glyph showing,
                // which is a better answer than a broken-picture box.
                if (live && !img.dataset.fellBack) {
                    img.dataset.fellBack = 'true';
                    img.src = live;
                    return;
                }
                img.hidden = true;
            });
        });

        // Rename on blur and on Enter, not on every keystroke: each write is an
        // actor flag update that re-renders the builds panel, and doing that per
        // character typed would fight the caret.
        const nameInput = root.querySelector('.squire-build-name');
        if (nameInput) {
            const commit = async () => {
                const value = nameInput.value;
                if (value.trim() && value !== this.build?.name) {
                    await renameBuild(this.actor, this.buildId, value);
                    await this._refresh();
                }
            };
            nameInput.addEventListener('blur', commit);
            nameInput.addEventListener('keydown', async (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    nameInput.blur();
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    nameInput.value = this.build?.name ?? '';
                    nameInput.blur();
                }
            });
        }

        // The empty page offers the same two buttons the rail does, and they are
        // not inside the rail — so the create handler is delegated from the root
        // rather than from the strip. One binding, either place.
        root.addEventListener('click', async (event) => {
            const create = event.target.closest('.squire-build-rail-new');
            if (!create || create.closest('.squire-build-rail')) return;
            await this.createAndSelect(create.dataset.mode);
        });

        // The rail. Delegated on the strip, because its rows are rebuilt on every
        // selection and per-row listeners would die with them.
        const rail = root.querySelector('.squire-build-rail');
        if (rail) {
            rail.addEventListener('click', async (event) => {
                // Before the entry check: the tabs sit inside the rail and a tab
                // is not a build.
                const tab = event.target.closest('.squire-build-rail-tab');
                if (tab) {
                    await this.setRailFilter(tab.dataset.filter);
                    return;
                }

                const create = event.target.closest('.squire-build-rail-new');
                if (create) {
                    await this.createAndSelect(create.dataset.mode);
                    return;
                }

                const apply = event.target.closest('.squire-build-rail-apply');
                if (apply) {
                    event.stopPropagation();
                    await this.applySelected(apply.dataset.buildId);
                    return;
                }

                const entry = event.target.closest('.squire-build-rail-entry');
                if (entry) await this.selectBuild(entry.dataset.buildId);
            });

            // Dragging a rail entry onto the tray handle keeps that build within
            // reach when the tray is shut. A flag rather than a payload, because
            // dataTransfer is protected during dragover and the handle has to
            // know it is being offered a BUILD before the drop — the same reason
            // the tray parks an item id for the AC preview.
            rail.addEventListener('dragstart', (event) => {
                const entry = event.target.closest('.squire-build-rail-entry');
                if (!entry) return;

                PanelManager._buildDragId = entry.dataset.buildId;
                event.dataTransfer.effectAllowed = 'copy';
                // Deliberately not a Foundry document payload. A real one would
                // let this drop on the canvas and make something; "put this
                // build on the handle" must not be able to do that.
                event.dataTransfer.setData('text/plain', JSON.stringify({
                    type: 'squire-build', buildId: entry.dataset.buildId
                }));
            });

            rail.addEventListener('dragend', () => {
                PanelManager._buildDragId = null;
            });

            rail.addEventListener('contextmenu', (event) => {
                const entry = event.target.closest('.squire-build-rail-entry');
                if (!entry) return;
                event.preventDefault();
                event.stopPropagation();

                const buildId = entry.dataset.buildId;

                // Blacksmith's menu has no `condition` hook, so an entry that
                // cannot apply is simply not pushed — the build at the top has
                // no Move Up, rather than a dead one that looks clickable.
                const builds = getBuilds(this.actor);
                const index = builds.findIndex(build => build.id === buildId);
                const moves = [];
                if (index > 0) {
                    moves.push({
                        name: 'Move Up',
                        icon: 'fa-solid fa-angle-up',
                        callback: () => this.moveAndKeep(buildId, -1)
                    });
                }
                if (index > -1 && index < builds.length - 1) {
                    moves.push({
                        name: 'Move Down',
                        icon: 'fa-solid fa-angle-down',
                        callback: () => this.moveAndKeep(buildId, 1)
                    });
                }

                getBlacksmith().uiContextMenu.show({
                    id: 'squire-build-rail-menu',
                    x: event.clientX,
                    y: event.clientY,
                    zones: [
                        ...(getBuild(this.actor, buildId)?.mode === 'costume'
                            ? [{ name: 'Wear This Costume', icon: 'fa-solid fa-masks-theater',
                                 callback: () => this.applySelected(buildId) }]
                            : [{ name: 'Equip This Build', icon: 'fa-solid fa-shirt',
                                 callback: () => this.applySelected(buildId) }]),
                        { name: 'Duplicate', icon: 'fa-solid fa-clone',
                          callback: () => this.duplicateSelected(buildId) },
                        ...(moves.length ? [{ separator: true }, ...moves] : []),
                        { separator: true },
                        // Costume only: a build has no artwork to put on a
                        // prototype token, and its gear is not something a
                        // prototype token knows about.
                        ...(getBuild(this.actor, buildId)?.mode === 'costume'
                            ? [{ name: 'Update Prototype Token', icon: 'fa-solid fa-user-circle',
                                 callback: () => this.adoptSelected(buildId) },
                               { name: 'Convert to Build', icon: 'fa-solid fa-shirt',
                                 callback: () => this.convertSelected(buildId, 'gear') }]
                            : [{ name: 'Convert to Costume', icon: 'fa-solid fa-masks-theater',
                                 callback: () => this.convertSelected(buildId, 'costume') }]),
                        // THREE separate things, and the separation is the
                        // point. The one above writes the character's prototype
                        // token, so Foundry uses the art. These two are about
                        // this TOOL — what a new build or costume starts from —
                        // and differ only in where they read it: this entry
                        // takes the selected build, Reset takes the character
                        // sheet. Nothing here touches the actor.
                        { name: 'Set As Default Artwork', icon: 'fa-solid fa-images',
                          callback: () => this.setDefaultsFrom(buildId) },
                        { name: 'Reset Default Artwork', icon: 'fa-solid fa-rotate-left',
                          callback: () => this.recaptureDefaults() },
                        { separator: true },
                        { name: 'Delete Build', icon: 'fa-solid fa-trash',
                          callback: () => this.deleteSelected(buildId) }
                    ],
                    className: 'squire-favorite-context-menu'
                });
            });
        }

        // Portrait and token take a click, not a drop — they hold an image path
        // rather than an item, so there is nothing on the sheet to drag in.
        // The system's own item card on anything holding an item — the same card
        // the tray rows and the character sheet show. Set here rather than in the
        // template because it replaces the slot's plain tooltip, and only a
        // FILLED slot has an item to describe; an empty one keeps its "drag
        // something here" text, which is the more useful thing to say about it.
        //
        // dnd5e's tooltip layer resolves any `.loading[data-uuid]` placeholder
        // itself, so this is three attributes rather than a lookup — see
        // applyItemTooltips() in helpers.js, which does the same for tray rows.
        root.querySelectorAll('[data-item-uuid]').forEach(element => {
            const uuid = element.dataset.itemUuid;
            if (!uuid) return;
            element.dataset.tooltip =
                `<section class="loading" data-uuid="${uuid}"><i class="fas fa-spinner fa-spin-pulse"></i></section>`;
            element.dataset.tooltipClass = 'dnd5e2 dnd5e-tooltip item-tooltip themed theme-light';
            element.dataset.tooltipDirection ??= 'LEFT';
        });

        // Prepared spells in or out, per build. Writes the build rather than a
        // setting: one character plans their spells with their kit and another
        // never does, and both are right.
        root.querySelector('.squire-build-prep-input')?.addEventListener('change', async (event) => {
            await setBuildPreparation(this.actor, this.buildId, event.currentTarget.checked);
            await this._refresh();
        });

        root.querySelector('.squire-build-pull')?.addEventListener('click', async () => {
            await this.pullSelectedFromSheet();
        });

        root.querySelector('.squire-build-report-close')?.addEventListener('click', async () => {
            this._importReport = null;
            await this.render(false);
        });

        // A global option, so it writes a setting rather than the build.
        root.querySelector('.squire-build-handle-input')?.addEventListener('change', async (event) => {
            await game.settings.set(MODULE.ID, 'buildsUpdateHandle', event.currentTarget.checked);
            await this._refresh();
        });

        // The costume's token controls. `change` rather than `input`: every
        // write is an actor flag update that re-renders this window and the
        // tray's tile, and doing that per keystroke — or per pixel of a dragged
        // slider — would fight the control being used.
        root.querySelectorAll('[data-token]').forEach(control => {
            // The slider's readout follows the thumb as it moves. This writes
            // nothing — `input` fires for every pixel of a drag, and a flag
            // write per pixel would re-render the window out from under the
            // control being dragged. It only keeps the number honest while you
            // are choosing it, which is the whole job of a number beside a
            // slider.
            if (control.type === 'range') {
                control.addEventListener('input', () => {
                    const readout = control.parentElement?.querySelector('.squire-build-token-value');
                    if (readout) readout.textContent = control.value;
                });
            }

            control.addEventListener('change', async () => {
                const key = control.dataset.token;
                const value = control.type === 'number' || control.type === 'range'
                    ? Number(control.value)
                    : control.value;

                await setBuildTokenSetting(this.actor, this.buildId, key, value);
                await this._refresh();
            });
        });

        // CLICK the warning mark to put a setting back to changing nothing.
        //
        // It was a right-click on the whole field, which nobody would guess at
        // and nothing announced. The mark is already the thing that says "this
        // will act on the character", so clicking it to stop that is the obvious
        // reading — and it is a visible target rather than an invisible gesture
        // over an area that also contains three live controls.
        //
        // Clears the whole FIELD, not the one input under the cursor: Dimensions
        // is two boxes saying one thing, and clearing half of it would leave a
        // width with no height.
        root.querySelectorAll('.squire-build-token-change').forEach(mark => {
            mark.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();

                const field = mark.closest('[data-token-row]');
                const keys = field?.dataset.tokenRow === 'dimensions'
                    ? ['width', 'height']
                    : [field?.dataset.tokenRow];

                for (const key of keys.filter(Boolean)) {
                    await setBuildTokenSetting(this.actor, this.buildId, key, null);
                }
                await this._refresh();
            });
        });

        root.querySelectorAll('.squire-build-image-slot').forEach(slot => {
            slot.addEventListener('click', () => this._pickImage(slot.dataset.image));
            slot.addEventListener('contextmenu', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!this.build?.images?.[slot.dataset.image]) return;
                await setBuildImage(this.actor, this.buildId, slot.dataset.image, null);
                await this._refresh();
            });
        });

        root.querySelectorAll('.squire-build-slot:not(.squire-build-image-slot), .squire-build-pack-cell').forEach(slot => {
            // A FILLED gear slot can be picked up and dropped on another one,
            // which is how you fix a placement rather than clearing a slot and
            // finding the item again in the tray. The whole doll is a plan, and
            // rearranging a plan should not cost two gestures.
            //
            // The dragged slot's key rides on PanelManager for the same reason
            // every other drag in this module does: `dataTransfer` is readable
            // on drop but PROTECTED during dragover, and the preview under the
            // cursor has to know what it is being offered before the drop lands.
            if (slot.dataset.slot && slot.classList.contains('is-filled')) {
                slot.draggable = true;

                slot.addEventListener('dragstart', (event) => {
                    PanelManager._buildSlotDragKey = slot.dataset.slot;
                    event.dataTransfer.effectAllowed = 'move';
                    // A payload it can carry, so dropping outside this window
                    // does nothing rather than something surprising. It is
                    // deliberately not a Foundry document: "move this between
                    // two boxes" must never be able to create a token.
                    event.dataTransfer.setData('text/plain', JSON.stringify({
                        type: 'squire-build-slot', slot: slot.dataset.slot
                    }));
                });

                slot.addEventListener('dragend', () => {
                    PanelManager._buildSlotDragKey = null;
                });
            }

            // dragover must preventDefault or the browser refuses the drop. The
            // class is added here rather than on dragenter because dragenter
            // fires again for every child element crossed, and a slot with an
            // image in it has children.
            slot.addEventListener('dragover', (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                slot.classList.add('is-drop-target');
                this._previewDrop(slot);
            });

            slot.addEventListener('dragleave', (event) => {
                // Only when the pointer has actually left the slot, not when it
                // crosses onto a child of it.
                if (slot.contains(event.relatedTarget)) return;
                slot.classList.remove('is-drop-target');
                this._clearPreview();
            });

            // A drop and a cancelled drag both end the preview. Without the
            // second, dragging away and releasing over nothing would leave the
            // badge showing a swap that never happened.
            slot.addEventListener('drop', () => this._clearPreview());

            slot.addEventListener('drop', (event) => this._onDrop(event, slot));

            // Right-click empties a slot. A visible × on every filled slot was
            // the alternative and it costs a control on all sixteen to serve the
            // rarest thing anyone does here; the tooltip says so.
            slot.addEventListener('contextmenu', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this._clearSlot(slot);
            });
        });
    }

    /**
     * Choose the portrait or token image for this build.
     *
     * Foundry's own picker, opened the way core opens it from a document sheet,
     * so it lands where people expect with the sources they already have. It
     * starts at whatever the slot is currently showing — the build's choice if
     * it has one, otherwise the character's own image — because the common edit
     * is a variation on the current picture rather than a search from the root.
     */
    async _pickImage(key) {
        const current = (key === 'main'
            ? resolveMainImage(this.actor, this.build)
            : resolveImageSlots(this.actor, this.build).find(slot => slot.key === key))?.path ?? '';

        const picker = new foundry.applications.apps.FilePicker.implementation({
            type: 'image',
            current,
            callback: async (path) => {
                await setBuildImage(this.actor, this.buildId, key, path);
                await this._refresh();
            },
            position: {
                top: (this.position?.top ?? 0) + 40,
                left: (this.position?.left ?? 0) + 10
            }
        });

        await picker.browse();
    }

    /**
     * Show what the hovering item would do, before it lands.
     *
     * `dataTransfer` is protected during dragover — a drop target is told that
     * something is over it, never what — so the item comes from the id the
     * tray's own dragstart parked on PanelManager. That is the same trick the
     * handle's reorder uses, and the only way to answer "would this be better?"
     * at the moment the question is actually being asked.
     *
     * Writes to the badge directly rather than re-rendering: dragover fires
     * continuously, and a re-render per frame would tear down the drag.
     */
    _previewDrop(slot) {
        const slotKey = slot.dataset.slot;
        if (!slotKey || !this.build) return;
        // Nothing is being ADDED during a slot-to-slot drag, so there is no
        // before-and-after to show.
        if (PanelManager._buildSlotDragKey) return;

        const itemId = PanelManager._trayDragItemId;
        const item = itemId ? this.actor?.items?.get(itemId) : null;
        // Silent on an item this slot would refuse: promising an AC change for a
        // drop that is about to be turned down would be a lie.
        if (!item || refuseSlotDrop(slotKey, item)) return;

        const now = {
            ac: estimateArmorClass(this.actor, this.build).value,
            weight: gearWeight(this.actor, this.build) ?? 0
        };
        const next = previewSlotChange(this.actor, this.build, slotKey, item.id);

        this._paintPreview(next.armorClass, next.armorClass - now.ac, next.weight);
    }

    /** Put the badge and the weight back to what the build actually is. */
    _clearPreview() {
        this._paintPreview(
            estimateArmorClass(this.actor, this.build).value,
            0,
            gearWeight(this.actor, this.build) ?? 0
        );
    }

    /**
     * Write the numbers into the badge.
     *
     * One place, so the live preview and the reset cannot drift apart in how
     * they format the same figures.
     */
    _paintPreview(armorClass, delta, weight) {
        const root = this.element;
        if (!root) return;

        const badge = root.querySelector('.squire-build-ac-badge');
        const value = root.querySelector('.squire-build-ac-badge-value');
        const deltaEl = root.querySelector('.squire-build-ac-badge-delta');
        const weightEl = root.querySelector('.squire-build-weight-value');

        if (value) value.textContent = armorClass;
        if (weightEl) weightEl.textContent = Number(weight.toFixed(2));

        if (deltaEl) {
            deltaEl.hidden = !delta;
            deltaEl.textContent = delta > 0 ? `+${delta}` : `${delta}`;
            deltaEl.classList.toggle('is-better', delta > 0);
            deltaEl.classList.toggle('is-worse', delta < 0);
        }
        badge?.classList.toggle('is-previewing', !!delta);
    }

    /**
     * Say what a dropped item changed, when it changed anything worth saying.
     *
     * Only AC and weight, and only when they moved. A silent swap is the right
     * outcome for a torch; a breastplate that costs two points of armour class
     * is the thing somebody wanted to know before they closed the window.
     */
    _reportSwap(item, before) {
        const after = {
            ac: estimateArmorClass(this.actor, this.build).value,
            weight: gearWeight(this.actor, this.build) ?? 0
        };

        const parts = [];

        // Weapons first, because for a weapon it is the only thing that moved.
        const wasDamage = damageLabel(before.replaced);
        const nowDamage = damageLabel(item);
        if (nowDamage && nowDamage !== wasDamage) {
            parts.push(wasDamage ? `${wasDamage} → ${nowDamage}` : nowDamage);
        }

        if (after.ac !== before.ac) {
            const delta = after.ac - before.ac;
            parts.push(`AC ${before.ac} → ${after.ac} (${delta > 0 ? '+' : ''}${delta})`);
        }
        if (after.weight !== before.weight) {
            const delta = Number((after.weight - before.weight).toFixed(2));
            parts.push(`${delta > 0 ? '+' : ''}${delta} lb`);
        }
        if (!parts.length) return;

        showSquireToast(item.name, { subtitle: parts.join(' · '), icon: 'fa-solid fa-shield' });
    }

    /** Empty whichever kind of slot this is — gear by key, a pack cell by index. */
    async _clearSlot(slot) {
        const { slot: slotKey, packIndex } = slot.dataset;

        if (packIndex !== undefined) {
            if (!this.build?.spells?.[Number(packIndex)]) return;
            await setBuildSpell(this.actor, this.buildId, packIndex, null);
        } else {
            if (!this.build?.slots?.[slotKey]) return;
            await setBuildSlot(this.actor, this.buildId, slotKey, null);
        }

        await this._refresh();
    }

    /**
     * Accept an item drop into one slot.
     *
     * Only items this actor owns. A drop from a compendium, another sheet or the
     * canvas resolves to an item belonging to someone else, and storing its id
     * would produce a slot that renders empty forever — the id would never
     * resolve against this actor. Rejecting it with a warning is the honest
     * answer to "why did nothing happen".
     */
    async _onDrop(event, slot) {
        event.preventDefault();
        event.stopPropagation();
        slot.classList.remove('is-drop-target');

        // A slot dropped on a slot: rearranging the doll rather than adding to
        // it. Handled before the payload is read at all, because there is no
        // item being offered — only a pair of boxes to exchange.
        const from = PanelManager._buildSlotDragKey;
        PanelManager._buildSlotDragKey = null;
        if (from && slot.dataset.slot && this.build) {
            if (from === slot.dataset.slot) return;

            // The rules still apply to the destination. Dragging a torch into
            // the ammunition circle is the same refusal whether the torch came
            // from the tray or from the character's belt.
            const moving = this.actor?.items?.get(this.build.slots?.[from]);
            const displaced = this.actor?.items?.get(this.build.slots?.[slot.dataset.slot]);

            const refusal = (moving && refuseSlotDrop(slot.dataset.slot, moving))
                || (displaced && refuseSlotDrop(from, displaced));
            if (refusal) {
                ui.notifications.warn(refusal);
                return;
            }

            await moveBuildSlot(this.actor, this.buildId, from, slot.dataset.slot);
            await this._refresh();
            return;
        }

        const { slot: slotKey, packIndex } = slot.dataset;
        const isPackCell = packIndex !== undefined;
        if (!this.build) return;
        if (!isPackCell && !BUILD_SLOT_KEYS.includes(slotKey)) return;

        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        } catch {
            return;
        }
        if (data?.type !== 'Item') return;

        // toDragData() gives a uuid; the flag stores an id. fromUuid resolves
        // both an owned item and a foreign one, which is exactly what makes the
        // ownership check below possible rather than a guess from the string.
        const item = data.uuid ? await fromUuid(data.uuid) : null;
        if (!item) return;

        if (item.parent?.id !== this.actor?.id) {
            ui.notifications.warn(`${item.name} is not on this character's sheet, so it cannot go in a build.`);
            return;
        }

        if (!isPackCell) {
            // Enforced only where dnd5e has a field to answer with — nothing
            // non-physical anywhere, plus rings, ammo, and hands. See
            // SLOT_RULES. A refusal always says what the slot wanted, because
            // "nothing happened" is the least useful answer to a failed drag.
            const refusal = refuseSlotDrop(slotKey, item);
            if (refusal) {
                ui.notifications.warn(refusal);
                return;
            }

            // Measured before and after, so a swap can say whether it was an
            // improvement. This is the honest version of "which is better": no
            // invented score, just the two numbers that actually changed.
            const before = {
                ac: estimateArmorClass(this.actor, this.build).value,
                weight: gearWeight(this.actor, this.build) ?? 0,
                // What is being replaced, captured before it is gone. Damage is
                // the whole comparison for a weapon, and a weapon swap moves
                // neither armour class nor — usually — weight worth mentioning.
                replaced: this.actor?.items?.get(this.build.slots?.[slotKey]) ?? null
            };

            await setBuildSlot(this.actor, this.buildId, slotKey, item.id);
            await this._refresh();
            this._reportSwap(item, before);
            return;
        }

        if (item.type !== 'spell') {
            ui.notifications.warn(`${item.name} is not a spell, so it cannot be prepared.`);
            return;
        }

        // A cell past the class's limit is not a slot yet. The grid already
        // makes it unclickable; this is the same answer given again, because a
        // pointer-events rule is a cursor hint and not a permission check.
        if (slot.classList.contains('is-beyond') && !slot.classList.contains('is-filled')) {
            ui.notifications.warn(`${this.actor.name} cannot prepare that many spells yet.`);
            return;
        }

        // A cantrip is always available and never counts against the limit, so
        // putting one in a prepared slot spends a slot on nothing. Refused
        // rather than allowed-and-ignored: silently accepting it would make the
        // count wrong in the one place the count is the point.
        if (item.system?.level === 0) {
            ui.notifications.warn(`${item.name} is a cantrip — it is always available and does not need preparing.`);
            return;
        }

        await setBuildSpell(this.actor, this.buildId, packIndex, item.id);
        await this._refresh();
    }
}
