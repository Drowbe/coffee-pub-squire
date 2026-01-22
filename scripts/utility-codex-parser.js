import { MODULE } from './const.js';
import { BaseParser } from './utility-base-parser.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class CodexParser extends BaseParser {
    /**
     * Parse HTML content from a journal page into structured codex entries
     * @param {string} html - HTML content from page.renderContent()
     * @returns {Array} Array of parsed entries
     */
    static async parseContent(html) {
        // Create a temporary div to parse the HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const entries = [];
        
        // Find all h1 elements (entry titles)
        const h1Elements = doc.getElementsByTagName('h1');
        
        for (let i = 0; i < h1Elements.length; i++) {
            const titleElement = h1Elements[i];
            const entry = {
                name: titleElement.textContent.trim(),
                img: '',
                description: '',
                plotHook: '',
                location: '',
                link: null,
                tags: [],
                identified: false
            };
            
            // Find the next img and ul elements
            let currentElement = titleElement.nextElementSibling;
            
            // Look for image
            if (currentElement?.tagName === 'IMG') {
                entry.img = currentElement.src;
                currentElement = currentElement.nextElementSibling;
            } else {
                entry.img = 'images/bookmark.webp';
            }
            
            // Look for ul element
            if (currentElement?.tagName === 'UL') {
                const listItems = currentElement.getElementsByTagName('li');
                
                for (let j = 0; j < listItems.length; j++) {
                    const li = listItems[j];
                    // Support <li><p><strong>...</strong>: value</p></li> and <li><strong>...</strong>: value</li>
                    let container = li;
                    if (li.children.length === 1 && li.children[0].tagName === 'P') {
                        container = li.children[0];
                    }
                    const strongTag = container.querySelector('strong');
                    if (!strongTag) continue;
                    // Remove any trailing colon and whitespace from the label
                    const label = strongTag.textContent.trim().replace(/:$/, '').toUpperCase();
                    // Robustly extract value: get all text after the <strong> tag, remove leading colons/whitespace, strip HTML tags
                    let value = '';
                    if (container.childNodes.length > 1 && strongTag.nextSibling) {
                        // Get everything after the <strong> tag in the container's HTML
                        value = container.innerHTML.split(strongTag.outerHTML)[1] || '';
                        value = value.replace(/^[:\s]*/, '').replace(/<[^>]+>/g, '').trim();
                    } else {
                        // fallback: get all text after the colon
                        const text = container.textContent || '';
                        value = text.substring(text.indexOf(':') + 1).trim();
                    }
                    
                    switch (label) {
                        case 'DESCRIPTION':
                            entry.description = value;
                            break;
                        case 'PLOT HOOK':
                            entry.plotHook = value;
                            break;
                        case 'LOCATION':
                            entry.location = value;
                            break;
                        case 'LINK':
                            // Look for UUID format: @UUID[type.id]{label}
                            let uuidMatch = value.match(/@UUID\[(.*?)\]{(.*?)}/);
                            if (uuidMatch) {
                                entry.link = {
                                    uuid: uuidMatch[1],
                                    label: uuidMatch[2]
                                };
                            } else {
                                // Try to find <a data-uuid=...> in the li
                                const aTag = li.querySelector('a[data-uuid]');
                                if (aTag) {
                                    entry.link = {
                                        uuid: aTag.getAttribute('data-uuid'),
                                        label: aTag.textContent.trim()
                                    };
                                }
                            }
                            break;
                        case 'TAGS':
                            entry.tags = value.split(',').map(tag => tag.trim()).filter(tag => tag);
                            break;
                        case 'IDENTIFIED':
                            entry.identified = value.toLowerCase() === 'true';
                            break;
                    }
                }
            }
            
            entries.push(entry);
        }
        
        return entries;
    }

    /**
     * Parse a single journal page into a codex entry object
     * @param {JournalEntryPage} page - The journal page
     * @param {string} enrichedHtml - The enriched HTML content of the page
     * @returns {Object|null} Codex entry object or null if not valid
     */
    static async parseSinglePage(page, enrichedHtml) {
        // Parse the enriched HTML once for link extraction
        const parser = new DOMParser();
        const doc = parser.parseFromString(enrichedHtml, 'text/html');
        
        const entry = {
            name: page.name,
            img: '',
            category: '',  // Optional - will default to "No Category" if missing
            description: '',  // Optional
            plotHook: '',
            location: '',
            link: null,
            tags: [],
            uuid: page.uuid
        };

        // Get image if present
        const img = BaseParser.extractImage(enrichedHtml);
        if (img) entry.img = img;

        // Extract fields using BaseParser utilities
        entry.category = BaseParser.extractFieldFromHTML(enrichedHtml, 'Category', 'p');
        if (entry.category.length > 0) {
            entry.category = entry.category.charAt(0).toUpperCase() + entry.category.slice(1).toLowerCase();
        }
        
        entry.description = BaseParser.extractFieldFromHTML(enrichedHtml, 'Description', 'p');
        entry.plotHook = BaseParser.extractFieldFromHTML(enrichedHtml, 'Plot Hook', 'p');
        entry.location = BaseParser.extractFieldFromHTML(enrichedHtml, 'Location', 'p');
        entry.tags = BaseParser.extractTags(enrichedHtml, 'p');
        
        // Extract link - search in paragraph containing "Link" field
        const linkP = Array.from(doc.querySelectorAll('p')).find(p => {
            const strong = p.querySelector('strong');
            return strong && strong.textContent.trim().replace(/:$/, '').toUpperCase() === 'LINK';
        });
        if (linkP) {
            entry.link = BaseParser.extractLink(enrichedHtml, linkP) || null;
        }

        // No longer require mandatory fields - we'll handle missing categories gracefully
        // Only require that we have a name (which we always do from page.name)
        return entry;
    }

    // Legacy extract methods - now use BaseParser utilities
    static extractDescription(content) {
        return BaseParser.extractFieldFromHTML(content, 'Description');
    }

    static extractPlotHook(content) {
        return BaseParser.extractFieldFromHTML(content, 'Plot Hook');
    }

    static extractLocation(content) {
        return BaseParser.extractFieldFromHTML(content, 'Location');
    }

    static extractLink(content) {
        return BaseParser.extractLink(content);
    }

    static extractTags(content) {
        return BaseParser.extractTags(content);
    }
} 