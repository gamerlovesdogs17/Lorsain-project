import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Static regression: Overview must not render a second Sitting/Majority BriefStrip
 * beside the WorkLayout header strip.
 */
describe("assembly summary strip uniqueness", () => {
  it("renders BriefStrip with assembly-summary-strip once and no Overview duplicate", () => {
    const src = readFileSync(resolve(__dirname, "assemblyScreen.tsx"), "utf8");
    const summaryMarkers = src.match(/data-qa="assembly-summary-strip"/g) ?? [];
    expect(summaryMarkers.length).toBe(1);
    // Overview compositionHeader must not repeat Sitting/Majority BriefStrip items.
    const compositionStart = src.indexOf("const compositionHeader");
    const compositionEnd = src.indexOf("const votesRail", compositionStart);
    const composition =
      compositionStart >= 0 && compositionEnd > compositionStart
        ? src.slice(compositionStart, compositionEnd)
        : src.slice(compositionStart, compositionStart + 2500);
    expect(composition).not.toMatch(/label:\s*"Sitting"/);
    expect(composition).not.toMatch(/label:\s*"Majority"/);
    expect(composition).not.toMatch(/label:\s*"On floor"/);
    expect(composition).not.toMatch(/label:\s*"Votes due"/);
  });
});
