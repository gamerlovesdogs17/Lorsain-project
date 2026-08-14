import { describe, expect, it } from "vitest";
import { createRngService } from "@lorsain/sim";
import { countIrv } from "@lorsain/election-math";

/**
 * Smoke test that package.json exports resolve to built dist modules.
 * Run after `pnpm build`.
 */
describe("built package exports smoke", () => {
  it("imports @lorsain/sim from package exports (dist)", async () => {
    // Dynamic import without vitest alias bypasses by using absolute dist path.
    const mod = await import("../packages/sim/dist/index.js");
    const rng = mod.createRngService("smoke");
    expect(rng.uint32("flavor")).toBeTypeOf("number");
    expect(createRngService).toBeTypeOf("function");
  });

  it("imports @lorsain/content-loader and /node from dist", async () => {
    const core = await import("../packages/content-loader/dist/index.js");
    const node = await import("../packages/content-loader/dist/node.js");
    expect(core.validateCanonicalContent).toBeTypeOf("function");
    expect(node.loadContentBundleFromRepo).toBeTypeOf("function");
    // Core entry must not re-export Node FS helpers.
    expect("loadContentBundleFromRepo" in core).toBe(false);
  });

  it("election-math is importable from dist", async () => {
    const mod = await import("../packages/election-math/dist/index.js");
    expect(mod.countIrv).toBeTypeOf("function");
    expect(mod.countStv).toBeTypeOf("function");
    expect(mod.ELECTION_MATH_PHASE).toBe("0.5_complete");
    expect(countIrv).toBeTypeOf("function");
  });
});
