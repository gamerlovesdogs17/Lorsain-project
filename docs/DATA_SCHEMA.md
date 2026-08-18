# Data Schema and Entity Contracts

## 1. ID policy

Use stable string IDs everywhere. SVG path IDs and content IDs are external contracts. Never use array index as the persisted identity of an entity.

Examples: `TER`, `W41`, `P09`, `FDV`, `C001`, `PARTY_LAB`, `NPC001`, `OFFICE_PRESIDENT`, `ORG_TCL`.

`W41` (world country), `TER` (domestic country) and `TERENA` (domestic SVG outline) are intentionally separate namespaces; use `canonical_crosswalk.json` rather than assuming they are interchangeable.

## 2. Static content versus save state

**Static content** defines geography, constitutional rules, office definitions, issue definitions, party rules, initial politicians and historical facts before the scenario start. **Save state** records mutable values from the scenario onward. Do not modify static content objects during play.

`contentVersion` (canonical JSON package), npm `package.json` version, and save `schemaVersion` are **separate**. Phase 9 working tree uses `schemaVersion: 9` and `contentVersion: 0.3.1-predev`. Phase 8 saves (`schemaVersion: 8`) migrate to v9 with baseline economy and empty org/media history.

## 3. Core static schemas

```ts
interface CountryDefinition {
  id: string;
  name: string;
  region: string;
  governmentType: string;
  population: number;
  powerTier: 'small'|'middle'|'major'|'great'|'superpower';
  neighborIds: string[];
  alignmentIds: string[];
  mapPathId: string;
}

interface ProvinceDefinition {
  id: string;
  countryId: 'TER';
  name: string;
  populationBaseline: number;
  svgPathId: string;
  geojsonFeatureId: string;
}

interface ConstituencyDefinition {
  id: string;
  countryId: 'TER';
  seats: number;
  populationBaseline: number;
  pluralityProvinceId: string;
  provincePopulationShares: Record<string, number>;
  crossesProvinceBoundaries: boolean;
  svgPathId: string;
}

interface PartyDefinition {
  id: string;
  name: string;
  ideologyCenter: IdeologyVector;
  nominationRuleId: string;
  factionIds: string[];
  organizationRules: PartyRules;
}
```

## 4. Politician

```ts
interface PoliticianState {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: ISODate;
  alive: boolean;
  homeProvinceId: string;
  partyId?: string;
  factionId?: string;
  ideology: IdeologyVector;
  issueSalience: Record<IssueId, number>;
  traits: {
    ambition: number;
    integrity: number;
    ego: number;
    riskTolerance: number;
    sociability: number;
    pragmatism: number;
    institutionalism: number;
    partyLoyalty: number;
    factionLoyalty: number;
    retirementInclination: number;
  };
  skills: {
    campaigning: number;
    fundraising: number;
    legislation: number;
    administration: number;
    media: number;
    negotiation: number;
  };
  // GDS “competence / charisma / executive skill” are display composites of skills, not separate hidden axes.
  reputation: ReputationState;
  officeIds: string[];
  careerGoal: CareerGoal;
  privateFlags: Record<string, boolean|number|string>;
}
```

Trait and skill scales are locked to `0..1`. Do not mix `0..100` and `0..1` across systems.

## 5. Relationships and memory

Use sparse edges.

```ts
interface RelationshipEdge {
  fromPoliticianId: string;
  toPoliticianId: string;
  affinity: number; // -1..1
  trust: number;    // -1..1
  respect: number;  // -1..1
  lastInteractionTurn: number;
}

interface PoliticalMemory {
  id: string;
  actorId: string;
  targetId: string;
  type: 'endorsement'|'betrayal'|'appointment'|'attack'|'deal'|'vote_help'|'leadership_support'|'scandal';
  magnitude: number;
  createdTurn: number;
  decayRate: number;
  sourceEventId: string;
}
```

## 6. Beliefs / imperfect information

```ts
interface Belief<T> {
  estimate: T;
  uncertainty: number;
  observedTurn: number;
  sourceId?: string;
}

interface PoliticianKnowledge {
  politicianId: string;
  pollBeliefs: Record<ElectionId, Belief<PollVector>>;
  voteBeliefs: Record<BillId, Belief<VoteRange>>;
  relationshipBeliefs: Record<PoliticianId, Belief<RelationshipLabel>>;
}
```

## 7. Office and terms

Static office definitions live in `data/terena_offices.json`. Dynamic `OfficeTerm` records live in save state.

Party leaders, faction chairs, and whips are **not** state offices.

A multi-member Assembly constituency is one office with `capacity` equal to that constituency's seat magnitude (not invented seat-1/seat-2 identities).

```ts
interface OfficeTerm {
  id: string;
  officeId: string;
  holderId: string;
  startDate: ISODate | null; // null = preexisting at scenario start; start unknown
  startKnown: boolean;
  endDate?: ISODate | null;
  accessionReason: string;
  status: 'active' | 'ended' | 'suspended';
  holdingKind: 'substantive' | 'acting';
}
```

Do not write `startDate: 2028-01-01` merely because the scenario starts then.

Known starting terms:

- President Mara Velic: 2024-01-20 → 2029-01-20
- Assembly MPs: 2026-06-01 → 2030-06-01
- Speaker Daria Soren: speakership start 2026-06-01
- Court: exact appointment/end dates from figure `court` metadata
- Ministers/governors/mayors: preexisting / unknown start

## 7.1 Calendars and succession

Presidential regular election: 2nd Saturday in October every 5 years (anchor 2018). Assume office 20 January following. Outgoing president remains until then.

Assembly regular election: 2nd Sunday in May every 4 years (anchor 2026). Assume office 1 June following.

Presidential vacancy: Speaker → Justice Minister → Finance Minister → Foreign Minister become Acting President. Acting service is not an elected term. Special RCV election if more than 180 days remain before the next regular presidential election, within 90 days of vacancy; winner serves the remainder of the regular term. ≤180 days: acting president serves until regular assumption. Special remainder counts as an elected term only if longer than half of five years. President-elect before 20 January becomes acting within 7 days; that acting window is not a separate term.

## 7.2 Turns

Normal turn = one calendar month. Target date is `scenarioStartDate + (completedTurns + 1) months`, not “currentDate plus one month”. Mid-month blocking events pause at the exact date; resume continues to the original month target (e.g. pause 2028-10-14, resume to 2028-11-01).

Unimplemented domain events (2028 presidential election, 2030 Assembly election) produce a typed `BLOCKING_DOMAIN` interrupt with `requiresResolution: true`. `RESUME_TURN` / `ACKNOWLEDGE_INTERRUPT` cannot bypass them (`DOMAIN_RESOLUTION_REQUIRED`). Presentation pauses (`requiresResolution: false`) must be acknowledged, then resumed to the original month target (e.g. pause 2028-10-14, resume to 2028-11-01).

Court terms with `expirationPolicy: auto_vacate` end automatically. Presidential and Assembly terms require the relevant election/succession domain; an unresolved regular-election interrupt therefore cannot silently carry expired elected holders forward.

Special presidential vacancy: Phase 1 records `SPECIAL_PRESIDENTIAL_ELECTION_REQUIRED` and schedules `SPECIAL_PRESIDENTIAL_ELECTION_DEADLINE` (vacancyDate + 90 days). That is a constitutional deadline, not a chosen election date.

## 8. Elections

Store elections as persistent historical objects. A campaign references an election but exists before results.

```ts
interface ElectionState {
  id: string;
  electionType: 'president'|'assembly'|'governor'|'mayor'|'party_leader'|'faction_leader'|'recall';
  date: ISODate;
  jurisdictionId: string;
  candidateIds: string[];
  status: 'scheduled'|'campaigning'|'counting'|'complete';
  result?: ElectionResult;
}
```

For RCV/STV, `ElectionResult` stores every count round, transfers, exhausted ballots and elected/eliminated status.

## 9. Voter blocs

Do not use one row per person. Constituency voter state can be a set of weighted blocs.

```ts
interface VoterBlocState {
  id: string;
  constituencyId: string;
  weight: number;
  demographics: DemographicVector;
  baselineIdeology: IdeologyVector;
  issueSalience: Record<IssueId, number>;
  partyHabit: Record<PartyId, number>;
  turnoutPropensity: number;
}
```

## 10. Bills and policy

Bills should contain structured policy changes in addition to display text.

```ts
interface BillState {
  id: string;
  title: string;
  sponsorIds: string[];
  policyChanges: PolicyChange[];
  committeeId: string;
  stage: BillStage;
  amendmentIds: string[];
  voteHistory: VoteRecord[];
  publicSalience: number;
}
```

## 11. Economy

Use national + province snapshots, updated monthly or quarterly depending on variable. Structural sectors update more slowly than prices and unemployment.

Key series: real GDP, productivity, employment, unemployment, CPI, wages, disposable income, housing cost, debt, interest rate, exchange rate/index, energy price, inequality and sector output.

## 12. Foreign state model

```ts
interface ForeignCountryState {
  countryId: string;
  leaderId?: string;
  governmentStability: number;
  economy: ForeignEconomyState;
  military: CapabilityVector;
  relations: Record<CountryId, BilateralRelation>;
  strategicGoals: StrategicGoal[];
  treatyIds: string[];
}
```

Foreign domestic politics may use a lighter politician model until a foreign state becomes high-salience.

## 13. Event log

All consequential state changes produce structured events.

```ts
interface SimEvent {
  id: string;
  turn: number;
  date: ISODate;
  type: string;
  actorIds: string[];
  targetIds: string[];
  payload: JsonValue;
  visibility: 'public'|'player_known'|'secret';
  historicalImportance: number;
}
```

News and history pages consume events; they do not invent a separate reality.

## 14. Save root

Phase 8 save envelope (`schemaVersion: 8`):

```ts
interface SaveFile {
  schemaVersion: 8;
  contentVersion: string;
  scenarioId: string;
  simulation: SimState;
  // rng, calendar, officeTerms, scheduler, history, counters, interrupt,
  // relationships, memories, beliefs, goals, generatedAgentProfiles,
  // agentProfileOverrides, partyStates, factionStates, endorsements,
  // partyContests, dynamicParties,
  // elections, candidateStanding, electoralEnvironment, polls, domainResolutions,
  // campaignRuntime, legislatureRuntime, executiveRuntime,
  // constitutionalRuntime (courtCases, courtDecisions, nominations, impeachments,
  // recalls, precedents, grounds, pendingPlayerVotes, lastMonthProcessed)
}
```

Authoritative RNG lives only in `simulation.rng`. A leftover root `rng` field, if present, must equal `simulation.rng` or the save is rejected.

Loaded saves are untrusted `unknown` and are fully structurally validated. Content-version mismatches apply registered migrations or return `INCOMPATIBLE_CONTENT`; a migration object that does not actually update the save is not accepted.

**v1 → v2:** Phase 1 saves had no agent relationships/memories/beliefs/goals. Migration initializes those structures to empty/default values and adds `nextMemoryId` / `nextGoalId`. Phase 1 saves begin Phase 2 cognitive history at migration/load because that state did not exist previously. No fabricated interpersonal past is written. `restoreSimulation` then runs the same deterministic initial-goal generator used by new games when `goals` is empty and `nextGoalId === 1`.

**v2 → v3:** Phase 2 saves had no `PartyState` / `FactionState` / endorsements / contests. Migration initializes those structures to empty and adds `nextEndorsementId` / `nextPartyContestId` / `nextDynamicPartyId`. No fabricated past contests are written. `restoreSimulation` seeds canonical starting leadership and planned 2028 presidential contests from `KernelWorld` when `partyStates` are empty.

**v3 → v4:** Phase 3 saves had no general-election state, public standing, polls, or domain-resolution records. Migration initializes those structures to empty and adds `nextPollId` / `nextElectionId` / `nextDomainResolutionId`. No fabricated polls or completed general-election results are written. `restoreSimulation` seeds canonical upcoming `ELEC_PRES_2028` and `ELEC_ASM_2030` `ElectionState`s from `KernelWorld` when `elections` is empty.

**v4 → v5:** Phase 4 saves had no campaign runtime. Migration initializes `campaignRuntime` to `{ campaigns: {}, debates: {}, lastMonthProcessed: null }` and adds `nextCampaignId` / `nextDebateId`. No fabricated campaign actions or debate history are written.

**v5 → v6:** Phase 5 saves had no legislature runtime. Migration initializes empty `legislatureRuntime` and adds `nextBillId` / `nextAmendmentId` / `nextLegislativeVoteId` / `nextLawId`. No fabricated bills, votes, or enacted laws are written. `restoreSimulation` seeds functional committees from current Assembly membership when committees are empty.

**v6 → v7:** Phase 6 saves had no executive runtime. Migration initializes empty `executiveRuntime` and adds `nextRegulationId` / `nextMotionId` / `nextEmergencyId` / `nextWarPowerId` / `nextBudgetId`. No fabricated cabinet actions, regulations, motions, emergencies, or budgets are written. `restoreSimulation` seeds ministry admin stubs from current minister offices when ministries are empty.

**v7 → v8:** Phase 7 saves had no constitutional runtime. Migration initializes empty `constitutionalRuntime` (including `grounds: {}`) and adds `nextCaseId` / `nextCourtNominationId` / `nextCourtDecisionId` / `nextImpeachmentId` / `nextRecallId` / `nextConstitutionalGroundsId`. No fabricated historical cases, nominations, impeachments, or grounds records are written. Membership is derived from existing Constitutional Court `OfficeTerm`s.

Canonical allocated IDs are `PREFIX` + a positive integer (leading zeros allowed, width not fixed): `EVT`, `SEV`, `TERM`, `CMD`, `MEM`, `GOAL`, `END`, `CONTEST`, `DPARTY`, `POLL`, `ELEC`, `DRES`, `CAMP`, `DEBATE`, `BILL`, `AMD`, `LVOTE`, `LAW`, `REG`, `MOT`, `EMG`, `WAR`, `BUD`, `CASE`, `CNOM`, `CDEC`, `IMPEACH`, `RECALL`, `CGND`. Canonical scheduled elections may use stable IDs (`ELEC_PRES_2028`, `ELEC_ASM_2030`). `banana`, `EVT0`, and `EVTabc` are rejected.

### 14.1 Agent state (Phase 2)

- **AgentProfile** (immutable starting truth): ideology −1..+1, traits/skills 0..1, issue salience, `ai_tier`. Stored on `KernelWorld.agentProfiles` for the 530 starters. `SimState.generatedAgentProfiles` is the save-owned slot for future generated politicians and **must not** contain canonical IDs. `getAgentProfile` uses the canonical KernelWorld profile when present, otherwise the generated profile, then sparse `agentProfileOverrides`.
- **Relationships:** `relationships[sourceId][targetId]` = `{ affinity, trust, respect, lastUpdatedDate, interactionCount }` in −1..+1. Directional. `sourceId !== targetId`. Missing = neutral. Lazy decay toward 0; affinity decays faster than trust/respect. Per-interaction deltas saturate at ±0.25.
- **Memories:** owner-subjective `MEM…` records with kind, valence, salience, durability (`fleeting|normal|durable|permanent`), tags, optional source SimEvent. Effective salience is lazy. Non-permanent caps: rich 100 / standard 50 / light 20.
- **Beliefs:** sparse owner→target topic/dimension estimates. Ideology −1..+1; traits/skills 0..1; confidence 0..1. Updated by observations; confidence becomes stale lazily. Unknown remains unknown. Observation quality is `observationConfidence * sourceReliability`; quality ≤ 0 writes nothing.
- **Goals:** `GOAL…` records with type, priority, status (`active|satisfied|abandoned|superseded`), horizon, optional targets. Deterministic initial generation from canonical facts. No RNG. Player politicians may hold derived goals; NPC planners still do not act for `playerPoliticianId`. Mutating `reviewGoals` requires `asOfDate === currentDate`.
- **Decisions:** domain supplies `DecisionOption`s. `chooseDecision().ranked` lists considered options first, then unconsidered diagnostics; within each group `finalUtility` descending, then `optionId` ascending. `ranked[0]` is the chosen option for every nonempty decision. Stochastic adjustment uses only the `npc-decisions` stream and is assigned in optionId order.

### 14.2 Party institutions (Phase 3)

- **Membership authority:** `PoliticianRuntime.partyId` / `factionId`. Independents use `null` / `null`. `PARTY_IND` is a statistical aggregate and must never appear as membership or as a `PartyState`.
- **Derived queries:** `partyMembers`, `factionMembers`, `assemblyCaucus`, `factionAssemblyCaucus`. No persisted member arrays.
- **Runtime leadership:** `PartyState.leaderId` and `FactionState.chairId`. `AgentProfile.roleTypes` and office terms are not the live leadership source. Public facts expose `partyLeaderOf` / `factionChairOf` / `contestCandidacies`.
- **Endorsements:** `END…` records. One active endorsement per endorser per single-winner contest (politician, institutional faction, or provincial organization). Same-target repeats reject (`ALREADY_ENDORSED_CANDIDATE`) without mutation. A later different-target endorsement supersedes. Politician endorsements write one Phase 2 memory and a small relationship delta once. Institutional faction endorsements must belong to the contest party. Provincial-organization endorsements must resolve to `PORG:{partyId}:{provinceId}`.
- **PartyContest:** planned → open → voting → resolved. Starting 2028 presidential contests seed as **planned** and are not auto-resolved on monthly turns. Qualification uses numeric canon gates where present (NU 0.15 of **current** caucus; PM 4 **distinct legitimate** provincial-org endorsements). Labour/Green/RL boolean flags remain qualification evidence, not invented percentages. Civic `supporter_registration_required` is selectorate composition, not a candidate filing gate. Generic leadership/faction-chair contests require an explicit `selectorMethod` and must not inherit presidential nomination rules. Counts always go through `countIrv`. Formal archives store exact `countInput` ballots (id/weight/rankings) plus the IRV result; lots replay from archived draws. Selector preference noise uses the `campaigns` stream; politician caucus rankings use Phase 2 `npc-decisions`; lots use `elections`.
- **Selectorates:** compact heterogeneous weighted groups (faction × tendency × member-home region for members/supporters/convention; geography for RL), not citizen entities and not one bloc per faction. Outsider groups that rank two same-faction candidates 1–2 transfer to a cross-faction candidate before the faction rival. Member/supporter/convention faction weights blend canonical shares with current roster composition (`CURRENT_FACTION_BLEND = 0.22`). Mass selectorates use public/institutional facts only. RL provincial weights combine 2026 first-preference × `province_population_shares` with a 0.012 floor.
- **Provincial party organizations:** `PORG:{partyId}:{provinceId}` — one active unit per membership party × canonical province. Not Phase 9 interest groups.
- **Splits:** `DEV_SPLIT_FACTION` creates a `DPARTY…` dynamic party, moves listed faction members, and leaves the new party `leadership_vacant` with `PARTY_LEADERSHIP_CONTEST_REQUIRED`. It does not silently appoint `movers[0]` as leader.

PRESENTATION interrupts persist as `unresolved` or `acknowledged` only (`resolved` is rejected). A processed `requiresResolution` scheduled event is valid if it has **either** a live unresolved `BLOCKING_DOMAIN` interrupt **or** one immutable `DomainResolutionRecord` proving the domain actually resolved. `resolutionStatus = "resolved"` with no evidence is rejected.

### 14.3 Electorate and general elections (Phase 4)

- **Static vs mutable:** `KernelWorld.voterBlocs`, `pollsters`, `issueDimensions`, `constituencyElectorate` (population, seats, `province_population_shares`, compact 2026 turnout only) are immutable starting definitions. Saves do not copy the voter-bloc dataset. Mutable electoral state is sparse: `electoralEnvironment`, lazy `candidateStanding`, `elections`, `polls`, `domainResolutions`.
- **Public standing vs hidden profile:** `CandidateStanding` (`nameRecognition` 0..1, `favorability` −1..1, `enthusiasm` 0..1, `momentum` −1..1) is public electoral standing. Hidden `AgentProfile` skills/traits/private ideology are not inputs to voter support. Independents need an explicit public ideology on the election field; the engine does not silently substitute `AgentProfile.ideology`.
- **Support:** bloc utility combines party habit, issue-salience-weighted public ideological fit (salience grouped by ideology axis then normalized so issue-ID cardinality does not overweight an axis), regional/home connection, incumbency/office/leadership, public standing, and sparse national/constituency/issue environment. Softmax with temperature `SUPPORT_SOFTMAX_TEMPERATURE` yields nonnegative shares summing to 1. Exact latent support is simulation truth, not NPC omniscience; `DecisionActorContext` does not receive it. Selectorates may use a small public standing/poll signal only.
- **Turnout:** aggregated, no voter entities. `registered_2028 = round(population_now × registered_2026 / population_2026)`. Rate mixes canonical `turnout_propensity`, 2026 turnout, election importance, mean enthusiasm, and bounded `campaigns`-stream noise, then clamps. Invalid/blank uses the 2026 rate plus bounded noise. `ballotsCast = invalidOrBlank + validVoteValue` exactly. Valid ballot-group weights are integers from largest remainder and sum to `validVoteValue`.
- **Polls:** `POLL…` historical records. House effects are centered party vote-share-point offsets, split among same-party candidates, then renormalized. Sample size is explicit or drawn in the pollster range. Quality lowers model-error variance; it never reveals exact latent support. Published polls are not rewritten when candidates later die, switch party, or withdraw. IDs are counters, not RNG.
- **ElectionState:** separate from `PartyContest`. Statuses: `planned` → `field_open` → `field_finalized` → `voting` → `resolved` / `cancelled`. Canonical 2028 presidential election `ELEC_PRES_2028` starts unfinalized with no nominees. Nomination winners sync into the general-election field without mutating contest archives. Presidential counts call `countIrv`; Assembly constituency counts call `countStv`. Resolved archives replay from stored ballots and lot draws. Current eligibility is checked only for unresolved fields.
- **DomainResolutionRecord:** `DRES…` evidence for a processed `requiresResolution` event (election or presidential assumption). `RESOLVE_PRESIDENTIAL_ELECTION` is transactional: failure leaves hash, counters, and RNG unchanged when validation can run before draws.
- **Presidential transition:** a regular election winner is immediately `certifiedPresidentElectId` and that victory counts as an elected term. Assumption is 20 January following. Incompatible prior offices (MP/governor/minister) end with structured reasons; vacancies are not auto-filled. The next regular presidential date is calculated from canonical calendar rules, never hardcoded as 2033. If the president-elect cannot assume, the engine raises a typed constitutional block rather than inventing a successor.

### 14.4 Campaigns (Phase 5)

- **Separate runtime:** `campaignRuntime.campaigns` / `debates` / `lastMonthProcessed`. Not a second politician object. Types: `presidential_nomination` | `presidential_general` | `assembly`. Statuses: `exploring` | `active` | `withdrawn` | `won` | `lost` | `ended`.
- **Resources:** integer `cashOnHand` / `totalRaised` / `totalSpent` (no negatives, no debt). Capacities in `[0,1]`. Sparse `organizationByConstituency`. Compact `recentEffects` for diminishing returns. Monthly action points (base 2, max 3 with office bonus).
- **Actions:** player commands only for `playerPoliticianId` (`CAMPAIGN_SEEK_NOMINATION_SUPPORT` is the Labour/Green/Regional League qualification milestone). NPCs get Phase 2 `DecisionOption`s from public polls, standing, endorsements, resources, and own hidden skills/traits. Opponent hidden truth is not an input. Effects clamp per action (`STANDING_DELTA.maxPerAction` / `PUBLIC_EFFECT_CLAMP`) and decay momentum monthly. Attacks, contrast ads, and negative ads require a living rival in the same race (`contestId` for nominations, `electionId` for presidential generals, constituency/election for assembly).
- **Nomination calendar:** operational offsets from the presidential election date (`packages/sim/src/campaigns/timeline.ts`): open −9 months, qualification/resolution −2 months, field finalize −1 month. Institutional `openPartyContest` / `applyQualification` / `resolvePartyContest` / `finalizePresidentialField` — not player or DEV commands. Failed remaining declared candidacies close; zero qualified candidates cancel the contest; one qualified candidate may win. NU uses real caucus endorsements (NPC outreach may batch a few MPs, each via Phase 2 `chooseEndorsement`). PM seeks `PORG:{partyId}:{provinceId}` endorsements. Civic Reform has no candidate supporter-registration gate.
- **Integration:** an active nomination campaign must match a `PartyContest` entry; a general campaign must match an `ElectionCandidate`. Withdrawal reconciles both. Nomination winners inherit cash/org into a linked general campaign. Field organization multiplies that candidate's realized constituency shares by `1 + FIELD.turnoutScale * org[cid]` then renormalizes; it does not raise every candidate's turnout. Phase 5 schedules lightweight public nomination polls (`electionId: null`, `metadata.contestId`); `createPoll()` remains Phase 4. Selectorate electability uses standing plus that contest's poll average, never latent support and never another party's polls.
- **Start:** TERENA_2028 has zero campaigns until declare. Canonical `presidentialStatus` seeds public standing once at init and is not reapplied by `candidateStandingOrDefault`.

### 14.5 Legislature (Phase 6)

- **Separate runtime:** `legislatureRuntime` on `SimState`. Assembly membership is derived from current active/suspended `assembly_member` terms; it is never a copied politician array.
- **Committees:** five functional bodies (`COMMITTEE_ECONOMIC`, `COMMITTEE_SOCIAL_ECONOMIC`, `COMMITTEE_SOCIAL`, `COMMITTEE_INSTITUTIONAL`, `COMMITTEE_FOREIGN`) mapped from issue dimensions. Deterministic proportional membership from current MPs, including factions and the player if they sit. Not canonical content committees.
- **Bills:** `BILL…` structured `PolicyItem`s (`issueId`, `direction`, `magnitude`, `fiscalImpact`). Lifecycle: introduce (status `committee`, `stageReadyDate` = that month) → next month or later committee vote → next month or later floor vote if passed → president sign/return → returned bills wait a month before repassage → `LAW…` archive. A bill is visible before any vote involving the player is tallied. Amendments are `AMD…` policy replacements, not bribery. A proposed amendment is adopted or rejected (ordinary majority of votes cast, tie fails) before the parent bill leaves that stage; adopted amendments replace the bill's `PolicyItem`s.
- **Votes:** `LVOTE…`. `CAST_LEGISLATIVE_VOTE` targets `{ billId, stage, choice, amendmentId? }` where `stage` is `committee` | `floor` | `repassage`. Pending player choices cannot cross stages. Ordinary committee/floor: simple majority of yes vs no among votes cast; tie fails (implementation default). After suspensive return: yes ≥ world `legislativeConstitution.assemblyAbsoluteMajority` (Terena: **211** from authorized 420 seats in `terena_constitution.json`, not current attendance/vacancies). NPC ballots are individual Phase 2 decisions; party/faction recommendations are pressure only. Uncast player votes are `ABSTAIN`.
- **President:** NPC uses Phase 2 `SIGN_BILL` / `RETURN_BILL`. Player president is never auto-decided; the bill stays `sent_to_president` until those commands.
- **Speaker:** current `speaker` office holder. NPC Speaker may reorder the floor queue by party. Player Speaker does not receive autonomous political scheduling; clerical FIFO continues. `SCHEDULE_BILL` / `DELAY_BILL` are explicit player commands.
- **Caps:** at most 2 NPC introductions per month and 10 active bills. Monthly work is a few committee bills plus one floor item, not O(all politicians × all bills × all relationships).
- **Start:** TERENA_2028 seeds committees from the 420 sitting MPs and has zero bills until play.

### 14.6 Executive (Phase 7)

- **Separate runtime:** `executiveRuntime` on `SimState`. Cabinet membership is **derived** from current minister `OfficeTerm`s (12 canonical offices). Do not store an authoritative parallel cabinet array.
- **Constitutional parameters:** `KernelWorld.executiveConstitution` from `terena_constitution.json` (censure fraction 0.55 → 231 of 420 authorized seats; regulation review 60 days; emergency 14 / extension 30; war unilateral 30). Vacancies do not shrink the Assembly denominator.
- **Commands:** `APPOINT_MINISTER` / `DISMISS_MINISTER` (current presidential authority, including Acting President); `ISSUE_REGULATION` (structured `PolicyItem`s; major regulations carry a review deadline); `INTRODUCE_MOTION` / `CAST_MOTION_VOTE`; `PROPOSE_BUDGET`; `DECLARE_EMERGENCY` / `BEGIN_WAR_POWERS` only when a legitimate domain/test trigger is set. Player President is never auto-decided.
- **Motions:** `MOT…` with `stageReadyDate`. Tally next month or later. Player pending vote cannot be skipped into a later motion. Uncast = abstain. Censure: yes ≥ ceil(authorized seats × 0.55). Other Phase-7 motions: simple majority of votes cast, tie fails (documented default).
- **Budget:** calendar-year fiscal cycle. If a new proposal is not approved, the previous lawful budget continues. No shutdown.
- **Emergency / war:** structured state only. No random generation. Phase 8 adds constitutional court review of emergencies; actual wars wait for Phase 10.
- **IDs:** `REG…`, `MOT…`, `EMG…`, `WAR…`, `BUD…`.

### 14.7 Game UI (Phase 7)

`apps/game` is a React 19 + Vite host. It never mutates `SimState` entities directly. Browser content loading uses Vite `import.meta.glob` of canonical `data/` and `maps/` through `@lorsain/content-loader` (not `/node`). Saves persist serialized `SaveFile`s in IndexedDB (Dexie) and round-trip through `parseSaveFile` / `restoreSimulation`. Normal UI shows public facts, polls, and qualitative labels — not hidden traits, skills, private goals, or latent support. Developer/debug mode may expose numbers separately. Phase 8 adds a role-aware Courts screen.

### 14.8 Constitutional Court (Phase 8)

- **Separate runtime:** `constitutionalRuntime` on `SimState`. The nine-judge bench is **derived** from active `constitutional_court_justice` `OfficeTerm`s. Do not store an authoritative parallel roster.
- **Constitutional parameters:** `KernelWorld.courtConstitution` from `terena_constitution.json` (9 judges, 12-year terms, `renewable` boolean — false for Terena, confirmation fraction 0.6 → **252** of 420 authorized seats, recall referral 0.6 → **252**). When `renewable === false`, a politician who has ever held a substantive Constitutional Court `OfficeTerm` (any seat, including ended terms) cannot be nominated again (`COURT_TERM_NONRENEWABLE`). Impeachment uses `ceil(seats * 2 / 3)` → **280**, not the rounded 0.6666667 percent helper. Vacancies do not shrink the Assembly denominator.
- **Nomination:** vacancy → `awaiting_nomination` → `NOMINATE_CONSTITUTIONAL_JUDGE` (player President only; NPC President via Phase 2). Assembly confirmation next month. Player MP is never auto-voted; missed vote is `ABSTAIN`.
- **Cases:** `CASE…` with structured `caseType`, petitioner/respondent, challenged entity, constitutional question/rule, meritsLean, participating judges, votes, disposition. Types: `LAW_REVIEW`, `REGULATION_REVIEW`, `EXECUTIVE_ACTION_REVIEW`, `EMERGENCY_REVIEW`, `ELECTION_CONSTITUTIONAL_DISPUTE`, `IMPEACHMENT_JUDGMENT`. Active caseload capped at 3 except impeachment judgments.
- **Decisions:** `CDEC…`. `UPHOLD` / `INVALIDATE`. Player judge never auto-votes; missed deadline is `nonparticipation`. Invalidated laws stay archived with `operative: false`. Regulations may be `active`, `annulled`, `invalidated`, or `expired`. Lightweight `PrecedentRecord`s influence later similar cases.
- **Grounds:** `CGND…` `ConstitutionalGroundsRecord`s (`id`, `targetPoliticianId`, `grounds`, `sourceKind`, `sourceId`, `createdDate`, `evidenceStrength`, `severity`, `public`, `status`, `metadata`). Phase 8 may create them from serious Court invalidations of presidential emergencies, major regulations, executive actions, or war powers. Future corruption/treason/scandal systems may add more. Normal 2028 play may have none.
- **Impeachment:** `IMPEACH…`. Command is `INTRODUCE_IMPEACHMENT { basisId }`. Target and grounds derive from an available public basis against the current President. Assembly 280 YES then Court `IMPEACHMENT_JUDGMENT` using copied `evidenceStrength` / `severity`, not the grounds label as fake evidence. Only a Court INVALIDATE creates a presidential vacancy through existing Phase 1 succession.
- **Recall:** `RECALL…`. Assembly 252 YES refers a national YES/NO vote (60-day window) using Phase 4 blocs/public standing. Success uses existing succession. Recall is political; impeachment is constitutional.
- **IDs:** `CASE…`, `CNOM…`, `CDEC…`, `IMPEACH…`, `RECALL…`, `CGND…`.

## 15. Map contract

The political runtime domestic SVG (`maps/terena_game_map.svg`) must preserve `FDV`, `P01`–`P20`, `C001`–`C048`, city IDs and `TERENA`. River IDs `R01`–`R08` and route IDs `RT01`–`RT18` are stable canonical geography IDs but are **not** required on that political runtime SVG. The world SVG must preserve `W01`–`W48`. Display names live in data and may change without changing IDs.
