import { MODULE, PANELS } from './const.js';

export const registerSettings = function() {
    // Default Panel
    game.settings.register(MODULE.ID, 'defaultPanel', {
        name: 'Default Panel',
        hint: 'Which panel should be active when opening the tray',
        scope: 'client',
        config: true,
        type: String,
        choices: {
            [PANELS.SPELLS]: 'Spells',
            [PANELS.WEAPONS]: 'Weapons',
            [PANELS.INFO]: 'Info'
        },
        default: PANELS.SPELLS
    });

    // Tray Position
    game.settings.register(MODULE.ID, 'trayPosition', {
        name: 'Tray Position',
        hint: 'Where should the tray appear on the screen',
        scope: 'client',
        config: true,
        type: String,
        choices: {
            'left': 'Left Side'
        },
        default: 'left',
        onChange: value => {
            // Update tray position in real-time
            const tray = document.querySelector('.squire-tray');
            if (tray) {
                tray.dataset.position = value;
            }
        }
    });

    // Remember Last Panel
    game.settings.register(MODULE.ID, 'rememberLastPanel', {
        name: 'Remember Last Panel',
        hint: 'Remember which panel was last active and restore it next time',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true
    });

    // Auto-hide Behavior
    game.settings.register(MODULE.ID, 'autoHide', {
        name: 'Auto-hide Tray',
        hint: 'Automatically hide the tray when clicking outside of it',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true
    });

    // Panel Height
    game.settings.register(MODULE.ID, 'panelHeight', {
        name: 'Panel Height',
        hint: 'Maximum height of the panel in pixels (min: 200, max: 800)',
        scope: 'client',
        config: true,
        type: Number,
        range: {
            min: 200,
            max: 800,
            step: 50
        },
        default: 400,
        onChange: value => {
            // Update panel height in real-time
            const content = document.querySelector('.tray-content');
            if (content) {
                content.style.maxHeight = `${value}px`;
            }
        }
    });

    // Theme
    game.settings.register(MODULE.ID, 'theme', {
        name: 'Color Theme',
        hint: 'Color scheme for the tray interface',
        scope: 'client',
        config: true,
        type: String,
        choices: {
            'dark': 'Dark Theme',
            'light': 'Light Theme',
            'custom': 'Custom Theme'
        },
        default: 'dark',
        onChange: value => {
            // Update theme in real-time
            const tray = document.querySelector('.squire-tray');
            if (tray) {
                tray.dataset.theme = value;
            }
        }
    });

    // Custom Theme Colors (only visible if theme is set to 'custom')
    game.settings.register(MODULE.ID, 'customThemeColors', {
        name: 'Custom Theme Colors',
        hint: 'JSON object defining custom theme colors',
        scope: 'client',
        config: true,
        type: String,
        default: JSON.stringify({
            background: 'rgba(30, 30, 30, 0.95)',
            text: '#ffffff',
            border: '#444444',
            accent: '#4a90e2'
        }, null, 2),
        onChange: value => {
            try {
                const colors = JSON.parse(value);
                updateCustomTheme(colors);
            } catch (e) {
                console.error(`${MODULE.TITLE} | Error parsing custom theme colors:`, e);
            }
        }
    });

    // Last Active Panel (hidden setting)
    game.settings.register(MODULE.ID, 'lastActivePanel', {
        name: 'Last Active Panel',
        scope: 'client',
        config: false,
        type: String,
        default: PANELS.SPELLS
    });
};

// Helper function to update custom theme colors
function updateCustomTheme(colors) {
    const style = document.getElementById('squire-custom-theme');
    if (!style) {
        const styleElement = document.createElement('style');
        styleElement.id = 'squire-custom-theme';
        document.head.appendChild(styleElement);
    }

    const css = `
        .squire-tray[data-theme="custom"] {
            background: ${colors.background};
            color: ${colors.text};
            border-color: ${colors.border};
        }
        .squire-tray[data-theme="custom"] .tab-item.tab-active {
            background: ${colors.accent};
        }
        .squire-tray[data-theme="custom"] .cast-spell,
        .squire-tray[data-theme="custom"] .weapon-attack {
            background: ${colors.accent};
        }
    `;

    style.textContent = css;
} 