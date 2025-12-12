import { MODULE, SQUIRE } from './const.js';
import { getBlacksmith } from './helpers.js';

/**
 * Utility class for managing light sources on tokens
 */
export class LightUtility {
    static lightSources = null;

    /**
     * Load light sources from JSON file
     * @returns {Promise<Object>} Light sources configuration
     */
    static async loadLightSources() {
        if (this.lightSources) {
            return this.lightSources;
        }

        try {
            const response = await fetch(`modules/${MODULE.ID}/resources/light-sources.json`);
            if (!response.ok) {
                throw new Error(`Failed to load light sources: ${response.status}`);
            }
            this.lightSources = await response.json();
            return this.lightSources;
        } catch (error) {
            const log = (...args) => getBlacksmith()?.utils.postConsoleAndNotification(MODULE.NAME, ...args);
            log('Failed to load light sources:', error.message, true, false);
            return {};
        }
    }

    /**
     * Check if an item can be used as a light source
     * @param {Item} item - The item to check
     * @returns {Promise<boolean>} True if item can be used as light source
     */
    static async isLightSource(item) {
        if (!item) return false;

        const lightSources = await this.loadLightSources();
        if (!lightSources || Object.keys(lightSources).length === 0) {
            return false;
        }

        // Check if item has a light source flag
        const lightSourceId = item.getFlag(MODULE.ID, 'lightSourceId');
        if (lightSourceId && lightSources[lightSourceId]) {
            return true;
        }

        // Check by item name (case-insensitive)
        const itemName = item.name?.toLowerCase().trim();
        for (const [key, config] of Object.entries(lightSources)) {
            const configName = config.name?.toLowerCase().trim();
            if (configName && itemName === configName) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get light source configuration for an item
     * @param {Item} item - The item to get light configuration for
     * @returns {Promise<Object|null>} Light configuration or null if not found
     */
    static async getLightSourceConfig(item) {
        if (!item) return null;

        const lightSources = await this.loadLightSources();
        if (!lightSources || Object.keys(lightSources).length === 0) {
            return null;
        }

        // Check if item has a light source flag
        const lightSourceId = item.getFlag(MODULE.ID, 'lightSourceId');
        if (lightSourceId && lightSources[lightSourceId]) {
            return lightSources[lightSourceId].light;
        }

        // Check by item name (case-insensitive)
        const itemName = item.name?.toLowerCase().trim();
        for (const [key, config] of Object.entries(lightSources)) {
            const configName = config.name?.toLowerCase().trim();
            if (configName && itemName === configName) {
                return config.light;
            }
        }

        return null;
    }

    /**
     * Apply light configuration to a token
     * @param {Token} token - The token to apply light to
     * @param {Object} lightConfig - Light configuration object
     * @returns {Promise<boolean>} True if successful
     */
    static async applyLightToToken(token, lightConfig) {
        if (!token || !lightConfig) {
            const log = (...args) => getBlacksmith()?.utils.postConsoleAndNotification(MODULE.NAME, ...args);
            log('Invalid token or light configuration', '', true, false);
            return false;
        }

        try {
            // Get the token document
            const tokenDocument = token.document || token;
            
            // Prepare light update data with all fields from the configuration
            const lightUpdate = {
                light: {
                    dim: lightConfig.dim !== undefined ? lightConfig.dim : 0,
                    bright: lightConfig.bright !== undefined ? lightConfig.bright : 0,
                    angle: lightConfig.angle !== undefined ? lightConfig.angle : 360,
                    color: lightConfig.color || '#FFFFFF',
                    alpha: lightConfig.alpha !== undefined ? lightConfig.alpha : 0.5,
                    priority: lightConfig.priority !== undefined ? lightConfig.priority : 0,
                    darkness: lightConfig.darkness !== undefined ? lightConfig.darkness : false,
                    animation: {
                        type: lightConfig.animation?.type || 'none',
                        speed: lightConfig.animation?.speed !== undefined ? lightConfig.animation.speed : 5,
                        intensity: lightConfig.animation?.intensity !== undefined ? lightConfig.animation.intensity : 3,
                        reverse: lightConfig.animation?.reverse !== undefined ? lightConfig.animation.reverse : false
                    },
                    coloration: lightConfig.coloration !== undefined ? lightConfig.coloration : 1,
                    luminosity: lightConfig.luminosity !== undefined ? lightConfig.luminosity : 0.5,
                    attenuation: lightConfig.attenuation !== undefined ? lightConfig.attenuation : 0.85,
                    saturation: lightConfig.saturation !== undefined ? lightConfig.saturation : 0.35,
                    contrast: lightConfig.contrast !== undefined ? lightConfig.contrast : 0.5,
                    shadows: lightConfig.shadows !== undefined ? lightConfig.shadows : 0.5
                }
            };

            // Update the token document
            await tokenDocument.update(lightUpdate);
            
            const log = (...args) => getBlacksmith()?.utils.postConsoleAndNotification(MODULE.NAME, ...args);
            log(`Light applied to token: ${token.name}`, '', false, false);
            return true;
        } catch (error) {
            const log = (...args) => getBlacksmith()?.utils.postConsoleAndNotification(MODULE.NAME, ...args);
            log('Failed to apply light to token:', error.message, true, false);
            return false;
        }
    }

    /**
     * Remove light from a token
     * @param {Token} token - The token to remove light from
     * @returns {Promise<boolean>} True if successful
     */
    static async removeLightFromToken(token) {
        if (!token) {
            return false;
        }

        try {
            const tokenDocument = token.document || token;
            
            const lightUpdate = {
                light: {
                    dim: 0,
                    bright: 0,
                    angle: 360,
                    color: '#000000',
                    alpha: 0.5,
                    priority: 0,
                    darkness: false,
                    animation: {
                        type: 'none',
                        speed: 5,
                        intensity: 3,
                        reverse: false
                    },
                    coloration: 1,
                    luminosity: 0.5,
                    attenuation: 0.85,
                    saturation: 0.35,
                    contrast: 0.5,
                    shadows: 0.5
                }
            };

            await tokenDocument.update(lightUpdate);
            
            const log = (...args) => getBlacksmith()?.utils.postConsoleAndNotification(MODULE.NAME, ...args);
            log(`Light removed from token: ${token.name}`, '', false, false);
            return true;
        } catch (error) {
            const log = (...args) => getBlacksmith()?.utils.postConsoleAndNotification(MODULE.NAME, ...args);
            log('Failed to remove light from token:', error.message, true, false);
            return false;
        }
    }

    /**
     * Toggle light on/off for a token based on an item
     * @param {Token} token - The token to toggle light for
     * @param {Item} item - The item to use as light source
     * @returns {Promise<boolean>} True if light was applied, false if removed
     */
    static async toggleLightForToken(token, item) {
        if (!token || !item) {
            return false;
        }

        const lightConfig = await this.getLightSourceConfig(item);
        if (!lightConfig) {
            return false;
        }

        // Check if token already has this light configuration
        const currentLight = token.document?.light || token.light;
        const hasLight = currentLight && (currentLight.dim > 0 || currentLight.bright > 0);
        
        if (hasLight) {
            // Remove light
            await this.removeLightFromToken(token);
            return false;
        } else {
            // Apply light
            await this.applyLightToToken(token, lightConfig);
            return true;
        }
    }

    /**
     * Get the player's controlled token for the given actor
     * @param {Actor} actor - The actor to get token for
     * @returns {Token|null} The controlled token or null
     */
    static getPlayerToken(actor) {
        if (!actor) return null;

        // Get controlled tokens
        const controlled = canvas.tokens?.controlled || [];
        
        // Find token for this actor
        let token = controlled.find(t => t.actor?.id === actor.id);
        
        if (!token) {
            // Fallback: get active tokens for this actor
            const active = actor.getActiveTokens?.(true) || [];
            token = active.find(t => t.scene?.id === canvas.scene?.id) || active[0];
        }

        return token || null;
    }
}

