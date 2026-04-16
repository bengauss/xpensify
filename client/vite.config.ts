import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    preact(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false,
      manifest: false, // already have public/manifest.json
      injectManifest: {
        injectionPoint: "self.__WB_MANIFEST",
      },
      devOptions: {
        enabled: false, // don't run SW in dev
      },
    }),
    visualizer({ open: false, filename: "dist/bundle-stats.html", template: "treemap", gzipSize: true }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@server": resolve(__dirname, "../server/src"),
    },
  },
  build: {
    modulePreload: {
      polyfill: true,
    },
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("motion")) return "motion";
          if (id.includes("dexie")) return "dexie";
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
