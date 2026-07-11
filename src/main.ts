import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import {
  CYCLO_BACKGROUND_PRESETS,
  PUBLIC_THEMES,
  type PublicThemeId,
} from './config/themes';
import {
  DRESS_ASSETS,
  DRESS_ASSET_ORDER,
  type DressAssetId,
} from './config/dresses';
import { readInitialExperienceState } from './state/urlState';
import { createEditorialRail } from './ui/editorialRail';
import { createExperienceControls } from './ui/experienceControls';
import { createSceneShell } from './ui/sceneShell';
import {
  DRESS_WIND_PRESETS,
  type DressWindSettings,
} from './shaders/dressWindMaterial';
import type {
  BlueDressHoverState,
  CycloramaBackgroundSettings,
  CycloramaBackgroundUniforms,
  InfiniteBackdropUniforms,
  MewHoloScrollState,
  PointerWindState,
  SubjectMotionState,
} from './app/experienceTypes';
import {
  BLOOM_BASE_RADIUS,
  BLOOM_BASE_STRENGTH,
  BLOOM_THRESHOLD,
  CYCLO_TEXTURE_MODE_VALUES,
  INFINITE_BACKDROP_MODE_VALUES,
} from './app/experienceConstants';
import { getRenderPixelRatio } from './app/renderProfile';
import {
  CINEMATIC_FINISH_SHADER,
  IVORY_BACKGROUND_OPTICS_SHADER,
  MEW_ALPHA_FEATHER_SHADER,
} from './rendering/shaders/postProcessing';
import { MewTitleOverlayController } from './rendering/mewTitleOverlay';
import { ResourceTracker } from './rendering/resourceTracker';
import { renderIvoryPortal } from './ui/ivoryPortal';
import { SignalDiptych } from './ui/signalDiptych';
import { DressThumbnailRenderer } from './rendering/dresses/DressThumbnailRenderer';
import { GhostDressSystem } from './rendering/dresses/GhostDressSystem';
import { FullDressStore } from './rendering/dresses/FullDressStore';
import { createSubjectInteractions } from './interactions/createSubjectInteractions';
import { StudioScene } from './rendering/studio/StudioScene';
import { createThemeController } from './themes/createThemeController';
import { createMewRenderController } from './rendering/mew/createMewRenderController';
import { DressTransitionEffect } from './rendering/effects/DressTransitionEffect';
import { createFrameLoop } from './rendering/createFrameLoop';
import { createPostProcessingSynchronizer } from './rendering/createPostProcessingSynchronizer';
import { createViewportController } from './rendering/createViewportController';
import { createDressExperienceController } from './rendering/dresses/createDressExperienceController';
import { createTuningControls } from './ui/createTuningControls';

/**
 * The runtime is composed from focused scene, rendering, interaction, dress,
 * and UI modules. See docs/architecture.md for the Three.js mental model,
 * render-order notes, performance rules, and safe tuning workflow.
 */

// ---------------------------------------------------------------------------
// INITIAL URL STATE AND UI CONSTRUCTION
// ---------------------------------------------------------------------------
// The URL is treated as shareable application state. Reading it before building
// the UI avoids rendering a default theme and then visibly jumping to another.
const initialExperienceState = readInitialExperienceState(window.location.search);
const CYCLO_BACKGROUND_DEFAULT: PublicThemeId = initialExperienceState.themeId;
const DRESS_ASSET_DEFAULT: DressAssetId = initialExperienceState.dressId;
const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  // Failing immediately is better than allowing dozens of later null-reference
  // errors that hide the real integration problem.
  throw new Error('Missing #app mount element.');
}

// The DOM UI is deliberately built outside Three.js. HTML is superior for text,
// accessibility, responsive layout, and focus/keyboard behavior. Three.js owns
// the canvases and the imagery inside them.
const sceneShell = createSceneShell({
  mount: app,
  initialThemeId: CYCLO_BACKGROUND_DEFAULT,
  dresses: DRESS_ASSETS,
  activeDressId: DRESS_ASSET_DEFAULT,
});

const editorialRail = createEditorialRail({
  mount: app,
  themes: PUBLIC_THEMES,
  activeThemeId: CYCLO_BACKGROUND_DEFAULT,
});
const experienceControls = createExperienceControls({
  mount: sceneShell.stage,
  themes: PUBLIC_THEMES,
  activeThemeId: CYCLO_BACKGROUND_DEFAULT,
  dresses: DRESS_ASSETS,
  dressOrder: DRESS_ASSET_ORDER,
  activeDressId: DRESS_ASSET_DEFAULT,
});

const canvas = sceneShell.canvas;
const mewForegroundCanvasElement = sceneShell.mewForegroundCanvas;
const stageElement = sceneShell.stage;
const status = sceneShell.status;
const backgroundButtons = editorialRail.themeButtons;
const dressButtons = Array.from(app.querySelectorAll<HTMLButtonElement>('[data-dress-asset]'));
const dressNavigationButtons = experienceControls.dressDirectionButtons;
const dressNavigationLabel = experienceControls.dressLabel;
const dressNavigationCount = experienceControls.dressCount;
const dressThumbnailCanvases = Array.from(app.querySelectorAll<HTMLCanvasElement>('[data-dress-thumbnail]'));
const ivoryPortalElement = app.querySelector<HTMLDivElement>('.ivory-portal');
const signalDiptychElement = app.querySelector<HTMLDivElement>('.signal-diptych');
const loadingOverlayElement = sceneShell.loadingOverlay;
const loadingDetailElement = sceneShell.loadingDetail;
const dialecticPaperToggle = app.querySelector<HTMLButtonElement>('[data-dialectic-paper-toggle]');
const mewTitleOpacityInput = app.querySelector<HTMLInputElement>('[data-mew-title-opacity]');
const mewTitleOpacityValue = app.querySelector<HTMLOutputElement>('[data-mew-title-opacity-value]');
const mewTitleWordElement = app.querySelector<HTMLSpanElement>('.mew-editorial-page__mast span:last-child');
const dressBloomInput = app.querySelector<HTMLInputElement>('[data-dress-bloom]');
const dressBloomValue = app.querySelector<HTMLOutputElement>('[data-dress-bloom-value]');

// Aliases below preserve older names used by the scene code while keeping the
// UI construction module's API descriptive.
const statusElement = status;
const canvasElement = canvas;
const loadingOverlay = loadingOverlayElement;
const loadingDetail = loadingDetailElement;
const showControls = new URLSearchParams(window.location.search).get('controls') === '1';

const silentMewReload = sessionStorage.getItem('silent-mew-reload') === '1';
if (silentMewReload) {
  sessionStorage.removeItem('silent-mew-reload');
  loadingOverlay.dataset.hidden = 'true';
}

statusElement.textContent = 'Booting scene';

THREE.ColorManagement.enabled = true;

// ---------------------------------------------------------------------------
// ART-DIRECTION AND SIMULATION CONSTANTS
// ---------------------------------------------------------------------------
// Values here fall into four categories:
// 1. visual strengths (bloom, glow, color finish),
// 2. response rates (how quickly eased state follows input),
// 3. world-space dimensions (studio and print sizes), and
// 4. resource limits (cache sizes and pixel ratio).
//
// Response rates are generally used with `1 - exp(-delta * rate)`. That form is
// frame-rate independent: a 60 Hz display and a 120 Hz display converge at
// nearly the same speed in real seconds.
const settings: DressWindSettings = { ...DRESS_WIND_PRESETS.editorial };
const cycloramaBackgroundSettings: CycloramaBackgroundSettings = {
  preset: CYCLO_BACKGROUND_DEFAULT,
};
const dressAssetSettings = {
  asset: DRESS_ASSET_DEFAULT,
};
const cycloramaBackgroundUniforms: CycloramaBackgroundUniforms = {
  // Numeric modes are used because WebGL 1-era shader branching cannot switch
  // on strings. TypeScript maps friendly theme IDs to shader-friendly numbers.
  uCycloTextureMode: { value: CYCLO_TEXTURE_MODE_VALUES[CYCLO_BACKGROUND_PRESETS[CYCLO_BACKGROUND_DEFAULT].textureMode] },
  uCycloTileRepeat: { value: new THREE.Vector2() },
  uCycloCoverScale: { value: new THREE.Vector2(1, 1) },
  uCycloCoverOffset: { value: new THREE.Vector2() },
  uCycloTime: { value: 0 },
};
const infiniteBackdropUniforms: InfiniteBackdropUniforms = {
  uBackdropMode: { value: INFINITE_BACKDROP_MODE_VALUES[CYCLO_BACKGROUND_DEFAULT] },
  uBackdropTime: { value: 0 },
  uBackdropAspect: { value: window.innerWidth / Math.max(1, window.innerHeight) },
  uGraphicTexture: { value: null },
  uGraphicVerticalTexture: { value: null },
  uHeroStillTexture: { value: null },
  uGraphicAspect: { value: 1672 / 941 },
  uGraphicVerticalAspect: { value: 941 / 1672 },
  uHeroStillAspect: { value: 907 / 512 },
};

// ---------------------------------------------------------------------------
// CORE THREE.JS OBJECTS: SCENE, CAMERA, AND RENDERERS
// ---------------------------------------------------------------------------
// `Scene` extends Object3D and is the root of the transform hierarchy. Adding an
// object makes it eligible for rendering; visibility, camera frustum, material,
// and render layers still determine whether pixels are actually produced.
const scene = new THREE.Scene();
// `background` clears untouched pixels to a solid color. Fog is evaluated by
// compatible materials using camera distance; FogExp2 density grows
// exponentially, which creates a softer horizon than linear fog.
scene.background = new THREE.Color(0x758fa3);
scene.fog = new THREE.FogExp2(0x758fa3, 0.01);

// Group has no geometry/material. It exists only to organize children and apply
// one transform/visibility flag to all of them.
const dressGhostGroup = new THREE.Group();
dressGhostGroup.name = 'dress ghost layer';
scene.add(dressGhostGroup);

const resourceTracker = new ResourceTracker();

// PerspectiveCamera arguments:
// 1. vertical field of view in degrees,
// 2. aspect ratio (corrected in `resize`),
// 3. near clipping distance,
// 4. far clipping distance.
// Geometry closer than near or farther than far is clipped. Keeping the range
// reasonably tight improves depth-buffer precision.
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80);
camera.position.set(0.22, 1.35, 4.15);
// The focus target is a world-space point used by camera controls, bokeh focus,
// and responsive camera placement. It is not a visible scene object.
const focusTarget = new THREE.Vector3(0, 1.05, 0);
scene.add(camera);

// The renderer owns a WebGL context for one canvas. `alpha: true` allows the
// canvas to composite with HTML. Antialias requests multisample edge smoothing.
const renderer = new THREE.WebGLRenderer({
  canvas: canvasElement,
  alpha: true,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setClearColor(0x758fa3, 1);
renderer.setPixelRatio(getRenderPixelRatio());
// ACES filmic tone mapping compresses HDR lighting into display range with a
// photographic highlight rolloff. Exposure scales the HDR values before that
// curve. sRGB output converts linear rendering values for a normal display.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.64;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
// This setting is dormant while shadowMap is disabled. The visible "shadows"
// in this app are authored transparent planes, which are cheaper and more
// controllable for this editorial composition than dynamic shadow maps.
renderer.shadowMap.type = THREE.PCFShadowMap;

// Invisible Cities uses a second transparent canvas because its title mask and
// subject have a special layer order relative to HTML. It is intentionally
// lazy: allocating a second renderer and its targets for every mobile theme
// exhausts WebKit's budget even when Invisible Cities is never shown.

// PBR materials need believable environment reflections even when the scene has
// no photographed HDRI. RoomEnvironment procedurally supplies one. PMREM
// prefilters it into roughness levels so rough materials sample blurred
// reflections and glossy materials sample sharper reflections.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// OrbitControls is retained for its damped camera-target math, but direct user
// pan/rotate/zoom are disabled. The app drives the camera programmatically.
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.enableRotate = false;
controls.enableZoom = false;
controls.target.copy(focusTarget);
controls.update();

statusElement.textContent = 'Building studio';
const studio = new StudioScene({
  scene,
  camera,
  renderer,
  canvas: canvasElement,
  stage: stageElement,
  resources: resourceTracker,
  cycloramaBackgroundUniforms,
  infiniteBackdropUniforms,
  getThemeId: () => cycloramaBackgroundSettings.preset,
  getFullDresses: () => fullDressStore.records,
  getPointerWind: () => pointerWind,
  isMobileViewport,
});
statusElement.textContent = 'Setting post';

// ---------------------------------------------------------------------------
// MAIN POST-PROCESSING PIPELINE
// ---------------------------------------------------------------------------
// EffectComposer ping-pongs between offscreen render targets. Pass order is
// semantic: bloom before the finish shader means grain is not bloomed; bokeh
// before the finish shader means grain remains sharp instead of being blurred.
const composer = new EffectComposer(renderer);
// RenderPass converts the current 3D scene/camera into the first 2D texture.
composer.addPass(new RenderPass(scene, camera));
// UnrealBloomPass extracts pixels above `threshold`, blurs them at several
// scales, then adds the glow back. Strength controls amount; radius controls
// spread. High threshold avoids making ordinary fabric highlights look shiny.
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(1, 1),
  BLOOM_BASE_STRENGTH,
  BLOOM_BASE_RADIUS,
  BLOOM_THRESHOLD,
);
composer.addPass(bloomPass);
// BokehPass simulates depth of field from the depth buffer. Aperture controls
// blur strength, focus is a camera-space distance, and maxblur caps the radius.
const bokehPass = new BokehPass(scene, camera, {
  focus: camera.position.distanceTo(focusTarget),
  aperture: 0.013,
  maxblur: 0.028,
});
const bokehUniforms = bokehPass.uniforms as Record<string, THREE.IUniform<number>>;
bokehPass.enabled = false;
composer.addPass(bokehPass);
const ivoryBackgroundOpticsPass = new ShaderPass(IVORY_BACKGROUND_OPTICS_SHADER);
ivoryBackgroundOpticsPass.enabled = false;
composer.addPass(ivoryBackgroundOpticsPass);
const cinematicFinishPass = new ShaderPass(CINEMATIC_FINISH_SHADER);
composer.addPass(cinematicFinishPass);
const mewAlphaFeatherPass = new ShaderPass(MEW_ALPHA_FEATHER_SHADER);
mewAlphaFeatherPass.enabled = false;
composer.addPass(mewAlphaFeatherPass);
// OutputPass performs the renderer's final tone/color-space output transform.
// It belongs last; applying sRGB conversion in the middle would make later math
// operate on nonlinear display values.
composer.addPass(new OutputPass());

// The transition bloom/glitch uses full-screen targets, but only for a 720ms
// dress change. Keeping them alive during the rest of a mobile session wastes
// enough GPU memory to make WebKit terminate the page. It is therefore created
// on the transition frame and released immediately after the effect finishes.

// ---------------------------------------------------------------------------
// INVISIBLE CITIES "SYSTEM" TITLE MASK
// ---------------------------------------------------------------------------
// Canvas 2D draws the typography into an alpha mask. Three.js then uses that
// mask in a full-screen shader. At black opacity 0 the letters become a window
// into a captured background texture; at 1 they are solid near-black.
// Keep this backing store stable across viewport changes. Resizing the source
// canvas under a live CanvasTexture can leave Safari with a partially updated
// texture, which showed up as duplicated title frames on desktop resizes.
const mewTitleOverlayController = new MewTitleOverlayController({
  canvasElement,
  titleWordElement: mewTitleWordElement,
  getThemeId: () => cycloramaBackgroundSettings.preset,
});
const {
  mewTitleOverlayTexture,
  mewTitleOverlayScene,
  mewTitleOverlayCamera,
  mewTitleOverlayMaterial,
} = mewTitleOverlayController.overlay;

statusElement.textContent = 'Starting load';

// ---------------------------------------------------------------------------
// MUTABLE RUNTIME STATE AND REUSED MATH OBJECTS
// ---------------------------------------------------------------------------
// Values that change each frame live below. Reused Vector/Box/Raycaster objects
// are intentional: allocating inside pointer and animation loops increases
// garbage collection and can cause visible frame hitches.
let ghostDressSystem: GhostDressSystem | null = null;
let disposed = false;
const fullDressStore = new FullDressStore(scene, () => disposed);
const dressTransitionEffect = new DressTransitionEffect({
  scene,
  camera,
  renderer,
  canvas: canvasElement,
  studio,
  dressGhostGroup,
  getDresses: () => fullDressStore.records,
});
const dressThumbnailRenderer = new DressThumbnailRenderer(
  dressThumbnailCanvases,
  getRenderPixelRatio,
);
const dressThumbnailRecords = dressThumbnailRenderer.records;
const signalDiptych = new SignalDiptych({
  element: signalDiptychElement,
  thumbnails: dressThumbnailRecords,
  getThemeId: () => cycloramaBackgroundSettings.preset,
  getDressId: () => dressAssetSettings.asset,
  getPixelRatio: getRenderPixelRatio,
});
// Raycasting converts a 2D pointer coordinate into a 3D ray from the camera.
// Intersecting that ray with a plane produces a world-space spawn position.
// Box3 is an axis-aligned bounding box (AABB). It is fast and conservative:
// rotated geometry may occupy less area than its AABB, but never more.
const pointerWind: PointerWindState = {
  previous: new THREE.Vector2(0.5, 0.5),
  gustCenter: new THREE.Vector2(0.5, 0.42),
  targetWind: new THREE.Vector3(),
  wind: new THREE.Vector3(),
  hasPointer: false,
  activity: 0,
  speed: 0,
  lastMoveTime: 0,
  lastSampleTime: 0,
};
const blueDressHover: BlueDressHoverState = {
  overActiveDress: false,
  lastMoveTime: Number.NEGATIVE_INFINITY,
};
const mewHoloScroll: MewHoloScrollState = {
  progress: 0,
  targetProgress: 0,
  switching: false,
  touchY: null,
};
const subjectMotion: SubjectMotionState = {
  pivot: null,
  yaw: 0,
  targetYaw: 0,
  cameraLift: 0,
  targetCameraLift: 0,
  baseCameraPosition: camera.position.clone(),
  baseFocusTarget: focusTarget.clone(),
};
const tuningControls = createTuningControls({
  stageElement,
  mewTitleOverlayMaterial,
  mewTitleOpacityInput,
  mewTitleOpacityValue,
  dressBloomInput,
  dressBloomValue,
  initiallyVisible: showControls,
});

const {
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
} = createSubjectInteractions({
  canvasElement,
  camera,
  controls,
  focusTarget,
  settings,
  pointerWind,
  blueDressHover,
  mewHoloScroll,
  subjectMotion,
  getThemeId: () => cycloramaBackgroundSettings.preset,
  getDressId: () => dressAssetSettings.asset,
  getActiveDress: () => fullDressStore.active,
  loadDressAsset: async (assetId) => loadDressAsset(assetId),
  findGhostAssetAtNormalized: (x, y) => ghostDressSystem?.findAssetAtNormalized(x, y) ?? null,
  spawnPhotoPrint: (x, y, movementX, movementY, now) => {
    studio.photoPrintSystem?.maybeSpawn(x, y, movementX, movementY, now);
  },
});

let viewportController: ReturnType<typeof createViewportController> | null = null;
let loadDressAsset: (
  assetId: DressAssetId,
  useLoadingOverlay?: boolean,
) => Promise<void> = async () => {};

ghostDressSystem = new GhostDressSystem({
  group: dressGhostGroup,
  canvas: canvasElement,
  camera,
  getActiveDress: () => fullDressStore.active,
  getActiveDressId: () => dressAssetSettings.asset,
  getThemeId: () => cycloramaBackgroundSettings.preset,
  isMobileViewport,
  isDisposed: () => disposed,
  loadActiveDress: async (assetId) => loadDressAsset(assetId),
  syncThumbnail: (record) => dressThumbnailRenderer.syncFromGhost(record),
  renderThumbnails: renderDressThumbnails,
  onChange: () => updateDebugState(),
});

const mewRenderController = createMewRenderController({
  scene,
  camera,
  renderer,
  composer,
  canvasElement,
  mewForegroundCanvasElement,
  focusTarget,
  studio,
  mewTitleOverlayScene,
  mewTitleOverlayCamera,
  mewTitleOverlayMaterial,
  mewTitleOverlayTexture,
  getVisibleSubjectObjects,
  getMewTitleBlackOpacity: tuningControls.getMewTitleBlackOpacity,
  getDressBloomStrength: tuningControls.getDressBloomStrength,
  isMewTitleOverlayDirty: () => mewTitleOverlayController.isDirty,
  setMewTitleOverlayDirty: (dirty) => mewTitleOverlayController.setDirty(dirty),
  updateMewTitleOverlayTexture: () => mewTitleOverlayController.update(),
});
const {
  ensureMewForegroundPipeline,
  disposeMewForegroundPipeline,
  renderMewForeground,
  renderMewMobile,
  renderSharpSubjectOverlay,
  getMewForegroundPipeline,
} = mewRenderController;

const postProcessingSynchronizer = createPostProcessingSynchronizer({
  canvas: canvasElement,
  camera,
  cinematicFinishPass,
  ivoryBackgroundOpticsPass,
  mewAlphaFeatherPass,
  getMewForegroundPipeline,
  isHoloScrollTheme,
});

const {
  applyCycloramaBackgroundPreset,
  handleDialecticPaperToggle,
  updateThemeObjectVisibility,
  updateInfiniteBackdropScale,
  handleCycloramaBackgroundClick,
  applyThemeSubjectPlacement,
} = createThemeController({
  settings: cycloramaBackgroundSettings,
  stageElement,
  scene,
  renderer,
  camera,
  studio,
  infiniteBackdropUniforms,
  backgroundButtons,
  dialecticPaperToggle,
  editorialRail,
  experienceControls,
  fullDresses: fullDressStore.records,
  getActiveDress: () => fullDressStore.active,
  ensureMewForegroundPipeline,
  disposeMewForegroundPipeline,
  markMewTitleDirty: () => mewTitleOverlayController.markDirty(),
  resetMewHoloScrollRotation,
  queueCanvasResize: () => viewportController?.queueResize(),
  scheduleGhosts: () => ghostDressSystem?.schedule(),
  renderDressThumbnails,
  buildSignalDiptych: () => signalDiptych.build(),
  isMobileViewport,
});

viewportController = createViewportController({
  canvas: canvasElement,
  renderer,
  composer,
  camera,
  focusTarget,
  subjectMotion,
  bokehUniforms,
  getThemeId: () => cycloramaBackgroundSettings.preset,
  getPixelRatio: getRenderPixelRatio,
  isDisposed: () => disposed,
  ensureMewForegroundPipeline,
  disposeMewForegroundPipeline,
  queueMewTitleUpdate: () => mewTitleOverlayController.queueUpdate(),
  resizeDressTransition: (width, height) => dressTransitionEffect.resize(width, height),
  resizeMewRendering: (width, height) => mewRenderController.resize(width, height),
  applyThemeSubjectPlacement,
  applySafeCameraMotion,
  updateInfiniteBackdropScale,
  scheduleGhosts: () => ghostDressSystem?.schedule(),
  renderDressThumbnails,
  renderThemePortal: () => renderIvoryPortal(ivoryPortalElement),
  buildSignalDiptych: () => signalDiptych.build(),
});
const { resize, applyResponsiveCameraToCanvas } = viewportController;

const dressController = createDressExperienceController({
  scene,
  store: fullDressStore,
  studio,
  transitionEffect: dressTransitionEffect,
  subjectMotion,
  focusTarget,
  settings: dressAssetSettings,
  defaultAssetId: DRESS_ASSET_DEFAULT,
  statusElement,
  loadingOverlay,
  loadingDetail,
  editorialRail,
  experienceControls,
  dressButtons,
  navigationButtons: dressNavigationButtons,
  navigationLabel: dressNavigationLabel,
  navigationCount: dressNavigationCount,
  signalDiptychElement,
  getThemeId: () => cycloramaBackgroundSettings.preset,
  isDisposed: () => disposed,
  isMewScrollSwitching: () => mewHoloScroll.switching,
  resetDressWind,
  resetMewHoloScrollRotation,
  applyThemeSubjectPlacement,
  applyResponsiveCameraToCanvas,
  updateDebugState,
  updateGhostVisibility: () => ghostDressSystem?.updateVisibility(),
  scheduleGhosts: () => ghostDressSystem?.schedule(),
  updateThemeObjectVisibility,
  renderDressThumbnails,
  buildSignalDiptych: () => signalDiptych.build(),
});
loadDressAsset = dressController.loadDressAsset;

const frameLoop = createFrameLoop({
  camera,
  composer,
  controls,
  focusTarget,
  settings,
  pointerWind,
  subjectMotion,
  fullDressStore,
  studio,
  bloomPass,
  bokehPass,
  bokehUniforms,
  dressTransitionEffect,
  cycloramaBackgroundUniforms,
  infiniteBackdropUniforms,
  getThemeId: () => cycloramaBackgroundSettings.preset,
  getWindController: dressController.getWindController,
  getArmBloomController: dressController.getArmBloomController,
  updatePointerWind,
  updateSubjectMotion,
  updateThemeObjectVisibility,
  getMewForegroundPipeline,
  syncIvoryBackgroundOpticsPass: postProcessingSynchronizer.syncIvoryBackgroundOptics,
  syncCinematicFinishPass: postProcessingSynchronizer.syncCinematicFinish,
  syncDressMaterialEffectUniforms: postProcessingSynchronizer.syncDressMaterialEffects,
  syncMewAlphaFeatherPass: postProcessingSynchronizer.syncMewAlphaFeather,
  getVisibleSubjectObjects,
  renderMewMobile,
  renderMewForeground,
  renderSharpSubjectOverlay,
});

dressThumbnailRenderer.initialize();
applyCycloramaBackgroundPreset(cycloramaBackgroundSettings.preset);
dressController.registerAssetServiceWorker();
void dressController.start(silentMewReload, frameLoop.start);

// Kicks off the transition bloom/glitch envelope, but only for Blue + Mew Holo.

// Renders just the dress/arm figure (no background, ghosts or shadow) through the
// FX composer so its bloom + glitch stay localized to the figure.

function getVisibleSubjectObjects() {
  const objects: THREE.Object3D[] = [];
  objects.push(...fullDressStore.visibleRoots());

  if (dressGhostGroup.visible) {
    objects.push(dressGhostGroup);
  }

  return objects;
}

function renderDressThumbnails() {
  if (cycloramaBackgroundSettings.preset === 'signal-black') {
    // In signal we render the ghost dress into the graph-node canvases (which
    // reuse the same scenes as the regular thumbnails). The switcher's canvases
    // themselves are display:none here so we skip rendering into them.
    signalDiptych.render();
    return;
  }

  if (!isBlueStackTheme()) {
    return;
  }

  dressThumbnailRenderer.renderAll(DRESS_ASSET_ORDER);
}

// Ghosts should read as a middle layer: above decorative background sculptures,
// then covered by the active dress when the sharp subject overlay renders.

function isMobileViewport() {
  return window.innerWidth < 720 || window.innerHeight > window.innerWidth * 1.12;
}

function isBlueStackTheme() {
  return cycloramaBackgroundSettings.preset === 'blue';
}

function isHoloScrollTheme(preset = cycloramaBackgroundSettings.preset) {
  return preset === 'mew-holo' || preset === 'tabla-rasa';
}

function handleCanvasPointerDown(event: PointerEvent) {
  if (ghostDressSystem?.select(event)) {
    event.preventDefault();
    return;
  }

  handlePointerMove(event);
}

// Différance portal: a near-black arch with knockout type that reveals the live
// beige background. Built at the exact viewport size so nothing is cut off. The
// WebGL background carries the optical breathing; the SVG frame stays clean to
// avoid displacement artifacts on the hard arch edge.

// Signal Black diptych — EVA-inspired visual language (red/black, mono, corner
// brackets, crosshair) but ONLY real dress info (no fake metrics, no kanji, no
// fictional codes). The two dress nodes ARE the switcher buttons: click an
// inactive node to load that dress. Scoped to signal-black; remove the builder,
// the .signal-diptych markup/CSS, and signalGraphNodeRecords to revert.

function updateDebugState(bounds?: THREE.Box3) {
  (window as typeof window & {
    __boosterDebug?: Record<string, unknown>;
  }).__boosterDebug = {
    cameraPosition: camera.position.toArray(),
    focusTarget: focusTarget.toArray(),
    activeDress: fullDressStore.active?.asset.id ?? null,
    fullDressCache: Array.from(fullDressStore.records.keys()),
    backgroundPreset: cycloramaBackgroundSettings.preset,
    photoPrintCount: (studio.photoPrintSystem?.count ?? 0),
    visibleGhosts: ghostDressSystem?.visibleAssetIds ?? [],
    subjectScale: fullDressStore.active?.pivot.scale.x ?? null,
    subjectYaw: subjectMotion.yaw,
    subjectChildren: subjectMotion.pivot?.children.map((child) => child.name || child.type) ?? [],
    sceneChildren: scene.children.map((child) => child.name || child.type),
    bounds: bounds
      ? {
          min: bounds.min.toArray(),
          max: bounds.max.toArray(),
          size: bounds.getSize(new THREE.Vector3()).toArray(),
        }
      : null,
  };
}

postProcessingSynchronizer.syncDressMaterialEffects(0);
resize();
viewportController.observe();
mewTitleOverlayController.observe();
canvasElement.addEventListener('pointermove', handlePointerMove, { passive: true });
canvasElement.addEventListener('pointerdown', handleCanvasPointerDown);
canvasElement.addEventListener('pointerleave', handlePointerLeave, { passive: true });
backgroundButtons.forEach((button) => button.addEventListener('click', handleCycloramaBackgroundClick));
dressController.bind();
dialecticPaperToggle?.addEventListener('click', handleDialecticPaperToggle);
window.addEventListener('wheel', handleMewHoloWheel, { passive: false });
window.addEventListener('touchstart', handleMewHoloTouchStart, { passive: true });
window.addEventListener('touchmove', handleMewHoloTouchMove, { passive: false });
window.addEventListener('touchend', handleMewHoloTouchEnd);
window.addEventListener('touchcancel', handleMewHoloTouchEnd);
window.addEventListener('resize', resize);
window.addEventListener('beforeunload', dispose);

renderIvoryPortal(ivoryPortalElement);
signalDiptych.build();

function dispose() {
  // -------------------------------------------------------------------------
  // TEARDOWN
  // -------------------------------------------------------------------------
  // JavaScript listeners/callbacks keep objects reachable, and WebGL resources
  // live outside normal garbage collection. Complete teardown matters for Vite
  // hot reload, remounting, navigation, and long editing sessions.
  if (disposed) {
    return;
  }

  // Idempotence: after this flag flips, asynchronous loads and repeated unload
  // paths are prevented from operating on released objects.
  disposed = true;
  viewportController?.dispose();
  canvasElement.removeEventListener('pointermove', handlePointerMove);
  canvasElement.removeEventListener('pointerdown', handleCanvasPointerDown);
  canvasElement.removeEventListener('pointerleave', handlePointerLeave);
  backgroundButtons.forEach((button) => button.removeEventListener('click', handleCycloramaBackgroundClick));
  dialecticPaperToggle?.removeEventListener('click', handleDialecticPaperToggle);
  window.removeEventListener('wheel', handleMewHoloWheel);
  window.removeEventListener('touchstart', handleMewHoloTouchStart);
  window.removeEventListener('touchmove', handleMewHoloTouchMove);
  window.removeEventListener('touchend', handleMewHoloTouchEnd);
  window.removeEventListener('touchcancel', handleMewHoloTouchEnd);
  window.removeEventListener('resize', resize);
  window.removeEventListener('beforeunload', dispose);
  experienceControls.destroy();
  editorialRail.destroy();
  tuningControls.dispose();
  dressController.dispose();
  studio.dispose();
  fullDressStore.dispose();
  ghostDressSystem?.dispose();
  dressThumbnailRenderer.dispose();
  controls.dispose();
  composer.dispose();
  dressTransitionEffect.dispose();
  mewRenderController.dispose();
  disposeMewForegroundPipeline();
  mewTitleOverlayController.dispose();
  signalDiptych.dispose();
  frameLoop.dispose();
  resourceTracker.dispose();
  scene.environment?.dispose();
  pmrem.dispose();
  renderer.dispose();
}

if (import.meta.hot) {
  import.meta.hot.dispose(dispose);
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
