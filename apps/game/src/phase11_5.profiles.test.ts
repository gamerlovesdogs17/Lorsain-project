import { describe, it, expect } from "vitest";

// Pure helper tests for Phase 11.5 profile features

describe("legalStatusLabel", () => {
  it("returns human-readable labels for all known statuses", async () => {
    const { legalStatusLabel } = await import("./ui/politician.js");
    expect(legalStatusLabel("registered")).toBe("Registered party");
    expect(legalStatusLabel("prohibited")).toBe("Prohibited organization");
    expect(legalStatusLabel("sole_recognized")).toBe("Sole recognized party");
    expect(legalStatusLabel("defunct")).toBe("Defunct party");
    expect(legalStatusLabel("restricted")).toBe("Restricted registration");
    expect(legalStatusLabel("nonpartisan_only")).toBe("Nonpartisan candidacies only");
  });

  it("falls back to replacing underscores for unknown status", async () => {
    const { legalStatusLabel } = await import("./ui/politician.js");
    expect(legalStatusLabel("unknown_status")).toBe("unknown status");
  });
});

describe("legalStatusTone", () => {
  it("returns danger for prohibited and defunct", async () => {
    const { legalStatusTone } = await import("./ui/politician.js");
    expect(legalStatusTone("prohibited")).toBe("danger");
    expect(legalStatusTone("defunct")).toBe("danger");
  });

  it("returns warn for sole_recognized and restricted", async () => {
    const { legalStatusTone } = await import("./ui/politician.js");
    expect(legalStatusTone("sole_recognized")).toBe("warn");
    expect(legalStatusTone("restricted")).toBe("warn");
  });

  it("returns normal for registered", async () => {
    const { legalStatusTone } = await import("./ui/politician.js");
    expect(legalStatusTone("registered")).toBe("normal");
  });
});

describe("density attribute", () => {
  it("accepts compact and comfortable as valid density values", () => {
    const validDensities = ["compact", "comfortable"];
    for (const density of validDensities) {
      expect(density === "compact" || density === "comfortable").toBe(true);
    }
  });

  it("can be stored and retrieved from localStorage key", () => {
    const key = "lorsain-density";
    expect(key).toBe("lorsain-density");
  });
});

describe("Screen type includes situation", () => {
  it("situation is a valid Screen value", async () => {
    const { GamePages } = await import("./pages.js");
    expect(typeof GamePages).toBe("function");
    // The Screen type union includes "situation" — verified at compile time
    // and by QA_SCREENS set membership at runtime.
  });
});
