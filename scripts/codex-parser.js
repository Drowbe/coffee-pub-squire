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
            }
            
            // Look for ul with fields
            if (currentElement?.tagName === 'UL') {
                const listItems = currentElement.getElementsByTagName('li');
                
                for (const li of listItems) {
                    // Get the p element inside the li
                    const p = li.querySelector('p');
                    if (!p) continue;

                    // Get the strong element inside the p
                    const strong = p.querySelector('strong');
                    if (!strong) continue;
                    
                    const label = strong.textContent.replace(':', '').trim().toUpperCase();
                    // Get text after the strong element
                    const value = p.textContent.substring(strong.textContent.length).replace(':', '').trim();
                    
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
                            const uuidMatch = value.match(/@UUID\[(.*?)\]{(.*?)}/);
                            if (uuidMatch) {
                                entry.link = {
                                    uuid: uuidMatch[1],
                                    label: uuidMatch[2]
                                };
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