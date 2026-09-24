import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { isChromeEvent } from "../../ui/dom.js";
import { inspectIds, inspectText } from "./inspectConfig.js";

const CLICK_MOVE_LIMIT_SQ = 64;

function emptyGroups() {
  return Object.fromEntries(inspectIds().map((id) => [id, []]));
}

export class InspectSystem {
  constructor({ threeScene, camera, renderer, canvas, getPlayMode, cameraRig }) {
    this.threeScene = threeScene;
    this.camera = camera;
    this.renderer = renderer;
    this.canvas = canvas;
    this.getPlayMode = getPlayMode;
    this.cameraRig = cameraRig;

    this.modal = document.querySelector("#inspect-modal");
    this.text = document.querySelector("#inspect-modal-text");
    this.closeButton = document.querySelector("#inspect-modal-close");
    this.open = false;
    this.hoveredId = null;
    this.pointerNdc = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.targets = [];
    this.groups = emptyGroups();
    this.pointerDown = null;
    this.composer = null;
    this.outlinePass = null;
  }

  setup(roomRoot, displayMesh) {
    this.targets = [];
    this.groups = emptyGroups();

    roomRoot.traverse((child) => {
      const inspectId = child.userData.inspectId;
      if (!child.isMesh || !inspectId) {
        return;
      }
      this.groups[inspectId].push(child);
      this.targets.push(child);
    });

    if (displayMesh) {
      displayMesh.userData.inspectId = "laptop";
      this.groups.laptop.push(displayMesh);
      this.targets.push(displayMesh);
    }

    this.setupComposer();
  }

  setupComposer() {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    const renderTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: Math.min(4, this.renderer.capabilities.maxSamples),
    });
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(size.x, size.y);
    this.composer.addPass(new RenderPass(this.threeScene, this.camera));

    this.outlinePass = new OutlinePass(size, this.threeScene, this.camera);
    this.outlinePass.edgeStrength = 8.5;
    this.outlinePass.edgeGlow = 0.75;
    this.outlinePass.edgeThickness = 3.2;
    this.outlinePass.pulsePeriod = 0;
    this.outlinePass.visibleEdgeColor.set(0xb5ffe0);
    this.outlinePass.hiddenEdgeColor.set(0x3f8f68);
    this.outlinePass.selectedObjects = [];
    this.composer.addPass(this.outlinePass);
    this.composer.addPass(new OutputPass());
  }

  bind() {
    this.onMove = (event) => {
      if (this.open || isChromeEvent(event)) {
        return;
      }
      const inspectId = this.hitId(event);
      this.setHovered(this.canInspect(inspectId) ? inspectId : null);
    };
    this.onDown = (event) => {
      if (isChromeEvent(event)) {
        this.pointerDown = null;
        return;
      }
      const inspectId = this.hitId(event);
      this.pointerDown = {
        x: event.clientX,
        y: event.clientY,
        inspectId: this.canInspect(inspectId) ? inspectId : null,
      };
    };
    this.onUp = (event) => {
      const down = this.pointerDown;
      this.pointerDown = null;
      if (!down?.inspectId || this.open || isChromeEvent(event)) {
        return;
      }
      const dx = event.clientX - down.x;
      const dy = event.clientY - down.y;
      if (dx * dx + dy * dy > CLICK_MOVE_LIMIT_SQ) {
        return;
      }
      const inspectId = this.hitId(event);
      if (inspectId === down.inspectId) {
        this.openModal(inspectId);
      }
    };
    this.onLeave = () => {
      if (!this.open) {
        this.setHovered(null);
      }
    };
    this.onClose = (event) => {
      event.stopPropagation();
      this.closeModal();
    };
    this.onBackdrop = (event) => {
      if (!this.open || event.target.closest(".inspect-modal-dialog")) {
        return;
      }
      this.closeModal();
    };
    this.onKey = (event) => {
      if (event.key !== "Escape" || !this.open) {
        return false;
      }
      event.preventDefault();
      this.closeModal();
      return true;
    };

    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointerleave", this.onLeave);
    window.addEventListener("pointerup", this.onUp);
    this.closeButton?.addEventListener("click", this.onClose);
    document.addEventListener("pointerdown", this.onBackdrop);
  }

  unbind() {
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointerleave", this.onLeave);
    window.removeEventListener("pointerup", this.onUp);
    this.closeButton?.removeEventListener("click", this.onClose);
    document.removeEventListener("pointerdown", this.onBackdrop);
    this.canvas.style.cursor = "";
  }

  setPointerFromEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    this.pointerNdc.x = ((event.clientX - rect.left) / width) * 2 - 1;
    this.pointerNdc.y = -((event.clientY - rect.top) / height) * 2 + 1;
  }

  hitId(event) {
    if (!this.targets.length) {
      return null;
    }

    this.setPointerFromEvent(event);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.targets, false);
    return hits[0]?.object.userData.inspectId ?? null;
  }

  canInspect(inspectId) {
    if (!inspectId || this.open) {
      return false;
    }
    if (this.getPlayMode() === "interactive" && inspectId === "laptop") {
      return false;
    }
    return true;
  }

  setHovered(inspectId) {
    if (this.hoveredId === inspectId) {
      this.canvas.style.cursor = inspectId ? "pointer" : "";
      return;
    }

    this.hoveredId = inspectId;
    this.canvas.style.cursor = inspectId ? "pointer" : "";

    if (this.outlinePass) {
      this.outlinePass.selectedObjects = inspectId ? this.groups[inspectId] : [];
    }
  }

  openModal(inspectId) {
    if (!this.canInspect(inspectId) || !this.modal || !this.text) {
      return;
    }

    this.open = true;
    this.text.textContent = inspectText(inspectId);
    this.modal.hidden = false;
    this.setHovered(inspectId);
    if (this.getPlayMode() === "view") {
      this.cameraRig.setControlsEnabled(false);
    }
    this.closeButton?.focus();
  }

  closeModal() {
    if (!this.open) {
      return;
    }

    this.open = false;
    if (this.modal) {
      this.modal.hidden = true;
    }
    if (this.getPlayMode() === "view") {
      this.cameraRig.setControlsEnabled(true);
    }
  }

  render() {
    if (!this.composer || !this.hoveredId) {
      return false;
    }

    this.composer.render();
    return true;
  }

  resize(width, height) {
    if (!this.composer) {
      return;
    }
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
  }

  dispose() {
    this.unbind();
    this.composer?.dispose();
    this.composer = null;
    this.outlinePass = null;
  }
}
