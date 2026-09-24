import { Scene } from "../game/Scene.js";
import * as THREE from "three";
import { ChapterScreen } from "../ui/ChapterScreen.js";

export class ChapterOneScene extends Scene {
  constructor(game, bootScene) {
    super(game);
    this.bootScene = bootScene;
    this.title = document.querySelector("#chapter-title");
    this.chapterScreen = new ChapterScreen();
    this.titleTimer = null;
    this.revealed = false;
  }

  async init() {
    this.threeScene = this.bootScene.threeScene;
    this.camera = this.bootScene.camera;
    this.ready = true;
  }

  enter() {
    this.showChapterTitle();
    this.installScreenTexture();
    this.bindInput();
    this.revealed = false;
    this.bootScene.cameraRig.focusLaptop();
    this.titleTimer = window.setTimeout(() => this.revealLaptop(), 1400);
  }

  exit() {
    window.clearTimeout(this.titleTimer);
    this.unbindInput();
    this.title?.setAttribute("hidden", "true");
  }

  resize(width, height) {
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.bootScene.render();
  }

  update(delta) {
    this.bootScene.cameraRig.updatePose(delta);
    this.bootScene.windowParallax?.update(this.camera);
  }

  showChapterTitle() {
    if (this.title) {
      this.title.hidden = false;
      this.title.querySelector(".chapter-kicker")?.replaceChildren("Глава 1");
    }
  }

  revealLaptop() {
    this.title?.setAttribute("hidden", "true");
    this.revealed = true;
    this.bootScene.screenTexture.image = this.chapterScreen.canvas;
    this.bootScene.screenTexture.needsUpdate = true;
  }

  installScreenTexture() {
    this.bootScene.screenTexture.image = this.chapterScreen.canvas;
    this.bootScene.screenTexture.needsUpdate = true;
  }

  bindInput() {
    this.onPointer = (event) => {
      if (!this.revealed) {
        return;
      }
      const rect = this.game.canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
        -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, this.camera);
      const hit = raycaster.intersectObject(this.bootScene.displayMesh, false)[0];
      if (!hit?.uv) {
        return;
      }
      this.chapterScreen.chooseAtCanvasY(hit.uv.y * this.chapterScreen.canvas.height);
      this.bootScene.screenTexture.needsUpdate = true;
    };
    this.onKey = (event) => {
      if (!this.revealed) {
        return;
      }
      if (event.key < "1" || event.key > "4") {
        return;
      }
      this.chapterScreen.choose(Number(event.key) - 1);
      this.bootScene.screenTexture.needsUpdate = true;
    };
    this.game.canvas.addEventListener("pointerdown", this.onPointer);
    window.addEventListener("keydown", this.onKey);
  }

  unbindInput() {
    this.game.canvas.removeEventListener("pointerdown", this.onPointer);
    window.removeEventListener("keydown", this.onKey);
  }
}
