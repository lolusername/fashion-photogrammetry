import * as THREE from 'three';

import type { GhostDressRecord } from '../app/experienceTypes';

type MaterialFadeState = {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
};

const materialFadeStates = new WeakMap<THREE.Material, MaterialFadeState>();

export class ResourceTracker {
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textures = new Set<THREE.Texture>();

  trackGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  trackMaterial<T extends THREE.Material>(material: T): T {
    this.materials.add(material);
    return material;
  }

  trackTexture<T extends THREE.Texture>(texture: T): T {
    this.textures.add(texture);
    return texture;
  }

  dispose() {
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.textures.forEach((texture) => texture.dispose());
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
  }
}

export function setObjectOpacity(root: THREE.Object3D, opacity: number) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) {
      return;
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => setMaterialOpacity(material, opacity));
  });
}

function setMaterialOpacity(material: THREE.Material, opacity: number) {
  let original = materialFadeStates.get(material);

  if (!original) {
    original = {
      opacity: material.opacity,
      transparent: material.transparent,
      depthWrite: material.depthWrite,
    };
    materialFadeStates.set(material, original);
  }

  if (opacity >= 0.999) {
    material.opacity = original.opacity;
    material.transparent = original.transparent;
    material.depthWrite = original.depthWrite;
  } else {
    material.opacity = original.opacity * opacity;
    material.transparent = true;
    material.depthWrite = false;
  }

  material.needsUpdate = true;
}

export function disposeGhostDressRecord(record: GhostDressRecord) {
  record.root.removeFromParent();
  disposeObjectResources(record.root, { disposeMaterials: false });
  record.material.dispose();
  record.fillMaterial.dispose();
  record.wireMaterial.dispose();
}

export function disposeObjectResources(
  root: THREE.Object3D,
  options: { disposeMaterials?: boolean } = {},
) {
  const disposeMaterials = options.disposeMaterials ?? true;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }

    if (mesh.geometry) {
      geometries.add(mesh.geometry);
    }

    if (mesh.material) {
      const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      meshMaterials.forEach((material) => {
        materials.add(material);
        collectMaterialTextures(material, textures);
      });
    }
  });

  geometries.forEach((geometry) => geometry.dispose());
  if (disposeMaterials) {
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
  }
}

export function collectMaterialTextures(
  material: THREE.Material,
  textures: Set<THREE.Texture>,
) {
  Object.values(material).forEach((value) => {
    if (value && typeof value === 'object' && 'isTexture' in value && value.isTexture === true) {
      textures.add(value as THREE.Texture);
    }
  });
}
