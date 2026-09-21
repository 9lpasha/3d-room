import * as THREE from "three";
import { SceneManager } from "./SceneManager.js";
import { AudioEngine } from "../audio/AudioEngine.js";

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.width = 1;
    this.height = 1;
    this.threeScene = null;
    this.camera = null;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.clock = new THREE.Clock();
    this.audio = new AudioEngine();
    this.sceneManager = new SceneManager(this);
    this.veil = document.querySelector("#transition-veil");

    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
    this.resize();
  }

  attachScene(scene) {
    this.threeScene = scene.threeScene;
    this.camera = scene.camera;
    scene.resize(this.width, this.height);
  }

  setTransition(kind, phase, amount) {
    if (!this.veil) {
      return;
    }

    if (phase === "out") {
      this.veil.style.opacity = String(amount);
    } else if (phase === "in") {
      this.veil.style.opacity = String(1 - amount);
    } else {
      this.veil.style.opacity = "0";
    }

    this.veil.dataset.kind = kind;
  }

  async start(name) {
    await this.sceneManager.start(name);
    this.tick();
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.sceneManager.current?.resize(width, height);
  }

  tick = () => {
    requestAnimationFrame(this.tick);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;
    void this.sceneManager.update(delta, elapsed);

    if (this.threeScene && this.camera) {
      this.renderer.render(this.threeScene, this.camera);
    }
  };
}
