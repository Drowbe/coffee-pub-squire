import { MODULE, SQUIRE } from './const.js';
import { showQuestTooltip, hideQuestTooltip, getTaskText, getObjectiveTooltipData, getQuestTooltipData } from './helpers.js';

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

// === Configurable Pin Appearance ===
const DEFAULT_PIN_CONFIG = {
  inner: {
    width: 300,
    height: 60,
    borderRadius: 10,
    color: 0x000000,
    alpha: 1.0,
    dropShadow: { color: 0x000000, alpha: 0.6, blur: 8, distance: 0 }
  },
  outer: {
    ringWidth: 8,
    gap: 6,
    color: 0x1E85AD, // overridden by state
    alpha: 1.0,
    style: 'solid' // or 'dotted'
  },
  separator: {
    color: 0xFFFFFF,
    thickness: 3,
    style: 'solid' // or 'dashed'
  },
  icons: {
    quest: {
      main: '\uf024', // fas fa-flag (unicode)
      side: '\uf277'  // fas fa-map-signs (unicode)
    },
    status: {
      active: '',
      completed: '\uf00c', // fas fa-check
      failed: '\uf00d',    // fas fa-xmark
      hidden: '\uf06e'     // fas fa-eye
    }
  },
  font: {
    family: 'Signika',
    size: 32,
    color: 0xFFFFFF,
    faFamily: 'FontAwesome',
    faSize: 30,
    faColor: 0xFFFFFF,
    numberPadding: 8 // Horizontal offset from center for quest/objective numbers
  }
};

export class QuestPin extends PIXI.Container {
  
  
  constructor({ x, y, questUuid, objectiveIndex, objectiveState, questIndex, questCategory, questState, questStatus, participants, config }) {
    super();
    this.x = x;
    this.y = y;
    this.questUuid = questUuid;
    this.objectiveIndex = objectiveIndex;
    this.objectiveState = objectiveState;
    this.questIndex = questIndex;
    this.questCategory = questCategory;
    this.questState = questState || 'visible'; // Default to visible if not provided
    this.questStatus = questStatus || 'Not Started'; // New field for quest status
    this.participants = participants || []; // New field for quest participants
    
    // Determine pin type based on objectiveIndex
    this.pinType = (this.objectiveIndex === null || this.objectiveIndex === undefined) ? 'quest' : 'objective';
    
    this.pinId = this._generatePinId();
    this.isDragging = false;
    this.dragData = null;
    this._rightClickTimeout = null;
    this._hasStartedDrag = false;
    // Merge config
    this.config = foundry.utils.mergeObject(
      foundry.utils.deepClone(DEFAULT_PIN_CONFIG),
      config || {},
      { inplace: false, insertKeys: true, insertValues: true }
    );
  
    // Debug logging for constructor state
    getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Constructor called', {
      pinId: this.pinId,
      pinType: this.pinType,
      objectiveState: this.objectiveState,
      questUuid: this.questUuid,
      objectiveIndex: this.objectiveIndex,
      questIndex: this.questIndex,
      questCategory: this.questCategory,
      questStatus: this.questStatus,
      participants: this.participants,
      config: this.config,
      note: 'active = normal/visible objective (no special HTML tags), hidden = <em> tags, completed = <s> tags, failed = <code> tags',
    }, false, true, false, MODULE.TITLE);

    // Draw the pin
    this._updatePinAppearance();
    
    // Set initial visibility
    this.updateVisibility();
    
    // Enable pointer events
    this.interactive = true;
    this.cursor = 'pointer';
    // Enhanced event handling
    this.on('pointerdown', this._onPointerDown.bind(this));
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
    if (this.pinType === 'quest') {
      return `${this.questUuid}-quest-${Date.now()}`;
    } else {
      return `${this.questUuid}-${this.objectiveIndex}-${Date.now()}`;
    }
  }

  /**
   * Check if this pin should be visible to the current user
   * @returns {boolean} True if pin should be visible
   */
  shouldBeVisible() {
    // GMs always see all pins
    if (game.user.isGM) return true;

    // Check if player has hidden all quest pins
    if (game.user.getFlag(MODULE.ID, 'hideQuestPins')) {
      return false;
    }

    // Check quest-level visibility first
    if (this.questState === 'hidden') {
      return false;
    }

    // For quest-level pins, only check quest visibility
    if (this.pinType === 'quest') {
      return true;
    }

    // For objective pins, check objective-level visibility
    if (this.objectiveState === 'hidden') {
      return false;
    }

    return true;
  }

  /**
   * Update pin visibility based on current conditions
   */
  updateVisibility() {
    const shouldShow = this.shouldBeVisible();
    
    if (shouldShow) {
      this.visible = true;
      this.alpha = 1.0;
    } else {
      // For GMs, show pins but with reduced alpha to indicate they're hidden from players
      if (game.user.isGM) {
        this.visible = true;
        this.alpha = 1.0;
      } else {
        this.visible = false;
        this.alpha = 0.0;
      }
    }
  }

  // Centralized method to update pin appearance based on objective state
  _updatePinAppearance() {
    // Remove previous children
    this.removeChildren();

    // === PIN APPEARANCE VARIABLES (all values set at top for clarity) ===
    // General
    const pinFontFamily = "Signika";
    const pinIconFamily = "FontAwesome";
    const pinDataPadding = 10;
    const pinIconSizeMainQuestAdjustment = 0; // adds a bit more to the size of the icons
    const pinIconSizeSideQuestAdjustment = 4; // adds a bit more to the size of the icons


    // Pin Title Text
    const pinTitleFontSize = 20;
    const pinTitleFontColor = 0xFFFFFF;
    const pinTitleFontWeight = 'bold';
    const pinTitleFontStroke = 0x000000;
    const pinTitleFontStrokeThickness = 4;
    const pinTitleFontAlign = 'center';
    const pinTitleOffset = 25;




    // Main Pin - Make quest pins round, objectives are now square but same height
    const pinInnerWidth = this.pinType === 'quest' ? 80 : 80; // Square for objective pins, same width as quest pins
    const pinInnerHeight = this.pinType === 'quest' ? 80 : 80;  // Square for objective pins, same height as quest pins
    const pinInnerBorderRadius = this.pinType === 'quest' ? 40 : 6; // Square for objective pins
    const pinInnerColor = 0x000000;
    const pinInnerTransparency = 0.8;
    const pinInnerDropShadow = { color: 0x000000, alpha: 0.6, blur: 8, distance: 0 };

    // Pin Ring
    const pinRingThickness = 3;
    const pinRingGap = 2;
    let pinRingColor = 0x1E85AD; // usually same as default below
    const pinRingTransparency = 0.8;

    // OBJECTIVE Ring State Colors
    const pinRingColorObjectiveFailed = 0xD41A1A;
    const pinRingColorOjectiveHidden = 0xAAA79A;
    const pinRingColorObjectiveCompleted = 0x3C9245;
    const pinRingColorObjectiveDefault = 0x161513;
    // OBJECTIVE Icon State Colors
    const pinIconColorObjectiveFailed = 0xD41A1A;
    const pinIconColorOjectiveHidden = 0xAAA79A;
    const pinIconColorObectiveCompleted = 0x3C9245;
    const pinIconColorObjectiveDefault = 0xFFFFFF;


    // QUEST Ring State Colors
    const pinRingColorQuestHidden = 0xFF7E28;
    const pinRingColorQuestInProgress = 0x161513;
    const pinRingColorQuestNotStarted = 0x277487;
    const pinRingColorQuestFailed = 0xD41A1A;
    const pinRingColorQuestCompleted = 0x3C9245;
    
    // QUEST Icon State Colors
    const pinIconColorQuestHidden = 0xFF7E28;
    const pinIconColorInProgress = 0xFFFFFF;
    const pinIconColorNotStarted = 0x277487;
    const pinIconColorQuestFailed = 0xD41A1A;
    const pinIconColorQuestCompleted = 0x3C9245;
    
    // Main Quest Icon - Scale up for quest pins
    const pinIconMainQuestStyle = "\uf024"; // fas fa-flag (unicode)
    const pinIconMainQuestSize = pinInnerHeight / 2 + pinIconSizeMainQuestAdjustment;
    const labelMainQuestVerticleOffset = 24;

    // Side Quest Icon - Scale up for quest pins
    const pinIconSideQuestStyle = "\uf277"; // fas fa-map-signs (unicode)
    const pinIconSideQuestSize = pinInnerHeight / 2 + pinIconSizeSideQuestAdjustment
    const labelSideQuestVerticleOffset = 28;


          // === State-based ring color override ===
      if (this.pinType === 'quest') {
        // For quest-level pins, use quest status for ring color
        if (this.questStatus === 'Failed') pinRingColor = pinRingColorQuestFailed;
        else if (this.questStatus === 'Complete') pinRingColor = pinRingColorQuestCompleted;
        else if (this.questStatus === 'In Progress') pinRingColor = pinRingColorQuestInProgress;
        else if (this.questStatus === 'Not Started') pinRingColor = pinRingColorQuestNotStarted;
        else if (this.questState === 'hidden') pinRingColor = pinRingColorQuestHidden;
        else pinRingColor = pinRingColorQuestInProgress; // Default to In Progress
    } else {
      // For objective pins, use objective state for ring color
      if (this.objectiveState === 'failed') pinRingColor = pinRingColorObjectiveFailed;
      else if (this.objectiveState === 'hidden') pinRingColor = pinRingColorOjectiveHidden;
      else if (this.objectiveState === 'completed') pinRingColor = pinRingColorObjectiveCompleted;
      else pinRingColor = pinRingColorObjectiveDefault;
    }





    
    // === Outer ring ===
    if (this.pinType === 'quest') {
      // For quest pins, draw circular rings
      const outerRadius = pinInnerHeight/2 + pinRingThickness + pinRingGap;
      const outer = new PIXI.Graphics();
      
      // Draw the main ring
      outer.lineStyle({
        width: pinRingThickness,
        color: pinRingColor,
        alpha: pinRingTransparency,
        alignment: 0.5,
        native: false
      });
      outer.drawCircle(0, 0, outerRadius);
      this.addChild(outer);
      
      // Add second ring for hidden quests (GM only)
      if (this.questState === 'hidden' && game.user.isGM) {
        const secondRingRadius = outerRadius + pinRingThickness + pinRingGap;
        const secondRing = new PIXI.Graphics();
        
        secondRing.lineStyle({
          width: pinRingThickness,
          color: pinRingColorQuestHidden,
          alpha: pinRingTransparency,
          alignment: 0.5,
          native: false
        });
        secondRing.drawCircle(0, 0, secondRingRadius);
        this.addChild(secondRing);
      }
    } else {
      // For objective pins, keep rectangular rings
      const outerW = pinInnerWidth + 2 * (pinRingThickness + pinRingGap);
      const outerH = pinInnerHeight + 2 * (pinRingThickness + pinRingGap);
      const outer = new PIXI.Graphics();
      
      // Draw the main ring
      outer.lineStyle({
        width: pinRingThickness,
        color: pinRingColor,
        alpha: pinRingTransparency,
        alignment: 0.5,
        native: false
      });
      outer.drawRoundedRect(-outerW/2, -outerH/2, outerW, outerH, pinInnerBorderRadius + pinRingThickness + pinRingGap);
      this.addChild(outer);
      
      // Add second ring for hidden quests (GM only) - same logic as quest pins
      if (this.questState === 'hidden' && game.user.isGM) {
        const secondRingW = outerW + 2 * (pinRingThickness + pinRingGap);
        const secondRingH = outerH + 2 * (pinRingThickness + pinRingGap);
        const secondRing = new PIXI.Graphics();
        
        secondRing.lineStyle({
          width: pinRingThickness,
          color: pinRingColorQuestHidden,
          alpha: pinRingTransparency,
          alignment: 0.5,
          native: false
        });
        secondRing.drawRoundedRect(-secondRingW/2, -secondRingH/2, secondRingW, secondRingH, pinInnerBorderRadius + 2 * (pinRingThickness + pinRingGap));
        this.addChild(secondRing);
      }
    }

    // === Inner shape ===
    const inner = new PIXI.Graphics();
    inner.beginFill(pinInnerColor, pinInnerTransparency);
    
    if (this.pinType === 'quest') {
      // For quest pins, draw circle
      inner.drawCircle(0, 0, pinInnerHeight/2);
    } else {
      // For objective pins, draw rounded rectangle
      inner.drawRoundedRect(-pinInnerWidth/2, -pinInnerHeight/2, pinInnerWidth, pinInnerHeight, pinInnerBorderRadius);
    }
    
    inner.endFill();
    inner.filters = [
      new PIXI.filters.DropShadowFilter(pinInnerDropShadow)
    ];
    this.addChild(inner);

    // === Icons and numbers ===
    const padX = pinDataPadding;
    const centerY = 0;
    const centerX = 0;
    
    if (this.pinType === 'quest') {

      // *** QUEST PIN ***
      
      // For quest pins, use same layout as objectives: icon on top, quest number below
      let questIconUnicode;
      let questIconSize; // pinInnerHeight / 1.5 - 2; // Same size as objective pins
      let questIconColor;
      
      // Set icon based on quest category
      if (this.questCategory === 'Side Quest') {
        questIconUnicode = pinIconSideQuestStyle;
        questIconSize = pinIconSideQuestSize;
      } else {
        questIconUnicode = pinIconMainQuestStyle;
        questIconSize = pinIconMainQuestSize;
      }
      
      // Set icon color based on quest status using QUEST-specific colors
      if (this.questStatus === 'Failed') questIconColor = pinIconColorQuestFailed;
      else if (this.questStatus === 'Complete') questIconColor = pinIconColorQuestCompleted;
      else if (this.questStatus === 'In Progress') questIconColor = pinIconColorInProgress;
      else if (this.questStatus === 'Not Started') questIconColor = pinIconColorNotStarted;
      else if (this.questState === 'hidden') questIconColor = pinIconColorQuestHidden;
      else questIconColor = pinIconColorInProgress; // Default to In Progress
      
      const questIcon = new PIXI.Text(questIconUnicode, {
        fontFamily: pinIconFamily,
        fontSize: questIconSize,
        fill: questIconColor
      });
      questIcon.anchor.set(0.5);
      questIcon.position.set(centerX, centerY - 8); // Icon above center, same as objectives
      this.addChild(questIcon);
      
      // Quest number below (just the quest number, no objective)
      const questIndexValue = (this.questIndex !== undefined && this.questIndex !== null && this.questIndex !== '')
        ? String(this.questIndex)
        : '??';
      
      // Add Q prefix for consistency with objective pins
      const questText = `Q${questIndexValue}`;
      const questLabel = new PIXI.Text(questText, {
        fontFamily: pinFontFamily,
        fontSize: 16,
        fill: 0xFFFFFF, // White text for better visibility
        fontWeight: 'bold',
        align: 'center'
      });
      questLabel.anchor.set(0.5);
      questLabel.position.set(centerX, centerY + labelMainQuestVerticleOffset); // Centered below icon
      
      // Only add the label if the setting allows it
      if (game.settings.get(MODULE.ID, 'showQuestPinText')) {
        this.addChild(questLabel);
        
        // Quest title text below the quest number
        const questTitle = new PIXI.Text(this.questName || 'Unknown Quest', {
          fontFamily: pinFontFamily,
          fontSize: pinTitleFontSize,
          fill: pinTitleFontColor, // White text for better visibility
          fontWeight: pinTitleFontWeight,
          align: pinTitleFontAlign,
          stroke: pinTitleFontStroke,
          strokeThickness: pinTitleFontStrokeThickness
        });
        questTitle.anchor.set(0.5);
        questTitle.position.set(centerX, centerY + pinInnerHeight/2 + pinTitleOffset); // BelowPin
        this.addChild(questTitle);
      }
      
    } else {

      // *** OBJECTIVE PIN ***

      // Quest category icon (large, centered on top)

      let questIconUnicode = pinIconMainQuestStyle;
      let questIconSize = pinInnerHeight / 1.5 - 2; // Much bigger icon, minimal space for numbers
      let questIconColor;
      
      // Set icon based on quest category
      if (this.questCategory === 'Side Quest') {
        questIconUnicode = pinIconSideQuestStyle;
      }
      
      // Set icon color based on objective state (same logic as ring colors)
      if (this.objectiveState === 'failed') questIconColor = pinIconColorObjectiveFailed;
      else if (this.objectiveState === 'hidden') questIconColor = pinIconColorOjectiveHidden;
      else if (this.objectiveState === 'completed') questIconColor = pinIconColorObectiveCompleted;
      else questIconColor = pinIconColorObjectiveDefault;
      const questIcon = new PIXI.Text(questIconUnicode, {
        fontFamily: pinIconFamily,
        fontSize: questIconSize,
        fill: questIconColor
      });
      questIcon.anchor.set(0.5);
      questIcon.position.set(centerX, centerY - 8); // Icon above center
      this.addChild(questIcon);
      
      // Quest number and objective number below (as small badges)
      const questIndexValue = (this.questIndex !== undefined && this.questIndex !== null && this.questIndex !== '')
        ? String(this.questIndex)
        : '??';
      const objNumValue = (this.objectiveIndex !== undefined && this.objectiveIndex !== null && this.objectiveIndex !== '')
        ? String(this.objectiveIndex + 1).padStart(2, '0')
        : '??';
      
                    // Combined quest and objective number in Q85.03 format
              const combinedText = `Q${questIndexValue}.${objNumValue}`;
              const combinedLabel = new PIXI.Text(combinedText, {
                fontFamily: pinFontFamily,
                fontSize: 16,
                fill: 0xFFFFFF, // White text for better visibility
                fontWeight: 'bold',
                align: 'center'
              });
              combinedLabel.anchor.set(0.5);
              combinedLabel.position.set(centerX, centerY + labelSideQuestVerticleOffset); // Centered below icon
              
              // Only add the label if the setting allows it
              if (game.settings.get(MODULE.ID, 'showQuestPinText')) {
                this.addChild(combinedLabel);
                
                // Objective title text below the combined label
                const objectiveTitle = new PIXI.Text(this.objectiveName || 'Unknown Objective', {
                  fontFamily: pinFontFamily,
                  fontSize: pinTitleFontSize,
                  fill: pinTitleFontColor, // White text for better visibility
                  fontWeight: pinTitleFontWeight,
                  align: pinTitleFontAlign,
                  stroke: pinTitleFontStroke,
                  strokeThickness: pinTitleFontStrokeThickness
                });
                objectiveTitle.anchor.set(0.5);
                objectiveTitle.position.set(centerX, centerY + pinInnerHeight/2 + pinTitleOffset); // Below combined label
                this.addChild(objectiveTitle);
              }
    }

        // --- Right side ---
    if (this.pinType === 'quest') {
      // For quest pins, no portraits for now - just the centered icon is enough
      // Portraits will be added back later
    }
    // Note: Objective pins no longer show status icons (suppressed for now)
    // Set hit area to match the inner shape
    if (this.pinType === 'quest') {
      // For quest pins, use circular hit area
      this.hitArea = new PIXI.Circle(0, 0, pinInnerHeight/2);
    } else {
      // For objective pins, use square hit area
      this.hitArea = new PIXI.Rectangle(
        -pinInnerWidth/2,
        -pinInnerHeight/2,
        pinInnerWidth,
        pinInnerHeight
      );
    }
  }

  // Helper method to add fallback portrait when image loading fails
  _addFallbackPortrait(container, participant, portraitSize) {
    const playerInitial = participant.name ? participant.name.charAt(0).toUpperCase() : '?';
    const playerText = new PIXI.Text(playerInitial, {
      fontFamily: "Signika",
      fontSize: portraitSize * 0.6,
      fill: 0xffffff,
      fontWeight: 'bold',
      align: 'center'
    });
    playerText.anchor.set(0.5);
    
    // Add text shadow for better readability
    playerText.filters = [
      new PIXI.filters.DropShadowFilter({
        color: 0x000000,
        alpha: 0.8,
        blur: 2,
        distance: 1
      })
    ];
    
    container.addChild(playerText);
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

  // Update pin appearance based on new quest status (for quest-level pins)
  updateQuestStatus(newStatus) {
    if (this.pinType !== 'quest') {
      getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Cannot update quest status on objective pin', {
        pinId: this.pinId,
        pinType: this.pinType,
        user: game.user.name
      }, false, true, false, MODULE.TITLE);
      return;
    }
    
    const oldStatus = this.questStatus;
    this.questStatus = newStatus;
    
    // Debug logging for status changes
    getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Quest status updated', {
      pinId: this.pinId,
      oldStatus: oldStatus,
      newStatus: newStatus,
      user: game.user.name,
      isGM: game.user.isGM
    }, false, true, false, MODULE.TITLE);
    
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
      const scene = canvas.scene;
      if (!scene) return;

      // Get existing pins data from scene flags
      const pinsData = scene.getFlag(MODULE.ID, 'questPins') || [];
      
      // Find existing pin or add new one
      const existingIndex = pinsData.findIndex(pin => pin.pinId === this.pinId);
      const pinData = {
        pinId: this.pinId,
        questUuid: this.questUuid,
        objectiveIndex: this.objectiveIndex,
        x: this.x,
        y: this.y,
        objectiveState: this.objectiveState,
        questIndex: this.questIndex,
        questCategory: this.questCategory,
        questState: this.questState,
        pinType: this.pinType,
        questStatus: this.questStatus,
        participants: this.participants
      };

      if (existingIndex >= 0) {
        pinsData[existingIndex] = pinData;
      } else {
        pinsData.push(pinData);
      }

      // Save to scene flags
      scene.setFlag(MODULE.ID, 'questPins', pinsData);
    } catch (error) {
      getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error saving quest pin', { error }, false, true, true, MODULE.TITLE);
    }
  }

  // Remove pin from persistence
  _removeFromPersistence() {
    // Only GMs can remove pin data
    if (!game.user.isGM) return;
    
    try {
      const scene = canvas.scene;
      if (!scene) return;

      // Get existing pins data from scene flags
      const pinsData = scene.getFlag(MODULE.ID, 'questPins') || [];
      
      // Remove this pin
      const updatedPinsData = pinsData.filter(pin => pin.pinId !== this.pinId);
      
      // Save updated data to scene flags
      scene.setFlag(MODULE.ID, 'questPins', updatedPinsData);
    } catch (error) {
      getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error removing quest pin', { error }, false, true, true, MODULE.TITLE);
    }
  }

  // Drag functionality
  _onDragStart(event) {
    if (!game.user.isGM) return;
    // Only allow drag with left mouse button (button 0)
    if (event.data.button !== 0) return;
    
    // Store initial position for distance calculation
    this._dragStartPosition = { x: event.data.global.x, y: event.data.global.y };
    this._dragStartTime = Date.now();
    
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
    
    // Listen for pointermove and pointerup on the pin only
    this.on('pointermove', this._onDragMove, this);
    this.on('pointerup', this._onDragEnd, this);
    this.on('pointerupoutside', this._onDragEnd, this);
    
    // Also listen for global mouse events to continue drag even when mouse leaves pin
    this._onGlobalDragMove = this._onGlobalDragMove.bind(this);
    this._onGlobalDragEnd = this._onGlobalDragEnd.bind(this);
    document.addEventListener('pointermove', this._onGlobalDragMove, { passive: false });
    document.addEventListener('pointerup', this._onGlobalDragEnd, { passive: false });
  }

  _onDragEnd(event) {
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
    
    this._endDrag();
  }

  // Global drag end handler (for when mouse is released anywhere)
  _onGlobalDragEnd(event) {
    this._endDrag();
  }

  // Centralized drag end logic
  _endDrag() {
    // Check if we actually dragged before cleaning up
    const wasDragging = this.isDragging;
    
    // Clean up drag state
    this.isDragging = false;
    this.dragData = null;
    this._dragStartPosition = null;
    this._dragStartTime = null;
    this._hasStartedDrag = false;
    this.alpha = 1.0;
    
    // Always reset cursor to default
    document.body.style.cursor = '';
    document.body.style.cursor = 'default';
    
    // Remove drag listeners
    this.off('pointermove', this._onDragMove, this);
    this.off('pointerup', this._onDragEnd, this);
    this.off('pointerupoutside', this._onDragEnd, this);
    
    // Remove global listeners
    if (this._onGlobalDragMove) {
      document.removeEventListener('pointermove', this._onGlobalDragMove);
    }
    if (this._onGlobalDragEnd) {
      document.removeEventListener('pointerup', this._onGlobalDragEnd);
    }
    
    // Only save if we actually dragged
    if (wasDragging) {
      this._saveToPersistence();
    }
  }

  _onDragMove(event) {
    if (!this._dragStartPosition) return;
    
    // Calculate distance moved
    const distance = Math.sqrt(
      Math.pow(event.data.global.x - this._dragStartPosition.x, 2) + 
      Math.pow(event.data.global.y - this._dragStartPosition.y, 2)
    );
    
    // Start dragging immediately on any movement (more responsive)
    if (!this.isDragging && distance > 1) {
      // Cancel any pending click action
      if (this._clickTimeout) {
        clearTimeout(this._clickTimeout);
        this._clickTimeout = null;
      }
      
      this.isDragging = true;
      this._hasStartedDrag = true;
      this.alpha = 0.8;
      document.body.style.cursor = 'grabbing';
    }
    
    // If we're dragging, update position
    if (this.isDragging) {
      // Prevent Foundry selection box and event bubbling
      if (event.data && event.data.originalEvent) {
        event.data.originalEvent.stopPropagation();
        event.data.originalEvent.stopImmediatePropagation();
      }
      
      // Use global position and convert to local for better performance
      const globalPos = event.data.global;
      const localPos = this.parent.toLocal(globalPos);
      this.x = localPos.x;
      this.y = localPos.y;
    }
  }

  // Global drag move handler (for when mouse leaves pin area)
  _onGlobalDragMove(event) {
    if (!this.isDragging) return;
    
    // Prevent default behavior
    event.preventDefault();
    event.stopPropagation();
    
    // Convert DOM event to PIXI coordinates
    const rect = canvas.app.view.getBoundingClientRect();
    const globalX = event.clientX - rect.left;
    const globalY = event.clientY - rect.top;
    
    // Convert to local coordinates and update position
    const globalPos = { x: globalX, y: globalY };
    const localPos = this.parent.toLocal(globalPos);
    this.x = localPos.x;
    this.y = localPos.y;
  }

  // Event handlers
  _onPointerDown(event) {
    // Set cursor to grabbing immediately for GM
    if (game.user.isGM) document.body.style.cursor = 'grabbing';
    
    // Handle right-click (button 2) here instead of separate handler
    if (event.data.button === 2) {
      this._onRightDown(event);
      return;
    }
    
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
          // Delay the click action to allow for drag detection
          this._clickTimeout = setTimeout(() => {
            // Only execute if we're not dragging and haven't started dragging
            if (!this.isDragging && !this._hasStartedDrag) {
              this._selectPinAndJumpToQuest();
            }
          }, 100); // Shorter delay for more responsive drag detection
        }
      }
      
      // Middle-click: toggle hidden state (GM only)
      if (event.data.button === 1) {
        if (game.user.isGM) {
          getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Middle-click detected - toggling hidden state', {
            pinId: this.pinId,
            user: game.user.name
          });
          this._toggleHiddenState();
        }
      }
    }
  }

  _onRightDown(event) {
    if (!game.user.isGM) return; // Only GM can interact with right-click
    
    getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Right-click detected', {
      pinId: this.pinId,
      lastRightClickTime: this._lastRightClickTime,
      timeSinceLastClick: this._lastRightClickTime ? (Date.now() - this._lastRightClickTime) : 'N/A',
      user: game.user.name
    });
    
    // Check for double right-click (500ms window)
    if (this._lastRightClickTime && (Date.now() - this._lastRightClickTime) < 500) {
      // Double right-click: remove pin only
      getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Double right-click - removing pin', {
        pinId: this.pinId,
        user: game.user.name
      });
      this._lastRightClickTime = null;
      // Clear any pending timeout
      if (this._rightClickTimeout) {
        clearTimeout(this._rightClickTimeout);
        this._rightClickTimeout = null;
      }
      this._removePin();
    } else {
      const clickTime = Date.now();
      this._lastRightClickTime = clickTime;
      
      // Single right-click: toggle visibility for quest pins, fail objective for objective pins
      getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Single right-click - setting timeout', {
        pinId: this.pinId,
        clickTime: clickTime,
        user: game.user.name
      });
      this._rightClickTimeout = setTimeout(async () => {
        // Only execute if this is still the most recent right-click
        if (this._lastRightClickTime === clickTime) {
          getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Executing right-click action', {
            pinId: this.pinId,
            clickTime: clickTime,
            lastRightClickTime: this._lastRightClickTime,
            user: game.user.name
          });
          
          if (this.pinType === 'quest') {
            // For quest pins, toggle visibility
            await this._toggleHiddenState();
          } else {
            // For objective pins, fail objective
            await this._failObjective();
          }
        } else {
          getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Right-click timeout cancelled - newer click detected', {
            pinId: this.pinId,
            clickTime: clickTime,
            lastRightClickTime: this._lastRightClickTime,
            user: game.user.name
          });
        }
        this._rightClickTimeout = null;
      }, 300); // Increased delay to be more reliable
    }
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
    
    // Debug logging
    getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Selecting pin and jumping to quest', {
      questUuid: this.questUuid,
      objectiveIndex: this.objectiveIndex,
      pinType: this.pinType,
      user: game.user.name,
      isGM: game.user.isGM
    });
    
    // Jump to quest in the quest tracker
    if (game.modules.get('coffee-pub-squire')?.api?.PanelManager?.instance) {
      const panelManager = game.modules.get('coffee-pub-squire').api.PanelManager.instance;
      
      // Switch to quest panel
      panelManager.setViewMode('quest');
      
      // Find and expand the quest entry with retry logic
      const findAndHighlightQuest = () => {
        // Use the new data-quest-uuid attribute that both GMs and players have
        let questEntry = document.querySelector(`.quest-entry[data-quest-uuid="${this.questUuid}"]`);
        
        // Fallback: try to find by quest name if not found
        if (!questEntry) {
          const questData = this._getQuestData();
          if (questData && questData.name) {
            const allEntries = document.querySelectorAll('.quest-entry');
            for (const entry of allEntries) {
              const nameElement = entry.querySelector('.quest-entry-name');
              if (nameElement && nameElement.textContent.trim() === questData.name.trim()) {
                questEntry = entry;
                break;
              }
            }
          }
        }
        
        // Debug logging for quest entry search
        getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Quest entry search result', {
          questUuid: this.questUuid,
          questEntryFound: !!questEntry,
          allQuestEntries: document.querySelectorAll('.quest-entry').length,
          entriesWithUuid: document.querySelectorAll('.quest-entry[data-quest-uuid]').length,
          user: game.user.name
        });
        
        if (questEntry) {
          // Expand the quest entry
          questEntry.classList.remove('collapsed');
          
          // Scroll to the quest entry
          questEntry.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          if (this.pinType === 'quest') {
            // For quest-level pins, highlight the entire quest entry
            questEntry.classList.add('quest-highlighted');
            setTimeout(() => {
              questEntry.classList.remove('quest-highlighted');
            }, 2000);
            
            getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Quest entry highlighted', {
              questUuid: this.questUuid,
              pinType: this.pinType,
              user: game.user.name
            });
          } else {
            // For objective pins, highlight the specific objective
            const objectiveItems = questEntry.querySelectorAll('li[data-task-index]');
            const targetObjective = objectiveItems[this.objectiveIndex];
            
            // Debug logging for objective highlighting
            getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Objective highlighting result', {
              objectiveIndex: this.objectiveIndex,
              totalObjectives: objectiveItems.length,
              targetObjectiveFound: !!targetObjective,
              user: game.user.name
            });
            
            if (targetObjective) {
              targetObjective.classList.add('objective-highlighted');
              setTimeout(() => {
                targetObjective.classList.remove('objective-highlighted');
              }, 2000);
            }
          }
        } else {
          getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Quest entry not found', {
            questUuid: this.questUuid,
            user: game.user.name,
            isGM: game.user.isGM
          });
        }
      };
      
      // Try immediately, then retry with increasing delays
      findAndHighlightQuest();
      setTimeout(findAndHighlightQuest, 200);
      setTimeout(findAndHighlightQuest, 500);
      setTimeout(findAndHighlightQuest, 1000);
    } else {
      getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | PanelManager not available', {
        user: game.user.name,
        isGM: game.user.isGM
      });
    }
  }

  // Toggle hidden state (middle-click or shift+left-click)
  async _toggleHiddenState() {
    try {
      if (this.pinType === 'quest') {
        // For quest-level pins, toggle quest visibility
        const page = await fromUuid(this.questUuid);
        if (!page) return;
        
        let visible = await page.getFlag(MODULE.ID, 'visible');
        if (typeof visible === 'undefined') visible = true;
        visible = !visible;
        await page.setFlag(MODULE.ID, 'visible', visible);
        
        // Update quest state locally
        this.questState = visible ? 'visible' : 'hidden';
        
        // Update pin appearance to show/hide second ring for GMs
        this._updatePinAppearance();
        
        // Update visibility for players
        this.updateVisibility();
        
        getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Quest visibility toggled', {
          pinId: this.pinId,
          questUuid: this.questUuid,
          newVisibility: visible,
          user: game.user.name
        });
        
      } else {
        // For objective pins, toggle objective hidden state
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
      }
      
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

  async _onPointerOver(event) {
    // Check if the mouse is over any open window before showing tooltip
    if (this._isMouseOverWindow(event)) {
      return; // Don't show tooltip if mouse is over a window
    }

    try {
      let tooltipData;
      let tooltipId;
      
      if (this.pinType === 'quest') {
        // For quest-level pins, use quest tooltip data with pin's actual state
        tooltipData = await getQuestTooltipData(this.questUuid, this.questState);
        tooltipId = 'squire-questpin-quest-tooltip';
        
        // If the tooltip data doesn't have participants but the pin does, use the pin's participants
        if (tooltipData && (!tooltipData.participants || tooltipData.participants.length === 0) && this.participants && this.participants.length > 0) {
          tooltipData.participants = this.participants;
        }
        
        // Debug logging for participants
        if (tooltipData) {
          getBlacksmith()?.utils.postConsoleAndNotification(
            'SQUIRE | QUEST PIN: Tooltip participants data',
            { 
              pinParticipants: this.participants, 
              tooltipParticipants: tooltipData.participants,
              hasPinParticipants: this.participants && this.participants.length > 0,
              hasTooltipParticipants: tooltipData.participants && tooltipData.participants.length > 0
            },
            false,
            true,
            false,
            MODULE.TITLE
          );
        }
        
        if (tooltipData) {
          tooltipData.controls = game.user.isGM ?
            'Left-click: Select & jump to quest | Left double-click: Complete | Middle/Shift+Left: Toggle hidden | Right-click: Fail | Double right-click: Delete | Drag to move' :
            'Left-click: Select & jump to quest';
        }
      } else {
        // For objective pins, use objective tooltip data with pin's actual state
        tooltipData = await getObjectiveTooltipData(this.questUuid, this.objectiveIndex, this.questState, this.objectiveState);
        tooltipId = 'squire-questpin-objective-tooltip';
        if (tooltipData) {
          tooltipData.controls = game.user.isGM ?
            'Left-click: Select & jump to quest | Left double-click: Complete | Middle/Shift+Left: Toggle hidden | Right-click: Fail | Double right-click: Delete | Drag to move' :
            'Left-click: Select & jump to quest';
        }
      }
      
      if (!tooltipData) return;
      
      // Show tooltip with appropriate ID
      showQuestTooltip(tooltipId, tooltipData, event);
    } catch (error) {
      getBlacksmith()?.utils.postConsoleAndNotification(
        'Error showing quest pin tooltip',
        { questUuid: this.questUuid, objectiveIndex: this.objectiveIndex, error: error.message },
        false,
        true,
        false,
        MODULE.TITLE
      );
    }
  }

  /**
   * Check if the mouse position is within any open window's bounds
   * @param {Object} event - The pointer event
   * @returns {boolean} True if mouse is over a window
   */
  _isMouseOverWindow(event) {
    try {
      // Get mouse position from the event
      const mouse = event.data?.originalEvent || event;
      if (!mouse || typeof mouse.clientX !== 'number' || typeof mouse.clientY !== 'number') {
        return false; // Can't determine position, allow tooltip
      }

      const mouseX = mouse.clientX;
      const mouseY = mouse.clientY;

      // Check all open Foundry windows
      const windows = document.querySelectorAll('.app.window-app');
      
      for (const window of windows) {
        if (window.style.display === 'none') continue; // Skip hidden windows
        
        const rect = window.getBoundingClientRect();
        
        // Check if mouse is within this window's bounds
        if (mouseX >= rect.left && mouseX <= rect.right && 
            mouseY >= rect.top && mouseY <= rect.bottom) {
          return true; // Mouse is over this window
        }
      }
      
      return false; // Mouse is not over any window
    } catch (error) {
      // If there's an error checking, default to allowing tooltips
      getBlacksmith()?.utils.postConsoleAndNotification(
        'Error checking mouse position vs windows',
        { error: error.message },
        false,
        true,
        false,
        MODULE.TITLE
      );
      return false;
    }
  }

  _onPointerOut(event) {
    // Always hide the tooltip when leaving the pin area
    if (this.pinType === 'quest') {
      hideQuestTooltip('squire-questpin-quest-tooltip');
    } else {
      hideQuestTooltip('squire-questpin-objective-tooltip');
    }
    
    // Reset cursor when leaving pin area (but only if not dragging)
    if (game.user.isGM && !this.isDragging) {
      document.body.style.cursor = '';
      document.body.style.cursor = 'default';
    }
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
Hooks.on('dropCanvasData', async (canvas, data) => {
    if (data.type !== 'quest-objective' && data.type !== 'quest-quest') return; // Let Foundry handle all other drops!
    
    // Only GMs can create quest pins
    if (!game.user.isGM) return false;
    
    if (data.type === 'quest-objective') {
        // Handle objective-level pins
        const { questUuid, objectiveIndex, objectiveState, questIndex, questCategory, questState } = data;
        
        // Use the objective state from the drag data (default to 'active' if not provided)
        const finalObjectiveState = objectiveState || 'active';
        
        const pin = new QuestPin({ 
            x: data.x, 
            y: data.y, 
            questUuid, 
            objectiveIndex, 
            objectiveState: finalObjectiveState, 
            questIndex, 
            questCategory,
            questState: questState || 'visible'
        });
        
        if (canvas.squirePins) {
            canvas.squirePins.addChild(pin);
            // Save to persistence
            pin._saveToPersistence();
        } else {
            getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | canvas.squirePins is not available', { canvas }, false, true, false, MODULE.TITLE);
        }
        return true;
    } else if (data.type === 'quest-quest') {
        // Handle quest-level pins
        const { questUuid, questIndex, questCategory, questState, questStatus, participants } = data;
        
        // Convert participant UUIDs to participant objects with names
        const processedParticipants = [];
        if (participants && Array.isArray(participants)) {
            for (const participantUuid of participants) {
                try {
                    if (participantUuid && participantUuid.trim()) {
                        // Try to get actor name from UUID
                        const actor = await fromUuid(participantUuid);
                        if (actor && actor.name) {
                            processedParticipants.push({
                                uuid: participantUuid,
                                name: actor.name,
                                img: actor.img || actor.thumbnail || 'icons/svg/mystery-man.svg'
                            });
                        } else {
                            // Fallback: use UUID as name
                            processedParticipants.push({
                                uuid: participantUuid,
                                name: participantUuid,
                                img: 'icons/svg/mystery-man.svg'
                            });
                        }
                    }
                } catch (error) {
                    // If UUID lookup fails, use UUID as name
                    processedParticipants.push({
                        uuid: participantUuid,
                        name: participantUuid,
                        img: 'icons/svg/mystery-man.svg'
                    });
                }
            }
        }
        
        const pin = new QuestPin({ 
            x: data.x, 
            y: data.y, 
            questUuid, 
            objectiveIndex: null, // Indicates quest-level pin
            objectiveState: null, // Not applicable for quest pins
            questIndex, 
            questCategory,
            questState: questState || 'visible',
            questStatus: questStatus || 'Not Started',
            participants: processedParticipants
        });
        
        if (canvas.squirePins) {
            canvas.squirePins.addChild(pin);
            // Save to persistence
            pin._saveToPersistence();
        } else {
            getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | canvas.squirePins is not available', { canvas }, false, true, false, MODULE.TITLE);
        }
        return true;
    }
    
    return false; // Only block further handling for quest pins
});

// Track timeouts for cleanup
const questPinTimeouts = new Set();

// Load persisted pins when canvas is ready (now called from ready hook)
export function loadPersistedPinsOnCanvasReady() {
    getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Canvas ready, loading persisted pins');
    const timeoutId = setTimeout(() => {
        loadPersistedPins();
        questPinTimeouts.delete(timeoutId);
    }, 1500);
    questPinTimeouts.add(timeoutId);
}

// Load persisted pins when scene changes
Hooks.on('canvasSceneChange', (scene) => {
    getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Scene changed, loading persisted pins');
    // Delay loading to ensure scene is fully loaded
    const timeoutId = setTimeout(() => {
        loadPersistedPins();
        questPinTimeouts.delete(timeoutId);
    }, 1000); // Increased delay for scene changes
    questPinTimeouts.add(timeoutId);
});

// Listen for scene flag changes to reload pins when GM creates/moves pins
Hooks.on('updateScene', (scene, changes, options, userId) => {
    if (scene.id === canvas.scene?.id && changes.flags && changes.flags[MODULE.ID]) {
        getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Scene flags changed, reloading pins', {
            sceneId: scene.id,
            user: game.user.name,
            isGM: game.user.isGM
        });
        // Delay loading to ensure the scene update is fully processed
        setTimeout(() => {
            loadPersistedPins();
        }, 500);
    }
});

// Function to load persisted pins for current scene
function loadPersistedPins() {
    try {
        const scene = canvas.scene;
        if (!scene) {
            getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | No scene available');
            return;
        }
        
        if (!canvas.squirePins) {
            getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | squirePins container not available, retrying...');
            // Try again in a moment
            const timeoutId = setTimeout(() => {
                loadPersistedPins();
                questPinTimeouts.delete(timeoutId);
            }, 1000);
            questPinTimeouts.add(timeoutId);
            return;
        }

        // Get pins data from scene flags
        const scenePins = scene.getFlag(MODULE.ID, 'questPins') || [];
        
        getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Loading pins for scene', { sceneId: scene.id, scenePins });

        // Clear existing pins for this scene
        const existingPins = canvas.squirePins.children.filter(child => child instanceof QuestPin);
        existingPins.forEach(pin => {
            canvas.squirePins.removeChild(pin);
        });

        // Load pins from persistence
        scenePins.forEach(async (pinData) => {
            try {
                const pin = new QuestPin({
                    x: pinData.x,
                    y: pinData.y,
                    questUuid: pinData.questUuid,
                    objectiveIndex: pinData.objectiveIndex,
                    objectiveState: pinData.objectiveState,
                    questIndex: (pinData.questIndex !== undefined && pinData.questIndex !== null && pinData.questIndex !== '') ? pinData.questIndex : '??',
                    questCategory: (pinData.questCategory !== undefined && pinData.questCategory !== null && pinData.questCategory !== '') ? pinData.questCategory : '??',
                    questState: pinData.questState || 'visible',
                    questStatus: pinData.questStatus || 'Not Started',
                    participants: pinData.participants || []
                });
                
                // Restore the original pinId for persistence
                pin.pinId = pinData.pinId;
                
                // Update the pin state to match current quest state (all users)
                    try {
                        const questData = pin._getQuestData();
                        if (questData) {
                        // Update quest visibility state
                        const isVisible = await questData.getFlag(MODULE.ID, 'visible');
                        const newQuestState = (isVisible === false) ? 'hidden' : 'visible';
                        pin.questState = newQuestState;
                        
                        // Update pin appearance to show/hide second ring for GMs
                        pin._updatePinAppearance();
                        
                        // Update visibility
                        pin.updateVisibility();
                        
                        // Update objective state (GM only)
                        if (game.user.isGM) {
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
                        }
                    } catch (error) {
                        getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error updating pin state on load', { error, pinData });
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

        getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Successfully loaded', scenePins.length, 'pins for scene', scene.id);
        
        // Clean up orphaned pins (pins that reference non-existent quests)
        if (game.user.isGM) {
            const timeoutId = setTimeout(async () => {
                await cleanupOrphanedPins();
                questPinTimeouts.delete(timeoutId);
            }, 1000);
            questPinTimeouts.add(timeoutId);
        }
    } catch (error) {
        getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error loading persisted pins', { error });
    }
}

// Function to clean up orphaned pins (pins that reference non-existent quests)
async function cleanupOrphanedPins() {
    try {
        const scene = canvas.scene;
        if (!scene) return;
        
        const scenePins = scene.getFlag(MODULE.ID, 'questPins') || [];
        const validPins = [];
        let orphanedCount = 0;
        
        for (const pinData of scenePins) {
            try {
                // Try to find the quest
                const questData = await fromUuid(pinData.questUuid);
                if (questData) {
                    validPins.push(pinData);
                } else {
                    orphanedCount++;
                    getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Found orphaned pin', { 
                        pinId: pinData.pinId, 
                        questUuid: pinData.questUuid 
                    });
                }
            } catch (error) {
                orphanedCount++;
                getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Found orphaned pin (error)', { 
                    pinId: pinData.pinId, 
                    questUuid: pinData.questUuid,
                    error 
                });
            }
        }
        
        // If we found orphaned pins, update the scene flags
        if (orphanedCount > 0) {
            await scene.setFlag(MODULE.ID, 'questPins', validPins);
            getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Cleaned up orphaned pins', { 
                orphanedCount, 
                remainingPins: validPins.length 
            });
        }
    } catch (error) {
        getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error cleaning up orphaned pins', { error });
    }
}

// Cleanup function for quest pins
function cleanupQuestPins() {
    // Clear all tracked timeouts
    questPinTimeouts.forEach(timeoutId => {
        clearTimeout(timeoutId);
    });
    questPinTimeouts.clear();

    // Clear existing pins and their timeouts
    if (canvas.squirePins) {
        const existingPins = canvas.squirePins.children.filter(child => child instanceof QuestPin);
        existingPins.forEach(pin => {
            // Clear any pending click timeouts
            if (pin._clickTimeout) {
                clearTimeout(pin._clickTimeout);
                pin._clickTimeout = null;
            }
            // Clear any pending right-click timeouts
            if (pin._rightClickTimeout) {
                clearTimeout(pin._rightClickTimeout);
                pin._rightClickTimeout = null;
            }
            // Clear any pending click timeouts
            if (pin._clickTimeout) {
                clearTimeout(pin._clickTimeout);
                pin._clickTimeout = null;
            }
            // Remove global event listeners
            if (pin._onGlobalDragMove) {
                document.removeEventListener('pointermove', pin._onGlobalDragMove);
            }
            if (pin._onGlobalDragEnd) {
                document.removeEventListener('pointerup', pin._onGlobalDragEnd);
            }
            canvas.squirePins.removeChild(pin);
        });
    }

    // Always reset cursor to default
    document.body.style.cursor = '';
    document.body.style.cursor = 'default';

    getBlacksmith()?.utils.postConsoleAndNotification('QuestPin cleanup completed', {}, false, false, false, MODULE.TITLE);
}

// Cleanup hooks for quest pins
// Only clean up when the game is actually closing, not when module is disabled
Hooks.on('closeGame', () => {
    cleanupQuestPins();
});

// Update pin visibility when tokens move or vision changes
Hooks.on('updateToken', (token, changes) => {
    if (changes.x !== undefined || changes.y !== undefined || changes.vision !== undefined) {
        debouncedUpdateAllPinVisibility();
    }
});

Hooks.on('createToken', (token) => {
    debouncedUpdateAllPinVisibility();
});

Hooks.on('deleteToken', (token) => {
    debouncedUpdateAllPinVisibility();
});

// Update pin visibility when quest state changes
Hooks.on('updateJournalEntryPage', (page, changes) => {
    if (changes.flags && changes.flags[MODULE.ID]) {
        debouncedUpdateAllPinVisibility();
    }
});

// Update pin visibility when quest panel is refreshed
Hooks.on('renderQuestPanel', () => {
    debouncedUpdateAllPinVisibility();
});

// Debounce for updateAllPinVisibility
let questPinVisibilityDebounce = null;

function debouncedUpdateAllPinVisibility() {
  if (questPinVisibilityDebounce) clearTimeout(questPinVisibilityDebounce);
  questPinVisibilityDebounce = setTimeout(() => {
    // Only run if the global vision polygon exists
    if (canvas.visibility?.los) {
      updateAllPinVisibility();
    }
    questPinVisibilityDebounce = null;
  }, 50);
}

/**
 * Update visibility for all quest pins
 */
async function updateAllPinVisibility() {
    if (!canvas.squirePins) return;
    
    const pins = canvas.squirePins.children.filter(child => child instanceof QuestPin);
    
    for (const pin of pins) {
        try {
            // Update quest state from journal if available
            const questData = pin._getQuestData();
            if (questData) {
                const isVisible = await questData.getFlag(MODULE.ID, 'visible');
                const newQuestState = (isVisible === false) ? 'hidden' : 'visible';
                
                // Only update if the state actually changed
                if (pin.questState !== newQuestState) {
                    pin.questState = newQuestState;
                    // Update pin appearance to show/hide second ring for GMs
                    pin._updatePinAppearance();
                }
            }
            
            pin.updateVisibility();
        } catch (error) {
            getBlacksmith()?.utils.postConsoleAndNotification('QuestPin | Error updating pin visibility', { error, pinId: pin.pinId }, false, true, true, MODULE.TITLE);
        }
    }
}

// Update pin visibility when vision polygons are refreshed
Hooks.on('sightRefresh', () => {
  debouncedUpdateAllPinVisibility();
}); 