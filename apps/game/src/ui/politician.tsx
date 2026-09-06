import type { ReactNode } from "react";
import type { KernelWorld, SimState } from "@lorsain/sim";
import {
  partyColor,
  partyDisplayName,
  partyLegalStatusLabel,
  politicianDisplayName,
  eventDisplay,
  type PresentationCatalog,
} from "../presentation.js";
import { EntityLink, type EntityLinkKind } from "./entityLink.js";

const officeLabelCache = new WeakMap<SimState, Map<string, string>>();

export function currentPublicOfficeLabel(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): string {
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
    .filter(
      (term) =>
        term.holderId === politicianId && (term.status === "active" || term.status === "suspended"),
    )
    .map((term) => world.offices[term.officeId])
    .filter((office): office is NonNullable<typeof office> => office != null)
    .sort(
      (a, b) => (priority[b.kind] ?? 0) - (priority[a.kind] ?? 0) || a.title.localeCompare(b.title),
    );
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
  const office =
    props.office ??
    (props.state
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
  onEntityNavigate?: ((kind: EntityLinkKind, id: string) => void) | undefined;
}) {
  const name = politicianDisplayName(props.catalog, props.politicianId);
  const pol = props.state.politicians[props.politicianId];
  const office =
    props.office ?? currentPublicOfficeLabel(props.world, props.state, props.politicianId);
  const age = (() => {
    const birthDate = props.state.generatedAgentProfiles[props.politicianId]?.birthDate;
    if (!birthDate) return null;
    const cy = Number(props.state.currentDate.slice(0, 4));
    const by = Number(birthDate.slice(0, 4));
    return cy - by - (props.state.currentDate.slice(5) < birthDate.slice(5) ? 1 : 0);
  })();
  const alive = pol?.alive !== false;
  const caucusName = props.faction && props.faction !== "No caucus" ? props.faction : null;

  const terms = Object.values(props.state.officeTerms)
    .filter((t) => t.holderId === props.politicianId)
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));

  const elections = [
    ...Object.values(props.state.elections).flatMap((e) =>
      e.candidates[props.politicianId] || e.assembly?.candidacies[props.politicianId]
        ? [{ date: e.date, type: e.type, won: e.winnerIds.includes(props.politicianId) }]
        : [],
    ),
    ...Object.values(props.state.provincialRuntime.elections).flatMap((e) =>
      e.candidates[props.politicianId]
        ? [{ date: e.date, type: "gubernatorial", won: e.winnerId === props.politicianId }]
        : [],
    ),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const recentHistory = props.state.history
    .filter(
      (e) =>
        e.visibility === "public" &&
        e.actorIds.includes(props.politicianId) &&
        e.type !== "TURN_COMPLETED",
    )
    .slice(-5)
    .reverse();

  return (
    <header className="politician-profile dossier">
      <div className="dossier-header">
        <PoliticianAvatar
          name={name}
          {...(pol?.partyId != null ? { partyId: pol.partyId } : {})}
          world={props.world}
          size="lg"
        />
        <div className="dossier-identity">
          <div className="kicker">Political dossier</div>
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
            {caucusName ? <span className="chip">{caucusName}</span> : null}
            {!alive ? <span className="chip chip-deceased">Deceased</span> : null}
          </div>
          <dl className="dossier-facts compact">
            {props.home ? (
              <div>
                <dt>Province</dt>
                <dd>
                  {props.onEntityNavigate ? (
                    <EntityLink
                      kind="Province"
                      id={props.home}
                      label={props.home}
                      onNavigate={props.onEntityNavigate}
                    >
                      {props.home}
                    </EntityLink>
                  ) : (
                    props.home
                  )}
                </dd>
              </div>
            ) : null}
            {age != null ? (
              <div>
                <dt>Age</dt>
                <dd>{age}</dd>
              </div>
            ) : null}
            {props.standing ? (
              <div>
                <dt>Standing</dt>
                <dd>{props.standing}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
      {terms.length > 0 || elections.length > 0 ? (
        <div className="dossier-timeline">
          <div className="kicker">Political record</div>
          <div className="timeline-items">
            {elections.slice(0, 4).map((e, i) => (
              <div key={`el-${i}`} className={`timeline-item ${e.won ? "win" : "loss"}`}>
                <span className="timeline-date">{e.date.slice(0, 4)}</span>
                <span>
                  {e.type.replace(/_/g, " ")} — {e.won ? "Won" : "Ran"}
                </span>
              </div>
            ))}
            {terms.slice(0, 4).map((t) => (
              <div key={t.id} className={`timeline-item ${t.status === "active" ? "active" : ""}`}>
                <span className="timeline-date">{(t.startDate ?? "").slice(0, 4)}</span>
                <span>
                  {props.world.offices[t.officeId]?.title ?? "Office"} · {t.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {props.biography ? <p className="profile-bio">{props.biography}</p> : null}
      {recentHistory.length > 0 ? (
        <div className="dossier-recent">
          <div className="kicker">Recent events</div>
          {recentHistory.map((e) => (
            <div key={e.id} className="dossier-event-row">
              <time className="muted">{e.date}</time>
              <span>{eventDisplay(props.catalog, props.world, props.state, e)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {props.children}
    </header>
  );
}

/** Lightweight label for party legal status — exported for use in tests. */
export function legalStatusLabel(status: string): string {
  return partyLegalStatusLabel(status as Parameters<typeof partyLegalStatusLabel>[0]);
}

/** CSS class suffix for legal status visual emphasis. */
export function legalStatusTone(status: string): "normal" | "warn" | "danger" {
  if (status === "prohibited" || status === "defunct") return "danger";
  if (status === "sole_recognized" || status === "restricted") return "warn";
  return "normal";
}
