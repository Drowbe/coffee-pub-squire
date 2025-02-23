import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';
import { PanelManager } from './panel-manager.js';

export class SpellsPanel {
    constructor(actor) {
        console.log('SQUIRE | INIT DEBUG | SpellsPanel constructor:', {
            actor: !!actor,
            panelManagerExists: !!PanelManager.instance,
            timestamp: new Date().toISOString()
        });
        
        this.actor = actor;
        this.spells = this._getSpells();
        this.showOnlyPrepared = game.settings.get(MODULE.ID, 'showOnlyPreparedSpells');
        // Don't set panelManager in constructor
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
            const isAtWill = spell.system.preparation?.mode === 'atwill';
            
            // Debug log for a single spell's data structure
            if (spell.name === "Aid") {  // Log a specific spell to avoid console spam
                console.log('SQUIRE | Mapped Spell Data:', {
                    name: spell.name,
                    properties: spell.system.properties,
                    mappedProperties: spell.system.properties || [],
                    fullSystem: spell.system
                });
            }
            
            return {
                id: spell.id,
                name: spell.name,
                img: spell.img,
                system: spell.system,
                type: spell.type,
                actionType: this._getActionType(spell),
                isFavorite: isFavorite,
                categoryId: isAtWill ? 'category-spell-at-will' : `category-spell-level-${level}`
            };
        });

        // Group spells by type (at-will) and level
        const spellsByType = {
            atwill: mappedSpells.filter(s => s.system.preparation?.mode === 'atwill')
        };
        
        return mappedSpells;
    }

    _getActionType(spell) {
        // Debug log the spell data
        console.log("SQUIRE | Spell Action Type Debug:", {
            spellName: spell.name,
            system: spell.system,
            activation: spell.system.activation,
            time: spell.system.time
        });

        // Check activation type
        if (spell.system.activation?.type) {
            const type = spell.system.activation.type;
            switch(type) {
                case 'action': return 'action';
                case 'bonus': return 'bonus';
                case 'reaction': return 'reaction';
                case 'special': return 'special';
                default: return 'action'; // Most spells use an action
            }
        }

        // If no activation type, check casting time (legacy)
        if (spell.system.time) {
            const time = spell.system.time.toLowerCase();
            if (time.includes('bonus')) return 'bonus';
            if (time.includes('reaction')) return 'reaction';
            if (time.includes('special')) return 'special';
        }

        // Default to action for most spells
        return 'action';
    }

    async render(html) {
        console.log('SQUIRE | INIT DEBUG | SpellsPanel render start:', {
            hasHtml: !!html,
            hasElement: !!this.element,
            panelManagerExists: !!PanelManager.instance,
            timestamp: new Date().toISOString()
        });

        if (html) {
            this.element = html;
        }
        if (!this.element) {
            console.log('SQUIRE | INIT DEBUG | No element to render to');
            return;
        }

        // Get panel manager reference at render time
        this.panelManager = PanelManager.instance;
        console.log('SQUIRE | INIT DEBUG | Got panel manager:', {
            panelManagerExists: !!this.panelManager,
            timestamp: new Date().toISOString()
        });

        // Refresh spells data
        this.spells = this._getSpells();

        // Group spells by level
        const spellsByLevel = {};
        const spellsByType = {
            atwill: this.spells.filter(s => s.system.preparation?.mode === 'atwill')
        };

        this.spells.forEach(spell => {
            if (spell.system.preparation?.mode !== 'atwill') {
                const level = spell.system.level;
                if (!spellsByLevel[level]) {
                    spellsByLevel[level] = [];
                }
                spellsByLevel[level].push(spell);
            }
        });

        const spellSlots = this._getSpellSlots();
        
        const position = game.settings.get(MODULE.ID, 'trayPosition');
        const spellData = {
            spells: this.spells,
            spellsByLevel,
            spellsByType,
            spellSlots,
            position,
            showOnlyPrepared: this.showOnlyPrepared
        };

        const template = await renderTemplate(TEMPLATES.PANEL_SPELLS, spellData);
        
        // Remove old listeners before updating HTML
        this._removeEventListeners(this.element);
        
        // Update the panel content
        this.element.find('[data-panel="spells"]').html(template);
        
        // Reset all categories to visible initially
        if (this.panelManager) {
            this.panelManager.resetCategories(this.element[0]);
        }
        
        // Activate listeners on the root element
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
        console.log('SQUIRE | CLICK DEBUG | Initializing listeners:', {
            htmlExists: !!html,
            panelManagerExists: !!this.panelManager,
            htmlIsJQuery: html instanceof $,
            foundPanel: html?.find('[data-panel="spells"]').length > 0
        });

        if (!html || !this.panelManager) {
            console.error('SQUIRE | CLICK DEBUG | Missing required objects:', {
                html: !!html,
                panelManager: !!this.panelManager
            });
            return;
        }

        // Remove existing listeners first
        this._removeEventListeners(html);

        // Get the panel element
        const panel = html.find('[data-panel="spells"]');
        console.log('SQUIRE | CLICK DEBUG | Found spells panel:', {
            panelExists: panel.length > 0,
            panelHtml: panel.html()
        });

        // Add a general click handler to debug all clicks
        panel.on('click.squireSpells', '*', (event) => {
            console.log('SQUIRE | CLICK DEBUG | Click detected:', {
                target: event.target,
                targetClasses: event.target.className,
                closestPanel: $(event.target).closest('[data-panel="spells"]').length > 0,
                closestSpellItem: $(event.target).closest('.spell-item').length > 0,
                eventType: event.type,
                timestamp: new Date().toISOString()
            });
        });

        // Level filter toggles
        panel.on('click.squireSpells', '.spell-level-filter', (event) => {
            console.log('SQUIRE | CLICK DEBUG | Level filter clicked:', {
                target: event.currentTarget,
                filterId: $(event.currentTarget).data('filter-id'),
                timestamp: new Date().toISOString()
            });
            const $filter = $(event.currentTarget);
            const categoryId = $filter.data('filter-id');
            this.panelManager.toggleCategory(categoryId, panel[0]);
        });

        // Prepared toggle (sun icon)
        panel.on('click.squireSpells', '.tray-buttons .fa-sun', async (event) => {
            console.log('SQUIRE | CLICK DEBUG | Sun icon clicked:', {
                spellId: $(event.currentTarget).closest('.spell-item').data('spell-id'),
                timestamp: new Date().toISOString()
            });
            const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            const spell = this.actor.items.get(spellId);
            if (spell) {
                const newPrepared = !spell.system.preparation.prepared;
                await spell.update({
                    'system.preparation.prepared': newPrepared
                });
                const $item = $(event.currentTarget).closest('.spell-item');
                $item.toggleClass('prepared', newPrepared);
                $(event.currentTarget).toggleClass('faded', !newPrepared);
                this._updateVisibility(html);
            }
        });

        // Filter toggle
        panel.on('click.squireSpells', '.spell-filter-toggle', async (event) => {
            console.log('SQUIRE | CLICK DEBUG | Filter toggle clicked:', {
                currentState: this.showOnlyPrepared,
                timestamp: new Date().toISOString()
            });
            this.showOnlyPrepared = !this.showOnlyPrepared;
            await game.settings.set(MODULE.ID, 'showOnlyPreparedSpells', this.showOnlyPrepared);
            $(event.currentTarget)
                .toggleClass('active', this.showOnlyPrepared)
                .toggleClass('faded', !this.showOnlyPrepared);
            this._updateVisibility(html);
        });

        // Favorite toggle (heart icon)
        panel.on('click.squireSpells', '.tray-buttons .fa-heart', async (event) => {
            console.log('SQUIRE | CLICK DEBUG | Heart icon clicked:', {
                spellId: $(event.currentTarget).closest('.spell-item').data('spell-id'),
                timestamp: new Date().toISOString()
            });
            const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            await FavoritesPanel.manageFavorite(this.actor, spellId);
        });

        // Cast spell (roll overlay)
        panel.on('click.squireSpells', '.spell-image-container .spell-roll-overlay', async (event) => {
            console.log('SQUIRE | CLICK DEBUG | Spell roll overlay clicked:', {
                spellId: $(event.currentTarget).closest('.spell-item').data('spell-id'),
                timestamp: new Date().toISOString()
            });
            const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            const spell = this.actor.items.get(spellId);
            if (spell) {
                await spell.use({}, { event });
            }
        });

        // View spell details (feather icon)
        panel.on('click.squireSpells', '.tray-buttons .fa-feather', async (event) => {
            console.log('SQUIRE | CLICK DEBUG | Feather icon clicked:', {
                spellId: $(event.currentTarget).closest('.spell-item').data('spell-id'),
                timestamp: new Date().toISOString()
            });
            const spellId = $(event.currentTarget).closest('.spell-item').data('spell-id');
            const spell = this.actor.items.get(spellId);
            if (spell) {
                spell.sheet.render(true);
            }
        });

        console.log('SQUIRE | CLICK DEBUG | All listeners activated');
    }

    _removeEventListeners(panel) {
        if (!panel?.length) return;
        panel.off('.squireSpells');
    }
} 