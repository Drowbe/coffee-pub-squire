export class QuestPin extends PIXI.Container {
  
  
  constructor({ x, y, questUuid, objectiveIndex, displayNumber, objectiveState }) {
    super();
    this.x = x;
    this.y = y;
    this.questUuid = questUuid;
    this.objectiveIndex = objectiveIndex;
    this.displayNumber = displayNumber;
    this.objectiveState = objectiveState;
  

    // ===============================
    // 0. Define pin properties
    // ===============================
    let radius = 40; // Radius of the circular pin
    let borderColor = 0x000000;
    let fillColor = 0x000000; // grey
    let fillAlpha = 0.2; // Background transparency
    let fontSize = radius - 10; // size of label
    let fontColor = 0xFFFFFF; // white

    console.log('SQUIRE | QuestPin objectiveState', objectiveState);

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
  
    const refText = new PIXI.Text(objectiveIndex, refStyle);
    refText.anchor.set(0.5);
    refText.position.set(0, 0);
    this.addChild(refText);
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
    console.log('SQUIRE | Quest Pins | Drop data received:', data);
    const { questUuid, objectiveIndex } = data;
    const displayNumber = `${getQuestNumber(questUuid)}.${objectiveIndex + 1}`;
    
    // Look up the objective state from quest data
    let objectiveState = 'active'; // Default state
    try {
        // Debug: Check various possible locations for quest data
        console.log('SQUIRE | Quest Pins | Checking quest data locations:', {
            gameSquire: game.squire,
            gameQuests: game.quests,
            gameJournal: game.journal,
            gameActors: game.actors,
            gameItems: game.items,
            gameScenes: game.scenes,
            gameUsers: game.users,
            gameSettings: game.settings,
            gameModules: Object.keys(game.modules)
        });
        
        const quest = game.squire?.quests?.get(questUuid) || game.quests?.get(questUuid);
        console.log('SQUIRE | Quest Pins | Quest lookup result:', {
            questUuid,
            questFound: !!quest,
            questData: quest,
            squireQuests: game.squire?.quests,
            gameQuests: game.quests
        });
        if (quest && quest.objectives && quest.objectives[objectiveIndex]) {
            const objective = quest.objectives[objectiveIndex];
            console.log('SQUIRE | Quest Pins | Objective data:', {
                objectiveIndex,
                objective,
                objectiveState: objective.state,
                objectiveStatus: objective.status
            });
            objectiveState = quest.objectives[objectiveIndex].state || quest.objectives[objectiveIndex].status || 'active';
        }
    } catch (e) {
        console.warn('SQUIRE | Quest Pins | Could not look up objective state:', e);
    }
    console.log('SQUIRE | Quest Pins | Looked up objectiveState:', objectiveState);
    
    const pin = new QuestPin({ x: data.x, y: data.y, questUuid, objectiveIndex, displayNumber, objectiveState });
    console.log('SQUIRE | Quest Pins | Creating pin with objectiveState:', data.objectiveState || 'active');
    if (canvas.squirePins) {
        console.log('SQUIRE | Adding pin to canvas.squirePins', pin);
        canvas.squirePins.addChild(pin);
        console.log('SQUIRE | canvas.squirePins children after add:', canvas.squirePins.children);
    } else {
        console.error('SQUIRE | canvas.squirePins is not available!', canvas);
    }
    return true;
}); 