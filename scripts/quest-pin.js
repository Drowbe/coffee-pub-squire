import { MODULE, SQUIRE } from './const.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

export class QuestPin extends PIXI.Container {
  
  
  constructor({ x, y, questUuid, objectiveIndex, displayNumber, objectiveState, visible = true }) {
    super();
    this.x = x;
    this.y = y;
    this.questUuid = questUuid;
    this.objectiveIndex = objectiveIndex;
    this.displayNumber = displayNumber;
    this.objectiveState = objectiveState;
    this.visible = visible;
    this.pinId = this._generatePinId();
    this.isDragging = false;
    this.dragData = null;
  

    // ===============================
    // 0. Define pin properties
    // ===============================
    let radius = 40; // Radius of the circular pin
    let borderColor = 0x000000;
    let fillColor = 0x000000; // grey
    let fillAlpha = 0.2; // Background transparency
    let fontSize = radius - 5; // size of label
    let fontColor = 0xFFFFFF; // white

    if (objectiveState === 'active') {
      radius = 40; // Radius of the circular pin
      borderColor = 0x104A60; // dark green
      fillColor = 0x1E85AD; // green
      fillAlpha = 0.2; // Background transparency
      fontSize = radius - 10; // size of label
      fontColor = 0xFFFFFF; // white
    } else if (objectiveState === 'failed') {
      radius = 40; // Radius of the circular pin
      borderColor = 0x871010;
      fillColor = 0xD41A1A; // red
      fillAlpha = 0.2; // Background transparency
      fontSize = radius - 10; // size of label
      fontColor = 0xFFFFFF; // white
    } else if (objectiveState === 'hidden') {
      radius = 40; // Radius of the circular pin
      borderColor = 0x000000;
      fillColor = 0x000000; // grey
      fillAlpha = 0.2; // Background transparency
      fontSize = radius - 10; // size of label
      fontColor = 0xFFFFFF; // white
    } else if (objectiveState === 'completed') {
      radius = 40; // Radius of the circular pin
      borderColor = 0x1C4520; // dark green
      fillColor = 0x3C9245; // green
      fillAlpha = 0.2; // Background transparency
      fontSize = radius - 10; // size of label
      fontColor = 0xFFFFFF; // white
    } else {
      radius = 40; // Radius of the circular pin
      borderColor = 0x000000;
      fillColor = 0x000000; // grey
      fillAlpha = 0.2; // Background transparency
      fontSize = radius - 10; // size of label
      fontColor = 0xFFFFFF; // white
    }

    // Store radius for later use
    this.radius = radius;
    this.originalBorderColor = borderColor;
    this.originalFillColor = fillColor;
  
    // ===============================
    // 1. Draw circular pin background with blurred drop shadow
    // ===============================
    const circle = new PIXI.Graphics();
    circle.lineStyle(2, borderColor, 1); // Thin black border
    circle.beginFill(fillColor, fillAlpha);
    circle.drawCircle(0, 0, radius);
    circle.endFill();
  
    // Apply soft drop shadow filter
    circle.filters = [
      new PIXI.filters.DropShadowFilter({
        color: 0x000000,
        alpha: 0.6,
        blur: 6,
        distance: 0,
        rotation: 0
      })
    ];
  
    this.addChild(circle);
    this.circle = circle; // Store reference for later updates
    circle.interactive = false;
    circle.eventMode = 'none';
  
    // ===============================
    // 2. Display number centered inside circle
    // ===============================
    const refStyle = new PIXI.TextStyle({
      fontFamily: 'Signika',
      fontSize: fontSize,
      fill: fontColor,
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
    this.hitArea = new PIXI.Circle(0, 0, radius);
    this.cursor = 'pointer';

    // Apply visibility state
    this._updateVisibility();
  
    // Enhanced event handling
    this.on('pointerdown', this._onPointerDown.bind(this));
    this.on('rightdown', this._onRightDown.bind(this));
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

  // Update pin visibility - hidden pins are invisible to players, visible to GM
  _updateVisibility() {
    if (!this.visible) {
      if (game.user.isGM) {
        // For GM: show hidden pins with hidden colors (semi-transparent black)
        this.alpha = 0.6;
        this.interactive = true;
        this.circle.clear();
        this.circle.lineStyle(2, 0x000000, 1);
        this.circle.beginFill(0x000000, 0.2);
        this.circle.drawCircle(0, 0, this.radius);
        this.circle.endFill();
      } else {
        // For players: hide pins completely
        this.alpha = 0;
        this.interactive = false;
      }
    } else {
      // Visible for everyone
      this.alpha = 1.0;
      this.interactive = true;
      // Restore original colors
      this.circle.clear();
      this.circle.lineStyle(2, this.originalBorderColor, 1);
      this.circle.beginFill(this.originalFillColor, 0.2);
      this.circle.drawCircle(0, 0, this.radius);
      this.circle.endFill();
    }
  }

  // Toggle visibility - GM only
  toggleVisibility() {
    if (!game.user.isGM) return; // Only GM can toggle visibility
    
    this.visible = !this.visible;
    this._updateVisibility();
    this._saveToPersistence();
  }

  // Update pin appearance based on new objective state
  updateObjectiveState(newState) {
    this.objectiveState = newState;
    
    // Update colors based on new state
    let borderColor = 0x000000;
    let fillColor = 0x000000;
    
    if (newState === 'active') {
      borderColor = 0x104A60;
      fillColor = 0x1E85AD;
    } else if (newState === 'failed') {
      borderColor = 0x871010;
      fillColor = 0xD41A1A;
    } else if (newState === 'hidden') {
      borderColor = 0x000000;
      fillColor = 0x000000;
    } else if (newState === 'completed') {
      borderColor = 0x1C4520;
      fillColor = 0x3C9245;
    }
    
    // Update the circle appearance
    this.circle.clear();
    this.circle.lineStyle(2, borderColor, 1);
    this.circle.beginFill(fillColor, 0.2);
    this.circle.drawCircle(0, 0, this.radius);
    this.circle.endFill();
    
    // Store new colors
    this.originalBorderColor = borderColor;
    this.originalFillColor = fillColor;
    
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
        objectiveState: this.objectiveState,
        visible: this.visible
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
    if (this._lastClickTime && (Date.now() - this._lastClickTime) < 500) {
      this._onDoubleClick(event);
      this._lastClickTime = null;
    } else {
      this._lastClickTime = Date.now();
      setTimeout(() => {
        if (this._lastClickTime === Date.now()) {
          this.toggleVisibility();
        }
      }, 200);
    }
  }

  _onRightDown(event) {
    if (!game.user.isGM) return; // Only GM can delete
    
    this._removePin();
  }

  _onDoubleClick(event) {
    this._openQuestJournal();
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

  _openQuestJournal() {
    try {
      // Get the journal entry directly from the questUuid
      const journalEntry = game.journal.get(this.questUuid);
      if (journalEntry) {
        journalEntry.sheet.render(true);
      } else {
        // Try to find the journal entry by searching through all journals
        const journalId = game.settings.get(MODULE.ID, 'questJournal');
        if (journalId && journalId !== 'none') {
          const journal = game.journal.get(journalId);
          if (journal) {
            const page = journal.pages.find(p => p.uuid === this.questUuid);
            if (page) {
              journal.sheet.render(true);
              return;
            }
          }
        }
        getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Quest journal entry not found', { uuid: this.questUuid }, false, true, false, MODULE.TITLE);
      }
    } catch (error) {
      getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error opening quest journal', { error }, false, true, true, MODULE.TITLE);
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
      'Left-click: Toggle visibility | Right-click: Delete | Double-click: Open quest | Drag to move' :
      'Double-click: Open quest';
    
    // Add visibility status to tooltip for GM
    const visibilityStatus = game.user.isGM ? 
      `<div style="font-size: 10px; opacity: 0.6; margin-top: 2px;">
        ${this.visible ? 'Visible to all players' : 'Hidden from players'}
      </div>` : '';
    
    tooltip.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px;">${questName}</div>
      <div style="font-size: 12px; opacity: 0.8;">Objective ${this.objectiveIndex + 1}</div>
      <div style="margin-top: 4px;">${text}</div>
      <div style="font-size: 10px; opacity: 0.6; margin-top: 4px;">
        ${controls}
      </div>
      ${visibilityStatus}
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
    const displayNumber = `${getQuestNumber(questUuid)}.${objectiveIndex + 1}`;
    
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
    // Only GMs can load and manage quest pins
    if (!game.user.isGM) return;
    
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
                const displayNumber = `${getQuestNumber(pinData.questUuid)}.${pinData.objectiveIndex + 1}`;
                const pin = new QuestPin({
                    x: pinData.x,
                    y: pinData.y,
                    questUuid: pinData.questUuid,
                    objectiveIndex: pinData.objectiveIndex,
                    displayNumber: displayNumber,
                    objectiveState: pinData.objectiveState,
                    visible: pinData.visible !== false // Default to true if not specified
                });
                
                // Restore the original pinId for persistence
                pin.pinId = pinData.pinId;
                
                // Update the pin state to match current quest state
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
                
                // Apply visibility state after pin is created
                pin._updateVisibility();
                
                canvas.squirePins.addChild(pin);
                getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Loaded persisted pin', { pin });
            } catch (error) {
                getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error loading pin', { pinData, error });
            }
        });

        getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Successfully loaded', scenePins.length, 'pins for scene', sceneId);
    } catch (error) {
        getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error loading persisted pins', { error });
    }
} 