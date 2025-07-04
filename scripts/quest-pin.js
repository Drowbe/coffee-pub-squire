import { MODULE, SQUIRE } from './const.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class QuestPin extends PIXI.Container {
  
  
  constructor({ x, y, questUuid, objectiveIndex, displayNumber, objectiveState }) {
    super();
    this.x = x;
    this.y = y;
    this.questUuid = questUuid;
    this.objectiveIndex = objectiveIndex;
    this.displayNumber = displayNumber;
    this.objectiveState = objectiveState;
    this.pinId = this._generatePinId();
    this.isDragging = false;
    this.dragData = null;
  
    // Debug logging for constructor state
    getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Constructor called', {
      pinId: this.pinId,
      objectiveState: this.objectiveState,
      questUuid: this.questUuid,
      objectiveIndex: this.objectiveIndex,
      displayNumber: this.displayNumber,
      note: 'active = normal/visible objective (no special HTML tags), hidden = <em> tags, completed = <s> tags, failed = <code> tags'
    });

    // ===============================
    // 0. Initialize pin properties
    // ===============================
    this.radius = 40; // Default radius
    this.fontSize = 35; // Default font size
    this.fontColor = 0xFFFFFF; // Default font color
  
    // ===============================
    // 1. Draw circular pin background with blurred drop shadow
    // ===============================
    const circle = new PIXI.Graphics();
    this.addChild(circle);
    this.circle = circle; // Store reference for later updates
    circle.interactive = false;
    circle.eventMode = 'none';
  
    // ===============================
    // 2. Display number centered inside circle
    // ===============================
    const refStyle = new PIXI.TextStyle({
      fontFamily: 'Signika',
      fontSize: this.fontSize,
      fill: this.fontColor,
      fontWeight: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
      dropShadow: true,
      dropShadowColor: '#000000',
      dropShadowBlur: 2,
      dropShadowDistance: 0,
      dropShadowAlpha: 0.6
    });
  
    const refText = new PIXI.Text(displayNumber, refStyle);
    refText.anchor.set(0.5);
    refText.position.set(0, 0);
    this.addChild(refText);
    this.refText = refText; // Store reference for later updates
    refText.interactive = false;
    refText.eventMode = 'none';
  
    // ================================
    // 3. Add interaction / hit area
    // ================================
    this.interactive = true;
    this.buttonMode = true;
    this.eventMode = 'static';
    this.hitArea = new PIXI.Circle(0, 0, this.radius);
    this.cursor = 'pointer';

    // Now update the appearance based on the objective state
    this._updatePinAppearance();


  
    // Enhanced event handling
    this.on('pointerdown', this._onPointerDown.bind(this));
    this.on('rightdown', this._onRightDown.bind(this));
    this.on('middleclick', this._onMiddleDown.bind(this));
    this.on('pointerover', this._onPointerOver.bind(this));
    this.on('pointerout', this._onPointerOut.bind(this));
    
    // Drag functionality
    this.on('pointerdown', this._onDragStart.bind(this));
    this.on('pointerup', this._onDragEnd.bind(this));
    this.on('pointerupoutside', this._onDragEnd.bind(this));
    this.on('pointermove', this._onDragMove.bind(this));
  
  }

  // Generate unique pin ID for persistence
  _generatePinId() {
    return `${this.questUuid}-${this.objectiveIndex}-${Date.now()}`;
  }

  // Centralized method to update pin appearance based on objective state
  _updatePinAppearance() {
    // Define pin properties based on objective state

   
    // Fill properties
    let pinRadius = 40; // Radius of the circular fill
    let pinColor = 0x1E85AD; // green (default for active)
    let pinAlpha = 0.8; // Background transparency

    // Border properties
    let pinBorderColor = 0x214D7F; // pin border color Blue
    let pinBorderTransparency = 1;
    let pinBorderWidth = 4;
    // Text properties
    let pinFontSize = pinRadius - 20; // size of label
    let pinFontColor = 0xFFFFFF; // white

    // Update properties based on objective state
    if (this.objectiveState === 'failed') {
      pinBorderColor = 0x871010; //red
      pinColor = 0xD41A1A; // red
    } else if (this.objectiveState === 'hidden') {
      pinBorderColor = 0x000000; // black
      pinColor = 0x000000; // black
    } else if (this.objectiveState === 'completed') {
      pinBorderColor = 0x1C4520; // green
      pinColor = 0x3C9245; // green
    } else {
      pinBorderColor = 0x214D7F; // blue
      pinColor = 0x1E85AD; // blue
    }

    // Store properties for later use
    this.radius = pinRadius;
    this.originalPinBorderColor = pinBorderColor;
    this.originalPinColor = pinColor;
    this.pinFontSize = pinFontSize;
    this.pinFontColor = pinFontColor;

    // Update the circle appearance
      this.circle.clear();
    this.circle.lineStyle(pinBorderWidth, pinBorderColor, pinBorderTransparency);
    this.circle.beginFill(pinColor, pinAlpha);
    this.circle.drawCircle(0, 0, pinRadius);
      this.circle.endFill();

    // Apply soft drop shadow filter
    this.circle.filters = [
      new PIXI.filters.DropShadowFilter({
        color: 0x000000,
        alpha: 0.6,
        blur: 6,
        distance: 0,
        rotation: 0
      })
    ];

    // Update the text appearance
    if (this.refText) {
      this.refText.style.fontSize = pinFontSize;
      this.refText.style.fill = pinFontColor;
    }

    // Update hit area
    this.hitArea = new PIXI.Circle(0, 0, pinRadius);
    this.alpha = 1.0;
    this.interactive = true;

    // Handle visibility in interaction for hidden pins
    if (this.objectiveState === 'hidden' && !game.user.isGM) {
      this.alpha = 0;
      this.interactive = false;
    }
  }





  // Update pin appearance based on new objective state
  updateObjectiveState(newState) {
    const oldState = this.objectiveState;
    this.objectiveState = newState;
    
    // Debug logging for state changes
    getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Objective state updated', {
      pinId: this.pinId,
      oldState: oldState,
      newState: newState,
      user: game.user.name,
      isGM: game.user.isGM,
      note: 'active = normal/visible objective (no special HTML tags), hidden = <em> tags, completed = <s> tags, failed = <code> tags'
    });
    
    // Update pin appearance using centralized method
    this._updatePinAppearance();
    

    
    // Save to persistence
    this._saveToPersistence();
  }

  // Save pin data to persistence
  _saveToPersistence() {
    // Only GMs can save pin data
    if (!game.user.isGM) return;
    
    try {
      const sceneId = canvas.scene?.id;
      if (!sceneId) return;

      const pinsData = game.settings.get('coffee-pub-squire', 'questPinsData') || {};
      if (!pinsData[sceneId]) pinsData[sceneId] = [];

      // Find existing pin or add new one
      const existingIndex = pinsData[sceneId].findIndex(pin => pin.pinId === this.pinId);
      const pinData = {
        pinId: this.pinId,
        questUuid: this.questUuid,
        objectiveIndex: this.objectiveIndex,
        x: this.x,
        y: this.y,
        objectiveState: this.objectiveState
      };

      if (existingIndex >= 0) {
        pinsData[sceneId][existingIndex] = pinData;
      } else {
        pinsData[sceneId].push(pinData);
      }

      game.settings.set('coffee-pub-squire', 'questPinsData', pinsData);
    } catch (error) {
      getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error saving quest pin', { error }, false, true, true, MODULE.TITLE);
    }
  }

  // Remove pin from persistence
  _removeFromPersistence() {
    // Only GMs can remove pin data
    if (!game.user.isGM) return;
    
    try {
      const sceneId = canvas.scene?.id;
      if (!sceneId) return;

      const pinsData = game.settings.get('coffee-pub-squire', 'questPinsData') || {};
      if (pinsData[sceneId]) {
        pinsData[sceneId] = pinsData[sceneId].filter(pin => pin.pinId !== this.pinId);
        game.settings.set('coffee-pub-squire', 'questPinsData', pinsData);
      }
    } catch (error) {
      getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error removing quest pin', { error }, false, true, true, MODULE.TITLE);
    }
  }

  // Drag functionality
  _onDragStart(event) {
    if (!game.user.isGM) return;
    // Prevent Foundry selection box and event bubbling
    if (event.data && event.data.originalEvent) {
      event.data.originalEvent.stopPropagation();
      event.data.originalEvent.stopImmediatePropagation();
      // Try to capture the pointer
      if (event.data.originalEvent.target && event.data.originalEvent.pointerId !== undefined) {
        try {
          event.data.originalEvent.target.setPointerCapture(event.data.originalEvent.pointerId);
        } catch (e) { /* ignore if not supported */ }
      }
    }
    this.isDragging = true;
    this.dragData = event.data;
    this.alpha = 0.8;
    document.body.style.cursor = 'grabbing';
    // Listen for pointermove and pointerup on the pin only
    this.on('pointermove', this._onDragMove, this);
    this.on('pointerup', this._onDragEnd, this);
    this.on('pointerupoutside', this._onDragEnd, this);
  }

  _onDragEnd(event) {
    if (!this.isDragging) return;
    // Prevent Foundry selection box and event bubbling
    if (event && event.data && event.data.originalEvent) {
      event.data.originalEvent.stopPropagation();
      event.data.originalEvent.stopImmediatePropagation();
      // Release pointer capture
      if (event.data.originalEvent.target && event.data.originalEvent.pointerId !== undefined) {
        try {
          event.data.originalEvent.target.releasePointerCapture(event.data.originalEvent.pointerId);
        } catch (e) { /* ignore if not supported */ }
      }
    }
    this.isDragging = false;
    this.dragData = null;
    this.alpha = 1.0;
    document.body.style.cursor = '';
    // Remove drag listeners
    this.off('pointermove', this._onDragMove, this);
    this.off('pointerup', this._onDragEnd, this);
    this.off('pointerupoutside', this._onDragEnd, this);
    this._saveToPersistence();
  }

  _onDragMove(event) {
    if (!this.isDragging || !this.dragData) return;
    // Prevent Foundry selection box and event bubbling
    if (event.data && event.data.originalEvent) {
      event.data.originalEvent.stopPropagation();
      event.data.originalEvent.stopImmediatePropagation();
    }
    const newPosition = this.dragData.getLocalPosition(this.parent);
    this.x = newPosition.x;
    this.y = newPosition.y;
  }

  // Event handlers
  _onPointerDown(event) {
    // Set cursor to grabbing immediately for GM
    if (game.user.isGM) document.body.style.cursor = 'grabbing';
    
    // Usual click/double-click logic
    if (this.isDragging) return;
    
    // Check for double-click (500ms window)
    if (this._lastClickTime && (Date.now() - this._lastClickTime) < 500) {
      this._onDoubleClick(event);
      this._lastClickTime = null;
    } else {
      this._lastClickTime = Date.now();
      
      // Left-click: Select pin and jump to quest in tracker
      if (event.data.button === 0) {
        // Check for Shift+Left-click to toggle hidden state (GM only)
        if (game.user.isGM && event.data.originalEvent.shiftKey) {
          this._toggleHiddenState();
        } else {
          this._selectPinAndJumpToQuest();
        }
      }
    }
  }

  _onRightDown(event) {
    if (!game.user.isGM) return; // Only GM can interact with right-click
    
    // Check for double right-click (500ms window)
    if (this._lastRightClickTime && (Date.now() - this._lastRightClickTime) < 500) {
      this._removePin(); // Double right-click: remove pin
      this._lastRightClickTime = null;
    } else {
      this._lastRightClickTime = Date.now();
      
      // Single right-click: fail the objective
      setTimeout(async () => {
        if (this._lastRightClickTime === Date.now()) {
          await this._failObjective();
        }
      }, 200);
    }
  }

  // Middle-click or Shift+Left-click: toggle hidden state
  _onMiddleDown(event) {
    if (!game.user.isGM) return; // Only GM can toggle hidden state
    
    this._toggleHiddenState();
  }

  async _onDoubleClick(event) {
    if (!game.user.isGM) return; // Only GM can complete objectives
    
    await this._completeObjective();
  }

  // Select pin and jump to quest in tracker
  _selectPinAndJumpToQuest() {
    // Highlight the pin briefly
    this.alpha = 0.6;
    setTimeout(() => {
      this.alpha = 1.0;
    }, 200);
    
    // Jump to quest in the quest tracker
    if (game.modules.get('coffee-pub-squire')?.api?.PanelManager?.instance) {
      const panelManager = game.modules.get('coffee-pub-squire').api.PanelManager.instance;
      
      // Switch to quest panel
      panelManager.setViewMode('quest');
      
      // Find and expand the quest entry
      setTimeout(() => {
        const questEntry = document.querySelector(`.quest-entry:has(.quest-entry-feather[data-uuid="${this.questUuid}"])`);
        if (questEntry) {
          // Expand the quest entry
          questEntry.classList.remove('collapsed');
          
          // Scroll to the quest entry
          questEntry.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Highlight the specific objective
          const objectiveItems = questEntry.querySelectorAll('li[data-task-index]');
          const targetObjective = objectiveItems[this.objectiveIndex];
          if (targetObjective) {
            targetObjective.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
            setTimeout(() => {
              targetObjective.style.backgroundColor = '';
            }, 2000);
          }
        }
      }, 100);
    }
  }

  // Toggle hidden state (middle-click or shift+left-click)
  async _toggleHiddenState() {
    try {
      // Get the journal page for this quest
      const journalId = game.settings.get(MODULE.ID, 'questJournal');
      if (!journalId || journalId === 'none') return;
      
      const journal = game.journal.get(journalId);
      if (!journal) return;
      
      const page = journal.pages.find(p => p.uuid === this.questUuid);
      if (!page) return;
      
      let content = page.text.content;
      const tasksMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
      if (!tasksMatch) return;
      
      const tasksHtml = tasksMatch[1];
      const parser = new DOMParser();
      const ulDoc = parser.parseFromString(`<ul>${tasksHtml}</ul>`, 'text/html');
      const ul = ulDoc.querySelector('ul');
      const liList = ul ? Array.from(ul.children) : [];
      const li = liList[this.objectiveIndex];
      if (!li) return;
      
      // Toggle hidden state by adding/removing <em> tags
      const emTag = li.querySelector('em');
      if (emTag) {
        // Task is already hidden, unhide it - unwrap <em>
        emTag.replaceWith(...emTag.childNodes);
      } else {
        // Task is not hidden, hide it - wrap in <em> and remove other states
        // First, unwrap any existing state tags to ensure clean state
        const sTag = li.querySelector('s');
        const codeTag = li.querySelector('code');
        
        if (sTag) {
          // If completed, unwrap <s> first
          li.innerHTML = sTag.innerHTML;
        } else if (codeTag) {
          // If failed, unwrap <code> first
          li.innerHTML = codeTag.innerHTML;
        }
        
        // Now wrap in <em>
        li.innerHTML = `<em>${li.innerHTML}</em>`;
      }
      
      const newTasksHtml = ul.innerHTML;
      const newContent = content.replace(tasksMatch[1], newTasksHtml);
      
      // Update the journal page
      await page.update({ text: { content: newContent } });
      
      // The pin will be automatically updated by the updateJournalEntryPage hook
      
    } catch (error) {
      getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error toggling hidden state', { error }, false, true, true, MODULE.TITLE);
    }
  }

  // Complete the objective (left double-click)
  async _completeObjective() {
    try {
      // Get the journal page for this quest
      const journalId = game.settings.get(MODULE.ID, 'questJournal');
      if (!journalId || journalId === 'none') return;
      
      const journal = game.journal.get(journalId);
      if (!journal) return;
      
      const page = journal.pages.find(p => p.uuid === this.questUuid);
      if (!page) return;
      
      let content = page.text.content;
      const tasksMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
      if (!tasksMatch) return;
      
      const tasksHtml = tasksMatch[1];
      const parser = new DOMParser();
      const ulDoc = parser.parseFromString(`<ul>${tasksHtml}</ul>`, 'text/html');
      const ul = ulDoc.querySelector('ul');
      const liList = ul ? Array.from(ul.children) : [];
      const li = liList[this.objectiveIndex];
      if (!li) return;
      
      // Check if already completed
      const sTag = li.querySelector('s');
      if (sTag) {
        // Already completed, uncomplete it
        li.innerHTML = sTag.innerHTML;
      } else {
        // Not completed, complete it - wrap in <s> and remove other states
        // First, unwrap any existing state tags to ensure clean state
        const codeTag = li.querySelector('code');
        const emTag = li.querySelector('em');
        
        if (codeTag) {
          // If failed, unwrap <code> first
          li.innerHTML = codeTag.innerHTML;
        } else if (emTag) {
          // If hidden, unwrap <em> first
          li.innerHTML = emTag.innerHTML;
        }
        
        // Now wrap in <s>
        li.innerHTML = `<s>${li.innerHTML}</s>`;
      }
      
      const newTasksHtml = ul.innerHTML;
      let newContent = content.replace(tasksMatch[1], newTasksHtml);
      
      // After toggling, check if all tasks are completed
      const allLis = Array.from(ul.children);
      const allCompleted = allLis.length > 0 && allLis.every(l => l.querySelector('s'));
      
      // Find current status and category
      const statusMatch = newContent.match(/<strong>Status:<\/strong>\s*([^<]*)/);
      let currentStatus = statusMatch ? statusMatch[1].trim() : '';
      const categoryMatch = newContent.match(/<strong>Category:<\/strong>\s*([^<]*)/);
      const currentCategory = categoryMatch ? categoryMatch[1].trim() : '';
      
      if (allCompleted) {
        // Change status to Complete
        if (currentStatus !== 'Complete') {
          if (statusMatch) {
            newContent = newContent.replace(/(<strong>Status:<\/strong>\s*)[^<]*/, '$1Complete');
          } else {
            newContent += `<p><strong>Status:</strong> Complete</p>`;
          }
          
          // Get or store original category
          let originalCategory = await page.getFlag(MODULE.ID, 'originalCategory');
          if (!originalCategory && currentCategory && currentCategory !== 'Completed') {
            originalCategory = currentCategory;
            await page.setFlag(MODULE.ID, 'originalCategory', originalCategory);
          }
        }
      } else {
        // If status is Complete and not all tasks are completed, set to In Progress
        if (currentStatus === 'Complete') {
          newContent = newContent.replace(/(<strong>Status:<\/strong>\s*)[^<]*/, '$1In Progress');
          
          // Restore original category if quest is in Completed
          if (currentCategory === 'Completed') {
            const originalCategory = await page.getFlag(MODULE.ID, 'originalCategory');
            if (originalCategory && categoryMatch) {
              newContent = newContent.replace(/(<strong>Category:<\/strong>\s*)[^<]*/, `$1${originalCategory}`);
            }
          }
        }
      }
      
      // Update the journal page
      await page.update({ text: { content: newContent } });
      
      // The pin will be automatically updated by the updateJournalEntryPage hook
      
    } catch (error) {
      getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error completing objective', { error }, false, true, true, MODULE.TITLE);
    }
  }

  // Fail the objective (right-click)
  async _failObjective() {
    try {
      // Get the journal page for this quest
      const journalId = game.settings.get(MODULE.ID, 'questJournal');
      if (!journalId || journalId === 'none') return;
      
      const journal = game.journal.get(journalId);
      if (!journal) return;
      
      const page = journal.pages.find(p => p.uuid === this.questUuid);
      if (!page) return;
      
      let content = page.text.content;
      const tasksMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
      if (!tasksMatch) return;
      
      const tasksHtml = tasksMatch[1];
      const parser = new DOMParser();
      const ulDoc = parser.parseFromString(`<ul>${tasksHtml}</ul>`, 'text/html');
      const ul = ulDoc.querySelector('ul');
      const liList = ul ? Array.from(ul.children) : [];
      const li = liList[this.objectiveIndex];
      if (!li) return;
      
      // Check if already failed
      const codeTag = li.querySelector('code');
      if (codeTag) {
        // Already failed, unfail it
        li.innerHTML = codeTag.innerHTML;
      } else {
        // Not failed, fail it - wrap in <code> and remove other states
        // First, unwrap any existing state tags to ensure clean state
        const sTag = li.querySelector('s');
        const emTag = li.querySelector('em');
        
        if (sTag) {
          // If completed, unwrap <s> first
          li.innerHTML = sTag.innerHTML;
        } else if (emTag) {
          // If hidden, unwrap <em> first
          li.innerHTML = emTag.innerHTML;
        }
        
        // Now wrap in <code>
        li.innerHTML = `<code>${li.innerHTML}</code>`;
      }
      
      const newTasksHtml = ul.innerHTML;
      const newContent = content.replace(tasksMatch[1], newTasksHtml);
      
      // Update the journal page
      await page.update({ text: { content: newContent } });
      
      // The pin will be automatically updated by the updateJournalEntryPage hook
      
    } catch (error) {
      getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error failing objective', { error }, false, true, true, MODULE.TITLE);
    }
  }

  _removePin() {
    this._removeFromPersistence();
    if (this.parent) {
      this.parent.removeChild(this);
    }
    // Clean up tooltip if it exists
    const tooltip = document.getElementById('squire-questpin-tooltip');
    if (tooltip) {
      tooltip.remove();
    }
  }



  // Helper method to get quest data
  _getQuestData() {
    try {
      // First try to get the journal entry directly
      const journalEntry = game.journal.get(this.questUuid);
        if (journalEntry) {
        return journalEntry;
      }

      // If not found, try to find it in the quest journal
      const journalId = game.settings.get(MODULE.ID, 'questJournal');
      if (journalId && journalId !== 'none') {
        const journal = game.journal.get(journalId);
        if (journal) {
          const page = journal.pages.find(p => p.uuid === this.questUuid);
          if (page) {
            return page;
          }
        }
      }

      // If still not found, try searching through all journals
      for (const journal of game.journal.contents) {
        const page = journal.pages.find(p => p.uuid === this.questUuid);
        if (page) {
          return page;
        }
      }

      return null;
    } catch (error) {
      getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error getting quest data', { error }, false, true, true, MODULE.TITLE);
      return null;
    }
  }

  // Helper method to get task text
  _getTaskText() {
    try {
      const questData = this._getQuestData();
      if (!questData) return 'Objective';

      // Parse the quest content to get tasks
      let content = '';
      if (typeof questData.text?.content === 'string') {
        content = questData.text.content;
      } else if (typeof questData.text === 'string') {
        content = questData.text;
      }

      if (!content) return 'Objective';

      // Parse tasks from the content
      const tasksMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
      if (tasksMatch) {
        const tasksHtml = tasksMatch[1];
        const parser = new DOMParser();
        const ulDoc = parser.parseFromString(`<ul>${tasksHtml}</ul>`, 'text/html');
        const ul = ulDoc.querySelector('ul');
        if (ul) {
          const liList = Array.from(ul.children);
          const li = liList[this.objectiveIndex];
          if (li) {
            // Get the text content, removing any HTML tags
            return li.textContent.trim();
          }
        }
      }

      return 'Objective';
    } catch (error) {
      getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error getting task text', { error }, false, true, true, MODULE.TITLE);
      return 'Objective';
    }
  }

  _onPointerOver(event) {
    // Lookup quest and objective text
    let text = this._getTaskText();
    let questName = 'Unknown Quest';
    
    try {
      const questData = this._getQuestData();
      if (questData) {
        questName = questData.name || 'Unknown Quest';
      }
    } catch (e) {
      getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error getting quest name', { error: e }, false, true, true, MODULE.TITLE);
    }
    
    // Create or get tooltip element
    let tooltip = document.getElementById('squire-questpin-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'squire-questpin-tooltip';
      tooltip.className = 'quest-marker-tooltip';
      document.body.appendChild(tooltip);
    }
    
    // Enhanced tooltip content
    const controls = game.user.isGM ? 
      'Left-click: Select & jump to quest | Left double-click: Complete | Middle/Shift+Left: Toggle hidden | Right-click: Fail | Double right-click: Delete | Drag to move' :
      'Left-click: Select & jump to quest';
    
    // Add visibility status to tooltip for GM
    const visibilityStatus = game.user.isGM ? 
      `<div style="font-size: 10px; opacity: 0.6; margin-top: 2px;">
        ${this.objectiveState === 'hidden' ? 'Hidden from players' : 'Visible to all players'}
      </div>` : '';
    
    tooltip.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px;">${questName}</div>
      <div style="font-size: 12px; opacity: 0.8;">Objective ${this.objectiveIndex + 1}</div>
      <div style="margin-top: 4px;">${text}</div>
      ${visibilityStatus}
      <div style="font-size: 10px; opacity: 0.6; margin-top: 4px;">
        ${controls}
      </div>
      
    `;
    tooltip.style.display = 'block';
    
    // Position tooltip near mouse
    const mouse = event.data.originalEvent;
    tooltip.style.left = (mouse.clientX + 16) + 'px';
    tooltip.style.top = (mouse.clientY + 8) + 'px';
  }

  _onPointerOut(event) {
    const tooltip = document.getElementById('squire-questpin-tooltip');
    if (tooltip) tooltip.style.display = 'none';
  }
}

function getQuestNumber(questUuid) {
    let hash = 0;
    for (let i = 0; i < questUuid.length; i++) {
        hash = ((hash << 5) - hash) + questUuid.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash) % 100 + 1;
}

// Re-enable only the dropCanvasData hook in quest-pin.js
Hooks.on('dropCanvasData', (canvas, data) => {
    if (data.type !== 'quest-objective') return; // Let Foundry handle all other drops!
    
    // Only GMs can create quest pins
    if (!game.user.isGM) return false;
    
    const { questUuid, objectiveIndex, objectiveState } = data;
    const displayNumber = `${getQuestNumber(questUuid)}.${String(objectiveIndex + 1).padStart(2, '0')}`;
    
    // Use the objective state from the drag data (default to 'active' if not provided)
    const finalObjectiveState = objectiveState || 'active';
    
    const pin = new QuestPin({ x: data.x, y: data.y, questUuid, objectiveIndex, displayNumber, objectiveState: finalObjectiveState });
    if (canvas.squirePins) {
        canvas.squirePins.addChild(pin);
        
        // Save to persistence
        pin._saveToPersistence();
    } else {
        getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | canvas.squirePins is not available', { canvas }, false, true, false, MODULE.TITLE);
    }
    return true; // Only block further handling for quest pins
});

// Load persisted pins when canvas is ready
Hooks.on('canvasReady', (canvas) => {
    getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Canvas ready, loading persisted pins');
    setTimeout(() => {
        loadPersistedPins();
    }, 1500);
});

// Load persisted pins when scene changes
Hooks.on('canvasSceneChange', (scene) => {
    getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Scene changed, loading persisted pins');
    // Delay loading to ensure scene is fully loaded
    setTimeout(() => {
        loadPersistedPins();
    }, 1000); // Increased delay for scene changes
});

// Function to load persisted pins for current scene
function loadPersistedPins() {
    try {
        const sceneId = canvas.scene?.id;
        if (!sceneId) {
            getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | No scene available');
            return;
        }
        
        if (!canvas.squirePins) {
            getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | squirePins container not available, retrying...');
            // Try again in a moment
            setTimeout(() => {
                loadPersistedPins();
            }, 1000);
            return;
        }

        const pinsData = game.settings.get('coffee-pub-squire', 'questPinsData') || {};
        const scenePins = pinsData[sceneId] || [];
        
        getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Loading pins for scene', { sceneId, scenePins });

        // Clear existing pins for this scene
        const existingPins = canvas.squirePins.children.filter(child => child instanceof QuestPin);
        existingPins.forEach(pin => {
            canvas.squirePins.removeChild(pin);
        });

        // Load pins from persistence
        scenePins.forEach(pinData => {
            try {
                const displayNumber = `${getQuestNumber(pinData.questUuid)}.${String(pinData.objectiveIndex + 1).padStart(2, '0')}`;
                const pin = new QuestPin({
                    x: pinData.x,
                    y: pinData.y,
                    questUuid: pinData.questUuid,
                    objectiveIndex: pinData.objectiveIndex,
                    displayNumber: displayNumber,
                    objectiveState: pinData.objectiveState
                });
                
                // Restore the original pinId for persistence
                pin.pinId = pinData.pinId;
                
                // Update the pin state to match current quest state (GM only)
                if (game.user.isGM) {
                    try {
                        const questData = pin._getQuestData();
                        if (questData) {
                            let content = '';
                            if (typeof questData.text?.content === 'string') {
                                content = questData.text.content;
                            } else if (typeof questData.text === 'string') {
                                content = questData.text;
                            }
                            
                            if (content) {
                                const tasksMatch = content.match(/<strong>Tasks:<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>/);
                                if (tasksMatch) {
                                    const tasksHtml = tasksMatch[1];
                                    const parser = new DOMParser();
                                    const ulDoc = parser.parseFromString(`<ul>${tasksHtml}</ul>`, 'text/html');
                                    const ul = ulDoc.querySelector('ul');
                                    if (ul) {
                                        const liList = Array.from(ul.children);
                                        const li = liList[pin.objectiveIndex];
                                        if (li) {
                                            let currentState = 'active';
                                            if (li.querySelector('s')) {
                                                currentState = 'completed';
                                            } else if (li.querySelector('code')) {
                                                currentState = 'failed';
                                            } else if (li.querySelector('em')) {
                                                currentState = 'hidden';
                                            }
                                            pin.updateObjectiveState(currentState);
                                        }
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error updating pin state on load', { error, pinData });
                    }
                }
                

                
                canvas.squirePins.addChild(pin);
                getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Loaded persisted pin', { 
                    pin: pin.pinId, 
                    objectiveState: pin.objectiveState, 
                    alpha: pin.alpha, 
                    interactive: pin.interactive,
                    user: game.user.name,
                    isGM: game.user.isGM
                });
            } catch (error) {
                getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error loading pin', { pinData, error });
            }
        });

        getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Successfully loaded', scenePins.length, 'pins for scene', sceneId);
    } catch (error) {
        getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error loading persisted pins', { error });
    }
} 