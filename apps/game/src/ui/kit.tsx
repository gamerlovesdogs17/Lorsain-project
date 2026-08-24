import { useState, type ReactNode } from "react";

export function PageHeader(props: {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {props.kicker ? <div className="kicker">{props.kicker}</div> : null}
        <h2 className="page-title">{props.title}</h2>
        {props.subtitle ? <p className="muted">{props.subtitle}</p> : null}
      </div>
      {props.actions ? <div className="row">{props.actions}</div> : null}
    </div>
  );
}

export function EntityHeader(props: {
  name: string;
  office?: string;
  party?: string;
  faction?: string;
  home?: string;
  standing?: string;
}) {
  const initial = props.name.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <div className="entity-header">
      <div className="avatar" aria-hidden>
        {initial}
      </div>
      <div>
        <h2 className="serif-head">{props.name}</h2>
        <div className="muted">
          {props.office ?? "Private citizen"}
          {props.party ? ` · ${props.party}` : ""}
          {props.faction ? ` / ${props.faction}` : ""}
        </div>
        <div className="muted">
          {props.home ? `Home: ${props.home}` : null}
          {props.standing ? ` · ${props.standing}` : null}
        </div>
      </div>
    </div>
  );
}

export function SectionCard(props: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${props.className ?? ""}`}>
      <h3>{props.title}</h3>
      {props.children}
    </section>
  );
}

export function StatCard(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat-card">
      <div className="kicker">{props.label}</div>
      <div className="stat-value">{props.value}</div>
      {props.hint ? <div className="muted">{props.hint}</div> : null}
    </div>
  );
}

export function MetricStrip(props: { children: ReactNode }) {
  return <div className="metric-strip">{props.children}</div>;
}

export function TabBar<T extends string>(props: {
  tabs: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabbar" role="tablist">
      {props.tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          className={props.value === t.id ? "active" : ""}
          aria-selected={props.value === t.id}
          onClick={() => props.onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function StatusBadge(props: { children: ReactNode; tone?: "ok" | "warn" | "idle" }) {
  return <span className={`badge ${props.tone ?? "idle"}`}>{props.children}</span>;
}

export function EmptyState(props: { children: ReactNode }) {
  return <p className="empty-state">{props.children}</p>;
}

export function RightRail(props: { children: ReactNode }) {
  return <aside className="right-rail">{props.children}</aside>;
}

export function ActionPanel(props: { title: string; children: ReactNode }) {
  return (
    <div className="action-panel">
      <h3>{props.title}</h3>
      {props.children}
    </div>
  );
}

export function NewsItem(props: {
  headline: string;
  outlet: string;
  date: string;
  category: string;
  summary?: string;
}) {
  return (
    <article className="news-item">
      <div className="kicker">
        {props.outlet} · {props.date} · {props.category}
      </div>
      <h4 className="serif-head">{props.headline}</h4>
      {props.summary ? <p className="muted">{props.summary}</p> : null}
    </article>
  );
}

export function DashboardLayout(props: { main: ReactNode; rail?: ReactNode }) {
  return (
    <div className={`dash ${props.rail ? "dash-2" : ""}`}>
      <div>{props.main}</div>
      {props.rail}
    </div>
  );
}

export function LeadStory(props: { kicker?: string; headline: string; date: string }) {
  return (
    <article className="lead-story">
      {props.kicker ? <div className="kicker">{props.kicker}</div> : null}
      <h2 className="serif-head">{props.headline}</h2>
      <div className="muted">{props.date}</div>
    </article>
  );
}

export function ActivityFeedItem(props: { date: string; text: string }) {
  return (
    <div className="activity-feed-item">
      <time className="muted">{props.date}</time>
      <div>{props.text}</div>
    </div>
  );
}

/** Desktop workbench: identity strip, main column, optional contextual rail. */
export function WorkLayout(props: {
  header?: ReactNode;
  main: ReactNode;
  rail?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`work-layout${props.rail ? " work-layout-rail" : ""}${props.className ? ` ${props.className}` : ""}`}>
      {props.header ? <div className="work-layout-header">{props.header}</div> : null}
      <div className="work-layout-body">
        <div className="work-layout-main">{props.main}</div>
        {props.rail ? <aside className="work-layout-rail-pane">{props.rail}</aside> : null}
      </div>
      {props.footer ? <div className="work-layout-footer">{props.footer}</div> : null}
    </div>
  );
}

/** Map + selected-entity detail (desktop map-first). */
export function MapDetailLayout(props: {
  toolbar?: ReactNode;
  map: ReactNode;
  detail: ReactNode;
  legend?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`map-detail-layout${props.className ? ` ${props.className}` : ""}`}>
      {props.toolbar ? <div className="map-detail-toolbar">{props.toolbar}</div> : null}
      <div className="map-detail-body">
        <div className="map-detail-map">{props.map}</div>
        <aside className="map-detail-panel">{props.detail}</aside>
      </div>
      {props.legend ? <div className="map-detail-legend">{props.legend}</div> : null}
    </div>
  );
}

/** List/table + inspector for directories, bills, organizations. */
export function MasterDetail(props: {
  list: ReactNode;
  detail: ReactNode;
  listWidth?: "narrow" | "wide";
  className?: string;
}) {
  return (
    <div
      className={`master-detail master-detail-${props.listWidth ?? "narrow"}${props.className ? ` ${props.className}` : ""}`}
    >
      <div className="master-detail-list">{props.list}</div>
      <div className="master-detail-inspector">{props.detail}</div>
    </div>
  );
}

export function SectionDivider(props: { title: string; hint?: string; actions?: ReactNode }) {
  return (
    <div className="section-divider">
      <div>
        <h3 className="section-divider-title">{props.title}</h3>
        {props.hint ? <p className="muted section-divider-hint">{props.hint}</p> : null}
      </div>
      {props.actions ? <div className="section-divider-actions">{props.actions}</div> : null}
    </div>
  );
}

export function EntityRow(props: {
  title: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  const interactive = Boolean(props.onClick);
  const Tag = interactive ? "button" : "div";
  return (
    <Tag
      type={interactive ? "button" : undefined}
      className={`entity-row${props.selected ? " selected" : ""}`}
      onClick={props.onClick}
    >
      <div className="entity-row-main">
        <div className="entity-row-title">{props.title}</div>
        {props.meta ? <div className="entity-row-meta muted">{props.meta}</div> : null}
      </div>
      {props.status ? <div className="entity-row-status">{props.status}</div> : null}
      {props.trailing ? <div className="entity-row-trailing">{props.trailing}</div> : null}
    </Tag>
  );
}

export function DataTable(props: {
  headers: string[];
  children: ReactNode;
  caption?: string;
  dense?: boolean;
}) {
  return (
    <div className={`data-table-wrap${props.dense ? " dense" : ""}`}>
      <table className="data-table">
        {props.caption ? <caption>{props.caption}</caption> : null}
        <thead>
          <tr>
            {props.headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{props.children}</tbody>
      </table>
    </div>
  );
}

export type PolicyChoiceOption = {
  id: string;
  label: string;
  summary: string;
  effects?: Array<{ label: string; tone?: "up" | "down" | "flat" }>;
  cost?: string;
  current?: boolean;
};

/** Compact categorical policy chooser — title, current, LOW/MOD/HIGH-style options. */
export function PolicyChoiceGroup(props: {
  title: string;
  currentLabel: string;
  options: PolicyChoiceOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  details?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="policy-choice-group">
      <div className="policy-choice-head">
        <h4>{props.title}</h4>
        <div className="muted">
          Current: <strong>{props.currentLabel}</strong>
        </div>
      </div>
      <div className="policy-choice-options" role="listbox" aria-label={props.title}>
        {props.options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="option"
            aria-selected={props.selectedId === opt.id}
            className={`policy-choice-option${props.selectedId === opt.id ? " selected" : ""}${opt.current ? " is-current" : ""}`}
            onClick={() => props.onSelect(opt.id)}
          >
            <div className="policy-choice-option-label">
              <strong>{opt.label}</strong>
              {opt.current ? <StatusBadge tone="idle">Current law</StatusBadge> : null}
            </div>
            <p className="policy-choice-summary">{opt.summary}</p>
            {opt.effects?.length ? (
              <div className="policy-choice-effects">
                {opt.effects.map((e) => (
                  <span key={e.label} className={`fx fx-${e.tone ?? "flat"}`}>
                    {e.label}
                  </span>
                ))}
              </div>
            ) : null}
            {opt.cost ? <div className="policy-choice-cost muted">{opt.cost}</div> : null}
          </button>
        ))}
      </div>
      {props.details ? (
        <div className="policy-choice-details">
          <button type="button" className="btn ghost" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide details" : "Details"}
          </button>
          {open ? <div className="policy-choice-details-body">{props.details}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export function BriefStrip(props: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <div className="brief-strip" aria-label="This month">
      {props.items.map((item) => (
        <div key={item.label} className="brief-strip-item">
          <span className="kicker">{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function BillProgressTrack(props: { status: string }) {
  const stages = [
    "introduced",
    "committee",
    "floor_scheduled",
    "passed",
    "sent_to_president",
    "enacted",
  ] as const;
  const labels = ["Introduced", "Committee", "Floor", "Passed", "Executive", "Enacted"];
  const map: Record<string, number> = {
    draft: 0,
    introduced: 0,
    committee: 1,
    floor_scheduled: 2,
    floor_passed: 3,
    repassage_scheduled: 3,
    sent_to_president: 4,
    enacted: 5,
    failed: 2,
    withdrawn: 0,
    returned: 4,
  };
  const idx = map[props.status] ?? 0;
  return (
    <div className="bill-progress" aria-label="Bill progress">
      {stages.map((_, i) => (
        <div
          key={labels[i]}
          className={`bill-step${i <= idx ? " done" : ""}${i === idx ? " current" : ""}`}
        >
          <span className="bill-step-dot" />
          <span className="bill-step-label">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}
