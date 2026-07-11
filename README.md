# Sarmi Three-Theme Demo

A standalone Three.js editorial demo containing only:

1. Invisible Cities — the historical colorful study.
2. Dialectic — the historical orange/blue split study.
3. Wind Archive — the current cursor-driven photographic study.

The interface uses a permanent, narrow right-side rail for theme switching
only. Dress arrows and the optional Explore panel remain inside each visual
experience. All controls use square geometry, hairline borders, bare
typography, and no shadows.

## Run locally

```bash
npm install
npm run dev
```

Production check:

```bash
npm run build
```

See [THEMES.md](./THEMES.md) before editing themes or dress assets.
See [docs/architecture.md](./docs/architecture.md) for module ownership,
extension paths, rendering order, and mobile GPU constraints.
