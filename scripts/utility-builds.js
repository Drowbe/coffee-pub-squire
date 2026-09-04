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
export const BUILD_BODY_SLOTS = [
    { key: 'head',  label: 'Head',  icon: 'fa-helmet-battle',     row: 1, column: 3 },
    { key: 'face',  label: 'Face',  icon: 'fa-mask',              row: 2, column: 1 },
    { key: 'neck',  label: 'Neck',  icon: 'fa-gem',               row: 2, column: 5 },
    { key: 'back',  label: 'Back',  icon: 'fa-backpack',          row: 3, column: 1 },
    { key: 'chest', label: 'Chest', icon: 'fa-vest',              row: 3, column: 5 },
    { key: 'arms',  label: 'Arms',  icon: 'fa-shirt-long-sleeve', row: 4, column: 1 },
    { key: 'hands', label: 'Hands', icon: 'fa-mitten',            row: 4, column: 5 },
    { key: 'ring1', label: 'Ring',  icon: 'fa-ring',              row: 5, column: 1 },
    { key: 'hip1',  label: 'Hip',   icon: 'fa-sack',              row: 5, column: 2 },
    { key: 'waist', label: 'Waist', icon: 'fa-grip-lines',        row: 5, column: 3 },
    { key: 'hip2',  label: 'Hip',   icon: 'fa-sack',              row: 5, column: 4 },
    { key: 'ring2', label: 'Ring',  icon: 'fa-ring',              row: 5, column: 5 },
    { key: 'feet',  label: 'Feet',  icon: 'fa-boot',              row: 6, column: 3 },
    // Ammo rides the Feet row, at the outer columns, directly above the weapons
    // it feeds. Two rather than one per weapon: a quiver is a thing you carry,
    // not a thing each hand carries, and three would have implied that Both
    // Hands needs its own supply separate from the bow in it.
    { key: 'ammo1', label: 'Ammo',  icon: 'fa-bow-arrow',         row: 6, column: 1, round: true, accepts: 'ammo' },
    { key: 'ammo2', label: 'Ammo',  icon: 'fa-bow-arrow',         row: 6, column: 5, round: true, accepts: 'ammo' }
];

/**
 * The weapon slots, in their own row under the doll.
 *
 * Three equal thirds, which makes them the biggest slots in the window — and
 * they should be. Everything above is worn; these are what the character
 * actually swings, and the doll reading with weight at the bottom is most of
 * why it looks like a character rather than a spreadsheet.
 *
 * They were briefly on the body's five columns, to make them square. That is no
 * longer what squareness costs: `aspect-ratio` on the slot means a third of the
 * width is square at a third of the width, so they can be as big as they deserve.
 *
 * Both Hands does NOT lock Main and Off. A two-handed weapon occupying all three
 * is a rule the game system knows and this module does not — enforcing it here
 * would mean re-deriving "is this two-handed" from item properties and being
 * wrong about the exceptions, in a window whose whole job is to record what
 * somebody meant.
 */
export const BUILD_WEAPON_SLOTS = [
    { key: 'mainhand',  label: 'Main Hand',  icon: 'fa-sword' },
    // An axe rather than crossed swords: `fa-swords` reads as dual-wielding,
    // which is the opposite of what this slot means.
    { key: 'bothhands', label: 'Both Hands', icon: 'fa-axe-battle', accepts: 'weapon' },
    { key: 'offhand',   label: 'Off Hand',   icon: 'fa-shield-halved' }
];

/**
 * The two image slots, flanking the head.
 *
 * Not gear. They hold an image PATH rather than an item id, and they are the
 * first piece of a build that describes the character rather than what the
 * character is carrying: applying a build will eventually set the actor's
 * portrait and its token artwork from these. Until then they record the
 * intention, which is the same thing every other slot in this window does.
 *
 * Round, like the ammo slots, and for the same reason — a circle marks "not the
 * same kind of thing as its neighbours" without spending a word on it.
 *
 * `fallback` names where the current image comes from when the build has not set
 * one, so an untouched slot shows the character as they are rather than an empty
 * hole. Read at render time, never written.
 */
export const BUILD_IMAGE_SLOTS = [
    { key: 'portrait', label: 'Portrait', icon: 'fa-image-portrait', row: 1, column: 2 },
    { key: 'token',    label: 'Token',    icon: 'fa-chess-pawn',     row: 1, column: 4 }
];

export const BUILD_IMAGE_KEYS = BUILD_IMAGE_SLOTS.map(slot => slot.key);

/** Every slot key, for validating what arrives from a dataset or a stored flag. */
export const BUILD_SLOT_KEYS = [
    ...BUILD_BODY_SLOTS.map(slot => slot.key),
    ...BUILD_WEAPON_SLOTS.map(slot => slot.key)
];

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
        // Prepared spells, keyed by class identifier. Unlike the gear slots
        // these cannot be normalised against a fixed key set — how many a class
        // prepares depends on the character, so the raw lists are kept here and
        // sized against the actor by resolvePreparedSpells().
        spells: Object.fromEntries(
            Object.entries(build.spells ?? {})
                .filter(([, list]) => Array.isArray(list))
                .map(([classId, list]) => [
                    classId,
                    list.map(entry => typeof entry === 'string' ? entry : null)
                ])
        )
    }));
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
        spells: {}
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
        // Each class's list copied rather than shared, or editing one build's
        // spells would edit the other's.
        spells: Object.fromEntries(
            Object.entries(source.spells ?? {}).map(([classId, list]) => [classId, [...list]])
        )
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

/** Switch a build between dressing the character and equipping it. */
export async function setBuildMode(actor, buildId, mode) {
    const next = mode === 'costume' ? 'costume' : 'gear';

    await saveBuilds(actor, getBuilds(actor).map(build =>
        build.id === buildId ? { ...build, mode: next } : build));
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
export function resolveSlots(actor, build, slotDefinitions) {
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
            needsAttunement: item?.system?.attunement === 'required'
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
 * The character's spell slots, as a readout.
 *
 * Every entry `system.spells` holds with a maximum above zero, which covers the
 * nine leveled ranks and a warlock's pact slots without naming either. Purely
 * informational: it is what tells you whether a prepared list is castable, and
 * it is not something a build can change.
 */
export function getSpellSlots(actor) {
    return Object.entries(actor?.system?.spells ?? {})
        .filter(([, slot]) => Number(slot?.max ?? 0) > 0)
        .map(([key, slot]) => ({
            key,
            label: key === 'pact'
                ? 'Pact'
                : `${key.replace('spell', '')}${ORDINALS[key.replace('spell', '')] ?? ''}`,
            value: Number(slot.value ?? 0),
            max: Number(slot.max ?? 0)
        }));
}

/** Suffixes for the slot readout's rank labels. */
const ORDINALS = { 1: 'st', 2: 'nd', 3: 'rd', 4: 'th', 5: 'th', 6: 'th', 7: 'th', 8: 'th', 9: 'th' };

/**
 * One class's prepared list, sized to that class's limit.
 *
 * The stored array is padded or truncated to `max` on every read rather than
 * migrated: levelling up should widen the list without a write, and a class that
 * loses preparations should not keep the overflow alive invisibly. An id that no
 * longer resolves is reported `missing`, exactly as a gear slot does.
 */
export function resolvePreparedSpells(actor, build, casterClass) {
    const stored = Array.isArray(build?.spells?.[casterClass.id]) ? build.spells[casterClass.id] : [];

    return Array.from({ length: casterClass.max }, (_, index) => {
        const itemId = typeof stored[index] === 'string' ? stored[index] : null;
        const item = itemId ? actor?.items?.get(itemId) : null;

        return {
            index,
            itemId,
            filled: !!item,
            missing: !!itemId && !item,
            name: item?.name ?? null,
            img: item?.img ?? null,
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

/** The cantrips this character knows. Always available, so a readout, not slots. */
export function getCantrips(actor) {
    return (actor?.items ?? [])
        .filter(item => item.type === 'spell' && item.system?.level === 0)
        .map(item => ({ id: item.id, name: item.name, img: item.img }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/** Put a spell in one prepared slot, or empty it with a null itemId. */
export async function setBuildSpell(actor, buildId, classId, index, itemId) {
    const position = Number(index);
    if (!classId || !Number.isInteger(position) || position < 0) return;

    await saveBuilds(actor, getBuilds(actor).map(build => {
        if (build.id !== buildId) return build;

        const list = [...(build.spells?.[classId] ?? [])];
        // Padded rather than assigned past the end, so the array never comes
        // back with holes that read as `undefined` instead of as empty.
        while (list.length <= position) list.push(null);
        list[position] = itemId ?? null;

        return { ...build, spells: { ...build.spells, [classId]: list } };
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

    const definition = [...BUILD_BODY_SLOTS, ...BUILD_WEAPON_SLOTS]
        .find(slot => slot.key === slotKey);
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
export async function captureDefaultImages(actor) {
    if (!actor || actor.getFlag(MODULE.ID, DEFAULT_IMAGES_FLAG)) return;

    await actor.setFlag(MODULE.ID, DEFAULT_IMAGES_FLAG, {
        portrait: actor.img ?? null,
        token: actor.prototypeToken?.texture?.src ?? null
    });
}

/**
 * The character's own artwork, as captured before any build touched it.
 *
 * Falls back to what the actor currently shows when nothing has been captured —
 * which is correct precisely because nothing has been applied in that case, so
 * current and original are the same thing.
 */
export function getDefaultImages(actor) {
    const stored = actor?.getFlag(MODULE.ID, DEFAULT_IMAGES_FLAG);

    return {
        portrait: stored?.portrait ?? actor?.img ?? null,
        token: stored?.token ?? actor?.prototypeToken?.texture?.src ?? null
    };
}

/**
 * Put the character's own portrait and token back.
 *
 * Not wired to anything yet — applying a build is a later step — but it is the
 * other half of the capture above and belongs beside it. Deliberately does NOT
 * clear the flag: the defaults are the character's identity, not a one-shot
 * undo, and a second build applied later needs them just as much.
 */
export async function restoreDefaultImages(actor) {
    const defaults = getDefaultImages(actor);
    if (!defaults.portrait && !defaults.token) return;

    await actor.update({
        ...(defaults.portrait ? { img: defaults.portrait } : {}),
        ...(defaults.token ? { 'prototypeToken.texture.src': defaults.token } : {})
    });
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
    const bodySlots = resolveSlots(actor, build, BUILD_BODY_SLOTS);
    const weaponSlots = resolveSlots(actor, build, BUILD_WEAPON_SLOTS);
    const slots = [...bodySlots, ...weaponSlots];

    const spellCount = Object.values(build?.spells ?? {})
        .reduce((total, list) => total + list.filter(Boolean).length, 0);

    return {
        armorClass: estimateArmorClass(actor, build),
        attunement: attunementSummary(actor, slots),
        weight: gearWeight(actor, build),
        gearCount: slots.filter(slot => slot.filled).length,
        gearMax: BUILD_SLOT_KEYS.length,
        missingCount: slots.filter(slot => slot.missing).length,
        spellCount,
        // The first few item pictures, for the tile to show instead of a generic
        // shirt. A build's identity is the things in it.
        preview: slots.filter(slot => slot.filled).slice(0, 5).map(slot => ({
            img: slot.img,
            name: slot.name
        }))
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
export async function applyBuild(actor, build) {
    if (!actor || !build) return null;

    // Everything needed to put it back, captured before the first write. Held by
    // the caller in memory rather than in a flag: undo is a right-now offer on a
    // toast, not a history the world should carry around.
    const undo = {
        items: [],
        img: actor.img,
        token: actor.prototypeToken?.texture?.src ?? null
    };

    // A costume changes only how the character looks. Its gear slots are left
    // strictly alone — not applied as "equip nothing", which would strip the
    // character bare, and is the opposite of what dressing up means.
    const costume = build.mode === 'costume';

    const gearIds = new Set(Object.values(build.slots ?? {}).filter(Boolean));
    const spellIds = new Set(
        Object.values(build.spells ?? {}).flat().filter(Boolean)
    );

    const updates = [];
    let equipped = 0;
    let unequipped = 0;
    let prepared = 0;
    let unprepared = 0;

    for (const item of costume ? [] : actor.items) {
        // Equippable is "has an equipped flag at all" — that is dnd5e's own way
        // of saying the question applies to this item.
        if (item.system?.equipped !== undefined) {
            const shouldEquip = gearIds.has(item.id);
            if (!!item.system.equipped !== shouldEquip) {
                updates.push({ _id: item.id, 'system.equipped': shouldEquip });
                undo.items.push({ _id: item.id, 'system.equipped': !!item.system.equipped });
                shouldEquip ? equipped++ : unequipped++;
            }
        }

        if (item.type === 'spell' && item.system?.countsPrepared) {
            const shouldPrepare = spellIds.has(item.id);
            // dnd5e models `prepared` as a number: 0 unprepared, 1 prepared,
            // 2 always prepared. Only 0 and 1 are ours to set.
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

    const actorUpdate = {};
    if (build.images?.portrait) actorUpdate.img = build.images.portrait;
    if (build.images?.token) actorUpdate['prototypeToken.texture.src'] = build.images.token;
    if (Object.keys(actorUpdate).length) await actor.update(actorUpdate);

    const tokensChanged = build.images?.token
        ? await applyTokenArtwork(actor, build.images.token)
        : 0;

    return {
        equipped,
        unequipped,
        prepared,
        unprepared,
        imagesChanged: Object.keys(actorUpdate).length,
        tokensChanged,
        undo
    };
}

/**
 * Repaint this actor's tokens already on the canvas.
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
async function applyTokenArtwork(actor, src) {
    const updates = (canvas?.tokens?.placeables ?? [])
        .filter(token => token.actor?.uuid === actor.uuid
            && token.document?.texture?.src !== src)
        .map(token => ({ _id: token.id, 'texture.src': src }));

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
    if (Object.keys(actorUpdate).length) await actor.update(actorUpdate);

    if (undo.token) await applyTokenArtwork(actor, undo.token);
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
 * Each carries the first item picture in the build as its face, because a build
 * has no artwork of its own and a row of identical shirts would defeat the
 * purpose of putting them somewhere glanceable.
 */
export function getHandleBuilds(actor) {
    const byId = new Map(getBuilds(actor).map(build => [build.id, build]));

    return getHandleBuildIds(actor).map(id => {
        const build = byId.get(id);
        const summary = buildSummary(actor, build);
        return {
            id,
            name: build.name,
            img: summary.preview[0]?.img ?? null,
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

/** The build last applied, or null. */
export function getActiveBuildId(actor) {
    const id = actor?.getFlag(MODULE.ID, ACTIVE_BUILD_FLAG);
    return typeof id === 'string' && getBuilds(actor).some(b => b.id === id) ? id : null;
}

export async function setActiveBuildId(actor, buildId) {
    await actor?.setFlag(MODULE.ID, ACTIVE_BUILD_FLAG, buildId ?? null);
}

/**
 * The weapons the applied build puts on the handle.
 *
 * The three weapon slots and nothing else. The handle is for things you CLICK
 * TO USE, and armour, rings and a belt would be five icons that do nothing when
 * pressed. Ammunition and spells are each their own conversation and are
 * deliberately not swept in here.
 *
 * DERIVED, never stored. The alternative is a second list that has to be kept in
 * step with the build, and would go stale the moment somebody edited the build
 * it was copied from. Recomputing costs three map lookups.
 */
export function getHandleBuildWeapons(actor) {
    if (!game.settings.get(MODULE.ID, 'buildsUpdateHandle')) return [];

    const build = getBuild(actor, getActiveBuildId(actor));
    if (!build || build.mode === 'costume') return [];

    return BUILD_WEAPON_SLOTS
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
export async function ensureDefaultCostume(actor) {
    if (!actor || actor.getFlag(MODULE.ID, 'defaultCostumeMade')) return;

    const defaults = getDefaultImages(actor);
    await actor.setFlag(MODULE.ID, 'defaultCostumeMade', true);
    if (!defaults.portrait && !defaults.token) return;

    const build = await createBuild(actor, 'Default Costume');
    await saveBuilds(actor, getBuilds(actor).map(entry =>
        entry.id === build.id
            ? { ...entry, mode: 'costume', images: { portrait: defaults.portrait, token: defaults.token } }
            : entry));
}
