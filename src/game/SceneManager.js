const FADE_SECONDS = 0.9;

export class SceneManager {
  constructor(game) {
    this.game = game;
    this.scenes = new Map();
    this.current = null;
    this.currentName = null;
    this.transition = {
      active: false,
      kind: "fade",
      phase: "idle",
      t: 0,
      duration: FADE_SECONDS,
      nextName: null,
    };
  }

  register(name, scene) {
    this.scenes.set(name, scene);
  }

  async start(name) {
    const scene = this.getScene(name);
    await scene.init();
    this.activate(name, scene);
  }

  goTo(name, kind = "fade") {
    if (this.transition.active || name === this.currentName) {
      return;
    }

    this.getScene(name);
    this.beginTransition(name, kind);
  }

  getScene(name) {
    const scene = this.scenes.get(name);
    if (!scene) {
      throw new Error(`Unknown scene: ${name}`);
    }
    return scene;
  }

  activate(name, scene) {
    this.current = scene;
    this.currentName = name;
    this.game.attachScene(scene);
    scene.enter();
  }

  beginTransition(name, kind) {
    this.transition.active = true;
    this.transition.kind = kind;
    this.transition.phase = "out";
    this.transition.t = 0;
    this.transition.duration = FADE_SECONDS;
    this.transition.nextName = name;
  }

  async update(delta, elapsed) {
    if (this.current) {
      this.current.update(delta, elapsed);
    }

    if (!this.transition.active) {
      return;
    }

    this.transition.t += delta / this.transition.duration;
    const amount = Math.min(1, this.transition.t);
    this.game.setTransition(this.transition.kind, this.transition.phase, amount);

    if (amount < 1) {
      return;
    }

    if (this.transition.phase === "out") {
      await this.activateNextScene();
      return;
    }

    this.finishTransition();
  }

  async activateNextScene() {
    const nextName = this.transition.nextName;
    const next = this.getScene(nextName);

    this.current?.exit();
    if (!next.ready) {
      await next.init();
    }

    this.activate(nextName, next);
    this.transition.phase = "in";
    this.transition.t = 0;
  }

  finishTransition() {
    this.transition.active = false;
    this.transition.phase = "idle";
    this.game.setTransition(this.transition.kind, "idle", 0);
  }
}
