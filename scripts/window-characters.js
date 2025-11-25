import { MODULE, TEMPLATES, SQUIRE } from './const.js';

export class CharactersWindow extends Application {
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
        const content = await renderTemplate(this.options.template, data);
        // Create the wrapper structure using squire-popout
        // v13: Return native DOM element instead of jQuery
        const wrapper = document.createElement('div');
        wrapper.className = 'squire-popout';
        wrapper.setAttribute('data-position', 'left');
        
        const trayContent = document.createElement('div');
        trayContent.className = 'tray-content';
        
        const panelContainer = document.createElement('div');
        panelContainer.className = 'panel-container';
        panelContainer.setAttribute('data-panel', 'characters');
        panelContainer.innerHTML = content;
        
        trayContent.appendChild(panelContainer);
        wrapper.appendChild(trayContent);
        
        return wrapper;
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
        super.activateListeners(html);

        // v13: Detect and convert jQuery to native DOM if needed
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        // Add close button handler
        const appElement = nativeHtml.closest('.app');
        const closeButton = appElement?.querySelector('.close');
        if (closeButton) {
            closeButton.addEventListener('click', (ev) => {
                ev.preventDefault();
                this.close();
            });
        }

        // Set up data-panel attribute for CSS targeting
        const windowContent = nativeHtml.closest('.window-content');
        if (windowContent) {
            windowContent.setAttribute('data-panel', 'characters');
        }

        // Add character selection handlers
        const characterSlots = nativeHtml.querySelectorAll('.character-slot');
        characterSlots.forEach(slot => {
            slot.addEventListener('click', (ev) => {
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
