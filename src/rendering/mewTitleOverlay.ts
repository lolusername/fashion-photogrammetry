import * as THREE from 'three';

// ---------------------------------------------------------------------------
// INVISIBLE CITIES "SYSTEM" TITLE MASK
// ---------------------------------------------------------------------------
// Canvas 2D draws the typography into an alpha mask. Three.js then uses that
// mask in a full-screen shader. At black opacity 0 the letters become a window
// into a captured background texture; at 1 they are solid near-black.
// Keep this backing store stable across viewport changes. Resizing the source
// canvas under a live CanvasTexture can leave Safari with a partially updated
// texture, which showed up as duplicated title frames on desktop resizes.
export function createMewTitleOverlay() {
  const MEW_TITLE_MASK_WIDTH = 1536;
  const MEW_TITLE_MASK_HEIGHT = 1024;
  const mewTitleOverlayCanvas = document.createElement('canvas');
  mewTitleOverlayCanvas.width = MEW_TITLE_MASK_WIDTH;
  mewTitleOverlayCanvas.height = MEW_TITLE_MASK_HEIGHT;
  const maybeMewTitleOverlayContext = mewTitleOverlayCanvas.getContext('2d');
  if (!maybeMewTitleOverlayContext) {
    throw new Error('Could not create the Invisible Cities title overlay.');
  }
  const mewTitleOverlayContext: CanvasRenderingContext2D = maybeMewTitleOverlayContext;
  const mewTitleOverlayTexture = new THREE.CanvasTexture(mewTitleOverlayCanvas);
  // Color textures and UI canvases are authored for display, so mark them sRGB.
  // Data textures (normals, depth, masks) usually remain linear/no-color-space.
  mewTitleOverlayTexture.colorSpace = THREE.SRGBColorSpace;
  mewTitleOverlayTexture.minFilter = THREE.LinearFilter;
  mewTitleOverlayTexture.magFilter = THREE.LinearFilter;
  const mewTitleOverlayScene = new THREE.Scene();
  const mewTitleOverlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mewTitleOverlayGeometry = new THREE.PlaneGeometry(2, 2);
  const mewTitleOverlayMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uBackground: { value: null },
      uMask: { value: mewTitleOverlayTexture },
      uBlackOpacity: { value: 1 },
      uBackgroundNeedsOutput: { value: 0 },
      uToneMappingExposure: { value: 0.64 },
    },
    vertexShader: `
      varying vec2 vUv;
  
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uBackground;
      uniform sampler2D uMask;
      uniform float uBlackOpacity;
      uniform float uBackgroundNeedsOutput;
      uniform float uToneMappingExposure;
      varying vec2 vUv;
  
      vec3 rrtAndOdtFit(vec3 value) {
        vec3 a = value * (value + 0.0245786) - 0.000090537;
        vec3 b = value * (0.983729 * value + 0.4329510) + 0.238081;
        return a / b;
      }
  
      vec3 acesFilmicToneMapping(vec3 color) {
        const mat3 inputMatrix = mat3(
          vec3(0.59719, 0.07600, 0.02840),
          vec3(0.35458, 0.90834, 0.13383),
          vec3(0.04823, 0.01566, 0.83777)
        );
        const mat3 outputMatrix = mat3(
          vec3(1.60475, -0.10208, -0.00327),
          vec3(-0.53108, 1.10813, -0.07276),
          vec3(-0.07367, -0.00605, 1.07602)
        );
        color *= uToneMappingExposure / 0.6;
        color = inputMatrix * color;
        color = rrtAndOdtFit(color);
        return clamp(outputMatrix * color, 0.0, 1.0);
      }
  
      vec3 linearToSrgb(vec3 color) {
        return mix(
          pow(color, vec3(0.41666)) * 1.055 - vec3(0.055),
          color * 12.92,
          vec3(lessThanEqual(color, vec3(0.0031308)))
        );
      }
  
      float piecewiseRamp(float value, float a, float b, float c, float d, float e, float f, float g, float h) {
        if (value < a) return mix(0.0, b, value / a);
        if (value < c) return mix(b, d, (value - a) / (c - a));
        if (value < e) return mix(d, 1.0, (value - c) / (e - c));
        if (value < f) return 1.0;
        if (value < g) return mix(1.0, h, (value - f) / (g - f));
        if (value < 0.95) return mix(h, 0.1, (value - g) / (0.95 - g));
        return mix(0.1, 0.0, (value - 0.95) / 0.05);
      }
  
      float mainCanvasMask(vec2 uv) {
        // Mirrors the main Mew canvas's two CSS mask gradients. The visible
        // canvas is alpha-composited over white after this mask is applied.
        float horizontal = piecewiseRamp(uv.x, 0.05, 0.1, 0.12, 0.52, 0.24, 0.76, 0.88, 0.52);
        float vertical = piecewiseRamp(uv.y, 0.04, 0.12, 0.09, 0.55, 0.15, 0.75, 0.87, 0.5);
        return horizontal * vertical;
      }
  
      void main() {
        // Mask RGB is irrelevant; its alpha defines the letter silhouettes.
        vec4 mask = texture2D(uMask, vUv);
        // Keep the word in its editorial position while sampling the visible
        // chromatic field behind the dress.
        vec2 backgroundUv = vec2(vUv.x, clamp(vUv.y, 0.0, 1.0));
        vec4 background = texture2D(uBackground, backgroundUv);
        if (uBackgroundNeedsOutput > 0.5) {
          background.rgb = linearToSrgb(acesFilmicToneMapping(background.rgb));
        }
        // The main canvas fades through alpha into the white Mew page. Sampling
        // only RGB would expose transparent pixels' darker stored color instead
        // of the exact color actually visible behind the dress.
        vec3 backgroundColor = mix(
          vec3(1.0),
          background.rgb,
          clamp(background.a * mainCanvasMask(backgroundUv), 0.0, 1.0)
        );
        // uBlackOpacity is an interpolation amount, not material opacity:
        // 0 = exact background color in the stencil
        // 1 = black title color in the stencil
  
      vec3 titleColor = mix(backgroundColor, vec3(0.043), uBlackOpacity);
  
      // mask.a = full silhouette: border + letters
      // mask.r = inner letters only, because canvas fill is white
      float fullShape = mask.a;
      float innerLetters = mask.r;
  
      // Border gets black. Letter interior keeps the existing title behavior.
      vec3 finalColor = mix(vec3(0.0), titleColor, innerLetters);
  
      gl_FragColor = vec4(finalColor, fullShape);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  mewTitleOverlayScene.add(new THREE.Mesh(mewTitleOverlayGeometry, mewTitleOverlayMaterial));

  return {
    mewTitleOverlayCanvas,
    mewTitleOverlayContext,
    mewTitleOverlayTexture,
    mewTitleOverlayScene,
    mewTitleOverlayCamera,
    mewTitleOverlayGeometry,
    mewTitleOverlayMaterial,
  };
}
