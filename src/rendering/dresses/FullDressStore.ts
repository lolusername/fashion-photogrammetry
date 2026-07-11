import * as THREE from 'three';

import {
  FULL_DRESS_CACHE_LIMIT,
  FULL_DRESS_FADE_SPEED,
} from '../../app/experienceConstants';
import { usesMobileRenderProfile } from '../../app/renderProfile';
import type { FullDressRecord } from '../../app/experienceTypes';
import type { DressAsset, DressAssetId } from '../../config/dresses';
import { loadDress } from '../../loadDress';
import {
  disposeObjectResources,
  setObjectOpacity,
} from '../resourceTracker';

export class FullDressStore {
  readonly records = new Map<DressAssetId, FullDressRecord>();

  private readonly scene: THREE.Scene;
  private readonly isDisposed: () => boolean;
  private readonly preloadPromises = new Map<DressAssetId, Promise<FullDressRecord | null>>();
  private useCounter = 0;
  private activeRecord: FullDressRecord | null = null;

  constructor(scene: THREE.Scene, isDisposed: () => boolean) {
    this.scene = scene;
    this.isDisposed = isDisposed;
  }

  get active() {
    return this.activeRecord;
  }

  get(assetId: DressAssetId) {
    return this.records.get(assetId);
  }

  getPending(assetId: DressAssetId) {
    return this.preloadPromises.get(assetId);
  }

  getAssetUrl(asset: DressAsset) {
    return usesMobileRenderProfile() ? asset.mobileUrl : asset.url;
  }

  async preload(asset: DressAsset) {
    if (this.records.has(asset.id) || this.preloadPromises.has(asset.id) || this.isDisposed()) {
      return;
    }

    const promise = this.load(asset).finally(() => {
      this.preloadPromises.delete(asset.id);
    });
    this.preloadPromises.set(asset.id, promise);
    const record = await promise;

    if (!this.isDisposed() && record && !this.records.has(asset.id)) {
      this.records.set(asset.id, record);
    }
  }

  async load(
    asset: DressAsset,
    onStage?: (stage: string) => void,
  ): Promise<FullDressRecord | null> {
    const loaded = await loadDress(this.getAssetUrl(asset), onStage);

    if (this.isDisposed()) {
      disposeObjectResources(loaded.root);
      return null;
    }

    this.removeShadowArtifacts(loaded.root);
    const pivot = new THREE.Group();
    pivot.name = `subject ${asset.id}`;
    pivot.visible = false;
    pivot.add(loaded.root);

    return {
      asset,
      loaded,
      pivot,
      opacity: 1,
      targetOpacity: 1,
      lastUsed: ++this.useCounter,
    };
  }

  cache(record: FullDressRecord) {
    this.records.set(record.asset.id, record);
  }

  activate(record: FullDressRecord) {
    const previous = this.activeRecord;
    if (previous === record) {
      return previous;
    }

    this.activeRecord = record;
    record.lastUsed = ++this.useCounter;
    return previous;
  }

  fadeOut(record: FullDressRecord) {
    if (record.pivot.parent !== this.scene) {
      this.scene.add(record.pivot);
    }
    record.pivot.visible = true;
    record.opacity = Math.max(record.opacity, 0.001);
    record.targetOpacity = 0;
  }

  updateFades(delta: number) {
    this.records.forEach((record) => {
      if (
        record.pivot.parent !== this.scene
        || !record.pivot.visible
        || Math.abs(record.opacity - record.targetOpacity) < 0.001
      ) {
        return;
      }

      const nextOpacity = THREE.MathUtils.lerp(
        record.opacity,
        record.targetOpacity,
        1 - Math.exp(-delta * FULL_DRESS_FADE_SPEED),
      );
      record.opacity = Math.abs(nextOpacity - record.targetOpacity) < 0.015
        ? record.targetOpacity
        : nextOpacity;
      setObjectOpacity(record.pivot, record.opacity);

      if (record.opacity <= 0 && record !== this.activeRecord) {
        this.scene.remove(record.pivot);
        record.pivot.visible = false;
        record.opacity = 1;
        record.targetOpacity = 1;
        setObjectOpacity(record.pivot, 1);
      }
    });
  }

  prune() {
    const inactive = Array.from(this.records.values())
      .filter((record) => record !== this.activeRecord)
      .sort((a, b) => b.lastUsed - a.lastUsed);
    const cacheLimit = usesMobileRenderProfile() ? 1 : FULL_DRESS_CACHE_LIMIT;

    inactive.slice(Math.max(0, cacheLimit - 1)).forEach((record) => {
      this.records.delete(record.asset.id);
      record.pivot.removeFromParent();
      disposeObjectResources(record.pivot);
    });
  }

  visibleRoots() {
    const objects: THREE.Object3D[] = [];
    this.records.forEach((record) => {
      if (record.pivot.visible) {
        objects.push(record.loaded.root);
      }
    });
    return objects;
  }

  dispose() {
    this.preloadPromises.clear();
    this.records.forEach((record) => disposeObjectResources(record.pivot));
    this.records.clear();
    this.activeRecord = null;
  }

  private removeShadowArtifacts(root: THREE.Object3D) {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
  }
}
