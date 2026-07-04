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
    <div class="experience-guide" data-open="false">
      <button
        class="experience-guide__trigger"
        type="button"
        aria-label="How to explore"
        aria-expanded="false"
        aria-controls="experience-guide-panel"
      >
        <span>Explore</span>
        <span class="experience-guide__mark" aria-hidden="true">i</span>
      </button>
      <aside class="experience-guide__panel" id="experience-guide-panel" aria-label="How to explore">
        <span class="experience-guide__eyebrow">How to explore</span>
        <strong data-experience-title></strong>
        <p data-experience-instruction></p>
      </aside>
    </div>
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

  const guide = requireElement<HTMLElement>(controls, '.experience-guide');
  const guideTrigger = requireElement<HTMLButtonElement>(controls, '.experience-guide__trigger');
  const title = requireElement<HTMLElement>(controls, '[data-experience-title]');
  const instruction = requireElement<HTMLElement>(controls, '[data-experience-instruction]');
  const dressDirectionButtons = Array.from(
    controls.querySelectorAll<HTMLButtonElement>('[data-dress-direction]'),
  );
  const dressLabel = requireElement<HTMLElement>(controls, '[data-dress-navigation-label]');
  const dressCount = requireElement<HTMLElement>(controls, '[data-dress-navigation-count]');

  const setGuideOpen = (open: boolean) => {
    guide.dataset.open = String(open);
    guideTrigger.setAttribute('aria-expanded', String(open));
  };

  const handleTrigger = (event: MouseEvent) => {
    event.stopPropagation();
    setGuideOpen(guide.dataset.open !== 'true');
  };

  const handleOutsideClick = (event: MouseEvent) => {
    if (!guide.contains(event.target as Node)) {
      setGuideOpen(false);
    }
  };

  const handleEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && guide.dataset.open === 'true') {
      setGuideOpen(false);
      guideTrigger.focus();
    }
  };

  guideTrigger.addEventListener('click', handleTrigger);
  window.addEventListener('click', handleOutsideClick);
  window.addEventListener('keydown', handleEscape);

  const setTheme = (themeId: PublicThemeId) => {
    const theme = options.themes.find((candidate) => candidate.id === themeId);
    if (!theme) {
      return;
    }

    controls.dataset.theme = themeId;
    title.textContent = theme.label;
    instruction.textContent = theme.instruction;
    setGuideOpen(false);
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
      guideTrigger.removeEventListener('click', handleTrigger);
      window.removeEventListener('click', handleOutsideClick);
      window.removeEventListener('keydown', handleEscape);
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

