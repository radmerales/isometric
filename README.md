# iso.city

A tiny endless isometric city builder for the browser. Pick a tool, click a
tile, and build a paper city along the river. The grid goes on forever, roads
and rivers connect on their own, and every change is saved to `localStorage`.
The static build deploys to GitHub Pages with no backend.

**Live:** <https://radmerales.github.io/isometric/>

<img src="preview.png" alt="Screenshot of the iso.city isometric city builder" width="1200" />

## Features

- Endless 12-way isometric grid with pan, zoom, and a seeded winding river
- Roads, houses, towers, trees, water, and erase tools
- Roads auto-connect; roads laid over water become bridges
- Buildings placed on water reclaim the land
- Live built/population counts and browser autosave
- Paper/ink visual language with a single yellow accent

## Stack

- **Vite + TypeScript** for the dev server and static production build
- **Hand-written CSS** in the paper/ink visual language
- **Inline SVG** for the infinite grid, river, bridges, and buildings
- **`localStorage`** for persistence

## Run

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

```bash
npm run build    # typecheck + build to dist/
npm run preview  # preview the production build
```

## Controls

| Input | Action |
| --- | --- |
| Click / tap | Build with the selected tool |
| Drag | Paint across tiles |
| Right-click | Clear a tile |
| `1` `2` `3` `4` | Road, House, Tower, Tree |
| `W` | Water |
| `X` or `E` | Erase |
| `H` | Toggle the pan tool |
| Space + drag / middle-drag | Pan |
| Wheel / pinch / `+` `-` | Zoom |
| `0` | Reset the view |

The **Clear** button removes buildings and roads but keeps the river. The eraser
removes structures first, then water.

## Deploy

The workflow at `.github/workflows/deploy-pages.yml` builds and deploys the site
on every push to `main`. In the repository settings, set **Pages → Source** to
**GitHub Actions**.

The Vite config uses `base: "./"` and the build includes `.nojekyll`, so the same
`dist/` works at a custom domain root or under `/<repository>/` on GitHub Pages.
