import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { BLOOM_BASE_RADIUS, BLOOM_BASE_STRENGTH, BLOOM_THRESHOLD, BLOOM_WIND_RADIUS, BLOOM_WIND_STRENGTH, TARGET_RENDER_INTERVAL_MS } from '../app/experienceConstants';
import { usesSingleContextMewLayout } from '../app/renderProfile';
import type { ArmBloomController, MewForegroundPipeline, PointerWindState, SubjectMotionState } from '../app/experienceTypes';
import type { CycloramaBackgroundPresetId } from '../config/themes';
import type { DressWindController, DressWindSettings } from '../shaders/dressWindMaterial';
import { FullDressStore } from './dresses/FullDressStore';
import { DressTransitionEffect } from './effects/DressTransitionEffect';
import { StudioScene } from './studio/StudioScene';

export type FrameLoopOptions = {
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  controls: OrbitControls;
  focusTarget: THREE.Vector3;
  settings: DressWindSettings;
  pointerWind: PointerWindState;
  subjectMotion: SubjectMotionState;
  fullDressStore: FullDressStore;
  studio: StudioScene;
  bloomPass: UnrealBloomPass;
  bokehPass: BokehPass;
  bokehUniforms: Record<string, THREE.IUniform<number>>;
  dressTransitionEffect: DressTransitionEffect;
  cycloramaBackgroundUniforms: { uCycloTime: THREE.IUniform<number> };
  infiniteBackdropUniforms: { uBackdropTime: THREE.IUniform<number> };
  getThemeId: () => CycloramaBackgroundPresetId;
  getWindController: () => DressWindController | null;
  getArmBloomController: () => ArmBloomController | null;
  updatePointerWind: (delta: number) => void;
  updateSubjectMotion: (delta: number) => void;
  updateThemeObjectVisibility: () => void;
  getMewForegroundPipeline: () => MewForegroundPipeline | null;
  syncIvoryBackgroundOpticsPass: (enabled: boolean, time: number) => void;
  syncCinematicFinishPass: (time: number) => void;
  syncDressMaterialEffectUniforms: (time: number) => void;
  syncMewAlphaFeatherPass: (enabled: boolean, pass?: ShaderPass) => void;
  getVisibleSubjectObjects: () => THREE.Object3D[];
  renderMewMobile: (delta: number) => void;
  renderMewForeground: (delta: number) => void;
  renderSharpSubjectOverlay: (delta: number) => void;
};

export function createFrameLoop(options: FrameLoopOptions) {
  const {
    camera, composer, controls, focusTarget, settings, pointerWind,
    subjectMotion, fullDressStore, studio, bloomPass, bokehPass, bokehUniforms,
    dressTransitionEffect, cycloramaBackgroundUniforms, infiniteBackdropUniforms,
    getThemeId, getWindController, getArmBloomController, updatePointerWind,
    updateSubjectMotion, updateThemeObjectVisibility, getMewForegroundPipeline,
    syncIvoryBackgroundOpticsPass, syncCinematicFinishPass,
    syncDressMaterialEffectUniforms, syncMewAlphaFeatherPass,
    getVisibleSubjectObjects, renderMewMobile, renderMewForeground,
    renderSharpSubjectOverlay,
  } = options;
  const timer = new THREE.Timer();
  timer.connect(document);
  let animationFrame = 0;
  let shaderTime = 0;
  let lastRenderedAt = 0;
  let disposed = false;

  function animate(timestamp?: number) {
    // -------------------------------------------------------------------------
    // FRAME LOOP
    // -------------------------------------------------------------------------
    // requestAnimationFrame runs shortly before the browser paints. Never assume
    // a fixed 1/60 second step: background tabs pause and high-refresh displays
    // may call this 120+ times per second.

    const now = timestamp ?? performance.now();

    if (document.hidden) {
      animationFrame = window.requestAnimationFrame(animate);
      return;
    }

    if (lastRenderedAt > 0 && now - lastRenderedAt < TARGET_RENDER_INTERVAL_MS) {
      animationFrame = window.requestAnimationFrame(animate);
      return;
    }

    lastRenderedAt = now;

    timer.update(timestamp);
    const delta = timer.getDelta();

    if (!settings.freezeTime) {
      // Accumulated seconds drive deterministic shader animation.
      shaderTime += delta;
    }
    cycloramaBackgroundUniforms.uCycloTime.value = shaderTime;
    infiniteBackdropUniforms.uBackdropTime.value = shaderTime;

    // First update CPU-side state and shader uniforms...
    fullDressStore.updateFades(delta);
    updatePointerWind(delta);
    updateSubjectMotion(delta);
    studio.photoPrintSystem?.update(delta, shaderTime);
    studio.holoSculptureSystem?.update(shaderTime, delta);
    updateThemeObjectVisibility();
    // ...then upload the latest wind state to the dress material uniforms.
    getWindController()?.update({
      time: shaderTime,
      windVector: pointerWind.wind,
      gustCenter: pointerWind.gustCenter,
      activity: pointerWind.activity,
      strength: settings.windStrength,
      fabricLooseness: settings.fabricLooseness,
      flutter: settings.flutter,
      gustRadius: settings.gustRadius,
    });
    getArmBloomController()?.update(pointerWind.activity);
    const blueThemeActive = getThemeId() === 'blue';
    const invisibleCitiesActive = getThemeId() === 'mew-holo';
    const ivoryThemeActive = getThemeId() === 'ivory-holo';
    const signalThemeActive = getThemeId() === 'signal-black';
    const objectPostThemeActive = invisibleCitiesActive || ivoryThemeActive;
    const objectBlurAmount = invisibleCitiesActive ? 0.09 : ivoryThemeActive ? 0.038 : 0;

    // Bloom vocabulary:
    // - threshold: minimum luminance that contributes,
    // - strength: amount added back,
    // - radius: blur spread.
    // Dialectic explicitly uses zero strength so its fabric remains matte.
    bloomPass.threshold = invisibleCitiesActive
      ? 0.88
      : ivoryThemeActive
      ? 0.82
      : blueThemeActive || signalThemeActive
      ? 1.35
      : BLOOM_THRESHOLD;
    bloomPass.strength = blueThemeActive
      ? 0
      : ivoryThemeActive
      ? 0.018
      : invisibleCitiesActive
      ? 0.1 * (1 + pointerWind.activity * 0.28)
      : signalThemeActive
      ? 0.01
      : BLOOM_BASE_STRENGTH + pointerWind.activity * BLOOM_WIND_STRENGTH;
    bloomPass.radius = blueThemeActive
      ? 0
      : ivoryThemeActive
      ? 0.06
      : invisibleCitiesActive
      ? 0.08 + pointerWind.activity * 0.025
      : signalThemeActive
      ? 0.05
      : BLOOM_BASE_RADIUS + pointerWind.activity * BLOOM_WIND_RADIUS;
    const mewPipeline = getMewForegroundPipeline();
    if (mewPipeline) {
      mewPipeline.titleBackgroundBloomPass.threshold = bloomPass.threshold;
      mewPipeline.titleBackgroundBloomPass.strength = bloomPass.strength;
      mewPipeline.titleBackgroundBloomPass.radius = bloomPass.radius;
    }
    bokehPass.enabled = objectPostThemeActive;
    if (mewPipeline) {
      mewPipeline.titleBackgroundBokehPass.enabled = bokehPass.enabled;
    }
    if (objectPostThemeActive) {
      bokehUniforms.focus.value = camera.position.distanceTo(focusTarget);
      bokehUniforms.aperture.value = objectBlurAmount * 0.5;
      bokehUniforms.maxblur.value = objectBlurAmount;
      bokehUniforms.aspect.value = camera.aspect;
      if (mewPipeline) {
        mewPipeline.titleBackgroundBokehUniforms.focus.value = bokehUniforms.focus.value;
        mewPipeline.titleBackgroundBokehUniforms.aperture.value = bokehUniforms.aperture.value;
        mewPipeline.titleBackgroundBokehUniforms.maxblur.value = bokehUniforms.maxblur.value;
        mewPipeline.titleBackgroundBokehUniforms.aspect.value = bokehUniforms.aspect.value;
      }
    }
    syncIvoryBackgroundOpticsPass(ivoryThemeActive, shaderTime);
    syncCinematicFinishPass(shaderTime);
    syncDressMaterialEffectUniforms(shaderTime);
    syncMewAlphaFeatherPass(false);
   if (mewPipeline) {
    syncMewAlphaFeatherPass(
      false,
      mewPipeline.titleBackgroundAlphaFeatherPass,
    );
  }

    const transitionFxActive = dressTransitionEffect.update(delta, getThemeId());

    controls.update(delta);
    if (subjectMotion.pivot) {
      // SELECTIVE RENDERING:
      // The base composer renders the environment with all subject objects hidden.
      // We then restore and draw the subject sharply on top. This prevents global
      // post effects from making the garment shiny or blurry.
      const hiddenSubjectObjects = getVisibleSubjectObjects();
      try {
        hiddenSubjectObjects.forEach((object) => {
          object.visible = false;
        });
        composer.render(delta);
      } finally {
        hiddenSubjectObjects.forEach((object) => {
          object.visible = true;
        });
      }
      if (invisibleCitiesActive) {
        if (usesSingleContextMewLayout()) {
          // Mobile preserves the title stencil and subject effects in the primary
          // context, avoiding a second upload of the complete GLB.
          renderMewMobile(delta);
        } else {
          // Desktop retains the original transparent-canvas title-mask ordering.
          renderMewForeground(delta);
        }
      } else {
        renderSharpSubjectOverlay(delta);
      }
    } else {
      composer.render(delta);
    }

    dressTransitionEffect.composite(delta, transitionFxActive);

    animationFrame = window.requestAnimationFrame(animate);
  }

  function start() {
    if (!disposed && !animationFrame) {
      animate();
    }
  }

  function dispose() {
    disposed = true;
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    timer.dispose();
  }

  return { start, dispose };
}
