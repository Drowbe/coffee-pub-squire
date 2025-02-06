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
}; 