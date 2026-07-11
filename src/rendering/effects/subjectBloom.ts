import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { DRESS_BLOOM_RADIUS, DRESS_BLOOM_THRESHOLD } from '../../app/experienceConstants';
import { getEffectPixelRatio } from '../../app/renderProfile';
import type { SubjectBloomPipeline } from '../../app/experienceTypes';

export function createSubjectBloomPipeline(
  targetRenderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): SubjectBloomPipeline {
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

export function renderSubjectBloom(
  delta: number,
  pipeline: SubjectBloomPipeline,
  dressBloomStrength: number,
) {
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

export function resizeEffectComposer(composer: EffectComposer, width: number, height: number) {
  // Post-processing remains enabled on mobile. Its intermediate render targets
  // use a reduced scale so Safari has room for the visible renderer, garment,
  // and theme geometry without forcing a WebContent memory termination.
  composer.setPixelRatio(getEffectPixelRatio());
  composer.setSize(width, height);
}

export function disposeSubjectBloomPipeline(pipeline: SubjectBloomPipeline) {
  pipeline.composer.dispose();
  pipeline.bloomPass.dispose();
  pipeline.overlayMaterial.dispose();
  pipeline.overlayGeometry.dispose();
}
