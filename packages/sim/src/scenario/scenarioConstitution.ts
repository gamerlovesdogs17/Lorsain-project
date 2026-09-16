import type { IdeologyAxis } from "../agents/types.js";
import { IDEOLOGY_AXES } from "../agents/types.js";
import type { ConstitutionalOrderState } from "../provinces/constitutionalOrder.js";
import {
  AMENDMENT_PROCESS_MODES,
  ASSEMBLY_ELECTION_MODES,
  CIVIL_LIBERTY_MODES,
  EMERGENCY_POWER_MODES,
  ENTRENCHMENT_MODES,
  EXECUTIVE_AUTHORITY_MODES,
  JUDICIAL_REVIEW_MODES,
  PARTY_SYSTEM_MODES,
  PRESIDENTIAL_ELECTION_MODES,
  PROVINCIAL_COMPETENCE_MODES,
  TREATY_APPROVAL_MODES,
} from "../provinces/constitutionalOrder.js";
import type { ScenarioDocument } from "@lorsain/scenario";
import { isOptionId, PARTY_IDEOLOGY_FAMILIES } from "@lorsain/scenario";

type IdeologyVector = Record<IdeologyAxis, number>;

const FAMILY_BASELINES: Record<string, Partial<Record<IdeologyAxis, number>>> = {
  centre: {
    economic: 0.5,
    social: 0.5,
    authority: 0.45,
    green: 0.45,
    nationalism: 0.4,
    globalism: 0.5,
  },
  liberal: {
    economic: 0.62,
    social: 0.68,
    authority: 0.35,
    green: 0.5,
    nationalism: 0.3,
    globalism: 0.65,
  },
  conservative: {
    economic: 0.58,
    social: 0.32,
    authority: 0.62,
    green: 0.35,
    nationalism: 0.55,
    globalism: 0.35,
  },
  "social-democratic": {
    economic: 0.32,
    social: 0.62,
    authority: 0.42,
    green: 0.55,
    nationalism: 0.35,
    globalism: 0.55,
  },
  green: {
    economic: 0.4,
    social: 0.65,
    authority: 0.38,
    green: 0.82,
    nationalism: 0.3,
    globalism: 0.6,
  },
  nationalist: {
    economic: 0.48,
    social: 0.4,
    authority: 0.6,
    green: 0.35,
    nationalism: 0.78,
    globalism: 0.25,
  },
  "market-reform": {
    economic: 0.78,
    social: 0.55,
    authority: 0.4,
    green: 0.35,
    nationalism: 0.35,
    globalism: 0.7,
  },
  labour: {
    economic: 0.28,
    social: 0.55,
    authority: 0.48,
    green: 0.45,
    nationalism: 0.4,
    globalism: 0.45,
  },
};

export function ideologyVectorForFamily(family: string | undefined | null): IdeologyVector {
  const base = FAMILY_BASELINES[family ?? ""] ?? FAMILY_BASELINES.centre!;
  const out = {} as IdeologyVector;
  for (const axis of IDEOLOGY_AXES) {
    out[axis] = base[axis] ?? 0.5;
  }
  return out;
}

export function resolveMechanicalIdeologyFamily(party: {
  ideologyFamily?: string;
  ideology?: string;
  ideologyLabel?: string;
}): string {
  const candidates = [party.ideologyFamily, party.ideology, party.ideologyLabel];
  for (const c of candidates) {
    if (c && isOptionId(PARTY_IDEOLOGY_FAMILIES, c)) return c;
  }
  return "centre";
}

function pickMode<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * Build founding constitutional order from scenario constitution/elections sections.
 */
export function constitutionalOrderFromScenario(
  doc: ScenarioDocument,
): Partial<ConstitutionalOrderState> {
  const c = doc.contentSections.constitution ?? {};
  const e = doc.contentSections.elections ?? {};
  const presidential =
    c.presidentialElection ?? e.presidentialElection ?? e.presidentialMode ?? undefined;
  const assembly = c.assemblyElection ?? e.assemblySystem ?? undefined;

  const order: Partial<ConstitutionalOrderState> = {
    partySystem: pickMode(c.partySystem, PARTY_SYSTEM_MODES, "competitive_multiparty"),
    presidentialElection: pickMode(presidential, PRESIDENTIAL_ELECTION_MODES, "national_rcv"),
    assemblyElection: pickMode(assembly, ASSEMBLY_ELECTION_MODES, "stv"),
    judicialReview: pickMode(c.judicialReview, JUDICIAL_REVIEW_MODES, "standard_review"),
    provincialCompetence: pickMode(
      c.provincialCompetence,
      PROVINCIAL_COMPETENCE_MODES,
      "concurrent_powers",
    ),
    emergencyPowers: pickMode(c.emergencyPowers, EMERGENCY_POWER_MODES, "standard_emergency"),
    treatyApproval: pickMode(c.treatyApproval, TREATY_APPROVAL_MODES, "assembly_ratification"),
    amendmentProcess: pickMode(
      c.amendmentProcess,
      AMENDMENT_PROCESS_MODES,
      "assembly_two_thirds_plus_13_provinces",
    ),
    entrenchment: pickMode(c.entrenchment, ENTRENCHMENT_MODES, "none"),
    civilLiberties: pickMode(c.civilLiberties, CIVIL_LIBERTY_MODES, "standard_charter"),
    executiveAuthority: pickMode(
      c.executiveAuthority,
      EXECUTIVE_AUTHORITY_MODES,
      "constrained_dual_mandate",
    ),
    cabinetFormation: pickMode(
      c.cabinetFormation,
      ["presidential_choice", "assembly_confidence", "party_slate"] as const,
      "presidential_choice",
    ),
    republicForm: pickMode(
      c.republicForm,
      ["democratic_republic", "peoples_republic", "unitary_party_republic"] as const,
      "democratic_republic",
    ),
    citizenshipGuard: pickMode(
      c.citizenshipGuard,
      ["equal_citizenship", "duty_conditioned_citizenship"] as const,
      "equal_citizenship",
    ),
    pressFreedom: pickMode(
      c.pressFreedom,
      ["free_press", "licensed_press", "state_media_priority"] as const,
      "free_press",
    ),
    localGovernment: pickMode(
      c.localGovernment,
      ["provincial_primary", "shared", "nationally_directed"] as const,
      "provincial_primary",
    ),
    defenseControl: pickMode(
      c.defenseControl,
      ["civil_supremacy", "joint_command", "executive_command"] as const,
      "civil_supremacy",
    ),
  };

  if (order.partySystem === "single_legal_party") {
    order.soleLegalPartyId = c.soleLegalPartyId ?? doc.contentSections.parties?.[0]?.id ?? null;
  } else {
    order.soleLegalPartyId = null;
  }

  // Parliamentary quick preset defaults cabinet to assembly confidence when unset.
  if (!c.cabinetFormation && c.governmentForm === "parliamentary") {
    order.cabinetFormation = "assembly_confidence";
  }
  if (!c.presidentialElection && !e.presidentialElection && !e.presidentialMode) {
    if (c.governmentForm === "parliamentary") order.presidentialElection = "assembly_selection";
  }

  return order;
}
