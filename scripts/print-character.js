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
    if (weight == null) return 'N/A';
    if (typeof weight === 'object') {
        if ('value' in weight) return weight.value;
        return 'N/A';
    }
    return weight;
}

// Ability to FontAwesome icon mapping
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
            return {
                ...item,
                mainDescription,
                additionalDetails,
                displayWeight
            };
        });

        // Prepare skills array
        const skills = Object.entries(actor.system.skills || {}).map(([id, skill]) => {
            const ability = skill.ability || '';
            return {
                id,
                label: skill.label,
                ability,
                abilityLabel: actor.system.abilities?.[ability]?.label || ability.toUpperCase(),
                icon: ABILITY_ICONS[ability] || 'fa-question',
                mod: skill.mod
            };
        });
        // Split into two columns
        const mid = Math.ceil(skills.length / 2);
        const skillsCol1 = skills.slice(0, mid);
        const skillsCol2 = skills.slice(mid);

        // Render the print template
        const html = await renderTemplate(TEMPLATES.PRINT_CHARACTER, {
            actor: {
                ...actor,
                items,
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
} 