import { MODULE } from './const.js';
import { BaseParser } from './utility-base-parser.js';

/**
 * Parser for extracting structured data from note journal pages.
 * Notes store metadata in flags, not HTML. This parser only extracts content and images from HTML.
 */
export class NotesParser extends BaseParser {
    /**
     * Parse a single journal page into a note object.
     * Metadata comes from flags, not HTML parsing.
     * @param {JournalEntryPage} page - The journal page
     * @param {string} enrichedHtml - The enriched HTML content of the page
     * @returns {Promise<Object|null>} Note object or null if not a valid note
     */
    static async parseSinglePage(page, enrichedHtml) {
        if (!page) return null;
        
        // Check if this is a note (must have noteType flag)
        const flags = page.getFlag(MODULE.ID, 'noteType');
        if (flags !== 'sticky') {
            // Not a note, ignore it
            return null;
        }
        
        // Read metadata from flags (authoritative source)
        const noteFlags = page.getFlag(MODULE.ID) || {};
        
        // Extract content and images from HTML only
        const img = BaseParser.extractImage(enrichedHtml);
        
        // Look up scene name if sceneId exists
        let sceneName = null;
        if (noteFlags.sceneId) {
            try {
                const scene = game.scenes.get(noteFlags.sceneId);
                sceneName = scene?.name || null;
            } catch (e) {
                console.warn(`NotesParser: Could not find scene ${noteFlags.sceneId}`, e);
            }
        }
        
        // Look up author name if authorId exists
        let authorName = null;
        if (noteFlags.authorId) {
            try {
                const user = game.users.get(noteFlags.authorId);
                authorName = user?.name || null;
            } catch (e) {
                console.warn(`NotesParser: Could not find user ${noteFlags.authorId}`, e);
            }
        }
        
        // Build note object
        const note = {
            name: page.name || 'Untitled Note',
            content: enrichedHtml, // Already enriched HTML content
            img: img || null,
            tags: Array.isArray(noteFlags.tags) ? noteFlags.tags : [],
            sceneId: noteFlags.sceneId || null,
            sceneName: sceneName,
            x: typeof noteFlags.x === 'number' ? noteFlags.x : null,
            y: typeof noteFlags.y === 'number' ? noteFlags.y : null,
            authorId: noteFlags.authorId || null,
            authorName: authorName,
            visibility: noteFlags.visibility === 'party' ? 'party' : 'private', // Default to private if not set
            timestamp: noteFlags.timestamp || null,
            uuid: page.uuid
        };
        
        return note;
    }
}
