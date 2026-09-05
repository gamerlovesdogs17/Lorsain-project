import { useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
  prepareTerenaMap,
  type GeoJsonFeatureCollection,
  type PreparedMap,
  type PreparedPath,
} from "@lorsain/map";
import type { ContentBundle } from "@lorsain/content-loader";

export type MapMode = "political" | "election" | "campaign" | "economy";

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
  tooltipFor?: (sel: MapSelection) => ReactNode;
}) {
  const prepared = usePreparedTerenaMap(props.bundle);
  const showConstituencies = props.showConstituencies ?? props.mode !== "economy";
  const [view, setView] = useState(() => ({
    x: prepared.transform.minX,
    y: prepared.transform.minY,
    width: prepared.transform.width,
    height: prepared.transform.height,
  }));
  const [hovered, setHovered] = useState<MapSelection | null>(null);
  const [tip, setTip] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    viewX: number;
    viewY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const select = (selection: MapSelection) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    props.onSelect?.(selection);
  };
  const reset = () =>
    setView({
      x: prepared.transform.minX,
      y: prepared.transform.minY,
      width: prepared.transform.width,
      height: prepared.transform.height,
    });
  const zoom = (factor: number) =>
    setView((current) => {
      const width = Math.max(
        prepared.transform.width * 0.35,
        Math.min(prepared.transform.width, current.width * factor),
      );
      const height = Math.max(
        prepared.transform.height * 0.35,
        Math.min(prepared.transform.height, current.height * factor),
      );
      return {
        x: current.x + (current.width - width) / 2,
        y: current.y + (current.height - height) / 2,
        width,
        height,
      };
    });
  const showHover = (selection: MapSelection, event: PointerEvent<SVGElement>) => {
    const bounds = panelRef.current?.getBoundingClientRect();
    if (bounds) setTip({ x: event.clientX - bounds.left + 12, y: event.clientY - bounds.top + 12 });
    setHovered(selection);
    props.onHover?.(selection);
  };
  const clearHover = () => {
    setHovered(null);
    props.onHover?.(null);
  };
  const selectOnKey = (selection: MapSelection, key: string) => {
    if (key === "Enter" || key === " ") props.onSelect?.(selection);
  };
  return (
    <div className="map-panel" ref={panelRef}>
      <div className="map-controls" aria-label="Map view controls">
        <button type="button" aria-label="Zoom in" onClick={() => zoom(0.72)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoom(1.38)}>
          −
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
      </div>
      <svg
        ref={svgRef}
        className="terena-map"
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        role="img"
        aria-label="Terena map"
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          dragRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            viewX: view.x,
            viewY: view.y,
            moved: false,
          };
          suppressClickRef.current = false;
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          const bounds = svgRef.current?.getBoundingClientRect();
          if (!drag || drag.pointerId !== event.pointerId || !bounds) return;
          if (!drag.moved) {
            if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
            drag.moved = true;
            suppressClickRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          setView((current) => ({
            ...current,
            x: drag.viewX - (event.clientX - drag.x) * (current.width / bounds.width),
            y: drag.viewY - (event.clientY - drag.y) * (current.height / bounds.height),
          }));
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) {
            const moved = dragRef.current.moved;
            dragRef.current = null;
            if (moved)
              window.setTimeout(() => {
                suppressClickRef.current = false;
              }, 0);
          }
        }}
        onWheel={(event) => {
          event.preventDefault();
          zoom(event.deltaY > 0 ? 1.18 : 0.84);
        }}
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
            onClick={() => select({ id: p.id, kind: "province", name: p.name })}
            tabIndex={0}
            role="button"
            aria-label={p.name}
            onKeyDown={(event) =>
              selectOnKey({ id: p.id, kind: "province", name: p.name }, event.key)
            }
            onPointerEnter={(event) =>
              showHover({ id: p.id, kind: "province", name: p.name }, event)
            }
            onPointerMove={(event) =>
              showHover({ id: p.id, kind: "province", name: p.name }, event)
            }
            onPointerLeave={clearHover}
          />
        ))}
        {showConstituencies
          ? prepared.constituencies.map((c) => (
              <path
                key={c.id}
                d={c.path}
                className={`map-constituency${props.selectedId === c.id ? " is-selected" : ""}`}
                data-id={c.id}
                fill={props.fillFor?.(c, "constituency") ?? "transparent"}
                onClick={() => select({ id: c.id, kind: "constituency", name: c.name })}
                tabIndex={0}
                role="button"
                aria-label={c.name}
                onKeyDown={(event) =>
                  selectOnKey({ id: c.id, kind: "constituency", name: c.name }, event.key)
                }
                onPointerEnter={(event) =>
                  showHover({ id: c.id, kind: "constituency", name: c.name }, event)
                }
                onPointerMove={(event) =>
                  showHover({ id: c.id, kind: "constituency", name: c.name }, event)
                }
                onPointerLeave={clearHover}
              />
            ))
          : null}
        {prepared.cities.map((city) => (
          <g key={city.id} className="map-city">
            <circle
              cx={city.x}
              cy={city.y}
              r={prepared.transform.width * 0.0045}
              onClick={() => select({ id: city.id, kind: "city", name: city.name })}
              tabIndex={0}
              role="button"
              aria-label={city.name}
              onKeyDown={(event) =>
                selectOnKey({ id: city.id, kind: "city", name: city.name }, event.key)
              }
              onPointerEnter={(event) =>
                showHover({ id: city.id, kind: "city", name: city.name }, event)
              }
              onPointerMove={(event) =>
                showHover({ id: city.id, kind: "city", name: city.name }, event)
              }
              onPointerLeave={clearHover}
            />
          </g>
        ))}
      </svg>
      {hovered ? (
        <div className="map-tooltip" role="status" style={{ left: tip.x, top: tip.y }}>
          {props.tooltipFor?.(hovered) ?? <strong>{hovered.name}</strong>}
        </div>
      ) : null}
    </div>
  );
}
