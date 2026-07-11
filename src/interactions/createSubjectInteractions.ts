import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import {
  BLUE_DRESS_HOVER_IDLE_SECONDS,
  BLUE_DRESS_HOVER_TURN_RESPONSE,
  BLUE_DRESS_HOVER_YAW_LIMIT,
  BLUE_DRESS_RETURN_EASE,
  BLUE_DRESS_ROTATION_EASE,
  CAMERA_BACK_DISTANCE_MULTIPLIER,
  CAMERA_MAX_LIFT,
  CAMERA_VERTICAL_EASE,
  CAMERA_VERTICAL_RESPONSE,
  FOCUS_MAX_LIFT,
  MEW_SCROLL_ROTATION_EASE,
  MEW_SCROLL_TRIGGER_PROGRESS,
  MEW_SCROLL_VIEWPORT_FACTOR,
  SUBJECT_YAW_EASE,
  SUBJECT_YAW_RANGE,
  SUBJECT_YAW_RESPONSE,
  SUBJECT_YAW_WIND_DRIFT,
} from '../app/experienceConstants';
import type { BlueDressHoverState, FullDressRecord, MewHoloScrollState, PointerWindState, SubjectMotionState } from '../app/experienceTypes';
import { DRESS_ASSET_ORDER, type DressAssetId } from '../config/dresses';
import type { CycloramaBackgroundPresetId } from '../config/themes';
import type { DressWindSettings } from '../shaders/dressWindMaterial';
import { clamp01, clampSigned } from '../utils/math';

export type SubjectInteractionOptions = {
  canvasElement: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  focusTarget: THREE.Vector3;
  settings: DressWindSettings;
  pointerWind: PointerWindState;
  blueDressHover: BlueDressHoverState;
  mewHoloScroll: MewHoloScrollState;
  subjectMotion: SubjectMotionState;
  getThemeId: () => CycloramaBackgroundPresetId;
  getDressId: () => DressAssetId;
  getActiveDress: () => FullDressRecord | null;
  loadDressAsset: (assetId: DressAssetId) => Promise<void>;
  findGhostAssetAtNormalized: (x: number, y: number) => DressAssetId | null;
  spawnPhotoPrint: (x: number, y: number, movementX: number, movementY: number, now: number) => void;
};

export function createSubjectInteractions(options: SubjectInteractionOptions) {
  const {
    canvasElement, camera, controls, focusTarget, settings, pointerWind,
    blueDressHover, mewHoloScroll, subjectMotion, getThemeId, getDressId,
    getActiveDress, loadDressAsset,
    findGhostAssetAtNormalized, spawnPhotoPrint,
  } = options;
  const activeDressRaycaster = new THREE.Raycaster();
  const activeDressPointer = new THREE.Vector2();
  const pointerSample = new THREE.Vector2();
  const zeroWind = new THREE.Vector3();
  const safeCameraViewOffset = new THREE.Vector3();
  const isHoloScrollTheme = (preset = getThemeId()) => preset === 'mew-holo' || preset === 'tabla-rasa';

  function updatePointerWind(delta: number) {
    const now = performance.now() * 0.001;
    const idleTime = pointerWind.hasPointer ? now - pointerWind.lastMoveTime : Number.POSITIVE_INFINITY;
  
    if (idleTime > 0.045) {
      // `lerp(target, t)` mutates the vector toward the target. Exponential t
      // produces a smooth physical-feeling decay rather than an abrupt stop.
      const targetFade = 1 - Math.exp(-delta * settings.fadeSpeed * 1.2);
      pointerWind.targetWind.lerp(zeroWind, targetFade);
    }
  
    const follow = 1 - Math.exp(-delta * settings.followSpeed);
    pointerWind.wind.lerp(pointerWind.targetWind, follow);
  
    if (idleTime > 0.08) {
      pointerWind.activity *= Math.exp(-delta * settings.fadeSpeed);
    }
  
    if (pointerWind.activity < 0.002) {
      pointerWind.activity = 0;
    }
  
    if (pointerWind.targetWind.lengthSq() < 0.000001) {
      pointerWind.targetWind.set(0, 0, 0);
    }
  }

  function updateSubjectMotion(delta: number) {
    // Signal Black reuses Blue's "hold yaw at 0" behavior so the dress doesn't
    // swing toward the cursor when the user clicks nodes in the left pane.
    if (getThemeId() === 'blue' || getThemeId() === 'signal-black') {
      updateBlueSubjectMotion(delta);
      return;
    }
  
    if (isHoloScrollTheme()) {
      updateMewHoloScrollSubjectMotion(delta);
      return;
    }
  
    const activity = clamp01(pointerWind.activity);
    const pointerYaw = (pointerWind.gustCenter.x - 0.5) * SUBJECT_YAW_RANGE * SUBJECT_YAW_RESPONSE;
    const yawDrift = pointerWind.wind.x * activity * delta * SUBJECT_YAW_WIND_DRIFT;
    subjectMotion.targetYaw = THREE.MathUtils.lerp(
      subjectMotion.targetYaw,
      pointerYaw,
      1 - Math.exp(-delta * 3.4),
    );
    subjectMotion.targetYaw += yawDrift;
    subjectMotion.yaw = THREE.MathUtils.lerp(
      subjectMotion.yaw,
      subjectMotion.targetYaw,
      1 - Math.exp(-delta * SUBJECT_YAW_EASE),
    );
  
    if (subjectMotion.pivot) {
      subjectMotion.pivot.rotation.y = subjectMotion.yaw;
    }
  
    const verticalActivity = 0.25 + activity * 0.75;
    subjectMotion.targetCameraLift = THREE.MathUtils.clamp(
      pointerWind.wind.y * verticalActivity * CAMERA_VERTICAL_RESPONSE,
      -CAMERA_MAX_LIFT,
      CAMERA_MAX_LIFT,
    );
    subjectMotion.cameraLift = THREE.MathUtils.lerp(
      subjectMotion.cameraLift,
      subjectMotion.targetCameraLift,
      1 - Math.exp(-delta * CAMERA_VERTICAL_EASE),
    );
  
    applySafeCameraMotion();
  }

  function updateMewHoloScrollSubjectMotion(delta: number) {
    mewHoloScroll.progress = THREE.MathUtils.lerp(
      mewHoloScroll.progress,
      mewHoloScroll.targetProgress,
      1 - Math.exp(-delta * MEW_SCROLL_ROTATION_EASE),
    );
  
    if (Math.abs(mewHoloScroll.progress - mewHoloScroll.targetProgress) < 0.0015) {
      mewHoloScroll.progress = mewHoloScroll.targetProgress;
    }
  
    subjectMotion.targetYaw = mewHoloScroll.progress * Math.PI;
    subjectMotion.yaw = subjectMotion.targetYaw;
  
    if (subjectMotion.pivot) {
      subjectMotion.pivot.rotation.y = subjectMotion.yaw;
    }
  
    subjectMotion.targetCameraLift = 0;
    subjectMotion.cameraLift = THREE.MathUtils.lerp(
      subjectMotion.cameraLift,
      0,
      1 - Math.exp(-delta * CAMERA_VERTICAL_EASE),
    );
    applySafeCameraMotion();
  
    if (
      !mewHoloScroll.switching &&
      mewHoloScroll.targetProgress >= 1 &&
      mewHoloScroll.progress >= MEW_SCROLL_TRIGGER_PROGRESS
    ) {
      void advanceMewHoloScrollDress();
    }
  }

  function updateBlueSubjectMotion(delta: number) {
    const now = performance.now() * 0.001;
    const movingOverDress = blueDressHover.overActiveDress && now - blueDressHover.lastMoveTime < BLUE_DRESS_HOVER_IDLE_SECONDS;
  
    if (!movingOverDress) {
      subjectMotion.targetYaw = THREE.MathUtils.lerp(
        subjectMotion.targetYaw,
        0,
        1 - Math.exp(-delta * BLUE_DRESS_RETURN_EASE),
      );
    }
  
    subjectMotion.yaw = THREE.MathUtils.lerp(
      subjectMotion.yaw,
      subjectMotion.targetYaw,
      1 - Math.exp(-delta * BLUE_DRESS_ROTATION_EASE),
    );
  
    if (subjectMotion.pivot) {
      subjectMotion.pivot.rotation.y = subjectMotion.yaw;
    }
  
    subjectMotion.targetCameraLift = 0;
    subjectMotion.cameraLift = THREE.MathUtils.lerp(
      subjectMotion.cameraLift,
      0,
      1 - Math.exp(-delta * CAMERA_VERTICAL_EASE),
    );
    applySafeCameraMotion();
  }

  function resetDressWind() {
    pointerWind.targetWind.set(0, 0, 0);
    pointerWind.wind.set(0, 0, 0);
    pointerWind.activity = 0;
    pointerWind.speed = 0;
    pointerWind.hasPointer = false;
    blueDressHover.overActiveDress = false;
    blueDressHover.lastMoveTime = Number.NEGATIVE_INFINITY;
    delete canvasElement.dataset.interactionCursor;
    subjectMotion.targetYaw = 0;
    subjectMotion.targetCameraLift = 0;
  }

  function resetMewHoloScrollRotation(applyToSubject = true) {
    mewHoloScroll.progress = 0;
    mewHoloScroll.targetProgress = 0;
    mewHoloScroll.touchY = null;
  
    if (!applyToSubject) {
      return;
    }
  
    subjectMotion.targetYaw = 0;
    subjectMotion.yaw = 0;
    subjectMotion.targetCameraLift = 0;
  
    if (subjectMotion.pivot) {
      subjectMotion.pivot.rotation.y = 0;
    }
  
    applySafeCameraMotion();
  }

  function applyMewHoloScrollDelta(deltaPixels: number) {
    if (!isHoloScrollTheme() || mewHoloScroll.switching || Math.abs(deltaPixels) < 0.5) {
      return false;
    }
  
    const scrollDistance = Math.max(360, window.innerHeight * MEW_SCROLL_VIEWPORT_FACTOR);
    mewHoloScroll.targetProgress = THREE.MathUtils.clamp(
      mewHoloScroll.targetProgress + deltaPixels / scrollDistance,
      0,
      1,
    );
  
    return true;
  }

  function normalizeWheelDelta(event: WheelEvent) {
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      return event.deltaY * window.innerHeight;
    }
  
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      return event.deltaY * 16;
    }
  
    return event.deltaY;
  }

  function shouldIgnoreMewHoloScrollEvent(event: Event) {
    const target = event.target instanceof Element ? event.target : null;
    return Boolean(target?.closest('.background-switcher, button, input, select, textarea'));
  }

  async function advanceMewHoloScrollDress() {
    const activeId = getActiveDress()?.asset.id ?? getDressId();
    const activeIndex = DRESS_ASSET_ORDER.indexOf(activeId);
    const nextAssetId = DRESS_ASSET_ORDER[(Math.max(0, activeIndex) + 1) % DRESS_ASSET_ORDER.length];
  
    if (!nextAssetId || nextAssetId === activeId) {
      resetMewHoloScrollRotation();
      return;
    }
  
    mewHoloScroll.switching = true;
  
    try {
      await loadDressAsset(nextAssetId);
    } catch (error) {
      console.warn('Failed to advance Mew Holo dress from scroll', error);
    } finally {
      mewHoloScroll.switching = false;
  
      if (isHoloScrollTheme()) {
        resetMewHoloScrollRotation();
      } else {
        resetMewHoloScrollRotation(false);
      }
    }
  }

  function handleMewHoloWheel(event: WheelEvent) {
    if (shouldIgnoreMewHoloScrollEvent(event)) {
      return;
    }
  
    if (applyMewHoloScrollDelta(normalizeWheelDelta(event))) {
      event.preventDefault();
    }
  }

  function handleMewHoloTouchStart(event: TouchEvent) {
    if (!isHoloScrollTheme() || shouldIgnoreMewHoloScrollEvent(event) || event.touches.length === 0) {
      mewHoloScroll.touchY = null;
      return;
    }
  
    mewHoloScroll.touchY = event.touches[0].clientY;
  }

  function handleMewHoloTouchMove(event: TouchEvent) {
    if (!isHoloScrollTheme() || shouldIgnoreMewHoloScrollEvent(event) || event.touches.length === 0 || mewHoloScroll.touchY === null) {
      return;
    }
  
    const nextTouchY = event.touches[0].clientY;
    const deltaPixels = mewHoloScroll.touchY - nextTouchY;
    mewHoloScroll.touchY = nextTouchY;
  
    if (applyMewHoloScrollDelta(deltaPixels)) {
      event.preventDefault();
    }
  }

  function handleMewHoloTouchEnd() {
    mewHoloScroll.touchY = null;
  }

  function handlePointerMove(event: PointerEvent) {
    const bounds = canvasElement.getBoundingClientRect();
    const x = clamp01((event.clientX - bounds.left) / bounds.width);
    const y = clamp01(1 - (event.clientY - bounds.top) / bounds.height);
    const now = performance.now() * 0.001;
    updateCanvasInteractionCursor(x, y);
  
    if (!pointerWind.hasPointer) {
      pointerWind.previous.set(x, y);
      pointerWind.gustCenter.set(x, y);
      pointerWind.lastSampleTime = now;
      pointerWind.lastMoveTime = now;
      pointerWind.hasPointer = true;
      updateBlueDressHoverFromPointer(x, y, 0, now);
      spawnPhotoPrint(x, y, x < 0.5 ? 0.72 : -0.72, 0.12, now);
      return;
    }
  
    const rawMovementX = x - pointerWind.previous.x;
    const sampleDelta = Math.max(1 / 120, now - pointerWind.lastSampleTime);
    const movementX = (x - pointerWind.previous.x) / sampleDelta;
    const movementY = (y - pointerWind.previous.y) / sampleDelta;
    pointerWind.speed = Math.hypot(movementX, movementY);
    pointerWind.previous.set(x, y);
    pointerWind.gustCenter.lerp(pointerSample.set(x, y), 0.72);
    pointerWind.lastMoveTime = now;
    pointerWind.lastSampleTime = now;
  
    const windX = clampSigned(movementX * 0.12, 1.35);
    const windY = clampSigned(movementY * 0.11, 0.62);
    const windZ = clampSigned(Math.abs(movementX) * 0.018 + Math.abs(movementY) * 0.01, 0.34);
    pointerWind.targetWind.set(windX, windY, windZ);
    pointerWind.activity = Math.max(pointerWind.activity, clamp01(0.18 + pointerWind.speed * 0.1));
    spawnPhotoPrint(x, y, movementX, movementY, now);
    updateBlueDressHoverFromPointer(x, y, rawMovementX, now);
  }

  function handlePointerLeave() {
    pointerWind.lastMoveTime = performance.now() * 0.001 - 0.12;
    pointerWind.targetWind.set(0, 0, 0);
    blueDressHover.overActiveDress = false;
    delete canvasElement.dataset.interactionCursor;
  }

  function updateCanvasInteractionCursor(x: number, y: number) {
    const ghostAssetId = findGhostAssetAtNormalized(x, y);
    if (ghostAssetId && ghostAssetId !== getDressId()) {
      canvasElement.dataset.interactionCursor = 'ghost';
      return;
    }
  
    const activeDress = getActiveDress();
    if (activeDress) {
      activeDressPointer.set(x * 2 - 1, y * 2 - 1);
      activeDressRaycaster.setFromCamera(activeDressPointer, camera);
      activeDress.loaded.dress.updateMatrixWorld(true);

      const overActiveDress = activeDressRaycaster
        .intersectObject(activeDress.loaded.dress, true)
        .some((intersection) => (intersection.object as THREE.Mesh).isMesh);
  
      if (overActiveDress) {
        canvasElement.dataset.interactionCursor = 'dress';
        return;
      }
    }
  
    delete canvasElement.dataset.interactionCursor;
  }

  function updateBlueDressHoverFromPointer(x: number, y: number, movementX: number, now: number) {
    // Signal Black piggybacks on Blue's hover-to-rotate behavior so hovering the
    // dress in the right pane spins it, but moving the cursor anywhere else
    // (including the graph nodes in the left pane) leaves it facing forward.
    const activeDress = getActiveDress();
    const themeId = getThemeId();
    if ((themeId !== 'blue' && themeId !== 'signal-black') || !activeDress) {
      blueDressHover.overActiveDress = false;
      return;
    }
  
    activeDressPointer.set(x * 2 - 1, y * 2 - 1);
    activeDressRaycaster.setFromCamera(activeDressPointer, camera);
    activeDress.loaded.dress.updateMatrixWorld(true);
    const intersections = activeDressRaycaster.intersectObject(activeDress.loaded.dress, true);
    const overDress = intersections.some((intersection) => {
      const mesh = intersection.object as THREE.Mesh;
      return mesh.isMesh;
    });
  
    blueDressHover.overActiveDress = overDress;
  
    if (!overDress || Math.abs(movementX) < 0.0005) {
      return;
    }
  
    blueDressHover.lastMoveTime = now;
    subjectMotion.targetYaw = THREE.MathUtils.clamp(
      subjectMotion.targetYaw + movementX * BLUE_DRESS_HOVER_TURN_RESPONSE,
      -BLUE_DRESS_HOVER_YAW_LIMIT,
      BLUE_DRESS_HOVER_YAW_LIMIT,
    );
  }

  function applySafeCameraMotion() {
    const baseCameraY = subjectMotion.baseCameraPosition.y;
    const baseFocusY = subjectMotion.baseFocusTarget.y;
    // Focus→camera is a view-offset vector. Scaling it changes distance without
    // changing the intended viewing direction.
    const baseViewOffset = safeCameraViewOffset.copy(subjectMotion.baseCameraPosition).sub(subjectMotion.baseFocusTarget);
    const backAmount = getBackViewAmount(subjectMotion.yaw);
    const distanceMultiplier = THREE.MathUtils.lerp(1, CAMERA_BACK_DISTANCE_MULTIPLIER, backAmount);
    const scaledViewOffset = baseViewOffset.multiplyScalar(distanceMultiplier);
  
    camera.position.copy(subjectMotion.baseFocusTarget).add(scaledViewOffset);
    camera.position.y = THREE.MathUtils.clamp(
      baseCameraY + subjectMotion.cameraLift,
      baseCameraY - CAMERA_MAX_LIFT,
      baseCameraY + CAMERA_MAX_LIFT,
    );
  
    focusTarget.copy(subjectMotion.baseFocusTarget);
    focusTarget.y = THREE.MathUtils.clamp(
      baseFocusY + subjectMotion.cameraLift * 0.12,
      baseFocusY - FOCUS_MAX_LIFT,
      baseFocusY + FOCUS_MAX_LIFT,
    );
    controls.target.copy(focusTarget);
    // OrbitControls writes the camera orientation that looks toward this target.
    controls.update();
  }

  function getBackViewAmount(yaw: number) {
    const backFacing = (1 - Math.cos(yaw)) * 0.5;
    return THREE.MathUtils.smoothstep(backFacing, 0.04, 1);
  }

  return {
    updatePointerWind,
    updateSubjectMotion,
    resetDressWind,
    resetMewHoloScrollRotation,
    handleMewHoloWheel,
    handleMewHoloTouchStart,
    handleMewHoloTouchMove,
    handleMewHoloTouchEnd,
    handlePointerMove,
    handlePointerLeave,
    applySafeCameraMotion,
  };
}
