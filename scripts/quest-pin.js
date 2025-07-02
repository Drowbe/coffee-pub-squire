export class QuestPin extends PIXI.Container {
  
  
  constructor({ x, y, questUuid, objectiveIndex, displayNumber }) {
    super();
    this.x = x;
    this.y = y;
    this.questUuid = questUuid;
    this.objectiveIndex = objectiveIndex;
    this.displayNumber = displayNumber;
  
    const pinWidth = 74;
    const pinHeight = 74;
    const pinRadius = 4;
  
    // ===============================
    // 1. Draw subtle all-sides shadow
    // ===============================

    // === 1. Fake soft shadow ===
    // Draw a slightly larger, transparent shape underneath
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.12); // Very subtle black
    shadow.drawRoundedRect(
      -pinWidth / 2 - 2,   // X - slightly bigger
      -pinHeight / 2 - 2,  // Y - slightly bigger
      pinWidth + 4,        // Width + blur effect
      pinHeight + 4,       // Height + blur effect
      pinRadius + 2        // Slightly more rounded
    );
    shadow.endFill();
    this.addChildAt(shadow, 0); // Make sure it's behind everything

  
    // =====================================
    // 2. Draw pin background (rounded rect)
    // =====================================
    const fillColor = 0x23221d; // Match top pin fill
    const fillAlpha = 0.2;
    const borderColor = 0x000000;
  
    const rect = new PIXI.Graphics();
    rect.lineStyle(2, borderColor, 1); // Thin black border
    rect.beginFill(fillColor, fillAlpha);
    rect.drawRoundedRect(-pinWidth / 2, -pinHeight / 2, pinWidth, pinHeight, pinRadius);
    rect.endFill();
    this.addChild(rect);
    rect.interactive = false;
    rect.eventMode = 'none';
  
    // ==================================
    // 3. Add Font Awesome flag icon
    // ==================================
    const iconStyle = new PIXI.TextStyle({
      fontFamily: 'FontAwesome',
      fontSize: 40,
      fill: '#FFFFFF',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 3,
      dropShadow: true,
      dropShadowColor: '#000000',
      dropShadowBlur: 2,       // A bit more for softness
      dropShadowDistance: 0,    // Centered = all sides
      dropShadowAlpha: 0.60 // Makes the shadow more subtle
    });
    const icon = new PIXI.Text('\uf024', iconStyle); // Font Awesome flag icon
    icon.anchor.set(0.5);
    icon.y = -6; // Slightly above center
    this.addChild(icon);
    icon.interactive = false;
    icon.eventMode = 'none';
  
    // ===========================================
    // 4. Add display number text inside the pin
    // ===========================================
    const refStyle = new PIXI.TextStyle({
      fontFamily: 'Signika',
      fontSize: 16,
      fill: '#FFFFFF',
      stroke: '#000000',
      strokeThickness: 3,
      fontWeight: 'bold',
      align: 'center'
    });
    const refText = new PIXI.Text(displayNumber, refStyle);
    refText.anchor.set(0.5, 0);
    refText.y = 10;
    this.addChild(refText);
    refText.interactive = false;
    refText.eventMode = 'none';
  
    // ================================
    // 5. Add interaction / hit area
    // ================================
    this.interactive = true;
    this.buttonMode = true;
    this.eventMode = 'static';
    this.hitArea = new PIXI.Circle(0, 0, 28);
    this.cursor = 'pointer';
  
    this.on('pointerdown', () => {
      console.log('SQUIRE | Quest Pins | Pin clicked!', this);
    });
    this.on('pointerover', this._onPointerOver.bind(this));
    this.on('pointerout', this._onPointerOut.bind(this));
  
    console.log('SQUIRE | QuestPin created', this);
  }
  
  

  _onPointerOver(event) {
    // Lookup quest and objective text
    let text = 'Objective';
    try {
      const quest = game.squire?.quests?.get(this.questUuid) || game.quests?.get(this.questUuid);
      if (quest && quest.objectives && quest.objectives[this.objectiveIndex]) {
        text = quest.objectives[this.objectiveIndex].text || quest.objectives[this.objectiveIndex].name || 'Objective';
      }
    } catch (e) {}
    
    // Create or get tooltip element
    let tooltip = document.getElementById('squire-questpin-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'squire-questpin-tooltip';
      tooltip.className = 'quest-marker-tooltip';
      document.body.appendChild(tooltip);
    }
    
    tooltip.textContent = text;
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

Hooks.on('dropCanvasData', (canvas, data) => {
    if (data.type !== 'quest-objective') return false;
    const { questUuid, objectiveIndex } = data;
    const displayNumber = `${getQuestNumber(questUuid)}.${objectiveIndex + 1}`;
    const pin = new QuestPin({ x: data.x, y: data.y, questUuid, objectiveIndex, displayNumber });
    if (canvas.squirePins) {
        console.log('SQUIRE | Adding pin to canvas.squirePins', pin);
        canvas.squirePins.addChild(pin);
        console.log('SQUIRE | canvas.squirePins children after add:', canvas.squirePins.children);
    } else {
        console.error('SQUIRE | canvas.squirePins is not available!', canvas);
    }
    return true;
}); 