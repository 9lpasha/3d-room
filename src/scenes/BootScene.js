import * as THREE from "three";
import { Scene } from "../game/Scene.js";
import { Terminal } from "../ui/Terminal.js";
import { createCrtMaterial } from "../shaders/crtScreen.js";
import { clamp, easeInOutCubic } from "../game/easing.js";
import { BootCamera } from "./boot/BootCamera.js";
import { InspectSystem } from "./boot/InspectSystem.js";
import { mountLaptopDisplay } from "./boot/laptopDisplay.js";
import { loadBootRoom } from "./boot/loadRoom.js";
import { WindowParallax } from "./boot/windowParallax.js";
import { setLoadProgress } from "../ui/Loader.js";

export class BootScene extends Scene {
  async init() {
    this.threeScene = new THREE.Scene();
    this.threeScene.background = new THREE.Color(0x1a1714);

    this.cameraRig = new BootCamera();
    this.camera = this.cameraRig.camera;

    this.terminal = new Terminal();
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

    this.previousToneMapping = this.game.renderer.toneMapping;
    this.previousExposure = this.game.renderer.toneMappingExposure;
    this.game.renderer.toneMapping = THREE.NoToneMapping;
    this.game.renderer.toneMappingExposure = 1;

    const { roomRoot, laptopScreen, windowView, windowUniforms } = await loadBootRoom(this.threeScene, setLoadProgress);
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

    this.inspect = new InspectSystem({
      threeScene: this.threeScene,
      camera: this.camera,
      renderer: this.game.renderer,
      canvas: this.game.canvas,
      getPlayMode: () => this.playMode,
      cameraRig: this.cameraRig,
    });
    this.inspect.setup(roomRoot, this.displayMesh);

    this.bindInput();
    this.bindModeToggle();
    this.inspect.bind();
    this.ready = true;
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

    this.inspect.closeModal();
    this.inspect.setHovered(null);
    this.playMode = mode;
    this.syncModeToggle();

    if (mode === "view") {
      this.hideStartHint();
      this.cameraRig.enterViewMode({ useDefaultPose: this.storyViewEntered });
    } else {
      this.cameraRig.enterInteractiveMode(this.cameraBlend, this.pullbackBlend);
      this.showStartHint();
    }

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
      if (this.inspect.open || event.target.closest?.("#mode-toggle") || event.target.closest?.("#inspect-modal")) {
        return;
      }
      if (this.playMode === "view") {
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
      if (this.inspect.onKey(event)) {
        return;
      }
      if (this.inspect.open || this.playMode === "view") {
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
    }, 800);
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
    await this.terminal.print("\n'npm' is not recognized as an internal or external command");
    await this.wait(1.6);
    await this.terminal.print("\n\nYou have a lot to learn.");
    this.pullbackStarted = true;
  }

  wait(seconds) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, seconds * 1000);
    });
  }

  updateCrt(delta) {
    this.crtMaterial.uniforms.uTime.value += delta;
    this.crtMaterial.uniforms.uPower.value = this.power;
  }

  update(delta) {
    if (this.playMode === "view") {
      this.updateCrt(delta);
      if (this.cameraRig.updatePose(delta)) {
        if (!this.cameraRig.poseActive) {
          this.cameraRig.setControlsEnabled(true);
        }
      } else {
        this.cameraRig.controls?.update();
      }
      this.windowParallax?.update(this.camera);
      return;
    }

    if (this.cameraRig.poseActive) {
      this.updateCrt(delta);
      this.cameraRig.updatePose(delta);
      this.windowParallax?.update(this.camera);
      return;
    }

    if (this.bootStarted) {
      this.bootTime += delta;
      this.power = clamp(this.bootTime / 2.15, 0, 1);

      if (this.power > 0.72 && !this.textStarted) {
        this.textStarted = true;
        this.terminal.startReveal();
      }

      this.cameraBlend = easeInOutCubic(clamp((this.bootTime - 0.9) / 3.4, 0, 1));
    }

    if (this.pullbackStarted) {
      this.pullbackTime += delta;
      this.pullbackBlend = easeInOutCubic(clamp(this.pullbackTime / 3.3, 0, 1));
    }

    if (this.terminal.update(delta)) {
      this.screenTexture.needsUpdate = true;
    }

    this.updateCrt(delta);
    this.cameraRig.applyStoryCamera(this.cameraBlend, this.pullbackBlend);

    if (!this.storyViewEntered && this.pullbackStarted && this.pullbackBlend >= 1) {
      this.storyViewEntered = true;
      if (this.playMode !== "view") {
        this.setPlayMode("view");
      }
    }

    this.windowParallax?.update(this.camera);
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
    this.inspect.dispose();
    this.cameraRig.dispose();
    this.game.renderer.toneMapping = this.previousToneMapping;
    this.game.renderer.toneMappingExposure = this.previousExposure;
  }
}
