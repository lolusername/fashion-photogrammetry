import * as THREE from 'three';

import type { InfiniteBackdropUniforms } from '../../app/experienceTypes';

export function createInfiniteBackdropMaterial(uniforms: InfiniteBackdropUniforms) {
  // One ShaderMaterial serves several themes. `uBackdropMode` selects a branch
  // in the fragment shader. Reusing one material avoids shader recompilation
  // during theme switches and keeps every background on the same full-screen
  // camera-attached plane.
  return new THREE.ShaderMaterial({
    uniforms: uniforms,
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

      // These small helper functions are reusable shader building blocks.
      // hash() creates repeatable noise from coordinates.
      float hash(vec2 value) {
        return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float softBlob(vec2 uv, vec2 center, vec2 scale, float radius, float feather) {
        // This is a signed-distance-style mask. Scaling the delta makes an
        // ellipse; smoothstep converts distance into a feathered 1→0 field.
        return smoothstep(radius + feather, radius - feather, length((uv - center) * scale));
      }

      float lineDistance(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a;
        vec2 ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h);
      }

      vec3 screenBlend(vec3 base, vec3 blend) {
        // Screen blend is the inverse-multiply formula used in image editors.
        // It can only brighten, making it useful for faded projected color.
        return 1.0 - (1.0 - base) * (1.0 - blend);
      }

      vec2 coverUv(vec2 uv, float imageAspect, float surfaceAspect) {
        // Equivalent to CSS background-size: cover: crop one axis while
        // preserving image proportions. Stretching would distort the archive.
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

        // Use a portrait source on narrow canvases so the crop retains useful
        // content rather than throwing away most of a wide photograph.
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

        // The custom ShaderMaterial bypasses some automatic built-in material
        // color conversion, so explicitly decode sRGB texture values to linear
        // light before mixing them.
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
        // Warping UV before evaluating color fields makes their boundaries feel
        // fluid. The actual screen geometry never moves.
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

        // Quantizing UV into a fine grid creates stable grain cells. Slowly
        // translating the seed makes them drift.
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

        // Float thresholds emulate an enum:
        // 0 = Dialectic blue
        // 1 = Invisible Cities color field
        // 2 = Signal black
        // 3 = Wind Archive paper
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
    // This camera-attached plane is a background compositing layer, not an
    // occluding 3D object, so it neither tests nor writes the depth buffer.
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
}
