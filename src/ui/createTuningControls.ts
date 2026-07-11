import * as THREE from 'three';

import { DRESS_BLOOM_MAX_STRENGTH } from '../app/experienceConstants';

export type TuningControlsOptions = {
  stageElement: HTMLElement;
  mewTitleOverlayMaterial: THREE.ShaderMaterial;
  mewTitleOpacityInput: HTMLInputElement | null;
  mewTitleOpacityValue: HTMLOutputElement | null;
  dressBloomInput: HTMLInputElement | null;
  dressBloomValue: HTMLOutputElement | null;
  initiallyVisible: boolean;
};

export function createTuningControls(options: TuningControlsOptions) {
  const {
    stageElement,
    mewTitleOverlayMaterial,
    mewTitleOpacityInput,
    mewTitleOpacityValue,
    dressBloomInput,
    dressBloomValue,
    initiallyVisible,
  } = options;
  let mewTitleBlackOpacity = THREE.MathUtils.clamp(
    Number(mewTitleOpacityInput?.value ?? 100),
    0,
    100,
  ) / 100;
  let dressBloomStrength = (
    THREE.MathUtils.clamp(Number(dressBloomInput?.value ?? 4), 0, 100)
    / 100
    * DRESS_BLOOM_MAX_STRENGTH
  );

  stageElement.dataset.tuningControls = initiallyVisible ? 'true' : 'false';
  stageElement.dataset.dressBloomStrength = dressBloomStrength.toFixed(4);
  mewTitleOverlayMaterial.uniforms.uBlackOpacity.value = mewTitleBlackOpacity;

  function handleMewTitleOpacityInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const percent = THREE.MathUtils.clamp(Number(input.value), 0, 100);
    mewTitleBlackOpacity = percent / 100;
    mewTitleOverlayMaterial.uniforms.uBlackOpacity.value = mewTitleBlackOpacity;
    if (mewTitleOpacityValue) {
      mewTitleOpacityValue.value = `${Math.round(percent)}%`;
    }
  }

  function handleDressBloomInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const percent = THREE.MathUtils.clamp(Number(input.value), 0, 100);
    dressBloomStrength = percent / 100 * DRESS_BLOOM_MAX_STRENGTH;
    stageElement.dataset.dressBloomStrength = dressBloomStrength.toFixed(4);
    if (dressBloomValue) {
      dressBloomValue.value = `${Math.round(percent)}%`;
    }
  }

  function handleShortcut(event: KeyboardEvent) {
    if (
      event.shiftKey
      && !event.altKey
      && !event.ctrlKey
      && !event.metaKey
      && event.key.toLowerCase() === 't'
    ) {
      event.preventDefault();
      const visible = stageElement.dataset.tuningControls === 'true';
      stageElement.dataset.tuningControls = visible ? 'false' : 'true';
    }
  }

  mewTitleOpacityInput?.addEventListener('input', handleMewTitleOpacityInput);
  dressBloomInput?.addEventListener('input', handleDressBloomInput);
  window.addEventListener('keydown', handleShortcut);

  return {
    getMewTitleBlackOpacity: () => mewTitleBlackOpacity,
    getDressBloomStrength: () => dressBloomStrength,
    dispose: () => {
      mewTitleOpacityInput?.removeEventListener('input', handleMewTitleOpacityInput);
      dressBloomInput?.removeEventListener('input', handleDressBloomInput);
      window.removeEventListener('keydown', handleShortcut);
    },
  };
}
