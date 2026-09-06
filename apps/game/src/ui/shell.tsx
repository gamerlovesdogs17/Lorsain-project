import { useEffect, useState, type ReactNode } from "react";
import type { Screen } from "../pages.js";
import type { KernelWorld, SimState } from "@lorsain/sim";
import type { PresentationCatalog } from "../presentation.js";
import { politicianDisplayName, partyDisplayName, partyColor } from "../presentation.js";
import type { CategorizedAttention } from "../navigation.js";
import { notificationLevelLabel, notificationLevelTone } from "../navigation.js";
import type { EntityLinkKind } from "./entityLink.js";
import { entityScreen } from "./entityLink.js";

type NavItem = { id: Screen; label: string; icon?: string };
type NavGroup = { title: string; items: NavItem[] };
export type ShellAttentionItem = {
  id: string;
  label: string;
  detail?: string;
  screen: Screen;
  tone?: "urgent" | "soon" | "info";
};
export type ShellBriefingItem = { id: string; date: string; label: string; watched?: boolean };
export type ShellSearchEntry = {
  id: string;
  kind: string;
  label: string;
  detail: string;
  screen: Screen;
};

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Player",
    items: [
      { id: "home", label: "Home", icon: "⌂" },
      { id: "office", label: "Office", icon: "▰" },
      { id: "career", label: "Career", icon: "◉" },
      { id: "campaign", label: "Campaign", icon: "⚑" },
    ],
  },
  {
    title: "Politics",
    items: [
      { id: "party", label: "Parties & Caucuses", icon: "◆" },
      { id: "elections", label: "Elections", icon: "✓" },
      { id: "assembly", label: "Assembly", icon: "▣" },
      { id: "courts", label: "Constitutional Court", icon: "⚖" },
    ],
  },
  {
    title: "Government",
    items: [
      { id: "executive", label: "President & Cabinet", icon: "★" },
      { id: "economy", label: "Economy", icon: "↗" },
      { id: "terena", label: "Provinces & Map", icon: "◎" },
      { id: "situation", label: "Situation Room", icon: "🗺" },
    ],
  },
  {
    title: "Society",
    items: [
      { id: "organizations", label: "Organizations", icon: "◎" },
      { id: "news", label: "News", icon: "▤" },
    ],
  },
  {
    title: "World",
    items: [{ id: "foreign", label: "Foreign Affairs", icon: "🌐" }],
  },
  {
    title: "Record",
    items: [{ id: "archive", label: "History & Archive", icon: "▤" }],
  },
];

export function GameShell(props: {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  date: string;
  playerLine: string;
  decisionCount: number;
  roleKind: string;
  campaignActive: boolean;
  busy: boolean;
  busyLabel: string;
  endTurnDisabled: boolean;
  onEndTurn: () => void;
  onSave: () => void;
  onExport: () => void;
  searchEntries: ShellSearchEntry[];
  onSearchSelect: (entry: ShellSearchEntry) => void;
  attentionItems: ShellAttentionItem[];
  briefingItems: ShellBriefingItem[];
  watchlist: string[];
  onToggleWatch: (entry: ShellSearchEntry) => void;
  statusSegments: string[];
  lastSavedLabel: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
  categorizedItems?: CategorizedAttention[];
  inspectorFocus?: ShellSearchEntry | null;
  world?: KernelWorld;
  snap?: SimState;
  catalog?: PresentationCatalog;
  onEntityNavigate?: (kind: EntityLinkKind, id: string) => void;
  monthSummaryOpen?: boolean;
  onCloseMonthSummary?: () => void;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [utilOpen, setUtilOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const searchResults = props.searchEntries
    .filter(
      (entry) =>
        !normalizedQuery ||
        `${entry.label} ${entry.detail} ${entry.kind}`.toLowerCase().includes(normalizedQuery),
    )
    .slice(0, 18);
  const officeLabel =
    props.roleKind === "governor"
      ? "Province"
      : props.roleKind === "president"
        ? "Presidency"
        : props.roleKind === "constitutional_court_justice"
          ? "Judicial office"
          : props.roleKind === "assembly_member" || props.roleKind === "speaker"
            ? "Member's office"
            : props.roleKind === "provincial_legislator"
              ? "Assembly office"
              : "Office";
  const contextual = (id: Screen) =>
    (id === "office" && props.roleKind !== "private_citizen") ||
    (id === "executive" && props.roleKind === "president") ||
    (id === "assembly" && (props.roleKind === "assembly_member" || props.roleKind === "speaker")) ||
    (id === "courts" && props.roleKind === "constitutional_court_justice") ||
    (id === "campaign" && props.campaignActive) ||
    (id === "career" && props.roleKind === "private_citizen");

  return (
    <div className={`shell v5 v7${props.busy ? " busy" : ""}`}>
      <button
        type="button"
        className="nav-toggle"
        aria-label="Open navigation"
        onClick={() => setNavOpen(true)}
      >
        ☰
      </button>
      {navOpen ? (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <nav className={`nav v3 v5 v7${navOpen ? " open" : ""}`} aria-label="Game navigation">
        <div className="nav-brand">
          <div className="nav-brand-mark" aria-hidden>
            L
          </div>
          <div>
            <strong>Lorsain</strong>
            <span className="nav-brand-sub">Political Life of Terena</span>
          </div>
          <button type="button" className="nav-close" onClick={() => setNavOpen(false)}>
            ×
          </button>
        </div>
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="nav-group">
            <button
              type="button"
              className="nav-group-title"
              aria-expanded={!collapsedGroups.includes(group.title)}
              onClick={() =>
                setCollapsedGroups((groups) =>
                  groups.includes(group.title)
                    ? groups.filter((title) => title !== group.title)
                    : [...groups, group.title],
                )
              }
            >
              {group.title}
              <span>{collapsedGroups.includes(group.title) ? "+" : "−"}</span>
            </button>
            {!collapsedGroups.includes(group.title)
              ? group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${props.screen === item.id ? "active" : ""}${contextual(item.id) ? " contextual" : ""}`}
                    onClick={() => {
                      props.onNavigate(item.id);
                      setNavOpen(false);
                    }}
                  >
                    {item.icon ? <span className="nav-icon">{item.icon}</span> : null}
                    {item.id === "office" ? officeLabel : item.label}
                  </button>
                ))
              : null}
          </div>
        ))}
      </nav>
      <div className="main">
        <header className="topbar v3 v7">
          <div className="topbar-primary">
            <div className="topbar-date-block">
              <span className="topbar-kicker">Terena calendar</span>
              <strong className="game-date">{props.date}</strong>
            </div>
            <div className="topbar-role-block">
              <div className="muted topbar-role">{props.playerLine}</div>
              <div className="political-status-segments">
                {props.statusSegments.map((segment) => (
                  <span key={segment}>{segment}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="topbar-actions">
            {props.onBack ? (
              <button
                type="button"
                className="nav-history-btn"
                disabled={!props.canGoBack}
                onClick={props.onBack}
                aria-label="Go back"
                title="Back"
              >
                ←
              </button>
            ) : null}
            {props.onForward ? (
              <button
                type="button"
                className="nav-history-btn"
                disabled={!props.canGoForward}
                onClick={props.onForward}
                aria-label="Go forward"
                title="Forward"
              >
                →
              </button>
            ) : null}
            <button
              type="button"
              className="global-search-button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search politics and institutions"
            >
              Search <span>Ctrl K</span>
            </button>
            <button
              type="button"
              className={`attention-button${props.decisionCount ? " has-items" : ""}`}
              aria-expanded={attentionOpen}
              onClick={() => {
                setAttentionOpen((open) => !open);
                setBriefingOpen(false);
              }}
            >
              <span aria-hidden>!</span>
              <span className="attention-label">Attention</span>
              {props.attentionItems.length ? <b>{props.attentionItems.length}</b> : null}
            </button>
            {props.briefingItems.length ? (
              <button
                type="button"
                className="briefing-button"
                aria-expanded={briefingOpen}
                onClick={() => {
                  setBriefingOpen((open) => !open);
                  setAttentionOpen(false);
                  setInspectorOpen(false);
                }}
              >
                This turn <b>{props.briefingItems.length}</b>
              </button>
            ) : null}
            {props.inspectorFocus ? (
              <button
                type="button"
                className={`inspector-button${inspectorOpen ? " active" : ""}`}
                aria-expanded={inspectorOpen}
                onClick={() => {
                  setInspectorOpen((open) => !open);
                  setAttentionOpen(false);
                  setBriefingOpen(false);
                }}
                title={`Inspect ${props.inspectorFocus.kind}: ${props.inspectorFocus.label}`}
              >
                ◎ <span className="inspector-label">{props.inspectorFocus.kind}</span>
              </button>
            ) : null}
            {props.busy ? (
              <span className="muted" role="status" aria-live="polite">
                {props.busyLabel}
              </span>
            ) : null}
            <button
              type="button"
              className="btn btn-end-turn"
              onClick={props.onEndTurn}
              disabled={props.busy || props.endTurnDisabled}
            >
              End Turn
            </button>
            <div className="utility-menu">
              <button
                type="button"
                className="btn quiet"
                aria-expanded={utilOpen}
                onClick={() => setUtilOpen((v) => !v)}
              >
                ⋮
              </button>
              {utilOpen ? (
                <>
                  <button
                    type="button"
                    className="utility-backdrop"
                    aria-label="Close menu"
                    onClick={() => setUtilOpen(false)}
                  />
                  <div className="utility-dropdown">
                    <button
                      type="button"
                      onClick={() => {
                        props.onSave();
                        setUtilOpen(false);
                      }}
                    >
                      Save game
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        props.onExport();
                        setUtilOpen(false);
                      }}
                    >
                      Export save
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>
        {attentionOpen || briefingOpen || inspectorOpen || props.monthSummaryOpen ? (
          <button
            type="button"
            className="shell-drawer-backdrop"
            aria-label="Close political drawer"
            onClick={() => {
              setAttentionOpen(false);
              setBriefingOpen(false);
              setInspectorOpen(false);
              props.onCloseMonthSummary?.();
            }}
          />
        ) : null}
        {attentionOpen ? (
          <aside className="political-drawer" aria-label="Political attention">
            <div className="political-drawer-head">
              <div>
                <span className="kicker">Political inbox</span>
                <h2>What requires me?</h2>
              </div>
              <button type="button" className="btn quiet" onClick={() => setAttentionOpen(false)}>
                ×
              </button>
            </div>
            {(props.categorizedItems ?? props.attentionItems).length === 0 ? (
              <p className="empty-state">Nothing currently requires your decision.</p>
            ) : props.categorizedItems ? (
              (() => {
                const grouped = new Map<string, CategorizedAttention[]>();
                for (const ci of props.categorizedItems) {
                  const list = grouped.get(ci.level) ?? [];
                  list.push(ci);
                  grouped.set(ci.level, list);
                }
                return [...grouped.entries()].map(([level, items]) => (
                  <div key={level} className="attention-level-group">
                    <div className={`attention-level-header level-${level.toLowerCase().replace(/_/g, "-")}`}>
                      {notificationLevelLabel(level as CategorizedAttention["level"])}
                      <span className="attention-level-count">{items.length}</span>
                    </div>
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`attention-item ${notificationLevelTone(item.level)}`}
                        onClick={() => {
                          props.onNavigate(item.screen);
                          setAttentionOpen(false);
                        }}
                      >
                        <strong>{item.label}</strong>
                        {item.detail ? <span>{item.detail}</span> : null}
                      </button>
                    ))}
                  </div>
                ));
              })()
            ) : (
              [...props.attentionItems]
                .sort((a, b) => {
                  const rank = (tone?: "urgent" | "soon" | "info") =>
                    tone === "urgent" ? 0 : tone === "soon" ? 1 : 2;
                  return rank(a.tone) - rank(b.tone) || a.label.localeCompare(b.label);
                })
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`attention-item ${item.tone ?? "info"}`}
                    onClick={() => {
                      props.onNavigate(item.screen);
                      setAttentionOpen(false);
                    }}
                  >
                    <strong>
                      {item.tone === "urgent"
                        ? "Action required · "
                        : item.tone === "soon"
                          ? "Upcoming · "
                          : "Background · "}
                      {item.label}
                    </strong>
                    {item.detail ? <span>{item.detail}</span> : null}
                  </button>
                ))
            )}
            <div className="drawer-save-state">{props.lastSavedLabel}</div>
          </aside>
        ) : null}
        {briefingOpen ? (
          <aside className="political-drawer" aria-label="Turn briefing">
            <div className="political-drawer-head">
              <div>
                <span className="kicker">Since last turn</span>
                <h2>What changed?</h2>
              </div>
              <button type="button" className="btn quiet" onClick={() => setBriefingOpen(false)}>
                ×
              </button>
            </div>
            {props.briefingItems.map((item) => (
              <div
                key={item.id}
                className={`briefing-drawer-item${item.watched ? " watched" : ""}`}
              >
                <time>{item.date}</time>
                <span>{item.label}</span>
                {item.watched ? <b>Following</b> : null}
              </div>
            ))}
          </aside>
        ) : null}
        {inspectorOpen && props.inspectorFocus && props.world && props.snap && props.catalog ? (
          <aside className="political-drawer inspector-drawer" aria-label="Entity inspector">
            <div className="political-drawer-head">
              <div>
                <span className="kicker">{props.inspectorFocus.kind}</span>
                <h2>{props.inspectorFocus.label}</h2>
              </div>
              <button type="button" className="btn quiet" onClick={() => setInspectorOpen(false)}>
                ×
              </button>
            </div>
            <EntityInspectorContent
              entry={props.inspectorFocus}
              world={props.world}
              snap={props.snap}
              catalog={props.catalog}
            />
            <button
              type="button"
              className="btn secondary inspector-open-full"
              onClick={() => {
                props.onNavigate(props.inspectorFocus!.screen);
                setInspectorOpen(false);
              }}
            >
              Open full view →
            </button>
          </aside>
        ) : null}
        {props.monthSummaryOpen && props.briefingItems.length > 0 ? (
          <aside className="political-drawer month-summary-drawer" aria-label="Month summary briefing">
            <div className="political-drawer-head">
              <div>
                <span className="kicker">Monthly briefing</span>
                <h2>Month in review</h2>
              </div>
              <button type="button" className="btn quiet" onClick={() => props.onCloseMonthSummary?.()}>
                ×
              </button>
            </div>
            <p className="month-summary-intro">
              Significant events occurred this month that may affect your political position.
            </p>
            {props.briefingItems.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className={`briefing-drawer-item${item.watched ? " watched" : ""}`}
              >
                <time>{item.date}</time>
                <span>{item.label}</span>
                {item.watched ? <b>Following</b> : null}
              </div>
            ))}
            <button
              type="button"
              className="btn month-summary-dismiss"
              onClick={() => props.onCloseMonthSummary?.()}
            >
              Continue
            </button>
          </aside>
        ) : null}
        {searchOpen ? (
          <div
            className="command-palette-backdrop"
            role="presentation"
            onMouseDown={() => setSearchOpen(false)}
          >
            <section
              className="command-palette"
              role="dialog"
              aria-modal="true"
              aria-label="Political search"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="command-palette-head">
                <strong>Find politics, people and institutions</strong>
                <button
                  type="button"
                  className="btn quiet"
                  onClick={() => setSearchOpen(false)}
                  aria-label="Close search"
                >
                  ×
                </button>
              </div>
              <input
                autoFocus
                aria-label="Search"
                placeholder="Politician, party, province, election, bill or Court case"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <div className="command-results">
                {searchResults.length === 0 ? (
                  <p className="muted">No public result matches that search.</p>
                ) : null}
                {searchResults.map((entry) => (
                  <div className="command-result-row" key={`${entry.kind}:${entry.id}`}>
                    <button
                      type="button"
                      onClick={() => {
                        props.onSearchSelect(entry);
                        setSearchOpen(false);
                        setSearchQuery("");
                      }}
                    >
                      <span className="command-kind">{entry.kind}</span>
                      <strong>{entry.label}</strong>
                      <small>{entry.detail}</small>
                    </button>
                    <button
                      type="button"
                      className={`watch-toggle${props.watchlist.includes(`${entry.kind}:${entry.id}`) ? " selected" : ""}`}
                      aria-label={`${props.watchlist.includes(`${entry.kind}:${entry.id}`) ? "Stop following" : "Follow"} ${entry.label}`}
                      aria-pressed={props.watchlist.includes(`${entry.kind}:${entry.id}`)}
                      onClick={() => props.onToggleWatch(entry)}
                    >
                      ★
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
        <div className="page">{props.children}</div>
        <nav className="mobile-command-bar" aria-label="Current political actions">
          <button
            type="button"
            className={props.screen === "home" ? "active" : ""}
            onClick={() => props.onNavigate("home")}
          >
            <span>⌂</span>Home
          </button>
          <button
            type="button"
            className={
              props.screen === (props.campaignActive ? "campaign" : "office") ? "active" : ""
            }
            onClick={() => props.onNavigate(props.campaignActive ? "campaign" : "office")}
          >
            <span>{props.campaignActive ? "⚑" : "▰"}</span>
            {props.campaignActive ? "Campaign" : officeLabel}
          </button>
          <button
            type="button"
            className={attentionOpen ? "active" : ""}
            onClick={() => setAttentionOpen((open) => !open)}
          >
            <span>!</span>Inbox
            {props.attentionItems.length ? <b>{props.attentionItems.length}</b> : null}
          </button>
          <button
            type="button"
            className="end-turn"
            disabled={props.busy || props.endTurnDisabled}
            onClick={props.onEndTurn}
          >
            <span>→</span>End Turn
          </button>
        </nav>
      </div>
    </div>
  );
}

function EntityInspectorContent(props: {
  entry: ShellSearchEntry;
  world: KernelWorld;
  snap: SimState;
  catalog: PresentationCatalog;
}) {
  const { entry, world, snap, catalog } = props;

  if (entry.kind === "Politician") {
    const pol = snap.politicians[entry.id];
    if (!pol) return <p className="muted">Politician not found in current state.</p>;
    const party = pol.partyId ? partyDisplayName(world, pol.partyId, snap) : "Independent";
    const home = pol.homeProvinceId
      ? (catalog.places.get(pol.homeProvinceId)?.name ?? pol.homeProvinceId)
      : (catalog.places.get(world.politicianHomeProvince[pol.id] ?? "")?.name ?? null);
    const activeTerm = Object.values(snap.officeTerms).find(
      (t) => t.holderId === pol.id && (t.status === "active" || t.status === "suspended"),
    );
    const office = activeTerm ? (world.offices[activeTerm.officeId]?.title ?? null) : null;
    return (
      <div className="inspector-body">
        <dl className="inspector-facts">
          <div><dt>Office</dt><dd>{office ?? "Private citizen"}</dd></div>
          <div><dt>Party</dt><dd>{party}</dd></div>
          {home ? <div><dt>Province</dt><dd>{home}</dd></div> : null}
          <div><dt>Status</dt><dd>{pol.alive ? "Active" : "Deceased"}</dd></div>
        </dl>
      </div>
    );
  }

  if (entry.kind === "Party") {
    const def = world.partyDefinitions[entry.id];
    if (!def) return <p className="muted">Party not found.</p>;
    const partyState = snap.partyStates[entry.id] ?? null;
    const seats = Object.values(snap.officeTerms).filter(
      (t) =>
        t.status === "active" &&
        snap.politicians[t.holderId]?.partyId === entry.id &&
        world.offices[t.officeId]?.kind === "assembly_member",
    ).length;
    const leaderId = partyState?.leaderId ?? null;
    const leader = leaderId
      ? politicianDisplayName(catalog, leaderId)
      : "No leader";
    return (
      <div className="inspector-body">
        <dl className="inspector-facts">
          <div><dt>Leader</dt><dd>{leader}</dd></div>
          <div><dt>Assembly seats</dt><dd>{seats}</dd></div>
          <div><dt>Color</dt><dd><span className="inspector-color-swatch" style={{ background: partyColor(world, entry.id) }} /></dd></div>
        </dl>
      </div>
    );
  }

  if (entry.kind === "Bill") {
    const bill = snap.legislatureRuntime.bills[entry.id];
    if (!bill) return <p className="muted">Bill not found.</p>;
    return (
      <div className="inspector-body">
        <dl className="inspector-facts">
          <div><dt>Title</dt><dd>{bill.title}</dd></div>
          <div><dt>Status</dt><dd>{bill.status.replace(/_/g, " ")}</dd></div>
          <div><dt>Sponsor</dt><dd>{politicianDisplayName(catalog, bill.sponsorId)}</dd></div>
          {bill.policyItems?.length ? (
            <div><dt>Policy items</dt><dd>{bill.policyItems.length}</dd></div>
          ) : null}
        </dl>
      </div>
    );
  }

  if (entry.kind === "Law") {
    const law = snap.legislatureRuntime.enactedLaws[entry.id];
    if (!law) return <p className="muted">Law not found.</p>;
    return (
      <div className="inspector-body">
        <dl className="inspector-facts">
          <div><dt>Title</dt><dd>{law.title}</dd></div>
          <div><dt>Enacted</dt><dd>{law.enactedDate}</dd></div>
          <div><dt>In force</dt><dd>{law.operative ? "Yes" : "No"}</dd></div>
        </dl>
      </div>
    );
  }

  if (entry.kind === "Province") {
    const province = catalog.places.get(entry.id);
    const governor = Object.values(snap.officeTerms).find(
      (t) =>
        t.status === "active" &&
        world.offices[t.officeId]?.kind === "governor" &&
        world.offices[t.officeId]?.provinceId === entry.id,
    );
    const govName = governor ? politicianDisplayName(catalog, governor.holderId) : "Vacant";
    return (
      <div className="inspector-body">
        <dl className="inspector-facts">
          <div><dt>Province</dt><dd>{province?.name ?? entry.id}</dd></div>
          <div><dt>Governor</dt><dd>{govName}</dd></div>
        </dl>
      </div>
    );
  }

  if (entry.kind === "Court case") {
    const cc = snap.constitutionalRuntime.courtCases[entry.id];
    if (!cc) return <p className="muted">Case not found.</p>;
    return (
      <div className="inspector-body">
        <dl className="inspector-facts">
          <div><dt>Question</dt><dd>{cc.constitutionalQuestion}</dd></div>
          <div><dt>Status</dt><dd>{cc.status.replace(/_/g, " ")}</dd></div>
          {cc.filedDate ? <div><dt>Filed</dt><dd>{cc.filedDate}</dd></div> : null}
        </dl>
      </div>
    );
  }

  return (
    <div className="inspector-body">
      <dl className="inspector-facts">
        <div><dt>Type</dt><dd>{entry.kind}</dd></div>
        <div><dt>Detail</dt><dd>{entry.detail}</dd></div>
      </dl>
    </div>
  );
}
