import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';

export class SpellsPanel {
    constructor(actor) {
        this.actor = actor;
        this.spells = this._getSpells();
        this.showOnlyPrepared = false;
    }

    _getSpells() {
        if (!this.actor) return [];
        
        // Get current favorites
        const favorites = this.actor.getFlag(MODULE.ID, 'favorites') || [];
        
        // Get spells
        const spells = this.actor.items.filter(item => item.type === 'spell');
        
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

        const spellData = {
            spells: this.spells,
            spellSlots: this._getSpellSlots(),
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            showOnlyPrepared: this.showOnlyPrepared
        };

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
            const preparedMatch = !this.showOnlyPrepared || spell.system.preparation?.prepared;

            const shouldShow = nameMatch && levelMatch && preparedMatch;

            $item.toggle(shouldShow);
        });
    }

    _activateListeners(html) {
        // Add filter toggle handler
        html.find('.spell-filter-toggle').click(async (event) => {
            this.showOnlyPrepared = !this.showOnlyPrepared;
            $(event.currentTarget).toggleClass('active', this.showOnlyPrepared);
            this._updateVisibility(html);
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

        // Spell slot tracking
        html.find('.slot-pip').click(async (event) => {
            const level = event.currentTarget.dataset.level;
            const index = parseInt(event.currentTarget.dataset.index);
            const spells = duplicate(this.actor.system.spells);
            const slot = spells[`spell${level}`];
            
            if (index < slot.value) {
                // Decrease slots
                slot.value = index;
            } else {
                // Increase slots (if not at max)
                if (index < slot.max) {
                    slot.value = index + 1;
                }
            }
            
            await this.actor.update({ 'system.spells': spells });
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