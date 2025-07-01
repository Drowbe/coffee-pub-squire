export class QuestPin extends PIXI.Container {
  constructor({ x, y, questUuid, objectiveIndex, displayNumber }) {
    super();
    this.x = x;
    this.y = y;
    this.questUuid = questUuid;
    this.objectiveIndex = objectiveIndex;
    this.displayNumber = displayNumber;

    // Draw circle
    const circle = new PIXI.Graphics();
    circle.beginFill(0x2b2b2b, 0.9);
    circle.lineStyle(3, 0xFFD700, 1);
    circle.drawCircle(0, 0, 28);
    circle.endFill();
    this.addChild(circle);

    // Draw number
    const style = new PIXI.TextStyle({
      fontFamily: 'Signika',
      fontSize: 22,
      fill: '#fff',
      stroke: '#000',
      strokeThickness: 4,
      fontWeight: 'bold',
      align: 'center'
    });
    const text = new PIXI.Text(displayNumber, style);
    text.anchor.set(0.5);
    this.addChild(text);

    // For future: add interactivity, tooltips, etc.
    this.interactive = false;
    this.buttonMode = false;
    this.eventMode = 'none';
    this.hitArea = null;

    // Debug log
    console.log('SQUIRE | QuestPin created', this);
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
    if (canvas.squire) {
        console.log('SQUIRE | Adding pin to canvas.squire', pin);
        canvas.squire.addPin(pin);
    } else {
        console.error('SQUIRE | canvas.squire is not available!', canvas);
    }
    return true;
}); 