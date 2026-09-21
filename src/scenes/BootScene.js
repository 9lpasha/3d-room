import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Scene } from "../game/Scene.js";
import { Terminal } from "../ui/Terminal.js";
import { createCrtMaterial } from "../shaders/crtScreen.js";
import { clamp, easeInOutCubic, lerp } from "../game/easing.js";
import bakedUrl from "../assets/baked.jpg";
import roomUrl from "../assets/room_corner.glb?url";

export class BootScene extends Scene {
  async init() {
    this.threeScene = new THREE.Scene();
    this.threeScene.background = new THREE.Color(0x1a1714);

    this.closeFov = 38;
    this.roomFov = 36;
    this.camera = new THREE.PerspectiveCamera(this.closeFov, 9 / 16, 0.04, 80);
    this.cameraFrom = new THREE.Vector3();
    this.cameraTo = new THREE.Vector3();
    this.cameraRoom = new THREE.Vector3();
    this.lookClose = new THREE.Vector3();
    this.lookRoom = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.screenNormal = new THREE.Vector3(0, 0, 1);
    this.screenUp = new THREE.Vector3(0, 1, 0);
    this.frameHalfWidth = 0.14;
    this.frameHalfHeight = 0.09;
    this.roomBox = new THREE.Box3();

    this.terminal = new Terminal();
    this.terminal.onSubmit = () => {
      void this.playNpmFail();
    };
    this.terminal.draw();

    this.screenTexture = new THREE.CanvasTexture(this.terminal.canvas);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;
    this.screenTexture.anisotropy = 8;
    this.screenTexture.flipY = true;

    this.crtMaterial = createCrtMaterial(this.screenTexture);
    this.crtMaterial.side = THREE.FrontSide;
    this.laptopScreen = null;
    this.powerLed = null;

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
    this.controls = null;
    this.hint = document.querySelector("#start-hint");
    this.modeToggle = document.querySelector("#mode-toggle");

    this.previousToneMapping = this.game.renderer.toneMapping;
    this.previousExposure = this.game.renderer.toneMappingExposure;
    this.game.renderer.toneMapping = THREE.NoToneMapping;
    this.game.renderer.toneMappingExposure = 1;

    await this.loadRoom();
    this.threeScene.updateMatrixWorld(true);
    this.aimCameras();
    this.setupControls();
    this.bindInput();
    this.bindModeToggle();
    this.ready = true;
  }

  async loadRoom() {
    const textureLoader = new THREE.TextureLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("/draco/");
    dracoLoader.preload();

    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);

    const [baked, gltf] = await Promise.all([textureLoader.loadAsync(bakedUrl), gltfLoader.loadAsync(roomUrl)]);

    baked.flipY = false;
    baked.colorSpace = THREE.SRGBColorSpace;
    baked.anisotropy = 8;

    const bakedMaterial = new THREE.MeshBasicMaterial({ map: baked });
    this.roomRoot = gltf.scene;
    this.threeScene.add(this.roomRoot);

    this.roomRoot.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      const materialName = Array.isArray(child.material) ? child.material[0]?.name : child.material?.name;

      if (!child.material || child.name.startsWith("Плоскость")) {
        child.visible = false;
        return;
      }

      if (materialName === "Screen") {
        this.laptopScreen = child;
        child.material = new THREE.MeshBasicMaterial({ color: 0x050505 });
        return;
      }

      if (materialName === "LampMetal" || materialName === "LampInner" || materialName === "LampShade") {
        child.material = new THREE.MeshBasicMaterial({ map: baked, side: THREE.DoubleSide });
        return;
      }

      child.material = bakedMaterial;
    });

    if (!this.laptopScreen) {
      throw new Error("Laptop screen mesh not found in room_corner.glb");
    }
  }

  aimCameras() {
    const screenPos = new THREE.Vector3();
    const screenQuat = new THREE.Quaternion();
    this.laptopScreen.updateWorldMatrix(true, false);
    this.laptopScreen.getWorldPosition(screenPos);
    this.laptopScreen.getWorldQuaternion(screenQuat);

    const geometry = this.laptopScreen.geometry;
    geometry.computeBoundingBox();
    const localSize = geometry.boundingBox.getSize(new THREE.Vector3());
    const worldScale = new THREE.Vector3();
    this.laptopScreen.getWorldScale(worldScale);
    this.frameHalfWidth = (localSize.x * worldScale.x) / 2;
    this.frameHalfHeight = (localSize.y * worldScale.y) / 2;

    this.screenUp.set(0, 1, 0).applyQuaternion(screenQuat).normalize();
    const facingA = new THREE.Vector3(0, 0, 1).applyQuaternion(screenQuat).normalize();
    const facingB = facingA.clone().negate();

    this.roomBox.setFromObject(this.roomRoot);
    const chair = this.roomRoot.getObjectByName("Chair");
    const viewer = new THREE.Vector3();
    if (chair) {
      chair.getWorldPosition(viewer);
    } else {
      this.roomBox.getCenter(viewer);
    }
    viewer.sub(screenPos);
    viewer.y = 0;
    if (viewer.lengthSq() < 0.0001) {
      viewer.set(0, 0, -1);
    } else {
      viewer.normalize();
    }

    const screenCenter = geometry.boundingBox.getCenter(new THREE.Vector3());
    this.laptopScreen.localToWorld(screenCenter);

    this.screenNormal.copy(facingA.dot(viewer) >= facingB.dot(viewer) ? facingA : facingB);
    this.screenNormal.negate();

    this.lookClose.copy(screenCenter);
    this.placeCloseCamera();
    this.frameRoomCamera();
    this.lookAt.copy(this.lookClose);
    this.camera.position.copy(this.cameraFrom);
    this.camera.lookAt(this.lookAt);

    this.mountDisplay();
  }

  mountDisplay() {
    if (this.displayMesh) {
      this.displayMesh.removeFromParent();
      this.displayMesh.geometry.dispose();
    }

    const geometry = this.laptopScreen.geometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const width = box.max.x - box.min.x;
    const height = box.max.y - box.min.y;
    const plane = new THREE.PlaneGeometry(width, height);

    const inverse = this.laptopScreen.matrixWorld.clone().invert();
    const localCam = this.screenNormal.clone().transformDirection(inverse);
    const towardCam = localCam.z >= 0 ? 1 : -1;

    if (towardCam < 0) {
      const uvs = plane.attributes.uv;
      for (let i = 0; i < uvs.count; i += 1) {
        uvs.setX(i, 1 - uvs.getX(i));
      }
      uvs.needsUpdate = true;
    }

    const display = new THREE.Mesh(plane, this.crtMaterial);
    display.position.set(
      (box.min.x + box.max.x) / 2,
      (box.min.y + box.max.y) / 2,
      (box.min.z + box.max.z) / 2 + towardCam * 0.0015,
    );
    if (towardCam < 0) {
      display.rotation.y = Math.PI;
    }

    this.laptopScreen.add(display);
    this.displayMesh = display;
  }

  placeCloseCamera() {
    const vFov = THREE.MathUtils.degToRad(this.closeFov);
    const aspect = Math.max(this.camera.aspect, 0.01);
    const distFar = Math.max(
      (this.frameHalfWidth * 1.22) / (Math.tan(vFov / 2) * aspect),
      (this.frameHalfHeight * 1.22) / Math.tan(vFov / 2),
    );
    const distClose = distFar * 0.82;

    this.cameraTo
      .copy(this.lookClose)
      .addScaledVector(this.screenNormal, distClose)
      .addScaledVector(this.screenUp, this.frameHalfHeight * 0.22)
      .add(new THREE.Vector3(0, 0.3, -0.2));

    this.cameraFrom
      .copy(this.lookClose)
      .addScaledVector(this.screenNormal, distFar)
      .addScaledVector(this.screenUp, this.frameHalfHeight * 0.28)
      .add(new THREE.Vector3(0, 0.1, 0));

    this.nudgeAwayFromChair(this.cameraFrom);
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.game.canvas);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.rotateSpeed = 0.72;
    this.controls.zoomSpeed = 0.9;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.fitViewLimits();
  }

  fitViewLimits() {
    if (!this.controls || this.roomBox.isEmpty()) {
      return;
    }

    const size = this.roomBox.getSize(new THREE.Vector3());
    this.controls.minDistance = 0.32;
    this.controls.maxDistance = Math.max(size.length() * 1.35, 5);
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

    this.playMode = mode;
    this.syncModeToggle();

    if (mode === "view") {
      this.enterViewMode();
      return;
    }

    this.enterInteractiveMode();
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

  enterViewMode() {
    this.hideStartHint();
    this.fitViewLimits();
    this.controls.target.copy(this.lookRoom);
    this.camera.position.copy(this.cameraRoom);
    this.camera.fov = this.roomFov;
    this.camera.lookAt(this.controls.target);
    this.camera.updateProjectionMatrix();
    this.controls.enabled = true;
    this.controls.update();
  }

  enterInteractiveMode() {
    this.controls.enabled = false;
    this.applyStoryCamera();

    if (!this.bootStarted && this.hint) {
      window.clearTimeout(this.hintHideTimer);
      this.hint.hidden = false;
      this.hint.classList.remove("is-hidden");
      this.hint.setAttribute("aria-hidden", "false");
    }
  }

  applyStoryCamera() {
    if (this.pullbackBlend > 0) {
      this.camera.position.lerpVectors(this.cameraTo, this.cameraRoom, this.pullbackBlend);
      this.lookAt.lerpVectors(this.lookClose, this.lookRoom, this.pullbackBlend);
      this.camera.fov = lerp(this.closeFov, this.roomFov, this.pullbackBlend);
    } else {
      this.camera.position.lerpVectors(this.cameraFrom, this.cameraTo, this.cameraBlend);
      this.lookAt.copy(this.lookClose);
      this.camera.fov = this.closeFov;
    }

    this.camera.lookAt(this.lookAt);
    this.camera.updateProjectionMatrix();
  }

  nudgeAwayFromChair(position) {
    const chair = this.roomRoot.getObjectByName("Chair");
    if (!chair) {
      return;
    }

    const box = new THREE.Box3().setFromObject(chair);
    box.expandByScalar(0.1);
    const chairCenter = box.getCenter(new THREE.Vector3());
    const toScreen = this.lookClose.clone().sub(position).normalize();
    const ray = new THREE.Ray(position, toScreen);

    if (!box.containsPoint(position) && !ray.intersectsBox(box)) {
      return;
    }

    const away = position.clone().sub(chairCenter);
    away.y = 0;
    if (away.lengthSq() < 0.0001) {
      away.crossVectors(this.screenNormal, new THREE.Vector3(0, 1, 0));
    }
    away.normalize();
    position.addScaledVector(away, 0.32);
    position.y += 0.2;

    const retry = new THREE.Ray(position, this.lookClose.clone().sub(position).normalize());
    if (box.containsPoint(position) || retry.intersectsBox(box)) {
      position.addScaledVector(away, 0.2);
      position.y += 0.16;
    }
  }

  frameRoomCamera() {
    if (this.roomBox.isEmpty()) {
      return;
    }

    const size = this.roomBox.getSize(new THREE.Vector3());
    const center = this.roomBox.getCenter(new THREE.Vector3());
    const padding = 1.08;
    const vFov = THREE.MathUtils.degToRad(this.roomFov);
    const aspect = Math.max(this.camera.aspect, 0.01);
    const dist = Math.max(
      (size.y * 0.5 * padding) / Math.tan(vFov / 2),
      (size.x * 0.5 * padding) / (Math.tan(vFov / 2) * aspect),
    );

    this.lookRoom.copy(center);
    this.lookRoom.y = center.y * 0.78;
    const flower = this.roomRoot.getObjectByName("Flower");
    if (flower) {
      const flowerBox = new THREE.Box3().setFromObject(flower);
      flowerBox.getCenter(this.lookRoom);
    }

    this.cameraRoom.copy(center).addScaledVector(this.screenNormal, dist * 0.42);
    this.cameraRoom.y = center.y + size.y * 0.1;

    const margin = 0.22;
    this.cameraRoom.x = clamp(this.cameraRoom.x, this.roomBox.min.x + margin, this.roomBox.max.x - margin);
    this.cameraRoom.y = clamp(this.cameraRoom.y, this.roomBox.min.y + 0.7, this.roomBox.max.y - margin);
    this.cameraRoom.z = clamp(this.cameraRoom.z, this.roomBox.min.z + margin, this.roomBox.max.z - margin);
  }

  bindInput() {
    this.onPointer = (event) => {
      if (this.playMode === "view" || event.target.closest?.("#mode-toggle")) {
        return;
      }
      if (!this.bootStarted) {
        void this.beginBoot();
        return;
      }
      this.handleTap();
    };
    this.onKey = (event) => {
      if (this.playMode === "view") {
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

  update(delta) {
    if (this.playMode === "view") {
      this.crtMaterial.uniforms.uTime.value += delta;
      this.crtMaterial.uniforms.uPower.value = this.power;
      this.controls?.update();
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

    const textureChanged = this.terminal.update(delta);
    if (textureChanged) {
      this.screenTexture.needsUpdate = true;
    }

    this.crtMaterial.uniforms.uTime.value += delta;
    this.crtMaterial.uniforms.uPower.value = this.power;

    this.applyStoryCamera();
  }

  resize(width, height) {
    this.camera.aspect = width / Math.max(height, 1);
    if (this.laptopScreen) {
      this.placeCloseCamera();
      this.frameRoomCamera();
      this.fitViewLimits();
    }
    if (this.playMode === "interactive") {
      this.applyStoryCamera();
    } else {
      this.camera.updateProjectionMatrix();
      this.controls?.update();
    }
  }

  exit() {
    window.removeEventListener("pointerdown", this.onPointer);
    window.removeEventListener("keydown", this.onKey);
    this.modeToggle?.removeEventListener("pointerdown", this.onModePointer);
    this.controls?.dispose();
    this.game.renderer.toneMapping = this.previousToneMapping;
    this.game.renderer.toneMappingExposure = this.previousExposure;
  }
}
