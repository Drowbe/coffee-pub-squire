import { MODULE } from './const.js';

export class SquireLayer extends CanvasLayer {
  constructor() {
    super();
    this.pins = [];
  }

  /**
   * Add a QuestPin to the layer.
   * @param {QuestPin} pin
   */
  addPin(pin) {
    this.addChild(pin);
    this.pins.push(pin);
  }

  /**
   * Remove a QuestPin from the layer.
   * @param {QuestPin} pin
   */
  removePin(pin) {
    this.removeChild(pin);
    this.pins = this.pins.filter(p => p !== pin);
  }

  /**
   * Remove all pins.
   */
  clearPins() {
    for (const pin of this.pins) this.removeChild(pin);
    this.pins = [];
  }

  _draw() {
    // Required by Foundry, even if empty
    return Promise.resolve();
  }
} 