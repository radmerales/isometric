import { defineConfig } from "vite"

// Relative asset URLs keep the build portable: the same `dist/` works at a
// custom domain root and under /<repository>/ on GitHub Pages.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
  },
})
