import * as THREE from 'three';

import { ARMS_GLOW_SCALE } from '../../app/experienceConstants';
import type { ArmBloomController } from '../../app/experienceTypes';

export function createArmBloomController(targets: THREE.Object3D | THREE.Object3D[]): ArmBloomController {
  // Emissive light is a material property: it makes a surface appear to emit
  // its own light color. It does not illuminate nearby meshes. Bloom may then
  // spread sufficiently bright emissive pixels into a visible glow.
  const records: Array<{
    mesh: THREE.Mesh;
    originalMaterial: THREE.Material | THREE.Material[];
    glowMaterial: THREE.Material | THREE.Material[];
  }> = [];
  let glowAmount = 0;
  const glowTargets = Array.isArray(targets) ? targets : [targets];

  glowTargets.forEach((target) => {
    target.traverse((object) => {
      const mesh = object as THREE.Mesh;

      if (!mesh.isMesh || !mesh.material) {
        return;
      }

      const originalMaterial = mesh.material;
      const glowMaterial = Array.isArray(originalMaterial)
        ? originalMaterial.map((material) => createArmGlowMaterial(material))
        : createArmGlowMaterial(originalMaterial);

      mesh.material = glowMaterial;
      records.push({ mesh, originalMaterial, glowMaterial });
    });
  });

  return {
    update: (activity: number) => {
      glowAmount = THREE.MathUtils.lerp(glowAmount, activity, 0.18);
      const intensity = glowAmount * ARMS_GLOW_SCALE;

      records.forEach((record) => {
        const materials = Array.isArray(record.glowMaterial) ? record.glowMaterial : [record.glowMaterial];
        materials.forEach((material) => updateArmGlowMaterial(material, intensity));
      });
    },
    dispose: () => {
      records.forEach((record) => {
        record.mesh.material = record.originalMaterial;
        const materials = Array.isArray(record.glowMaterial) ? record.glowMaterial : [record.glowMaterial];
        materials.forEach((material) => material.dispose());
      });
    },
  };
}

function createArmGlowMaterial(sourceMaterial: THREE.Material): THREE.Material {
  const material = sourceMaterial.clone();
  updateArmGlowMaterial(material, 0);
  material.needsUpdate = true;
  return material;
}

function updateArmGlowMaterial(material: THREE.Material, intensity: number) {
  const emissiveMaterial = material as THREE.MeshStandardMaterial;

  if (!emissiveMaterial.emissive || emissiveMaterial.emissiveIntensity === undefined) {
    return;
  }

  emissiveMaterial.emissive.set(0xf4efe5);
  emissiveMaterial.emissiveIntensity = intensity;
}
