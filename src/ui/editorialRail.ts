import './editorialRail.css';

import type { PublicThemeDefinition, PublicThemeId } from '../config/themes';

export type EditorialRail = {
  element: HTMLElement;
  themeButtons: HTMLButtonElement[];
  setTheme: (themeId: PublicThemeId) => void;
  setReady: (ready: boolean) => void;
  setCollapsed: (collapsed: boolean) => void;
  destroy: () => void;
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
  rail.dataset.collapsed = 'false';
  rail.setAttribute('aria-label', 'Experience navigation');
  rail.innerHTML = `
    <header class="editorial-rail__header">
      <span class="editorial-rail__identity">
        <span class="editorial-rail__monogram" aria-hidden="true">FS</span>
        <span class="editorial-rail__title">3 studies</span>
      </span>
      <button
        class="editorial-rail__toggle"
        type="button"
        aria-label="Collapse theme navigation"
        aria-expanded="true"
        title="Collapse theme navigation"
      >
        <span aria-hidden="true">→</span>
      </button>
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
  const collapseToggle = rail.querySelector<HTMLButtonElement>('.editorial-rail__toggle');

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

  const setCollapsed = (collapsed: boolean) => {
    rail.dataset.collapsed = String(collapsed);
    document.documentElement.dataset.editorialRail = collapsed ? 'collapsed' : 'expanded';
    collapseToggle?.setAttribute('aria-expanded', String(!collapsed));
    collapseToggle?.setAttribute(
      'aria-label',
      collapsed ? 'Expand theme navigation' : 'Collapse theme navigation',
    );
    collapseToggle?.setAttribute(
      'title',
      collapsed ? 'Expand theme navigation' : 'Collapse theme navigation',
    );
  };

  const handleCollapseToggle = () => {
    setCollapsed(rail.dataset.collapsed !== 'true');
  };
  collapseToggle?.addEventListener('click', handleCollapseToggle);

  setTheme(options.activeThemeId);
  setCollapsed(window.matchMedia('(max-width: 720px)').matches);
  setReady(false);

  return {
    element: rail,
    themeButtons,
    setTheme,
    setReady,
    setCollapsed,
    destroy: () => {
      collapseToggle?.removeEventListener('click', handleCollapseToggle);
      rail.remove();
    },
  };
}
