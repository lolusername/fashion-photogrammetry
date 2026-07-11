import * as THREE from 'three';

import { GHOST_EDGE_THRESHOLD_DEGREES, GHOST_LOAD_DELAY_MS, MOBILE_GHOST_LIMIT } from '../../app/experienceConstants';
import { usesMobileRenderProfile } from '../../app/renderProfile';
import type { FullDressRecord, GhostDressRecord } from '../../app/experienceTypes';
import { DRESS_ASSETS, DRESS_ASSET_ORDER, isDressAssetId, type DressAssetId } from '../../config/dresses';
import type { CycloramaBackgroundPresetId } from '../../config/themes';
import { loadDress } from '../../loadDress';
import { collectMaterialTextures, disposeGhostDressRecord } from '../resourceTracker';

export type GhostDressSystemOptions = {
  group: THREE.Group;
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  getActiveDress: () => FullDressRecord | null;
  getActiveDressId: () => DressAssetId;
  getThemeId: () => CycloramaBackgroundPresetId;
  isMobileViewport: () => boolean;
  isDisposed: () => boolean;
  loadActiveDress: (assetId: DressAssetId) => Promise<void>;
  syncThumbnail: (record: GhostDressRecord) => void;
  renderThumbnails: () => void;
  onChange: () => void;
};

export class GhostDressSystem {
  private readonly group: THREE.Group;
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: THREE.Camera;
  private readonly getActiveDress: () => FullDressRecord | null;
  private readonly getActiveDressId: () => DressAssetId;
  private readonly getThemeId: () => CycloramaBackgroundPresetId;
  private readonly isMobileViewport: () => boolean;
  private readonly isDisposed: () => boolean;
  private readonly loadActiveDress: (assetId: DressAssetId) => Promise<void>;
  private readonly syncThumbnail: (record: GhostDressRecord) => void;
  private readonly renderThumbnails: () => void;
  private readonly onChange: () => void;
  private readonly records = new Map<DressAssetId, GhostDressRecord>();
  private readonly pickTargets: THREE.Object3D[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private loadToken = 0;
  private loadTimeout = 0;
  private lastRequestKey = '';

  constructor(options: GhostDressSystemOptions) {
    this.group = options.group;
    this.canvas = options.canvas;
    this.camera = options.camera;
    this.getActiveDress = options.getActiveDress;
    this.getActiveDressId = options.getActiveDressId;
    this.getThemeId = options.getThemeId;
    this.isMobileViewport = options.isMobileViewport;
    this.isDisposed = options.isDisposed;
    this.loadActiveDress = options.loadActiveDress;
    this.syncThumbnail = options.syncThumbnail;
    this.renderThumbnails = options.renderThumbnails;
    this.onChange = options.onChange;
  }

  get visibleAssetIds() {
    return Array.from(this.records.values())
      .filter((record) => record.root.visible)
      .map((record) => record.asset.id);
  }

  findAssetAtNormalized(x: number, y: number) {
    if (this.pickTargets.length === 0) return null;
    this.pointer.set(x * 2 - 1, y * 2 - 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.group.updateMatrixWorld(true);
    const hit = this.raycaster.intersectObjects(this.pickTargets, false)
      .find((intersection) => this.isWorldVisible(intersection.object));
    return hit ? this.findAssetFromObject(hit.object) : null;
  }

  schedule() {
    if (!this.getActiveDress()) {
      return;
    }
  
    const desiredGhostIds = this.getDesiredAssetIds();
    const requestKey = desiredGhostIds.join('|');
    this.lastRequestKey = requestKey;
    this.loadToken += 1;
    this.updateVisibility(desiredGhostIds);
  
    if (this.loadTimeout) {
      window.clearTimeout(this.loadTimeout);
      this.loadTimeout = 0;
    }
  
    const unloadedIds = desiredGhostIds.filter((assetId) => !this.records.has(assetId));
  
    if (unloadedIds.length === 0) {
      return;
    }
  
    void this.loadQueue(unloadedIds, this.loadToken, requestKey);
  }

  private async loadQueue(assetIds: DressAssetId[], token: number, requestKey: string) {
    for (const assetId of assetIds) {
      if (this.isDisposed() || token !== this.loadToken || requestKey !== this.lastRequestKey) {
        return;
      }
  
      await this.waitForLoadTurn();
  
      if (this.isDisposed() || token !== this.loadToken || requestKey !== this.lastRequestKey || this.records.has(assetId)) {
        continue;
      }
  
      try {
        const record = await this.loadGhost(assetId);
  
        if (this.isDisposed() || token !== this.loadToken || requestKey !== this.lastRequestKey) {
          disposeGhostDressRecord(record);
          continue;
        }
  
        this.records.set(assetId, record);
        this.group.add(record.root);
        this.syncThumbnail(record);
        this.rebuildPickTargets();
        this.updateVisibility();
      } catch (error) {
        // Ghost loading should never break the main selected dress experience.
        console.warn(`Failed to load ghost dress ${assetId}`, error);
      }
    }
  }

  private waitForLoadTurn() {
    return new Promise<void>((resolve) => {
      this.loadTimeout = window.setTimeout(() => {
        this.loadTimeout = 0;
        resolve();
      }, GHOST_LOAD_DELAY_MS);
    });
  }

  private async loadGhost(assetId: DressAssetId): Promise<GhostDressRecord> {
    const asset = DRESS_ASSETS[assetId];
    const loaded = await loadDress((usesMobileRenderProfile() ? asset.mobileUrl : asset.url));
    const material = new THREE.LineBasicMaterial({
      color: 0xf7efe5,
      transparent: true,
      opacity: 0.72,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: 0xf7efe5,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0xf7efe5,
      transparent: true,
      opacity: 0.2,
      wireframe: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  
    this.replaceWithEdges(loaded.dress, material, fillMaterial, wireMaterial);
    this.replaceWithEdges(loaded.arms, material, fillMaterial, wireMaterial);
  
    const root = new THREE.Group();
    root.name = `ghost ${asset.id}`;
    root.position.set(...asset.ghost.position);
    root.rotation.y = asset.ghost.rotationY;
    root.scale.setScalar(asset.ghost.scale);
    root.userData.dressAsset = asset.id;
    root.add(loaded.root);
  
    const pickTargets: THREE.Object3D[] = [];
    loaded.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
  
      if (!mesh.isMesh || object.userData.isGhostWire) {
        return;
      }
  
      mesh.userData.dressAsset = asset.id;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      pickTargets.push(mesh);
    });
  
    return {
      asset,
      root,
      material,
      fillMaterial,
      wireMaterial,
      pickTargets,
    };
  }

  private replaceWithEdges(
    dress: THREE.Object3D,
    lineMaterial: THREE.LineBasicMaterial,
    fillMaterial: THREE.MeshBasicMaterial,
    wireMaterial: THREE.MeshBasicMaterial,
  ) {
    const originalMaterials = new Set<THREE.Material>();
    const originalTextures = new Set<THREE.Texture>();
    const meshes: THREE.Mesh[] = [];
  
    dress.traverse((object) => {
      const mesh = object as THREE.Mesh;
  
      if (!mesh.isMesh || !mesh.material) {
        return;
      }
  
      meshes.push(mesh);
    });
  
    meshes.forEach((mesh) => {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((sourceMaterial) => {
        originalMaterials.add(sourceMaterial);
        collectMaterialTextures(sourceMaterial, originalTextures);
      });
      mesh.material = fillMaterial;
      mesh.renderOrder = 5;
      mesh.frustumCulled = false;
  
      if (mesh.geometry) {
        const wire = new THREE.Mesh(mesh.geometry, wireMaterial);
        wire.name = `${mesh.name || 'dress'} full wire ghost`;
        wire.userData.isGhostWire = true;
        wire.renderOrder = 6;
        wire.frustumCulled = false;
        mesh.add(wire);
  
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry, GHOST_EDGE_THRESHOLD_DEGREES),
          lineMaterial,
        );
        edges.name = `${mesh.name || 'dress'} edge ghost`;
        edges.renderOrder = 7;
        edges.frustumCulled = false;
        mesh.add(edges);
      }
    });
  
    originalTextures.forEach((texture) => texture.dispose());
    originalMaterials.forEach((sourceMaterial) => sourceMaterial.dispose());
  }

  private rebuildPickTargets() {
    this.pickTargets.length = 0;
    this.records.forEach((record) => {
      if (!record.root.visible) {
        return;
      }
  
      this.pickTargets.push(...record.pickTargets);
    });
  }

  updateVisibility(desiredGhostIds = this.getDesiredAssetIds()) {
    const visibleGhostIds = new Set(desiredGhostIds);
    const visibleOrderedIds = DRESS_ASSET_ORDER.filter((assetId) => visibleGhostIds.has(assetId));
    const blue = this.getThemeId() === 'blue';
    const invisibleCities = this.getThemeId() === 'mew-holo';
    // Signal Black shows the ghost dresses only as nodes in the diptych graph (HTML
    // canvases reusing the thumbnail scenes), so suppress them in the main 3D scene.
    const signal = this.getThemeId() === 'signal-black';
  
    this.records.forEach((record, assetId) => {
      const visibleInScene = !blue && !invisibleCities && !signal && visibleGhostIds.has(assetId) && assetId !== this.getActiveDressId();
      record.root.visible = visibleInScene;
  
      if (visibleInScene) {
        this.applyLayout(record, visibleOrderedIds);
      }
  
      this.syncThumbnail(record);
    });
  
    this.syncDepthMode();
    this.rebuildPickTargets();
    this.renderThumbnails();
    this.onChange();
  }

  private syncDepthMode() {
    const windArchive = this.getThemeId() === 'tabla-rasa';
  
    this.records.forEach((record) => {
      [record.material, record.fillMaterial, record.wireMaterial].forEach((ghostMaterial) => {
        // Wind Archive places a single ghost behind the subject. It still needs
        // transparent materials, but it must depth-test so the opaque active
        // dress can cover any overlapping part of the ghost.
        ghostMaterial.depthTest = windArchive;
        ghostMaterial.depthWrite = false;
        ghostMaterial.needsUpdate = true;
      });
    });
  }

  private getDesiredAssetIds(): DressAssetId[] {
    const activeAssetId = this.getActiveDressId();
  
    if (this.getThemeId() === 'mew-holo') {
      return [];
    }
  
    if (this.getThemeId() === 'blue') {
      return DRESS_ASSET_ORDER;
    }
  
    // Signal Black needs both dresses loaded as ghosts so both graph nodes can
    // render the wireframe in the diptych viz.
    if (this.getThemeId() === 'signal-black') {
      return DRESS_ASSET_ORDER;
    }
  
    if (this.getThemeId() === 'tabla-rasa') {
      const activeIndex = DRESS_ASSET_ORDER.indexOf(activeAssetId);
      const nextAssetId = DRESS_ASSET_ORDER[
        (Math.max(0, activeIndex) + 1) % DRESS_ASSET_ORDER.length
      ];
      return nextAssetId && nextAssetId !== activeAssetId ? [nextAssetId] : [];
    }
  
    const inactiveIds = DRESS_ASSET_ORDER.filter((assetId) => assetId !== activeAssetId);
  
    if (!this.isMobileViewport()) {
      return inactiveIds;
    }
  
    const activeIndex = DRESS_ASSET_ORDER.indexOf(activeAssetId);
    return inactiveIds
      .sort((a, b) => this.getOrderDistance(activeIndex, a) - this.getOrderDistance(activeIndex, b))
      .slice(0, MOBILE_GHOST_LIMIT);
  }

  private getOrderDistance(activeIndex: number, assetId: DressAssetId) {
    const index = DRESS_ASSET_ORDER.indexOf(assetId);
  
    if (activeIndex < 0 || index < 0) {
      return Number.POSITIVE_INFINITY;
    }
  
    return Math.abs(index - activeIndex);
  }

  private applyLayout(record: GhostDressRecord, visibleOrderedIds: DressAssetId[]) {
    const portrait = this.isMobileViewport();
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const ivory = this.getThemeId() === 'ivory-holo';
    const signal = this.getThemeId() === 'signal-black';
    const windArchive = this.getThemeId() === 'tabla-rasa';
    const ghostIndex = Math.max(0, visibleOrderedIds.indexOf(record.asset.id));
    const centerOffset = (Math.max(1, visibleOrderedIds.length) - 1) * 0.5;
    const verticalOffset = (ghostIndex - centerOffset) * (portrait ? 0.28 : 0.34);
  
    if (windArchive) {
      record.root.position.set(
        portrait ? 0.72 : 1.72,
        portrait ? 0.2 : 0.38,
        portrait ? -0.9 : -0.82,
      );
      record.root.rotation.y = -0.32;
      record.root.scale.setScalar(portrait ? 0.3 : 0.56);
  
      record.material.color.setHex(0x63737c);
      record.material.opacity = 0.55;
      record.material.depthTest = true;
      record.material.depthWrite = false;
      record.material.needsUpdate = true;
      record.fillMaterial.color.setHex(0xf5f9fb);
      record.fillMaterial.opacity = 0.015;
      record.fillMaterial.depthTest = true;
      record.fillMaterial.depthWrite = false;
      record.fillMaterial.needsUpdate = true;
      record.wireMaterial.color.setHex(0x63737c);
      record.wireMaterial.opacity = 0.09;
      record.wireMaterial.depthTest = true;
      record.wireMaterial.depthWrite = false;
      record.wireMaterial.needsUpdate = true;
      return;
    }
  
    const radiusX = portrait ? 0.92 : aspect > 1.35 ? 2.16 : 1.72;
    const depth = portrait ? -0.82 : -1.08;
  
    record.root.position.set(
      -radiusX,
      verticalOffset,
      depth - Math.abs(verticalOffset) * 0.16,
    );
    record.root.rotation.y = portrait ? 0.28 : 0.38;
    record.root.scale.setScalar(portrait ? 0.36 : 0.52);
  
    const lineColor = ivory ? 0x4b3026 : signal ? 0x00e2ff : 0x234c55;
    const fillColor = ivory ? 0xf4e8d6 : signal ? 0x00e2ff : 0xfff3d8;
    record.material.color.set(lineColor);
    record.material.opacity = ivory ? 0.95 : signal ? 0.86 : 0.92;
    record.material.depthTest = false;
    record.material.depthWrite = false;
    record.material.needsUpdate = true;
    record.fillMaterial.color.set(fillColor);
    record.fillMaterial.opacity = ivory ? 0.18 : signal ? 0.11 : 0.14;
    record.fillMaterial.depthTest = false;
    record.fillMaterial.depthWrite = false;
    record.fillMaterial.needsUpdate = true;
    record.wireMaterial.color.set(lineColor);
    record.wireMaterial.opacity = ivory ? 0.34 : signal ? 0.3 : 0.34;
    record.wireMaterial.depthTest = false;
    record.wireMaterial.depthWrite = false;
    record.wireMaterial.needsUpdate = true;
  }

  select(event: PointerEvent) {
    if (this.pickTargets.length === 0) {
      return false;
    }
  
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.group.updateMatrixWorld(true);
  
    const intersections = this.raycaster.intersectObjects(this.pickTargets, false);
    const hit = intersections.find((intersection) => this.isWorldVisible(intersection.object));
    const assetId = hit ? this.findAssetFromObject(hit.object) : null;
  
    if (!assetId || assetId === this.getActiveDressId()) {
      return false;
    }
  
    void this.loadActiveDress(assetId);
    return true;
  }

  private findAssetFromObject(object: THREE.Object3D): DressAssetId | null {
    let current: THREE.Object3D | null = object;
  
    while (current) {
      const assetId = current.userData.dressAsset;
  
      if (isDressAssetId(assetId)) {
        return assetId;
      }
  
      current = current.parent;
    }
  
    return null;
  }

  private isWorldVisible(object: THREE.Object3D) {
    let current: THREE.Object3D | null = object;
  
    while (current) {
      if (!current.visible) {
        return false;
      }
  
      current = current.parent;
    }
  
    return true;
  }

  dispose() {
    this.loadToken += 1;
    if (this.loadTimeout) {
      window.clearTimeout(this.loadTimeout);
      this.loadTimeout = 0;
    }
    this.records.forEach((record) => disposeGhostDressRecord(record));
    this.records.clear();
    this.pickTargets.length = 0;
  }
}
