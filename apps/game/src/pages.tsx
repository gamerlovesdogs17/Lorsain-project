import { useMemo } from "react";
import type { ContentBundle } from "@lorsain/content-loader";
import {
  collectPlayerActionableDecisions,
  currentAssemblyMemberIds,
  type CommandResult,
  type KernelWorld,
  type SimEvent,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import { AssemblyPage } from "./assemblyScreen.js";
import { CampaignPage } from "./campaignScreen.js";
import { CourtsPage } from "./courtsScreen.js";
import { ExecutivePage } from "./executiveScreen.js";
import { isMp, playerCampaign, qualitativeStanding } from "./format.js";
import {
  billStatusLabel,
  contestDisplayName,
  electionDisplayName,
  eventDisplay,
  factionDisplayName,
  partyDisplayName,
  politicianDisplayName,
  pollShareLine,
  type PresentationCatalog,
} from "./presentation.js";

export type Screen =
  | "home"
  | "career"
  | "assembly"
  | "party"
  | "campaign"
  | "elections"
  | "executive"
  | "courts"
  | "terena"
  | "archive";

export type Figure = {
  id: string;
  name: string;
  office?: string;
  party?: string;
  faction?: string;
  home?: string;
  notes?: string;
  display_summary?: string;
  birth_date?: string;
  party_id?: string | null;
  faction_id?: string | null;
  presidential_status?: string | null;
};

type PageProps = {
  screen: Screen;
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  bundle: ContentBundle;
  catalog: PresentationCatalog;
  figures: Map<string, Figure>;
  offices: string[];
  events: SimEvent[];
  campaign: ReturnType<typeof playerCampaign>;
  selectedBill: string | null;
  setSelectedBill: (id: string | null) => void;
  mapHover: string | null;
  setMapHover: (id: string | null) => void;
  debug: boolean;
  setDebug: (v: boolean) => void;
  onDone: () => void;
  report: (r: CommandResult) => boolean;
  askConfirm: (opts: {
    title: string;
    body: string;
    confirmLabel?: string;
    action: () => void;
  }) => void;
};

export function GamePages(props: PageProps) {
  const { screen } = props;
  if (screen === "home") return <Home {...props} />;
  if (screen === "career") return <Career {...props} />;
  if (screen === "assembly") return <AssemblyPage {...props} />;
  if (screen === "party") return <Party {...props} />;
  if (screen === "campaign") return <CampaignPage {...props} />;
  if (screen === "elections") return <Elections {...props} />;
  if (screen === "executive") return <ExecutivePage {...props} />;
  if (screen === "courts") return <CourtsPage {...props} />;
  if (screen === "terena") return <Terena {...props} />;
  return <Archive {...props} />;
}

function Home(props: PageProps) {
  const playerId = props.snap.playerPoliticianId;
  const decisions = collectPlayerActionableDecisions(props.world, props.snap);
  const monthEvents = (props.events.length ? props.events : props.snap.history.slice(-20)).filter(
    (e) => e.type !== "TURN_COMPLETED",
  );
  const important = [...monthEvents]
    .sort((a, b) => b.importance - a.importance)
    .filter((e) => e.actorIds.includes(playerId) || e.importance >= 0.45)
    .slice(0, 12);
  const shown = important.length ? important : monthEvents.slice(-8);
  const polls = Object.values(props.snap.polls).slice(-4);
  const bills = Object.values(props.snap.legislatureRuntime.bills).filter((b) =>
    ["committee", "floor_scheduled", "sent_to_president", "repassage_scheduled"].includes(b.status),
  );
  const endorsements = monthEvents.filter((e) => e.type.includes("ENDORSEMENT"));
  const elections = Object.values(props.snap.elections);
  const executive = monthEvents.filter((e) =>
    /MINISTER|REGULATION|BUDGET|EMERGENCY|WAR|MOTION|COURT|JUDGE|IMPEACH|RECALL|LAW_INVALIDATED/.test(
      e.type,
    ),
  );
  return (
    <div className="grid">
      <div className="card">
        <h3>Monthly briefing</h3>
        <div>{politicianDisplayName(props.catalog, playerId)}</div>
        <div className="muted">{props.offices.join(" · ") || "No current office"}</div>
        <div className="muted">
          {partyDisplayName(
            props.world,
            props.snap.politicians[playerId]?.partyId ?? null,
            props.snap,
          )}
        </div>
        {props.campaign ? (
          <div>Campaign underway</div>
        ) : (
          <div className="muted">Not campaigning</div>
        )}
      </div>
      <div className="card">
        <h3>Required decisions</h3>
        {decisions.length === 0 ? (
          <p className="muted">Nothing waiting on you this month.</p>
        ) : (
          decisions.map((d) => <div key={d.key}>{d.label}</div>)
        )}
      </div>
      <div className="card">
        <h3>What happened</h3>
        {shown.map((e) => (
          <div key={e.id} className="muted">
            {e.date} · {eventDisplay(props.catalog, props.world, props.snap, e)}
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Polls</h3>
        {polls.length === 0 ? <p className="muted">No recent polls.</p> : null}
        {polls.map((p) => (
          <div key={p.id} style={{ marginBottom: "0.5rem" }}>
            <div>
              {p.publicationDate}
              {p.electionId ? ` · ${electionDisplayName(p.electionId)}` : ""}
            </div>
            <div className="muted">
              {pollShareLine(props.catalog, props.world, props.snap, p.firstPreference)}
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Bills and votes</h3>
        {bills.slice(0, 8).map((b) => (
          <div key={b.id}>
            {b.title} <span className="muted">{billStatusLabel(b.status)}</span>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Endorsements</h3>
        {endorsements.length === 0 ? (
          <p className="muted">No endorsement events this month.</p>
        ) : null}
        {endorsements.slice(-8).map((e) => (
          <div key={e.id} className="muted">
            {eventDisplay(props.catalog, props.world, props.snap, e)}
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Elections</h3>
        {elections.map((el) => (
          <div key={el.id}>
            {electionDisplayName(el.id)} · {el.status}
            {el.winnerIds.length
              ? ` · Winner: ${el.winnerIds.map((id) => politicianDisplayName(props.catalog, id)).join(", ")}`
              : ""}
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Executive</h3>
        {executive.length === 0 ? (
          <p className="muted">No major executive actions this month.</p>
        ) : null}
        {executive.slice(-8).map((e) => (
          <div key={e.id} className="muted">
            {eventDisplay(props.catalog, props.world, props.snap, e)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Career(props: PageProps) {
  const figure = props.figures.get(props.snap.playerPoliticianId);
  const runtime = props.snap.politicians[props.snap.playerPoliticianId];
  const standing = props.snap.candidateStanding[props.snap.playerPoliticianId];
  const age = figure?.birth_date
    ? Number(props.snap.currentDate.slice(0, 4)) - Number(figure.birth_date.slice(0, 4))
    : null;
  return (
    <div className="card">
      <h3>{politicianDisplayName(props.catalog, props.snap.playerPoliticianId)}</h3>
      <p>{figure?.notes ?? figure?.display_summary}</p>
      {age != null ? <p>Age: {age}</p> : null}
      <p>Office: {props.offices.join(", ") || "none"}</p>
      <p>
        Party / faction: {partyDisplayName(props.world, runtime?.partyId ?? null, props.snap)} /{" "}
        {factionDisplayName(props.world, runtime?.factionId ?? null)}
      </p>
      <p>Home: {figure?.home}</p>
      <p>Public standing: {qualitativeStanding(standing?.favorability)}</p>
    </div>
  );
}

function Party(props: PageProps) {
  const partyId = props.snap.politicians[props.snap.playerPoliticianId]?.partyId;
  const party = partyId ? props.world.partyDefinitions[partyId] : null;
  const runtime = partyId ? props.snap.partyStates[partyId] : null;
  const contests = Object.values(props.snap.partyContests).filter((c) => c.partyId === partyId);
  const caucus = currentAssemblyMemberIds(props.world, props.snap).filter(
    (id) => props.snap.politicians[id]?.partyId === partyId,
  ).length;
  return (
    <div className="card">
      <h3>{party?.name ?? "No party"}</h3>
      <p>
        Leader:{" "}
        {runtime?.leaderId ? politicianDisplayName(props.catalog, runtime.leaderId) : "vacant"}
      </p>
      <p>Assembly caucus: {caucus}</p>
      {(party?.factionIds ?? []).map((fid) => (
        <div key={fid}>
          {factionDisplayName(props.world, fid)} · chair{" "}
          {props.snap.factionStates[fid]?.chairId
            ? politicianDisplayName(props.catalog, props.snap.factionStates[fid]!.chairId!)
            : "vacant"}
        </div>
      ))}
      {contests.map((c) => (
        <div key={c.id}>
          {contestDisplayName(props.snap, props.world, c.id)} · {c.status} ·{" "}
          {Object.keys(c.entries).length} candidates
          {c.winnerId ? ` · Winner: ${politicianDisplayName(props.catalog, c.winnerId)}` : ""}
        </div>
      ))}
    </div>
  );
}

function Elections(props: PageProps) {
  const elections = Object.values(props.snap.elections);
  const due = props.snap.pendingInterrupt?.code === "PRESIDENTIAL_ELECTION_DUE";
  const contests = Object.values(props.snap.partyContests).filter(
    (c) => c.type === "presidential_nomination",
  );
  return (
    <div className="card">
      <h3>Elections</h3>
      {contests.map((c) => (
        <div key={c.id} style={{ marginBottom: "1rem" }}>
          <strong>{contestDisplayName(props.snap, props.world, c.id)}</strong> · {c.status}
          <div>
            {Object.values(c.entries)
              .filter((e) => e.status !== "potential")
              .map((e) => (
                <div key={e.politicianId} className="muted">
                  {politicianDisplayName(props.catalog, e.politicianId)} · {e.status}
                </div>
              ))}
          </div>
          {c.winnerId ? (
            <div>Nomination winner: {politicianDisplayName(props.catalog, c.winnerId)}</div>
          ) : null}
        </div>
      ))}
      {elections.map((el) => (
        <div key={el.id} style={{ marginBottom: "1rem" }}>
          <strong>{electionDisplayName(el.id)}</strong> · {el.status} · {el.date}
          <div>
            Field:{" "}
            {Object.values(el.candidates)
              .map(
                (cand) =>
                  `${politicianDisplayName(props.catalog, cand.politicianId)} (${partyDisplayName(props.world, cand.partyId, props.snap)})`,
              )
              .join(" · ") || "not yet set"}
          </div>
          {due && el.id === "ELEC_PRES_2028" ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                props.report(props.sim.executeCommand({ type: "RESOLVE_PRESIDENTIAL_ELECTION" }));
                props.onDone();
              }}
            >
              Resolve
            </button>
          ) : null}
          {el.countArchive && "firstPreferences" in el.countArchive ? (
            <div>
              First preferences:{" "}
              {Object.entries(el.countArchive.firstPreferences)
                .map(([id, w]) => `${politicianDisplayName(props.catalog, id)} ${String(w)}`)
                .join(" · ")}
            </div>
          ) : null}
          {el.countArchive && "rounds" in el.countArchive ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Eliminated / elected</th>
                </tr>
              </thead>
              <tbody>
                {el.countArchive.rounds.map((r, i) => (
                  <tr key={i}>
                    <td>{r.round ?? i + 1}</td>
                    <td>
                      {r.eliminatedId
                        ? `Eliminated: ${politicianDisplayName(props.catalog, r.eliminatedId)}`
                        : r.electedId
                          ? `Elected: ${politicianDisplayName(props.catalog, r.electedId)}`
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {el.winnerIds.map((id) => (
            <div key={id}>Winner: {politicianDisplayName(props.catalog, id)}</div>
          ))}
        </div>
      ))}
      {Object.values(props.snap.polls)
        .slice(-6)
        .map((p) => (
          <div key={p.id} className="muted">
            {p.publicationDate}
            {p.electionId ? ` · ${electionDisplayName(p.electionId)}` : ""}:{" "}
            {pollShareLine(props.catalog, props.world, props.snap, p.firstPreference)}
          </div>
        ))}
    </div>
  );
}

function Terena(props: PageProps) {
  const hover = props.mapHover ? props.catalog.places.get(props.mapHover) : null;
  const org =
    props.campaign && hover?.kind === "constituency"
      ? props.campaign.organizationByConstituency[hover.id]
      : undefined;
  const sitting = useMemo(() => {
    if (!hover || hover.kind !== "constituency") return 0;
    return currentAssemblyMemberIds(props.world, props.snap).filter((id) => {
      const term = Object.values(props.snap.officeTerms).find((t) => {
        if (t.holderId !== id) return false;
        if (t.status !== "active" && t.status !== "suspended") return false;
        return props.world.offices[t.officeId]?.constituencyId === hover.id;
      });
      return !!term;
    }).length;
  }, [hover, props.snap, props.world]);
  return (
    <div className="card">
      <h3>Terena</h3>
      <p>
        {hover ? (
          <>
            <strong>{hover.name}</strong>
            {hover.kind === "constituency" ? (
              <span className="muted">
                {" "}
                · {hover.seats ?? "?"} seats · {sitting} sitting
                {hover.provinceName ? ` · ${hover.provinceName}` : ""}
                {org != null ? ` · your field org ${org.toFixed(2)}` : ""}
              </span>
            ) : (
              <span className="muted"> · province</span>
            )}
          </>
        ) : (
          <span className="muted">Hover a constituency or province</span>
        )}
      </p>
      <div
        className="map-wrap"
        dangerouslySetInnerHTML={{ __html: props.bundle.content.terena_svg }}
        onMouseOver={(e) => {
          const t = e.target as SVGElement;
          if (t.id) props.setMapHover(t.id);
        }}
      />
    </div>
  );
}

function Archive(props: PageProps) {
  const laws = Object.values(props.snap.legislatureRuntime.enactedLaws);
  const elections = Object.values(props.snap.elections).filter((e) => e.status === "resolved");
  const standing = props.snap.candidateStanding[props.snap.playerPoliticianId];
  return (
    <div className="card">
      <h3>Archive</h3>
      <h4>Elections</h4>
      {elections.map((e) => (
        <div key={e.id}>
          {electionDisplayName(e.id)} won by{" "}
          {e.winnerIds.map((id) => politicianDisplayName(props.catalog, id)).join(", ")}
        </div>
      ))}
      <h4>Laws</h4>
      {laws.map((l) => (
        <div key={l.id}>
          {l.title} ({l.enactedDate})
        </div>
      ))}
      <h4>Recent public events</h4>
      {props.snap.history.slice(-16).map((e) => (
        <div key={e.id} className="muted">
          {e.date} · {eventDisplay(props.catalog, props.world, props.snap, e)}
        </div>
      ))}
      <details style={{ marginTop: "1.5rem" }}>
        <summary className="muted">Developer settings</summary>
        <label>
          <input
            type="checkbox"
            checked={props.debug}
            onChange={(e) => props.setDebug(e.target.checked)}
          />{" "}
          Show hidden developer numbers
        </label>
        {props.debug ? (
          <pre>
            {JSON.stringify(
              {
                standing,
                player: props.snap.politicians[props.snap.playerPoliticianId],
                mp: isMp(props.world, props.snap, props.snap.playerPoliticianId),
              },
              null,
              2,
            )}
          </pre>
        ) : null}
      </details>
    </div>
  );
}
