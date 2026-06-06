import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@server": resolve(__dirname, "../server/src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    pool: "forks",
    // Only discover source tests — never any compiled copies under dist/
    // (vitest 4 no longer excludes dist/ by default).
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "node_modules/",
        "dist/",
        "src/test/",
        "src/sw.ts",
        "src/main.tsx",
        "src/icons.ts",
        "**/*.config.ts",
        "**/*.test.ts",
        "**/*.test.tsx",
      ],
    },
  },
});
