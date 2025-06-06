import { MODULE, TEMPLATES } from './const.js';

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
    if (typeof weight === 'object') {
        if ('value' in weight && typeof weight.value === 'number') return weight.value;
        if ('value' in weight && typeof weight.value === 'string') return weight.value;
        return '—';
    }
    if (typeof weight === 'number' || typeof weight === 'string') return weight;
    return '—';
}

// Unique FontAwesome icons for each skill
const SKILL_ICONS = {
    acr: 'fa-person-running',
    ani: 'fa-dog',
    arc: 'fa-hat-wizard',
    ath: 'fa-dumbbell',
    dec: 'fa-mask',
    his: 'fa-landmark',
    ins: 'fa-eye',
    itm: 'fa-comments',
    inv: 'fa-search',
    med: 'fa-briefcase-medical',
    nat: 'fa-leaf',
    prc: 'fa-eye',
    prf: 'fa-theater-masks',
    per: 'fa-face-smile',
    rel: 'fa-book',
    slt: 'fa-hand-sparkles',
    ste: 'fa-user-ninja',
    sur: 'fa-compass'
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
        if (!actor) return;

        // Prepare items with split descriptions and displayWeight
        const items = actor.items.map(item => {
            const desc = item.system?.description?.value || '';
            const { mainDescription, additionalDetails } = splitDescription(desc);
            const displayWeight = getDisplayWeight(item.system?.weight);
            const price = item.system?.price ?? '—';
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
        });

        // Prepare skills array
        const skills = Object.entries(actor.system.skills).map(([key, skill]) => {
            const skillConfig = CONFIG.DND5E.skills[key];
            let label;
            if (typeof skillConfig === "string") {
                label = skillConfig;
            } else if (skillConfig && typeof skillConfig === "object" && "label" in skillConfig) {
                label = skillConfig.label;
            } else {
                label = key;
            }
            return {
                key,
                label,
                mod: skill.mod,
                ability: skill.ability,
                icon: PrintCharacterSheet._getSkillIcon(key)
            };
        });
        // Split skills into two columns
        const midPoint = Math.ceil(skills.length / 2);
        const skillsCol1 = skills.slice(0, midPoint);
        const skillsCol2 = skills.slice(midPoint);

        // Prepare spells and features (same as items for now)
        const spells = items.filter(i => i.type === 'spell');
        const features = items.filter(i => i.type === 'feat' || i.type === 'background');
        const inventory = items.filter(i => i.type === 'equipment');

        // Render the print template
        const html = await renderTemplate(TEMPLATES.PRINT_CHARACTER, {
            actor: {
                ...actor,
                items,
                inventory,
                spells,
                features,
                skillsCol1,
                skillsCol2
            }
        });

        // Create a new window
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            ui.notifications.error('Pop-up blocked. Please allow pop-ups for this site.');
            return;
        }

        // Write the content to the new window
        printWindow.document.write(html);
        printWindow.document.close();

        // Wait for images to load
        await new Promise(resolve => {
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
        });
        // Do NOT trigger print dialog automatically. User can print from the new tab if desired.
    }

    _prepareSkills(actor) {
        // Use actor.system.skills directly, ensuring each skill has a 'label' property
        const skills = Object.values(actor.system.skills).map(skill => ({
            label: skill.label,
            mod: skill.mod,
            ability: skill.ability,
            icon: PrintCharacterSheet._getSkillIcon(skill.label)
        }));
        // Split skills into two columns
        const midPoint = Math.ceil(skills.length / 2);
        return {
            skillsCol1: skills.slice(0, midPoint),
            skillsCol2: skills.slice(midPoint)
        };
    }

    static _getSkillIcon(skillKey) {
        if (!skillKey) return 'fa-question';
        return SKILL_ICONS[skillKey.toLowerCase()] || ABILITY_ICONS[skillKey.toLowerCase()] || 'fa-question';
    }
} 