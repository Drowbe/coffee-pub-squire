import { MODULE, TEMPLATES } from './const.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
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
                
                const desc = item.system?.description?.value || '';
                const { mainDescription, additionalDetails } = splitDescription(desc);
                const displayWeight = getDisplayWeight(item.system?.weight);
                let price = item.system?.price ?? '—';
                if (typeof price === 'object' && price !== null) {
                    // Try to extract a displayable value
                    if ('value' in price) price = price.value;
                    else if ('gp' in price) price = price.gp + ' gp';
                    else price = JSON.stringify(price);
                }
                price = price === undefined || price === null ? '—' : price;
                const quantity = item.system?.quantity ?? '—';
                const charges = item.system?.uses?.max ? `${item.system.uses.value ?? 0} / ${item.system.uses.max}` : '';
                
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
                const abilityMod = actor.system.abilities[ability]?.mod || 0;
                
                return {
                    key,
                    label,
                    mod: skill.mod ?? 0,
                    ability,
                    abilityMod,
                    icon: SKILL_ICONS[key] || PRINT_CONFIG.DEFAULT_ICON
                };
            }).filter(Boolean);

            // Prepare abilities array
            const abilities = Object.entries(actor.system.abilities || {}).map(([key, ability]) => {
                if (!ability) return null;
                
                return {
                    key,
                    label: CONFIG.DND5E.abilities[key] || key,
                    mod: ability.mod ?? 0,
                    icon: ABILITY_ICONS[key] || PRINT_CONFIG.DEFAULT_ICON
                };
            }).filter(Boolean);

            // Filter items with validation
            const spells = items.filter(i => i?.type === 'spell');
            const features = items.filter(i => i?.type === 'feat' || i?.type === 'background');
            const inventory = items.filter(i => i?.type === 'equipment');

            // Split skills into columns
            const midPoint = Math.ceil(skills.length / PRINT_CONFIG.SKILL_COLUMNS);
            const skillsCol1 = skills.slice(0, midPoint);
            const skillsCol2 = skills.slice(midPoint);

            // Render the print template with both skills and abilities
            const html = await renderTemplate(TEMPLATES.PRINT_CHARACTER, {
                actor: {
                    ...actor,
                    items,
                    inventory,
                    spells,
                    features,
                    skillsCol1,
                    skillsCol2,
                    abilities
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
                new Promise(resolve => setTimeout(resolve, PRINT_CONFIG.IMAGE_LOAD_TIMEOUT))
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
