import { MODULE } from './const.js';

export const registerHelpers = function() {
    // Helper for repeating n times
    Handlebars.registerHelper('times', function(n, options) {
        let result = '';
        for (let i = 0; i < n; i++) {
            result += options.fn({ index: i });
        }
        return result;
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
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        blacksmith?.utils.postConsoleAndNotification(
            "SQUIRE | Checking condition",
            { array, property, value },
            false,
            true,
            false,
            MODULE.TITLE
        );

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
        const favorites = actor.getFlag('coffee-pub-squire', 'favorites') || [];
        return actor.items
            .filter(item => {
                if (!favorites.includes(item.id)) return false;
                
                // Check if item is equipped/prepared based on type
                if (item.type === 'spell') {
                    return item.system.level === 0 || item.system.preparation?.prepared; // Cantrips are always prepared
                } else if (item.type === 'weapon' || item.type === 'equipment') {
                    return item.system.equipped;
                }
                
                // For other item types (consumables, etc), always show if favorited
                return true;
            })
            .map(item => ({
                id: item.id,
                name: item.name,
                img: item.img || 'icons/svg/item-bag.svg'
            }));
    });
}; 