import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import base from "./vitest.config.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const baseConfig = await base;

/**
 * Long integration cases need a single fork and extended timeouts.
 * Do NOT merge `include` arrays with the unit config — Vite mergeConfig
 * concatenates arrays and would pull the entire unit suite into Integration.
 * Do NOT globally ignore unhandled errors; use scripts/run-vitest-honest.mjs.
 */
export default defineConfig({
  ...baseConfig,
  test: {
    ...(baseConfig.test ?? {}),
    include: [
      "packages/sim/src/foreign.test.ts",
      "packages/sim/src/foreign.determinism.test.ts",
      "packages/sim/src/elections.test.ts",
      "packages/sim/src/campaigns.realism.test.ts",
      "packages/sim/src/terena.integration.test.ts",
      "packages/sim/src/phase11.integration.test.ts",
      "packages/sim/src/phase11.closeout.test.ts",
      "packages/sim/src/phase11_2.governor.test.ts",
      "packages/sim/src/phase11_2.systems.test.ts",
      "packages/sim/src/phase11_3.institutions.test.ts",
      "packages/sim/src/playable-path.test.ts",
      "packages/sim/src/campaigns.vertical.test.ts",
      "packages/sim/src/legislature.vertical.test.ts",
      "packages/sim/src/phase12.autonomous-audit.test.ts",
      "packages/sim/src/phase15.longrun.test.ts",
      "packages/sim/src/phase15.multiseed.test.ts",
      "scripts/dist-exports.smoke.test.ts",
    ],
    exclude: [
      ...(baseConfig.test?.exclude ?? []),
      "packages/sim/src/phase15.certification.test.ts",
    ],
    testTimeout: 900_000,
    hookTimeout: 180_000,
    teardownTimeout: 180_000,
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    root,
  },
});
