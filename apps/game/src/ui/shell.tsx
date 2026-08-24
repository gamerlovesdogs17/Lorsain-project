import { useEffect, useState, type ReactNode } from "react";
import type { Screen } from "../pages.js";

type NavItem = { id: Screen; label: string; icon?: string };
type NavGroup = { title: string; items: NavItem[] };
export type ShellSearchEntry = {
  id: string;
  kind: string;
  label: string;
  detail: string;
  screen: Screen;
};

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { id: "home", label: "Home", icon: "⌂" },
      { id: "office", label: "Office", icon: "▰" },
      { id: "career", label: "Career", icon: "◉" },
    ],
  },
  {
    title: "Politics",
    items: [
      { id: "party", label: "Party", icon: "◆" },
      { id: "campaign", label: "Campaign", icon: "⚑" },
      { id: "elections", label: "Elections", icon: "✓" },
    ],
  },
  {
    title: "Government",
    items: [
      { id: "assembly", label: "Assembly", icon: "▣" },
      { id: "executive", label: "Executive", icon: "★" },
      { id: "courts", label: "Courts", icon: "⚖" },
    ],
  },
  {
    title: "Society",
    items: [
      { id: "economy", label: "Economy", icon: "↗" },
      { id: "organizations", label: "Organizations", icon: "◎" },
      { id: "news", label: "News", icon: "▤" },
    ],
  },
  {
    title: "World",
    items: [
      { id: "foreign", label: "Foreign Affairs", icon: "🌐" },
      { id: "terena", label: "Maps", icon: "🗺" },
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
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [utilOpen, setUtilOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
            <div className="nav-group-title">{group.title}</div>
            {group.items.map((item) => (
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
            ))}
          </div>
        ))}
      </nav>
      <div className="main">
        <header className="topbar v3">
          <div className="topbar-primary">
            <strong className="game-date">{props.date}</strong>
            <div className="muted topbar-role">{props.playerLine}</div>
            {props.decisionCount > 0 ? (
              <span className="badge warn topbar-alert">
                {props.decisionCount} urgent
              </span>
            ) : null}
          </div>
          <div className="topbar-actions">
            <button type="button" className="global-search-button" onClick={() => setSearchOpen(true)} aria-label="Search politics and institutions">
              Search <span>Ctrl K</span>
            </button>
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
                  <button key={`${entry.kind}:${entry.id}`} type="button" onClick={() => { props.onSearchSelect(entry); setSearchOpen(false); setSearchQuery(""); }}>
                    <span className="command-kind">{entry.kind}</span>
                    <strong>{entry.label}</strong>
                    <small>{entry.detail}</small>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}
        <div className="page">{props.children}</div>
      </div>
    </div>
  );
}
