import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
    testTimeout: 90_000,
    hookTimeout: 90_000,
    teardownTimeout: 90_000,
    fileParallelism: false,
  },
  resolve: {
    // Unit tests import TypeScript sources; package.json exports target dist for runtime consumers.
    alias: {
      "@lorsain/content-schema": path.join(root, "packages/content-schema/src/index.ts"),
      "@lorsain/content-loader/node": path.join(root, "packages/content-loader/src/node.ts"),
      "@lorsain/content-loader": path.join(root, "packages/content-loader/src/index.ts"),
      "@lorsain/sim": path.join(root, "packages/sim/src/index.ts"),
      "@lorsain/election-math": path.join(root, "packages/election-math/src/index.ts"),
      "@lorsain/map": path.join(root, "packages/map/src/index.ts"),
      "@lorsain/testing": path.join(root, "packages/testing/src/index.ts"),
    },
  },
});
