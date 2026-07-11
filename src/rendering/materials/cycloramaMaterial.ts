import * as THREE from 'three';

import type { CycloramaBackgroundUniforms } from '../../app/experienceTypes';

export function patchCycloramaBackgroundMaterial(
  material: THREE.Material,
  uniforms: CycloramaBackgroundUniforms,
) {
  // `onBeforeCompile` is an advanced middle ground between built-in materials
  // and writing a complete ShaderMaterial. Three.js first generates its normal
  // MeshStandard/Basic shader; this callback injects uniforms and replaces
  // selected `#include` chunks. We retain built-in lighting/fog/tone behavior
  // while adding custom theme color.
  material.onBeforeCompile = (shader) => {
    // Uniform objects are shared, so changing their `.value` later updates every
    // material compiled with this patch.
    Object.assign(shader.uniforms, uniforms);
    // String replacement depends on stable Three.js shader chunk names. After a
    // major Three.js upgrade, verify these anchors still exist.
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
