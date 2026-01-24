import { MODULE, TEMPLATES } from './const.js';

export class UsersWindow extends Application {
    _activateCoreListeners(html) {
        return;
    }

    constructor(options = {}) {
        super(options);
        this.onUserSelected = options.onUserSelected;
        this.onClose = options.onClose;
    }

    static get defaultOptions() {
        let saved = {};
        try {
            saved = game.settings.get(MODULE.ID, 'usersWindowPosition') || {};
        } catch (e) {
            saved = {};
        }
        const width = saved.width ?? 400;
        const height = saved.height ?? 300;
        const top = (typeof saved.top === 'number') ? saved.top : Math.max(0, (window.innerHeight - height) / 2);
        const left = (typeof saved.left === 'number') ? saved.left : Math.max(0, (window.innerWidth - width) / 2);
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "squire-users-window",
            title: "Select Player",
            template: TEMPLATES.WINDOW_USERS,
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
        const currentUserId = game.user?.id;
        const users = game.users?.contents || [];
        const userData = users.map(user => ({
            id: user.id,
            name: user.name,
            img: user.avatar,
            clickable: user.id !== currentUserId
        }));

        return { users: userData };
    }

    async _renderInner(data) {
        const content = await foundry.applications.handlebars.renderTemplate(this.options.template, data);
        const html = document.createElement('div');
        html.className = 'squire-popout';
        html.setAttribute('data-position', 'left');
        html.innerHTML = `
            <div class="tray-content">
                <div class="panel-container" data-panel="users">
                    ${content}
                </div>
            </div>
        `;
        return html;
    }

    _getNativeElement() {
        if (!this.element) return null;
        if (this.element.jquery || typeof this.element.find === 'function') {
            return this.element[0] || this.element.get?.(0) || this.element;
        }
        return this.element;
    }

    activateListeners(html) {
        try {
            super.activateListeners(html);
        } catch (error) {
            console.debug('UsersWindow: super.activateListeners error (expected for non-form windows):', error);
        }

        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        const nativeElement = this._getNativeElement() || nativeHtml;
        if (!nativeElement) return;

        const appElement = nativeElement.closest('.app') || document.querySelector(`#${this.id}`);
        if (appElement) {
            const closeButton = appElement.querySelector('.close');
            if (closeButton) {
                const newButton = closeButton.cloneNode(true);
                closeButton.parentNode?.replaceChild(newButton, closeButton);
                newButton.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    this.close();
                });
            }
        }

        const windowContent = nativeElement.closest('.window-content') || appElement?.querySelector('.window-content');
        if (windowContent) {
            windowContent.setAttribute('data-panel', 'users');
        }

        const userSlots = nativeElement.querySelectorAll('.user-slot');
        userSlots.forEach(slot => {
            const newSlot = slot.cloneNode(true);
            slot.parentNode?.replaceChild(newSlot, slot);
            newSlot.addEventListener('click', (ev) => {
                const userId = ev.currentTarget.dataset.userId;
                const clickable = ev.currentTarget.dataset.clickable === 'true';
                if (clickable && userId) {
                    const targetUser = game.users?.get(userId);
                    if (targetUser && this.onUserSelected) {
                        this.onUserSelected(targetUser);
                    }
                    this.close();
                }
            });
        });
    }

    async close(options = {}) {
        if (this.onClose) {
            this.onClose();
        }
        return super.close(options);
    }

    setPosition(options = {}) {
        const minWidth = 80 + 32;
        const minHeight = 80 + 32 + 40;
        if (options.width && options.width < minWidth) options.width = minWidth;
        if (options.height && options.height < minHeight) options.height = minHeight;

        if (options.top !== undefined || options.left !== undefined) {
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const windowWidth = options.width || this.position.width || 400;
            const windowHeight = options.height || this.position.height || 300;
            if (options.left !== undefined) {
                options.left = Math.max(0, Math.min(options.left, viewportWidth - windowWidth));
            }
            if (options.top !== undefined) {
                options.top = Math.max(0, Math.min(options.top, viewportHeight - windowHeight));
            }
        }

        const pos = super.setPosition(options);
        if (this.rendered) {
            const { top, left, width, height } = this.position;
            game.settings.set(MODULE.ID, 'usersWindowPosition', { top, left, width, height });
        }
        return pos;
    }
}
