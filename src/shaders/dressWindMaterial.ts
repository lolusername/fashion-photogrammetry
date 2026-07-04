import * as THREE from 'three';

export type DressWindSettings = {
  windStrength: number;
  fabricLooseness: number;
  flutter: number;
  gustRadius: number;
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

export type DressWindController = {
  update: (input: DressWindUpdate) => void;
  dispose: () => void;
};

type WindSharedUniforms = {
  uWindTime: THREE.IUniform<number>;
  uWindVector: THREE.IUniform<THREE.Vector3>;
  uGustCenter: THREE.IUniform<THREE.Vector2>;
  uWindActivity: THREE.IUniform<number>;
  uWindStrength: THREE.IUniform<number>;
  uFabricLooseness: THREE.IUniform<number>;
  uFlutter: THREE.IUniform<number>;
  uGustRadius: THREE.IUniform<number>;
};

type GeometryBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

type PatchedMeshRecord = {
  mesh: THREE.Mesh;
  originalMaterial: THREE.Material | THREE.Material[];
  originalDepthMaterial?: THREE.Material;
  patchedMaterial: THREE.Material | THREE.Material[];
  depthMaterial: THREE.MeshDepthMaterial;
};

type FabricMaterial = THREE.Material & {
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

    const bounds = readDressBoundsForMesh(mesh, dressWorldBounds);
    const originalMaterial = mesh.material;
    const originalDepthMaterial = mesh.customDepthMaterial;
    const patchedMaterial = Array.isArray(originalMaterial)
      ? originalMaterial.map((material) => createWindMaterial(material, uniforms, bounds))
      : createWindMaterial(originalMaterial, uniforms, bounds);
    const depthMaterial = createWindDepthMaterial(uniforms, bounds);

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
  const worldToMeshLocal = mesh.matrixWorld.clone().invert();
  const min = dressWorldBounds.min;
  const max = dressWorldBounds.max;
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
  patchWindMaterial(material, sharedUniforms, boundsUniforms, 'dress-wind-material-v8');
  material.needsUpdate = true;

  return material;
}

function makeDressMaterialMatte(material: THREE.Material) {
  const fabricMaterial = material as FabricMaterial;

  if (fabricMaterial.roughness !== undefined) {
    fabricMaterial.roughness = 0.96;
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
  patchWindMaterial(material, sharedUniforms, boundsUniforms, 'dress-wind-depth-v7');
  material.needsUpdate = true;

  return material;
}

function patchWindMaterial(
  material: THREE.Material,
  sharedUniforms: WindSharedUniforms,
  boundsUniforms: Record<string, THREE.IUniform<number>>,
  cacheKey: string,
) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedUniforms, boundsUniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `${windUniformsChunk}\n#include <common>`);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      transformed += getDressWindOffset(position, normal);`,
    );
  };
  material.customProgramCacheKey = () => cacheKey;
}

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

float dressWindSaturate(float value) {
  return clamp(value, 0.0, 1.0);
}

vec3 getDressWindOffset(vec3 localPosition, vec3 localNormal) {
  float width = max(0.0001, uBoundsMaxX - uBoundsMinX);
  float height = max(0.0001, uBoundsMaxY - uBoundsMinY);
  float depth = max(0.0001, uBoundsMaxZ - uBoundsMinZ);
  float height01 = dressWindSaturate((localPosition.y - uBoundsMinY) / height);
  float centerX = (uBoundsMinX + uBoundsMaxX) * 0.5;
  float centerZ = (uBoundsMinZ + uBoundsMaxZ) * 0.5;
  float side01 = abs(localPosition.x - centerX) / (width * 0.5);
  float depth01 = abs(localPosition.z - centerZ) / (depth * 0.5);

  // This is dress vertex motion, not a camera-image lens warp. The material is
  // applied only to the GLB's "dress" node, so the marble arms keep their solid
  // surface and the studio/background stay perfectly stable.
  float edgeRelease = smoothstep(0.12, 0.9, max(side01, depth01));
  vec2 localDressUv = vec2((localPosition.x - uBoundsMinX) / width, height01);
  float gustDistance = length((localDressUv - uGustCenter) * vec2(1.35, 1.0));
  float gustMask = smoothstep(uGustRadius, 0.0, gustDistance);

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
  float windEnergy = dressWindSaturate(length(wind));
  vec3 windDirection = normalize(wind + vec3(0.0001, 0.0, 0.0001));
  windDirection.y *= 0.42;

  float time = uWindTime;
  vec2 planarWind = normalize(wind.xz + vec2(0.0001, 0.0001));
  float travelingPhase = dot(vec2(localPosition.x, localPosition.z), planarWind) * 5.2 + localPosition.y * 4.7;
  float broadFold = sin(travelingPhase - time * (1.55 + windEnergy * 1.2));
  float crossFold = sin(localPosition.y * 8.6 + localPosition.x * 3.4 + time * (2.25 + windEnergy * 1.45));
  float fineFold = sin((localPosition.x - localPosition.z) * 14.0 - time * 3.35);
  float clothWave = broadFold * 0.58 + crossFold * 0.29 + fineFold * 0.13;

  float amplitude = height * uWindStrength * uWindActivity;
  vec3 streamPush = windDirection * amplitude * clothMask * (0.5 + windEnergy * 0.5) * uFabricLooseness;
  vec3 surfaceFlutter = localNormal * clothWave * amplitude * clothMask * uFlutter * (0.22 + windEnergy * 0.68);

  return streamPush + surfaceFlutter;
}
`;
