import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { BLOOM_BASE_RADIUS, BLOOM_BASE_STRENGTH, BLOOM_THRESHOLD } from '../../app/experienceConstants';
import { getRenderPixelRatio } from '../../app/renderProfile';
import type { MewForegroundPipeline } from '../../app/experienceTypes';
import { StudioScene } from '../studio/StudioScene';
import { createSubjectBloomPipeline, disposeSubjectBloomPipeline, renderSubjectBloom, resizeEffectComposer } from '../effects/subjectBloom';
import { CINEMATIC_FINISH_SHADER, MEW_ALPHA_FEATHER_SHADER } from '../shaders/postProcessing';

export type MewRenderControllerOptions = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  canvasElement: HTMLCanvasElement;
  mewForegroundCanvasElement: HTMLCanvasElement;
  focusTarget: THREE.Vector3;
  studio: StudioScene;
  mewTitleOverlayScene: THREE.Scene;
  mewTitleOverlayCamera: THREE.OrthographicCamera;
  mewTitleOverlayMaterial: THREE.ShaderMaterial;
  mewTitleOverlayTexture: THREE.Texture;
  getVisibleSubjectObjects: () => THREE.Object3D[];
  getMewTitleBlackOpacity: () => number;
  getDressBloomStrength: () => number;
  isMewTitleOverlayDirty: () => boolean;
  setMewTitleOverlayDirty: (dirty: boolean) => void;
  updateMewTitleOverlayTexture: () => boolean;
};

export function createMewRenderController(options: MewRenderControllerOptions) {
  const {
    scene, camera, renderer, composer, canvasElement, mewForegroundCanvasElement,
    focusTarget, studio, mewTitleOverlayScene, mewTitleOverlayCamera,
    mewTitleOverlayMaterial, mewTitleOverlayTexture, getVisibleSubjectObjects,
    getMewTitleBlackOpacity, getDressBloomStrength, isMewTitleOverlayDirty,
    setMewTitleOverlayDirty, updateMewTitleOverlayTexture,
  } = options;
  const subjectBloomPipeline = createSubjectBloomPipeline(renderer, scene, camera);
  let mewForegroundPipeline: MewForegroundPipeline | null = null;

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
    const subjectBloomPipeline = createSubjectBloomPipeline(renderer, scene, camera);
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
    mewTitleOverlayMaterial.uniforms.uBlackOpacity.value = getMewTitleBlackOpacity();
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

    disposeSubjectBloomPipeline(pipeline.subjectBloomPipeline);
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

  function renderMewForeground(delta: number) {
    const pipeline = mewForegroundPipeline;
    if (!pipeline) {
      return;
    }

    if (isMewTitleOverlayDirty()) {
      setMewTitleOverlayDirty(!updateMewTitleOverlayTexture());
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
    [studio.cycloramaMesh, studio.infiniteBackdropMesh, studio.holoAccentGroup, studio.ivorySculptureGroup, studio.photoPrintGroup, studio.windArchiveDressShadow, studio.dialecticHalftoneShadow, studio.yellowBacking, studio.paperRollMesh].forEach((object) => {
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
      renderSubjectBloom(delta, pipeline.subjectBloomPipeline, getDressBloomStrength());
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
    if (isMewTitleOverlayDirty()) {
      setMewTitleOverlayDirty(!updateMewTitleOverlayTexture());
    }
    // The main composer has just rendered the subject-free chromatic field. Its
    // read buffer is already available in this context, so the title can sample
    // it without allocating another full post-processing chain.
    mewTitleOverlayMaterial.uniforms.uBackground.value = composer.readBuffer.texture;
    mewTitleOverlayMaterial.uniforms.uBackgroundNeedsOutput.value = 1;
    mewTitleOverlayMaterial.uniforms.uToneMappingExposure.value = renderer.toneMappingExposure;
    const previousAutoClear = renderer.autoClear;

    const hiddenObjects: THREE.Object3D[] = [];
    [studio.cycloramaMesh, studio.infiniteBackdropMesh, studio.holoAccentGroup, studio.ivorySculptureGroup, studio.photoPrintGroup, studio.windArchiveDressShadow, studio.dialecticHalftoneShadow, studio.yellowBacking, studio.paperRollMesh].forEach((object) => {
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
      renderSubjectBloom(delta, subjectBloomPipeline, getDressBloomStrength());
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

  function renderSharpSubjectOverlay(delta: number) {
    const hiddenObjects: THREE.Object3D[] = [];
    [studio.cycloramaMesh, studio.infiniteBackdropMesh, studio.holoAccentGroup, studio.ivorySculptureGroup, studio.photoPrintGroup, studio.windArchiveDressShadow, studio.yellowBacking, studio.paperRollMesh, studio.dialecticHalftoneShadow].forEach((object) => {
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
      renderSubjectBloom(delta, subjectBloomPipeline, getDressBloomStrength());
    } finally {
      renderer.autoClear = previousAutoClear;
      scene.background = previousBackground;
      hiddenObjects.forEach((object, index) => {
        object.visible = previousVisibility[index];
      });
    }
  }

  function resize(width: number, height: number) {
    resizeEffectComposer(subjectBloomPipeline.composer, width, height);
    if (mewForegroundPipeline) {
      resizeMewForegroundPipeline(mewForegroundPipeline, width, height);
    }
  }

  function getMewForegroundPipeline() {
    return mewForegroundPipeline;
  }

  function dispose() {
    disposeMewForegroundPipeline();
    disposeSubjectBloomPipeline(subjectBloomPipeline);
  }

  return {
    ensureMewForegroundPipeline,
    disposeMewForegroundPipeline,
    renderMewForeground,
    renderMewMobile,
    renderSharpSubjectOverlay,
    getMewForegroundPipeline,
    resize,
    dispose,
  };
}
