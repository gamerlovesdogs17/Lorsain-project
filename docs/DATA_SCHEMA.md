# Data Schema and Entity Contracts

## 1. ID policy

Use stable string IDs everywhere. SVG path IDs and content IDs are external contracts. Never use array index as the persisted identity of an entity.

Examples: `TER`, `W41`, `P09`, `FDV`, `C001`, `PARTY_LAB`, `NPC001`, `OFFICE_PRESIDENT`, `ORG_TCL`.

`W41` (world country), `TER` (domestic country) and `TERENA` (domestic SVG outline) are intentionally separate namespaces; use `canonical_crosswalk.json` rather than assuming they are interchangeable.

## 2. Static content versus save state

**Static content** defines geography, constitutional rules, office definitions, issue definitions, party rules, initial politicians and historical facts before the scenario start. **Save state** records mutable values from the scenario onward. Do not modify static content objects during play.

`contentVersion` (canonical JSON package), npm `package.json` version, and save `schemaVersion` are **separate**. Phase 11.2 uses `schemaVersion: 12` and `contentVersion: 0.3.1-predev`. Phase 11 saves migrate to v12 by adding provincial runtime, campaign province organization, economy history/cycle fields, and clearing only illegitimately pre-populated planned future presidential fields; no past election, office, action or economic event is fabricated.

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

Regular presidential and Assembly election days produce a typed `BLOCKING_DOMAIN` interrupt with `requiresResolution: true`. `RESUME_TURN` / `ACKNOWLEDGE_INTERRUPT` cannot bypass them (`DOMAIN_RESOLUTION_REQUIRED`). After the election domain records its immutable resolution, `RESUME_TURN` continues to the original month target and applies assumption events that fall on that target (for example the 2030-06-01 Assembly assumption). Presentation pauses (`requiresResolution: false`) must be acknowledged, then resumed normally.

Court terms with `expirationPolicy: auto_vacate` end automatically. Presidential and Assembly terms require the relevant election/succession domain; an unresolved regular-election interrupt therefore cannot silently carry expired elected holders forward.

Special presidential vacancy: Phase 1 records `SPECIAL_PRESIDENTIAL_ELECTION_REQUIRED` and schedules `SPECIAL_PRESIDENTIAL_ELECTION_DEADLINE` (vacancyDate + 90 days). That is a constitutional deadline, not a chosen election date.

## 8. Elections

Store elections as persistent historical objects. A campaign references an election but exists before results.

```ts
interface ElectionState {
  id: string;
  type: 'presidential' | 'assembly';
  date: ISODate;
  status: 'planned' | 'field_open' | 'field_finalized' | 'voting' | 'resolved' | 'cancelled';
  geographyKind: 'national' | 'constituency';
  seats: number;
  fieldFinalized: boolean;
  candidates: Record<PoliticianId, ElectionCandidate>;
  turnout: TurnoutRecord | null;
  countInput: ElectionCountInput | null;
  countArchive: IrvResult | StvResult | null;
  winnerIds: PoliticianId[];
  assembly: AssemblyElectionCycle | null;
}

interface AssemblyElectionCycle {
  filingStatus: 'planned' | 'open' | 'closed';
  filingOpenDate: ISODate;
  filingDeadlineDate: ISODate;
  decisions: Record<PoliticianId, AssemblyFilingDecision>;
  candidacies: Record<PoliticianId, AssemblyCandidacy>;
  constituencyFields: Record<ConstituencyId, AssemblyConstituencyField>;
  constituencyResults: Record<ConstituencyId, AssemblyConstituencyResult>;
  previousPartySeatTotals: Record<PartyId, number>;
  partySeatTotals: Record<PartyId, number>;
}

interface AssemblyConstituencyResult {
  constituencyId: ConstituencyId;
  constituencyElectionId: string;
  magnitude: number;
  candidateIds: PoliticianId[];
  partyByCandidate: Record<PoliticianId, PartyId | null>;
  firstPreferences: Record<PoliticianId, string>; // exact integer strings
  electedIds: PoliticianId[];
  turnout: TurnoutRecord;
  countArchive: StvResult | null;
  archiveCompleteness: 'full' | 'legacy_summary';
}
```

Future Assembly ballot groups are not duplicated in the national parent object: the typed constituency result retains first preferences and the complete STV round/transfer/exhaustion/lot archive. A migrated legacy result is explicitly marked `legacy_summary` instead of fabricating missing rounds.

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

Phase 10 runtime: `SimState.foreignAffairsRuntime` (see `docs/FOREIGN_AFFAIRS_SYSTEM.md`).

```ts
interface ForeignCountryRuntime {
  countryId: string;
  leaderId: string;
  posture: MilitaryPostureLevel;
  capabilities: CapabilityVector;
  tradeExposure: Record<string, number>;
  strategicGoals: StrategicGoalId[]; // internal AI — not normal UI
  institutionIds: string[];
  activeSanctionIds: string[];
  metadata: JsonObject;
}

interface BilateralRelation {
  general: number;        // -100..100
  trust: number;
  securityTension: number; // 0..100
  economicTies: number;    // 0..100
  lastUpdated: IsoDate;
}
```

Static canon: `KernelWorld.worldCountries`, `worldInstitutions`, `worldLeaders`. Canonical starting relations with Terena use `relation_with_terena` as a diplomatic prior only.

`world_institutions.json` institutions may include:

- `member_country_ids: string[]` — persistent membership (WA 48, LTO 43, DC 13, CSC 5, NAF 20)
- `security_council_veto_ids: string[]` — WA only (W24, W28, W37, W40)

Runtime `ForeignCountryRuntime.institutionIds` are seeded from these lists (not only `alignment_ids`).

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

Current save envelope (`schemaVersion: 12`):

```ts
interface SaveFile {
  schemaVersion: 12;
  contentVersion: string;
  scenarioId: string;
  simulation: SimState;
  // rng, calendar, officeTerms, scheduler, history, counters, interrupt,
  // relationships, memories, beliefs, goals, generatedAgentProfiles,
  // agentProfileOverrides, partyStates, factionStates, endorsements,
  // partyContests, dynamicParties,
  // elections, candidateStanding, electoralEnvironment, polls, domainResolutions,
  // campaignRuntime, provincialRuntime, legislatureRuntime, executiveRuntime,
  // economyRuntime, organizationRuntime, mediaRuntime, foreignAffairsRuntime,
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

**v8 → v9:** Phase 8 saves had no economy, organization, or media runtime. Migration initializes the Phase 9 baselines and empty histories.

**v9 → v10:** Phase 9 saves had no foreign-affairs runtime. Migration initializes empty foreign state; restore seeds the canonical 48-country baseline without fabricated foreign history.

**v10 → v11:** Phase 10 saves had no typed Assembly filing/candidacy lifecycle or constituency STV result archive. Migration initializes recurring Assembly cycle state. If a resolved Assembly election has only the old metadata summary, that result is retained as `legacy_summary`; missing first-preference and round detail remains explicitly unavailable. No player candidacy, campaign action, or detailed count history is fabricated.

**v11 → v12:** Phase 11 saves had no provincial gameplay/election runtime, province-level campaign organization, or provincial/sector economic history and medium-term cycle state. Migration adds these structures deterministically. Restore derives province office state from current office terms and schedules the first v1 gubernatorial cycle. Existing national/province/sector economic values remain authoritative; missing histories begin at the migrated save date and do not backfill invented past points. Planned future presidential nomination contests whose metadata marks runtime politics lose prematurely stored entries, while open/resolved and historical contests remain immutable.

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
- **PartyContest:** planned → open → voting → resolved. Presidential nomination contests carry `electionId`, `electionDate`, `cycleYear`, `partyId`, and `candidateSource` metadata. Starting 2028 contests use scenario-start labels once; future cycles use current runtime politics and are tied to the exact unresolved/upcoming presidential election. Historical contests remain immutable. Qualification uses numeric canon gates where present (NU 0.15 of **current** caucus; PM 4 **distinct legitimate** provincial-org endorsements). Labour/Green/RL boolean flags remain qualification evidence, not invented percentages. Civic `supporter_registration_required` is selectorate composition, not a candidate filing gate. Generic leadership/faction-chair contests require an explicit `selectorMethod` and must not inherit presidential nomination rules. Counts always go through `countIrv`. Formal archives store exact `countInput` ballots (id/weight/rankings) plus the IRV result; lots replay from archived draws.
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
- **ElectionState:** separate from `PartyContest`. Statuses: `planned` → `field_open` → `field_finalized` → `voting` → `resolved` / `cancelled`. Canonical 2028 presidential election `ELEC_PRES_2028` starts unfinalized with no nominees. Current-cycle helpers choose the earliest unresolved/upcoming election rather than a canonical ID. Nomination winners sync into their metadata-linked general-election field without mutating contest archives. Presidential counts call `countIrv`; Assembly constituency counts call `countStv`. Resolved archives replay from stored ballots and lot draws. Current eligibility is checked only for unresolved fields.
- **DomainResolutionRecord:** `DRES…` evidence for a processed `requiresResolution` event (election or presidential assumption). `RESOLVE_PRESIDENTIAL_ELECTION` is transactional: failure leaves hash, counters, and RNG unchanged when validation can run before draws.
- **Presidential transition:** a regular election winner is immediately `certifiedPresidentElectId` and that victory counts as an elected term. Assumption is 20 January following. Incompatible prior offices (MP/governor/minister) end with structured reasons; vacancies are not auto-filled. The next regular presidential date is calculated from canonical calendar rules, never hardcoded as 2033. If the president-elect cannot assume, the engine raises a typed constitutional block rather than inventing a successor.

### 14.4 Campaigns (Phase 5)

- **Separate runtime:** `campaignRuntime.campaigns` / `debates` / `lastMonthProcessed`. Not a second politician object. Types: `presidential_nomination` | `presidential_general` | `assembly` | `gubernatorial`. Statuses: `exploring` | `active` | `withdrawn` | `won` | `lost` | `ended`.
- **Resources:** integer `cashOnHand` / `totalRaised` / `totalSpent` (no negatives, no debt). Capacities in `[0,1]`. `fieldOrganization` is national infrastructure; sparse `organizationByProvince` and `organizationByConstituency` are geographic layers. Compact `recentEffects` supports diminishing returns and recent-presence UI. Monthly maintenance preserves part of infrastructure while slowly decaying unattended province/constituency organization.
- **Actions:** player commands only for `playerPoliticianId` (`CAMPAIGN_SEEK_NOMINATION_SUPPORT` is the Labour/Green/Regional League qualification milestone). NPCs get Phase 2 `DecisionOption`s from public polls, standing, endorsements, resources, and own hidden skills/traits. Opponent hidden truth is not an input. Effects clamp per action (`STANDING_DELTA.maxPerAction` / `PUBLIC_EFFECT_CLAMP`) and decay momentum monthly. Attacks, contrast ads, and negative ads require a living rival in the same race (`contestId` for nominations, `electionId` for presidential generals, constituency/election for assembly).
- **Nomination calendar:** operational offsets are computed from each linked presidential election date (`packages/sim/src/campaigns/timeline.ts`): open −9 months, qualification/resolution −2 months, field finalize −1 month. `ensurePresidentialNominationContests` creates one fresh contest per membership party for the future cycle. Future NPC interest derives from current eligibility, office/career state, standing, leadership, history, term limits, and strategic context; the player is never added by NPC logic. Institutional `openPartyContest` / `applyQualification` / `resolvePartyContest` / `finalizePresidentialField` operate on the linked cycle, not a 2028 constant.
- **Integration:** an active nomination campaign must match a `PartyContest` entry; a general campaign must match an `ElectionCandidate`; an Assembly campaign must match one filed candidacy in one constituency. Withdrawal reconciles the owning field. Nomination winners inherit cash/org into a linked general campaign. Field organization multiplies that candidate's realized constituency shares by a bounded factor and renormalizes; it does not edit totals or expose latent support. Assembly results close active campaigns as won/lost while preserving withdrawn records.
- **Start:** TERENA_2028 has zero campaigns until declare. Canonical `presidentialStatus` seeds public standing once at init and is not reapplied by `candidateStandingOrDefault`.

### 14.5 Legislature (Phase 6)

- **Separate runtime:** `legislatureRuntime` on `SimState`. Assembly membership is derived from current active/suspended `assembly_member` terms; it is never a copied politician array.
- **Committees:** five functional bodies (`COMMITTEE_ECONOMIC`, `COMMITTEE_SOCIAL_ECONOMIC`, `COMMITTEE_SOCIAL`, `COMMITTEE_INSTITUTIONAL`, `COMMITTEE_FOREIGN`) mapped from issue dimensions. Deterministic proportional membership from current MPs, including factions and the player if they sit. Not canonical content committees.
- **Bills:** `BILL…` stores one to three structured `PolicyItem`s (`issueId`, `direction`, `magnitude`, `fiscalImpact`, optional `provisionId` / `optionId`). A Phase 11.2 provision registry maps concrete legal categories and named options to those simulation effects, current-law copy, change copy and estimated public index effects. Lifecycle: introduce (status `committee`, `stageReadyDate` = that month) → next month or later committee vote → next month or later floor vote if passed → president sign/return → returned bills wait a month before repassage → `LAW…` archive. A bill is visible before any vote involving the player is tallied. Amendments are `AMD…` policy replacements, not bribery. A proposed amendment is adopted or rejected (ordinary majority of votes cast, tie fails) before the parent bill leaves that stage; adopted amendments replace the bill's `PolicyItem`s.
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

### 14.9 Economy and provincial government (Phases 9 / 11.2)

- **Canonical start:** `terena_economy_2028.json` contains scenario date, six national indices plus fiscal pressure, six sector profiles, and 21 province profiles. Province profiles contain starting conditions/employment/housing, six normalized sector exposures, growth/inflation/housing/trade sensitivities, bounded annual structural trends, and a short public character description.
- **Economy runtime:** `national`, `sectors`, `provinces`, national `history`, `sectorHistory`, `provinceHistory`, lagged policy effects, shocks, applied policy sources, cycle phase/momentum/month count, and last processed month. History is bounded to 120 monthly points.
- **Provincial runtime:** `provinces`, `pressures`, `actions`, `elections`, and last processed month. Province state stores administrative priority, investment emphasis/momentum, political capital, public standing, federal relationship, two monthly action points, and an optional active pressure.
- **Gubernatorial election:** stable ID `ELEC_GOV_<province>_<year>`; status `planned | filing_open | field_finalized | resolved | assumed`; province, election/filing/assumption dates, incumbent, candidate records, optional winner, vote shares/total, and public result metadata. Each politician can occur once in a race; the player enters only through an explicit command.
- **Authority:** Governor commands validate a current substantive governorship for the target province. Minister and Mayor bounded commands validate their corresponding current office. UI visibility is never authority.

## 15. Map contract

The political runtime domestic SVG (`maps/terena_game_map.svg`) must preserve `FDV`, `P01`–`P20`, `C001`–`C048`, city IDs and `TERENA`. River IDs `R01`–`R08` and route IDs `RT01`–`RT18` are stable canonical geography IDs but are **not** required on that political runtime SVG. The world SVG must preserve `W01`–`W48`. Display names live in data and may change without changing IDs.
