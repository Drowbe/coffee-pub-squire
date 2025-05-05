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
                    break;
                case 'DESCRIPTION':
                    entry.description = value;
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
                    // Inline participants (on the same <p> line)
                    let node = p.childNodes[1]; // childNodes[0] is <strong>
                    let foundInline = false;
                    while (node) {
                        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'A' && node.hasAttribute('data-uuid')) {
                            const uuid = node.getAttribute('data-uuid');
                            const doc = await fromUuid(uuid);
                            if (doc) {
                                entry.participants.push({
                                    uuid: uuid,
                                    name: doc.name,
                                    img: doc.img || doc.thumbnail || 'icons/svg/mystery-man.svg'
                                });
                                entry.tags.push(doc.name);
                            }
                            foundInline = true;
                        } else if (node.nodeType === Node.TEXT_NODE) {
                            const text = node.textContent.trim();
                            if (text) {
                                entry.participants.push(text);
                                entry.tags.push(text);
                                foundInline = true;
                            }
                        }
                        node = node.nextSibling;
                    }
                    // List participants (if next sibling is <ul>)
                    if (!foundInline) {
                        const ul = p.nextElementSibling;
                        if (ul && ul.tagName === 'UL') {
                            const liNodes = Array.from(ul.querySelectorAll('li'));
                            for (const li of liNodes) {
                                const a = li.querySelector('a[data-uuid]');
                                if (a) {
                                    const uuid = a.getAttribute('data-uuid');
                                    const doc = await fromUuid(uuid);
                                    if (doc) {
                                        entry.participants.push({
                                            uuid: uuid,
                                            name: doc.name,
                                            img: doc.img || doc.thumbnail || 'icons/svg/mystery-man.svg'
                                        });
                                        entry.tags.push(doc.name);
                                    }
                                } else {
                                    const text = li.textContent.trim();
                                    if (text) {
                                        entry.participants.push(text);
                                        entry.tags.push(text);
                                    }
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
                    } else if (li.querySelector('em, i')) {
                        state = 'hidden';
                        // Prefer the text inside the italics tag
                        const em = li.querySelector('em, i');
                        if (em) text = em.textContent.trim();
                    }
                    return {
                        text,
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

        // Ensure all participant names are in tags
        if (Array.isArray(entry.participants)) {
            entry.participants.forEach(p => {
                if (typeof p === 'string') {
                    entry.tags.push(p);
                } else if (p && typeof p.name === 'string') {
                    entry.tags.push(p.name);
                }
            });
        }

        // Deduplicate and trim tags
        entry.tags = Array.from(new Set(entry.tags.map(t => t.trim())));

        return entry;
    }
} 