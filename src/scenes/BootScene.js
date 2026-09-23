import * as THREE from "three";
import { Scene } from "../game/Scene.js";
import { clamp, easeInOutCubic } from "../game/easing.js";
import { ChapterGate } from "../ui/ChapterGate.js";
import { isChromeEvent } from "../ui/dom.js";
import { setLoadProgress } from "../ui/Loader.js";
import { Terminal } from "../ui/Terminal.js";
import { createCrtMaterial } from "../shaders/crtScreen.js";
import { BootCamera } from "./boot/BootCamera.js";
import { InspectSystem } from "./boot/InspectSystem.js";
import { mountLaptopDisplay } from "./boot/laptopDisplay.js";
import { loadBootRoom } from "./boot/loadRoom.js";
import { WindowParallax } from "./boot/windowParallax.js";

const POWER_ON_SECONDS = 2.15;
const PROMPT_AT_POWER = 0.72;
const DOLLY_DELAY = 0.9;
const DOLLY_SECONDS = 3.4;
const PULLBACK_SECONDS = 3.3;
const LINE_PAUSE_SECONDS = 1.6;
const HINT_HIDE_MS = 800;

const PROMPT = "C:\\Users\\You>\n> ";
const COMMAND = "npm run career";
const NPM_ERROR = "\n'npm' is not recognized as an internal or external command";
const LESSON = "\n\nYou have a lot to learn.";

export class BootScene extends Scene {
  async init() {
    this.threeScene = new THREE.Scene();
    this.threeScene.background = new THREE.Color(0x1a1714);
    this.cameraRig = new BootCamera();
    this.camera = this.cameraRig.camera;

    this.resetStory();
    this.mountTerminal();
    this.useBakedOutput();

    const room = await loadBootRoom(this.threeScene, setLoadProgress);
    this.mountRoom(room);
    this.mountInspect();
    this.ready = true;
  }

  resetStory() {
    this.bootStarted = false;
    this.bootTime = 0;
    this.power = 0;
    this.cameraBlend = 0;
    this.pullbackStarted = false;
    this.pullbackTime = 0;
    this.pullbackBlend = 0;
    this.textStarted = false;
    this.storyStarted = false;
    this.playMode = "interactive";
    this.storyViewEntered = false;
    this.hint = document.querySelector("#start-hint");
    this.modeToggle = document.querySelector("#mode-toggle");
    this.displayMesh = null;
    this.chapterGate = new ChapterGate({
      onOpen: () => {
        this.inspect?.closeModal();
        this.cameraRig.setControlsEnabled(false);
      },
      onClose: () => {
        if (this.playMode === "view") {
          this.cameraRig.setControlsEnabled(true);
        }
      },
      onConfirm: () => {
        void this.game.sceneManager.goTo("chapter-1");
      },
    });
  }

  mountTerminal() {
    this.terminal = new Terminal({ prompt: PROMPT, command: COMMAND });
    this.terminal.onSubmit = () => {
      void this.playNpmFail();
    };
    this.terminal.autoFill = window.matchMedia("(pointer: coarse)").matches;
    this.terminal.draw();

    this.screenTexture = new THREE.CanvasTexture(this.terminal.canvas);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;
    this.screenTexture.anisotropy = 8;
    this.screenTexture.flipY = true;

    this.crtMaterial = createCrtMaterial(this.screenTexture);
    this.crtMaterial.side = THREE.FrontSide;
  }

  useBakedOutput() {
    this.previousToneMapping = this.game.renderer.toneMapping;
    this.previousExposure = this.game.renderer.toneMappingExposure;
    this.game.renderer.toneMapping = THREE.NoToneMapping;
    this.game.renderer.toneMappingExposure = 1;
  }

  mountRoom({ roomRoot, laptopScreen, windowView, windowUniforms }) {
    this.roomRoot = roomRoot;
    this.laptopScreen = laptopScreen;
    this.windowParallax = windowView ? new WindowParallax(windowView, windowUniforms) : null;

    this.threeScene.updateMatrixWorld(true);
    this.cameraRig.aim(laptopScreen, roomRoot);
    this.windowParallax?.setReference(this.camera.position);
    this.displayMesh = mountLaptopDisplay({
      laptopScreen,
      material: this.crtMaterial,
      screenNormal: this.cameraRig.screenNormal,
      previous: this.displayMesh,
    });
    this.cameraRig.setupControls(this.game.canvas);
  }

  mountInspect() {
    this.inspect = new InspectSystem({
      threeScene: this.threeScene,
      camera: this.camera,
      renderer: this.game.renderer,
      canvas: this.game.canvas,
      getPlayMode: () => this.playMode,
      cameraRig: this.cameraRig,
    });
    this.inspect.setup(this.roomRoot, this.displayMesh);
    this.bindInput();
    this.bindModeToggle();
    this.inspect.bind();
  }

  bindModeToggle() {
    if (!this.modeToggle) {
      return;
    }

    this.onModePointer = (event) => {
      event.stopPropagation();
      const button = event.target.closest("[data-mode]");
      if (button?.dataset.mode) {
        this.setPlayMode(button.dataset.mode);
      }
    };

    this.modeToggle.addEventListener("pointerdown", this.onModePointer);
  }

  setPlayMode(mode) {
    if (mode !== "view" && mode !== "interactive") {
      return;
    }

    if (mode === this.playMode) {
      return;
    }

    this.chapterGate.dismiss();
    this.inspect.closeModal();
    this.inspect.setHovered(null);
    this.playMode = mode;
    this.syncModeToggle();

    if (mode === "view") {
      this.hideStartHint();
      this.cameraRig.enterViewMode({ useDefaultPose: this.storyViewEntered });
      return;
    }

    this.cameraRig.enterInteractiveMode(this.cameraBlend, this.pullbackBlend);
    this.showStartHint();
  }

  syncModeToggle() {
    if (!this.modeToggle) {
      return;
    }

    this.modeToggle.querySelectorAll("[data-mode]").forEach((button) => {
      const active = button.dataset.mode === this.playMode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  bindInput() {
    this.onPointer = (event) => {
      if (this.inspect.open || isChromeEvent(event) || this.playMode === "view") {
        return;
      }
      if (this.inspect.canInspect(this.inspect.hitId(event))) {
        return;
      }
      if (!this.bootStarted) {
        void this.beginBoot();
        return;
      }
      this.handleTap();
    };
    this.onKey = (event) => {
      if (this.chapterGate.onKey(event) || this.inspect.onKey(event)) {
        return;
      }
      if (this.chapterGate.open || this.inspect.open || this.playMode === "view") {
        return;
      }
      if (!this.bootStarted) {
        void this.beginBoot();
        return;
      }
      this.terminal.handleKey(event);
    };

    window.addEventListener("pointerdown", this.onPointer);
    window.addEventListener("keydown", this.onKey);
  }

  handleTap() {
    if (!this.terminal.inputEnabled) {
      return;
    }
    if (this.terminal.isComplete()) {
      this.terminal.submit();
      return;
    }
    this.terminal.typeForcedChar();
  }

  hideStartHint() {
    if (!this.hint) {
      return;
    }

    this.hint.classList.add("is-hidden");
    this.hint.setAttribute("aria-hidden", "true");
    window.clearTimeout(this.hintHideTimer);
    this.hintHideTimer = window.setTimeout(() => {
      if (this.playMode === "view" || this.bootStarted) {
        this.hint.hidden = true;
      }
    }, HINT_HIDE_MS);
  }

  showStartHint() {
    if (this.bootStarted || !this.hint) {
      return;
    }

    window.clearTimeout(this.hintHideTimer);
    this.hint.hidden = false;
    this.hint.classList.remove("is-hidden");
    this.hint.setAttribute("aria-hidden", "false");
  }

  async beginBoot() {
    if (this.bootStarted) {
      return;
    }

    this.bootStarted = true;
    this.hideStartHint();
    await this.game.audio.unlock();
    this.game.audio.playBoot();
  }

  async playNpmFail() {
    if (this.storyStarted) {
      return;
    }

    this.storyStarted = true;
    await this.terminal.print(NPM_ERROR);
    await this.wait(LINE_PAUSE_SECONDS);
    await this.terminal.print(LESSON);
    this.pullbackStarted = true;
  }

  wait(seconds) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, seconds * 1000);
    });
  }

  updateCrt() {
    this.crtMaterial.uniforms.uPower.value = this.power;
  }

  update(delta) {
    if (this.playMode === "view") {
      this.updateView(delta);
      return;
    }

    if (this.cameraRig.poseActive) {
      this.updateCrt();
      this.cameraRig.updatePose(delta);
      this.windowParallax?.update(this.camera);
      return;
    }

    this.updateStory(delta);
    this.syncScreen(delta);
    this.updateCrt();
    this.cameraRig.applyStoryCamera(this.cameraBlend, this.pullbackBlend);
    this.enterViewAfterStory();
    this.windowParallax?.update(this.camera);
  }

  updateView(delta) {
    this.updateCrt();
    if (this.cameraRig.updatePose(delta)) {
      if (!this.cameraRig.poseActive) {
        this.cameraRig.setControlsEnabled(true);
      }
    } else {
      this.cameraRig.controls?.update();
    }
    this.windowParallax?.update(this.camera);
  }

  updateStory(delta) {
    if (this.bootStarted) {
      this.bootTime += delta;
      this.power = clamp(this.bootTime / POWER_ON_SECONDS, 0, 1);

      if (this.power > PROMPT_AT_POWER && !this.textStarted) {
        this.textStarted = true;
        this.terminal.startReveal();
      }

      this.cameraBlend = easeInOutCubic(clamp((this.bootTime - DOLLY_DELAY) / DOLLY_SECONDS, 0, 1));
    }

    if (this.pullbackStarted) {
      this.pullbackTime += delta;
      this.pullbackBlend = easeInOutCubic(clamp(this.pullbackTime / PULLBACK_SECONDS, 0, 1));
    }
  }

  syncScreen(delta) {
    if (this.terminal.update(delta)) {
      this.screenTexture.needsUpdate = true;
    }
  }

  enterViewAfterStory() {
    if (this.storyViewEntered || !this.pullbackStarted || this.pullbackBlend < 1) {
      return;
    }

    this.storyViewEntered = true;
    if (this.playMode !== "view") {
      this.setPlayMode("view");
    }
    this.chapterGate.show();
  }

  enter() {
    if (this.modeToggle) {
      this.modeToggle.hidden = false;
    }
  }

  render() {
    if (!this.inspect.render()) {
      this.game.renderer.render(this.threeScene, this.camera);
    }
  }

  resize(width, height) {
    this.cameraRig.resize(width, height, this.playMode, this.cameraBlend, this.pullbackBlend);
    this.inspect.resize(width, height);
  }

  exit() {
    window.removeEventListener("pointerdown", this.onPointer);
    window.removeEventListener("keydown", this.onKey);
    this.modeToggle?.removeEventListener("pointerdown", this.onModePointer);
    this.chapterGate.dispose();
    this.inspect.dispose();
    this.cameraRig.dispose();
    if (this.modeToggle) {
      this.modeToggle.hidden = true;
    }
    this.game.renderer.toneMapping = this.previousToneMapping;
    this.game.renderer.toneMappingExposure = this.previousExposure;
  }
}
