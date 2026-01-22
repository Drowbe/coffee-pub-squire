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
        // Flags can be stored as nested object or flat - read both ways
        const noteFlags = page.getFlag(MODULE.ID) || {};
        
        // Read individual flag values directly (more reliable)
        const visibility = page.getFlag(MODULE.ID, 'visibility') || noteFlags.visibility || 'private';
        const tags = page.getFlag(MODULE.ID, 'tags') || noteFlags.tags || [];
        const authorId = page.getFlag(MODULE.ID, 'authorId') || noteFlags.authorId;
        const sceneId = page.getFlag(MODULE.ID, 'sceneId') || noteFlags.sceneId;
        const x = page.getFlag(MODULE.ID, 'x') ?? noteFlags.x;
        const y = page.getFlag(MODULE.ID, 'y') ?? noteFlags.y;
        const timestamp = page.getFlag(MODULE.ID, 'timestamp') || noteFlags.timestamp;
        
        // Debug: Log what we're reading
        console.log('NotesParser.parseSinglePage: Reading flags', {
            pageName: page.name,
            noteFlags,
            directVisibility: page.getFlag(MODULE.ID, 'visibility'),
            directTags: page.getFlag(MODULE.ID, 'tags'),
            parsedVisibility: visibility,
            parsedTags: tags
        });
        
        // Extract content and images from HTML only
        const img = BaseParser.extractImage(enrichedHtml);
        
        // Look up scene name if sceneId exists
        let sceneName = null;
        if (sceneId) {
            try {
                const scene = game.scenes.get(sceneId);
                sceneName = scene?.name || null;
            } catch (e) {
                console.warn(`NotesParser: Could not find scene ${sceneId}`, e);
            }
        }
        
        // Look up author name if authorId exists
        let authorName = null;
        if (authorId) {
            try {
                // Try multiple methods to find user (they might have left the game)
                let user = game.users.get(authorId);
                if (!user) {
                    // Try finding in all users (including inactive)
                    user = game.users.find(u => u.id === authorId);
                }
                if (!user) {
                    // Try finding by name if ID doesn't work
                    const userIdStr = String(authorId);
                    user = game.users.find(u => String(u.id) === userIdStr);
                }
                authorName = user?.name || authorId || 'Unknown';
                console.log('NotesParser: Author lookup:', { authorId, found: !!user, name: authorName });
            } catch (e) {
                console.warn(`NotesParser: Could not find user ${authorId}`, e);
                authorName = authorId || 'Unknown';
            }
        } else {
            authorName = 'Unknown';
        }
        
        // Parse visibility - normalize the value
        let parsedVisibility = 'private';
        if (visibility === 'party' || visibility === 'Party' || visibility === 'PARTY') {
            parsedVisibility = 'party';
        } else {
            parsedVisibility = 'private';
        }
        
        // Parse tags - ensure it's always an array
        let parsedTags = [];
        if (Array.isArray(tags)) {
            parsedTags = tags;
        } else if (tags && typeof tags === 'string') {
            // If tags is a string, split it
            parsedTags = tags.split(',').map(t => t.trim()).filter(t => t);
        }
        
        // Build note object
        const note = {
            name: page.name || 'Untitled Note',
            content: enrichedHtml, // Already enriched HTML content
            img: img || null,
            tags: parsedTags,
            sceneId: sceneId || null,
            sceneName: sceneName,
            x: typeof x === 'number' ? x : null,
            y: typeof y === 'number' ? y : null,
            authorId: authorId || null,
            authorName: authorName,
            visibility: parsedVisibility,
            timestamp: timestamp || null,
            uuid: page.uuid
        };
        
        console.log('NotesParser.parseSinglePage: Parsed note', {
            name: note.name,
            visibility: note.visibility,
            rawVisibility: visibility,
            tags: note.tags,
            rawTags: tags,
            authorName: note.authorName,
            authorId: note.authorId
        });
        
        return note;
    }
}
