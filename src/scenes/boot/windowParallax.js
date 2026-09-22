import * as THREE from "three";

const COVER = 1.16;
const DEFAULT_SCALE = 1;
const PARALLAX = 0.4;
const REST_RIGHT = 0.3;
const REST_DOWN = 0.27;

export function createWindowMaterial(map) {
  const material = new THREE.MeshBasicMaterial({
    map,
    side: THREE.DoubleSide,
  });
  const offset = { value: new THREE.Vector2() };
  const scale = { value: DEFAULT_SCALE };

  material.customProgramCacheKey = () => "window-parallax";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindowOffset = offset;
    shader.uniforms.uWindowScale = scale;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      /* glsl */ `
        #include <uv_vertex>
        vMapUv = (vMapUv - 0.5) * uWindowScale + 0.5 + uWindowOffset;
      `,
    );
    shader.vertexShader = `uniform vec2 uWindowOffset;\nuniform float uWindowScale;\n${shader.vertexShader}`;
  };

  return { material, offset, scale };
}

export class WindowParallax {
  constructor(object, uniforms) {
    this.object = object;
    this.offset = uniforms.offset;
    this.scale = uniforms.scale;
    this.restPosition = object.position.clone();
    this.restScale = object.scale.clone();
    object.scale.multiplyScalar(COVER);

    this.center = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.viewRight = new THREE.Vector3();
    this.viewUp = new THREE.Vector3();
    this.referenceLateral = new THREE.Vector2();

    this._toCamera = new THREE.Vector3();
    this._worldPoint = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
  }

  setReference(position) {
    this.object.updateWorldMatrix(true, false);
    this.object.getWorldPosition(this.center);
    this.object.getWorldQuaternion(this._quat);
    this.object.geometry.computeBoundingBox();
    const size = this.object.geometry.boundingBox.getSize(new THREE.Vector3());
    const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
    const lengths = [size.x, size.y, size.z];
    const normalIndex = lengths.indexOf(Math.min(lengths[0], lengths[1], lengths[2]));
    const tangentIndex = (normalIndex + 1) % 3;
    const bitangentIndex = (normalIndex + 2) % 3;
    this.right.copy(axes[tangentIndex]).applyQuaternion(this._quat).normalize();
    this.up.copy(axes[bitangentIndex]).applyQuaternion(this._quat).normalize();
    this.normal.copy(axes[normalIndex]).applyQuaternion(this._quat).normalize();

    this._toCamera.copy(position).sub(this.center);
    if (this.normal.dot(this._toCamera) < 0) {
      this.normal.negate();
    }

    const worldUp = new THREE.Vector3(0, 1, 0);
    this.viewRight.crossVectors(worldUp, this.normal);
    if (this.viewRight.lengthSq() < 1e-8) {
      this.viewRight.set(1, 0, 0);
    }
    this.viewRight.normalize();
    this.viewUp.crossVectors(this.normal, this.viewRight).normalize();
    if (this.viewUp.dot(worldUp) < 0) {
      this.viewUp.negate();
      this.viewRight.negate();
    }

    this.referenceLateral.set(this._toCamera.dot(this.right), this._toCamera.dot(this.up));
    this.scale.value = DEFAULT_SCALE;
    this.offset.value.set(0, 0);
  }

  update(camera) {
    this._toCamera.copy(camera.position).sub(this.center);
    const shiftX = (this._toCamera.dot(this.right) - this.referenceLateral.x) * PARALLAX;
    const shiftY = (this._toCamera.dot(this.up) - this.referenceLateral.y) * PARALLAX;

    this._worldPoint
      .copy(this.center)
      .addScaledVector(this.right, shiftX)
      .addScaledVector(this.up, shiftY)
      .addScaledVector(this.viewRight, REST_RIGHT)
      .addScaledVector(this.viewUp, -REST_DOWN);
    this.object.parent.worldToLocal(this._worldPoint);
    this.object.position.copy(this._worldPoint);
    this.scale.value = DEFAULT_SCALE;
  }
}
