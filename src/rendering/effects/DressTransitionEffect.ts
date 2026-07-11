import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GlitchPass } from 'three/addons/postprocessing/GlitchPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import {
  DRESS_TRANSITION_FX_DURATION,
  DRESS_TRANSITION_FX_ENABLED,
  DRESS_TRANSITION_FX_OVERLAY_OPACITY,
} from '../../app/experienceConstants';
import type { FullDressRecord, SubjectTransitionPipeline } from '../../app/experienceTypes';
import type { DressAssetId } from '../../config/dresses';
import type { CycloramaBackgroundPresetId } from '../../config/themes';
import { StudioScene } from '../studio/StudioScene';
import { resizeEffectComposer } from './subjectBloom';

export type DressTransitionEffectOptions = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  studio: StudioScene;
  dressGhostGroup: THREE.Group;
  getDresses: () => Map<DressAssetId, FullDressRecord>;
};

export class DressTransitionEffect {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly studio: StudioScene;
  private readonly dressGhostGroup: THREE.Group;
  private readonly getDresses: () => Map<DressAssetId, FullDressRecord>;
  private pipeline: SubjectTransitionPipeline | null = null;
  private amount = 0;

  constructor(options: DressTransitionEffectOptions) {
    this.scene = options.scene;
    this.camera = options.camera;
    this.renderer = options.renderer;
    this.canvas = options.canvas;
    this.studio = options.studio;
    this.dressGhostGroup = options.dressGhostGroup;
    this.getDresses = options.getDresses;
  }

  trigger(themeId: CycloramaBackgroundPresetId) {
    if (
      DRESS_TRANSITION_FX_ENABLED
      && (themeId === 'blue' || themeId === 'mew-holo' || themeId === 'tabla-rasa')
    ) {
      this.amount = 1;
    }
  }

  update(delta: number, themeId: CycloramaBackgroundPresetId) {
    if (this.amount > 0) {
      this.amount = Math.max(0, this.amount - delta / DRESS_TRANSITION_FX_DURATION);
    }
    return DRESS_TRANSITION_FX_ENABLED
      && this.amount > 0
      && (themeId === 'blue' || themeId === 'mew-holo' || themeId === 'tabla-rasa');
  }

  composite(delta: number, active: boolean) {
    if (!active || !this.renderSubject(delta)) {
      this.disposePipeline();
      return;
    }

    const pipeline = this.pipeline;
    if (!pipeline) {
      return;
    }
    const eased = Math.sin(Math.min(1, this.amount) * Math.PI * 0.5);
    pipeline.overlayMaterial.opacity = eased * DRESS_TRANSITION_FX_OVERLAY_OPACITY;
    this.renderer.autoClear = false;
    this.renderer.render(pipeline.overlayScene, pipeline.overlayCamera);
    this.renderer.autoClear = true;
  }

  resize(width: number, height: number) {
    if (this.pipeline) {
      resizeEffectComposer(this.pipeline.composer, width, height);
    }
  }

  dispose() {
    this.amount = 0;
    this.disposePipeline();
  }

  private ensurePipeline() {
    if (this.pipeline) {
      return this.pipeline;
    }

    const renderTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
    const composer = new EffectComposer(this.renderer, renderTarget);
    composer.renderToScreen = false;
    const renderPass = new RenderPass(this.scene, this.camera);
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
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    overlayScene.add(new THREE.Mesh(overlayGeometry, overlayMaterial));

    this.pipeline = {
      renderTarget,
      composer,
      renderPass,
      glitchPass,
      overlayScene,
      overlayCamera,
      overlayGeometry,
      overlayMaterial,
    };
    const bounds = this.canvas.getBoundingClientRect();
    this.resize(
      Math.max(1, Math.round(bounds.width || window.innerWidth)),
      Math.max(1, Math.round(bounds.height || window.innerHeight)),
    );
    return this.pipeline;
  }

  private renderSubject(delta: number) {
    const pipeline = this.ensurePipeline();
    const subjectPivots = Array.from(this.getDresses().values())
      .filter((record) => record.pivot.visible)
      .map((record) => record.pivot);
    if (subjectPivots.length === 0) {
      return false;
    }

    const subjectSet = new Set<THREE.Object3D>(subjectPivots);
    const hiddenCandidates: Array<THREE.Object3D | null> = [
      this.studio.cycloramaMesh,
      this.studio.infiniteBackdropMesh,
      this.studio.holoAccentGroup,
      this.studio.ivorySculptureGroup,
      this.studio.photoPrintGroup,
      this.studio.windArchiveDressShadow,
      this.studio.dialecticHalftoneShadow,
      this.studio.signalBlackGroup,
      this.studio.yellowBacking,
      this.studio.paperRollMesh,
      this.dressGhostGroup,
    ];
    const hidden = hiddenCandidates.filter(
      (object): object is THREE.Object3D => object !== null && object.visible,
    );
    const previousBackground = this.scene.background;
    const previousFog = this.scene.fog;
    const previousShadowVisible = this.studio.contactShadow?.visible ?? null;

    hidden.forEach((object) => { object.visible = false; });
    if (this.studio.contactShadow && !subjectSet.has(this.studio.contactShadow)) {
      this.studio.contactShadow.visible = false;
    }
    this.scene.background = null;
    this.scene.fog = null;
    pipeline.glitchPass.enabled = this.amount > 0.18 && this.amount < 0.82;
    pipeline.glitchPass.goWild = false;

    try {
      pipeline.composer.render(delta);
    } finally {
      this.scene.background = previousBackground;
      this.scene.fog = previousFog;
      if (this.studio.contactShadow && previousShadowVisible !== null) {
        this.studio.contactShadow.visible = previousShadowVisible;
      }
      hidden.forEach((object) => { object.visible = true; });
      this.renderer.setRenderTarget(null);
    }
    return true;
  }

  private disposePipeline() {
    if (!this.pipeline) {
      return;
    }
    this.pipeline.composer.dispose();
    this.pipeline.renderTarget.dispose();
    this.pipeline.overlayMaterial.dispose();
    this.pipeline.overlayGeometry.dispose();
    this.pipeline = null;
  }
}
