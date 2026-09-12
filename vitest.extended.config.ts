import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import base from "./vitest.config.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const baseConfig = await base;

/**
 * Tier 2 — expensive acceptance / long-horizon / performance suites.
 * Not part of Normal Push Integration. Triggered by Extended Validation
 * (manual / weekly) via `pnpm test:extended`.
 */
export default defineConfig({
  ...baseConfig,
  test: {
    ...(baseConfig.test ?? {}),
    include: [
      "packages/sim/src/elections.test.ts",
      "packages/sim/src/campaigns.realism.test.ts",
      "packages/sim/src/phase12.autonomous-audit.test.ts",
      "packages/sim/src/phase15.longrun.test.ts",
      "packages/sim/src/phase15.multiseed.test.ts",
      "packages/sim/src/agents.perf.test.ts",
      "packages/sim/src/parties.perf.test.ts",
      "packages/election-math/src/performance.test.ts",
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
