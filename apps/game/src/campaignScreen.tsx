import { useMemo, useState } from "react";
import {
  activeRaceCampaigns,
  isDeclaredContestCandidate,
  politiciansAreActiveRaceRivals,
  shouldHoldDebate,
  type Command,
  type CommandResult,
  type KernelWorld,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import { playerCampaign, playerOffices } from "./format.js";
import {
  campaignTypeLabel,
  constituencyDisplayName,
  issueDisplayName,
  partyDisplayName,
  politicianDisplayName,
  type PresentationCatalog,
} from "./presentation.js";

const AD_SPENDS = [5_000, 10_000, 25_000, 50_000, 100_000];

function run(
  sim: Simulation,
  command: Command,
  report: (r: CommandResult) => boolean,
  onDone: () => void,
) {
  report(sim.executeCommand(command));
  onDone();
}

export function CampaignPage(props: {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  catalog: PresentationCatalog;
  onDone: () => void;
  report: (r: CommandResult) => boolean;
  askConfirm: (opts: {
    title: string;
    body: string;
    confirmLabel?: string;
    action: () => void;
  }) => void;
}) {
  const c = playerCampaign(props.snap);
  const [visitKind, setVisitKind] = useState<"national" | "province" | "constituency">("national");
  const [visitId, setVisitId] = useState("");
  const [orgId, setOrgId] = useState(Object.keys(props.world.constituencyElectorate)[0] ?? "");
  const [adType, setAdType] = useState<"positive" | "contrast" | "negative">("positive");
  const [adIssue, setAdIssue] = useState(props.world.issueIds[0] ?? "");
  const [adGeo, setAdGeo] = useState<"national" | "province" | "constituency">("national");
  const [adGeoId, setAdGeoId] = useState("");
  const [adTarget, setAdTarget] = useState("");
  const [adSpend, setAdSpend] = useState(5_000);
  const [messageIssue, setMessageIssue] = useState(props.world.issueIds[0] ?? "");
  const [attackTarget, setAttackTarget] = useState("");
  const [attackIssue, setAttackIssue] = useState(props.world.issueIds[0] ?? "");
  const [endorserQuery, setEndorserQuery] = useState("");
  const [endorserId, setEndorserId] = useState<string | null>(null);
  const contest = c?.contestId ? props.snap.partyContests[c.contestId] : null;
  const endorsers = useMemo(() => {
    if (!c || !contest) return [];
    const q = endorserQuery.trim().toLowerCase();
    return Object.keys(props.snap.politicians)
      .filter((id) => {
        if (id === c.politicianId || id === props.snap.playerPoliticianId) return false;
        const pol = props.snap.politicians[id];
        if (!pol?.alive || pol.retired) return false;
        if (pol.partyId !== contest.partyId) return false;
        if (isDeclaredContestCandidate(contest, id)) return false;
        if (politiciansAreActiveRaceRivals(props.snap, id, c.politicianId)) return false;
        if (!q) return true;
        const hay =
          `${politicianDisplayName(props.catalog, id)} ${partyDisplayName(props.world, pol.partyId, props.snap)}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        politicianDisplayName(props.catalog, a).localeCompare(
          politicianDisplayName(props.catalog, b),
        ),
      )
      .slice(0, 80);
  }, [c, contest, endorserQuery, props.catalog, props.snap, props.world]);

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
            type="button"
            className="btn"
            onClick={() =>
              run(
                props.sim,
                {
                  type: "DECLARE_CAMPAIGN",
                  politicianId: props.snap.playerPoliticianId,
                  campaignType: "presidential_nomination",
                  contestId: open.id,
                },
                props.report,
                props.onDone,
              )
            }
          >
            Explore / declare
          </button>
        ) : (
          <p>No open nomination contest is available to join right now.</p>
        )}
      </div>
    );
  }

  const rivals = activeRaceCampaigns(props.snap, c);
  const provinces = props.world.provinceIds;
  const constituencies = Object.keys(props.world.constituencyElectorate).sort();
  const issues = props.world.issueIds;
  const spendOptions = AD_SPENDS.filter((n) => n <= Math.floor(c.cashOnHand));
  const showDebate = shouldHoldDebate(props.snap.currentDate, c.type);

  function geoOptions(kind: "national" | "province" | "constituency") {
    if (kind === "national") return [] as string[];
    if (kind === "province") return provinces;
    return constituencies;
  }

  return (
    <div className="card">
      <h3>{campaignTypeLabel(c.type)}</h3>
      <p>
        Cash {Math.round(c.cashOnHand).toLocaleString()} · raised{" "}
        {Math.round(c.totalRaised).toLocaleString()} · spent{" "}
        {Math.round(c.totalSpent).toLocaleString()}
      </p>
      <p>
        Actions this month {c.actionPointsRemaining}/{c.actionPointsMax} · organization{" "}
        {c.fieldOrganization.toFixed(2)}
      </p>

      <h4>Visit</h4>
      <div className="row">
        <select
          value={visitKind}
          onChange={(e) => setVisitKind(e.target.value as typeof visitKind)}
        >
          <option value="national">Nationwide</option>
          <option value="province">Province</option>
          <option value="constituency">Constituency</option>
        </select>
        {visitKind !== "national" ? (
          <select value={visitId} onChange={(e) => setVisitId(e.target.value)}>
            <option value="">Choose place</option>
            {geoOptions(visitKind).map((id) => (
              <option key={id} value={id}>
                {constituencyDisplayName(props.catalog, id)}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          className="btn"
          disabled={visitKind !== "national" && !visitId}
          onClick={() =>
            run(
              props.sim,
              {
                type: "CAMPAIGN_VISIT",
                campaignId: c.id,
                geographyKind: visitKind,
                ...(visitKind === "national" ? {} : { geographyId: visitId }),
              },
              props.report,
              props.onDone,
            )
          }
        >
          Visit
        </button>
      </div>

      <h4>Organize</h4>
      <div className="row">
        <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          {constituencies.map((id) => (
            <option key={id} value={id}>
              {constituencyDisplayName(props.catalog, id)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          disabled={!orgId}
          onClick={() =>
            run(
              props.sim,
              { type: "CAMPAIGN_ORGANIZE", campaignId: c.id, constituencyId: orgId },
              props.report,
              props.onDone,
            )
          }
        >
          Organize
        </button>
      </div>

      <h4>Advertise</h4>
      <div className="row">
        <select value={adType} onChange={(e) => setAdType(e.target.value as typeof adType)}>
          <option value="positive">Positive</option>
          <option value="contrast">Contrast</option>
          <option value="negative">Negative</option>
        </select>
        <select value={adIssue} onChange={(e) => setAdIssue(e.target.value)}>
          {issues.map((id) => (
            <option key={id} value={id}>
              {issueDisplayName(props.catalog, id)}
            </option>
          ))}
        </select>
        <select value={adGeo} onChange={(e) => setAdGeo(e.target.value as typeof adGeo)}>
          <option value="national">Nationwide</option>
          <option value="province">Province</option>
          <option value="constituency">Constituency</option>
        </select>
        {adGeo !== "national" ? (
          <select value={adGeoId} onChange={(e) => setAdGeoId(e.target.value)}>
            <option value="">Choose place</option>
            {geoOptions(adGeo).map((id) => (
              <option key={id} value={id}>
                {constituencyDisplayName(props.catalog, id)}
              </option>
            ))}
          </select>
        ) : null}
        {adType !== "positive" ? (
          <select value={adTarget} onChange={(e) => setAdTarget(e.target.value)}>
            <option value="">Choose rival</option>
            {rivals.map((r) => (
              <option key={r.politicianId} value={r.politicianId}>
                {politicianDisplayName(props.catalog, r.politicianId)}
              </option>
            ))}
          </select>
        ) : null}
        <select value={String(adSpend)} onChange={(e) => setAdSpend(Number(e.target.value))}>
          {spendOptions.length === 0 ? <option value="0">Not enough cash</option> : null}
          {spendOptions.map((n) => (
            <option key={n} value={n}>
              {n.toLocaleString()}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          disabled={
            spendOptions.length === 0 ||
            (adGeo !== "national" && !adGeoId) ||
            (adType !== "positive" && !adTarget)
          }
          onClick={() =>
            run(
              props.sim,
              {
                type: "CAMPAIGN_ADVERTISE",
                campaignId: c.id,
                spend: adSpend,
                messageType: adType,
                geographyKind: adGeo,
                issueId: adIssue || null,
                ...(adGeo === "national" ? {} : { geographyId: adGeoId }),
                ...(adType === "positive" ? {} : { targetPoliticianId: adTarget }),
              },
              props.report,
              props.onDone,
            )
          }
        >
          Run ad
        </button>
      </div>

      <h4>Message</h4>
      <div className="row">
        <select value={messageIssue} onChange={(e) => setMessageIssue(e.target.value)}>
          {issues.map((id) => (
            <option key={id} value={id}>
              {issueDisplayName(props.catalog, id)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          disabled={!messageIssue}
          onClick={() =>
            run(
              props.sim,
              { type: "CAMPAIGN_MESSAGE", campaignId: c.id, issueId: messageIssue },
              props.report,
              props.onDone,
            )
          }
        >
          Emphasize issue
        </button>
      </div>

      {rivals.length > 0 ? (
        <>
          <h4>Attack / contrast</h4>
          <div className="row">
            <select value={attackTarget} onChange={(e) => setAttackTarget(e.target.value)}>
              <option value="">Choose rival</option>
              {rivals.map((r) => (
                <option key={r.politicianId} value={r.politicianId}>
                  {politicianDisplayName(props.catalog, r.politicianId)} ·{" "}
                  {partyDisplayName(
                    props.world,
                    props.snap.politicians[r.politicianId]?.partyId ?? null,
                    props.snap,
                  )}
                </option>
              ))}
            </select>
            <select value={attackIssue} onChange={(e) => setAttackIssue(e.target.value)}>
              {issues.map((id) => (
                <option key={id} value={id}>
                  {issueDisplayName(props.catalog, id)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              disabled={!attackTarget}
              onClick={() =>
                run(
                  props.sim,
                  {
                    type: "CAMPAIGN_ATTACK",
                    campaignId: c.id,
                    targetPoliticianId: attackTarget,
                    issueId: attackIssue || null,
                  },
                  props.report,
                  props.onDone,
                )
              }
            >
              Attack
            </button>
          </div>
        </>
      ) : null}

      {contest ? (
        <>
          <h4>Seek endorsement</h4>
          <p className="muted">Active rivals in this race cannot endorse you.</p>
          <input
            className="search"
            placeholder="Search eligible politicians"
            value={endorserQuery}
            onChange={(e) => setEndorserQuery(e.target.value)}
          />
          <div
            className="list"
            style={{ maxHeight: "12rem", overflow: "auto", marginTop: "0.4rem" }}
          >
            {endorsers.map((id) => (
              <button
                key={id}
                type="button"
                className={`pick ${endorserId === id ? "active" : ""}`}
                onClick={() => setEndorserId(id)}
              >
                <div>
                  <strong>{politicianDisplayName(props.catalog, id)}</strong>
                  <div className="muted">
                    {partyDisplayName(
                      props.world,
                      props.snap.politicians[id]?.partyId ?? null,
                      props.snap,
                    )}
                    {playerOffices(props.world, props.snap, id).length
                      ? ` · ${playerOffices(props.world, props.snap, id).join(", ")}`
                      : ""}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn"
            disabled={!endorserId}
            onClick={() => {
              if (!endorserId) return;
              run(
                props.sim,
                {
                  type: "CAMPAIGN_SEEK_ENDORSEMENT",
                  campaignId: c.id,
                  endorserId,
                },
                props.report,
                props.onDone,
              );
            }}
          >
            Ask selected person
          </button>
        </>
      ) : null}

      {showDebate ? (
        <div className="row" style={{ marginTop: "0.8rem" }}>
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              run(
                props.sim,
                { type: "CAMPAIGN_PREPARE_DEBATE", campaignId: c.id },
                props.report,
                props.onDone,
              )
            }
          >
            Prepare debate
          </button>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="btn secondary"
          onClick={() =>
            run(
              props.sim,
              { type: "CAMPAIGN_FUNDRAISE", campaignId: c.id },
              props.report,
              props.onDone,
            )
          }
        >
          Fundraise
        </button>
        <button
          type="button"
          className="btn danger"
          onClick={() =>
            props.askConfirm({
              title: "Withdraw campaign",
              body: "This ends your campaign. You cannot undo it.",
              confirmLabel: "Withdraw",
              action: () =>
                run(
                  props.sim,
                  { type: "WITHDRAW_CAMPAIGN", campaignId: c.id },
                  props.report,
                  props.onDone,
                ),
            })
          }
        >
          Withdraw
        </button>
      </div>
    </div>
  );
}
