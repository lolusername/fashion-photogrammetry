import * as THREE from 'three';

/**
 * DRESS WIND: PATCHING A BUILT-IN MATERIAL'S VERTEX SHADER
 * ========================================================
 *
 * The goal is to move fabric vertices while preserving the GLB's original
 * textures and Three.js's physically based lighting. Replacing the material
 * with a raw ShaderMaterial would require reimplementing skinning, texture maps,
 * lights, fog, tone mapping, and many material features.
 *
 * Instead, `onBeforeCompile` modifies Three.js's generated vertex shader:
 *
 *   built-in transformed vertex
 *               +
 *   getDressWindOffset(position, normal)
 *               =
 *   final displaced vertex
 *
 * This is vertex displacement, not a 2D post effect. The silhouette and surface
 * genuinely move before projection. Pixel count does not change the simulation;
 * mesh vertex density does. A very low-poly dress cannot form detailed folds
 * because the shader has too few vertices to move.
 *
 * CPU/GPU responsibility split:
 *
 * CPU (TypeScript)
 * - listens to pointer input elsewhere,
 * - computes smoothed wind/activity values,
 * - uploads them as uniforms,
 * - installs/restores patched materials.
 *
 * GPU (GLSL)
 * - runs the displacement function independently for every vertex,
 * - derives masks from each vertex's local position,
 * - combines broad and fine sine waves,
 * - returns a local-space offset.
 *
 * The same deformation is installed into a MeshDepthMaterial. If shadow maps
 * are enabled later, the depth/shadow silhouette must use the displaced
 * vertices too; otherwise the rendered cloth and its shadow disagree.
 */

export type DressWindSettings = {
  // Art-direction amplitude in normalized model units.
  windStrength: number;
  // Multiplier for the directional stream push.
  fabricLooseness: number;
  // Multiplier for normal-direction high-frequency ripples.
  flutter: number;
  // Radius of the local cursor gust in normalized dress coordinates.
  gustRadius: number;
  // CPU-side input smoothing/decay rates.
  followSpeed: number;
  fadeSpeed: number;
  freezeTime: boolean;
};

export type DressWindUpdate = {
  time: number;
  windVector: THREE.Vector3;
  gustCenter: THREE.Vector2;
  activity: number;
  strength: number;
  fabricLooseness: number;
  flutter: number;
  gustRadius: number;
};

export type DressMaterialGrainUpdate = {
  time: number;
  resolutionWidth: number;
  resolutionHeight: number;
  filmGrain: number;
};

export type DressWindController = {
  update: (input: DressWindUpdate) => void;
  dispose: () => void;
};

type WindSharedUniforms = {
  // Uniform wrapper objects are shared by every patched dress material. Updating
  // one `.value` therefore updates all mesh sections without rebuilding shaders.
  uWindTime: THREE.IUniform<number>;
  uWindVector: THREE.IUniform<THREE.Vector3>;
  uGustCenter: THREE.IUniform<THREE.Vector2>;
  uWindActivity: THREE.IUniform<number>;
  uWindStrength: THREE.IUniform<number>;
  uFabricLooseness: THREE.IUniform<number>;
  uFlutter: THREE.IUniform<number>;
  uGustRadius: THREE.IUniform<number>;
};

type DressMaterialGrainUniforms = {
  uDressGrainTime: THREE.IUniform<number>;
  uDressGrainResolution: THREE.IUniform<THREE.Vector2>;
  uDressFilmGrain: THREE.IUniform<number>;
};

const dressMaterialGrainUniforms: DressMaterialGrainUniforms = {
  uDressGrainTime: { value: 0 },
  uDressGrainResolution: { value: new THREE.Vector2(1, 1) },
  uDressFilmGrain: { value: 0 },
};

export function syncDressMaterialGrain(input: DressMaterialGrainUpdate) {
  dressMaterialGrainUniforms.uDressGrainTime.value = input.time;
  dressMaterialGrainUniforms.uDressGrainResolution.value.set(
    Math.max(1, input.resolutionWidth),
    Math.max(1, input.resolutionHeight),
  );
  dressMaterialGrainUniforms.uDressFilmGrain.value = input.filmGrain;
}


type GeometryBounds = {
  // Local-space bounds normalize arbitrary mesh coordinates to stable 0..1
  // masks inside the shader.
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

type PatchedMeshRecord = {
  // Keep original ownership so dispose() can restore the GLB exactly.
  mesh: THREE.Mesh;
  originalMaterial: THREE.Material | THREE.Material[];
  originalDepthMaterial?: THREE.Material;
  patchedMaterial: THREE.Material | THREE.Material[];
  depthMaterial: THREE.MeshDepthMaterial;
};

type FabricMaterial = THREE.Material & {
  // Three.js has several PBR material subclasses. This structural type exposes
  // optional fabric-relevant properties without falsely claiming every source
  // material implements all of them.
  roughness?: number;
  roughnessMap?: THREE.Texture | null;
  metalness?: number;
  metalnessMap?: THREE.Texture | null;
  envMapIntensity?: number;
  clearcoat?: number;
  clearcoatMap?: THREE.Texture | null;
  clearcoatRoughness?: number;
  clearcoatRoughnessMap?: THREE.Texture | null;
  sheen?: number;
  sheenRoughness?: number;
  specularIntensity?: number;
  specularIntensityMap?: THREE.Texture | null;
  reflectivity?: number;
  ior?: number;
  normalScale?: THREE.Vector2;
};

export const DRESS_WIND_PRESETS: Record<'editorial' | 'quiet', DressWindSettings> = {
  // Presets are semantic starting points. Keeping them as data makes them usable
  // by both runtime tuning code and initialization code.
  editorial: {
    windStrength: 0.072,
    fabricLooseness: 0.82,
    flutter: 0.38,
    gustRadius: 0.36,
    followSpeed: 16,
    fadeSpeed: 4.6,
    freezeTime: false,
  },
  quiet: {
    windStrength: 0.026,
    fabricLooseness: 0.62,
    flutter: 0.22,
    gustRadius: 0.28,
    followSpeed: 12,
    fadeSpeed: 5.8,
    freezeTime: false,
  },
};

export function createDressWindController(dress: THREE.Object3D): DressWindController {
  // Matrix/world-bound calculation must happen before patching because each
  // mesh needs a stable normalization frame for its vertex masks.
  dress.updateMatrixWorld(true);
  const dressWorldBounds = new THREE.Box3().setFromObject(dress);
  const uniforms: WindSharedUniforms = {
    uWindTime: { value: 0 },
    uWindVector: { value: new THREE.Vector3() },
    uGustCenter: { value: new THREE.Vector2(0.5, 0.42) },
    uWindActivity: { value: 0 },
    uWindStrength: { value: DRESS_WIND_PRESETS.editorial.windStrength },
    uFabricLooseness: { value: DRESS_WIND_PRESETS.editorial.fabricLooseness },
    uFlutter: { value: DRESS_WIND_PRESETS.editorial.flutter },
    uGustRadius: { value: DRESS_WIND_PRESETS.editorial.gustRadius },
  };
  const records: PatchedMeshRecord[] = [];
  let disposed = false;

  dress.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (!mesh.isMesh || !mesh.geometry || !mesh.material) {
      return;
    }

    // Bounds are expressed in this specific mesh's local coordinates, matching
    // the `position` attribute that its vertex shader receives.
    const bounds = readDressBoundsForMesh(mesh, dressWorldBounds);
    const originalMaterial = mesh.material;
    const originalDepthMaterial = mesh.customDepthMaterial;
    const patchedMaterial = Array.isArray(originalMaterial)
      ? originalMaterial.map((material) => createWindMaterial(material, uniforms, bounds))
      : createWindMaterial(originalMaterial, uniforms, bounds);
    const depthMaterial = createWindDepthMaterial(uniforms, bounds);

    // Material replacement affects future draws immediately. The original
    // objects are retained in the record for deterministic cleanup.
    mesh.material = patchedMaterial;
    mesh.customDepthMaterial = depthMaterial;
    records.push({
      mesh,
      originalMaterial,
      originalDepthMaterial,
      patchedMaterial,
      depthMaterial,
    });
  });

  return {
    update: (input: DressWindUpdate) => {
      // `.copy` mutates existing Vector objects. Replacing the uniform wrapper
      // itself would break the reference captured by compiled shader programs.
      uniforms.uWindTime.value = input.time;
      uniforms.uWindVector.value.copy(input.windVector);
      uniforms.uGustCenter.value.copy(input.gustCenter);
      uniforms.uWindActivity.value = THREE.MathUtils.clamp(input.activity, 0, 1);
      uniforms.uWindStrength.value = input.strength;
      uniforms.uFabricLooseness.value = input.fabricLooseness;
      uniforms.uFlutter.value = input.flutter;
      uniforms.uGustRadius.value = input.gustRadius;
    },
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      records.forEach((record) => {
        // Restore before disposing patched resources so the mesh never points at
        // an invalid material during theme/dress transitions.
        record.mesh.material = record.originalMaterial;
        record.mesh.customDepthMaterial = record.originalDepthMaterial;
        const patchedMaterials = Array.isArray(record.patchedMaterial)
          ? record.patchedMaterial
          : [record.patchedMaterial];
        patchedMaterials.forEach((material) => material.dispose());
        record.depthMaterial.dispose();
      });
    },
  };
}

function readGeometryBounds(geometry: THREE.BufferGeometry): GeometryBounds {
  if (!geometry.boundingBox) {
    // BufferGeometry does not always compute bounds automatically because large
    // vertex scans have a cost. Compute lazily only when needed.
    geometry.computeBoundingBox();
  }

  const bounds = geometry.boundingBox;

  if (!bounds) {
    return {
      minX: -0.5,
      maxX: 0.5,
      minY: 0,
      maxY: 1,
      minZ: -0.5,
      maxZ: 0.5,
    };
  }

  return {
    minX: bounds.min.x,
    maxX: bounds.max.x,
    minY: bounds.min.y,
    maxY: bounds.max.y,
    minZ: bounds.min.z,
    maxZ: bounds.max.z,
  };
}

function readDressBoundsForMesh(mesh: THREE.Mesh, dressWorldBounds: THREE.Box3): GeometryBounds {
  if (dressWorldBounds.isEmpty()) {
    return readGeometryBounds(mesh.geometry);
  }

  const localBounds = new THREE.Box3();
  // matrixWorld maps local → world. Its inverse maps world → local.
  const worldToMeshLocal = mesh.matrixWorld.clone().invert();
  const min = dressWorldBounds.min;
  const max = dressWorldBounds.max;
  // An axis-aligned box has eight corners. Transforming only min/max would be
  // wrong when the mesh is rotated; all eight corners must be considered.
  const corners = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];

  corners.forEach((corner) => {
    // applyMatrix4 mutates each temporary corner into mesh-local coordinates.
    localBounds.expandByPoint(corner.applyMatrix4(worldToMeshLocal));
  });

  if (localBounds.isEmpty()) {
    return readGeometryBounds(mesh.geometry);
  }

  return {
    minX: localBounds.min.x,
    maxX: localBounds.max.x,
    minY: localBounds.min.y,
    maxY: localBounds.max.y,
    minZ: localBounds.min.z,
    maxZ: localBounds.max.z,
  };
}

function createWindMaterial(
  sourceMaterial: THREE.Material,
  sharedUniforms: WindSharedUniforms,
  bounds: GeometryBounds,
): THREE.Material {
  // Clone rather than mutate the source: thumbnails, ghosts, cached records, or
  // another dress instance may still use the original material.
  const material = sourceMaterial.clone();
  const boundsUniforms = {
    uBoundsMinX: { value: bounds.minX },
    uBoundsMaxX: { value: bounds.maxX },
    uBoundsMinY: { value: bounds.minY },
    uBoundsMaxY: { value: bounds.maxY },
    uBoundsMinZ: { value: bounds.minZ },
    uBoundsMaxZ: { value: bounds.maxZ },
  };

  material.name = sourceMaterial.name ? `${sourceMaterial.name} wind` : 'dress wind';
  makeDressMaterialMatte(material);
  patchWindMaterial(material, sharedUniforms, boundsUniforms, 'dress-wind-material-v10', true);
  material.needsUpdate = true;

  return material;
}

function makeDressMaterialMatte(material: THREE.Material) {
  // PBR MATERIAL VOCABULARY
  // -----------------------
  // roughness: micro-surface scatter. High = broad/dim reflection.
  // metalness: whether base color behaves as metallic reflectance. Fabric = 0.
  // envMapIntensity: strength of image-based environment reflection.
  // clearcoat: a second glossy dielectric layer, useful for varnish/car paint.
  // specularIntensity/reflectivity/IOR: dielectric highlight energy controls.
  // sheen: grazing-angle cloth/fuzz reflection.
  // normalScale: strength of normal-map bump detail.
  //
  // The original scans contain material values that can read as lacquered under
  // the studio/environment. These overrides retain color/texture while forcing
  // a diffuse textile response.
  const fabricMaterial = material as FabricMaterial;

  if (fabricMaterial.roughness !== undefined) {
    // Roughness near 1 spreads reflections so widely that they read as diffuse
    // illumination rather than small harsh shine.
    fabricMaterial.roughness = 0.96;
    // A roughness map would modulate/override the scalar and reintroduce glossy
    // zones, so remove it for uniform matte behavior.
    fabricMaterial.roughnessMap = null;
  }

  if (fabricMaterial.metalness !== undefined) {
    fabricMaterial.metalness = 0;
    fabricMaterial.metalnessMap = null;
  }

  if (fabricMaterial.envMapIntensity !== undefined) {
    fabricMaterial.envMapIntensity = 0.035;
  }

  if (fabricMaterial.clearcoat !== undefined) {
    fabricMaterial.clearcoat = 0;
    fabricMaterial.clearcoatMap = null;
    fabricMaterial.clearcoatRoughness = 1;
    fabricMaterial.clearcoatRoughnessMap = null;
  }

  if (fabricMaterial.specularIntensity !== undefined) {
    fabricMaterial.specularIntensity = 0.12;
    fabricMaterial.specularIntensityMap = null;
  }

  if (fabricMaterial.sheen !== undefined) {
    fabricMaterial.sheen = 0.08;
    fabricMaterial.sheenRoughness = 1;
  }

  if (fabricMaterial.reflectivity !== undefined) {
    fabricMaterial.reflectivity = 0.04;
  }

  if (fabricMaterial.ior !== undefined) {
    fabricMaterial.ior = 1.28;
  }

  fabricMaterial.normalScale?.multiplyScalar(0.58);
}

function createWindDepthMaterial(
  sharedUniforms: WindSharedUniforms,
  bounds: GeometryBounds,
): THREE.MeshDepthMaterial {
  // Depth material writes distance rather than visible RGB. Shadow mapping and
  // some post effects render this alternate pass. It must share vertex motion.
  const material = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  });
  const boundsUniforms = {
    uBoundsMinX: { value: bounds.minX },
    uBoundsMaxX: { value: bounds.maxX },
    uBoundsMinY: { value: bounds.minY },
    uBoundsMaxY: { value: bounds.maxY },
    uBoundsMinZ: { value: bounds.minZ },
    uBoundsMaxZ: { value: bounds.maxZ },
  };

  material.name = 'dress wind shadow';
  patchWindMaterial(material, sharedUniforms, boundsUniforms, 'dress-wind-depth-v7', false);
  material.needsUpdate = true;

  return material;
}

function patchWindMaterial(
  material: THREE.Material,
  sharedUniforms: WindSharedUniforms,
  boundsUniforms: Record<string, THREE.IUniform<number>>,
  cacheKey: string,
  includeDressMaterialGrain: boolean,
) {
  // onBeforeCompile runs when Three.js is about to compile a generated shader.
  // It is not called every frame. Uniform values can still change every frame.
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedUniforms, boundsUniforms);
    if (includeDressMaterialGrain) {
      Object.assign(shader.uniforms, dressMaterialGrainUniforms);
    }
    // Inject uniform/function declarations next to Three.js's common chunk.
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `${windUniformsChunk}
#include <common>`);
    if (includeDressMaterialGrain) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
${dressMaterialGrainChunk}`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `${dressMaterialGrainApplyChunk}
#include <dithering_fragment>`,
      );
    }
    // `transformed` is Three.js's working local-space vertex. Adding our offset
    // here occurs before later skinning/projection chunks complete the pipeline.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      transformed += getDressWindOffset(position, normal);`,
    );
  };
  // Three.js caches GPU programs by material/shader parameters. A stable custom
  // key tells the cache that this patched source differs from the built-in one.
  material.customProgramCacheKey = () => cacheKey;
}
// Everything inside these strings is GLSL, compiled by the GPU driver rather than
// TypeScript. Avoid JavaScript template-string delimiters inside GLSL comments.
const dressMaterialGrainChunk = `
uniform float uDressGrainTime;
uniform vec2 uDressGrainResolution;
uniform float uDressFilmGrain;

float dressGrainHash(vec2 value) {
  return fract(sin(dot(value, vec2(12.9898, 78.233))) * 43758.5453123);
}

float dressGrainLuma(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}
`;

const dressMaterialGrainApplyChunk = `
float dressGrainLuminance = dressGrainLuma(gl_FragColor.rgb);
vec2 dressGrainUv = gl_FragCoord.xy / max(uDressGrainResolution, vec2(1.0));
float dressGrainA = dressGrainHash(floor(dressGrainUv * vec2(820.0, 1180.0)) + uDressGrainTime * 23.0);
float dressGrainB = dressGrainHash(dressGrainUv * vec2(1620.0, 940.0) + uDressGrainTime * 41.0);
float dressGrain = ((dressGrainA * 0.68 + dressGrainB * 0.32) - 0.5) * uDressFilmGrain;
gl_FragColor.rgb = clamp(gl_FragColor.rgb + dressGrain * (0.82 + dressGrainLuminance * 0.22), 0.0, 1.0);
`;

const windUniformsChunk = `
uniform float uWindTime;
uniform vec3 uWindVector;
uniform vec2 uGustCenter;
uniform float uWindActivity;
uniform float uWindStrength;
uniform float uFabricLooseness;
uniform float uFlutter;
uniform float uGustRadius;
uniform float uBoundsMinX;
uniform float uBoundsMaxX;
uniform float uBoundsMinY;
uniform float uBoundsMaxY;
uniform float uBoundsMinZ;
uniform float uBoundsMaxZ;

// GLSL helper equivalent to clamping a control signal into a legal mask range.
float dressWindSaturate(float value) {
  return clamp(value, 0.0, 1.0);
}

vec3 getDressWindOffset(vec3 localPosition, vec3 localNormal) {
  // Never divide by zero. Degenerate bounds receive a tiny safe dimension.
  float width = max(0.0001, uBoundsMaxX - uBoundsMinX);
  float height = max(0.0001, uBoundsMaxY - uBoundsMinY);
  float depth = max(0.0001, uBoundsMaxZ - uBoundsMinZ);

  // Normalize local height to 0 at the garment bottom and 1 at its top.
  float height01 = dressWindSaturate((localPosition.y - uBoundsMinY) / height);
  float centerX = (uBoundsMinX + uBoundsMaxX) * 0.5;
  float centerZ = (uBoundsMinZ + uBoundsMaxZ) * 0.5;

  // side01 and depth01 are 0 near the central axis and approach 1 near edges.
  float side01 = abs(localPosition.x - centerX) / (width * 0.5);
  float depth01 = abs(localPosition.z - centerZ) / (depth * 0.5);

  // This is dress vertex motion, not a camera-image lens warp. The material is
  // applied only to the GLB's "dress" node, so the marble arms keep their solid
  // surface and the studio/background stay perfectly stable.
  float edgeRelease = smoothstep(0.12, 0.9, max(side01, depth01));

  // Convert local dress position into a simple 2D 0..1 parameterization. This
  // is not the mesh texture UV; it is a stable interaction coordinate based on
  // spatial bounds, so differently unwrapped meshes behave consistently.
  vec2 localDressUv = vec2((localPosition.x - uBoundsMinX) / width, height01);
  float gustDistance = length((localDressUv - uGustCenter) * vec2(1.35, 1.0));
  // smoothstep with reversed edges creates 1 inside the radius and 0 outside.
  float gustMask = smoothstep(uGustRadius, 0.0, gustDistance);

  // Lower fabric is freer. The middle side regions near marble hands receive a
  // guard so animated cloth does not separate into a dark-looking contact gap.
  float lowerBodyRelease = smoothstep(0.22, 0.78, 1.0 - height01);
  float handHeightBand = smoothstep(0.26, 0.46, height01) * (1.0 - smoothstep(0.66, 0.82, height01));
  float sideContactGuard = 1.0 - smoothstep(0.52, 0.88, side01) * handHeightBand * 0.78;
  float lowerClothMask = lowerBodyRelease * (0.34 + edgeRelease * 0.66) * sideContactGuard;

  // The bodice needs a hint of wind, but the armhole edges cannot chase the
  // rigid marble arms or the contact line reads as a black shadow artifact.
  float upperBand = smoothstep(0.42, 0.70, height01) * (1.0 - smoothstep(0.92, 1.0, height01));
  float centerBodice = (1.0 - smoothstep(0.18, 0.54, side01)) * (1.0 - smoothstep(0.35, 0.82, depth01));
  float upperClothMask = upperBand * centerBodice * 0.09;

  float clothMask = (lowerClothMask + upperClothMask) * (0.24 + gustMask * 0.76);

  vec3 wind = uWindVector;
  // Vector length is speed/energy; normalized vector is direction.
  float windEnergy = dressWindSaturate(length(wind));
  // The epsilon prevents normalize(vec3(0)) from producing undefined values.
  vec3 windDirection = normalize(wind + vec3(0.0001, 0.0, 0.0001));
  windDirection.y *= 0.42;

  float time = uWindTime;
  vec2 planarWind = normalize(wind.xz + vec2(0.0001, 0.0001));
  // A traveling sine wave uses spatial phase minus temporal phase. Taking the
  // dot product with wind direction aligns wave travel to the current gust.
  float travelingPhase = dot(vec2(localPosition.x, localPosition.z), planarWind) * 5.2 + localPosition.y * 4.7;

  // Layering several frequencies avoids one perfectly regular rubbery wave:
  // broadFold establishes silhouette movement,
  // crossFold breaks symmetry,
  // fineFold adds high-frequency surface flutter.
  float broadFold = sin(travelingPhase - time * (1.55 + windEnergy * 1.2));
  float crossFold = sin(localPosition.y * 8.6 + localPosition.x * 3.4 + time * (2.25 + windEnergy * 1.45));
  float fineFold = sin((localPosition.x - localPosition.z) * 14.0 - time * 3.35);
  float clothWave = broadFold * 0.58 + crossFold * 0.29 + fineFold * 0.13;

  // Multiplying by model height makes wind strength proportional across assets.
  // Activity fades the entire result to exactly zero when interaction stops.
  float amplitude = height * uWindStrength * uWindActivity;

  // streamPush moves with wind direction; surfaceFlutter moves along the local
  // normal, which changes the visible fabric contour and highlight response.
  vec3 streamPush = windDirection * amplitude * clothMask * (0.5 + windEnergy * 0.5) * uFabricLooseness;
  vec3 surfaceFlutter = localNormal * clothWave * amplitude * clothMask * uFlutter * (0.22 + windEnergy * 0.68);

  // This local-space offset is added to Three.js's transformed vertex.
  return streamPush + surfaceFlutter;
}
`;
