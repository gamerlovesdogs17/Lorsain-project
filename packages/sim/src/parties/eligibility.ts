import { occupyingTerms } from "../offices.js";
import { ageOnDate, getAgentProfile } from "../agents/profile.js";
import type { IsoDate } from "../calendar.js";
import type { KernelWorld, SimState } from "../types.js";
import type { PresidentialEligibilityRules } from "./types.js";

/** Canonical eligibility office aliases → runtime office kinds. */
export const ELIGIBILITY_OFFICE_KIND: Record<string, string> = {
  national_assembly_member: "assembly_member",
  provincial_governor: "governor",
  cabinet_minister: "minister",
  constitutional_court_judge: "constitutional_court_justice",
  active_military_commission: "military",
  assembly_member: "assembly_member",
  governor: "governor",
  minister: "minister",
  constitutional_court_justice: "constitutional_court_justice",
  military: "military",
};

export const DEFAULT_PRESIDENTIAL_ELIGIBILITY: PresidentialEligibilityRules = {
  minimumAge: 35,
  ageMeasuredOn: "presidential_election_day",
  termLimitElected: 2,
  mustResignOfficeKinds: ["constitutional_court_justice", "military"],
  mayCampaignOfficeKinds: {
    assembly_member: true,
    governor: true,
    minister: true,
    constitutional_court_justice: false,
    military: false,
  },
};

export type PresidentialEligibilityContent = {
  rules: {
    minimum_age: number;
    age_measured_on?: string;
    term_limit_elected: number;
    must_resign_before_candidacy_filing?: string[];
    may_campaign_while_holding?: Record<string, boolean>;
  };
};

export type PresidentialEligibilityEvaluation = {
  eligible: boolean;
  code: string | null;
  reasons: string[];
  deferred: string[];
};

function mapKind(raw: string): string {
  return ELIGIBILITY_OFFICE_KIND[raw] ?? raw;
}

export function presidentialEligibilityFromContent(
  content: PresidentialEligibilityContent,
): PresidentialEligibilityRules {
  const rules = content.rules;
  const mustResign = (rules.must_resign_before_candidacy_filing ?? []).map(mapKind);
  const mayCampaign: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(rules.may_campaign_while_holding ?? {})) {
    mayCampaign[mapKind(k)] = v;
  }
  return {
    minimumAge: rules.minimum_age,
    ageMeasuredOn: "presidential_election_day",
    termLimitElected: rules.term_limit_elected,
    mustResignOfficeKinds: mustResign,
    mayCampaignOfficeKinds: mayCampaign,
  };
}

function occupyingKinds(world: KernelWorld, state: SimState, politicianId: string): Set<string> {
  const kinds = new Set<string>();
  for (const office of Object.values(world.offices)) {
    for (const term of occupyingTerms(state, office.id)) {
      if (term.holderId === politicianId) kinds.add(office.kind);
    }
  }
  return kinds;
}

export function evaluatePresidentialEligibility(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  electionDate?: IsoDate | null,
): PresidentialEligibilityEvaluation {
  const rules = world.presidentialEligibility;
  const deferred: string[] = [];
  const reasons: string[] = [];
  const onDate = electionDate ?? state.presidential.nextRegularElectionDate;
  const pol = state.politicians[politicianId];
  if (!pol) {
    return {
      eligible: false,
      code: "UNKNOWN_POLITICIAN",
      reasons: [`${politicianId} does not exist`],
      deferred,
    };
  }
  if (!pol.alive) {
    return {
      eligible: false,
      code: "PRESIDENTIALLY_INELIGIBLE",
      reasons: [`${politicianId} is not alive`],
      deferred,
    };
  }
  if (pol.retired) {
    return {
      eligible: false,
      code: "PRESIDENTIALLY_INELIGIBLE",
      reasons: [`${politicianId} is retired from active politics`],
      deferred,
    };
  }

  const profile = getAgentProfile(world, state, politicianId);
  const age = ageOnDate(profile?.birthDate ?? null, onDate);
  if (age == null) {
    return {
      eligible: false,
      code: "INSUFFICIENT_ELIGIBILITY_DATA",
      reasons: [`${politicianId} has no birth date; age ${rules.minimumAge} cannot be evaluated`],
      deferred: ["age"],
    };
  }
  if (age < rules.minimumAge) {
    reasons.push(
      `${politicianId} is ${age} on presidential election day ${onDate}; minimum is ${rules.minimumAge}`,
    );
    return {
      eligible: false,
      code: "PRESIDENTIALLY_INELIGIBLE",
      reasons,
      deferred,
    };
  }

  const elected = state.presidential.electedTermCountByPolitician[politicianId] ?? 0;
  if (elected >= rules.termLimitElected) {
    return {
      eligible: false,
      code: "PRESIDENTIALLY_INELIGIBLE",
      reasons: [
        `${politicianId} has ${elected} elected presidential terms; maximum is ${rules.termLimitElected}`,
      ],
      deferred,
    };
  }

  const held = occupyingKinds(world, state, politicianId);
  for (const kind of rules.mustResignOfficeKinds) {
    if (held.has(kind)) {
      return {
        eligible: false,
        code: "PRESIDENTIALLY_INELIGIBLE",
        reasons: [`${politicianId} holds ${kind} and must resign before candidacy filing`],
        deferred,
      };
    }
  }
  for (const [kind, allowed] of Object.entries(rules.mayCampaignOfficeKinds)) {
    if (allowed === false && held.has(kind) && !rules.mustResignOfficeKinds.includes(kind)) {
      return {
        eligible: false,
        code: "PRESIDENTIALLY_INELIGIBLE",
        reasons: [`${politicianId} may not file while holding ${kind}`],
        deferred,
      };
    }
  }

  deferred.push("citizenship", "residency", "legal_disqualification");
  return { eligible: true, code: null, reasons: [], deferred };
}
