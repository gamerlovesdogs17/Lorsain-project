import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { featureId, hitFeature, prepareTerenaMap, type GeoJsonFeatureCollection } from "./index.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(resolve(repoRoot, rel), "utf8")) as T;
}

describe("derived Terena map geometry", () => {
  it("renders all 21 admin units, 48 constituencies, and 18 cities from GeoJSON", () => {
    const provinces = loadJson<GeoJsonFeatureCollection>("data/terena_provinces.geojson");
    const constituencies = loadJson<GeoJsonFeatureCollection>("data/terena_constituencies.geojson");
    const citiesFile = loadJson<{ cities: Array<{ id: string; name: string; province_id: string }> }>(
      "data/terena_cities.json",
    );
    const prepared = prepareTerenaMap(provinces, constituencies, citiesFile.cities);
    expect(provinces.features).toHaveLength(21);
    expect(constituencies.features).toHaveLength(48);
    expect(citiesFile.cities).toHaveLength(18);
    expect(prepared.provinces).toHaveLength(21);
    expect(prepared.constituencies).toHaveLength(48);
    expect(prepared.cities).toHaveLength(18);
    expect(prepared.provinces.every((p) => p.path.startsWith("M"))).toBe(true);
    expect(prepared.constituencies.every((p) => p.path.startsWith("M"))).toBe(true);
    expect(new Set(prepared.provinces.map((p) => p.id))).toEqual(
      new Set(provinces.features.map((f) => featureId(f))),
    );
    expect(prepared.provinces.find((p) => p.id === "FDV")?.name).toMatch(/Valen/i);
    const valen = prepared.cities.find((c) => c.id === "CITY18");
    expect(valen?.name).toBe("Valen");
    expect(valen?.provinceId).toBe("FDV");
    expect(hitFeature(prepared.provinces, "FDV")?.name).toMatch(/Valen/i);
    expect(hitFeature(prepared.constituencies, prepared.constituencies[0]!.id)?.name.length).toBeGreaterThan(
      1,
    );
  });
});
