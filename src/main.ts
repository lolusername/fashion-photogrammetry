import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GlitchPass } from 'three/addons/postprocessing/GlitchPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import {
  CYCLO_BACKGROUND_PRESETS,
  PUBLIC_THEMES,
  isPublicThemeId,
  type CycloramaBackgroundPresetId,
  type PublicThemeId,
} from './config/themes';
import {
  DRESS_ASSETS,
  DRESS_ASSET_ORDER,
  isDressAssetId,
  type DressAssetId,
} from './config/dresses';
import { readInitialExperienceState, writeDressToUrl, writeThemeToUrl } from './state/urlState';
import { createEditorialRail } from './ui/editorialRail';
import { createExperienceControls } from './ui/experienceControls';
import { createSceneShell } from './ui/sceneShell';
import {
  DRESS_WIND_PRESETS,
  type DressWindController,
  type DressWindSettings,
  createDressWindController,
  syncDressMaterialGrain,
} from './shaders/dressWindMaterial';
import type {
  ArmBloomController,
  BlueDressHoverState,
  CycloramaBackgroundSettings,
  CycloramaBackgroundUniforms,
  FullDressRecord,
  InfiniteBackdropUniforms,
  MewForegroundPipeline,
  MewHoloScrollState,
  PointerWindState,
  SubjectBloomPipeline,
  SubjectMotionState,
  SubjectTransitionPipeline,
} from './app/experienceTypes';
import {
  ARMS_GLOW_SCALE,
  BLOOM_BASE_RADIUS,
  BLOOM_BASE_STRENGTH,
  BLOOM_THRESHOLD,
  BLOOM_WIND_RADIUS,
  BLOOM_WIND_STRENGTH,
  CYCLO_BACK_Z,
  CYCLO_TEXTURE_FALLBACK_ASPECT,
  CYCLO_TEXTURE_MODE_VALUES,
  CYCLO_TEXTURE_REPEAT_X,
  CYCLO_WALL_HEIGHT,
  CYCLO_WIDTH,
  DRESS_BLOOM_MAX_STRENGTH,
  DRESS_BLOOM_RADIUS,
  DRESS_BLOOM_THRESHOLD,
  DRESS_MATERIAL_GRAIN_STRENGTH,
  DRESS_TRANSITION_FX_DURATION,
  DRESS_TRANSITION_FX_ENABLED,
  DRESS_TRANSITION_FX_OVERLAY_OPACITY,
  INFINITE_BACKDROP_MODE_VALUES,
  INVISIBLE_CITIES_SUBJECT_SCALE,
  LOADING_OVERLAY_FADE_MS,
  PHOTO_PRINT_FLOOR_Y,
  PHOTO_PRINT_SURFACE_TILT,
  TARGET_RENDER_INTERVAL_MS,
  TECHNICOLOR_YELLOW,
  WIND_ARCHIVE_SUBJECT_SCALE,
} from './app/experienceConstants';
import {
  getEffectPixelRatio,
  getRenderPixelRatio,
  usesMobileRenderProfile,
  usesSingleContextMewLayout,
} from './app/renderProfile';
import {
  cinematicSettings,
  ivoryBackgroundOpticsSettings,
} from './rendering/postProcessingSettings';
import {
  CINEMATIC_FINISH_SHADER,
  IVORY_BACKGROUND_OPTICS_SHADER,
  MEW_ALPHA_FEATHER_SHADER,
} from './rendering/shaders/postProcessing';
import { createMewTitleOverlay } from './rendering/mewTitleOverlay';
import {
  ResourceTracker,
  setObjectOpacity,
} from './rendering/resourceTracker';
import { createInfiniteBackdropMaterial } from './rendering/materials/infiniteBackdropMaterial';
import {
  createCycloramaGeometry,
  createDialecticHalftoneShadowMaterial,
  createSoftContactShadowMaterial,
  createTechnicolorYellowPlaneMaterial,
  getCoveredCycloramaTransform,
  getCycloramaRepeatY,
} from './rendering/cyclorama';
import { patchCycloramaBackgroundMaterial } from './rendering/materials/cycloramaMaterial';
import { renderIvoryPortal } from './ui/ivoryPortal';
import { SignalDiptych } from './ui/signalDiptych';
import { HoloSculptureSystem } from './rendering/sculptures/HoloSculptureSystem';
import { PhotoPrintSystem } from './rendering/particles/PhotoPrintSystem';
import { DressThumbnailRenderer } from './rendering/dresses/DressThumbnailRenderer';
import { GhostDressSystem } from './rendering/dresses/GhostDressSystem';
import { FullDressStore } from './rendering/dresses/FullDressStore';
import { createSubjectInteractions } from './interactions/createSubjectInteractions';

/**
 * ============================================================================
 * READING GUIDE: HOW THIS THREE.JS APPLICATION WORKS
 * ============================================================================
 *
 * This file is intentionally documented as a teaching text. You do not need to
 * understand every subsystem before changing one small visual parameter.
 * Start with the mental model below, then jump to the section you care about.
 *
 * THE SHORTEST POSSIBLE THREE.JS MENTAL MODEL
 * --------------------------------------------
 *
 * 1. A `Scene` is a tree of objects. It is not an image and does not draw
 *    anything by itself.
 * 2. A `Camera` describes the point of view.
 * 3. A `WebGLRenderer` asks the GPU to draw the scene from that camera.
 * 4. A visible `Mesh` is normally:
 *
 *        Mesh = Geometry (shape/vertices) + Material (how pixels look)
 *
 * 5. A transform (`position`, `rotation`, `scale`) belongs to every
 *    `Object3D`. Child transforms are evaluated relative to their parent.
 * 6. The animation loop updates state and then renders a new frame.
 *
 * The scene graph in this app is conceptually:
 *
 *   scene
 *   ├── camera
 *   │   └── infiniteBackdropMesh  (camera-attached, always fills the view)
 *   ├── active dress pivot
 *   │   ├── normalized GLB model
 *   │   ├── ordinary contact shadow
 *   │   └── Dialectic halftone floor shadow
 *   ├── cyclorama / physical studio
 *   ├── Wind Archive shadow + falling photo group
 *   ├── theme-specific sculpture groups
 *   └── ghost dress group
 *
 * COORDINATE SYSTEMS: THE SOURCE OF MOST 3D CONFUSION
 * ---------------------------------------------------
 *
 * Three.js uses a right-handed coordinate system:
 *
 *   +X = screen-right in the default front view
 *   +Y = up
 *   +Z = toward the camera in this scene
 *
 * "Local space" means coordinates relative to an object's parent. "World
 * space" means coordinates after every parent transform has been applied.
 * "View/camera space" means coordinates relative to the camera. "Clip space"
 * is the GPU's post-projection space; after division by W, visible X and Y are
 * approximately -1..+1. "UV space" is a 2D texture coordinate system, usually
 * 0..1 from one edge of a surface to the other.
 *
 * A model imported from a GLB may have arbitrary dimensions and origin. The
 * loader normalizes and grounds it in `loadDress.ts`. We then put it inside a
 * `THREE.Group` called a pivot. Rotating/scaling the pivot controls the complete
 * subject without destroying the model's internal node hierarchy.
 *
 * CPU CODE VERSUS GPU SHADER CODE
 * -------------------------------
 *
 * TypeScript in this file runs on the CPU. GLSL strings (`vertexShader` and
 * `fragmentShader`) are compiled and run on the GPU:
 *
 * - A vertex shader runs once per vertex. It normally transforms a vertex from
 *   local model coordinates into clip space.
 * - A fragment shader runs for each covered pixel/sample. It decides that
 *   pixel's color and alpha.
 * - A `uniform` is a CPU-controlled value shared by every shader invocation in
 *   one draw call: time, opacity, a texture, etc.
 * - A `varying` is written by the vertex shader, interpolated across the
 *   triangle, and read by the fragment shader. `vUv` is the common example.
 * - A `sampler2D` is a texture; `texture2D(texture, uv)` reads it.
 * - `mix(a, b, t)` linearly interpolates; `smoothstep` creates a soft threshold;
 *   `fract`, `floor`, `sin`, and `dot` are often combined to make cheap
 *   deterministic pseudo-random patterns.
 *
 * THE STANDARD VERTEX-SHADER LINE
 * -------------------------------
 *
 * Many shaders below contain:
 *
 *   gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
 *
 * Read it from right to left:
 *
 * - `position` is the local geometry vertex.
 * - `modelViewMatrix` combines the object's world transform with the inverse
 *   camera transform, producing camera/view space.
 * - `projectionMatrix` applies perspective and produces clip space.
 * - `gl_Position` is the required vertex-shader output.
 *
 * RENDER TARGETS AND POST-PROCESSING
 * ----------------------------------
 *
 * Normal rendering goes directly to the canvas. Post-processing instead draws
 * into an offscreen texture called a render target. `EffectComposer` runs a
 * chain of passes over that texture:
 *
 *   RenderPass → Bloom → Bokeh → custom color/grain shader → OutputPass
 *
 * Each pass consumes an image and produces another image. This app also uses
 * separate offscreen pipelines for the subject. That is selective
 * post-processing: the background can stay crisp while the dress receives a
 * controlled bloom, or a transition glitch can affect only the dress.
 *
 * ALPHA, DEPTH, AND BLENDING
 * --------------------------
 *
 * - Alpha is transparency. It does not by itself decide draw order.
 * - The depth buffer stores the closest rendered surface at each pixel.
 * - `depthTest` checks whether a fragment is behind something already drawn.
 * - `depthWrite` decides whether a fragment updates the depth buffer.
 * - Transparent overlay planes commonly use `depthTest: false` and
 *   `depthWrite: false`, because they are deliberately composited in screen
 *   order rather than treated as solid 3D surfaces.
 * - Additive blending adds light values and is useful for bloom. Ordinary
 *   alpha blending mixes foreground and background.
 *
 * PERFORMANCE RULES USED HERE
 * ---------------------------
 *
 * - Temporary vectors used every frame are allocated once and reused. Creating
 *   thousands of `Vector3` objects per second causes garbage-collection pauses.
 * - Pixel ratio is capped. Doubling pixel ratio can approximately quadruple
 *   the number of pixels the GPU must shade.
 * - Loaded dresses and ghost models are cached, but old GPU resources are
 *   disposed when evicted.
 * - The render loop uses delta time, so motion speed is mostly independent of
 *   monitor refresh rate.
 *
 * SAFE TUNING WORKFLOW
 * --------------------
 *
 * 1. Find the named mesh/material/pass rather than changing a random number.
 * 2. Change one variable at a time.
 * 3. Test every theme that shares that renderer or shader.
 * 4. Check both dresses: their source GLBs have different silhouettes.
 * 5. Run `npm run build`; TypeScript catches many integration mistakes, while
 *    live visual inspection catches composition and shader mistakes.
 *
 * The large section comments below explain the implementation in the order the
 * application creates and renders it.
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
stageElement.dataset.tuningControls = showControls ? 'true' : 'false';

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
let lastRenderedAt = 0;
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

let cycloramaTextureAspect = CYCLO_TEXTURE_FALLBACK_ASPECT;
let cycloramaMesh: THREE.Mesh | null = null;
let cycloramaMaterial: THREE.MeshStandardMaterial | null = null;
let cycloramaHoloMaterial: THREE.MeshBasicMaterial | null = null;
let infiniteBackdropMesh: THREE.Mesh | null = null;
let infiniteBackdropMaterial: THREE.ShaderMaterial | null = null;
let holoAccentGroup: THREE.Group | null = null;
let ivorySculptureGroup: THREE.Group | null = null;
let signalBlackGroup: THREE.Group | null = null;
let holoSculptureSystem: HoloSculptureSystem | null = null;
let photoPrintGroup: THREE.Group | null = null;
let photoPrintSystem: PhotoPrintSystem | null = null;
let windArchiveDressShadow: THREE.Mesh | null = null;
let dialecticHalftoneShadow: THREE.Mesh | null = null;
let contactShadow: THREE.Mesh | null = null;
let contactShadowMaterial: THREE.ShaderMaterial | null = null;
let paperRollMaterial: THREE.MeshStandardMaterial | null = null;
let paperRollMesh: THREE.Mesh | null = null;
let yellowBacking: THREE.Mesh | null = null;
let yellowBackingMaterial: THREE.MeshBasicMaterial | null = null;

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
const trackGeometry = <T extends THREE.BufferGeometry>(geometry: T) =>
  resourceTracker.trackGeometry(geometry);
const trackMaterial = <T extends THREE.Material>(material: T) =>
  resourceTracker.trackMaterial(material);
const trackTexture = <T extends THREE.Texture>(texture: T) =>
  resourceTracker.trackTexture(texture);

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
let mewForegroundPipeline: MewForegroundPipeline | null = null;

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

addLighting(scene);
statusElement.textContent = 'Building studio';
addStudio(scene);
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
let subjectTransitionPipeline: SubjectTransitionPipeline | null = null;

function ensureSubjectTransitionPipeline() {
  if (subjectTransitionPipeline) {
    return subjectTransitionPipeline;
  }

  const renderTarget = new THREE.WebGLRenderTarget(1, 1, {
    // Half-float keeps values above display white so bloom can respond to HDR
    // highlights without the memory cost of full 32-bit floating-point channels.
    type: THREE.HalfFloatType,
  });
  renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
  const composer = new EffectComposer(renderer, renderTarget);
  composer.renderToScreen = false;
  const renderPass = new RenderPass(scene, camera);
  renderPass.clearAlpha = 0;
  composer.addPass(renderPass);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.24, 0.3, 0.2));
  const glitchPass = new GlitchPass();
  (glitchPass.uniforms as Record<string, THREE.IUniform<number>>).col_s.value = 0.012;
  composer.addPass(glitchPass);
  composer.addPass(new OutputPass());

  const overlayScene = new THREE.Scene();
  const overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const overlayGeometry = new THREE.PlaneGeometry(2, 2);
  const overlayMaterial = new THREE.MeshBasicMaterial({
    map: renderTarget.texture,
    transparent: true,
    // Additive blending behaves approximately as output = source + destination.
    // Black contributes nothing; bright FX light accumulates over the base frame.
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  overlayScene.add(new THREE.Mesh(overlayGeometry, overlayMaterial));

  subjectTransitionPipeline = {
    renderTarget,
    composer,
    renderPass,
    glitchPass,
    overlayScene,
    overlayCamera,
    overlayGeometry,
    overlayMaterial,
  };

  const canvasBounds = canvasElement.getBoundingClientRect();
  resizeEffectComposer(
    composer,
    Math.max(1, Math.round(canvasBounds.width || window.innerWidth)),
    Math.max(1, Math.round(canvasBounds.height || window.innerHeight)),
  );
  return subjectTransitionPipeline;
}

function disposeSubjectTransitionPipeline() {
  const pipeline = subjectTransitionPipeline;
  if (!pipeline) {
    return;
  }

  pipeline.composer.dispose();
  pipeline.renderTarget.dispose();
  pipeline.overlayMaterial.dispose();
  pipeline.overlayGeometry.dispose();
  subjectTransitionPipeline = null;
}

function createSubjectBloomPipeline(targetRenderer: THREE.WebGLRenderer): SubjectBloomPipeline {
  // Selective bloom recipe:
  // 1. Temporarily hide everything except the subject.
  // 2. Render that subject into this offscreen composer.
  // 3. Read UnrealBloomPass's blurred light texture.
  // 4. Add it over the already rendered frame with a full-screen plane.
  const renderTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
  });
  const bloomComposer = new EffectComposer(targetRenderer, renderTarget);
  bloomComposer.renderToScreen = false;
  const renderPass = new RenderPass(scene, camera);
  renderPass.clearAlpha = 0;
  bloomComposer.addPass(renderPass);
  const bloomOnlyPass = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    0,
    DRESS_BLOOM_RADIUS,
    DRESS_BLOOM_THRESHOLD,
  );
  bloomComposer.addPass(bloomOnlyPass);

  const overlayScene = new THREE.Scene();
  const overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const overlayGeometry = new THREE.PlaneGeometry(2, 2);
  const overlayMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uBloom: { value: bloomOnlyPass.renderTargetsHorizontal[0].texture },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uBloom;
      varying vec2 vUv;

      void main() {
        // This pass does no further shaping; its purpose is to expose the bloom
        // texture with alpha so custom additive blending can composite it.
        vec4 bloom = texture2D(uBloom, vUv);
        gl_FragColor = vec4(bloom.rgb, bloom.a);
      }
    `,
    transparent: true,
    // Explicit blend factors are used for both RGB and alpha. OneFactor means
    // neither side is multiplied down: the channels are simply added.
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  overlayScene.add(new THREE.Mesh(overlayGeometry, overlayMaterial));

  return {
    renderer: targetRenderer,
    composer: bloomComposer,
    bloomPass: bloomOnlyPass,
    overlayScene,
    overlayCamera,
    overlayGeometry,
    overlayMaterial,
  };
}

const subjectBloomPipeline = createSubjectBloomPipeline(renderer);

// ---------------------------------------------------------------------------
// INVISIBLE CITIES "SYSTEM" TITLE MASK
// ---------------------------------------------------------------------------
// Canvas 2D draws the typography into an alpha mask. Three.js then uses that
// mask in a full-screen shader. At black opacity 0 the letters become a window
// into a captured background texture; at 1 they are solid near-black.
// Keep this backing store stable across viewport changes. Resizing the source
// canvas under a live CanvasTexture can leave Safari with a partially updated
// texture, which showed up as duplicated title frames on desktop resizes.
const {
  mewTitleOverlayCanvas,
  mewTitleOverlayContext,
  mewTitleOverlayTexture,
  mewTitleOverlayScene,
  mewTitleOverlayCamera,
  mewTitleOverlayGeometry,
  mewTitleOverlayMaterial,
} = createMewTitleOverlay();
function ensureMewForegroundPipeline() {
  if (mewForegroundPipeline) {
    return mewForegroundPipeline;
  }

  const renderer = new THREE.WebGLRenderer({
    canvas: mewForegroundCanvasElement,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(getRenderPixelRatio());
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.64;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const subjectBloomPipeline = createSubjectBloomPipeline(renderer);
  const titleBackgroundComposer = new EffectComposer(renderer);
  titleBackgroundComposer.renderToScreen = false;
  titleBackgroundComposer.addPass(new RenderPass(scene, camera));
  const titleBackgroundBloomPass = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    BLOOM_BASE_STRENGTH,
    BLOOM_BASE_RADIUS,
    BLOOM_THRESHOLD,
  );
  titleBackgroundComposer.addPass(titleBackgroundBloomPass);
  const titleBackgroundBokehPass = new BokehPass(scene, camera, {
    focus: camera.position.distanceTo(focusTarget),
    aperture: 0.013,
    maxblur: 0.028,
  });
  const titleBackgroundBokehUniforms = titleBackgroundBokehPass.uniforms as Record<string, THREE.IUniform<number>>;
  titleBackgroundBokehPass.enabled = false;
  titleBackgroundComposer.addPass(titleBackgroundBokehPass);
  const titleBackgroundCinematicFinishPass = new ShaderPass(CINEMATIC_FINISH_SHADER);
  titleBackgroundComposer.addPass(titleBackgroundCinematicFinishPass);
  const titleBackgroundAlphaFeatherPass = new ShaderPass(MEW_ALPHA_FEATHER_SHADER);
  titleBackgroundAlphaFeatherPass.enabled = false;
  titleBackgroundComposer.addPass(titleBackgroundAlphaFeatherPass);
  titleBackgroundComposer.addPass(new OutputPass());

  mewForegroundPipeline = {
    renderer,
    pmrem,
    environment,
    subjectBloomPipeline,
    titleBackgroundComposer,
    titleBackgroundBloomPass,
    titleBackgroundBokehPass,
    titleBackgroundBokehUniforms,
    titleBackgroundCinematicFinishPass,
    titleBackgroundAlphaFeatherPass,
  };
  mewTitleOverlayMaterial.uniforms.uBackground.value = titleBackgroundComposer.readBuffer.texture;
  mewTitleOverlayMaterial.uniforms.uBlackOpacity.value = mewTitleBlackOpacity;
  mewTitleOverlayTexture.needsUpdate = true;

  const canvasBounds = canvasElement.getBoundingClientRect();
  resizeMewForegroundPipeline(
    mewForegroundPipeline,
    Math.max(1, Math.round(canvasBounds.width || window.innerWidth)),
    Math.max(1, Math.round(canvasBounds.height || window.innerHeight)),
  );
  return mewForegroundPipeline;
}

function disposeMewForegroundPipeline() {
  const pipeline = mewForegroundPipeline;
  if (!pipeline) {
    return;
  }

  pipeline.subjectBloomPipeline.composer.dispose();
  pipeline.subjectBloomPipeline.bloomPass.dispose();
  pipeline.subjectBloomPipeline.overlayMaterial.dispose();
  pipeline.subjectBloomPipeline.overlayGeometry.dispose();
  pipeline.titleBackgroundComposer.dispose();
  pipeline.titleBackgroundBloomPass.dispose();
  pipeline.titleBackgroundBokehPass.dispose();
  pipeline.titleBackgroundCinematicFinishPass.dispose();
  pipeline.titleBackgroundAlphaFeatherPass.dispose();
  pipeline.environment.dispose();
  pipeline.pmrem.dispose();
  pipeline.renderer.dispose();
  mewForegroundPipeline = null;
  mewTitleOverlayMaterial.uniforms.uBackground.value = null;
  mewForegroundCanvasElement.width = 1;
  mewForegroundCanvasElement.height = 1;
}

statusElement.textContent = 'Starting load';

// ---------------------------------------------------------------------------
// MUTABLE RUNTIME STATE AND REUSED MATH OBJECTS
// ---------------------------------------------------------------------------
// Values that change each frame live below. Reused Vector/Box/Raycaster objects
// are intentional: allocating inside pointer and animation loops increases
// garbage collection and can cause visible frame hitches.
let animationFrame = 0;
let shaderTime = 0;
let dressTransitionFx = 0;
let mewTitleBlackOpacity = THREE.MathUtils.clamp(
  Number(mewTitleOpacityInput?.value ?? 100),
  0,
  100,
) / 100;
mewTitleOverlayMaterial.uniforms.uBlackOpacity.value = mewTitleBlackOpacity;
let dressBloomStrength =
  THREE.MathUtils.clamp(Number(dressBloomInput?.value ?? 4), 0, 100) /
  100 *
  DRESS_BLOOM_MAX_STRENGTH;
stageElement.dataset.dressBloomStrength = dressBloomStrength.toFixed(4);
let windController: DressWindController | null = null;
let armBloomController: ArmBloomController | null = null;
let ghostDressSystem: GhostDressSystem | null = null;
let disposed = false;
const fullDressStore = new FullDressStore(scene, () => disposed);
let dressLoadToken = 0;
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
const timer = new THREE.Timer();
timer.connect(document);
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
    photoPrintSystem?.maybeSpawn(x, y, movementX, movementY, now);
  },
});

let queuedResizeFrame = 0;
let queuedMewTitleOverlayFrame = 0;
let mewTitleOverlayDirty = true;
let editorialRailRevealTimeout = 0;
let dialecticPaperTextureEnabled = false;

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
dressThumbnailRenderer.initialize();
applyCycloramaBackgroundPreset(cycloramaBackgroundSettings.preset);
registerAssetServiceWorker();
void start();

// ---------------------------------------------------------------------------
// ASSET LOADING, CACHING, AND DRESS ACTIVATION
// ---------------------------------------------------------------------------
// `start` is async because the first visible GLB must be ready before the
// loading cover disappears. The animation loop starts only after that critical
// path; secondary dresses and ghost versions load afterward in the background.
async function start() {
  if (!silentMewReload) {
    setLoadingOverlay('Loading selected dress');
  }

  await loadDressAsset(dressAssetSettings.asset, !silentMewReload);

  hideLoadingOverlay();
  ghostDressSystem?.schedule();
  animate();
  // The active dress and any theme-specific ghost are enough for the first
  // mobile frame. Preloading another full textured GLB duplicates its GPU
  // textures and can terminate Safari's WebContent process before interaction.
  if (!usesMobileRenderProfile()) {
    void preloadRemainingFullDresses();
  }
}

function registerAssetServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Asset service worker registration failed', error);
    });
  }, { once: true });
}

async function preloadRemainingFullDresses() {
  for (const assetId of DRESS_ASSET_ORDER) {
    if (assetId === dressAssetSettings.asset) {
      continue;
    }

    try {
      await fullDressStore.preload(DRESS_ASSETS[assetId]);
    } catch (error) {
      // Background preloading should never block the visible selected dress.
      console.warn(`Failed to preload ${DRESS_ASSETS[assetId].label}`, error);
    }
  }
}







function setLoadingOverlay(detail: string) {
  if (editorialRailRevealTimeout) {
    window.clearTimeout(editorialRailRevealTimeout);
    editorialRailRevealTimeout = 0;
  }
  editorialRail.setReady(false);
  loadingOverlay.dataset.hidden = 'false';
  loadingDetail.textContent = detail;
}

function hideLoadingOverlay() {
  loadingOverlay.dataset.hidden = 'true';
  editorialRailRevealTimeout = window.setTimeout(() => {
    editorialRailRevealTimeout = 0;
    editorialRail.setReady(true);
  }, LOADING_OVERLAY_FADE_MS);
}

async function loadDressAsset(assetId: DressAssetId, useLoadingOverlay = false) {
  if (fullDressStore.active?.asset.id === assetId) {
    if (dressAssetSettings.asset !== assetId) {
      dressLoadToken += 1;
      dressAssetSettings.asset = assetId;
      updateDressAssetButtons(false);
      ghostDressSystem?.updateVisibility();
    }
    return;
  }

  // A monotonically increasing request token solves an asynchronous race:
  // if the user requests Dress 1, then Dress 2 before Dress 1 finishes, the
  // older request sees a stale token and is not allowed to replace Dress 2.
  const token = ++dressLoadToken;
  const asset = DRESS_ASSETS[assetId];
  dressAssetSettings.asset = assetId;
  updateDressAssetButtons(true);
  ghostDressSystem?.updateVisibility();
  statusElement.dataset.hidden = 'false';
  delete statusElement.dataset.error;
  statusElement.textContent = `Loading ${asset.label}`;
  if (useLoadingOverlay) {
    setLoadingOverlay(`Loading ${asset.label}`);
  }

  try {
    let record: FullDressRecord | null | undefined = fullDressStore.get(assetId);

    if (!record) {
      const preloadPromise = fullDressStore.getPending(assetId);
      if (preloadPromise) {
        if (useLoadingOverlay) {
          setLoadingOverlay(`Finishing ${asset.label}`);
        }
        statusElement.textContent = `Finishing ${asset.label}`;
        record = await preloadPromise;
      } else {
        record = await fullDressStore.load(asset, (stage) => {
          if (token === dressLoadToken) {
            statusElement.textContent = `${stage}: ${asset.label}`;
            if (useLoadingOverlay) {
              setLoadingOverlay(`${stage}: ${asset.label}`);
            }
          }
        });
      }

      if (token !== dressLoadToken || disposed) {
        return;
      }

      if (!record) {
        throw new Error(`Could not prepare ${asset.label}.`);
      }

      fullDressStore.cache(record);
    }

    if (token !== dressLoadToken) {
      return;
    }

    activateFullDress(record);
    fullDressStore.prune();
    updateDressUrl(assetId);

    if (isMewHoloScrollTheme() && !mewHoloScroll.switching) {
      resetMewHoloScrollRotation();
    }

    ghostDressSystem?.schedule();
    statusElement.dataset.hidden = 'true';
    statusElement.textContent = '';
  } catch (error) {
    if (token !== dressLoadToken) {
      return;
    }

    dressAssetSettings.asset = fullDressStore.active?.asset.id ?? DRESS_ASSET_DEFAULT;
    updateDressAssetButtons(false);
    ghostDressSystem?.updateVisibility();
    statusElement.textContent = error instanceof Error ? error.message : `Failed to load ${fullDressStore.getAssetUrl(asset)}`;
    statusElement.dataset.error = 'true';
  } finally {
    if (token === dressLoadToken) {
      updateDressAssetButtons(false);
    }
  }
}



function activateFullDress(record: FullDressRecord) {
  const previous = fullDressStore.active;

  if (previous === record) {
    return;
  }

  windController?.dispose();
  armBloomController?.dispose();
  windController = null;
  armBloomController = null;

  if (previous) {
    // A Three.js object may have only one parent. Shadows move from the previous
    // pivot to the new pivot so they always follow the active subject.
    if (contactShadow?.parent === previous.pivot) {
      previous.pivot.remove(contactShadow);
    }
    if (dialecticHalftoneShadow?.parent === previous.pivot) {
      previous.pivot.remove(dialecticHalftoneShadow);
    }
    fullDressStore.fadeOut(previous);
  }

  fullDressStore.activate(record);
  record.pivot.rotation.y = subjectMotion.yaw;
  record.pivot.visible = true;

  if (record.pivot.parent !== scene) {
    scene.add(record.pivot);
  }

  if (contactShadow) {
    record.pivot.add(contactShadow);
  }
  if (dialecticHalftoneShadow) {
    record.pivot.add(dialecticHalftoneShadow);
  }

  resetDressWind();
  subjectMotion.pivot = record.pivot;
  focusTarget.copy(record.loaded.focus);
  applyThemeSubjectPlacement();
  windController = createDressWindController(record.loaded.dress);
  armBloomController = createArmBloomController(record.loaded.arms);
  record.opacity = 0;
  record.targetOpacity = 1;
  // Crossfade opacity is applied recursively because one GLB can contain many
  // materials. See `setObjectOpacity` for restoration of material flags.
  setObjectOpacity(record.pivot, 0);
  applyResponsiveCameraToCanvas();
  updateDebugState(record.loaded.bounds);
  ghostDressSystem?.updateVisibility();
  updateThemeObjectVisibility();

  if (previous) {
    maybeStartDressTransitionFx();
  }

  signalDiptych.build();
}

// Kicks off the transition bloom/glitch envelope, but only for Blue + Mew Holo.
function maybeStartDressTransitionFx() {
  if (!DRESS_TRANSITION_FX_ENABLED) {
    return;
  }

  const preset = cycloramaBackgroundSettings.preset;
  if (preset === 'blue' || isHoloScrollTheme(preset)) {
    dressTransitionFx = 1;
  }
}

// Renders just the dress/arm figure (no background, ghosts or shadow) through the
// FX composer so its bloom + glitch stay localized to the figure.
function renderDressTransitionFx(delta: number): boolean {
  const pipeline = ensureSubjectTransitionPipeline();
  const subjectPivots: THREE.Object3D[] = [];
  fullDressStore.records.forEach((record) => {
    if (record.pivot.visible) {
      subjectPivots.push(record.pivot);
    }
  });

  if (subjectPivots.length === 0) {
    return false;
  }

  const subjectSet = new Set<THREE.Object3D>(subjectPivots);
  const hidden: THREE.Object3D[] = [];
  ([
    cycloramaMesh,
    infiniteBackdropMesh,
    holoAccentGroup,
    ivorySculptureGroup,
    photoPrintGroup,
    windArchiveDressShadow,
    dialecticHalftoneShadow,
    signalBlackGroup,
    yellowBacking,
    paperRollMesh,
    dressGhostGroup,
  ] as Array<THREE.Object3D | null>).forEach((object) => {
    if (object && object.visible) {
      hidden.push(object);
    }
  });

  const previousBackground = scene.background;
  const previousFog = scene.fog;
  const previousShadowVisible = contactShadow?.visible ?? null;

  hidden.forEach((object) => {
    object.visible = false;
  });
  if (contactShadow && !subjectSet.has(contactShadow)) {
    contactShadow.visible = false;
  }
  scene.background = null;
  scene.fog = null;

  pipeline.glitchPass.enabled = dressTransitionFx > 0.18 && dressTransitionFx < 0.82;
  // Keep glitch subtle: never use goWild (the violent full-screen mode),
  // and only let it flicker during the middle of the crossfade.
  pipeline.glitchPass.goWild = false;

  try {
    pipeline.composer.render(delta);
  } finally {
    scene.background = previousBackground;
    scene.fog = previousFog;
    if (contactShadow && previousShadowVisible !== null) {
      contactShadow.visible = previousShadowVisible;
    }
    hidden.forEach((object) => {
      object.visible = true;
    });
    renderer.setRenderTarget(null);
  }

  return true;
}







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
  photoPrintSystem?.update(delta, shaderTime);
  holoSculptureSystem?.update(shaderTime, delta);
  updateThemeObjectVisibility();
  // ...then upload the latest wind state to the dress material uniforms.
  windController?.update({
    time: shaderTime,
    windVector: pointerWind.wind,
    gustCenter: pointerWind.gustCenter,
    activity: pointerWind.activity,
    strength: settings.windStrength,
    fabricLooseness: settings.fabricLooseness,
    flutter: settings.flutter,
    gustRadius: settings.gustRadius,
  });
  armBloomController?.update(pointerWind.activity);
  const blueThemeActive = cycloramaBackgroundSettings.preset === 'blue';
  const scrollThemeActive = isHoloScrollTheme();
  const invisibleCitiesActive = cycloramaBackgroundSettings.preset === 'mew-holo';
  const ivoryThemeActive = cycloramaBackgroundSettings.preset === 'ivory-holo';
  const signalThemeActive = cycloramaBackgroundSettings.preset === 'signal-black';
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
  const mewPipeline = mewForegroundPipeline;
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
  syncIvoryBackgroundOpticsPass(ivoryThemeActive);
  syncCinematicFinishPass();
  syncDressMaterialEffectUniforms();
  syncMewAlphaFeatherPass(false);
 if (mewPipeline) {
  syncMewAlphaFeatherPass(
    false,
    mewPipeline.titleBackgroundAlphaFeatherPass,
  );
}

  if (dressTransitionFx > 0) {
    dressTransitionFx = Math.max(0, dressTransitionFx - delta / DRESS_TRANSITION_FX_DURATION);
  }
  const transitionFxActive =
    DRESS_TRANSITION_FX_ENABLED && dressTransitionFx > 0 && (blueThemeActive || scrollThemeActive);

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

  if (transitionFxActive && renderDressTransitionFx(delta)) {
    // Ease the burst in/out so it peaks mid-transition rather than snapping,
    // and keep the overall contribution restrained (subtle, not a flash).
    const eased = Math.sin(Math.min(1, dressTransitionFx) * Math.PI * 0.5);
    if (subjectTransitionPipeline) {
      subjectTransitionPipeline.overlayMaterial.opacity = eased * DRESS_TRANSITION_FX_OVERLAY_OPACITY;
      renderer.autoClear = false;
      renderer.render(subjectTransitionPipeline.overlayScene, subjectTransitionPipeline.overlayCamera);
      renderer.autoClear = true;
    }
  } else if (subjectTransitionPipeline) {
    disposeSubjectTransitionPipeline();
  }

  animationFrame = window.requestAnimationFrame(animate);
}



function getVisibleSubjectObjects() {
  const objects: THREE.Object3D[] = [];
  objects.push(...fullDressStore.visibleRoots());

  if (dressGhostGroup.visible) {
    objects.push(dressGhostGroup);
  }

  return objects;
}

function renderMewForeground(delta: number) {
  const pipeline = mewForegroundPipeline;
  if (!pipeline) {
    return;
  }

  if (mewTitleOverlayDirty) {
    mewTitleOverlayDirty = !updateMewTitleOverlayTexture();
  }
  mewTitleOverlayMaterial.uniforms.uBackgroundNeedsOutput.value = 0;

  // Capture the title's live background without crossing WebGL contexts. The
  // base canvas is rendered by `renderer`; copying that canvas into the
  // foreground renderer used texSubImage2D and could retain stale dimensions
  // after a Mobile Safari resize. Rendering the same background into a target
  // owned by the foreground renderer keeps the texture allocation coherent.
  const titleBackgroundSubjects = getVisibleSubjectObjects();
  const titleBackgroundSubjectVisibility = titleBackgroundSubjects.map((object) => object.visible);
  const previousRenderTarget = pipeline.renderer.getRenderTarget();
  const previousAutoClear = pipeline.renderer.autoClear;
  titleBackgroundSubjects.forEach((object) => {
    object.visible = false;
  });

  try {
    pipeline.titleBackgroundComposer.render(delta);
    mewTitleOverlayMaterial.uniforms.uBackground.value = pipeline.titleBackgroundComposer.readBuffer.texture;
  } finally {
    titleBackgroundSubjects.forEach((object, index) => {
      object.visible = titleBackgroundSubjectVisibility[index];
    });
    pipeline.renderer.setRenderTarget(previousRenderTarget);
    pipeline.renderer.autoClear = previousAutoClear;
  }

  // Visibility is saved and restored rather than inferred afterward. This makes
  // the function safe when a theme intentionally hides one of these groups.
  const hiddenObjects: THREE.Object3D[] = [];
  [cycloramaMesh, infiniteBackdropMesh, holoAccentGroup, ivorySculptureGroup, photoPrintGroup, windArchiveDressShadow, dialecticHalftoneShadow, yellowBacking, paperRollMesh].forEach((object) => {
    if (object) {
      hiddenObjects.push(object);
    }
  });
  const previousVisibility = hiddenObjects.map((object) => object.visible);
  const previousBackground = scene.background;
  const previousEnvironment = scene.environment;

  hiddenObjects.forEach((object) => {
    object.visible = false;
  });
  scene.background = null;
  scene.environment = pipeline.environment;

  try {
    resetMewForegroundScreenTarget(pipeline.renderer);
    pipeline.renderer.autoClear = true;
    // Clear color, depth, and stencil. Then disable automatic clears so several
    // deliberate layers can accumulate in this one canvas.
    pipeline.renderer.clear(true, true, true);
    pipeline.renderer.autoClear = false;
    pipeline.renderer.render(mewTitleOverlayScene, mewTitleOverlayCamera);
    // The title plane fills the screen and writes depth. Clearing only depth
    // preserves its color while allowing the 3D dress to draw in front.
    pipeline.renderer.clearDepth();
    pipeline.renderer.render(scene, camera);
    renderSubjectBloom(delta, pipeline.subjectBloomPipeline);
  } finally {
    pipeline.renderer.autoClear = true;
    scene.background = previousBackground;
    scene.environment = previousEnvironment;
    hiddenObjects.forEach((object, index) => {
      object.visible = previousVisibility[index];
    });
  }
}

function renderMewMobile(delta: number) {
  if (mewTitleOverlayDirty) {
    mewTitleOverlayDirty = !updateMewTitleOverlayTexture();
  }
  // The main composer has just rendered the subject-free chromatic field. Its
  // read buffer is already available in this context, so the title can sample
  // it without allocating another full post-processing chain.
  mewTitleOverlayMaterial.uniforms.uBackground.value = composer.readBuffer.texture;
  mewTitleOverlayMaterial.uniforms.uBackgroundNeedsOutput.value = 1;
  mewTitleOverlayMaterial.uniforms.uToneMappingExposure.value = renderer.toneMappingExposure;
  const previousAutoClear = renderer.autoClear;

  const hiddenObjects: THREE.Object3D[] = [];
  [cycloramaMesh, infiniteBackdropMesh, holoAccentGroup, ivorySculptureGroup, photoPrintGroup, windArchiveDressShadow, dialecticHalftoneShadow, yellowBacking, paperRollMesh].forEach((object) => {
    if (object) {
      hiddenObjects.push(object);
    }
  });
  const previousVisibility = hiddenObjects.map((object) => object.visible);
  const previousBackground = scene.background;

  hiddenObjects.forEach((object) => {
    object.visible = false;
  });
  scene.background = null;

  try {
    const width = Math.max(1, Math.round(canvasElement.clientWidth));
    const height = Math.max(1, Math.round(canvasElement.clientHeight));
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, width, height);
    renderer.setScissor(0, 0, width, height);
    renderer.setScissorTest(false);
    renderer.autoClear = false;
    // renderer.render(mewTitleOverlayScene, mewTitleOverlayCamera);
    renderer.clearDepth();
    renderer.render(scene, camera);
    renderSubjectBloom(delta, subjectBloomPipeline);
  } finally {
    renderer.autoClear = previousAutoClear;
    scene.background = previousBackground;
    hiddenObjects.forEach((object, index) => {
      object.visible = previousVisibility[index];
    });
  }
}

function resetMewForegroundScreenTarget(renderer: THREE.WebGLRenderer) {
  const width = Math.max(1, Math.round(mewForegroundCanvasElement.clientWidth));
  const height = Math.max(1, Math.round(mewForegroundCanvasElement.clientHeight));

  // EffectComposer renders the title background through several offscreen
  // targets. Explicitly restore the complete default framebuffer region before
  // clearing it; otherwise a desktop resize can retain an old title frame in a
  // previous viewport/scissor rectangle.
  renderer.setRenderTarget(null);
  renderer.setViewport(0, 0, width, height);
  renderer.setScissor(0, 0, width, height);
  renderer.setScissorTest(false);
}

function resizeMewForegroundPipeline(pipeline: MewForegroundPipeline, width: number, height: number) {
  pipeline.renderer.setPixelRatio(getRenderPixelRatio());
  pipeline.renderer.setSize(width, height, false);
  resetMewForegroundScreenTarget(pipeline.renderer);
  pipeline.renderer.clear(true, true, true);
  resizeEffectComposer(pipeline.titleBackgroundComposer, width, height);
  resizeEffectComposer(pipeline.subjectBloomPipeline.composer, width, height);
}

function resizeEffectComposer(composer: EffectComposer, width: number, height: number) {
  // Post-processing remains enabled on mobile. Its intermediate render targets
  // use a reduced scale so Safari has room for the visible renderer, garment,
  // and theme geometry without forcing a WebContent memory termination.
  composer.setPixelRatio(getEffectPixelRatio());
  composer.setSize(width, height);
}

function renderSharpSubjectOverlay(delta: number) {
  const hiddenObjects: THREE.Object3D[] = [];
  [cycloramaMesh, infiniteBackdropMesh, holoAccentGroup, ivorySculptureGroup, photoPrintGroup, windArchiveDressShadow, yellowBacking, paperRollMesh, dialecticHalftoneShadow].forEach((object) => {
    if (object) {
      hiddenObjects.push(object);
    }
  });
  const previousVisibility = hiddenObjects.map((object) => object.visible);
  const previousAutoClear = renderer.autoClear;
  const previousBackground = scene.background;

  hiddenObjects.forEach((object) => {
    object.visible = false;
  });

  scene.background = null;
  try {
    // Keep the already-rendered environment color, clear its depth values,
    // and draw subject geometry as the nearest new layer. The former offscreen
    // sharp-subject compositor was never used by this path, yet held several
    // full-screen GPU targets for every theme.
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, camera);
    renderSubjectBloom(delta, subjectBloomPipeline);
  } finally {
    renderer.autoClear = previousAutoClear;
    scene.background = previousBackground;
    hiddenObjects.forEach((object, index) => {
      object.visible = previousVisibility[index];
    });
  }
}

function renderSubjectBloom(delta: number, pipeline: SubjectBloomPipeline) {
  if (dressBloomStrength <= 0) {
    return;
  }

  pipeline.bloomPass.strength = dressBloomStrength;
  pipeline.bloomPass.radius = DRESS_BLOOM_RADIUS;
  pipeline.bloomPass.threshold = DRESS_BLOOM_THRESHOLD;
  pipeline.composer.render(delta);

  // Returning to the default framebuffer (`null`) is essential. Otherwise the
  // overlay would be rendered back into its own offscreen input.
  const previousAutoClear = pipeline.renderer.autoClear;
  pipeline.renderer.setRenderTarget(null);
  pipeline.renderer.autoClear = false;
  pipeline.renderer.render(pipeline.overlayScene, pipeline.overlayCamera);
  pipeline.renderer.autoClear = previousAutoClear;
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

function isMewHoloScrollTheme() {
  return isHoloScrollTheme();
}

function isHoloScrollTheme(preset = cycloramaBackgroundSettings.preset) {
  return preset === 'mew-holo' || preset === 'tabla-rasa';
}

function isPhysicalCycloramaTheme() {
  return cycloramaBackgroundSettings.preset === 'ivory-holo';
}

function handleCanvasPointerDown(event: PointerEvent) {
  if (ghostDressSystem?.select(event)) {
    event.preventDefault();
    return;
  }

  handlePointerMove(event);
}







function createArmBloomController(targets: THREE.Object3D | THREE.Object3D[]): ArmBloomController {
  // Emissive light is a material property: it makes a surface appear to emit
  // its own light color. It does not illuminate nearby meshes. Bloom may then
  // spread sufficiently bright emissive pixels into a visible glow.
  const records: Array<{
    mesh: THREE.Mesh;
    originalMaterial: THREE.Material | THREE.Material[];
    glowMaterial: THREE.Material | THREE.Material[];
  }> = [];
  let glowAmount = 0;
  const glowTargets = Array.isArray(targets) ? targets : [targets];

  glowTargets.forEach((target) => {
    target.traverse((object) => {
      const mesh = object as THREE.Mesh;

      if (!mesh.isMesh || !mesh.material) {
        return;
      }

      const originalMaterial = mesh.material;
      const glowMaterial = Array.isArray(originalMaterial)
        ? originalMaterial.map((material) => createArmGlowMaterial(material))
        : createArmGlowMaterial(originalMaterial);

      mesh.material = glowMaterial;
      records.push({ mesh, originalMaterial, glowMaterial });
    });
  });

  return {
    update: (activity: number) => {
      glowAmount = THREE.MathUtils.lerp(glowAmount, activity, 0.18);
      const intensity = glowAmount * ARMS_GLOW_SCALE;

      records.forEach((record) => {
        const materials = Array.isArray(record.glowMaterial) ? record.glowMaterial : [record.glowMaterial];
        materials.forEach((material) => updateArmGlowMaterial(material, intensity));
      });
    },
    dispose: () => {
      records.forEach((record) => {
        record.mesh.material = record.originalMaterial;
        const materials = Array.isArray(record.glowMaterial) ? record.glowMaterial : [record.glowMaterial];
        materials.forEach((material) => material.dispose());
      });
    },
  };
}

function createArmGlowMaterial(sourceMaterial: THREE.Material): THREE.Material {
  const material = sourceMaterial.clone();
  updateArmGlowMaterial(material, 0);
  material.needsUpdate = true;
  return material;
}

function updateArmGlowMaterial(material: THREE.Material, intensity: number) {
  const emissiveMaterial = material as THREE.MeshStandardMaterial;

  if (!emissiveMaterial.emissive || emissiveMaterial.emissiveIntensity === undefined) {
    return;
  }

  emissiveMaterial.emissive.set(0xf4efe5);
  emissiveMaterial.emissiveIntensity = intensity;
}

function addLighting(targetScene: THREE.Scene) {
  // RectAreaLight approximates a large photography softbox. Larger area lights
  // create broad, soft highlights, which suits fabric better than a tiny point
  // source. RectAreaLight affects PBR materials but does not cast shadows here.
  const softbox = new THREE.RectAreaLight(0xf0e7d7, 2.2, 6.4, 7.2);
  softbox.position.set(-3.2, 3.45, 3.9);
  softbox.lookAt(0, 1.15, 0);
  targetScene.add(softbox);

  // A DirectionalLight has parallel rays as if the source were infinitely far
  // away. Position controls direction, not inverse-square distance falloff.
  const key = new THREE.DirectionalLight(0xf0e8da, 0.22);
  key.position.set(-3.6, 5.2, 4.8);
  key.castShadow = false;
  targetScene.add(key);

  // The cool rear rim separates silhouette edges from the backdrop.
  const rim = new THREE.DirectionalLight(0xb8d1e8, 0.24);
  rim.position.set(4.2, 3.2, -3.2);
  targetScene.add(rim);

  // PointLight radiates in every direction. The fourth argument is physical
  // decay; 2 approximates inverse-square falloff, 2.6 falls off a little faster.
  const floorGlow = new THREE.PointLight(0xd4c1a5, 0.26, 7.2, 2.6);
  floorGlow.position.set(-1.85, 0.42, 1.65);
  targetScene.add(floorGlow);

  // HemisphereLight supplies cheap sky/ground fill and prevents fully black
  // unlit-facing regions. It is ambient directionality, not a shadow caster.
  targetScene.add(new THREE.HemisphereLight(0xc6d5df, 0x5f6d76, 0.5));
}

function loadEditorialBackdropTexture(
  url: string,
  textureUniform: THREE.IUniform<THREE.Texture | null>,
  aspectUniform: THREE.IUniform<number>,
) {
  const texture = trackTexture(
    new THREE.TextureLoader().load(url, (loadedTexture) => {
      const image = loadedTexture.image as { width?: number; height?: number };
      if (image.width && image.height) {
        aspectUniform.value = image.width / image.height;
      }
      loadedTexture.needsUpdate = true;
    }),
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  // ClampToEdge avoids repeating the opposite edge when UVs reach the border.
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // Anisotropic filtering improves textures viewed at a grazing angle. It costs
  // texture bandwidth, so the value is capped at 4.
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  textureUniform.value = texture;
}

function addStudio(targetScene: THREE.Scene) {
  // -------------------------------------------------------------------------
  // STUDIO GEOMETRY AND AUTHORED SHADOW PLANES
  // -------------------------------------------------------------------------
  // This function constructs long-lived background objects. Theme switching
  // generally toggles visibility/material modes rather than recreating them.
  loadEditorialBackdropTexture(
    '/editorial/sarmi-background-horizontal.png',
    infiniteBackdropUniforms.uGraphicTexture,
    infiniteBackdropUniforms.uGraphicAspect,
  );
  loadEditorialBackdropTexture(
    '/editorial/sarmi-background-vertical.jpg',
    infiniteBackdropUniforms.uGraphicVerticalTexture,
    infiniteBackdropUniforms.uGraphicVerticalAspect,
  );
  loadEditorialBackdropTexture(
    '/editorial/sarmi-web-75.jpg',
    infiniteBackdropUniforms.uHeroStillTexture,
    infiniteBackdropUniforms.uHeroStillAspect,
  );

  const cycloramaTexture = trackTexture(
    new THREE.TextureLoader().load('/cyclo_bg2.jpg', (texture) => {
      const image = texture.image as { width?: number; height?: number };
      cycloramaTextureAspect = image.width && image.height ? image.width / image.height : CYCLO_TEXTURE_FALLBACK_ASPECT;
      syncCycloramaBackgroundUniforms();
      texture.needsUpdate = true;
    }),
  );
  cycloramaTexture.colorSpace = THREE.SRGBColorSpace;
  cycloramaTexture.wrapS = THREE.RepeatWrapping;
  cycloramaTexture.wrapT = THREE.RepeatWrapping;
  cycloramaTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  syncCycloramaBackgroundUniforms();

  infiniteBackdropMaterial = trackMaterial(createInfiniteBackdropMaterial(infiniteBackdropUniforms));
  infiniteBackdropMesh = new THREE.Mesh(trackGeometry(new THREE.PlaneGeometry(1, 1, 1, 1)), infiniteBackdropMaterial);
  infiniteBackdropMesh.name = 'infinite theme backdrop';
  // The backdrop is parented to the camera. Its local transform therefore
  // follows camera motion and it behaves like an infinitely distant 2D field.
  infiniteBackdropMesh.position.set(0, 0, -24);
  infiniteBackdropMesh.renderOrder = -1000;
  camera.add(infiniteBackdropMesh);

  yellowBackingMaterial = trackMaterial(createTechnicolorYellowPlaneMaterial(TECHNICOLOR_YELLOW));
  yellowBacking = new THREE.Mesh(
    trackGeometry(new THREE.PlaneGeometry(CYCLO_WIDTH * 2.45, CYCLO_WALL_HEIGHT + 1.9, 1, 1)),
    yellowBackingMaterial,
  );
  yellowBacking.name = 'technicolor yellow backing plane';
  yellowBacking.position.set(0, (CYCLO_WALL_HEIGHT + 0.75) * 0.5, CYCLO_BACK_Z - 0.18);
  yellowBacking.visible = false;
  targetScene.add(yellowBacking);
  photoPrintSystem = new PhotoPrintSystem({
    scene: targetScene,
    camera,
    renderer,
    canvas: canvasElement,
    stage: stageElement,
    resources: resourceTracker,
    getThemeId: () => cycloramaBackgroundSettings.preset,
    getFullDresses: () => fullDressStore.records,
    getPointerWind: () => pointerWind,
    isMobileViewport,
  });
  photoPrintGroup = photoPrintSystem.group;
  holoSculptureSystem = new HoloSculptureSystem({
    scene: targetScene,
    resources: resourceTracker,
    renderer,
    camera,
    getPointerWind: () => pointerWind,
  });
  holoAccentGroup = holoSculptureSystem.holoAccentGroup;
  ivorySculptureGroup = holoSculptureSystem.ivorySculptureGroup;
  signalBlackGroup = holoSculptureSystem.signalBlackGroup;

  cycloramaMaterial = trackMaterial(
    // MeshStandardMaterial is physically based (PBR). Roughness 1 is matte,
    // metalness 0 is dielectric/non-metal, and envMapIntensity controls the
    // strength of RoomEnvironment reflections.
    new THREE.MeshStandardMaterial({
      color: 0xb5c8d2,
      map: cycloramaTexture,
      roughness: 0.88,
      metalness: 0,
      envMapIntensity: 0.24,
    }),
  );
  patchCycloramaBackgroundMaterial(cycloramaMaterial, cycloramaBackgroundUniforms);
  cycloramaHoloMaterial = trackMaterial(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: cycloramaTexture,
      fog: true,
      toneMapped: false,
    }),
  );
  patchCycloramaBackgroundMaterial(cycloramaHoloMaterial, cycloramaBackgroundUniforms);
  cycloramaMesh = new THREE.Mesh(trackGeometry(createCycloramaGeometry()), cycloramaMaterial);
  cycloramaMesh.receiveShadow = false;
  targetScene.add(cycloramaMesh);

  contactShadowMaterial = trackMaterial(createSoftContactShadowMaterial(0x354a5a, 0.2));
  contactShadow = new THREE.Mesh(
    trackGeometry(new THREE.PlaneGeometry(1, 1, 1, 1)),
    contactShadowMaterial,
  );
  // PlaneGeometry is created upright in local XY. Rotating -π/2 around X lays
  // it flat in XZ like a horizontal floor.
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.set(0, 0.014, 0.18);
  contactShadow.scale.set(1.35, 0.5, 1);

  windArchiveDressShadow = new THREE.Mesh(
    trackGeometry(new THREE.PlaneGeometry(1, 1, 1, 1)),
    trackMaterial(createSoftContactShadowMaterial(0x3f332b, 0.38)),
  );
  windArchiveDressShadow.name = 'wind archive dress shadow';
  // This uses the same slope as the resting prints, visually claiming that all
  // of them occupy one invisible plane.
  windArchiveDressShadow.rotation.x = PHOTO_PRINT_SURFACE_TILT;
  windArchiveDressShadow.position.set(0.16, PHOTO_PRINT_FLOOR_Y - 0.12, 0.24);
  windArchiveDressShadow.scale.set(2.2, 1.25, 1);
  windArchiveDressShadow.renderOrder = 1;
  windArchiveDressShadow.visible = false;
  targetScene.add(windArchiveDressShadow);

  dialecticHalftoneShadow = new THREE.Mesh(
    trackGeometry(new THREE.PlaneGeometry(1, 1, 1, 1)),
    trackMaterial(createDialecticHalftoneShadowMaterial()),
  );
  dialecticHalftoneShadow.name = 'dialectic halftone floor shadow';

  // DIALECTIC SHADOW TUNING
  // -----------------------
  // PlaneGeometry starts as a 1×1 square in local XY. We tip it toward the
  // camera, scale it into a footprint, and attach it to the active dress pivot.
  //
  // rotation.x:
  //   More negative approaches a horizontal floor (-PI/2 is perfectly flat).
  //   Less negative makes the plane face the camera more directly. Keep it near
  //   PHOTO_PRINT_SURFACE_TILT if it should agree with the Wind Archive floor.
  //
  // position.set(X, Y, Z):
  //   X moves the entire shadow left/right.
  //   Y moves it up/down in dress-local space. More negative Y creates a larger
  //     visible gap below the hem; less negative Y tucks it under the dress.
  //   Z moves it in depth. In this scene positive Z is toward the camera. On a
  //     tilted plane, increasing Z generally projects more of the shadow below
  //     the dress and strengthens the sense of floor depth.
  //
  // scale.set(width, depth, 1):
  //   First value controls footprint width.
  //   Second value controls how far the footprint extends along the floor.
  //
  // Because this mesh is later parented to the dress pivot, its transform is
  // also multiplied by the current dress's pivot scale.
  dialecticHalftoneShadow.rotation.x = PHOTO_PRINT_SURFACE_TILT;
  dialecticHalftoneShadow.position.set(0.06, -0.27, -0.08);
  dialecticHalftoneShadow.scale.set(2, 1.3, 1);
  // Transparent objects are sorted partly by renderOrder. A fixed positive
  // order makes this draw after background geometry. The material does not
  // write depth, so it cannot block the dress rendered above it.
  dialecticHalftoneShadow.renderOrder = 1;
  dialecticHalftoneShadow.visible = false;
  targetScene.add(dialecticHalftoneShadow);

  paperRollMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x6f8799,
      roughness: 0.82,
      metalness: 0,
      envMapIntensity: 0.32,
    }),
  );
  paperRollMesh = new THREE.Mesh(trackGeometry(new THREE.CylinderGeometry(0.075, 0.075, 8.5, 32)), paperRollMaterial);
  paperRollMesh.rotation.z = Math.PI / 2;
  paperRollMesh.position.set(0, 4.72, -2.08);
  targetScene.add(paperRollMesh);
}























































































function syncCycloramaBackgroundUniforms() {
  const preset = CYCLO_BACKGROUND_PRESETS[cycloramaBackgroundSettings.preset];
  const cover = getCoveredCycloramaTransform(cycloramaTextureAspect);

  cycloramaBackgroundUniforms.uCycloTextureMode.value = CYCLO_TEXTURE_MODE_VALUES[preset.textureMode];
  cycloramaBackgroundUniforms.uCycloTileRepeat.value.set(
    CYCLO_TEXTURE_REPEAT_X,
    getCycloramaRepeatY(cycloramaTextureAspect),
  );
  cycloramaBackgroundUniforms.uCycloCoverScale.value.copy(cover.scale);
  cycloramaBackgroundUniforms.uCycloCoverOffset.value.copy(cover.offset);
}



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
  mewTitleOverlayDirty = true;
  syncCycloramaBackgroundUniforms();
  syncInfiniteBackdropMode();

  if (cycloramaMesh && cycloramaMaterial && cycloramaHoloMaterial) {
    cycloramaMesh.material = useIvoryHolo ? cycloramaHoloMaterial : cycloramaMaterial;
  }

  if (holoAccentGroup) {
    holoAccentGroup.visible = presetId === 'mew-holo';
    holoSculptureSystem?.applyPalette(presetId);
  }

  if (photoPrintGroup) {
    photoPrintGroup.visible = presetId === 'tabla-rasa';
  }

  if (ivorySculptureGroup) {
    ivorySculptureGroup.visible = useIvoryHolo;
  }

  if (signalBlackGroup) {
    signalBlackGroup.visible = useSignalBlack;
  }

  if (cycloramaMaterial) {
    cycloramaMaterial.color.setHex(preset.cycloramaColor);
    cycloramaMaterial.roughness = preset.cycloramaRoughness;
    cycloramaMaterial.metalness = preset.cycloramaMetalness;
    cycloramaMaterial.envMapIntensity = preset.cycloramaEnvMapIntensity;
    cycloramaMaterial.toneMapped = true;
    cycloramaMaterial.needsUpdate = true;
  }

  if (cycloramaHoloMaterial) {
    cycloramaHoloMaterial.color.setHex(preset.cycloramaColor);
    cycloramaHoloMaterial.toneMapped = false;
    cycloramaHoloMaterial.needsUpdate = true;
  }

  if (contactShadowMaterial) {
    contactShadowMaterial.uniforms.uColor.value.setHex(preset.shadowColor);
    contactShadowMaterial.uniforms.uOpacity.value = preset.shadowOpacity;
  }

  if (paperRollMaterial) {
    paperRollMaterial.color.setHex(preset.paperRollColor);
  }

  if (yellowBacking && yellowBackingMaterial) {
    yellowBackingMaterial.color.setHex(preset.yellowBackingColor);
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
  ghostDressSystem?.schedule();
  renderDressThumbnails();
  updateCycloramaBackgroundButtons();
  signalDiptych.build();
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

  if (infiniteBackdropMesh) {
    infiniteBackdropMesh.visible = !physicalCyclorama;
  }

  if (cycloramaMesh) {
    cycloramaMesh.visible = physicalCyclorama;
  }

  if (paperRollMesh) {
    paperRollMesh.visible = false;
  }

  if (yellowBacking) {
    yellowBacking.visible = false;
  }

  if (contactShadow) {
    contactShadow.visible = physicalCyclorama;
  }

  if (windArchiveDressShadow) {
    windArchiveDressShadow.visible = photoPrintTheme;
  }

  if (dialecticHalftoneShadow) {
    dialecticHalftoneShadow.visible = cycloramaBackgroundSettings.preset === 'blue';
  }

  if (holoAccentGroup) {
    holoAccentGroup.visible = cycloramaBackgroundSettings.preset === 'mew-holo';
  }

  if (photoPrintGroup) {
    photoPrintGroup.visible = photoPrintTheme;
  }

  if (ivorySculptureGroup) {
    ivorySculptureGroup.visible = physicalCyclorama;
  }

  if (signalBlackGroup) {
    signalBlackGroup.visible = signalBlack;
  }

  fullDressStore.records.forEach((record) => {
    if (record === fullDressStore.active && record.targetOpacity > 0) {
      record.pivot.visible = true;
    }
  });
}

function updateInfiniteBackdropScale() {
  if (!infiniteBackdropMesh) {
    return;
  }

  const distance = Math.abs(infiniteBackdropMesh.position.z);
  const height = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) * distance;
  const width = height * camera.aspect;
  infiniteBackdropMesh.scale.set(width, height, 1);
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

function updateDressAssetButtons(loading = false) {
  dressButtons.forEach((button) => {
    const active = button.dataset.dressAsset === dressAssetSettings.asset;
    button.dataset.active = active ? 'true' : 'false';
    button.setAttribute('aria-pressed', String(active));
    button.disabled = loading;
  });

  dressNavigationButtons.forEach((button) => {
    button.disabled = loading;
  });

  const activeIndex = Math.max(0, DRESS_ASSET_ORDER.indexOf(dressAssetSettings.asset));
  if (dressNavigationLabel) {
    dressNavigationLabel.textContent = DRESS_ASSETS[dressAssetSettings.asset].label;
  }
  if (dressNavigationCount) {
    dressNavigationCount.textContent = `${activeIndex + 1} of ${DRESS_ASSET_ORDER.length}`;
  }
  experienceControls.setDress(dressAssetSettings.asset);

  renderDressThumbnails();
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

function handleDressAssetClick(event: MouseEvent) {
  const assetId = (event.currentTarget as HTMLButtonElement).dataset.dressAsset;
  const activeAssetId = fullDressStore.active?.asset.id;

  if (isDressAssetId(assetId) && assetId !== activeAssetId) {
    void loadDressAsset(assetId);
  }
}

function handleMewTitleOpacityInput(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const percent = THREE.MathUtils.clamp(Number(input.value), 0, 100);
  mewTitleBlackOpacity = percent / 100;
  mewTitleOverlayMaterial.uniforms.uBlackOpacity.value = mewTitleBlackOpacity;
  if (mewTitleOpacityValue) {
    mewTitleOpacityValue.value = `${Math.round(percent)}%`;
  }
}

function handleDressBloomInput(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const percent = THREE.MathUtils.clamp(Number(input.value), 0, 100);
  dressBloomStrength = percent / 100 * DRESS_BLOOM_MAX_STRENGTH;
  stageElement.dataset.dressBloomStrength = dressBloomStrength.toFixed(4);
  if (dressBloomValue) {
    dressBloomValue.value = `${Math.round(percent)}%`;
  }
}

function handleTuningControlsShortcut(event: KeyboardEvent) {
  if (
    event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.key.toLowerCase() === 't'
  ) {
    event.preventDefault();
    const visible = stageElement.dataset.tuningControls === 'true';
    const nextVisible = !visible;
    stageElement.dataset.tuningControls = nextVisible ? 'true' : 'false';
  }
}

function handleDressNavigationClick(event: MouseEvent) {
  const direction = Number((event.currentTarget as HTMLButtonElement).dataset.dressDirection);
  if (!Number.isFinite(direction) || direction === 0) {
    return;
  }

  const activeId = fullDressStore.active?.asset.id ?? dressAssetSettings.asset;
  const activeIndex = Math.max(0, DRESS_ASSET_ORDER.indexOf(activeId));
  const offset = direction > 0 ? 1 : -1;
  const nextIndex = (activeIndex + offset + DRESS_ASSET_ORDER.length) % DRESS_ASSET_ORDER.length;
  const nextAssetId = DRESS_ASSET_ORDER[nextIndex];

  if (nextAssetId && nextAssetId !== activeId) {
    void loadDressAsset(nextAssetId);
  }
}

function pickSignalNodeFromEvent(event: Event): DressAssetId | null {
  if (cycloramaBackgroundSettings.preset !== 'signal-black') {
    return null;
  }
  const target = event.target as HTMLElement | null;
  const canvas = target?.closest?.('.signal-diptych__node') as HTMLCanvasElement | null;
  if (!canvas) {
    return null;
  }
  const id = canvas.dataset.dressId;
  if (!isDressAssetId(id) || id === dressAssetSettings.asset) {
    return null;
  }
  return id;
}

function handleSignalNodeClick(event: MouseEvent) {
  const id = pickSignalNodeFromEvent(event);
  if (id) {
    void loadDressAsset(id);
  }
}

function handleSignalNodeKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }
  const id = pickSignalNodeFromEvent(event);
  if (id) {
    event.preventDefault();
    void loadDressAsset(id);
  }
}

function updateDressUrl(assetId: DressAssetId) {
  writeDressToUrl(assetId);
}









function syncCinematicFinishPass() {
  syncCinematicUniforms(cinematicFinishPass);
  if (mewForegroundPipeline) {
    syncCinematicUniforms(mewForegroundPipeline.titleBackgroundCinematicFinishPass);
  }
}

function syncDressMaterialEffectUniforms() {
  // Keep the dress on the existing direct render path. This updates only the
  // material-level grain uniforms, so it does not change tone mapping, alpha
  // compositing, lighting, bloom, diffusion, halation, vignette, or color grade.
  syncDressMaterialGrain({
    time: shaderTime,
    resolutionWidth: Math.max(1, canvasElement.width),
    resolutionHeight: Math.max(1, canvasElement.height),
    filmGrain: DRESS_MATERIAL_GRAIN_STRENGTH,
  });
}

function syncCinematicUniforms(pass: ShaderPass) {
  // Updating uniforms mutates small values already attached to the compiled GPU
  // program; it does not rebuild the shader or composer.
  const uniforms = pass.uniforms as Record<string, THREE.IUniform<number | THREE.Vector2>>;
  const holoEditorialActive = isHoloScrollTheme();
  uniforms.uTime.value = shaderTime;
  (uniforms.uResolution.value as THREE.Vector2).set(
    Math.max(1, canvasElement.width),
    Math.max(1, canvasElement.height),
  );
  uniforms.uEnabled.value = cinematicSettings.enabled ? 1 : 0;
  uniforms.uFilmGrain.value = cinematicSettings.filmGrain;
  uniforms.uDiffusion.value = cinematicSettings.diffusion;
  uniforms.uHalation.value = cinematicSettings.halation;
  uniforms.uVignette.value = holoEditorialActive ? 0 : cinematicSettings.vignette;
  uniforms.uSaturation.value = holoEditorialActive ? Math.max(cinematicSettings.saturation, 1.09) : cinematicSettings.saturation;
  uniforms.uContrast.value = cinematicSettings.contrast;
  uniforms.uWarmHighlights.value = cinematicSettings.warmHighlights;
  uniforms.uBlackLift.value = cinematicSettings.blackLift;
}

function syncMewAlphaFeatherPass(enabled: boolean, pass = mewAlphaFeatherPass) {
  pass.enabled = enabled;

  const uniforms = pass.uniforms as Record<string, THREE.IUniform<number>>;
  uniforms.uFeatherWidth.value = 0.31;
  uniforms.uFeatherOpacity.value = 1;
  uniforms.uFeatherLift.value = 0.72;
  uniforms.uFeatherSaturation.value = 0.46;
}

function syncIvoryBackgroundOpticsPass(enabled: boolean) {
  ivoryBackgroundOpticsPass.enabled = enabled;

  const uniforms = ivoryBackgroundOpticsPass.uniforms as Record<string, THREE.IUniform<number>>;
  uniforms.uTime.value = shaderTime;
  uniforms.uAspect.value = camera.aspect;
  uniforms.uStrength.value = ivoryBackgroundOpticsSettings.strength;
  uniforms.uRadiusScale.value = ivoryBackgroundOpticsSettings.radiusScale;
  uniforms.uPulseSpeed.value = ivoryBackgroundOpticsSettings.pulseSpeed;
}

function queueCanvasResize() {
  // ResizeObserver/window events may fire repeatedly in one browser frame.
  // Coalescing through requestAnimationFrame performs one expensive resize.
  if (queuedResizeFrame) {
    window.cancelAnimationFrame(queuedResizeFrame);
  }

  queuedResizeFrame = window.requestAnimationFrame(() => {
    queuedResizeFrame = 0;

    if (!disposed) {
      resize();
    }
  });
}

function queueMewTitleOverlayTextureUpdate() {
  mewTitleOverlayDirty = true;

  if (queuedMewTitleOverlayFrame) {
    window.cancelAnimationFrame(queuedMewTitleOverlayFrame);
  }

  // Theme CSS can move the canvas from the Blue pane into the centered Mew
  // layout. Measure after that layout has committed, rather than preserving a
  // zero-sized hidden word from a hard load on another theme.
  queuedMewTitleOverlayFrame = window.requestAnimationFrame(() => {
    queuedMewTitleOverlayFrame = 0;

    if (!disposed) {
      mewTitleOverlayDirty = !updateMewTitleOverlayTexture();
    }
  });
}

function resize() {
  const canvasBounds = canvasElement.getBoundingClientRect();
  const width = Math.max(1, Math.round(canvasBounds.width || window.innerWidth));
  const height = Math.max(1, Math.round(canvasBounds.height || window.innerHeight));

  renderer.setPixelRatio(getRenderPixelRatio());
  // `false` means do not overwrite CSS width/height; layout owns CSS size while
  // the renderer controls the internal drawing-buffer resolution.
  renderer.setSize(width, height, false);
  if (cycloramaBackgroundSettings.preset === 'mew-holo' && usesSingleContextMewLayout()) {
    disposeMewForegroundPipeline();
  } else if (cycloramaBackgroundSettings.preset === 'mew-holo') {
    resizeMewForegroundPipeline(ensureMewForegroundPipeline(), width, height);
  } else {
    disposeMewForegroundPipeline();
  }
  queueMewTitleOverlayTextureUpdate();
  // Every offscreen render target must match the canvas or it will be stretched,
  // blurry, and sampled with incorrect texel sizes.
  resizeEffectComposer(composer, width, height);
  if (subjectTransitionPipeline) {
    resizeEffectComposer(subjectTransitionPipeline.composer, width, height);
  }
  resizeEffectComposer(subjectBloomPipeline.composer, width, height);
  camera.aspect = width / height;
  // applyResponsiveCamera updates fov/position and ultimately the projection
  // matrix. Changing aspect without a projection update distorts the view.
  applyResponsiveCamera(width, height);
  updateInfiniteBackdropScale();
  ghostDressSystem?.schedule();
  renderDressThumbnails();
  bokehUniforms.aspect.value = camera.aspect;


  renderIvoryPortal(ivoryPortalElement);
  signalDiptych.build();
}

function updateMewTitleOverlayTexture() {
  if (!mewTitleWordElement) {
    return false;
  }

  const canvasBounds = canvasElement.getBoundingClientRect();
  const width = mewTitleOverlayCanvas.width;
  const height = mewTitleOverlayCanvas.height;
  if (canvasBounds.width <= 0 || canvasBounds.height <= 0) {
    return false;
  }

  if (cycloramaBackgroundSettings.preset !== 'mew-holo') {
    mewTitleOverlayContext.clearRect(0, 0, width, height);
    mewTitleOverlayTexture.needsUpdate = true;
    return false;
  }

  const range = document.createRange();
  range.selectNodeContents(mewTitleWordElement);
  const wordBounds = range.getBoundingClientRect();
  range.detach();

  if (wordBounds.width <= 0 || wordBounds.height <= 0) {
    mewTitleOverlayContext.clearRect(0, 0, width, height);
    mewTitleOverlayTexture.needsUpdate = true;
    return false;
  }

  const style = window.getComputedStyle(mewTitleWordElement);
  const scaleX = width / canvasBounds.width;
  const scaleY = height / canvasBounds.height;
  const fontSize = Number.parseFloat(style.fontSize) * scaleY;
  const letterSpacing = Number.parseFloat(style.letterSpacing) * scaleX;
  const text = mewTitleWordElement.textContent?.trim() || 'System';
  
  const x = (wordBounds.left - canvasBounds.left) * scaleX;
  const top = (wordBounds.top - canvasBounds.top) * scaleY;

  mewTitleOverlayContext.clearRect(0, 0, width, height);
  mewTitleOverlayContext.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  mewTitleOverlayContext.textBaseline = 'alphabetic';
  (mewTitleOverlayContext as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
    `${letterSpacing}px`;

  const metrics = mewTitleOverlayContext.measureText(text);
  const measuredWidth = Math.max(1, metrics.width);
  const targetWidth = Math.max(1, wordBounds.width * scaleX);
  const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  const targetHeight = Math.max(1, wordBounds.height * scaleY);
  const baseline = top + Math.max(0, (targetHeight - inkHeight) * 0.5) + metrics.actualBoundingBoxAscent;
  mewTitleOverlayContext.save();
  mewTitleOverlayContext.translate(x, baseline);
  mewTitleOverlayContext.scale(targetWidth / measuredWidth, 1);
  mewTitleOverlayContext.globalAlpha = 1;

  if (true) {
    // Desktop keeps the authored outline treatment. On mobile the same outline
    // consumes too much of the reduced glyph area, so its alpha mask is a
    // single solid silhouette instead.
    mewTitleOverlayContext.lineJoin = 'round';
    mewTitleOverlayContext.miterLimit = 2;
    mewTitleOverlayContext.lineWidth =
    fontSize * (usesMobileRenderProfile() ? 0.04 : 0.01);
    mewTitleOverlayContext.strokeStyle = '#000000';
    mewTitleOverlayContext.strokeText(text, 0, 0);
  }

// White fill = inner-letter marker.
// This is NOT the visible color. The shader still decides visible fill color.
mewTitleOverlayContext.fillStyle = '#0000';
mewTitleOverlayContext.fillText(text, 0, 0);
  mewTitleOverlayContext.restore();
  mewTitleOverlayTexture.needsUpdate = true;
  return true;
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






function applyResponsiveCamera(width: number, height: number) {
  // Camera responsiveness preserves composition in 3D rather than merely
  // resizing the canvas. Portrait layouts need a wider vertical field of view
  // and greater distance so the dress remains inside frame.
  const portrait = width < 720 || height > width * 1.12;
  applyThemeSubjectPlacement();

  // Ivory-holo frames the subject smaller and a touch lower so it sits
  // elegantly inside the portal arch with even margins (head clears the dome,
  // hem lifts off the floor). Other themes keep their original framing.
  const ivory = cycloramaBackgroundSettings.preset === 'ivory-holo';
  const dialectic = cycloramaBackgroundSettings.preset === 'blue';
  const ivoryZoom = ivory ? (portrait ? 1.4 : 1.3) : 1;
  const dialecticZoom = dialectic ? (portrait ? 1.06 : 1.12) : 1;
  const ivoryLift = ivory ? 0.13 : 0;

  // FOV is vertical degrees. A larger value sees more but exaggerates
  // perspective. Moving the camera back also sees more, with less distortion.
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
  const bounds = canvasElement.getBoundingClientRect();
  applyResponsiveCamera(
    Math.max(1, Math.round(bounds.width || window.innerWidth)),
    Math.max(1, Math.round(bounds.height || window.innerHeight)),
  );
}

function applyThemeSubjectPlacement() {
  const invisibleCities = cycloramaBackgroundSettings.preset === 'mew-holo';
  const dialectic = cycloramaBackgroundSettings.preset === 'blue';
  const lift = invisibleCities ? (isMobileViewport() ? 0 : 0.42) : 0;

  fullDressStore.records.forEach((record) => {
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



function updateDebugState(bounds?: THREE.Box3) {
  (window as typeof window & {
    __boosterDebug?: Record<string, unknown>;
  }).__boosterDebug = {
    cameraPosition: camera.position.toArray(),
    focusTarget: focusTarget.toArray(),
    activeDress: fullDressStore.active?.asset.id ?? null,
    fullDressCache: Array.from(fullDressStore.records.keys()),
    backgroundPreset: cycloramaBackgroundSettings.preset,
    photoPrintCount: (photoPrintSystem?.count ?? 0),
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



syncDressMaterialEffectUniforms();
resize();
const canvasResizeObserver = new ResizeObserver(queueCanvasResize);
canvasResizeObserver.observe(canvasElement);
const mewTitleLayoutObserver = new ResizeObserver(queueMewTitleOverlayTextureUpdate);
if (mewTitleWordElement) {
  mewTitleLayoutObserver.observe(mewTitleWordElement);
}
canvasElement.addEventListener('pointermove', handlePointerMove, { passive: true });
canvasElement.addEventListener('pointerdown', handleCanvasPointerDown);
canvasElement.addEventListener('pointerleave', handlePointerLeave, { passive: true });
backgroundButtons.forEach((button) => button.addEventListener('click', handleCycloramaBackgroundClick));
dressButtons.forEach((button) => button.addEventListener('click', handleDressAssetClick));
dressNavigationButtons.forEach((button) => button.addEventListener('click', handleDressNavigationClick));
dialecticPaperToggle?.addEventListener('click', handleDialecticPaperToggle);
mewTitleOpacityInput?.addEventListener('input', handleMewTitleOpacityInput);
dressBloomInput?.addEventListener('input', handleDressBloomInput);
window.addEventListener('keydown', handleTuningControlsShortcut);
if (signalDiptychElement) {
  signalDiptychElement.addEventListener('click', handleSignalNodeClick);
  signalDiptychElement.addEventListener('keydown', handleSignalNodeKeydown);
}
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
  window.cancelAnimationFrame(animationFrame);
  if (editorialRailRevealTimeout) {
    window.clearTimeout(editorialRailRevealTimeout);
    editorialRailRevealTimeout = 0;
  }
  if (queuedResizeFrame) {
    window.cancelAnimationFrame(queuedResizeFrame);
    queuedResizeFrame = 0;
  }
  if (queuedMewTitleOverlayFrame) {
    window.cancelAnimationFrame(queuedMewTitleOverlayFrame);
    queuedMewTitleOverlayFrame = 0;
  }
  canvasResizeObserver.disconnect();
  mewTitleLayoutObserver.disconnect();
  canvasElement.removeEventListener('pointermove', handlePointerMove);
  canvasElement.removeEventListener('pointerdown', handleCanvasPointerDown);
  canvasElement.removeEventListener('pointerleave', handlePointerLeave);
  backgroundButtons.forEach((button) => button.removeEventListener('click', handleCycloramaBackgroundClick));
  dressButtons.forEach((button) => button.removeEventListener('click', handleDressAssetClick));
  dressNavigationButtons.forEach((button) => button.removeEventListener('click', handleDressNavigationClick));
  dialecticPaperToggle?.removeEventListener('click', handleDialecticPaperToggle);
  mewTitleOpacityInput?.removeEventListener('input', handleMewTitleOpacityInput);
  dressBloomInput?.removeEventListener('input', handleDressBloomInput);
  window.removeEventListener('keydown', handleTuningControlsShortcut);
  if (signalDiptychElement) {
    signalDiptychElement.removeEventListener('click', handleSignalNodeClick);
    signalDiptychElement.removeEventListener('keydown', handleSignalNodeKeydown);
  }
  window.removeEventListener('wheel', handleMewHoloWheel);
  window.removeEventListener('touchstart', handleMewHoloTouchStart);
  window.removeEventListener('touchmove', handleMewHoloTouchMove);
  window.removeEventListener('touchend', handleMewHoloTouchEnd);
  window.removeEventListener('touchcancel', handleMewHoloTouchEnd);
  window.removeEventListener('resize', resize);
  window.removeEventListener('beforeunload', dispose);
  experienceControls.destroy();
  armBloomController?.dispose();
  windController?.dispose();
  photoPrintSystem?.dispose();
  fullDressStore.dispose();
  ghostDressSystem?.dispose();
  dressThumbnailRenderer.dispose();
  controls.dispose();
  composer.dispose();
  disposeSubjectTransitionPipeline();
  subjectBloomPipeline.composer.dispose();
  subjectBloomPipeline.bloomPass.dispose();
  subjectBloomPipeline.overlayMaterial.dispose();
  subjectBloomPipeline.overlayGeometry.dispose();
  disposeMewForegroundPipeline();
  mewTitleOverlayTexture.dispose();
  mewTitleOverlayMaterial.dispose();
  mewTitleOverlayGeometry.dispose();
  signalDiptych.dispose();
  timer.dispose();
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
