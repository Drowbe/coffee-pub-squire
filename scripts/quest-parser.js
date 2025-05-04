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
            img: page.img || '',
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

        // If no explicit image, use the first <img> in the HTML
        if (!entry.img) {
            const imgTag = doc.querySelector('img');
            if (imgTag) entry.img = imgTag.src;
        }

        // Look for <ul> and parse <li> items
        const ul = doc.querySelector('ul');
        if (ul) {
            const listItems = ul.getElementsByTagName('li');
            for (let j = 0; j < listItems.length; j++) {
                const li = listItems[j];
                let container = li;
                if (li.children.length === 1 && li.children[0].tagName === 'P') {
                    container = li.children[0];
                }
                const strongTag = container.querySelector('strong');
                if (!strongTag) continue;
                const label = strongTag.textContent.trim().replace(/:$/, '').toUpperCase();
                let value = '';
                if (container.childNodes.length > 1 && strongTag.nextSibling) {
                    value = container.innerHTML.split(strongTag.outerHTML)[1] || '';
                    value = value.replace(/^[:\s]*/, '').replace(/<[^>]+>/g, '').trim();
                } else {
                    const text = container.textContent || '';
                    value = text.substring(text.indexOf(':') + 1).trim();
                }

                switch (label) {
                    case 'CATEGORY':
                        entry.category = value;
                        break;
                    case 'CRITERIA':
                        entry.criteria = value.split(',').map(c => c.trim()).filter(c => c);
                        break;
                    case 'TIMEFRAME':
                        const timeframeMatch = value.match(/(?:Due: (.+?))?(?:\s*,\s*Duration: (.+))?/);
                        if (timeframeMatch) {
                            entry.timeframe.dueDate = timeframeMatch[1] || '';
                            entry.timeframe.duration = timeframeMatch[2] || '';
                        }
                        break;
                    case 'DESCRIPTION':
                        entry.description = value;
                        break;
                    case 'TASKS':
                        entry.tasks = value.split(',').map(t => ({
                            text: t.trim(),
                            completed: false
                        })).filter(t => t.text);
                        break;
                    case 'REWARD':
                        const rewardMatch = value.match(/(?:XP: (\d+))?(?:\s*,\s*Gold: (\d+))?(?:\s*,\s*Items: (.+))?/);
                        if (rewardMatch) {
                            entry.reward.xp = parseInt(rewardMatch[1]) || 0;
                            entry.reward.gold = parseInt(rewardMatch[2]) || 0;
                            entry.reward.items = (rewardMatch[3] || '').split(',').map(i => i.trim()).filter(i => i);
                        }
                        break;
                    case 'PARTICIPANTS':
                        entry.participants = value.split(',').map(p => p.trim()).filter(p => p);
                        break;
                    case 'PLOT HOOK':
                        entry.plotHook = value;
                        break;
                    case 'STATUS':
                        entry.status = value;
                        break;
                    case 'PROGRESS':
                        // Remove any % symbol and convert to number
                        entry.progress = parseInt(value.replace('%', '')) || 0;
                        break;
                    case 'RELATED':
                        entry.related = value.split(',').map(r => r.trim()).filter(r => r);
                        break;
                    case 'TAGS':
                        entry.tags = value.split(',').map(tag => tag.trim()).filter(tag => tag);
                        break;
                }
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