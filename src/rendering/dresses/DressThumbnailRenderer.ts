import * as THREE from 'three';

import {
  DRESS_THUMBNAIL_TARGET_HEIGHT,
  DRESS_THUMBNAIL_TARGET_WIDTH,
} from '../../app/experienceConstants';
import type { DressThumbnailRecord, GhostDressRecord } from '../../app/experienceTypes';
import { isDressAssetId, type DressAssetId } from '../../config/dresses';

export class DressThumbnailRenderer {
  readonly records = new Map<DressAssetId, DressThumbnailRecord>();

  private readonly canvases: HTMLCanvasElement[];
  private readonly getPixelRatio: () => number;
  private renderer: THREE.WebGLRenderer | null = null;
  private initialized = false;

  constructor(canvases: HTMLCanvasElement[], getPixelRatio: () => number) {
    this.canvases = canvases;
    this.getPixelRatio = getPixelRatio;
  }

  initialize() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    this.canvases.forEach((canvas) => {
      const assetId = canvas.dataset.dressThumbnail;
      if (!isDressAssetId(assetId)) {
        return;
      }

      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 1.45));
      const key = new THREE.DirectionalLight(0xffffff, 2.9);
      key.position.set(-1.6, 2.4, 2.2);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x9fd8ff, 1.35);
      rim.position.set(1.8, 1.4, -1.8);
      scene.add(rim);

      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 12);
      camera.position.set(0, 0.04, 4.15);
      camera.lookAt(0, 0.02, 0);
      this.records.set(assetId, { assetId, canvas, scene, camera, root: null });
    });
  }

  syncFromGhost(record: GhostDressRecord) {
    const thumbnail = this.records.get(record.asset.id);
    if (!thumbnail || thumbnail.root) {
      return;
    }

    const clone = this.createGhostClone(record.root);
    thumbnail.root = clone;
    thumbnail.scene.add(clone);
    this.frameRoot(clone);
  }

  renderAll(assetIds: readonly DressAssetId[]) {
    assetIds.forEach((assetId) => this.render(assetId));
  }

  render(assetId: DressAssetId) {
    const thumbnail = this.records.get(assetId);
    if (!thumbnail?.root) {
      return;
    }
    const renderer = this.ensureRenderer();

    const width = Math.max(1, thumbnail.canvas.clientWidth || 148);
    const height = Math.max(1, thumbnail.canvas.clientHeight || 148);
    renderer.setPixelRatio(this.getPixelRatio());
    renderer.setSize(width, height, false);
    thumbnail.camera.aspect = width / height;
    thumbnail.camera.updateProjectionMatrix();
    renderer.render(thumbnail.scene, thumbnail.camera);

    const source = renderer.domElement;
    if (thumbnail.canvas.width !== source.width || thumbnail.canvas.height !== source.height) {
      thumbnail.canvas.width = source.width;
      thumbnail.canvas.height = source.height;
    }
    const context = thumbnail.canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.clearRect(0, 0, thumbnail.canvas.width, thumbnail.canvas.height);
    context.drawImage(source, 0, 0, thumbnail.canvas.width, thumbnail.canvas.height);
  }

  dispose() {
    this.records.forEach((record) => {
      if (!record.root) {
        return;
      }

      const materials = new Set<THREE.Material>();
      record.root.traverse((object) => {
        const owner = object as THREE.Object3D & {
          material?: THREE.Material | THREE.Material[];
        };
        if (!owner.material) {
          return;
        }
        const objectMaterials = Array.isArray(owner.material) ? owner.material : [owner.material];
        objectMaterials.forEach((material) => materials.add(material));
      });
      materials.forEach((material) => material.dispose());
      record.scene.remove(record.root);
      record.root = null;
    });
    this.records.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.initialized = false;
  }

  private ensureRenderer() {
    if (this.renderer) {
      return this.renderer;
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas: document.createElement('canvas'),
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    return this.renderer;
  }

  private createGhostClone(root: THREE.Group) {
    const clone = root.clone(true);

    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const line = object as THREE.LineSegments;

      if (mesh.isMesh && object.userData.isGhostWire) {
        object.visible = false;
        return;
      }

      if (mesh.isMesh && mesh.material) {
        mesh.material = new THREE.MeshStandardMaterial({
          color: 0x6f7d76,
          roughness: 0.82,
          metalness: 0,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.4,
          depthTest: true,
          depthWrite: true,
          toneMapped: false,
        });
        mesh.renderOrder = 1;
        return;
      }

      if ((line.isLineSegments || line.isLine) && line.material) {
        line.material = new THREE.LineBasicMaterial({
          color: 0x1f2a26,
          transparent: true,
          opacity: 0.9,
          depthTest: true,
          depthWrite: false,
          toneMapped: false,
        });
        line.renderOrder = 3;
      }
    });

    return clone;
  }

  private frameRoot(root: THREE.Group) {
    root.position.set(0, 0, 0);
    root.rotation.set(-0.04, 0.54, 0);
    root.scale.setScalar(1);
    root.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(root);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const scale = Math.min(
      DRESS_THUMBNAIL_TARGET_HEIGHT / Math.max(size.y, 0.001),
      DRESS_THUMBNAIL_TARGET_WIDTH / Math.max(size.x, 0.001),
    );

    root.scale.setScalar(scale);
    root.position.copy(center).multiplyScalar(-scale);
    root.position.y += size.y * scale * 0.035;
    root.updateMatrixWorld(true);
  }
}
