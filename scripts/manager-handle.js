import { MODULE, TEMPLATES, SQUIRE } from './const.js';
import { FavoritesPanel } from './panel-favorites.js';
import { PanelManager } from './manager-panel.js';
import { getBlacksmith, getHealthbarStatusClass, getTokenDisplayName, getNativeElement, renderTemplate, getCampaignContext, openHealthWindow, getHealthPercent, openStatusEffectsWindow, applyItemTooltips, useOrOpenItem } from './helpers.js';
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
        
        // Bind the handler to this instance. How many favourites fit is a
        // function of the window's height, so a resize has to re-decide it
        // before the fade can mean anything.
        this._resizeHandler = () => {
            this._trimHandleFavorites();
            this._updateHandleFade();
        };
        
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

        this._updateHpRail(handleData);
        // Order matters: trimming decides whether the column still overflows,
        // and the fade is a claim about exactly that.
        this._trimHandleFavorites();

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

        // Handle width toggle - delegated
        handleElement.addEventListener('click', async (event) => {
            if (!event.target.closest('.tray-handle-button-mode')) return;
            event.preventDefault();
            event.stopPropagation();

            const next = game.settings.get(MODULE.ID, 'handleMode') === 'full' ? 'minimal' : 'full';
            await game.settings.set(MODULE.ID, 'handleMode', next);
            PanelManager.applyHandleMode();
        });

        // Re-decide how many favourites fit whenever the strip finishes changing
        // width. Only the mode toggle does that now — the handle keeps the
        // user's width whether the tray is open or closed — but this stays hung
        // off `transitionend` rather than off the toggle handler, because the
        // thing that invalidates the count is the width changing, not the click
        // that caused it. Anything else that ever resizes the strip is covered
        // for free. Filtered by property because the same element also
        // transitions background and border-color.
        handleElement.addEventListener('transitionend', (event) => {
            if (event.propertyName !== 'width') return;
            this._trimHandleFavorites();
            this._updateHandleFade();
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

        // Handle favorite item clicks
        // v13: Use handleElement (the cloned handle that's actually in the DOM) for event delegation
        handleElement.addEventListener('click', async (event) => {
            const favoriteIcon = event.target.closest('.handle-favorite-icon');
            if (!favoriteIcon) return;
            
            // If clicking on roll overlay, use the item
            if (event.target.classList.contains('handle-favorite-roll-overlay')) {
                const itemId = favoriteIcon.dataset.itemId;
                await useOrOpenItem(this.actor.items.get(itemId), event);
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

        // ---------- Drag an item from a panel onto the handle ----------
        //
        // Gated entirely on `PanelManager._trayItemDragActive`, which the tray's
        // own dragstart sets for `.panel-item[data-item-id]` rows and nothing
        // else. That single flag buys three things at once:
        //
        //   * Compendium search results are rejected. Their rows carry
        //     `data-uuid` and no `data-item-id`, so the tray's dragstart never
        //     fires for them and the flag stays false. Nothing here has to know
        //     that compendium drags exist.
        //   * A drag from the canvas, a sheet, or another module is rejected for
        //     the same reason.
        //   * The tray body's own transfer drop zone already checks the same
        //     flag in the opposite direction, so the two zones cannot both claim
        //     one drag.
        // Picking an icon UP off the handle, to put it somewhere else on the
        // handle. A separate flag from the panels' drag rather than a reuse of
        // it: the two carry different payloads and want different drop effects,
        // and dragover cannot read dataTransfer to tell them apart — the data is
        // protected until drop, so the only thing available at hover time is a
        // flag set at dragstart.
        handleElement.addEventListener('dragstart', (event) => {
            const icon = event.target.closest('.handle-favorite-icon');
            if (!icon?.dataset.itemId) return;

            PanelManager._handleReorderActive = true;
            this._reorderItemId = icon.dataset.itemId;

            event.dataTransfer.effectAllowed = 'move';
            // Deliberately NOT `item.toDragData()`. Some data must be set or the
            // drag does not start, and a real Foundry payload would let this drop
            // on the canvas and create a second copy of the item — which is not
            // a thing "move this icon up two places" should ever be able to do.
            // Nothing outside the handle can parse this.
            event.dataTransfer.setData('text/plain', JSON.stringify({
                type: 'squire-handle-reorder',
                itemId: icon.dataset.itemId
            }));

            const img = icon.querySelector('img');
            if (img) event.dataTransfer.setDragImage(img, 10, 10);
        });

        handleElement.addEventListener('dragend', () => {
            PanelManager._handleReorderActive = false;
            this._reorderItemId = null;
            handleElement.classList.remove('handle-drop-target');
            this._clearInsertionPoint();
        });

        handleElement.addEventListener('dragover', (event) => {
            if (!PanelManager._trayItemDragActive && !PanelManager._handleReorderActive) return;
            // preventDefault is what makes an element a drop target at all;
            // without it the browser refuses the drop and shows the "no" cursor.
            event.preventDefault();
            event.dataTransfer.dropEffect = PanelManager._handleReorderActive ? 'move' : 'copy';
            handleElement.classList.add('handle-drop-target');

            // Which icon the pointer is over is the whole answer: the drop lands
            // ABOVE it. Over nothing means the end of the list.
            this._clearInsertionPoint();
            event.target.closest('.handle-favorite-icon')?.classList.add('drop-above');
        });

        // dragleave fires for every child boundary crossed inside the handle, so
        // it has to ask whether the pointer actually left the strip.
        handleElement.addEventListener('dragleave', (event) => {
            if (event.relatedTarget && handleElement.contains(event.relatedTarget)) return;
            handleElement.classList.remove('handle-drop-target');
            this._clearInsertionPoint();
        });

        handleElement.addEventListener('drop', async (event) => {
            const reordering = PanelManager._handleReorderActive;
            if (!PanelManager._trayItemDragActive && !reordering) return;
            event.preventDefault();
            event.stopPropagation();
            handleElement.classList.remove('handle-drop-target');

            // Read the target BEFORE clearing the indicator, and off the event
            // rather than off the class: the class is decoration, and decoration
            // that decides where data lands is a bug waiting for the day the two
            // disagree.
            const beforeItemId = event.target.closest('.handle-favorite-icon')?.dataset.itemId ?? null;
            this._clearInsertionPoint();

            const actor = this.actor || PanelManager.currentActor;
            if (!actor?.isOwner) return;

            let itemId = null;

            if (reordering) {
                itemId = this._reorderItemId;
            } else {
                let data = null;
                try {
                    data = JSON.parse(event.dataTransfer.getData('text/plain'));
                } catch (error) {
                    return;
                }
                if (data?.type !== 'Item' || !data.uuid) return;

                const item = await fromUuid(data.uuid);
                if (!item) return;

                // The handle belongs to ONE actor. Compared by uuid rather than
                // by actor id: an unlinked token's synthetic actor shares the
                // base actor's id, so an id check would accept an item from a
                // different token of the same prototype and then store a slot
                // pointing at an item this actor does not have.
                if (item.parent?.uuid !== actor.uuid) return;
                itemId = item.id;
            }

            if (!itemId) return;
            await this._insertHandleFavorite(actor, itemId, beforeItemId);
            await this.updateHandle();
        });

        // Right-click a handle entry to take it off. This is the ONLY way off
        // the handle now — the dagger in the favourites row is gone, and with it
        // the two-step "favourite it, then handle it" that made the strip a
        // second opinion about the Favorites panel. The tooltip on each icon says
        // so, because a right-click affordance that nothing announces is a
        // secret.
        handleElement.addEventListener('contextmenu', async (event) => {
            const favoriteIcon = event.target.closest('.handle-favorite-icon');
            if (!favoriteIcon) return;

            event.preventDefault();
            event.stopPropagation();

            const actor = this.actor || PanelManager.currentActor;
            if (!actor?.isOwner) return;

            const itemId = favoriteIcon.dataset.itemId;
            if (!itemId) return;

            // Removes it from the handle and from nowhere else. The item keeps
            // existing, and keeps its heart if it had one.
            await FavoritesPanel.removeHandleFavorite(actor, itemId);
            await this.updateHandle();
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
     * Paint the HP rail down the handle's outer edge.
     *
     * Written from JS rather than rendered from the handle template because the
     * rail lives in tray.hbs — outside `.tray-handle-content-container`, whose
     * `overflow: hidden` would clip anything sitting in the handle's padding.
     * The tray template renders once; this runs on every health change, which is
     * the whole point of the rail.
     *
     * Tracks the character the handle is showing, in both views. Party members
     * carry their own chip under their own portrait — one full-height rail
     * cannot represent five people.
     *
     * @param {object} handleData The same data the handle template was given.
     * @private
     */
    _updateHpRail(handleData) {
        const rail = PanelManager.element?.querySelector('.handle-hp-rail');
        if (!rail) return;

        const fill = rail.querySelector('.handle-hp-rail-fill');
        const actor = handleData?.actor ?? null;

        // Hidden rather than emptied when there is nothing to show: an empty
        // track reads as "this character is at zero", which is a different and
        // much louder statement than "there is no character".
        const show = Boolean(actor) && handleData?.showHandleHealthBar;
        rail.classList.toggle('hidden-rail', !show);
        if (!show || !fill) return;

        fill.style.height = `${actor.healthPercentage ?? 0}%`;
        // className rather than classList.add: the status classes are mutually
        // exclusive, and adding without removing would leave a corpse healthy.
        fill.className = `handle-hp-rail-fill ${actor.healthbarStatusClass ?? ''}`.trim();
    }

    /**
     * Put an item on the handle at a position.
     *
     * One function for both adding and reordering, because they are the same
     * operation: an id lands before another id, or at the end. Splitting them
     * would give two places to get the index arithmetic wrong.
     *
     * The item is removed from the list before being re-inserted, which is what
     * makes a reorder a reorder rather than a duplicate — and is a no-op when it
     * was not there, which is what makes the same call work for an add.
     *
     * Nothing is refused and nothing is promoted. There is no cap, so "full" is
     * a property of the viewport rather than of the actor and is not something
     * to argue with the user about at the moment they drop. And the handle is
     * not a subset of the Favorites panel any more, so landing here does not
     * favourite anything: the heart fills the panel, this fills the strip.
     *
     * @param {Actor} actor
     * @param {string} itemId          what is being placed
     * @param {?string} beforeItemId   what it lands above; null means the end
     * @private
     */
    async _insertHandleFavorite(actor, itemId, beforeItemId) {
        // Dropping something on itself is not a reorder, it is a mind changed
        // mid-drag. Without this the removal below takes it out of the list, the
        // lookup for its own id then fails, and it silently teleports to the end.
        if (!itemId || beforeItemId === itemId) return;

        const ids = FavoritesPanel.getHandleFavorites(actor)
            .filter(id => id !== null && id !== undefined && id !== itemId);

        const index = beforeItemId ? ids.indexOf(beforeItemId) : -1;
        if (index === -1) ids.push(itemId);
        else ids.splice(index, 0, itemId);

        await FavoritesPanel.setHandleFavorites(actor, ids);
    }

    /**
     * Drop the "it lands here" line from wherever it currently is.
     * @private
     */
    _clearInsertionPoint() {
        PanelManager.element
            ?.querySelectorAll('.handle-favorite-icon.drop-above')
            .forEach(icon => icon.classList.remove('drop-above'));
    }

    /**
     * Show as many handle favourites as the strip has room for, and hide the rest.
     *
     * There is no cap on how many an actor may have. There used to be — five,
     * with a setting and a toast that turned the sixth away — and a fixed number
     * is wrong in both directions at once: it cut a big statblock down to a
     * fraction of its kit, and on a tall window it left an empty bar under the
     * last icon. Height is the real constraint, so height is what decides.
     *
     * Measured against the content WRAPPER, not the content container. The
     * container also holds the pin, the width toggle and the caret; measuring
     * against it let the column run down over the bottom two, whose clicks the
     * overflowing art then swallowed. Intermittently — only once you had enough
     * favourites to reach them — which is the worst kind of bug to be told
     * about. The wrapper is the flex item that stops above the buttons, so its
     * bottom edge is the line that actually matters.
     *
     * Everything is rendered and then measured. Measuring first would mean
     * predicting layout — icon size, gaps, what the conditions grid above
     * happens to be doing this frame — and the browser already knows all of it.
     *
     * Read every rect BEFORE hiding anything: hiding is a write, and interleaving
     * writes with reads makes the browser re-lay-out between each pair.
     *
     * Once one icon does not fit, every icon after it is hidden too, whether or
     * not it would fit on its own. Hiding one pulls the next up into its place,
     * so "does this one fit" stops being a stable question the moment the first
     * answer is no — and a column that skips an icon to squeeze in a later one
     * silently reorders the user's favourites.
     *
     * @private
     */
    _trimHandleFavorites() {
        const container = PanelManager.element?.querySelector('.tray-handle-content-wrapper');
        if (!container) return;

        const icons = [...container.querySelectorAll('.handle-favorite-icon')];
        if (!icons.length) return;

        // Everything back on first: this runs again on every render and every
        // resize, and an icon hidden by the last pass may fit now.
        for (const icon of icons) icon.classList.remove('does-not-fit');

        const limit = container.getBoundingClientRect().bottom;
        const bottoms = icons.map(icon => icon.getBoundingClientRect().bottom);

        let trimming = false;
        icons.forEach((icon, index) => {
            if (bottoms[index] > limit) trimming = true;
            if (trimming) icon.classList.add('does-not-fit');
        });
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
        
        // The WRAPPER, for the same reason the trim measures it: the container
        // also holds the two bottom buttons, so its scroll height answers a
        // question about a taller box than the one the column actually gets.
        // It is also the element that now clips, so it is the only one whose
        // scrollHeight can exceed its clientHeight at all.
        const container = handle.querySelector('.tray-handle-content-wrapper');
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

