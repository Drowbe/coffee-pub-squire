export class QuestPin extends PIXI.Container {
  constructor({ x, y, questUuid, objectiveIndex, displayNumber }) {
    super();
    this.x = x;
    this.y = y;
    this.questUuid = questUuid;
    this.objectiveIndex = objectiveIndex;
    this.displayNumber = displayNumber;

    // Draw soft all-sides shadow
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.22);
    shadow.drawRoundedRect(-26, -26, 52, 52, 12); // Larger, softer shadow
    shadow.endFill();
    this.addChildAt(shadow, 0);

    // Draw rounded rectangle for pin background
    const borderColor = 0x23221d; // Slightly lighter than before
    const fillColor = 0x23221d;   // Slightly lighter than before
    const fillAlpha = 0.50;       // More transparent
    const rectSize = 80;          // Larger size
    const rectRadius = 6;        // Slightly rounder corners
    const rectOffset = rectSize / 2;
    const rect = new PIXI.Graphics();
    rect.lineStyle(3, borderColor, 1);
    rect.beginFill(fillColor, fillAlpha);
    rect.drawRoundedRect(-rectOffset, -rectOffset, rectSize, rectSize, rectRadius);
    rect.endFill();
    this.addChild(rect);
    rect.interactive = false;
    rect.eventMode = 'none';

    // Draw Font Awesome flag icon centered in the pin
    const iconStyle = new PIXI.TextStyle({
      fontFamily: 'FontAwesome',
      fontSize: 28,
      fill: '#FFFFFF',
      align: 'center',
      dropShadow: true,
      dropShadowColor: '#000',
      dropShadowBlur: 3,
      dropShadowDistance: 1
    });
    const icon = new PIXI.Text('\uf024', iconStyle); // Font Awesome flag icon
    icon.anchor.set(0.5);
    icon.y = -4; // Centered
    this.addChild(icon);
    icon.interactive = false;
    icon.eventMode = 'none';

    // Draw number/reference text below the icon, inside the pin
    const refStyle = new PIXI.TextStyle({
      fontFamily: 'Signika',
      fontSize: 16,
      fill: '#FFFFFF',
      stroke: '#000',
      strokeThickness: 4,
      fontWeight: 'bold',
      align: 'center'
    });
    const refText = new PIXI.Text(displayNumber, refStyle);
    refText.anchor.set(0.5, 0);
    refText.y = 12; // Below the icon, but inside the pin
    this.addChild(refText);
    refText.interactive = false;
    refText.eventMode = 'none';

    // For future: add interactivity, tooltips, etc.
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

    // Debug log
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