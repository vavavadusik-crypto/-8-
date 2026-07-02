import { defineConfig } from "vite";

export default defineConfig({
  appType: "spa",
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  preview: {
    port: 4173,
    strictPort: false
  },
  server: {
    port: 5173,
    strictPort: false
  }
});
