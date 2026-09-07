import { useEffect, useState } from "react";
import {
  activeCaucusesForParty,
  addMonths,
  ALLOCATION_BUCKETS,
  CAMPAIGN_STRATEGY_CATALOG,
  countActiveCaucuses,
  currentAssemblyMemberIds,
  getCampaignStrategy,
  getPartyPriority,
  getPartyRules,
  isDeclaredContestCandidate,
  ISSUE_EMPHASIS_LEVELS,
  leadershipStability,
  listPartyPriorities,
  normalizeSupportAllocations,
  PARTY_PLATFORM_ISSUES,
  partyLegalStatus,
  partyPlatformLabel,
  PLATFORM_POLICY_OPTIONS,
  type AllocationBucketId,
  type CaucusGrowthStrategy,
  type CommandResult,
  type IssueEmphasisLevel,
  type KernelWorld,
  type PartyPlatformIssue,
  type SimState,
  type Simulation,
  formatInfluenceBand,
  formatShareEstimate,
  canShowExactInternals,
} from "@lorsain/sim";
import { useSettings } from "./settingsContext.js";
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

const CAUCUS_GROWTH_OPTIONS: CaucusGrowthStrategy[] = [
  "recruit_members",
  "recruit_mps",
  "win_committee",
  "win_leadership",
  "influence_platform",
  "back_primaries",
  "provincial_base",
];

const ALLOCATION_BUCKET_IDS = Object.keys(ALLOCATION_BUCKETS) as AllocationBucketId[];

function titleCaseWords(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function chairElectionMethodLabel(method: string): string {
  switch (method) {
    case "convention_delegates":
      return "Convention support";
    case "membership":
      return "Membership ballot";
    case "committee":
      return "National committee";
    default:
      return titleCaseWords(method);
  }
}

function stabilityLabel(value: string): string {
  return titleCaseWords(value);
}

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
  const { debugMode } = useSettings();
  const exactShares = canShowExactInternals(debugMode);
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
  const [priorityPick, setPriorityPick] = useState("");
  const [plankIssue, setPlankIssue] = useState<string>("labor");
  const [plankOption, setPlankOption] = useState("");
  const [liveBillId, setLiveBillId] = useState("");
  const [campaignStrategyDraft, setCampaignStrategyDraft] = useState("persuasion");
  const [allocationDraft, setAllocationDraft] = useState<Record<string, number>>({});
  const [endorseContestFilter, setEndorseContestFilter] = useState<string>("all");
  const [disciplineTargetId, setDisciplineTargetId] = useState("");
  const [disciplineKind, setDisciplineKind] = useState<"warning" | "censure" | "suspend_support">(
    "warning",
  );
  const [partyTab, setPartyTab] = useState<PartyTab>("overview");
  const [caucusPriorityDraft, setCaucusPriorityDraft] = useState("");
  const [caucusEndorseId, setCaucusEndorseId] = useState("");
  const [caucusPrimaryEndorseId, setCaucusPrimaryEndorseId] = useState("");
  const [caucusAllianceId, setCaucusAllianceId] = useState("");
  const [caucusGrowthDraft, setCaucusGrowthDraft] =
    useState<CaucusGrowthStrategy>("recruit_members");
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
  const issueEmphasis = partyId ? (partyOrg?.issueEmphasis?.[partyId] ?? {}) : {};
  const platformPlanks = partyId ? (partyOrg?.platformPlanks?.[partyId] ?? {}) : {};
  const nationalCommittee = partyId ? (partyOrg?.nationalCommittee?.[partyId] ?? []) : [];
  const pendingCommitteeVotes = partyId
    ? Object.values(partyOrg?.pendingCommitteeVotes ?? {}).filter(
        (vote) => vote.partyId === partyId && vote.status === "pending",
      )
    : [];
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
  const partyRules = partyId ? getPartyRules(props.snap, props.world, partyId) : null;
  const chairStability = partyId ? leadershipStability(props.snap, partyId) : null;
  const activeCaucusCount = partyId ? countActiveCaucuses(props.snap, partyId) : 0;
  const liveFloorBills = Object.values(props.snap.legislatureRuntime?.bills ?? {})
    .filter(
      (bill) =>
        bill.status === "floor_scheduled" ||
        bill.status === "repassage_scheduled" ||
        bill.status === "sent_to_president",
    )
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, 8);
  const supportAllocations = partyId ? (partyOrg?.supportAllocations?.[partyId] ?? {}) : {};
  useEffect(() => {
    if (!partyId) {
      setAllocationDraft({});
      return;
    }
    const seeded: Record<string, number> = {};
    for (const id of ALLOCATION_BUCKET_IDS) {
      seeded[id] = Number(supportAllocations[id] ?? 0);
    }
    setAllocationDraft(normalizeSupportAllocations(seeded));
  }, [partyId, props.snap.currentDate, supportAllocations]);
  useEffect(() => {
    if (currentStrategy && CAMPAIGN_STRATEGY_CATALOG[currentStrategy]) {
      setCampaignStrategyDraft(currentStrategy);
    }
  }, [currentStrategy]);
  const caucusRows = partyId
    ? activeCaucusesForParty(props.snap, partyId)
        .map((row) => {
          const fid = row.factionId;
          const chair = props.snap.factionStates[fid]?.chairId ?? row.leaderId ?? null;
          const memberShare = row.partyMemberSupport ?? 0;
          const mpShare = row.assemblyShare ?? 0;
          const institutionalShare = row.institutionalInfluence ?? 0;
          return {
            fid,
            name: factionDisplayName(props.world, fid),
            membershipPct: Math.round(memberShare * 100),
            membershipLabel: formatShareEstimate(memberShare, { exact: exactShares }),
            influenceLabel: formatInfluenceBand(memberShare),
            mpPct: Math.round(mpShare * 100),
            institutionalPct: Math.round(institutionalShare * 100),
            institutionalLabel: formatInfluenceBand(institutionalShare),
            leaderId: chair,
            stance: row.stanceTowardChair ?? "cooperative",
            growthStrategy: row.growthStrategy ?? "recruit_members",
            row,
          };
        })
        .sort((a, b) => b.membershipPct - a.membershipPct || a.name.localeCompare(b.name))
    : [];
  const unalignedShares = partyId
    ? props.snap.caucusRuntime?.unalignedByParty?.[partyId]
    : undefined;
  const supportingCaucuses = caucusRows.filter(
    (c) => c.stance === "loyal" || c.stance === "cooperative",
  );
  const opposingCaucuses = caucusRows.filter(
    (c) => c.stance === "critical" || c.stance === "oppositional",
  );
  const biggestCaucuses = caucusRows.slice(0, 3);
  const termEndDate =
    chairAssumed && partyRules && partyRules.termMonths > 0
      ? addMonths(chairAssumed, partyRules.termMonths)
      : null;
  const nextChairElectionLabel = openChairElection
    ? `Open now · ${openChairElection.candidates.length} candidates`
    : termEndDate
      ? `Scheduled around ${termEndDate}`
      : partyRules?.termMonths === 0
        ? "Indefinite until vacancy or challenge"
        : "Not scheduled";
  const playerLedCaucus = caucusRows.find((c) => c.leaderId === playerId) ?? null;
  const activePrimaryCandidates = contests
    .filter(
      (c) =>
        c.status !== "resolved" &&
        c.status !== "cancelled" &&
        (c.type === "presidential_nomination" || c.type === "party_leadership"),
    )
    .flatMap((c) =>
      Object.values(c.entries)
        .filter((entry) => entry.status === "declared" || entry.status === "qualified")
        .map((entry) => ({
          contest: c,
          entry,
        })),
    );
  const chairElectionCandidates = openChairElection?.candidates ?? [];
  const endorsementCandidates = contests
    .filter((c) => c.status !== "resolved" && c.status !== "cancelled")
    .flatMap((c) =>
      Object.values(c.entries)
        .filter((entry) => entry.status === "declared" || entry.status === "qualified")
        .map((entry) => ({ contest: c, entry })),
    )
    .filter((row) => endorseContestFilter === "all" || row.contest.type === endorseContestFilter);
  const metaFunds =
    partyId && partyOrg?.metadata
      ? (partyOrg.metadata[`funds_${partyId}`] ??
        partyOrg.metadata[`party_funds_${partyId}`] ??
        partyOrg.metadata.funds)
      : undefined;
  const metaReserves =
    partyId && partyOrg?.metadata
      ? (partyOrg.metadata[`reserves_${partyId}`] ??
        partyOrg.metadata[`party_reserves_${partyId}`] ??
        partyOrg.metadata.reserves)
      : undefined;
  const budgetRecommendation =
    partyId && partyOrg?.metadata ? partyOrg.metadata[`budget_recommend_${partyId}`] : undefined;

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
                label: "Active caucuses",
                value: activeCaucusCount,
              },
              {
                label: "Chair stability",
                value: chairStability ? stabilityLabel(chairStability) : "—",
              },
              {
                label: "Term",
                value: chairAssumed
                  ? termEndDate
                    ? `${chairAssumed} → ${termEndDate}`
                    : `Since ${chairAssumed}`
                  : "Vacant",
              },
              {
                label: "Seats",
                value: `${caucus} / ${totalSeats}`,
              },
            ]}
          />
          <SectionCard title="Biggest caucuses">
            <p className="muted small">{activeCaucusCount} active caucuses</p>
            {biggestCaucuses.length === 0 ? (
              <EmptyState>No active caucuses recorded yet.</EmptyState>
            ) : (
              <DataTable
                dense
                headers={["Caucus", "Party members", "MPs", "Institutional", "Stance"]}
              >
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
                    <td>{c.institutionalPct}%</td>
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
          <div data-qa="party-leadership">
            <SectionCard title="National Chair">
              {partyOfficers?.chair?.politicianId ? (
                <PoliticianCard
                  catalog={props.catalog}
                  world={props.world}
                  state={props.snap}
                  politicianId={partyOfficers.chair.politicianId}
                  office="National Chair"
                />
              ) : (
                <EmptyState>National Chair is vacant.</EmptyState>
              )}
              <BriefStrip
                items={[
                  {
                    label: "Term",
                    value: chairAssumed
                      ? termEndDate
                        ? `${chairAssumed} → ${termEndDate}`
                        : `Since ${chairAssumed}`
                      : "—",
                  },
                  { label: "Next election", value: nextChairElectionLabel },
                  {
                    label: "Stability",
                    value: chairStability ? stabilityLabel(chairStability) : "—",
                  },
                  {
                    label: "Method",
                    value: partyRules
                      ? chairElectionMethodLabel(partyRules.chairElectionMethod)
                      : "—",
                  },
                ]}
              />
              <div className="row" style={{ gap: "1.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                <div>
                  <div className="muted small">Supporting caucuses</div>
                  <div>
                    {supportingCaucuses.length === 0
                      ? "None clearly aligned"
                      : supportingCaucuses
                          .slice(0, 4)
                          .map((c) => c.name)
                          .join(" · ")}
                  </div>
                </div>
                <div>
                  <div className="muted small">Opposing caucuses</div>
                  <div>
                    {opposingCaucuses.length === 0
                      ? "No open rebellion"
                      : opposingCaucuses
                          .slice(0, 4)
                          .map((c) => c.name)
                          .join(" · ")}
                  </div>
                </div>
              </div>
              <p className="muted small" style={{ marginTop: "0.5rem" }}>
                National Chair leads the party organization. Assembly Delegation leadership is a
                separate institution elected by sitting MPs.
              </p>
              {(isNationalViceChair || isNationalTreasurer) && !isNationalChair ? (
                <p className="muted small">
                  {isNationalViceChair
                    ? "You hold the Vice Chair seat — you may act for the Chair on organization business when substituting."
                    : null}
                  {isNationalTreasurer
                    ? " You hold the Treasurer seat — budget recommendation and resource allocation are your workspace."
                    : null}
                </p>
              ) : null}
            </SectionCard>
          </div>

          <div data-qa="structured-priorities">
            <SectionCard title="Current leadership agenda">
              {currentPriorities.length === 0 ? (
                <EmptyState>No structured priorities set.</EmptyState>
              ) : (
                <ol style={{ margin: "0 0 0.75rem", paddingLeft: "1.25rem" }}>
                  {currentPriorities.slice(0, 5).map((id, index) => {
                    const def = getPartyPriority(id);
                    return (
                      <li key={`${id}-${index}`} style={{ marginBottom: "0.45rem" }}>
                        <strong>{def?.label ?? titleCaseWords(id)}</strong>
                        {def?.effectsHint ? (
                          <div className="muted small">{def.effectsHint}</div>
                        ) : null}
                        {showNationalChairWorkspace ? (
                          <div
                            className="row"
                            style={{ gap: "0.35rem", flexWrap: "wrap", marginTop: "0.25rem" }}
                          >
                            <button
                              type="button"
                              className="btn secondary btn-sm"
                              disabled={index === 0}
                              onClick={() => {
                                const next = [...currentPriorities];
                                const tmp = next[index - 1]!;
                                next[index - 1] = next[index]!;
                                next[index] = tmp;
                                run({
                                  type: "SET_PARTY_PRIORITIES",
                                  partyId: partyId!,
                                  priorities: next,
                                });
                              }}
                            >
                              Up
                            </button>
                            <button
                              type="button"
                              className="btn secondary btn-sm"
                              disabled={index >= currentPriorities.length - 1}
                              onClick={() => {
                                const next = [...currentPriorities];
                                const tmp = next[index + 1]!;
                                next[index + 1] = next[index]!;
                                next[index] = tmp;
                                run({
                                  type: "SET_PARTY_PRIORITIES",
                                  partyId: partyId!,
                                  priorities: next,
                                });
                              }}
                            >
                              Down
                            </button>
                            <button
                              type="button"
                              className="btn danger quiet btn-sm"
                              onClick={() => {
                                const next = currentPriorities.filter((_, i) => i !== index);
                                run({
                                  type: "SET_PARTY_PRIORITIES",
                                  partyId: partyId!,
                                  priorities: next,
                                });
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              )}
              {showNationalChairWorkspace && partyId ? (
                <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
                  <select
                    value={priorityPick}
                    onChange={(event) => setPriorityPick(event.target.value)}
                  >
                    <option value="">Add priority from catalog…</option>
                    {listPartyPriorities()
                      .filter((def) => !currentPriorities.includes(def.id))
                      .map((def) => (
                        <option key={def.id} value={def.id}>
                          {def.label} ({def.kind})
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="btn"
                    disabled={!priorityPick || currentPriorities.length >= 5}
                    onClick={() => {
                      if (!priorityPick) return;
                      const next = [...currentPriorities, priorityPick].slice(0, 5);
                      run({ type: "SET_PARTY_PRIORITIES", partyId, priorities: next });
                      setPriorityPick("");
                    }}
                  >
                    Add to agenda
                  </button>
                </div>
              ) : null}
            </SectionCard>
          </div>

          {(pendingCommitteeVotes.length > 0 || openChairElection) && partyId ? (
            <SectionCard title="Action required">
              {pendingCommitteeVotes.map((vote) => (
                <div key={vote.id} className="decision-row" style={{ marginBottom: "0.5rem" }}>
                  <div>
                    <strong>{titleCaseWords(vote.proposalKind)}</strong>
                    <div className="muted small">
                      Pending since {vote.createdDate} · NPC lean {vote.npcYes} yes / {vote.npcNo}{" "}
                      no / {vote.npcAbstain} abstain
                    </div>
                  </div>
                  {partyId === playerPartyId ? (
                    <div className="row" style={{ gap: "0.35rem" }}>
                      {(["yes", "no", "abstain"] as const).map((choice) => (
                        <button
                          key={choice}
                          type="button"
                          className="btn btn-sm"
                          onClick={() =>
                            run({ type: "CAST_NATIONAL_COMMITTEE_VOTE", voteId: vote.id, choice })
                          }
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {openChairElection ? (
                <EntityRow
                  title="Chair election open"
                  meta={`Stage ${titleCaseWords(openChairElection.stage)} · ${openChairElection.candidates.length} candidates · opened ${openChairElection.openedDate}`}
                  status={<StatusBadge tone="warn">Open</StatusBadge>}
                />
              ) : null}
            </SectionCard>
          ) : null}

          {showNationalChairWorkspace && partyId ? (
            <>
              <SectionCard title="Issue emphasis">
                <p className="muted small">
                  Messaging weight per platform issue — not a floor stance on legislation.
                </p>
                <DataTable dense headers={["Issue", "Emphasis"]}>
                  {PARTY_PLATFORM_ISSUES.map((issue) => {
                    const level = (issueEmphasis[issue] ?? "medium") as IssueEmphasisLevel;
                    return (
                      <tr key={issue}>
                        <td>{PARTY_PLATFORM_LABELS[issue]}</td>
                        <td>
                          <div className="row" style={{ gap: "0.3rem", flexWrap: "wrap" }}>
                            {ISSUE_EMPHASIS_LEVELS.map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                className={`btn btn-sm${level === opt ? "" : " secondary"}`}
                                onClick={() =>
                                  run({
                                    type: "SET_ISSUE_EMPHASIS",
                                    partyId,
                                    issueId: issue,
                                    level: opt,
                                  })
                                }
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </DataTable>
              </SectionCard>

              <SectionCard title="Platform planks">
                <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
                  <select
                    value={plankIssue}
                    onChange={(event) => {
                      setPlankIssue(event.target.value);
                      setPlankOption("");
                    }}
                  >
                    {Object.keys(PLATFORM_POLICY_OPTIONS).map((issue) => (
                      <option key={issue} value={issue}>
                        {PARTY_PLATFORM_LABELS[issue as PartyPlatformIssue] ??
                          titleCaseWords(issue)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={plankOption || (PLATFORM_POLICY_OPTIONS[plankIssue]?.[0]?.id ?? "")}
                    onChange={(event) => setPlankOption(event.target.value)}
                  >
                    {(PLATFORM_POLICY_OPTIONS[plankIssue] ?? []).map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      const optionId = plankOption || PLATFORM_POLICY_OPTIONS[plankIssue]?.[0]?.id;
                      if (!optionId) return;
                      run({
                        type: "PROPOSE_PLATFORM_PLANK",
                        partyId,
                        issueId: plankIssue,
                        optionId,
                      });
                    }}
                  >
                    Propose plank
                  </button>
                </div>
                {Object.keys(platformPlanks).length > 0 ? (
                  <ul className="muted small" style={{ marginTop: "0.5rem" }}>
                    {Object.entries(platformPlanks).map(([issue, optionId]) => {
                      const label =
                        PLATFORM_POLICY_OPTIONS[issue]?.find((o) => o.id === optionId)?.label ??
                        optionId;
                      return (
                        <li key={issue}>
                          {PARTY_PLATFORM_LABELS[issue as PartyPlatformIssue] ??
                            titleCaseWords(issue)}
                          : {label}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </SectionCard>

              <SectionCard title="Official position">
                {liveFloorBills.length === 0 ? (
                  <EmptyState>No live floor question selected.</EmptyState>
                ) : (
                  <>
                    <p className="muted small">
                      Public party stance on live Assembly business only.
                    </p>
                    <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
                      <select
                        value={liveBillId || liveFloorBills[0]?.id || ""}
                        onChange={(event) => setLiveBillId(event.target.value)}
                      >
                        {liveFloorBills.map((bill) => (
                          <option key={bill.id} value={bill.id}>
                            {bill.title} ({bill.status.replaceAll("_", " ")})
                          </option>
                        ))}
                      </select>
                      {(["support", "oppose", "neutral"] as const).map((stance) => {
                        const issueId = liveBillId || liveFloorBills[0]?.id;
                        const current =
                          issueId && partyOrg?.positions?.[partyId]?.[issueId]
                            ? partyOrg.positions[partyId]![issueId]
                            : null;
                        return (
                          <button
                            key={stance}
                            type="button"
                            className={`btn btn-sm${current === stance ? "" : " secondary"}`}
                            disabled={!issueId}
                            onClick={() => {
                              if (!issueId) return;
                              run({
                                type: "SET_PARTY_OFFICIAL_POSITION",
                                partyId,
                                issueId,
                                stance,
                              });
                            }}
                          >
                            {stance}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </SectionCard>

              <SectionCard title="Campaign strategy">
                <div
                  className="row"
                  style={{ gap: "0.4rem", flexWrap: "wrap", alignItems: "flex-start" }}
                >
                  <select
                    value={campaignStrategyDraft}
                    onChange={(event) => setCampaignStrategyDraft(event.target.value)}
                  >
                    {Object.values(CAMPAIGN_STRATEGY_CATALOG).map((def) => (
                      <option key={def.id} value={def.id}>
                        {def.label}
                      </option>
                    ))}
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
                {(() => {
                  const def =
                    getCampaignStrategy(campaignStrategyDraft) ??
                    getCampaignStrategy(currentStrategy);
                  if (!def) return null;
                  return (
                    <dl className="dossier-facts compact" style={{ marginTop: "0.6rem" }}>
                      <div>
                        <dt>Approach</dt>
                        <dd>{def.explanation}</dd>
                      </div>
                      <div>
                        <dt>Strengths</dt>
                        <dd>{def.strengths}</dd>
                      </div>
                      <div>
                        <dt>Tradeoffs</dt>
                        <dd>{def.tradeoffs}</dd>
                      </div>
                    </dl>
                  );
                })()}
              </SectionCard>

              <div data-qa="resource-allocator">
                <SectionCard title="Resource allocation">
                  <DataTable dense headers={["Bucket", "Share %"]}>
                    {ALLOCATION_BUCKET_IDS.map((bucketId) => {
                      const pct = Math.round((allocationDraft[bucketId] ?? 0) * 100);
                      return (
                        <tr key={bucketId}>
                          <td>{ALLOCATION_BUCKETS[bucketId].label}</td>
                          <td>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={pct}
                              onChange={(event) => {
                                const next = {
                                  ...allocationDraft,
                                  [bucketId]: Number(event.target.value) / 100,
                                };
                                setAllocationDraft(normalizeSupportAllocations(next));
                              }}
                              style={{ verticalAlign: "middle", marginRight: "0.5rem" }}
                            />
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={pct}
                              onChange={(event) => {
                                const next = {
                                  ...allocationDraft,
                                  [bucketId]: Number(event.target.value) / 100,
                                };
                                setAllocationDraft(normalizeSupportAllocations(next));
                              }}
                              style={{ width: "4rem" }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </DataTable>
                  <button
                    type="button"
                    className="btn"
                    style={{ marginTop: "0.5rem" }}
                    onClick={() =>
                      run({
                        type: "ALLOCATE_PARTY_SUPPORT",
                        partyId,
                        allocations: normalizeSupportAllocations(allocationDraft),
                      })
                    }
                  >
                    Commit allocation
                  </button>
                  {isNationalTreasurer ? (
                    <div style={{ marginTop: "0.75rem" }}>
                      <SectionDivider title="Treasurer workspace" hint="Budget recommendation" />
                      {metaFunds != null || metaReserves != null ? (
                        <BriefStrip
                          items={[
                            ...(metaFunds != null
                              ? [{ label: "Funds", value: String(metaFunds) }]
                              : []),
                            ...(metaReserves != null
                              ? [{ label: "Reserves", value: String(metaReserves) }]
                              : []),
                          ]}
                        />
                      ) : null}
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() =>
                          run({
                            type: "RECOMMEND_PARTY_BUDGET",
                            partyId,
                            allocations: normalizeSupportAllocations(allocationDraft),
                          })
                        }
                      >
                        Recommend party budget
                      </button>
                      {budgetRecommendation && typeof budgetRecommendation === "object" ? (
                        <p className="muted small" style={{ marginTop: "0.35rem" }}>
                          Last recommendation:{" "}
                          {Object.entries(budgetRecommendation as Record<string, number>)
                            .map(([k, v]) => `${k} ${Math.round(Number(v) * 100)}%`)
                            .join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </SectionCard>
              </div>

              <SectionCard title="Coalition talks">
                <div className="politician-card-grid">
                  {partnerPartyOptions.map((partnerId) => {
                    const partnerSeats = members.filter(
                      (memberId) => props.snap.politicians[memberId]?.partyId === partnerId,
                    ).length;
                    const combined = caucus + partnerSeats;
                    const majority = Math.floor(totalSeats / 2) + 1;
                    const authorized =
                      partyOrg?.coalitionTalks?.[partyId]?.[partnerId]?.authorized === true;
                    const affinity =
                      partyOfficers?.chair?.politicianId &&
                      props.snap.partyStates[partnerId]?.leaderId
                        ? props.snap.relationships[partyOfficers.chair.politicianId]?.[
                            props.snap.partyStates[partnerId]!.leaderId!
                          ]?.affinity
                        : null;
                    const relationship =
                      affinity == null
                        ? "Relationship thin"
                        : affinity >= 0.25
                          ? "Warm working relationship"
                          : affinity >= 0
                            ? "Correct but cool"
                            : "Frosty";
                    return (
                      <div className="faction-card" key={partnerId}>
                        <strong>{partyDisplayName(props.world, partnerId, props.snap)}</strong>
                        <div className="muted small">
                          {partnerSeats} seats · with you {combined}/{totalSeats} (
                          {combined >= majority ? "majority path" : "short of majority"})
                        </div>
                        <div className="muted small">{relationship}</div>
                        {authorized ? <StatusBadge tone="ok">Talks authorised</StatusBadge> : null}
                        <div
                          className="row"
                          style={{ gap: "0.35rem", marginTop: "0.4rem", flexWrap: "wrap" }}
                        >
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() =>
                              run({
                                type: "AUTHORIZE_COALITION_TALKS",
                                partyId,
                                partnerPartyId: partnerId,
                                authorize: true,
                              })
                            }
                          >
                            Authorise talks
                          </button>
                          <button
                            type="button"
                            className="btn secondary btn-sm"
                            onClick={() =>
                              run({
                                type: "AUTHORIZE_COALITION_TALKS",
                                partyId,
                                partnerPartyId: partnerId,
                                authorize: false,
                              })
                            }
                          >
                            Rescind
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {partnerPartyOptions.length === 0 ? (
                  <EmptyState>No partner parties available.</EmptyState>
                ) : null}
              </SectionCard>

              <div data-qa="endorsement-browser">
                <SectionCard title="Endorsement browser">
                  <div className="row" style={{ gap: "0.4rem", marginBottom: "0.5rem" }}>
                    <select
                      value={endorseContestFilter}
                      onChange={(event) => setEndorseContestFilter(event.target.value)}
                    >
                      <option value="all">All contest types</option>
                      <option value="presidential_nomination">Presidential nomination</option>
                      <option value="party_leadership">Party leadership</option>
                      <option value="faction_chair">Faction chair</option>
                    </select>
                  </div>
                  {endorsementCandidates.length === 0 ? (
                    <EmptyState>No active nomination contests.</EmptyState>
                  ) : (
                    <div className="politician-card-grid">
                      {endorsementCandidates.map(({ contest, entry }) => {
                        const pol = props.snap.politicians[entry.politicianId];
                        const caucusName = pol?.factionId
                          ? factionDisplayName(props.world, pol.factionId)
                          : "Unaligned";
                        const poll = Object.values(props.snap.polls ?? {})
                          .filter(
                            (p) =>
                              typeof p.metadata?.contestId === "string" &&
                              p.metadata.contestId === contest.id,
                          )
                          .sort((a, b) => b.publicationDate.localeCompare(a.publicationDate))[0];
                        const pollShare = poll?.firstPreference.find(
                          (row) => row.politicianId === entry.politicianId,
                        )?.share;
                        const pollPct =
                          pollShare != null && Number.isFinite(pollShare)
                            ? Math.round(pollShare * 100)
                            : null;
                        return (
                          <div className="faction-card" key={`${contest.id}:${entry.politicianId}`}>
                            <PoliticianCard
                              catalog={props.catalog}
                              world={props.world}
                              state={props.snap}
                              politicianId={entry.politicianId}
                              compact
                              descriptor={entry.status.replaceAll("_", " ")}
                            />
                            <div className="muted small">
                              {contestDisplayName(props.snap, props.world, contest.id)} ·{" "}
                              {caucusName}
                              {pollPct != null ? ` · Poll ${pollPct}%` : ""}
                            </div>
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{ marginTop: "0.35rem" }}
                              onClick={() =>
                                run({
                                  type: "ENDORSE_CANDIDATE_AS_CHAIR",
                                  partyId,
                                  candidateId: entry.politicianId,
                                  contestId: contest.id,
                                })
                              }
                            >
                              Endorse as Chair
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </SectionCard>
              </div>

              <SectionCard title="Recommend discipline">
                <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
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
            </>
          ) : isNationalTreasurer && partyId ? (
            <div data-qa="resource-allocator">
              <SectionCard title="Resource allocation">
                <DataTable dense headers={["Bucket", "Share %"]}>
                  {ALLOCATION_BUCKET_IDS.map((bucketId) => {
                    const pct = Math.round((allocationDraft[bucketId] ?? 0) * 100);
                    return (
                      <tr key={bucketId}>
                        <td>{ALLOCATION_BUCKETS[bucketId].label}</td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={pct}
                            onChange={(event) => {
                              const next = {
                                ...allocationDraft,
                                [bucketId]: Number(event.target.value) / 100,
                              };
                              setAllocationDraft(normalizeSupportAllocations(next));
                            }}
                            style={{ width: "4rem" }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </DataTable>
                <div
                  className="row"
                  style={{ gap: "0.4rem", marginTop: "0.5rem", flexWrap: "wrap" }}
                >
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      run({
                        type: "ALLOCATE_PARTY_SUPPORT",
                        partyId,
                        allocations: normalizeSupportAllocations(allocationDraft),
                      })
                    }
                  >
                    Commit allocation
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() =>
                      run({
                        type: "RECOMMEND_PARTY_BUDGET",
                        partyId,
                        allocations: normalizeSupportAllocations(allocationDraft),
                      })
                    }
                  >
                    Recommend party budget
                  </button>
                </div>
                {metaFunds != null || metaReserves != null ? (
                  <BriefStrip
                    items={[
                      ...(metaFunds != null ? [{ label: "Funds", value: String(metaFunds) }] : []),
                      ...(metaReserves != null
                        ? [{ label: "Reserves", value: String(metaReserves) }]
                        : []),
                    ]}
                  />
                ) : null}
              </SectionCard>
            </div>
          ) : null}

          <SectionCard title="Chair election">
            <dl className="dossier-facts compact">
              <div>
                <dt>Stage</dt>
                <dd>
                  {openChairElection ? titleCaseWords(openChairElection.stage) : "No open election"}
                </dd>
              </div>
              <div>
                <dt>Method</dt>
                <dd>
                  {openChairElection
                    ? chairElectionMethodLabel(openChairElection.method)
                    : partyRules
                      ? chairElectionMethodLabel(partyRules.chairElectionMethod)
                      : "—"}
                </dd>
              </div>
              <div>
                <dt>Voting system</dt>
                <dd>
                  {openChairElection?.votingSystem
                    ? titleCaseWords(openChairElection.votingSystem)
                    : partyRules
                      ? titleCaseWords(partyRules.votingSystem)
                      : "—"}
                </dd>
              </div>
              <div>
                <dt>Assumed</dt>
                <dd>{chairAssumed ?? "—"}</dd>
              </div>
            </dl>
            {openChairElection ? (
              <div className="politician-card-grid" style={{ marginTop: "0.5rem" }}>
                {chairElectionCandidates.map((candidateId) => {
                  const program = openChairElection.programs?.[candidateId];
                  return (
                    <div className="faction-card" key={candidateId}>
                      <PoliticianCard
                        catalog={props.catalog}
                        world={props.world}
                        state={props.snap}
                        politicianId={candidateId}
                        compact
                        descriptor="Chair candidate"
                      />
                      {program ? (
                        <div className="muted small">
                          {getPartyPriority(program.priorityIssue)?.label ??
                            titleCaseWords(program.priorityIssue)}{" "}
                          · {titleCaseWords(program.campaignStrategy)} ·{" "}
                          {titleCaseWords(program.unityStrategy)}
                        </div>
                      ) : (
                        <div className="muted small">Program not yet filed</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
            <div className="row" style={{ gap: "0.4rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
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
              {openChairElection && partyId === playerPartyId ? (
                <>
                  {!openChairElection.candidates.includes(playerId) ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        run({
                          type: "DECLARE_CHAIR_CANDIDACY",
                          electionId: openChairElection.id,
                          politicianId: playerId,
                        })
                      }
                    >
                      Declare candidacy
                    </button>
                  ) : null}
                  {isNationalChair || isNationalViceChair ? (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        run({
                          type: "RESOLVE_PARTY_CHAIR_ELECTION",
                          electionId: openChairElection.id,
                        })
                      }
                    >
                      Resolve election
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </SectionCard>

          <div data-qa="national-committee">
            <SectionCard title="National Committee">
              {nationalCommittee.length === 0 ? (
                <EmptyState>
                  National Committee roster is empty for this Party. Advance one month or open a
                  Chair action to initialize the committee.
                </EmptyState>
              ) : (
                <>
                  <p className="muted">{nationalCommittee.length} members</p>
                  <DataTable dense headers={["Member", "Caucus"]}>
                    {nationalCommittee.slice(0, 36).map((id) => {
                      const factionId = props.snap.politicians[id]?.factionId;
                      return (
                        <tr key={id}>
                          <td>{politicianDisplayName(props.catalog, id)}</td>
                          <td>
                            {factionId ? factionDisplayName(props.world, factionId) : "Unaligned"}
                          </td>
                        </tr>
                      );
                    })}
                  </DataTable>
                </>
              )}
              {pendingCommitteeVotes.length > 0 ? (
                <div style={{ marginTop: "0.75rem" }}>
                  <SectionDivider title="Pending decisions" />
                  {pendingCommitteeVotes.map((vote) => (
                    <EntityRow
                      key={vote.id}
                      title={titleCaseWords(vote.proposalKind)}
                      meta={`Since ${vote.createdDate}`}
                      status={<StatusBadge tone="warn">Pending</StatusBadge>}
                    />
                  ))}
                </div>
              ) : null}
              {committeeVotes.length > 0 ? (
                <div style={{ marginTop: "0.75rem" }}>
                  <SectionDivider title="Recent votes" />
                  {committeeVotes.map((e) => (
                    <EntityRow
                      key={e.id}
                      title={String(e.payload.proposalKind ?? "Proposal")}
                      meta={`${e.date} · ${e.payload.yes ?? 0} yes / ${e.payload.no ?? 0} no · ${e.payload.passed ? "Passed" : "Rejected"}`}
                    />
                  ))}
                </div>
              ) : null}
            </SectionCard>
          </div>

          <SectionCard title="Nominations and leadership contests">
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
            <p className="muted small">{activeCaucusCount} active · dissolved caucuses hidden</p>
            {caucusRows.length === 0 ? (
              <EmptyState>No active caucuses for this party.</EmptyState>
            ) : (
              <DataTable
                dense
                headers={[
                  "Caucus",
                  "Party-member support",
                  "MPs %",
                  "Institutional influence",
                  "Leader",
                  "Stance",
                  "Growth strategy",
                ]}
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
                    <td>
                      {c.membershipLabel}
                      <div className="muted small">{c.influenceLabel}</div>
                    </td>
                    <td>{c.mpPct}%</td>
                    <td>{exactShares ? `${c.institutionalPct}%` : c.institutionalLabel}</td>
                    <td>
                      {c.leaderId ? politicianDisplayName(props.catalog, c.leaderId) : "vacant"}
                    </td>
                    <td>{c.stance}</td>
                    <td>{titleCaseWords(c.growthStrategy)}</td>
                  </tr>
                ))}
              </DataTable>
            )}
            {unalignedShares ? (
              <p className="muted small" style={{ marginTop: "0.5rem" }}>
                Unaligned party members:{" "}
                {formatShareEstimate(unalignedShares.partyMemberSupport ?? 0, {
                  exact: exactShares,
                })}{" "}
                support · {Math.round((unalignedShares.assemblyShare ?? 0) * 100)}% of MPs
              </p>
            ) : null}
          </SectionCard>

          {playerLedCaucus && partyId === playerPartyId ? (
            <SectionCard title={`Caucus leader workspace · ${playerLedCaucus.name}`}>
              <SectionDivider title="Growth strategy" />
              <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
                <select
                  value={caucusGrowthDraft || playerLedCaucus.growthStrategy}
                  onChange={(event) =>
                    setCaucusGrowthDraft(event.target.value as CaucusGrowthStrategy)
                  }
                >
                  {CAUCUS_GROWTH_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {titleCaseWords(opt)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    run({
                      type: "SET_CAUCUS_GROWTH_STRATEGY",
                      factionId: playerLedCaucus.fid,
                      growthStrategy: caucusGrowthDraft || playerLedCaucus.growthStrategy,
                    })
                  }
                >
                  Set growth strategy
                </button>
              </div>

              <SectionDivider title="Endorse primary" hint="Active nomination candidates only" />
              {activePrimaryCandidates.length === 0 ? (
                <EmptyState>No active primary candidates.</EmptyState>
              ) : (
                <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
                  <select
                    value={
                      caucusPrimaryEndorseId || activePrimaryCandidates[0]?.entry.politicianId || ""
                    }
                    onChange={(event) => setCaucusPrimaryEndorseId(event.target.value)}
                  >
                    {activePrimaryCandidates.map(({ contest, entry }) => (
                      <option
                        key={`${contest.id}:${entry.politicianId}`}
                        value={entry.politicianId}
                      >
                        {politicianDisplayName(props.catalog, entry.politicianId)} ·{" "}
                        {contestDisplayName(props.snap, props.world, contest.id)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      const candidateId =
                        caucusPrimaryEndorseId || activePrimaryCandidates[0]?.entry.politicianId;
                      if (!candidateId) return;
                      run({
                        type: "ENDORSE_PRIMARY_AS_CAUCUS",
                        factionId: playerLedCaucus.fid,
                        candidateId,
                      });
                    }}
                  >
                    Endorse primary
                  </button>
                </div>
              )}

              <SectionDivider title="Endorse chair candidate" />
              <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
                <select
                  value={
                    caucusEndorseId || chairElectionCandidates[0] || partyMemberOptions[0]?.id || ""
                  }
                  onChange={(event) => setCaucusEndorseId(event.target.value)}
                >
                  {(chairElectionCandidates.length > 0
                    ? chairElectionCandidates
                    : partyMemberOptions.map((p) => p.id)
                  ).map((id) => (
                    <option key={id} value={id}>
                      {politicianDisplayName(props.catalog, id)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const candidateId =
                      caucusEndorseId || chairElectionCandidates[0] || partyMemberOptions[0]?.id;
                    if (!candidateId) return;
                    run({
                      type: "ENDORSE_CHAIR_AS_CAUCUS",
                      factionId: playerLedCaucus.fid,
                      candidateId,
                    });
                  }}
                >
                  Endorse chair candidate
                </button>
              </div>

              <SectionDivider title="Alliance" />
              <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
                <select
                  value={
                    caucusAllianceId ||
                    caucusRows.find((c) => c.fid !== playerLedCaucus.fid)?.fid ||
                    ""
                  }
                  onChange={(event) => setCaucusAllianceId(event.target.value)}
                >
                  {caucusRows
                    .filter((c) => c.fid !== playerLedCaucus.fid)
                    .map((c) => (
                      <option key={c.fid} value={c.fid}>
                        {c.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="btn"
                  disabled={caucusRows.length < 2}
                  onClick={() => {
                    const otherFactionId =
                      caucusAllianceId ||
                      caucusRows.find((c) => c.fid !== playerLedCaucus.fid)?.fid;
                    if (!otherFactionId) return;
                    run({
                      type: "FORM_CAUCUS_ALLIANCE",
                      factionId: playerLedCaucus.fid,
                      otherFactionId,
                      kind: "alliance",
                    });
                  }}
                >
                  Form alliance
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={caucusRows.length < 2}
                  onClick={() => {
                    const otherFactionId =
                      caucusAllianceId ||
                      caucusRows.find((c) => c.fid !== playerLedCaucus.fid)?.fid;
                    if (!otherFactionId) return;
                    run({
                      type: "FORM_CAUCUS_ALLIANCE",
                      factionId: playerLedCaucus.fid,
                      otherFactionId,
                      kind: "rivalry",
                    });
                  }}
                >
                  Mark rivalry
                </button>
              </div>

              <SectionDivider title="Structure" hint="Form, split, or dissolve" />
              <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() =>
                    run({
                      type: "FORM_CAUCUS",
                      partyId: partyId!,
                      politicianIds: [playerId],
                    })
                  }
                >
                  Form new caucus
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() =>
                    run({
                      type: "SPLIT_CAUCUS",
                      factionId: playerLedCaucus.fid,
                      politicianIds: [playerId],
                    })
                  }
                >
                  Split caucus
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() =>
                    run({
                      type: "DISSOLVE_CAUCUS",
                      factionId: playerLedCaucus.fid,
                    })
                  }
                >
                  Dissolve caucus
                </button>
              </div>
            </SectionCard>
          ) : null}

          <SectionDivider title="Assembly Delegation" hint="Separate from national party offices" />
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
