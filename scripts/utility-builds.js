import { MODULE } from './const.js';

/**
 * GEAR BUILDS — the slots, and the actor flag they live in.
 *
 * A build is a SAVED PLAN, not a state the character is in. Nothing here reads
 * or writes `system.equipped`, and filling a slot changes nothing on the sheet.
 * That is deliberate and is the whole of phase one: the layout is worth proving
 * before anything is allowed to equip sixteen items in one click.
 *
 * D&D 5e has no equipment slots. There is no `system.slot`, no "this is a helmet"
 * flag, nothing to validate against — armour type comes closest and only covers
 * four of these sixteen. So the slots are Squire's own vocabulary and any item
 * may go in any one of them. A player who wants their shield in HIP 2 is not
 * making a mistake this module is in a position to identify, and a wrong guess
 * that refuses a drop is worse than no guess at all.
 */

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
    { key: 'feet',  label: 'Feet',  icon: 'fa-boot',              row: 6, column: 3 }
];

/**
 * The weapon slots, in their own row under the doll.
 *
 * A grid of their own rather than a seventh row of the body grid: they are three
 * equal thirds and the body is five uneven columns, and forcing one to describe
 * the other put Main Hand under a ring for no reason anyone could read.
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
    { key: 'bothhands', label: 'Both Hands', icon: 'fa-axe-battle' },
    { key: 'offhand',   label: 'Off Hand',   icon: 'fa-shield-halved' }
];

/** Every slot key, for validating what arrives from a dataset or a stored flag. */
export const BUILD_SLOT_KEYS = [
    ...BUILD_BODY_SLOTS.map(slot => slot.key),
    ...BUILD_WEAPON_SLOTS.map(slot => slot.key)
];

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
        }))
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
        slots: Object.fromEntries(BUILD_SLOT_KEYS.map(key => [key, null]))
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

        return {
            ...definition,
            itemId,
            filled: !!item,
            missing: !!itemId && !item,
            name: item?.name ?? null,
            img: item?.img ?? null,
            uuid: item?.uuid ?? null
        };
    });
}
