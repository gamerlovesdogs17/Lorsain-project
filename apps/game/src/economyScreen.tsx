import { storiesChronological, type KernelWorld, type SimState } from "@lorsain/sim";
import { useMemo, useState } from "react";
import {
  DataTable,
  EmptyState,
  EntityRow,
  MapDetailLayout,
  MetricStrip,
  PageHeader,
  SectionDivider,
  StatCard,
  TabBar,
  WorkLayout,
} from "./ui/kit.js";
import { MapLegend } from "./ui/mapLegend.js";
import { TerenaMap, type MapSelection } from "./map/TerenaMap.js";
import type { ContentBundle } from "@lorsain/content-loader";
import { formatIndexDelta } from "./presentation/display.js";

const INDICATORS = [
  { id: "outputIndex", label: "Output" },
  { id: "employmentIndex", label: "Employment" },
  { id: "priceIndex", label: "Prices" },
  { id: "realWageIndex", label: "Wages" },
  { id: "housingIndex", label: "Housing" },
  { id: "confidenceIndex", label: "Confidence" },
] as const;

type IndicatorId = (typeof INDICATORS)[number]["id"];
type RegionalView = "table" | "map";

function chartPath(history: Array<{ date: string; value: number }>): {
  d: string;
  min: number;
  max: number;
} {
  const w = 640;
  const h = 180;
  const pad = 28;
  if (history.length === 0) return { d: "", min: 100, max: 100 };
  const values = history.map((p) => p.value);
  const min = Math.min(...values, 95);
  const max = Math.max(...values, 105);
  const span = Math.max(0.5, max - min);
  const d = history
    .map((p, i) => {
      const x = pad + (history.length === 1 ? 0 : (i / (history.length - 1)) * (w - pad * 2));
      const y = pad + (1 - (p.value - min) / span) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return { d, min, max };
}

function idx1(n: number): string {
  return n.toFixed(1);
}

function provinceNameMap(bundle: ContentBundle): Map<string, string> {
  const names = new Map<string, string>();
  for (const f of (bundle.content.terena_provinces?.features ?? []) as Array<{
    properties?: { id?: string; name?: string };
  }>) {
    if (f.properties?.id && f.properties?.name) {
      names.set(f.properties.id, f.properties.name);
    }
  }
  return names;
}

export function EconomyPage(props: {
  world: KernelWorld;
  snap: SimState;
  bundle: ContentBundle;
}) {
  const n = props.snap.economyRuntime.national;
  const [sel, setSel] = useState<MapSelection | null>(null);
  const [indicator, setIndicator] = useState<IndicatorId>("outputIndex");
  const [regionalView, setRegionalView] = useState<RegionalView>("table");
  const region = sel?.kind === "province" ? props.snap.economyRuntime.provinces[sel.id] : null;
  const history = props.snap.economyRuntime.history;
  const prev = history.length >= 2 ? history[history.length - 2]! : null;
  const yearAgo = history.length >= 13 ? history[history.length - 13]! : null;
  const start = history[0] ?? null;
  const deltaHint = (key: IndicatorId) => {
    if (!prev) return "Index = 100";
    const m = formatIndexDelta(n[key] - prev[key]);
    const y = yearAgo ? formatIndexDelta(n[key] - yearAgo[key]) : "—";
    return `${m} mo · ${y} 12m`;
  };
  const series = history.map((h) => ({ date: h.date, value: h[indicator] }));
  const chart = chartPath(series);
  const stories = useMemo(
    () => storiesChronological(props.snap).filter((s) => s.category === "economy").slice(0, 4),
    [props.snap],
  );
  const current = n[indicator];
  const currentDelta = prev ? current - prev[indicator] : 0;
  const longDelta = start ? current - start[indicator] : 0;
  const regionSeries =
    sel?.kind === "province"
      ? (props.snap.economyRuntime.provinceHistory[sel.id] ?? []).map((point) => ({
          date: point.date,
          value: point.conditionsIndex,
        }))
      : [];
  const regionChart = chartPath(regionSeries);

  const provinceRows = useMemo(() => {
    const placeNames = provinceNameMap(props.bundle);
    return Object.entries(props.snap.economyRuntime.provinces)
      .map(([id, data]) => {
        const hist = props.snap.economyRuntime.provinceHistory[id] ?? [];
        const pPrev = hist.length >= 2 ? hist[hist.length - 2]! : null;
        const pYear = hist.length >= 13 ? hist[hist.length - 13]! : null;
        return {
          id,
          name: placeNames.get(id) ?? id,
          data,
          monthDelta: pPrev ? data.conditionsIndex - pPrev.conditionsIndex : null,
          yearDelta: pYear ? data.conditionsIndex - pYear.conditionsIndex : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [props.bundle, props.snap.economyRuntime.provinceHistory, props.snap.economyRuntime.provinces]);

  const shocks = props.snap.economyRuntime.shocks.slice(-12).reverse();
  const lagged = props.snap.economyRuntime.laggedEffects.slice(-12).reverse();

  return (
    <WorkLayout
      header={
        <PageHeader
          kicker="Political economy"
          title="Economy"
          subtitle="Public scenario indices (reference 100). January 2028 starts uneven."
        />
      }
      main={
        <>
          <SectionDivider title="Key indicators" hint="Month and 12-month moves when history allows" />
          <MetricStrip>
            {INDICATORS.map((ind) => (
              <StatCard
                key={ind.id}
                label={ind.label}
                value={idx1(n[ind.id])}
                hint={deltaHint(ind.id)}
              />
            ))}
          </MetricStrip>

          <SectionDivider title="Trends" />
          <TabBar
            tabs={INDICATORS.map((ind) => ({ id: ind.id, label: ind.label }))}
            value={indicator}
            onChange={setIndicator}
          />
          {chart.d ? (
            <svg className="econ-chart" viewBox="0 0 640 180" role="img" aria-label="National trend">
              <line x1="28" y1="90" x2="612" y2="90" stroke="#d7d2c8" strokeDasharray="3 4" />
              <path d={chart.d} fill="none" stroke="#1f3a5f" strokeWidth="2" />
              <text x="28" y="18" fontSize="11" fill="#5c6570">
                {idx1(chart.max)}
              </text>
              <text x="28" y="172" fontSize="11" fill="#5c6570">
                {idx1(chart.min)}
              </text>
              {series[0] ? (
                <text x="28" y="178" fontSize="10" fill="#5c6570">
                  {series[0].date}
                </text>
              ) : null}
              {series[series.length - 1] ? (
                <text x="520" y="178" fontSize="10" fill="#5c6570">
                  {series[series.length - 1]!.date}
                </text>
              ) : null}
            </svg>
          ) : (
            <EmptyState>Baseline month — trend appears after the first turn.</EmptyState>
          )}
          <p>
            {INDICATORS.find((i) => i.id === indicator)?.label}: {idx1(current)}{" "}
            <span className="muted">
              {formatIndexDelta(currentDelta)} month ·{" "}
              {yearAgo ? formatIndexDelta(current - yearAgo[indicator]) : "—"} 12m ·{" "}
              {formatIndexDelta(longDelta)} since start
            </span>
          </p>
          <p className="muted">
            Fiscal pressure {idx1(n.fiscalPressure)} · lagged policy effects{" "}
            {props.snap.economyRuntime.laggedEffects.length}
          </p>

          <SectionDivider
            title="Regional conditions"
            actions={
              <div className="view-toggle" role="group" aria-label="Regional view">
                <button
                  type="button"
                  className={regionalView === "table" ? "active" : ""}
                  onClick={() => setRegionalView("table")}
                >
                  Table
                </button>
                <button
                  type="button"
                  className={regionalView === "map" ? "active" : ""}
                  onClick={() => setRegionalView("map")}
                >
                  Map
                </button>
              </div>
            }
          />

          {regionalView === "table" ? (
            <DataTable
              dense
              headers={["Province", "Conditions", "Employment", "Housing", "Mo", "12m"]}
              caption="Provincial conditions indices"
            >
              {provinceRows.map((row) => (
                <tr
                  key={row.id}
                  className={sel?.id === row.id ? "selected" : undefined}
                  onClick={() => setSel({ id: row.id, kind: "province", name: row.name })}
                >
                  <td>{row.name}</td>
                  <td>{idx1(row.data.conditionsIndex)}</td>
                  <td>{idx1(row.data.employmentIndex)}</td>
                  <td>{idx1(row.data.housingIndex)}</td>
                  <td>{row.monthDelta == null ? "—" : formatIndexDelta(row.monthDelta)}</td>
                  <td>{row.yearDelta == null ? "—" : formatIndexDelta(row.yearDelta)}</td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <MapDetailLayout
              map={
                <>
                  <TerenaMap
                    bundle={props.bundle}
                    mode="economy"
                    selectedId={sel?.id ?? null}
                    showConstituencies={false}
                    fillFor={(p) => {
                      const idx = props.snap.economyRuntime.provinces[p.id]?.conditionsIndex ?? 100;
                      const t = Math.max(0, Math.min(1, (idx - 90) / 20));
                      return `hsl(150, 25%, ${88 - t * 22}%)`;
                    }}
                    onSelect={(s) => {
                      if (s.kind === "province") setSel(s);
                    }}
                    tooltipFor={(selection) => {
                      const data = props.snap.economyRuntime.provinces[selection.id];
                      return (
                        <>
                          <strong>{selection.name}</strong>
                          <span>
                            {data
                              ? `Conditions ${idx1(data.conditionsIndex)} · employment ${idx1(data.employmentIndex)} · housing ${idx1(data.housingIndex)}`
                              : "No regional data"}
                          </span>
                        </>
                      );
                    }}
                  />
                  <MapLegend mode="economy" world={props.world} />
                </>
              }
              detail={
                region && sel ? (
                  <div className="regional-economy-detail">
                    <h4 className="serif-head">{sel.name}</h4>
                    <p>
                      Conditions {idx1(region.conditionsIndex)} · employment{" "}
                      {idx1(region.employmentIndex)} · housing {idx1(region.housingIndex)}
                    </p>
                    <p className="muted">
                      {props.world.economyScenario?.provinces[sel.id]?.character ??
                        "Regional conditions respond to national and sector changes."}
                    </p>
                    {regionChart.d ? (
                      <svg
                        className="econ-chart compact"
                        viewBox="0 0 640 180"
                        role="img"
                        aria-label={`${sel.name} conditions trend`}
                      >
                        <path d={regionChart.d} fill="none" stroke="#8a4b2b" strokeWidth="2" />
                      </svg>
                    ) : null}
                  </div>
                ) : (
                  <EmptyState>Select a province on the map.</EmptyState>
                )
              }
            />
          )}

          {regionalView === "table" && region && sel ? (
            <p className="muted">
              Selected: {sel.name} —{" "}
              {props.world.economyScenario?.provinces[sel.id]?.character ?? "Regional conditions."}
            </p>
          ) : null}

          <SectionDivider title="Sectors" />
          <DataTable dense headers={["Sector", "Conditions", "12m", "Since start"]}>
            {Object.entries(props.snap.economyRuntime.sectors).map(([id, s]) => {
              const sectorHistory = props.snap.economyRuntime.sectorHistory[id] ?? [];
              const sectorStart = sectorHistory[0]?.conditionsIndex ?? s.conditionsIndex;
              const sectorYear =
                sectorHistory.length >= 13
                  ? sectorHistory[sectorHistory.length - 13]!.conditionsIndex
                  : null;
              return (
                <tr key={id}>
                  <td style={{ textTransform: "capitalize" }}>{id}</td>
                  <td>{idx1(s.conditionsIndex)}</td>
                  <td>
                    {sectorYear == null ? "—" : formatIndexDelta(s.conditionsIndex - sectorYear)}
                  </td>
                  <td>{formatIndexDelta(s.conditionsIndex - sectorStart)}</td>
                </tr>
              );
            })}
          </DataTable>

          <SectionDivider title="Shocks and policy effects" />
          {shocks.length === 0 && lagged.length === 0 ? (
            <EmptyState>
              No exceptional shock or enacted policy effect is currently moving through the economy.
            </EmptyState>
          ) : null}
          {shocks.map((shock) => (
            <EntityRow
              key={shock.id}
              title={shock.kind.replace(/_/g, " ")}
              meta={`${shock.date} · ${shock.remainingMonths} months of visible effect remain`}
            />
          ))}
          {lagged.map((effect) => (
            <EntityRow
              key={effect.id}
              title="Enacted policy"
              meta={`${effect.lagKind} adjustment · ${effect.remainingMonths} months remain`}
            />
          ))}

          {stories.length > 0 ? (
            <>
              <SectionDivider title="Recent economic coverage" />
              {stories.map((s) => (
                <EntityRow
                  key={s.id}
                  title={s.headlineKey}
                  meta={`${props.world.mediaOutlets[s.outletId]?.name ?? s.outletId} · ${s.date}`}
                />
              ))}
            </>
          ) : null}
        </>
      }
    />
  );
}
