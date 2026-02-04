import { MODULE, TEMPLATES } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';
import { PanelManager } from './manager-panel.js';
import { TransferUtils } from './transfer-utils.js';
import { getNativeElement, renderTemplate } from './helpers.js';
import { CharactersWindow } from './window-characters.js';
import { LightUtility } from './utility-lights.js';

export class WeaponsPanel {
    constructor(actor) {
        this.actor = actor;
        this.weapons = { all: [], byType: {} }; // Initialize empty, will be populated in render
        this.showOnlyEquipped = game.settings.get(MODULE.ID, 'showOnlyEquippedWeapons');
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
                actionType: this._getActionType(weapon),
                isFavorite: favorites.includes(weapon.id),
                categoryId: `category-weapon-${weaponType}`,
                isLightSource: isLightSource,
                isLightActive: isLightActive
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

    _getActionType(weapon) {
        // In D&D5E 4.0+, we use the new activities system (plural)
        const activities = weapon.system.activities;
        if (activities) {
            // Get the first activity (usually there's only one)
            const activity = Object.values(activities)[0];
            if (activity?.activation?.type) {
                switch (activity.activation.type) {
                    case 'action': return 'action';
                    case 'bonus': return 'bonus';
                    case 'reaction': return 'reaction';
                    case 'special': return 'special';
                    default: return null;
                }
            }
        }

        // Default to action for most weapons if no specific type is set
        return 'action';
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
            position: game.settings.get(MODULE.ID, 'trayPosition'),
            showOnlyEquipped: this.showOnlyEquipped,
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
            this.panelManager.resetCategories(weaponsPanel[0]);
        }
        
        this._activateListeners(this.element);
        this._updateVisibility(this.element);
        this._updateLightIcons(this.element);

        PanelManager.instance?.controlPanel?.reapplySearch();
    }

    _updateVisibility(html) {
        if (!html || !this.panelManager) return;
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }
        
        nativeHtml.querySelectorAll('.weapon-item').forEach((item) => {
            const weaponId = item.dataset.weaponId;
            const weapon = this.weapons.all.find(w => w.id === weaponId);
            
            if (!weapon) return;
            
            const categoryId = weapon.categoryId;
            const isCategoryHidden = this.panelManager.hiddenCategories.has(categoryId);
            const equippedMatch = !this.showOnlyEquipped || weapon.system.equipped;
            
            item.style.display = (!isCategoryHidden && equippedMatch) ? '' : 'none';
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
        
        this.weapons.all.forEach(weapon => {
            const heartIcon = nativeElement.querySelector(`[data-weapon-id="${weapon.id}"] .fa-heart`);
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
        
        this.weapons.all.forEach(weapon => {
            if (!weapon.isLightSource) return;
            
            const lightIcon = nativeElement.querySelector(`[data-weapon-id="${weapon.id}"] .fa-lightbulb`);
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

        // Add filter toggle handler
        // v13: Use native DOM event delegation
        const filterToggleHandler = async (event) => {
            const filterToggle = event.target.closest('.weapon-filter-toggle');
            if (!filterToggle) return;
            
            this.showOnlyEquipped = !this.showOnlyEquipped;
            await game.settings.set(MODULE.ID, 'showOnlyEquippedWeapons', this.showOnlyEquipped);
            filterToggle.classList.toggle('active', this.showOnlyEquipped);
            filterToggle.classList.toggle('faded', !this.showOnlyEquipped);
            this._updateVisibility(nativeHtml);
        };
        panel.addEventListener('click', filterToggleHandler);
        this._eventHandlers.push({ element: panel, event: 'click', handler: filterToggleHandler });

        // Weapon info click (feather icon)
        // v13: Use native DOM event delegation
        const featherIconHandler = async (event) => {
            const featherIcon = event.target.closest('.tray-buttons .fa-feather');
            if (!featherIcon) return;
            
            const weaponItem = featherIcon.closest('.weapon-item');
            if (!weaponItem) return;
            const weaponId = weaponItem.dataset.weaponId;
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
            
            const weaponItem = heartIcon.closest('.weapon-item');
            if (!weaponItem) return;
            const weaponId = weaponItem.dataset.weaponId;
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
                const weaponItem = lightIcon.closest('.weapon-item');
                if (!weaponItem) return;
                const weaponId = weaponItem.dataset.weaponId;
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
            const rollOverlay = event.target.closest('.weapon-image-container .weapon-roll-overlay');
            if (!rollOverlay) return;
            
            const weaponItem = rollOverlay.closest('.weapon-item');
            if (!weaponItem) return;
            const weaponId = weaponItem.dataset.weaponId;
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
            
            const weaponItem = shieldIcon.closest('.weapon-item');
            if (!weaponItem) return;
            const weaponId = weaponItem.dataset.weaponId;
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
        // Prevent multiple dialogs from opening
        if (this._transferDialogOpen) return;
        
        // Check if item has quantity and show quantity selection dialog first
        const hasQuantity = item.system.quantity !== undefined && item.system.quantity > 1;
        const maxQuantity = hasQuantity ? item.system.quantity : 1;
        
        let selectedQuantity = 1;
        
        if (hasQuantity && maxQuantity > 1) {
            // Show quantity selection dialog
            this._transferDialogOpen = true;
            try {
                selectedQuantity = await this._showTransferQuantityDialog(item, this.actor, null, maxQuantity, hasQuantity);
                if (selectedQuantity <= 0) {
                    this._transferDialogOpen = false;
                    return; // User cancelled
                }
            } catch (error) {
                this._transferDialogOpen = false;
                throw error;
            }
        }
        
        // Create character selection window with the selected quantity
        const characterWindow = new CharactersWindow({
            item: item,
            sourceActor: this.actor,
            sourceItemId: item.id,
            selectedQuantity: selectedQuantity,
            hasQuantity: hasQuantity,
            onCharacterSelected: async (...args) => {
                this._transferDialogOpen = false;
                await this._handleCharacterSelected(...args);
            }
        });
        
        // Render the window
        await characterWindow.render(true);
        // Reset flag when character window closes (if quantity dialog wasn't shown)
        if (!hasQuantity || maxQuantity <= 1) {
            characterWindow.app.onClose = () => {
                this._transferDialogOpen = false;
            };
        }
    }

    async _handleCharacterSelected(targetActor, item, sourceActor, sourceItemId, selectedQuantity, hasQuantity) {
        // Use the shared transfer utility with the selected quantity
        await TransferUtils.executeTransfer({
            sourceActor: sourceActor,
            targetActor: targetActor,
            item: item,
            sourceItemId: sourceItemId,
            quantity: selectedQuantity,
            hasQuantity: hasQuantity
        });
        
        // Panel refresh is handled automatically by the deleteItem hook
    }

    async _showTransferQuantityDialog(sourceItem, sourceActor, targetActor, maxQuantity, hasQuantity) {
        const timestamp = Date.now();
        
        // Check if a dialog with this ID already exists
        const existingDialog = document.querySelector(`#transfer-item-${timestamp}`);
        if (existingDialog) {
            // Dialog already exists, don't create another
            return 0;
        }
        
        // Prepare template data for sender's dialog
        const senderTemplateData = {
            sourceItem,
            sourceActor,
            targetActor,
            maxQuantity,
            timestamp,
            canAdjustQuantity: hasQuantity && maxQuantity > 1,
            isReceiveRequest: false,
            hasQuantity
        };
        
        // Render the transfer dialog template for the sender
        const senderContent = await renderTemplate(TEMPLATES.TRANSFER_DIALOG, senderTemplateData);
        
        // Initiate the transfer process
        const selectedQuantity = await new Promise(resolve => {
            const dialog = new Dialog({
                title: "Transfer Item",
                content: senderContent,
                buttons: {
                    transfer: {
                        icon: '<i class="fa-solid fa-exchange-alt"></i>',
                        label: "Transfer",
                        callback: html => {
                            // v13: Convert jQuery to native DOM if needed
                            let nativeHtml = html;
                            if (html && (html.jquery || typeof html.find === 'function')) {
                                nativeHtml = html[0] || html.get?.(0) || html;
                            }
                            
                            if (hasQuantity && maxQuantity > 1) {
                                // v13: Use native DOM querySelector and value
                                const input = nativeHtml.querySelector(`input[name="quantity_${timestamp}"]`);
                                const quantity = Math.clamp(
                                    parseInt(input?.value || '1'),
                                    1,
                                    maxQuantity
                                );
                                this._transferDialogOpen = false;
                                resolve(quantity);
                            } else {
                                this._transferDialogOpen = false;
                                resolve(1);
                            }
                        }
                    },
                    cancel: {
                        icon: '<i class="fa-solid fa-times"></i>',
                        label: "Cancel",
                        callback: () => {
                            this._transferDialogOpen = false;
                            resolve(0);
                        }
                    }
                },
                default: "transfer",
                close: () => {
                    this._transferDialogOpen = false;
                    resolve(0);
                }
            }, {
                classes: ["transfer-item"],
                id: `transfer-item-${timestamp}`,
                width: 320,
                height: "auto"
            });
            
            dialog.render(true);
        });
        
        return selectedQuantity;
    }
} 