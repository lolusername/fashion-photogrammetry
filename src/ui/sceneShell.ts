import type { DressAsset, DressAssetId } from '../config/dresses';
import type { PublicThemeId } from '../config/themes';

export type SceneShell = {
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  status: HTMLElement;
  loadingOverlay: HTMLElement;
  loadingDetail: HTMLElement;
};

/**
 * Creates the renderer mount points and the non-interactive editorial layers
 * that belong to a specific theme. Shared controls stay in separate modules,
 * so the Three.js canvas does not own navigation markup or styling.
 */
type SceneShellOptions = {
  mount: HTMLElement;
  initialThemeId: PublicThemeId;
  dresses: Record<DressAssetId, DressAsset>;
  activeDressId: DressAssetId;
};

export function createSceneShell(options: SceneShellOptions): SceneShell {
  const { mount, initialThemeId, dresses, activeDressId } = options;
  const dressTiles = Object.values(dresses).map((dress) => `
    <button
      class="dress-switcher__button"
      type="button"
      data-dress-asset="${dress.id}"
      aria-label="Load ${dress.label} dress"
      aria-pressed="${dress.id === activeDressId}"
    >
      <canvas class="dress-switcher__thumbnail" data-dress-thumbnail="${dress.id}" aria-hidden="true"></canvas>
      <span>${dress.label}</span>
    </button>
  `).join('');

  mount.innerHTML = `
    <main class="stage" data-background-preset="${initialThemeId}" aria-label="Ferdinando Sarmi dress study">
      <div class="mew-editorial-page" aria-hidden="true">
        <header class="mew-editorial-page__header">
          <div class="mew-editorial-page__mast">Ferdinando Sarmi</div>
          <nav class="mew-editorial-page__nav" aria-label="Invisible Cities archive">
            <span>Archive</span>
            <span class="mew-editorial-page__nav-group">
              <span>Invisible,</span>
              <span class="mew-editorial-page__nav-active">Cities</span>
            </span>
          </nav>
        </header>
        <div class="mew-editorial-page__folio">Atelier / Scroll</div>
        <div class="mew-editorial-page__list">
          <article class="mew-editorial-page__row">
            <span>Trieste</span>
            <span>Italian Origin</span>
            <span>1912</span>
            <span>Birth</span>
          </article>
          <article class="mew-editorial-page__row">
            <span>Arden</span>
            <span>Head Designer</span>
            <span>1951</span>
            <span>Salon</span>
          </article>
          <article class="mew-editorial-page__row">
            <span>Seventh</span>
            <span>Sarmi House</span>
            <span>1959</span>
            <span>New York</span>
          </article>
        </div>
        <p class="mew-editorial-page__copy mew-editorial-page__copy--left">
          Italian born, New York made. Sarmi built evening clothes around color, embroidery, and theatrical fabric light.
        </p>
        <p class="mew-editorial-page__copy mew-editorial-page__copy--right">
          Scroll or swipe to turn the dress. At a half rotation, the next scan enters the chromatic field.
        </p>
      </div>
      <div class="wind-editorial-page" aria-hidden="true">
        <header class="wind-editorial-page__header">
          <span>Ferdinando Sarmi</span>
          <span>Archive / Wind study</span>
        </header>
        <div class="wind-editorial-page__folio">Photographs in motion</div>
        <div class="wind-editorial-page__list">
          <span>Trieste / 1912</span>
          <span>New York / 1959</span>
          <span>Surface / Silk</span>
        </div>
        <p class="wind-editorial-page__copy wind-editorial-page__copy--left">
          Italian born, New York made. Sarmi built evening clothes around color, embroidery, and theatrical fabric light.
        </p>
        <p class="wind-editorial-page__copy wind-editorial-page__copy--right">
          Archival stills enter as loose prints, then settle around the moving scan without crossing the garment.
        </p>
      </div>
      <div class="blue-layout">
        <section class="blue-editorial-panel" aria-hidden="true">
          <header class="blue-editorial-panel__header">
            <span>Ferdinando Sarmi</span>
            <span>Dialectic / Dress archive</span>
          </header>
          <div class="blue-editorial-panel__list">
            <article><span>Trieste</span><span>Italian origin</span><span>1912</span></article>
            <article><span>Arden</span><span>Head designer</span><span>1951</span></article>
            <article><span>Seventh</span><span>Own boutique</span><span>1959</span></article>
            <article><span>Coty</span><span>Fashion award</span><span>1960</span></article>
            <article><span>Surface</span><span>Silk / metallic</span><span>1966</span></article>
          </div>
          <p>
            Sarmi moved between European elegance and New York speed: evening dress, ready-to-wear, vivid silk, embroidery, and surfaces built for light.
          </p>
        </section>
        <div class="blue-layout__divider" aria-hidden="true"></div>
        <section class="blue-layout__right-pane">
          <canvas class="stage__canvas" aria-label="Three.js rendered dress scene"></canvas>
          <div class="dress-switcher" aria-label="Dress assets" role="group">
            ${dressTiles}
          </div>
        </section>
      </div>
      <div class="stage__status" data-status>Loading</div>
      <div class="loading-overlay" data-loading-overlay>
        <div class="loading-overlay__mark" aria-hidden="true"></div>
        <div class="loading-overlay__title">Loading</div>
        <div class="loading-overlay__detail" data-loading-detail>Preparing archive</div>
      </div>
    </main>
  `;

  return {
    stage: requireElement<HTMLElement>(mount, '.stage'),
    canvas: requireElement<HTMLCanvasElement>(mount, '.stage__canvas'),
    status: requireElement<HTMLElement>(mount, '[data-status]'),
    loadingOverlay: requireElement<HTMLElement>(mount, '[data-loading-overlay]'),
    loadingDetail: requireElement<HTMLElement>(mount, '[data-loading-detail]'),
  };
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing scene shell element: ${selector}`);
  }
  return element;
}
