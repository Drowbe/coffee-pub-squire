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
 *   * `ring` is a real `equipmentTypes` key, so the ring slots are real.
 *   * `shield` is a real `armorTypes` key, so an off hand knows a shield.
 *   * `ammo` is a real `consumableTypes` key, so the ammo slots are real.
 *
 * Everywhere else it does not: a helm, a cloak, a belt and a pair of boots are
 * all `trinket` or `wondrous` or `clothing` with nothing to tell them apart. So
 * Head, Face, Neck, Back, Chest, Arms, Hands, Waist, Hip and Feet take any
 * physical item, and a player who puts their boots on their head is not making a
 * mistake this module is in a position to identify. A guess that refuses a drop
 * is worse than no guess at all — but a CHECK is not a guess, and refusing to
 * make the checks that are possible was over-correcting.
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
    ring: {
        test: item => item.type === 'equipment' && item.system?.type?.value === 'ring',
        refusal: item => `${item.name} is not a ring.`
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
    { key: 'ring1', label: 'Ring',  icon: 'fa-ring',              row: 5, column: 1, accepts: 'ring' },
    { key: 'hip1',  label: 'Hip',   icon: 'fa-sack',              row: 5, column: 2 },
    { key: 'waist', label: 'Waist', icon: 'fa-grip-lines',        row: 5, column: 3 },
    { key: 'hip2',  label: 'Hip',   icon: 'fa-sack',              row: 5, column: 4 },
    { key: 'ring2', label: 'Ring',  icon: 'fa-ring',              row: 5, column: 5, accepts: 'ring' },
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
        slots: Object.fromEntries(BUILD_SLOT_KEYS.map(key => [key, null])),
        spells: {}
    };
    await saveBuilds(actor, [...getBuilds(actor), build]);
    return build;
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
