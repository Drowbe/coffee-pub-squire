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
                    const label = strongTag.textContent.trim().replace(':', '').toUpperCase();
                    // Get text after the strong element
                    let value = '';
                    if (container.childNodes.length > 1 && strongTag.nextSibling) {
                        value = strongTag.nextSibling.textContent?.replace(/^:/, '').trim() || '';
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
} 