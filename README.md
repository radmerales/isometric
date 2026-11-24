# iso.city

A tiny isometric city builder for the browser. Pick a tool, click a tile, and
build your own twelve-by-twelve paper city. Roads connect on their own, every
change is saved to `localStorage`, and the static build deploys to GitHub Pages
with no backend.

**Live:** <https://radmerales.github.io/isometric/>

<img src="preview.png" alt="Screenshot of the iso.city isometric city builder" width="1200" />

## Stack

- **Vite + TypeScript** for the dev server and static production build
- **Hand-written CSS** in the paper/ink visual language
- **Inline SVG** for the isometric grid and buildings
- **localStorage** for persistence

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
| `X` or `E` | Erase |

## Deploy

The workflow at `.github/workflows/deploy-pages.yml` builds and deploys the site
on every push to `main`. In the repository settings, set **Pages → Source** to
**GitHub Actions**.

The Vite config uses `base: "./"` and the build includes `.nojekyll`, so the same
`dist/` works at a custom domain root or under `/<repository>/` on GitHub Pages.
