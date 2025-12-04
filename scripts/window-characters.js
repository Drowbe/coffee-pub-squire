import { MODULE, TEMPLATES, SQUIRE } from './const.js';

// v13: Override _activateCoreListeners to prevent errors since we don't have forms
// This window doesn't need FoundryVTT's form handling
export class CharactersWindow extends Application {
    /**
     * Override to prevent FoundryVTT core from trying to access form elements we don't have
     * @override
     */
    _activateCoreListeners(html) {
        // Skip the parent implementation since we don't have forms
        // Our activateListeners handles all the listeners we need
        return;
    }
    constructor(options = {}) {
        super(options);
        this.item = options.item;
        this.sourceActor = options.sourceActor;
        this.sourceItemId = options.sourceItemId;
        this.selectedQuantity = options.selectedQuantity || 1;
        this.hasQuantity = options.hasQuantity || false;
        this.onCharacterSelected = options.onCharacterSelected;
    }

    static get defaultOptions() {
        // Try to load saved position/size
        let saved = {};
        try {
            saved = game.settings.get(MODULE.ID, 'charactersWindowPosition') || {};
        } catch (e) {
            saved = {};
        }
        const width = saved.width ?? 400;
        const height = saved.height ?? 300;
        const top = (typeof saved.top === 'number') ? saved.top : Math.max(0, (window.innerHeight - height) / 2);
        const left = (typeof saved.left === 'number') ? saved.left : Math.max(0, (window.innerWidth - width) / 2);
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "squire-characters-window",
            title: "Select Character",
            template: TEMPLATES.WINDOW_CHARACTERS,
            width,
            height,
            top,
            left,
            minimizable: true,
            resizable: true,
            popOut: true,
            classes: ["squire-window"]
        });
    }

    getData() {
        let characters = [];
        
        if (game.user.isGM) {
            // GM sees all tokens on canvas (characters, monsters, NPCs)
            const allTokens = canvas.tokens.placeables.filter(token => 
                token.actor && 
                ['character', 'npc', 'monster'].includes(token.actor.type)
            );
            
            characters = allTokens.map(token => token.actor);
        } else {
            // Players only see party members (characters with player owners)
            const partyTokens = canvas.tokens.placeables.filter(token => 
                token.actor?.hasPlayerOwner && 
                token.actor.type === 'character'
            );
            
            characters = partyTokens.map(token => token.actor);
        }
        
        // Get current active character from tray (if available)
        const currentCharacterId = this.sourceActor?.id;
        
        // Map to character objects with type and clickable status
        const characterData = characters.map(actor => {
            // Determine display type based on actor type and hostility
            let displayType = actor.type;
            if (actor.type === 'npc') {
                // Check if NPC is hostile (monster) or friendly (npc)
                const disposition = actor.disposition || 0;
                displayType = disposition <= -1 ? 'monster' : 'npc';
            }
            
            return {
                id: actor.id,
                name: actor.name,
                img: actor.img,
                type: displayType,
                isCurrentCharacter: actor.id === currentCharacterId,
                clickable: actor.id !== currentCharacterId
            };
        });

        return {
            characters: characterData,
            item: this.item,
            sourceActor: this.sourceActor,
            sourceItemId: this.sourceItemId,
            selectedQuantity: this.selectedQuantity,
            hasQuantity: this.hasQuantity
        };
    }

    async _renderInner(data) {
        // First render the template
        // v13: Use namespaced renderTemplate
        const content = await foundry.applications.handlebars.renderTemplate(this.options.template, data);
        // Create the wrapper structure using squire-popout
        // v13: Return native DOM element instead of jQuery
        // Use innerHTML like macros window to ensure proper structure
        const html = document.createElement('div');
        html.className = 'squire-popout';
        html.setAttribute('data-position', 'left');
        html.innerHTML = `
            <div class="tray-content">
                <div class="panel-container" data-panel="characters">
                    ${content}
                </div>
            </div>
        `;
        return html;
    }

    /**
     * Get native DOM element from this.element (handles jQuery conversion)
     * @returns {HTMLElement|null} Native DOM element
     */
    _getNativeElement() {
        if (!this.element) return null;
        // v13: Detect and convert jQuery to native DOM if needed
        if (this.element.jquery || typeof this.element.find === 'function') {
            return this.element[0] || this.element.get?.(0) || this.element;
        }
        return this.element;
    }

    activateListeners(html) {
        // v13: Call super first, but wrap in try-catch since our window doesn't have forms
        // FoundryVTT's _activateCoreListeners expects form elements that we don't have
        try {
            super.activateListeners(html);
        } catch (error) {
            // FoundryVTT core may fail if it expects form elements we don't have
            // This is safe to ignore since we handle all our own listeners below
            console.debug('CharactersWindow: super.activateListeners error (expected for non-form windows):', error);
        }
        
        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        // Use this.element which is properly connected to the DOM after render
        const nativeElement = this._getNativeElement() || nativeHtml;
        if (!nativeElement) return;

        // Add close button handler - find it in the window structure
        // v13: Use this.element which is properly connected to the DOM
        const appElement = nativeElement.closest('.app') || document.querySelector(`#${this.id}`);
        if (appElement) {
            const closeButton = appElement.querySelector('.close');
            if (closeButton) {
                // Clone to remove existing listeners
                const newButton = closeButton.cloneNode(true);
                closeButton.parentNode?.replaceChild(newButton, closeButton);
                
                newButton.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    this.close();
                });
            }
        }

        // Set up data-panel attribute for CSS targeting
        const windowContent = nativeElement.closest('.window-content') || appElement?.querySelector('.window-content');
        if (windowContent) {
            windowContent.setAttribute('data-panel', 'characters');
        }

        // Add character selection handlers
        // v13: Use nativeElement which is the element returned from _renderInner
        const characterSlots = nativeElement.querySelectorAll('.character-slot');
        characterSlots.forEach(slot => {
            // Clone to remove existing listeners
            const newSlot = slot.cloneNode(true);
            slot.parentNode?.replaceChild(newSlot, slot);
            
            newSlot.addEventListener('click', (ev) => {
                const characterId = ev.currentTarget.dataset.characterId;
                const clickable = ev.currentTarget.dataset.clickable === 'true';
                
                if (clickable && characterId) {
                    // Find the character actor
                    const targetActor = game.actors.get(characterId);
                    if (targetActor && this.onCharacterSelected) {
                        // Call the callback with the selected character and quantity data
                        this.onCharacterSelected(targetActor, this.item, this.sourceActor, this.sourceItemId, this.selectedQuantity, this.hasQuantity);
                    }
                    // Close the window
                    this.close();
                }
            });
        });
    }

    setPosition(options={}) {
        // Enforce minimum size: 2 characters (80px) + padding/margins (let's use 32px for safety)
        const minWidth = 80 + 32;
        const minHeight = 80 + 32 + 40; // 40px for header/title bar
        if (options.width && options.width < minWidth) options.width = minWidth;
        if (options.height && options.height < minHeight) options.height = minHeight;
        
        // Validate position is within viewport
        if (options.top !== undefined || options.left !== undefined) {
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const windowWidth = options.width || this.position.width || 400;
            const windowHeight = options.height || this.position.height || 300;
            
            // Ensure window doesn't go off-screen
            if (options.left !== undefined) {
                options.left = Math.max(0, Math.min(options.left, viewportWidth - windowWidth));
            }
            if (options.top !== undefined) {
                options.top = Math.max(0, Math.min(options.top, viewportHeight - windowHeight));
            }
        }
        
        const pos = super.setPosition(options);
        // Save position/size to settings
        if (this.rendered) {
            const { top, left, width, height } = this.position;
            game.settings.set(MODULE.ID, 'charactersWindowPosition', { top, left, width, height });
        }
        return pos;
    }

    async _onToggleMinimize(ev) {
        ev?.preventDefault();
        if (!this.rendered) return;
        this._minimized = !this._minimized;
        
        // v13: Use native classList instead of jQuery toggleClass
        const element = this._getNativeElement();
        if (element) {
            element.classList.toggle("minimized");
        }
    }
}
