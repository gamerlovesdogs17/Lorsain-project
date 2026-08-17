import type { ContentBundle } from "@lorsain/content-loader";
import {
  canAssumeOffice,
  currentAssemblyMemberIds,
  currentPresidentialAuthorityId,
  whipEstimate,
  type Command,
  type KernelWorld,
  type SimEvent,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import {
  cabinet,
  isMp,
  isPresident,
  isSpeaker,
  partyName,
  playerCampaign,
  politicianName,
  qualitativeStanding,
} from "./format.js";

export type Screen =
  | "home"
  | "career"
  | "assembly"
  | "party"
  | "campaign"
  | "elections"
  | "executive"
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

const PARTY_COLORS: Record<string, string> = {
  PARTY_LAB: "#b42318",
  PARTY_NU: "#1d4e89",
  PARTY_CR: "#c45c26",
  PARTY_GRN: "#2f6b3c",
  PARTY_RL: "#6b4c9a",
  PARTY_PM: "#8a6d3b",
  PARTY_IND: "#6b7280",
};

function run(sim: Simulation, command: Command) {
  return sim.executeCommand(command);
}

export function GamePages(props: {
  screen: Screen;
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  bundle: ContentBundle;
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
}) {
  const { screen } = props;
  if (screen === "home") return <Home {...props} />;
  if (screen === "career") return <Career {...props} />;
  if (screen === "assembly") return <Assembly {...props} />;
  if (screen === "party") return <Party {...props} />;
  if (screen === "campaign") return <Campaign {...props} />;
  if (screen === "elections") return <Elections {...props} />;
  if (screen === "executive") return <Executive {...props} />;
  if (screen === "terena") return <Terena {...props} />;
  return <Archive {...props} />;
}

function Home(props: {
  world: KernelWorld;
  snap: SimState;
  figures: Map<string, Figure>;
  events: SimEvent[];
  offices: string[];
  campaign: ReturnType<typeof playerCampaign>;
}) {
  const polls = Object.values(props.snap.polls).slice(-3);
  const bills = Object.values(props.snap.legislatureRuntime.bills).filter((b) =>
    ["committee", "floor_scheduled", "sent_to_president", "repassage_scheduled"].includes(b.status),
  );
  const upcoming = props.snap.scheduler.events
    .filter((e) => e.status === "pending")
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
    .slice(0, 6);
  return (
    <div className="grid">
      <div className="card">
        <h3>Your situation</h3>
        <div>{politicianName(props.figures, props.snap.playerPoliticianId)}</div>
        <div className="muted">{props.offices.join(" · ") || "No current office"}</div>
        <div className="muted">
          {partyName(
            props.world,
            props.snap.politicians[props.snap.playerPoliticianId]?.partyId ?? null,
          )}
        </div>
        {props.campaign ? (
          <div>Campaign: {props.campaign.type}</div>
        ) : (
          <div className="muted">Not campaigning</div>
        )}
      </div>
      <div className="card">
        <h3>What happened</h3>
        {(props.events.length ? props.events : props.snap.history.slice(-8)).slice(-10).map((e) => (
          <div key={e.id} className="muted">
            {e.date} · {e.type}
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Needs attention</h3>
        {upcoming.map((e) => (
          <div key={e.id} className="muted">
            {e.dueDate} · {e.eventType}
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Polls</h3>
        {polls.map((p) => (
          <div key={p.id} className="muted">
            {p.publicationDate} · {p.pollsterId}
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Active bills</h3>
        {bills.slice(0, 6).map((b) => (
          <div key={b.id}>
            {b.title} <span className="muted">{b.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Career(props: {
  snap: SimState;
  figures: Map<string, Figure>;
  offices: string[];
  debug: boolean;
  setDebug: (v: boolean) => void;
}) {
  const figure = props.figures.get(props.snap.playerPoliticianId);
  const standing = props.snap.candidateStanding[props.snap.playerPoliticianId];
  const age = figure?.birth_date
    ? Number(props.snap.currentDate.slice(0, 4)) - Number(figure.birth_date.slice(0, 4))
    : null;
  return (
    <div className="card">
      <h3>{figure?.name ?? props.snap.playerPoliticianId}</h3>
      <p>{figure?.notes ?? figure?.display_summary}</p>
      {age != null ? <p>Age: {age}</p> : null}
      <p>Office: {props.offices.join(", ") || "none"}</p>
      <p>
        Party / faction: {figure?.party} / {figure?.faction}
      </p>
      <p>Home: {figure?.home}</p>
      <p>Public standing: {qualitativeStanding(standing?.favorability)}</p>
      <label>
        <input
          type="checkbox"
          checked={props.debug}
          onChange={(e) => props.setDebug(e.target.checked)}
        />{" "}
        Developer numbers
      </label>
      {props.debug ? <pre>{JSON.stringify(standing, null, 2)}</pre> : null}
    </div>
  );
}

function Assembly(props: {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  figures: Map<string, Figure>;
  selectedBill: string | null;
  setSelectedBill: (id: string | null) => void;
  onDone: () => void;
}) {
  const mps = currentAssemblyMemberIds(props.world, props.snap);
  const counts = new Map<string, number>();
  for (const id of mps) {
    const party = props.snap.politicians[id]?.partyId ?? "none";
    counts.set(party, (counts.get(party) ?? 0) + 1);
  }
  const bill = props.selectedBill ? props.snap.legislatureRuntime.bills[props.selectedBill] : null;
  const issueId = props.world.issueIds[0] ?? "ISS_TAX";
  const mp = isMp(props.world, props.snap, props.snap.playerPoliticianId);
  const speaker = isSpeaker(props.world, props.snap, props.snap.playerPoliticianId);
  return (
    <div>
      <div className="card">
        <h3>Assembly overview</h3>
        <p>
          {mps.length} sitting of {props.world.legislativeConstitution.assemblySeatCount} authorized
          seats.
        </p>
        <div className="chamber">
          {Array.from({ length: props.world.legislativeConstitution.assemblySeatCount }, (_, i) => {
            const id = mps[i];
            const party = id ? (props.snap.politicians[id]?.partyId ?? "PARTY_IND") : null;
            return (
              <span
                key={i}
                className={`seat ${id ? "" : "vacant"}`}
                style={{
                  background: id ? (PARTY_COLORS[party ?? "PARTY_IND"] ?? "#444") : undefined,
                }}
                title={id ? politicianName(props.figures, id) : "vacant"}
              />
            );
          })}
        </div>
        <table className="table">
          <tbody>
            {[...counts.entries()].map(([party, n]) => (
              <tr key={party}>
                <td>{partyName(props.world, party === "none" ? null : party)}</td>
                <td>{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mp ? (
        <div className="row" style={{ margin: "0.8rem 0" }}>
          <button
            className="btn"
            onClick={() => {
              run(props.sim, {
                type: "INTRODUCE_BILL",
                title: "Player bill",
                policyItems: [{ issueId, direction: 1, magnitude: 0.4, fiscalImpact: null }],
              });
              props.onDone();
            }}
          >
            Introduce bill
          </button>
        </div>
      ) : null}
      <div className="card">
        <h3>Bills</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Sponsor</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(props.snap.legislatureRuntime.bills)
              .slice(-20)
              .reverse()
              .map((b) => (
                <tr key={b.id} onClick={() => props.setSelectedBill(b.id)}>
                  <td>{b.title}</td>
                  <td>{b.status}</td>
                  <td>{politicianName(props.figures, b.sponsorId)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {bill ? (
        <div className="card">
          <h3>{bill.title}</h3>
          <p className="muted">
            {bill.status} · {bill.id}
          </p>
          <pre>{JSON.stringify(bill.policyItems, null, 2)}</pre>
          {mp ? (
            <div className="row">
              <button
                className="btn secondary"
                onClick={() => {
                  run(props.sim, { type: "COSPONSOR_BILL", billId: bill.id });
                  props.onDone();
                }}
              >
                Cosponsor
              </button>
              <button
                className="btn secondary"
                onClick={() => {
                  run(props.sim, {
                    type: "PROPOSE_AMENDMENT",
                    billId: bill.id,
                    policyItems: bill.policyItems.map((p) => ({
                      ...p,
                      magnitude: Math.max(0.1, p.magnitude * 0.5),
                    })),
                  });
                  props.onDone();
                }}
              >
                Propose amendment
              </button>
              {speaker &&
              (bill.status === "floor_scheduled" || bill.status === "repassage_scheduled") ? (
                <>
                  <button
                    className="btn"
                    onClick={() => {
                      run(props.sim, { type: "SCHEDULE_BILL", billId: bill.id });
                      props.onDone();
                    }}
                  >
                    Schedule
                  </button>
                  <button
                    className="btn secondary"
                    onClick={() => {
                      run(props.sim, { type: "DELAY_BILL", billId: bill.id });
                      props.onDone();
                    }}
                  >
                    Delay
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          <p className="muted">
            Whip yes range:{" "}
            {JSON.stringify(whipEstimate(props.world, props.snap, bill.id)?.yesRange)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Party(props: { world: KernelWorld; snap: SimState; figures: Map<string, Figure> }) {
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
        Leader: {runtime?.leaderId ? politicianName(props.figures, runtime.leaderId) : "vacant"}
      </p>
      <p>Assembly caucus: {caucus}</p>
      {(party?.factionIds ?? []).map((fid) => (
        <div key={fid}>
          {props.world.factionDefinitions[fid]?.name ?? fid} · chair{" "}
          {props.snap.factionStates[fid]?.chairId
            ? politicianName(props.figures, props.snap.factionStates[fid]!.chairId!)
            : "vacant"}
        </div>
      ))}
      {contests.map((c) => (
        <div key={c.id}>
          {c.id} · {c.status} · {Object.keys(c.entries).length} candidates
        </div>
      ))}
    </div>
  );
}

function Campaign(props: {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  onDone: () => void;
}) {
  const c = playerCampaign(props.snap);
  const cid = Object.keys(props.world.constituencyElectorate)[0] ?? "C001";
  if (!c) {
    const open = Object.values(props.snap.partyContests).find(
      (x) =>
        x.partyId === props.snap.politicians[props.snap.playerPoliticianId]?.partyId &&
        x.type === "presidential_nomination" &&
        (x.status === "open" || x.status === "planned" || x.status === "qualification"),
    );
    return (
      <div className="card">
        <h3>Campaign</h3>
        <p className="muted">You are not running an active campaign.</p>
        {open ? (
          <button
            className="btn"
            onClick={() => {
              const r = run(props.sim, {
                type: "DECLARE_CAMPAIGN",
                politicianId: props.snap.playerPoliticianId,
                campaignType: "presidential_nomination",
                contestId: open.id,
              });
              if (!r.ok) alert(r.error.message);
              props.onDone();
            }}
          >
            Explore / declare
          </button>
        ) : (
          <p>No open nomination contest is available to join right now.</p>
        )}
      </div>
    );
  }
  const actions: Array<{ label: string; command: Command }> = [
    { label: "Fundraise", command: { type: "CAMPAIGN_FUNDRAISE", campaignId: c.id } },
    {
      label: "Visit",
      command: { type: "CAMPAIGN_VISIT", campaignId: c.id, geographyKind: "national" },
    },
    {
      label: "Organize",
      command: { type: "CAMPAIGN_ORGANIZE", campaignId: c.id, constituencyId: cid },
    },
    {
      label: "Advertise",
      command: {
        type: "CAMPAIGN_ADVERTISE",
        campaignId: c.id,
        spend: Math.min(25000, Math.floor(c.cashOnHand)),
        messageType: "positive",
      },
    },
    { label: "Message", command: { type: "CAMPAIGN_MESSAGE", campaignId: c.id } },
    { label: "Prepare debate", command: { type: "CAMPAIGN_PREPARE_DEBATE", campaignId: c.id } },
    { label: "Seek endorsement", command: { type: "CAMPAIGN_SEEK_ENDORSEMENT", campaignId: c.id } },
    {
      label: "Seek nomination support",
      command: { type: "CAMPAIGN_SEEK_NOMINATION_SUPPORT", campaignId: c.id },
    },
    { label: "Withdraw", command: { type: "WITHDRAW_CAMPAIGN", campaignId: c.id } },
  ];
  return (
    <div className="card">
      <h3>{c.type}</h3>
      <p>
        Cash {Math.round(c.cashOnHand)} · raised {Math.round(c.totalRaised)} · spent{" "}
        {Math.round(c.totalSpent)}
      </p>
      <p>
        AP {c.actionPointsRemaining}/{c.actionPointsMax} · org {c.fieldOrganization.toFixed(2)}
      </p>
      <div className="row">
        {actions.map((a) => (
          <button
            key={a.label}
            className="btn secondary"
            onClick={() => {
              const r = run(props.sim, a.command);
              if (!r.ok) alert(r.error.message);
              props.onDone();
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Elections(props: {
  snap: SimState;
  sim: Simulation;
  figures: Map<string, Figure>;
  onDone: () => void;
}) {
  const elections = Object.values(props.snap.elections);
  const due = props.snap.pendingInterrupt?.code === "PRESIDENTIAL_ELECTION_DUE";
  return (
    <div className="card">
      <h3>Elections</h3>
      {elections.map((el) => (
        <div key={el.id} style={{ marginBottom: "1rem" }}>
          <strong>{el.id}</strong> · {el.status} · {el.date}
          <div>Candidates: {Object.keys(el.candidates).length}</div>
          {due && el.id === "ELEC_PRES_2028" ? (
            <button
              className="btn"
              onClick={() => {
                run(props.sim, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
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
                .map(([id, w]) => `${politicianName(props.figures, id)} ${w}`)
                .join(" · ")}
            </div>
          ) : null}
          {el.countArchive && "rounds" in el.countArchive ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Eliminated</th>
                </tr>
              </thead>
              <tbody>
                {el.countArchive.rounds.map((r, i) => (
                  <tr key={i}>
                    <td>{r.round ?? i + 1}</td>
                    <td>{r.eliminatedId ?? r.electedId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {el.winnerIds.map((id) => (
            <div key={id}>Winner: {politicianName(props.figures, id)}</div>
          ))}
        </div>
      ))}
      {Object.values(props.snap.polls)
        .slice(-5)
        .map((p) => (
          <div key={p.id} className="muted">
            Poll {p.publicationDate} {p.pollsterId}:{" "}
            {p.firstPreference
              .map((s) => `${s.politicianId} ${(s.share * 100).toFixed(1)}%`)
              .join(" · ")}
          </div>
        ))}
    </div>
  );
}

function Executive(props: {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  figures: Map<string, Figure>;
  onDone: () => void;
}) {
  const cab = cabinet(props.world, props.snap);
  const presidentId = currentPresidentialAuthorityId(props.world, props.snap);
  const president = isPresident(props.world, props.snap, props.snap.playerPoliticianId);
  const mp = isMp(props.world, props.snap, props.snap.playerPoliticianId);
  const vacant = cab.find((m) => m.holderId == null);
  return (
    <div className="card">
      <h3>Executive</h3>
      <p>President: {presidentId ? politicianName(props.figures, presidentId) : "vacant"}</p>
      <table className="table">
        <tbody>
          {cab.map((m) => (
            <tr key={m.officeId}>
              <td>{m.title}</td>
              <td>{m.holderId ? politicianName(props.figures, m.holderId) : "vacant"}</td>
              {president && m.holderId ? (
                <td>
                  <button
                    className="btn danger"
                    onClick={() => {
                      run(props.sim, { type: "DISMISS_MINISTER", officeId: m.officeId });
                      props.onDone();
                    }}
                  >
                    Dismiss
                  </button>
                </td>
              ) : (
                <td />
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {president && vacant ? (
        <button
          className="btn"
          onClick={() => {
            const candidate = Object.keys(props.snap.politicians).find((id) => {
              if (id === props.snap.playerPoliticianId) return false;
              return (
                canAssumeOffice(props.snap, props.world, vacant.officeId, id, "substantive", {
                  ignoreOfficeCapacity: true,
                }) == null
              );
            });
            const r = run(props.sim, {
              type: "APPOINT_MINISTER",
              officeId: vacant.officeId,
              politicianId: candidate ?? "NPC030",
            });
            if (!r.ok) alert(r.error.message);
            props.onDone();
          }}
        >
          Appoint minister to {vacant.title}
        </button>
      ) : null}
      {president ? (
        <button
          className="btn secondary"
          onClick={() => {
            const r = run(props.sim, {
              type: "ISSUE_REGULATION",
              ministryOfficeId: cab[0]?.officeId ?? "OFFICE_MINISTER_FINANCE",
              policyItems: [
                {
                  issueId: props.world.issueIds[0] ?? "ISS_TAX",
                  direction: 1,
                  magnitude: 0.2,
                  fiscalImpact: null,
                },
              ],
              major: true,
            });
            if (!r.ok) alert(r.error.message);
            props.onDone();
          }}
        >
          Issue regulation
        </button>
      ) : null}
      <h3>Budget</h3>
      {Object.values(props.snap.executiveRuntime.budgets).map((b) => (
        <div key={b.id}>
          FY {b.fiscalYear} · {b.status}
          {mp && b.status === "proposed" ? (
            <button
              className="btn secondary"
              onClick={() => {
                run(props.sim, {
                  type: "INTRODUCE_MOTION",
                  kind: "budget_approval",
                  targetId: b.id,
                });
                props.onDone();
              }}
            >
              Move to approve
            </button>
          ) : null}
        </div>
      ))}
      {president ? (
        <button
          className="btn secondary"
          onClick={() => {
            const allocations: Record<string, number> = {};
            for (const m of cab) allocations[m.officeId] = 1;
            const r = run(props.sim, { type: "PROPOSE_BUDGET", allocations });
            if (!r.ok) alert(r.error.message);
            props.onDone();
          }}
        >
          Propose budget
        </button>
      ) : null}
      {mp
        ? cab
            .filter((m) => m.holderId)
            .slice(0, 1)
            .map((m) => (
              <button
                key={`censure-${m.officeId}`}
                className="btn secondary"
                onClick={() => {
                  const r = run(props.sim, {
                    type: "INTRODUCE_MOTION",
                    kind: "ministerial_censure",
                    targetId: m.officeId,
                  });
                  if (!r.ok) alert(r.error.message);
                  props.onDone();
                }}
              >
                Move to censure {m.title}
              </button>
            ))
        : null}
      <h3>Regulations</h3>
      {Object.values(props.snap.executiveRuntime.regulations).map((r) => (
        <div key={r.id}>
          {r.id} · {r.status}
          {mp && r.major && r.status === "active" ? (
            <button
              className="btn secondary"
              onClick={() => {
                run(props.sim, {
                  type: "INTRODUCE_MOTION",
                  kind: "regulation_annulment",
                  targetId: r.id,
                });
                props.onDone();
              }}
            >
              Move to annul
            </button>
          ) : null}
        </div>
      ))}
      <h3>Emergency / war</h3>
      {Object.values(props.snap.executiveRuntime.emergencies).map((e) => (
        <div key={e.id}>
          {e.id} · {e.status} · expires {e.expiresDate}
        </div>
      ))}
      {Object.values(props.snap.executiveRuntime.warPowers).map((w) => (
        <div key={w.id}>
          {w.id} · {w.status}
        </div>
      ))}
    </div>
  );
}

function Terena(props: {
  bundle: ContentBundle;
  mapHover: string | null;
  setMapHover: (id: string | null) => void;
}) {
  return (
    <div className="card">
      <h3>Terena</h3>
      <p className="muted">{props.mapHover ?? "Hover a constituency or province"}</p>
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

function Archive(props: { snap: SimState; figures: Map<string, Figure> }) {
  const laws = Object.values(props.snap.legislatureRuntime.enactedLaws);
  const elections = Object.values(props.snap.elections).filter((e) => e.status === "resolved");
  const cabinetEvents = props.snap.history.filter(
    (e) => e.type.includes("MINISTER") || e.type.includes("PRESIDENT"),
  );
  return (
    <div className="card">
      <h3>Archive</h3>
      <h4>Elections</h4>
      {elections.map((e) => (
        <div key={e.id}>
          {e.id} won by {e.winnerIds.map((id) => politicianName(props.figures, id)).join(", ")}
        </div>
      ))}
      <h4>Laws</h4>
      {laws.map((l) => (
        <div key={l.id}>
          {l.title} ({l.enactedDate})
        </div>
      ))}
      <h4>Executive</h4>
      {cabinetEvents.slice(-12).map((e) => (
        <div key={e.id} className="muted">
          {e.date} · {e.type}
        </div>
      ))}
    </div>
  );
}
