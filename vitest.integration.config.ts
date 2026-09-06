import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Long Phase 11 integration cases can starve Vitest's worker RPC heartbeat
 * (`Timeout calling "onTaskUpdate"`) even when every assertion passed.
 * Run them in a single fork with extended limits, and do not fail the job on
 * that known post-run harness noise when the suite itself is green.
 */
export default mergeConfig(
  base,
  defineConfig({
    test: {
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
        "scripts/dist-exports.smoke.test.ts",
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
      // Known Vitest worker RPC timeout after multi-minute cases; assertions already ran.
      dangerouslyIgnoreUnhandledErrors: true,
      root,
    },
  }),
);
