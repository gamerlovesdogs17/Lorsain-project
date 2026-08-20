import {
  assemblyAssumptionDate,
  isIsoDate,
  parseIsoDate,
  presidentialAssumptionDate,
  regularElectionDate,
  type IsoDate,
  type RegularElectionCalendar,
  type WeekdayName,
} from "./calendar.js";
import { expirationPolicyForKind } from "./offices.js";
import type { KernelOffice, KernelWorld, OfficeTerm, PoliticianRuntime } from "./types.js";
import { profileFromFigure, type FigureProfileSource } from "./agents/profile.js";
import { buildPartyKernelSlice, emptyPartyKernelSlice } from "./parties/content.js";
import { presidentialEligibilityFromContent } from "./parties/eligibility.js";
import {
  buildElectorateKernelSlice,
  emptyElectorateKernelSlice,
  type ConstituencyGeoInput,
  type PollsterInput,
  type VoterBlocConstituencyInput,
} from "./elections/content.js";
import type { TurnoutBaseline2026 } from "./elections/types.js";
import { applyInstitutionalPublicIdeology } from "./elections/public-ideology.js";
import {
  CANONICAL_ASSEMBLY_ELECTION_ID,
  CANONICAL_PRESIDENTIAL_ELECTION_ID,
} from "./elections/types.js";

type Role = {
  type: string;
  constituency_id?: string;
  jurisdiction_id?: string;
  city_id?: string;
  portfolio?: string;
  seat_index?: number;
};

type FigureIn = FigureProfileSource & {
  party_id?: string | null;
  faction_id?: string | null;
  home_province_id?: string;
  roles?: Role[];
  court?: { seat_index: number; appointed: string; term_ends: string; chief?: boolean };
  presidential_status?: string | null;
};

type OfficeIn = {
  id: string;
  kind: string;
  title: string;
  jurisdiction_id: string;
  capacity: number;
  constituency_id?: string;
  province_id?: string;
  city_id?: string;
  seat_index?: number;
  portfolio?: string;
  incompatible_with_kinds?: string[];
  may_coexist_with_kinds?: string[];
  requires_holder_kinds?: string[];
  suspend_when_acting_president?: boolean;
  no_party_membership_while_serving?: boolean;
  acting_allowed?: boolean;
  expiration_policy?: "auto_vacate" | "requires_domain_resolution" | "none";
};

export type ContentCalendar = {
  id: string;
  interval_years: number;
  month: number;
  nth_weekday: number;
  weekday: string;
  anchor_year: number;
  assumption_of_office: {
    month: number;
    day: number;
    year_offset_from_election: number;
  };
};

export type TerenaKernelInput = {
  contentVersion: string;
  scenario: {
    id: string;
    date: string;
    canonical_seed: string;
    president_id: string;
    speaker_id: string;
    assembly: {
      next_election?: string;
      election_date?: string;
      term_start?: string;
      term_end?: string;
    };
    presidential_election: { date: string; regular_term_begins?: string };
  };
  figures: FigureIn[];
  offices: OfficeIn[];
  issues?: Array<{ id: string; dimension?: string }>;
  constitution: {
    calendars?: Record<string, ContentCalendar>;
    assembly?: { seats?: number; absolute_majority?: number };
    ministerial_censure?: { threshold_fraction?: number };
    budget?: Record<string, unknown>;
    regulation_review?: { review_days?: number };
    war_powers?: { unilateral_days?: number };
    emergency?: { initial_days?: number; extension_days?: number };
    recall?: { assembly_referral_fraction?: number };
    constitutional_court?: {
      judges?: number;
      term_years?: number;
      renewable?: boolean;
      confirmation_fraction?: number;
    };
    presidential_vacancy?: {
      acting_succession_office_ids?: string[];
      special_election?: {
        required_if_more_than_days_before_regular_election?: number;
        must_occur_within_days_of_vacancy?: number;
      };
      president_elect_before_assumption?: { president_elect_becomes_acting_within_days?: number };
    };
  };
  administrations?: Array<{
    id: string;
    president_person_id?: string;
    elected?: string;
    term_start: string;
    term_end: string;
    status?: string;
  }>;
  parties?: Array<{
    id: string;
    name: string;
    short?: string;
    organization_type?: string;
    nomination_rule_id: string;
    factions: Array<{ id: string; name: string; share: number; party_id?: string }>;
  }>;
  nominationRules?: Array<{
    id: string;
    party_id: string;
    method: string;
    member_weight?: number;
    affiliate_union_delegate_weight?: number;
    entry_requirements?: Record<string, unknown>;
  }>;
  provinces?: string[];
  constituencies?: Array<{
    id: string;
    provinceShares: Array<{ provinceId: string; share: number }>;
  }>;
  assemblyElection?: {
    constituencies: Array<{
      constituencyId: string;
      candidates: Array<{ id: string; partyId: string | null }>;
      firstPreferences: Record<string, string>;
    }>;
  };
  presidentialEligibility?: {
    rules: {
      minimum_age: number;
      age_measured_on?: string;
      term_limit_elected: number;
      must_resign_before_candidacy_filing?: string[];
      may_campaign_while_holding?: Record<string, boolean>;
    };
  };
  voterBlocs?: VoterBlocConstituencyInput[];
  pollsters?: PollsterInput[];
  constituencyGeo?: ConstituencyGeoInput[];
  turnout2026?: Record<string, TurnoutBaseline2026>;
  organizations?: Array<{
    id: string;
    name: string;
    type: string;
    lean?: string;
    strength?: number;
    issues: string[];
    lean_party_ids?: string[];
  }>;
  mediaOutlets?: Array<{
    id: string;
    name: string;
    type: string;
    ideology: number;
    factual_reputation: number;
    audience?: string;
  }>;
  worldCountries?: Array<{
    id: string;
    name: string;
    map_path_id: string;
    neighbor_ids: string[];
    alignment_ids: string[];
    population?: number;
    government?: string;
    region?: string;
    power_tier?: string;
    relation_with_terena?: number;
    alignment?: string;
  }>;
  worldInstitutions?: Array<{
    id: string;
    name: string;
    type: string;
    founded?: number;
  }>;
  worldLeaders?: Array<{
    id: string;
    country_id: string;
    name: string;
    title: string;
    since_year: number;
    government_form: string;
  }>;
};

export class KernelContentError extends Error {
  readonly code = "CONTENT_CONFLICT";
  constructor(message: string) {
    super(message);
    this.name = "KernelContentError";
  }
}

function mapCalendar(raw: ContentCalendar): RegularElectionCalendar {
  return {
    intervalYears: raw.interval_years,
    month: raw.month,
    nthWeekday: raw.nth_weekday,
    weekday: raw.weekday as WeekdayName,
    anchorYear: raw.anchor_year,
    assumptionMonth: raw.assumption_of_office.month,
    assumptionDay: raw.assumption_of_office.day,
    assumptionYearOffset: raw.assumption_of_office.year_offset_from_election,
  };
}

function mapOffice(o: OfficeIn): KernelOffice {
  return {
    id: o.id,
    kind: o.kind,
    title: o.title,
    jurisdictionId: o.jurisdiction_id,
    capacity: o.capacity,
    constituencyId: o.constituency_id ?? null,
    provinceId: o.province_id ?? null,
    cityId: o.city_id ?? null,
    seatIndex: o.seat_index ?? null,
    portfolio: o.portfolio ?? null,
    incompatibleWithKinds: o.incompatible_with_kinds ?? [],
    mayCoexistWithKinds: o.may_coexist_with_kinds ?? [],
    requiresHolderKinds: o.requires_holder_kinds ?? [],
    suspendWhenActingPresident: o.suspend_when_acting_president === true,
    noPartyMembershipWhileServing: o.no_party_membership_while_serving === true,
    actingAllowed: o.acting_allowed === true || o.kind === "president",
    expirationPolicy: o.expiration_policy ?? expirationPolicyForKind(o.kind),
  };
}

function preexisting(
  partial: Omit<
    OfficeTerm,
    "id" | "startDate" | "startKnown" | "endedDate" | "endedReason" | "status"
  >,
): Omit<OfficeTerm, "id"> {
  return {
    ...partial,
    startDate: null,
    startKnown: false,
    status: "active",
    endedDate: null,
    endedReason: null,
  };
}

export function buildTerenaKernelWorld(input: TerenaKernelInput): KernelWorld {
  const calendars = input.constitution.calendars;
  if (!calendars?.CALENDAR_PRESIDENTIAL_REGULAR || !calendars.CALENDAR_ASSEMBLY_REGULAR) {
    throw new KernelContentError("Constitution must define presidential and assembly calendars");
  }
  const presidentialCalendar = mapCalendar(calendars.CALENDAR_PRESIDENTIAL_REGULAR);
  const assemblyCalendar = mapCalendar(calendars.CALENDAR_ASSEMBLY_REGULAR);

  const nextPresYear = parseIsoDate(input.scenario.presidential_election.date).year;
  let computedPresDate: IsoDate;
  try {
    computedPresDate = regularElectionDate(presidentialCalendar, nextPresYear);
  } catch (e) {
    throw new KernelContentError(
      e instanceof Error ? e.message : "Cannot compute presidential election date",
    );
  }
  if (input.scenario.presidential_election.date !== computedPresDate) {
    throw new KernelContentError(
      `Scenario presidential date ${input.scenario.presidential_election.date} does not match calendar ${computedPresDate}`,
    );
  }
  const computedPresAssume = presidentialAssumptionDate(computedPresDate, presidentialCalendar);
  if (
    input.scenario.presidential_election.regular_term_begins &&
    input.scenario.presidential_election.regular_term_begins !== computedPresAssume
  ) {
    throw new KernelContentError(
      `Scenario regular_term_begins does not match calendar assumption ${computedPresAssume}`,
    );
  }

  const assemblyNext = input.scenario.assembly.next_election;
  if (!assemblyNext || !isIsoDate(assemblyNext)) {
    throw new KernelContentError("Scenario assembly.next_election must be an ISO date");
  }
  const assemblyYear = parseIsoDate(assemblyNext).year;
  let computedAsmDate: IsoDate;
  try {
    computedAsmDate = regularElectionDate(assemblyCalendar, assemblyYear);
  } catch (e) {
    throw new KernelContentError(
      e instanceof Error ? e.message : "Cannot compute assembly election date",
    );
  }
  if (assemblyNext !== computedAsmDate) {
    throw new KernelContentError(
      `Scenario assembly.next_election ${assemblyNext} does not match calendar ${computedAsmDate}`,
    );
  }
  const asmTermStart = input.scenario.assembly.term_start;
  const asmTermEnd = input.scenario.assembly.term_end;
  if (!asmTermStart || !asmTermEnd) {
    throw new KernelContentError("Scenario assembly term_start/term_end are required");
  }
  const lastAsmElection = input.scenario.assembly.election_date;
  if (lastAsmElection) {
    const computedStart = assemblyAssumptionDate(lastAsmElection, assemblyCalendar);
    if (asmTermStart !== computedStart) {
      throw new KernelContentError(
        `Assembly term_start ${asmTermStart} does not match assumption ${computedStart}`,
      );
    }
    const nextAssume = assemblyAssumptionDate(assemblyNext, assemblyCalendar);
    if (asmTermEnd !== nextAssume) {
      throw new KernelContentError(
        `Assembly term_end ${asmTermEnd} does not match next assumption ${nextAssume}`,
      );
    }
  }

  const offices: Record<string, KernelOffice> = {};
  for (const o of input.offices) offices[o.id] = mapOffice(o);

  const officeByConst = new Map<string, string>();
  const officeByProvince = new Map<string, string>();
  const officeByCity = new Map<string, string>();
  const officeBySeat = new Map<number, string>();
  const officeByPortfolio = new Map<string, string>();
  for (const o of Object.values(offices)) {
    if (o.kind === "assembly_member" && o.constituencyId) officeByConst.set(o.constituencyId, o.id);
    if (o.kind === "governor" && o.provinceId) officeByProvince.set(o.provinceId, o.id);
    if (o.kind === "mayor" && o.cityId) officeByCity.set(o.cityId, o.id);
    if (o.kind === "constitutional_court_justice" && o.seatIndex != null) {
      officeBySeat.set(o.seatIndex, o.id);
    }
    if (o.kind === "minister" && o.portfolio) officeByPortfolio.set(o.portfolio, o.id);
  }

  const incumbent = (input.administrations ?? []).find(
    (a) => a.status === "incumbent_at_scenario_start",
  );
  if (!incumbent) {
    throw new KernelContentError("No incumbent presidential administration at scenario start");
  }
  if (incumbent.president_person_id !== input.scenario.president_id) {
    throw new KernelContentError(
      `Incumbent ${incumbent.id} person ${incumbent.president_person_id} != scenario president ${input.scenario.president_id}`,
    );
  }
  const electedCounts: Record<string, number> = {};
  for (const a of input.administrations ?? []) {
    if (!a.president_person_id) continue;
    electedCounts[a.president_person_id] = (electedCounts[a.president_person_id] ?? 0) + 1;
  }

  const politicians: PoliticianRuntime[] = [];
  const startingTerms: Array<Omit<OfficeTerm, "id">> = [];
  const catalog = (input.issues ?? []).map((i) => i.id).sort();
  const agentProfiles: KernelWorld["agentProfiles"] = {};

  for (const f of input.figures) {
    politicians.push({
      id: f.id,
      alive: true,
      retired: false,
      partyId: f.party_id ?? null,
      factionId: f.faction_id ?? null,
    });
    try {
      agentProfiles[f.id] = profileFromFigure(f, catalog.length ? catalog : undefined);
    } catch (e) {
      throw new KernelContentError(e instanceof Error ? e.message : String(e));
    }
    for (const role of f.roles ?? []) {
      if (role.type === "president") {
        startingTerms.push({
          officeId: "OFFICE_PRESIDENT",
          holderId: f.id,
          startDate: incumbent.term_start as IsoDate,
          startKnown: true,
          endDate: incumbent.term_end as IsoDate,
          accessionReason: "election",
          status: "active",
          holdingKind: "substantive",
          sourceElectionId: incumbent.elected ? `PRESIDENTIAL_${incumbent.elected}` : null,
          endedDate: null,
          endedReason: null,
        });
      } else if (role.type === "assembly_member" && role.constituency_id) {
        const oid = officeByConst.get(role.constituency_id);
        if (oid) {
          startingTerms.push({
            officeId: oid,
            holderId: f.id,
            startDate: asmTermStart as IsoDate,
            startKnown: true,
            endDate: asmTermEnd as IsoDate,
            accessionReason: "election",
            status: "active",
            holdingKind: "substantive",
            sourceElectionId: "TERENA_ASSEMBLY_2026",
            endedDate: null,
            endedReason: null,
          });
        }
      } else if (role.type === "assembly_speaker") {
        startingTerms.push({
          officeId: "OFFICE_SPEAKER",
          holderId: f.id,
          startDate: asmTermStart as IsoDate,
          startKnown: true,
          endDate: null,
          accessionReason: "assembly_selection",
          status: "active",
          holdingKind: "substantive",
          sourceElectionId: "TERENA_ASSEMBLY_2026",
          endedDate: null,
          endedReason: null,
        });
      } else if (role.type === "governor") {
        const j = role.jurisdiction_id;
        const oid = j ? officeByProvince.get(j) : undefined;
        if (oid) {
          startingTerms.push(
            preexisting({
              officeId: oid,
              holderId: f.id,
              endDate: null,
              accessionReason: "preexisting",
              holdingKind: "substantive",
              sourceElectionId: null,
            }),
          );
        }
      } else if (role.type === "minister" && role.portfolio) {
        const oid = officeByPortfolio.get(role.portfolio);
        if (oid) {
          startingTerms.push(
            preexisting({
              officeId: oid,
              holderId: f.id,
              endDate: null,
              accessionReason: "appointment",
              holdingKind: "substantive",
              sourceElectionId: null,
            }),
          );
        }
      } else if (role.type === "mayor" && role.city_id) {
        const oid = officeByCity.get(role.city_id);
        if (oid) {
          startingTerms.push(
            preexisting({
              officeId: oid,
              holderId: f.id,
              endDate: null,
              accessionReason: "preexisting",
              holdingKind: "substantive",
              sourceElectionId: null,
            }),
          );
        }
      } else if (role.type === "chief_justice" || role.type === "constitutional_court_judge") {
        const seat = f.court?.seat_index ?? role.seat_index;
        const oid = seat != null ? officeBySeat.get(seat) : undefined;
        if (oid && f.court) {
          startingTerms.push({
            officeId: oid,
            holderId: f.id,
            startDate: f.court.appointed,
            startKnown: true,
            endDate: f.court.term_ends,
            accessionReason: "appointment",
            status: "active",
            holdingKind: "substantive",
            sourceElectionId: null,
            endedDate: null,
            endedReason: null,
          });
        }
      }
    }
  }

  const vacancy = input.constitution.presidential_vacancy;
  const initialScheduled: KernelWorld["initialScheduled"] = [
    {
      dueDate: computedPresDate,
      eventType: "PRESIDENTIAL_ELECTION_DUE",
      payload: { electionId: CANONICAL_PRESIDENTIAL_ELECTION_ID },
      priority: 0,
      blocking: true,
      requiresResolution: true,
      source: "CALENDAR_PRESIDENTIAL_REGULAR",
    },
    {
      dueDate: computedAsmDate,
      eventType: "ASSEMBLY_ELECTION_DUE",
      payload: { electionId: CANONICAL_ASSEMBLY_ELECTION_ID },
      priority: 0,
      blocking: true,
      requiresResolution: true,
      source: "CALENDAR_ASSEMBLY_REGULAR",
    },
  ];
  for (const t of startingTerms) {
    const office = offices[t.officeId];
    if (t.endDate && office?.expirationPolicy === "auto_vacate") {
      initialScheduled.push({
        dueDate: t.endDate,
        eventType: "OFFICE_TERM_END_DUE",
        payload: { officeId: t.officeId, holderId: t.holderId, autoEnd: true },
        priority: 10,
        blocking: false,
        requiresResolution: false,
        source: t.officeId,
      });
    }
  }

  let partySlice = emptyPartyKernelSlice();
  if (input.parties && input.nominationRules) {
    try {
      partySlice = buildPartyKernelSlice({
        parties: input.parties,
        nominationRules: input.nominationRules,
        figures: input.figures,
        ...(input.provinces ? { provinces: input.provinces } : {}),
        ...(input.constituencies ? { constituencies: input.constituencies } : {}),
        ...(input.assemblyElection ? { assemblyElection: input.assemblyElection } : {}),
      });
    } catch (e) {
      throw new KernelContentError(e instanceof Error ? e.message : String(e));
    }
  }

  let electorateSlice = emptyElectorateKernelSlice();
  if (input.voterBlocs?.length) {
    try {
      const issueIds = catalog.length
        ? catalog
        : [...new Set(input.figures.flatMap((f) => Object.keys(f.issue_salience ?? {})))].sort();
      electorateSlice = buildElectorateKernelSlice({
        voterBlocs: input.voterBlocs,
        ...(input.pollsters ? { pollsters: input.pollsters } : {}),
        issues: (input.issues ?? [])
          .filter((i): i is { id: string; dimension: string } => typeof i.dimension === "string")
          .map((i) => ({ id: i.id, dimension: i.dimension })),
        ...(input.constituencyGeo ? { constituencies: input.constituencyGeo } : {}),
        ...(input.turnout2026 ? { turnout2026: input.turnout2026 } : {}),
        partyIds: [
          ...Object.keys(partySlice.partyDefinitions),
          partySlice.independentAggregatePartyId,
        ],
        issueIds,
        provinceIds: partySlice.provinceIds,
      });
    } catch (e) {
      throw new KernelContentError(e instanceof Error ? e.message : String(e));
    }
  }

  const world: KernelWorld = {
    contentVersion: input.contentVersion,
    scenarioId: input.scenario.id,
    scenarioStartDate: input.scenario.date as IsoDate,
    canonicalSeed: input.scenario.canonical_seed,
    offices,
    successionOfficeIds: vacancy?.acting_succession_office_ids ?? [
      "OFFICE_SPEAKER",
      "OFFICE_MINISTER_JUSTICE",
      "OFFICE_MINISTER_FINANCE",
      "OFFICE_MINISTER_FOREIGN",
    ],
    specialElectionMoreThanDays:
      vacancy?.special_election?.required_if_more_than_days_before_regular_election ?? 180,
    specialElectionWithinDays: vacancy?.special_election?.must_occur_within_days_of_vacancy ?? 90,
    presidentElectActingWithinDays:
      vacancy?.president_elect_before_assumption?.president_elect_becomes_acting_within_days ?? 7,
    presidentialCalendar,
    assemblyCalendar,
    nextRegularPresidentialElectionDate: computedPresDate,
    nextRegularAssemblyElectionDate: computedAsmDate,
    politicians,
    startingTerms,
    initialScheduled,
    electedTermCounts: electedCounts,
    agentProfiles,
    issueIds: catalog.length
      ? catalog
      : [...new Set(input.figures.flatMap((f) => Object.keys(f.issue_salience ?? {})))].sort(),
    ...partySlice,
    ...(input.presidentialEligibility
      ? {
          presidentialEligibility: presidentialEligibilityFromContent(
            input.presidentialEligibility,
          ),
        }
      : {}),
    ...electorateSlice,
    partyPublicIdeology: {},
    factionPublicIdeology: {},
    legislativeConstitution: {
      assemblySeatCount: input.constitution.assembly?.seats ?? 420,
      assemblyAbsoluteMajority: input.constitution.assembly?.absolute_majority ?? 211,
    },
    executiveConstitution: {
      assemblyCensureFraction: input.constitution.ministerial_censure?.threshold_fraction ?? 0.55,
      regulationReviewDays: input.constitution.regulation_review?.review_days ?? 60,
      emergencyInitialDays: input.constitution.emergency?.initial_days ?? 14,
      emergencyExtensionDays: input.constitution.emergency?.extension_days ?? 30,
      warUnilateralDays: input.constitution.war_powers?.unilateral_days ?? 30,
    },
    courtConstitution: {
      judges: input.constitution.constitutional_court?.judges ?? 9,
      termYears: input.constitution.constitutional_court?.term_years ?? 12,
      renewable: input.constitution.constitutional_court?.renewable === true,
      confirmationFraction: input.constitution.constitutional_court?.confirmation_fraction ?? 0.6,
      recallReferralFraction: input.constitution.recall?.assembly_referral_fraction ?? 0.6,
      recallVoteDays: 60,
    },
    interestOrganizations: Object.fromEntries(
      (input.organizations ?? []).map((o) => [
        o.id,
        {
          id: o.id,
          name: o.name,
          type: o.type,
          lean: o.lean ?? "",
          strength: typeof o.strength === "number" ? o.strength : 0.5,
          issues: [...o.issues],
          leanPartyIds: [...(o.lean_party_ids ?? [])],
        },
      ]),
    ),
    mediaOutlets: Object.fromEntries(
      (input.mediaOutlets ?? []).map((o) => [
        o.id,
        {
          id: o.id,
          name: o.name,
          type: o.type,
          ideology: o.ideology,
          factualReputation: o.factual_reputation,
          audience: o.audience ?? "national",
        },
      ]),
    ),
    worldCountries: Object.fromEntries(
      (input.worldCountries ?? []).map((c) => [
        c.id,
        {
          id: c.id,
          name: c.name,
          region: c.region ?? "",
          government: c.government ?? "",
          population: typeof c.population === "number" ? c.population : 0,
          powerTier: c.power_tier ?? "",
          alignment: typeof c.alignment === "string" ? c.alignment : "",
          alignmentIds: [...c.alignment_ids],
          neighborIds: [...c.neighbor_ids],
          relationWithTerena:
            typeof c.relation_with_terena === "number" ? c.relation_with_terena : 0,
          mapPathId: c.map_path_id,
        },
      ]),
    ),
    worldInstitutions: Object.fromEntries(
      (input.worldInstitutions ?? []).map((i) => [
        i.id,
        {
          id: i.id,
          name: i.name,
          type: i.type,
          founded: typeof i.founded === "number" ? i.founded : null,
        },
      ]),
    ),
    worldLeaders: Object.fromEntries(
      (input.worldLeaders ?? []).map((l) => [
        l.id,
        {
          id: l.id,
          countryId: l.country_id,
          name: l.name,
          title: l.title,
          sinceYear: l.since_year,
          governmentForm: l.government_form,
        },
      ]),
    ),
    worldLeadersByCountryId: Object.fromEntries(
      (input.worldLeaders ?? []).map((l) => [l.country_id, l.id]),
    ),
    terenaWorldCountryId: "W41",
  };
  if (Object.keys(world.worldCountries).length > 0 && Object.keys(world.worldLeaders).length === 0) {
    synthesizeWorldLeaders(world, input.scenario.date.slice(0, 4));
  }
  applyInstitutionalPublicIdeology(world);
  return world;
}

function leaderTitleForGovernment(government: string): string {
  const g = government.toLowerCase();
  if (g.includes("monarchy") || g.includes("duchy") || g.includes("kingdom")) return "Head of Government";
  if (g.includes("president")) return "President";
  if (g.includes("federal")) return "Federal President";
  return "Head of State";
}

function synthesizeWorldLeaders(world: KernelWorld, startYear: string): void {
  const year = parseInt(startYear, 10) || 2028;
  let seq = 1;
  for (const country of Object.values(world.worldCountries).sort((a, b) =>
    a.id < b.id ? -1 : 1,
  )) {
    const id = `WLD${String(seq++).padStart(4, "0")}`;
    const leader = {
      id,
      countryId: country.id,
      name: `${country.name.split(" ").slice(-1)[0] ?? country.id} Executive`,
      title: leaderTitleForGovernment(country.government),
      sinceYear: Math.max(1990, year - 3),
      governmentForm: country.government,
    };
    world.worldLeaders[id] = leader;
    world.worldLeadersByCountryId[country.id] = id;
  }
}
