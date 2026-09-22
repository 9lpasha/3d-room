import * as THREE from "three";
import { SceneManager } from "./SceneManager.js";
import { AudioEngine } from "../audio/AudioEngine.js";
import { hideLoader } from "../ui/Loader.js";

const PORTRAIT_ASPECT = 2 / 3;

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
    window.addEventListener("orientationchange", this.onResize);
    window.visualViewport?.addEventListener("resize", this.onResize);
    this.resize();
  }

  viewportSize() {
    const viewport = window.visualViewport;
    return {
      width: Math.max(1, Math.round(viewport?.width ?? window.innerWidth)),
      height: Math.max(1, Math.round(viewport?.height ?? window.innerHeight)),
    };
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
    hideLoader();
  }

  fitPortraitSize() {
    const { width: maxW, height: maxH } = this.viewportSize();
    let width = Math.min(maxW, Math.round(maxH * PORTRAIT_ASPECT));
    let height = Math.round(width / PORTRAIT_ASPECT);
    if (height > maxH) {
      height = maxH;
      width = Math.round(height * PORTRAIT_ASPECT);
    }
    return { width: Math.max(1, width), height: Math.max(1, height) };
  }

  resize() {
    const { width, height } = this.fitPortraitSize();
    this.width = width;
    this.height = height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    const app = this.canvas.parentElement;
    if (app) {
      app.style.width = `${width}px`;
      app.style.height = `${height}px`;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.sceneManager.current?.resize(width, height);
  }

  tick = () => {
    requestAnimationFrame(this.tick);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;
    void this.sceneManager.update(delta, elapsed);

    const scene = this.sceneManager.current;
    if (scene?.render) {
      scene.render();
    } else if (this.threeScene && this.camera) {
      this.renderer.render(this.threeScene, this.camera);
    }
  };
}
