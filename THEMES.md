# Theme Registry

The public app contains exactly three studies:

| route | internal id | public label | source |
| --- | --- | --- | --- |
| `invisible-cities` | `mew-holo` | Invisible Cities | historical colorful branch |
| `dialectic` | `blue` | Dialectic | historical orange/blue split composition |
| `wind-archive` | `tabla-rasa` | Wind Archive | current photo-print branch, renamed |

Invisible Cities is the default. Examples:

- `/?theme=dialectic`
- `/?theme=wind-archive&dress=patchwork`
- `/` for Invisible Cities with the original dress

## Ordinary editorial changes

Edit `src/config/themes.ts`. `PUBLIC_THEMES` controls:

- order in the right rail;
- public names and URL routes;
- minimal instructions;
- rail summaries and active color;
- renderer palette values.

Edit `src/config/dresses.ts` to replace a GLB, rename a dress, or add another
dress. The in-theme arrows, Dialectic tiles, URL state, and labels derive from
this registry.

## Adding a new visual renderer mode

1. Add the public metadata and palette to `PUBLIC_THEMES`.
2. Extend the theme id/type and mode maps near the top of `src/main.ts`.
3. Add the GPU background function inside `createInfiniteBackdropMaterial()`.
4. Route the new mode in that shader's `main()` function.
5. Add only genuinely theme-specific scene visibility to
   `applyCycloramaBackgroundPreset()` or `updateThemeObjectVisibility()`.

The right rail and URL state should not need custom markup for a new theme.
Theme-specific editorial composition belongs in `src/ui/sceneShell.ts` and its
styles in `src/style.css`.

## UI modules

- `src/ui/editorialRail.ts` — the separate theme-switching rail only.
- `src/ui/editorialRail.css` — the rail's isolated brutalist/editorial styles.
- `src/ui/experienceControls.ts` — in-theme Explore panel and dress arrows.
- `src/ui/experienceControls.css` — shared in-theme control styling.
- `src/ui/sceneShell.ts` — renderer mount points and theme-specific editorial
  composition.
- `src/state/urlState.ts` — stable theme/dress URL parsing and updates.

## Interaction invariants

- Theme navigation owns a real right-side viewport column and never overlays
  the artwork.
- The theme rail contains no dress controls or instructions.
- Every theme uses the same previous/next dress arrows.
- Dialectic keeps its orange archive panel beside the blue 3D pane.
- Invisible Cities keeps the historical chromatic field, floating forms,
  feathered canvas bleed, and internal dress gallery.
- Wind Archive prints spawn only away from the dress, scale down on narrow
  viewports, and become invisible whenever their projected bounds would cover
  the garment.
- No public route exposes retained legacy renderer experiments.
