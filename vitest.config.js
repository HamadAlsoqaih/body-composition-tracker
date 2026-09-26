import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    // The persona simulation harness is run by hand, never by `npm test` or CI.
    exclude: [...configDefaults.exclude, "tests/personas/**"],
    environment: "node",
    testTimeout: 120000,
  },
});
