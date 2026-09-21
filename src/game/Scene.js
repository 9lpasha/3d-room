export class Scene {
  constructor(game) {
    this.game = game;
    this.ready = false;
  }

  async init() {}

  enter() {}

  update(_delta, _elapsed) {}

  resize(_width, _height) {}

  exit() {}

  dispose() {}
}
