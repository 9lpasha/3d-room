import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { clamp, easeInOutCubic, lerp } from "../../game/easing.js";

const YAW_LEFT_LIMIT = THREE.MathUtils.degToRad(30);
const YAW_RIGHT_LIMIT = THREE.MathUtils.degToRad(10);
const PITCH_UP_LIMIT = THREE.MathUtils.degToRad(1);
const MIN_DISTANCE_SCALE = 1;
const MAX_DISTANCE_SCALE = 1;
const DEFAULT_VIEW_POSE = {
  azimuth: "left",
  polar: "up",
};
const POSE_MOVE_SECONDS = 1.15;
const CLOSE_OFFSET = new THREE.Vector3(0, 0.3, -0.2);
const FAR_OFFSET = new THREE.Vector3(0, 0.1, 0);

export class BootCamera {
  constructor() {
    this.closeFov = 38;
    this.roomFov = 36;
    this.camera = new THREE.PerspectiveCamera(this.closeFov, 2 / 3, 0.04, 80);
    this.cameraFrom = new THREE.Vector3();
    this.cameraTo = new THREE.Vector3();
    this.cameraRoom = new THREE.Vector3();
    this.defaultViewPosition = new THREE.Vector3();
    this.lookClose = new THREE.Vector3();
    this.lookRoom = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.screenNormal = new THREE.Vector3(0, 0, 1);
    this.screenUp = new THREE.Vector3(0, 1, 0);
    this.frameHalfWidth = 0.14;
    this.frameHalfHeight = 0.09;
    this.roomBox = new THREE.Box3();
    this.controls = null;
    this.roomRoot = null;
    this.laptopScreen = null;
    this._size = new THREE.Vector3();
    this._holdPosition = new THREE.Vector3();
    this._holdLook = new THREE.Vector3();
    this.poseFrom = new THREE.Vector3();
    this.poseTo = new THREE.Vector3();
    this.poseLookFrom = new THREE.Vector3();
    this.poseLookTo = new THREE.Vector3();
    this.poseTime = 0;
    this.poseDuration = POSE_MOVE_SECONDS;
    this.poseActive = false;
    this._center = new THREE.Vector3();
    this._viewer = new THREE.Vector3();
  }

  aim(laptopScreen, roomRoot) {
    this.laptopScreen = laptopScreen;
    this.roomRoot = roomRoot;

    const screenPos = new THREE.Vector3();
    const screenQuat = new THREE.Quaternion();
    laptopScreen.updateWorldMatrix(true, false);
    laptopScreen.getWorldPosition(screenPos);
    laptopScreen.getWorldQuaternion(screenQuat);

    const geometry = laptopScreen.geometry;
    geometry.computeBoundingBox();
    const localSize = geometry.boundingBox.getSize(this._size);
    const worldScale = new THREE.Vector3();
    laptopScreen.getWorldScale(worldScale);
    this.frameHalfWidth = (localSize.x * worldScale.x) / 2;
    this.frameHalfHeight = (localSize.y * worldScale.y) / 2;

    this.screenUp.set(0, 1, 0).applyQuaternion(screenQuat).normalize();
    const facingA = new THREE.Vector3(0, 0, 1).applyQuaternion(screenQuat).normalize();
    const facingB = facingA.clone().negate();

    this.roomBox.setFromObject(roomRoot);
    const chair = roomRoot.getObjectByName("Chair");
    if (chair) {
      chair.getWorldPosition(this._viewer);
    } else {
      this.roomBox.getCenter(this._viewer);
    }
    this._viewer.sub(screenPos);
    this._viewer.y = 0;
    if (this._viewer.lengthSq() < 0.0001) {
      this._viewer.set(0, 0, -1);
    } else {
      this._viewer.normalize();
    }

    const screenCenter = geometry.boundingBox.getCenter(new THREE.Vector3());
    laptopScreen.localToWorld(screenCenter);

    this.screenNormal.copy(facingA.dot(this._viewer) >= facingB.dot(this._viewer) ? facingA : facingB);
    this.screenNormal.negate();

    this.lookClose.copy(screenCenter);
    this.placeCloseCamera();
    this.frameRoomCamera();
    this.lookAt.copy(this.lookClose);
    this.camera.position.copy(this.cameraFrom);
    this.camera.lookAt(this.lookAt);
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
      .add(CLOSE_OFFSET);

    this.cameraFrom
      .copy(this.lookClose)
      .addScaledVector(this.screenNormal, distFar)
      .addScaledVector(this.screenUp, this.frameHalfHeight * 0.28)
      .add(FAR_OFFSET);

    this.nudgeAwayFromChair(this.cameraFrom);
  }

  nudgeAwayFromChair(position) {
    const chair = this.roomRoot?.getObjectByName("Chair");
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

    const size = this.roomBox.getSize(this._size);
    const center = this.roomBox.getCenter(this._center);
    const padding = 1.08;
    const vFov = THREE.MathUtils.degToRad(this.roomFov);
    const aspect = Math.max(this.camera.aspect, 0.01);
    const dist = Math.max(
      (size.y * 0.5 * padding) / Math.tan(vFov / 2),
      (size.x * 0.5 * padding) / (Math.tan(vFov / 2) * aspect),
    );

    this.lookRoom.copy(center);
    this.lookRoom.y = center.y * 0.78;
    const flower = this.roomRoot?.getObjectByName("Flower");
    if (flower) {
      const flowerCenter = new THREE.Box3().setFromObject(flower).getCenter(new THREE.Vector3());
      this.lookRoom.set(flowerCenter.x - 0.2, flowerCenter.y, flowerCenter.z - 0.2);
    }

    this.cameraRoom.copy(center).addScaledVector(this.screenNormal, dist * 0.42);
    this.cameraRoom.y = center.y + size.y * 0.1;

    const margin = 0.22;
    this.cameraRoom.x = clamp(this.cameraRoom.x, this.roomBox.min.x + margin, this.roomBox.max.x - margin);
    this.cameraRoom.y = clamp(this.cameraRoom.y, this.roomBox.min.y + 0.7, this.roomBox.max.y - margin);
    this.cameraRoom.z = clamp(this.cameraRoom.z, this.roomBox.min.z + margin, this.roomBox.max.z - margin);
  }

  setupControls(canvas) {
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.72;
    this.controls.zoomSpeed = 0.9;
    this.captureDefaultView();
  }

  applyStoryCamera(cameraBlend, pullbackBlend) {
    if (pullbackBlend > 0) {
      this.camera.position.lerpVectors(this.cameraTo, this.defaultViewPosition, pullbackBlend);
      this.lookAt.lerpVectors(this.lookClose, this.lookRoom, pullbackBlend);
      this.camera.fov = lerp(this.closeFov, this.roomFov, pullbackBlend);
    } else {
      this.camera.position.lerpVectors(this.cameraFrom, this.cameraTo, cameraBlend);
      this.lookAt.copy(this.lookClose);
      this.camera.fov = this.closeFov;
    }

    this.camera.lookAt(this.lookAt);
    this.camera.updateProjectionMatrix();
  }

  captureDefaultView() {
    this._holdPosition.copy(this.camera.position);
    this._holdLook.copy(this.lookAt);
    const fov = this.camera.fov;

    this.controls.target.copy(this.lookRoom);
    this.camera.position.copy(this.cameraRoom);
    this.camera.fov = this.roomFov;
    this.camera.lookAt(this.controls.target);
    this.limitOrbitAngles();
    this.placeAtDefaultView();
    this.defaultViewPosition.copy(this.camera.position);

    this.camera.position.copy(this._holdPosition);
    this.lookAt.copy(this._holdLook);
    this.camera.fov = fov;
    this.camera.lookAt(this.lookAt);
    this.camera.updateProjectionMatrix();
  }

  enterViewMode({ useDefaultPose = false } = {}) {
    this._holdPosition.copy(this.camera.position);
    this._holdLook.copy(this.lookAt);
    this.controls.target.copy(this.lookRoom);
    this.camera.fov = this.roomFov;
    this.camera.position.copy(this.cameraRoom);
    this.limitOrbitAngles();

    const destination = useDefaultPose ? this.defaultViewPosition : this.cameraRoom;
    this.camera.position.copy(this._holdPosition);
    this.lookAt.copy(this._holdLook);

    if (!useDefaultPose || this._holdPosition.distanceTo(destination) < 0.002) {
      this.poseActive = false;
      this.camera.position.copy(destination);
      this.lookAt.copy(this.lookRoom);
      this.camera.lookAt(this.lookAt);
      this.camera.updateProjectionMatrix();
      this.controls.enabled = true;
      this.controls.update();
      return;
    }

    this.controls.enabled = false;
    this.camera.lookAt(this.lookAt);
    this.camera.updateProjectionMatrix();
    this.moveTo(destination, this.lookRoom);
  }

  moveTo(position, lookAt, duration = POSE_MOVE_SECONDS) {
    this.poseFrom.copy(this.camera.position);
    this.poseLookFrom.copy(this.lookAt);
    this.poseTo.copy(position);
    this.poseLookTo.copy(lookAt);
    this.poseTime = 0;
    this.poseDuration = duration;
    const samePlace =
      this.poseFrom.distanceTo(this.poseTo) < 0.002 && this.poseLookFrom.distanceTo(this.poseLookTo) < 0.002;
    this.poseActive = !samePlace;
    if (samePlace) {
      this.camera.position.copy(this.poseTo);
      this.lookAt.copy(this.poseLookTo);
      this.camera.lookAt(this.lookAt);
      this.camera.updateProjectionMatrix();
    }
  }

  updatePose(delta) {
    if (!this.poseActive) {
      return false;
    }

    this.poseTime += delta;
    const t = easeInOutCubic(clamp(this.poseTime / this.poseDuration, 0, 1));
    this.camera.position.lerpVectors(this.poseFrom, this.poseTo, t);
    this.lookAt.lerpVectors(this.poseLookFrom, this.poseLookTo, t);
    this.camera.lookAt(this.lookAt);
    this.camera.updateProjectionMatrix();
    if (t >= 1) {
      this.poseActive = false;
    }
    return true;
  }

  placeAtDefaultView() {
    const target = this.controls.target;
    const distance = Math.max(this.camera.position.distanceTo(target), 0.001);
    const azimuth =
      DEFAULT_VIEW_POSE.azimuth === "left" ? this.controls.minAzimuthAngle : this.controls.maxAzimuthAngle;
    const polar = DEFAULT_VIEW_POSE.polar === "up" ? this.controls.minPolarAngle : this.controls.maxPolarAngle;

    this._viewer.setFromSphericalCoords(distance, polar, azimuth);
    this.camera.position.copy(target).add(this._viewer);
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
  }

  limitOrbitAngles() {
    const offset = this._viewer.copy(this.camera.position).sub(this.controls.target);
    const distance = Math.max(offset.length(), 0.001);
    const azimuth = Math.atan2(offset.x, offset.z);
    this.controls.minAzimuthAngle = azimuth - YAW_LEFT_LIMIT;
    this.controls.maxAzimuthAngle = azimuth + YAW_RIGHT_LIMIT;

    const polar = Math.acos(THREE.MathUtils.clamp(offset.y / distance, -1, 1));
    this.controls.minPolarAngle = Math.max(0, polar - PITCH_UP_LIMIT);
    this.controls.maxPolarAngle = Math.min(0, polar - PITCH_UP_LIMIT);
    this.controls.minDistance = distance * MIN_DISTANCE_SCALE;
    this.controls.maxDistance = distance * MAX_DISTANCE_SCALE;
  }

  enterInteractiveMode(cameraBlend, pullbackBlend) {
    this.controls.enabled = false;
    if (pullbackBlend >= 1) {
      this.camera.fov = this.roomFov;
      this.moveTo(this.defaultViewPosition, this.lookRoom);
      return;
    }

    this.poseActive = false;
    this.applyStoryCamera(cameraBlend, pullbackBlend);
  }

  setControlsEnabled(enabled) {
    if (this.controls) {
      this.controls.enabled = enabled;
    }
  }

  resize(width, height, playMode, cameraBlend, pullbackBlend) {
    this.camera.aspect = width / Math.max(height, 1);
    if (this.laptopScreen) {
      this.placeCloseCamera();
      this.frameRoomCamera();
    }
    if (playMode === "interactive") {
      if (!this.poseActive) {
        this.applyStoryCamera(cameraBlend, pullbackBlend);
      }
      return;
    }
    this.camera.updateProjectionMatrix();
    this.controls?.update();
  }

  dispose() {
    this.controls?.dispose();
    this.controls = null;
  }
}
