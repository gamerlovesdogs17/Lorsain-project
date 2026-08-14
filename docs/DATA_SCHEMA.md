# Data Schema and Entity Contracts

## 1. ID policy

Use stable string IDs everywhere. SVG path IDs and content IDs are external contracts. Never use array index as the persisted identity of an entity.

Examples: `TER`, `W41`, `P09`, `FDV`, `C001`, `PARTY_LAB`, `NPC001`, `OFFICE_PRESIDENT`, `ORG_TCL`.

`W41` (world country), `TER` (domestic country) and `TERENA` (domestic SVG outline) are intentionally separate namespaces; use `canonical_crosswalk.json` rather than assuming they are interchangeable.

## 2. Static content versus save state

**Static content** defines geography, constitutional rules, issue definitions, party rules, initial politicians and historical facts before the scenario start. **Save state** records mutable values from the scenario onward. Do not modify static content objects during play.

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

Separate an office definition from a term/officeholder record. This lets the same office persist across centuries.

```ts
interface OfficeTerm {
  id: string;
  officeId: string;
  holderId: string;
  startDate: ISODate;
  endDate?: ISODate;
  accessionReason: string;
}
```

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

```ts
interface SaveGame {
  schemaVersion: number;
  contentVersion: string;
  scenarioId: 'TERENA_2028';
  date: ISODate;
  turn: number;
  rng: SerializedRngState;
  playerPoliticianId: string;
  politicians: Record<string, PoliticianState>;
  relationships: Record<string, RelationshipEdge>;
  memories: Record<string, PoliticalMemory>;
  parties: Record<string, PartyState>;
  offices: Record<string, OfficeTerm>;
  elections: Record<string, ElectionState>;
  campaigns: Record<string, CampaignState>;
  legislature: LegislatureState;
  executive: ExecutiveState;
  courts: CourtState;
  economy: EconomyState;
  countries: Record<string, ForeignCountryState>;
  organizations: Record<string, OrganizationState>;
  eventQueue: ScheduledEvent[];
  history: HistoryIndex;
}
```

## 15. Map contract

The political runtime domestic SVG (`maps/terena_game_map.svg`) must preserve `FDV`, `P01`–`P20`, `C001`–`C048`, city IDs and `TERENA`. River IDs `R01`–`R08` and route IDs `RT01`–`RT18` are stable canonical geography IDs but are **not** required on that political runtime SVG. The world SVG must preserve `W01`–`W48`. Display names live in data and may change without changing IDs.
