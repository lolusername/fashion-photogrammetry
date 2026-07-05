import './experienceControls.css';

import type { DressAsset, DressAssetId } from '../config/dresses';
import type { PublicThemeDefinition, PublicThemeId } from '../config/themes';

export type ExperienceControls = {
  element: HTMLElement;
  dressDirectionButtons: HTMLButtonElement[];
  dressLabel: HTMLElement;
  dressCount: HTMLElement;
  setTheme: (themeId: PublicThemeId) => void;
  setDress: (dressId: DressAssetId) => void;
  destroy: () => void;
};

type ExperienceControlsOptions = {
  mount: HTMLElement;
  themes: readonly PublicThemeDefinition[];
  activeThemeId: PublicThemeId;
  dresses: Record<DressAssetId, DressAsset>;
  dressOrder: DressAssetId[];
  activeDressId: DressAssetId;
};

export function createExperienceControls(options: ExperienceControlsOptions): ExperienceControls {
  const controls = document.createElement('div');
  controls.className = 'experience-controls';
  controls.innerHTML = `
    <nav class="dress-navigation" aria-label="Browse dresses">
      <button type="button" data-dress-direction="-1" aria-label="Show previous dress">←</button>
      <div class="dress-navigation__current" aria-live="polite" aria-atomic="true">
        <span>Dress</span>
        <strong data-dress-navigation-label></strong>
        <small data-dress-navigation-count></small>
      </div>
      <button type="button" data-dress-direction="1" aria-label="Show next dress">→</button>
    </nav>
  `;
  options.mount.append(controls);

  const dressDirectionButtons = Array.from(
    controls.querySelectorAll<HTMLButtonElement>('[data-dress-direction]'),
  );
  const dressLabel = requireElement<HTMLElement>(controls, '[data-dress-navigation-label]');
  const dressCount = requireElement<HTMLElement>(controls, '[data-dress-navigation-count]');

  const setTheme = (themeId: PublicThemeId) => {
    const theme = options.themes.find((candidate) => candidate.id === themeId);
    if (!theme) {
      return;
    }

    controls.dataset.theme = themeId;
  };

  const setDress = (dressId: DressAssetId) => {
    const index = Math.max(0, options.dressOrder.indexOf(dressId));
    dressLabel.textContent = options.dresses[dressId].label;
    dressCount.textContent = `${index + 1} / ${options.dressOrder.length}`;
  };

  setTheme(options.activeThemeId);
  setDress(options.activeDressId);

  return {
    element: controls,
    dressDirectionButtons,
    dressLabel,
    dressCount,
    setTheme,
    setDress,
    destroy: () => {
      controls.remove();
    },
  };
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing experience control element: ${selector}`);
  }
  return element;
}
