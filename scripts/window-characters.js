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
        // Get all party members (characters) that have owners
        const partyMembers = game.actors.filter(actor => {
            if (actor.type !== 'character') return false;
            
            // Check if this actor has any owners (active users)
            const hasOwners = game.users.some(user => 
                user.active && 
                !user.isGM && 
                actor.ownership[user.id] >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
            );
            
            return hasOwners;
        });
        
        // Get current active character from tray (if available)
        const currentCharacterId = this.sourceActor?.id;
        
        // Mark current character as non-clickable
        const characters = partyMembers.map(actor => ({
            id: actor.id,
            name: actor.name,
            img: actor.img,
            isCurrentCharacter: actor.id === currentCharacterId,
            clickable: actor.id !== currentCharacterId
        }));

        return {
            characters,
            item: this.item,
            sourceActor: this.sourceActor,
            sourceItemId: this.sourceItemId
        };
    }

    async _renderInner(data) {
        // First render the template
        const content = await renderTemplate(this.options.template, data);
        // Create the wrapper structure using squire-popout
        const html = `
            <div class="squire-popout" data-position="left">
                <div class="tray-content">
                    <div class="panel-container" data-panel="characters">
                        ${content}
                    </div>
                </div>
            </div>
        `;

        return $(html);
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Add close button handler
        html.closest('.app').find('.close').click(ev => {
            ev.preventDefault();
            this.close();
        });

        // Set up data-panel attribute for CSS targeting
        html.closest('.window-content').attr('data-panel', 'characters');

        // Add character selection handlers
        html.find('.character-slot').click(ev => {
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
        this.element.toggleClass("minimized");
    }
}
