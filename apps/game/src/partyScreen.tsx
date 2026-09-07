import { useEffect, useState } from "react";
import {
  currentAssemblyMemberIds,
  isDeclaredContestCandidate,
  PARTY_PLATFORM_ISSUES,
  partyLegalStatus,
  partyPlatformLabel,
  type CommandResult,
  type KernelWorld,
  type PartyPlatformIssue,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import {
  contestDisplayName,
  electionDisplayName,
  eventDisplay,
  factionDisplayName,
  partyColor,
  partyDisplayName,
  partyLegalStatusLabel,
  politicianDisplayName,
  type PresentationCatalog,
} from "./presentation.js";
import {
  ActivityFeedItem,
  BriefStrip,
  DataTable,
  EmptyState,
  EntityRow,
  PageHeader,
  SectionCard,
  SectionDivider,
  StatusBadge,
  TabBar,
} from "./ui/kit.js";
import { PoliticianCard, legalStatusTone } from "./ui/politician.js";
import { publicStandingLabel } from "./format.js";

const PARTY_PLATFORM_LABELS: Record<PartyPlatformIssue, string> = {
  economy: "Economy",
  taxes: "Taxes",
  labor: "Labor",
  housing: "Housing",
  social_policy: "Social policy",
  environment: "Environment",
  institutional_reform: "Institutional reform",
  foreign_policy: "Foreign policy",
};

type PartyTab = "overview" | "leadership" | "caucuses" | "platform" | "organization" | "history";

export type PartyPageProps = {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  catalog: PresentationCatalog;
  report: (r: CommandResult) => boolean;
  onDone: () => void;
  globalFocus: { kind: string; id: string } | null;
  setGlobalFocus: (focus: { kind: string; id: string } | null) => void;
};

export function PartyPage(props: PartyPageProps) {
  const playerPartyId = props.snap.politicians[props.snap.playerPoliticianId]?.partyId;
  const availablePartyIds = Object.keys(props.world.partyDefinitions)
    .filter((id) => id !== props.world.independentAggregatePartyId)
    .sort((a, b) =>
      partyDisplayName(props.world, a, props.snap).localeCompare(
        partyDisplayName(props.world, b, props.snap),
      ),
    );
  const [selectedPartyId, setSelectedPartyId] = useState(
    playerPartyId ?? availablePartyIds[0] ?? "",
  );
  const [selectedFactionId, setSelectedFactionId] = useState<string | null>(
    props.globalFocus?.kind === "Caucus" ? props.globalFocus.id : null,
  );
  const [priorityDraft, setPriorityDraft] = useState("");
  const [positionIssue, setPositionIssue] = useState<PartyPlatformIssue>("economy");
  const [campaignStrategyDraft, setCampaignStrategyDraft] = useState("persuasion");
  const [supportTarget, setSupportTarget] = useState("national");
  const [supportShare, setSupportShare] = useState("0.5");
  const [coalitionPartnerId, setCoalitionPartnerId] = useState("");
  const [endorseCandidateId, setEndorseCandidateId] = useState("");
  const [disciplineTargetId, setDisciplineTargetId] = useState("");
  const [disciplineKind, setDisciplineKind] = useState<"warning" | "censure" | "suspend_support">(
    "warning",
  );
  const [partyTab, setPartyTab] = useState<PartyTab>("overview");
  const [caucusPriorityDraft, setCaucusPriorityDraft] = useState("");
  const [caucusEndorseId, setCaucusEndorseId] = useState("");
  useEffect(() => {
    if (props.globalFocus?.kind === "Party" && props.world.partyDefinitions[props.globalFocus.id]) {
      setSelectedPartyId(props.globalFocus.id);
    } else if (props.globalFocus?.kind === "Caucus") {
      const partyId = props.world.factionDefinitions[props.globalFocus.id]?.partyId;
      if (partyId) {
        setSelectedPartyId(partyId);
        setSelectedFactionId(props.globalFocus.id);
        setPartyTab("caucuses");
      }
    }
  }, [props.globalFocus, props.world]);
  const partyId = selectedPartyId || playerPartyId;
  const party = partyId ? props.world.partyDefinitions[partyId] : null;
  const runtime = partyId ? props.snap.partyStates[partyId] : null;
  const contests = Object.values(props.snap.partyContests).filter((c) => c.partyId === partyId);
  const members = currentAssemblyMemberIds(props.world, props.snap);
  const caucus = members.filter((id) => props.snap.politicians[id]?.partyId === partyId).length;
  const totalSeats = props.world.legislativeConstitution.assemblySeatCount;
  const presidentId = Object.values(props.snap.officeTerms).find((t) => {
    if (t.status !== "active") return false;
    return props.world.offices[t.officeId]?.kind === "president";
  })?.holderId;
  const govParty = presidentId ? props.snap.politicians[presidentId]?.partyId : null;
  const position = !partyId ? "Independent" : partyId === govParty ? "In government" : "Opposition";
  const recent = props.snap.history
    .filter((e) => {
      if (e.type === "TURN_COMPLETED") return false;
      return (
        e.entityIds.includes(partyId ?? "") ||
        e.payload.partyId === partyId ||
        e.payload.previousPartyId === partyId
      );
    })
    .slice(-8)
    .reverse();
  const elections = Object.values(props.snap.elections).filter((e) => e.status === "resolved");
  const caucusLeadership = partyId ? props.snap.legislatureRuntime.caucusLeadership[partyId] : null;
  const caucusContests = Object.values(props.snap.legislatureRuntime.caucusContests).filter(
    (contest) => contest.partyId === partyId,
  );
  const run = (command: Parameters<Simulation["executeCommand"]>[0]) => {
    props.report(props.sim.executeCommand(command));
    props.onDone();
  };
  const selectedFaction = selectedFactionId
    ? props.world.factionDefinitions[selectedFactionId]
    : null;
  if (selectedFaction) {
    const factionState = props.snap.factionStates[selectedFaction.factionId];
    const factionMembers = Object.values(props.snap.politicians)
      .filter(
        (politician) =>
          politician.alive &&
          !politician.retired &&
          politician.factionId === selectedFaction.factionId,
      )
      .sort((a, b) =>
        politicianDisplayName(props.catalog, a.id).localeCompare(
          politicianDisplayName(props.catalog, b.id),
        ),
      );
    const factionMps = members.filter(
      (memberId) => props.snap.politicians[memberId]?.factionId === selectedFaction.factionId,
    );
    const partyAssemblyMembers = members.filter(
      (memberId) => props.snap.politicians[memberId]?.partyId === selectedFaction.partyId,
    );
    const leadershipContests = Object.values(props.snap.partyContests)
      .filter((contest) => contest.factionId === selectedFaction.factionId)
      .sort((a, b) =>
        (b.resolvedDate ?? b.createdDate).localeCompare(a.resolvedDate ?? a.createdDate),
      );
    const factionVotes = Object.values(props.snap.legislatureRuntime.legislativeVotes)
      .map((vote) => {
        const choices = Object.entries(vote.votes).filter(
          ([memberId]) =>
            (vote.factionIdsAtVote?.[memberId] ?? props.snap.politicians[memberId]?.factionId) ===
            selectedFaction.factionId,
        );
        return {
          vote,
          aye: choices.filter(([, choice]) => choice === "yes").length,
          nay: choices.filter(([, choice]) => choice === "no").length,
          abstain: choices.filter(([, choice]) => choice === "abstain").length,
        };
      })
      .filter((row) => row.aye + row.nay + row.abstain > 0)
      .sort((a, b) => b.vote.date.localeCompare(a.vote.date) || b.vote.id.localeCompare(a.vote.id))
      .slice(0, 8);
    const priorities = factionVotes.filter((row) => row.aye > row.nay).slice(0, 3);
    const factionEndorsements = Object.values(props.snap.endorsements)
      .filter(
        (endorsement) =>
          endorsement.public &&
          endorsement.endorserType === "faction" &&
          endorsement.endorserId === selectedFaction.factionId,
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, 8);
    const prominentMembers = factionMembers
      .slice()
      .sort((a, b) => {
        const aOffice = Object.values(props.snap.officeTerms).some(
          (term) => term.holderId === a.id && term.status === "active",
        );
        const bOffice = Object.values(props.snap.officeTerms).some(
          (term) => term.holderId === b.id && term.status === "active",
        );
        return (
          Number(b.id === factionState?.chairId) - Number(a.id === factionState?.chairId) ||
          Number(bOffice) - Number(aOffice) ||
          politicianDisplayName(props.catalog, a.id).localeCompare(
            politicianDisplayName(props.catalog, b.id),
          )
        );
      })
      .slice(0, 8);
    const latestContest = leadershipContests[0] ?? null;
    return (
      <div className="caucus-page page-tone-caucus">
        <PageHeader
          kicker="Ideological caucus"
          title={selectedFaction.name}
          subtitle={`${partyDisplayName(props.world, selectedFaction.partyId, props.snap)} · organized tendency within the party, distinct from its Assembly delegation.`}
          actions={
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setSelectedFactionId(null);
                props.setGlobalFocus({ kind: "Party", id: selectedFaction.partyId });
              }}
            >
              Back to party
            </button>
          }
        />
        <BriefStrip
          items={[
            { label: "Known members", value: factionMembers.length },
            { label: "Assembly members", value: factionMps.length },
            {
              label: "Share of party MPs",
              value: partyAssemblyMembers.length
                ? `${Math.round((factionMps.length / partyAssemblyMembers.length) * 100)}%`
                : "—",
            },
            { label: "Status", value: factionState?.status.replaceAll("_", " ") ?? "active" },
          ]}
        />
        <div className="caucus-identity-grid">
          <SectionCard title="Caucus leadership">
            {factionState?.chairId ? (
              <PoliticianCard
                catalog={props.catalog}
                world={props.world}
                state={props.snap}
                politicianId={factionState.chairId}
                office="Caucus chair"
              />
            ) : (
              <EmptyState>The chair is vacant.</EmptyState>
            )}
            <p className="muted">
              The chair speaks for this ideological caucus. Party leadership and Assembly Delegation
              offices are separate institutions.
            </p>
            <dl className="fact-list">
              <div>
                <dt>Selection</dt>
                <dd>Ranked-choice vote of current caucus members</dd>
              </div>
              <div>
                <dt>Eligibility</dt>
                <dd>
                  Living, active members of this caucus may stand; the player is never entered
                  automatically.
                </dd>
              </div>
              <div>
                <dt>Current term</dt>
                <dd>
                  {latestContest?.resolvedDate
                    ? `Mandate recorded ${latestContest.resolvedDate}`
                    : "No completed leadership election is archived."}
                </dd>
              </div>
              <div>
                <dt>Next contest</dt>
                <dd>
                  {latestContest?.status === "open"
                    ? `Open now · scheduled close ${String(latestContest.metadata.scheduledCloseDate ?? "not published")}`
                    : "Triggered by a vacancy or an institutional challenge; no fixed future date is promised."}
                </dd>
              </div>
            </dl>
            {(() => {
              const caucusRow = props.snap.caucusRuntime?.caucuses[selectedFaction.factionId];
              const caucusLeaderId = caucusRow?.leaderId ?? factionState?.chairId ?? null;
              const playerLeadsCaucus = caucusLeaderId === props.snap.playerPoliticianId;
              if (!playerLeadsCaucus) return null;
              const endorseOptions = Object.values(props.snap.politicians)
                .filter(
                  (p) =>
                    p.partyId === selectedFaction.partyId &&
                    p.alive &&
                    !p.retired &&
                    p.id !== props.snap.playerPoliticianId,
                )
                .sort((a, b) =>
                  politicianDisplayName(props.catalog, a.id).localeCompare(
                    politicianDisplayName(props.catalog, b.id),
                  ),
                )
                .slice(0, 30);
              return (
                <div style={{ marginTop: "0.75rem" }}>
                  <SectionDivider
                    title="Caucus chair actions"
                    hint="Set priorities or endorse a chair candidate"
                  />
                  <div
                    className="row"
                    style={{ marginTop: "0.35rem", flexWrap: "wrap", gap: "0.4rem" }}
                  >
                    <input
                      type="text"
                      value={caucusPriorityDraft}
                      placeholder={
                        (caucusRow?.priorities ?? []).length > 0
                          ? (caucusRow?.priorities ?? []).join(", ")
                          : "housing, jobs, reform"
                      }
                      onChange={(event) => setCaucusPriorityDraft(event.target.value)}
                      style={{ minWidth: "14rem", flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        const priorities = caucusPriorityDraft
                          .split(",")
                          .map((part) => part.trim())
                          .filter(Boolean);
                        if (priorities.length === 0) return;
                        run({
                          type: "SET_CAUCUS_PRIORITIES",
                          factionId: selectedFaction.factionId,
                          priorities,
                        });
                        setCaucusPriorityDraft("");
                      }}
                    >
                      Set priorities
                    </button>
                  </div>
                  <div
                    className="row"
                    style={{ marginTop: "0.45rem", flexWrap: "wrap", gap: "0.4rem" }}
                  >
                    <select
                      value={caucusEndorseId || endorseOptions[0]?.id || ""}
                      onChange={(event) => setCaucusEndorseId(event.target.value)}
                    >
                      {endorseOptions.map((politician) => (
                        <option key={politician.id} value={politician.id}>
                          {politicianDisplayName(props.catalog, politician.id)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn"
                      disabled={endorseOptions.length === 0}
                      onClick={() => {
                        const candidateId = caucusEndorseId || endorseOptions[0]?.id;
                        if (!candidateId) return;
                        run({
                          type: "ENDORSE_CHAIR_AS_CAUCUS",
                          factionId: selectedFaction.factionId,
                          candidateId,
                        });
                      }}
                    >
                      Endorse chair candidate
                    </button>
                  </div>
                  {caucusRow?.endorsedChairCandidateId ? (
                    <p className="muted small">
                      Current endorsement:{" "}
                      {politicianDisplayName(props.catalog, caucusRow.endorsedChairCandidateId)}
                    </p>
                  ) : null}
                </div>
              );
            })()}
          </SectionCard>
          <SectionCard title="Place in the party">
            <p>
              {selectedFaction.name} accounts for {factionMps.length} of the party's{" "}
              {partyAssemblyMembers.length} sitting Assembly members.
            </p>
            <div
              className="composition-bar"
              aria-label={`${selectedFaction.name} share of the party Assembly delegation`}
            >
              <span
                className="composition-seg"
                style={{
                  width: `${partyAssemblyMembers.length ? (factionMps.length / partyAssemblyMembers.length) * 100 : 0}%`,
                  background: partyColor(props.world, selectedFaction.partyId),
                }}
              />
            </div>
            <p className="muted">
              This is public membership and office data, not hidden cohesion or voting intent.
            </p>
          </SectionCard>
        </div>
        <div className="caucus-identity-grid">
          <SectionCard title="Public priorities and influence">
            <p>
              <strong>{factionMps.length}</strong> Assembly members give the caucus{" "}
              {partyAssemblyMembers.length
                ? `${Math.round((factionMps.length / partyAssemblyMembers.length) * 100)}%`
                : "no measurable share"}{" "}
              of its party delegation.
            </p>
            {priorities.length === 0 ? (
              <EmptyState>
                No recent affirmative roll call establishes a public legislative priority.
              </EmptyState>
            ) : (
              priorities.map(({ vote }) => (
                <EntityRow
                  key={vote.id}
                  title={
                    props.snap.legislatureRuntime.bills[vote.billId]?.title ?? "Assembly measure"
                  }
                  meta={`Recent caucus majority support · ${vote.date}`}
                />
              ))
            )}
            <p className="muted">
              Influence is described from public membership and roll calls. Hidden ideological
              scores and future voting intent are not shown.
            </p>
          </SectionCard>
          <SectionCard title="Prominent members">
            <div className="politician-card-grid">
              {prominentMembers.map((politician) => (
                <PoliticianCard
                  key={politician.id}
                  catalog={props.catalog}
                  world={props.world}
                  state={props.snap}
                  politicianId={politician.id}
                  compact
                  descriptor={
                    politician.id === factionState?.chairId
                      ? "Caucus chair"
                      : publicStandingLabel(props.world, props.snap, politician.id)
                  }
                />
              ))}
            </div>
          </SectionCard>
        </div>
        <SectionCard title="Recent caucus votes">
          {factionVotes.length === 0 ? (
            <EmptyState>No federal roll call includes a recorded member of this caucus.</EmptyState>
          ) : (
            <DataTable
              dense
              headers={["Date", "Measure", "Aye", "Nay", "Abstain", "Caucus position"]}
            >
              {factionVotes.map(({ vote, aye, nay, abstain }) => (
                <tr key={vote.id}>
                  <td>{vote.date}</td>
                  <td>
                    {props.snap.legislatureRuntime.bills[vote.billId]?.title ?? "Assembly measure"}
                  </td>
                  <td>{aye}</td>
                  <td>{nay}</td>
                  <td>{abstain}</td>
                  <td>{aye > nay ? "Supported" : nay > aye ? "Opposed" : "Divided"}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </SectionCard>
        <SectionCard title="Public endorsements">
          {factionEndorsements.length === 0 ? (
            <EmptyState>This caucus has no public contest endorsement on record.</EmptyState>
          ) : (
            factionEndorsements.map((endorsement) => (
              <EntityRow
                key={endorsement.id}
                title={`Backs ${politicianDisplayName(props.catalog, endorsement.targetId)}`}
                meta={`${contestDisplayName(props.snap, props.world, endorsement.contestId)} · ${endorsement.date}`}
                status={
                  <StatusBadge tone={endorsement.status === "active" ? "ok" : "idle"}>
                    {endorsement.status === "active"
                      ? "Current"
                      : endorsement.status.replaceAll("_", " ")}
                  </StatusBadge>
                }
              />
            ))
          )}
        </SectionCard>
        <SectionCard title="Caucus leadership elections">
          {leadershipContests.length === 0 ? (
            <EmptyState>No leadership election is recorded for this caucus.</EmptyState>
          ) : (
            leadershipContests.map((contest) => (
              <div className="contest-card" key={contest.id}>
                <strong>{contestDisplayName(props.snap, props.world, contest.id)}</strong>{" "}
                <StatusBadge tone={contest.status === "open" ? "warn" : "idle"}>
                  {contest.status.replaceAll("_", " ")}
                </StatusBadge>
                <div className="party-contest-field">
                  {Object.values(contest.entries)
                    .filter((entry) => entry.status !== "potential")
                    .map((entry) => (
                      <PoliticianCard
                        key={entry.politicianId}
                        catalog={props.catalog}
                        world={props.world}
                        state={props.snap}
                        politicianId={entry.politicianId}
                        compact
                        descriptor={
                          contest.winnerId === entry.politicianId
                            ? "Elected chair"
                            : entry.status.replaceAll("_", " ")
                        }
                      />
                    ))}
                </div>
                {contest.status === "open" &&
                selectedFaction.partyId === playerPartyId &&
                props.snap.politicians[props.snap.playerPoliticianId]?.factionId ===
                  selectedFaction.factionId &&
                !contest.entries[props.snap.playerPoliticianId] ? (
                  <button
                    className="btn"
                    onClick={() =>
                      run({
                        type: "DECLARE_PARTY_CONTEST_CANDIDACY",
                        contestId: contest.id,
                        politicianId: props.snap.playerPoliticianId,
                      })
                    }
                  >
                    Stand for caucus chair
                  </button>
                ) : null}
              </div>
            ))
          )}
        </SectionCard>
        <SectionCard title="Members">
          <div className="politician-card-grid">
            {factionMembers.slice(0, 36).map((politician) => (
              <PoliticianCard
                key={politician.id}
                catalog={props.catalog}
                world={props.world}
                state={props.snap}
                politicianId={politician.id}
                compact
              />
            ))}
          </div>
          {factionMembers.length > 36 ? (
            <p className="muted">Showing 36 of {factionMembers.length} current members.</p>
          ) : null}
        </SectionCard>
      </div>
    );
  }
  const endorsementActorName = (type: string, id: string): string => {
    if (type === "politician") return politicianDisplayName(props.catalog, id);
    if (type === "faction") return props.world.factionDefinitions[id]?.name ?? "Party caucus";
    const provincial = props.world.provincialPartyOrganizations[id];
    if (provincial) {
      const province = props.catalog.places.get(provincial.provinceId)?.name ?? "Provincial";
      return `${province} party organization`;
    }
    return props.world.interestOrganizations[id]?.name ?? "Political organization";
  };

  const partyOrg = partyId ? props.snap.partyOrgRuntime : null;
  const partyOfficers = partyId ? partyOrg?.officers?.[partyId] : undefined;
  const playerId = props.snap.playerPoliticianId;
  const isNationalChair = partyOfficers?.chair?.politicianId === playerId;
  const isNationalViceChair = partyOfficers?.vice_chair?.politicianId === playerId;
  const showNationalChairWorkspace = Boolean(partyId && (isNationalChair || isNationalViceChair));
  const partnerPartyOptions = availablePartyIds.filter((id) => id !== partyId);
  const partyMemberOptions = partyId
    ? Object.values(props.snap.politicians)
        .filter(
          (politician) =>
            politician.partyId === partyId &&
            politician.alive &&
            !politician.retired &&
            politician.id !== playerId,
        )
        .sort((a, b) =>
          politicianDisplayName(props.catalog, a.id).localeCompare(
            politicianDisplayName(props.catalog, b.id),
          ),
        )
        .slice(0, 40)
    : [];
  const currentPriorities = partyId ? (partyOrg?.priorities?.[partyId] ?? []) : [];
  const currentStrategy = partyId ? (partyOrg?.campaignStrategies?.[partyId] ?? "") : "";
  const currentPosition =
    partyId && positionIssue ? (partyOrg?.positions?.[partyId]?.[positionIssue] ?? null) : null;
  const nationalCommittee = partyId ? (partyOrg?.nationalCommittee?.[partyId] ?? []) : [];
  const committeeVotes = partyId
    ? props.snap.history
        .filter((e) => e.type === "PARTY_COMMITTEE_VOTE" && e.payload.partyId === partyId)
        .slice(-6)
        .reverse()
    : [];
  const openChairElection = partyId
    ? Object.values(partyOrg?.chairElections ?? {}).find(
        (e) => e.partyId === partyId && e.status === "open",
      )
    : null;
  const chairAssumed = partyOfficers?.chair?.assumedDate ?? null;
  const isNationalTreasurer = partyOfficers?.treasurer?.politicianId === playerId;
  const caucusRows = (party?.factionIds ?? [])
    .map((fid) => {
      const row = props.snap.caucusRuntime?.caucuses[fid];
      const chair = props.snap.factionStates[fid]?.chairId ?? row?.leaderId ?? null;
      return {
        fid,
        name: factionDisplayName(props.world, fid),
        membershipPct: Math.round((row?.membershipShare ?? 0) * 100),
        mpPct: Math.round((row?.assemblyShare ?? 0) * 100),
        institutionalPct: Math.round((row?.institutionalInfluence ?? 0) * 100),
        leaderId: chair,
        stance: row?.stanceTowardChair ?? "cooperative",
        row,
      };
    })
    .sort((a, b) => b.membershipPct - a.membershipPct || a.name.localeCompare(b.name));
  const conflictCaucuses = caucusRows.filter(
    (c) => c.stance === "critical" || c.stance === "oppositional",
  );
  const biggestCaucuses = caucusRows.slice(0, 3);

  return (
    <div className="party-page">
      <PageHeader
        kicker="Parties and caucuses"
        title={party?.name ?? "No party"}
        subtitle="National party directory, internal elections, caucuses, and parliamentary leadership."
      />
      <div className="party-directory-strip" role="navigation" aria-label="All parties">
        {availablePartyIds.map((id) => {
          const seats = members.filter(
            (memberId) => props.snap.politicians[memberId]?.partyId === id,
          ).length;
          const leader = props.snap.partyStates[id]?.leaderId;
          return (
            <button
              key={id}
              type="button"
              className={`party-directory-item${id === partyId ? " selected" : ""}`}
              style={{ borderLeftColor: partyColor(props.world, id) }}
              onClick={() => {
                setSelectedPartyId(id);
                setSelectedFactionId(null);
                setPartyTab("overview");
                props.setGlobalFocus({ kind: "Party", id });
              }}
            >
              <strong>{partyDisplayName(props.world, id, props.snap)}</strong>
              <span>
                {partyLegalStatusLabel(partyLegalStatus(props.snap, id))} · {seats} seats ·{" "}
                {leader ? politicianDisplayName(props.catalog, leader) : "leadership vacant"}
              </span>
            </button>
          );
        })}
      </div>
      {party ? (
        <div
          className={`party-banner legal-${legalStatusTone(partyLegalStatus(props.snap, partyId) as string)}`}
          style={{ borderLeftColor: partyColor(props.world, partyId) }}
        >
          <StatusBadge tone="ok">
            {caucus} of {totalSeats} Assembly seats
          </StatusBadge>
          <StatusBadge>{position}</StatusBadge>
          <StatusBadge
            tone={
              legalStatusTone(partyLegalStatus(props.snap, partyId) as string) === "danger"
                ? "warn"
                : "idle"
            }
          >
            {partyLegalStatusLabel(partyLegalStatus(props.snap, partyId))}
          </StatusBadge>
        </div>
      ) : null}

      <TabBar
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "leadership", label: "Leadership" },
          { id: "caucuses", label: "Caucuses" },
          { id: "platform", label: "Platform" },
          { id: "organization", label: "Organization" },
          { id: "history", label: "History" },
        ]}
        value={partyTab}
        onChange={setPartyTab}
      />

      {partyTab === "overview" ? (
        <>
          {runtime?.leaderId ? (
            <PoliticianCard
              catalog={props.catalog}
              world={props.world}
              state={props.snap}
              politicianId={runtime.leaderId}
              office="National Chair (Party Leader)"
            />
          ) : (
            <EmptyState>National Chair is vacant.</EmptyState>
          )}

          <BriefStrip
            items={[
              {
                label: "Priorities",
                value: currentPriorities.slice(0, 3).join(" · ") || "None set",
              },
              {
                label: "Internal conflict",
                value:
                  conflictCaucuses.length === 0
                    ? "Quiet"
                    : `${conflictCaucuses.length} caucus${conflictCaucuses.length === 1 ? "" : "es"} critical`,
              },
              {
                label: "Delegation",
                value: caucusLeadership?.floorLeaderId
                  ? politicianDisplayName(props.catalog, caucusLeadership.floorLeaderId)
                  : "Floor leader vacant",
              },
              {
                label: "Seats",
                value: `${caucus} / ${totalSeats}`,
              },
            ]}
          />
          <SectionCard title="Biggest caucuses">
            {biggestCaucuses.length === 0 ? (
              <EmptyState>No caucus shares recorded yet.</EmptyState>
            ) : (
              <DataTable dense headers={["Caucus", "Membership", "MPs", "Stance"]}>
                {biggestCaucuses.map((c) => (
                  <tr key={c.fid}>
                    <td>
                      <button
                        type="button"
                        className="btn secondary btn-sm"
                        onClick={() => {
                          setSelectedFactionId(c.fid);
                          props.setGlobalFocus({ kind: "Caucus", id: c.fid });
                        }}
                      >
                        {c.name}
                      </button>
                    </td>
                    <td>{c.membershipPct}%</td>
                    <td>{c.mpPct}%</td>
                    <td>{c.stance}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </SectionCard>
          <SectionCard title="Assembly Delegation (brief)">
            <p className="muted">
              Assembly Leader and Whip are elected by sitting MPs — not National Chair offices.
            </p>
            {caucusLeadership ? (
              <div className="faction-cards">
                {caucusLeadership.floorLeaderId ? (
                  <PoliticianCard
                    catalog={props.catalog}
                    world={props.world}
                    state={props.snap}
                    politicianId={caucusLeadership.floorLeaderId}
                    office="Assembly Leader"
                    compact
                  />
                ) : (
                  <div className="faction-card">
                    <strong>Assembly Leader</strong>
                    <div className="muted">Vacant</div>
                  </div>
                )}
                {caucusLeadership.whipId ? (
                  <PoliticianCard
                    catalog={props.catalog}
                    world={props.world}
                    state={props.snap}
                    politicianId={caucusLeadership.whipId}
                    office="Whip"
                    compact
                  />
                ) : (
                  <div className="faction-card">
                    <strong>Whip</strong>
                    <div className="muted">Vacant</div>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState>No sitting Assembly delegation.</EmptyState>
            )}
          </SectionCard>
          <div className="party-dossier-grid">
            <SectionCard title="Party identity">
              <dl className="dossier-facts compact">
                <div>
                  <dt>Legal status</dt>
                  <dd>{partyLegalStatusLabel(partyLegalStatus(props.snap, partyId))}</dd>
                </div>
                <div>
                  <dt>Assembly seats</dt>
                  <dd>
                    {caucus} of {totalSeats}
                  </dd>
                </div>
                <div>
                  <dt>Political position</dt>
                  <dd>{position}</dd>
                </div>
                <div>
                  <dt>Election status</dt>
                  <dd>
                    {Object.values(props.snap.elections).some(
                      (e) =>
                        e.status !== "resolved" &&
                        Object.keys(e.candidates).some(
                          (cid) => props.snap.politicians[cid]?.partyId === partyId,
                        ),
                    )
                      ? "Contesting upcoming election"
                      : "No active candidacies"}
                  </dd>
                </div>
                <div>
                  <dt>Leadership contest</dt>
                  <dd>
                    {Object.values(props.snap.partyContests).some(
                      (c) =>
                        c.partyId === partyId &&
                        c.type === "party_leadership" &&
                        c.status !== "resolved" &&
                        c.status !== "cancelled",
                    )
                      ? "Open leadership contest"
                      : runtime?.status === "leadership_vacant"
                        ? "Leadership vacant"
                        : "Settled"}
                  </dd>
                </div>
                <div>
                  <dt>Lifecycle</dt>
                  <dd>
                    {(() => {
                      const cool =
                        partyId != null
                          ? props.snap.politicsRuntime?.partyLifecycleCooldown?.[partyId]
                          : undefined;
                      if (!cool) return "Stable";
                      return `Recent ${cool.lastKind} (${cool.lastEventDate})`;
                    })()}
                  </dd>
                </div>
              </dl>
            </SectionCard>
            {recent.length > 0 ? (
              <SectionCard title="Snapshot history">
                {recent.slice(0, 5).map((e) => (
                  <ActivityFeedItem
                    key={e.id}
                    date={e.date}
                    text={eventDisplay(props.catalog, props.world, props.snap, e)}
                  />
                ))}
              </SectionCard>
            ) : null}
          </div>
        </>
      ) : null}

      {partyTab === "leadership" ? (
        <>
          {partyId && props.snap.partyOrgRuntime?.officers?.[partyId] ? (
            <SectionCard title="Party organization (national)">
              <dl className="dossier-facts compact">
                <div>
                  <dt>National Chair</dt>
                  <dd>
                    {props.snap.partyOrgRuntime.officers[partyId]?.chair?.politicianId
                      ? politicianDisplayName(
                          props.catalog,
                          props.snap.partyOrgRuntime.officers[partyId]!.chair!.politicianId,
                        )
                      : "Vacant"}
                  </dd>
                </div>
                <div>
                  <dt>Vice Chair</dt>
                  <dd>
                    {props.snap.partyOrgRuntime.officers[partyId]?.vice_chair?.politicianId
                      ? politicianDisplayName(
                          props.catalog,
                          props.snap.partyOrgRuntime.officers[partyId]!.vice_chair!.politicianId,
                        )
                      : "Vacant"}
                  </dd>
                </div>
                <div>
                  <dt>Treasurer</dt>
                  <dd>
                    {props.snap.partyOrgRuntime.officers[partyId]?.treasurer?.politicianId
                      ? politicianDisplayName(
                          props.catalog,
                          props.snap.partyOrgRuntime.officers[partyId]!.treasurer!.politicianId,
                        )
                      : "Vacant"}
                  </dd>
                </div>
                <div>
                  <dt>Priorities</dt>
                  <dd>
                    {(props.snap.partyOrgRuntime.priorities?.[partyId] ?? [])
                      .slice(0, 3)
                      .join(" · ") || "None set"}
                  </dd>
                </div>
              </dl>
              <p className="muted small">
                National Chair leads the Party organization. Assembly Delegation leadership (floor
                leader / whip) is a separate institution elected by sitting MPs.
              </p>
            </SectionCard>
          ) : null}

          {showNationalChairWorkspace && partyId ? (
            <SectionCard title="National Chair workspace">
              <p className="muted">
                Extra-parliamentary party powers. These commands do not set Assembly Delegation whip
                lines or floor strategy — those live under the Caucuses tab · Assembly Delegation.
              </p>
              <SectionDivider title="Priorities" hint="Ordered list (comma-separated)" />
              <div
                className="row"
                style={{ marginTop: "0.35rem", flexWrap: "wrap", gap: "0.4rem" }}
              >
                <input
                  type="text"
                  value={priorityDraft}
                  placeholder={
                    currentPriorities.length > 0
                      ? currentPriorities.join(", ")
                      : "housing, healthcare, jobs"
                  }
                  onChange={(event) => setPriorityDraft(event.target.value)}
                  style={{ minWidth: "16rem", flex: 1 }}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const priorities = priorityDraft
                      .split(",")
                      .map((part) => part.trim())
                      .filter(Boolean);
                    if (priorities.length === 0) return;
                    run({ type: "SET_PARTY_PRIORITIES", partyId, priorities });
                    setPriorityDraft("");
                  }}
                >
                  Set priorities
                </button>
              </div>
              {currentPriorities.length > 0 ? (
                <p className="muted small">Current: {currentPriorities.join(" · ")}</p>
              ) : null}

              <SectionDivider title="Official position" hint="Public stance on a platform issue" />
              <div
                className="row"
                style={{ marginTop: "0.35rem", flexWrap: "wrap", gap: "0.4rem" }}
              >
                <select
                  value={positionIssue}
                  onChange={(event) => setPositionIssue(event.target.value as PartyPlatformIssue)}
                >
                  {PARTY_PLATFORM_ISSUES.map((issue) => (
                    <option key={issue} value={issue}>
                      {PARTY_PLATFORM_LABELS[issue]}
                    </option>
                  ))}
                </select>
                {(["support", "oppose", "neutral"] as const).map((stance) => (
                  <button
                    key={stance}
                    type="button"
                    className={`btn btn-sm${currentPosition === stance ? "" : " secondary"}`}
                    onClick={() =>
                      run({
                        type: "SET_PARTY_OFFICIAL_POSITION",
                        partyId,
                        issueId: positionIssue,
                        stance,
                      })
                    }
                  >
                    {stance}
                  </button>
                ))}
              </div>

              <SectionDivider title="Campaign strategy" hint="National organisation descriptor" />
              <div
                className="row"
                style={{ marginTop: "0.35rem", flexWrap: "wrap", gap: "0.4rem" }}
              >
                <select
                  value={campaignStrategyDraft}
                  onChange={(event) => setCampaignStrategyDraft(event.target.value)}
                >
                  <option value="persuasion">Persuasion</option>
                  <option value="base_turnout">Base turnout</option>
                  <option value="attack">Attack</option>
                  <option value="coalition_focus">Coalition focus</option>
                  <option value="governance_record">Governance record</option>
                </select>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    run({
                      type: "SET_PARTY_CAMPAIGN_STRATEGY",
                      partyId,
                      strategy: campaignStrategyDraft,
                    })
                  }
                >
                  Set strategy
                </button>
              </div>
              {currentStrategy ? (
                <p className="muted small">Current: {currentStrategy.replaceAll("_", " ")}</p>
              ) : null}

              <SectionDivider title="Allocate support" hint="Share 0–1 toward a target key" />
              <div
                className="row"
                style={{ marginTop: "0.35rem", flexWrap: "wrap", gap: "0.4rem" }}
              >
                <input
                  type="text"
                  value={supportTarget}
                  onChange={(event) => setSupportTarget(event.target.value)}
                  placeholder="national"
                  style={{ width: "8rem" }}
                />
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={supportShare}
                  onChange={(event) => setSupportShare(event.target.value)}
                  style={{ width: "5rem" }}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const share = Number(supportShare);
                    if (!supportTarget.trim() || !Number.isFinite(share)) return;
                    run({
                      type: "ALLOCATE_PARTY_SUPPORT",
                      partyId,
                      allocations: {
                        ...(partyOrg?.supportAllocations?.[partyId] ?? {}),
                        [supportTarget.trim()]: share,
                      },
                    });
                  }}
                >
                  Allocate
                </button>
              </div>

              <SectionDivider title="Coalition talks" hint="Authorise talks with a partner party" />
              <div
                className="row"
                style={{ marginTop: "0.35rem", flexWrap: "wrap", gap: "0.4rem" }}
              >
                <select
                  value={coalitionPartnerId || partnerPartyOptions[0] || ""}
                  onChange={(event) => setCoalitionPartnerId(event.target.value)}
                >
                  {partnerPartyOptions.map((id) => (
                    <option key={id} value={id}>
                      {partyDisplayName(props.world, id, props.snap)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn"
                  disabled={partnerPartyOptions.length === 0}
                  onClick={() => {
                    const partnerPartyId = coalitionPartnerId || partnerPartyOptions[0];
                    if (!partnerPartyId) return;
                    run({
                      type: "AUTHORIZE_COALITION_TALKS",
                      partyId,
                      partnerPartyId,
                      authorize: true,
                    });
                  }}
                >
                  Authorise talks
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={partnerPartyOptions.length === 0}
                  onClick={() => {
                    const partnerPartyId = coalitionPartnerId || partnerPartyOptions[0];
                    if (!partnerPartyId) return;
                    run({
                      type: "AUTHORIZE_COALITION_TALKS",
                      partyId,
                      partnerPartyId,
                      authorize: false,
                    });
                  }}
                >
                  Rescind
                </button>
              </div>

              <SectionDivider title="Endorse candidate" hint="Chair-level endorsement" />
              <div
                className="row"
                style={{ marginTop: "0.35rem", flexWrap: "wrap", gap: "0.4rem" }}
              >
                <select
                  value={endorseCandidateId || partyMemberOptions[0]?.id || ""}
                  onChange={(event) => setEndorseCandidateId(event.target.value)}
                >
                  {partyMemberOptions.map((politician) => (
                    <option key={politician.id} value={politician.id}>
                      {politicianDisplayName(props.catalog, politician.id)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn"
                  disabled={partyMemberOptions.length === 0}
                  onClick={() => {
                    const candidateId = endorseCandidateId || partyMemberOptions[0]?.id;
                    if (!candidateId) return;
                    run({
                      type: "ENDORSE_CANDIDATE_AS_CHAIR",
                      partyId,
                      candidateId,
                    });
                  }}
                >
                  Endorse
                </button>
              </div>

              <SectionDivider title="Recommend discipline" hint="Pending action against a member" />
              <div
                className="row"
                style={{ marginTop: "0.35rem", flexWrap: "wrap", gap: "0.4rem" }}
              >
                <select
                  value={disciplineTargetId || partyMemberOptions[0]?.id || ""}
                  onChange={(event) => setDisciplineTargetId(event.target.value)}
                >
                  {partyMemberOptions.map((politician) => (
                    <option key={politician.id} value={politician.id}>
                      {politicianDisplayName(props.catalog, politician.id)}
                    </option>
                  ))}
                </select>
                <select
                  value={disciplineKind}
                  onChange={(event) =>
                    setDisciplineKind(
                      event.target.value as "warning" | "censure" | "suspend_support",
                    )
                  }
                >
                  <option value="warning">Warning</option>
                  <option value="censure">Censure</option>
                  <option value="suspend_support">Suspend support</option>
                </select>
                <button
                  type="button"
                  className="btn danger"
                  disabled={partyMemberOptions.length === 0}
                  onClick={() => {
                    const targetPoliticianId = disciplineTargetId || partyMemberOptions[0]?.id;
                    if (!targetPoliticianId) return;
                    run({
                      type: "RECOMMEND_PARTY_DISCIPLINE",
                      partyId,
                      targetPoliticianId,
                      kind: disciplineKind,
                    });
                  }}
                >
                  Recommend
                </button>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="Chair term">
            <dl className="dossier-facts compact">
              <div>
                <dt>Assumed</dt>
                <dd>{chairAssumed ?? "—"}</dd>
              </div>
              <div>
                <dt>Open election</dt>
                <dd>
                  {openChairElection
                    ? `Open since ${openChairElection.openedDate} · ${openChairElection.candidates.length} candidates`
                    : "None"}
                </dd>
              </div>
            </dl>
            {partyId &&
            partyId === playerPartyId &&
            !openChairElection &&
            (isNationalChair || isNationalViceChair) ? (
              <button
                type="button"
                className="btn secondary"
                onClick={() => run({ type: "OPEN_PARTY_CHAIR_ELECTION", partyId })}
              >
                Open chair election
              </button>
            ) : null}
            {isNationalTreasurer && !isNationalChair ? (
              <p className="muted small">
                You hold the Treasurer seat — finance workspace is limited in this build.
              </p>
            ) : null}
          </SectionCard>
          <SectionCard title="National Committee">
            {nationalCommittee.length === 0 ? (
              <EmptyState>Committee not seeded.</EmptyState>
            ) : (
              <>
                <p className="muted">{nationalCommittee.length} members</p>
                <div className="politician-card-grid">
                  {nationalCommittee.slice(0, 24).map((id) => (
                    <PoliticianCard
                      key={id}
                      catalog={props.catalog}
                      world={props.world}
                      state={props.snap}
                      politicianId={id}
                      compact
                      descriptor="Committee"
                    />
                  ))}
                </div>
              </>
            )}
          </SectionCard>
          <SectionCard title="Recent committee votes">
            {committeeVotes.length === 0 ? (
              <EmptyState>No committee votes recorded.</EmptyState>
            ) : (
              committeeVotes.map((e) => (
                <EntityRow
                  key={e.id}
                  title={String(e.payload.proposalKind ?? "Proposal")}
                  meta={`${e.date} · ${e.payload.yes ?? 0} yes / ${e.payload.no ?? 0} no · ${e.payload.passed ? "Passed" : "Rejected"}`}
                />
              ))
            )}
          </SectionCard>
          <SectionCard title="Nominations and leadership">
            {contests.length === 0 ? <EmptyState>No current party contests.</EmptyState> : null}
            {contests.map((c) => {
              const publicEndorsements = Object.values(props.snap.endorsements)
                .filter((endorsement) => endorsement.contestId === c.id && endorsement.public)
                .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
              const liveEndorsements = publicEndorsements.filter(
                (endorsement) => endorsement.status === "active",
              );
              const playerEndorsement = liveEndorsements.find(
                (endorsement) =>
                  endorsement.endorserType === "politician" &&
                  endorsement.endorserId === props.snap.playerPoliticianId,
              );
              const playerIsCandidate = isDeclaredContestCandidate(
                c,
                props.snap.playerPoliticianId,
              );
              const canEndorse =
                partyId === playerPartyId &&
                !playerIsCandidate &&
                c.status !== "resolved" &&
                c.status !== "cancelled";
              return (
                <div key={c.id} className="contest-card">
                  <strong>{contestDisplayName(props.snap, props.world, c.id)}</strong>{" "}
                  <StatusBadge tone={c.status === "open" ? "warn" : "idle"}>
                    {c.status.replaceAll("_", " ")}
                  </StatusBadge>
                  <div className="muted">
                    {
                      Object.values(c.entries).filter((entry) => entry.status !== "potential")
                        .length
                    }{" "}
                    candidates
                  </div>
                  <div className="party-contest-field">
                    {Object.values(c.entries)
                      .filter((entry) => entry.status !== "potential")
                      .slice(0, 8)
                      .map((entry) => (
                        <PoliticianCard
                          key={entry.politicianId}
                          catalog={props.catalog}
                          world={props.world}
                          state={props.snap}
                          politicianId={entry.politicianId}
                          compact
                          action={
                            canEndorse &&
                            !playerEndorsement &&
                            (entry.status === "declared" || entry.status === "qualified") ? (
                              <button
                                type="button"
                                className="btn secondary btn-sm"
                                onClick={() =>
                                  run({
                                    type: "ENDORSE_PARTY_CONTEST_CANDIDATE",
                                    contestId: c.id,
                                    endorserId: props.snap.playerPoliticianId,
                                    targetId: entry.politicianId,
                                  })
                                }
                              >
                                Endorse
                              </button>
                            ) : null
                          }
                        />
                      ))}
                  </div>
                  {c.winnerId ? (
                    <div>Winner: {politicianDisplayName(props.catalog, c.winnerId)}</div>
                  ) : null}
                  {playerEndorsement ? (
                    <div className="player-endorsement-control">
                      <span>
                        You endorsed{" "}
                        <strong>
                          {politicianDisplayName(props.catalog, playerEndorsement.targetId)}
                        </strong>{" "}
                        on {playerEndorsement.date}.
                      </span>
                      <button
                        type="button"
                        className="btn danger quiet"
                        onClick={() =>
                          run({ type: "WITHDRAW_ENDORSEMENT", endorsementId: playerEndorsement.id })
                        }
                      >
                        Withdraw endorsement
                      </button>
                    </div>
                  ) : null}
                  {publicEndorsements.length ? (
                    <details className="endorsement-network">
                      <summary>
                        Public endorsement record ({liveEndorsements.length} current ·{" "}
                        {publicEndorsements.length - liveEndorsements.length} closed)
                      </summary>
                      {publicEndorsements.slice(0, 20).map((endorsement) => {
                        const statusEvent = props.snap.history
                          .slice()
                          .reverse()
                          .find(
                            (event) =>
                              event.payload.endorsementId === endorsement.id &&
                              (event.type === "ENDORSEMENT_WITHDRAWN" ||
                                event.type === "ENDORSEMENT_ENDED" ||
                                event.type === "ENDORSEMENT_SWITCHED"),
                          );
                        return (
                          <EntityRow
                            key={endorsement.id}
                            title={endorsementActorName(
                              endorsement.endorserType,
                              endorsement.endorserId,
                            )}
                            meta={`Backs ${politicianDisplayName(props.catalog, endorsement.targetId)} · endorsed ${endorsement.date}${statusEvent ? ` · status changed ${statusEvent.date}` : ""}`}
                            status={
                              <StatusBadge tone={endorsement.status === "active" ? "ok" : "idle"}>
                                {endorsement.status === "active"
                                  ? "Current"
                                  : endorsement.status[0]!.toUpperCase() +
                                    endorsement.status.slice(1)}
                              </StatusBadge>
                            }
                          />
                        );
                      })}
                    </details>
                  ) : null}
                  {c.status === "open" &&
                  partyId === playerPartyId &&
                  !c.entries[props.snap.playerPoliticianId] ? (
                    <button
                      className="btn"
                      onClick={() =>
                        run({
                          type: "DECLARE_PARTY_CONTEST_CANDIDACY",
                          contestId: c.id,
                          politicianId: props.snap.playerPoliticianId,
                        })
                      }
                    >
                      Enter contest
                    </button>
                  ) : null}
                </div>
              );
            })}
          </SectionCard>
        </>
      ) : null}

      {partyTab === "caucuses" ? (
        <>
          <SectionCard title="Caucuses">
            {caucusRows.length === 0 ? (
              <EmptyState>No caucuses listed for this party.</EmptyState>
            ) : (
              <DataTable
                dense
                headers={["Caucus", "Membership %", "MP %", "Institutional %", "Leader", "Stance"]}
              >
                {caucusRows.map((c) => (
                  <tr key={c.fid}>
                    <td>
                      <button
                        type="button"
                        className="btn secondary btn-sm"
                        onClick={() => {
                          setSelectedFactionId(c.fid);
                          props.setGlobalFocus({ kind: "Caucus", id: c.fid });
                        }}
                      >
                        {c.name}
                      </button>
                    </td>
                    <td>{c.membershipPct}%</td>
                    <td>{c.mpPct}%</td>
                    <td>{c.institutionalPct}%</td>
                    <td>
                      {c.leaderId ? politicianDisplayName(props.catalog, c.leaderId) : "vacant"}
                    </td>
                    <td>{c.stance}</td>
                  </tr>
                ))}
              </DataTable>
            )}
            <p className="muted small">Select a caucus for detail and chair actions.</p>
          </SectionCard>
          <SectionCard title="Assembly Delegation">
            <p className="muted">
              Sitting MPs elect floor leader and whip. This is not National Leadership (Chair / Vice
              / Treasurer).
            </p>
            {caucusLeadership ? (
              <div className="faction-cards">
                {caucusLeadership.floorLeaderId ? (
                  <PoliticianCard
                    catalog={props.catalog}
                    world={props.world}
                    state={props.snap}
                    politicianId={caucusLeadership.floorLeaderId}
                    office="Floor leader"
                    compact
                  />
                ) : (
                  <div className="faction-card">
                    <strong>Floor leader</strong>
                    <div className="muted">Vacant</div>
                  </div>
                )}
                {caucusLeadership.whipId ? (
                  <PoliticianCard
                    catalog={props.catalog}
                    world={props.world}
                    state={props.snap}
                    politicianId={caucusLeadership.whipId}
                    office="Whip"
                    compact
                  />
                ) : (
                  <div className="faction-card">
                    <strong>Whip</strong>
                    <div className="muted">Vacant</div>
                  </div>
                )}
                <div className="faction-card">
                  <strong>Next delegation election</strong>
                  <div className="muted">{caucusLeadership.nextElectionDate}</div>
                </div>
              </div>
            ) : (
              <EmptyState>No sitting Assembly delegation.</EmptyState>
            )}
            {caucusContests
              .filter((contest) => contest.status === "open")
              .map((contest) => (
                <div key={contest.id} className="decision-row">
                  <div>
                    <strong>
                      {contest.role === "floor_leader" ? "Floor leader election" : "Whip election"}
                    </strong>
                    <div className="muted">
                      Assembly members voting · closes {contest.closeDate} ·{" "}
                      {contest.candidateIds.length} candidates ·{" "}
                      {contest.trigger.replaceAll("_", " ")}
                    </div>
                    {contest.playerDecision === "declared" &&
                    !contest.platforms[props.snap.playerPoliticianId] ? (
                      <div className="button-row" aria-label="Choose caucus campaign emphasis">
                        <button
                          className="btn btn-sm"
                          onClick={() =>
                            run({
                              type: "CAMPAIGN_CAUCUS_LEADERSHIP",
                              contestId: contest.id,
                              emphasis: "legislative_agenda",
                            })
                          }
                        >
                          Legislative agenda
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() =>
                            run({
                              type: "CAMPAIGN_CAUCUS_LEADERSHIP",
                              contestId: contest.id,
                              emphasis: "party_unity",
                            })
                          }
                        >
                          Party unity
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() =>
                            run({
                              type: "CAMPAIGN_CAUCUS_LEADERSHIP",
                              contestId: contest.id,
                              emphasis: "electoral_recovery",
                            })
                          }
                        >
                          Electoral recovery
                        </button>
                      </div>
                    ) : null}
                    {contest.platforms[props.snap.playerPoliticianId] ? (
                      <div className="muted">
                        Your campaign:{" "}
                        {contest.platforms[props.snap.playerPoliticianId]!.replaceAll("_", " ")} ·{" "}
                        {contest.endorsements[props.snap.playerPoliticianId]?.length ?? 0}{" "}
                        delegation endorsements
                      </div>
                    ) : null}
                  </div>
                  {partyId === playerPartyId && contest.playerDecision == null ? (
                    <button
                      className="btn"
                      onClick={() =>
                        run({ type: "DECLARE_CAUCUS_LEADERSHIP_CANDIDACY", contestId: contest.id })
                      }
                    >
                      Stand for election
                    </button>
                  ) : (
                    <StatusBadge>{contest.playerDecision ?? contest.status}</StatusBadge>
                  )}
                </div>
              ))}
          </SectionCard>
        </>
      ) : null}

      {partyTab === "platform" ? (
        <>
          <SectionCard title="Public platform">
            {runtime?.publicPlatform ? (
              <>
                <p className="muted">
                  Public issue positions move gradually with party identity, caucus influence, and
                  leadership. Updated {runtime.publicPlatform.updatedDate}.
                </p>
                <div className="party-platform-grid">
                  {PARTY_PLATFORM_ISSUES.map((issue) => (
                    <div key={issue} className="party-platform-position">
                      <span>{PARTY_PLATFORM_LABELS[issue]}</span>
                      <strong>
                        {partyPlatformLabel(issue, runtime.publicPlatform!.positions[issue])}
                      </strong>
                    </div>
                  ))}
                </div>
                <details className="platform-history">
                  <summary>
                    Recent published platforms ({runtime.publicPlatform.history.length})
                  </summary>
                  {runtime.publicPlatform.history.length === 0 ? (
                    <EmptyState>No prior platform publication is recorded in this save.</EmptyState>
                  ) : (
                    runtime.publicPlatform.history
                      .slice()
                      .reverse()
                      .slice(0, 6)
                      .map((entry) => {
                        const emphasis = PARTY_PLATFORM_ISSUES.slice()
                          .sort(
                            (a, b) =>
                              Math.abs(entry.positions[b]) - Math.abs(entry.positions[a]) ||
                              a.localeCompare(b),
                          )
                          .slice(0, 2)
                          .map(
                            (issue) =>
                              `${PARTY_PLATFORM_LABELS[issue]}: ${partyPlatformLabel(issue, entry.positions[issue])}`,
                          )
                          .join(" · ");
                        return (
                          <EntityRow
                            key={`${entry.date}:${entry.reason}`}
                            title={
                              entry.reason === "scenario_opening"
                                ? "Opening platform"
                                : entry.reason === "leadership_change"
                                  ? "Leadership platform"
                                  : "Annual party platform"
                            }
                            meta={`${entry.date}${entry.leaderId ? ` · Leader ${politicianDisplayName(props.catalog, entry.leaderId)}` : ""} · ${emphasis}`}
                          />
                        );
                      })
                  )}
                </details>
              </>
            ) : (
              <EmptyState>This party has not yet published a public platform.</EmptyState>
            )}
          </SectionCard>
        </>
      ) : null}

      {partyTab === "organization" ? (
        <>
          <SectionCard title="Organization">
            <dl className="dossier-facts compact">
              <div>
                <dt>Campaign strategy</dt>
                <dd>{currentStrategy ? currentStrategy.replaceAll("_", " ") : "None set"}</dd>
              </div>
              <div>
                <dt>Support allocations</dt>
                <dd>
                  {Object.keys(partyOrg?.supportAllocations?.[partyId ?? ""] ?? {}).length > 0
                    ? Object.entries(partyOrg?.supportAllocations?.[partyId ?? ""] ?? {})
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Committee size</dt>
                <dd>{nationalCommittee.length || "—"}</dd>
              </div>
            </dl>
            <p className="muted">
              Chair operational tools (priorities, endorsements, coalition talks, discipline) live
              on the Leadership tab when you hold office.
            </p>
          </SectionCard>
          {elections.length > 0 ? (
            <SectionCard title="Recent electoral performance">
              {elections.map((e) => (
                <div key={e.id}>
                  {electionDisplayName(e.id)} ·{" "}
                  {e.type === "assembly"
                    ? Object.entries(e.assembly?.partySeatTotals ?? {})
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(
                          ([id, seats]) =>
                            `${partyDisplayName(props.world, id === "independent" ? null : id, props.snap)} ${seats}`,
                        )
                        .join(" · ") || `${e.winnerIds.length} members elected`
                    : e.winnerIds[0]
                      ? politicianDisplayName(props.catalog, e.winnerIds[0])
                      : e.status}
                </div>
              ))}
            </SectionCard>
          ) : null}
        </>
      ) : null}

      {partyTab === "history" ? (
        <>
          <SectionCard title="Recent party events">
            {recent.length === 0 ? <EmptyState>No recent public party events.</EmptyState> : null}
            {recent.map((e) => (
              <ActivityFeedItem
                key={e.id}
                date={e.date}
                text={eventDisplay(props.catalog, props.world, props.snap, e)}
              />
            ))}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
