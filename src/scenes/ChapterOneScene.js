import * as THREE from "three";
import { Scene } from "../game/Scene.js";

export class ChapterOneScene extends Scene {
  async init() {
    this.threeScene = new THREE.Scene();
    this.threeScene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(36, 2 / 3, 0.1, 10);
    this.camera.position.set(0, 0, 1);
    this.title = document.querySelector("#chapter-title");
    this.ready = true;
  }

  enter() {
    if (this.title) {
      this.title.hidden = false;
    }
  }

  exit() {
    if (this.title) {
      this.title.hidden = true;
    }
  }

  resize(width, height) {
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.game.renderer.render(this.threeScene, this.camera);
  }
}
