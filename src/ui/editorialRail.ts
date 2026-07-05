import './editorialRail.css';

import type { PublicThemeDefinition, PublicThemeId } from '../config/themes';

export type EditorialRail = {
  element: HTMLElement;
  themeButtons: HTMLButtonElement[];
  setTheme: (themeId: PublicThemeId) => void;
  setReady: (ready: boolean) => void;
};

type EditorialRailOptions = {
  mount: HTMLElement;
  themes: readonly PublicThemeDefinition[];
  activeThemeId: PublicThemeId;
};

export function createEditorialRail(options: EditorialRailOptions): EditorialRail {
  const { mount, themes } = options;
  const rail = document.createElement('aside');
  rail.className = 'editorial-rail';
  rail.dataset.ready = 'false';
  rail.setAttribute('aria-label', 'Experience navigation');
  rail.innerHTML = `
    <header class="editorial-rail__header">
      <span class="editorial-rail__monogram" aria-hidden="true">FS</span>
      <span>Three studies</span>
    </header>
    <nav class="editorial-rail__themes" aria-label="Choose a theme">
      ${themes.map((theme) => `
        <button
          class="editorial-rail__theme"
          type="button"
          data-background-preset="${theme.id}"
          aria-label="Switch visual theme to ${theme.label}"
          aria-pressed="${theme.id === options.activeThemeId}"
        >
          <span class="editorial-rail__theme-index">${theme.index}</span>
          <span class="editorial-rail__theme-copy">
            <strong>${theme.label}</strong>
            <small>${theme.summary}</small>
          </span>
        </button>
      `).join('')}
    </nav>
  `;
  mount.append(rail);

  const themeButtons = Array.from(rail.querySelectorAll<HTMLButtonElement>('[data-background-preset]'));

  const setTheme = (themeId: PublicThemeId) => {
    const theme = themes.find((candidate) => candidate.id === themeId);
    if (!theme) {
      return;
    }

    rail.dataset.theme = themeId;
    themeButtons.forEach((button) => {
      const active = button.dataset.backgroundPreset === themeId;
      button.dataset.active = String(active);
      button.setAttribute('aria-pressed', String(active));
    });
  };

  const setReady = (ready: boolean) => {
    rail.dataset.ready = String(ready);
    rail.setAttribute('aria-hidden', String(!ready));
  };

  setTheme(options.activeThemeId);
  setReady(false);

  return {
    element: rail,
    themeButtons,
    setTheme,
    setReady,
  };
}
