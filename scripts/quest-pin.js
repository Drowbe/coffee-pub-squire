import { MODULE, SQUIRE } from './const.js';
import { showQuestTooltip, hideQuestTooltip, getTaskText, getObjectiveTooltipData, getQuestTooltipData, getTextEditor } from './helpers.js';
import { QuestParser } from './utility-quest-parser.js';
import { trackModuleTimeout, clearTrackedTimeout } from './timer-utils.js';
// HookManager import removed - using Blacksmith HookManager instead

// Helper function to safely get Blacksmith API
function getBlacksmith() {
  return game.modules.get('coffee-pub-blacksmith')?.api;
}

// === Configurable Pin Appearance ===
// Cache for loaded pin config
let PIN_CONFIG_CACHE = null;

/**
 * Load pin configuration from JSON file
 * @returns {Promise<Object>} The pin configuration object
 */
async function loadPinConfig() {
  if (PIN_CONFIG_CACHE) {
    return PIN_CONFIG_CACHE;
  }
  
  try {
    const response = await fetch(`modules/${MODULE.ID}/themes/quest-pins.json`);
    if (!response.ok) {
      throw new Error(`Failed to load quest-pins.json: ${response.status} ${response.statusText}`);
    }
    const config = await response.json();
    
    // JSON.parse will convert "\\uf024" to "\uf024" (literal backslash + u + hex)
    // We need to convert this to the actual unicode character
    const convertUnicode = (str) => {
      if (typeof str !== 'string') return str;
      // Match \uf024 pattern (backslash + u + 4 hex digits) and convert to unicode character
      return str.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
      });
    };
    
    if (config.icons?.quest?.main) {
      config.icons.quest.main = convertUnicode(config.icons.quest.main);
    }
    if (config.icons?.quest?.side) {
      config.icons.quest.side = convertUnicode(config.icons.quest.side);
    }
    if (config.icons?.status) {
      Object.keys(config.icons.status).forEach(key => {
        if (config.icons.status[key]) {
          config.icons.status[key] = convertUnicode(config.icons.status[key]);
        }
      });
    }
    
    PIN_CONFIG_CACHE = config;
    return config;
  } catch (error) {
    console.error('Coffee Pub Squire | Error loading quest-pins.json, using fallback config:', error);
    // Return a minimal fallback config
    return {
      inner: { width: 80, height: 80, borderRadius: 4, color: 0, alpha: 0.4, dropShadow: { color: 0, alpha: 0.3, blur: 8, distance: 0 }, dropShadowOffset: 0 },
      outer: { ringWidth: 2, outerRingWidth: 4, gap: 0, color: 16777215, alpha: 0.8, outerAlpha: 0.8, lineStyle: { alignment: 0.5, native: false } },
      font: { family: 'Signika', size: 32, color: 16777215, faFamily: 'Font Awesome 6 Pro', faSize: 30, faColor: 16777215, numberPadding: 10 },
      label: { fontSize: 16, fontWeight: 'bold', align: 'center', anchor: 0.5, alpha: 0.9 },
      title: { fontSize: 30, color: 16777215, weight: 'normal', stroke: 0, strokeThickness: 3, align: 'center', offset: 50, maxWidth: 200, wordWrap: true, dropShadow: { color: 0, alpha: 0.8, blur: 4, distance: 2, quality: 3 }, anchor: { top: [0.5, 0], bottom: [0.5, 1] } },
      icons: { quest: { main: '\uf024', side: '\uf277' }, status: { active: '', completed: '\uf00c', failed: '\uf00d', hidden: '\uf06e' }, settings: { transparency: 0.9, verticalOffset: 8, anchor: 0.5 } },
      separator: { color: 16777215, thickness: 3, style: 'solid' },
      mouseover: { ringColor: 16755072 },
      quest: { shape: 'circle', iconSize: { main: { multiplier: 0.5, offset: 0 }, side: { multiplier: 0.5, offset: 4 } }, labelOffsets: { main: 24, side: 28 }, colors: { ring: { hidden: 0, inProgress: 16777215, notStarted: 2293759, failed: 13893658, completed: 3963461 }, icon: { hidden: 16777215, inProgress: 16777215, notStarted: 16777215, failed: 16777215, completed: 16777215 } }, secondRing: { color: 0 } },
      objective: { shape: 'roundedRect', iconSize: { multiplier: 0.666, offset: -2 }, labelOffset: 28, colors: { ring: { failed: 13893658, hidden: 11184858, completed: 3963461, default: 16777215 }, icon: { failed: 16777215, hidden: 16777215, completed: 16777215, default: 16777215 } }, secondRing: { color: 0 } }
    };
  }
}

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
    
    // Load and merge config - use cached config if available, otherwise load it
    // Note: This is async, but we'll handle it in fetchNames() promise chain
    this._configPromise = loadPinConfig().then(loadedConfig => {
      this.config = foundry.utils.mergeObject(
        foundry.utils.deepClone(loadedConfig),
        config || {},
        { inplace: false, insertKeys: true, insertValues: true }
      );
      return this.config;
    });
  


    // Fetch names from journal entry and ensure config is loaded
    Promise.all([this._configPromise, this.fetchNames()]).then(() => {
      // Draw the pin after config and names are loaded
      this._updatePinAppearance();
    });
    
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

    this.on('removed', () => this._forceEndDrag());
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
   * Fetch quest and objective names from journal entry
   */
  async fetchNames() {
    try {
      // Find the journal page by UUID (same approach as tooltip functions)
      let page = null;
      for (const journal of game.journal.contents) {
        page = journal.pages.find(p => p.uuid === this.questUuid);
        if (page) break;
      }
      
      if (page) {
        // Enrich the page HTML if needed (same as tooltip functions)
        const TextEditor = getTextEditor();
        const enrichedHtml = await TextEditor.enrichHTML(page.text.content, { async: true });
        // Parse the quest entry using the same method as tooltip functions
        const entry = await QuestParser.parseSinglePage(page, enrichedHtml);
        
        if (entry) {
          // Always use the quest name for both quests and objectives
          this.questName = entry.name || 'Unknown Quest';
          
          if (this.pinType === 'objective' && entry.tasks && entry.tasks[this.objectiveIndex]) {
            // For objectives, get the objective text (not name)
            this.objectiveName = entry.tasks[this.objectiveIndex].text || `Objective ${this.objectiveIndex + 1}`;
          } else if (this.pinType === 'objective') {
            this.objectiveName = `Objective ${this.objectiveIndex + 1}`;
          }
          

        }
      }
    } catch (error) {
      console.error('QuestPin | Error fetching names:', { error, questUuid: this.questUuid });
      // Set fallback names
      this.questName = 'Unknown Quest';
      if (this.pinType === 'objective') {
        this.objectiveName = `Objective ${this.objectiveIndex + 1}`;
      }
    }
  }

  /**
   * Check if this pin should be visible to the current user
   * @returns {boolean} True if pin should be visible
   */
  shouldBeVisible() {
    // Check if user has hidden all quest pins (applies to both GMs and players)
    if (game.user.getFlag(MODULE.ID, 'hideQuestPins')) {
      return false;
    }

    // GMs can see hidden quests/objectives, but still respect the hideQuestPins flag
    if (game.user.isGM) {
      // For GMs, only check the hideQuestPins flag - they can see everything else
      return true;
    }

    // For players, check quest and objective visibility
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
      // Pin should be hidden - hide it completely for all users
      this.visible = false;
      this.alpha = 0.0;
    }
  }

  // Method to update pin appearance based on objective state
  _updatePinAppearance() {
    // Remove previous children
    this.removeChildren();

    // Ensure config is loaded (should be, but safety check)
    if (!this.config) {
      console.warn('Coffee Pub Squire | Pin config not loaded yet, skipping appearance update');
      return;
    }

    // === PIN APPEARANCE VARIABLES (from config with game setting overrides) ===
    // Scale Factor - applies to all pin dimensions
    const pinScale = game.settings.get(MODULE.ID, 'questPinScale') || 1.0;
    
    // General - from config.font
    const pinFontFamily = this.config.font?.family || "Signika";
    const pinIconFamily = this.config.font?.faFamily || "Font Awesome 6 Pro";
    const pinIconTransparency = this.config.icons?.settings?.transparency || 0.9;
    const pinDataPadding = (this.config.font?.numberPadding || 10) * pinScale;
    const pinIconSizeMainQuestAdjustment = this.config.quest?.iconSize?.main?.offset || 0;
    const pinIconSizeSideQuestAdjustment = this.config.quest?.iconSize?.side?.offset || 4;

    // Pin Title Text - from config.title with game setting overrides
    const pinTitleFontSize = (game.settings.get(MODULE.ID, 'questPinTitleSize') || this.config.title?.fontSize || 30) * pinScale;
    const pinTitleFontColor = this.config.title?.color || 0xFFFFFF;
    const pinTitleFontWeight = this.config.title?.weight || 'normal';
    const pinTitleFontStroke = this.config.title?.stroke || 0x000000;
    const pinTitleFontStrokeThickness = (this.config.title?.strokeThickness || 3) * pinScale;
    const pinTitleFontAlign = this.config.title?.align || 'center';
    const pinTitleOffset = game.settings.get(MODULE.ID, 'questPinTitleOffset') || this.config.title?.offset || 50;
    const pinTitleMaxWidth = (game.settings.get(MODULE.ID, 'questPinTitleMaxWidth') || this.config.title?.maxWidth || 200) * pinScale;
    const titleDropShadowConfig = this.config.title?.dropShadow || { color: 0x000000, alpha: 0.8, blur: 4, distance: 2, quality: 3 };
    const pinTitleDropShadow = { 
      color: titleDropShadowConfig.color || 0x000000, 
      alpha: titleDropShadowConfig.alpha || 0.8, 
      blur: (titleDropShadowConfig.blur || 4) * pinScale, 
      distance: (titleDropShadowConfig.distance || 2) * pinScale, 
      quality: titleDropShadowConfig.quality || 3 
    };

    // Main Pin - from config.inner
    const pinInnerWidth = (this.config.inner?.width || 80) * pinScale;
    const pinInnerHeight = (this.config.inner?.height || 80) * pinScale; 
    const pinInnerBorderRadius = (this.config.inner?.borderRadius || 4) * pinScale;
    const pinInnerColor = this.config.inner?.color || 0x000000;
    const pinInnerTransparency = this.config.inner?.alpha || 0.4;
    const dropShadowConfig = this.config.inner?.dropShadow || { color: 0x000000, alpha: 0.3, blur: 8, distance: 0 };
    const pinDropShadowColor = { 
      color: dropShadowConfig.color || 0x000000, 
      alpha: dropShadowConfig.alpha || 0.3 
    };
    const pinDropShadowOffset = this.config.inner?.dropShadowOffset || 0;

    // Pin Ring - from config.outer
    const pinRingInnerThickness = (this.config.outer?.ringWidth || 2) * pinScale;
    const pinRingOutterThickness = (this.config.outer?.outerRingWidth || 4) * pinScale;
    const pinRingGap = (this.config.outer?.gap || 0) * pinScale;
    let pinRingColor = this.config.outer?.color || 0xFFFFFF; // Base color, overridden by state
    const pinRingInnerTransparency = this.config.outer?.alpha || 0.8;
    const pinRingOutterTransparency = this.config.outer?.outerAlpha || 0.8;

    // OBJECTIVE Ring State Colors - from config.objective.colors.ring
    const pinRingColorObjectiveFailed = this.config.objective?.colors?.ring?.failed || 0xD41A1A;
    const pinRingColorOjectiveHidden = this.config.objective?.colors?.ring?.hidden || 0xAAA79A;
    const pinRingColorObjectiveCompleted = this.config.objective?.colors?.ring?.completed || 0x3C9245;
    const pinRingColorObjectiveDefault = this.config.objective?.colors?.ring?.default || 0xFFFFFF;

    // OBJECTIVE Icon State Colors - from config.objective.colors.icon
    const pinIconColorObjectiveFailed = this.config.objective?.colors?.icon?.failed || 0xFFFFFF;
    const pinIconColorOjectiveHidden = this.config.objective?.colors?.icon?.hidden || 0xFFFFFF;
    const pinIconColorObectiveCompleted = this.config.objective?.colors?.icon?.completed || 0xFFFFFF;
    const pinIconColorObjectiveDefault = this.config.objective?.colors?.icon?.default || 0xFFFFFF;

    // QUEST Ring State Colors - from config.quest.colors.ring
    const pinRingColorQuestHidden = this.config.quest?.colors?.ring?.hidden || 0x000000;
    const pinRingColorQuestInProgress = this.config.quest?.colors?.ring?.inProgress || 0xFFFFFF;
    const pinRingColorQuestNotStarted = this.config.quest?.colors?.ring?.notStarted || 0x3779FF;
    const pinRingColorQuestFailed = this.config.quest?.colors?.ring?.failed || 0xD41A1A;
    const pinRingColorQuestCompleted = this.config.quest?.colors?.ring?.completed || 0x3C9245;
    
    // QUEST Icon State Colors - from config.quest.colors.icon
    const pinIconColorQuestHidden = this.config.quest?.colors?.icon?.hidden || 0xFFFFFF;
    const pinIconColorInProgress = this.config.quest?.colors?.icon?.inProgress || 0xFFFFFF;
    const pinIconColorNotStarted = this.config.quest?.colors?.icon?.notStarted || 0xFFFFFF;
    const pinIconColorQuestFailed = this.config.quest?.colors?.icon?.failed || 0xFFFFFF;
    const pinIconColorQuestCompleted = this.config.quest?.colors?.icon?.completed || 0xFFFFFF;
    
    // MAIN QUEST Icon - from config.icons.quest.main and config.quest.iconSize.main
    const pinIconMainQuestStyle = this.config.icons?.quest?.main || "\uf024";
    const mainQuestMultiplier = this.config.quest?.iconSize?.main?.multiplier || 0.5;
    const pinIconMainQuestSize = (pinInnerHeight * mainQuestMultiplier) + pinIconSizeMainQuestAdjustment;
    const labelMainQuestVerticleOffset = (this.config.quest?.labelOffsets?.main || 24) * pinScale;
    
    // SIDE QUEST Icon - from config.icons.quest.side and config.quest.iconSize.side
    const pinIconSideQuestStyle = this.config.icons?.quest?.side || "\uf277";
    const sideQuestMultiplier = this.config.quest?.iconSize?.side?.multiplier || 0.5;
    const pinIconSideQuestSize = (pinInnerHeight * sideQuestMultiplier) + pinIconSizeSideQuestAdjustment;
    const labelSideQuestVerticleOffset = (this.config.quest?.labelOffsets?.side || 28) * pinScale;
    
    // Icon positioning offset - from config.icons.settings.verticalOffset
    const pinIconVerticalOffset = (this.config.icons?.settings?.verticalOffset || 8) * pinScale;

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

    // === Contact Shadow ===
    // Add shadow shape FIRST (so it renders behind everything)
    const shadow = new PIXI.Graphics();
    shadow.beginFill(pinDropShadowColor.color, pinDropShadowColor.alpha);
    
    if (this.pinType === 'quest') {
      // Quest pin contact shadow - overall size + offset
      const shadowRadius = pinInnerHeight/2 + pinRingGap + pinRingInnerThickness/2 + pinDropShadowOffset;
      shadow.drawCircle(0, 0, shadowRadius);
    } else {
      // Objective pin contact shadow - overall size + offset
      const shadowW = pinInnerWidth + 2 * (pinRingGap + pinRingInnerThickness/2 + pinDropShadowOffset);
      const shadowH = pinInnerHeight + 2 * (pinRingGap + pinRingInnerThickness/2 + pinDropShadowOffset);
      shadow.drawRoundedRect(-shadowW/2, -shadowH/2, shadowW, shadowH, pinInnerBorderRadius + pinRingGap + pinRingInnerThickness/2 + pinDropShadowOffset);
    }
    
    shadow.endFill();
    this.addChild(shadow); // Add FIRST so it's behind everything
    
    // === Outer ring ===
    if (this.pinType === 'quest') {
      // For quest pins, draw circular rings
      const outerRadius = pinInnerHeight/2 + pinRingGap + pinRingInnerThickness/2;
      const outer = new PIXI.Graphics();
      
             // Draw the main ring
       const questLineStyle = this.config.outer?.lineStyle || { alignment: 0.5, native: false };
       outer.lineStyle({
         width: pinRingInnerThickness,
         color: pinRingColor,
         alpha: pinRingInnerTransparency,
         alignment: questLineStyle.alignment || 0.5,
         native: questLineStyle.native !== undefined ? questLineStyle.native : false
       });
       outer.drawCircle(0, 0, outerRadius);
       
       // Store all ring parameters for redrawing on mouseover
       outer._ringParams = {
         width: pinRingInnerThickness,
         alpha: pinRingInnerTransparency,
         originalColor: pinRingColor,
         radius: outerRadius,
         pinType: 'quest'
       };
       
       this.addChild(outer);
      
             // Add second ring for hidden quests (GM only)
       if (this.questState === 'hidden' && game.user.isGM) {
         const secondRingRadius = outerRadius + pinRingInnerThickness/2 + pinRingGap + pinRingOutterThickness/2;
         const secondRing = new PIXI.Graphics();
         
        const questSecondRingLineStyle = this.config.outer?.lineStyle || { alignment: 0.5, native: false };
        secondRing.lineStyle({
          width: pinRingOutterThickness,
          color: this.config.quest?.secondRing?.color || pinRingColorQuestHidden,
          alpha: pinRingOutterTransparency,
          alignment: questSecondRingLineStyle.alignment || 0.5,
          native: questSecondRingLineStyle.native !== undefined ? questSecondRingLineStyle.native : false
        });
        secondRing.drawCircle(0, 0, secondRingRadius);
        this.addChild(secondRing);
      }
         } else {
       // For objective pins, keep rectangular rings
       const outerW = pinInnerWidth + 2 * (pinRingGap + pinRingInnerThickness/2);
       const outerH = pinInnerHeight + 2 * (pinRingGap + pinRingInnerThickness/2);
       const outer = new PIXI.Graphics();
      
             // Draw the main ring
       const objectiveLineStyle = this.config.outer?.lineStyle || { alignment: 0.5, native: false };
       outer.lineStyle({
         width: pinRingInnerThickness,
         color: pinRingColor,
         alpha: pinRingInnerTransparency,
         alignment: objectiveLineStyle.alignment || 0.5,
         native: objectiveLineStyle.native !== undefined ? objectiveLineStyle.native : false
       });
       outer.drawRoundedRect(-outerW/2, -outerH/2, outerW, outerH, pinInnerBorderRadius + pinRingInnerThickness + pinRingGap);
       
       // Store all ring parameters for redrawing on mouseover
       outer._ringParams = {
         width: pinRingInnerThickness,
         alpha: pinRingInnerTransparency,
         originalColor: pinRingColor,
         rectW: outerW,
         rectH: outerH,
         borderRadius: pinInnerBorderRadius + pinRingInnerThickness + pinRingGap,
         pinType: 'objective'
       };
       
       this.addChild(outer);
      
             // Add second ring for hidden quests (GM only) - same logic as quest pins
       if (this.questState === 'hidden' && game.user.isGM) {
         const secondRingW = outerW + 2 * (pinRingGap + pinRingInnerThickness/2 + pinRingOutterThickness/2);
         const secondRingH = outerH + 2 * (pinRingGap + pinRingInnerThickness/2 + pinRingOutterThickness/2);
         const secondRing = new PIXI.Graphics();
        
        const objectiveSecondRingLineStyle = this.config.outer?.lineStyle || { alignment: 0.5, native: false };
        secondRing.lineStyle({
          width: pinRingOutterThickness,
          color: this.config.objective?.secondRing?.color || pinRingColorQuestHidden,
          alpha: pinRingOutterTransparency,
          alignment: objectiveSecondRingLineStyle.alignment || 0.5,
          native: objectiveSecondRingLineStyle.native !== undefined ? objectiveSecondRingLineStyle.native : false
        });
                 secondRing.drawRoundedRect(-secondRingW/2, -secondRingH/2, secondRingW, secondRingH, pinInnerBorderRadius + pinRingGap + pinRingInnerThickness + pinRingOutterThickness/2);
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
    // TODO: PIXI.filters.DropShadowFilter not available in Foundry's default PIXI build
    // Need to find alternative way to make inner pin stand out
    // inner.filters = [
    //   new PIXI.filters.DropShadowFilter(pinInnerDropShadow)
    // ];
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
        fill: questIconColor,
        fontWeight: this.config.icons?.settings?.fontWeight || '900' // Solid icons require font-weight 900
      });
      questIcon.alpha = pinIconTransparency; 
      questIcon.anchor.set(this.config.icons?.settings?.anchor || 0.5);
      questIcon.position.set(centerX, centerY - pinIconVerticalOffset); // Icon above center, same as objectives
      this.addChild(questIcon);
      
      // Quest number below (just the quest number, no objective)
      const questIndexValue = (this.questIndex !== undefined && this.questIndex !== null && this.questIndex !== '')
        ? String(this.questIndex)
        : '??';
      
      // Add Q prefix for consistency with objective pins
      const questText = `Q${questIndexValue}`;
      const questLabel = new PIXI.Text(questText, {
        fontFamily: pinFontFamily,
        fontSize: 16 * pinScale,
        fill: questIconColor, 
        fontWeight: 'bold',
        align: 'center'
      });
      questLabel.alpha = pinIconTransparency;
      questLabel.anchor.set(0.5);
      questLabel.position.set(centerX, centerY + labelMainQuestVerticleOffset); // Centered below icon
      
      // Always add the quest number label (Q85)
      this.addChild(questLabel);
      
      // Quest title text below the quest number (only if setting allows it)
      if (game.settings.get(MODULE.ID, 'showQuestPinText')) {
        const questTitle = new PIXI.Text(this.questName || 'Unknown Quest', {
          fontFamily: pinFontFamily,
          fontSize: pinTitleFontSize,
          fill: pinTitleFontColor,
          fontWeight: pinTitleFontWeight,
          align: pinTitleFontAlign,
          stroke: pinTitleFontStroke,
          strokeThickness: pinTitleFontStrokeThickness,
          wordWrap: this.config.title?.wordWrap !== undefined ? this.config.title.wordWrap : true,
          wordWrapWidth: pinTitleMaxWidth
        });
        
        // Position text based on offset direction - from config.title.anchor
        const anchorConfig = this.config.title?.anchor || { top: [0.5, 0], bottom: [0.5, 1] };
        if (pinTitleOffset >= 0) {
          // Text below pin: position so TOP of text is at offset distance
          questTitle.anchor.set(anchorConfig.top[0], anchorConfig.top[1]);
          questTitle.position.set(centerX, centerY + pinTitleOffset);
        } else {
          // Text above pin: position so BOTTOM of text is at offset distance
          questTitle.anchor.set(anchorConfig.bottom[0], anchorConfig.bottom[1]);
          questTitle.position.set(centerX, centerY + pinTitleOffset);
        }
        
        // Add drop shadow to quest title for better readability
        questTitle.dropShadow = pinTitleDropShadow;
        
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
        fill: questIconColor,
        fontWeight: this.config.icons?.settings?.fontWeight || '900' // Solid icons require font-weight 900
      });
      questIcon.alpha = pinIconTransparency; 
      questIcon.anchor.set(0.5);
      questIcon.position.set(centerX, centerY - pinIconVerticalOffset); // Icon above center
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
                fontSize: 16 * pinScale,
                fill: questIconColor,
                fontWeight: 'bold',
                align: 'center'
              });
              combinedLabel.alpha = pinIconTransparency;
              combinedLabel.anchor.set(0.5);
              combinedLabel.position.set(centerX, centerY + labelSideQuestVerticleOffset); // Centered below icon
              
              // Always add the combined label (Q85.03)
              this.addChild(combinedLabel);
              
              // Objective title text below the combined label (only if setting allows it)
              if (game.settings.get(MODULE.ID, 'showQuestPinText')) {
                const objectiveTitle = new PIXI.Text(this.objectiveName || `Objective ${this.objectiveIndex + 1}`, {
                  fontFamily: pinFontFamily,
                  fontSize: pinTitleFontSize,
                  fill: pinTitleFontColor,
                  fontWeight: pinTitleFontWeight,
                  align: pinTitleFontAlign,
                  stroke: pinTitleFontStroke,
                  strokeThickness: pinTitleFontStrokeThickness,
                  wordWrap: true,
                  wordWrapWidth: pinTitleMaxWidth
                });
                // Position text based on offset direction:
                // Positive offset: distance from pin center to TOP of text box
                // Negative offset: distance from pin center to BOTTOM of text box
                if (pinTitleOffset >= 0) {
                  // Text below pin: position so TOP of text is at offset distance
                  objectiveTitle.anchor.set(0.5, 0); // Anchor at top center
                  objectiveTitle.position.set(centerX, centerY + pinTitleOffset);
                } else {
                  // Text above pin: position so BOTTOM of text is at offset distance
                  objectiveTitle.anchor.set(0.5, 1); // Anchor at bottom center
                  objectiveTitle.position.set(centerX, centerY + pinTitleOffset);
                }
                
                // Add drop shadow to objective title for better readability
                objectiveTitle.dropShadow = {
                  color: 0x000000,
                  alpha: 0.8,
                  blur: 4 * pinScale,
                  distance: 2 * pinScale,
                  quality: 3
                };
                
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
    playerText.dropShadow = {
      color: 0x000000,
      alpha: 0.8,
      blur: 2,
      distance: 1
    };
    
    container.addChild(playerText);
  }

  // Update pin appearance based on new objective state
  updateObjectiveState(newState) {
    const oldState = this.objectiveState;
    this.objectiveState = newState;
    

    
    // Update pin appearance using method
    this._updatePinAppearance();
    
    // Save to persistence
    this._saveToPersistence();
  }

  // Update pin appearance based on new quest status (for quest-level pins)
  updateQuestStatus(newStatus) {
    if (this.pinType !== 'quest') {
      return;
    }
    
    const oldStatus = this.questStatus;
    this.questStatus = newStatus;
    

    
    // Update pin appearance using method
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
      console.error('QuestPin | Error saving quest pin:', error);
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
      console.error('QuestPin | Error removing quest pin:', error);
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
    if (!this._boundGlobalDragMove) {
      this._boundGlobalDragMove = this._onGlobalDragMove.bind(this);
    }
    if (!this._boundGlobalDragEnd) {
      this._boundGlobalDragEnd = this._onGlobalDragEnd.bind(this);
    }
    document.addEventListener('pointermove', this._boundGlobalDragMove, { passive: false });
    document.addEventListener('pointerup', this._boundGlobalDragEnd, { passive: false });

    hideQuestTooltip('quest-tooltip');
    hideQuestTooltip('quest-pin-tooltip');
    hideQuestTooltip('squire-handle-objective-tooltip');
    hideQuestTooltip('squire-questpin-quest-tooltip');
    hideQuestTooltip('squire-questpin-objective-tooltip');
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

  // Drag end logic
  _endDrag() {
    // Check if we actually dragged before cleaning up
    const wasDragging = this.isDragging;
    
    this._forceEndDrag();
    
    // Only save if we actually dragged
    if (wasDragging) {
      this._saveToPersistence();
    }
  }

  _forceEndDrag() {
    this.isDragging = false;
    this.dragData = null;
    this._dragStartPosition = null;
    this._dragStartTime = null;
    this._hasStartedDrag = false;
    this.alpha = 1.0;

    this.off('pointermove', this._onDragMove, this);
    this.off('pointerup', this._onDragEnd, this);
    this.off('pointerupoutside', this._onDragEnd, this);

    if (this._boundGlobalDragMove) {
      document.removeEventListener('pointermove', this._boundGlobalDragMove);
      this._boundGlobalDragMove = null;
    }
    if (this._boundGlobalDragEnd) {
      document.removeEventListener('pointerup', this._boundGlobalDragEnd);
      this._boundGlobalDragEnd = null;
    }

    document.body.style.cursor = '';
    document.body.style.cursor = 'default';

    hideQuestTooltip('quest-tooltip');
    hideQuestTooltip('quest-pin-tooltip');
    hideQuestTooltip('squire-handle-objective-tooltip');
    hideQuestTooltip('squire-questpin-quest-tooltip');
    hideQuestTooltip('squire-questpin-objective-tooltip');
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
        clearTrackedTimeout(this._clickTimeout);
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
          this._clickTimeout = trackModuleTimeout(() => {
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
          this._toggleHiddenState();
        }
      }
    }
  }

  _onRightDown(event) {
    if (!game.user.isGM) return; // Only GM can interact with right-click
    

    
    // Check for double right-click (500ms window)
    if (this._lastRightClickTime && (Date.now() - this._lastRightClickTime) < 500) {
      // Double right-click: remove pin only
      this._lastRightClickTime = null;
      // Clear any pending timeout
      if (this._rightClickTimeout) {
        clearTrackedTimeout(this._rightClickTimeout);
        this._rightClickTimeout = null;
      }
      this._removePin();
    } else {
      const clickTime = Date.now();
      this._lastRightClickTime = clickTime;
      
      // Single right-click: toggle visibility for quest pins, fail objective for objective pins
      this._rightClickTimeout = trackModuleTimeout(async () => {
        // Only execute if this is still the most recent right-click
        if (this._lastRightClickTime === clickTime) {
          
          if (this.pinType === 'quest') {
            // For quest pins, toggle visibility
            await this._toggleHiddenState();
          } else {
            // For objective pins, fail objective
            await this._failObjective();
          }
        } else {
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
    trackModuleTimeout(() => {
      this.alpha = 1.0;
    }, 200);
    

    
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
        

        
        if (questEntry) {
          // First, expand the parent section if it's collapsed
          const parentSection = questEntry.closest('.quest-section');
          if (parentSection && parentSection.classList.contains('collapsed')) {
            parentSection.classList.remove('collapsed');
            
            // Update the user's collapsed state preference
            const status = parentSection.dataset.status;
            if (status) {
              const collapsedCategories = game.user.getFlag(MODULE.ID, 'questCollapsedCategories') || {};
              collapsedCategories[status] = false;
              game.user.setFlag(MODULE.ID, 'questCollapsedCategories', collapsedCategories);
            }
          }
          
          // Expand the quest entry
          questEntry.classList.remove('collapsed');
          
          // Scroll to the quest entry
          questEntry.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          if (this.pinType === 'quest') {
            // For quest-level pins, highlight the entire quest entry
            questEntry.classList.add('quest-highlighted');
            trackModuleTimeout(() => {
              questEntry.classList.remove('quest-highlighted');
            }, 2000);
            

          } else {
            // For objective pins, highlight the specific objective
            const objectiveItems = questEntry.querySelectorAll('li[data-task-index]');
            const targetObjective = objectiveItems[this.objectiveIndex];
            

            
            if (targetObjective) {
              targetObjective.classList.add('objective-highlighted');
              trackModuleTimeout(() => {
                targetObjective.classList.remove('objective-highlighted');
              }, 2000);
            }
          }
        } else {
        }
      };
      
      // Try immediately, then retry with increasing delays
      findAndHighlightQuest();
      trackModuleTimeout(findAndHighlightQuest, 200);
      trackModuleTimeout(findAndHighlightQuest, 500);
      trackModuleTimeout(findAndHighlightQuest, 1000);
    } else {
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
      console.error('QuestPin | Error toggling hidden state:', error);
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
      console.error('QuestPin | Error completing objective:', error);
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
      console.error('QuestPin | Error failing objective:', error);
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
      console.error('QuestPin | Error getting quest data:', error);
      return null;
    }
  }

     async _onPointerOver(event) {
     // Check if the mouse is over any open window before showing tooltip
     if (this._isMouseOverWindow(event)) {
       return; // Don't show tooltip if mouse is over a window
     }

     // Change ring color on mouseover - redraw with new color
     const pinMouseoverRingColor = this.config?.mouseover?.ringColor || 0xFF5500;
     const outerRing = this.children.find(child => child._ringParams !== undefined);
     if (outerRing && outerRing._ringParams) {
       const params = outerRing._ringParams;
       outerRing.clear();
       const mouseoverLineStyle = this.config?.outer?.lineStyle || { alignment: 0.5, native: false };
       outerRing.lineStyle({
         width: params.width,
         color: pinMouseoverRingColor,
         alpha: params.alpha,
         alignment: mouseoverLineStyle.alignment || 0.5,
         native: mouseoverLineStyle.native !== undefined ? mouseoverLineStyle.native : false
       });
       
       if (params.pinType === 'quest') {
         outerRing.drawCircle(0, 0, params.radius);
       } else {
         outerRing.drawRoundedRect(-params.rectW/2, -params.rectH/2, params.rectW, params.rectH, params.borderRadius);
       }
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
      console.error('Error showing quest pin tooltip:', { questUuid: this.questUuid, objectiveIndex: this.objectiveIndex, error: error.message });
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
      console.error('Error checking mouse position vs windows:', { error: error.message });
      return false;
    }
  }

     _onPointerOut(event) {
     // Restore original ring color - redraw with original color
     const outerRing = this.children.find(child => child._ringParams !== undefined);
     if (outerRing && outerRing._ringParams) {
       const params = outerRing._ringParams;
       outerRing.clear();
       outerRing.lineStyle({
         width: params.width,
         color: params.originalColor,
         alpha: params.alpha,
         alignment: 0.5,
         native: false
       });
       
       if (params.pinType === 'quest') {
         outerRing.drawCircle(0, 0, params.radius);
       } else {
         outerRing.drawRoundedRect(-params.rectW/2, -params.rectH/2, params.rectW, params.rectH, params.borderRadius);
       }
     }

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

// Quest pin hooks are now managed centrally by Blacksmith HookManager

// Track timeouts for cleanup


// Load persisted pins when canvas is ready (now called from ready hook)
export function loadPersistedPinsOnCanvasReady() {
    trackModuleTimeout(() => {
        loadPersistedPins();
    }, 1500);
}

// Quest pin hooks are now managed centrally by Blacksmith HookManager

// Track registration status
let questPinsRegistered = false;
let registrationRetryCount = 0;
const MAX_REGISTRATION_RETRIES = 10;

// Quest pins registration is now handled by Blacksmith HookManager
// No need for local HookManager registration

// Function to load persisted pins for current scene
export function loadPersistedPins() {
    try {
        // Quest pins are now managed by Blacksmith HookManager
        
        const scene = canvas.scene;
        if (!scene) {
            return;
        }
        
        if (!canvas.squirePins) {
            // Try again in a moment
            trackModuleTimeout(() => {
                loadPersistedPins();
            }, 1000);
            return;
        }

        // Get pins data from scene flags
        const scenePins = scene.getFlag(MODULE.ID, 'questPins') || [];

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
                        // Error updating pin state on load
                    }
                
                canvas.squirePins.addChild(pin);
            } catch (error) {
                // Error loading pin
            }
        });


        
        // Clean up orphaned pins (pins that reference non-existent quests)
        if (game.user.isGM) {
            trackModuleTimeout(async () => {
                await cleanupOrphanedPins();
            }, 1000);
        }
    } catch (error) {
        // Error loading persisted pins
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
                }
            } catch (error) {
                orphanedCount++;
            }
        }
        
        // If we found orphaned pins, update the scene flags
        if (orphanedCount > 0) {
            await scene.setFlag(MODULE.ID, 'questPins', validPins);
        }
    } catch (error) {
        // Error cleaning up orphaned pins
    }
}

// Cleanup function for quest pins
function cleanupQuestPins() {
    // Clear all tracked timeouts
            // Timeout management is now handled by Blacksmith HookManager

    // Clear existing pins and their timeouts
    if (canvas.squirePins) {
        const existingPins = canvas.squirePins.children.filter(child => child instanceof QuestPin);
        existingPins.forEach(pin => {
            // Clear any pending click timeouts
            if (pin._clickTimeout) {
                clearTrackedTimeout(pin._clickTimeout);
                pin._clickTimeout = null;
            }
            // Clear any pending right-click timeouts
            if (pin._rightClickTimeout) {
                clearTrackedTimeout(pin._rightClickTimeout);
                pin._rightClickTimeout = null;
            }
            // Clear any pending click timeouts
            if (pin._clickTimeout) {
                clearTrackedTimeout(pin._clickTimeout);
                pin._clickTimeout = null;
            }
            // Remove global event listeners
            if (pin._onGlobalDragMove) {
                document.removeEventListener('pointermove', pin._onGlobalDragMove);
            }
            if (pin._onGlobalDragEnd) {
                document.removeEventListener('pointerup', pin._onGlobalDragEnd);
            }
            pin._forceEndDrag();
            canvas.squirePins.removeChild(pin);
        });
    }

    // Always reset cursor to default
    document.body.style.cursor = '';
    document.body.style.cursor = 'default';
}

// Quest pin hooks are now managed centrally by Blacksmith HookManager 
