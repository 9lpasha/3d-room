import * as THREE from "three";

export function mountLaptopDisplay({ laptopScreen, material, screenNormal, previous }) {
  if (previous) {
    previous.removeFromParent();
    previous.geometry.dispose();
  }

  const geometry = laptopScreen.geometry;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const plane = new THREE.PlaneGeometry(box.max.x - box.min.x, box.max.y - box.min.y);

  const inverse = laptopScreen.matrixWorld.clone().invert();
  const localCam = screenNormal.clone().transformDirection(inverse);
  const towardCam = localCam.z >= 0 ? 1 : -1;

  if (towardCam < 0) {
    const uvs = plane.attributes.uv;
    for (let i = 0; i < uvs.count; i += 1) {
      uvs.setX(i, 1 - uvs.getX(i));
    }
    uvs.needsUpdate = true;
  }

  const display = new THREE.Mesh(plane, material);
  display.position.set(
    (box.min.x + box.max.x) / 2,
    (box.min.y + box.max.y) / 2,
    (box.min.z + box.max.z) / 2 + towardCam * 0.0015,
  );
  if (towardCam < 0) {
    display.rotation.y = Math.PI;
  }

  laptopScreen.add(display);
  return display;
}
