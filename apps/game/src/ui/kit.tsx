import type { ReactNode } from "react";

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
