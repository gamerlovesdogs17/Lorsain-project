import { useMemo } from "react";
import {
  prepareTerenaMap,
  type GeoJsonFeatureCollection,
  type PreparedMap,
  type PreparedPath,
} from "@lorsain/map";
import type { ContentBundle } from "@lorsain/content-loader";

export type MapMode = "political" | "election" | "campaign" | "economy" | "organizations";

export type MapSelection = {
  id: string;
  kind: "province" | "constituency" | "city";
  name: string;
};

export function usePreparedTerenaMap(bundle: ContentBundle): PreparedMap {
  return useMemo(() => {
    return prepareTerenaMap(
      bundle.content.terena_provinces as GeoJsonFeatureCollection,
      bundle.content.terena_constituencies as GeoJsonFeatureCollection,
      bundle.content.terena_cities.cities as Array<{
        id: string;
        name: string;
        province_id: string;
      }>,
    );
  }, [bundle]);
}

export function TerenaMap(props: {
  bundle: ContentBundle;
  mode: MapMode;
  selectedId?: string | null;
  fillFor?: (feature: PreparedPath, kind: "province" | "constituency") => string | undefined;
  onSelect?: (sel: MapSelection) => void;
  onHover?: (sel: MapSelection | null) => void;
  showConstituencies?: boolean;
}) {
  const prepared = usePreparedTerenaMap(props.bundle);
  const showConstituencies = props.showConstituencies ?? props.mode !== "economy";
  return (
    <div className="map-panel">
      <svg
        className="terena-map"
        viewBox={prepared.transform.viewBox}
        role="img"
        aria-label="Terena map"
      >
        <rect
          x={prepared.transform.minX}
          y={prepared.transform.minY}
          width={prepared.transform.width}
          height={prepared.transform.height}
          className="map-water"
        />
        {prepared.provinces.map((p) => (
          <path
            key={p.id}
            d={p.path}
            className={`map-province${props.selectedId === p.id ? " is-selected" : ""}`}
            data-id={p.id}
            fill={props.fillFor?.(p, "province") ?? "#e7efe6"}
            onClick={() => props.onSelect?.({ id: p.id, kind: "province", name: p.name })}
            onMouseEnter={() => {
              props.onHover?.({ id: p.id, kind: "province", name: p.name });
            }}
            onMouseLeave={() => props.onHover?.(null)}
          >
            <title>{p.name}</title>
          </path>
        ))}
        {showConstituencies
          ? prepared.constituencies.map((c) => (
              <path
                key={c.id}
                d={c.path}
                className={`map-constituency${props.selectedId === c.id ? " is-selected" : ""}`}
                data-id={c.id}
                fill={props.fillFor?.(c, "constituency") ?? "transparent"}
                onClick={() => props.onSelect?.({ id: c.id, kind: "constituency", name: c.name })}
                onMouseEnter={() => {
                  props.onHover?.({ id: c.id, kind: "constituency", name: c.name });
                }}
                onMouseLeave={() => props.onHover?.(null)}
              >
                <title>{c.name}</title>
              </path>
            ))
          : null}
        {prepared.cities.map((city) => (
          <g
            key={city.id}
            className="map-city"
            onClick={() => props.onSelect?.({ id: city.id, kind: "city", name: city.name })}
            onMouseEnter={() =>
              props.onHover?.({ id: city.id, kind: "city", name: city.name })
            }
          >
            <circle cx={city.x} cy={city.y} r={prepared.transform.width * 0.0045} />
            <title>{city.name}</title>
          </g>
        ))}
      </svg>
    </div>
  );
}
