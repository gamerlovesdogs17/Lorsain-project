import type { ReactNode } from "react";
import type { KernelWorld, SimState } from "@lorsain/sim";
import { partyColor, partyDisplayName, politicianDisplayName, type PresentationCatalog } from "../presentation.js";

const officeLabelCache = new WeakMap<SimState, Map<string, string>>();

function currentPublicOfficeLabel(world: KernelWorld, state: SimState, politicianId: string): string {
  let stateCache = officeLabelCache.get(state);
  if (!stateCache) {
    stateCache = new Map();
    officeLabelCache.set(state, stateCache);
  }
  const cached = stateCache.get(politicianId);
  if (cached) return cached;
  const priority: Record<string, number> = {
    president: 9,
    speaker: 8,
    governor: 7,
    constitutional_court_justice: 6,
    minister: 5,
    mayor: 4,
    assembly_member: 3,
  };
  const active = Object.values(state.officeTerms)
    .filter((term) => term.holderId === politicianId && (term.status === "active" || term.status === "suspended"))
    .map((term) => world.offices[term.officeId])
    .filter((office): office is NonNullable<typeof office> => office != null)
    .sort((a, b) => (priority[b.kind] ?? 0) - (priority[a.kind] ?? 0) || a.title.localeCompare(b.title));
  const label = active[0]?.title ?? "Private citizen";
  stateCache.set(politicianId, label);
  return label;
}

export function PoliticianAvatar(props: {
  name: string;
  partyId?: string | null;
  world?: KernelWorld;
  size?: "sm" | "md" | "lg";
}) {
  const initial = props.name.trim().slice(0, 1).toUpperCase() || "?";
  const color = props.world && props.partyId ? partyColor(props.world, props.partyId) : "#e8edf3";
  const sizeClass = props.size === "sm" ? "avatar-sm" : props.size === "lg" ? "avatar-lg" : "";
  return (
    <div
      className={`avatar ${sizeClass}`}
      style={{ borderColor: color, background: `${color}22` }}
      aria-hidden
    >
      {initial}
    </div>
  );
}

export function PoliticianCard(props: {
  catalog: PresentationCatalog;
  world: KernelWorld;
  state?: SimState;
  politicianId: string;
  name?: string;
  partyLabel?: string;
  partyId?: string | null;
  office?: string;
  home?: string;
  descriptor?: string;
  selected?: boolean;
  compact?: boolean;
  onSelect?: () => void;
  action?: ReactNode;
}) {
  const pol = props.state?.politicians[props.politicianId];
  const name = props.name ?? politicianDisplayName(props.catalog, props.politicianId);
  const party =
    props.partyLabel ??
    partyDisplayName(props.world, props.partyId ?? pol?.partyId ?? null, props.state);
  const partyId = props.partyId ?? pol?.partyId;
  const office = props.office ?? (props.state
    ? currentPublicOfficeLabel(props.world, props.state, props.politicianId)
    : "Private citizen");
  const body = (
    <>
      <PoliticianAvatar
        name={name}
        {...(partyId != null ? { partyId } : {})}
        world={props.world}
        size="sm"
      />
      <div className="politician-card-body">
        <strong>{name}</strong>
        <div className="muted politician-card-meta">
          {office} · {party}
          {props.home ? ` · ${props.home}` : ""}
        </div>
        {props.descriptor && !props.compact ? (
          <div className="muted politician-card-desc">{props.descriptor}</div>
        ) : null}
      </div>
      {props.action}
    </>
  );
  if (props.onSelect) {
    return (
      <button
        type="button"
        className={`politician-card${props.selected ? " is-selected" : ""}${props.compact ? " compact" : ""}`}
        onClick={props.onSelect}
      >
        {body}
      </button>
    );
  }
  return <div className={`politician-card static${props.compact ? " compact" : ""}`}>{body}</div>;
}

export function PoliticianProfile(props: {
  catalog: PresentationCatalog;
  world: KernelWorld;
  state: SimState;
  politicianId: string;
  office?: string;
  party?: string;
  faction?: string;
  home?: string;
  standing?: string;
  biography?: string;
  children?: ReactNode;
}) {
  const name = politicianDisplayName(props.catalog, props.politicianId);
  const pol = props.state.politicians[props.politicianId];
  const office = props.office ?? currentPublicOfficeLabel(props.world, props.state, props.politicianId);
  return (
    <header className="politician-profile">
      <PoliticianAvatar
        name={name}
        {...(pol?.partyId != null ? { partyId: pol.partyId } : {})}
        world={props.world}
        size="lg"
      />
      <div>
        <div className="kicker">Public record</div>
        <h2 className="serif-head profile-name">{name}</h2>
        <div className="profile-tags">
          {office ? <span className="chip">{office}</span> : null}
          {props.party ? (
            <span
              className="chip party"
              style={{
                borderColor: partyColor(props.world, pol?.partyId),
                color: partyColor(props.world, pol?.partyId),
              }}
            >
              {props.party}
            </span>
          ) : null}
          {props.faction && props.faction !== "No faction" ? (
            <span className="chip">{props.faction}</span>
          ) : null}
        </div>
        <div className="muted profile-meta">
          {props.home ? `Home: ${props.home}` : null}
          {props.standing ? ` · ${props.standing}` : null}
        </div>
        {props.biography ? <p className="profile-bio">{props.biography}</p> : null}
        {props.children}
      </div>
    </header>
  );
}
