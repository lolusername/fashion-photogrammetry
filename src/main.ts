import './style.css';
import '../node_modules/lil-gui/dist/lil-gui.css';

import { GUI } from 'lil-gui';
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

import { loadDress, type LoadedDress } from './loadDress';
import {
  CYCLO_BACKGROUND_PRESETS,
  PUBLIC_THEMES,
  isPublicThemeId,
  type CycloramaBackgroundPresetId,
  type CycloramaTextureMode,
  type PublicThemeId,
} from './config/themes';
import {
  DRESS_ASSETS,
  DRESS_ASSET_ORDER,
  isDressAssetId,
  type DressAsset,
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
} from './shaders/dressWindMaterial';

type PointerWindState = {
  previous: THREE.Vector2;
  gustCenter: THREE.Vector2;
  targetWind: THREE.Vector3;
  wind: THREE.Vector3;
  hasPointer: boolean;
  activity: number;
  speed: number;
  lastMoveTime: number;
  lastSampleTime: number;
};

type ArmBloomController = {
  update: (activity: number) => void;
  dispose: () => void;
};

type PaletteMaterial = THREE.Material & {
  color?: THREE.Color;
  roughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  envMapIntensity?: number;
  iridescence?: number;
};

type BlueDressHoverState = {
  overActiveDress: boolean;
  lastMoveTime: number;
};

type MewHoloScrollState = {
  progress: number;
  targetProgress: number;
  switching: boolean;
  touchY: number | null;
};

type SubjectMotionState = {
  pivot: THREE.Group | null;
  yaw: number;
  targetYaw: number;
  cameraLift: number;
  targetCameraLift: number;
  baseCameraPosition: THREE.Vector3;
  baseFocusTarget: THREE.Vector3;
};

type CycloramaBackgroundSettings = {
  preset: CycloramaBackgroundPresetId;
};

type CycloramaBackgroundUniforms = {
  uCycloTextureMode: THREE.IUniform<number>;
  uCycloTileRepeat: THREE.IUniform<THREE.Vector2>;
  uCycloCoverScale: THREE.IUniform<THREE.Vector2>;
  uCycloCoverOffset: THREE.IUniform<THREE.Vector2>;
  uCycloTime: THREE.IUniform<number>;
};

type InfiniteBackdropUniforms = {
  uBackdropMode: THREE.IUniform<number>;
  uBackdropTime: THREE.IUniform<number>;
  uBackdropAspect: THREE.IUniform<number>;
  uGraphicTexture: THREE.IUniform<THREE.Texture | null>;
  uGraphicVerticalTexture: THREE.IUniform<THREE.Texture | null>;
  uHeroStillTexture: THREE.IUniform<THREE.Texture | null>;
  uGraphicAspect: THREE.IUniform<number>;
  uGraphicVerticalAspect: THREE.IUniform<number>;
  uHeroStillAspect: THREE.IUniform<number>;
};

type HoloSculptureMotion = {
  root: THREE.Object3D;
  basePosition: THREE.Vector3;
  baseRotation: THREE.Euler;
  windOffset: THREE.Vector3;
  windVelocity: THREE.Vector3;
  angularOffset: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  floatAmplitude: number;
  floatSpeed: number;
  phase: number;
  spin: THREE.Vector3;
  windScale: number;
};

type PhotoPrintMaterialRecord = {
  material: THREE.MeshBasicMaterial;
  opacity: number;
};

type ScreenSpaceBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type PhotoPrintParticle = {
  root: THREE.Group;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  restQuaternion: THREE.Quaternion;
  age: number;
  lifespan: number;
  floorY: number;
  floorContactAge: number | null;
  baseScale: number;
  seed: number;
  materials: PhotoPrintMaterialRecord[];
};

type FullDressRecord = {
  asset: DressAsset;
  loaded: LoadedDress;
  pivot: THREE.Group;
  opacity: number;
  targetOpacity: number;
  lastUsed: number;
};

type GhostDressRecord = {
  asset: DressAsset;
  root: THREE.Group;
  material: THREE.LineBasicMaterial;
  fillMaterial: THREE.MeshBasicMaterial;
  wireMaterial: THREE.MeshBasicMaterial;
  pickTargets: THREE.Object3D[];
};

type DressThumbnailRecord = {
  assetId: DressAssetId;
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  root: THREE.Group | null;
};

type SignalGraphNodeRecord = {
  assetId: DressAssetId;
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
};

const initialExperienceState = readInitialExperienceState(window.location.search);
const CYCLO_BACKGROUND_DEFAULT: PublicThemeId = initialExperienceState.themeId;
const DRESS_ASSET_DEFAULT: DressAssetId = initialExperienceState.dressId;
const TECHNICOLOR_YELLOW = 0xffff00;
const CYCLO_TEXTURE_MODE_VALUES: Record<CycloramaTextureMode, number> = {
  'blue-flat': 0,
  'mew-holo': 3,
  'tabla-rasa': 6,
  'ivory-holo': 4,
  'signal-black': 5,
};
const INFINITE_BACKDROP_MODE_VALUES: Record<CycloramaBackgroundPresetId, number> = {
  blue: 0,
  'mew-holo': 1,
  'tabla-rasa': 3,
  'ivory-holo': 0,
  'signal-black': 2,
};
const CYCLO_BACKGROUND_GUI_OPTIONS = Object.fromEntries(
  PUBLIC_THEMES.map((preset) => [preset.label, preset.id]),
) as Record<string, CycloramaBackgroundPresetId>;
const DRESS_ASSET_GUI_OPTIONS = Object.fromEntries(
  Object.values(DRESS_ASSETS).map((asset) => [asset.label, asset.id]),
) as Record<string, DressAssetId>;
const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app mount element.');
}

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

const statusElement = status;
const canvasElement = canvas;
const loadingOverlay = loadingOverlayElement;
const loadingDetail = loadingDetailElement;
const showControls = new URLSearchParams(window.location.search).get('controls') === '1';
statusElement.textContent = 'Booting scene';

THREE.ColorManagement.enabled = true;

const settings: DressWindSettings = { ...DRESS_WIND_PRESETS.editorial };
const BLOOM_BASE_STRENGTH = .02;
const BLOOM_WIND_STRENGTH = 0.045;
const BLOOM_BASE_RADIUS = 0.12;
const BLOOM_WIND_RADIUS = 0.06;
const BLOOM_THRESHOLD = 0.9;
// Dress transition FX (Blue + Mew Holo only): a bloom burst + glitch applied to
// the dress/arm figure while it crossfades to another dress. Flip this single
// flag to false to fully remove the effect (it then never renders).
const DRESS_TRANSITION_FX_ENABLED = true;
const DRESS_TRANSITION_FX_DURATION = 0.72;
const DRESS_TRANSITION_FX_OVERLAY_OPACITY = 0.26;
const LOADING_OVERLAY_FADE_MS = 420;
const INVISIBLE_CITIES_SUBJECT_SCALE = 0.9;
const WIND_ARCHIVE_SUBJECT_SCALE = 0.78;
const ARMS_GLOW_SCALE = 0.82;
const SUBJECT_YAW_RESPONSE = 1.0;
const SUBJECT_YAW_RANGE = Math.PI * 2.05;
const SUBJECT_YAW_EASE = 2.6;
const SUBJECT_YAW_WIND_DRIFT = 0.18;
const CAMERA_VERTICAL_RESPONSE = 0.56;
const CAMERA_VERTICAL_EASE = 3.6;
const CAMERA_MAX_LIFT = 0.48;
const FOCUS_MAX_LIFT = 0.25;
const CAMERA_BACK_DISTANCE_MULTIPLIER = 1.5;
const BLUE_DRESS_HOVER_TURN_RESPONSE = 2.15;
const BLUE_DRESS_HOVER_YAW_LIMIT = Math.PI * 0.45;
const BLUE_DRESS_HOVER_IDLE_SECONDS = 0.12;
const BLUE_DRESS_RETURN_EASE = 1.9;
const BLUE_DRESS_ROTATION_EASE = 2.8;
const MEW_SCROLL_ROTATION_EASE = 3.8;
const MEW_SCROLL_TRIGGER_PROGRESS = 0.985;
const MEW_SCROLL_VIEWPORT_FACTOR = 0.92;
const PHOTO_PRINT_IMAGE_URLS = [
  '/editorial/sarmi-web-75.jpg',
  '/editorial/sarmi-web-76.jpg',
  '/editorial/sarmi-web-84.jpg',
  '/editorial/sarmi-web-98.jpg',
];
const PHOTO_PRINT_CARD_WIDTH = 0.68;
const PHOTO_PRINT_CARD_HEIGHT = 0.48;
const PHOTO_PRINT_IMAGE_WIDTH = 0.58;
const PHOTO_PRINT_IMAGE_HEIGHT = 0.326;
const PHOTO_PRINT_SPAWN_Z = 1.22;
const PHOTO_PRINT_FLOOR_Y = 0.24;
const PHOTO_PRINT_SURFACE_TILT = -1.12;
const PHOTO_PRINT_GRAVITY = 1.42;
const PHOTO_PRINT_MAX_ACTIVE = 3;
const PHOTO_PRINT_BURST_INTERVAL = 0.34;
const PHOTO_PRINT_MIN_POINTER_DISTANCE = 0.085;
const PHOTO_PRINT_DRESS_CLEARANCE_NDC = 0.045;
const FULL_DRESS_CACHE_LIMIT = 2;
const FULL_DRESS_FADE_SPEED = 6.5;
const MOBILE_GHOST_LIMIT = 2;
const GHOST_LOAD_DELAY_MS = 180;
const GHOST_EDGE_THRESHOLD_DEGREES = 42;
const DRESS_THUMBNAIL_TARGET_HEIGHT = 1.94;
const DRESS_THUMBNAIL_TARGET_WIDTH = 1.62;
const CYCLO_WIDTH = 8.6;
const CYCLO_FRONT_Z = 4.4;
const CYCLO_BACK_Z = -2.08;
const CYCLO_WALL_HEIGHT = 4.72;
const CYCLO_RADIUS = 1.22;
const CYCLO_TEXTURE_REPEAT_X = 3.25;
const CYCLO_TEXTURE_FALLBACK_ASPECT = 663 / 617;
const MAX_PIXEL_RATIO = 1.5;
const cycloramaBackgroundSettings: CycloramaBackgroundSettings = {
  preset: CYCLO_BACKGROUND_DEFAULT,
};
const dressAssetSettings = {
  asset: DRESS_ASSET_DEFAULT,
};
const cinematicSettings = {
  enabled: true,
  filmGrain: 0.132,
  diffusion: 0.018,
  halation: 0.032,
  vignette: 0.026,
  saturation: 1.03,
  contrast: 0.985,
  warmHighlights: 0.018,
  blackLift: 0.009,
};
const TABLA_RASA_ACCENT_COLORS = [
  0xfdfefe,
  0xf0f4f7,
  0xdfe7ed,
  0xcbd5de,
  0xb9c4ce,
  0xf7f9fb,
];
const ivoryBackgroundOpticsSettings = {
  strength: 0.058,
  radiusScale: 0.94,
  pulseSpeed: 0.68,
};
const cycloramaBackgroundUniforms: CycloramaBackgroundUniforms = {
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
const CINEMATIC_FINISH_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uEnabled: { value: cinematicSettings.enabled ? 1 : 0 },
    uFilmGrain: { value: cinematicSettings.filmGrain },
    uDiffusion: { value: cinematicSettings.diffusion },
    uHalation: { value: cinematicSettings.halation },
    uVignette: { value: cinematicSettings.vignette },
    uSaturation: { value: cinematicSettings.saturation },
    uContrast: { value: cinematicSettings.contrast },
    uWarmHighlights: { value: cinematicSettings.warmHighlights },
    uBlackLift: { value: cinematicSettings.blackLift },
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uEnabled;
    uniform float uFilmGrain;
    uniform float uDiffusion;
    uniform float uHalation;
    uniform float uVignette;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uWarmHighlights;
    uniform float uBlackLift;
    varying vec2 vUv;

    float hash(vec2 value) {
      return fract(sin(dot(value, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    float lumaOf(vec3 color) {
      return dot(color, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec4 source = texture2D(tDiffuse, vUv);

      if (uEnabled < 0.5) {
        gl_FragColor = source;
        return;
      }

      vec2 texel = 1.0 / max(uResolution, vec2(1.0));
      vec3 color = source.rgb;
      float luma = lumaOf(color);
      float highlights = smoothstep(0.66, 0.98, luma);

      // A tiny diffusion blend softens scan harshness without making the frame
      // look blurred. Neighbor samples are alpha-weighted so the same shader can
      // be used on transparent subject overlays without darkening object edges.
      vec3 soft = color * source.a * 0.36;
      float softWeight = source.a * 0.36;
      vec4 softSample = texture2D(tDiffuse, vUv + texel * vec2(1.6, 0.0));
      soft += softSample.rgb * softSample.a * 0.08;
      softWeight += softSample.a * 0.08;
      softSample = texture2D(tDiffuse, vUv - texel * vec2(1.6, 0.0));
      soft += softSample.rgb * softSample.a * 0.08;
      softWeight += softSample.a * 0.08;
      softSample = texture2D(tDiffuse, vUv + texel * vec2(0.0, 1.6));
      soft += softSample.rgb * softSample.a * 0.08;
      softWeight += softSample.a * 0.08;
      softSample = texture2D(tDiffuse, vUv - texel * vec2(0.0, 1.6));
      soft += softSample.rgb * softSample.a * 0.08;
      softWeight += softSample.a * 0.08;
      softSample = texture2D(tDiffuse, vUv + texel * vec2(2.8, 2.8));
      soft += softSample.rgb * softSample.a * 0.08;
      softWeight += softSample.a * 0.08;
      softSample = texture2D(tDiffuse, vUv + texel * vec2(-2.8, 2.8));
      soft += softSample.rgb * softSample.a * 0.08;
      softWeight += softSample.a * 0.08;
      softSample = texture2D(tDiffuse, vUv + texel * vec2(2.8, -2.8));
      soft += softSample.rgb * softSample.a * 0.08;
      softWeight += softSample.a * 0.08;
      softSample = texture2D(tDiffuse, vUv + texel * vec2(-2.8, -2.8));
      soft += softSample.rgb * softSample.a * 0.08;
      softWeight += softSample.a * 0.08;
      soft = softWeight > 0.0001 ? soft / softWeight : color;
      color = mix(color, soft, uDiffusion * (0.55 + highlights * 0.75));

      // Halation only uses bright samples and warms them, like a very restrained film glow.
      vec3 halo = vec3(0.0);
      float haloWeight = 0.0;
      for (int i = 0; i < 8; i += 1) {
        float a = float(i) * 0.78539816339;
        vec2 direction = vec2(cos(a), sin(a));
        vec4 haloSample = texture2D(tDiffuse, vUv + direction * texel * 4.2);
        float bright = smoothstep(0.72, 1.0, lumaOf(haloSample.rgb)) * haloSample.a;
        halo += haloSample.rgb * bright;
        haloWeight += bright;
      }
      halo /= max(haloWeight, 1.0);
      color += halo * vec3(1.0, 0.56, 0.32) * uHalation * highlights;

      luma = lumaOf(color);
      color = mix(vec3(luma), color, uSaturation);
      color = (color - 0.5) * uContrast + 0.5;
      color += uBlackLift * (1.0 - luma);
      color += vec3(1.0, 0.72, 0.44) * highlights * uWarmHighlights;

      float grainA = hash(floor(vUv * vec2(820.0, 1180.0)) + uTime * 23.0);
      float grainB = hash(vUv * vec2(1620.0, 940.0) + uTime * 41.0);
      float grain = ((grainA * 0.68 + grainB * 0.32) - 0.5) * uFilmGrain;
      color += grain * (0.82 + luma * 0.22);

      vec2 centeredUv = vUv - 0.5;
      float edge = smoothstep(0.18, 0.78, dot(centeredUv, centeredUv) * 1.55);
      color *= 1.0 - edge * uVignette;

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), source.a);
    }
  `,
};
const MEW_ALPHA_FEATHER_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uFeatherWidth: { value: 0.31 },
    uFeatherOpacity: { value: 1 },
    uFeatherLift: { value: 0.72 },
    uFeatherSaturation: { value: 0.46 },
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uFeatherWidth;
    uniform float uFeatherOpacity;
    uniform float uFeatherLift;
    uniform float uFeatherSaturation;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Rectangular image-space layer mask: the center stays fully sharp, and
      // each canvas edge dissolves outward. This preserves the editorial page
      // rectangle while avoiding a hard cut.
      vec2 edgeDistance = min(vUv, 1.0 - vUv);
      float distanceToEdge = min(edgeDistance.x, edgeDistance.y);
      float edgeNoise =
        sin(vUv.x * 19.0 + vUv.y * 4.0) * 0.012 +
        sin(vUv.y * 15.0 - vUv.x * 6.0) * 0.008;
      float noisyDistanceToEdge = distanceToEdge + edgeNoise;
      float mask = smoothstep(0.0, uFeatherWidth, noisyDistanceToEdge);
      float featherBand = (1.0 - mask) * smoothstep(0.01, uFeatherWidth * 0.82, noisyDistanceToEdge);

      // Keep the transparent feather luminous instead of gray: the RGB is lifted
      // only inside the fading band, while alpha still dissolves to the page.
      float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(vec3(luma), color.rgb, 1.0 + featherBand * uFeatherSaturation);
      color.rgb = mix(
        color.rgb,
        min(color.rgb * (1.0 + featherBand * 0.38) + vec3(0.08, 0.045, 0.09) * featherBand, vec3(1.0)),
        uFeatherLift
      );

      color.a *= mix(1.0, mask, uFeatherOpacity);
      gl_FragColor = color;
    }
  `,
};
const IVORY_BACKGROUND_OPTICS_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: window.innerWidth / Math.max(1, window.innerHeight) },
    uStrength: { value: ivoryBackgroundOpticsSettings.strength },
    uRadiusScale: { value: ivoryBackgroundOpticsSettings.radiusScale },
    uPulseSpeed: { value: ivoryBackgroundOpticsSettings.pulseSpeed },
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAspect;
    uniform float uStrength;
    uniform float uRadiusScale;
    uniform float uPulseSpeed;
    varying vec2 vUv;

    float hash(vec2 value) {
      return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
    }

    vec2 hash2(vec2 value) {
      return vec2(hash(value), hash(value + 19.37));
    }

    void main() {
      vec2 uv = vUv;
      vec2 totalOffset = vec2(0.0);
      float glassShade = 0.0;

      for (int i = 0; i < 4; i += 1) {
        float fi = float(i);
        float cycle = uTime * uPulseSpeed / (5.8 + fi * 1.35) + fi * 8.73;
        float id = floor(cycle);
        float phase = fract(cycle);
        float lobeActive = step(0.48, hash(vec2(id, fi)));
        float fadeIn = smoothstep(0.0, 0.16, phase);
        float fadeOut = 1.0 - smoothstep(0.58, 1.0, phase);
        float pulse = fadeIn * fadeOut * lobeActive;

        vec2 randoms = hash2(vec2(id + 3.1, fi + 5.4));
        vec2 center = mix(vec2(0.14, 0.18), vec2(0.86, 0.84), randoms);
        center += vec2(
          sin(uTime * (0.13 + fi * 0.025) + randoms.x * 6.2831853),
          cos(uTime * (0.11 + fi * 0.02) + randoms.y * 6.2831853)
        ) * 0.035;

        float radius = mix(0.15, 0.34, hash(vec2(id + 7.0, fi))) * uRadiusScale;
        float sign = mix(-1.0, 1.0, step(0.5, hash(vec2(id + 11.0, fi))));
        vec2 axis = vec2(
          mix(0.72, 1.42, hash(vec2(id + 13.0, fi))),
          mix(0.72, 1.42, hash(vec2(id + 17.0, fi)))
        );
        vec2 aspectDelta = (uv - center) * vec2(uAspect, 1.0) * axis;
        float distanceToLobe = length(aspectDelta);
        float falloff = smoothstep(radius, 0.0, distanceToLobe);

        vec2 radial = normalize(aspectDelta + vec2(0.0001));
        vec2 uvRadial = radial / vec2(uAspect, 1.0) / axis;
        float organicPulse = 0.72 + 0.28 * sin(phase * 6.2831853 + hash(vec2(id, fi + 23.0)) * 6.2831853);
        totalOffset += uvRadial * falloff * falloff * pulse * organicPulse * sign * uStrength;
        float lensEdge = pow(max(falloff * (1.0 - falloff), 0.0) * 4.0, 1.35);
        glassShade += lensEdge * pulse * 0.035;
        glassShade += falloff * pulse * sign * 0.008;
      }

      vec2 sampleUv = clamp(uv - totalOffset, vec2(0.001), vec2(0.999));
      vec4 color = texture2D(tDiffuse, sampleUv);
      color.rgb += glassShade;
      gl_FragColor = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
    }
  `,
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
let photoPrintGroup: THREE.Group | null = null;
let photoPrintCardGeometry: THREE.PlaneGeometry | null = null;
let photoPrintImageGeometry: THREE.PlaneGeometry | null = null;
let photoPrintShadowGeometry: THREE.PlaneGeometry | null = null;
const holoSculptureMotions: HoloSculptureMotion[] = [];
const photoPrintParticles: PhotoPrintParticle[] = [];
const photoPrintTextures: THREE.Texture[] = [];
let contactShadow: THREE.Mesh | null = null;
let contactShadowMaterial: THREE.ShaderMaterial | null = null;
let paperRollMaterial: THREE.MeshStandardMaterial | null = null;
let paperRollMesh: THREE.Mesh | null = null;
let yellowBacking: THREE.Mesh | null = null;
let yellowBackingMaterial: THREE.MeshBasicMaterial | null = null;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x758fa3);
scene.fog = new THREE.FogExp2(0x758fa3, 0.01);
const dressGhostGroup = new THREE.Group();
dressGhostGroup.name = 'dress ghost layer';
scene.add(dressGhostGroup);

const disposableMaterials: THREE.Material[] = [];
const disposableGeometries: THREE.BufferGeometry[] = [];
const disposableTextures: THREE.Texture[] = [];

const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80);
camera.position.set(0.22, 1.35, 4.15);
const focusTarget = new THREE.Vector3(0, 1.05, 0);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({
  canvas: canvasElement,
  alpha: true,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setClearColor(0x758fa3, 1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.64;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFShadowMap;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

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

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(1, 1),
  BLOOM_BASE_STRENGTH,
  BLOOM_BASE_RADIUS,
  BLOOM_THRESHOLD,
);
composer.addPass(bloomPass);
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
composer.addPass(new OutputPass());

// --- Dress transition FX pipeline (self-contained; remove this block + its
// usages to revert). Renders ONLY the dress/arm figure into an offscreen target
// with a strong bloom + GlitchPass, then we additively composite it over the
// final frame during a transition so the burst/glitch is localized to the figure.
const subjectFxRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
  type: THREE.HalfFloatType,
});
subjectFxRenderTarget.texture.colorSpace = THREE.SRGBColorSpace;
const subjectFxComposer = new EffectComposer(renderer, subjectFxRenderTarget);
subjectFxComposer.renderToScreen = false;
const subjectFxRenderPass = new RenderPass(scene, camera);
subjectFxRenderPass.clearAlpha = 0;
subjectFxComposer.addPass(subjectFxRenderPass);
const subjectFxBloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.24, 0.3, 0.2);
subjectFxComposer.addPass(subjectFxBloomPass);
const subjectFxGlitchPass = new GlitchPass();
(subjectFxGlitchPass.uniforms as Record<string, THREE.IUniform<number>>).col_s.value = 0.012;
subjectFxComposer.addPass(subjectFxGlitchPass);
subjectFxComposer.addPass(new OutputPass());

const subjectFxOverlayScene = new THREE.Scene();
const subjectFxOverlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const subjectFxOverlayMaterial = new THREE.MeshBasicMaterial({
  map: subjectFxRenderTarget.texture,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
});
subjectFxOverlayScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), subjectFxOverlayMaterial));

const sharpSubjectRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
  type: THREE.HalfFloatType,
});
sharpSubjectRenderTarget.texture.colorSpace = THREE.SRGBColorSpace;
const sharpSubjectComposer = new EffectComposer(renderer, sharpSubjectRenderTarget);
sharpSubjectComposer.renderToScreen = false;
const sharpSubjectRenderPass = new RenderPass(scene, camera);
sharpSubjectRenderPass.clearAlpha = 0;
sharpSubjectComposer.addPass(sharpSubjectRenderPass);
const sharpSubjectCinematicFinishPass = new ShaderPass(CINEMATIC_FINISH_SHADER);
sharpSubjectComposer.addPass(sharpSubjectCinematicFinishPass);
sharpSubjectComposer.addPass(new OutputPass());

const sharpSubjectOverlayScene = new THREE.Scene();
const sharpSubjectOverlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const sharpSubjectOverlayGeometry = new THREE.PlaneGeometry(2, 2);
const sharpSubjectOverlayMaterial = new THREE.MeshBasicMaterial({
  map: sharpSubjectRenderTarget.texture,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
});
sharpSubjectOverlayScene.add(new THREE.Mesh(sharpSubjectOverlayGeometry, sharpSubjectOverlayMaterial));

statusElement.textContent = 'Starting load';

let animationFrame = 0;
let shaderTime = 0;
let dressTransitionFx = 0;
let windController: DressWindController | null = null;
let armBloomController: ArmBloomController | null = null;
let disposed = false;
let fullDressUseCounter = 0;
let activeFullDress: FullDressRecord | null = null;
let dressLoadToken = 0;
let ghostLoadToken = 0;
let ghostLoadTimeout = 0;
let lastGhostRequestKey = '';
const fullDressCache = new Map<DressAssetId, FullDressRecord>();
const fullDressPreloadPromises = new Map<DressAssetId, Promise<FullDressRecord | null>>();
const ghostDressCache = new Map<DressAssetId, GhostDressRecord>();
const dressThumbnailRecords = new Map<DressAssetId, DressThumbnailRecord>();
const signalGraphNodeRecords = new Map<DressAssetId, SignalGraphNodeRecord>();
const ghostPickTargets: THREE.Object3D[] = [];
const ghostRaycaster = new THREE.Raycaster();
const ghostPointer = new THREE.Vector2();
const activeDressRaycaster = new THREE.Raycaster();
const activeDressPointer = new THREE.Vector2();
const materialFadeOriginals = new WeakMap<THREE.Material, {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}>();
const timer = new THREE.Timer();
timer.connect(document);
const zeroWind = new THREE.Vector3();
const pointerSample = new THREE.Vector2();
const holoWorldPosition = new THREE.Vector3();
const holoScreenPosition = new THREE.Vector2();
const holoCursorDelta = new THREE.Vector2();
const holoAwayFromCursor = new THREE.Vector2();
const holoWindForce = new THREE.Vector3();
const holoTargetOffset = new THREE.Vector3();
const holoOffsetDelta = new THREE.Vector3();
const holoTargetAngularOffset = new THREE.Vector3();
const holoAngularDelta = new THREE.Vector3();
const photoPrintSpawnRaycaster = new THREE.Raycaster();
const photoPrintSpawnNdc = new THREE.Vector2();
const photoPrintSpawnPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -PHOTO_PRINT_SPAWN_Z);
const photoPrintSpawnPosition = new THREE.Vector3();
const photoPrintDressRaycaster = new THREE.Raycaster();
const photoPrintDressPointer = new THREE.Vector2();
const photoPrintDressWorldBounds = new THREE.Box3();
const photoPrintProjectionPoint = new THREE.Vector3();
const photoPrintDressScreenBounds: ScreenSpaceBounds = {
  minX: 0,
  maxX: 0,
  minY: 0,
  maxY: 0,
};
const photoPrintCardScreenBounds: ScreenSpaceBounds = {
  minX: 0,
  maxX: 0,
  minY: 0,
  maxY: 0,
};
const lastPhotoPrintBurstPoint = new THREE.Vector2(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
let lastPhotoPrintBurstTime = Number.NEGATIVE_INFINITY;
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
let gui: GUI | null = null;
let queuedResizeFrame = 0;
let editorialRailRevealTimeout = 0;
let dialecticPaperTextureEnabled = false;

initializeDressThumbnails();
applyCycloramaBackgroundPreset(cycloramaBackgroundSettings.preset);
registerAssetServiceWorker();
void start();

async function start() {
  setLoadingOverlay('Loading selected dress');
  await loadDressAsset(dressAssetSettings.asset, true);
  hideLoadingOverlay();
  scheduleGhostDressLoads();
  animate();
  void preloadRemainingFullDresses();
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
      await preloadFullDressAsset(assetId);
    } catch (error) {
      // Background preloading should never block the visible selected dress.
      console.warn(`Failed to preload ${DRESS_ASSETS[assetId].label}`, error);
    }
  }
}

async function preloadFullDressAsset(assetId: DressAssetId) {
  if (fullDressCache.has(assetId) || fullDressPreloadPromises.has(assetId) || disposed) {
    return;
  }

  const asset = DRESS_ASSETS[assetId];
  const preloadPromise = loadFullDressRecord(asset).finally(() => {
    fullDressPreloadPromises.delete(assetId);
  });
  fullDressPreloadPromises.set(assetId, preloadPromise);

  const record = await preloadPromise;

  if (disposed) {
    return;
  }

  if (record && !fullDressCache.has(assetId)) {
    fullDressCache.set(assetId, record);
  }
}

async function loadFullDressRecord(
  asset: DressAsset,
  onStage?: (stage: string) => void,
): Promise<FullDressRecord | null> {
  const loaded = await loadDress(asset.url, onStage);

  if (disposed) {
    disposeObjectResources(loaded.root);
    return null;
  }

  return createFullDressRecord(asset, loaded);
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
  if (activeFullDress?.asset.id === assetId) {
    return;
  }

  const token = ++dressLoadToken;
  const asset = DRESS_ASSETS[assetId];
  dressAssetSettings.asset = assetId;
  updateDressAssetButtons(true);
  updateGhostVisibility();
  statusElement.dataset.hidden = 'false';
  delete statusElement.dataset.error;
  statusElement.textContent = `Loading ${asset.label}`;
  if (useLoadingOverlay) {
    setLoadingOverlay(`Loading ${asset.label}`);
  }

  try {
    let record: FullDressRecord | null | undefined = fullDressCache.get(assetId);

    if (!record) {
      const preloadPromise = fullDressPreloadPromises.get(assetId);
      if (preloadPromise) {
        if (useLoadingOverlay) {
          setLoadingOverlay(`Finishing ${asset.label}`);
        }
        statusElement.textContent = `Finishing ${asset.label}`;
        record = await preloadPromise;
      } else {
        record = await loadFullDressRecord(asset, (stage) => {
          if (token === dressLoadToken) {
            statusElement.textContent = `${stage}: ${asset.label}`;
            if (useLoadingOverlay) {
              setLoadingOverlay(`${stage}: ${asset.label}`);
            }
          }
        });
      }

      if (token !== dressLoadToken || disposed || !record) {
        return;
      }

      fullDressCache.set(assetId, record);
    }

    if (token !== dressLoadToken) {
      return;
    }

    activateFullDress(record);
    pruneFullDressCache();
    updateDressUrl(assetId);

    if (isMewHoloScrollTheme() && !mewHoloScroll.switching) {
      resetMewHoloScrollRotation();
    }

    scheduleGhostDressLoads();
    statusElement.dataset.hidden = 'true';
    statusElement.textContent = '';
  } catch (error) {
    if (token !== dressLoadToken) {
      return;
    }

    dressAssetSettings.asset = activeFullDress?.asset.id ?? DRESS_ASSET_DEFAULT;
    updateDressAssetButtons(false);
    updateGhostVisibility();
    statusElement.textContent = error instanceof Error ? error.message : `Failed to load ${asset.url}`;
    statusElement.dataset.error = 'true';
    throw error;
  } finally {
    if (token === dressLoadToken) {
      updateDressAssetButtons(false);
    }
  }
}

function createFullDressRecord(asset: DressAsset, loaded: LoadedDress): FullDressRecord {
  removeModelShadowArtifacts(loaded.root);

  const subjectPivot = new THREE.Group();
  subjectPivot.name = `subject ${asset.id}`;
  subjectPivot.visible = false;
  subjectPivot.add(loaded.root);

  return {
    asset,
    loaded,
    pivot: subjectPivot,
    opacity: 1,
    targetOpacity: 1,
    lastUsed: ++fullDressUseCounter,
  };
}

function activateFullDress(record: FullDressRecord) {
  const previous = activeFullDress;

  if (previous === record) {
    return;
  }

  windController?.dispose();
  armBloomController?.dispose();
  windController = null;
  armBloomController = null;

  if (previous && contactShadow?.parent === previous.pivot) {
    previous.pivot.remove(contactShadow);
    fadeOutFullDress(previous);
  }

  activeFullDress = record;
  record.lastUsed = ++fullDressUseCounter;
  record.pivot.rotation.y = subjectMotion.yaw;
  record.pivot.visible = true;

  if (record.pivot.parent !== scene) {
    scene.add(record.pivot);
  }

  if (contactShadow) {
    record.pivot.add(contactShadow);
  }

  resetDressWind();
  subjectMotion.pivot = record.pivot;
  focusTarget.copy(record.loaded.focus);
  applyThemeSubjectPlacement();
  windController = createDressWindController(record.loaded.dress);
  armBloomController = createArmBloomController(record.loaded.arms);
  record.opacity = 0;
  record.targetOpacity = 1;
  setObjectOpacity(record.pivot, 0);
  applyResponsiveCameraToCanvas();
  updateDebugState(record.loaded.bounds);
  updateGhostVisibility();
  updateThemeObjectVisibility();

  if (previous) {
    maybeStartDressTransitionFx();
  }

  buildSignalDiptych();
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
  const subjectPivots: THREE.Object3D[] = [];
  fullDressCache.forEach((record) => {
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

  subjectFxGlitchPass.enabled = dressTransitionFx > 0.18 && dressTransitionFx < 0.82;
  // Keep glitch subtle: never use goWild (the violent full-screen mode),
  // and only let it flicker during the middle of the crossfade.
  subjectFxGlitchPass.goWild = false;

  try {
    subjectFxComposer.render(delta);
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

function fadeOutFullDress(record: FullDressRecord) {
  if (record.pivot.parent !== scene) {
    scene.add(record.pivot);
  }

  record.pivot.visible = true;
  record.opacity = Math.max(record.opacity, 0.001);
  record.targetOpacity = 0;
}

function updateFullDressFades(delta: number) {
  fullDressCache.forEach((record) => {
    if (record.pivot.parent !== scene || !record.pivot.visible || Math.abs(record.opacity - record.targetOpacity) < 0.001) {
      return;
    }

    const nextOpacity = THREE.MathUtils.lerp(
      record.opacity,
      record.targetOpacity,
      1 - Math.exp(-delta * FULL_DRESS_FADE_SPEED),
    );
    record.opacity = Math.abs(nextOpacity - record.targetOpacity) < 0.015 ? record.targetOpacity : nextOpacity;
    setObjectOpacity(record.pivot, record.opacity);

    if (record.opacity <= 0 && record !== activeFullDress) {
      scene.remove(record.pivot);
      record.pivot.visible = false;
      record.opacity = 1;
      record.targetOpacity = 1;
      setObjectOpacity(record.pivot, 1);
    }
  });
}

function pruneFullDressCache() {
  const inactiveRecords = Array.from(fullDressCache.values())
    .filter((record) => record !== activeFullDress)
    .sort((a, b) => b.lastUsed - a.lastUsed);

  inactiveRecords.slice(Math.max(0, FULL_DRESS_CACHE_LIMIT - 1)).forEach((record) => {
    if (record === activeFullDress) {
      return;
    }

    fullDressCache.delete(record.asset.id);
    if (record.pivot.parent) {
      record.pivot.parent.remove(record.pivot);
    }
    disposeObjectResources(record.pivot);
  });
}

function animate(timestamp?: number) {
  timer.update(timestamp);
  const delta = timer.getDelta();

  if (!settings.freezeTime) {
    shaderTime += delta;
  }
  cycloramaBackgroundUniforms.uCycloTime.value = shaderTime;
  infiniteBackdropUniforms.uBackdropTime.value = shaderTime;

  updateFullDressFades(delta);
  updatePointerWind(delta);
  updateSubjectMotion(delta);
  updatePhotoPrintParticles(delta);
  updateMewHoloSculptures(shaderTime, delta);
  updateThemeObjectVisibility();
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
  const objectBlurAmount = invisibleCitiesActive ? 0.018 : ivoryThemeActive ? 0.038 : 0;

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
    ? 0.07 * (1 + pointerWind.activity * 0.28)
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
  bokehPass.enabled = objectPostThemeActive;
  if (objectPostThemeActive) {
    bokehUniforms.focus.value = camera.position.distanceTo(focusTarget);
    bokehUniforms.aperture.value = objectBlurAmount * 0.5;
    bokehUniforms.maxblur.value = objectBlurAmount;
    bokehUniforms.aspect.value = camera.aspect;
  }
  syncIvoryBackgroundOpticsPass(ivoryThemeActive);
  syncCinematicFinishPass();
  syncMewAlphaFeatherPass(invisibleCitiesActive);

  if (dressTransitionFx > 0) {
    dressTransitionFx = Math.max(0, dressTransitionFx - delta / DRESS_TRANSITION_FX_DURATION);
  }
  const transitionFxActive =
    DRESS_TRANSITION_FX_ENABLED && dressTransitionFx > 0 && (blueThemeActive || scrollThemeActive);

  controls.update(delta);
  if (objectPostThemeActive && subjectMotion.pivot) {
    const hiddenSubjectObjects = ivoryThemeActive ? getVisibleFullDressObjects() : getVisibleSubjectObjects();
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
    renderSharpSubjectOverlay(delta, {
      direct: invisibleCitiesActive,
      hideGhosts: ivoryThemeActive,
    });
  } else {
    composer.render(delta);
  }

  if (transitionFxActive && renderDressTransitionFx(delta)) {
    // Ease the burst in/out so it peaks mid-transition rather than snapping,
    // and keep the overall contribution restrained (subtle, not a flash).
    const eased = Math.sin(Math.min(1, dressTransitionFx) * Math.PI * 0.5);
    subjectFxOverlayMaterial.opacity = eased * DRESS_TRANSITION_FX_OVERLAY_OPACITY;
    renderer.autoClear = false;
    renderer.render(subjectFxOverlayScene, subjectFxOverlayCamera);
    renderer.autoClear = true;
  }

  animationFrame = window.requestAnimationFrame(animate);
}

function getVisibleFullDressObjects() {
  const objects: THREE.Object3D[] = [];
  fullDressCache.forEach((record) => {
    if (record.pivot.visible) {
      objects.push(record.pivot);
    }
  });

  return objects;
}

function getVisibleSubjectObjects() {
  const objects: THREE.Object3D[] = [];
  objects.push(...getVisibleFullDressObjects());

  if (dressGhostGroup.visible) {
    objects.push(dressGhostGroup);
  }

  return objects;
}

function renderSharpSubjectOverlay(
  delta: number,
  options: { direct?: boolean; hideGhosts?: boolean } = {},
) {
  const hiddenObjects: THREE.Object3D[] = [];
  [cycloramaMesh, infiniteBackdropMesh, holoAccentGroup, ivorySculptureGroup, photoPrintGroup, yellowBacking, paperRollMesh].forEach((object) => {
    if (object) {
      hiddenObjects.push(object);
    }
  });
  if (options.hideGhosts && dressGhostGroup.visible) {
    hiddenObjects.push(dressGhostGroup);
  }
  const previousVisibility = hiddenObjects.map((object) => object.visible);
  const previousAutoClear = renderer.autoClear;
  const previousBackground = scene.background;

  hiddenObjects.forEach((object) => {
    object.visible = false;
  });

  scene.background = null;
  try {
    if (options.direct) {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(scene, camera);
    } else {
      sharpSubjectRenderPass.clearAlpha = 0;
      sharpSubjectComposer.render(delta);
      renderer.setRenderTarget(null);
      renderer.autoClear = false;
      renderer.render(sharpSubjectOverlayScene, sharpSubjectOverlayCamera);
    }
  } finally {
    renderer.autoClear = previousAutoClear;
    scene.background = previousBackground;
    hiddenObjects.forEach((object, index) => {
      object.visible = previousVisibility[index];
    });
  }
}

function updatePointerWind(delta: number) {
  const now = performance.now() * 0.001;
  const idleTime = pointerWind.hasPointer ? now - pointerWind.lastMoveTime : Number.POSITIVE_INFINITY;

  if (idleTime > 0.045) {
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
  if (isBlueStackTheme() || isSignalBlackTheme()) {
    updateBlueSubjectMotion(delta);
    return;
  }

  if (isMewHoloScrollTheme()) {
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
  if (!isMewHoloScrollTheme() || mewHoloScroll.switching || Math.abs(deltaPixels) < 0.5) {
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
  return Boolean(target?.closest('.lil-gui, .background-switcher, button, input, select, textarea'));
}

async function advanceMewHoloScrollDress() {
  const activeId = activeFullDress?.asset.id ?? dressAssetSettings.asset;
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

    if (isMewHoloScrollTheme()) {
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
  if (!isMewHoloScrollTheme() || shouldIgnoreMewHoloScrollEvent(event) || event.touches.length === 0) {
    mewHoloScroll.touchY = null;
    return;
  }

  mewHoloScroll.touchY = event.touches[0].clientY;
}

function handleMewHoloTouchMove(event: TouchEvent) {
  if (!isMewHoloScrollTheme() || shouldIgnoreMewHoloScrollEvent(event) || event.touches.length === 0 || mewHoloScroll.touchY === null) {
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

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function clampSigned(value: number, limit: number) {
  return Math.min(limit, Math.max(-limit, value));
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
    maybeSpawnPhotoPrintBurst(x, y, x < 0.5 ? 0.72 : -0.72, 0.12, now);
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
  maybeSpawnPhotoPrintBurst(x, y, movementX, movementY, now);
  updateBlueDressHoverFromPointer(x, y, rawMovementX, now);
}

function handlePointerLeave() {
  pointerWind.lastMoveTime = performance.now() * 0.001 - 0.12;
  pointerWind.targetWind.set(0, 0, 0);
  blueDressHover.overActiveDress = false;
  delete canvasElement.dataset.interactionCursor;
}

function updateCanvasInteractionCursor(x: number, y: number) {
  if (ghostPickTargets.length > 0) {
    ghostPointer.set(x * 2 - 1, y * 2 - 1);
    ghostRaycaster.setFromCamera(ghostPointer, camera);
    dressGhostGroup.updateMatrixWorld(true);

    const ghostHit = ghostRaycaster
      .intersectObjects(ghostPickTargets, false)
      .find((intersection) => isObjectWorldVisible(intersection.object));
    const ghostAssetId = ghostHit ? findDressAssetFromObject(ghostHit.object) : null;

    if (ghostAssetId && ghostAssetId !== dressAssetSettings.asset) {
      canvasElement.dataset.interactionCursor = 'ghost';
      return;
    }
  }

  if (activeFullDress) {
    activeDressPointer.set(x * 2 - 1, y * 2 - 1);
    activeDressRaycaster.setFromCamera(activeDressPointer, camera);
    activeFullDress.loaded.dress.updateMatrixWorld(true);

    const overActiveDress = activeDressRaycaster
      .intersectObject(activeFullDress.loaded.dress, true)
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
  if ((!isBlueStackTheme() && !isSignalBlackTheme()) || !activeFullDress) {
    blueDressHover.overActiveDress = false;
    return;
  }

  activeDressPointer.set(x * 2 - 1, y * 2 - 1);
  activeDressRaycaster.setFromCamera(activeDressPointer, camera);
  activeFullDress.loaded.dress.updateMatrixWorld(true);
  const intersections = activeDressRaycaster.intersectObject(activeFullDress.loaded.dress, true);
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

function removeModelShadowArtifacts(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (!mesh.isMesh) {
      return;
    }

    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });
}

function initializeDressThumbnails() {
  dressThumbnailCanvases.forEach((thumbnailCanvas) => {
    const assetId = thumbnailCanvas.dataset.dressThumbnail;

    if (!isDressAssetId(assetId)) {
      return;
    }

    const thumbnailRenderer = new THREE.WebGLRenderer({
      canvas: thumbnailCanvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    thumbnailRenderer.setClearColor(0x000000, 0);
    thumbnailRenderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    thumbnailRenderer.outputColorSpace = THREE.SRGBColorSpace;
    thumbnailRenderer.toneMapping = THREE.NoToneMapping;

    const thumbnailScene = new THREE.Scene();
    thumbnailScene.add(new THREE.AmbientLight(0xffffff, 1.45));
    const thumbnailKey = new THREE.DirectionalLight(0xffffff, 2.9);
    thumbnailKey.position.set(-1.6, 2.4, 2.2);
    thumbnailScene.add(thumbnailKey);
    const thumbnailRim = new THREE.DirectionalLight(0x9fd8ff, 1.35);
    thumbnailRim.position.set(1.8, 1.4, -1.8);
    thumbnailScene.add(thumbnailRim);

    const thumbnailCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 12);
    thumbnailCamera.position.set(0, 0.04, 4.15);
    thumbnailCamera.lookAt(0, 0.02, 0);

    dressThumbnailRecords.set(assetId, {
      assetId,
      canvas: thumbnailCanvas,
      renderer: thumbnailRenderer,
      scene: thumbnailScene,
      camera: thumbnailCamera,
      root: null,
    });
  });
}

function syncDressThumbnailFromGhost(record: GhostDressRecord) {
  const thumbnail = dressThumbnailRecords.get(record.asset.id);

  if (!thumbnail || thumbnail.root) {
    renderDressThumbnail(record.asset.id);
    return;
  }

  const clone = createGhostThumbnailClone(record.root);
  thumbnail.root = clone;
  thumbnail.scene.add(clone);
  frameGhostThumbnailRoot(clone);
  renderDressThumbnail(record.asset.id);
}

function createGhostThumbnailClone(root: THREE.Group) {
  const clone = root.clone(true);

  clone.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const line = object as THREE.LineSegments;

    if (mesh.isMesh && object.userData.isGhostWire) {
      object.visible = false;
      return;
    }

    if (mesh.isMesh && mesh.material) {
      mesh.material = new THREE.MeshStandardMaterial({
        color: 0x6f7d76,
        roughness: 0.82,
        metalness: 0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
        depthTest: true,
        depthWrite: true,
        toneMapped: false,
      });
      mesh.renderOrder = 1;
      return;
    }

    if ((line.isLineSegments || line.isLine) && line.material) {
      line.material = new THREE.LineBasicMaterial({
        color: 0x1f2a26,
        transparent: true,
        opacity: 0.9,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      });
      line.renderOrder = 3;
    }
  });

  return clone;
}

function frameGhostThumbnailRoot(root: THREE.Group) {
  root.position.set(0, 0, 0);
  root.rotation.set(-0.04, 0.54, 0);
  root.scale.setScalar(1);
  root.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const scale = Math.min(
    DRESS_THUMBNAIL_TARGET_HEIGHT / Math.max(size.y, 0.001),
    DRESS_THUMBNAIL_TARGET_WIDTH / Math.max(size.x, 0.001),
  );

  root.scale.setScalar(scale);
  root.position.copy(center).multiplyScalar(-scale);
  root.position.y += size.y * scale * 0.035;
  root.updateMatrixWorld(true);
}

function renderDressThumbnail(assetId: DressAssetId) {
  const thumbnail = dressThumbnailRecords.get(assetId);

  if (!thumbnail?.root) {
    return;
  }

  const width = Math.max(1, thumbnail.canvas.clientWidth || 148);
  const height = Math.max(1, thumbnail.canvas.clientHeight || 148);
  thumbnail.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  thumbnail.renderer.setSize(width, height, false);
  thumbnail.camera.aspect = width / height;
  thumbnail.camera.updateProjectionMatrix();
  thumbnail.renderer.render(thumbnail.scene, thumbnail.camera);
}

function renderDressThumbnails() {
  if (cycloramaBackgroundSettings.preset === 'signal-black') {
    // In signal we render the ghost dress into the graph-node canvases (which
    // reuse the same scenes as the regular thumbnails). The switcher's canvases
    // themselves are display:none here so we skip rendering into them.
    renderSignalGraphNodes();
    return;
  }

  if (!isBlueStackTheme()) {
    return;
  }

  DRESS_ASSET_ORDER.forEach((assetId) => renderDressThumbnail(assetId));
}

function scheduleGhostDressLoads() {
  if (!activeFullDress) {
    return;
  }

  const desiredGhostIds = getDesiredGhostAssetIds();
  const requestKey = desiredGhostIds.join('|');
  lastGhostRequestKey = requestKey;
  ghostLoadToken += 1;
  updateGhostVisibility(desiredGhostIds);

  if (ghostLoadTimeout) {
    window.clearTimeout(ghostLoadTimeout);
    ghostLoadTimeout = 0;
  }

  const unloadedIds = desiredGhostIds.filter((assetId) => !ghostDressCache.has(assetId));

  if (unloadedIds.length === 0) {
    return;
  }

  void loadGhostDressQueue(unloadedIds, ghostLoadToken, requestKey);
}

async function loadGhostDressQueue(assetIds: DressAssetId[], token: number, requestKey: string) {
  for (const assetId of assetIds) {
    if (disposed || token !== ghostLoadToken || requestKey !== lastGhostRequestKey) {
      return;
    }

    await waitForGhostLoadTurn();

    if (disposed || token !== ghostLoadToken || requestKey !== lastGhostRequestKey || ghostDressCache.has(assetId)) {
      continue;
    }

    try {
      const record = await loadGhostDress(assetId);

      if (disposed || token !== ghostLoadToken || requestKey !== lastGhostRequestKey) {
        disposeGhostDressRecord(record);
        continue;
      }

      ghostDressCache.set(assetId, record);
      dressGhostGroup.add(record.root);
      syncDressThumbnailFromGhost(record);
      rebuildGhostPickTargets();
      updateGhostVisibility();
    } catch (error) {
      // Ghost loading should never break the main selected dress experience.
      console.warn(`Failed to load ghost dress ${assetId}`, error);
    }
  }
}

function waitForGhostLoadTurn() {
  return new Promise<void>((resolve) => {
    ghostLoadTimeout = window.setTimeout(() => {
      ghostLoadTimeout = 0;
      resolve();
    }, GHOST_LOAD_DELAY_MS);
  });
}

async function loadGhostDress(assetId: DressAssetId): Promise<GhostDressRecord> {
  const asset = DRESS_ASSETS[assetId];
  const loaded = await loadDress(asset.url);
  const material = new THREE.LineBasicMaterial({
    color: 0xf7efe5,
    transparent: true,
    opacity: 0.72,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const fillMaterial = new THREE.MeshBasicMaterial({
    color: 0xf7efe5,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const wireMaterial = new THREE.MeshBasicMaterial({
    color: 0xf7efe5,
    transparent: true,
    opacity: 0.2,
    wireframe: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  replaceDressWithGhostEdges(loaded.dress, material, fillMaterial, wireMaterial);
  replaceDressWithGhostEdges(loaded.arms, material, fillMaterial, wireMaterial);

  const root = new THREE.Group();
  root.name = `ghost ${asset.id}`;
  root.position.set(...asset.ghost.position);
  root.rotation.y = asset.ghost.rotationY;
  root.scale.setScalar(asset.ghost.scale);
  root.userData.dressAsset = asset.id;
  root.add(loaded.root);

  const pickTargets: THREE.Object3D[] = [];
  loaded.root.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (!mesh.isMesh || object.userData.isGhostWire) {
      return;
    }

    mesh.userData.dressAsset = asset.id;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    pickTargets.push(mesh);
  });

  return {
    asset,
    root,
    material,
    fillMaterial,
    wireMaterial,
    pickTargets,
  };
}

function replaceDressWithGhostEdges(
  dress: THREE.Object3D,
  lineMaterial: THREE.LineBasicMaterial,
  fillMaterial: THREE.MeshBasicMaterial,
  wireMaterial: THREE.MeshBasicMaterial,
) {
  const originalMaterials = new Set<THREE.Material>();
  const originalTextures = new Set<THREE.Texture>();
  const meshes: THREE.Mesh[] = [];

  dress.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (!mesh.isMesh || !mesh.material) {
      return;
    }

    meshes.push(mesh);
  });

  meshes.forEach((mesh) => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((sourceMaterial) => {
      originalMaterials.add(sourceMaterial);
      collectMaterialTextures(sourceMaterial, originalTextures);
    });
    mesh.material = fillMaterial;
    mesh.renderOrder = 5;
    mesh.frustumCulled = false;

    if (mesh.geometry) {
      const wire = new THREE.Mesh(mesh.geometry, wireMaterial);
      wire.name = `${mesh.name || 'dress'} full wire ghost`;
      wire.userData.isGhostWire = true;
      wire.renderOrder = 6;
      wire.frustumCulled = false;
      mesh.add(wire);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry, GHOST_EDGE_THRESHOLD_DEGREES),
        lineMaterial,
      );
      edges.name = `${mesh.name || 'dress'} edge ghost`;
      edges.renderOrder = 7;
      edges.frustumCulled = false;
      mesh.add(edges);
    }
  });

  originalTextures.forEach((texture) => texture.dispose());
  originalMaterials.forEach((sourceMaterial) => sourceMaterial.dispose());
}

function rebuildGhostPickTargets() {
  ghostPickTargets.length = 0;
  ghostDressCache.forEach((record) => {
    if (!record.root.visible) {
      return;
    }

    ghostPickTargets.push(...record.pickTargets);
  });
}

function updateGhostVisibility(desiredGhostIds = getDesiredGhostAssetIds()) {
  const visibleGhostIds = new Set(desiredGhostIds);
  const visibleOrderedIds = DRESS_ASSET_ORDER.filter((assetId) => visibleGhostIds.has(assetId));
  const blue = isBlueStackTheme();
  const invisibleCities = cycloramaBackgroundSettings.preset === 'mew-holo';
  // Signal Black shows the ghost dresses only as nodes in the diptych graph (HTML
  // canvases reusing the thumbnail scenes), so suppress them in the main 3D scene.
  const signal = cycloramaBackgroundSettings.preset === 'signal-black';

  ghostDressCache.forEach((record, assetId) => {
    const visibleInScene = !blue && !invisibleCities && !signal && visibleGhostIds.has(assetId) && assetId !== dressAssetSettings.asset;
    record.root.visible = visibleInScene;

    if (visibleInScene) {
      applyGhostLayout(record, visibleOrderedIds);
    }

    syncDressThumbnailFromGhost(record);
  });

  syncGhostDepthMode();
  rebuildGhostPickTargets();
  renderDressThumbnails();
  updateDebugState();
}

// Ghosts should read as a middle layer: above decorative background sculptures,
// then covered by the active dress when the sharp subject overlay renders.
function syncGhostDepthMode() {
  ghostDressCache.forEach((record) => {
    [record.material, record.fillMaterial, record.wireMaterial].forEach((ghostMaterial) => {
      ghostMaterial.depthTest = false;
      ghostMaterial.depthWrite = false;
      ghostMaterial.needsUpdate = true;
    });
  });
}

function getDesiredGhostAssetIds(): DressAssetId[] {
  const activeAssetId = dressAssetSettings.asset;

  if (cycloramaBackgroundSettings.preset === 'mew-holo') {
    return [];
  }

  if (isBlueStackTheme()) {
    return DRESS_ASSET_ORDER;
  }

  // Signal Black needs both dresses loaded as ghosts so both graph nodes can
  // render the wireframe in the diptych viz.
  if (cycloramaBackgroundSettings.preset === 'signal-black') {
    return DRESS_ASSET_ORDER;
  }

  if (cycloramaBackgroundSettings.preset === 'tabla-rasa') {
    const activeIndex = DRESS_ASSET_ORDER.indexOf(activeAssetId);
    const nextAssetId = DRESS_ASSET_ORDER[
      (Math.max(0, activeIndex) + 1) % DRESS_ASSET_ORDER.length
    ];
    return nextAssetId && nextAssetId !== activeAssetId ? [nextAssetId] : [];
  }

  const inactiveIds = DRESS_ASSET_ORDER.filter((assetId) => assetId !== activeAssetId);

  if (!isMobileViewport()) {
    return inactiveIds;
  }

  const activeIndex = DRESS_ASSET_ORDER.indexOf(activeAssetId);
  return inactiveIds
    .sort((a, b) => getDressOrderDistance(activeIndex, a) - getDressOrderDistance(activeIndex, b))
    .slice(0, MOBILE_GHOST_LIMIT);
}

function getDressOrderDistance(activeIndex: number, assetId: DressAssetId) {
  const index = DRESS_ASSET_ORDER.indexOf(assetId);

  if (activeIndex < 0 || index < 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(index - activeIndex);
}

function isMobileViewport() {
  return window.innerWidth < 720 || window.innerHeight > window.innerWidth * 1.12;
}

function applyGhostLayout(record: GhostDressRecord, visibleOrderedIds: DressAssetId[]) {
  const portrait = isMobileViewport();
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const ivory = cycloramaBackgroundSettings.preset === 'ivory-holo';
  const signal = cycloramaBackgroundSettings.preset === 'signal-black';
  const windArchive = cycloramaBackgroundSettings.preset === 'tabla-rasa';
  const ghostIndex = Math.max(0, visibleOrderedIds.indexOf(record.asset.id));
  const centerOffset = (Math.max(1, visibleOrderedIds.length) - 1) * 0.5;
  const verticalOffset = (ghostIndex - centerOffset) * (portrait ? 0.28 : 0.34);

  if (windArchive) {
    record.root.position.set(
      portrait ? 0.72 : 1.72,
      portrait ? 0.2 : 0.38,
      portrait ? -0.9 : -0.82,
    );
    record.root.rotation.y = -0.32;
    record.root.scale.setScalar(portrait ? 0.3 : 0.56);

    record.material.color.setHex(0x63737c);
    record.material.opacity = 0.55;
    record.material.depthTest = false;
    record.material.depthWrite = false;
    record.material.needsUpdate = true;
    record.fillMaterial.color.setHex(0xf5f9fb);
    record.fillMaterial.opacity = 0.015;
    record.fillMaterial.depthTest = false;
    record.fillMaterial.depthWrite = false;
    record.fillMaterial.needsUpdate = true;
    record.wireMaterial.color.setHex(0x63737c);
    record.wireMaterial.opacity = 0.09;
    record.wireMaterial.depthTest = false;
    record.wireMaterial.depthWrite = false;
    record.wireMaterial.needsUpdate = true;
    return;
  }

  const radiusX = portrait ? 0.92 : aspect > 1.35 ? 2.16 : 1.72;
  const depth = portrait ? -0.82 : -1.08;

  record.root.position.set(
    -radiusX,
    verticalOffset,
    depth - Math.abs(verticalOffset) * 0.16,
  );
  record.root.rotation.y = portrait ? 0.28 : 0.38;
  record.root.scale.setScalar(portrait ? 0.36 : 0.52);

  const lineColor = ivory ? 0x4b3026 : signal ? 0x00e2ff : 0x234c55;
  const fillColor = ivory ? 0xf4e8d6 : signal ? 0x00e2ff : 0xfff3d8;
  record.material.color.set(lineColor);
  record.material.opacity = ivory ? 0.95 : signal ? 0.86 : 0.92;
  record.material.depthTest = false;
  record.material.depthWrite = false;
  record.material.needsUpdate = true;
  record.fillMaterial.color.set(fillColor);
  record.fillMaterial.opacity = ivory ? 0.18 : signal ? 0.11 : 0.14;
  record.fillMaterial.depthTest = false;
  record.fillMaterial.depthWrite = false;
  record.fillMaterial.needsUpdate = true;
  record.wireMaterial.color.set(lineColor);
  record.wireMaterial.opacity = ivory ? 0.34 : signal ? 0.3 : 0.34;
  record.wireMaterial.depthTest = false;
  record.wireMaterial.depthWrite = false;
  record.wireMaterial.needsUpdate = true;
}

function isSignalBlackTheme() {
  return cycloramaBackgroundSettings.preset === 'signal-black';
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
  if (selectGhostFromPointer(event)) {
    event.preventDefault();
    return;
  }

  handlePointerMove(event);
}

function selectGhostFromPointer(event: PointerEvent) {
  if (ghostPickTargets.length === 0) {
    return false;
  }

  const bounds = canvasElement.getBoundingClientRect();
  ghostPointer.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  ghostRaycaster.setFromCamera(ghostPointer, camera);
  dressGhostGroup.updateMatrixWorld(true);

  const intersections = ghostRaycaster.intersectObjects(ghostPickTargets, false);
  const hit = intersections.find((intersection) => isObjectWorldVisible(intersection.object));
  const assetId = hit ? findDressAssetFromObject(hit.object) : null;

  if (!assetId || assetId === dressAssetSettings.asset) {
    return false;
  }

  void loadDressAsset(assetId);
  return true;
}

function findDressAssetFromObject(object: THREE.Object3D): DressAssetId | null {
  let current: THREE.Object3D | null = object;

  while (current) {
    const assetId = current.userData.dressAsset;

    if (isDressAssetId(assetId)) {
      return assetId;
    }

    current = current.parent;
  }

  return null;
}

function isObjectWorldVisible(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object;

  while (current) {
    if (!current.visible) {
      return false;
    }

    current = current.parent;
  }

  return true;
}

function createArmBloomController(targets: THREE.Object3D | THREE.Object3D[]): ArmBloomController {
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
  const softbox = new THREE.RectAreaLight(0xf0e7d7, 2.2, 6.4, 7.2);
  softbox.position.set(-3.2, 3.45, 3.9);
  softbox.lookAt(0, 1.15, 0);
  targetScene.add(softbox);

  const key = new THREE.DirectionalLight(0xf0e8da, 0.22);
  key.position.set(-3.6, 5.2, 4.8);
  key.castShadow = false;
  targetScene.add(key);

  const rim = new THREE.DirectionalLight(0xb8d1e8, 0.24);
  rim.position.set(4.2, 3.2, -3.2);
  targetScene.add(rim);

  const floorGlow = new THREE.PointLight(0xd4c1a5, 0.26, 7.2, 2.6);
  floorGlow.position.set(-1.85, 0.42, 1.65);
  targetScene.add(floorGlow);

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
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  textureUniform.value = texture;
}

function addStudio(targetScene: THREE.Scene) {
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

  infiniteBackdropMaterial = trackMaterial(createInfiniteBackdropMaterial());
  infiniteBackdropMesh = new THREE.Mesh(trackGeometry(new THREE.PlaneGeometry(1, 1, 1, 1)), infiniteBackdropMaterial);
  infiniteBackdropMesh.name = 'infinite theme backdrop';
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
  initializePhotoPrintBursts(targetScene);
  holoAccentGroup = addMewHoloAccents(targetScene);
  ivorySculptureGroup = addIvoryHoloSculptures(targetScene);
  signalBlackGroup = addSignalBlackAccents(targetScene);

  cycloramaMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xb5c8d2,
      map: cycloramaTexture,
      roughness: 0.88,
      metalness: 0,
      envMapIntensity: 0.24,
    }),
  );
  patchCycloramaBackgroundMaterial(cycloramaMaterial);
  cycloramaHoloMaterial = trackMaterial(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: cycloramaTexture,
      fog: true,
      toneMapped: false,
    }),
  );
  patchCycloramaBackgroundMaterial(cycloramaHoloMaterial);
  cycloramaMesh = new THREE.Mesh(trackGeometry(createCycloramaGeometry()), cycloramaMaterial);
  cycloramaMesh.receiveShadow = false;
  targetScene.add(cycloramaMesh);

  contactShadowMaterial = trackMaterial(createSoftContactShadowMaterial(0x354a5a, 0.2));
  contactShadow = new THREE.Mesh(
    trackGeometry(new THREE.PlaneGeometry(1, 1, 1, 1)),
    contactShadowMaterial,
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.set(0, 0.014, 0.18);
  contactShadow.scale.set(1.35, 0.5, 1);

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

function createInfiniteBackdropMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: infiniteBackdropUniforms,
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uBackdropMode;
      uniform float uBackdropTime;
      uniform float uBackdropAspect;
      uniform sampler2D uGraphicTexture;
      uniform sampler2D uGraphicVerticalTexture;
      uniform sampler2D uHeroStillTexture;
      uniform float uGraphicAspect;
      uniform float uGraphicVerticalAspect;
      uniform float uHeroStillAspect;
      varying vec2 vUv;

      float hash(vec2 value) {
        return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float softBlob(vec2 uv, vec2 center, vec2 scale, float radius, float feather) {
        return smoothstep(radius + feather, radius - feather, length((uv - center) * scale));
      }

      float lineDistance(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a;
        vec2 ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h);
      }

      vec3 screenBlend(vec3 base, vec3 blend) {
        return 1.0 - (1.0 - base) * (1.0 - blend);
      }

      vec2 coverUv(vec2 uv, float imageAspect, float surfaceAspect) {
        vec2 scale = vec2(1.0);

        if (surfaceAspect > imageAspect) {
          scale.y = imageAspect / surfaceAspect;
        } else {
          scale.x = surfaceAspect / imageAspect;
        }

        return (uv - 0.5) * scale + 0.5;
      }

      vec3 sampleEditorialPaper(vec2 uv) {
        vec4 sampled;

        if (uBackdropAspect < 0.82) {
          sampled = texture2D(
            uGraphicVerticalTexture,
            coverUv(uv, uGraphicVerticalAspect, uBackdropAspect)
          );
        } else {
          sampled = texture2D(
            uGraphicTexture,
            coverUv(uv, uGraphicAspect, uBackdropAspect)
          );
        }

        return sRGBTransferEOTF(sampled).rgb;
      }

      vec3 blueBackdrop(vec2 uv) {
        vec3 turquoise = vec3(0.02, 0.64, 0.72);
        vec3 lapis = vec3(0.025, 0.18, 0.52);
        vec3 ink = vec3(0.015, 0.08, 0.28);
        float vertical = smoothstep(-0.08, 1.08, uv.y);
        float diagonal = smoothstep(-0.18, 1.18, uv.x * 0.34 + uv.y * 0.52);
        vec3 color = mix(turquoise, lapis, vertical * 0.58);
        color = mix(color, ink, diagonal * 0.18);
        color += vec3(0.02, 0.08, 0.1) * softBlob(uv, vec2(0.18, 0.72), vec2(0.95, 0.7), 0.58, 0.42);
        return color;
      }

      vec3 mewBackdrop(vec2 uv) {
        vec2 warped = uv;
        warped.x += sin(uv.y * 5.2 + uBackdropTime * 0.09) * 0.035;
        warped.y += sin(uv.x * 4.6 - uBackdropTime * 0.07) * 0.03;
        warped += vec2(
          sin((uv.x + uv.y) * 8.0 + uBackdropTime * 0.06),
          cos((uv.x - uv.y) * 7.0 - uBackdropTime * 0.05)
        ) * 0.018;

        vec3 cyan = vec3(0.28, 0.98, 1.0);
        vec3 mint = vec3(0.42, 1.0, 0.36);
        vec3 acid = vec3(1.0, 0.98, 0.1);
        vec3 pink = vec3(1.0, 0.08, 0.76);
        vec3 pearl = vec3(1.0, 0.9, 0.98);
        vec3 violet = vec3(0.52, 0.32, 1.0);

        float mintPool = softBlob(warped, vec2(0.2, 0.26), vec2(0.75, 1.08), 0.64, 0.38);
        float pinkPool = softBlob(warped, vec2(0.72, 0.46), vec2(1.08, 0.78), 0.52, 0.34);
        float yellowPool = softBlob(warped, vec2(0.78, 0.84), vec2(0.86, 1.16), 0.4, 0.32);
        float violetPool = softBlob(warped, vec2(0.32, 0.74), vec2(1.18, 0.92), 0.45, 0.34);
        float broadPink = smoothstep(-0.12, 1.08, warped.x * 0.92 + warped.y * 0.18);
        float broadMint = 1.0 - smoothstep(0.08, 1.02, warped.x * 0.42 + warped.y * 0.88);
        float broadYellow = smoothstep(0.18, 1.02, warped.x * 0.26 + warped.y * 0.96);
        float diagonalSheen = pow(smoothstep(0.78, 1.0, sin((warped.x * 3.2 - warped.y * 2.5 + 0.18) * 6.2831853) * 0.5 + 0.5), 4.2);
        float fineFoil = pow(smoothstep(0.86, 1.0, sin((warped.x * 15.0 + warped.y * 12.0 + uBackdropTime * 0.12) * 6.2831853) * 0.5 + 0.5), 3.0);

        vec3 color = mix(cyan, pearl, 0.13);
        color = mix(color, pink, broadPink * 0.24);
        color = mix(color, mint, broadMint * 0.3);
        color = mix(color, acid, broadYellow * 0.18);
        color = mix(color, mint, mintPool * 0.94);
        color = mix(color, pink, pinkPool * 0.86);
        color = mix(color, acid, yellowPool * 0.78);
        color = mix(color, violet, violetPool * 0.5);
        color = mix(color, pearl, diagonalSheen * 0.2 + fineFoil * 0.09);

        float shardA = smoothstep(0.035, 0.0, lineDistance(warped, vec2(0.08, 0.78), vec2(0.88, 0.2)));
        float shardB = smoothstep(0.026, 0.0, lineDistance(warped, vec2(0.0, 0.3), vec2(0.72, 0.88)));
        float shardC = smoothstep(0.02, 0.0, lineDistance(warped, vec2(0.5, 0.02), vec2(1.0, 0.58)));
        color += vec3(1.0, 0.96, 0.68) * shardA * 0.12;
        color += vec3(0.4, 1.0, 0.7) * shardB * 0.1;
        color += vec3(1.0, 0.24, 0.76) * shardC * 0.1;

        float grain = hash(floor((uv + uBackdropTime * 0.006) * vec2(520.0, 390.0))) - 0.5;
        color += grain * 0.026;
        color = pow(max(color, vec3(0.0)), vec3(0.78));
        color = color * 1.08 + vec3(0.025, 0.02, 0.045);
        float luminance = dot(color, vec3(0.299, 0.587, 0.114));
        return clamp(mix(vec3(luminance), color, 1.68), 0.0, 1.0);
      }

      vec3 windArchiveBackdrop(vec2 uv) {
        vec2 warped = uv;
        warped.x += sin(uv.y * 4.2 + uBackdropTime * 0.045) * 0.014;
        warped.y += sin(uv.x * 3.8 - uBackdropTime * 0.038) * 0.012;
        warped += vec2(
          sin((uv.x + uv.y) * 6.0 + uBackdropTime * 0.03),
          cos((uv.x - uv.y) * 5.0 - uBackdropTime * 0.026)
        ) * 0.007;

        vec3 color = sampleEditorialPaper(warped);
        vec3 fadedRose = vec3(0.72, 0.27, 0.31);
        vec3 oxidizedTeal = vec3(0.12, 0.38, 0.38);
        vec3 inkBlue = vec3(0.08, 0.16, 0.25);
        vec3 antiqueGold = vec3(0.73, 0.49, 0.2);
        float roseField = softBlob(warped, vec2(0.18, 0.7), vec2(0.78, 1.05), 0.52, 0.34);
        float tealField = softBlob(warped, vec2(0.82, 0.38), vec2(0.86, 0.8), 0.52, 0.34);
        float blueField = softBlob(warped, vec2(0.48, 0.6), vec2(0.92, 0.76), 0.48, 0.34);
        float goldField = softBlob(warped, vec2(0.7, 0.84), vec2(0.86, 1.1), 0.4, 0.32);
        color = mix(color, screenBlend(color, fadedRose), roseField * 0.18);
        color = mix(color, screenBlend(color, oxidizedTeal), tealField * 0.16);
        color = mix(color, screenBlend(color, inkBlue), blueField * 0.1);
        color = mix(color, screenBlend(color, antiqueGold), goldField * 0.12);

        float fineFoil = pow(
          smoothstep(
            0.88,
            1.0,
            sin((warped.x * 15.0 + warped.y * 11.0 + uBackdropTime * 0.05) * 6.2831853) * 0.5 + 0.5
          ),
          3.0
        );
        color += vec3(0.18, 0.13, 0.08) * fineFoil * 0.025;
        float grain = hash(floor((uv + uBackdropTime * 0.002) * vec2(520.0, 390.0))) - 0.5;
        color += grain * 0.008;
        return clamp(color, 0.0, 1.0);
      }

      vec3 signalBackdrop(vec2 uv) {
        vec2 p = (uv - 0.5) * vec2(uBackdropAspect, 1.0);
        vec3 color = vec3(0.018, 0.019, 0.017);
        float paperGrain = hash(floor((uv + vec2(0.03, 0.07)) * vec2(460.0, 620.0))) - 0.5;
        float scuff = hash(floor((uv + vec2(0.31, 0.17)) * vec2(72.0, 110.0)));
        color += vec3(paperGrain * 0.042 + smoothstep(0.992, 1.0, scuff) * 0.09);

        float centerFalloff = smoothstep(0.76, 0.08, length(p * vec2(0.86, 1.12)));
        float sideDarken = smoothstep(0.42, 1.05, abs(p.x));
        color += vec3(0.012, 0.014, 0.012) * centerFalloff;
        color *= 1.0 - sideDarken * 0.18;
        color *= 1.0 - smoothstep(0.66, 1.04, length(p)) * 0.28;
        return clamp(color, 0.0, 1.0);
      }

      void main() {
        vec2 uv = vUv;
        vec3 color = blueBackdrop(uv);

        if (uBackdropMode > 2.5) {
          color = windArchiveBackdrop(uv);
        } else if (uBackdropMode > 1.5) {
          color = signalBackdrop(uv);
        } else if (uBackdropMode > 0.5) {
          color = mewBackdrop(uv);
        }

        gl_FragColor = vec4(color, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
}

function addSignalBlackAccents(targetScene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = 'signal black quiet field';
  group.visible = false;
  targetScene.add(group);
  return group;
}

function createShardGeometry() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array([
    -0.52, -0.18, 0,
    -0.08, 0.28, 0,
    0.58, 0.12, 0,
    0.18, -0.34, 0,
  ]);
  const uvs = new Float32Array([
    0, 0,
    0.35, 1,
    1, 0.72,
    0.68, 0,
  ]);

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();

  return geometry;
}

function createLongShardGeometry() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array([
    -0.72, -0.06, 0,
    -0.2, 0.14, 0,
    0.76, 0.06, 0,
    0.26, -0.18, 0,
  ]);
  const uvs = new Float32Array([
    0, 0.22,
    0.3, 0.92,
    1, 0.68,
    0.64, 0,
  ]);

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();

  return geometry;
}

function rememberHoloPaletteMaterial<T extends THREE.Material>(
  material: T,
  color: number,
  opacity = material.opacity,
) {
  const paletteMaterial = material as PaletteMaterial;
  material.userData.holoPalette = {
    color,
    opacity,
    roughness: paletteMaterial.roughness,
    clearcoat: paletteMaterial.clearcoat,
    clearcoatRoughness: paletteMaterial.clearcoatRoughness,
    envMapIntensity: paletteMaterial.envMapIntensity,
    iridescence: paletteMaterial.iridescence,
  };

  return material;
}

function applyHoloAccentPalette(presetId = cycloramaBackgroundSettings.preset) {
  if (!holoAccentGroup) {
    return;
  }

  const monochrome = presetId === 'tabla-rasa';
  const seenMaterials = new Set<string>();
  let monochromeIndex = 0;

  holoAccentGroup.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((sourceMaterial) => {
      const material = sourceMaterial as PaletteMaterial;
      const base = material.userData.holoPalette as
        | {
            color: number;
            opacity: number;
            roughness?: number;
            clearcoat?: number;
            clearcoatRoughness?: number;
            envMapIntensity?: number;
            iridescence?: number;
          }
        | undefined;

      if (!base || seenMaterials.has(material.uuid)) {
        return;
      }

      seenMaterials.add(material.uuid);

      if (monochrome) {
        material.color?.setHex(TABLA_RASA_ACCENT_COLORS[monochromeIndex % TABLA_RASA_ACCENT_COLORS.length]);
        material.opacity = Math.min(base.opacity, 0.72);
        if (material.roughness !== undefined) {
          material.roughness = Math.max(base.roughness ?? material.roughness, 0.28);
        }
        if (material.clearcoat !== undefined) {
          material.clearcoat = Math.min(base.clearcoat ?? material.clearcoat, 0.45);
        }
        if (material.clearcoatRoughness !== undefined) {
          material.clearcoatRoughness = Math.max(base.clearcoatRoughness ?? material.clearcoatRoughness, 0.16);
        }
        if (material.envMapIntensity !== undefined) {
          material.envMapIntensity = Math.min(base.envMapIntensity ?? material.envMapIntensity, 0.86);
        }
        if (material.iridescence !== undefined) {
          material.iridescence = 0.015;
        }
        monochromeIndex += 1;
      } else {
        material.color?.setHex(base.color);
        material.opacity = base.opacity;
        if (material.roughness !== undefined && base.roughness !== undefined) {
          material.roughness = base.roughness;
        }
        if (material.clearcoat !== undefined && base.clearcoat !== undefined) {
          material.clearcoat = base.clearcoat;
        }
        if (material.clearcoatRoughness !== undefined && base.clearcoatRoughness !== undefined) {
          material.clearcoatRoughness = base.clearcoatRoughness;
        }
        if (material.envMapIntensity !== undefined && base.envMapIntensity !== undefined) {
          material.envMapIntensity = base.envMapIntensity;
        }
        if (material.iridescence !== undefined && base.iridescence !== undefined) {
          material.iridescence = base.iridescence;
        }
      }

      material.needsUpdate = true;
    });
  });
}

function addMewHoloAccents(targetScene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = 'mew holo floating foil accents';
  group.visible = false;

  const makeMaterial = (color: number, opacity: number) => {
    const material = trackMaterial(
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    return rememberHoloPaletteMaterial(material, color, opacity);
  };

  const pink = makeMaterial(0xff22b8, 0.34);
  const green = makeMaterial(0x63ff28, 0.34);
  const yellow = makeMaterial(0xffec0f, 0.4);
  const cyan = makeMaterial(0x35f1ff, 0.3);
  const violet = makeMaterial(0x8d45ff, 0.26);
  const pearl = makeMaterial(0xfff1c4, 0.38);

  const shardGeometry = trackGeometry(createShardGeometry());
  const longShardGeometry = trackGeometry(createLongShardGeometry());

  const accents: Array<{
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    position: [number, number, number];
    scale: [number, number, number];
    rotation?: number;
  }> = [
    { geometry: longShardGeometry, material: pink, position: [-3.12, 1.38, CYCLO_BACK_Z + 0.18], scale: [1.25, 0.72, 1], rotation: -0.34 },
    { geometry: shardGeometry, material: green, position: [2.86, 2.08, CYCLO_BACK_Z + 0.2], scale: [0.54, 0.42, 1], rotation: 0.58 },
    { geometry: shardGeometry, material: yellow, position: [2.72, 3.28, CYCLO_BACK_Z + 0.22], scale: [0.72, 0.52, 1], rotation: -0.22 },
    { geometry: longShardGeometry, material: cyan, position: [-1.04, 3.1, CYCLO_BACK_Z + 0.2], scale: [0.78, 0.28, 1], rotation: 0.72 },
    { geometry: shardGeometry, material: violet, position: [0.96, 1.24, CYCLO_BACK_Z + 0.2], scale: [0.58, 0.46, 1], rotation: 1.12 },
    { geometry: shardGeometry, material: green, position: [-2.05, 2.62, CYCLO_BACK_Z + 0.19], scale: [0.48, 0.36, 1], rotation: -0.94 },
    { geometry: longShardGeometry, material: pearl, position: [1.75, 2.8, CYCLO_BACK_Z + 0.24], scale: [0.82, 0.28, 1], rotation: -0.68 },
    { geometry: longShardGeometry, material: pink, position: [-2.55, 3.25, CYCLO_BACK_Z + 0.25], scale: [0.68, 0.26, 1], rotation: 0.36 },
    { geometry: shardGeometry, material: yellow, position: [3.35, 1.1, CYCLO_BACK_Z + 0.23], scale: [0.42, 0.34, 1], rotation: -1.12 },
  ];

  accents.forEach((accent, index) => {
    const mesh = new THREE.Mesh(accent.geometry, accent.material);
    mesh.position.set(...accent.position);
    mesh.scale.set(...accent.scale);
    mesh.rotation.z = accent.rotation ?? index * 0.22;
    mesh.renderOrder = 1;
    group.add(mesh);
    registerHoloSculptureMotion(
      mesh,
      0.018 + (index % 3) * 0.006,
      0.42 + (index % 4) * 0.08,
      new THREE.Vector3(0.08 + index * 0.006, 0.12 + index * 0.004, 0.1),
      index * 0.53,
    );
  });

  addMewHoloSculptures(group);
  targetScene.add(group);
  return group;
}

function addIvoryHoloSculptures(targetScene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = 'ivory grounded holo sculptures';
  group.visible = false;

  const marbleMaterial = createIvoryMarbleMaterial();
  const glossMaterial = createIvoryGlossMaterial(0xfffbf0, 0.98);
  const translucentMaterial = createIvoryGlossMaterial(0xcfc4b5, 0.82);
  const blobGeometry = trackGeometry(new THREE.SphereGeometry(1, 40, 22));

  const fallenColumn = createGroundedColumnFragment(marbleMaterial, glossMaterial);
  fallenColumn.position.set(-1.18, 0.34, -0.72);
  fallenColumn.rotation.set(0.1, 0.16, -0.28);
  fallenColumn.scale.setScalar(1.58);
  group.add(fallenColumn);

  const largeGoop = createGroundedIvoryGoop(blobGeometry, glossMaterial, translucentMaterial);
  largeGoop.position.set(1.14, 0.34, -0.68);
  largeGoop.rotation.set(0, -0.24, 0);
  largeGoop.scale.setScalar(1.56);
  group.add(largeGoop);

  const amphora = createGroundedIvoryAmphora(marbleMaterial, glossMaterial);
  amphora.position.set(1.62, 0.65, -0.96);
  amphora.rotation.set(0.08, -0.52, 0.03);
  amphora.scale.setScalar(1.02);
  group.add(amphora);

  const lowRing = new THREE.Mesh(trackGeometry(new THREE.TorusGeometry(0.66, 0.075, 18, 96)), translucentMaterial);
  lowRing.position.set(-0.38, 0.18, -0.86);
  lowRing.rotation.set(Math.PI * 0.5, 0.08, 0.2);
  lowRing.scale.set(1.62, 1.02, 1);
  group.add(lowRing);

  const pearlStone = new THREE.Mesh(blobGeometry, glossMaterial);
  pearlStone.position.set(-1.72, 0.28, -0.98);
  pearlStone.scale.set(0.72, 0.38, 0.52);
  group.add(pearlStone);

  addIvoryGroundedSilhouettes(group);

  targetScene.add(group);
  return group;
}

function addIvoryGroundedSilhouettes(group: THREE.Group) {
  const material = trackMaterial(
    new THREE.MeshBasicMaterial({
      color: 0xb8afa2,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  const softDisc = trackGeometry(new THREE.CircleGeometry(1, 96));
  const silhouettes: Array<{
    position: [number, number, number];
    scale: [number, number, number];
    rotation: number;
  }> = [
    { position: [-1.18, 0.022, -0.68], scale: [1.85, 0.58, 1], rotation: -0.22 },
    { position: [1.18, 0.024, -0.62], scale: [1.72, 0.72, 1], rotation: 0.12 },
    { position: [0.1, 0.02, -0.92], scale: [1.2, 0.42, 1], rotation: 0.04 },
  ];

  silhouettes.forEach((silhouette) => {
    const mesh = new THREE.Mesh(softDisc, material);
    mesh.position.set(...silhouette.position);
    mesh.rotation.set(-Math.PI * 0.5, 0, silhouette.rotation);
    mesh.scale.set(...silhouette.scale);
    mesh.renderOrder = -1;
    group.add(mesh);
  });
}

function createGroundedColumnFragment(marbleMaterial: THREE.Material, glossMaterial: THREE.Material) {
  const group = new THREE.Group();
  group.name = 'grounded ivory column fragment';
  const shaft = new THREE.Mesh(trackGeometry(new THREE.CylinderGeometry(0.22, 0.24, 1.55, 36)), marbleMaterial);
  const base = new THREE.Mesh(trackGeometry(new THREE.CylinderGeometry(0.38, 0.42, 0.16, 52)), marbleMaterial);
  const capital = new THREE.Mesh(trackGeometry(new THREE.CylinderGeometry(0.4, 0.28, 0.18, 52)), marbleMaterial);
  const glossSeam = new THREE.Mesh(trackGeometry(new THREE.TorusGeometry(0.3, 0.045, 14, 64)), glossMaterial);

  shaft.rotation.z = Math.PI * 0.5;
  base.rotation.z = Math.PI * 0.5;
  capital.rotation.z = Math.PI * 0.5;
  base.position.x = -0.86;
  capital.position.x = 0.86;
  glossSeam.position.set(-0.34, 0.0, 0.03);
  glossSeam.rotation.y = Math.PI * 0.5;

  group.add(shaft, base, capital, glossSeam);
  return group;
}

function createGroundedIvoryGoop(
  blobGeometry: THREE.BufferGeometry,
  glossMaterial: THREE.Material,
  translucentMaterial: THREE.Material,
) {
  const group = new THREE.Group();
  group.name = 'grounded ivory glossy goop';
  const blobs: Array<{ position: [number, number, number]; scale: [number, number, number]; material: THREE.Material }> = [
    { position: [0, 0.06, 0], scale: [0.72, 0.28, 0.52], material: glossMaterial },
    { position: [0.45, 0.11, 0.08], scale: [0.48, 0.34, 0.34], material: translucentMaterial },
    { position: [-0.46, 0.08, -0.12], scale: [0.52, 0.25, 0.4], material: glossMaterial },
    { position: [0.12, 0.28, -0.05], scale: [0.32, 0.4, 0.3], material: translucentMaterial },
  ];

  blobs.forEach((blob) => {
    const mesh = new THREE.Mesh(blobGeometry, blob.material);
    mesh.position.set(...blob.position);
    mesh.scale.set(...blob.scale);
    group.add(mesh);
  });

  return group;
}

function createGroundedIvoryAmphora(marbleMaterial: THREE.Material, glossMaterial: THREE.Material) {
  const group = new THREE.Group();
  group.name = 'grounded ivory amphora';
  const points = [
    new THREE.Vector2(0.1, -0.56),
    new THREE.Vector2(0.28, -0.42),
    new THREE.Vector2(0.38, -0.08),
    new THREE.Vector2(0.32, 0.22),
    new THREE.Vector2(0.18, 0.44),
    new THREE.Vector2(0.14, 0.62),
    new THREE.Vector2(0.23, 0.7),
  ];
  const body = new THREE.Mesh(trackGeometry(new THREE.LatheGeometry(points, 56)), marbleMaterial);
  const lip = new THREE.Mesh(trackGeometry(new THREE.TorusGeometry(0.23, 0.026, 10, 56)), glossMaterial);
  const foot = new THREE.Mesh(trackGeometry(new THREE.CylinderGeometry(0.22, 0.28, 0.08, 48)), glossMaterial);

  lip.position.y = 0.7;
  lip.rotation.x = Math.PI * 0.5;
  foot.position.y = -0.58;
  group.add(body, lip, foot);
  return group;
}

function addMewHoloSculptures(group: THREE.Group) {
  const marbleMaterial = createHoloMarbleMaterial();
  const pinkGloss = createCandyGlossMaterial(0xff2db6, 0.72);
  const greenGloss = createCandyGlossMaterial(0x75ff2c, 0.68);
  const yellowGloss = createCandyGlossMaterial(0xffe80f, 0.72);
  const cyanGloss = createCandyGlossMaterial(0x27eaff, 0.58);
  const violetGloss = createCandyGlossMaterial(0x8d55ff, 0.62);

  const blobGeometry = trackGeometry(new THREE.SphereGeometry(1, 32, 18));
  const gemGeometry = trackGeometry(new THREE.OctahedronGeometry(0.45, 1));
  const torusKnotGeometry = trackGeometry(new THREE.TorusKnotGeometry(0.34, 0.105, 96, 14, 2, 3));

  const leftColumn = createGrecoColumnFragment(marbleMaterial, pinkGloss);
  leftColumn.position.set(-2.88, 1.18, -0.95);
  leftColumn.rotation.set(0.12, 0.18, -0.16);
  leftColumn.scale.setScalar(0.62);
  group.add(leftColumn);
  registerHoloSculptureMotion(leftColumn, 0.045, 0.56, new THREE.Vector3(0.04, 0.11, 0.035), 0.2);

  const rightColumn = createGrecoColumnFragment(marbleMaterial, greenGloss);
  rightColumn.position.set(2.82, 1.52, -1.25);
  rightColumn.rotation.set(-0.08, -0.38, 0.14);
  rightColumn.scale.setScalar(0.5);
  group.add(rightColumn);
  registerHoloSculptureMotion(rightColumn, 0.06, 0.48, new THREE.Vector3(-0.035, 0.08, -0.03), 1.6);

  const amphora = createHoloAmphora(marbleMaterial, yellowGloss);
  amphora.position.set(2.16, 2.6, -1.34);
  amphora.rotation.set(0.1, -0.45, 0.08);
  amphora.scale.setScalar(0.42);
  group.add(amphora);
  registerHoloSculptureMotion(amphora, 0.075, 0.42, new THREE.Vector3(0.025, 0.12, 0.04), 2.3);

  const leftGoop = createGoopCluster(blobGeometry, pinkGloss, violetGloss);
  leftGoop.position.set(-2.32, 2.22, -1.1);
  leftGoop.rotation.set(0.2, 0.15, -0.12);
  leftGoop.scale.setScalar(0.78);
  group.add(leftGoop);
  registerHoloSculptureMotion(leftGoop, 0.085, 0.66, new THREE.Vector3(0.05, 0.18, 0.05), 0.9);

  const rightGoop = createGoopCluster(blobGeometry, greenGloss, cyanGloss);
  rightGoop.position.set(2.36, 0.92, -0.74);
  rightGoop.rotation.set(-0.16, -0.24, 0.2);
  rightGoop.scale.setScalar(0.62);
  group.add(rightGoop);
  registerHoloSculptureMotion(rightGoop, 0.07, 0.72, new THREE.Vector3(-0.04, 0.2, -0.06), 2.9);

  const centerGem = new THREE.Mesh(gemGeometry, cyanGloss);
  centerGem.position.set(-0.92, 2.84, -1.18);
  centerGem.scale.set(0.5, 0.74, 0.5);
  group.add(centerGem);
  registerHoloSculptureMotion(centerGem, 0.1, 0.54, new THREE.Vector3(0.18, 0.32, 0.08), 1.2);

  const yellowGem = new THREE.Mesh(gemGeometry, yellowGloss);
  yellowGem.position.set(3.28, 2.64, -1.08);
  yellowGem.scale.set(0.42, 0.64, 0.42);
  group.add(yellowGem);
  registerHoloSculptureMotion(yellowGem, 0.08, 0.58, new THREE.Vector3(-0.14, 0.24, 0.11), 3.4);

  const knot = new THREE.Mesh(torusKnotGeometry, pinkGloss);
  knot.position.set(-1.72, 0.88, -0.7);
  knot.rotation.set(0.72, 0.26, 0.15);
  knot.scale.setScalar(0.7);
  group.add(knot);
  registerHoloSculptureMotion(knot, 0.06, 0.64, new THREE.Vector3(0.16, -0.22, 0.18), 4.2);
}

function createGrecoColumnFragment(marbleMaterial: THREE.Material, goopMaterial: THREE.Material) {
  const group = new THREE.Group();
  group.name = 'holo marble column fragment';
  const shaft = new THREE.Mesh(trackGeometry(new THREE.CylinderGeometry(0.18, 0.22, 1.18, 32)), marbleMaterial);
  const base = new THREE.Mesh(trackGeometry(new THREE.CylinderGeometry(0.32, 0.36, 0.12, 48)), marbleMaterial);
  const capital = new THREE.Mesh(trackGeometry(new THREE.CylinderGeometry(0.3, 0.22, 0.16, 48)), marbleMaterial);
  const goopBand = new THREE.Mesh(trackGeometry(new THREE.TorusGeometry(0.27, 0.065, 18, 64)), goopMaterial);
  const goopDrop = new THREE.Mesh(trackGeometry(new THREE.SphereGeometry(0.12, 24, 14)), goopMaterial);

  shaft.position.y = 0.04;
  shaft.rotation.z = 0.02;
  base.position.y = -0.62;
  capital.position.y = 0.68;
  goopBand.position.y = 0.22;
  goopBand.rotation.x = Math.PI * 0.5;
  goopDrop.position.set(0.18, -0.08, 0.1);
  goopDrop.scale.set(0.8, 1.55, 0.7);

  group.add(base, shaft, capital, goopBand, goopDrop);
  return group;
}

function createHoloAmphora(marbleMaterial: THREE.Material, glossMaterial: THREE.Material) {
  const group = new THREE.Group();
  group.name = 'holo amphora sculpture';
  const points = [
    new THREE.Vector2(0.08, -0.52),
    new THREE.Vector2(0.2, -0.42),
    new THREE.Vector2(0.3, -0.16),
    new THREE.Vector2(0.26, 0.16),
    new THREE.Vector2(0.16, 0.38),
    new THREE.Vector2(0.12, 0.56),
    new THREE.Vector2(0.2, 0.64),
  ];
  const body = new THREE.Mesh(trackGeometry(new THREE.LatheGeometry(points, 48)), marbleMaterial);
  const lip = new THREE.Mesh(trackGeometry(new THREE.TorusGeometry(0.2, 0.025, 10, 48)), glossMaterial);
  const leftHandle = new THREE.Mesh(trackGeometry(new THREE.TorusGeometry(0.18, 0.025, 10, 48, Math.PI * 1.3)), glossMaterial);
  const rightHandle = leftHandle.clone();

  lip.position.y = 0.64;
  lip.rotation.x = Math.PI * 0.5;
  leftHandle.position.set(-0.24, 0.12, 0);
  leftHandle.rotation.set(0, 0, Math.PI * 0.52);
  leftHandle.scale.set(0.62, 1.1, 0.62);
  rightHandle.position.set(0.24, 0.12, 0);
  rightHandle.rotation.set(0, 0, -Math.PI * 0.52);
  rightHandle.scale.set(0.62, 1.1, 0.62);

  group.add(body, lip, leftHandle, rightHandle);
  return group;
}

function createGoopCluster(
  blobGeometry: THREE.BufferGeometry,
  primaryMaterial: THREE.Material,
  secondaryMaterial: THREE.Material,
) {
  const group = new THREE.Group();
  group.name = 'glossy goop cluster';
  const blobs: Array<{ position: [number, number, number]; scale: [number, number, number]; material: THREE.Material }> = [
    { position: [0, 0, 0], scale: [0.48, 0.62, 0.35], material: primaryMaterial },
    { position: [0.28, 0.08, 0.1], scale: [0.3, 0.38, 0.26], material: secondaryMaterial },
    { position: [-0.24, -0.14, -0.05], scale: [0.34, 0.28, 0.25], material: primaryMaterial },
    { position: [0.05, -0.38, 0.02], scale: [0.16, 0.36, 0.12], material: secondaryMaterial },
  ];

  blobs.forEach((blob) => {
    const mesh = new THREE.Mesh(blobGeometry, blob.material);
    mesh.position.set(...blob.position);
    mesh.scale.set(...blob.scale);
    group.add(mesh);
  });

  return group;
}

function registerHoloSculptureMotion(
  root: THREE.Object3D,
  floatAmplitude: number,
  floatSpeed: number,
  spin: THREE.Vector3,
  phase: number,
) {
  holoSculptureMotions.push({
    root,
    basePosition: root.position.clone(),
    baseRotation: root.rotation.clone(),
    windOffset: new THREE.Vector3(),
    windVelocity: new THREE.Vector3(),
    angularOffset: new THREE.Vector3(),
    angularVelocity: new THREE.Vector3(),
    floatAmplitude,
    floatSpeed,
    phase,
    spin,
    windScale: 0.68 + (phase % 1.7) * 0.16,
  });
}

function updateMewHoloSculptures(time: number, delta: number) {
  if (!holoAccentGroup?.visible) {
    return;
  }

  const activity = clamp01(pointerWind.activity);
  holoWindForce.copy(pointerWind.wind).multiplyScalar(activity);

  holoSculptureMotions.forEach((motion) => {
    motion.root.getWorldPosition(holoWorldPosition);
    holoWorldPosition.project(camera);
    holoScreenPosition.set(
      holoWorldPosition.x * 0.5 + 0.5,
      holoWorldPosition.y * 0.5 + 0.5,
    );

    holoCursorDelta.copy(pointerWind.gustCenter).sub(holoScreenPosition);
    const cursorDistance = holoCursorDelta.length();
    const tightField = 1 - THREE.MathUtils.smoothstep(cursorDistance, 0.04, 0.58);
    const broadField = (1 - THREE.MathUtils.smoothstep(cursorDistance, 0.3, 1.18)) * 0.72;
    const proximity = clamp01(tightField + broadField);

    holoAwayFromCursor.copy(holoCursorDelta).multiplyScalar(-1);
    if (holoAwayFromCursor.lengthSq() > 0.00001) {
      holoAwayFromCursor.normalize();
    } else {
      holoAwayFromCursor.set(0, 1);
    }

    const cursorPush = proximity * motion.windScale * activity;
    holoTargetOffset.set(
      holoAwayFromCursor.x * cursorPush * 0.98 + holoWindForce.x * motion.windScale * 0.58,
      holoAwayFromCursor.y * cursorPush * 0.64 + holoWindForce.y * motion.windScale * 0.52,
      cursorPush * 0.32 + Math.abs(holoWindForce.x) * motion.windScale * 0.18 + holoWindForce.z * motion.windScale * 0.34,
    );
    holoTargetOffset.clampLength(0, 0.98);

    holoOffsetDelta.copy(holoTargetOffset).sub(motion.windOffset);
    motion.windVelocity.add(holoOffsetDelta.multiplyScalar(delta * 30));
    motion.windVelocity.multiplyScalar(Math.exp(-delta * 3.9));
    motion.windOffset.add(holoOffsetDelta.copy(motion.windVelocity).multiplyScalar(delta));
    motion.windOffset.clampLength(0, 1.05);

    holoTargetAngularOffset.set(
      holoWindForce.y * motion.windScale * 0.72 - holoAwayFromCursor.y * cursorPush * 0.82,
      holoWindForce.x * motion.windScale * 0.68 + holoAwayFromCursor.x * cursorPush * 0.86,
      -holoWindForce.x * motion.windScale * 0.72 - holoAwayFromCursor.x * cursorPush * 0.48,
    );
    holoTargetAngularOffset.clampLength(0, 0.82);

    holoAngularDelta.copy(holoTargetAngularOffset).sub(motion.angularOffset);
    motion.angularVelocity.add(holoAngularDelta.multiplyScalar(delta * 28));
    motion.angularVelocity.multiplyScalar(Math.exp(-delta * 4.1));
    motion.angularOffset.add(holoAngularDelta.copy(motion.angularVelocity).multiplyScalar(delta));
    motion.angularOffset.clampLength(0, 0.86);

    const bob = Math.sin(time * motion.floatSpeed + motion.phase) * motion.floatAmplitude;
    motion.root.position.copy(motion.basePosition);
    motion.root.position.y += bob;
    motion.root.position.add(motion.windOffset);
    motion.root.rotation.set(
      motion.baseRotation.x + Math.sin(time * 0.32 + motion.phase) * motion.spin.x + motion.angularOffset.x,
      motion.baseRotation.y + time * motion.spin.y + motion.angularOffset.y,
      motion.baseRotation.z + Math.cos(time * 0.28 + motion.phase) * motion.spin.z + motion.angularOffset.z,
    );
  });
}

function initializePhotoPrintBursts(targetScene: THREE.Scene) {
  photoPrintGroup = new THREE.Group();
  photoPrintGroup.name = 'invisible cities cursor photo prints';
  photoPrintGroup.visible = cycloramaBackgroundSettings.preset === 'tabla-rasa';
  targetScene.add(photoPrintGroup);

  photoPrintCardGeometry = trackGeometry(new THREE.PlaneGeometry(PHOTO_PRINT_CARD_WIDTH, PHOTO_PRINT_CARD_HEIGHT));
  photoPrintImageGeometry = trackGeometry(new THREE.PlaneGeometry(PHOTO_PRINT_IMAGE_WIDTH, PHOTO_PRINT_IMAGE_HEIGHT));
  photoPrintShadowGeometry = trackGeometry(
    new THREE.PlaneGeometry(PHOTO_PRINT_CARD_WIDTH * 1.03, PHOTO_PRINT_CARD_HEIGHT * 1.04),
  );
  PHOTO_PRINT_IMAGE_URLS.forEach((url) => {
    photoPrintTextures.push(loadPhotoPrintTexture(url));
  });
}

function loadPhotoPrintTexture(url: string) {
  const texture = trackTexture(new THREE.TextureLoader().load(url));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function maybeSpawnPhotoPrintBurst(
  x: number,
  y: number,
  movementX: number,
  movementY: number,
  now: number,
) {
  if (!isPhotoPrintTheme() || !photoPrintGroup || photoPrintTextures.length === 0) {
    return;
  }

  if (isPointerOverVisibleDress(x, y)) {
    return;
  }

  const distance = lastPhotoPrintBurstPoint.distanceTo(pointerSample.set(x, y));
  const elapsed = now - lastPhotoPrintBurstTime;
  const movementSpeed = Math.hypot(movementX, movementY);

  if (elapsed < PHOTO_PRINT_BURST_INTERVAL || distance < PHOTO_PRINT_MIN_POINTER_DISTANCE) {
    return;
  }

  if (movementSpeed < 0.08) {
    return;
  }

  getPhotoPrintSpawnPosition(x, y, photoPrintSpawnPosition);
  spawnPhotoPrint(photoPrintSpawnPosition, movementX, movementY);

  while (photoPrintParticles.length > PHOTO_PRINT_MAX_ACTIVE) {
    removePhotoPrintParticle(0);
  }

  lastPhotoPrintBurstPoint.set(x, y);
  lastPhotoPrintBurstTime = now;
}

function isPointerOverVisibleDress(x: number, y: number) {
  photoPrintDressPointer.set(x * 2 - 1, y * 2 - 1);
  photoPrintDressRaycaster.setFromCamera(photoPrintDressPointer, camera);

  for (const record of fullDressCache.values()) {
    if (!record.pivot.visible) {
      continue;
    }

    record.loaded.dress.updateMatrixWorld(true);
    const intersections = photoPrintDressRaycaster.intersectObject(record.loaded.dress, true);
    if (intersections.some((intersection) => (intersection.object as THREE.Mesh).isMesh)) {
      return true;
    }
  }

  return false;
}

function getPhotoPrintSpawnPosition(x: number, y: number, target: THREE.Vector3) {
  photoPrintSpawnNdc.set(x * 2 - 1, y * 2 - 1);
  photoPrintSpawnRaycaster.setFromCamera(photoPrintSpawnNdc, camera);

  if (!photoPrintSpawnRaycaster.ray.intersectPlane(photoPrintSpawnPlane, target)) {
    target.set((x - 0.5) * 4.6, 1.8 + (y - 0.5) * 2.2, PHOTO_PRINT_SPAWN_Z);
  }

  const spawnDepth = Math.abs(camera.position.z - PHOTO_PRINT_SPAWN_Z);
  const visibleHalfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) * spawnDepth;
  const visibleHalfWidth = visibleHalfHeight * camera.aspect;
  target.x = THREE.MathUtils.clamp(target.x, -visibleHalfWidth * 0.86, visibleHalfWidth * 0.86);
  photoPrintProjectionPoint.copy(target).project(camera);
  const desiredScreenX = x < 0.5 ? -0.8 : 0.8;
  target.x += (desiredScreenX - photoPrintProjectionPoint.x) * visibleHalfWidth;
  target.y = THREE.MathUtils.clamp(target.y, 0.72, 3.38);
  target.z = PHOTO_PRINT_SPAWN_Z;
}

function spawnPhotoPrint(position: THREE.Vector3, movementX: number, movementY: number) {
  if (!photoPrintGroup || !photoPrintCardGeometry || !photoPrintImageGeometry || !photoPrintShadowGeometry) {
    return;
  }

  const texture = photoPrintTextures[Math.floor(Math.random() * photoPrintTextures.length)];
  const root = new THREE.Group();
  const seed = Math.random() * Math.PI * 2;
  const baseScale = canvasElement.clientWidth < 420
    ? randomBetween(0.42, 0.58)
    : isMobileViewport()
    ? randomBetween(0.54, 0.72)
    : randomBetween(0.78, 1.02);
  const windLength = Math.max(0.001, Math.hypot(movementX, movementY));
  const windDirX = movementX / windLength;
  const windDirY = movementY / windLength;
  const jitter = new THREE.Vector3(-windDirX * 0.18 + randomBetween(-0.035, 0.035), -windDirY * 0.1 + randomBetween(-0.03, 0.04), randomBetween(-0.06, 0.08));

  root.position.copy(position).add(jitter);
  const windHeading = Math.atan2(windDirY, windDirX);
  root.rotation.set(
    randomBetween(-1.45, 1.45),
    randomBetween(-1.08, 1.08),
    windHeading + randomBetween(-0.72, 0.72),
  );
  root.scale.setScalar(baseScale);
  root.renderOrder = 3;

  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x2b2118,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  const cardMaterial = new THREE.MeshBasicMaterial({
    color: 0xf7ead5,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  const imageMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });

  const shadow = new THREE.Mesh(photoPrintShadowGeometry, shadowMaterial);
  shadow.position.set(0.028, -0.032, -0.012);
  shadow.renderOrder = 2;
  const card = new THREE.Mesh(photoPrintCardGeometry, cardMaterial);
  card.renderOrder = 3;
  const image = new THREE.Mesh(photoPrintImageGeometry, imageMaterial);
  image.position.set(0, 0.047, 0.01);
  image.renderOrder = 4;
  root.add(shadow, card, image);
  photoPrintGroup.add(root);

  const windX = clampSigned(movementX * 0.064, 1.45);
  const windY = clampSigned(movementY * 0.058, 0.94);
  const lift = randomBetween(0.36, 0.72) + Math.max(0, windY * 0.18);
  const restQuaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      PHOTO_PRINT_SURFACE_TILT + randomBetween(-0.035, 0.035),
      randomBetween(-0.035, 0.035),
      windHeading + randomBetween(-0.5, 0.5),
    ),
  );

  photoPrintParticles.push({
    root,
    velocity: new THREE.Vector3(
      windX + windDirX * randomBetween(0.22, 0.58) + randomBetween(-0.08, 0.08),
      lift,
      randomBetween(-0.34, -0.1) + Math.abs(windX) * 0.035,
    ),
    angularVelocity: new THREE.Vector3(
      randomBetween(-2.6, 2.6) + windY * 0.35,
      randomBetween(-2.1, 2.1) + windX * 0.28,
      windX * 1.2 + randomBetween(-1.45, 1.45),
    ),
    restQuaternion,
    age: 0,
    lifespan: randomBetween(8.2, 10.8),
    floorY: PHOTO_PRINT_FLOOR_Y + randomBetween(0, 0.025),
    floorContactAge: null,
    baseScale,
    seed,
    materials: [
      { material: shadowMaterial, opacity: 0.2 },
      { material: cardMaterial, opacity: 0.96 },
      { material: imageMaterial, opacity: 0.98 },
    ],
  });
  stageElement!.dataset.photoPrintCount = String(photoPrintParticles.length);
}

function updatePhotoPrintParticles(delta: number) {
  if (!isPhotoPrintTheme()) {
    clearPhotoPrintParticles();
    return;
  }

  if (photoPrintParticles.length === 0) {
    return;
  }

  const hasProtectedDressArea = getVisibleDressScreenBounds(photoPrintDressScreenBounds);

  for (let index = photoPrintParticles.length - 1; index >= 0; index -= 1) {
    const particle = photoPrintParticles[index];
    particle.age += delta;

    const floorSettled = particle.floorContactAge !== null;
    particle.velocity.x += (
      pointerWind.wind.x * (floorSettled ? 0.035 : 0.26)
      + Math.sin(shaderTime * 4.8 + particle.seed) * (floorSettled ? 0.012 : 0.07)
    ) * delta;
    particle.velocity.z += (
      pointerWind.wind.z * (floorSettled ? 0.02 : 0.18)
      + Math.cos(shaderTime * 3.9 + particle.seed) * (floorSettled ? 0.006 : 0.035)
    ) * delta;

    if (!floorSettled || particle.velocity.y > 0) {
      particle.velocity.y += (pointerWind.wind.y * 0.08 - PHOTO_PRINT_GRAVITY) * delta;
    }

    particle.root.position.addScaledVector(particle.velocity, delta);

    if (particle.root.position.y <= particle.floorY) {
      particle.root.position.y = particle.floorY;
      if (particle.floorContactAge === null) {
        particle.floorContactAge = 0;
      }
      if (particle.velocity.y < 0) {
        particle.velocity.y = 0;
      }
    }

    if (particle.floorContactAge !== null) {
      particle.floorContactAge += delta;
      const floorFriction = Math.exp(-delta * 5.8);
      particle.velocity.x *= floorFriction;
      particle.velocity.z *= floorFriction;
      particle.velocity.y = 0;
      particle.angularVelocity.multiplyScalar(Math.exp(-delta * 4.8));
      particle.root.quaternion.slerp(particle.restQuaternion, 1 - Math.exp(-delta * 7.2));
    } else {
      particle.velocity.multiplyScalar(Math.exp(-delta * 0.08));
      particle.root.rotation.x += particle.angularVelocity.x * delta;
      particle.root.rotation.y += particle.angularVelocity.y * delta;
      particle.root.rotation.z += particle.angularVelocity.z * delta;
    }

    const fadeIn = clamp01(particle.age / 0.16);
    const opacity = fadeIn;
    particle.root.scale.setScalar(particle.baseScale * (0.84 + fadeIn * 0.16));

    particle.materials.forEach(({ material, opacity: baseOpacity }) => {
      material.opacity = opacity * baseOpacity;
    });

    const overlapsDress = hasProtectedDressArea
      && doesPhotoPrintOverlapScreenBounds(particle.root, photoPrintDressScreenBounds);
    particle.root.visible = !overlapsDress;

    const restingTimeElapsed = particle.floorContactAge !== null && particle.floorContactAge >= 4.2;
    if (restingTimeElapsed || particle.age >= particle.lifespan) {
      removePhotoPrintParticle(index);
    }
  }
  stageElement!.dataset.photoPrintVisible = String(
    photoPrintParticles.filter((particle) => particle.root.visible).length,
  );
}

function resetScreenSpaceBounds(bounds: ScreenSpaceBounds) {
  bounds.minX = Number.POSITIVE_INFINITY;
  bounds.maxX = Number.NEGATIVE_INFINITY;
  bounds.minY = Number.POSITIVE_INFINITY;
  bounds.maxY = Number.NEGATIVE_INFINITY;
}

function expandScreenSpaceBounds(bounds: ScreenSpaceBounds, point: THREE.Vector3) {
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.maxY = Math.max(bounds.maxY, point.y);
}

function getVisibleDressScreenBounds(target: ScreenSpaceBounds) {
  resetScreenSpaceBounds(target);
  camera.updateMatrixWorld();
  let hasBounds = false;

  for (const record of fullDressCache.values()) {
    if (!record.pivot.visible) {
      continue;
    }

    photoPrintDressWorldBounds.setFromObject(record.loaded.dress);
    if (photoPrintDressWorldBounds.isEmpty()) {
      continue;
    }

    const { min, max } = photoPrintDressWorldBounds;
    for (let corner = 0; corner < 8; corner += 1) {
      photoPrintProjectionPoint
        .set(
          corner & 1 ? max.x : min.x,
          corner & 2 ? max.y : min.y,
          corner & 4 ? max.z : min.z,
        )
        .project(camera);
      if (Number.isFinite(photoPrintProjectionPoint.x) && Number.isFinite(photoPrintProjectionPoint.y)) {
        expandScreenSpaceBounds(target, photoPrintProjectionPoint);
        hasBounds = true;
      }
    }
  }

  return hasBounds;
}

function doesPhotoPrintOverlapScreenBounds(root: THREE.Group, dressBounds: ScreenSpaceBounds) {
  resetScreenSpaceBounds(photoPrintCardScreenBounds);
  root.updateMatrixWorld(true);

  for (let corner = 0; corner < 4; corner += 1) {
    photoPrintProjectionPoint
      .set(
        corner & 1 ? PHOTO_PRINT_CARD_WIDTH * 0.5 : PHOTO_PRINT_CARD_WIDTH * -0.5,
        corner & 2 ? PHOTO_PRINT_CARD_HEIGHT * 0.5 : PHOTO_PRINT_CARD_HEIGHT * -0.5,
        0,
      )
      .applyMatrix4(root.matrixWorld)
      .project(camera);
    expandScreenSpaceBounds(photoPrintCardScreenBounds, photoPrintProjectionPoint);
  }

  return (
    photoPrintCardScreenBounds.maxX >= dressBounds.minX - PHOTO_PRINT_DRESS_CLEARANCE_NDC
    && photoPrintCardScreenBounds.minX <= dressBounds.maxX + PHOTO_PRINT_DRESS_CLEARANCE_NDC
    && photoPrintCardScreenBounds.maxY >= dressBounds.minY - PHOTO_PRINT_DRESS_CLEARANCE_NDC
    && photoPrintCardScreenBounds.minY <= dressBounds.maxY + PHOTO_PRINT_DRESS_CLEARANCE_NDC
  );
}

function removePhotoPrintParticle(index: number) {
  const [particle] = photoPrintParticles.splice(index, 1);
  if (!particle) {
    return;
  }

  if (particle.root.parent) {
    particle.root.parent.remove(particle.root);
  }
  particle.materials.forEach(({ material }) => material.dispose());
  stageElement!.dataset.photoPrintCount = String(photoPrintParticles.length);
}

function clearPhotoPrintParticles() {
  for (let index = photoPrintParticles.length - 1; index >= 0; index -= 1) {
    removePhotoPrintParticle(index);
  }
  lastPhotoPrintBurstTime = Number.NEGATIVE_INFINITY;
  lastPhotoPrintBurstPoint.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
}

function isPhotoPrintTheme() {
  return cycloramaBackgroundSettings.preset === 'tabla-rasa';
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function createHoloMarbleMaterial() {
  const material = trackMaterial(
    new THREE.MeshPhysicalMaterial({
      color: 0xf7efe2,
      map: createHoloMarbleTexture(),
      roughness: 0.2,
      metalness: 0,
      clearcoat: 0.85,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.25,
    }),
  );

  material.iridescence = 0.18;
  material.iridescenceIOR = 1.45;
  material.iridescenceThicknessRange = [180, 620];
  return rememberHoloPaletteMaterial(material, 0xf7efe2, 1);
}

function createCandyGlossMaterial(color: number, opacity: number) {
  const material = trackMaterial(
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.06,
      metalness: 0,
      transparent: true,
      opacity,
      depthWrite: false,
      clearcoat: 1,
      clearcoatRoughness: 0.018,
      envMapIntensity: 1.9,
      side: THREE.DoubleSide,
    }),
  );

  material.transmission = 0.16;
  material.thickness = 0.42;
  material.iridescence = 0.55;
  material.iridescenceIOR = 1.8;
  material.iridescenceThicknessRange = [220, 820];
  return rememberHoloPaletteMaterial(material, color, opacity);
}

function createIvoryMarbleMaterial() {
  const material = trackMaterial(
    new THREE.MeshPhysicalMaterial({
      color: 0xeee5d7,
      map: createIvoryMarbleTexture(),
      roughness: 0.26,
      metalness: 0,
      clearcoat: 0.48,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.12,
    }),
  );

  material.iridescence = 0.08;
  material.iridescenceIOR = 1.35;
  material.iridescenceThicknessRange = [160, 420];
  return material;
}

function createIvoryGlossMaterial(color: number, opacity: number) {
  const material = trackMaterial(
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.04,
      metalness: 0,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 0.84,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 1.45,
      side: THREE.DoubleSide,
    }),
  );

  material.transmission = opacity < 0.75 ? 0.1 : 0;
  material.thickness = 0.28;
  material.iridescence = 0.1;
  material.iridescenceIOR = 1.42;
  material.iridescenceThicknessRange = [140, 420];
  return material;
}

function createHoloMarbleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');

  if (!context) {
    return null;
  }

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#fffaf0');
  gradient.addColorStop(0.48, '#d9eef0');
  gradient.addColorStop(1, '#fff1d6');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 86; index += 1) {
    const y = (index / 86) * canvas.height + Math.sin(index * 2.13) * 24;
    const alpha = 0.035 + (index % 5) * 0.006;
    context.strokeStyle = index % 3 === 0
      ? `rgba(255, 64, 183, ${alpha})`
      : `rgba(72, 108, 120, ${alpha})`;
    context.lineWidth = 1 + (index % 4) * 0.7;
    context.beginPath();
    context.moveTo(-80, y);
    context.bezierCurveTo(
      120,
      y + Math.sin(index) * 70,
      330,
      y - Math.cos(index * 1.7) * 85,
      canvas.width + 90,
      y + Math.sin(index * 0.8) * 42,
    );
    context.stroke();
  }

  const texture = trackTexture(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.5, 1.5);
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  return texture;
}

function createIvoryMarbleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');

  if (!context) {
    return null;
  }

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#fffdf7');
  gradient.addColorStop(0.5, '#ebe5da');
  gradient.addColorStop(1, '#d5ccbd');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 96; index += 1) {
    const y = (index / 96) * canvas.height + Math.sin(index * 1.83) * 20;
    const alpha = 0.025 + (index % 6) * 0.004;
    context.strokeStyle = index % 4 === 0
      ? `rgba(255, 255, 252, ${alpha + 0.035})`
      : `rgba(96, 84, 72, ${alpha + 0.012})`;
    context.lineWidth = 0.8 + (index % 3) * 0.7;
    context.beginPath();
    context.moveTo(-60, y);
    context.bezierCurveTo(
      115,
      y + Math.sin(index * 0.7) * 48,
      340,
      y - Math.cos(index * 1.45) * 54,
      canvas.width + 70,
      y + Math.sin(index * 0.5) * 34,
    );
    context.stroke();
  }

  const texture = trackTexture(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.35, 1.35);
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  return texture;
}

function createCycloramaGeometry() {
  const xSegments = 36;
  const floorSegments = 10;
  const curveSegments = 18;
  const wallSegments = 10;
  const profile: Array<{ y: number; z: number }> = [];
  const curveStartZ = CYCLO_BACK_Z + CYCLO_RADIUS;

  for (let index = 0; index <= floorSegments; index += 1) {
    const t = index / floorSegments;
    profile.push({ y: 0, z: THREE.MathUtils.lerp(CYCLO_FRONT_Z, curveStartZ, t) });
  }

  for (let index = 1; index <= curveSegments; index += 1) {
    const theta = -Math.PI / 2 - (index / curveSegments) * (Math.PI / 2);
    profile.push({
      y: CYCLO_RADIUS + Math.sin(theta) * CYCLO_RADIUS,
      z: CYCLO_BACK_Z + CYCLO_RADIUS + Math.cos(theta) * CYCLO_RADIUS,
    });
  }

  for (let index = 1; index <= wallSegments; index += 1) {
    const t = index / wallSegments;
    profile.push({ y: THREE.MathUtils.lerp(CYCLO_RADIUS, CYCLO_WALL_HEIGHT, t), z: CYCLO_BACK_Z });
  }

  const profileDistances = getProfileDistances(profile);
  const surfaceLength = profileDistances[profileDistances.length - 1] || 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const halfWidth = CYCLO_WIDTH * 0.5;

  profile.forEach((point, profileIndex) => {
    for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
      const u = xIndex / xSegments;
      const v = profileDistances[profileIndex] / surfaceLength;
      positions.push(THREE.MathUtils.lerp(-halfWidth, halfWidth, u), point.y, point.z);
      uvs.push(u, v);
    }
  });

  for (let profileIndex = 0; profileIndex < profile.length - 1; profileIndex += 1) {
    for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
      const a = profileIndex * (xSegments + 1) + xIndex;
      const b = a + 1;
      const c = (profileIndex + 1) * (xSegments + 1) + xIndex;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function getCycloramaRepeatY(imageAspect: number) {
  return imageAspect * getCycloramaSurfaceLength() * CYCLO_TEXTURE_REPEAT_X / CYCLO_WIDTH;
}

function createSoftContactShadowMaterial(color: number, opacity: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;

      float hash(vec2 value) {
        return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float broad = smoothstep(1.0, 0.08, length(vec2(p.x * 0.72, p.y * 1.48)));
        float contact = smoothstep(0.46, 0.02, length(vec2((p.x - 0.08) * 1.25, p.y * 2.3)));
        float sideFalloff = smoothstep(1.0, 0.26, length(vec2((p.x + 0.18) * 0.92, p.y * 1.72)));
        float paperBreakup = mix(0.9, 1.06, hash(floor(vUv * 14.0)));
        float alpha = (broad * 0.7 + contact * 0.55 + sideFalloff * 0.22) * paperBreakup * uOpacity;

        if (alpha < 0.002) {
          discard;
        }

        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
}

function createTechnicolorYellowPlaneMaterial(color: number) {
  const material = new THREE.MeshBasicMaterial({
    color,
    depthWrite: true,
  });
  material.fog = false;
  material.toneMapped = false;

  return material;
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

function getCoveredCycloramaTransform(imageAspect: number) {
  const surfaceAspect = CYCLO_WIDTH / getCycloramaSurfaceLength();
  const scale = new THREE.Vector2(1, 1);

  if (imageAspect > surfaceAspect) {
    scale.x = surfaceAspect / imageAspect;
  } else {
    scale.y = imageAspect / surfaceAspect;
  }

  return {
    offset: new THREE.Vector2((1 - scale.x) * 0.5, (1 - scale.y) * 0.5),
    scale,
  };
}

function applyCycloramaBackgroundPreset(presetId: CycloramaBackgroundPresetId) {
  const preset = CYCLO_BACKGROUND_PRESETS[presetId];
  const useIvoryHolo = preset.textureMode === 'ivory-holo';
  const useSignalBlack = preset.textureMode === 'signal-black';
  cycloramaBackgroundSettings.preset = presetId;
  stageElement!.dataset.backgroundPreset = presetId;
  syncCycloramaBackgroundUniforms();
  syncInfiniteBackdropMode();

  if (cycloramaMesh && cycloramaMaterial && cycloramaHoloMaterial) {
    cycloramaMesh.material = useIvoryHolo ? cycloramaHoloMaterial : cycloramaMaterial;
  }

  if (holoAccentGroup) {
    holoAccentGroup.visible = presetId === 'mew-holo';
    applyHoloAccentPalette(presetId);
  }

  if (photoPrintGroup) {
    photoPrintGroup.visible = presetId === 'tabla-rasa';
    if (presetId !== 'tabla-rasa') {
      clearPhotoPrintParticles();
    }
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
  scheduleGhostDressLoads();
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

  fullDressCache.forEach((record) => {
    if (record === activeFullDress && record.targetOpacity > 0) {
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

  if (isCycloramaBackgroundPresetId(presetId)) {
    applyCycloramaBackgroundPreset(presetId);
  }
}

function updateCycloramaBackgroundUrl(presetId: CycloramaBackgroundPresetId) {
  if (isPublicThemeId(presetId)) {
    writeThemeToUrl(presetId);
  }
}

function handleDressAssetClick(event: MouseEvent) {
  const assetId = (event.currentTarget as HTMLButtonElement).dataset.dressAsset;

  if (isDressAssetId(assetId) && assetId !== dressAssetSettings.asset) {
    void loadDressAsset(assetId);
  }
}

function handleDressNavigationClick(event: MouseEvent) {
  const direction = Number((event.currentTarget as HTMLButtonElement).dataset.dressDirection);
  if (!Number.isFinite(direction) || direction === 0) {
    return;
  }

  const activeId = activeFullDress?.asset.id ?? dressAssetSettings.asset;
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

function patchCycloramaBackgroundMaterial(material: THREE.Material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, cycloramaBackgroundUniforms);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform float uCycloTextureMode;
uniform vec2 uCycloTileRepeat;
uniform vec2 uCycloCoverScale;
uniform vec2 uCycloCoverOffset;
uniform float uCycloTime;

float cycloHash(vec2 value) {
  return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
}

float cycloSoftCircle(vec2 uv, vec2 center, vec2 scale, float radius, float feather) {
  return smoothstep(radius + feather, radius - feather, length((uv - center) * scale));
}

float cycloRing(vec2 uv, vec2 center, vec2 scale, float radius, float width) {
  float distanceToCenter = length((uv - center) * scale);
  return smoothstep(width, 0.0, abs(distanceToCenter - radius));
}

vec3 cycloMewHoloColor(vec2 uv) {
  vec3 electricCyan = vec3(0.25, 0.88, 1.0);
  vec3 mintGreen = vec3(0.26, 1.0, 0.22);
  vec3 acidLime = vec3(0.72, 1.0, 0.1);
  vec3 holoPink = vec3(1.0, 0.16, 0.72);
  vec3 pearlPink = vec3(1.0, 0.44, 0.86);
  vec3 violet = vec3(0.45, 0.33, 1.0);
  vec3 cardYellow = vec3(1.0, 0.88, 0.0);

  float upperYellow = cycloSoftCircle(uv, vec2(0.77, 0.78), vec2(1.0, 1.05), 0.34, 0.24);
  float leftPink = cycloSoftCircle(uv, vec2(0.22, 0.58), vec2(0.72, 1.08), 0.52, 0.3);
  float centerPink = cycloSoftCircle(uv, vec2(0.57, 0.55), vec2(1.08, 0.88), 0.37, 0.25);
  float lowerGreen = cycloSoftCircle(uv, vec2(0.34, 0.2), vec2(0.72, 1.08), 0.58, 0.3);
  float rightLime = cycloSoftCircle(uv, vec2(0.83, 0.34), vec2(0.86, 1.2), 0.42, 0.24);
  float cyanPocket = cycloSoftCircle(uv, vec2(0.5, 0.82), vec2(1.2, 0.9), 0.5, 0.34);

  vec3 base = electricCyan;
  base = mix(base, mintGreen, lowerGreen * 0.86);
  base = mix(base, acidLime, rightLime * 0.72);
  base = mix(base, pearlPink, leftPink * 0.82);
  base = mix(base, holoPink, centerPink * 0.68);
  base = mix(base, cardYellow, upperYellow * 0.84);
  base = mix(base, electricCyan, cyanPocket * 0.34);

  float slowShift = uCycloTime * 0.028;
  float broadFoil = sin((uv.x * 1.75 - uv.y * 1.12 + slowShift) * 6.2831853) * 0.5 + 0.5;
  float prismA = sin((uv.x * 8.5 + uv.y * 5.8 - uCycloTime * 0.075) * 6.2831853) * 0.5 + 0.5;
  float prismB = sin((uv.x * -6.2 + uv.y * 9.6 + uCycloTime * 0.052) * 6.2831853) * 0.5 + 0.5;
  vec3 rainbowFoil = mix(holoPink, mintGreen, prismA);
  rainbowFoil = mix(rainbowFoil, violet, prismB * 0.56);
  rainbowFoil = mix(rainbowFoil, cardYellow, pow(broadFoil, 3.0) * 0.36);
  base = mix(base, rainbowFoil, 0.42);

  float glossStripe = pow(smoothstep(0.8, 1.0, sin((uv.x * 4.2 - uv.y * 3.8 + 0.22 + uCycloTime * 0.05) * 6.2831853) * 0.5 + 0.5), 5.0);
  float fineStripe = pow(smoothstep(0.88, 1.0, sin((uv.x * 17.0 - uv.y * 13.0 + uCycloTime * 0.18) * 6.2831853) * 0.5 + 0.5), 3.8);
  float foilVeil = pow(broadFoil, 2.2) * 0.14 + glossStripe * 0.2 + fineStripe * 0.1;

  float printDots = cycloHash(floor(uv * vec2(260.0, 210.0)));
  float fineGrain = cycloHash(floor((uv + vec2(0.37, 0.13)) * vec2(680.0, 520.0)));
  float grain = (printDots - 0.5) * 0.06 + (fineGrain - 0.5) * 0.032;

  base = mix(base, vec3(1.0, 0.96, 0.78), foilVeil);
  base += grain;
  float luminance = dot(base, vec3(0.299, 0.587, 0.114));
  base = mix(vec3(luminance), base, 1.65);

  return clamp(base * 0.94, 0.0, 1.0);
}

vec3 cycloIvoryHoloColor(vec2 uv) {
  vec3 porcelain = vec3(0.96, 0.94, 0.88);
  vec3 warmIvory = vec3(1.0, 0.97, 0.88);
  vec3 stone = vec3(0.78, 0.73, 0.66);
  vec3 coolPearl = vec3(0.9, 0.92, 0.9);

  float warmPool = cycloSoftCircle(uv, vec2(0.74, 0.7), vec2(1.05, 0.92), 0.46, 0.34);
  float coolPool = cycloSoftCircle(uv, vec2(0.22, 0.4), vec2(0.9, 1.2), 0.54, 0.36);
  float floorWarmth = smoothstep(0.0, 0.44, 1.0 - uv.y);

  vec3 base = porcelain;
  base = mix(base, warmIvory, warmPool * 0.42 + floorWarmth * 0.18);
  base = mix(base, coolPearl, coolPool * 0.28);
  base = mix(base, stone, smoothstep(0.0, 1.0, uv.y) * 0.1);

  float broadSheen = sin((uv.x * 2.0 - uv.y * 1.35 + uCycloTime * 0.015) * 6.2831853) * 0.5 + 0.5;
  float fineFiber = sin((uv.x * 21.0 + uv.y * 15.0) * 6.2831853) * 0.5 + 0.5;
  float paper = cycloHash(floor(uv * vec2(190.0, 160.0))) - 0.5;
  float softRing = cycloRing(uv, vec2(0.72, 0.46), vec2(1.2, 0.86), 0.28, 0.02);

  base = mix(base, warmIvory, pow(broadSheen, 4.0) * 0.16);
  base += vec3(paper * 0.045);
  base += vec3(fineFiber * 0.026);
  base += vec3(1.0, 0.98, 0.92) * softRing * 0.18;

  return clamp(base, 0.48, 0.98);
}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', cycloramaMapFragment);
  };
  material.customProgramCacheKey = () => 'cyclorama-background-v5';
}

const cycloramaMapFragment = `
#ifdef USE_MAP
  if (uCycloTextureMode > 3.5) {
    vec3 holoColor = cycloIvoryHoloColor(vMapUv);
    diffuseColor.rgb = holoColor;
  } else if (uCycloTextureMode > 2.5) {
    vec3 holoColor = cycloMewHoloColor(vMapUv);
    diffuseColor.rgb = holoColor;
  } else if (uCycloTextureMode > 0.5 && uCycloTextureMode < 1.5) {
    vec4 sampledDiffuseColor = texture2D(map, fract(vMapUv * uCycloTileRepeat));
    diffuseColor *= sampledDiffuseColor;
  } else if (uCycloTextureMode >= 1.5) {
    vec2 coveredUv = uCycloCoverOffset + vMapUv * uCycloCoverScale;
    vec4 sampledDiffuseColor = texture2D(map, coveredUv);
    diffuseColor *= sampledDiffuseColor;
  }
#endif
`;

function getCycloramaSurfaceLength() {
  const floorLength = CYCLO_FRONT_Z - (CYCLO_BACK_Z + CYCLO_RADIUS);
  const curveLength = CYCLO_RADIUS * Math.PI * 0.5;
  const wallLength = CYCLO_WALL_HEIGHT - CYCLO_RADIUS;

  return floorLength + curveLength + wallLength;
}

function getProfileDistances(profile: Array<{ y: number; z: number }>) {
  let distance = 0;

  return profile.map((point, index) => {
    if (index === 0) {
      return 0;
    }

    const previousPoint = profile[index - 1];
    distance += Math.hypot(point.y - previousPoint.y, point.z - previousPoint.z);

    return distance;
  });
}

function setObjectOpacity(root: THREE.Object3D, opacity: number) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (!mesh.isMesh || !mesh.material) {
      return;
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => setMaterialOpacity(material, opacity));
  });
}

function setMaterialOpacity(material: THREE.Material, opacity: number) {
  let original = materialFadeOriginals.get(material);

  if (!original) {
    original = {
      opacity: material.opacity,
      transparent: material.transparent,
      depthWrite: material.depthWrite,
    };
    materialFadeOriginals.set(material, original);
  }

  if (opacity >= 0.999) {
    material.opacity = original.opacity;
    material.transparent = original.transparent;
    material.depthWrite = original.depthWrite;
  } else {
    material.opacity = original.opacity * opacity;
    material.transparent = true;
    material.depthWrite = false;
  }

  material.needsUpdate = true;
}

function syncCinematicFinishPass() {
  syncCinematicUniforms(cinematicFinishPass);
  syncCinematicUniforms(sharpSubjectCinematicFinishPass);
}

function syncCinematicUniforms(pass: ShaderPass) {
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

function syncMewAlphaFeatherPass(enabled: boolean) {
  mewAlphaFeatherPass.enabled = enabled;

  const uniforms = mewAlphaFeatherPass.uniforms as Record<string, THREE.IUniform<number>>;
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

function disposeGhostDressRecord(record: GhostDressRecord) {
  if (record.root.parent) {
    record.root.parent.remove(record.root);
  }

  disposeObjectResources(record.root, { disposeMaterials: false });
  record.material.dispose();
  record.fillMaterial.dispose();
  record.wireMaterial.dispose();
}

function disposeDressThumbnailRecord(record: DressThumbnailRecord) {
  if (record.root) {
    const materials = new Set<THREE.Material>();

    record.root.traverse((object) => {
      const materialOwner = object as THREE.Object3D & {
        material?: THREE.Material | THREE.Material[];
      };

      if (!materialOwner.material) {
        return;
      }

      const objectMaterials = Array.isArray(materialOwner.material)
        ? materialOwner.material
        : [materialOwner.material];
      objectMaterials.forEach((material) => materials.add(material));
    });

    materials.forEach((material) => material.dispose());
    record.scene.remove(record.root);
    record.root = null;
  }

  record.renderer.dispose();
}

function disposeObjectResources(root: THREE.Object3D, options: { disposeMaterials?: boolean } = {}) {
  const disposeMaterials = options.disposeMaterials ?? true;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (!mesh.isMesh) {
      return;
    }

    if (mesh.geometry) {
      geometries.add(mesh.geometry);
    }

    if (mesh.material) {
      const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      meshMaterials.forEach((material) => {
        materials.add(material);
        collectMaterialTextures(material, textures);
      });
    }
  });

  geometries.forEach((geometry) => geometry.dispose());

  if (disposeMaterials) {
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
  }
}

function collectMaterialTextures(material: THREE.Material, textures: Set<THREE.Texture>) {
  Object.values(material).forEach((value) => {
    if (value && typeof value === 'object' && 'isTexture' in value && value.isTexture === true) {
      textures.add(value as THREE.Texture);
    }
  });
}

function trackGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
  disposableGeometries.push(geometry);
  return geometry;
}

function trackMaterial<T extends THREE.Material>(material: T): T {
  disposableMaterials.push(material);
  return material;
}

function trackTexture<T extends THREE.Texture>(texture: T): T {
  disposableTextures.push(texture);
  return texture;
}

function queueCanvasResize() {
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

function resize() {
  const canvasBounds = canvasElement.getBoundingClientRect();
  const width = Math.max(1, Math.round(canvasBounds.width || window.innerWidth));
  const height = Math.max(1, Math.round(canvasBounds.height || window.innerHeight));

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
  subjectFxComposer.setSize(width, height);
  sharpSubjectComposer.setSize(width, height);
  camera.aspect = width / height;
  applyResponsiveCamera(width, height);
  updateInfiniteBackdropScale();
  scheduleGhostDressLoads();
  renderDressThumbnails();
  bokehUniforms.aspect.value = camera.aspect;

  if (window.innerWidth < 720) {
    gui?.close();
  }

  buildIvoryPortal();
  buildSignalDiptych();
}

// Différance portal: a near-black arch with knockout type that reveals the live
// beige background. Built at the exact viewport size so nothing is cut off. The
// WebGL background carries the optical breathing; the SVG frame stays clean to
// avoid displacement artifacts on the hard arch edge.
function buildIvoryPortal() {
  if (!ivoryPortalElement) {
    return;
  }

  const w = Math.max(360, Math.round(window.innerWidth));
  const h = Math.max(360, Math.round(window.innerHeight));
  const mobilePortal = w < 560;

  // Mobile keeps the side columns thin so the dome banner doesn't waste width;
  // openL/openR run to the actual viewport edges so the arch has no side legs
  // dropping down past the curve — black sits only in the upper corners.
  const colW = mobilePortal ? Math.min(58, Math.max(38, w * 0.12)) : Math.min(330, Math.max(138, w * 0.16));
  const openL = mobilePortal ? 0 : colW;
  const openR = mobilePortal ? w : w - colW;
  const spring = mobilePortal ? h * 0.32 : h * 0.58;
  const archBottom = h;
  const domeCtrl = mobilePortal ? h * 0.06 : h * 0.05;
  const stroke = Math.max(1.6, w * 0.0015);

  const opening = `M${openL} ${archBottom} L${openL} ${spring} C${openL} ${domeCtrl} ${openR} ${domeCtrl} ${openR} ${spring} L${openR} ${archBottom} Z`;
  // Hairline lives just inside the desktop arch dome; on mobile the curve runs
  // edge-to-edge so a hairline would either disappear in the open area or fight
  // the title — skip it.
  const hairL = colW * 0.84;
  const hairR = w - colW * 0.84;
  const hairCtrl = domeCtrl - h * 0.022;
  const hairline = `M${hairL} ${spring} C${hairL} ${hairCtrl} ${hairR} ${hairCtrl} ${hairR} ${spring}`;
  const hairlineFragment = mobilePortal
    ? ''
    : `<path d="${hairline}" fill="none" stroke="#000000" stroke-width="${stroke}" />`;

  const titleSize = mobilePortal ? Math.min(24, Math.max(20, w * 0.058)) : Math.min(74, Math.max(26, w * 0.046));
  const titleY = mobilePortal ? Math.max(54, h * 0.09) : Math.max(42, h * 0.115);
  const titleLS = titleSize * (mobilePortal ? 0.09 : 0.12);
  const subSize = mobilePortal ? Math.min(9, Math.max(7.2, w * 0.02)) : Math.min(18, Math.max(9.5, w * 0.0118));
  const subY = titleY + titleSize * 0.66;
  const subLS = subSize * (mobilePortal ? 0.22 : 0.5);
  const subtitle = mobilePortal ? 'TAP GHOST DRESS \u00B7 DIFF\u00C9RANCE' : 'STUDIO STUDY \u2014 CLICK GHOST DRESS \u00B7 DIFF\u00C9RANCE';

  const colSize = mobilePortal ? Math.min(9.5, Math.max(8.2, w * 0.023)) : Math.min(20, Math.max(11, w * 0.0132));
  const lineH = colSize * (mobilePortal ? 1.52 : 1.72);
  const colTop = mobilePortal ? h * 0.62 : h * 0.5;
  const colInset = mobilePortal ? Math.max(11, colW * 0.13) : Math.max(16, colW * 0.2);
  const leftX = colInset;
  const rightX = w - colInset;

  const leftLines = ['Italian born', 'New York house', 'Arden years', 'Coty award', 'silk metallic'];
  const rightLines = ['Click a ghost', 'switch the scan', 'keep the arc', 'watch the cloth', 'return to front'];
  const leftTspans = leftLines
    .map((line, index) => `<tspan x="${leftX}"${index ? ` dy="${lineH}"` : ''}>${line}</tspan>`)
    .join('');
  const rightTspans = rightLines
    .map((line, index) => `<tspan x="${rightX}"${index ? ` dy="${lineH}"` : ''}>${line}</tspan>`)
    .join('');
  // Side columns sit on the lower black strip on desktop. On mobile the dome
  // banner has no lower strip — drop the columns so they don't render as dead
  // space or float over the dress.
  const sideColumnsFragment = mobilePortal
    ? ''
    : `<text x="${leftX}" y="${colTop}" text-anchor="start" font-size="${colSize}" font-weight="400" letter-spacing="1.2">${leftTspans}</text>
            <text x="${rightX}" y="${colTop}" text-anchor="end" font-size="${colSize}" font-weight="400" letter-spacing="1.2">${rightTspans}</text>`;

  ivoryPortalElement.innerHTML = `
    <svg class="ivory-portal__svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <mask id="ivoryPortalMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}">
          <rect width="${w}" height="${h}" fill="#ffffff" />
          <path d="${opening}" fill="#000000" />
          ${hairlineFragment}
          <g fill="#000000" font-family="Inter, ui-sans-serif, system-ui, sans-serif">
            <text x="${w / 2}" y="${titleY}" text-anchor="middle" font-size="${titleSize}" font-weight="600" letter-spacing="${titleLS}">FASHION SYSTEM</text>
            <text x="${w / 2}" y="${subY}" text-anchor="middle" font-size="${subSize}" font-weight="500" letter-spacing="${subLS}">${subtitle}</text>
            ${sideColumnsFragment}
          </g>
        </mask>
      </defs>
      <g>
        <rect width="${w}" height="${h}" fill="#0b0a08" mask="url(#ivoryPortalMask)" />
      </g>
    </svg>
  `;
}

// Signal Black diptych — EVA-inspired visual language (red/black, mono, corner
// brackets, crosshair) but ONLY real dress info (no fake metrics, no kanji, no
// fictional codes). The two dress nodes ARE the switcher buttons: click an
// inactive node to load that dress. Scoped to signal-black; remove the builder,
// the .signal-diptych markup/CSS, and signalGraphNodeRecords to revert.
function buildSignalDiptych() {
  if (!signalDiptychElement || cycloramaBackgroundSettings.preset !== 'signal-black') {
    return;
  }

  const w = Math.max(360, Math.round(window.innerWidth));
  const h = Math.max(360, Math.round(window.innerHeight));
  const mid = w / 2;
  const activeId = dressAssetSettings.asset;

  const mono = "'JetBrains Mono', 'Geist Mono', 'SF Mono', ui-monospace, Menlo, Consolas, monospace";
  const red = '#ff2030';
  const redDim = 'rgba(255, 32, 48, 0.55)';
  const redFaint = 'rgba(255, 32, 48, 0.2)';
  const inkDim = 'rgba(255, 230, 196, 0.55)';
  const inkFaint = 'rgba(255, 230, 196, 0.22)';
  const green = '#3aff5e';
  const gridLine = 'rgba(255, 80, 20, 0.05)';

  const unit = Math.min(w, h);
  const nodeSize = Math.max(110, unit * 0.19);
  const headerH = Math.max(34, h * 0.054);
  const headerY = headerH / 2;
  const headerFont = Math.max(10, Math.min(15, h * 0.0145));
  const microFont = Math.max(8.5, Math.min(12, w * 0.0075));
  const labelFont = Math.max(10, Math.min(14, w * 0.0095));

  const px = (fx: number) => mid * fx;
  const py = (fy: number) => h * fy;
  const leftPad = Math.max(14, w * 0.018);
  const rightPad = Math.max(14, w * 0.018);

  const nodeA = { id: 'original' as DressAssetId, x: px(0.36), y: py(0.46), label: DRESS_ASSETS.original.label };
  const nodeB = { id: 'patchwork' as DressAssetId, x: px(0.68), y: py(0.66), label: DRESS_ASSETS.patchwork.label };
  const nodes = [nodeA, nodeB];
  const activeNode = activeId === 'original' ? nodeA : nodeB;
  const ringR = nodeSize * 0.58;

  // Helpers --------------------------------------------------------------
  const lineSeg = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw = 1, dash = '') =>
    `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`;
  const cornerBrackets = (x: number, y: number, ww: number, hh: number, len: number, color: string, sw = 1.4) => [
    lineSeg(x, y, x + len, y, color, sw), lineSeg(x, y, x, y + len, color, sw),
    lineSeg(x + ww, y, x + ww - len, y, color, sw), lineSeg(x + ww, y, x + ww, y + len, color, sw),
    lineSeg(x, y + hh, x + len, y + hh, color, sw), lineSeg(x, y + hh, x, y + hh - len, color, sw),
    lineSeg(x + ww, y + hh, x + ww - len, y + hh, color, sw), lineSeg(x + ww, y + hh, x + ww, y + hh - len, color, sw),
  ].join('');

  // Faint grid background (left pane only, pure decoration) -------------
  const gridCols = 18;
  const gridRows = 14;
  const gridFrags: string[] = [];
  for (let i = 1; i < gridCols; i++) {
    gridFrags.push(lineSeg((mid / gridCols) * i, headerH, (mid / gridCols) * i, h, gridLine));
  }
  for (let i = 1; i < gridRows; i++) {
    const y = headerH + ((h - headerH) / gridRows) * i;
    gridFrags.push(lineSeg(0, y, mid, y, gridLine));
  }

  // Header strip — minimal, real labels only ----------------------------
  const swatchSize = headerFont * 0.95;
  const swatchY = (headerH - swatchSize) / 2;
  const headerStrip = `
    ${lineSeg(0, headerH, w, headerH, redDim)}
    <rect x="${leftPad}" y="${swatchY.toFixed(1)}" width="${swatchSize.toFixed(1)}" height="${swatchSize.toFixed(1)}" fill="${red}" />
    <text x="${(leftPad + swatchSize + headerFont * 0.7).toFixed(1)}" y="${(headerY + headerFont * 0.36).toFixed(1)}" font-family="${mono}" font-size="${headerFont}" font-weight="800" letter-spacing="${(headerFont * 0.14).toFixed(2)}" fill="${red}">FASHION SYSTEM</text>
    <text x="${(w - rightPad).toFixed(1)}" y="${(headerY + headerFont * 0.36).toFixed(1)}" text-anchor="end" font-family="${mono}" font-size="${headerFont}" font-weight="500" letter-spacing="${(headerFont * 0.22).toFixed(2)}" fill="${inkDim}">FIG. SARMI</text>
  `;

  // Dashed divider between panes
  const divider = lineSeg(mid, headerH, mid, h, redDim, 1, '2 4');

  // Pane titles ---------------------------------------------------------
  const paneTitleY = headerH + Math.max(26, h * 0.036);
  const leftPaneTitle = `
    <text x="${leftPad}" y="${paneTitleY.toFixed(1)}" font-family="${mono}" font-size="${labelFont}" font-weight="800" letter-spacing="${(labelFont * 0.22).toFixed(2)}" fill="${red}">GARMENT GRAPH</text>
    <text x="${leftPad}" y="${(paneTitleY + labelFont * 1.6).toFixed(1)}" font-family="${mono}" font-size="${microFont}" font-weight="500" letter-spacing="${(microFont * 0.3).toFixed(2)}" fill="${inkDim}">CLICK NODE TO LOAD DRESS</text>
  `;
  const rightPaneTitle = `
    <text x="${(w - rightPad).toFixed(1)}" y="${paneTitleY.toFixed(1)}" text-anchor="end" font-family="${mono}" font-size="${labelFont}" font-weight="800" letter-spacing="${(labelFont * 0.22).toFixed(2)}" fill="${red}">ACTIVE DRESS</text>
  `;

  // Radar concentric rings around the graph midpoint (pure decoration) --
  const graphCx = (nodeA.x + nodeB.x) / 2;
  const graphCy = (nodeA.y + nodeB.y) / 2;
  const radarRings = [0.16, 0.26, 0.36, 0.46].map((rFrac) => {
    const r = unit * rFrac;
    return `<circle cx="${graphCx.toFixed(1)}" cy="${graphCy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${redFaint}" stroke-width="1" />`;
  }).join('');
  const radarMaxR = unit * 0.46;
  const radarCross = lineSeg(graphCx - radarMaxR, graphCy, graphCx + radarMaxR, graphCy, redFaint)
                   + lineSeg(graphCx, graphCy - radarMaxR, graphCx, graphCy + radarMaxR, redFaint);

  // Primary edge between the two dress nodes (no fake labels)
  const primaryEdge = lineSeg(nodeA.x, nodeA.y, nodeB.x, nodeB.y, red, 1.6);

  // Right pane corner brackets (frames the active dress) ---------------
  const rightFrameX = mid + rightPad * 0.7;
  const rightFrameY = headerH + 22;
  const rightFrameW = mid - rightPad * 1.4;
  const rightFrameH = h - headerH - 48;
  const rightFrameBrackets = cornerBrackets(rightFrameX, rightFrameY, rightFrameW, rightFrameH, Math.max(18, unit * 0.024), red, 1.6);

  // Right edge tick ladder (decorative; no numbers)
  const rightTicks = Array.from({ length: 24 }, (_, i) => {
    const ty = headerH + 22 + ((h - headerH - 44) / 23) * i;
    const tlen = i % 5 === 0 ? 14 : 7;
    return lineSeg(w - rightPad * 0.3, ty, w - rightPad * 0.3 - tlen, ty, redDim);
  }).join('');

  // Bottom-left archival note block ------------------------------------
  const noteFont = microFont;
  const noteLines = [
    'italian-born american house.',
    'arden designer before sarmi.',
    'coty award, new york, 1960.',
    'select a node to traverse.',
  ];
  const noteY0 = py(0.86);
  const noteText = noteLines.map((line, i) =>
    `<text x="${leftPad}" y="${(noteY0 + i * noteFont * 1.65).toFixed(1)}" font-family="${mono}" font-size="${noteFont}" font-weight="500" letter-spacing="0.4" fill="${inkFaint}">${line}</text>`,
  ).join('');

  // BASE SVG (below the dress canvases) ---------------------------------
  const baseSvg = `
    <svg class="signal-diptych__svg signal-diptych__base" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      ${gridFrags.join('')}
      ${headerStrip}
      ${divider}
      ${leftPaneTitle}
      ${rightPaneTitle}
      ${radarRings}
      ${radarCross}
      ${primaryEdge}
      ${noteText}
      ${rightFrameBrackets}
      ${rightTicks}
    </svg>`;

  // OVERLAY SVG (above the dress canvases): crosshair + ring + labels ---
  const crosshair = (cx: number, cy: number, r: number) => {
    const gap = r + 8;
    const len = r + 28;
    return lineSeg(cx - len, cy, cx - gap, cy, green, 1.6)
         + lineSeg(cx + len, cy, cx + gap, cy, green, 1.6)
         + lineSeg(cx, cy - len, cx, cy - gap, green, 1.6)
         + lineSeg(cx, cy + len, cx, cy + gap, green, 1.6);
  };
  const activeBrackets = cornerBrackets(activeNode.x - ringR - 12, activeNode.y - ringR - 12, (ringR + 12) * 2, (ringR + 12) * 2, 14, green, 2);
  const overlaySvg = `
    <svg class="signal-diptych__svg signal-diptych__overlay" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      ${crosshair(activeNode.x, activeNode.y, ringR)}
      <circle cx="${activeNode.x.toFixed(1)}" cy="${activeNode.y.toFixed(1)}" r="${ringR.toFixed(1)}" fill="none" stroke="${green}" stroke-width="2.4" />
      <circle cx="${activeNode.x.toFixed(1)}" cy="${activeNode.y.toFixed(1)}" r="${(ringR + 6).toFixed(1)}" fill="none" stroke="${green}" stroke-width="1" opacity="0.32" stroke-dasharray="3 4" />
      ${activeBrackets}
    </svg>`;

  // Preserve existing node canvases (their WebGL renderers + scenes persist
  // across rebuilds) so rebuilding the SVG never tears down GPU state.
  const existingCanvases = new Map<DressAssetId, HTMLCanvasElement>();
  signalGraphNodeRecords.forEach((record, id) => existingCanvases.set(id, record.canvas));

  signalDiptychElement.innerHTML = baseSvg + overlaySvg;

  const canvasSize = Math.round(nodeSize * 1.6);
  nodes.forEach((node) => {
    let canvas = existingCanvases.get(node.id);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'signal-diptych__node';
      canvas.dataset.dressId = node.id;
    }
    const isActive = node.id === activeId;
    canvas.dataset.active = String(isActive);
    canvas.style.left = `${node.x - canvasSize / 2}px`;
    canvas.style.top = `${node.y - canvasSize / 2}px`;
    canvas.style.width = `${canvasSize}px`;
    canvas.style.height = `${canvasSize}px`;
    canvas.dataset.signalNodeSize = String(canvasSize);
    canvas.setAttribute('role', 'button');
    canvas.setAttribute('aria-label', `Switch to ${node.label}`);
    canvas.setAttribute('aria-pressed', String(isActive));
    canvas.tabIndex = isActive ? -1 : 0;
    // Insert between base svg and overlay svg so the green ring sits above.
    const overlay = signalDiptychElement.querySelector('.signal-diptych__overlay');
    signalDiptychElement.insertBefore(canvas, overlay);
    const record = ensureSignalGraphNodeRecord(node.id, canvas);
    record.renderer.setSize(canvasSize, canvasSize, false);
  });

  renderSignalGraphNodes();
}

function ensureSignalGraphNodeRecord(assetId: DressAssetId, canvas: HTMLCanvasElement) {
  const existing = signalGraphNodeRecords.get(assetId);
  if (existing && existing.canvas === canvas) {
    return existing;
  }
  if (existing) {
    existing.renderer.dispose();
    signalGraphNodeRecords.delete(assetId);
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const record: SignalGraphNodeRecord = { assetId, canvas, renderer };
  signalGraphNodeRecords.set(assetId, record);
  return record;
}

function renderSignalGraphNodes() {
  if (cycloramaBackgroundSettings.preset !== 'signal-black') {
    return;
  }
  signalGraphNodeRecords.forEach((node) => {
    const thumb = dressThumbnailRecords.get(node.assetId);
    if (!thumb?.root) {
      return;
    }
    const styled = Number(node.canvas.dataset.signalNodeSize || '0');
    const size = styled || node.canvas.clientWidth || 128;
    node.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    node.renderer.setSize(size, size, false);
    thumb.camera.aspect = 1;
    thumb.camera.updateProjectionMatrix();
    node.renderer.render(thumb.scene, thumb.camera);
  });
}

function applyResponsiveCamera(width: number, height: number) {
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
  const scale = invisibleCities
    ? INVISIBLE_CITIES_SUBJECT_SCALE
    : cycloramaBackgroundSettings.preset === 'tabla-rasa'
    ? WIND_ARCHIVE_SUBJECT_SCALE
    : 1;
  const lift = invisibleCities ? (isMobileViewport() ? 0 : 0.42) : 0;

  fullDressCache.forEach((record) => {
    record.pivot.position.set(0, lift, 0);
    record.pivot.scale.setScalar(scale);
  });
}

function applySafeCameraMotion() {
  const baseCameraY = subjectMotion.baseCameraPosition.y;
  const baseFocusY = subjectMotion.baseFocusTarget.y;
  const baseViewOffset = subjectMotion.baseCameraPosition.clone().sub(subjectMotion.baseFocusTarget);
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
  controls.update();
}

function updateDebugState(bounds?: THREE.Box3) {
  (window as typeof window & {
    __boosterDebug?: Record<string, unknown>;
  }).__boosterDebug = {
    cameraPosition: camera.position.toArray(),
    focusTarget: focusTarget.toArray(),
    activeDress: activeFullDress?.asset.id ?? null,
    fullDressCache: Array.from(fullDressCache.keys()),
    backgroundPreset: cycloramaBackgroundSettings.preset,
    photoPrintCount: photoPrintParticles.length,
    visibleGhosts: Array.from(ghostDressCache.values())
      .filter((record) => record.root.visible)
      .map((record) => record.asset.id),
    subjectScale: activeFullDress?.pivot.scale.x ?? null,
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

function getBackViewAmount(yaw: number) {
  const backFacing = (1 - Math.cos(yaw)) * 0.5;
  return THREE.MathUtils.smoothstep(backFacing, 0.04, 1);
}

function createGui() {
  const gui = new GUI({ title: 'Dress wind' });
  const applyPreset = (preset: DressWindSettings) => {
    Object.assign(settings, preset);
    resetDressWind();
    gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
  };

  gui.add(settings, 'windStrength', 0, 0.11, 0.001).name('wind strength');
  gui.add(settings, 'fabricLooseness', 0.15, 1.2, 0.01).name('fabric looseness');
  gui.add(settings, 'flutter', 0, 1.0, 0.01).name('flutter detail');
  gui.add(settings, 'gustRadius', 0.12, 0.72, 0.01).name('cursor radius');
  gui.add(settings, 'followSpeed', 4, 28, 0.1).name('follow speed');
  gui.add(settings, 'fadeSpeed', 1.2, 8, 0.1).name('fade at rest');
  gui.add(settings, 'freezeTime').name('freeze time');
  gui.add(dressAssetSettings, 'asset', DRESS_ASSET_GUI_OPTIONS).name('dress').onChange((assetId: DressAssetId) => {
    void loadDressAsset(assetId);
  });
  gui.add(cycloramaBackgroundSettings, 'preset', CYCLO_BACKGROUND_GUI_OPTIONS).name('cyclo bg').onChange((presetId: CycloramaBackgroundPresetId) => {
    applyCycloramaBackgroundPreset(presetId);
  });
  const finishFolder = gui.addFolder('Cinematic finish');
  finishFolder.add(cinematicSettings, 'enabled').name('enabled').onChange(syncCinematicFinishPass);
  finishFolder.add(cinematicSettings, 'filmGrain', 0, 0.06, 0.001).name('film grain').onChange(syncCinematicFinishPass);
  finishFolder.add(cinematicSettings, 'diffusion', 0, 0.06, 0.001).name('diffusion').onChange(syncCinematicFinishPass);
  finishFolder.add(cinematicSettings, 'halation', 0, 0.12, 0.001).name('halation').onChange(syncCinematicFinishPass);
  finishFolder.add(cinematicSettings, 'vignette', 0, 0.08, 0.001).name('vignette').onChange(syncCinematicFinishPass);
  finishFolder.add(cinematicSettings, 'saturation', 0.8, 1.25, 0.001).name('saturation').onChange(syncCinematicFinishPass);
  finishFolder.add(cinematicSettings, 'contrast', 0.85, 1.15, 0.001).name('contrast').onChange(syncCinematicFinishPass);
  finishFolder.close();
  const ivoryOpticsFolder = gui.addFolder('Différance optics');
  ivoryOpticsFolder.add(ivoryBackgroundOpticsSettings, 'strength', 0, 0.09, 0.001).name('breath strength');
  ivoryOpticsFolder.add(ivoryBackgroundOpticsSettings, 'radiusScale', 0.55, 1.65, 0.01).name('breath radius');
  ivoryOpticsFolder.add(ivoryBackgroundOpticsSettings, 'pulseSpeed', 0.2, 1.8, 0.01).name('breath speed');
  ivoryOpticsFolder.close();

  const presets = {
    editorial: () => applyPreset(DRESS_WIND_PRESETS.editorial),
    quiet: () => applyPreset(DRESS_WIND_PRESETS.quiet),
  };
  const presetFolder = gui.addFolder('Presets');
  presetFolder.add(presets, 'editorial').name('editorial wind');
  presetFolder.add(presets, 'quiet').name('quiet movement');

  if (showControls) {
    gui.open();
  } else {
    gui.close();
    gui.domElement.classList.add('is-hidden');
  }

  return gui;
}

gui = createGui();
resize();
canvasElement.addEventListener('pointermove', handlePointerMove, { passive: true });
canvasElement.addEventListener('pointerdown', handleCanvasPointerDown);
canvasElement.addEventListener('pointerleave', handlePointerLeave, { passive: true });
backgroundButtons.forEach((button) => button.addEventListener('click', handleCycloramaBackgroundClick));
dressButtons.forEach((button) => button.addEventListener('click', handleDressAssetClick));
dressNavigationButtons.forEach((button) => button.addEventListener('click', handleDressNavigationClick));
dialecticPaperToggle?.addEventListener('click', handleDialecticPaperToggle);
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

buildIvoryPortal();
buildSignalDiptych();

function dispose() {
  if (disposed) {
    return;
  }

  disposed = true;
  window.cancelAnimationFrame(animationFrame);
  if (ghostLoadTimeout) {
    window.clearTimeout(ghostLoadTimeout);
    ghostLoadTimeout = 0;
  }
  if (editorialRailRevealTimeout) {
    window.clearTimeout(editorialRailRevealTimeout);
    editorialRailRevealTimeout = 0;
  }
  if (queuedResizeFrame) {
    window.cancelAnimationFrame(queuedResizeFrame);
    queuedResizeFrame = 0;
  }
  canvasElement.removeEventListener('pointermove', handlePointerMove);
  canvasElement.removeEventListener('pointerdown', handleCanvasPointerDown);
  canvasElement.removeEventListener('pointerleave', handlePointerLeave);
  backgroundButtons.forEach((button) => button.removeEventListener('click', handleCycloramaBackgroundClick));
  dressButtons.forEach((button) => button.removeEventListener('click', handleDressAssetClick));
  dressNavigationButtons.forEach((button) => button.removeEventListener('click', handleDressNavigationClick));
  dialecticPaperToggle?.removeEventListener('click', handleDialecticPaperToggle);
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
  clearPhotoPrintParticles();
  fullDressCache.forEach((record) => disposeObjectResources(record.pivot));
  fullDressCache.clear();
  ghostDressCache.forEach((record) => disposeGhostDressRecord(record));
  ghostDressCache.clear();
  dressThumbnailRecords.forEach((record) => disposeDressThumbnailRecord(record));
  dressThumbnailRecords.clear();
  ghostPickTargets.length = 0;
  controls.dispose();
  gui?.destroy();
  gui = null;
  composer.dispose();
  subjectFxComposer.dispose();
  subjectFxRenderTarget.dispose();
  subjectFxOverlayMaterial.dispose();
  sharpSubjectComposer.dispose();
  sharpSubjectRenderTarget.dispose();
  sharpSubjectOverlayMaterial.dispose();
  sharpSubjectOverlayGeometry.dispose();
  signalGraphNodeRecords.forEach((record) => record.renderer.dispose());
  signalGraphNodeRecords.clear();
  timer.dispose();
  disposableGeometries.forEach((geometry) => geometry.dispose());
  disposableMaterials.forEach((material) => material.dispose());
  disposableTextures.forEach((texture) => texture.dispose());
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
