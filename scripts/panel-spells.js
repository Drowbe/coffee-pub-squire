import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';
import { PanelManager } from './manager-panel.js';
import { getNativeElement } from './helpers.js';

export class SpellsPanel {
    constructor(actor) {
        this.actor = actor;
        this.spells = this._getSpells();
        this.showOnlyPrepared = game.settings.get(MODULE.ID, 'showOnlyPreparedSpells');
        // Don't set panelManager in constructor
    }

    _getSpells() {
        if (!this.actor) return [];
        
        // Get current favorites
        const favorites = FavoritesPanel.getPanelFavorites(this.actor);
        
        // Get spells
        const spells = this.actor.items.filter(item => item.type === 'spell');
        
        // Map spells with favorite state
        const mappedSpells = spells.map(spell => {
            const isFavorite = favorites.includes(spell.id);
            const level = spell.system.level;
            const isAtWill = spell.system.preparation?.mode === 'atwill';
            
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

        // Sort all spells alphabetically
        mappedSpells.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

        return mappedSpells;
    }

    _getActionType(spell) {
        // In D&D5E 4.0+, we use the new activities system (plural)
        const activities = spell.system.activities;
        if (activities) {
            // Get the first activity (usually there's only one)
            const activity = Object.values(activities)[0];
            if (activity?.activation?.type) {
                switch (activity.activation.type) {
                    case 'action': return 'action';
                    case 'bonus': return 'bonus';
                    case 'reaction': return 'reaction';
                    case 'special': return 'special';
                    default: return 'action'; // Most spells use an action
                }
            }
        }

        // Default to action for most spells
        return 'action';
    }

    async render(html) {
        if (html) {
            // v13: Convert jQuery to native DOM if needed
            this.element = getNativeElement(html);
        }
        if (!this.element) {
            return;
        }

        // Get panel manager reference at render time
        this.panelManager = PanelManager.instance;

        // Refresh spells data
        this.spells = this._getSpells();

        // Group spells by level and sort each group alphabetically
        const spellsByLevel = {};
        const spellsByType = {
            atwill: this.spells
                .filter(s => s.system.preparation?.mode === 'atwill')
                .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
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

        // Sort spells within each level
        Object.values(spellsByLevel).forEach(spells => {
            spells.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
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
        // v13: Use native DOM methods
        const spellsPanel = this.element.querySelector('[data-panel="spells"]');
        if (spellsPanel) {
            spellsPanel.innerHTML = template;
        }
        
        // Reset all categories to visible initially
        if (this.panelManager) {
            this.panelManager.resetCategories(this.element);
        }
        
        // Activate listeners on the root element
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
                const slotData = {
                    level: i,
                    value: spellLevelData.value || 0,
                    max: (spellLevelData.override ?? spellLevelData.max) || 0,
                    used: ((spellLevelData.override ?? spellLevelData.max) || 0) - (spellLevelData.value || 0)
                };
                slots.push(slotData);
            }
        }
        
        // Reverse the order so available slots come first (left) and expended slots come last (right)
        // This matches the character sheet display order
        slots.forEach(slotData => {
            slotData.reversedUsed = slotData.max - slotData.used;
        });
        
        return slots;
    }

    _updateVisibility(html) {
        if (!html || !this.panelManager) return;
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        nativeHtml.querySelectorAll('.spell-item').forEach((item) => {
            const spellId = item.dataset.spellId;
            const spell = this.spells.find(s => s.id === spellId);
            
            if (!spell) return;
            
            const categoryId = spell.categoryId;
            const isCategoryHidden = this.panelManager.hiddenCategories.has(categoryId);
            const preparedMatch = !this.showOnlyPrepared || 
                spell.system.level === 0 || // Cantrips are always prepared
                spell.system.preparation?.mode === 'atwill' || // At-will spells are always prepared
                spell.system.preparation?.prepared;
            
            item.style.display = (!isCategoryHidden && preparedMatch) ? '' : 'none';
        });

        // Update headers visibility using PanelManager
        this.panelManager._updateHeadersVisibility(nativeHtml);
        this.panelManager._updateEmptyMessage(nativeHtml);
    }

    /**
     * Update heart icon states to reflect current favorite status
     */
    _updateHeartIcons() {
        if (!this.element) return;
        
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        if (!nativeElement) return;
        
        this.spells.forEach(spell => {
            const heartIcon = nativeElement.querySelector(`[data-spell-id="${spell.id}"] .fa-heart`);
            if (heartIcon) {
                if (spell.isFavorite) {
                    heartIcon.classList.remove('faded');
                } else {
                    heartIcon.classList.add('faded');
                }
            }
        });
    }

    /**
     * Update spell slot display after changes
     */
    _updateSpellSlots(html) {
        if (!html || !this.actor) return;
        
        // v13: Normalize to native DOM element
        const nativeHtml = getNativeElement(html);
        if (!nativeHtml) return;
        
        const spellSlots = this._getSpellSlots();
        
        // Update each spell level's slot display
        spellSlots.forEach(slotData => {
            const level = slotData.level;
            const slotGroup = nativeHtml.querySelector(`[data-level="${level}"]`);
            if (!slotGroup) return;
            
            const pips = slotGroup.querySelectorAll('.slot-pip');
            pips.forEach((pip, index) => {
                if (index < slotData.reversedUsed) {
                    pip.classList.add('filled'); // Available slots = filled (first/left)
                } else {
                    pip.classList.remove('filled'); // Expended slots = unfilled (last/right)
                }
            });
        });
    }

    _removeEventListeners(panel) {
        if (!panel) return;
        // v13: Native DOM doesn't support jQuery's .off() method
        // Event listeners will be removed when elements are cloned in _activateListeners
        // This method is kept for compatibility but does nothing in v13
    }

    _activateListeners(html) {
        if (!html || !this.panelManager) return;

        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        // v13: Use native DOM querySelector instead of jQuery find
        const panel = nativeHtml.querySelector('[data-panel="spells"]');
        if (!panel) return;

        // Remove any existing listeners first
        this._removeEventListeners(panel);

        // Category filter toggles - v13: Convert to native DOM event delegation
        // TODO: Convert panel.on() event delegation to native DOM addEventListener
        panel.addEventListener('click', (event) => {
            const filter = event.target.closest('.spell-category-filter');
            if (!filter) return;
            const categoryId = filter.dataset.filterId;
            if (categoryId) {
                this.panelManager.toggleCategory(categoryId, panel);
            }
        });

        // Add filter toggle handler
        // v13: Use native DOM event delegation
        panel.addEventListener('click', async (event) => {
            const filterToggle = event.target.closest('.spell-filter-toggle');
            if (!filterToggle) return;
            
            this.showOnlyPrepared = !this.showOnlyPrepared;
            await game.settings.set(MODULE.ID, 'showOnlyPreparedSpells', this.showOnlyPrepared);
            filterToggle.classList.toggle('active', this.showOnlyPrepared);
            filterToggle.classList.toggle('faded', !this.showOnlyPrepared);
            this._updateVisibility(nativeHtml);
        });

        // Spell info click (feather icon)
        // v13: Use native DOM event delegation
        panel.addEventListener('click', async (event) => {
            const featherIcon = event.target.closest('.tray-buttons .fa-feather');
            if (!featherIcon) return;
            
            const spellItem = featherIcon.closest('.spell-item');
            if (!spellItem) return;
            const spellId = spellItem.dataset.spellId;
            const spell = this.actor.items.get(spellId);
            if (spell) {
                spell.sheet.render(true);
            }
        });

        // Toggle favorite
        // v13: Use native DOM event delegation
        panel.addEventListener('click', async (event) => {
            const heartIcon = event.target.closest('.tray-buttons .fa-heart');
            if (!heartIcon) return;
            
            const spellItem = heartIcon.closest('.spell-item');
            if (!spellItem) return;
            const spellId = spellItem.dataset.spellId;
            await FavoritesPanel.manageFavorite(this.actor, spellId);
            // Refresh the panel data to update heart icon states
            this.spells = this._getSpells();
            this._updateHeartIcons();
        });

        // Cast spell (roll overlay)
        // v13: Use native DOM event delegation
        panel.addEventListener('click', async (event) => {
            const rollOverlay = event.target.closest('.spell-image-container .spell-roll-overlay');
            if (!rollOverlay) return;
            
            const spellItem = rollOverlay.closest('.spell-item');
            if (!spellItem) return;
            const spellId = spellItem.dataset.spellId;
            const spell = this.actor.items.get(spellId);
            if (spell) {
                await spell.use({}, { event });
            }
        });

        // Toggle prepared state (sun icon)
        // v13: Use native DOM event delegation
        panel.addEventListener('click', async (event) => {
            const sunIcon = event.target.closest('.tray-buttons .fa-sun');
            if (!sunIcon) return;
            
            const spellItem = sunIcon.closest('.spell-item');
            if (!spellItem) return;
            const spellId = spellItem.dataset.spellId;
            const spell = this.actor.items.get(spellId);
            if (spell) {
                const newPrepared = !spell.system.preparation.prepared;
                await spell.update({
                    'system.preparation.prepared': newPrepared
                });
                // Update the UI immediately
                spellItem.classList.toggle('prepared', newPrepared);
                sunIcon.classList.toggle('faded', !newPrepared);
                // Update visibility in case we're filtering by prepared
                this._updateVisibility(nativeHtml);
            }
        });

        // Spell slot pip clicks (GM only)
        // v13: Use native DOM event delegation
        if (game.user.isGM) {
            panel.addEventListener('click', async (event) => {
                const pip = event.target.closest('.slot-pip');
                if (!pip) return;
                
                const level = parseInt(pip.dataset.level);
                
                if (isNaN(level)) return;
                
                const spellLevel = this.actor.system.spells[`spell${level}`];
                if (!spellLevel) return;
                
                const maxSlots = spellLevel.override ?? spellLevel.max;
                const currentAvailable = spellLevel.value || 0; // Current available slots
                
                // Simple logic: if pip is filled (available), use it (-1). If unfilled (expended), restore it (+1)
                const isCurrentlyAvailable = pip.classList.contains('filled');
                let newAvailable;
                
                if (isCurrentlyAvailable) {
                    // Clicked on available slot (filled) - USE it (-1 available)
                    newAvailable = Math.max(0, currentAvailable - 1);
                } else {
                    // Clicked on expended slot (unfilled) - RESTORE it (+1 available)
                    newAvailable = Math.min(maxSlots, currentAvailable + 1);
                }
                
                // Update the actor's spell slots
                await this.actor.update({
                    [`system.spells.spell${level}.value`]: newAvailable
                });
                
                // Refresh the spell slots display
                this._updateSpellSlots(nativeHtml);
            });
        }
    }
} 