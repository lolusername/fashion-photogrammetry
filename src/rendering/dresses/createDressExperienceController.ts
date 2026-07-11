import * as THREE from 'three';

import { LOADING_OVERLAY_FADE_MS } from '../../app/experienceConstants';
import { usesMobileRenderProfile } from '../../app/renderProfile';
import type {
  ArmBloomController,
  FullDressRecord,
  SubjectMotionState,
} from '../../app/experienceTypes';
import {
  DRESS_ASSETS,
  DRESS_ASSET_ORDER,
  isDressAssetId,
  type DressAssetId,
} from '../../config/dresses';
import type { CycloramaBackgroundPresetId } from '../../config/themes';
import {
  createDressWindController,
  type DressWindController,
} from '../../shaders/dressWindMaterial';
import { writeDressToUrl } from '../../state/urlState';
import { createArmBloomController } from '../effects/armBloom';
import { DressTransitionEffect } from '../effects/DressTransitionEffect';
import { setObjectOpacity } from '../resourceTracker';
import { StudioScene } from '../studio/StudioScene';
import { FullDressStore } from './FullDressStore';

type DressAwareControls = { setDress: (assetId: DressAssetId) => void };
type ReadyAwareRail = { setReady: (ready: boolean) => void };

export type DressExperienceControllerOptions = {
  scene: THREE.Scene;
  store: FullDressStore;
  studio: StudioScene;
  transitionEffect: DressTransitionEffect;
  subjectMotion: SubjectMotionState;
  focusTarget: THREE.Vector3;
  settings: { asset: DressAssetId };
  defaultAssetId: DressAssetId;
  statusElement: HTMLElement;
  loadingOverlay: HTMLElement;
  loadingDetail: HTMLElement;
  editorialRail: ReadyAwareRail;
  experienceControls: DressAwareControls;
  dressButtons: HTMLButtonElement[];
  navigationButtons: HTMLButtonElement[];
  navigationLabel: HTMLElement | null;
  navigationCount: HTMLElement | null;
  signalDiptychElement: HTMLElement | null;
  getThemeId: () => CycloramaBackgroundPresetId;
  isDisposed: () => boolean;
  isMewScrollSwitching: () => boolean;
  resetDressWind: () => void;
  resetMewHoloScrollRotation: () => void;
  applyThemeSubjectPlacement: () => void;
  applyResponsiveCameraToCanvas: () => void;
  updateDebugState: (bounds?: THREE.Box3) => void;
  updateGhostVisibility: () => void;
  scheduleGhosts: () => void;
  updateThemeObjectVisibility: () => void;
  renderDressThumbnails: () => void;
  buildSignalDiptych: () => void;
};

export function createDressExperienceController(
  options: DressExperienceControllerOptions,
) {
  const {
    scene,
    store,
    studio,
    transitionEffect,
    subjectMotion,
    focusTarget,
    settings,
    defaultAssetId,
    statusElement,
    loadingOverlay,
    loadingDetail,
    editorialRail,
    experienceControls,
    dressButtons,
    navigationButtons,
    navigationLabel,
    navigationCount,
    signalDiptychElement,
    getThemeId,
    isDisposed,
    isMewScrollSwitching,
    resetDressWind,
    resetMewHoloScrollRotation,
    applyThemeSubjectPlacement,
    applyResponsiveCameraToCanvas,
    updateDebugState,
    updateGhostVisibility,
    scheduleGhosts,
    updateThemeObjectVisibility,
    renderDressThumbnails,
    buildSignalDiptych,
  } = options;
  let loadToken = 0;
  let railRevealTimeout = 0;
  let eventsBound = false;
  let serviceWorkerLoadHandler: (() => void) | null = null;
  let windController: DressWindController | null = null;
  let armBloomController: ArmBloomController | null = null;

  async function start(silentReload: boolean, startFrameLoop: () => void) {
    if (!silentReload) {
      setLoadingOverlay('Loading selected dress');
    }

    await loadDressAsset(settings.asset, !silentReload);
    hideLoadingOverlay();
    scheduleGhosts();
    startFrameLoop();

    if (!usesMobileRenderProfile()) {
      void preloadRemainingFullDresses();
    }
  }

  function registerAssetServiceWorker() {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
      return;
    }

    serviceWorkerLoadHandler = () => {
      void navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('Asset service worker registration failed', error);
      });
    };
    window.addEventListener('load', serviceWorkerLoadHandler, { once: true });
  }

  async function preloadRemainingFullDresses() {
    for (const assetId of DRESS_ASSET_ORDER) {
      if (assetId === settings.asset) {
        continue;
      }

      try {
        await store.preload(DRESS_ASSETS[assetId]);
      } catch (error) {
        console.warn(`Failed to preload ${DRESS_ASSETS[assetId].label}`, error);
      }
    }
  }

  function setLoadingOverlay(detail: string) {
    if (railRevealTimeout) {
      window.clearTimeout(railRevealTimeout);
      railRevealTimeout = 0;
    }
    if (serviceWorkerLoadHandler) {
      window.removeEventListener('load', serviceWorkerLoadHandler);
      serviceWorkerLoadHandler = null;
    }
    editorialRail.setReady(false);
    loadingOverlay.dataset.hidden = 'false';
    loadingDetail.textContent = detail;
  }

  function hideLoadingOverlay() {
    loadingOverlay.dataset.hidden = 'true';
    railRevealTimeout = window.setTimeout(() => {
      railRevealTimeout = 0;
      editorialRail.setReady(true);
    }, LOADING_OVERLAY_FADE_MS);
  }

  async function loadDressAsset(
    assetId: DressAssetId,
    useLoadingOverlay = false,
  ) {
    if (store.active?.asset.id === assetId) {
      if (settings.asset !== assetId) {
        loadToken += 1;
        settings.asset = assetId;
        updateDressAssetButtons(false);
        updateGhostVisibility();
      }
      return;
    }

    const token = ++loadToken;
    const asset = DRESS_ASSETS[assetId];
    settings.asset = assetId;
    updateDressAssetButtons(true);
    updateGhostVisibility();
    statusElement.dataset.hidden = 'false';
    delete statusElement.dataset.error;
    statusElement.textContent = `Loading ${asset.label}`;
    if (useLoadingOverlay) {
      setLoadingOverlay(`Loading ${asset.label}`);
    }

    try {
      let record: FullDressRecord | null | undefined = store.get(assetId);

      if (!record) {
        const preloadPromise = store.getPending(assetId);
        if (preloadPromise) {
          if (useLoadingOverlay) {
            setLoadingOverlay(`Finishing ${asset.label}`);
          }
          statusElement.textContent = `Finishing ${asset.label}`;
          record = await preloadPromise;
        } else {
          record = await store.load(asset, (stage) => {
            if (token === loadToken) {
              statusElement.textContent = `${stage}: ${asset.label}`;
              if (useLoadingOverlay) {
                setLoadingOverlay(`${stage}: ${asset.label}`);
              }
            }
          });
        }

        if (token !== loadToken || isDisposed()) {
          return;
        }
        if (!record) {
          throw new Error(`Could not prepare ${asset.label}.`);
        }
        store.cache(record);
      }

      if (token !== loadToken) {
        return;
      }

      activateFullDress(record);
      store.prune();
      writeDressToUrl(assetId);

      if (getThemeId() === 'mew-holo' && !isMewScrollSwitching()) {
        resetMewHoloScrollRotation();
      }

      scheduleGhosts();
      statusElement.dataset.hidden = 'true';
      statusElement.textContent = '';
    } catch (error) {
      if (token !== loadToken) {
        return;
      }

      settings.asset = store.active?.asset.id ?? defaultAssetId;
      updateDressAssetButtons(false);
      updateGhostVisibility();
      statusElement.textContent = error instanceof Error
        ? error.message
        : `Failed to load ${store.getAssetUrl(asset)}`;
      statusElement.dataset.error = 'true';
    } finally {
      if (token === loadToken) {
        updateDressAssetButtons(false);
      }
    }
  }

  function activateFullDress(record: FullDressRecord) {
    const previous = store.active;
    if (previous === record) {
      return;
    }

    windController?.dispose();
    armBloomController?.dispose();
    windController = null;
    armBloomController = null;

    if (previous) {
      if (studio.contactShadow?.parent === previous.pivot) {
        previous.pivot.remove(studio.contactShadow);
      }
      if (studio.dialecticHalftoneShadow?.parent === previous.pivot) {
        previous.pivot.remove(studio.dialecticHalftoneShadow);
      }
      store.fadeOut(previous);
    }

    store.activate(record);
    record.pivot.rotation.y = subjectMotion.yaw;
    record.pivot.visible = true;

    if (record.pivot.parent !== scene) {
      scene.add(record.pivot);
    }
    if (studio.contactShadow) {
      record.pivot.add(studio.contactShadow);
    }
    if (studio.dialecticHalftoneShadow) {
      record.pivot.add(studio.dialecticHalftoneShadow);
    }

    resetDressWind();
    subjectMotion.pivot = record.pivot;
    focusTarget.copy(record.loaded.focus);
    applyThemeSubjectPlacement();
    windController = createDressWindController(record.loaded.dress);
    armBloomController = createArmBloomController(record.loaded.arms);
    record.opacity = 0;
    record.targetOpacity = 1;
    setObjectOpacity(record.pivot, 0);
    applyResponsiveCameraToCanvas();
    updateDebugState(record.loaded.bounds);
    updateGhostVisibility();
    updateThemeObjectVisibility();

    if (previous) {
      transitionEffect.trigger(getThemeId());
    }
    buildSignalDiptych();
  }

  function updateDressAssetButtons(loading = false) {
    dressButtons.forEach((button) => {
      const active = button.dataset.dressAsset === settings.asset;
      button.dataset.active = active ? 'true' : 'false';
      button.setAttribute('aria-pressed', String(active));
      button.disabled = loading;
    });
    navigationButtons.forEach((button) => {
      button.disabled = loading;
    });

    const activeIndex = Math.max(0, DRESS_ASSET_ORDER.indexOf(settings.asset));
    if (navigationLabel) {
      navigationLabel.textContent = DRESS_ASSETS[settings.asset].label;
    }
    if (navigationCount) {
      navigationCount.textContent = `${activeIndex + 1} of ${DRESS_ASSET_ORDER.length}`;
    }
    experienceControls.setDress(settings.asset);
    renderDressThumbnails();
  }

  function handleDressAssetClick(event: MouseEvent) {
    const assetId = (event.currentTarget as HTMLButtonElement).dataset.dressAsset;
    const activeAssetId = store.active?.asset.id;
    if (isDressAssetId(assetId) && assetId !== activeAssetId) {
      void loadDressAsset(assetId);
    }
  }

  function handleDressNavigationClick(event: MouseEvent) {
    const direction = Number(
      (event.currentTarget as HTMLButtonElement).dataset.dressDirection,
    );
    if (!Number.isFinite(direction) || direction === 0) {
      return;
    }

    const activeId = store.active?.asset.id ?? settings.asset;
    const activeIndex = Math.max(0, DRESS_ASSET_ORDER.indexOf(activeId));
    const offset = direction > 0 ? 1 : -1;
    const nextIndex = (
      activeIndex + offset + DRESS_ASSET_ORDER.length
    ) % DRESS_ASSET_ORDER.length;
    const nextAssetId = DRESS_ASSET_ORDER[nextIndex];
    if (nextAssetId && nextAssetId !== activeId) {
      void loadDressAsset(nextAssetId);
    }
  }

  function pickSignalNode(event: Event): DressAssetId | null {
    if (getThemeId() !== 'signal-black') {
      return null;
    }
    const target = event.target as HTMLElement | null;
    const canvas = target?.closest?.('.signal-diptych__node') as HTMLCanvasElement | null;
    const id = canvas?.dataset.dressId;
    if (!isDressAssetId(id) || id === settings.asset) {
      return null;
    }
    return id;
  }

  function handleSignalNodeClick(event: MouseEvent) {
    const id = pickSignalNode(event);
    if (id) {
      void loadDressAsset(id);
    }
  }

  function handleSignalNodeKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const id = pickSignalNode(event);
    if (id) {
      event.preventDefault();
      void loadDressAsset(id);
    }
  }

  function bind() {
    if (eventsBound) {
      return;
    }
    eventsBound = true;
    dressButtons.forEach((button) => {
      button.addEventListener('click', handleDressAssetClick);
    });
    navigationButtons.forEach((button) => {
      button.addEventListener('click', handleDressNavigationClick);
    });
    signalDiptychElement?.addEventListener('click', handleSignalNodeClick);
    signalDiptychElement?.addEventListener('keydown', handleSignalNodeKeydown);
  }

  function dispose() {
    loadToken += 1;
    if (railRevealTimeout) {
      window.clearTimeout(railRevealTimeout);
      railRevealTimeout = 0;
    }
    if (eventsBound) {
      dressButtons.forEach((button) => {
        button.removeEventListener('click', handleDressAssetClick);
      });
      navigationButtons.forEach((button) => {
        button.removeEventListener('click', handleDressNavigationClick);
      });
      signalDiptychElement?.removeEventListener('click', handleSignalNodeClick);
      signalDiptychElement?.removeEventListener('keydown', handleSignalNodeKeydown);
      eventsBound = false;
    }
    armBloomController?.dispose();
    windController?.dispose();
    armBloomController = null;
    windController = null;
  }

  return {
    start,
    registerAssetServiceWorker,
    loadDressAsset,
    getWindController: () => windController,
    getArmBloomController: () => armBloomController,
    bind,
    dispose,
  };
}
