import { MODULE, SQUIRE, TEMPLATES } from './const.js';
import { moduleDelay } from './timer-utils.js';
import { renderTemplate } from './helpers.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  const m = game.modules.get('coffee-pub-blacksmith');
  return m && m.api;
}

// Configuration object for print functionality
const PRINT_CONFIG = {
    IMAGE_LOAD_TIMEOUT: 5000,
    SKILL_COLUMNS: 2,
    DEFAULT_ICON: 'fa-question',
    ERROR_MESSAGES: {
        NO_ACTOR: 'No actor provided for printing',
        INVALID_ACTOR: 'Invalid actor data structure',
        POPUP_BLOCKED: 'Pop-up blocked. Please allow pop-ups for this site.',
        TEMPLATE_ERROR: 'Failed to render character sheet template'
    }
};

function splitDescription(desc) {
    if (!desc) return { mainDescription: '', additionalDetails: '' };
    // Use regex to find <details>...</details>
    const detailsMatch = desc.match(/<details[^>]*>([\s\S]*?)<\/details>/i);
    if (detailsMatch) {
        // Main is everything before <details>
        const mainDescription = desc.split(detailsMatch[0])[0].trim();
        // Additional is the content inside <details>
        // Remove <summary> if present
        let additionalDetails = detailsMatch[1].replace(/<summary[^>]*>[\s\S]*?<\/summary>/i, '').trim();
        return { mainDescription, additionalDetails };
    } else {
        return { mainDescription: desc, additionalDetails: '' };
    }
}

function getDisplayWeight(weight) {
    if (weight == null) return '—';
    
    if (typeof weight === 'object' && weight !== null) {
        if ('value' in weight) {
            const value = weight.value;
            return typeof value === 'number' || typeof value === 'string' ? value : '—';
        }
        return '—';
    }
    
    return typeof weight === 'number' || typeof weight === 'string' ? weight : '—';
}

/** Format appearance text: put each "Label: Value" pair on its own line for readability. */
function formatAppearanceForPrint(text) {
    if (!text || typeof text !== 'string') return '';
    const trimmed = text.trim();
    if (!trimmed) return '';
    // Insert line breaks before " Label:" patterns (space + CapitalWord + colon) so each pair gets its own line
    return trimmed.replace(/\s+([A-Z][a-z]+:)/g, '<br>$1');
}

/** Extract display string from D&D 5e details field (may be string or { value: string }). */
function getDetailValue(field) {
    if (field == null || field === '') return '';
    if (typeof field === 'object' && field !== null && 'value' in field) {
        const v = field.value;
        return typeof v === 'string' ? v.trim() : (typeof v === 'number' ? String(v) : '');
    }
    return typeof field === 'string' ? field.trim() : '';
}

/** Resolve race/species from actor (details.creatureTypes, details.race, system.race, or species items). */
function resolveRace(actor) {
    const details = (actor && actor.system && actor.system.details) ? actor.system.details : {};
    // creatureTypes (D&D 5e 5.5): { value, subtype, custom }
    const ct = details.creatureTypes;
    if (ct) {
        const parts = [];
        if (typeof ct === 'string') return ct.trim();
        if (ct.value) parts.push(ct.value);
        if (ct.subtype) parts.push(`(${ct.subtype})`);
        if (ct.custom) parts.push(ct.custom);
        if (parts.length) return parts.join(' ').trim();
    }
    const raceVal = getDetailValue(details.race) || (actor && actor.system && actor.system.race && actor.system.race.value) || '';
    if (raceVal) return typeof raceVal === 'string' ? raceVal.trim() : String(raceVal);
    const speciesItem = actor && actor.items ? actor.items.find(i => i && (i.type === 'species' || i.type === 'race')) : null;
    return (speciesItem && speciesItem.name) ? speciesItem.name : '';
}

/** Resolve background from actor (details.background or background items). */
function resolveBackground(actor) {
    const details = (actor && actor.system && actor.system.details) ? actor.system.details : {};
    const bgVal = getDetailValue(details.background) || (details.background && details.background.value) || '';
    if (bgVal) return typeof bgVal === 'string' ? bgVal.trim() : String(bgVal);
    const bgItem = actor && actor.items ? actor.items.find(i => i && i.type === 'background') : null;
    return (bgItem && bgItem.name) ? bgItem.name : '';
}

/** Resolve size label from actor.system.traits.size. */
function resolveSize(actor) {
    const size = (actor && actor.system && actor.system.traits) ? actor.system.traits.size : null;
    if (!size) return '';
    if (typeof size === 'string') return size;
    const val = (size && size.value != null) ? size.value : size;
    if (!val) return '';
    const sizes = (typeof CONFIG !== 'undefined' && CONFIG.DND5E) ? CONFIG.DND5E.actorSizes : null;
    const sizeEntry = sizes && sizes[val];
    const label = (sizeEntry && sizeEntry.label) || sizeEntry || val;
    return typeof label === 'string' ? label : String(val);
}

/** Build array of labels from a D&D 5e trait (senses, armor, weapons, languages, resistances). */
function buildTraitLabels(trait, labelMap) {
    if (!trait) return [];
    const labels = [];
    const raw = trait.value;
    let values = [];

    if (Array.isArray(raw)) {
        values = raw;
    } else if (raw instanceof Set) {
        values = Array.from(raw);
    } else if (raw instanceof Map) {
        values = Array.from(raw.keys());
    } else if (raw && typeof raw === 'object') {
        values = Object.keys(raw).filter(function (key) {
            const entry = raw[key];
            if (typeof entry === 'boolean') return entry;
            if (entry instanceof Set || Array.isArray(entry)) return Array.from(entry).length > 0;
            if (entry instanceof Map) return entry.size > 0;
            if (entry && typeof entry === 'object' && 'value' in entry) return !!entry.value;
            return true;
        });
    } else if (typeof raw === 'string') {
        values = raw.split(/[,;|]+/).map(function (v) { return v.trim(); }).filter(Boolean);
    }

    const resolveLabel = function (val) {
        if (!labelMap || val === undefined || val === null) return val;
        const entry = labelMap[val] || (labelMap instanceof Map ? labelMap.get(val) : null);
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object' && entry.label) return entry.label;
        if (typeof val === 'string') return val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
        return String(val);
    };

    const rawLabels = trait.labels || trait.label;
    if (Array.isArray(rawLabels)) {
        labels.push.apply(labels, rawLabels);
    } else if (rawLabels instanceof Set) {
        labels.push.apply(labels, Array.from(rawLabels));
    } else if (typeof rawLabels === 'string') {
        labels.push.apply(labels, rawLabels.split(/[,;|]+/).map(function (v) { return v.trim(); }).filter(Boolean));
    }

    values.forEach(function (val) {
        const lbl = resolveLabel(val);
        if (lbl && labels.indexOf(lbl) === -1) labels.push(lbl);
    });

    const custom = (trait.custom || '').trim();
    if (custom && labels.indexOf(custom) === -1) labels.push(custom);

    return labels;
}

/** Prepare stats & combat data (initiative, speed, HD, TMP, saves, senses, proficiencies, languages, XP). */
function prepareStatsAndCombat(actor) {
    const sys = actor && actor.system ? actor.system : {};
    const attrs = sys.attributes || {};
    const details = sys.details || {};
    const traits = sys.traits || {};

    const init = (attrs.init != null) ? attrs.init : (attrs.initiative != null ? attrs.initiative : null);
    const initTotal = (init && typeof init === 'object' && init.total != null) ? init.total : (typeof init === 'number' ? init : null);
    const initiative = (initTotal != null) ? (initTotal >= 0 ? '+' : '') + initTotal : '';

    const mov = attrs.movement || {};
    const speedTypes = ['walk', 'fly', 'swim', 'climb', 'burrow'];
    const speeds = [];
    for (let i = 0; i < speedTypes.length; i++) {
        const type = speedTypes[i];
        let v = mov[type];
        if (v && typeof v === 'object' && 'value' in v) v = v.value;
        if (v != null && v !== '' && !isNaN(Number(v)) && Number(v) > 0) {
            const mt = (typeof CONFIG !== 'undefined' && CONFIG.DND5E && CONFIG.DND5E.movementTypes) ? CONFIG.DND5E.movementTypes[type] : null;
            const label = (mt && typeof mt === 'object' && mt.label) ? mt.label : (typeof mt === 'string' ? mt : type.charAt(0).toUpperCase() + type.slice(1));
            speeds.push({ type: type, label: label, value: Number(v) });
        }
    }
    const speedUnits = mov.units || 'ft';

    const hp = attrs.hp || {};
    const hd = attrs.hd || {};
    const hdValue = (hd.value != null) ? hd.value : (hd.max != null ? hd.max : null);
    const hdMax = (hd.max != null) ? hd.max : hdValue;
    const hitDice = (hdValue != null && hdMax != null) ? String(hdValue) + '/' + String(hdMax) : '';

    const tmp = (hp.temp != null) ? hp.temp : null;
    const tempHp = (tmp !== null && tmp !== undefined && tmp !== '') ? String(tmp) : '';

    const abilities = sys.abilities || {};
    const abilityIds = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    const savingThrows = [];
    for (let i = 0; i < abilityIds.length; i++) {
        const aid = abilityIds[i];
        const ab = abilities[aid];
        if (!ab) continue;
        const save = ab.save || {};
        const mod = (save.value != null) ? save.value : ab.mod;
        const prof = save.prof;
        const total = (mod != null) ? mod : 0;
        const labelMap = (typeof CONFIG !== 'undefined' && CONFIG.DND5E && CONFIG.DND5E.abilities) ? CONFIG.DND5E.abilities : {};
        const label = (labelMap[aid] && labelMap[aid].label) ? labelMap[aid].label : aid.toUpperCase();
        savingThrows.push({
            ability: aid,
            label: label,
            mod: total,
            proficient: !!prof,
            display: (total >= 0 ? '+' : '') + total + (prof ? ' (prof)' : '')
        });
    }

    const drLabels = (typeof CONFIG !== 'undefined' && CONFIG.DND5E && CONFIG.DND5E.damageResistanceTypes) ? CONFIG.DND5E.damageResistanceTypes : {};
    const senses = buildTraitLabels(traits.senses, null);
    const resistances = buildTraitLabels(traits.dr, drLabels);
    const armorProfs = buildTraitLabels(traits.armorProfs || traits.armor, (typeof CONFIG !== 'undefined' && CONFIG.DND5E && CONFIG.DND5E.armorProficiencies) ? CONFIG.DND5E.armorProficiencies : null);
    const weaponProfs = buildTraitLabels(traits.weaponProfs || traits.weapon, (typeof CONFIG !== 'undefined' && CONFIG.DND5E && CONFIG.DND5E.weaponProficiencies) ? CONFIG.DND5E.weaponProficiencies : null);
    const languages = buildTraitLabels(traits.languages, (typeof CONFIG !== 'undefined' && CONFIG.DND5E && CONFIG.DND5E.languages) ? CONFIG.DND5E.languages : null);

    const xp = details.xp || {};
    const xpVal = (xp.value != null) ? xp.value : 0;
    const xpMax = (xp.max != null) ? xp.max : 0;
    const experience = (xpMax > 0) ? String(xpVal) + ' / ' + String(xpMax) : (xpVal ? String(xpVal) : '');

    return {
        initiative,
        speeds,
        speedUnits,
        hitDice,
        tempHp,
        savingThrows,
        senses,
        resistances,
        armorProfs,
        weaponProfs,
        languages,
        experience
    };
}

/** Prepare inventory extras: encumbrance, currency. */
function prepareInventoryExtras(actor) {
    const sys = actor && actor.system ? actor.system : {};
    const attrs = sys.attributes || {};
    const enc = attrs.encumbrance || {};
    const cur = sys.currency || {};

    const encVal = (enc.value != null) ? enc.value : (enc.current != null ? enc.current : null);
    const encMax = (enc.max != null) ? enc.max : (enc.limit != null ? enc.limit : null);
    const encumbrance = (encVal != null && encMax != null) ? String(encVal) + ' / ' + String(encMax) : '';

    const gp = (cur.gp != null) ? cur.gp : 0;
    const sp = (cur.sp != null) ? cur.sp : 0;
    const cp = (cur.cp != null) ? cur.cp : 0;
    const ep = (cur.ep != null) ? cur.ep : 0;
    const pp = (cur.pp != null) ? cur.pp : 0;
    const currency = { gp, sp, cp, ep, pp };
    const hasAnyCurrency = !!(gp || sp || cp || ep || pp);

    return { encumbrance, currency, hasAnyCurrency };
}

/** Build cover page data: name, race, class+level, portrait. */
function prepareCoverPage(actor) {
    const race = resolveRace(actor);
    const background = resolveBackground(actor);
    const classes = (actor && actor.items) ? actor.items.filter(i => i && i.type === 'class') : [];
    const totalLevel = classes.reduce((sum, c) => sum + ((c.system && c.system.levels != null) ? c.system.levels : 0), 0);
    const classNames = classes.map(c => c.name).filter(Boolean);
    const detailsLevel = (actor && actor.system && actor.system.details) ? actor.system.details.level : null;
    const classAndLevel = classNames.length
        ? `${classNames.join(' / ')} ${totalLevel > 0 ? `• Level ${totalLevel}` : ''}`.trim()
        : (detailsLevel != null ? detailsLevel : '');

    return {
        name: (actor && actor.name) ? actor.name : '',
        race,
        background,
        classAndLevel: classAndLevel || '—',
        portrait: (actor && actor.img) ? actor.img : ''
    };
}

/** Prepare biography/details data from actor.system.details for print. */
function prepareBiography(actor) {
    const details = (actor && actor.system && actor.system.details) ? actor.system.details : {};
    const biographySource = details.biography || {};
    const biographyHtml = biographySource.public || biographySource.value || '';

    const race = resolveRace(actor);
    const background = resolveBackground(actor);
    const size = resolveSize(actor);

    const eyes = getDetailValue(details.eyes);
    const hair = getDetailValue(details.hair);
    const skin = getDetailValue(details.skin);
    const height = getDetailValue(details.height);
    const weight = getDetailValue(details.weight);
    const age = getDetailValue(details.age);
    const gender = getDetailValue(details.gender);
    const faith = getDetailValue(details.faith);
    const ideal = getDetailValue(details.ideal);
    const bond = getDetailValue(details.bond);
    const flaw = getDetailValue(details.flaw);
    const trait = getDetailValue(details.trait);
    const appearanceRaw = getDetailValue(details.appearance);
    const appearance = formatAppearanceForPrint(appearanceRaw) || appearanceRaw;
    const bioHtml = typeof biographyHtml === 'string' ? biographyHtml : '';

    const hasPhysicalTraits = !!(eyes || hair || skin || height || weight || age || gender || faith);
    const hasCharacterDetails = !!(race || background || size);
    const hasAnyBiography = hasPhysicalTraits || hasCharacterDetails || !!(ideal || bond || flaw || trait || appearance || bioHtml);

    return {
        race,
        background,
        size,
        eyes,
        hair,
        skin,
        height,
        weight,
        age,
        gender,
        faith,
        ideal,
        bond,
        flaw,
        trait,
        appearance,
        biographyHtml: bioHtml,
        hasPhysicalTraits,
        hasCharacterDetails,
        hasAnyBiography
    };
}

// Separate icons for skills and abilities
const SKILL_ICONS = {
    acr: 'fa-shoe-prints',         // Acrobatics
    ani: 'fa-dog',                    // Animal Handling
    arc: 'fa-hat-wizard',             // Arcana
    ath: 'fa-dumbbell',               // Athletics
    dec: 'fa-theater-masks',          // Deception
    his: 'fa-landmark',               // History
    ins: 'fa-brain',                  // Insight
    itm: 'fa-comments',               // Intimidation
    inv: 'fa-search',                 // Investigation
    med: 'fa-briefcase-medical',      // Medicine
    nat: 'fa-leaf',                   // Nature
    prc: 'fa-eye',                    // Perception
    prf: 'fa-microphone',             // Performance
    per: 'fa-handshake',              // Persuasion
    rel: 'fa-book',                   // Religion
    slt: 'fa-hand-sparkles',          // Sleight of Hand
    ste: 'fa-user-ninja',             // Stealth
    sur: 'fa-compass'                 // Survival
};

const ABILITY_ICONS = {
    str: 'fa-dumbbell',
    dex: 'fa-running',
    con: 'fa-heartbeat',
    int: 'fa-brain',
    wis: 'fa-eye',
    cha: 'fa-theater-masks'
};

export class PrintCharacterSheet {
    static async print(actor) {
        try {
            // Validate actor
            if (!actor) {
                ui.notifications.error(PRINT_CONFIG.ERROR_MESSAGES.NO_ACTOR);
                return;
            }

            if (!actor.system) {
                ui.notifications.error(PRINT_CONFIG.ERROR_MESSAGES.INVALID_ACTOR);
                return;
            }

            // Prepare items with split descriptions and displayWeight
            const items = actor.items.map(item => {
                if (!item) return null;
                
                const desc = (item.system && item.system.description && item.system.description.value) ? item.system.description.value : '';
                const { mainDescription, additionalDetails } = splitDescription(desc);
                const displayWeight = getDisplayWeight(item.system && item.system.weight);
                let price = (item.system && item.system.price != null) ? item.system.price : '—';
                if (typeof price === 'object' && price !== null) {
                    // Try to extract a displayable value
                    if ('value' in price) price = price.value;
                    else if ('gp' in price) price = price.gp + ' gp';
                    else price = JSON.stringify(price);
                }
                price = price === undefined || price === null ? '—' : price;
                const quantity = (item.system && item.system.quantity != null) ? item.system.quantity : '—';
                const uses = item.system && item.system.uses;
                const charges = (uses && uses.max) ? `${(uses.value != null ? uses.value : 0)} / ${uses.max}` : '';
                
                return {
                    ...item,
                    mainDescription,
                    additionalDetails,
                    displayWeight,
                    price,
                    quantity,
                    charges,
                    icon: item.img || ''
                };
            }).filter(Boolean); // Remove any null items

            // Prepare skills array with proper validation and structure
            const skills = Object.entries(actor.system.skills || {}).map(([key, skill]) => {
                if (!skill) return null;
                
                // Get the skill configuration from D&D5E system
                const skillConfig = CONFIG.DND5E.skills[key];
                if (!skillConfig) return null;

                // Get the proper label from the skill config
                let label;
                if (typeof skillConfig === "string") {
                    label = skillConfig;
                } else if (skillConfig && typeof skillConfig === "object" && "label" in skillConfig) {
                    label = skillConfig.label;
                } else {
                    label = key;
                }

                // Get the ability modifier for this skill
                const ability = skill.ability || 'str';
                const abilityData = actor.system.abilities && actor.system.abilities[ability];
                const abilityMod = (abilityData && abilityData.mod != null) ? abilityData.mod : 0;

                return {
                    key,
                    label,
                    mod: (skill.mod != null) ? skill.mod : 0,
                    ability,
                    abilityMod,
                    icon: SKILL_ICONS[key] || PRINT_CONFIG.DEFAULT_ICON
                };
            }).filter(Boolean);

            // Prepare abilities array (with labels for display)
            const abilities = Object.entries(actor.system.abilities || {}).map(([key, ability]) => {
                if (!ability) return null;
                const abilityConfig = CONFIG.DND5E && CONFIG.DND5E.abilities ? CONFIG.DND5E.abilities[key] : null;
                let label = key.toUpperCase();
                if (abilityConfig) {
                    if (typeof abilityConfig === 'string') {
                        label = (game.i18n && game.i18n.localize) ? game.i18n.localize(abilityConfig) : abilityConfig;
                    } else if (abilityConfig && typeof abilityConfig === 'object' && abilityConfig.label) {
                        label = (game.i18n && game.i18n.localize) ? game.i18n.localize(abilityConfig.label) : abilityConfig.label;
                    }
                }
                return {
                    key,
                    label: label,
                    value: (ability.value != null) ? ability.value : 0,
                    mod: (ability.mod != null) ? ability.mod : 0,
                    icon: ABILITY_ICONS[key] || PRINT_CONFIG.DEFAULT_ICON
                };
            }).filter(Boolean);

            // Filter items with validation
            const spells = items.filter(i => i && i.type === 'spell');
            const features = items.filter(i => i && (i.type === 'feat' || i.type === 'background'));
            const inventory = items.filter(i => i && i.type === 'equipment');
            const weapons = items.filter(i => i && i.type === 'weapon');

            // Prepare stats & combat, inventory extras
            const statsAndCombat = prepareStatsAndCombat(actor);
            const inventoryExtras = prepareInventoryExtras(actor);

            // Split skills into columns
            const midPoint = Math.ceil(skills.length / PRINT_CONFIG.SKILL_COLUMNS);
            const skillsCol1 = skills.slice(0, midPoint);
            const skillsCol2 = skills.slice(midPoint);

            // Prepare biography/details and cover page for print
            const biography = prepareBiography(actor);
            const coverPage = prepareCoverPage(actor);

            // Render the print template with both skills and abilities
            const html = await renderTemplate(TEMPLATES.PRINT_CHARACTER, {
                actor: {
                    ...actor,
                    items,
                    inventory,
                    weapons,
                    spells,
                    features,
                    skillsCol1,
                    skillsCol2,
                    abilities,
                    biography,
                    coverPage,
                    statsAndCombat,
                    inventoryExtras
                }
            });

            if (!html) {
                throw new Error(PRINT_CONFIG.ERROR_MESSAGES.TEMPLATE_ERROR);
            }

            // Create a new window
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                ui.notifications.error(PRINT_CONFIG.ERROR_MESSAGES.POPUP_BLOCKED);
                return;
            }

            // Write the content to the new window
            printWindow.document.write(html);
            printWindow.document.close();

            // Wait for images to load with timeout
            await Promise.race([
                new Promise(resolve => {
                    const images = printWindow.document.getElementsByTagName('img');
                    let loadedImages = 0;
                    const totalImages = images.length;
                    
                    if (totalImages === 0) {
                        resolve();
                        return;
                    }
                    
                    for (let img of images) {
                        if (img.complete) {
                            loadedImages++;
                            if (loadedImages === totalImages) resolve();
                        } else {
                            img.onload = () => {
                                loadedImages++;
                                if (loadedImages === totalImages) resolve();
                            };
                            img.onerror = () => {
                                loadedImages++;
                                if (loadedImages === totalImages) resolve();
                            };
                        }
                    }
                }),
                moduleDelay(PRINT_CONFIG.IMAGE_LOAD_TIMEOUT)
            ]);

        } catch (error) {
            console.error('Error printing character sheet:', error);
            ui.notifications.error('Failed to print character sheet. See console for details.');
        }
    }

    static _getSkillIcon(skillKey) {
        if (!skillKey) return PRINT_CONFIG.DEFAULT_ICON;
        return SKILL_ICONS[skillKey.toLowerCase()] || PRINT_CONFIG.DEFAULT_ICON;
    }
} 
