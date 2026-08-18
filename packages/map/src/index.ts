export {
  boundsOfFeatures,
  emptyBBox,
  extendBBox,
  featureId,
  featureName,
  fitViewBox,
  geometryCentroid,
  geometryToSvgPath,
  hitFeature,
  isValidBBox,
  prepareCities,
  prepareFeatures,
  prepareTerenaMap,
  projectLonLat,
  ringCentroid,
} from "./geometry.js";
export type {
  BBox,
  CanonicalCity,
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  GeoJsonGeometry,
  Position,
  PreparedCity,
  PreparedMap,
  PreparedPath,
  ViewTransform,
} from "./geometry.js";

/** Kept for reference-asset tooling. Not used as the runtime Terena map. */
export function extractSvgIds(svgText: string): string[] {
  const ids: string[] = [];
  const re = /\bid="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svgText)) !== null) {
    ids.push(m[1]!);
  }
  return ids;
}

export function indexSvgIds(svgText: string): Map<string, true> {
  return new Map(extractSvgIds(svgText).map((id) => [id, true as const]));
}
