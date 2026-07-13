import { defineConfig } from "vite";

import { createLocalMediaVitePlugin } from "./src/local-media/vite-plugin.js";

export default defineConfig({
  appType: "spa",
  plugins: [createLocalMediaVitePlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: false
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false
  }
});
