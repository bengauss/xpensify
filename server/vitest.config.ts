import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    pool: "forks",
    // Only discover source tests — never the compiled copies under dist/
    // (vitest 4 no longer excludes dist/ by default).
    include: ["src/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "node_modules/",
        "dist/",
        "src/test/",
        "src/index.ts",
        "src/db/seed-runner.ts",
        "**/*.config.ts",
        "**/*.test.ts",
      ],
    },
  },
});
