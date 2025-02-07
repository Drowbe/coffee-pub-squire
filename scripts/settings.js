import { MODULE, SQUIRE } from './const.js';

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

    // Remember pinned state (hidden setting)
    game.settings.register(MODULE.ID, 'isPinned', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });

    // Tray Width setting
    game.settings.register(MODULE.ID, 'trayWidth', {
        name: 'Tray Width',
        hint: 'Adjust the width of the tray (in pixels). Default: 400px',
        scope: 'client',
        config: true,
        type: Number,
        range: {
            min: 300,
            max: 600,
            step: 25
        },
        default: 400,
        onChange: value => {
            // Update CSS variables
            document.documentElement.style.setProperty('--squire-tray-width', `${value}px`);
            document.documentElement.style.setProperty('--squire-tray-content-width', `${value - parseInt(SQUIRE.TRAY_HANDLE_WIDTH)}px`);
            document.documentElement.style.setProperty('--squire-tray-transform', `translateX(-${value - parseInt(SQUIRE.TRAY_HANDLE_WIDTH)}px)`);
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