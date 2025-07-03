import { MODULE } from './const.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class CodexParser {
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
        // Parse the enriched HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(enrichedHtml, 'text/html');
        
        const entry = {
            name: page.name,
            img: '',
            category: '',  // Mandatory
            description: '',  // Mandatory
            plotHook: '',
            location: '',
            link: null,
            tags: [],
            uuid: page.uuid
        };

        // Get image if present
        const imgTag = doc.querySelector('img');
        if (imgTag) entry.img = imgTag.src;

        // Parse all <p> fields with <strong> labels
        const pTags = Array.from(doc.querySelectorAll('p'));
        for (const p of pTags) {
            const strong = p.querySelector('strong');
            if (!strong) continue;

            // Robustly extract label: remove colon if inside <strong> or just after
            let label = strong.textContent.trim();
            if (label.endsWith(':')) label = label.slice(0, -1);
            let afterStrong = p.innerHTML.split(strong.outerHTML)[1] || '';
            afterStrong = afterStrong.trim();
            if (afterStrong.startsWith(':')) afterStrong = afterStrong.slice(1);
            let value = afterStrong.replace(/^\s*/, '').replace(/<[^>]+>/g, '').trim();

            label = label.toUpperCase();

            switch (label) {
                case 'CATEGORY':
                    entry.category = value.trim();
                    // Capitalize first letter, lower the rest
                    if (entry.category.length > 0) {
                        entry.category = entry.category.charAt(0).toUpperCase() + entry.category.slice(1).toLowerCase();
                    }
                    break;
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
                    const uuidMatch = value.match(/@UUID\[(.*?)\]{(.*?)}/);
                    if (uuidMatch) {
                        entry.link = {
                            uuid: uuidMatch[1],
                            label: uuidMatch[2]
                        };
                    } else {
                        const aTag = p.querySelector('a[data-uuid]');
                        if (aTag) {
                            entry.link = {
                                uuid: aTag.getAttribute('data-uuid'),
                                label: aTag.textContent.trim()
                            };
                        }
                    }
                    break;
                case 'TAGS':
                    entry.tags = value.split(',').map(t => t.trim()).filter(t => t);
                    break;
            }
        }

        // Validate mandatory fields
        if (!entry.category || !entry.description) {
            getBlacksmith()?.utils.postConsoleAndNotification(
                `CODEX: Entry "${entry.name}" is missing mandatory fields (Category or Description)`,
                { entry, enrichedHtml },
                false,
                false,
                false,
                MODULE.TITLE
            );
            return null;
        }
        return entry;
    }

    static extractDescription(content) {
        const match = content.match(/<strong>Description:<\/strong>\s*([^<]+)/i);
        return match ? match[1].trim() : '';
    }

    static extractPlotHook(content) {
        const match = content.match(/<strong>Plot Hook:<\/strong>\s*([^<]+)/i);
        return match ? match[1].trim() : '';
    }

    static extractLocation(content) {
        const match = content.match(/<strong>Location:<\/strong>\s*([^<]+)/i);
        return match ? match[1].trim() : '';
    }

    static extractLink(content) {
        const match = content.match(/@UUID\[(.*?)\]{(.*?)}/);
        if (match) {
            return {
                uuid: match[1],
                label: match[2]
            };
        }
        return null;
    }

    static extractTags(content) {
        const match = content.match(/<strong>Tags:<\/strong>\s*([^<]+)/i);
        if (match) {
            return match[1].split(',').map(tag => tag.trim()).filter(tag => tag);
        }
        return [];
    }
} 