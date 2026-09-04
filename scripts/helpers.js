import { MODULE } from './const.js';
import { getHandleBuilds, getHandleBuildActions } from './utility-builds.js';

/**
 * True when this user is the GM or the current party leader.
 *
 * Asks Blacksmith. This used to read its `partyLeader` setting and reimplement
 * the check, which Blacksmith rightly called a liberty — it happened to agree
 * today and would have diverged the next time that shape changed.
 *
 * Their wrapper takes no arguments on purpose: the internal version has a
 * `moduleId` parameter, and passing the wrong one returns a silent false.
 *
 * Falls back to GM-only if the function is missing (a Blacksmith older than
 * 13.16.1). Hiding a control we cannot evaluate beats showing one that guesses.
 */
export function isGMOrPartyLeader() {
    if (game.user.isGM) return true;
    const blacksmith = getBlacksmith();
    if (typeof blacksmith?.isCurrentUserPartyLeader !== 'function') return false;
    return blacksmith.isCurrentUserPartyLeader();
}

/**
 * The independent reasons a panel row can be hidden.
 *
 * Filtering used to be a race: search, the equipped/prepared filters and
 * category collapse each wrote `item.style.display` outright, so whichever ran
 * last erased the others' verdict. Searching and then toggling the equipped
 * filter wiped the search; re-rendering a panel ran the filter first and the
 * search second, which un-hid rows the filter had just hidden.
 *
 * Instead each source owns one reason and only ever toggles its own class. The
 * stylesheet hides a row while any reason holds, so the verdicts intersect
 * rather than overwrite, and no source needs to know the others exist.
 *
 * 'type' used to be a fifth. It existed because the item-type chips could hide a
 * row inside a panel that was itself still showing -- a weapon in the favourites
 * block with the Weapons chip off. Section tabs hide whole panels instead, and
 * favourites moved to a view of its own, so no source sets it any more.
 */
export const FILTER_REASONS = ['search', 'action', 'state', 'category'];

/**
 * Record one filter's verdict on a row, leaving every other reason intact.
 *
 * @param {HTMLElement} row  a `.panel-item` element
 * @param {string} reason    one of {@link FILTER_REASONS}
 * @param {boolean} hidden   true to hide the row for this reason
 */
export function setRowFilter(row, reason, hidden) {
    row?.classList.toggle(`hidden-by-${reason}`, !!hidden);
}

/**
 * True when no filter is currently hiding this row.
 *
 * Header and empty-state logic asks this rather than reading `style.display`,
 * which only ever reported the last writer to touch the row.
 */
export function isRowVisible(row) {
    if (!row) return false;
    return !FILTER_REASONS.some(reason => row.classList.contains(`hidden-by-${reason}`));
}

/**
 * The item's own name from a `.panel-item` row, without the trimmings.
 *
 * `.panel-item-name` is a container: besides the name it holds the NEW tag, the
 * quantity badge and the container chip. Reading its `textContent` therefore
 * returns things like "Longsword NEW x3", which is why searching for "new"
 * used to match every recently added item.
 *
 * `.panel-item-label` wraps exactly the name, so it is read directly when
 * present. The fallback reproduces the old strip-the-children approach for any
 * row that predates the label.
 *
 * @param {HTMLElement} row  a `.panel-item` element
 * @returns {string} the trimmed name, or '' if there isn't one
 */
export function getPanelItemName(row) {
    if (!row) return '';

    const label = row.querySelector('.panel-item-label');
    if (label) return label.textContent.trim();

    const nameElement = row.querySelector('.panel-item-name');
    if (!nameElement) return '';

    // Strip every child, leaving the bare text nodes.
    const clone = nameElement.cloneNode(true);
    clone.querySelectorAll('*').forEach(child => child.remove());
    return clone.textContent.trim();
}

/**
 * Give the tray's items the same rich hover card the dnd5e sheet shows.
 *
 * dnd5e's tooltip layer is declarative and application-agnostic: its
 * `_onTooltipActivate` fires for ANY tooltip whose content is a
 * `.loading[data-uuid]` placeholder, resolves that uuid, and swaps in the
 * document's `richTooltip()`. So this sets three dataset attributes and the
 * system renders the card — no imports, no reaching into sheet internals, and
 * the card stays right when dnd5e changes what one contains.
 *
 * Two element families, treated differently:
 *
 *   `.panel-item`           the tray rows. The card goes on the item NAME, not
 *                           the row, because the row also holds roll/equip/
 *                           favourite controls with tooltips of their own that a
 *                           row-level one would cover.
 *
 *   `.handle-favorite-icon` the collapsed handle. These carry a hand-built
 *                           tooltip from the template — a long Handlebars
 *                           expression re-deriving spell/weapon/equipment/feat
 *                           details that `richTooltip()` already does properly.
 *                           It is REPLACED where the system can do better and
 *                           left alone where it cannot, so the handle keeps a
 *                           tooltip if Squire is ever run without dnd5e (which
 *                           module.json does not currently forbid).
 *
 * @param {HTMLElement} html   a rendered panel or handle
 * @param {Actor} actor        the actor those items belong to
 */
export function applyItemTooltips(html, actor) {
    if (!html || !actor) return;

    const decorate = (target, item) => {
        target.dataset.tooltip =
            `<section class="loading" data-uuid="${item.uuid}"><i class="fas fa-spinner fa-spin-pulse"></i></section>`;
        target.dataset.tooltipClass = 'dnd5e2 dnd5e-tooltip item-tooltip themed theme-light';
        // The tray is pinned to the left edge, so the card opens rightward into
        // the canvas rather than off-screen. dnd5e's own sheet defaults to LEFT
        // for the mirror-image reason.
        target.dataset.tooltipDirection ??= 'RIGHT';
    };

    for (const row of html.querySelectorAll('.panel-item[data-item-id]')) {
        const item = actor.items.get(row.dataset.itemId);
        // No richTooltip means a non-dnd5e system: leave whatever is there.
        if (typeof item?.richTooltip !== 'function') continue;

        // `.panel-item-label` wraps the words; `.panel-item-name` is its parent
        // and carries `flex: 1`, so it spans the whole row — hanging the card
        // there put it on everything but the icons, which is indistinguishable
        // from putting it on the row.
        //
        // The feather gets the same card. It is the control that opens the
        // sheet, so the card is a preview of exactly what clicking it will
        // show — and on a favourites tile, where the name is two clipped lines
        // in a corner, it is the easier of the two to aim at. These feathers
        // carry no `title` of their own to displace; the ones that do (the
        // character panel's, the compendium results') are not `.panel-item`
        // rows and are never reached from here.
        for (const target of [row.querySelector('.panel-item-label'),
                              row.querySelector('.tray-buttons .fa-feather')]) {
            // A missing element means a row this doesn't understand; leave it
            // alone rather than fall back to something row-width.
            if (!target || target.dataset.tooltip) continue;
            decorate(target, item);
        }
    }

    for (const icon of html.querySelectorAll('.handle-favorite-icon[data-item-id]')) {
        const item = actor.items.get(icon.dataset.itemId);
        if (typeof item?.richTooltip !== 'function') continue;
        decorate(icon, item);
    }
}

// Helper function to safely get Blacksmith API
export function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export function getBlacksmithDialog() {
  const dialog = getBlacksmith()?.dialog;
  if (!dialog) throw new Error('Coffee Pub Squire | Blacksmith api.dialog is unavailable');
  return dialog;
}

/**
 * Show routine Squire success/status feedback through Blacksmith's themed
 * toast surface rather than Foundry's core notification queue.
 */
export function showSquireToast(title, options = {}) {
  const toast = getBlacksmith()?.toast;
  if (typeof toast?.show !== 'function') {
    console.warn('Coffee Pub Squire | Blacksmith api.toast is unavailable:', title);
    return null;
  }

  return toast.show({
    title: String(title || ''),
    subtitle: options.subtitle ? String(options.subtitle) : undefined,
    icon: options.icon,
    image: options.image,
    duration: options.duration ?? 6,
    color: options.color,
    backgroundColor: options.backgroundColor,
    stackKey: options.stackKey,
    // Forwarded so a toast can carry an action — undo after applying a build is
    // the first caller. Blacksmith's toast has one click target and no button
    // row, so an actionable toast has to say what the click does in its own
    // subtitle; there is no second button to label.
    onClick: typeof options.onClick === 'function' ? options.onClick : null,
    moduleId: MODULE.ID
  });
}

/**
 * Resolve the shared semantic health-bar color class.
 * Party, handle, and Health tool surfaces all consume this same scale.
 *
 * @param {{value?: number, max?: number}|null|undefined} hp
 * @returns {string}
 */
/**
 * An actor's `{ value, max }`, or null when HP is unreadable.
 *
 * Blacksmith's resolver: it knows the shapes different systems use and returns
 * null rather than zeros for a missing or unusable pair.
 */
export function getActorHP(actor) {
    const hp = getBlacksmith()?.getActorHP?.(actor);
    return hp ?? null;
}

/**
 * Remaining health as a percentage, or null when HP is unreadable.
 *
 * Blacksmith's `getHealthPercent` clamps to 0-100 and resolves the HP object
 * across the shapes different systems use, returning null for a missing or
 * zero max. Squire used to divide in four places that each disagreed on the
 * edges: one guarded `max > 0`, one clamped, two did neither and produced
 * `NaN%` for a maxless actor.
 *
 * Using the same call Blacksmith's own bars use also keeps Squire's health bar
 * and the Health window from drawing the same actor differently.
 */
export function getHealthPercent(actor) {
    const percent = getBlacksmith()?.getHealthPercent?.(actor);
    return typeof percent === 'number' ? percent : null;
}

/**
 * Open one of Blacksmith's registry windows by id.
 *
 * Squire's tray shows summaries — an XP bar, an MVP leaderboard — and the full
 * views behind them are Blacksmith's. Kept in one place so the ids appear once
 * rather than at every affordance that links to them.
 */
async function openBlacksmithWindow(id, options, unavailableLabel) {
    const blacksmith = getBlacksmith();
    if (typeof blacksmith?.openWindow !== 'function') {
        ui.notifications.warn(`${unavailableLabel} needs Coffee Pub Blacksmith.`);
        return null;
    }
    return options ? blacksmith.openWindow(id, options) : blacksmith.openWindow(id);
}

/**
 * Blacksmith's Status Effects window.
 *
 * `actorUuid` names an actor that may not be selected — the handle shows one
 * actor regardless of canvas selection. Omit it to mean "whatever is selected",
 * which the window follows on its own.
 *
 * `descriptionEffectId` deep-links to an effect already on the actor;
 * `descriptionStatusId` does the same for a configured status that may not be
 * applied yet. Both are part of the window's public options.
 */
export async function openStatusEffectsWindow(options = {}) {
    return openBlacksmithWindow('blacksmith-status-effects', options, 'Status Effects');
}

/** Blacksmith's XP window. */
export async function openXpWindow() {
    return openBlacksmithWindow('blacksmith-xp', null, 'The XP window');
}

/** Blacksmith's party statistics window. */
export async function openPartyStatsWindow() {
    return openBlacksmithWindow('blacksmith-stats-party', null, 'Party statistics');
}

/** Blacksmith's per-player statistics window. `actorId` is required. */
export async function openPlayerStatsWindow(actorId) {
    if (!actorId) return null;
    return openBlacksmithWindow('blacksmith-stats-player', { actorId }, 'Player statistics');
}

/**
 * Remaining health as a percentage from a raw `{ value, max }`, or null.
 *
 * For the template helper, which is handed an HP object rather than an actor.
 * Delegates to Blacksmith, which made this a primitive after the same ask
 * turned up three copies of the clamp inside their own health utility.
 *
 * Null means "no usable HP", not zero — an actor with a max and no readable
 * value is missing data, not a corpse.
 */
export function getHealthPercentFromHP(hp) {
    const percent = getBlacksmith()?.getHealthPercentForHP?.(hp);
    return typeof percent === 'number' ? percent : null;
}

/**
 * Squire's healthbar class for a set of HP values.
 *
 * The thresholds and the banding live in Blacksmith now — `getHealthSeverity*`
 * reads the settings directly, with no window and no instance, so this is safe
 * on every tray build. Blacksmith deliberately does not know Squire's class
 * names, so the mapping stays here.
 *
 * Two behaviour notes inherited from the move. `hurt` is a band Squire never
 * had — damaged but above Injured — and it maps to healthy, which reproduces
 * the previous appearance exactly. And boundaries are now inclusive, so a
 * creature sitting exactly on the bloodied threshold reads as bloodied; the old
 * `<=` chain and Blacksmith's old `<` chain disagreed on that single point.
 */
const SEVERITY_CLASS = {
  healthy:  'squire-tray-healthbar-healthy',
  hurt:     'squire-tray-healthbar-healthy',
  injured:  'squire-tray-healthbar-injured',
  bloodied: 'squire-tray-healthbar-bloodied',
  critical: 'squire-tray-healthbar-critical',
  dead:     'squire-tray-healthbar-dead'
};

export function getHealthbarStatusClass(hp) {
  // Passed through raw. Coercing a missing value to 0 first would hand
  // Blacksmith a usable-looking `{ value: 0, max: 20 }` and get back `dead` —
  // the exact bug they removed from `getHealthSeverityForHP`. Their helper
  // returns null for an unusable pair, which maps to healthy below.
  const severity = getBlacksmith()?.getHealthSeverityForHP?.(hp);
  return SEVERITY_CLASS[severity] ?? SEVERITY_CLASS.healthy;
}

/**
 * The campaign's party roster, as Actor documents in the GM's configured order.
 *
 * Blacksmith owns the party; do not rebuild this from game.actors. Worlds that
 * have not configured one fall back to the historical heuristic so the roster
 * never silently empties. Token actors are excluded — the roster is the
 * campaign's player characters, not whatever synthetic actors exist right now.
 *
 * This is the configured party, NOT "tokens on the canvas" and NOT "actors I
 * own"; those are different concepts with their own call sites.
 *
 * @returns {Actor[]}
 */
export function getPartyActors() {
  const members = getBlacksmith()?.campaign?.getParty?.()?.members;
  if (Array.isArray(members) && members.length) {
    const actors = members.map(member => game.actors.get(member.id)).filter(Boolean);
    if (actors.length) return actors;
  }
  return game.actors.filter(actor => actor?.type === 'character' && actor?.hasPlayerOwner && !actor?.isToken);
}

const HTML_ESCAPES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
});

/**
 * v13: Convert jQuery object to native DOM element, or return native DOM as-is
 * @param {jQuery|HTMLElement} element - jQuery object or native DOM element
 * @returns {HTMLElement|null} Native DOM element
 */
export function getNativeElement(element) {
    if (!element) return null;
    // If it's already a native DOM element, return it
    if (element instanceof HTMLElement || element instanceof Element || element.nodeType) {
        return element;
    }
    // If it's a jQuery object, extract the native element
    if (element.jquery || typeof element.find === 'function') {
        return element[0] || element.get?.(0) || element;
    }
    // If it's a NodeList or array-like, return first element
    if (element.length && element[0]) {
        return getNativeElement(element[0]);
    }
    return element;
}

/**
 * v13: Render template using namespaced API
 * @param {string} template - Template path
 * @param {object} data - Template data
 * @returns {Promise<string>} Rendered HTML
 */
export async function renderTemplate(template, data) {
    return foundry.applications.handlebars.renderTemplate(template, data);
}

/**
 * v13: Get TextEditor implementation using namespaced API
 * @returns {object} TextEditor implementation
 */
export function getTextEditor() {
    return foundry.applications.ux.TextEditor.implementation;
}

export function getTokenDisplayName(token, actor) {
    if (token?.document?.name) return token.document.name;
    if (token?.name) return token.name;
    if (actor?.prototypeToken?.name) return actor.prototypeToken.name;
    if (actor?.name) return actor.name;
    if (token?.actor?.name) return token.actor.name;
    return '';
}

// dnd5e 4+ initializes `system.activities` as an ActivityCollection — a Map
// subclass — so `Object.values()` on it returns [] and any code written against
// the old plain-object shape silently sees "no activities". Normalize to an
// array here; the collection is already sorted by the activity sort order.
export function getActivityList(item) {
    const activities = item?.system?.activities;
    if (!activities) return [];
    if (activities instanceof Map) return Array.from(activities.values());
    return Object.values(activities);
}

/**
 * Every action-economy cost an item can be used at, as an array drawn from
 * 'action' | 'bonus' | 'reaction' | 'special' | 'passive'.
 *
 * The four panels each grew their own copy of this and they disagreed: spells
 * called an activity-less item an 'action', weapons did too but returned null
 * for an activation type they didn't recognise, and features and inventory
 * returned null. That was harmless while the answer only picked a badge, but as
 * a filter those disagreements decide what a chip shows, so there is one answer
 * now.
 *
 * 'passive' is a real answer rather than a missing one. A rope, a suit of armour
 * and Darkvision genuinely cost nothing to use â€” that's what the Passive chip
 * selects and what every other chip excludes. Returning null instead would make
 * such items unreachable from the bar.
 *
 * Every activity counts, not just the first: an item usable as either an action
 * or a bonus action answers to both chips. The badge still shows only
 * {@link getActionType}, because a row has room for one.
 */
export function getActionTypes(item) {
    const types = new Set();

    for (const activity of getActivityList(item)) {
        switch (activity?.activation?.type) {
            case 'action': types.add('action'); break;
            case 'bonus': types.add('bonus'); break;
            case 'reaction': types.add('reaction'); break;
            case 'special': types.add('special'); break;
            // Everything else â€” 'minute', 'hour', 'day', 'legendary', 'lair',
            // or a blank activation on an activity that still exists â€” costs no
            // turn action, so it belongs with the passives rather than being
            // dropped into a gap no chip can reach.
            default: types.add('passive'); break;
        }
    }

    return types.size ? Array.from(types) : ['passive'];
}

/**
 * The one action type shown as a row's badge: the first activity's, so a
 * multi-activity item reads as whatever it mostly is.
 */
export function getActionType(item) {
    return getActionTypes(item)[0];
}

// Helper function to determine weapon type using activities system
function getWeaponType(weapon) {
    if (!weapon || weapon.type !== 'weapon') return null;

    // dnd5e 4+: attack activities carry `attack.type.value` ('melee'/'ranged');
    // blank means "derive from the weapon", so fall through to the properties.
    const attack = getActivityList(weapon).find(a => a?.type === 'attack');
    const attackType = attack?.attack?.type?.value;
    if (attackType === 'ranged') return 'ranged';
    if (attackType === 'melee') return 'melee';

    // If no activities, try to determine from weapon properties
    if (weapon.system.properties?.thr) return 'ranged';  // Has thrown property
    if (weapon.system.properties?.rch) return 'melee';   // Has reach property

    // Default based on weapon range
    return weapon.system.range?.value > 5 ? 'ranged' : 'melee';
}

// Helper function to get damage information using activities system
function getDamageInfo(item) {
    if (!item) return null;

    // dnd5e 4+: damage parts are DamageData objects (`formula` getter, `types`
    // Set, `scaling` schema), not the old [formula, type] tuples.
    for (const activity of getActivityList(item)) {
        const part = activity?.damage?.parts?.[0];
        if (!part) continue;
        const formula = typeof part.formula === 'string' ? part.formula : '';
        if (!formula) continue;
        return {
            formula,
            type: Array.from(part.types ?? [])[0] ?? '',
            scaling: part.scaling?.mode || null
        };
    }

    return null;
}

/**
 * Whether a spell is castable right now.
 *
 * dnd5e 5.x stores `prepared` as a number (0 unprepared / 1 prepared / 2 always
 * prepared), so a truthiness test happens to work — but at-will, innate, and
 * pact spells sit at `prepared: 0` and are castable regardless. Those are
 * exactly the spells NPC auto-favorites picks up, so testing `prepared` alone
 * greyed out most of a caster's handle.
 */
export function isSpellPrepared(item) {
    if (!item || item.type !== 'spell') return false;
    if (['atwill', 'innate', 'pact'].includes(item.system?.method)) return true;
    return Number(item.system?.prepared) > 0;
}

/**
 * Whether a handle favorite should render as usable rather than greyed out.
 * Features are always available; gear has to be equipped; spells have to be
 * castable.
 */
function isHandleFavoriteAvailable(item, isPrepared) {
    if (!item) return false;
    switch (item.type) {
        case 'feat':
            return true;
        case 'spell':
            return isPrepared ?? isSpellPrepared(item);
        case 'weapon':
        case 'equipment':
        case 'consumable':
        case 'tool':
            return !!item.system?.equipped;
        default:
            return false;
    }
}

/**
 * Campaign details, read from Blacksmith.
 *
 * Squire used to collect its own campaign name, party name/size/makeup/level,
 * and rulebook list. Four of those six were never read by anything, and the two
 * that were duplicated fields Blacksmith already owns — so a GM configured the
 * same campaign twice and Squire's copy could silently disagree. Blacksmith's
 * campaign data is now the only source; if it isn't configured, Squire simply
 * doesn't have the value rather than offering a second place to set it.
 *
 * Read-only, and there is no change hook — values are picked up on the next
 * render, which matches how Squire's own settings behaved.
 *
 * @returns {{name: string, party: string, rulebooks: string, prompt: object}}
 */
export function getCampaignContext() {
    const empty = { name: '', party: '', rulebooks: '', prompt: {} };
    try {
        const campaign = getBlacksmith()?.campaign;
        if (!campaign?.getCampaign) return empty;

        const prompt = campaign.getPromptContext?.() ?? {};
        const core = campaign.getCore?.() ?? {};
        const party = campaign.getParty?.() ?? {};

        // Rulebooks come back either as a list or an already-joined string
        // depending on which accessor answers; normalize to display text.
        const rawBooks = prompt.rulebooks ?? core.rulebooks ?? '';
        const rulebooks = Array.isArray(rawBooks) ? rawBooks.filter(Boolean).join(', ') : String(rawBooks || '');

        return {
            name: core.name ?? prompt.campaignName ?? '',
            party: party.name ?? prompt.partyName ?? '',
            rulebooks,
            prompt
        };
    } catch (error) {
        console.warn('Coffee Pub Squire | Could not read campaign data from Blacksmith:', error);
        return empty;
    }
}

/**
 * The container an item is stored inside, or null if it's carried directly.
 *
 * dnd5e keeps contained items in `actor.items` like everything else — membership
 * is just a `system.container` id pointing at the container item. The tray lists
 * items flat, so without this a bag's entire contents are indistinguishable from
 * what the character is actually carrying.
 *
 * @returns {{id: string, name: string, img: string}|null}
 */
/**
 * The two names dnd5e has used for the container item type.
 *
 * `backpack` is the old name and `container` is the current one. A world can
 * hold items of either, so every list that means "is this a bag" has to name
 * both — and every list that named only one has been a bug. The inventory panel
 * dropped every container on modern worlds for exactly this reason.
 */
/**
 * A token's disposition, as a key and a label.
 *
 * Squire's own, not Blacksmith's. Blacksmith has the same four lines inside
 * `CombatBarManager`, but it is a static on an internal manager keyed off a
 * COMBATANT, not part of `api.*` — so there is nothing to consume, and a
 * mapping this thin is not worth an API request. What IS shared, and what this
 * pairs with, are Blacksmith's `--blacksmith-disposition-*` custom properties:
 * those are Foundry's own `CONFIG.Canvas.dispositionColors` verbatim, so a
 * hostile token is the same red in the tray, the combat bar and the canvas.
 *
 * Takes a Token placeable or a TokenDocument. Disposition lives on the DOCUMENT
 * and is per-token, not per-actor — two tokens of one actor can disagree, which
 * is the entire point of it and the reason this never reads `actor`.
 *
 * @param {Token|TokenDocument} token
 * @returns {{key: string, label: string}}
 */
export function getTokenDisposition(token) {
    const D = CONST.TOKEN_DISPOSITIONS;
    const raw = token?.document?.disposition ?? token?.disposition;
    const value = Number.isFinite(Number(raw)) ? Number(raw) : D.NEUTRAL;
    const key = value === D.FRIENDLY ? 'friendly'
        : value === D.HOSTILE ? 'hostile'
        : value === D.SECRET ? 'secret'
        : 'neutral';
    return { key, label: game.i18n.localize(`TOKEN.DISPOSITION.${key.toUpperCase()}`) };
}

export const CONTAINER_ITEM_TYPES = ['container', 'backpack'];

/** Whether this item is a container, under either of dnd5e's names for it. */
export function isContainerItem(item) {
    return CONTAINER_ITEM_TYPES.includes(item?.type);
}

/**
 * What the tray's roll button does to an item.
 *
 * For everything with an activity, `use()` — attack, cast, drink, the normal
 * thing. For a CONTAINER, open it.
 *
 * `use()` on a bag posts a description card to chat, which is dnd5e answering
 * a question nobody asked: a backpack has no activity, so "use it" degrades to
 * "announce it". The useful verb for a bag is open, and the tray already has
 * that verb on the feather. This makes the dice agree with it rather than
 * offering a second, worse thing to do with the same row.
 *
 * Shared by the inventory panel, the favorites panel and the handle, because a
 * container can be favourited and dragged onto the strip like anything else,
 * and three copies of this would be three chances to fix it in only two.
 */
export async function useOrOpenItem(item, event) {
    if (!item) return;
    if (isContainerItem(item)) {
        item.sheet?.render(true);
        return;
    }
    await item.use({}, { event });
}

export function getContainerInfo(item, actor) {
    const containerId = item?.system?.container;
    if (!containerId || !actor) return null;
    const container = actor.items.get(containerId);
    if (!container) return null;
    return {
        id: container.id,
        name: container.name,
        img: container.img || 'icons/svg/item-bag.svg'
    };
}

/**
 * The items stored inside a container, found by the `system.container`
 * back-reference each child carries.
 *
 * The inverse of getContainerInfo: that walks child to parent, this walks parent
 * to children.
 *
 * @returns {Item[]} empty for anything that isn't a container, or an empty one
 */
export function getContainedItems(container, actor) {
    if (!container?.id || !actor) return [];
    return actor.items.filter(item => item.system?.container === container.id);
}

/**
 * Open Blacksmith's Health window, optionally showing specific tokens.
 *
 * The window follows canvas selection on its own, so pass tokens ONLY to show
 * something that isn't selected — a health bar the user clicked, say. Passing
 * the current selection is redundant and can cost a double render.
 *
 * The set is not sticky: the next canvas selection replaces it. "Show this now,
 * then resume following the user" is the contract, which suits a click and
 * would not suit a pin.
 *
 * Tokens must be Token placeables, never Actors and never a bare token.
 */
export async function openHealthWindow(tokens = null) {
    const blacksmith = getBlacksmith();
    if (typeof blacksmith?.openWindow !== 'function') {
        ui.notifications.warn('The Health window needs Coffee Pub Blacksmith.');
        return null;
    }
    const list = Array.isArray(tokens) ? tokens.filter(Boolean) : [];
    return list.length
        ? blacksmith.openWindow('blacksmith-health', { tokens: list })
        : blacksmith.openWindow('blacksmith-health');
}

/**
 * The name a player would recognise for an actor.
 *
 * `actor.name` on a synthetic (unlinked token) actor is the PROTOTYPE's name,
 * so every Cultist on the scene reports itself as "Cultist" — which is what
 * lands in chat cards and toasts unless something asks the token instead. A
 * synthetic actor carries its own TokenDocument, so it can answer this itself.
 *
 * Linked actors fall through to `actor.name` deliberately rather than hunting
 * the canvas for a token: a linked actor can have several placed tokens with
 * different names, and picking one arbitrarily is worse than using the name
 * on the sheet.
 */
export function getActorDisplayName(actor) {
    if (!actor) return '';
    if (actor.isToken && actor.token?.name) return actor.token.name;
    return actor.name ?? '';
}

/**
 * Resolve the actor and item behind an item drop.
 *
 * Prefers the drop payload's uuid. Actor ids are not safe here: a synthetic
 * actor created for an unlinked token carries the BASE actor's id, so
 * `game.actors.get(id)` returns the prototype in the directory — or nothing —
 * for anything sitting on an unlinked token. Dragging a sack off an unlinked
 * NPC is exactly that case.
 *
 * Returns nulls rather than throwing; callers refuse the drop. Deliberately no
 * "import a fresh copy instead" fallback — that path created the item on the
 * target without removing it from the source, which is duplication wearing a
 * transfer's clothes, and it ran before any of the transfer guards.
 *
 * @returns {{sourceActor: Actor|null, sourceItem: Item|null}}
 */
export async function resolveDroppedItem(data, fallbackActorId = null, fallbackItemId = null) {
    if (data?.uuid) {
        try {
            const dropped = await fromUuid(data.uuid);
            if (dropped?.parent?.documentName === 'Actor') {
                return { sourceActor: dropped.parent, sourceItem: dropped };
            }
        } catch (error) {
            console.error(`${MODULE.ID}: could not resolve dropped item uuid:`, error);
        }
    }

    const sourceActor = fallbackActorId ? (game.actors.get(fallbackActorId) ?? null) : null;
    const sourceItem = fallbackItemId ? (sourceActor?.items.get(fallbackItemId) ?? null) : null;
    return { sourceActor, sourceItem };
}

/**
 * Why an item can't be handed to another actor, or null if it can.
 *
 * Containment lives on the child as `system.container`, pointing at the parent's
 * id. Copying a container to another actor mints a new id there, so the contents
 * stay behind on the source pointing at an id that no longer exists: the bag
 * arrives empty and the source keeps items no panel will render. Nothing in the
 * move is reversible once both halves have run.
 *
 * An empty container has nothing to orphan, so it hands over normally — the
 * block is about contents, not about being a container.
 *
 * Blacksmith's api.inventory rejects the same case with this code and count once
 * transfers migrate to it; this stays afterwards as the check that keeps the
 * refusal in front of the quantity dialog rather than after it.
 *
 * @returns {{code: string, contentCount: number, message: string}|null}
 */
export function getTransferBlocker(item, actor) {
    const contents = getContainedItems(item, actor);
    if (!contents.length) return null;

    return {
        code: 'CONTAINER_HAS_CONTENTS',
        contentCount: contents.length,
        message: `${item.name} still holds ${contents.length} item${contents.length === 1 ? '' : 's'}. Unpack it before handing it over.`
    };
}

/**
 * Attach the delegated "open the container this item is stored in" handler.
 * Shared by every panel that renders the container icon so the behaviour and
 * the double-click guard stay in one place.
 *
 * `signal` is optional — Favorites tears down with an AbortController, Weapons
 * and Inventory with a handler array, so the handler is returned for the latter.
 *
 * @returns {Function|undefined} the attached listener
 */
export function activateContainerListener(panel, actor, signal) {
    if (!panel || !actor) return;

    const handler = (event) => {
        const icon = event.target.closest('.item-container-open');
        if (!icon) return;
        event.preventDefault();
        event.stopPropagation();
        const container = actor.items.get(icon.dataset.containerId);
        container?.sheet?.render(true);
    };

    panel.addEventListener('click', handler, signal ? { signal } : undefined);
    return handler;
}

export const registerHelpers = function() {
    // Helper for repeating n times
    Handlebars.registerHelper('times', function(n, options) {
        let result = '';
        for (let i = 0; i < n; i++) {
            options.data.index = i;
            result += options.fn(this);
        }
        return result;
    });

    // Helper for providing a default value
    Handlebars.registerHelper('default', function(value, defaultValue) {
        return value ?? defaultValue;
    });

    // Helper for addition
    Handlebars.registerHelper('add', function(a, b) {
        return a + b;
    });

    // Helper for equality comparison
    Handlebars.registerHelper('eq', function(a, b) {
        return a === b;
    });

    // Helper for checking if value is an array
    Handlebars.registerHelper('isArray', function(value) {
        return Array.isArray(value);
    });

    // Helper for less than or equal comparison
    Handlebars.registerHelper('lte', function(a, b) {
        return a <= b;
    });

    // Helper for multiplication
    Handlebars.registerHelper('multiply', function(a, b) {
        return a * b;
    });

    // Helper for division
    Handlebars.registerHelper('divide', function(a, b) {
        return a / b;
    });

    // Helper to check if array includes a value
    Handlebars.registerHelper('includes', function(array, value) {
        if (!array || !Array.isArray(array)) return false;
        return array.includes(value);
    });

    // Helper to check if array has any items matching a condition
    Handlebars.registerHelper('some', function(array, property, value) {
        if (!array || !array.length) return false;
        return array.some(item => {
            if (property.includes('.')) {
                const parts = property.split('.');
                let current = item;
                for (const part of parts) {
                    current = current[part];
                }
                return current === value;
            }
            return item[property] === value;
        });
    });

    // Helper to concatenate strings
    Handlebars.registerHelper('concat', function(...args) {
        return args.slice(0, -1).join('');
    });

    // Helper to convert string to lowercase
    Handlebars.registerHelper('toLowerCase', function(str) {
        return str.toLowerCase();
    });

    // Helper to convert string to uppercase
    Handlebars.registerHelper('toUpperCase', function(str) {
        return str.toUpperCase();
    });

    // Helper to get panel favorites from actor
    Handlebars.registerHelper('getPanelFavorites', function(actor) {
        if (!actor) return [];
        
        if (typeof actor.getFlag !== 'function') {
            console.warn('getPanelFavorites helper: actor.getFlag is not a function', actor);
            return [];
        }
        
        // Get our module's panel favorites from flags and filter out null values
        const panelFavorites = (actor.getFlag(MODULE.ID, 'favoritePanel') || []).filter(id => id !== null && id !== undefined);
        
        // Create a map of items by ID for quick lookup
        const itemsById = new Map(actor.items.map(item => [item.id, item]));
        
        // Map panel favorites in their original order
        return panelFavorites
            .map(id => itemsById.get(id))
            .filter(item => item) // Remove any undefined items
            .map(item => ({
                id: item.id,
                name: item.name,
                img: item.img || 'icons/svg/item-bag.svg',
                type: item.type,
                system: item.system,
                weaponType: item.type === 'weapon' ? getWeaponType(item) : null,
                damageInfo: getDamageInfo(item)
            }));
    });

    // Helper to check if an array includes a value
    Handlebars.registerHelper('includes', function(array, value) {
        if (!Array.isArray(array)) return false;
        return array.includes(value);
    });

    // The builds kept on the handle. A thin wrapper: utility-builds.js owns the
    // resolving, so the strip and the builder cannot disagree about a build's
    // armour class or which item's picture represents it.
    Handlebars.registerHelper('getHandleBuilds', function(actor) {
        if (typeof actor?.getFlag !== 'function') return [];
        try {
            return getHandleBuilds(actor);
        } catch (error) {
            console.error('Coffee Pub Squire | Failed to read handle builds:', error);
            return [];
        }
    });

    // The worn build's weapons and quick-cast spells. Derived per render, so
    // editing a build changes the strip without anything having to be told.
    Handlebars.registerHelper('getHandleBuildActions', function(actor) {
        if (typeof actor?.getFlag !== 'function') return [];
        try {
            return getHandleBuildActions(actor);
        } catch (error) {
            console.error('Coffee Pub Squire | Failed to read the handle build actions:', error);
            return [];
        }
    });

    // Helper to get handle favorites from actor
    Handlebars.registerHelper('getHandleFavorites', function(actor) {
        if (!actor) return [];
        
        if (typeof actor.getFlag !== 'function') {
            console.warn('getHandleFavorites helper: actor.getFlag is not a function', actor);
            return [];
        }
        
        // The flag IS the order. It used to be re-sorted below to match the
        // Favorites panel, because the handle was a subset of the panel and the
        // panel was where you arranged things. Neither is true any more: items
        // get onto the handle by being dragged there, so the order you dropped
        // them in is the order you meant.
        //
        // Order still decides who survives a short viewport —
        // `HandleManager._trimHandleFavorites()` drops from the END — so the
        // first thing you dragged on is the last thing to disappear.
        const handleFavorites = (actor.getFlag(MODULE.ID, 'favoriteHandle') || []).filter(id => id !== null && id !== undefined);
        
        // Create a map of items by ID for quick lookup
        const itemsById = new Map(actor.items.map(item => [item.id, item]));
        
        // Every one of them. There is no cap: a fixed maximum either cut a
        // character short or left a tall empty bar under the last icon, and
        // which of those you got depended on the character. The strip's own
        // height decides instead, in `_trimHandleFavorites()`.
        return handleFavorites
            .map(id => itemsById.get(id))
            .filter(item => item) // Remove any undefined items
            .map(item => {
                const isPrepared = isSpellPrepared(item);
                return {
                    id: item.id,
                    name: item.name,
                    img: item.img || 'icons/svg/item-bag.svg',
                    type: item.type,
                    system: item.system,
                    isPrepared,
                    isAvailable: isHandleFavoriteAvailable(item, isPrepared),
                    weaponType: item.type === 'weapon' ? getWeaponType(item) : null,
                    damageInfo: getDamageInfo(item)
                };
            });
    });

    // Helper to format numbers (e.g., 1000 -> 1K, 1000000 -> 1M)
    Handlebars.registerHelper('formatNumber', function(number) {
        if (number === undefined || number === null) return '0';
        
        // Convert to number if it's a string
        number = Number(number);
        
        // Handle millions
        if (Math.abs(number) >= 1000000) {
            return (number / 1000000).toFixed(1) + 'M';
        }
        
        // Handle thousands
        if (Math.abs(number) >= 1000) {
            return (number / 1000).toFixed(1) + 'K';
        }
        
        // Add commas for thousands separator
        return number.toLocaleString();
    });

    // Helper function to copy text to clipboard with fallbacks
    Handlebars.registerHelper('formatTimestamp', function(timestamp) {
    if (!timestamp) return '';
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return timestamp; // Return as-is if invalid
        // Format as: "Dec 19, 2024 3:45 PM"
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    } catch (e) {
        return timestamp; // Return as-is on error
    }
});

Handlebars.registerHelper('copyToClipboard', function(text) {
        return copyToClipboard(text);
    });

};

/**
 * Copy text to clipboard with multiple fallback methods
 * @param {string} text - The text to copy
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
export async function copyToClipboard(text) {
    // Method 1: Try modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            ui.notifications.info('Template copied to clipboard!');
            return true;
        } catch (error) {
            console.error('Modern clipboard API failed:', error);
        }
    }
    
    // Method 2: Try legacy execCommand approach
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
            ui.notifications.info('Template copied to clipboard!');
            return true;
        }
    } catch (error) {
        console.error('Legacy clipboard method failed:', error);
    }
    
    // Method 3: Show dialog with text for manual copying
    const content = document.createElement('div');
    const message = document.createElement('p');
    message.textContent = 'Automatic clipboard copy failed. Please manually copy the text below:';
    const manualCopy = document.createElement('textarea');
    manualCopy.readOnly = true;
    manualCopy.value = text;
    manualCopy.style.cssText = 'width: 100%; height: 200px; margin-top: 10px;';
    content.append(message, manualCopy);

    await getBlacksmithDialog().wait({
        title: 'Copy to Clipboard',
        content,
        buttons: [
            { action: 'close', label: 'Close', icon: 'fa-solid fa-xmark', default: true }
        ],
        closeValue: null
    });
    
    return false;
}
