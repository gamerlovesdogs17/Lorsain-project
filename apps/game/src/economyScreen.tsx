import { storiesChronological, type KernelWorld, type SimState } from "@lorsain/sim";
import { useMemo, useState } from "react";
import { EmptyState, MetricStrip, NewsItem, PageHeader, SectionCard, StatCard } from "./ui/kit.js";
import { MapLegend } from "./ui/mapLegend.js";
import { TerenaMap, type MapSelection } from "./map/TerenaMap.js";
import type { ContentBundle } from "@lorsain/content-loader";

function spark(history: Array<{ date: string; value: number }>): string {
  if (history.length < 2) return "";
  const w = 120;
  const h = 28;
  const min = Math.min(...history.map((p) => p.value));
  const max = Math.max(...history.map((p) => p.value));
  const span = Math.max(0.5, max - min);
  return history
    .map((p, i) => {
      const x = (i / (history.length - 1)) * w;
      const y = h - ((p.value - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function EconomyPage(props: {
  world: KernelWorld;
  snap: SimState;
  bundle: ContentBundle;
}) {
  const n = props.snap.economyRuntime.national;
  const [sel, setSel] = useState<MapSelection | null>(null);
  const region = sel?.kind === "province" ? props.snap.economyRuntime.provinces[sel.id] : null;
  const history = props.snap.economyRuntime.history;
  const prev = history.length >= 2 ? history[history.length - 2]! : null;
  const delta = (key: keyof typeof n) =>
    prev ? n[key] - (prev[key] as number) : 0;
  const deltaHint = (key: keyof typeof n) => {
    const d = delta(key);
    if (!prev) return "Jan 2028 = 100";
    return `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)} vs prior month`;
  };
  const outputPath = spark(history.map((h) => ({ date: h.date, value: h.outputIndex })));
  const stories = useMemo(
    () => storiesChronological(props.snap).filter((s) => s.category === "economy").slice(0, 6),
    [props.snap],
  );
  return (
    <div>
      <PageHeader
        kicker="Political economy"
        title="Economy"
        subtitle="Normalized public indices. January 2028 = 100. Not invented GDP statistics."
      />
      <MetricStrip>
        <StatCard label="Output" value={n.outputIndex.toFixed(1)} hint={deltaHint("outputIndex")} />
        <StatCard label="Employment" value={n.employmentIndex.toFixed(1)} hint={deltaHint("employmentIndex")} />
        <StatCard label="Prices" value={n.priceIndex.toFixed(1)} hint={deltaHint("priceIndex")} />
        <StatCard label="Real wages" value={n.realWageIndex.toFixed(1)} hint={deltaHint("realWageIndex")} />
        <StatCard label="Housing" value={n.housingIndex.toFixed(1)} hint={deltaHint("housingIndex")} />
        <StatCard label="Confidence" value={n.confidenceIndex.toFixed(1)} hint={deltaHint("confidenceIndex")} />
      </MetricStrip>
      <div className="dash dash-2">
        <SectionCard title="National trend">
          {outputPath ? (
            <svg viewBox="0 0 120 28" width="100%" height="48" aria-hidden>
              <path d={outputPath} fill="none" stroke="#1f3a5f" strokeWidth="1.5" />
            </svg>
          ) : (
            <EmptyState>Baseline month — trend appears after the first turn.</EmptyState>
          )}
          <p className="muted">Fiscal pressure {n.fiscalPressure.toFixed(2)} · lagged policy effects {props.snap.economyRuntime.laggedEffects.length}</p>
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
        <table className="table">
          <thead>
            <tr>
              <th>Sector</th>
              <th>Conditions</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(props.snap.economyRuntime.sectors).map(([id, s]) => (
              <tr key={id}>
                <td>{id}</td>
                <td>{s.conditionsIndex.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
