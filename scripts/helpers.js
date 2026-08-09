import { MODULE, SQUIRE, TEMPLATES } from './const.js';
import { QuestParser, getQuestStatusDisplayLabel } from './utility-quest-parser.js';
// REMOVED: import { QuestPin } from './quest-pin.js'; - Migrated to Blacksmith API
import { trackModuleTimeout, clearTrackedTimeout } from './timer-utils.js';

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
    moduleId: MODULE.ID
  });
}

/**
 * Adapt Squire's two remaining complex JSON-import surfaces to Blacksmith's
 * DialogV2 wait contract while their eventual importer replacement is blocked
 * on the public Blacksmith Importer API.
 */
export async function showBlacksmithWait(config = {}, renderOptions = {}) {
  const buttons = Object.entries(config.buttons || {}).map(([action, button]) => ({
    action,
    label: button?.label || action,
    icon: String(button?.icon || '').match(/class=["'][^"']*?(fa-(?:solid|regular|brands)\s+fa-[\w-]+)[^"']*["']/)?.[1]
      || String(button?.icon || '').match(/(fa-(?:solid|regular|brands)\s+fa-[\w-]+)/)?.[1]
      || undefined,
    default: config.default === action,
    destructive: Boolean(button?.destructive),
    disabled: Boolean(button?.disabled),
    callback: typeof button?.callback === 'function' ? form => button.callback(form) : undefined
  }));
  const onRender = config.onRender || config.render || renderOptions.onRender || renderOptions.render;
  const outcome = await getBlacksmithDialog().wait({
    title: config.title || '',
    content: config.content || '',
    buttons,
    onRender: root => {
      if (typeof onRender === 'function') onRender(root);
      root?.querySelectorAll?.('.transfer-dialog input[type="range"][name^="quantity_"]').forEach(input => {
        const container = input.closest('.transfer-quantity');
        const selected = container?.querySelector('.quantity-label');
        const remaining = container?.querySelector('.range-value');
        const update = () => {
          const value = Number(input.value) || 1;
          const maximum = Number(input.max) || value;
          if (selected) selected.textContent = String(value);
          if (remaining) remaining.textContent = String(Math.max(0, maximum - value));
        };
        input.addEventListener('input', update);
        update();
      });
    },
    closeValue: null,
    cancelValue: null,
    classes: [...(config.classes || []), ...(renderOptions.classes || [])],
    position: config.position || { width: config.width || renderOptions.width || 600 }
  });
  if (outcome.action === 'close' && typeof config.close === 'function') {
    await config.close();
  }
  return outcome;
}

/**
 * Resolve the shared semantic health-bar color class.
 * Party, handle, and Health tool surfaces all consume this same scale.
 *
 * @param {{value?: number, max?: number}|null|undefined} hp
 * @returns {string}
 */
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
 * Escape text for safe interpolation into an HTML string.
 *
 * Needed wherever we hand-build markup that a template renders through a
 * triple-stash: Handlebars won't escape it, and codex/quest names are
 * user-authored.
 *
 * Regex rather than a `createElement`/`textContent`/`innerHTML` round-trip.
 * This runs per related name and per location level on every codex render — a
 * real 314-entry codex is thousands of calls per render, and building a DOM
 * node for each is orders of magnitude more expensive than a replace. The DOM
 * approach also leaves `"` and `'` unescaped, which is wrong for the attribute
 * contexts this is used in.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

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

/**
 * v13: Get ContextMenu class using namespaced API
 * @returns {class} ContextMenu class
 */
export function getContextMenu() {
    return foundry.applications.ux.ContextMenu.implementation;
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
 * Fill an import template's `[ADD-*-HERE]` placeholders from campaign data.
 *
 * A placeholder whose value isn't configured in Blacksmith is left in place —
 * the point of a placeholder is to show what's missing, and blanking it would
 * hide the gap rather than prompt the GM to fill it.
 *
 * @param {string} template
 * @returns {string}
 */
export function fillCampaignPlaceholders(template) {
    if (typeof template !== 'string') return template;

    const campaign = getCampaignContext();
    const p = campaign.prompt ?? {};

    const substitutions = {
        '[ADD-RULEBOOKS-HERE]': campaign.rulebooks,
        '[ADD-CAMPAIGN-HERE]': campaign.name,
        '[ADD-PARTY-HERE]': campaign.party,
        '[ADD-PARTY-SIZE-HERE]': p.partySize,
        '[ADD-PARTY-LEVEL-HERE]': p.partyLevel,
        '[ADD-PARTY-MAKEUP-HERE]': p.partyMakeup,
        '[ADD-PARTY-CLASSES-HERE]': Array.isArray(p.partyClasses) ? p.partyClasses.join(', ') : p.partyClasses,
        '[ADD-REALM-HERE]': p.realm,
        '[ADD-REGION-HERE]': p.region,
        '[ADD-SITE-HERE]': p.site,
        '[ADD-AREA-HERE]': p.area
    };

    let output = template;
    for (const [token, value] of Object.entries(substitutions)) {
        const text = value === null || value === undefined ? '' : String(value).trim();
        if (text) output = output.split(token).join(text);
    }
    return output;
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

/**
 * How many favorites the tray handle may show at once.
 *
 * Lives here rather than on FavoritesPanel so the Handlebars helper can read it
 * without helpers.js importing a panel — panels already import helpers, and the
 * cycle would be gratuitous. FavoritesPanel delegates here.
 */
export function getHandleFavoriteLimit() {
    try {
        const limit = Number(game.settings.get(MODULE.ID, 'handleFavoritesMax'));
        if (Number.isFinite(limit) && limit > 0) return Math.floor(limit);
    } catch (error) {
        // Settings not registered yet — fall back to the default.
    }
    return 5;
}

// Helper function to get quest number from UUID
function getQuestNumber(questUuid) {
    let hash = 0;
    for (let i = 0; i < questUuid.length; i++) {
        hash = ((hash << 5) - hash) + questUuid.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash) % 100 + 1;
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

    // Helper to get handle favorites from actor
    Handlebars.registerHelper('getHandleFavorites', function(actor) {
        if (!actor) return [];
        
        if (typeof actor.getFlag !== 'function') {
            console.warn('getHandleFavorites helper: actor.getFlag is not a function', actor);
            return [];
        }
        
        // Get our module's handle favorites and panel favorites from flags
        const handleFavorites = (actor.getFlag(MODULE.ID, 'favoriteHandle') || []).filter(id => id !== null && id !== undefined);
        const panelFavorites = (actor.getFlag(MODULE.ID, 'favoritePanel') || []).filter(id => id !== null && id !== undefined);
        
        // Create a map of items by ID for quick lookup
        const itemsById = new Map(actor.items.map(item => [item.id, item]));
        
        // Sort handle favorites to match the Favorites panel order exactly.
        //
        // The handle's 180° rotation is cancelled in CSS (`flex-direction:
        // row-reverse` on .handle-favorites), the same way pinned quests already
        // handle it — so DOM order is now visual order and this sort can be a
        // plain ascending one. It used to sort descending to compensate, which
        // rendered correctly but left the array backwards, so "keep the top N"
        // silently kept the bottom N.
        const sortedHandleFavorites = [...handleFavorites].sort((a, b) => {
            const aIndex = panelFavorites.indexOf(a);
            const bIndex = panelFavorites.indexOf(b);

            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;

            // Anything in the panel list outranks an orphan.
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return 0;
        });

        // Map handle favorites in the sorted order, capped at the configured
        // limit. Normalization writes the truncation back to the flag on actor
        // init; this slice keeps the render correct in between.
        return sortedHandleFavorites
            .slice(0, getHandleFavoriteLimit())
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

    // Helper to render a task with GM hints and treasure unlocks (show treasure always for GM)
    Handlebars.registerHelper('renderTask', function(task, isGM, options) {
        if (!task || typeof task !== 'object') {
            return new Handlebars.SafeString('');
        }
        
        let html = '';
        // Start the task text with tooltip if GM hint exists
        if (isGM && task.gmHint) {
            html += `<span data-tooltip=\"GM Note: ${task.gmHint}\">${task.text || ''}</span>`;
        } else {
            html += task.text || '';
        }
        // Only GMs see the treasure text in the objective list
        if (isGM && Array.isArray(task.treasureUnlocks) && task.treasureUnlocks.length > 0) {
            if (!task.completed) {
                html += ' <span class="locked-objective-treasure">';
                html += '<i class="fa-solid fa-lock"></i> ';
                html += task.treasureUnlocks.join(', ');
                html += '</span>';
            } else {
                html += ' <span class="unlocked-objective-treasure">';
                html += task.treasureUnlocks.join(', ');
                html += '</span>';
            }
        }
        return new Handlebars.SafeString(html);
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

// Track tooltip timeouts for cleanup
const tooltipTimeouts = new Map();

/**
 * Create or get a shared quest tooltip element
 * @param {string} tooltipId - The ID for the tooltip element
 * @returns {HTMLElement} The tooltip element
 */
export function getOrCreateQuestTooltip(tooltipId) {
    let tooltip = document.getElementById(tooltipId);
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = tooltipId;
        tooltip.className = 'quest-tooltip-container';
        document.body.appendChild(tooltip);
    }
    return tooltip;
}

/**
 * Show quest tooltip with consistent formatting and delay
 * @param {string} tooltipId - The ID for the tooltip element
 * @param {Object} data - Tooltip data object
 * @param {string} data.questName - Name of the quest
 * @param {number} data.objectiveIndex - Index of the objective (0-based)
 * @param {string} data.objectiveState - State of the objective (active, completed, failed, hidden)
 * @param {string} data.description - Description text for the objective
 * @param {string} data.controls - Controls text to display
 * @param {boolean} data.isGM - Whether the current user is a GM
 * @param {Object} event - Mouse event for positioning
 * @param {number} delay - Delay in milliseconds before showing tooltip (default: 500ms)
 */
export async function showQuestTooltip(tooltipId, data, event, delay = 500, autoHide = 4000) {
    try {
        // Validate input parameters
        if (!tooltipId || typeof tooltipId !== 'string') {
            console.error('showQuestTooltip: Invalid tooltipId parameter', { tooltipId, data });
            return;
        }

        if (!data || typeof data !== 'object') {
            console.error('showQuestTooltip: Invalid data parameter', { tooltipId, data });
            return;
        }

        if (!event) {
            console.error('showQuestTooltip: Missing event parameter', { tooltipId, data });
            return;
        }

        // Clear any existing timeout for this tooltip
        if (tooltipTimeouts.has(tooltipId)) {
            clearTrackedTimeout(tooltipTimeouts.get(tooltipId));
            tooltipTimeouts.delete(tooltipId);
        }
        
        // Set new timeout to show tooltip after delay
        const timeoutId = trackModuleTimeout(async () => {
            try {
                const tooltip = getOrCreateQuestTooltip(tooltipId);
                const template = TEMPLATES.TOOLTIP_QUEST;
                // Render the tooltip using the Handlebars template
                const html = await renderTemplate(template, data);
                tooltip.innerHTML = html;
                tooltip.style.display = 'block';
                // Position tooltip near mouse with small offset
                const mouse = event.data?.originalEvent || event;
                if (mouse && typeof mouse.clientX === 'number' && typeof mouse.clientY === 'number') {
                    tooltip.style.left = (mouse.clientX + 16) + 'px';
                    tooltip.style.top = (mouse.clientY + 8) + 'px';
                }
                // Clear the timeout reference
                tooltipTimeouts.delete(tooltipId);

                if (autoHide > 0) {
                    const hideId = trackModuleTimeout(() => {
                        hideQuestTooltip(tooltipId);
                    }, autoHide);
                    tooltipTimeouts.set(`${tooltipId}-autohide`, hideId);
                }
            } catch (error) {
                console.error('showQuestTooltip: Error in timeout callback', { tooltipId, error: error.message });
            }
        }, delay);
        // Store the timeout reference
        tooltipTimeouts.set(tooltipId, timeoutId);
    } catch (error) {
        console.error('showQuestTooltip: Unexpected error', { tooltipId, error: error.message });
    }
}

/**
 * Hide quest tooltip
 * @param {string} tooltipId - The ID for the tooltip element
 */
export function hideQuestTooltip(tooltipId) {
    // Clear any pending timeout for this tooltip
    if (tooltipTimeouts.has(tooltipId)) {
        clearTrackedTimeout(tooltipTimeouts.get(tooltipId));
        tooltipTimeouts.delete(tooltipId);
    }
    const autoKey = `${tooltipId}-autohide`;
    if (tooltipTimeouts.has(autoKey)) {
        clearTrackedTimeout(tooltipTimeouts.get(autoKey));
        tooltipTimeouts.delete(autoKey);
    }
    
    const tooltip = document.getElementById(tooltipId);
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

/**
 * Clean task text by removing GM notes and treasure links
 * @param {string} text - The raw task text
 * @returns {string} The cleaned task text
 */
export function cleanTaskText(text) {
    if (!text) return text;
    
    // Remove GM notes between || || (including the pipes)
    text = text.replace(/\|\|[^|]*\|\|/g, '');
    
    // Remove treasure links between (( )) (including the parentheses)
    text = text.replace(/\(\([^)]*\)\)/g, '');
    
    // Clean up extra whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
}

/**
 * Get task text for a specific objective from quest data
 * @param {Object} questData - The quest data object
 * @param {number} objectiveIndex - The index of the objective (0-based)
 * @returns {string} The task text for the objective
 */
export function getTaskText(questData, objectiveIndex) {
    try {
        if (!questData) return 'Objective';

        // Parse the quest content to get tasks
        let content = '';
        if (typeof questData.text?.content === 'string') {
            content = questData.text.content;
        } else if (typeof questData.text === 'string') {
            content = questData.text;
        }

        if (!content) return 'Objective';

        // Parse tasks from the content
        const tasksMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
        if (tasksMatch) {
            const tasksHtml = tasksMatch[1];
            const parser = new DOMParser();
            const ulDoc = parser.parseFromString(`<ul>${tasksHtml}</ul>`, 'text/html');
            const ul = ulDoc.querySelector('ul');
            if (ul) {
                const liList = Array.from(ul.children);
                const li = liList[objectiveIndex];
                if (li) {
                    // Get the text content, removing any HTML tags
                    let rawText = li.textContent.trim();
                    // Clean the text to remove GM notes and treasure links
                    return cleanTaskText(rawText);
                }
            }
        }

        return 'Objective';
    } catch (error) {
        console.error('Error getting task text:', error);
        return 'Objective';
    }
}

/**
 * Async helper to fetch quest and objective data for tooltips
 * @param {string} questPageUuid - The quest UUID
 * @param {number} objectiveIndex - The objective index (0-based)
 * @returns {Promise<Object|null>} Tooltip data or null if not found
 */
export async function getObjectiveTooltipData(questPageUuid, objectiveIndex, pinQuestState = null, pinObjectiveState = null) {
    try {
        // Find the journal page by UUID
        let page = null;
        for (const journal of game.journal.contents) {
            page = journal.pages.find(p => p.uuid === questPageUuid);
            if (page) break;
        }
        if (!page) {
            console.error('SQUIRE | QUESTS getObjectiveTooltipData: Journal page not found', { questPageUuid, objectiveIndex });
            return null;
        }

        // Enrich the page HTML if needed
        const TextEditor = getTextEditor();
        const enrichedHtml = await TextEditor.enrichHTML(page.text.content, { async: true });
        // Parse the quest entry using the source of truth
        const entry = await QuestParser.parseSinglePage(page, enrichedHtml);
        if (!entry) {
            console.error('SQUIRE | QUESTS getObjectiveTooltipData: Failed to parse quest entry', { questPageUuid, objectiveIndex });
            return null;
        }

        // Get the relevant objective/task
        const task = entry.tasks[objectiveIndex];
        if (!task) {
            console.error('SQUIRE | QUESTS getObjectiveTooltipData: Objective not found', { questPageUuid, objectiveIndex });
            return null;
        }

        let visibility;
        if (game.user.isGM) {
            // Use pin's actual states if provided, otherwise fall back to parsed entry/task states
            const actualQuestState = pinQuestState || entry.state;
            const actualObjectiveState = pinObjectiveState || task.state;
            
            // Check quest-level visibility first
            if (actualQuestState === 'hidden') {
                visibility = 'Visible to GM';
            } else if (actualObjectiveState === 'hidden') {
                visibility = 'Visible to GM';
            } else {
                visibility = 'Visible to All';
            }
        }
        
        // For non-GM users, if the objective is hidden, show placeholder text
        let questName = entry.name;
        let description = task.text || 'Objective';
        
        if (!game.user.isGM && task.state === 'hidden') {
            questName = 'Objective Not Discovered';
            description = 'You have not uncovered this quest objective yet.';
        }
        
        // Check if there's a pin nearby for hidden objectives
        let objectiveNearby = false;
        if (task.state === 'hidden') {
            // MIGRATED TO BLACKSMITH API: Check if objective pin exists via Blacksmith API
            const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
            if (pins?.isAvailable()) {
                const allPins = pins.list({ moduleId: MODULE.ID, sceneId: canvas.scene?.id });
                objectiveNearby = allPins.some(pin => 
                    pin.config?.questUuid === questPageUuid && 
                    pin.config?.objectiveIndex === objectiveIndex
                );
            }
        }
        
        return {
            questName,
            questNumber: getQuestNumber(page.uuid),
            objectiveIndex,
            objectiveNumber: objectiveIndex + 1,
            objectiveNumberPadded: String(objectiveIndex + 1).padStart(2, '0'),
            objectiveState: pinObjectiveState || task.state || 'active',
            description,
            gmHint: (game.user.isGM && task.gmHint) ? task.gmHint : undefined,
            visibility,
            isGM: game.user.isGM,
            objectiveNearby
        };
    } catch (error) {
        console.error('SQUIRE | QUESTS getObjectiveTooltipData: Unexpected error', { questPageUuid, objectiveIndex, error: error.message });
        return null;
    }
}

/**
 * Async helper to fetch quest data for quest-level tooltips
 * @param {string} questPageUuid - The quest UUID
 * @returns {Promise<Object|null>} Tooltip data or null if not found
 */
export async function getQuestTooltipData(questPageUuid, pinQuestState = null) {
    try {
        // Find the journal page by UUID
        let page = null;
        for (const journal of game.journal.contents) {
            page = journal.pages.find(p => p.uuid === questPageUuid);
            if (page) break;
        }
        if (!page) {
            console.error('SQUIRE | QUESTS getQuestTooltipData: Journal page not found', { questPageUuid });
            return null;
        }

        // Enrich the page HTML if needed
        const TextEditor = getTextEditor();
        const enrichedHtml = await TextEditor.enrichHTML(page.text.content, { async: true });
        // Parse the quest entry using the source of truth
        const entry = await QuestParser.parseSinglePage(page, enrichedHtml);
        if (!entry) {
            console.error('SQUIRE | QUESTS getQuestTooltipData: Failed to parse quest entry', { questPageUuid });
            return null;
        }

        // Get quest status and objectives info
        const totalObjectives = entry.tasks?.length || 0;
        const completedObjectives = entry.tasks?.filter(task => task.state === 'completed').length || 0;
        const questStatusRaw = entry.status || 'Not Started';
        const questStatus = getQuestStatusDisplayLabel(questStatusRaw);
        
        // Convert quest status to CSS-friendly class name (spaces to hyphens, lowercase)
        const questStatusClass = questStatusRaw.toLowerCase().replace(/\s+/g, '-');
        
        // Get participants info for portraits - use the already parsed data
        const participants = entry.participants || [];

        // Get location info if available
        let location = '';
        if (entry.location) {
            location = entry.location;
        } else if (entry.gmNotes && entry.gmNotes.location) {
            location = entry.gmNotes.location;
        }

        // Get plot hook if GM
        let plotHook = '';
        if (game.user.isGM && entry.plotHook) {
            plotHook = entry.plotHook;
        }

        let visibility;
        if (game.user.isGM) {
            // Use pin's actual state if provided, otherwise fall back to parsed entry state
            const actualQuestState = pinQuestState || entry.state;
            if (actualQuestState === 'hidden') {
                visibility = 'Visible to GM';
            } else {
                visibility = 'Visible to All';
            }
        }
        
        // For non-GM users, if the quest is hidden, show placeholder text
        let questName = entry.name;
        let description = entry.description || 'Quest description not available';
        
        if (!game.user.isGM && entry.state === 'hidden') {
            questName = 'Quest Not Discovered';
            description = 'You have not uncovered this quest yet.';
        }
        
        // Get quest category icon based on category
        let questCategoryIcon = '';
        if (entry.category === 'Main Quest') {
            questCategoryIcon = '<i class="fa-solid fa-flag" title="Main Quest"></i>';
        } else if (entry.category === 'Side Quest') {
            questCategoryIcon = '<i class="fa-solid fa-map-signs" title="Side Quest"></i>';
        } else {
            questCategoryIcon = '<i class="fa-solid fa-question" title="Quest"></i>';
        }

        const result = {
            questName,
            questNumber: getQuestNumber(page.uuid),
            questCategory: entry.category || 'Quest',
            questCategoryIcon,
            questStatus,
            questStatusClass,
            totalObjectives,
            completedObjectives,
            description,
            plotHook,
            location,
            participants,
            visibility,
            isGM: game.user.isGM
        };
        
        return result;
    } catch (error) {
        console.error('SQUIRE | QUESTS getQuestTooltipData: Unexpected error', { questPageUuid, error: error.message });
        return null;
    }
}

