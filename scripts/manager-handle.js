import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';
import { PanelManager } from './manager-panel.js';
import { getBlacksmith, getHealthbarStatusClass, getTokenDisplayName, getNativeElement, renderTemplate, getCampaignContext, openHealthWindow, getHealthPercent, openStatusEffectsWindow, applyItemTooltips } from './helpers.js';
import { trackModuleTimeout } from './timer-utils.js';

// FoundryVTT function imports
const { fromUuid } = globalThis;

export class HandleManager {
    constructor(panelManager) {
        this.panelManager = panelManager;
        this.actor = panelManager.actor;

        // Resize listener will be set up after first successful updateHandle call
        this._resizeHandler = null;

        // Handle element the delegated listeners are bound to (bind once per tray element)
        this._boundHandleElement = null;

        // Document-level click-away listener, kept so destroy() can remove it
        this._documentClickHandler = null;

    }

    /**
     * Set up window resize listener for handle fade effect
     * @private
     */
    _setupResizeListener() {
        // Remove any existing listener to prevent duplicates
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
        
        // Bind the handler to this instance
        this._resizeHandler = this._updateHandleFade.bind(this);
        
        // Add the resize listener
        window.addEventListener('resize', this._resizeHandler);
    }

    _resolveTokenForActor(actor) {
        if (!actor) return null;
        const controlled = canvas?.tokens?.controlled ?? [];
        let token = controlled.find(t => t.actor?.id === actor.id);
        if (token) return token;
        const activeTokens = actor.getActiveTokens?.(true) ?? [];
        if (!activeTokens?.length) return null;
        const sameScene = activeTokens.find(t => t.scene?.id === canvas?.scene?.id);
        return sameScene || activeTokens[0];
    }

    _getDisplayName(token, actor) {
        return getTokenDisplayName(token, actor) || '';
    }

    /**
     * Update the handle content with current actor data
     * This is the single source of truth for all handle data preparation
     */
    async updateHandle() {
        if (!PanelManager.element) {
            console.warn('HandleManager.updateHandle: No tray element available');
            return;
        }

        // Helper function to calculate health status and percentage
        const calculateHealthStatus = (actor) => {
            if (!actor || !actor.system?.attributes?.hp) return { status: 'dead', percentage: 0 };
            
            const percentage = getHealthPercent(actor) ?? 0;
            const statusClass = getHealthbarStatusClass(actor.system.attributes.hp);
            const status = statusClass.replace('squire-tray-healthbar-', '');
            
            return { status, statusClass, percentage };
        };

        // Always gather party context
        const tokens = canvas.tokens.placeables.filter(token => token.actor?.hasPlayerOwner);
        const primaryToken = this._resolveTokenForActor(this.actor);
        const actorDisplayName = this._getDisplayName(primaryToken, this.actor);
        const controlledTokenIds = canvas.tokens.controlled
            .filter(token => token.actor)
            .map(token => token.actor.id);

        // Use the first controlled actor, or the first party member if none selected
        let currentActor = null;
        if (controlledTokenIds.length > 0) {
            currentActor = game.actors.get(controlledTokenIds[0]);
        } else if (tokens.length > 0) {
            currentActor = tokens[0].actor;
        }

        // Add health data to currentActor if it exists
        if (currentActor) {
            const healthData = calculateHealthStatus(currentActor);
            currentActor.healthStatus = healthData.status;
            currentActor.healthbarStatusClass = healthData.statusClass;
            currentActor.healthPercentage = healthData.percentage;
            const currentToken = tokens.find(t => t.actor?.id === currentActor.id) || this._resolveTokenForActor(currentActor);
            currentActor.handleDisplayName = this._getDisplayName(currentToken, currentActor);
        }

        const otherPartyMembers = tokens
            .filter(token => token.actor && token.actor.id !== currentActor?.id)
            .map(token => {
                const memberActor = token.actor;
                const healthData = calculateHealthStatus(memberActor);
                return {
                    id: memberActor.id,
                    name: memberActor.name,
                    displayName: this._getDisplayName(token, memberActor),
                    img: memberActor.img,
                    system: memberActor.system,
                    isOwner: memberActor.isOwner,
                    healthStatus: healthData.status,
                    healthbarStatusClass: healthData.statusClass,
                    healthPercentage: healthData.percentage
                };
            });

        // Handle favorites are shaped by the `getHandleFavorites` Handlebars
        // helper, which the handle-favorites partial calls directly — it sorts
        // by panel order and computes availability. A second copy built here
        // was never read by any template.

        // Build handle data object
        const handleData = {
            actor: this.actor ? (() => {
                const healthData = calculateHealthStatus(this.actor);
                // Add health properties to the original actor object without spreading
                this.actor.healthStatus = healthData.status;
                this.actor.healthbarStatusClass = healthData.statusClass;
                this.actor.healthPercentage = healthData.percentage;
                this.actor.handleDisplayName = actorDisplayName || this.actor.name;
                return this.actor;
            })() : null,
            actorDisplayName: actorDisplayName || this.actor?.name || '',
            isGM: game.user.isGM,
            canManageEffects: !!this.actor?.isOwner,
            effects: this.actor?.effects?.map(e => ({
                id: e.id,
                name: e.name,
                icon: e.img || CONFIG.DND5E.conditionTypes[e.name.toLowerCase()]?.img || 'icons/svg/aura.svg'
            })) || [],
            showHandleConditions: game.settings.get(MODULE.ID, 'showHandleConditions'),
            showHandleFavorites: game.settings.get(MODULE.ID, 'showHandleFavorites'),
            showHandleHealthBar: game.settings.get(MODULE.ID, 'showHandleHealthBar'),
            defaultPartyName: getCampaignContext().party
        };

        // If party view, add party context for handle-party
        if (PanelManager.viewMode === 'party') {
            handleData.actor = currentActor ? (() => {
                const healthData = calculateHealthStatus(currentActor);
                // Add health properties to the original actor object without spreading
                currentActor.healthStatus = healthData.status;
                currentActor.healthbarStatusClass = healthData.statusClass;
                currentActor.healthPercentage = healthData.percentage;
                currentActor.handleDisplayName = currentActor.handleDisplayName || this._getDisplayName(this._resolveTokenForActor(currentActor), currentActor) || currentActor.name;
                return currentActor;
            })() : null;
            handleData.actorDisplayName = currentActor?.handleDisplayName || handleData.actorDisplayName;
            handleData.otherPartyMembers = otherPartyMembers;
        }
        else {
            handleData.otherPartyMembers = otherPartyMembers;
        }

        // Render ONLY the view-specific handle template — not the whole tray.
        // (Rendering TEMPLATES.TRAY here built every panel's markup just to slice out
        // the handle wrapper, and this method runs on nearly every actor/item hook.)
        const trayData = {
            viewMode: PanelManager.viewMode,
            ...handleData
        };

        const handleTemplates = {
            player: TEMPLATES.HANDLE_PLAYER,
            party: TEMPLATES.HANDLE_PARTY
        };
        const handleContent = await renderTemplate(
            handleTemplates[PanelManager.viewMode] ?? TEMPLATES.HANDLE_PLAYER,
            trayData
        );

        // Update the handle content
        // v13: Use native DOM instead of jQuery
        const handleLeft = PanelManager.element?.querySelector('.tray-handle-content-wrapper');
        if (handleLeft) {
            handleLeft.innerHTML = handleContent;
            // Per update, not in _attachHandleEventListeners: the listeners are
            // delegated and bind once per tray, but this innerHTML swap builds
            // fresh favourite icons every time.
            applyItemTooltips(handleLeft, this.actor || PanelManager.currentActor);
        }

        // Set up resize listener if not already set up
        if (!this._resizeHandler) {
            this._setupResizeListener();
        }

        // Check for handle overflow and toggle fade effect
        this._updateHandleFade();

        // Reattach event listeners for handle elements
        this._attachHandleEventListeners();
    }

    /**
     * Attach all event listeners for handle elements
     * @private
     */
    _attachHandleEventListeners() {
        // Check if PanelManager.element exists before proceeding
        if (!PanelManager.element) return;
        
        // v13: Use native DOM querySelector instead of jQuery find
        const nativePanelManagerElement = getNativeElement(PanelManager.element);
        if (!nativePanelManagerElement) return;
        
        const handle = nativePanelManagerElement.querySelector('.tray-handle');
        if (!handle) return;

        // All handlers below are DELEGATED to the stable .tray-handle element, so they
        // survive handle content re-renders (updateHandle only swaps the wrapper's
        // innerHTML). Bind once per tray element — no clone-and-rebind per update.
        if (this._boundHandleElement === handle) return;
        this._boundHandleElement = handle;
        const handleElement = handle;

        // Everything on the handle that owns its own click. Anything NOT matching is
        // bare handle, and clicking bare handle toggles the tray. These listeners are
        // all bound to the same element, so their stopPropagation() cannot hold the
        // catch-all off — it has to ask.
        //
        // This was a hand-maintained list of nine selectors that had to be updated
        // every time the handle grew a control. Every control now wears
        // .squire-handle-control, which is the same class the stylesheet keys its
        // edge and hover off, so the list cannot fall behind the markup any more.
        const HANDLE_ACTIONS = '.squire-handle-control, a, button, input, select, textarea';

        // Chevron - delegated
        handleElement.addEventListener('click', async (event) => {
            if (!event.target.closest('.tray-handle-button-toggle')) return;
            event.preventDefault();
            event.stopPropagation();
            await PanelManager.toggleTray();
        });

        // Pin button handling - delegated. Unpinning here deliberately leaves the tray
        // open; it is the chevron, not the pin, that closes things.
        handleElement.addEventListener('click', async (event) => {
            if (!event.target.closest('.tray-handle-button-pin')) return;
            event.preventDefault();
            event.stopPropagation();
            await PanelManager.setPinned(!PanelManager.isPinned);
        });

        // Handle health bar clicks
        // v13: Use handleElement (the cloned handle that's actually in the DOM) for event delegation
        handleElement.addEventListener('click', async (event) => {
            const healthBar = event.target.closest('.handle-healthbar');
            if (!healthBar) return;
            
            event.preventDefault();
            event.stopPropagation();
            // The handle shows this actor's health, which is not necessarily
            // what is selected, so name the token rather than relying on
            // selection.
            const handleToken = this.actor?.getActiveTokens?.()?.[0] ?? null;
            await openHealthWindow(handleToken ? [handleToken] : null);
        });

        // Handle health tray icon clicks (GM only) - delegated
        handleElement.addEventListener('click', async (event) => {
            if (!event.target.closest('#health-tray-button')) return;
            event.preventDefault();
            event.stopPropagation();
            if (game.user.isGM) await openHealthWindow();
        });

        // Handle favorite item clicks
        // v13: Use handleElement (the cloned handle that's actually in the DOM) for event delegation
        handleElement.addEventListener('click', async (event) => {
            const favoriteIcon = event.target.closest('.handle-favorite-icon');
            if (!favoriteIcon) return;
            
            // If clicking on roll overlay, use the item
            if (event.target.classList.contains('handle-favorite-roll-overlay')) {
                const itemId = favoriteIcon.dataset.itemId;
                const item = this.actor.items.get(itemId);
                if (item) {
                    await item.use({}, { event });
                }
                return;
            }
            
            // If clicking on the heart icon itself, toggle the favorite state
            if (event.target.classList.contains('fa-heart')) {
                event.preventDefault();
                event.stopPropagation();
                
                const itemId = favoriteIcon.dataset.itemId;
                if (!itemId) return;
                
                // Toggle the favorite state using the FavoritesPanel
                await FavoritesPanel.manageFavorite(this.actor, itemId);
            }
        });

        // Open the Status Effects window directly to the clicked effect's real description.
        handleElement.addEventListener('click', async (event) => {
            const effectIcon = event.target.closest('.handle-condition-icon');
            if (!effectIcon) return;

            event.preventDefault();
            event.stopPropagation();

            const effectId = effectIcon.dataset.effectId;
            if (!effectId) return;

            // actorUuid because the handle shows its own actor, which is not
            // necessarily what is selected on the canvas.
            await openStatusEffectsWindow({
                actorUuid: this.actor?.uuid,
                descriptionEffectId: effectId
            });
        });

        // Handle condition icon right-click (contextmenu) - separate handler
        // v13: Use handleElement (the cloned handle that's actually in the DOM)
        handleElement.addEventListener('contextmenu', async (event) => {
            const conditionIcon = event.target.closest('.handle-condition-icon');
            if (!conditionIcon) return;
            
            event.preventDefault();
            event.stopPropagation();
            
            if (!this.actor?.isOwner) {
                ui.notifications.warn("You do not have permission to change effects on this actor.");
                return;
            }
            
            const effectId = conditionIcon.dataset.effectId;
            if (!effectId) return;
            
            const effect = this.actor.effects.get(effectId);
            if (effect) {
                await effect.delete();
                await this.updateHandle();
            }
        });

        // Handle conditions button clicks - PRIMARY IMPLEMENTATION - delegated
        // (This opens the Blacksmith Status Effects window.)
        handleElement.addEventListener('click', async (event) => {
            if (!event.target.closest('#conditions-button')) return;
            event.preventDefault();
            event.stopPropagation();
            
            // Foundry's status API requires ownership of the actor.
            if (!this.actor?.isOwner) {
                ui.notifications.warn("You do not have permission to change effects on this actor.");
                return;
            }

            await openStatusEffectsWindow({ actorUuid: this.actor?.uuid });
        });

        // Macros moved to the Blacksmith menubar tool's context menu — favorites
        // are still favorites, they're just reached from there now.

        // Add click handler for party member portraits in the handle
        // v13: Use native DOM event delegation
        handle.addEventListener('click', async function(event) {
            const partyMemberIcon = event.target.closest('.handle-partymember-icon.clickable');
            if (!partyMemberIcon) return;
            
            event.preventDefault();
            event.stopPropagation();
            const actorId = partyMemberIcon.dataset.actorId;
            const token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
            if (token) {
                token.control({releaseOthers: true});
            }
        });

        // Add click handler for party member health bars in the handle - delegated
        handleElement.addEventListener('click', async function(event) {
            const healthBarEl = event.target.closest('.handle-healthbar.party.clickable');
            if (!healthBarEl) return;

            event.preventDefault();
            event.stopPropagation();

            // Get the actor ID directly from the clicked health bar element
            const actorId = healthBarEl.dataset.actorId;

            if (!actorId) {
                return;
            }

            const actor = game.actors.get(actorId);
            if (!actor) {
                return;
            }

            // Name the token instead of selecting it: clicking a party
            // member's health bar shouldn't rearrange the user's canvas
            // selection to say which one they meant.
            const token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
            if (token) await openHealthWindow([token]);
        });

        // Handle character portrait click in the handle - delegated
        handleElement.addEventListener('click', async (event) => {
            if (!event.target.closest('.handle-character-icon')) return;
            event.preventDefault();
            event.stopPropagation();
            // Use the actor from the handle context
            const actor = this.actor || PanelManager.currentActor;
            if (actor) {
                actor.sheet.render(true);
            }
        });

        // Bare handle toggles the tray. Registered last so every handler that owns a
        // specific target has already run; HANDLE_ACTIONS is what stops this from
        // firing a second time on top of them, since same-element listeners are not
        // affected by their stopPropagation().
        handleElement.addEventListener('click', async (event) => {
            if (event.target.closest(HANDLE_ACTIONS)) return;
            event.preventDefault();
            await PanelManager.toggleTray();
        });

        // Optional hover-to-open. Silent on the way in: sweeping the pointer past the
        // handle on the way to the canvas should not chirp the open sound every time.
        handleElement.addEventListener('mouseenter', () => {
            if (!game.settings.get(MODULE.ID, 'trayOpenOnHover')) return;
            PanelManager.expandTray({ sound: false });
        });

        // Leaving the tray arms the collapse; coming back anywhere on it disarms,
        // which also rescues a tray the click-away timer below has already armed.
        nativePanelManagerElement.addEventListener('mouseenter', () => PanelManager.cancelCollapse());
        nativePanelManagerElement.addEventListener('mouseleave', () => {
            if (!game.settings.get(MODULE.ID, 'trayOpenOnHover')) return;
            PanelManager.scheduleCollapse();
        });

        // Click-away collapse. Bound to the document rather than the tray, so unlike
        // everything above it does not die with the tray element and has to be torn
        // down by hand in destroy(). Capture phase: a handler that stops propagation
        // somewhere else in the UI should not keep the tray open.
        if (!this._documentClickHandler) {
            this._documentClickHandler = (event) => {
                if (!game.settings.get(MODULE.ID, 'trayAutoCollapse')) return;
                if (event.target?.closest?.('.squire-tray')) return;
                PanelManager.scheduleCollapse();
            };
            document.addEventListener('mousedown', this._documentClickHandler, true);
        }
    }

    /**
     * Clean up event listeners and resources
     */
    destroy() {
        // Remove resize event listener
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        // Delegated handle listeners die with the tray element; just drop the references
        this._boundHandleElement = null;

        // The click-away listener lives on the document, so it outlives the tray
        // unless it is removed here.
        if (this._documentClickHandler) {
            document.removeEventListener('mousedown', this._documentClickHandler, true);
            this._documentClickHandler = null;
        }
        PanelManager.cancelCollapse();
    }

    /**
     * Check for handle overflow and toggle fade effect
     * @private
     */
    _updateHandleFade() {
        // Check if PanelManager.element exists before proceeding
        if (!PanelManager.element) return;
        
        // v13: Use native DOM querySelector instead of jQuery find
        const handle = PanelManager.element.querySelector('.tray-handle');
        if (!handle) return;
        
        const container = handle.querySelector('.tray-handle-content-container');
        const fade = handle.querySelector('.tray-handle-fade-bottom');
        if (!container || !fade) return;
        
        // Check if content is overflowing vertically
        // v13: Use native DOM properties directly
        const isOverflowing = container.scrollHeight > container.clientHeight;
        fade.style.display = isOverflowing ? 'block' : 'none';
    }

    /**
     * Update the actor reference when it changes
     * @param {Actor} newActor - The new actor to use
     */
    updateActor(newActor) {
        this.actor = newActor;
    }
}

