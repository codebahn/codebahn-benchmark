import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // seed/ is the benchmark fixture: a project with deliberately planted bugs
    // and failing tests. It must never be collected as part of the harness suite.
    include: ["src/**/*.test.ts"],
  },
});
