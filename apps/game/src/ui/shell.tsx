import { useState, type ReactNode } from "react";
import type { Screen } from "../pages.js";

type NavItem = { id: Screen; label: string; icon?: string };
type NavGroup = { title: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { id: "home", label: "Home", icon: "⌂" },
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
    title: "Reference",
    items: [
      { id: "terena", label: "Map", icon: "🗺" },
      { id: "archive", label: "Archive", icon: "▤" },
    ],
  },
];

export function GameShell(props: {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  date: string;
  playerLine: string;
  decisionCount: number;
  busy: boolean;
  endTurnDisabled: boolean;
  onEndTurn: () => void;
  onSave: () => void;
  onExport: () => void;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [utilOpen, setUtilOpen] = useState(false);

  return (
    <div className={`shell v3${props.busy ? " busy" : ""}`}>
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
      <nav className={`nav v3${navOpen ? " open" : ""}`} aria-label="Game navigation">
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
                className={props.screen === item.id ? "active" : ""}
                onClick={() => {
                  props.onNavigate(item.id);
                  setNavOpen(false);
                }}
              >
                {item.icon ? <span className="nav-icon">{item.icon}</span> : null}
                {item.label}
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
            {props.busy ? <span className="muted">Processing…</span> : null}
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
        <div className="page">{props.children}</div>
      </div>
    </div>
  );
}
