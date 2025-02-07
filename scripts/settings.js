import { MODULE } from './const.js';

export const registerSettings = function() {
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

    // Move Foundry Toolbar setting
    game.settings.register(MODULE.ID, 'moveFoundryToolbar', {
        name: 'Move Foundry Toolbar',
        hint: 'Add padding to the left toolbar to make room for the tray handle',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true,
        onChange: value => {
            const uiLeft = document.querySelector('#ui-left');
            if (uiLeft) {
                uiLeft.style.paddingLeft = value ? '15px' : '0';
            }
        }
    });

    // Tray Width setting (not visible in settings menu)
    game.settings.register(MODULE.ID, 'trayWidth', {
        name: 'Tray Width',
        scope: 'client',
        config: false,
        type: String,
        default: '280px'
    });

    // Move UI when pinned setting
    game.settings.register(MODULE.ID, 'moveUIWhenPinned', {
        name: 'Move Toolbars When Pinned Open',
        hint: 'Move the left toolbar over when the tray is pinned open instead of overlapping',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: value => {
            const uiLeft = document.querySelector('#ui-left');
            const tray = document.querySelector('.squire-tray');
            if (uiLeft && tray?.classList.contains('pinned')) {
                uiLeft.style.marginLeft = value ? game.settings.get(MODULE.ID, 'trayWidth') : '0';
            }
        }
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