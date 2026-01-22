/**
 * Base parser class for extracting structured data from journal page HTML.
 * Provides common parsing utilities for Codex, Notes, and Quest parsers.
 */

export class BaseParser {
    /**
     * Extract a field value from HTML by label (using <strong> tags).
     * Supports formats: <p><strong>Label:</strong> value</p> or <p><strong>Label</strong>: value</p>
     * @param {string} html - HTML content to parse
     * @param {string} label - Label to search for (case-insensitive, will be uppercased)
     * @param {string} [containerSelector='p'] - CSS selector for container elements to search
     * @returns {string} Extracted value (HTML tags stripped, trimmed)
     */
    static extractFieldFromHTML(html, label, containerSelector = 'p') {
        if (!html || typeof html !== 'string') return '';
        
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const containers = Array.from(doc.querySelectorAll(containerSelector));
            
            const searchLabel = label.toUpperCase().trim();
            
            for (const container of containers) {
                const strong = container.querySelector('strong');
                if (!strong) continue;
                
                let containerLabel = strong.textContent.trim();
                if (containerLabel.endsWith(':')) containerLabel = containerLabel.slice(0, -1);
                containerLabel = containerLabel.toUpperCase();
                
                if (containerLabel === searchLabel) {
                    let afterStrong = container.innerHTML.split(strong.outerHTML)[1] || '';
                    afterStrong = afterStrong.trim();
                    if (afterStrong.startsWith(':')) afterStrong = afterStrong.slice(1);
                    const value = afterStrong.replace(/^\s*/, '').replace(/<[^>]+>/g, '').trim();
                    return value;
                }
            }
            
            return '';
        } catch (e) {
            console.error('BaseParser.extractFieldFromHTML error:', e);
            return '';
        }
    }
    
    /**
     * Extract the first image from HTML.
     * @param {string} html - HTML content to parse
     * @returns {string|null} Image src URL or null if not found
     */
    static extractImage(html) {
        if (!html || typeof html !== 'string') return null;
        
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const imgTag = doc.querySelector('img');
            return imgTag?.src || null;
        } catch (e) {
            console.error('BaseParser.extractImage error:', e);
            return null;
        }
    }
    
    /**
     * Extract tags from HTML content.
     * Looks for <strong>Tags:</strong> followed by comma-separated values.
     * @param {string} html - HTML content to parse
     * @param {string} [containerSelector='p'] - CSS selector for container elements
     * @returns {string[]} Array of tag strings
     */
    static extractTags(html, containerSelector = 'p') {
        if (!html || typeof html !== 'string') return [];
        
        try {
            const value = this.extractFieldFromHTML(html, 'Tags', containerSelector);
            if (!value) return [];
            return value.split(',').map(tag => tag.trim()).filter(tag => tag);
        } catch (e) {
            console.error('BaseParser.extractTags error:', e);
            return [];
        }
    }
    
    /**
     * Extract a UUID link from HTML content.
     * Supports formats: @UUID[uuid]{label} or <a data-uuid="uuid">label</a>
     * @param {string} html - HTML content to parse
     * @param {Element} [contextElement] - Optional DOM element to search within
     * @returns {Object|null} { uuid: string, label: string } or null
     */
    static extractLink(html, contextElement = null) {
        if (!html || typeof html !== 'string') return null;
        
        try {
            // First try to find @UUID format in the HTML string
            const uuidMatch = html.match(/@UUID\[(.*?)\]{(.*?)}/);
            if (uuidMatch) {
                return {
                    uuid: uuidMatch[1],
                    label: uuidMatch[2]
                };
            }
            
            // Then try to find <a data-uuid> tag
            let searchContext;
            if (contextElement) {
                searchContext = contextElement;
            } else {
                const parser = new DOMParser();
                searchContext = parser.parseFromString(html, 'text/html');
            }
            
            const aTag = searchContext.querySelector?.('a[data-uuid]');
            if (aTag) {
                return {
                    uuid: aTag.getAttribute('data-uuid'),
                    label: aTag.textContent.trim()
                };
            }
            
            return null;
        } catch (e) {
            console.error('BaseParser.extractLink error:', e);
            return null;
        }
    }
    
    /**
     * Parse a single journal page (to be implemented by subclasses).
     * Each parser will have different output structures.
     * @param {JournalEntryPage} page - The journal page
     * @param {string} enrichedHtml - The enriched HTML content
     * @returns {Promise<Object|null>} Parsed entry object or null
     */
    static async parseSinglePage(page, enrichedHtml) {
        throw new Error('parseSinglePage must be implemented by subclass');
    }
}
