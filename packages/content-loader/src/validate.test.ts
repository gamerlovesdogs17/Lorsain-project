import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadContentBundleFromRepo, validateCanonicalContentFromRepo } from "./node.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

describe("canonical content validation", () => {
  it("passes for the repository content package", () => {
    const report = validateCanonicalContentFromRepo(repoRoot);
    const errors = report.issues.filter((i) => i.level === "error");
    expect(errors, errors.map((e) => e.message).join("\n")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("builds a typed immutable ContentBundle with index accessors", () => {
    const bundle = loadContentBundleFromRepo(repoRoot);
    expect(bundle.content.scenario.country_id).toBe("TER");
    expect(bundle.content.canonical_crosswalk.terena.world_country_id).toBe("W41");
    expect(bundle.index.hasPartyId("PARTY_LAB")).toBe(true);
    expect(bundle.index.hasWorldCountryId("W41")).toBe(true);
    expect(Object.isFrozen(bundle)).toBe(true);
    expect(Object.isFrozen(bundle.content)).toBe(true);
    // Index must not expose mutable Set surfaces.
    expect((bundle.index as { worldCountryIds: unknown }).worldCountryIds).toBeTypeOf("function");
    const ids = bundle.index.partyIds();
    expect(Object.isFrozen(ids)).toBe(true);
    expect(bundle.pendingPresidentialEligibility?.status).toBe(
      "draft_defaults_pending_content_approval",
    );
  });
});
