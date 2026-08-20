import { storiesChronological, type KernelWorld, type SimState } from "@lorsain/sim";
import { useMemo, useState } from "react";
import { EmptyState, MetricStrip, NewsItem, PageHeader, SectionCard, StatCard, TabBar } from "./ui/kit.js";
import { MapLegend } from "./ui/mapLegend.js";
import { TerenaMap, type MapSelection } from "./map/TerenaMap.js";
import type { ContentBundle } from "@lorsain/content-loader";
import { formatIndexDelta } from "./presentation/display.js";

const INDICATORS = [
  { id: "outputIndex", label: "Output" },
  { id: "employmentIndex", label: "Employment" },
  { id: "priceIndex", label: "Prices" },
  { id: "realWageIndex", label: "Real wages" },
  { id: "housingIndex", label: "Housing" },
  { id: "confidenceIndex", label: "Confidence" },
] as const;

type IndicatorId = (typeof INDICATORS)[number]["id"];

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

export function EconomyPage(props: {
  world: KernelWorld;
  snap: SimState;
  bundle: ContentBundle;
}) {
  const n = props.snap.economyRuntime.national;
  const [sel, setSel] = useState<MapSelection | null>(null);
  const [indicator, setIndicator] = useState<IndicatorId>("outputIndex");
  const region = sel?.kind === "province" ? props.snap.economyRuntime.provinces[sel.id] : null;
  const history = props.snap.economyRuntime.history;
  const prev = history.length >= 2 ? history[history.length - 2]! : null;
  const deltaHint = (key: IndicatorId) => {
    if (!prev) return "Jan 2028 = 100";
    return `${formatIndexDelta(n[key] - prev[key])} vs prior month`;
  };
  const series = history.map((h) => ({ date: h.date, value: h[indicator] }));
  const chart = chartPath(series);
  const stories = useMemo(
    () => storiesChronological(props.snap).filter((s) => s.category === "economy").slice(0, 6),
    [props.snap],
  );
  const current = n[indicator];
  const currentDelta = prev ? current - prev[indicator] : 0;

  return (
    <div>
      <PageHeader
        kicker="Political economy"
        title="Economy"
        subtitle="Normalized public indices. January 2028 = 100. Not invented GDP statistics."
      />
      <MetricStrip>
        {INDICATORS.map((ind) => (
          <StatCard
            key={ind.id}
            label={ind.label}
            value={n[ind.id].toFixed(1)}
            hint={deltaHint(ind.id)}
          />
        ))}
      </MetricStrip>
      <div className="dash dash-2">
        <SectionCard title="National trend">
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
                {chart.max.toFixed(1)}
              </text>
              <text x="28" y="172" fontSize="11" fill="#5c6570">
                {chart.min.toFixed(1)}
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
            {INDICATORS.find((i) => i.id === indicator)?.label}: {current.toFixed(1)}{" "}
            <span className="muted">{formatIndexDelta(currentDelta)} vs prior month</span>
          </p>
          <p className="muted">
            Fiscal pressure {n.fiscalPressure.toFixed(2)} · lagged policy effects{" "}
            {props.snap.economyRuntime.laggedEffects.length}
          </p>
        </SectionCard>
        <SectionCard title="Regional conditions">
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
          />
          <MapLegend mode="economy" world={props.world} />
          {region && sel ? (
            <p>
              {sel.name} · conditions {region.conditionsIndex.toFixed(1)} · employment{" "}
              {region.employmentIndex.toFixed(1)} · housing {region.housingIndex.toFixed(1)}
            </p>
          ) : (
            <EmptyState>Select a province.</EmptyState>
          )}
        </SectionCard>
      </div>
      <SectionCard title="Sectors">
        {Object.entries(props.snap.economyRuntime.sectors).map(([id, s]) => {
          const t = Math.max(0, Math.min(1, (s.conditionsIndex - 80) / 40));
          return (
            <div key={id} className="sector-row">
              <span style={{ textTransform: "capitalize" }}>{id}</span>
              <strong>{s.conditionsIndex.toFixed(1)}</strong>
              <div className="sector-bar">
                <span style={{ width: `${t * 100}%` }} />
              </div>
              <span className="muted">{formatIndexDelta(s.conditionsIndex - 100)} vs 100</span>
            </div>
          );
        })}
      </SectionCard>
      <SectionCard title="Recent economic coverage">
        {stories.length === 0 ? <EmptyState>No economic stories yet.</EmptyState> : null}
        {stories.map((s) => (
          <NewsItem
            key={s.id}
            headline={s.headlineKey}
            outlet={props.world.mediaOutlets[s.outletId]?.name ?? s.outletId}
            date={s.date}
            category={s.category}
          />
        ))}
      </SectionCard>
    </div>
  );
}
