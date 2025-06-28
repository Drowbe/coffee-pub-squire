export class QuestParser {
    /**
     * Parse a single journal page into a quest entry object
     * @param {JournalEntryPage} page - The journal page
     * @param {string} enrichedHtml - The enriched HTML content of the page
     * @returns {Object|null} Quest entry object or null if not valid
     */
    static async parseSinglePage(page, enrichedHtml) {
        // Parse the enriched HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(enrichedHtml, 'text/html');
        const entry = {
            name: page.name,
            img: '',
            category: '',
            originalCategory: '',
            timeframe: {
                duration: ''
            },
            description: '',
            tasks: [],
            reward: {
                xp: 0,
                treasure: []
            },
            participants: [],
            plotHook: '',
            status: 'Not Started',
            progress: 0,
            tags: [],
            uuid: page.uuid
        };

        // Get the first <img> for the quest image
        const imgTag = doc.querySelector('img');
        if (imgTag) entry.img = imgTag.src;

        // Parse all <p> fields
        const pTags = Array.from(doc.querySelectorAll('p'));
        let lastP = null;
        for (let i = 0; i < pTags.length; i++) {
            const p = pTags[i];
            const strong = p.querySelector('strong');
            if (!strong) continue;
            const label = strong.textContent.trim().replace(/:$/, '').toUpperCase();
            // Get value: all text after the <strong> tag
            let value = p.textContent.replace(strong.textContent, '').replace(/^[:\s]*/, '').trim();
            switch (label) {
                case 'CATEGORY':
                    entry.category = value;
                    entry.originalCategory = value;
                    break;
                case 'DESCRIPTION':
                    entry.description = value;
                    break;
                case 'LOCATION':
                    entry.location = value;
                    break;
                case 'DURATION':
                    entry.timeframe.duration = value;
                    break;
                case 'XP':
                    entry.reward.xp = parseInt(value) || 0;
                    break;
                case 'TREASURE': {
                    entry.reward.treasure = [];
                    // Inline treasure (on the same <p> line)
                    let node = p.childNodes[1]; // childNodes[0] is <strong>
                    let foundInline = false;
                    while (node) {
                        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'A' && node.hasAttribute('data-uuid')) {
                            entry.reward.treasure.push({
                                uuid: node.getAttribute('data-uuid'),
                                name: node.textContent.trim()
                            });
                            foundInline = true;
                        } else if (node.nodeType === Node.TEXT_NODE) {
                            const text = node.textContent.trim();
                            if (text) {
                                entry.reward.treasure.push({ text });
                                foundInline = true;
                            }
                        }
                        node = node.nextSibling;
                    }
                    // List treasure (if next sibling is <ul>)
                    if (!foundInline) {
                        const ul = p.nextElementSibling;
                        if (ul && ul.tagName === 'UL') {
                            entry.reward.treasure = Array.from(ul.querySelectorAll('li')).map(li => {
                                const a = li.querySelector('a[data-uuid]');
                                if (a) {
                                    return {
                                        uuid: a.getAttribute('data-uuid'),
                                        name: a.textContent.trim()
                                    };
                                } else {
                                    return { text: li.textContent.trim() };
                                }
                            }).filter(t => t.uuid || t.text);
                        }
                    }
                    break;
                }
                case 'PARTICIPANTS': {
                    entry.participants = [];
                    // Get the full HTML content of the paragraph after the strong tag
                    const paragraphHTML = p.innerHTML.replace(/<strong>[^<]*<\/strong>/, '').trim();
                    
                    // Check if there's significant content in the paragraph itself
                    if (paragraphHTML && paragraphHTML !== ':') {
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = paragraphHTML;
                        
                        // Process all UUID links
                        const uuidLinks = tempDiv.querySelectorAll('a[data-uuid]');
                        let foundLinks = false;
                        
                        if (uuidLinks.length > 0) {
                            foundLinks = true;
                            for (const link of uuidLinks) {
                                const uuid = link.getAttribute('data-uuid');
                                const doc = await fromUuid(uuid);
                                if (doc) {
                                    entry.participants.push({
                                        uuid: uuid,
                                        name: doc.name,
                                        img: doc.img || doc.thumbnail || 'icons/svg/mystery-man.svg'
                                    });
                                }
                            }
                        }
                        
                        // If no links were found, try to process text content
                        if (!foundLinks) {
                            const text = tempDiv.textContent.trim();
                            if (text) {
                                // Split by common separators and process each non-empty part
                                const parts = text.split(/[,;]/).map(part => part.trim()).filter(part => part);
                                for (const part of parts) {
                                    entry.participants.push({
                                        name: part,
                                        img: 'icons/svg/mystery-man.svg'
                                    });
                                }
                            }
                        }
                    }
                    
                    // If we have a list following the participants heading, process it
                    // Check if the next element is a <ul>
                    const nextElement = p.nextElementSibling;
                    if (nextElement && nextElement.tagName === 'UL') {
                        const liNodes = Array.from(nextElement.querySelectorAll('li'));
                        for (const li of liNodes) {
                            // Look for UUID links in the list item
                            const uuidLinks = li.querySelectorAll('a[data-uuid]');
                            
                            if (uuidLinks.length > 0) {
                                // Process all UUID links in this list item
                                for (const link of uuidLinks) {
                                    const uuid = link.getAttribute('data-uuid');
                                    const doc = await fromUuid(uuid);
                                    if (doc) {
                                        entry.participants.push({
                                            uuid: uuid,
                                            name: doc.name, 
                                            img: doc.img || doc.thumbnail || 'icons/svg/mystery-man.svg'
                                        });
                                    }
                                }
                            } else {
                                // No UUID links, use the text content
                                const text = li.textContent.trim();
                                if (text) {
                                    entry.participants.push({
                                        name: text,
                                        img: 'icons/svg/mystery-man.svg'
                                    });
                                }
                            }
                        }
                    }
                    break;
                }
                case 'PLOT HOOK':
                    entry.plotHook = value;
                    break;
                case 'STATUS':
                    entry.status = value;
                    break;
                case 'PROGRESS':
                    entry.progress = parseInt(value.replace('%', '')) || 0;
                    break;
                case 'TAGS':
                    entry.tags = value.split(',').map(tag => tag.trim()).filter(tag => tag);
                    break;
                case 'TASKS':
                    // The next sibling should be a <ul> with <li> tasks
                    lastP = p;
                    break;
            }
        }

        // Find <ul> after <p><strong>Tasks:</strong></p>
        if (lastP) {
            let ul = lastP.nextElementSibling;
            if (ul && ul.tagName === 'UL') {
                entry.tasks = Array.from(ul.querySelectorAll('li')).map(li => {
                    // Detect state by child tags
                    let state = 'active';
                    let text = li.textContent.trim();
                    if (li.querySelector('s, del, strike')) {
                        state = 'completed';
                        // Prefer the text inside the strikethrough tag
                        const s = li.querySelector('s, del, strike');
                        if (s) text = s.textContent.trim();
                    } else if (li.querySelector('code')) {
                        // Use code tags for failed tasks
                        state = 'failed';
                        // Prefer the text inside the code tag
                        const code = li.querySelector('code');
                        if (code) text = code.textContent.trim();
                    } else if (li.querySelector('u, span[style*="text-decoration: underline"]')) {
                        // Legacy support for underline as failed tasks (can be removed later)
                        state = 'failed';
                        const u = li.querySelector('u, span[style*="text-decoration: underline"]');
                        if (u) text = u.textContent.trim();
                    } else if (li.querySelector('em, i')) {
                        state = 'hidden';
                        // Prefer the text inside the italics tag
                        const em = li.querySelector('em, i');
                        if (em) text = em.textContent.trim();
                    }

                    // Parse GM hints and treasure unlocks from the text
                    let displayText = text;
                    let gmHint = null;
                    let treasureUnlocks = [];

                    try {
                        // Extract GM hints (||text||)
                        const gmHintRegex = /\|\|([^|]+)\|\|/g;
                        const gmHints = [];
                        let gmHintMatch;
                        while ((gmHintMatch = gmHintRegex.exec(text)) !== null) {
                            gmHints.push(gmHintMatch[1].trim());
                        }
                        if (gmHints.length > 0) {
                            gmHint = gmHints.join(' ');
                            // Remove GM hints from display text
                            displayText = displayText.replace(gmHintRegex, '').trim();
                        }

                        // Extract treasure unlocks ((Treasure Name))
                        const treasureRegex = /\(\(([^)]+)\)\)/g;
                        const treasures = [];
                        let treasureMatch;
                        while ((treasureMatch = treasureRegex.exec(text)) !== null) {
                            treasures.push(treasureMatch[1].trim());
                        }
                        if (treasures.length > 0) {
                            treasureUnlocks = treasures;
                            // Remove treasure unlocks from display text
                            displayText = displayText.replace(treasureRegex, '').trim();
                        }
                    } catch (error) {
                        console.error('SQUIRE | Error parsing task hints and treasures:', error, text);
                        displayText = text;
                    }

                    return {
                        text: displayText,
                        originalText: text, // Keep original for reference
                        gmHint,
                        treasureUnlocks,
                        state,
                        completed: state === 'completed'
                    };
                }).filter(t => t.text);
            }
        }

        // Fallback: if no description, use all text content
        if (!entry.description) {
            entry.description = doc.body.textContent.trim();
        }

        // Calculate progress based on completed tasks if we have tasks
        if (entry.tasks.length > 0) {
            const completedTasks = entry.tasks.filter(task => task.completed).length;
            entry.progress = Math.round((completedTasks / entry.tasks.length) * 100);
        }

        // If no name, skip
        if (!entry.name) return null;

        // Filter out empty participants
        if (Array.isArray(entry.participants)) {
            // Filter out any empty participant objects or strings
            entry.participants = entry.participants.filter(p => {
                if (!p) return false;
                if (typeof p === 'string') return p.trim() !== '';
                return p.uuid || (p.name && p.name.trim() !== '');
            });
        }

        // Deduplicate and trim tags
        entry.tags = Array.from(new Set(entry.tags.map(t => t.trim())));

        return entry;
    }
} 