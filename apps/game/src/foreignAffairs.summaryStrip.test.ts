import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Static regression: FA Overview must render MetricStrip once (desk map strip),
 * not a second Overview-only duplicate.
 */
describe("foreign affairs summary strip uniqueness", () => {
  it("renders MetricStrip with fa-summary-strip exactly once", () => {
    const src = readFileSync(resolve(__dirname, "foreignAffairsScreen.tsx"), "utf8");
    const markers = src.match(/data-qa="fa-summary-strip"/g) ?? [];
    expect(markers.length).toBe(1);
    const metricStrips = src.match(/<MetricStrip\b/g) ?? [];
    expect(metricStrips.length).toBe(1);
  });
});
