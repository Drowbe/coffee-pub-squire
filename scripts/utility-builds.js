import { MODULE } from './const.js';

/**
 * GEAR BUILDS — the slots, and the actor flag they live in.
 *
 * A build is a SAVED PLAN, not a state the character is in. Nothing here reads
 * or writes `system.equipped`, and filling a slot changes nothing on the sheet.
 * That is deliberate and is the whole of phase one: the layout is worth proving
 * before anything is allowed to equip sixteen items in one click.
 *
 * D&D 5e has no general equipment-slot concept — no `system.slot`, no "this is a
 * helmet" flag — so most of these slots cannot be validated and do not try. But
 * "most" is not "all", and the rule this module follows is:
 *
 *     ENFORCE EXACTLY WHERE dnd5e HAS A FIELD THAT ANSWERS THE QUESTION,
 *     AND NOWHERE ELSE.
 *
 * Four places it does:
 *
 *   * Nothing non-physical, anywhere. A spell, a feat, a class or a background
 *     is not an object; `item.type` says so outright.
 *   * `ammo` is a real `consumableTypes` key that content reliably sets, because
 *     ammunition is functionally special in dnd5e — weapon attacks consume it.
 *   * Both Hands takes a `weapon`, a top-level item type that is always right.
 *
 * Everywhere else it does not, and the reason is worth keeping because it has
 * now caught two rules that looked defensible and were not:
 *
 *     A KEY EXISTING IN CONFIG IS NOT THE SAME AS CONTENT USING IT.
 *
 * `ring` is a real `equipmentTypes` key, so the ring slots were validated on it —
 * and then a Ring of Fire Resistance was refused, because published content
 * types rings as `trinket` and very little sets `ring` at all. `weaponOrShield`
 * on the hands went the same way when it refused a torch. Both rules were
 * grounded in a field that existed and turned down more real items than the
 * imaginary ones they caught.
 *
 * So Head, Face, Neck, Back, Chest, Arms, Hands, Waist, Hip, Ring, Feet, Main
 * Hand and Off Hand all take any physical item. A helm, a cloak, a belt, a ring
 * and a pair of boots are `trinket` or `wondrous` or `clothing` with nothing to
 * tell them apart, and a player who puts their boots on their head is not making
 * a mistake this module is in a position to identify.
 */

/**
 * Item types that are physical objects. Everything else — spells, feats, class
 * and subclass entries, backgrounds, species, facilities — is a record on the
 * sheet rather than a thing the character could wear or hold.
 */
const PHYSICAL_ITEM_TYPES = ['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container', 'backpack'];

/**
 * What each kind of slot will take, and what to say when it will not.
 *
 * `test` returns true for an acceptable item. `refusal` is shown to the person
 * who dropped it and names what the slot wants, because "nothing happened" is
 * the least useful possible answer to a drag that failed.
 */
const SLOT_RULES = {
    // The default. Any physical object, because nothing distinguishes a helm
    // from a cloak in the data.
    gear: {
        test: item => PHYSICAL_ITEM_TYPES.includes(item.type),
        refusal: item => `${item.name} is not something a character can wear or carry.`
    },
    ammo: {
        test: item => item.type === 'consumable' && item.system?.type?.value === 'ammo',
        refusal: item => `${item.name} is not ammunition.`
    },
    weapon: {
        test: item => item.type === 'weapon',
        refusal: item => `${item.name} is not a weapon.`
    },
    // The doll's two quick-use slots. A spell OR a feature: the question they
    // ask is "what do you reach for", and for half the party the answer is Rage
    // or Second Wind rather than anything from a spell list. Restricting them to
    // spells made two slots that a barbarian could never fill.
    //
    // A cantrip is welcome here, unlike in a prepared slot — it is the most
    // reachable thing a caster owns.
    ability: {
        test: item => item.type === 'spell' || item.type === 'feat',
        refusal: item => `${item.name} is not a spell or a feature.`
    },
    // Main Hand and Off Hand have NO rule of their own beyond the physical one.
    // "Weapon or shield" was the first attempt and it refused a torch — one of
    // the most ordinary things a hand holds, along with a holy symbol, a wand, a
    // lantern, or a potion about to be drunk. There is no `holdable` field, and
    // inventing one refused more real cases than the imaginary ones it caught.
    // Only Both Hands is constrained, and only to `weapon`, because nothing else
    // is ever wielded in two.
};

/**
 * The body slots, in grid order, laid out to match the paper doll.
 *
 * `row` and `column` are 1-based CSS grid lines. The portrait sits in the middle
 * of rows 2–4, which is why the side columns skip column 2–4 entirely.
 *
 *              HEAD
 *      FACE   [       ]   NECK
 *      BACK   [portrait]  CHEST
 *      ARMS   [       ]   HANDS
 *   RING1  HIP1  WAIST  HIP2  RING2
 *              FEET
 *
 * `icon` is what an EMPTY slot shows. A word alone in a small box is a label
 * with nothing to label; a glyph says what belongs there at a glance and the
 * word underneath settles it. Every one is a real object rather than an
 * abstraction — a boot, a helmet, a ring — because the slot is a place a thing
 * goes, not a category.
 *
 * Two compromises, both because Font Awesome has no better glyph: `fa-grip-lines`
 * for the waist (there is no belt in the set — this is the closest thing to a
 * strap), and `fa-backpack` for the back, which is at least a thing worn there
 * even when what goes in the slot is a cloak.
 */
/*
 * `hint` is what an EMPTY slot says it is for. Every one of these body slots
 * accepts any physical object — see SLOT_RULES, and the note above about a pair
 * of boots being indistinguishable from a hat in the data — so the hint is a
 * suggestion rather than a rule, and is worded as one. That is honest and it is
 * also the useful thing to say: nobody is stuck wondering why the slot refused
 * their bandolier, they just want to know what people normally put there.
 */
export const BUILD_CORE_SLOTS = [
    { key: 'head',  label: 'Head',  icon: 'fa-helmet-battle',     row: 1, column: 3, hint: 'Helms, hats, circlets, crowns.' },
    { key: 'face',  label: 'Face',  icon: 'fa-mask',              row: 2, column: 1, hint: 'Masks, goggles, spectacles, veils.' },
    { key: 'neck',  label: 'Neck',  icon: 'fa-gem',               row: 2, column: 5, hint: 'Amulets, necklaces, periapts, holy symbols.' },
    { key: 'back',  label: 'Back',  icon: 'fa-backpack',          row: 3, column: 1, hint: 'Cloaks, capes, mantles, packs.' },
    { key: 'chest', label: 'Chest', icon: 'fa-vest',              row: 3, column: 5, hint: 'Armour, robes, tunics — the thing your AC comes from.' },
    { key: 'arms',  label: 'Arms',  icon: 'fa-shirt-long-sleeve', row: 4, column: 1, hint: 'Bracers, vambraces, sleeves.' },
    { key: 'hands', label: 'Hands', icon: 'fa-mitten',            row: 4, column: 5, hint: 'Gloves, gauntlets, mitts.' },
    { key: 'ring1', label: 'Ring',  icon: 'fa-ring',              row: 5, column: 1, hint: 'A ring. Most characters may attune to two at once.' },
    { key: 'hip1',  label: 'Hip',   icon: 'fa-sack',              row: 5, column: 2, hint: 'Pouches, quivers, horns, sheathed oddments.' },
    { key: 'waist', label: 'Waist', icon: 'fa-grip-lines',        row: 5, column: 3, hint: 'Belts, girdles, sashes.' },
    { key: 'hip2',  label: 'Hip',   icon: 'fa-sack',              row: 5, column: 4, hint: 'Pouches, quivers, horns, sheathed oddments.' },
    { key: 'ring2', label: 'Ring',  icon: 'fa-ring',              row: 5, column: 5, hint: 'A ring. Most characters may attune to two at once.' },
    { key: 'feet',  label: 'Feet',  icon: 'fa-boot',              row: 6, column: 3, hint: 'Boots, shoes, sandals, greaves.' }
];

/* The hints for the slots that DO enforce something. Worded as the rule they
   actually apply, because here a refusal is possible and "why did nothing
   happen" is a real question. */
const HINTS = {
    weapon: 'A dagger, hand axe or other sidearm — anything you would draw without thinking.',
    ammo: 'Arrows, bolts, bullets, darts — whatever your weapons spend.',
    ability: 'A spell or a feature you reach for first: Fire Bolt, Rage, Second Wind. Cantrips welcome.',
    mainhand: 'The weapon you lead with. Any weapon, or a shield if that is how you fight.',
    offhand: 'A shield, a second weapon, or a torch.',
    bothhands: 'A two-handed weapon. Nothing stops you filling the other hands as well — this is a plan, not a rules engine.'
};

/*
 * THE LAST ROW AND THE BIG THREE, WHICH DEPEND ON WHO IS WEARING THE DOLL.
 *
 * The doll used to end in three big weapon slots for everybody, which quietly
 * said that what a character does is hit things. That is true of half a party.
 * A wizard's three most important choices are spells, and their weapons are an
 * afterthought — so the two zones SWAP.
 *
 *   MARTIAL   row 6:  Primary  Sheath  Feet  Ammo  Secondary
 *             big:    Main Hand   Both Hands   Off Hand
 *
 *   CASTER    row 6:  Main  Sheath  Feet  Ammo  Off Hand
 *             big:    Primary   Secondary   Tertiary
 *
 * The keys are the same set in both; only their size and place change. A caster
 * has no Both Hands slot and a martial has no Tertiary — five columns is five
 * columns, and the slot each layout drops is the one that layout cares least
 * about. Nothing is deleted from a build that changes category: the flag keeps
 * every key, so multiclassing into a caster and back finds the weapons where
 * they were left.
 */
/* The sheath is ROUND, like the ammunition beside it. It was square on the
   argument that a sheathed weapon is wielded and ammunition is only spent — but
   in the row as drawn the two of them are the pair that are not worn and not
   held, and a matched pair of circles says that far better than a distinction
   nobody was reading. */
const ROW_SIX_MARTIAL = [
    { key: 'spell1', label: 'Primary',   icon: 'fa-bolt',       row: 6, column: 1, accepts: 'ability', hint: HINTS.ability },
    { key: 'sheath', label: 'Sheath',    icon: 'fa-dagger',     row: 6, column: 2, round: true, accepts: 'weapon', hint: HINTS.weapon },
    { key: 'ammo',   label: 'Ammo',      icon: 'fa-bow-arrow',  row: 6, column: 4, round: true, accepts: 'ammo', hint: HINTS.ammo },
    { key: 'spell2', label: 'Secondary', icon: 'fa-bolt',       row: 6, column: 5, accepts: 'ability', hint: HINTS.ability }
];

const ROW_SIX_CASTER = [
    { key: 'mainhand', label: 'Main Hand', icon: 'fa-sword',          row: 6, column: 1, hint: HINTS.mainhand },
    { key: 'sheath',   label: 'Sheath',    icon: 'fa-dagger',         row: 6, column: 2, round: true, accepts: 'weapon', hint: HINTS.weapon },
    { key: 'ammo',     label: 'Ammo',      icon: 'fa-bow-arrow',      row: 6, column: 4, round: true, accepts: 'ammo', hint: HINTS.ammo },
    { key: 'offhand',  label: 'Off Hand',  icon: 'fa-shield-halved',  row: 6, column: 5, hint: HINTS.offhand }
];

const BIG_MARTIAL = [
    { key: 'mainhand',  label: 'Main Hand',  icon: 'fa-sword', hint: HINTS.mainhand },
    // An axe rather than crossed swords: `fa-swords` reads as dual-wielding,
    // which is the opposite of what this slot means.
    { key: 'bothhands', label: 'Both Hands', icon: 'fa-axe-battle', accepts: 'weapon', hint: HINTS.bothhands },
    { key: 'offhand',   label: 'Off Hand',   icon: 'fa-shield-halved', hint: HINTS.offhand }
];

const BIG_CASTER = [
    { key: 'spell1', label: 'Primary',   icon: 'fa-bolt', accepts: 'ability', hint: HINTS.ability },
    { key: 'spell2', label: 'Secondary', icon: 'fa-bolt', accepts: 'ability', hint: HINTS.ability },
    { key: 'spell3', label: 'Tertiary',  icon: 'fa-bolt', accepts: 'ability', hint: HINTS.ability }
];

/**
 * Whether this character's CLASS makes them a caster, for the doll's shape.
 *
 * dnd5e grades spellcasting on the class item: `full` and `pact` are casters,
 * `half` and `third` and `artificer` are martials who also cast. That grading is
 * exactly the distinction this window needs and it is already in the data.
 *
 * The test used to be "prepares anything", which is a different question and got
 * a ranger wrong — a ranger prepares spells and is not a spellcaster, so they
 * were handed a wizard's doll with three quick-cast slots where their weapons
 * should be. In modern rules half the martial classes cast something; having
 * spells says nothing about what a character LEADS with, and what they lead with
 * is the only thing this layout is about.
 */
function isCasterClass(actor) {
    return Object.values(actor?.classes ?? {})
        .some(cls => ['full', 'pact'].includes(cls?.system?.spellcasting?.progression));
}

/**
 * Whether this character can plan a prepared list at all, for the switch.
 *
 * A DIFFERENT question from the one above, and deliberately a looser one. The
 * doll's shape is about what they lead with; this is about whether there is
 * anything to plan — so a ranger, a paladin and an eldritch knight all get the
 * switch on a martial's doll, which is the correct answer for every one of them.
 */
export function canPrepareSpells(actor) {
    return getPreparingClasses(actor).length > 0
        || Object.values(actor?.system?.spells ?? {}).some(slot => Number(slot?.max ?? 0) > 0);
}

/**
 * Which doll this character gets.
 */
export function getDollLayout(actor) {
    const caster = isCasterClass(actor);
    return {
        caster,
        body: [...BUILD_CORE_SLOTS, ...(caster ? ROW_SIX_CASTER : ROW_SIX_MARTIAL)],
        big: caster ? BIG_CASTER : BIG_MARTIAL
    };
}

/** Every slot either layout can show, for validation and for the stored shape. */
const ALL_SLOT_DEFINITIONS = [
    ...BUILD_CORE_SLOTS, ...ROW_SIX_MARTIAL, ...ROW_SIX_CASTER, ...BIG_MARTIAL, ...BIG_CASTER
];

/** Every slot key, for validating what arrives from a dataset or a stored flag. */
export const BUILD_SLOT_KEYS = [...new Set(ALL_SLOT_DEFINITIONS.map(slot => slot.key))];

/**
 * The two image slots, flanking the head.
 *
 * Not gear. They hold an image PATH rather than an item id, and they are the
 * part of a build that describes the character rather than what the character is
 * carrying: applying a build sets the actor's portrait and its token artwork
 * from these.
 *
 * Round, like the ammunition slot, and for the same reason — a circle marks "not
 * the same kind of thing as its neighbours" without spending a word on it.
 */
export const BUILD_IMAGE_SLOTS = [
    { key: 'portrait', label: 'Portrait', icon: 'fa-image-portrait', row: 1, column: 2 },
    { key: 'token',    label: 'Token',    icon: 'fa-chess-pawn',     row: 1, column: 4 }
];

/**
 * Every image a build stores, including the one that is not a ring slot.
 *
 * `main` is the picture in the MIDDLE of the doll — the build's own portrait,
 * chosen the same way the other two are and shown nowhere else. It is
 * deliberately absent from BUILD_IMAGE_SLOTS, which is the pair flanking the
 * head; the centre is not a slot in that ring and rendering it as one would put
 * a third circle where the character's body is.
 *
 * Applying a build never writes it. The portrait and the token belong to the
 * actor and change when a build is worn; this belongs to the BUILD and is how
 * that build looks in this window, whatever the character happens to be wearing.
 */
export const BUILD_IMAGE_KEYS = [...BUILD_IMAGE_SLOTS.map(slot => slot.key), 'main'];

/**
 * Rarity, normalised to a dnd5e key.
 *
 * `system.rarity` is stored as whatever the sheet wrote — "very rare" from a
 * hand-typed field, `veryRare` from the dropdown — so it is camel-cased back to
 * the key `CONFIG.DND5E.itemRarity` uses before anything styles on it. Same
 * normalisation the merchant module does, for the same reason.
 *
 * Returns null for anything unrated, which is most of what a character carries.
 * A rope should look like a rope, not like a common magic item.
 */
function itemRarity(item) {
    const raw = String(item?.system?.rarity ?? '').trim();
    if (!raw) return null;

    const camel = raw.replace(/\s+(.)/g, (_match, next) => next.toUpperCase());
    const key = `${camel.charAt(0).toLowerCase()}${camel.slice(1)}`;
    return key in (CONFIG.DND5E?.itemRarity ?? {}) ? key : null;
}

/** Where the builds live. Module-owned flag, so the sheet itself is untouched. */
const BUILDS_FLAG = 'builds';

/**
 * Every build on this actor, always an array.
 *
 * Defensive about the stored shape because a flag is a place a person can reach:
 * a hand-edited world, a half-finished import or a build written by an older
 * version should cost one bad row, not the whole panel.
 */
export function getBuilds(actor) {
    const stored = actor?.getFlag(MODULE.ID, BUILDS_FLAG);
    if (!Array.isArray(stored)) return [];

    return stored.filter(build => build && typeof build.id === 'string').map(build => ({
        id: build.id,
        name: typeof build.name === 'string' && build.name.trim() ? build.name : 'Untitled Build',
        // Slots are rebuilt from BUILD_SLOT_KEYS rather than trusted wholesale,
        // so a key that is no longer a slot is dropped instead of being carried
        // forward forever, and a slot added later arrives as null on every
        // existing build without a migration.
        slots: Object.fromEntries(BUILD_SLOT_KEYS.map(key => {
            const value = build.slots?.[key];
            return [key, typeof value === 'string' ? value : null];
        })),
        // 'gear' or 'costume'. A costume changes only how the character LOOKS —
        // portrait and token — and touches no equipment or spells. Worth being a
        // mode rather than "a build with empty slots", because an empty gear
        // build applied would strip the character of everything it owns, and
        // that is the opposite of what somebody dressing up wants.
        mode: build.mode === 'costume' ? 'costume' : 'gear',
        // Portrait and token, as paths. Validated to strings so a malformed flag
        // costs one slot rather than the panel.
        images: Object.fromEntries(BUILD_IMAGE_KEYS.map(key => {
            const value = build.images?.[key];
            return [key, typeof value === 'string' && value ? value : null];
        })),
        // Prepared spells, as one flat list. Not keyed by class: in 5e
        // preparation is a flag on the SPELL, and a wizard/cleric prepares one
        // list against one combined limit — the per-class split only ever
        // existed to draw one grid per class, and two grids implied a rule the
        // game does not have. Read tolerantly, because the earlier shape is
        // still sitting in flags.
        spells: flattenSpellList(build.spells),
        // FAVOURITE: one of the ones you actually use, in a list that grows to
        // twenty. A field on the build rather than a list of ids in a second
        // flag, so deleting a build takes its heart with it and the two can never
        // disagree about what exists.
        //
        // Not the same thing as being on the tray handle, though both mean "one
        // I reach for". The handle is a strip with room for a few and costs
        // screen space; this is a filter on a list and costs nothing, so a
        // player can favourite a dozen without consequence.
        favorite: !!build.favorite,
        // What this one sounds like going on. Null means "no opinion", which
        // plays the default — the same rule every image slot here follows, and
        // for the same reason: unset and set-to-the-default-value are different
        // intentions, and only the second should survive the default changing.
        sound: typeof build.sound === 'string' && build.sound ? build.sound : null,
        // How the token is DRAWN, as opposed to what it is drawn with. Only a
        // costume sets these — a build is gear, and gear does not change how big
        // a character's token is on the map. Every one of them is nullable and
        // null means "no change", exactly as an unset image does.
        token: normaliseTokenSettings(build.token)
    }));
}

/* ==========================================================================
   HOW THE TOKEN IS DRAWN

   A costume changes what a character LOOKS like, and the picture is only half of
   that. A giant in disguise is not the same size on the map; a portrait cropped
   square and a portrait cropped tall want different fit modes to sit right in
   the same square. These are the three settings Foundry's own token config
   exposes for it, carried by the costume that needs them.

   Deliberately NOT on a build. A build is gear, and equipping a breastplate does
   not change how many squares you stand in — a build that reset your token's
   size would be making a decision that belongs to the character rather than to
   the kit. Applying one leaves all of this exactly as the token already had it.
   ========================================================================== */

/**
 * Foundry's own fit modes, read from Foundry rather than listed here.
 *
 * The keys are core's to change and a hardcoded list would be a guess that fails
 * silently — a mode nobody could select, or one written into a flag that the
 * token document then rejects. The labels are ours only because core does not
 * expose them separately from its own config sheet.
 */
const TOKEN_FIT_LABELS = {
    fill: {
        label: 'Fill',
        help: 'Scale adjusts the image after it fills the token dimensions.'
    },
    contain: {
        label: 'Contain',
        help: 'Scale adjusts the image after fitting it fully within the token.'
    },
    cover: {
        label: 'Cover',
        help: 'Scale adjusts the image after it expands to cover the token.'
    },
    width: {
        label: 'Full Width',
        help: 'Scale adjusts the image after fitting it to the token width.'
    },
    height: {
        label: 'Full Height',
        help: 'Scale adjusts the image after fitting it to the token height.'
    }
};

export function tokenFitModes() {
    const keys = CONST?.TEXTURE_DATA_FIT_MODES ?? Object.keys(TOKEN_FIT_LABELS);
    return keys.map(key => ({
        key,
        label: TOKEN_FIT_LABELS[key]?.label ?? key,
        // What the mode does TO THE SCALE below it, which is the only reason the
        // two controls sit together: the slider means something different under
        // each of them, and a slider whose meaning silently changes is worse
        // than one with no label at all.
        help: TOKEN_FIT_LABELS[key]?.help ?? ''
    }));
}

/** Grid spaces and a ratio, or null for each one the costume does not set. */
function normaliseTokenSettings(stored) {
    const size = value => {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : null;
    };

    const fit = typeof stored?.fit === 'string'
        && tokenFitModes().some(mode => mode.key === stored.fit)
        ? stored.fit
        : null;

    return { width: size(stored?.width), height: size(stored?.height), fit, scale: size(stored?.scale) };
}

/**
 * What the controls should show: the costume's value where it has one, and the
 * token's own where it does not.
 *
 * `isDefault` is the difference between the two, and it is the whole point —
 * a control showing the character's current size looks exactly like a control
 * that has been set to it, and only one of those will change anything.
 */
export function resolveTokenSettings(actor, build) {
    const proto = actor?.prototypeToken;
    const stored = normaliseTokenSettings(build?.token);

    const field = (value, fallback) => ({
        value: value ?? fallback ?? null,
        isDefault: value === null || value === undefined
    });

    return {
        width: field(stored.width, Number(proto?.width) || 1),
        height: field(stored.height, Number(proto?.height) || 1),
        scale: field(stored.scale, Number(proto?.texture?.scaleX) || 1),
        fit: (() => {
            const current = stored.fit ?? proto?.texture?.fit ?? 'contain';
            return {
                ...field(stored.fit, proto?.texture?.fit ?? 'contain'),
                // The line under the controls, for whichever mode is showing —
                // set or merely current, since the slider behaves the same way
                // either way.
                help: tokenFitModes().find(mode => mode.key === current)?.help ?? '',
                // The readable name, so the warning can say what it will DO
                // rather than only that it will do something.
                label: tokenFitModes().find(mode => mode.key === current)?.label ?? current,
                options: tokenFitModes().map(mode => ({ ...mode, selected: mode.key === current }))
            };
        })()
    };
}

/** Set one of them, or clear it back to "no change" with null. */
export async function setBuildTokenSetting(actor, buildId, key, value) {
    if (!['width', 'height', 'fit', 'scale'].includes(key)) return;

    await saveBuilds(actor, getBuilds(actor).map(build => build.id === buildId
        ? { ...build, token: normaliseTokenSettings({ ...build.token, [key]: value }) }
        : build));
}

/**
 * The token document keys for whatever this costume actually sets.
 *
 * Scale is one control and two fields: Foundry stores the axes separately and
 * its own config writes both from one slider, because a token scaled on one axis
 * is a squashed picture rather than a bigger one.
 */
function tokenGeometryUpdate(build) {
    const settings = normaliseTokenSettings(build?.token);
    const update = {};

    if (settings.width !== null) update.width = settings.width;
    if (settings.height !== null) update.height = settings.height;
    if (settings.fit !== null) update['texture.fit'] = settings.fit;
    if (settings.scale !== null) {
        update['texture.scaleX'] = settings.scale;
        update['texture.scaleY'] = settings.scale;
    }

    return update;
}

/**
 * The stored prepared list, whichever shape it is in.
 *
 * It was one array per class while each class drew its own grid. One pooled
 * column replaced that, and rather than migrate the flag — a write on every read
 * of every build, to fix something a concatenation fixes for free — the old
 * shape is flattened here. A build written since is already an array and falls
 * straight through.
 */
function flattenSpellList(stored) {
    const list = Array.isArray(stored)
        ? stored
        : Object.values(stored ?? {}).filter(Array.isArray).flat();

    return list.map(entry => typeof entry === 'string' ? entry : null);
}

export function getBuild(actor, buildId) {
    return getBuilds(actor).find(build => build.id === buildId) ?? null;
}

/** Write the whole list back. Every mutation below funnels through here. */
async function saveBuilds(actor, builds) {
    await actor.setFlag(MODULE.ID, BUILDS_FLAG, builds);
}

/**
 * Add an empty build and return it, so the caller can open what it just made
 * without re-reading the flag and guessing which one is new.
 */
export async function createBuild(actor, name = 'New Build') {
    const build = {
        id: foundry.utils.randomID(),
        name,
        mode: 'gear',
        slots: Object.fromEntries(BUILD_SLOT_KEYS.map(key => [key, null])),
        images: Object.fromEntries(BUILD_IMAGE_KEYS.map(key => [key, null])),
        favorite: false,
        sound: null,
        spells: [],
        token: normaliseTokenSettings(null)
    };
    await saveBuilds(actor, [...getBuilds(actor), build]);
    return build;
}

/**
 * Copy a build, slots and prepared spells and all, and return the copy.
 *
 * Placed directly after the original rather than at the end, because a duplicate
 * is a variant of the thing it came from and belongs beside it.
 *
 * The new build carries the same item ids, which is correct: both plans name the
 * same longsword. Nothing is cloned on the sheet — a build has never owned an
 * item, only pointed at one.
 */
export async function duplicateBuild(actor, buildId) {
    const builds = getBuilds(actor);
    const index = builds.findIndex(build => build.id === buildId);
    if (index === -1) return null;

    const source = builds[index];
    const copy = {
        id: foundry.utils.randomID(),
        name: `${source.name} (Copy)`,
        mode: source.mode,
        slots: { ...source.slots },
        images: { ...source.images },
        // Copied rather than shared, or editing one build's list would edit
        // the other's.
        spells: [...(source.spells ?? [])],
        // A copy of a favourite is a new build, not a second favourite. You
        // duplicated it to change it; whether the variant earns a heart is a
        // decision to make after seeing it.
        favorite: false,
        // The sound DOES carry over: it is part of what this build is, the way
        // its name and its pictures are, and a copy that fell silent would be a
        // copy of something else.
        sound: source.sound ?? null,
        token: { ...(source.token ?? {}) }
    };

    await saveBuilds(actor, [...builds.slice(0, index + 1), copy, ...builds.slice(index + 1)]);
    return copy;
}

/**
 * What the gear in a build weighs.
 *
 * Gear only: prepared spells weigh nothing, and counting them would be absurd.
 * Quantity is deliberately IGNORED — a build slots one arrow to mean "arrows",
 * not to mean the whole stack of sixty, so multiplying by quantity would report
 * a weight nobody is carrying because of this plan.
 *
 * Returns null when nothing in the build has a weight, so the footer can leave
 * the figure out rather than claim a confident zero.
 */
export function gearWeight(actor, build) {
    let total = 0;
    let counted = 0;

    for (const itemId of Object.values(build?.slots ?? {})) {
        const item = itemId ? actor?.items?.get(itemId) : null;
        if (!item) continue;

        // dnd5e moved weight from a plain number to `{value, units}` partway
        // through 3.x, and both shapes are still in the wild.
        let weight = item.system?.weight;
        if (weight && typeof weight === 'object') weight = weight.value;

        const pounds = Number(weight);
        if (!Number.isFinite(pounds) || pounds <= 0) continue;

        total += pounds;
        counted++;
    }

    // Two decimals at most, and no trailing zeroes: "12.5 lb", not "12.50 lb".
    return counted ? Number(total.toFixed(2)) : null;
}

/**
 * Convert a build to a costume or back, DISCARDING what the other mode holds.
 *
 * The gear and the prepared list are cleared on the way to a costume, and there
 * is nothing to bring back on the way out. Keeping them was the obvious thing to
 * do — convert by mistake, convert back, no harm — and it is what produced the
 * ghosts: a costume goes on carrying invisible gear, its tile drew a weapon
 * nobody could see the source of, and converting back handed you a build full of
 * whatever happened to be in it weeks ago.
 *
 * What conversion is actually worth is the NAME and the PICTURES, which are the
 * part that took work. The slots were always a few drags. So it keeps the half
 * that is expensive to recreate and drops the half that is not, and the result
 * is the same whichever direction you came from — which is the property the
 * ghosts destroyed.
 */
export async function convertBuildMode(actor, buildId, mode) {
    const next = mode === 'costume' ? 'costume' : 'gear';

    await saveBuilds(actor, getBuilds(actor).map(build => build.id === buildId
        ? {
            ...build,
            mode: next,
            slots: Object.fromEntries(BUILD_SLOT_KEYS.map(key => [key, null])),
            spells: [],
            // The heart and the sound are NOT reset. Converting changes what
            // kind of thing this is, not which thing it is — it keeps its name
            // and its pictures for exactly that reason, and a favourite that
            // fell off the Favourites tab because you switched it to a costume
            // would be the same surprise.
            // A costume's token geometry is as much a costume thing as its
            // pictures are, and means nothing on a build.
            token: next === 'costume' ? build.token : normaliseTokenSettings(null)
        }
        : build));
}

/**
 * What this build sounds like going on. Null clears it back to the default.
 */
export async function setBuildSound(actor, buildId, path) {
    await saveBuilds(actor, getBuilds(actor).map(build => build.id === buildId
        ? { ...build, sound: path || null }
        : build));
}

/**
 * Favourite a build, or take the heart off.
 *
 * The Favourites tab is the whole feature: an easy way back to the two or three
 * you actually use, in a rail that fills up with costumes and one-off kits.
 * Nothing else reads this — it does not equip, it does not reach the handle, and
 * it changes nothing about the character.
 */
export async function toggleBuildFavorite(actor, buildId) {
    const builds = getBuilds(actor);
    const target = builds.find(build => build.id === buildId);
    if (!target) return null;

    const next = !target.favorite;
    await saveBuilds(actor, builds.map(build => build.id === buildId
        ? { ...build, favorite: next }
        : build));
    return next;
}

/** Switch a build between dressing the character and equipping it. */
export async function setBuildMode(actor, buildId, mode) {
    const next = mode === 'costume' ? 'costume' : 'gear';

    await saveBuilds(actor, getBuilds(actor).map(build =>
        build.id === buildId ? { ...build, mode: next } : build));
}

/**
 * Move a build one place up or down the rail.
 *
 * `delta` rather than a target index: the two callers are an up arrow and a down
 * arrow, and making them each work out a destination would be two chances to get
 * the same arithmetic wrong. Out-of-range moves are a no-op rather than a clamp,
 * so the menu can simply not offer the entry at the ends and the two agree.
 */
export async function moveBuild(actor, buildId, delta) {
    const builds = getBuilds(actor);
    const from = builds.findIndex(build => build.id === buildId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= builds.length) return;

    const [moved] = builds.splice(from, 1);
    builds.splice(to, 0, moved);
    await saveBuilds(actor, builds);
}

export async function deleteBuild(actor, buildId) {
    await saveBuilds(actor, getBuilds(actor).filter(build => build.id !== buildId));
}

export async function renameBuild(actor, buildId, name) {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return;

    await saveBuilds(actor, getBuilds(actor).map(build =>
        build.id === buildId ? { ...build, name: trimmed } : build));
}

/**
 * Put an item in a slot, or empty it with a null itemId.
 *
 * The item id is stored, not a uuid: a build holds things this character owns,
 * so the id is the shortest thing that identifies one and `actor.items.get` is a
 * synchronous lookup. A uuid would buy the ability to slot a compendium item
 * nobody owns, which is a different feature — a shopping list rather than a
 * loadout — and would make every slot an async resolve on every render.
 */
/**
 * Move what is in one slot into another, swapping with whatever is there.
 *
 * ONE write, not two calls to setBuildSlot. Two would each save the whole flag,
 * and the state between them has the same item in two slots — which the window
 * would render if it happened to refresh in the gap, and which the second write
 * would then be building on top of.
 *
 * A swap rather than a displacement: the thing already in the target has to go
 * somewhere, and where it came from is the only place that is certainly free.
 */
export async function moveBuildSlot(actor, buildId, fromKey, toKey) {
    if (fromKey === toKey) return;
    if (!BUILD_SLOT_KEYS.includes(fromKey) || !BUILD_SLOT_KEYS.includes(toKey)) return;

    await saveBuilds(actor, getBuilds(actor).map(build => build.id === buildId
        ? {
            ...build,
            slots: {
                ...build.slots,
                [toKey]: build.slots?.[fromKey] ?? null,
                [fromKey]: build.slots?.[toKey] ?? null
            }
        }
        : build));
}

export async function setBuildSlot(actor, buildId, slotKey, itemId) {
    if (!BUILD_SLOT_KEYS.includes(slotKey)) return;

    await saveBuilds(actor, getBuilds(actor).map(build =>
        build.id === buildId
            ? { ...build, slots: { ...build.slots, [slotKey]: itemId ?? null } }
            : build));
}

/**
 * A build's slots resolved against the actor, ready for a template.
 *
 * An id that no longer resolves comes back as `missing`, not as empty: the
 * difference between "you never filled this" and "the sword you put here has
 * been sold" is the whole reason anyone would look at an old build, and
 * silently blanking the slot would erase the only evidence of it. The id is kept
 * in the flag too, so re-importing the item restores the slot rather than
 * needing it dragged back.
 */
export function resolveSlots(actor, build, slotDefinitions, drift = null) {
    return slotDefinitions.map(definition => {
        const itemId = build?.slots?.[definition.key] ?? null;
        const item = itemId ? actor?.items?.get(itemId) : null;

        const rarity = item ? itemRarity(item) : null;

        return {
            ...definition,
            itemId,
            filled: !!item,
            missing: !!itemId && !item,
            name: item?.name ?? null,
            img: item?.img ?? null,
            uuid: item?.uuid ?? null,
            rarity,
            rarityLabel: rarity ? (CONFIG.DND5E?.itemRarity?.[rarity] ?? null) : null,
            // `attuned` is the boolean the sheet ticks; `attunement` says whether
            // the item asks for it at all. Both are needed: an attunement-
            // requiring item that is NOT attuned is the interesting case, because
            // it is the one that will not work when the build is worn.
            attuned: !!item?.system?.attuned,
            needsAttunement: item?.system?.attunement === 'required',
            // This build is the one being worn and THIS item is not on the
            // character. Passed in rather than looked up, because the marking is
            // only meaningful for the worn build — every slot of every other
            // build would be "not equipped" and the mark would mean nothing.
            drifted: !!itemId && !!drift?.notEquipped?.has(itemId)
        };
    });
}

/**
 * What a build spends of the character's attunement allowance.
 *
 * Counted over the build's own slots rather than over the actor: the question is
 * "would this set of gear fit inside three", and items attuned elsewhere on the
 * sheet are not part of this set. `max` comes from the actor because a world can
 * change it, and falls back to the rules' three.
 *
 * `unattuned` is the count that REQUIRE attunement and have not got it. That is
 * the number worth surfacing — a build can be legal on the count and still have
 * three items in it that do nothing.
 */
export function attunementSummary(actor, slots) {
    const filled = slots.filter(slot => slot.filled);

    return {
        used: filled.filter(slot => slot.attuned).length,
        max: Number(actor?.system?.attributes?.attunement?.max ?? 3),
        unattuned: filled.filter(slot => slot.needsAttunement && !slot.attuned).length
    };
}

/* ==========================================================================
   SPELL PREPARATION

   The caster's half of a build. Gear answers "what would I wear"; this answers
   "what would I have prepared", which is the same shape of question — a daily
   choice against a hard limit the sheet knows and never totals for you.

   What is deliberately NOT modelled: which spell goes in which slot. In 5e you
   prepare a LIST and then cast any prepared spell with any slot of sufficient
   level. A grid of level-1 and level-2 boxes to drag spells into would look
   right and invent a rule the game does not have — the same mistake as making
   Both Hands lock Main and Off. The slot pyramid below is a readout, not a set
   of containers.
   ========================================================================== */

/**
 * The spellcasting classes that actually PREPARE, with their limits.
 *
 * dnd5e computes `preparation.max` from each class's own formula and counts
 * `preparation.value` by walking the spells that answer `countsPrepared` — so
 * cantrips and always-prepared spells are excluded without this module knowing
 * the rule. Nothing here re-derives "ability modifier plus level"; that is a
 * rule with a decade of exceptions and the system already owns it.
 *
 * A class with no preparation maximum is a KNOWN caster — a sorcerer, a bard, a
 * warlock — and gets no section rather than an empty one. Their spell list is
 * not a daily choice, so there is nothing here for them to plan.
 */
export function getPreparingClasses(actor) {
    return Object.entries(actor?.spellcastingClasses ?? {})
        .map(([id, cls]) => ({
            id,
            name: cls?.name ?? id,
            max: Number(cls?.system?.spellcasting?.preparation?.max ?? 0)
        }))
        .filter(cls => cls.max > 0);
}

/**
 * The character's spell slots, as a readout: ALL NINE RANKS, always.
 *
 * Nine and not "the ones they have", because the grid it fills is a fixed three
 * by three — the same argument as the prepared column beside it. A rank they
 * cannot cast yet is drawn dimmed rather than dropped, so the shape stays
 * learnable and the empty corner says what levelling up will buy. Filtering to
 * `max > 0` made the block a different shape at every level and told you nothing
 * about the ranks it left out.
 *
 * Purely informational. A prepared spell is not tied to a particular slot in
 * this game, so there is nothing here for a build to change.
 *
 * A warlock's pact slots are deliberately not among them. They are not one of
 * the nine ranks, a warlock does not prepare, and the one character who would
 * see both — a warlock/cleric — reads their pact magic off the sheet where it
 * has always lived.
 */
export function getSpellSlots(actor) {
    const spells = actor?.system?.spells ?? {};

    return Array.from({ length: 9 }, (_, index) => {
        const level = index + 1;
        const slot = spells[`spell${level}`];
        const max = Number(slot?.max ?? 0);

        return {
            level,
            label: `${level}${ORDINALS[level] ?? 'th'}`,
            value: Number(slot?.value ?? 0),
            max,
            has: max > 0
        };
    });
}

/** Suffixes for the slot readout's rank labels. */
const ORDINALS = { 1: 'st', 2: 'nd', 3: 'rd', 4: 'th', 5: 'th', 6: 'th', 7: 'th', 8: 'th', 9: 'th' };

/**
 * THE PREPARED COLUMN: twenty-six cells, two across, down the side of the doll.
 *
 * The one number both halves of this window are built from, and its shape came
 * from the layout rather than from taste. A cell is half a gear slot, so two of
 * them stack into exactly one body row and the column keeps the doll's
 * gridlines all the way down; thirteen rows is what that leaves beside a
 * six-row body and the weapons under it. Hence 26, and not a rounder number.
 *
 * A caster's, and only a caster's. It briefly held carried consumables for
 * everybody else, which was the one thing in this window that applying could
 * not enforce — dnd5e has no carried state to set, so those cells looked exactly
 * like the ones around them and did nothing. A martial's build is the doll.
 */
export const PACK_GRID_SIZE = 26;

/**
 * How many spells this character may have prepared, across every class at once.
 *
 * Summed rather than listed per class, because preparation in 5e is a flag on
 * the SPELL rather than a property of the class that granted it. A wizard/cleric
 * prepares one list; two grids with two counts would have drawn a rule the game
 * does not have, which is the same mistake as making Both Hands lock Main and
 * Off.
 */
function preparedLimit(actor) {
    return getPreparingClasses(actor).reduce((total, cls) => total + cls.max, 0);
}

/**
 * The prepared list, as twenty-six cells.
 *
 * The cells past the limit are `beyond`, drawn dimmed and refusing drops: they
 * are not empty slots, they are slots this character does not have YET, and
 * showing them is how the column says what levelling up will buy. An id that no
 * longer resolves is reported `missing`, exactly as a gear slot is.
 */
export function resolvePreparedSpells(actor, build, drift = null) {
    const stored = Array.isArray(build?.spells) ? build.spells : [];
    const limit = preparedLimit(actor);

    return Array.from({ length: PACK_GRID_SIZE }, (_, index) => {
        const itemId = typeof stored[index] === 'string' ? stored[index] : null;
        const item = itemId ? actor?.items?.get(itemId) : null;

        return {
            index,
            // Slotted here, but not prepared on the sheet. See resolveSlots().
            drifted: !!itemId && !!drift?.notPrepared?.has(itemId),
            // What a person counts from. `index` addresses the cell and this is
            // the same cell said out loud — the two are never interchangeable
            // and keeping both is cheaper than remembering which is which.
            position: index + 1,
            itemId,
            beyond: index >= limit,
            filled: !!item,
            missing: !!itemId && !item,
            name: item?.name ?? null,
            img: item?.img ?? null,
            // The system's own item card hangs off a uuid, exactly as it does
            // on a gear slot. Without it a prepared spell was the one filled
            // thing in this window you could not hover to read.
            uuid: item?.uuid ?? null,
            level: item?.system?.level ?? null,
            // Marked, not counted. Preparing six concentration spells is legal —
            // you simply cannot run two at once — so this is a fact about each
            // spell rather than a limit the build can exceed, and totalling it
            // would imply a constraint the game does not have.
            concentration: !!(item?.system?.properties?.has?.('concentration')
                ?? item?.system?.duration?.concentration)
        };
    });
}

/** Put a spell in one prepared cell, or empty it with a null itemId. */
export async function setBuildSpell(actor, buildId, index, itemId) {
    const position = Number(index);
    if (!Number.isInteger(position) || position < 0) return;
    if (position >= PACK_GRID_SIZE) return;

    await saveBuilds(actor, getBuilds(actor).map(build => {
        if (build.id !== buildId) return build;

        const list = [...(build.spells ?? [])];
        // Padded rather than assigned past the end, so the array never comes
        // back with holes that read as `undefined` instead of as empty.
        while (list.length <= position) list.push(null);
        list[position] = itemId ?? null;

        return { ...build, spells: list };
    }));
}

/**
 * Why this item cannot go in this slot, or null if it can.
 *
 * A slot with no `accepts` falls back to `gear`, so the universal
 * nothing-non-physical rule applies everywhere without being written sixteen
 * times.
 */
export function refuseSlotDrop(slotKey, item) {
    if (!item) return null;

    // The first definition wins, and every duplicate key across the two layouts
    // carries the same rule — a sheath is a sheath in either doll.
    const definition = ALL_SLOT_DEFINITIONS.find(slot => slot.key === slotKey);
    if (!definition) return null;

    const rule = SLOT_RULES[definition.accepts ?? 'gear'];
    return rule.test(item) ? null : rule.refusal(item);
}

/** Set or clear one of a build's image paths. */
export async function setBuildImage(actor, buildId, key, path) {
    if (!BUILD_IMAGE_KEYS.includes(key)) return;

    await saveBuilds(actor, getBuilds(actor).map(build =>
        build.id === buildId
            ? { ...build, images: { ...build.images, [key]: path || null } }
            : build));
}

/**
 * What putting a build on sounds like, when it does not say.
 *
 * Shipped with the module rather than pointed at Foundry's or Blacksmith's
 * libraries, so it is there on a fresh install and cannot be moved out from
 * under a build by somebody tidying a shared folder.
 */
export const DEFAULT_BUILD_SOUND = `modules/${MODULE.ID}/assets/sounds/build-changeoutfit.mp3`;

/**
 * THE CHARACTER'S FULL-BODY IMAGE — a third picture beside the portrait and the
 * token, on the ACTOR rather than on any one build.
 *
 * A portrait is a face and a token is a piece seen from above. Neither is what a
 * character looks like standing there, which is the picture a paper doll wants
 * behind it and the one a party roster or a chat card would want too. dnd5e has
 * no field for it, so it lives in a module flag.
 *
 * Deliberately readable from outside: it is a plain path under a documented flag
 * key, so anything else in the suite can show it without asking Squire. That is
 * the whole reason it is on the actor rather than staying the build-only picture
 * it started as.
 *
 * NOT the same field as a build's `images.main`, though they hold the same kind
 * of picture. `main` is what THIS BUILD looks like and lives on the build;
 * `fullbody` is what the CHARACTER looks like and lives on the actor. A build's
 * unset `main` falls back to it, and "Update Prototype Token" pushes a costume's
 * `main` up into it — the same relationship the portrait and token already have.
 */
const FULLBODY_FLAG = 'fullbody';

/** The character's standing figure, or null. */
export function getFullBodyImage(actor) {
    const stored = actor?.getFlag(MODULE.ID, FULLBODY_FLAG);
    return typeof stored === 'string' && stored ? stored : null;
}

/** Set it, or clear it with null. */
export async function setFullBodyImage(actor, path) {
    await actor?.setFlag(MODULE.ID, FULLBODY_FLAG, path || null);
}

/** Where the character's own, pre-build portrait and token are kept. */
const DEFAULT_IMAGES_FLAG = 'defaultImages';

/**
 * Remember the character's own portrait and token, once and for good.
 *
 * Applying a build will overwrite `actor.img` and the prototype token's texture.
 * The moment it does, the character's real artwork is gone — the actor no longer
 * holds it anywhere, and a second apply would then "restore" to whatever the
 * first one set. So it is captured HERE, the first time a build window opens
 * against this actor, which is the earliest moment it can be and comfortably
 * before anything is able to overwrite it.
 *
 * Idempotent by design: it writes only when the flag is absent, so it can be
 * called from as many places as is convenient and can never record a value a
 * build has already polluted. That guard is the whole feature — a capture that
 * ran twice would be worse than none, because the second run would look like a
 * success while recording a costume as the face.
 *
 * A module flag, so nothing on the sheet itself is touched.
 */
/**
 * Write the character's CURRENT artwork over the captured defaults.
 *
 * The capture above happens once and is then trusted forever, which is right for
 * what it is for — a costume overwrites `actor.img`, and a record that followed
 * it would stop being a record of anything. What it cannot survive is the file
 * moving: the flag then holds a path to nothing, every unset image slot falls
 * back to it, and the character appears to have a broken portrait they never
 * chose.
 *
 * There is no cheap way to notice that from here — knowing whether a path still
 * resolves means an async browse per render — so the repair is a deliberate one
 * the player asks for, from the rail's menu.
 *
 * It reads what the character has on RIGHT NOW, so it is only correct while they
 * are wearing their own face. The confirmation says so, because the one way to
 * get this wrong is to press it in the middle of a costume and record the
 * costume as the original.
 */
export async function recaptureDefaultImages(actor) {
    if (!actor) return null;

    const captured = {
        portrait: actor.img ?? null,
        token: actor.prototypeToken?.texture?.src ?? null,
        // Read from the sheet, so there is no build image to read and no costume
        // this came from. Both are cleared rather than left standing: a stale
        // sourceId would keep a Default badge on a costume that no longer has
        // anything to do with the answer.
        main: null,
        sourceId: null
    };

    await actor.setFlag(MODULE.ID, DEFAULT_IMAGES_FLAG, captured);
    return captured;
}

export async function captureDefaultImages(actor) {
    if (!actor || actor.getFlag(MODULE.ID, DEFAULT_IMAGES_FLAG)) return;

    await actor.setFlag(MODULE.ID, DEFAULT_IMAGES_FLAG, {
        portrait: actor.img ?? null,
        token: actor.prototypeToken?.texture?.src ?? null
    });
}

/**
 * THE DEFAULT ARTWORK: what this character looks like when nothing says otherwise.
 *
 * It starts as their own artwork, captured before any build could touch it, and
 * it is the fallback behind every unset image slot in every build. A build that
 * sets no portrait shows this one, and equipping it changes no portrait.
 *
 * It is not frozen. `adoptCostumeAsDefault` writes a costume over it, which is
 * the point of that action — "this is what they actually look like now" has to
 * be sayable, or the answer stays whatever they happened to look like the first
 * time this window opened. The way back to their real face is the Default
 * Costume build, which is a thing a player can see and click, rather than a flag
 * nobody can point at.
 *
 * THREE images, not two. `main` has no actor field to live in — it is the
 * picture at the centre of the doll — so the flag is the only place it can be
 * remembered, and leaving it out would mean a new build fell back to the adopted
 * portrait for its face while the costume it came from showed something else.
 *
 * `sourceId` is the build the current default was taken from, or null when it
 * was read off the sheet. It exists so the rail can say which one is the
 * default; nothing resolves through it.
 *
 * Falls back to what the actor currently shows when nothing has been captured —
 * correct precisely because nothing has been applied in that case, so current
 * and original are the same thing.
 */
export function getDefaultImages(actor) {
    const stored = actor?.getFlag(MODULE.ID, DEFAULT_IMAGES_FLAG);

    return {
        portrait: stored?.portrait ?? actor?.img ?? null,
        token: stored?.token ?? actor?.prototypeToken?.texture?.src ?? null,
        main: stored?.main ?? null,
        sourceId: stored?.sourceId ?? null
    };
}

/**
 * The image slots resolved for display.
 *
 * A slot the build has not set falls back to the character's OWN artwork rather
 * than to whatever the actor is showing right now — see getDefaultImages. Once a
 * build can be applied those two stop being the same thing, and an unset slot
 * showing the previous build's costume would be showing the wrong answer to
 * "what does this build change".
 *
 * `isDefault` marks the difference between "this build changes nothing here" and
 * "this build sets it to exactly what it already is". Only the second should
 * survive being applied.
 */
/**
 * The picture at the centre of the doll.
 *
 * Falls back through the build's own portrait to the character's captured
 * artwork — never to `actor.img`. That distinction is the whole point: a costume
 * applied a moment ago has already changed `actor.img`, and a centre image that
 * followed it would be the one thing on this window that moves when the outfit
 * does. The captured default cannot move, so neither can this.
 */
export function resolveMainImage(actor, build) {
    const chosen = build?.images?.main ?? null;
    const portrait = build?.images?.portrait ?? null;
    const defaults = getDefaultImages(actor);

    return {
        key: 'main',
        label: 'Build Image',
        // Most specific first. The build's own choice, then its portrait, then
        // the CHARACTER's full-body picture — which is the right answer for a
        // build that never set one, because it is what this character looks like
        // standing there — then the default's main, then a face as the last
        // resort. Every step down is a broader answer to the same question.
        path: chosen ?? portrait ?? getFullBodyImage(actor) ?? defaults.main ?? defaults.portrait,
        isDefault: !chosen
    };
}

export function resolveImageSlots(actor, build) {
    const fallbacks = getDefaultImages(actor);

    return BUILD_IMAGE_SLOTS.map(definition => {
        const chosen = build?.images?.[definition.key] ?? null;
        return {
            ...definition,
            path: chosen ?? fallbacks[definition.key],
            isDefault: !chosen
        };
    });
}

/* ==========================================================================
   WHAT A BUILD ADDS UP TO
   ========================================================================== */

/**
 * An ESTIMATED armour class for the gear in a build.
 *
 * Estimated, and labelled that way everywhere it is shown, because a character's
 * real AC is the sum of things this cannot see: Unarmoured Defence, a Defence
 * fighting style, a ring or cloak that grants a bonus through an active effect,
 * a subclass feature, temporary buffs. What this does see is the armour and the
 * shield in the build, plus Dexterity, which is what actually changes when you
 * swap one breastplate for another — and comparing two builds is the question
 * being asked.
 *
 * `system.armor.value` already has any magical bonus folded in: dnd5e adds it
 * during data preparation, so a +1 breastplate reports 15 rather than 14.
 * `system.armor.dex` is the cap on the Dexterity contribution — 0 for heavy
 * armour, null for none at all.
 *
 * Returns `{ value, hasArmor, hasShield }`, never null: an unarmoured character
 * still has an AC and 10 + Dex is the right answer for one.
 */
export function estimateArmorClass(actor, build) {
    const dexMod = Number(actor?.system?.abilities?.dex?.mod ?? 0);
    const items = Object.values(build?.slots ?? {})
        .map(id => (id ? actor?.items?.get(id) : null))
        .filter(Boolean);

    const armorTypes = ['light', 'medium', 'heavy'];
    const worn = items.find(item =>
        item.type === 'equipment' && armorTypes.includes(item.system?.type?.value));
    const shield = items.find(item =>
        item.type === 'equipment' && item.system?.type?.value === 'shield');

    let value;
    if (worn) {
        // `dex` is the cap, not the bonus. Null means uncapped (light armour),
        // 0 means none at all (heavy).
        const cap = worn.system?.armor?.dex;
        const dexPart = cap === null || cap === undefined ? dexMod : Math.min(dexMod, Number(cap));
        value = Number(worn.system?.armor?.value ?? 10) + dexPart;
    } else {
        value = 10 + dexMod;
    }

    if (shield) value += Number(shield.system?.armor?.value ?? 0);

    return { value, hasArmor: !!worn, hasShield: !!shield };
}

/**
 * Everything a build totals up to, for the tile and the footer.
 *
 * One pass so the tray tile and the window cannot disagree about the same build.
 */
export function buildSummary(actor, build) {
    // Every key, not just the ones this character's layout draws: the totals are
    // about what the build HOLDS, and a weapon parked in a slot the current doll
    // does not show still weighs something and still needs attuning.
    const slots = resolveSlots(actor, build, ALL_SLOT_DEFINITIONS);

    const spellCount = (build?.spells ?? []).filter(Boolean).length;


    return {
        armorClass: estimateArmorClass(actor, build),
        attunement: attunementSummary(actor, slots),
        weight: gearWeight(actor, build),
        gearCount: slots.filter(slot => slot.filled).length,
        gearMax: BUILD_SLOT_KEYS.length,
        missingCount: slots.filter(slot => slot.missing).length,
        spellCount
    };
}

/* ==========================================================================
   APPLYING A BUILD

   The one thing in this file that writes to the character. Everything above
   records an intention; this is where the intention is carried out, and it is
   deliberately the only place, invoked only from an explicit action that asks
   first.
   ========================================================================== */

/**
 * Equip the build's gear, prepare its spells, and set its artwork.
 *
 * Three rules, each chosen so that applying the same build twice is a no-op and
 * applying a different one afterwards is a clean swap:
 *
 *   * Gear in the build is equipped; every other equippable item is UNEQUIPPED.
 *     A build is a complete statement of what is worn, not a set of additions —
 *     otherwise applying a light kit over a heavy one leaves you in both.
 *   * Spells in the build are prepared; every other spell that counts against a
 *     preparation limit is unprepared. Same reasoning. Cantrips and
 *     always-prepared spells are untouched, because `countsPrepared` says they
 *     are not part of the daily choice.
 *   * Portrait and token are written only where the BUILD set them. A slot
 *     showing the character's own face means "this build does not change it",
 *     which is not the same as "set it to that", and only the second should
 *     write. See resolveImageSlots.
 *
 * Attunement is deliberately NOT touched. Attuning is a short rest and a
 * fiction-level decision, not a consequence of putting a ring on, and silently
 * attuning six items would be the module making a call that belongs to the
 * table.
 *
 * Returns a count of what actually changed, so the caller can report a result
 * rather than a shrug.
 */
/**
 * Can a build DECIDE whether this spell is prepared?
 *
 * Not the same question as `system.countsPrepared`, and the difference is the
 * whole of a bug. dnd5e's getter is:
 *
 *     get countsPrepared() {
 *       return !!CONFIG.DND5E.spellcasting[this.method]?.prepares
 *         && (this.level > 0)
 *         && (this.prepared === CONFIG.DND5E.spellPreparationStates.prepared.value);
 *     }
 *
 * That last clause makes it "IS currently prepared, and so counts against the
 * limit" — a fact about the spell's state, not about whether the state is ours
 * to set. Reading it as "preparable" meant `applyBuild` skipped every spell that
 * was not already prepared, so equipping a build could only ever UNPREPARE. A
 * build naming six spells the character had not prepared changed nothing, and
 * the window went on showing all six as drifted because they genuinely were.
 *
 * This is that getter with the state clause dropped and always-prepared put back
 * explicitly. A domain or subclass spell is granted rather than chosen; nothing
 * here should be able to take it away, and the getter excluded it for free only
 * because 2 is not 1.
 *
 * Everywhere else in this file that asks `countsPrepared` means the state and is
 * right to ask it — the import reads what a character HAS prepared, and drift
 * compares against it.
 */
function canBuildPrepare(item) {
    if (item?.type !== 'spell') return false;

    // Cantrips are always available and never chosen, which is why they are not
    // in this window at all.
    if (!(Number(item.system?.level) > 0)) return false;

    // 2 is always-prepared: granted by a class feature, not a choice.
    if (Number(item.system?.prepared) === 2) return false;

    return !!CONFIG.DND5E?.spellcasting?.[item.system?.method]?.prepares;
}

/**
 * The sound of putting this on.
 *
 * Broadcast, not local. Everyone at the table hears a character change kit for
 * the same reason everyone sees the token repaint — it is a thing that happened
 * in the scene, not a thing that happened in one person's interface. That is
 * also why it is here rather than in the window: applying from the tray handle
 * with the builder shut is still the character changing.
 *
 * Failure is swallowed. A missing file is a wrong path in one build, and it must
 * not stop the gear being equipped — the sound is the flourish, not the act.
 */
function playBuildSound(build) {
    // Read straight off the module rather than importing helpers.js, which
    // already imports THIS file — the cycle would work in ESM right up until the
    // day it did not, and a failed module evaluation is cached for the session.
    // It is a one-line lookup; the import is not worth the coupling.
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith?.utils?.playSound) return;

    const sound = build?.sound ?? DEFAULT_BUILD_SOUND;

    try {
        // NORMAL (0.5), not the SOFT (0.3) every other sound in this module
        // uses. Those are interface sounds — a click acknowledging your own
        // action, deliberately quiet. This one is broadcast to the whole table
        // to announce something that happened in the scene, which is a different
        // job: at 0.3, across five clients with their own volume sliders in
        // play, it does not land. The fallback matches rather than being louder
        // than the constant it stands in for.
        blacksmith.utils.playSound(sound, blacksmith.BLACKSMITH?.SOUNDVOLUMENORMAL ?? 0.5, false, true);
    } catch (error) {
        console.warn('Coffee Pub Squire | Could not play the build sound:', { sound, error });
    }
}

export async function applyBuild(actor, build) {
    if (!actor || !build) return null;

    // Everything needed to put it back, captured before the first write. Held by
    // the caller in memory rather than in a flag: undo is a right-now offer on a
    // toast, not a history the world should carry around.
    const undo = {
        items: [],
        img: actor.img,
        token: actor.prototypeToken?.texture?.src ?? null,
        // Read whether or not this build touches them, because undo has to be
        // able to put back what was there and cannot know that until after.
        geometry: {
            width: actor.prototypeToken?.width ?? null,
            height: actor.prototypeToken?.height ?? null,
            'texture.fit': actor.prototypeToken?.texture?.fit ?? null,
            'texture.scaleX': actor.prototypeToken?.texture?.scaleX ?? null,
            'texture.scaleY': actor.prototypeToken?.texture?.scaleY ?? null
        }
    };

    // A costume changes only how the character looks. Its gear slots are left
    // strictly alone — not applied as "equip nothing", which would strip the
    // character bare, and is the opposite of what dressing up means.
    const costume = build.mode === 'costume';

    const gearIds = new Set(Object.values(build.slots ?? {}).filter(Boolean));

    // THE LIST IS THE PLAN. A build with spells in its prepared column prepares
    // exactly those and unprepares everything else; a build with an empty column
    // does not touch a single spell.
    //
    // Derived from the list rather than from a switch beside it. There WAS a
    // switch — "Prep" — and it existed to stop a gear-only build unpreparing a
    // caster's whole list on the way past. It never earned that: a gear-only
    // build has an empty column, so the empty list already says everything the
    // switch was saying. What it cost was a second thing to get right, in a
    // window where the column and the switch could disagree and only one of them
    // was visible on the doll.
    //
    // The one case this cannot express is a build that deliberately prepares
    // NOTHING and enforces it. Nobody prepares zero spells on purpose.
    const plannedSpells = (build.spells ?? []).filter(Boolean);
    const touchesSpells = !costume && plannedSpells.length > 0;
    const spellIds = new Set(plannedSpells);

    const updates = [];
    let equipped = 0;
    let unequipped = 0;
    let prepared = 0;
    let unprepared = 0;

    for (const item of costume ? [] : actor.items) {
        // Equippable is "has an equipped flag at all" — that is dnd5e's own way
        // of saying the question applies to this item.
        // Never planned, so never stripped. A natural weapon is a fact about
        // the creature; a container is where things live. Both carry an
        // `equipped` flag like anything else, and no build names either — the
        // importer refuses to spend a slot on them — so without this, applying
        // any build would turn off a character's claws and take their backpack
        // off their back.
        if (isUnplannable(item)) continue;

        if (item.system?.equipped !== undefined) {
            const shouldEquip = gearIds.has(item.id);
            if (!!item.system.equipped !== shouldEquip) {
                updates.push({ _id: item.id, 'system.equipped': shouldEquip });
                undo.items.push({ _id: item.id, 'system.equipped': !!item.system.equipped });
                shouldEquip ? equipped++ : unequipped++;
            }
        }

        if (touchesSpells && canBuildPrepare(item)) {
            const shouldPrepare = spellIds.has(item.id);
            // dnd5e models `prepared` as a number: 0 unprepared, 1 prepared,
            // 2 always prepared. Only 0 and 1 are ours to set, and 2 never
            // reaches here — see canBuildPrepare.
            const isPrepared = Number(item.system.prepared) > 0;
            if (isPrepared !== shouldPrepare) {
                updates.push({ _id: item.id, 'system.prepared': shouldPrepare ? 1 : 0 });
                undo.items.push({ _id: item.id, 'system.prepared': Number(item.system.prepared) || 0 });
                shouldPrepare ? prepared++ : unprepared++;
            }
        }
    }

    // One write for every item rather than one per item: sixteen separate
    // updates would each re-render the sheet and every panel watching it.
    if (updates.length) await actor.updateEmbeddedDocuments('Item', updates);

    // After the gear moves, so the sound reports something that happened rather
    // than something about to. Not awaited: it is a flourish, and the artwork
    // below should not queue behind an audio file loading.
    playBuildSound(build);

    // Portrait and token are written SEPARATELY, and the result of each is read
    // back rather than assumed.
    //
    // They were one `actor.update()` carrying both keys, and when the portrait
    // stopped changing there was no way to tell from the outside whether the
    // write had been rejected, whether the path was empty, or whether the update
    // had run at all — the canvas token repaints through its own call below, so
    // a silent failure here still looked half-successful. Two writes and a
    // verified read cost one extra round trip and make the failure legible.
    const images = { portrait: false, token: false };

    if (build.images?.portrait && build.images.portrait !== actor.img) {
        await actor.update({ img: build.images.portrait });
        images.portrait = actor.img === build.images.portrait;
        if (!images.portrait) {
            console.error('Coffee Pub Squire | The portrait did not take:',
                { wanted: build.images.portrait, actual: actor.img });
        }
    }

    if (build.images?.token && build.images.token !== actor.prototypeToken?.texture?.src) {
        await actor.update({ 'prototypeToken.texture.src': build.images.token });
        images.token = actor.prototypeToken?.texture?.src === build.images.token;
    }

    // How the token is DRAWN, from a costume only. A build is gear, and gear
    // does not decide how many squares a character stands in.
    const geometry = costume ? tokenGeometryUpdate(build) : {};
    if (Object.keys(geometry).length) {
        await actor.update(Object.fromEntries(
            Object.entries(geometry).map(([key, value]) => [`prototypeToken.${key}`, value])));
    }

    // One canvas write carrying the artwork and the geometry together, rather
    // than one for each: they describe the same token and a player watching it
    // should see it change once.
    const canvasChanges = { ...geometry };
    if (build.images?.token) canvasChanges['texture.src'] = build.images.token;
    const tokensChanged = await applyTokenChanges(actor, canvasChanges);

    return {
        geometryChanged: Object.keys(geometry).length,
        equipped,
        unequipped,
        prepared,
        unprepared,
        imagesChanged: (images.portrait ? 1 : 0) + (images.token ? 1 : 0),
        images,
        tokensChanged,
        undo
    };
}

/**
 * A costume's three pictures, as they would actually be seen.
 *
 * RESOLVED, not raw: a slot the costume leaves unset resolves to the current
 * default, which is the honest answer to "what does wearing this look like" —
 * an unset portrait means the character keeps the one they have. That also
 * makes the value stable to compare against later, which is what the Default
 * badge needs.
 */
function resolvedArtwork(actor, build) {
    const slots = resolveImageSlots(actor, build);
    return {
        portrait: slots.find(slot => slot.key === 'portrait')?.path ?? null,
        token: slots.find(slot => slot.key === 'token')?.path ?? null,
        main: resolveMainImage(actor, build).path ?? null
    };
}

/**
 * Write a costume's look onto the character's PROTOTYPE TOKEN, without wearing it.
 *
 * The prototype token is the stamp for tokens made LATER, so this decides what
 * this character will look like the next time one is dropped on a scene, and
 * leaves the ones already standing on the map exactly as they are. Applying the
 * costume is the other action: that changes what they look like NOW, repaints
 * every token of theirs on the canvas, and offers an undo.
 *
 * NOT the same thing as setting the default artwork, which is the entry below
 * it in the menu. That one is about this TOOL — what a new build or costume
 * starts out with — and touches nothing Foundry can see. This one is about the
 * ACTOR, and touches nothing about how the builder behaves. Keeping them
 * separate is the point: adopting a face for the next scene's token and deciding
 * what your next costume starts from are two unrelated intentions.
 *
 * TWO IMAGES, and nothing else. The costume's size, fit and scale are NOT
 * written, even though they live on the prototype token and it would be tidy to
 * carry them along. Changing how big somebody's token is drawn is a different
 * decision from changing what it is a picture of, and this action asks about the
 * second — an entry called "update prototype token" quietly resizing every
 * future token is a surprise, and the way to set that deliberately is to wear
 * the costume or edit the token itself.
 *
 * Writes only what the costume actually sets. An unset image means "no change"
 * here exactly as it does everywhere else.
 */
export async function adoptCostumeAsDefault(actor, build) {
    if (!actor || !build || build.mode !== 'costume') return null;

    const update = {};
    if (build.images?.portrait) update.img = build.images.portrait;
    if (build.images?.token) update['prototypeToken.texture.src'] = build.images.token;

    // The third picture, alongside the other two. A costume that set a standing
    // figure is describing what this character looks like as much as its face
    // is, and adopting two of the three would leave the character half dressed
    // in a way nothing on screen would explain.
    //
    // A separate write because it is a module flag rather than an actor field —
    // there is nowhere in dnd5e to put it. See FULLBODY_FLAG.
    const fullbody = build.images?.main ?? null;

    if (!Object.keys(update).length && !fullbody) return null;

    if (Object.keys(update).length) await actor.update(update);
    if (fullbody) await setFullBodyImage(actor, fullbody);

    return {
        portrait: !!update.img,
        token: !!update['prototypeToken.texture.src'],
        fullbody: !!fullbody
    };
}

/**
 * Fill a COSTUME from what the character looks like right now.
 *
 * The costume half of "Fill From Currently Equipped". A build's version walks
 * the gear and has to ask where each piece goes; a costume has no gear, so this
 * is a snapshot and needs no mapping window and no questions.
 *
 * Takes the token's geometry along with the pictures, which the gear import has
 * no equivalent of: a costume that recorded a face but not the size it was drawn
 * at would put a large character back at 1x1 the moment it was worn.
 *
 * The FULL-BODY image falls back to the portrait. A character who has never had
 * one set would otherwise get a costume with an empty middle, and a face is a
 * true-if-incomplete answer to "what do they look like" where blank is no
 * answer at all.
 */
export async function pullCostumeFromSheet(actor, buildId) {
    const build = getBuild(actor, buildId);
    if (!actor || !build || build.mode !== 'costume') return null;

    const images = {
        portrait: actor.img ?? null,
        token: actor.prototypeToken?.texture?.src ?? null,
        main: getFullBodyImage(actor) ?? actor.img ?? null
    };

    await saveBuilds(actor, getBuilds(actor).map(entry => entry.id === buildId
        ? {
            ...entry,
            images: { ...entry.images, ...images },
            token: {
                width: Number(actor.prototypeToken?.width) || 1,
                height: Number(actor.prototypeToken?.height) || 1,
                fit: actor.prototypeToken?.texture?.fit ?? null,
                scale: Number(actor.prototypeToken?.texture?.scaleX) || 1
            }
        }
        : entry));

    return {
        ...images,
        // Said out loud, because "your full-body picture is your portrait" is a
        // thing the player should know rather than discover when the doll looks
        // wrong. See the toast in pullSelectedFromSheet.
        usedPortraitForBody: !getFullBodyImage(actor) && !!actor.img
    };
}

/**
 * Make this entry's three pictures the DEFAULT ARTWORK for the builder.
 *
 * Where a new build or costume starts. Every image slot a build leaves unset
 * resolves through the default, so this is the answer they all inherit — make a
 * costume, and its portrait, token and centre picture are already these rather
 * than whatever the character happened to look like the first time this window
 * was opened.
 *
 * IT TOUCHES NOTHING FOUNDRY CAN SEE. Not `actor.img`, not the prototype token,
 * not a token on the canvas. This is a setting for this tool, stored in a module
 * flag, and a player who presses it has said something about their next build
 * rather than about their character. Updating the prototype token is the
 * separate entry above it, and the two are deliberately not wired together.
 *
 * THREE pictures, where the prototype token can only take two: `main` — the
 * picture at the centre of the doll — has no actor field to live in, so the flag
 * is the only place it can be remembered at all, and it is exactly the one a new
 * build most obviously starts from.
 *
 * The values stored are RESOLVED rather than raw, so a slot this entry leaves
 * unset stores the default already in force. "Unset" means "no opinion", and an
 * entry with no opinion about its token should not blank the default's.
 */
export async function setDefaultArtwork(actor, build) {
    if (!actor || !build) return null;

    const artwork = resolvedArtwork(actor, build);
    if (!artwork.portrait && !artwork.token && !artwork.main) return null;

    await actor.setFlag(MODULE.ID, DEFAULT_IMAGES_FLAG, { ...artwork, sourceId: build.id });
    return { ...artwork, sourceId: build.id };
}

/**
 * Is this build the one the default artwork came from, and does it still match?
 *
 * Two facts, for the same reason the worn mark carries two. The default is a
 * SNAPSHOT taken when the button was pressed, so editing that costume's pictures
 * afterwards leaves the badge describing something that is no longer true —
 * and the badge should say so rather than quietly lie.
 *
 * Drifted is not an error and needs no repair prompt. It means "the default came
 * from here and this has moved on since"; pressing the entry again is the fix,
 * and doing nothing is a perfectly good choice.
 */
export function defaultArtworkState(actor, build) {
    const stored = getDefaultImages(actor);
    if (!build || !stored.sourceId || stored.sourceId !== build.id) {
        return { isDefault: false, drifted: false };
    }

    const current = resolvedArtwork(actor, build);
    const drifted = current.portrait !== stored.portrait
        || current.token !== stored.token
        || current.main !== stored.main;

    return { isDefault: true, drifted };
}

/**
 * Push changes onto this actor's tokens already on the canvas.
 *
 * `prototypeToken` is the stamp for tokens made LATER; it does nothing to the
 * ones already standing on the map, which is where everyone is looking. Without
 * this, applying a build changed the portrait and the sidebar and left the
 * figure on the table wearing the old face.
 *
 * Matched on the actor's UUID rather than its id: an unlinked token's synthetic
 * actor shares the base actor's id, so an id check would repaint every token
 * made from the same prototype — a room of identical guards would all change
 * because one of them did.
 */
async function applyTokenChanges(actor, changes) {
    if (!changes || !Object.keys(changes).length) return 0;

    const updates = (canvas?.tokens?.placeables ?? [])
        .filter(token => token.actor?.uuid === actor.uuid)
        // Only what actually differs on THIS token, so a token already the right
        // size is not rewritten and the scene is not touched for nothing.
        .map(token => {
            const diff = Object.entries(changes)
                .filter(([key, value]) => foundry.utils.getProperty(token.document, key) !== value);
            return diff.length ? { _id: token.id, ...Object.fromEntries(diff) } : null;
        })
        .filter(Boolean);

    if (!updates.length) return 0;

    await canvas.scene.updateEmbeddedDocuments('Token', updates);
    return updates.length;
}

/**
 * Put back what applyBuild changed.
 *
 * Takes the record applyBuild handed out rather than recomputing anything: the
 * only correct "before" is the one measured before the writes, and a second
 * derivation would be a guess about a state that no longer exists.
 */
export async function revertBuild(actor, undo) {
    if (!actor || !undo) return;

    if (undo.items?.length) await actor.updateEmbeddedDocuments('Item', undo.items);

    const actorUpdate = {};
    if (undo.img && undo.img !== actor.img) actorUpdate.img = undo.img;
    if (undo.token && undo.token !== actor.prototypeToken?.texture?.src) {
        actorUpdate['prototypeToken.texture.src'] = undo.token;
    }
    // Everything the costume could have changed about how the token is drawn,
    // put back whether or not it did — undo is cheaper to make unconditional
    // than to make conditional on a record of what was written.
    for (const [key, value] of Object.entries(undo.geometry ?? {})) {
        if (value !== null && value !== undefined) actorUpdate[`prototypeToken.${key}`] = value;
    }

    if (Object.keys(actorUpdate).length) await actor.update(actorUpdate);

    const canvasChanges = { ...(undo.geometry ?? {}) };
    if (undo.token) canvasChanges['texture.src'] = undo.token;
    await applyTokenChanges(actor, canvasChanges);
}

/**
 * What the build's numbers WOULD be with one slot changed.
 *
 * Used while an item is hovering over a slot, before any drop has happened, so
 * the window can show the consequence of a swap while there is still time to
 * think better of it. Nothing is written: the build is copied, the slot is
 * changed in the copy, and the copy is measured.
 *
 * Pass a null `itemId` to preview emptying the slot.
 */
export function previewSlotChange(actor, build, slotKey, itemId) {
    const hypothetical = {
        ...build,
        slots: { ...build.slots, [slotKey]: itemId ?? null }
    };

    return {
        armorClass: estimateArmorClass(actor, hypothetical).value,
        weight: gearWeight(actor, hypothetical) ?? 0
    };
}

/* ==========================================================================
   BUILDS ON THE HANDLE

   The handle is what stays on screen when the tray is shut, so a build kept
   there is one that can be switched into mid-fight without opening anything.
   A separate list from the builds themselves, and deliberately so: which builds
   are worth a handle slot is a different question from which builds exist, in
   exactly the way the handle's favourites are separate from the favourites
   panel's.
   ========================================================================== */

const HANDLE_BUILDS_FLAG = 'handleBuilds';

/** The build ids on the handle, in their placed order. Ids that no longer name a build are dropped. */
export function getHandleBuildIds(actor) {
    const stored = actor?.getFlag(MODULE.ID, HANDLE_BUILDS_FLAG);
    if (!Array.isArray(stored)) return [];

    const live = new Set(getBuilds(actor).map(build => build.id));
    return stored.filter(id => typeof id === 'string' && live.has(id));
}

/**
 * The handle's builds, resolved for display.
 *
 * Each wears its own picture. It used to borrow the first item in the build,
 * because a build had no artwork of its own — it does now, so the reason is
 * gone. `resolveMainImage` falls back through the build's portrait to the
 * character's own artwork, so there is always a face rather than a row of
 * identical shirts, which was the point of the borrowing in the first place.
 */
/**
 * An item that is not body equipment at all, as against one whose home is merely
 * unknown. Two empty answers, deliberately distinct — Blacksmith's contract
 * calls them `'none'` and `null`.
 *
 *   NOT_GEAR : a potion, a scroll, a natural weapon. Nothing to decide and
 *              nothing to say. Silent.
 *   null     : a wondrous item nobody has a word for, or one whose slot was
 *              taken. Worth naming, because the player can place it by hand.
 *
 * Collapsing them means either nagging about every potion or silently dropping
 * the item somebody actually wanted.
 */
const NOT_GEAR = Symbol('not body equipment');

/**
 * WHERE A LOCATION LANDS ON THIS DOLL.
 *
 * Blacksmith answers LOCATION; this answers SLOT. That line is the whole reason
 * the classifier lives over there — `sheath`, `hip1`, `bothhands` and the rest
 * are positions in this window's layout, and a shared API that knew about them
 * would be a shared API with Squire's opinions baked in. It returns thirteen
 * generic body locations and this table turns them into the twenty-one keys the
 * doll actually has.
 *
 * The `else` chains are OCCUPANCY, which is ours by the same argument: knowing a
 * ring goes on a finger is classification, and knowing this character already
 * has one on is not.
 *
 * `held` is the interesting one. Blacksmith reports grip — main, off, both, or
 * either for a versatile weapon — and never claims a slot is blocked, so a
 * shield says `off` and stops nothing. Every fallback below is this window
 * deciding what to do when its first choice is full.
 */
const LOCATION_SLOTS = {
    head:  ['head'],
    face:  ['face'],
    neck:  ['neck'],
    back:  ['back'],
    chest: ['chest'],
    arms:  ['arms'],
    hands: ['hands'],
    waist: ['waist'],
    feet:  ['feet'],
    ring:  ['ring1', 'ring2'],
    carried: ['hip1', 'hip2'],
    ammunition: ['ammo']
};

/**
 * Where a HELD item lands, by grip. The sheath is reachable from grip alone.
 *
 * `off` is the interesting one, and it leads with the SHEATH. Blacksmith gives
 * that grip to a light weapon and to a shield alike, and for the light weapon it
 * is a dagger: the thing on your belt, not the thing in your other hand. Most
 * characters carry one primary weapon and a sidearm; the off hand is for
 * actually fighting with two, which nothing here can know.
 *
 * A shield gets the same grip and must never reach the sheath — it does not,
 * because the sheath only accepts weapons and the placement now checks that.
 */
const GRIP_SLOTS = {
    both:   ['bothhands', 'mainhand'],
    main:   ['mainhand', 'offhand', 'sheath'],
    off:    ['sheath', 'offhand', 'mainhand'],
    either: ['mainhand', 'offhand', 'sheath']
};

/**
 * Blacksmith's equip-location API, or null if this Blacksmith predates it.
 *
 * Feature-detected rather than imported. Squire already hard-imports the window
 * base class from Blacksmith's bridge, so the dependency is not new — but this
 * particular surface arrived later, and an older Blacksmith should cost the
 * import button rather than the whole module.
 */
function equipLocations() {
    return game.modules.get('coffee-pub-blacksmith')?.api?.equipLocations ?? null;
}

/**
 * Which slots this item could occupy, strongest first — or nothing.
 *
 * A thin map now. It used to be a hundred lines of dnd5e knowledge that Vault,
 * Merchant and Blacksmith's own importer would each have had to write again,
 * differently. What is left is the half that is genuinely this window's: which
 * box a body location corresponds to on this particular doll.
 */
/**
 * A container is where things LIVE, not something a character chose to wear.
 *
 * Blacksmith answers `back` for one, which is a fair general answer — a backpack
 * is worn on the back. This doll declines it anyway, and that is a consumer
 * decision rather than a disagreement: a slot spent on a Fanny Pack of Holding
 * says nothing about how the character fights or what they look like, and the
 * back is one of thirteen places a cloak could have gone.
 *
 * Their CONTENTS need no special handling. An item stowed in a bag is not
 * equipped, so the equipped filter has already excluded it — which is right,
 * because you are not wearing it.
 */
function isContainer(item) {
    return ['container', 'backpack'].includes(item?.type);
}

/**
 * Items a build NEVER names, and must therefore never unequip.
 *
 * The definitive list, in one place, because it has to be the same answer in
 * three: the importer refuses to spend a slot on these, applying refuses to
 * strip them, and drift refuses to count them. Any of the three disagreeing
 * produces a specific bug — a build that takes a character's backpack off, or
 * one that reads as permanently drifted because of their claws.
 *
 * It was written out twice and the two copies had already diverged: siege and
 * improvised weapons were excluded from classification but not from the
 * unequip sweep, so equipping any build would have unequipped a ballista.
 *
 *   NATURAL WEAPONS   claws, bites, unarmed strikes. A fact about the creature.
 *   SIEGE / IMPROVISED a ballista is scenery; a thrown chair is a decision made
 *                     once, in a fight, and never planned.
 *   CONTAINERS        where things live, not something worn. The author's call,
 *                     and the reason a Fanny Pack of Holding does not get a slot.
 *
 * What is deliberately NOT here: everything else a character can equip. A Gem of
 * Brightness has no obvious home and the importer says so rather than hiding it
 * — being unplaceable is not the same as being ignorable.
 */
/**
 * A weapon the character IS rather than one they carry.
 *
 * Claws, bites, slams, unarmed strikes. dnd5e types some of them `natural` and
 * that is the answer where it is given — but the classic `items` pack types
 * Unarmed Strike `simpleM`, exactly like a dagger, so the subtype alone gets it
 * wrong in half the worlds in existence. Same pack-dependence that made the
 * clothing rule wrong: which pack a world draws from decided the answer.
 *
 * The general signal is PHYSICALITY, and it is in the data for every pack:
 *
 *     Dagger          weight 1    price 2
 *     Longsword       weight 3    price 15
 *     Light Hammer    weight 2    price 2
 *     Unarmed Strike  weight 0    price 0
 *
 * A thing you can carry has mass and a thing you can buy has a price. Something
 * with neither is not an object at all, whatever the compendium typed it as.
 * That reads on any weapon in any pack and needs no list of names.
 *
 * It is deliberately NOT `isUnplannable`. An unarmed strike is a real way to
 * fight and belongs in a hand — it is simply the LAST thing that should get one,
 * and it can never be sheathed, because a sheath is storage and there is nothing
 * to store.
 */
export function isInnateWeapon(item) {
    if (item?.type !== 'weapon') return false;
    if (item.system?.type?.value === 'natural') return true;

    const weight = item.system?.weight;
    const price = item.system?.price;
    const mass = Number(weight?.value ?? weight ?? 0);
    const cost = Number(price?.value ?? price ?? 0);

    return mass === 0 && cost === 0;
}

export function isUnplannable(item) {
    if (isContainer(item)) return true;
    // Siege and improvised weapons only. A ballista is scenery and a thrown
    // chair is a decision made once in a fight; neither is ever planned.
    //
    // Natural weapons used to be here and are NOT any more: an unarmed strike is
    // a real way to fight and belongs in a hand. See isInnateWeapon for how it
    // is ranked last instead of hidden.
    return item?.type === 'weapon'
        && ['siege', 'improv'].includes(item?.system?.type?.value);
}

function slotClaim(item) {
    if (isUnplannable(item)) return NOT_GEAR;

    const api = equipLocations();
    if (!api) return null;

    const { location, grip } = api.resolve(item);

    // 'none' — deliberately not body equipment. Silent.
    if (location === 'none') return NOT_GEAR;
    // null — no idea. Named to the player so they can place it by hand.
    if (!location) return null;

    if (location === 'held') {
        const candidates = GRIP_SLOTS[grip] ?? GRIP_SLOTS.main;
        // A fist cannot be sheathed. The sheath is storage — somewhere to put a
        // thing you are not holding — and there is nothing to put.
        return isInnateWeapon(item) ? candidates.filter(key => key !== 'sheath') : candidates;
    }

    return LOCATION_SLOTS[location] ?? null;
}

/**
 * How much this character seems to care about an item, for deciding who wins a
 * contested slot.
 *
 * Placement used to follow whatever order the sheet happened to list things in,
 * which put an Unarmed Strike in the main hand and an Oathbow in the sheath. The
 * classifier is not wrong about either — both are weapons and both can be
 * held — so the question is not "where could this go" but "which of these does
 * this character actually lead with", and that is occupancy: ours.
 *
 * Four signals, in the order they deserve weight:
 *
 *   FAVOURITED, on the character sheet. The strongest signal there is, because
 *   it is the player saying so in their own words rather than us inferring it.
 *   ON THE TRAY HANDLE. The same statement made with a drag: these are the
 *   things they reach for without opening anything.
 *   DAMAGE. What the weapon actually does, averaged from its formula. This is
 *   what separates an Oathbow from an Unarmed Strike when nothing else has an
 *   opinion.
 *   MAGICAL. A tiebreak, and only that — a +1 dagger does not out-rank a
 *   greatsword, but it does out-rank a mundane dagger.
 */
function itemMerit(item, { favorites, handle }) {
    let score = 0;

    if (favorites.has(item.id)) score += 1000;
    if (handle.has(item.id)) score += 500;

    // Average of the damage dice, roughly. `2d6 + 3` is 10; `1` is 1. Good
    // enough to rank weapons against each other, which is all it is for — the
    // window shows the real formula everywhere it matters.
    const formula = item?.system?.damage?.base?.formula;
    if (formula) {
        let average = 0;
        for (const [, count, faces] of String(formula).matchAll(/(\d*)d(\d+)/gi)) {
            average += (Number(count) || 1) * (Number(faces) + 1) / 2;
        }
        for (const [, sign, flat] of String(formula).matchAll(/([+-])\s*(\d+)(?!d)/gi)) {
            average += (sign === '-' ? -1 : 1) * Number(flat);
        }
        score += Math.max(0, average);
    }

    // ARMOUR OUTRANKS A GARMENT for the chest, and by a wide enough margin that
    // no amount of dice can overturn it. A Robe of the Archmagi and a suit of
    // studded leather both claim the chest and a character has one; the armour
    // is the one the window's AC badge is reading, so losing it to a robe on a
    // tie in list order is the worst of the two outcomes. Scaled by its own
    // value so plate beats leather.
    const armor = Number(item?.system?.armor?.value ?? 0);
    if (armor > 0) score += 200 + armor;

    if (item?.system?.rarity && item.system.rarity !== 'common') score += 2;
    if (item?.system?.attuned) score += 2;

    // LAST, always. An unarmed strike is what you use when you have nothing, so
    // it should take a hand only when nothing else wants one — and a negative
    // score no real weapon can reach says that without a special case in the
    // placement loop.
    if (isInnateWeapon(item)) score = -1000;

    return score;
}

/** The sheet's favourited item ids. */
function favoriteIds(actor) {
    const ids = (actor?.system?.favorites ?? [])
        .filter(entry => typeof entry?.id === 'string')
        // dnd5e stores these as relative UUIDs — `.Item.abc123`.
        .map(entry => entry.id.split('.').pop());

    return new Set(ids);
}

/**
 * The importer's PROPOSAL, as a table to be argued with rather than a result.
 *
 * Same classification and the same merit ordering `pullFromSheet` uses — this is
 * that function stopping one step early, before it writes, and handing back what
 * it was about to do.
 *
 * Every equipped item gets a row, including the ones nothing could place. That
 * is the point of it: an item with no obvious home used to be reported after the
 * fact in a list you could not act on, and the honest place for "we do not know
 * where your Gem of Brightness goes" is a dropdown next to the words Gem of
 * Brightness. Unplaceable rows sort FIRST, because they are the decisions that
 * still need making and the rest are already made.
 *
 * `options` is every slot the item could legally occupy, in the order worth
 * trying: what we proposed, then everything else, then nothing. Body slots take
 * anything — see SLOT_RULES and the note about a pair of boots being
 * indistinguishable from a hat — so most items offer most of the doll, and that
 * is correct rather than lazy: the player knows where their circlet goes and we
 * do not.
 */
export function planImport(actor, build) {
    const layout = getDollLayout(actor);
    const slots = [...layout.body, ...layout.big];
    const equipped = (actor?.items ?? []).filter(item => item.system?.equipped && !isUnplannable(item));

    const signals = {
        favorites: favoriteIds(actor),
        handle: new Set(actor?.getFlag?.(MODULE.ID, 'favoriteHandle') ?? [])
    };
    const ranked = [...equipped].sort((a, b) => itemMerit(b, signals) - itemMerit(a, signals));

    // The proposal, run exactly as the importer would run it.
    const taken = new Set();
    const proposed = new Map();

    for (const item of ranked) {
        const claim = slotClaim(item);
        if (!claim || claim === NOT_GEAR) continue;

        // The slot has to exist on this doll, be free, AND accept the item. That
        // last test was missing, so a candidate list could propose something the
        // doll itself would refuse — a shield in the sheath, which shares a grip
        // with a dagger and must never share its home.
        const key = claim.find(candidate => slots.some(slot => slot.key === candidate)
            && !taken.has(candidate)
            && !refuseSlotDrop(candidate, item));
        if (!key) continue;

        taken.add(key);
        proposed.set(item.id, key);
    }

    const api = equipLocations();

    const rows = ranked.map(item => {
        // The classifier's own answer, kept alongside the placement so a row
        // that landed nowhere can say WHICH of the two reasons it was: nothing
        // could name a home for it, or something could and the slot was taken.
        // Guessing between those from the outside is what made an Amulet of
        // Health an unanswerable question three times over.
        const verdict = api?.resolve?.(item) ?? {};

        return {
        id: item.id,
        name: item.name,
        img: item.img,
        uuid: item.uuid,
        slot: proposed.get(item.id) ?? '',
        location: verdict.location ?? null,
        matched: verdict.matched ?? null,
        // Legal homes only. An arrow cannot go in a ring slot and the dropdown
        // should not offer it — the doll refuses that drop already, and an
        // option that cannot be chosen is worse than one that is absent.
        //
        // The sheath goes too for an innate weapon, for the same reason it is
        // not among its candidates: a sheath is somewhere to put a thing you are
        // not holding, and a fist cannot be put anywhere.
        options: slots
            .filter(slot => !refuseSlotDrop(slot.key, item))
            .filter(slot => !(slot.key === 'sheath' && isInnateWeapon(item)))
            .map(slot => ({ key: slot.key, label: slot.label }))
        };
    });

    // Decisions first: anything we could not place, then everything else in
    // merit order, which is the order it was already reasoned about in.
    rows.sort((a, b) => (a.slot ? 1 : 0) - (b.slot ? 1 : 0));

    // Prepared spells, offered to anyone who can prepare them. Two states rather
    // than a slot list, and the limit is a real ceiling the player can exceed
    // here, which is why the window has to say how many they have chosen.
    //
    // It no longer asks whether the build already plans preparation. Taking the
    // list is what makes it plan one — there is nothing to opt into first, and
    // gating the offer on a switch meant the importer silently skipped spells
    // for every build that had not been told in advance to expect them.
    const preparing = canPrepareSpells(actor);
    const limit = preparedLimit(actor);
    const spells = preparing
        ? (actor?.items ?? [])
            .filter(item => item.type === 'spell' && item.system?.countsPrepared)
            .map(item => ({
                id: item.id,
                name: item.name,
                img: item.img,
                uuid: item.uuid,
                level: item.system?.level ?? 0,
                prepared: Number(item.system?.prepared) > 0
            }))
            .sort((a, b) => (b.prepared - a.prepared) || (a.level - b.level) || a.name.localeCompare(b.name))
        : [];

    // The slots in HEAD-TO-TOE order, each with the glyph the doll draws it
    // with. The table is built around this rather than around the items: a row
    // per slot shows the GAPS, and a list of items only ever shows what you
    // already have.
    //
    // Stated rather than derived from the grid. The doll's positions interleave
    // — ring, hip, waist, hip, ring share one row, because that is how a body
    // looks — and reading that out row by row gives an order nobody would think
    // of as head to toe. The pairs belong together in a list even though they sit
    // apart on a figure.
    const READING_ORDER = [
        'head', 'face', 'neck', 'back', 'chest', 'arms', 'hands',
        'ring1', 'ring2', 'hip1', 'hip2', 'waist', 'feet',
        // The things held rather than worn, after everything worn.
        'mainhand', 'offhand', 'bothhands', 'sheath', 'ammo',
        'spell1', 'spell2', 'spell3'
    ];

    const byKey = new Map([...layout.body, ...layout.big].map(slot => [slot.key, slot]));
    const order = READING_ORDER
        .filter(key => byKey.has(key))
        .map(key => {
            const slot = byKey.get(key);
            return { key, label: slot.label, icon: slot.icon };
        });

    return { rows, spells, limit, preparing, order };
}

/** Write a decided plan: slot keys by item id, and the prepared list in order. */
export async function applyImportPlan(actor, buildId, { slots = {}, spells = [] } = {}) {
    await saveBuilds(actor, getBuilds(actor).map(build => {
        if (build.id !== buildId) return build;

        const next = Object.fromEntries(BUILD_SLOT_KEYS.map(key => [key, null]));
        for (const [itemId, slotKey] of Object.entries(slots)) {
            if (slotKey && slotKey in next) next[slotKey] = itemId;
        }

        return { ...build, slots: next, spells: spells.slice(0, PACK_GRID_SIZE) };
    }));
}

/**
 * Fill a build from what the character has on RIGHT NOW.
 *
 * The reverse of applying, and the answer to having spent an hour getting a kit
 * right on the sheet before discovering this window. Either half can be taken on
 * its own, because they are separate decisions — see the preparation switch.
 *
 * WHICH SLOT each item lands in is cosmetic, and deliberately so. Applying
 * equips exactly the set the build names and unequips everything else, so any
 * arrangement of the same items reproduces the same character; the placement
 * only has to look sensible. It is a light heuristic for that reason and not a
 * classification system — the data cannot tell a hat from a boot, which is why
 * the body slots accept anything in the first place.
 *
 * Anything that does not fit a guess goes in the next free body slot rather than
 * being dropped. A build missing the item you were looking at is worse than a
 * build with a lantern in the neck slot, and the second is one drag from fixed.
 */
export async function pullFromSheet(actor, buildId, { gear = false, prepared = false, empty = false } = {}) {
    const build = getBuild(actor, buildId);
    if (!build || (!gear && !prepared && !empty)) return null;

    const layout = getDollLayout(actor);
    const next = { ...build };

    // Emptied FIRST, and independently of what is then taken. Each half an
    // import touches is already replaced rather than merged, so this is only for
    // the half it does NOT touch: taking gear alone into a build that also plans
    // spells otherwise leaves the old list sitting there, which is correct when
    // you meant to keep it and surprising when you did not.
    //
    // The name and the pictures survive. Those are what the build IS; this
    // empties what it holds.
    if (empty) {
        next.slots = Object.fromEntries(BUILD_SLOT_KEYS.map(key => [key, null]));
        next.spells = [];
    }
    let gearCount = 0;
    let spellCount = 0;
    // Two different failures, kept apart because they have different answers.
    // `unknown` is "nothing could say where this goes" — drag it in yourself.
    // `crowded` is "it knew, and the slot was taken" — you own one neck.
    const unknown = [];
    const crowded = [];

    if (gear) {
        const slots = Object.fromEntries(BUILD_SLOT_KEYS.map(key => [key, null]));
        const equipped = (actor?.items ?? []).filter(item => item.system?.equipped);

        // Read once for the whole pass rather than per comparison — a sort calls
        // its comparator O(n log n) times and both of these walk a list.
        const signals = {
            favorites: favoriteIds(actor),
            handle: new Set(actor?.getFlag?.(MODULE.ID, 'favoriteHandle') ?? [])
        };
        const merit = item => itemMerit(item, signals);
        const exists = new Set([...layout.body, ...layout.big].map(slot => slot.key));

        const place = (key, item) => {
            if (!key || !exists.has(key) || slots[key]) return false;
            // The slot's own rule, checked here as well as at the dropdown. The
            // proposal used to skip it, so a candidate list could put something
            // in a slot the doll itself would refuse — a shield in the sheath,
            // which shares a grip with a dagger and must never share its home.
            if (refuseSlotDrop(key, item)) return false;
            slots[key] = item.id;
            return true;
        };

        // Sorted by MERIT before anything is placed, so the contested slots go
        // to the things this character actually leads with rather than to
        // whatever the sheet happened to list first. See itemMerit().
        const ranked = [...equipped].sort((a, b) => merit(b) - merit(a));

        // PASS ONE: the confident claims. Nothing weaker gets a look at a named
        // slot until these are settled — in one pass a spare arrow reached the
        // neck before the Amulet of Health was considered, and the amulet ended
        // up on her feet.
        const parked = [];

        for (const item of ranked) {
            const claim = slotClaim(item);
            if (claim === NOT_GEAR) continue;

            if (!claim) {
                // No idea where it goes. Say so rather than inventing a home:
                // wrong imports are worse than none.
                unknown.push(item.name);
                continue;
            }

            if (claim.some(key => place(key, item))) gearCount++;
            else parked.push(item);
        }

        // PASS TWO: claims whose slots were all taken — a third arrow against
        // one ammunition slot, a fourth pouch against two hips. Knowing where you
        // belong and finding it full is a different thing from not knowing, and
        // still not a reason to be put somewhere wrong.
        for (const item of parked) crowded.push(item.name);

        next.slots = slots;
    }

    if (prepared) {
        const list = (actor?.items ?? [])
            .filter(item => item.type === 'spell' && item.system?.countsPrepared
                && Number(item.system.prepared) > 0)
            .slice(0, PACK_GRID_SIZE)
            .map(item => item.id);

        // Taking the character's prepared list is all it takes to make this a
        // build that plans one. There is no switch to set as well — see
        // applyBuild: the list IS the plan.
        next.spells = list;
        spellCount = list.length;
    }

    await saveBuilds(actor, getBuilds(actor).map(entry => entry.id === buildId ? next : entry));
    return { gearCount, spellCount, unknown, crowded };
}

/**
 * The picture that stands for a build wherever one is shown small.
 *
 * For a COSTUME its own image, which is the entire content of a costume. For a
 * build the character's headline choice — the spell a caster leads with, the
 * weapon anybody else does — falling back to the build's picture when that slot
 * is empty.
 *
 * Here rather than in the window, because the rail's tiles and the tray handle
 * both need it and two copies of this would be two answers to "what does this
 * build look like" that drift apart the first time either is edited.
 */
export function resolveTileImage(actor, build) {
    if (!build) return null;

    const headline = build.mode === 'costume'
        ? null
        : actor?.items?.get(build.slots?.[getDollLayout(actor).caster ? 'spell1' : 'mainhand']);

    return headline?.img ?? resolveMainImage(actor, build).path;
}

export function getHandleBuilds(actor) {
    const byId = new Map(getBuilds(actor).map(build => [build.id, build]));

    return getHandleBuildIds(actor).map(id => {
        const build = byId.get(id);
        const summary = buildSummary(actor, build);
        return {
            id,
            name: build.name,
            img: resolveTileImage(actor, build),
            // A costume on the handle is a costume, and the strip should say so
            // with the same two glyphs the rail and the buttons use.
            costume: build.mode === 'costume',
            armorClass: summary.armorClass.value,
            gearCount: summary.gearCount
        };
    });
}

/**
 * Put a build on the handle, or move one already there.
 *
 * `beforeId` is the build to insert above, or null for the end — the same
 * contract the handle's favourites use, so one drop gesture behaves identically
 * whichever list it lands in.
 */
export async function addBuildToHandle(actor, buildId, beforeId = null) {
    if (!buildId || !getBuilds(actor).some(build => build.id === buildId)) return;

    const ids = getHandleBuildIds(actor).filter(id => id !== buildId);
    const index = beforeId ? ids.indexOf(beforeId) : -1;

    if (index === -1) ids.push(buildId);
    else ids.splice(index, 0, buildId);

    await actor.setFlag(MODULE.ID, HANDLE_BUILDS_FLAG, ids);
}

export async function removeBuildFromHandle(actor, buildId) {
    await actor.setFlag(MODULE.ID, HANDLE_BUILDS_FLAG,
        getHandleBuildIds(actor).filter(id => id !== buildId));
}

/**
 * A weapon's damage as a readable string, or null for anything that has none.
 *
 * `damage.base.formula` is dnd5e's own getter — it already resolves the custom
 * formula when one is set and otherwise assembles number/denomination/bonus, so
 * this never rebuilds a dice expression by hand. Types come from the same field
 * and are joined rather than picked, because a weapon that deals two kinds deals
 * both.
 */
export function damageLabel(item) {
    const base = item?.system?.damage?.base;
    const formula = base?.formula;
    if (!formula) return null;

    const types = [...(base.types ?? [])]
        .map(type => CONFIG.DND5E?.damageTypes?.[type]?.label ?? type)
        .join('/');

    return types ? `${formula} ${types.toLowerCase()}` : formula;
}

/* ==========================================================================
   WHAT IS CURRENTLY WORN
   ========================================================================== */

const ACTIVE_BUILD_FLAG = 'activeBuild';

/**
 * What the character actually has on, as two sets of item ids.
 *
 * Read once and handed to everything that needs it, rather than each caller
 * walking the sheet again: the rail asks the same question of every build it
 * draws, and the doll asks it of every slot.
 */
export function equippedState(actor) {
    const gear = new Set();
    const spells = new Set();

    for (const item of actor?.items ?? []) {
        // Skipped here exactly as applyBuild skips them: a build never names a
        // natural weapon or a container, so counting either as equipped would
        // report every character with claws — or a backpack — as permanently
        // drifted from every build.
        if (isUnplannable(item)) continue;

        // Equippable is "has an equipped flag at all" — dnd5e's own way of
        // saying the question applies to this item. The same test applyBuild
        // uses, so the two can never disagree about what counts.
        if (item.system?.equipped) gear.add(item.id);
        if (item.type === 'spell' && item.system?.countsPrepared && Number(item.system.prepared) > 0) {
            spells.add(item.id);
        }
    }

    return { gear, spells };
}

/**
 * How far the character has drifted from a build since it was applied.
 *
 * The `activeBuild` flag records WHICH plan is in play, and that is a fact about
 * intention that stays true however the character is edited afterwards. This
 * answers the other half: whether they still match it. Both are needed — a mark
 * reading "Worn" on a character who has since taken the armour off is a lie, and
 * clearing the flag instead would silently empty the handle's weapon strip the
 * first time somebody picked up a torch.
 *
 * Drift comes from either direction and means the same thing: the build changed
 * after it was worn, or the character did. What is on the character is not this.
 *
 * Note what is NOT compared. Portrait and token are artwork rather than
 * equipment — a costume worn over a build changes them by design and has not
 * disturbed what the character is wearing. Attunement is not compared either,
 * because applying never sets it.
 */
export function buildDrift(actor, build, state = null) {
    const { gear, spells } = state ?? equippedState(actor);

    const wantGear = new Set(Object.values(build?.slots ?? {}).filter(Boolean));
    // Only if the build names any. One that names none has no opinion about the
    // character's prepared list, so there is nothing to have drifted from and
    // every prepared spell would otherwise count as an extra. The empty list
    // says that by itself — same rule applyBuild uses to decide whether to touch
    // spells at all, so the two can never disagree.
    const planned = (build?.spells ?? []).filter(Boolean);
    const wantSpells = planned.length ? new Set(planned) : null;

    // Slotted, but not on the character: either taken off, or gone from the
    // sheet entirely. Both mean the plan is not being met.
    const notEquipped = [...wantGear].filter(id => !gear.has(id));
    const notPrepared = wantSpells ? [...wantSpells].filter(id => !spells.has(id)) : [];
    // On the character, but not in the plan. These have no slot to be marked in,
    // so they are counted rather than located.
    const extraGear = [...gear].filter(id => !wantGear.has(id));
    const extraSpells = wantSpells ? [...spells].filter(id => !wantSpells.has(id)) : [];

    return {
        notEquipped: new Set(notEquipped),
        notPrepared: new Set(notPrepared),
        extraGear: extraGear.length,
        extraSpells: extraSpells.length,
        count: notEquipped.length + notPrepared.length + extraGear.length + extraSpells.length,
        matches: !notEquipped.length && !notPrepared.length && !extraGear.length && !extraSpells.length
    };
}

/** The build last applied, or null. */
export function getActiveBuildId(actor) {
    const id = actor?.getFlag(MODULE.ID, ACTIVE_BUILD_FLAG);
    return typeof id === 'string' && getBuilds(actor).some(b => b.id === id) ? id : null;
}

export async function setActiveBuildId(actor, buildId) {
    await actor?.setFlag(MODULE.ID, ACTIVE_BUILD_FLAG, buildId ?? null);
}

/**
 * What the applied build puts on the handle: the BIG THREE, whatever they are.
 *
 * A martial's are Main Hand, Both Hands and Off Hand; a caster's are their
 * Primary, Secondary and Tertiary spells. Same three slots the doll gives that
 * character, so the strip shows what their build is actually built around
 * instead of a fixed idea of what a build is for — and a wizard, who has no
 * business keeping a greatsword to hand, gets the three things they will
 * actually reach for.
 *
 * `layout.big` and NOTHING ELSE, for two reasons that happen to agree.
 *
 * THREE IS THE BUDGET. The handle is a narrow vertical strip that also carries
 * health, conditions and hand-placed favourites, and five or more build icons on
 * it is more than it should be asked to hold — the key items are enough, and a
 * strip that lists everything usable stops being a strip you can read at a
 * glance. That is a decision about the handle, not about builds, so adding
 * "just one more" slot here later is reopening it rather than extending it.
 *
 * It also fixes a bug. This used to add every body slot that accepted a weapon
 * or an ability, which sounds like the same idea and behaved like a different
 * one: a caster's Main Hand and Off Hand carry no `accepts` at all — they are on
 * the doll's small row and take what the layout says — so those two were
 * silently dropped while the sheath was kept. Three predictable icons beat five
 * that vary by a property nobody reading the strip can see.
 *
 * Armour, rings and a belt were never here: they would be icons that do nothing
 * when pressed. Ammunition is not either, being spent by the weapon that fires
 * it rather than used on its own.
 *
 * DERIVED, never stored. The alternative is a second list that has to be kept in
 * step with the build, and would go stale the moment somebody edited the build
 * it was copied from. Recomputing costs three map lookups.
 */
export function getHandleBuildActions(actor) {
    if (!game.settings.get(MODULE.ID, 'buildsUpdateHandle')) return [];

    const build = getBuild(actor, getActiveBuildId(actor));
    if (!build || build.mode === 'costume') return [];

    return getDollLayout(actor).big
        .map(slot => actor?.items?.get(build.slots?.[slot.key]))
        .filter(Boolean)
        .map(item => ({ id: item.id, name: item.name, img: item.img }));
}

/**
 * Give a character a Default Costume the first time their builds are opened.
 *
 * Their own face, recorded as something they can put back on. Every other build
 * can change the portrait and the token, and without this the only way back to
 * how the character actually looks would be a flag nobody can see — the
 * defaults captured by captureDefaultImages are a safety net, not something a
 * player can point at and click.
 *
 * A costume, not a build: applying it must change how they look and nothing
 * else. Created once and never re-created, so deleting it is allowed to mean
 * deleting it.
 */
/**
 * The character's gear as it stood the first time this window was opened, as a
 * build, made once and never again.
 *
 * The Default Costume is their own face offered back to them; this is the same
 * courtesy for their kit. Without it the first thing anybody does here is make a
 * build, drag twelve things into it, equip it — and discover that equipping
 * unequips everything it does not name, which is the correct rule and a terrible
 * way to learn it. With it there is always a way back to what they had.
 *
 * It does NOT plan prepared spells. Preparation is opt-in per build for good
 * reasons, and a snapshot taken automatically is the last place to start
 * overriding that; a caster's list is theirs and this has no business claiming
 * an opinion about it.
 *
 * It becomes the WORN build, because it is: the character is wearing exactly
 * what it names, and saying otherwise would be false the moment it was written.
 * That also means the window opens on their gear rather than on an empty page.
 *
 * A character with nothing equipped gets nothing. An empty snapshot protects
 * nobody from anything.
 */
export async function ensureDefaultBuild(actor) {
    if (!actor || actor.getFlag(MODULE.ID, 'defaultBuildMade')) return;

    // Set before the work, not after: a failure halfway through should leave one
    // half-built build behind rather than try again on every open forever.
    await actor.setFlag(MODULE.ID, 'defaultBuildMade', true);

    const equipped = (actor.items ?? []).filter(item => item.system?.equipped);
    if (!equipped.length) return;

    // Nothing to snapshot with. This runs on the FIRST open, before anybody has
    // asked for anything, so an older Blacksmith should cost the snapshot
    // silently rather than making a build of nothing and calling it their gear.
    if (!equipLocations()) return;

    const build = await createBuild(actor, 'Original Gear');
    const result = await pullFromSheet(actor, build.id, { gear: true, prepared: false });
    await setActiveBuildId(actor, build.id);

    // Handed back so the window can say what this silent snapshot could not
    // place. Every other route into the importer now asks item by item, so this
    // is the one path where something can be left out without anybody being
    // told — and it is the first thing a player ever sees here.
    return { buildId: build.id, ...result };
}

export async function ensureDefaultCostume(actor) {
    if (!actor || actor.getFlag(MODULE.ID, 'defaultCostumeMade')) return;

    const defaults = getDefaultImages(actor);
    await actor.setFlag(MODULE.ID, 'defaultCostumeMade', true);
    if (!defaults.portrait && !defaults.token) return;

    const build = await createBuild(actor, 'Default Costume');
    await saveBuilds(actor, getBuilds(actor).map(entry =>
        entry.id === build.id
            ? {
                ...entry,
                mode: 'costume',
                images: { portrait: defaults.portrait, token: defaults.token },
                // Their token's own size and framing, recorded here rather than
                // left blank. This is the costume that means "back to normal",
                // and a costume that changes the picture but leaves a previous
                // costume's dimensions in place would not get them there.
                token: {
                    width: Number(actor.prototypeToken?.width) || 1,
                    height: Number(actor.prototypeToken?.height) || 1,
                    fit: actor.prototypeToken?.texture?.fit ?? null,
                    scale: Number(actor.prototypeToken?.texture?.scaleX) || 1
                }
            }
            : entry));
}
