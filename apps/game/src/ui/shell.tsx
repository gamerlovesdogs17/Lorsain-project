import { useEffect, useState, type ReactNode } from "react";
import type { Screen } from "../pages.js";

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
    title: "Your politics",
    items: [
      { id: "home", label: "Home", icon: "⌂" },
      { id: "office", label: "Office", icon: "▰" },
      { id: "career", label: "Career", icon: "◉" },
      { id: "campaign", label: "Campaign", icon: "⚑" },
    ],
  },
  {
    title: "Terenan politics",
    items: [
      { id: "party", label: "Party", icon: "◆" },
      { id: "elections", label: "Elections", icon: "✓" },
      { id: "assembly", label: "Assembly", icon: "▣" },
      { id: "courts", label: "Courts", icon: "⚖" },
    ],
  },
  {
    title: "Government and regions",
    items: [
      { id: "executive", label: "Executive", icon: "★" },
      { id: "economy", label: "Economy", icon: "↗" },
      { id: "terena", label: "Terena map", icon: "◎" },
    ],
  },
  {
    title: "Political society",
    items: [
      { id: "organizations", label: "Organizations", icon: "◎" },
      { id: "news", label: "News", icon: "▤" },
    ],
  },
  {
    title: "World",
    items: [
      { id: "foreign", label: "Foreign Affairs", icon: "🌐" },
    ],
  },
  {
    title: "Reference",
    items: [{ id: "archive", label: "Archive", icon: "▤" }],
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
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [utilOpen, setUtilOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
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
    .filter((entry) => !normalizedQuery || `${entry.label} ${entry.detail} ${entry.kind}`.toLowerCase().includes(normalizedQuery))
    .slice(0, 18);
  const officeLabel =
    props.roleKind === "governor" ? "Province"
      : props.roleKind === "president" ? "Presidency"
        : props.roleKind === "constitutional_court_justice" ? "Judicial office"
          : props.roleKind === "assembly_member" || props.roleKind === "speaker" ? "Member's office"
            : "Office";
  const contextual = (id: Screen) =>
    (id === "office" && props.roleKind !== "private_citizen") ||
    (id === "executive" && props.roleKind === "president") ||
    (id === "assembly" && (props.roleKind === "assembly_member" || props.roleKind === "speaker")) ||
    (id === "courts" && props.roleKind === "constitutional_court_justice") ||
    (id === "campaign" && props.campaignActive) ||
    (id === "career" && props.roleKind === "private_citizen");

  return (
    <div className={`shell v5${props.busy ? " busy" : ""}`}>
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
      <nav className={`nav v3 v5${navOpen ? " open" : ""}`} aria-label="Game navigation">
        <div className="nav-brand">
          <strong>Lorsain</strong>
          <button type="button" className="nav-close" onClick={() => setNavOpen(false)}>
            ×
          </button>
        </div>
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="nav-group">
            <button type="button" className="nav-group-title" aria-expanded={!collapsedGroups.includes(group.title)} onClick={() => setCollapsedGroups((groups) => groups.includes(group.title) ? groups.filter((title) => title !== group.title) : [...groups, group.title])}>{group.title}<span>{collapsedGroups.includes(group.title) ? "+" : "−"}</span></button>
            {!collapsedGroups.includes(group.title) ? group.items.map((item) => (
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
            )) : null}
          </div>
        ))}
      </nav>
      <div className="main">
        <header className="topbar v3">
          <div className="topbar-primary">
            <strong className="game-date">{props.date}</strong>
            <div className="muted topbar-role">{props.playerLine}</div>
            <div className="political-status-segments">{props.statusSegments.map((segment) => <span key={segment}>{segment}</span>)}</div>
          </div>
          <div className="topbar-actions">
            <button type="button" className="global-search-button" onClick={() => setSearchOpen(true)} aria-label="Search politics and institutions">
              Search <span>Ctrl K</span>
            </button>
            <button type="button" className={`attention-button${props.decisionCount ? " has-items" : ""}`} aria-expanded={attentionOpen} onClick={() => { setAttentionOpen((open) => !open); setBriefingOpen(false); }}><span aria-hidden>!</span><span className="attention-label">Attention</span>{props.attentionItems.length ? <b>{props.attentionItems.length}</b> : null}</button>
            {props.briefingItems.length ? <button type="button" className="briefing-button" aria-expanded={briefingOpen} onClick={() => { setBriefingOpen((open) => !open); setAttentionOpen(false); }}>This turn <b>{props.briefingItems.length}</b></button> : null}
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
        {attentionOpen || briefingOpen ? <button type="button" className="shell-drawer-backdrop" aria-label="Close political drawer" onClick={() => { setAttentionOpen(false); setBriefingOpen(false); }} /> : null}
        {attentionOpen ? <aside className="political-drawer" aria-label="Political attention">
          <div className="political-drawer-head"><div><span className="kicker">Political inbox</span><h2>What requires me?</h2></div><button type="button" className="btn quiet" onClick={() => setAttentionOpen(false)}>×</button></div>
          {props.attentionItems.length === 0 ? <p className="empty-state">Nothing currently requires your decision.</p> : props.attentionItems.map((item) => <button key={item.id} type="button" className={`attention-item ${item.tone ?? "info"}`} onClick={() => { props.onNavigate(item.screen); setAttentionOpen(false); }}><strong>{item.label}</strong>{item.detail ? <span>{item.detail}</span> : null}</button>)}
          <div className="drawer-save-state">{props.lastSavedLabel}</div>
        </aside> : null}
        {briefingOpen ? <aside className="political-drawer" aria-label="Turn briefing">
          <div className="political-drawer-head"><div><span className="kicker">Since last turn</span><h2>What changed?</h2></div><button type="button" className="btn quiet" onClick={() => setBriefingOpen(false)}>×</button></div>
          {props.briefingItems.map((item) => <div key={item.id} className={`briefing-drawer-item${item.watched ? " watched" : ""}`}><time>{item.date}</time><span>{item.label}</span>{item.watched ? <b>Following</b> : null}</div>)}
        </aside> : null}
        {searchOpen ? (
          <div className="command-palette-backdrop" role="presentation" onMouseDown={() => setSearchOpen(false)}>
            <section className="command-palette" role="dialog" aria-modal="true" aria-label="Political search" onMouseDown={(event) => event.stopPropagation()}>
              <div className="command-palette-head">
                <strong>Find politics, people and institutions</strong>
                <button type="button" className="btn quiet" onClick={() => setSearchOpen(false)} aria-label="Close search">×</button>
              </div>
              <input autoFocus aria-label="Search" placeholder="Politician, party, province, election, bill or Court case" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
              <div className="command-results">
                {searchResults.length === 0 ? <p className="muted">No public result matches that search.</p> : null}
                {searchResults.map((entry) => (
                  <div className="command-result-row" key={`${entry.kind}:${entry.id}`}>
                    <button type="button" onClick={() => { props.onSearchSelect(entry); setSearchOpen(false); setSearchQuery(""); }}>
                      <span className="command-kind">{entry.kind}</span>
                      <strong>{entry.label}</strong>
                      <small>{entry.detail}</small>
                    </button>
                    <button type="button" className={`watch-toggle${props.watchlist.includes(`${entry.kind}:${entry.id}`) ? " selected" : ""}`} aria-label={`${props.watchlist.includes(`${entry.kind}:${entry.id}`) ? "Stop following" : "Follow"} ${entry.label}`} aria-pressed={props.watchlist.includes(`${entry.kind}:${entry.id}`)} onClick={() => props.onToggleWatch(entry)}>★</button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
        <div className="page">{props.children}</div>
        <nav className="mobile-command-bar" aria-label="Current political actions">
          <button type="button" className={props.screen === "home" ? "active" : ""} onClick={() => props.onNavigate("home")}><span>⌂</span>Home</button>
          <button type="button" className={props.screen === (props.campaignActive ? "campaign" : "office") ? "active" : ""} onClick={() => props.onNavigate(props.campaignActive ? "campaign" : "office")}><span>{props.campaignActive ? "⚑" : "▰"}</span>{props.campaignActive ? "Campaign" : officeLabel}</button>
          <button type="button" className={attentionOpen ? "active" : ""} onClick={() => setAttentionOpen((open) => !open)}><span>!</span>Inbox{props.attentionItems.length ? <b>{props.attentionItems.length}</b> : null}</button>
          <button type="button" className="end-turn" disabled={props.busy || props.endTurnDisabled} onClick={props.onEndTurn}><span>→</span>End Turn</button>
        </nav>
      </div>
    </div>
  );
}
