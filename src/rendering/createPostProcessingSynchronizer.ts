import * as THREE from 'three';
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { DRESS_MATERIAL_GRAIN_STRENGTH } from '../app/experienceConstants';
import type { MewForegroundPipeline } from '../app/experienceTypes';
import { syncDressMaterialGrain } from '../shaders/dressWindMaterial';
import {
  cinematicSettings,
  ivoryBackgroundOpticsSettings,
} from './postProcessingSettings';

export type PostProcessingSynchronizerOptions = {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  cinematicFinishPass: ShaderPass;
  ivoryBackgroundOpticsPass: ShaderPass;
  mewAlphaFeatherPass: ShaderPass;
  getMewForegroundPipeline: () => MewForegroundPipeline | null;
  isHoloScrollTheme: () => boolean;
};

export function createPostProcessingSynchronizer(
  options: PostProcessingSynchronizerOptions,
) {
  const {
    canvas,
    camera,
    cinematicFinishPass,
    ivoryBackgroundOpticsPass,
    mewAlphaFeatherPass,
    getMewForegroundPipeline,
    isHoloScrollTheme,
  } = options;

  function syncCinematicFinish(time: number) {
    syncCinematicUniforms(cinematicFinishPass, time);
    const mewPipeline = getMewForegroundPipeline();
    if (mewPipeline) {
      syncCinematicUniforms(mewPipeline.titleBackgroundCinematicFinishPass, time);
    }
  }

  function syncDressMaterialEffects(time: number) {
    syncDressMaterialGrain({
      time,
      resolutionWidth: Math.max(1, canvas.width),
      resolutionHeight: Math.max(1, canvas.height),
      filmGrain: DRESS_MATERIAL_GRAIN_STRENGTH,
    });
  }

  function syncCinematicUniforms(pass: ShaderPass, time: number) {
    const uniforms = pass.uniforms as Record<
      string,
      THREE.IUniform<number | THREE.Vector2>
    >;
    const holoEditorialActive = isHoloScrollTheme();
    uniforms.uTime.value = time;
    (uniforms.uResolution.value as THREE.Vector2).set(
      Math.max(1, canvas.width),
      Math.max(1, canvas.height),
    );
    uniforms.uEnabled.value = cinematicSettings.enabled ? 1 : 0;
    uniforms.uFilmGrain.value = cinematicSettings.filmGrain;
    uniforms.uDiffusion.value = cinematicSettings.diffusion;
    uniforms.uHalation.value = cinematicSettings.halation;
    uniforms.uVignette.value = holoEditorialActive ? 0 : cinematicSettings.vignette;
    uniforms.uSaturation.value = holoEditorialActive
      ? Math.max(cinematicSettings.saturation, 1.09)
      : cinematicSettings.saturation;
    uniforms.uContrast.value = cinematicSettings.contrast;
    uniforms.uWarmHighlights.value = cinematicSettings.warmHighlights;
    uniforms.uBlackLift.value = cinematicSettings.blackLift;
  }

  function syncMewAlphaFeather(enabled: boolean, pass = mewAlphaFeatherPass) {
    pass.enabled = enabled;

    const uniforms = pass.uniforms as Record<string, THREE.IUniform<number>>;
    uniforms.uFeatherWidth.value = 0.31;
    uniforms.uFeatherOpacity.value = 1;
    uniforms.uFeatherLift.value = 0.72;
    uniforms.uFeatherSaturation.value = 0.46;
  }

  function syncIvoryBackgroundOptics(enabled: boolean, time: number) {
    ivoryBackgroundOpticsPass.enabled = enabled;

    const uniforms = ivoryBackgroundOpticsPass.uniforms as Record<
      string,
      THREE.IUniform<number>
    >;
    uniforms.uTime.value = time;
    uniforms.uAspect.value = camera.aspect;
    uniforms.uStrength.value = ivoryBackgroundOpticsSettings.strength;
    uniforms.uRadiusScale.value = ivoryBackgroundOpticsSettings.radiusScale;
    uniforms.uPulseSpeed.value = ivoryBackgroundOpticsSettings.pulseSpeed;
  }

  return {
    syncCinematicFinish,
    syncDressMaterialEffects,
    syncMewAlphaFeather,
    syncIvoryBackgroundOptics,
  };
}
