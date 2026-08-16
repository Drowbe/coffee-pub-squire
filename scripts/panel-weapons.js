import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';
import { PanelManager } from './manager-panel.js';
import { TransferUtils } from './transfer-utils.js';
import { getNativeElement, renderTemplate, getContainerInfo, activateContainerListener, applyItemTooltips, setRowFilter, getActionType, getActionTypes} from './helpers.js';
import { LightUtility } from './utility-lights.js';
import { StatblockUtility } from './utility-statblock.js';
import { QuantityEditor } from './utility-quantity.js';

export class WeaponsPanel {
    constructor(actor) {
        this.actor = actor;
        this.weapons = { all: [], byType: {} }; // Initialize empty, will be populated in render
        // Don't set panelManager in constructor
        this._transferDialogOpen = false; // Guard to prevent multiple dialogs
        // Store event handler references for cleanup
        this._eventHandlers = [];
    }

    async _getWeapons() {
        if (!this.actor) return { all: [], byType: {} };
        
        // Get current favorites
        const favorites = FavoritesPanel.getPanelFavorites(this.actor);
        
        // Get weapons
        const weapons = this.actor.items.filter(item => item.type === 'weapon');
        
        // Get active light source ID for this actor (from actor flag - most reliable)
        const effectiveActiveLightSourceId = LightUtility.getActiveLightSourceId(this.actor);

        // Built once per render — detection walks the whole actor.
        const issueMap = StatblockUtility.getIssueMap(this.actor);
        const canEditQuantity = QuantityEditor.canEdit(this.actor);
        
        // Map weapons with favorite state and additional data
        const mappedWeapons = await Promise.all(weapons.map(async weapon => {
            const weaponType = this._getWeaponType(weapon);
            const isLightSource = await LightUtility.isLightSource(weapon);
            let isLightActive = false;
            
            if (isLightSource && effectiveActiveLightSourceId) {
                const weaponLightSourceId = await LightUtility.getLightSourceId(weapon);
                isLightActive = weaponLightSourceId === effectiveActiveLightSourceId;
            }
            
            return {
                id: weapon.id,
                name: weapon.name,
                img: weapon.img || 'icons/svg/sword.svg',
                system: weapon.system,
                weaponType: weaponType,
                actionType: getActionType(weapon),
                actionTypes: getActionTypes(weapon).join(' '),
                isFavorite: favorites.includes(weapon.id),
                categoryId: `category-weapon-${weaponType}`,
                isLightSource: isLightSource,
                isLightActive: isLightActive,
                statblockIssue: StatblockUtility.getBadge(issueMap.get(weapon.id), this.actor),
                canEditQuantity: canEditQuantity && weapon.system?.quantity !== undefined,
                isNew: !!(weapon.getFlag(MODULE.ID, 'isNew') || PanelManager.newlyAddedItems?.has(weapon.id)),
                container: getContainerInfo(weapon, this.actor)
            };
        }));

        // Group weapons by type and sort each group alphabetically
        const weaponsByType = {
            'simple-melee': mappedWeapons.filter(w => w.weaponType === 'simple-melee').sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
            'martial-melee': mappedWeapons.filter(w => w.weaponType === 'martial-melee').sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
            'simple-ranged': mappedWeapons.filter(w => w.weaponType === 'simple-ranged').sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
            'martial-ranged': mappedWeapons.filter(w => w.weaponType === 'martial-ranged').sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
            'natural': mappedWeapons.filter(w => w.weaponType === 'natural').sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
        };

        return {
            all: mappedWeapons,
            byType: weaponsByType
        };
    }

    _getWeaponType(weapon) {
        const weaponData = weapon.system;
        
        // Check for natural weapons first
        if (weaponData.type.value === 'natural') return 'natural';
        
        // Get the weapon type (martial or simple)
        const typeValue = weaponData.type.value || '';
        
        // Check if it's martial and if it's ranged based on type value
        const isMartial = typeValue.startsWith('martial');
        const isRanged = typeValue.endsWith('R'); // DND5E uses 'martialR' for ranged, 'martialM' for melee
        
        if (isMartial) {
            return isRanged ? 'martial-ranged' : 'martial-melee';
        } else {
            return isRanged ? 'simple-ranged' : 'simple-melee';
        }
    }

    async render(html) {
        if (html) {
            // v13: Convert jQuery to native DOM if needed
            this.element = getNativeElement(html);
        }
        if (!this.element) return;

        // Get panel manager reference at render time
        this.panelManager = PanelManager.instance;

        // Refresh weapons data
        this.weapons = await this._getWeapons();

        const weaponData = {
            weapons: this.weapons.all,
            weaponsByType: this.weapons.byType,
            newlyAddedItems: PanelManager.newlyAddedItems
        };

        const template = await renderTemplate(TEMPLATES.PANEL_WEAPONS, weaponData);
        // v13: Use native DOM querySelector
        const weaponsPanel = this.element.querySelector('[data-panel="weapons"]');
        
        // Clean up old event listeners before updating HTML
        this._removeEventListeners(weaponsPanel);
        
        // v13: Use native DOM innerHTML instead of jQuery html()
        weaponsPanel.innerHTML = template;
        
        // Reset all categories to visible initially
        if (this.panelManager) {
            this.panelManager.resetCategories(weaponsPanel);
        }
        
        this._activateListeners(this.element);
        this._updateVisibility(this.element);
        this._updateLightIcons(this.element);

        PanelManager.instance?.controlPanel?.reapplyFilters();
    }

    _updateVisibility(html) {
        if (!html || !this.panelManager) return;
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        // Scope to this panel: a favorited weapon renders here and in the
        // favorites list under the same data-item-id, so a tray-wide query would
        // apply this equipped filter to the favorites copy as well.
        const panel = nativeHtml.querySelector('[data-panel="weapons"]');
        if (!panel) return;

        panel.querySelectorAll('.panel-item').forEach((item) => {
            const weaponId = item.dataset.itemId;
            const weapon = this.weapons.all.find(w => w.id === weaponId);

            if (!weapon) return;

            const categoryId = weapon.categoryId;
            const isCategoryHidden = this.panelManager.hiddenCategories.has(categoryId);
            // Category collapse is all this panel decides now. Equipped moved
             // to the filter bar, where one chip covers weapons, inventory and
             // favourites instead of three icons covering two panels.
            setRowFilter(item, 'category', isCategoryHidden);
        });

        // Update headers visibility using PanelManager
        this.panelManager._updateHeadersVisibility(panel);
    }

    /**
     * Update heart icon states to reflect current favorite status
     */
    _updateHeartIcons() {
        if (!this.element) return;
        
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(this.element);
        if (!nativeElement) return;

        // Scope to this panel: the same item also renders a heart in the favorites
        // list, which sits earlier in the tray DOM and would steal a tray-wide
        // querySelector's first match — leaving this panel's icon stale.
        const panel = nativeElement.querySelector('[data-panel="weapons"]');
        if (!panel) return;

        this.weapons.all.forEach(weapon => {
            const heartIcon = panel.querySelector(`[data-item-id="${weapon.id}"] .fa-heart`);
            if (heartIcon) {
                if (weapon.isFavorite) {
                    heartIcon.classList.remove('faded');
                } else {
                    heartIcon.classList.add('faded');
                }
            }
        });
    }

    /**
     * Update light icon states to reflect current light status
     */
    _updateLightIcons(html) {
        if (!html) {
            html = this.element;
        }
        
        // v13: Use native DOM instead of jQuery
        const nativeElement = getNativeElement(html);
        if (!nativeElement) return;

        // Scope to this panel — same first-match hazard as _updateHeartIcons: a
        // favorited light source renders a lightbulb in the favorites list too.
        const panel = nativeElement.querySelector('[data-panel="weapons"]') || nativeElement;

        this.weapons.all.forEach(weapon => {
            if (!weapon.isLightSource) return;

            const lightIcon = panel.querySelector(`[data-item-id="${weapon.id}"] .fa-lightbulb`);
            if (lightIcon) {
                if (weapon.isLightActive) {
                    lightIcon.classList.remove('faded');
                    lightIcon.classList.add('light-active');
                } else {
                    lightIcon.classList.add('faded');
                    lightIcon.classList.remove('light-active');
                }
            }
        });
    }

    _removeEventListeners(panel) {
        if (!panel) return;
        // Remove all stored event listeners
        this._eventHandlers.forEach(({ element, event, handler }) => {
            if (element && handler) {
                element.removeEventListener(event, handler);
            }
        });
        // Clear the handlers array
        this._eventHandlers = [];
    }

    _activateListeners(html) {
        if (!html || !this.panelManager) return;
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        // Same rich hover card the dnd5e sheet shows for these items.
        applyItemTooltips(nativeHtml, this.actor);

        // Use event delegation for all handlers
        const panel = nativeHtml.querySelector('[data-panel="weapons"]');
        if (!panel) return;

        // Remove any existing listeners first
        this._removeEventListeners(panel);

        // Category filter toggles
        // v13: Use native DOM event delegation
        const categoryFilterHandler = (event) => {
            const filter = event.target.closest('.weapons-category-filter');
            if (!filter) return;
            const categoryId = filter.dataset.filterId;
            if (categoryId) {
                this.panelManager.toggleCategory(categoryId, panel);
            }
        };
        panel.addEventListener('click', categoryFilterHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: categoryFilterHandler });

        // Statblock warning badge — click to repair
        const statblockHandler = StatblockUtility.activateBadgeListener(panel, this.actor);
        if (statblockHandler) {
            this._eventHandlers.push({ element: panel, event: 'click', handler: statblockHandler });
        }

        // Inline quantity editing on the count badge
        const quantityHandler = QuantityEditor.activateListener(panel, this.actor);
        if (quantityHandler) {
            this._eventHandlers.push({ element: panel, event: 'click', handler: quantityHandler });
        }

        // Open the container a weapon is stored inside
        const containerHandler = activateContainerListener(panel, this.actor);
        if (containerHandler) {
            this._eventHandlers.push({ element: panel, event: 'click', handler: containerHandler });
        }

        // Weapon info click (feather icon)
        // v13: Use native DOM event delegation
        const featherIconHandler = async (event) => {
            const featherIcon = event.target.closest('.tray-buttons .fa-feather');
            if (!featherIcon) return;
            
            const weaponItem = featherIcon.closest('.panel-item');
            if (!weaponItem) return;
            const weaponId = weaponItem.dataset.itemId;
            const weapon = this.actor.items.get(weaponId);
            if (weapon) {
                weapon.sheet.render(true);
            }
        };
        panel.addEventListener('click', featherIconHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: featherIconHandler });

        // Toggle favorite
        // v13: Use native DOM event delegation
        const heartIconHandler = async (event) => {
            const heartIcon = event.target.closest('.tray-buttons .fa-heart');
            if (!heartIcon) return;
            
            const weaponItem = heartIcon.closest('.panel-item');
            if (!weaponItem) return;
            const weaponId = weaponItem.dataset.itemId;
            await FavoritesPanel.manageFavorite(this.actor, weaponId);
            // manageFavorite() already updates all panels, including this one
        };
        panel.addEventListener('click', heartIconHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: heartIconHandler });

        // Light source click (light icon)
        // v13: Use native DOM event delegation
        const lightIconHandler = async (event) => {
            const lightIcon = event.target.closest('.tray-buttons .fa-lightbulb');
            if (!lightIcon) return;
            
            event.preventDefault();
            event.stopPropagation();
            
            // Prevent multiple rapid clicks
            if (lightIcon.dataset.processing === 'true') return;
            lightIcon.dataset.processing = 'true';
            
            try {
                const weaponItem = lightIcon.closest('.panel-item');
                if (!weaponItem) return;
                const weaponId = weaponItem.dataset.itemId;
                const item = this.actor.items.get(weaponId);
                if (!item) return;

                // Get the player's token
                const token = LightUtility.getPlayerToken(this.actor);
                if (!token) {
                    ui.notifications.warn('No token selected. Please select a token on the canvas.');
                    return;
                }

                // Toggle light on/off
                const result = await LightUtility.toggleLightForToken(token, item);
                
                // Refresh weapons to update all light icon states
                this.weapons = await this._getWeapons();
                
                // Update all light icons in the panel
                this._updateLightIcons(nativeHtml);
            } finally {
                // Remove processing flag after a short delay to allow for async operations
                setTimeout(() => {
                    lightIcon.dataset.processing = 'false';
                }, 500);
            }
        };
        panel.addEventListener('click', lightIconHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: lightIconHandler });

        // Weapon use click (image overlay)
        // v13: Use native DOM event delegation
        const rollOverlayHandler = async (event) => {
            const rollOverlay = event.target.closest('.panel-item-image-container .panel-item-roll-overlay');
            if (!rollOverlay) return;
            
            const weaponItem = rollOverlay.closest('.panel-item');
            if (!weaponItem) return;
            const weaponId = weaponItem.dataset.itemId;
            const weapon = this.actor.items.get(weaponId);
            if (weapon) {
                await weapon.use({}, { event });
            }
        };
        panel.addEventListener('click', rollOverlayHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: rollOverlayHandler });

        // Toggle equip state (shield icon)
        // v13: Use native DOM event delegation
        const shieldIconHandler = async (event) => {
            const shieldIcon = event.target.closest('.tray-buttons .fa-shield-alt');
            if (!shieldIcon) return;
            
            const weaponItem = shieldIcon.closest('.panel-item');
            if (!weaponItem) return;
            const weaponId = weaponItem.dataset.itemId;
            const weapon = this.actor.items.get(weaponId);
            if (weapon) {
                const newEquipped = !weapon.system.equipped;
                await weapon.update({
                    'system.equipped': newEquipped
                });
                // Update the UI immediately
                weaponItem.classList.toggle('prepared', newEquipped);
                shieldIcon.classList.toggle('faded', !newEquipped);
                // Update visibility in case we're filtering by equipped
                this._updateVisibility(nativeHtml);
            }
        };
        panel.addEventListener('click', shieldIconHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: shieldIconHandler });

        // Send weapon (share icon)
        // v13: Use native DOM event delegation
        const sendButtonHandler = async (event) => {
            const sendButton = event.target.closest('.weapons-send-item');
            if (!sendButton) return;
            
            // Prevent multiple dialogs from opening
            if (this._transferDialogOpen) {
                event.stopPropagation();
                return;
            }
            
            const itemId = sendButton.dataset.itemId;
            const item = this.actor.items.get(itemId);
            if (item) {
                // Open character selection window
                await this._openCharacterSelection(item);
            }
        };
        panel.addEventListener('click', sendButtonHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: sendButtonHandler });
    }

    _toggleCategory(categoryId) {
        // Implementation of _toggleCategory method
    }

    _onWeaponRoll(event) {
        // Implementation of _onWeaponRoll method
    }

    _onToggleEquipped(event) {
        // Implementation of _onToggleEquipped method
    }

    _onToggleFavorite(event) {
        // Implementation of _onToggleFavorite method
    }

    _onShowDetails(event) {
        // Implementation of _onShowDetails method
    }

    async _openCharacterSelection(item) {
        if (this._transferDialogOpen) return;
        this._transferDialogOpen = true;

        try {
            const { openItemTransferTool } = await import('./window-transfer-tool.js');
            await openItemTransferTool({
                item,
                sourceActor: this.actor,
                onSubmit: async ({ targetActor, quantity }) => {
                    const liveItem = this.actor?.items?.get(item.id);
                    if (!liveItem) throw new Error(`${item.name} is no longer available.`);
                    const completed = await TransferUtils.executeTransfer({
                        sourceActor: this.actor,
                        targetActor,
                        item: liveItem,
                        quantity,
                        hasQuantity: liveItem.system.quantity !== undefined && liveItem.system.quantity > 1
                    });
                    if (completed === false) throw new Error('The transfer could not be started.');
                },
                onClose: () => {
                    this._transferDialogOpen = false;
                }
            });
        } catch (error) {
            this._transferDialogOpen = false;
            throw error;
        }
    }
}



