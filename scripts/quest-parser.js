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
            criteria: [],
            timeframe: {
                dueDate: '',
                duration: ''
            },
            description: '',
            tasks: [],
            reward: {
                xp: 0,
                gold: 0,
                items: []
            },
            participants: [],
            plotHook: '',
            status: 'Not Started',
            progress: 0,
            related: [],
            tags: [],
            identified: page.ownership.default >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
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
                case 'CRITERIA':
                    entry.criteria = value.split(',').map(c => c.trim()).filter(c => c);
                    break;
                case 'DUE':
                    entry.timeframe.dueDate = value;
                    break;
                case 'DURATION':
                    entry.timeframe.duration = value;
                    break;
                case 'XP':
                    entry.reward.xp = parseInt(value) || 0;
                    break;
                case 'GOLD':
                    entry.reward.gold = parseInt(value) || 0;
                    break;
                case 'ITEMS':
                    entry.reward.items = value.split(',').map(i => i.trim()).filter(i => i);
                    break;
                case 'PARTICIPANTS': {
                    // Parse @UUID[...]{...} links if present
                    const uuidLinks = Array.from(p.querySelectorAll('a[data-uuid]'));
                    if (uuidLinks.length) {
                        entry.participants = uuidLinks.map(a => a.textContent.trim());
                    } else {
                        entry.participants = value.split(',').map(p => p.trim()).filter(p => p);
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
                case 'RELATED':
                    entry.related = value.split(',').map(r => r.trim()).filter(r => r);
                    break;
                case 'TAGS':
                    entry.tags = value.split(',').map(tag => tag.trim()).filter(tag => tag);
                    break;
                case 'IDENTIFIED':
                    entry.identified = value.toLowerCase() === 'true';
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
                entry.tasks = Array.from(ul.querySelectorAll('li')).map(li => ({
                    text: li.textContent.trim(),
                    completed: false
                })).filter(t => t.text);
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
        return entry;
    }
} 