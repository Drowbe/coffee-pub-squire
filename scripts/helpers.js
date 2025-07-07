import { MODULE, SQUIRE, TEMPLATES } from './const.js';
import { QuestParser } from './quest-parser.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

// Helper function to determine weapon type using activities system
function getWeaponType(weapon) {
    if (!weapon || weapon.type !== 'weapon') return null;
    
    // In D&D5E 4.0+, we use the new activities system
    const activities = weapon.system.activities;
    if (activities) {
        // Get the first activity (usually there's only one)
        const activity = Object.values(activities)[0];
        if (activity?.type === 'rwak') return 'ranged';
        if (activity?.type === 'mwak') return 'melee';
    }
    
    // If no activities, try to determine from weapon properties
    if (weapon.system.properties?.thr) return 'ranged';  // Has thrown property
    if (weapon.system.properties?.rch) return 'melee';   // Has reach property
    
    // Default based on weapon range
    return weapon.system.range?.value > 5 ? 'ranged' : 'melee';
}

// Helper function to get damage information using activities system
function getDamageInfo(item) {
    if (!item) return null;
    
    // In D&D5E 4.0+, damage is part of the activities system
    const activities = item.system.activities;
    if (activities) {
        // Get the first activity (usually there's only one)
        const activity = Object.values(activities)[0];
        if (activity?.damage?.parts?.length) {
            return {
                formula: activity.damage.parts[0][0],
                type: activity.damage.parts[0][1],
                scaling: activity.damage.parts[0].scaling || null // Get scaling from damage part
            };
        }
    }
    
    return null;
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

    // Helper to get favorites from actor
    Handlebars.registerHelper('getFavorites', function(actor) {
        if (!actor) return [];
        
        // Get our module's favorites from flags and filter out null values
        const favorites = (actor.getFlag(MODULE.ID, 'favorites') || []).filter(id => id !== null && id !== undefined);
        
        // Create a map of items by ID for quick lookup
        const itemsById = new Map(actor.items.map(item => [item.id, item]));
        
        // Map favorites in their original order
        return favorites
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
                html += '<i class="fas fa-lock"></i> ';
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
            getBlacksmith()?.utils.postConsoleAndNotification(
                'Modern clipboard API failed',
                { error },
                false,
                false,
                false,
                MODULE.TITLE
            );
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
        getBlacksmith()?.utils.postConsoleAndNotification(
            'Legacy clipboard method failed',
            { error },
            false,
            false,
            false,
            MODULE.TITLE
        );
    }
    
    // Method 3: Show dialog with text for manual copying
    new Dialog({
        title: 'Copy to Clipboard',
        content: `
            <p>Automatic clipboard copy failed. Please manually copy the text below:</p>
            <textarea style="width: 100%; height: 200px; margin-top: 10px;" readonly>${text}</textarea>
        `,
        buttons: {
            close: {
                label: 'Close'
            }
        }
    }).render(true);
    
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
        tooltip.className = 'quest-marker-tooltip';
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
export async function showQuestTooltip(tooltipId, data, event, delay = 500) {
    try {
        // Validate input parameters
        if (!tooltipId || typeof tooltipId !== 'string') {
            getBlacksmith()?.utils.postConsoleAndNotification(
                'showQuestTooltip: Invalid tooltipId parameter',
                { tooltipId, data },
                false,
                true,
                false,
                MODULE.TITLE
            );
            return;
        }

        if (!data || typeof data !== 'object') {
            getBlacksmith()?.utils.postConsoleAndNotification(
                'showQuestTooltip: Invalid data parameter',
                { tooltipId, data },
                false,
                true,
                false,
                MODULE.TITLE
            );
            return;
        }

        if (!event) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                'showQuestTooltip: Missing event parameter',
                { tooltipId, data },
                false,
                true,
                false,
                MODULE.TITLE
            );
            return;
        }

        // Clear any existing timeout for this tooltip
        if (tooltipTimeouts.has(tooltipId)) {
            clearTimeout(tooltipTimeouts.get(tooltipId));
            tooltipTimeouts.delete(tooltipId);
        }
        
        // Set new timeout to show tooltip after delay
        const timeoutId = setTimeout(async () => {
            try {
                const tooltip = getOrCreateQuestTooltip(tooltipId);
                // Render the tooltip using the Handlebars template
                const html = await renderTemplate(TEMPLATES.TOOLTIP_QUEST, data);
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
            } catch (error) {
                getBlacksmith()?.utils.postConsoleAndNotification(
                    'showQuestTooltip: Error in timeout callback',
                    { tooltipId, error: error.message },
                    false,
                    false,
                    true,
                    MODULE.TITLE
                );
            }
        }, delay);
        // Store the timeout reference
        tooltipTimeouts.set(tooltipId, timeoutId);
    } catch (error) {
        getBlacksmith()?.utils.postConsoleAndNotification(
            'showQuestTooltip: Unexpected error',
            { tooltipId, error: error.message },
            false,
            false,
            true,
            MODULE.TITLE
        );
    }
}

/**
 * Hide quest tooltip
 * @param {string} tooltipId - The ID for the tooltip element
 */
export function hideQuestTooltip(tooltipId) {
    // Clear any pending timeout for this tooltip
    if (tooltipTimeouts.has(tooltipId)) {
        clearTimeout(tooltipTimeouts.get(tooltipId));
        tooltipTimeouts.delete(tooltipId);
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
export async function getObjectiveTooltipData(questPageUuid, objectiveIndex) {
    try {
        // Find the journal page by UUID
        let page = null;
        for (const journal of game.journal.contents) {
            page = journal.pages.find(p => p.uuid === questPageUuid);
            if (page) break;
        }
        if (!page) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                'SQUIRE | QUESTS getObjectiveTooltipData: Journal page not found',
                { questPageUuid, objectiveIndex },
                false,
                true,
                false,
                MODULE.TITLE
            );
            return null;
        }

        // Enrich the page HTML if needed
        const enrichedHtml = await TextEditor.enrichHTML(page.text.content, { async: true });
        // Parse the quest entry using the source of truth
        const entry = await QuestParser.parseSinglePage(page, enrichedHtml);
        if (!entry) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                'SQUIRE | QUESTS getObjectiveTooltipData: Failed to parse quest entry',
                { questPageUuid, objectiveIndex },
                false,
                true,
                false,
                MODULE.TITLE
            );
            return null;
        }

        // Get the relevant objective/task
        const task = entry.tasks[objectiveIndex];
        if (!task) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                'SQUIRE | QUESTS getObjectiveTooltipData: Objective not found',
                { questPageUuid, objectiveIndex },
                false,
                true,
                false,
                MODULE.TITLE
            );
            return null;
        }

        let visibility;
        if (game.user.isGM) {
            if (task.state === 'hidden') {
                visibility = 'Only Visible to GM';
            } else {
                visibility = 'Visible to GM and Players';
            }
        }
        return {
            questName: entry.name,
            questNumber: entry.questNumber,
            objectiveIndex,
            objectiveNumber: objectiveIndex + 1,
            objectiveNumberPadded: String(objectiveIndex + 1).padStart(2, '0'),
            objectiveState: task.state || 'active',
            description: task.text || 'Objective',
            gmHint: (game.user.isGM && task.gmHint) ? task.gmHint : undefined,
            visibility,
            isGM: game.user.isGM
        };
    } catch (error) {
        getBlacksmith()?.utils.postConsoleAndNotification(
            'SQUIRE | QUESTS getObjectiveTooltipData: Unexpected error',
            { questPageUuid, objectiveIndex, error: error.message },
            false,
            true,
            false,
            MODULE.TITLE
        );
        return null;
    }
} 