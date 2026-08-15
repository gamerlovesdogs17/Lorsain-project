# Data Schema and Entity Contracts

## 1. ID policy

Use stable string IDs everywhere. SVG path IDs and content IDs are external contracts. Never use array index as the persisted identity of an entity.

Examples: `TER`, `W41`, `P09`, `FDV`, `C001`, `PARTY_LAB`, `NPC001`, `OFFICE_PRESIDENT`, `ORG_TCL`.

`W41` (world country), `TER` (domestic country) and `TERENA` (domestic SVG outline) are intentionally separate namespaces; use `canonical_crosswalk.json` rather than assuming they are interchangeable.

## 2. Static content versus save state

**Static content** defines geography, constitutional rules, office definitions, issue definitions, party rules, initial politicians and historical facts before the scenario start. **Save state** records mutable values from the scenario onward. Do not modify static content objects during play.

`contentVersion` (canonical JSON package), npm `package.json` version, and save `schemaVersion` are **separate**. Phase 1 saves use `schemaVersion: 1` and `contentVersion: 0.3.1-predev`.

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

Phase 1 save envelope (`schemaVersion: 1`):

```ts
interface SaveFile {
  schemaVersion: 1;
  contentVersion: string;
  scenarioId: string;
  simulation: SimState; // includes authoritative rng, calendar, officeTerms, scheduler, history, counters, interrupt
}
```

Authoritative RNG lives only in `simulation.rng`. A leftover root `rng` field, if present, must equal `simulation.rng` or the save is rejected.

Loaded saves are untrusted `unknown` and are fully structurally validated. Content-version mismatches apply registered migrations or return `INCOMPATIBLE_CONTENT`; a migration object that does not actually update the save is not accepted.

Later domain fields (relationships, bills, economy, etc.) are not present in Phase 1. Schema migrations are registered from v1 even though only v1 exists (`migrateSaveV1ToV2` is the named placeholder).

## 15. Map contract

The political runtime domestic SVG (`maps/terena_game_map.svg`) must preserve `FDV`, `P01`–`P20`, `C001`–`C048`, city IDs and `TERENA`. River IDs `R01`–`R08` and route IDs `RT01`–`RT18` are stable canonical geography IDs but are **not** required on that political runtime SVG. The world SVG must preserve `W01`–`W48`. Display names live in data and may change without changing IDs.
