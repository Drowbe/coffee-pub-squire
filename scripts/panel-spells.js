import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';

export class SpellsPanel {
    constructor(actor) {
        this.actor = actor;
        this.spells = this._getSpells();
        this.showOnlyPrepared = game.settings.get(MODULE.ID, 'showOnlyPreparedSpells');
    }

    _getSpells() {
        if (!this.actor) return [];
        
        // Get current favorites
        const favorites = this.actor.getFlag(MODULE.ID, 'favorites') || [];
        
        // Get spells
        const spells = this.actor.items.filter(item => item.type === 'spell');
        
        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        // Log raw spells from actor
        blacksmith?.utils.postConsoleAndNotification(
            "SQUIRE | Raw spells from actor",
            spells,
            true,
            true,
            false
        );
        
        // Map spells with favorite state
        const mappedSpells = spells.map(spell => {
            const isFavorite = favorites.includes(spell.id);
            
            return {
                id: spell.id,
                name: spell.name,
                img: spell.img,
                system: spell.system,
                type: spell.type,
                isFavorite: isFavorite
            };
        });
        
        // Log mapped spells
        blacksmith?.utils.postConsoleAndNotification(
            "SQUIRE | Mapped spells with favorites",
            mappedSpells,
            true,
            true,
            false
        );
        
        return mappedSpells;
    }

    async _toggleFavorite(itemId) {
        try {
            // Get current favorites
            const favorites = this.actor.getFlag(MODULE.ID, 'favorites') || [];
            const newFavorites = favorites.includes(itemId)
                ? favorites.filter(id => id !== itemId)
                : [...favorites, itemId];
            
            // Update the flag
            await this.actor.setFlag(MODULE.ID, 'favorites', newFavorites);
            
            // Update our local spells data
            this.spells = this._getSpells();
            
            // Find the PanelManager instance
            const panelManager = ui.windows[Object.keys(ui.windows).find(key => 
                ui.windows[key].constructor.name === 'PanelManager' && 
                ui.windows[key].actor?.id === this.actor.id
            )];

            // Re-render this panel
            if (this.element) {
                await this.render();
            }

            // Re-render the favorites panel through PanelManager
            if (panelManager?.favoritesPanel) {
                await panelManager.favoritesPanel.render(panelManager.element);
            }

            // Update the heart icon state immediately
            const heartIcon = this.element.find(`.spell-item[data-spell-id="${itemId}"] .fa-heart`);
            if (heartIcon.length) {
                heartIcon.toggleClass('faded', !newFavorites.includes(itemId));
            }

            // Force a full refresh of both panels to ensure sync
            if (panelManager) {
                await panelManager.render(true);
            }

        } catch (error) {
            console.error('Error toggling favorite:', error);
        }
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) {
            return;
        }

        // Group spells by level
        const spellsByLevel = {};
        this.spells.forEach(spell => {
            const level = spell.system.level;
            if (!spellsByLevel[level]) {
                spellsByLevel[level] = [];
            }
            spellsByLevel[level].push(spell);
        });

        const spellData = {
            spells: this.spells,
            spellsByLevel: spellsByLevel,
            spellSlots: this._getSpellSlots(),
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            showOnlyPrepared: this.showOnlyPrepared
        };

        const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
        // Log spell data being sent to template
        blacksmith?.utils.postConsoleAndNotification(
            "SQUIRE | Spell data for template",
            {
                spellsByLevel: Object.entries(spellsByLevel).map(([level, spells]) => 
                    `Level ${level}: ${spells.length} spells`
                ),
                spellSlots: spellData.spellSlots
            },
            true,
            true,
            false
        );

        const template = await renderTemplate(TEMPLATES.PANEL_SPELLS, spellData);
        const spellsPanel = this.element.find('[data-panel="spells"]');
        spellsPanel.html(template);
        
        this._activateListeners(this.element);
        this._updateVisibility(this.element);
    }

    _getSpellSlots() {
        if (!this.actor) return [];
        const spellbook = this.actor.system.spells;
        
        // Convert spellbook data into array format
        const slots = [];
        for (let i = 1; i <= 9; i++) {
            const spellLevelData = spellbook[`spell${i}`];
            if (spellLevelData) {
                slots.push({
                    level: i,
                    value: spellLevelData.value || 0,
                    max: spellLevelData.max || 0
                });
            }
        }
        return slots;
    }

    _updateVisibility(html) {
        const searchInput = html.find('.spell-search');
        const searchTerm = searchInput.val()?.toLowerCase() || '';
        const filterValue = html.find('.spell-filter').val();
        
        // Track visible spells for each level
        const visibleSpellsByLevel = new Map();
        
        const spellItems = html.find('.spell-item');
        spellItems.each((i, el) => {
            const $item = $(el);
            const spellId = $item.data('spell-id');
            const spell = this.spells.find(s => s.id === spellId);
            
            if (!spell) return;

            const nameMatch = spell.name.toLowerCase().includes(searchTerm);
            const levelMatch = filterValue === 'all' || 
                (filterValue === 'cantrip' && spell.system.level === 0) ||
                (filterValue === spell.system.level.toString());
            const preparedMatch = !this.showOnlyPrepared || 
                spell.system.level === 0 || // Cantrips are always prepared
                spell.system.preparation?.prepared;

            const shouldShow = nameMatch && levelMatch && preparedMatch;
            $item.toggle(shouldShow);

            // Track visible spells for this level
            if (shouldShow) {
                const level = spell.system.level;
                visibleSpellsByLevel.set(level, (visibleSpellsByLevel.get(level) || 0) + 1);
            }
        });

        // Hide/show level headers based on visible spells
        html.find('.level-header').each((i, header) => {
            const $header = $(header);
            const headerText = $header.find('span').text();
            
            // Determine the level this header represents
            let level;
            if (headerText.toLowerCase().includes('cantrip')) {
                level = 0;
            } else {
                const match = headerText.match(/Level (\d+)/);
                if (match) {
                    level = parseInt(match[1]);
                }
            }

            if (level !== undefined) {
                const hasVisibleSpells = visibleSpellsByLevel.get(level) > 0;
                $header.toggle(hasVisibleSpells);
            }
        });
    }

    _activateListeners(html) {
        // Add filter toggle handler
        html.find('.spell-filter-toggle').click(async (event) => {
            this.showOnlyPrepared = !this.showOnlyPrepared;
            await game.settings.set(MODULE.ID, 'showOnlyPreparedSpells', this.showOnlyPrepared);
            $(event.currentTarget).toggleClass('active', this.showOnlyPrepared);
            $(event.currentTarget).toggleClass('faded', !this.showOnlyPrepared);
            this._updateVisibility(html);
        });

        // Toggle prepared state (cog icon)
        html.find('.tray-buttons .fa-cog').click(async (event) => {
            const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            const spell = this.actor.items.get(spellId);
            if (spell) {
                const newPrepared = !spell.system.preparation.prepared;
                await spell.update({
                    'system.preparation.prepared': newPrepared
                });
                // Update the UI immediately
                const $item = $(event.currentTarget).closest('.spell-item');
                $item.toggleClass('prepared', newPrepared);
                $(event.currentTarget).toggleClass('faded', !newPrepared);
                // Update visibility in case we're filtering by prepared
                this._updateVisibility(html);
            }
        });

        // Spell info click (feather icon)
        html.find('.tray-buttons .fa-feather').click(async (event) => {
            const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            const spell = this.actor.items.get(spellId);
            if (spell) {
                spell.sheet.render(true);
            }
        });

        // Toggle favorite
        html.find('.tray-buttons .fa-heart').click(async (event) => {
            const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            await this._toggleFavorite(spellId);
        });

        // Spell cast click (image overlay)
        html.find('.spell-image-container').click(async (event) => {
            // Only handle click if on the overlay
            if ($(event.target).hasClass('spell-roll-overlay')) {
                const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
                const spell = this.actor.items.get(spellId);
                if (spell) {
                    await spell.use({}, { event, legacy: false });
                }
            }
        });

        // Search and filter
        const searchInput = html.find('.spell-search');
        const filterSelect = html.find('.spell-filter');

        // Remove any existing event listeners
        searchInput.off('input keyup change');
        filterSelect.off('change');

        // Add new event listeners
        searchInput.on('input keyup change', () => {
            this._updateVisibility(html);
        });

        filterSelect.on('change', () => {
            this._updateVisibility(html);
        });
    }
} 