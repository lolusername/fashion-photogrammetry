import * as THREE from 'three';

import { cinematicSettings, ivoryBackgroundOpticsSettings } from '../postProcessingSettings';

// ---------------------------------------------------------------------------
// FULL-FRAME CINEMATIC FINISH SHADER
// ---------------------------------------------------------------------------
// A ShaderPass automatically supplies the previous pass as `tDiffuse`. This is
// an image-space shader: it knows nothing about dresses, lights, or 3D world
// positions. It sees only the completed RGBA image and its UV coordinates.
//
// Important distinction:
// - Material shader: determines how a 3D surface is drawn.
// - Post-processing shader: transforms an already rendered 2D image.
//
// This one implements subtle diffusion, halation, color shaping, grain, and a
// vignette. All calculations remain in one pass to avoid extra render targets.
export const CINEMATIC_FINISH_SHADER = {
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
    // Varying values are interpolated by the rasterizer. If one vertex writes
    // UV (0,0) and another writes (1,0), fragments between them receive values
    // between 0 and 1 automatically.
    varying vec2 vUv;

    void main() {
      vUv = uv;
      // This shader runs on a full-screen plane, but using the standard matrix
      // transform keeps it compatible with Three.js's ShaderPass machinery.
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    // tDiffuse is the color texture produced by the preceding composer pass.
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

    // Fast deterministic pseudo-randomness. This is not cryptographic or truly
    // random; neighboring inputs merely produce visually uncorrelated values.
    float hash(vec2 value) {
      return fract(sin(dot(value, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    // Human vision is more sensitive to green than blue. These Rec. 601-style
    // weights estimate perceived brightness rather than averaging RGB equally.
    float lumaOf(vec3 color) {
      return dot(color, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec4 source = texture2D(tDiffuse, vUv);

      // ShaderPasses are cheaper to leave wired into the composer and bypass in
      // GLSL than to repeatedly rebuild the pass graph.
      if (uEnabled < 0.5) {
        gl_FragColor = source;
        return;
      }

      // One texel equals one pixel in UV units. At 1000 px wide, texel.x is
      // 0.001. Sampling vUv + texel * 2.0 reads two pixels away.
      vec2 texel = 1.0 / max(uResolution, vec2(1.0));
      vec3 color = source.rgb;
      float luma = lumaOf(color);
      float highlights = smoothstep(0.66, 0.98, luma);

      // A tiny diffusion blend softens scan harshness without making the frame
      // look blurred. Neighbor samples are alpha-weighted so the same shader can
      // be used on transparent subject overlays without darkening object edges.
      // This hand-written nine-tap blur is a small convolution kernel. A true
      // Gaussian blur may use more taps or two separable passes; nine taps are
      // sufficient because the requested diffusion is very low.
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
      // mix(original, blurred, amount) performs linear interpolation. Bright
      // regions receive slightly more diffusion than shadows.
      color = mix(color, soft, uDiffusion * (0.55 + highlights * 0.75));

      // Halation is not the same as bloom. Bloom spreads neutral light from
      // bright areas. Film halation is a warm/red fringe caused by light
      // scattering inside a film base. We sample a ring around the pixel, keep
      // only highlights, tint them warm, and add a very small amount.
      vec3 halo = vec3(0.0);
      float haloWeight = 0.0;
      for (int i = 0; i < 8; i += 1) {
        // 0.785398... is π/4, so eight iterations sample eight directions.
        float a = float(i) * 0.78539816339;
        vec2 direction = vec2(cos(a), sin(a));
        vec4 haloSample = texture2D(tDiffuse, vUv + direction * texel * 4.2);
        float bright = smoothstep(0.72, 1.0, lumaOf(haloSample.rgb)) * haloSample.a;
        halo += haloSample.rgb * bright;
        haloWeight += bright;
      }
      halo /= max(haloWeight, 1.0);
      color += halo * vec3(1.0, 0.56, 0.32) * uHalation * highlights;

      // Color grading stage:
      // - saturation interpolates between grayscale and RGB,
      // - contrast expands/compresses values around middle gray,
      // - black lift raises dark values,
      // - warmHighlights biases only bright pixels.
      luma = lumaOf(color);
      color = mix(vec3(luma), color, uSaturation);
      color = (color - 0.5) * uContrast + 0.5;
      color += uBlackLift * (1.0 - luma);
      color += vec3(1.0, 0.72, 0.44) * highlights * uWarmHighlights;

      // Two differently scaled noise fields reduce obvious repetition.
      // floor() groups pixels into tiny grain cells. Time changes their seed,
      // producing moving grain rather than a frozen screen-door texture.
      float grainA = hash(floor(vUv * vec2(820.0, 1180.0)) + uTime * 23.0);
      float grainB = hash(vUv * vec2(1620.0, 940.0) + uTime * 41.0);
      float grain = ((grainA * 0.68 + grainB * 0.32) - 0.5) * uFilmGrain;
      color += grain * (0.82 + luma * 0.22);

      // Vignette distance is measured from image center. dot(v,v) is squared
      // vector length and avoids the square root performed by length(v).
      vec2 centeredUv = vUv - 0.5;
      float edge = smoothstep(0.18, 0.78, dot(centeredUv, centeredUv) * 1.55);
      color *= 1.0 - edge * uVignette;

      // Preserve source alpha so this pass also works on subject-only render
      // targets. Clamp prevents later blending from receiving invalid ranges.
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), source.a);
    }
  `,
};

// ---------------------------------------------------------------------------
// INVISIBLE CITIES EDGE-FEATHER SHADER
// ---------------------------------------------------------------------------
// This pass softens the rectangular boundary of an offscreen layer. It changes
// alpha near the canvas edges while keeping the center untouched. The RGB lift
// in the feather band prevents semitransparent edges from looking dirty gray.
export const MEW_ALPHA_FEATHER_SHADER = {
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
      // At UV 0.5, distance to either edge is 0.5. At UV 0.01, the nearest
      // horizontal edge is 0.01. Taking the minimum of X/Y produces a rectangle
      // rather than a circular vignette.
      vec2 edgeDistance = min(vUv, 1.0 - vUv);
      float distanceToEdge = min(edgeDistance.x, edgeDistance.y);
      float edgeNoise =
        sin(vUv.x * 19.0 + vUv.y * 4.0) * 0.012 +
        sin(vUv.y * 15.0 - vUv.x * 6.0) * 0.008;
      float noisyDistanceToEdge = distanceToEdge + edgeNoise;
      // smoothstep(edge0, edge1, x) returns 0 below edge0, 1 above edge1,
      // and a smooth Hermite curve between. It is the workhorse for soft masks.
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

// ---------------------------------------------------------------------------
// IVORY OPTICAL-DISTORTION SHADER
// ---------------------------------------------------------------------------
// Instead of moving geometry, this shader offsets the UV used to sample the
// already-rendered image. That technique is commonly called a screen-space
// distortion, displacement, refraction, heat-haze, or lens warp.
export const IVORY_BACKGROUND_OPTICS_SHADER = {
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
        // GLSL loops generally require compile-time fixed bounds on broad WebGL
        // hardware. Four lobes are unrolled by the shader compiler.
        float fi = float(i);
        float cycle = uTime * uPulseSpeed / (5.8 + fi * 1.35) + fi * 8.73;
        // id changes once per pulse and reseeds its location. phase travels
        // continuously from 0..1 during that pulse.
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
        // Multiplying X by aspect makes a circular distance field remain round
        // on a wide viewport. axis then intentionally makes it elliptical.
        vec2 aspectDelta = (uv - center) * vec2(uAspect, 1.0) * axis;
        float distanceToLobe = length(aspectDelta);
        float falloff = smoothstep(radius, 0.0, distanceToLobe);

        vec2 radial = normalize(aspectDelta + vec2(0.0001));
        vec2 uvRadial = radial / vec2(uAspect, 1.0) / axis;
        float organicPulse = 0.72 + 0.28 * sin(phase * 6.2831853 + hash(vec2(id, fi + 23.0)) * 6.2831853);
        // We accumulate UV displacement, not RGB color. Positive/negative sign
        // alternates between bulging and pinching lens behavior.
        totalOffset += uvRadial * falloff * falloff * pulse * organicPulse * sign * uStrength;
        float lensEdge = pow(max(falloff * (1.0 - falloff), 0.0) * 4.0, 1.35);
        glassShade += lensEdge * pulse * 0.035;
        glassShade += falloff * pulse * sign * 0.008;
      }

      // Clamp avoids sampling outside the render target, where wrap mode could
      // create a bright seam or repeat the opposite side of the frame.
      vec2 sampleUv = clamp(uv - totalOffset, vec2(0.001), vec2(0.999));
      vec4 color = texture2D(tDiffuse, sampleUv);
      color.rgb += glassShade;
      gl_FragColor = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
    }
  `,
};
