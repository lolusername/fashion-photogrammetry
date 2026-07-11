import type * as THREE from 'three';
import type { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import type { GlitchPass } from 'three/addons/postprocessing/GlitchPass.js';
import type { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import type { DressAsset, DressAssetId } from '../config/dresses';
import type { CycloramaBackgroundPresetId } from '../config/themes';
import type { LoadedDress } from '../loadDress';

export type PointerWindState = {
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

export type ArmBloomController = {
  update: (activity: number) => void;
  dispose: () => void;
};

export type PaletteMaterial = THREE.Material & {
  color?: THREE.Color;
  roughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  envMapIntensity?: number;
  iridescence?: number;
};

export type BlueDressHoverState = {
  overActiveDress: boolean;
  lastMoveTime: number;
};

export type MewHoloScrollState = {
  progress: number;
  targetProgress: number;
  switching: boolean;
  touchY: number | null;
};

export type SubjectMotionState = {
  pivot: THREE.Group | null;
  yaw: number;
  targetYaw: number;
  cameraLift: number;
  targetCameraLift: number;
  baseCameraPosition: THREE.Vector3;
  baseFocusTarget: THREE.Vector3;
};

export type SubjectBloomPipeline = {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
  overlayScene: THREE.Scene;
  overlayCamera: THREE.OrthographicCamera;
  overlayGeometry: THREE.PlaneGeometry;
  overlayMaterial: THREE.ShaderMaterial;
};

export type SubjectTransitionPipeline = {
  renderTarget: THREE.WebGLRenderTarget;
  composer: EffectComposer;
  renderPass: RenderPass;
  glitchPass: GlitchPass;
  overlayScene: THREE.Scene;
  overlayCamera: THREE.OrthographicCamera;
  overlayGeometry: THREE.PlaneGeometry;
  overlayMaterial: THREE.MeshBasicMaterial;
};

export type MewForegroundPipeline = {
  renderer: THREE.WebGLRenderer;
  pmrem: THREE.PMREMGenerator;
  environment: THREE.Texture;
  subjectBloomPipeline: SubjectBloomPipeline;
  titleBackgroundComposer: EffectComposer;
  titleBackgroundBloomPass: UnrealBloomPass;
  titleBackgroundBokehPass: BokehPass;
  titleBackgroundBokehUniforms: Record<string, THREE.IUniform<number>>;
  titleBackgroundCinematicFinishPass: ShaderPass;
  titleBackgroundAlphaFeatherPass: ShaderPass;
};

export type CycloramaBackgroundSettings = {
  preset: CycloramaBackgroundPresetId;
};

export type CycloramaBackgroundUniforms = {
  uCycloTextureMode: THREE.IUniform<number>;
  uCycloTileRepeat: THREE.IUniform<THREE.Vector2>;
  uCycloCoverScale: THREE.IUniform<THREE.Vector2>;
  uCycloCoverOffset: THREE.IUniform<THREE.Vector2>;
  uCycloTime: THREE.IUniform<number>;
};

export type InfiniteBackdropUniforms = {
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

export type HoloSculptureMotion = {
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

export type PhotoPrintMaterialRecord = {
  material: THREE.MeshBasicMaterial;
  opacity: number;
};

export type ScreenSpaceBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type PhotoPrintParticle = {
  root: THREE.Group;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  restQuaternion: THREE.Quaternion;
  age: number;
  floorY: number;
  floorContactAge: number | null;
  discarding: boolean;
  baseScale: number;
  seed: number;
  materials: PhotoPrintMaterialRecord[];
};

export type FullDressRecord = {
  asset: DressAsset;
  loaded: LoadedDress;
  pivot: THREE.Group;
  opacity: number;
  targetOpacity: number;
  lastUsed: number;
};

export type GhostDressRecord = {
  asset: DressAsset;
  root: THREE.Group;
  material: THREE.LineBasicMaterial;
  fillMaterial: THREE.MeshBasicMaterial;
  wireMaterial: THREE.MeshBasicMaterial;
  pickTargets: THREE.Object3D[];
};

export type DressThumbnailRecord = {
  assetId: DressAssetId;
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  root: THREE.Group | null;
};

export type SignalGraphNodeRecord = {
  assetId: DressAssetId;
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
};
