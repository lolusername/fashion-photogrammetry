import * as THREE from 'three';

import { INFINITE_BACKDROP_MODE_VALUES, INVISIBLE_CITIES_SUBJECT_SCALE, WIND_ARCHIVE_SUBJECT_SCALE } from '../app/experienceConstants';
import { usesSingleContextMewLayout } from '../app/renderProfile';
import type { CycloramaBackgroundSettings, FullDressRecord, InfiniteBackdropUniforms } from '../app/experienceTypes';
import type { DressAssetId } from '../config/dresses';
import { CYCLO_BACKGROUND_PRESETS, isPublicThemeId, type CycloramaBackgroundPresetId, type PublicThemeId } from '../config/themes';
import { writeThemeToUrl } from '../state/urlState';
import { StudioScene } from '../rendering/studio/StudioScene';

type ThemeAwareRail = { setTheme: (themeId: PublicThemeId) => void };
type ThemeAwareControls = { setTheme: (themeId: PublicThemeId) => void };

export type ThemeControllerOptions = {
  settings: CycloramaBackgroundSettings;
  stageElement: HTMLElement;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  studio: StudioScene;
  infiniteBackdropUniforms: InfiniteBackdropUniforms;
  backgroundButtons: HTMLButtonElement[];
  dialecticPaperToggle: HTMLButtonElement | null;
  editorialRail: ThemeAwareRail;
  experienceControls: ThemeAwareControls;
  fullDresses: Map<DressAssetId, FullDressRecord>;
  getActiveDress: () => FullDressRecord | null;
  ensureMewForegroundPipeline: () => unknown;
  disposeMewForegroundPipeline: () => void;
  markMewTitleDirty: () => void;
  resetMewHoloScrollRotation: () => void;
  queueCanvasResize: () => void;
  scheduleGhosts: () => void;
  renderDressThumbnails: () => void;
  buildSignalDiptych: () => void;
  isMobileViewport: () => boolean;
};

export function createThemeController(options: ThemeControllerOptions) {
  const {
    settings: cycloramaBackgroundSettings, stageElement, scene, renderer, camera,
    studio, infiniteBackdropUniforms, backgroundButtons, dialecticPaperToggle,
    editorialRail, experienceControls, fullDresses, getActiveDress,
    ensureMewForegroundPipeline, disposeMewForegroundPipeline, markMewTitleDirty,
    resetMewHoloScrollRotation, queueCanvasResize, scheduleGhosts,
    renderDressThumbnails, buildSignalDiptych, isMobileViewport,
  } = options;
  let dialecticPaperTextureEnabled = false;

  function applyCycloramaBackgroundPreset(presetId: CycloramaBackgroundPresetId) {
    const preset = CYCLO_BACKGROUND_PRESETS[presetId];
    const useIvoryHolo = preset.textureMode === 'ivory-holo';
    const useSignalBlack = preset.textureMode === 'signal-black';
    cycloramaBackgroundSettings.preset = presetId;
    stageElement!.dataset.backgroundPreset = presetId;
    if (presetId === 'mew-holo' && usesSingleContextMewLayout()) {
      disposeMewForegroundPipeline();
    } else if (presetId === 'mew-holo') {
      ensureMewForegroundPipeline();
    } else {
      disposeMewForegroundPipeline();
    }
    markMewTitleDirty();
    studio.syncBackgroundUniforms();
    syncInfiniteBackdropMode();

    if (studio.cycloramaMesh && studio.cycloramaMaterial && studio.cycloramaHoloMaterial) {
      studio.cycloramaMesh.material = useIvoryHolo ? studio.cycloramaHoloMaterial : studio.cycloramaMaterial;
    }

    if (studio.holoAccentGroup) {
      studio.holoAccentGroup.visible = presetId === 'mew-holo';
      studio.holoSculptureSystem?.applyPalette(presetId);
    }

    if (studio.photoPrintGroup) {
      studio.photoPrintGroup.visible = presetId === 'tabla-rasa';
    }

    if (studio.ivorySculptureGroup) {
      studio.ivorySculptureGroup.visible = useIvoryHolo;
    }

    if (studio.signalBlackGroup) {
      studio.signalBlackGroup.visible = useSignalBlack;
    }

    if (studio.cycloramaMaterial) {
      studio.cycloramaMaterial.color.setHex(preset.cycloramaColor);
      studio.cycloramaMaterial.roughness = preset.cycloramaRoughness;
      studio.cycloramaMaterial.metalness = preset.cycloramaMetalness;
      studio.cycloramaMaterial.envMapIntensity = preset.cycloramaEnvMapIntensity;
      studio.cycloramaMaterial.toneMapped = true;
      studio.cycloramaMaterial.needsUpdate = true;
    }

    if (studio.cycloramaHoloMaterial) {
      studio.cycloramaHoloMaterial.color.setHex(preset.cycloramaColor);
      studio.cycloramaHoloMaterial.toneMapped = false;
      studio.cycloramaHoloMaterial.needsUpdate = true;
    }

    if (studio.contactShadowMaterial) {
      studio.contactShadowMaterial.uniforms.uColor.value.setHex(preset.shadowColor);
      studio.contactShadowMaterial.uniforms.uOpacity.value = preset.shadowOpacity;
    }

    if (studio.paperRollMaterial) {
      studio.paperRollMaterial.color.setHex(preset.paperRollColor);
    }

    if (studio.yellowBacking && studio.yellowBackingMaterial) {
      studio.yellowBackingMaterial.color.setHex(preset.yellowBackingColor);
    }

    scene.background = new THREE.Color(preset.sceneColor);
    renderer.setClearColor(preset.sceneColor, 1);

    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.setHex(preset.fogColor);
    }

    document.documentElement.style.setProperty('--stage-top', preset.stageTop);
    document.documentElement.style.setProperty('--stage-middle', preset.stageMiddle);
    document.documentElement.style.setProperty('--stage-bottom', preset.stageBottom);
    document.documentElement.style.setProperty('--stage-glow', preset.stageGlow);
    document.documentElement.style.setProperty('--stage-edge', preset.stageEdge);
    document.documentElement.style.setProperty('--stage-vignette', preset.stageVignette);
    updateCycloramaBackgroundUrl(presetId);
    resetMewHoloScrollRotation();
    applyThemeSubjectPlacement();
    queueCanvasResize();
    updateThemeObjectVisibility();
    updateInfiniteBackdropScale();
    scheduleGhosts();
    renderDressThumbnails();
    updateCycloramaBackgroundButtons();
    buildSignalDiptych();
  }

  function syncInfiniteBackdropMode() {
    const dialecticPaperActive = (
      cycloramaBackgroundSettings.preset === 'blue'
      && dialecticPaperTextureEnabled
    );
    infiniteBackdropUniforms.uBackdropMode.value = dialecticPaperActive
      ? INFINITE_BACKDROP_MODE_VALUES['tabla-rasa']
      : INFINITE_BACKDROP_MODE_VALUES[cycloramaBackgroundSettings.preset];
    stageElement.dataset.dialecticSurface = dialecticPaperActive ? 'paper' : 'blue';

    if (dialecticPaperToggle) {
      dialecticPaperToggle.setAttribute('aria-pressed', String(dialecticPaperTextureEnabled));
      dialecticPaperToggle.setAttribute(
        'aria-label',
        dialecticPaperTextureEnabled ? 'Restore the blue background' : 'Show the paper background',
      );
    }
  }

  function handleDialecticPaperToggle() {
    if (cycloramaBackgroundSettings.preset !== 'blue') {
      return;
    }

    dialecticPaperTextureEnabled = !dialecticPaperTextureEnabled;
    syncInfiniteBackdropMode();
  }

  function updateThemeObjectVisibility() {
    const physicalCyclorama = isPhysicalCycloramaTheme();
    const photoPrintTheme = cycloramaBackgroundSettings.preset === 'tabla-rasa';
    const signalBlack = cycloramaBackgroundSettings.preset === 'signal-black';

    if (studio.infiniteBackdropMesh) {
      studio.infiniteBackdropMesh.visible = !physicalCyclorama;
    }

    if (studio.cycloramaMesh) {
      studio.cycloramaMesh.visible = physicalCyclorama;
    }

    if (studio.paperRollMesh) {
      studio.paperRollMesh.visible = false;
    }

    if (studio.yellowBacking) {
      studio.yellowBacking.visible = false;
    }

    if (studio.contactShadow) {
      studio.contactShadow.visible = physicalCyclorama;
    }

    if (studio.windArchiveDressShadow) {
      studio.windArchiveDressShadow.visible = photoPrintTheme;
    }

    if (studio.dialecticHalftoneShadow) {
      studio.dialecticHalftoneShadow.visible = cycloramaBackgroundSettings.preset === 'blue';
    }

    if (studio.holoAccentGroup) {
      studio.holoAccentGroup.visible = cycloramaBackgroundSettings.preset === 'mew-holo';
    }

    if (studio.photoPrintGroup) {
      studio.photoPrintGroup.visible = photoPrintTheme;
    }

    if (studio.ivorySculptureGroup) {
      studio.ivorySculptureGroup.visible = physicalCyclorama;
    }

    if (studio.signalBlackGroup) {
      studio.signalBlackGroup.visible = signalBlack;
    }

    fullDresses.forEach((record) => {
      if (record === getActiveDress() && record.targetOpacity > 0) {
        record.pivot.visible = true;
      }
    });
  }

  function updateInfiniteBackdropScale() {
    if (!studio.infiniteBackdropMesh) {
      return;
    }

    const distance = Math.abs(studio.infiniteBackdropMesh.position.z);
    const height = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) * distance;
    const width = height * camera.aspect;
    studio.infiniteBackdropMesh.scale.set(width, height, 1);
    infiniteBackdropUniforms.uBackdropAspect.value = camera.aspect;
  }

  function updateCycloramaBackgroundButtons() {
    backgroundButtons.forEach((button) => {
      const active = button.dataset.backgroundPreset === cycloramaBackgroundSettings.preset;
      button.dataset.active = active ? 'true' : 'false';
      button.setAttribute('aria-pressed', String(active));
    });
    if (isPublicThemeId(cycloramaBackgroundSettings.preset)) {
      editorialRail.setTheme(cycloramaBackgroundSettings.preset);
      experienceControls.setTheme(cycloramaBackgroundSettings.preset);
    }
  }

  function isCycloramaBackgroundPresetId(value: unknown): value is CycloramaBackgroundPresetId {
    return isPublicThemeId(value);
  }

  function handleCycloramaBackgroundClick(event: MouseEvent) {
    const presetId = (event.currentTarget as HTMLButtonElement).dataset.backgroundPreset;

    if (!isCycloramaBackgroundPresetId(presetId)) {
      return;
    }

    if (presetId === 'mew-holo' && cycloramaBackgroundSettings.preset !== 'mew-holo') {
      writeThemeToUrl(presetId);
      sessionStorage.setItem('silent-mew-reload', '1');
      window.location.reload();
      return;
    }

    applyCycloramaBackgroundPreset(presetId);
  }

  function updateCycloramaBackgroundUrl(presetId: CycloramaBackgroundPresetId) {
    if (isPublicThemeId(presetId)) {
      writeThemeToUrl(presetId);
    }
  }

  function applyThemeSubjectPlacement() {
    const invisibleCities = cycloramaBackgroundSettings.preset === 'mew-holo';
    const dialectic = cycloramaBackgroundSettings.preset === 'blue';
    const lift = invisibleCities ? (isMobileViewport() ? 0 : 0.42) : 0;

    fullDresses.forEach((record) => {
      // The GLB loader already normalizes source dimensions. This final scale is
      // theme composition, and `dialecticScale` compensates for perceived
      // silhouette differences. Both current dresses use 1 in Dialectic.
      const scale = invisibleCities
        ? INVISIBLE_CITIES_SUBJECT_SCALE
        : cycloramaBackgroundSettings.preset === 'tabla-rasa'
        ? WIND_ARCHIVE_SUBJECT_SCALE
        : dialectic
        ? record.asset.dialecticScale
        : 1;
      record.pivot.position.set(0, lift, 0);
      record.pivot.scale.setScalar(scale);
    });
  }

  function isPhysicalCycloramaTheme() {
    return cycloramaBackgroundSettings.preset === 'ivory-holo';
  }

  return {
    applyCycloramaBackgroundPreset,
    syncInfiniteBackdropMode,
    handleDialecticPaperToggle,
    updateThemeObjectVisibility,
    updateInfiniteBackdropScale,
    updateCycloramaBackgroundButtons,
    handleCycloramaBackgroundClick,
    applyThemeSubjectPlacement,
  };
}
