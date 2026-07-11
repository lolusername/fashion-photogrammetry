import * as THREE from 'three';
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';

import { usesSingleContextMewLayout } from '../app/renderProfile';
import type { SubjectMotionState } from '../app/experienceTypes';
import type { CycloramaBackgroundPresetId } from '../config/themes';
import { resizeEffectComposer } from './effects/subjectBloom';

export type ViewportControllerOptions = {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  camera: THREE.PerspectiveCamera;
  focusTarget: THREE.Vector3;
  subjectMotion: SubjectMotionState;
  bokehUniforms: Record<string, THREE.IUniform<number>>;
  getThemeId: () => CycloramaBackgroundPresetId;
  getPixelRatio: () => number;
  isDisposed: () => boolean;
  ensureMewForegroundPipeline: () => unknown;
  disposeMewForegroundPipeline: () => void;
  queueMewTitleUpdate: () => void;
  resizeDressTransition: (width: number, height: number) => void;
  resizeMewRendering: (width: number, height: number) => void;
  applyThemeSubjectPlacement: () => void;
  applySafeCameraMotion: () => void;
  updateInfiniteBackdropScale: () => void;
  scheduleGhosts: () => void;
  renderDressThumbnails: () => void;
  renderThemePortal: () => void;
  buildSignalDiptych: () => void;
};

export function createViewportController(options: ViewportControllerOptions) {
  const {
    canvas,
    renderer,
    composer,
    camera,
    focusTarget,
    subjectMotion,
    bokehUniforms,
    getThemeId,
    getPixelRatio,
    isDisposed,
    ensureMewForegroundPipeline,
    disposeMewForegroundPipeline,
    queueMewTitleUpdate,
    resizeDressTransition,
    resizeMewRendering,
    applyThemeSubjectPlacement,
    applySafeCameraMotion,
    updateInfiniteBackdropScale,
    scheduleGhosts,
    renderDressThumbnails,
    renderThemePortal,
    buildSignalDiptych,
  } = options;
  let queuedResizeFrame = 0;
  const observer = new ResizeObserver(queueResize);

  function queueResize() {
    if (queuedResizeFrame) {
      window.cancelAnimationFrame(queuedResizeFrame);
    }

    queuedResizeFrame = window.requestAnimationFrame(() => {
      queuedResizeFrame = 0;
      if (!isDisposed()) {
        resize();
      }
    });
  }

  function resize() {
    const canvasBounds = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(canvasBounds.width || window.innerWidth));
    const height = Math.max(1, Math.round(canvasBounds.height || window.innerHeight));

    renderer.setPixelRatio(getPixelRatio());
    renderer.setSize(width, height, false);
    if (getThemeId() === 'mew-holo' && usesSingleContextMewLayout()) {
      disposeMewForegroundPipeline();
    } else if (getThemeId() === 'mew-holo') {
      ensureMewForegroundPipeline();
    } else {
      disposeMewForegroundPipeline();
    }
    queueMewTitleUpdate();
    resizeEffectComposer(composer, width, height);
    resizeDressTransition(width, height);
    resizeMewRendering(width, height);
    camera.aspect = width / height;
    applyResponsiveCamera(width, height);
    updateInfiniteBackdropScale();
    scheduleGhosts();
    renderDressThumbnails();
    bokehUniforms.aspect.value = camera.aspect;
    renderThemePortal();
    buildSignalDiptych();
  }

  function applyResponsiveCamera(width: number, height: number) {
    const portrait = width < 720 || height > width * 1.12;
    applyThemeSubjectPlacement();

    const ivory = getThemeId() === 'ivory-holo';
    const dialectic = getThemeId() === 'blue';
    const ivoryZoom = ivory ? (portrait ? 1.4 : 1.3) : 1;
    const dialecticZoom = dialectic ? (portrait ? 1.06 : 1.12) : 1;
    const ivoryLift = ivory ? 0.13 : 0;

    camera.fov = portrait ? 50 : 38;
    subjectMotion.baseCameraPosition.set(
      portrait ? 0.12 : 0.22,
      (portrait ? 1.48 : 1.35) * (ivory ? 1.05 : 1),
      (portrait ? 6.2 : 5.15) * ivoryZoom * dialecticZoom,
    );
    subjectMotion.baseFocusTarget.copy(focusTarget);
    subjectMotion.baseFocusTarget.y += ivoryLift;
    applySafeCameraMotion();
    camera.updateProjectionMatrix();
  }

  function applyResponsiveCameraToCanvas() {
    const bounds = canvas.getBoundingClientRect();
    applyResponsiveCamera(
      Math.max(1, Math.round(bounds.width || window.innerWidth)),
      Math.max(1, Math.round(bounds.height || window.innerHeight)),
    );
  }

  function observe() {
    observer.observe(canvas);
  }

  function dispose() {
    observer.disconnect();
    if (queuedResizeFrame) {
      window.cancelAnimationFrame(queuedResizeFrame);
      queuedResizeFrame = 0;
    }
  }

  return {
    queueResize,
    resize,
    applyResponsiveCameraToCanvas,
    observe,
    dispose,
  };
}
