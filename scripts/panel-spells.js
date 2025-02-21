import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';
import { PanelManager } from './panel-manager.js';

export class SpellsPanel {
    constructor(actor) {
        this.actor = actor;
        this.spells = this._getSpells();
        this.showOnlyPrepared = game.settings.get(MODULE.ID, 'showOnlyPreparedSpells');
        this.panelManager = PanelManager.instance;
    }

    _getSpells() {
        if (!this.actor) return [];
        
        // Get current favorites
        const favorites = FavoritesPanel.getFavorites(this.actor);
        
        // Get spells
        const spells = this.actor.items.filter(item => item.type === 'spell');
        
        // Map spells with favorite state
        const mappedSpells = spells.map(spell => {
            const isFavorite = favorites.includes(spell.id);
            const level = spell.system.level;
            
            return {
                id: spell.id,
                name: spell.name,
                img: spell.img,
                system: spell.system,
                type: spell.type,
                isFavorite: isFavorite,
                categoryId: `category-spell-level-${level}`
            };
        });
        
        return mappedSpells;
    }

    _handleSearch(searchTerm) {
        if (!this.element || !this.panelManager) return;
        this.panelManager.updateSearchVisibility(searchTerm, this.element[0], '.spell-item');
    }

    async render(html) {
        if (html) {
            this.element = html;
        }
        if (!this.element) {
            return;
        }

        // Refresh spells data
        this.spells = this._getSpells();

        // Group spells by level
        const spellsByLevel = {};
        this.spells.forEach(spell => {
            const level = spell.system.level;
            if (!spellsByLevel[level]) {
                spellsByLevel[level] = [];
            }
            spellsByLevel[level].push(spell);
        });

        const spellSlots = this._getSpellSlots();
        
        // Debug data being sent to template
        console.log("SQUIRE | Data for Template:", {
            spellsByLevel: spellsByLevel,
            spellSlots: spellSlots,
            position: game.settings.get(MODULE.ID, 'trayPosition')
        });

        const position = game.settings.get(MODULE.ID, 'trayPosition');
        const spellData = {
            spells: this.spells,
            spellsByLevel: spellsByLevel,
            spellSlots: spellSlots,
            position: position,
            showOnlyPrepared: this.showOnlyPrepared
        };

        // Debug the exact data and position
        console.log("SQUIRE | Spell Panel Render Debug:", {
            position: position,
            spellSlots: spellSlots,
            firstLevelSlot: spellSlots.find(s => s.level === 1),
            spellsByLevel: spellsByLevel,
            timestamp: new Date().toISOString()
        });

        const template = await renderTemplate(TEMPLATES.PANEL_SPELLS, spellData);
        const spellsPanel = this.element.find('[data-panel="spells"]');
        spellsPanel.html(template);
        
        // Reset all categories to visible initially
        if (this.panelManager) {
            this.panelManager.resetCategories(spellsPanel[0]);
        }
        
        this._activateListeners(this.element);
        this._updateVisibility(this.element);
    }

    _getSpellSlots() {
        if (!this.actor) return [];
        const spellbook = this.actor.system.spells;
        
        // Debug logging for raw spellbook data
        console.log("SQUIRE | Spellbook Data Debug:", {
            actor: this.actor.name,
            actorId: this.actor.id,
            spellbook: spellbook,
            pactMagic: spellbook.pact,
            spellLevels: Object.keys(spellbook).filter(k => k.startsWith('spell')),
            timestamp: new Date().toISOString()
        });
        
        // Convert spellbook data into array format
        const slots = [];
        for (let i = 1; i <= 9; i++) {
            const spellLevelData = spellbook[`spell${i}`];
            if (spellLevelData) {
                const slotData = {
                    level: i,
                    value: spellLevelData.value || 0,
                    max: (spellLevelData.override ?? spellLevelData.max) || 0,
                    used: ((spellLevelData.override ?? spellLevelData.max) || 0) - (spellLevelData.value || 0)
                };
                slots.push(slotData);
                
                // Debug logging for each level's data
                console.log(`SQUIRE | Level ${i} Spell Slots Debug:`, {
                    raw: spellLevelData,
                    computed: slotData,
                    hasOverride: 'override' in spellLevelData,
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        // Debug final slots array
        console.log("SQUIRE | Final Slots Array Debug:", {
            slots: slots,
            totalSlots: slots.reduce((sum, s) => sum + s.max, 0),
            usedSlots: slots.reduce((sum, s) => sum + (s.max - s.value), 0),
            timestamp: new Date().toISOString()
        });
        
        return slots;
    }

    _updateVisibility(html) {
        if (!html || !this.panelManager) return;
        
        const items = html.find('.spell-item');
        items.each((_, item) => {
            const $item = $(item);
            const spellId = $item.data('spell-id');
            const spell = this.spells.find(s => s.id === spellId);
            
            if (!spell) return;
            
            const categoryId = spell.categoryId;
            const isCategoryHidden = this.panelManager.hiddenCategories.has(categoryId);
            const preparedMatch = !this.showOnlyPrepared || 
                spell.system.level === 0 || // Cantrips are always prepared
                spell.system.preparation?.prepared;
            
            $item.toggle(!isCategoryHidden && preparedMatch);
        });

        // Update headers visibility using PanelManager
        this.panelManager._updateHeadersVisibility(html[0]);
        this.panelManager._updateEmptyMessage(html[0]);
    }

    _activateListeners(html) {
        if (!html || !this.panelManager) return;

        // Use event delegation for all handlers
        const panel = html.find('[data-panel="spells"]');

        // Level filter toggles
        panel.on('click', '.spell-level-filter', (event) => {
            const $filter = $(event.currentTarget);
            const categoryId = $filter.data('filter-id');
            this.panelManager.toggleCategory(categoryId, panel[0]);
        });

        // Search functionality
        panel.on('input', '.spell-search', (event) => {
            this._handleSearch(event.target.value);
        });

        // Clear search
        panel.on('click', '.clear-search', () => {
            panel.find('.spell-search').val('').trigger('input');
        });

        // Toggle prepared state (sun icon)
        panel.on('click', '.tray-buttons .fa-sun', async (event) => {
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

        // Toggle prepared spells only
        panel.on('click', '.spell-filter-toggle', async (event) => {
            this.showOnlyPrepared = !this.showOnlyPrepared;
            await game.settings.set(MODULE.ID, 'showOnlyPreparedSpells', this.showOnlyPrepared);
            $(event.currentTarget)
                .toggleClass('active', this.showOnlyPrepared)
                .toggleClass('faded', !this.showOnlyPrepared);
            this._updateVisibility(html);
        });

        // Remove from favorites
        panel.on('click', '.spell-item .fa-heart', async (event) => {
            const itemId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            await FavoritesPanel.manageFavorite(this.actor, itemId);
        });

        // Cast spell
        panel.on('click', '.spell-image-container .spell-roll-overlay', async (event) => {
            const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            const spell = this.actor.items.get(spellId);
            if (spell) {
                await spell.use({}, { event });
            }
        });

        // View spell details
        panel.on('click', '.spell-item .fa-feather', async (event) => {
            const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            const spell = this.actor.items.get(spellId);
            if (spell) {
                spell.sheet.render(true);
            }
        });
    }
} 