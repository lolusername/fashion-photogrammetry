import * as THREE from 'three';

import { TABLA_RASA_ACCENT_COLORS } from '../../app/experienceConstants';
import type { PaletteMaterial } from '../../app/experienceTypes';
import type { CycloramaBackgroundPresetId } from '../../config/themes';
import { ResourceTracker } from '../resourceTracker';

export class HoloMaterialFactory {
  private readonly resources: ResourceTracker;
  private readonly renderer: THREE.WebGLRenderer;

  constructor(
    resources: ResourceTracker,
    renderer: THREE.WebGLRenderer,
  ) {
    this.resources = resources;
    this.renderer = renderer;
  }

  rememberPaletteMaterial<T extends THREE.Material>(
    material: T,
    color: number,
    opacity = material.opacity,
  ) {
    const paletteMaterial = material as PaletteMaterial;
    material.userData.holoPalette = {
      color,
      opacity,
      roughness: paletteMaterial.roughness,
      clearcoat: paletteMaterial.clearcoat,
      clearcoatRoughness: paletteMaterial.clearcoatRoughness,
      envMapIntensity: paletteMaterial.envMapIntensity,
      iridescence: paletteMaterial.iridescence,
    };
  
    return material;
  }

  applyAccentPalette(
      holoAccentGroup: THREE.Group | null,
      presetId: CycloramaBackgroundPresetId,
    ) {
    if (!holoAccentGroup) {
      return;
    }
  
    const monochrome = presetId === 'tabla-rasa';
    const seenMaterials = new Set<string>();
    let monochromeIndex = 0;
  
    holoAccentGroup.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }
  
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((sourceMaterial) => {
        const material = sourceMaterial as PaletteMaterial;
        const base = material.userData.holoPalette as
          | {
              color: number;
              opacity: number;
              roughness?: number;
              clearcoat?: number;
              clearcoatRoughness?: number;
              envMapIntensity?: number;
              iridescence?: number;
            }
          | undefined;
  
        if (!base || seenMaterials.has(material.uuid)) {
          return;
        }
  
        seenMaterials.add(material.uuid);
  
        if (monochrome) {
          material.color?.setHex(TABLA_RASA_ACCENT_COLORS[monochromeIndex % TABLA_RASA_ACCENT_COLORS.length]);
          material.opacity = Math.min(base.opacity, 0.72);
          if (material.roughness !== undefined) {
            material.roughness = Math.max(base.roughness ?? material.roughness, 0.28);
          }
          if (material.clearcoat !== undefined) {
            material.clearcoat = Math.min(base.clearcoat ?? material.clearcoat, 0.45);
          }
          if (material.clearcoatRoughness !== undefined) {
            material.clearcoatRoughness = Math.max(base.clearcoatRoughness ?? material.clearcoatRoughness, 0.16);
          }
          if (material.envMapIntensity !== undefined) {
            material.envMapIntensity = Math.min(base.envMapIntensity ?? material.envMapIntensity, 0.86);
          }
          if (material.iridescence !== undefined) {
            material.iridescence = 0.015;
          }
          monochromeIndex += 1;
        } else {
          material.color?.setHex(base.color);
          material.opacity = base.opacity;
          if (material.roughness !== undefined && base.roughness !== undefined) {
            material.roughness = base.roughness;
          }
          if (material.clearcoat !== undefined && base.clearcoat !== undefined) {
            material.clearcoat = base.clearcoat;
          }
          if (material.clearcoatRoughness !== undefined && base.clearcoatRoughness !== undefined) {
            material.clearcoatRoughness = base.clearcoatRoughness;
          }
          if (material.envMapIntensity !== undefined && base.envMapIntensity !== undefined) {
            material.envMapIntensity = base.envMapIntensity;
          }
          if (material.iridescence !== undefined && base.iridescence !== undefined) {
            material.iridescence = base.iridescence;
          }
        }
  
        material.needsUpdate = true;
      });
    });
  }

  createHoloMarbleMaterial() {
    const material = this.resources.trackMaterial(
      new THREE.MeshPhysicalMaterial({
        color: 0xf7efe2,
        map: this.createHoloMarbleTexture(),
        roughness: 0.2,
        metalness: 0,
        clearcoat: 0.85,
        clearcoatRoughness: 0.08,
        envMapIntensity: 1.25,
      }),
    );
  
    material.iridescence = 0.18;
    material.iridescenceIOR = 1.45;
    material.iridescenceThicknessRange = [180, 620];
    return this.rememberPaletteMaterial(material, 0xf7efe2, 1);
  }

  createCandyGlossMaterial(color: number, opacity: number) {
    const material = this.resources.trackMaterial(
      new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.06,
        metalness: 0,
        transparent: true,
        opacity,
        depthWrite: false,
        clearcoat: 1,
        clearcoatRoughness: 0.018,
        envMapIntensity: 1.9,
        side: THREE.DoubleSide,
      }),
    );
  
    material.transmission = 0.16;
    material.thickness = 0.42;
    material.iridescence = 0.55;
    material.iridescenceIOR = 1.8;
    material.iridescenceThicknessRange = [220, 820];
    return this.rememberPaletteMaterial(material, color, opacity);
  }

  createIvoryMarbleMaterial() {
    const material = this.resources.trackMaterial(
      new THREE.MeshPhysicalMaterial({
        color: 0xeee5d7,
        map: this.createIvoryMarbleTexture(),
        roughness: 0.26,
        metalness: 0,
        clearcoat: 0.48,
        clearcoatRoughness: 0.12,
        envMapIntensity: 1.12,
      }),
    );
  
    material.iridescence = 0.08;
    material.iridescenceIOR = 1.35;
    material.iridescenceThicknessRange = [160, 420];
    return material;
  }

  createIvoryGlossMaterial(color: number, opacity: number) {
    const material = this.resources.trackMaterial(
      new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.04,
        metalness: 0,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 0.84,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        envMapIntensity: 1.45,
        side: THREE.DoubleSide,
      }),
    );
  
    material.transmission = opacity < 0.75 ? 0.1 : 0;
    material.thickness = 0.28;
    material.iridescence = 0.1;
    material.iridescenceIOR = 1.42;
    material.iridescenceThicknessRange = [140, 420];
    return material;
  }

  private createHoloMarbleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
  
    if (!context) {
      return null;
    }
  
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#fffaf0');
    gradient.addColorStop(0.48, '#d9eef0');
    gradient.addColorStop(1, '#fff1d6');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  
    for (let index = 0; index < 86; index += 1) {
      const y = (index / 86) * canvas.height + Math.sin(index * 2.13) * 24;
      const alpha = 0.035 + (index % 5) * 0.006;
      context.strokeStyle = index % 3 === 0
        ? `rgba(255, 64, 183, ${alpha})`
        : `rgba(72, 108, 120, ${alpha})`;
      context.lineWidth = 1 + (index % 4) * 0.7;
      context.beginPath();
      context.moveTo(-80, y);
      context.bezierCurveTo(
        120,
        y + Math.sin(index) * 70,
        330,
        y - Math.cos(index * 1.7) * 85,
        canvas.width + 90,
        y + Math.sin(index * 0.8) * 42,
      );
      context.stroke();
    }
  
    const texture = this.resources.trackTexture(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.5, 1.5);
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
  
    return texture;
  }

  private createIvoryMarbleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
  
    if (!context) {
      return null;
    }
  
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#fffdf7');
    gradient.addColorStop(0.5, '#ebe5da');
    gradient.addColorStop(1, '#d5ccbd');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  
    for (let index = 0; index < 96; index += 1) {
      const y = (index / 96) * canvas.height + Math.sin(index * 1.83) * 20;
      const alpha = 0.025 + (index % 6) * 0.004;
      context.strokeStyle = index % 4 === 0
        ? `rgba(255, 255, 252, ${alpha + 0.035})`
        : `rgba(96, 84, 72, ${alpha + 0.012})`;
      context.lineWidth = 0.8 + (index % 3) * 0.7;
      context.beginPath();
      context.moveTo(-60, y);
      context.bezierCurveTo(
        115,
        y + Math.sin(index * 0.7) * 48,
        340,
        y - Math.cos(index * 1.45) * 54,
        canvas.width + 70,
        y + Math.sin(index * 0.5) * 34,
      );
      context.stroke();
    }
  
    const texture = this.resources.trackTexture(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.35, 1.35);
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
  
    return texture;
  }
}
