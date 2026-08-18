/** Pure GeoJSON helpers. No React, no DOM, no simulation state. */

export type Position = [number, number];

export type GeoJsonGeometry =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] }
  | { type: "Point"; coordinates: Position };

export type GeoJsonFeature = {
  type: "Feature";
  id?: string | number;
  properties?: Record<string, unknown> | null;
  geometry: GeoJsonGeometry | null;
};

export type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

export type ViewTransform = {
  minX: number;
  minY: number;
  width: number;
  height: number;
  viewBox: string;
};

export type PreparedPath = {
  id: string;
  name: string;
  path: string;
  centroid: Position;
  bbox: BBox;
};

export type PreparedCity = {
  id: string;
  name: string;
  provinceId: string;
  x: number;
  y: number;
};

const SVG_WIDTH = 1000;
const SVG_HEIGHT = 720;

export function featureId(feature: GeoJsonFeature): string {
  const props = feature.properties ?? {};
  if (typeof props.id === "string" && props.id.length > 0) return props.id;
  if (typeof feature.id === "string" && feature.id.length > 0) return feature.id;
  if (typeof feature.id === "number") return String(feature.id);
  return "";
}

export function featureName(feature: GeoJsonFeature): string {
  const props = feature.properties ?? {};
  if (typeof props.name === "string" && props.name.length > 0) return props.name;
  return featureId(feature);
}

export function extendBBox(box: BBox, x: number, y: number): void {
  if (x < box.minX) box.minX = x;
  if (y < box.minY) box.minY = y;
  if (x > box.maxX) box.maxX = x;
  if (y > box.maxY) box.maxY = y;
}

export function emptyBBox(): BBox {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function isValidBBox(box: BBox): boolean {
  return Number.isFinite(box.minX) && Number.isFinite(box.maxX) && box.maxX > box.minX;
}

function walkCoords(geometry: GeoJsonGeometry | null, visit: (x: number, y: number) => void): void {
  if (!geometry) return;
  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates) for (const [x, y] of ring) visit(x, y);
    return;
  }
  if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates) {
      for (const ring of poly) for (const [x, y] of ring) visit(x, y);
    }
  }
}

export function boundsOfFeatures(features: GeoJsonFeature[]): BBox {
  const box = emptyBBox();
  for (const f of features) walkCoords(f.geometry, (x, y) => extendBBox(box, x, y));
  return box;
}

export function fitViewBox(bounds: BBox, padding = 0.045): ViewTransform {
  const padX = (bounds.maxX - bounds.minX) * padding;
  const padY = (bounds.maxY - bounds.minY) * padding;
  const minX = bounds.minX - padX;
  const minY = bounds.minY - padY;
  const width = bounds.maxX - bounds.minX + padX * 2;
  const height = bounds.maxY - bounds.minY + padY * 2;
  return { minX, minY, width, height, viewBox: `${minX} ${minY} ${width} ${height}` };
}

/** Geographic lon/lat → SVG, flipping latitude so north is up. */
export function projectLonLat(
  lon: number,
  lat: number,
  transform: ViewTransform,
): Position {
  const x = lon;
  const y = transform.minY + transform.height - (lat - transform.minY);
  return [x, y];
}

function ringPath(ring: Position[], transform: ViewTransform): string {
  if (ring.length === 0) return "";
  const parts: string[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i]!;
    const [x, y] = projectLonLat(lon, lat, transform);
    parts.push(`${i === 0 ? "M" : "L"}${x.toFixed(4)} ${y.toFixed(4)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

export function geometryToSvgPath(
  geometry: GeoJsonGeometry | null,
  transform: ViewTransform,
): string {
  if (!geometry) return "";
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map((ring) => ringPath(ring, transform)).join(" ");
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .map((poly) => poly.map((ring) => ringPath(ring, transform)).join(" "))
      .join(" ");
  }
  return "";
}

export function ringCentroid(ring: Position[]): Position {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i]!;
    const [x1, y1] = ring[i + 1]!;
    const f = x0 * y1 - x1 * y0;
    twiceArea += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(twiceArea) < 1e-12) {
    const n = Math.max(1, ring.length);
    const sx = ring.reduce((s, p) => s + p[0], 0) / n;
    const sy = ring.reduce((s, p) => s + p[1], 0) / n;
    return [sx, sy];
  }
  return [cx / (3 * twiceArea), cy / (3 * twiceArea)];
}

export function geometryCentroid(geometry: GeoJsonGeometry | null): Position | null {
  if (!geometry) return null;
  if (geometry.type === "Polygon") return ringCentroid(geometry.coordinates[0] ?? []);
  if (geometry.type === "MultiPolygon") {
    let best: Position | null = null;
    let bestN = -1;
    for (const poly of geometry.coordinates) {
      const outer = poly[0] ?? [];
      if (outer.length > bestN) {
        bestN = outer.length;
        best = ringCentroid(outer);
      }
    }
    return best;
  }
  if (geometry.type === "Point") return geometry.coordinates;
  return null;
}

export function prepareFeatures(
  features: GeoJsonFeature[],
  transform: ViewTransform,
): PreparedPath[] {
  const out: PreparedPath[] = [];
  for (const feature of features) {
    const id = featureId(feature);
    if (!id) continue;
    const path = geometryToSvgPath(feature.geometry, transform);
    if (!path) continue;
    const geoC = geometryCentroid(feature.geometry) ?? [0, 0];
    const centroid = projectLonLat(geoC[0], geoC[1], transform);
    const bbox = emptyBBox();
    walkCoords(feature.geometry, (lon, lat) => {
      const [x, y] = projectLonLat(lon, lat, transform);
      extendBBox(bbox, x, y);
    });
    out.push({ id, name: featureName(feature), path, centroid, bbox });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

export type CanonicalCity = {
  id: string;
  name: string;
  province_id?: string;
  provinceId?: string;
};

export function prepareCities(
  cities: CanonicalCity[],
  provinces: PreparedPath[],
): PreparedCity[] {
  const byProvince = new Map<string, PreparedPath>();
  for (const p of provinces) byProvince.set(p.id, p);
  const counts = new Map<string, number>();
  const out: PreparedCity[] = [];
  for (const city of [...cities].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const provinceId = city.province_id ?? city.provinceId ?? "";
    const province = byProvince.get(provinceId);
    const n = counts.get(provinceId) ?? 0;
    counts.set(provinceId, n + 1);
    const [cx, cy] = province?.centroid ?? [0, 0];
    const angle = n * 1.7;
    const radius = n === 0 ? 0 : 0.08 + n * 0.05;
    out.push({
      id: city.id,
      name: city.name,
      provinceId,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  }
  return out;
}

export type PreparedMap = {
  transform: ViewTransform;
  provinces: PreparedPath[];
  constituencies: PreparedPath[];
  cities: PreparedCity[];
  svgWidth: number;
  svgHeight: number;
};

export function prepareTerenaMap(
  provinces: GeoJsonFeatureCollection,
  constituencies: GeoJsonFeatureCollection,
  cities: CanonicalCity[],
): PreparedMap {
  const bounds = boundsOfFeatures([...provinces.features, ...constituencies.features]);
  const transform = isValidBBox(bounds)
    ? fitViewBox(bounds)
    : { minX: 0, minY: 0, width: SVG_WIDTH, height: SVG_HEIGHT, viewBox: `0 0 ${SVG_WIDTH} ${SVG_HEIGHT}` };
  const provincePaths = prepareFeatures(provinces.features, transform);
  const constituencyPaths = prepareFeatures(constituencies.features, transform);
  return {
    transform,
    provinces: provincePaths,
    constituencies: constituencyPaths,
    cities: prepareCities(cities, provincePaths),
    svgWidth: SVG_WIDTH,
    svgHeight: SVG_HEIGHT,
  };
}

export function hitFeature(prepared: PreparedPath[], id: string): PreparedPath | null {
  return prepared.find((p) => p.id === id) ?? null;
}
