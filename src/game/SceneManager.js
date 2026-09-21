const TRANSITION_DURATION = {
  fade: 0.9,
  crt: 1.2,
  glitch: 0.7,
};

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
      duration: 0.9,
      nextName: null,
    };
  }

  register(name, scene) {
    this.scenes.set(name, scene);
  }

  async start(name) {
    const scene = this.scenes.get(name);
    if (!scene) {
      throw new Error(`Unknown scene: ${name}`);
    }

    await scene.init();
    this.current = scene;
    this.currentName = name;
    this.game.attachScene(scene);
    scene.enter();
  }

  async goTo(name, kind = "fade") {
    if (this.transition.active || name === this.currentName) {
      return;
    }
    if (!this.scenes.has(name)) {
      throw new Error(`Unknown scene: ${name}`);
    }

    this.transition.active = true;
    this.transition.kind = kind;
    this.transition.phase = "out";
    this.transition.t = 0;
    this.transition.duration = TRANSITION_DURATION[kind] ?? 0.9;
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
      const next = this.scenes.get(this.transition.nextName);
      if (this.current) {
        this.current.exit();
      }
      if (!next.ready) {
        await next.init();
      }
      this.current = next;
      this.currentName = this.transition.nextName;
      this.game.attachScene(next);
      next.enter();
      this.transition.phase = "in";
      this.transition.t = 0;
      return;
    }

    this.transition.active = false;
    this.transition.phase = "idle";
    this.game.setTransition(this.transition.kind, "idle", 0);
  }
}
