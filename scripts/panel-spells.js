import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';

export class SpellsPanel {
    constructor(actor) {
        this.actor = actor;
        this.spells = this._getSpells();
        this.showOnlyPrepared = false;
        console.log("Spells loaded:", this.spells); // Debug log
    }

    _getSpells() {
        if (!this.actor) return [];
        const favorites = this.actor.getFlag(MODULE.ID, 'favorites') || [];
        const spells = this.actor.items.filter(item => item.type === 'spell');
        console.log('Found spells:', spells);
        
        const mappedSpells = spells.map(spell => {
            console.log('Processing spell:', spell);
            const spellData = {
                id: spell.id,
                name: spell.name,
                img: spell.img,
                system: spell.system,
                type: spell.type,
                isFavorite: favorites.includes(spell.id)
            };
            console.log('Processed spell data:', spellData);
            return spellData;
        });
        
        console.log('Final spells array:', mappedSpells);
        return mappedSpells;
    }

    async _toggleFavorite(itemId) {
        const favorites = this.actor.getFlag(MODULE.ID, 'favorites') || [];
        const newFavorites = favorites.includes(itemId)
            ? favorites.filter(id => id !== itemId)
            : [...favorites, itemId];
            
        await this.actor.setFlag(MODULE.ID, 'favorites', newFavorites);
        this.spells = this._getSpells();
        await this.render();
        
        // Re-render the favorites panel
        const favoritesPanel = Object.values(ui.windows).find(w => w instanceof FavoritesPanel && w.actor.id === this.actor.id);
        if (favoritesPanel) {
            await favoritesPanel.render();
        } else {
            // If we can't find the panel in ui.windows, try to get it from PanelManager
            const panelManager = ui.windows[Object.keys(ui.windows).find(key => 
                ui.windows[key].constructor.name === 'PanelManager' && 
                ui.windows[key].actor?.id === this.actor.id
            )];
            if (panelManager?.favoritesPanel) {
                await panelManager.favoritesPanel.render(panelManager.element);
            }
        }
    }

    async render(html) {
        this.element = html;
        const spellData = {
            spells: this.spells,
            spellSlots: this._getSpellSlots(),
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            showOnlyPrepared: this.showOnlyPrepared
        };
        
        console.log('Rendering with spell data:', spellData);
        console.log('Spells array:', this.spells);

        const template = await renderTemplate(TEMPLATES.PANEL_SPELLS, spellData);
        const spellsPanel = html.find('[data-panel="spells"]');
        console.log('Found spells panel:', spellsPanel.length);
        spellsPanel.html(template);
        
        this._activateListeners(html);
        this._updateVisibility(html);
    }

    _getSpellSlots() {
        if (!this.actor) return [];
        const spellbook = this.actor.system.spells;
        console.log("Spellbook data:", spellbook); // Debug spellbook
        
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
        
        console.log('Updating visibility:', { searchTerm, filterValue, showOnlyPrepared: this.showOnlyPrepared });
        
        const spellItems = html.find('.spell-item');
        console.log('Found spell items:', spellItems.length);
        
        spellItems.each((i, el) => {
            const $item = $(el);
            const spellId = $item.data('spell-id');
            const spell = this.spells.find(s => s.id === spellId);
            
            if (!spell) {
                console.warn('Spell not found for id:', spellId);
                return;
            }

            const nameMatch = spell.name.toLowerCase().includes(searchTerm);
            const levelMatch = filterValue === 'all' || 
                (filterValue === 'cantrip' && spell.system.level === 0) ||
                (filterValue === spell.system.level.toString());
            const preparedMatch = !this.showOnlyPrepared || spell.system.preparation?.prepared;

            const shouldShow = nameMatch && levelMatch && preparedMatch;
            console.log('Spell visibility:', {
                name: spell.name,
                nameMatch,
                levelMatch,
                preparedMatch,
                shouldShow
            });

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
                    await spell.use();
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
            console.log('Search input event triggered');
            this._updateVisibility(html);
        });

        filterSelect.on('change', () => {
            console.log('Filter select event triggered');
            this._updateVisibility(html);
        });
    }
} 