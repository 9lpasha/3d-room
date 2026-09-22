import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import bakedUrl from "../../assets/baked-0.75.jpg";
import macUrl from "../../assets/baked-mac.jpg";
import posterUrl from "../../assets/poster.jpg";
import roomUrl from "../../assets/room_corner.glb?url";
import windowViewUrl from "../../assets/window-view.jpg";
import { INSPECT_PARENTS } from "./inspectConfig.js";
import { createWindowMaterial } from "./windowParallax.js";

function isUnder(object, name) {
  let node = object;
  while (node) {
    if (node.name === name) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

function prepareMap(texture, channel) {
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.channel = channel;
}

function hazeWindowMap(texture) {
  const image = texture.image;
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);
  ctx.fillStyle = "rgba(255, 255, 255, 0.48)";
  ctx.fillRect(0, 0, width, height);

  const hazed = new THREE.CanvasTexture(canvas);
  prepareMap(hazed, 2);
  return hazed;
}

const LAMP_MATERIALS = new Set(["LampMetal", "LampInner", "LampShade"]);

export function tagInspectable(object, roomRoot) {
  let node = object;
  while (node && node !== roomRoot) {
    const inspectId = INSPECT_PARENTS[node.name];
    if (inspectId) {
      object.userData.inspectId = inspectId;
      return;
    }
    node = node.parent;
  }
}

function materialNameOf(mesh) {
  return Array.isArray(mesh.material) ? mesh.material[0]?.name : mesh.material?.name;
}

export async function loadBootRoom(threeScene, onProgress) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => {
    onProgress?.(total > 0 ? loaded / total : 0);
  };

  const textureLoader = new THREE.TextureLoader(manager);
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("/draco/");
  dracoLoader.preload();

  const gltfLoader = new GLTFLoader(manager);
  gltfLoader.setDRACOLoader(dracoLoader);

  const [baked, macMap, posterMap, windowMap, gltf] = await Promise.all([
    textureLoader.loadAsync(bakedUrl),
    textureLoader.loadAsync(macUrl),
    textureLoader.loadAsync(posterUrl),
    textureLoader.loadAsync(windowViewUrl),
    gltfLoader.loadAsync(roomUrl),
  ]);

  baked.flipY = false;
  baked.colorSpace = THREE.SRGBColorSpace;
  baked.anisotropy = 8;
  prepareMap(macMap, 0);
  prepareMap(posterMap, 1);

  const bakedMaterial = new THREE.MeshBasicMaterial({ map: baked });
  const macMaterial = new THREE.MeshBasicMaterial({ map: macMap, side: THREE.DoubleSide });
  const posterMaterial = new THREE.MeshBasicMaterial({ map: posterMap, side: THREE.DoubleSide });
  const windowUniforms = createWindowMaterial(hazeWindowMap(windowMap));
  const windowMaterial = windowUniforms.material;
  const roomRoot = gltf.scene;
  threeScene.add(roomRoot);

  let laptopScreen = null;
  let windowView = null;

  roomRoot.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    if (!child.material || child.name.startsWith("Плоскость")) {
      child.visible = false;
      return;
    }

    tagInspectable(child, roomRoot);

    if (isUnder(child, "WindowView")) {
      child.material = windowMaterial;
      windowView = child;
      return;
    }

    if (isUnder(child, "Poster")) {
      child.material = posterMaterial;
      return;
    }

    const materialName = materialNameOf(child);
    if (materialName === "Screen") {
      laptopScreen = child;
      child.material = new THREE.MeshBasicMaterial({ color: 0x050505 });
      return;
    }

    if (isUnder(child, "Mac")) {
      child.material = macMaterial;
      return;
    }

    if (LAMP_MATERIALS.has(materialName)) {
      child.material = new THREE.MeshBasicMaterial({ map: baked, side: THREE.DoubleSide });
      return;
    }

    child.material = bakedMaterial;
  });

  if (!laptopScreen) {
    throw new Error("Laptop screen mesh not found in room_corner.glb");
  }

  return { roomRoot, laptopScreen, windowView, windowUniforms };
}
