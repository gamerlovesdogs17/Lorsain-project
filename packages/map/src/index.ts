/** SVG/GeoJSON helpers (no React). Full overlay tooling comes with the UI phase. */

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
