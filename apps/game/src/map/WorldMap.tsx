import { useMemo } from "react";
import type { ContentBundle } from "@lorsain/content-loader";
import { TERENA_WORLD_ID } from "@lorsain/sim";

export type WorldMapMode = "relation" | "alliance" | "crisis" | "sanctions" | "posture";

export type WorldMapPath = {
  id: string;
  d: string;
  name?: string;
  label?: { x: number; y: number };
};

const WORLD_VIEWBOX = "0 0 1912 948";

function parseWorldMapPaths(
  svgText: string,
  poles: Map<string, [number, number]>,
  names: Map<string, string>,
): WorldMapPath[] {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const paths: WorldMapPath[] = [];
  for (let i = 1; i <= 48; i += 1) {
    const id = `W${String(i).padStart(2, "0")}`;
    const el = doc.getElementById(id);
    if (!el || el.tagName.toLowerCase() !== "path") continue;
    const d = el.getAttribute("d");
    if (!d) continue;
    const pole = poles.get(id);
    const name = names.get(id);
    const entry: WorldMapPath = { id, d };
    if (name) entry.name = name;
    if (pole) entry.label = { x: pole[0], y: pole[1] };
    paths.push(entry);
  }
  return paths;
}

export function useWorldMapPaths(bundle: ContentBundle): WorldMapPath[] {
  return useMemo(() => {
    const poles = new Map<string, [number, number]>();
    const names = new Map<string, string>();
    for (const c of bundle.content.world_countries.countries ?? []) {
      const pathId = c.map_path_id ?? c.id;
      if (Array.isArray(c.map_pole) && c.map_pole.length >= 2) {
        poles.set(pathId, [Number(c.map_pole[0]), Number(c.map_pole[1])]);
      }
      if (c.name) names.set(pathId, c.name);
    }
    return parseWorldMapPaths(bundle.content.world_svg, poles, names);
  }, [bundle]);
}

export function WorldMap(props: {
  bundle: ContentBundle;
  mode: WorldMapMode;
  selectedId?: string | null;
  fillFor?: (countryId: string) => string | undefined;
  onSelect?: (countryId: string) => void;
  onHover?: (countryId: string | null) => void;
  showLabels?: boolean;
}) {
  const paths = useWorldMapPaths(props.bundle);
  const showLabels = props.showLabels ?? false;

  return (
    <div className="map-panel world-map-panel">
      <svg
        className="world-map"
        viewBox={WORLD_VIEWBOX}
        role="img"
        aria-label="World political map"
      >
        <rect x={0} y={0} width={1912} height={948} className="map-water" />
        {paths.map((p) => (
          <path
            key={p.id}
            d={p.d}
            className={`map-country${props.selectedId === p.id ? " is-selected" : ""}${
              p.id === TERENA_WORLD_ID ? " is-home" : ""
            }`}
            data-id={p.id}
            fill={props.fillFor?.(p.id) ?? "#e3e8e0"}
            onClick={() => props.onSelect?.(p.id)}
            onMouseEnter={() => props.onHover?.(p.id)}
            onMouseLeave={() => props.onHover?.(null)}
          >
            <title>{p.name ?? p.id}</title>
          </path>
        ))}
        {showLabels
          ? paths.map((p) =>
              p.label ? (
                <text
                  key={`label-${p.id}`}
                  x={p.label.x}
                  y={p.label.y}
                  className="map-country-label"
                  pointerEvents="none"
                >
                  {p.name?.split(" ").slice(-1)[0] ?? p.id}
                </text>
              ) : null,
            )
          : null}
      </svg>
    </div>
  );
}
