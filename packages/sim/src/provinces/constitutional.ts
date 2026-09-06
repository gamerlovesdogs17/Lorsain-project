import { addMonths, compareIsoDate } from "../calendar.js";
import { getAgentProfile } from "../agents/profile.js";
import { currentAssemblyMemberIds, currentPresidentId } from "../legislature/state.js";
import { pushHistory } from "../scheduler.js";
import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import type {
  ConstitutionalAmendment,
  ConstitutionalAmendmentIntent,
  ConstitutionalRuleId,
  ProvincialVote,
} from "./types.js";
import { CONSTITUTIONAL_RULE_IDS } from "./types.js";
import { provincialLegislatorForPolitician } from "./assemblies.js";
import { constitutionAlternativeFor } from "./constitutionAlternatives.js";
import {
  constitutionAlternative,
  constitutionSubjectById,
  CONSTITUTION_CHANGE_SUBJECTS,
} from "./constitutionChanges.js";
import {
  amendmentThresholds,
  emptyConstitutionalOrder,
  isEntrenchedArticle,
} from "./constitutionalOrder.js";
import {
  applyAlternativeGameplayEffects,
  referendumRequiredForAmendments,
  ensureOrder,
} from "./constitutionGameplay.js";
import type { ConstitutionalPackageChange } from "./types.js";

/**
 * Legal values for each constitutional rule. Expanding each rule to 4 alternatives
 * (Phase 11.4). These are the only values accepted by `proposeConstitutionalAmendment`.
 *
 * Special encoding:
 *   presidential_term_limit === 0  →  no term limit (unlimited re-elections permitted).
 *   All eligibility logic must treat 0 as unlimited — see packages/sim/src/parties/eligibility.ts.
 */
export const CONSTITUTIONAL_LEGAL_VALUES: Record<ConstitutionalRuleId, readonly number[]> = {
  /** 3 | 4 | 5 | 6 year terms for the National Assembly */
  assembly_term_years: [3, 4, 5, 6],
  /**
   * 1 | 2 | 3 elected terms, or 0 (no limit).
   * Value 0 means presidential term limit is abolished; eligibility must skip the term-count check.
   */
  presidential_term_limit: [1, 2, 3, 0],
  /** 6 | 9 | 12 | 15 year non-renewable terms for Constitutional Court justices */
  court_term_years: [6, 9, 12, 15],
  /** 0.55 | 0.6 | 2/3 | 0.75 supermajority required to override a presidential veto */
  veto_override_fraction: [0.55, 0.6, 2 / 3, 0.75],
};

/** @internal Module-level alias so existing private code reads clearly. */
const LEGAL_VALUES = CONSTITUTIONAL_LEGAL_VALUES;

const INTENT_POLITICS: Record<
  ConstitutionalAmendmentIntent,
  {
    axis: "economic" | "social" | "authority" | "globalism";
    direction: number;
    difficulty: number;
    label: string;
  }
> = {
  technical_clarification: {
    axis: "authority",
    direction: 0,
    difficulty: 0.28,
    label: "Technical clarification",
  },
  expand_individual_rights: {
    axis: "social",
    direction: 1,
    difficulty: 0.62,
    label: "Expand individual rights",
  },
  restrict_individual_rights: {
    axis: "social",
    direction: -1,
    difficulty: 0.9,
    label: "Restrict individual rights",
  },
  devolve_national_power: {
    axis: "authority",
    direction: -1,
    difficulty: 0.64,
    label: "Devolve national power",
  },
  centralize_national_power: {
    axis: "authority",
    direction: 1,
    difficulty: 0.7,
    label: "Centralize national power",
  },
  strengthen_executive: {
    axis: "authority",
    direction: 1,
    difficulty: 0.76,
    label: "Strengthen the executive",
  },
  constrain_executive: {
    axis: "authority",
    direction: -1,
    difficulty: 0.62,
    label: "Constrain the executive",
  },
  reform_elections: {
    axis: "authority",
    direction: -0.25,
    difficulty: 0.72,
    label: "Reform elections",
  },
  alter_office_terms: {
    axis: "authority",
    direction: 0,
    difficulty: 0.68,
    label: "Alter office terms",
  },
  judicial_structure: {
    axis: "authority",
    direction: -0.1,
    difficulty: 0.74,
    label: "Change judicial structure",
  },
};

function ruleIntent(
  state: SimState,
  ruleId: ConstitutionalRuleId,
  proposedValue: number,
): ConstitutionalAmendmentIntent {
  if (ruleId === "veto_override_fraction") {
    const current = state.provincialRuntime.constitutionalRules[ruleId]?.value ?? proposedValue;
    return proposedValue > current ? "strengthen_executive" : "constrain_executive";
  }
  return ruleId === "court_term_years" ? "judicial_structure" : "alter_office_terms";
}

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function isFederalMp(world: KernelWorld, state: SimState, id: string): boolean {
  return currentAssemblyMemberIds(world, state).includes(id);
}

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function titleFor(state: SimState, ruleId: ConstitutionalRuleId): string {
  const label =
    state.provincialRuntime.constitutionalRules[ruleId]?.label ?? ruleId.replace(/_/g, " ");
  return `${label} Amendment`;
}

function documentClause(world: KernelWorld, clauseId: string) {
  for (const article of world.constitutionalDocument?.articles ?? []) {
    for (const section of article.sections) {
      const clause = section.clauses.find((row) => row.id === clauseId);
      if (clause) return { article, section, clause };
    }
  }
  return null;
}

export function currentConstitutionalClauseText(
  world: KernelWorld,
  state: SimState,
  clauseId: string,
): string | null {
  const orderText = state.provincialRuntime.constitutionalOrder?.clauseTexts?.[clauseId];
  if (typeof orderText === "string" && orderText.trim()) return orderText;
  const canonical = documentClause(world, clauseId)?.clause.text ?? null;
  return (
    Object.values(state.provincialRuntime.constitutionalAmendments)
      .filter(
        (amendment) =>
          amendment.status === "ratified" &&
          ((amendment.documentClauseId === clauseId &&
            typeof amendment.proposedText === "string") ||
            amendment.packageChanges?.some(
              (change) => change.clauseId === clauseId && typeof change.proposedText === "string",
            )),
      )
      .sort(
        (a, b) =>
          (b.enactedDate ?? b.proposedDate).localeCompare(a.enactedDate ?? a.proposedDate) ||
          b.id.localeCompare(a.id),
      )
      .flatMap((amendment) => {
        if (amendment.documentClauseId === clauseId && amendment.proposedText)
          return [amendment.proposedText];
        return (
          amendment.packageChanges
            ?.filter((change) => change.clauseId === clauseId)
            .map((change) => change.proposedText) ?? []
        );
      })[0] ?? canonical
  );
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function monthNumber(date: string): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

function monthsSince(currentDate: string, earlierDate: string): number {
  return monthNumber(currentDate) - monthNumber(earlierDate);
}

function amendmentDirection(
  state: SimState,
  ruleId: ConstitutionalRuleId,
  proposedValue: number,
): number {
  const current = state.provincialRuntime.constitutionalRules[ruleId]?.value ?? proposedValue;
  const values = LEGAL_VALUES[ruleId];
  // presidential_term_limit uses 0 to encode "no term limit" (unlimited re-elections).
  // Exclude 0 from the ordinal span so that proposing 1/2/3 terms preserves its
  // directional magnitude relative to the pre-Phase-11.4 behaviour.
  const spanValues = ruleId === "presidential_term_limit" ? values.filter((v) => v !== 0) : values;
  const span = Math.max(...spanValues) - Math.min(...spanValues);
  return span === 0 ? 0 : clamp((proposedValue - current) / span, -1, 1);
}

type ProposalContext = {
  score: number;
  trigger: Exclude<
    ConstitutionalAmendment["proposalTrigger"],
    "player_sponsorship" | "legacy_proposal"
  >;
};

/** Political demand for a specific rule change. This is pure and consumes no gameplay RNG. */
export function constitutionalProposalImpetus(
  world: KernelWorld,
  state: SimState,
  ruleId: ConstitutionalRuleId,
  proposedValue: number,
): ProposalContext {
  const direction = amendmentDirection(state, ruleId, proposedValue);
  const presidentId = currentPresidentId(world, state);
  const presidentStanding = presidentId
    ? (state.candidateStanding[presidentId]?.favorability ?? 0)
    : 0;
  const presidentTerms = presidentId
    ? (state.presidential.electedTermCountByPolitician[presidentId] ?? 0)
    : 0;
  const averageCohesion =
    Object.values(state.partyStates).length > 0
      ? Object.values(state.partyStates).reduce((sum, party) => sum + party.cohesion, 0) /
        Object.values(state.partyStates).length
      : 0.65;
  const confidenceStress = clamp((96 - state.economyRuntime.national.confidenceIndex) / 18);
  const recentAssemblyElection = Object.values(state.elections).some(
    (election) =>
      election.type === "assembly" &&
      election.status === "resolved" &&
      monthsSince(state.currentDate, election.date) <= 12,
  );
  const recentReturns = Object.values(state.legislatureRuntime.bills).filter(
    (bill) =>
      bill.presidentialDisposition === "returned" &&
      bill.introducedDate &&
      monthsSince(state.currentDate, bill.introducedDate) <= 36,
  ).length;
  const recentCourtCases = Object.values(state.constitutionalRuntime.courtCases).filter(
    (courtCase) => monthsSince(state.currentDate, courtCase.filedDate) <= 48,
  ).length;
  const recentCourtCrisis =
    Object.values(state.constitutionalRuntime.impeachments).some(
      (row) => monthsSince(state.currentDate, row.introducedDate) <= 48,
    ) ||
    Object.values(state.constitutionalRuntime.recalls).some(
      (row) => monthsSince(state.currentDate, row.introducedDate) <= 48,
    );
  const activeJudges = Object.values(state.officeTerms).filter(
    (term) =>
      term.status === "active" &&
      world.offices[term.officeId]?.kind === "constitutional_court_justice",
  ).length;
  const courtVacancyShare = clamp(
    (world.courtConstitution.judges - activeJudges) / Math.max(1, world.courtConstitution.judges),
  );

  // Phase 11.3 closeout: modest base/stress lift so realistic reform pressure can
  // clear the NPC sponsorship gate without inventing proposal quotas.
  let score = 0.12 + confidenceStress * 0.1 + clamp((0.62 - averageCohesion) / 0.3) * 0.14;
  let trigger: ProposalContext["trigger"] = "reform_movement";
  if (ruleId === "assembly_term_years") {
    score += (recentAssemblyElection ? 0.24 : 0) + clamp((0.58 - averageCohesion) / 0.28) * 0.26;
    score += direction < 0 && averageCohesion < 0.52 ? 0.1 : 0;
    trigger = recentAssemblyElection ? "election_mandate" : "institutional_conflict";
  } else if (ruleId === "presidential_term_limit") {
    score +=
      clamp(
        presidentTerms /
          Math.max(
            1,
            state.provincialRuntime.constitutionalRules.presidential_term_limit?.value ?? 2,
          ),
      ) * 0.24;
    score += Math.abs(presidentStanding) * 0.18 + (recentCourtCrisis ? 0.24 : 0);
    score += direction * presidentStanding > 0 ? 0.1 : 0;
    trigger = recentCourtCrisis
      ? "institutional_conflict"
      : recentAssemblyElection
        ? "election_mandate"
        : "reform_movement";
  } else if (ruleId === "court_term_years") {
    score +=
      courtVacancyShare * 0.38 +
      clamp(recentCourtCases / 8) * 0.22 +
      (recentCourtCrisis ? 0.24 : 0);
    score += direction > 0 && courtVacancyShare > 0 ? 0.1 : 0;
    trigger =
      recentCourtCrisis || courtVacancyShare > 0.2 ? "court_crisis" : "institutional_conflict";
  } else {
    score +=
      clamp(recentReturns / 4) * 0.5 + (recentAssemblyElection && recentReturns > 0 ? 0.14 : 0);
    score += direction < 0 && recentReturns >= 2 ? 0.12 : 0;
    trigger = recentReturns > 0 ? "executive_legislative_conflict" : "institutional_conflict";
  }
  return { score: clamp(score), trigger };
}

/** Monthly NPC sponsorship probability once impetus clears the score gate. Documented closeout tune — not a quota. */
export function npcConstitutionalSponsorshipChance(score: number): number {
  return clamp((score - 0.36) * 0.09, 0, 0.045);
}

/** Minimum politicalImpetus before NPCs may attempt sponsorship in a quiet month. */
export const NPC_CONSTITUTIONAL_SPONSORSHIP_SCORE_GATE = 0.4;

/** Political support for the actual amendment; hash contributes only bounded final variance. */
export function constitutionalSupportScore(
  world: KernelWorld,
  state: SimState,
  amendment: ConstitutionalAmendment,
  memberId: string,
  provinceId: string | null = null,
): number {
  const profile = getAgentProfile(world, state, memberId);
  const provincialMember = state.provincialRuntime.legislators[memberId];
  const partyId = state.politicians[memberId]?.partyId ?? provincialMember?.partyId ?? null;
  const sponsorPartyId = state.politicians[amendment.sponsorId]?.partyId ?? null;
  const intentPolitics = INTENT_POLITICS[amendment.intent];
  const axis =
    amendment.ruleId === "assembly_term_years" || amendment.ruleId === "court_term_years"
      ? "authority"
      : amendment.ruleId === "presidential_term_limit" ||
          amendment.ruleId === "veto_override_fraction"
        ? "authority"
        : intentPolitics.axis;
  const ideology =
    profile?.ideology[axis] ?? (partyId ? (world.partyPublicIdeology[partyId]?.[axis] ?? 0) : 0);
  const direction =
    amendment.ruleId && amendment.proposedValue != null
      ? amendmentDirection(state, amendment.ruleId, amendment.proposedValue)
      : intentPolitics.direction;
  const loyalty =
    profile?.traits.partyLoyalty ??
    0.45 + (stableHash(`${memberId}:constitutional-loyalty`) % 41) / 100;
  const institutionalism = profile?.traits.institutionalism ?? 0.52;
  const presidentId = currentPresidentId(world, state);
  const presidentPartyId = presidentId ? (state.politicians[presidentId]?.partyId ?? null) : null;
  let institutionalInterest = 0;
  if (
    amendment.ruleId === "presidential_term_limit" ||
    amendment.ruleId === "veto_override_fraction"
  ) {
    const alignedWithPresident =
      partyId && presidentPartyId && partyId === presidentPartyId ? 1 : -1;
    institutionalInterest = alignedWithPresident * direction * 0.22;
  } else if (amendment.ruleId === "assembly_term_years") {
    institutionalInterest = direction * (profile?.traits.ambition ?? 0.5) * 0.1;
  } else if (amendment.ruleId === "court_term_years") {
    institutionalInterest = direction * institutionalism * 0.1;
  }
  let provinceInterest = 0;
  if (provinceId) {
    const governorId = Object.values(state.officeTerms).find(
      (term) =>
        term.status === "active" &&
        world.offices[term.officeId]?.kind === "governor" &&
        world.offices[term.officeId]?.provinceId === provinceId,
    )?.holderId;
    const governorPartyId = governorId ? (state.politicians[governorId]?.partyId ?? null) : null;
    if (
      amendment.ruleId === "presidential_term_limit" ||
      amendment.ruleId === "veto_override_fraction"
    ) {
      provinceInterest +=
        governorPartyId && presidentPartyId && governorPartyId === presidentPartyId
          ? direction * 0.13
          : -direction * 0.1;
    }
    const governance = state.provincialRuntime.provinces[provinceId];
    if (amendment.ruleId === "veto_override_fraction")
      provinceInterest += -(governance?.federalRelationship ?? 0) * direction * 0.12;
    if (amendment.ruleId === "assembly_term_years")
      provinceInterest += (governance?.politicalCapital ?? 0.5) < 0.35 ? -direction * 0.08 : 0;
  }
  const sponsorCoalition =
    partyId && sponsorPartyId && partyId === sponsorPartyId ? 0.2 * loyalty : 0;
  const textualResistance =
    amendment.ruleId == null ? ((amendment.politicalDifficulty ?? 0.6) - 0.45) * 0.75 : 0;
  const reformConsensus = (amendment.politicalImpetus - 0.5) * 0.72 - textualResistance;
  const statusQuo = (institutionalism - 0.5) * (amendment.politicalImpetus < 0.58 ? -0.18 : 0.08);
  const noise =
    ((stableHash(`${amendment.id}:${provinceId ?? "federal"}:${memberId}:vote`) % 1001) - 500) /
    12500;
  return (
    ideology * direction * 0.34 +
    sponsorCoalition +
    reformConsensus +
    statusQuo +
    institutionalInterest +
    provinceInterest +
    noise
  );
}

export function proposeConstitutionalAmendment(
  world: KernelWorld,
  state: SimState,
  actorId: string,
  ruleId: ConstitutionalRuleId,
  proposedValue: number,
  commandId: string | null,
  politicalContext?: ProposalContext,
): { amendment: ConstitutionalAmendment; events: SimEvent[] } | { error: CommandError } {
  if (!isFederalMp(world, state, actorId)) return { error: reject("NOT_ASSEMBLY_MEMBER", actorId) };
  if (!LEGAL_VALUES[ruleId]?.some((value) => Math.abs(value - proposedValue) < 0.000001)) {
    return { error: reject("INVALID_CONSTITUTIONAL_VALUE", `${ruleId}:${proposedValue}`) };
  }
  const current = state.provincialRuntime.constitutionalRules[ruleId];
  if (!current) return { error: reject("UNKNOWN_CONSTITUTIONAL_RULE", ruleId) };
  if (Math.abs(current.value - proposedValue) < 0.000001)
    return { error: reject("NO_POLICY_CHANGE", ruleId) };
  const open = Object.values(state.provincialRuntime.constitutionalAmendments).some(
    (amendment) =>
      amendment.ruleId === ruleId && ["proposed", "ratifying"].includes(amendment.status),
  );
  if (open) return { error: reject("AMENDMENT_ALREADY_PENDING", ruleId) };
  const id = `CAMEND_${String(Object.keys(state.provincialRuntime.constitutionalAmendments).length + 1).padStart(4, "0")}`;
  // Look up the structured alternative so the amendment carries the canonical clause text
  // alongside the numeric rule change (text and rule stay unified — Phase 11.4).
  const alternative = constitutionAlternativeFor(ruleId, proposedValue);
  const amendment: ConstitutionalAmendment = {
    id,
    title: titleFor(state, ruleId),
    summary: `Changes ${current.label.toLowerCase()} from ${current.value} to ${proposedValue}.`,
    sponsorId: actorId,
    proposedDate: state.currentDate,
    ruleId,
    proposedValue,
    ...(alternative ? { proposedText: alternative.proposedClauseText } : {}),
    intent: ruleIntent(state, ruleId, proposedValue),
    runtimeEffect: "modeled_rule",
    proposalTrigger:
      politicalContext?.trigger ??
      (actorId === state.playerPoliticianId ? "player_sponsorship" : "reform_movement"),
    politicalImpetus:
      politicalContext?.score ??
      constitutionalProposalImpetus(world, state, ruleId, proposedValue).score,
    status: "proposed",
    assemblyVoteId: null,
    assemblyVotes: {},
    assemblyYes: 0,
    ratificationDeadline: null,
    provincialVoteIds: {},
    ratifiedProvinceIds: [],
    rejectedProvinceIds: [],
    enactedDate: null,
  };
  state.provincialRuntime.constitutionalAmendments[id] = amendment;
  return {
    amendment,
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "CONSTITUTIONAL_AMENDMENT_PROPOSED",
        importance: 0.86,
        visibility: "public",
        actorIds: [actorId],
        entityIds: [id, ruleId],
        payload: {
          amendmentId: id,
          ruleId,
          proposedValue,
          trigger: amendment.proposalTrigger,
          politicalImpetus: Math.round(amendment.politicalImpetus * 100) / 100,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function proposeConstitutionalTextAmendment(
  _world: KernelWorld,
  _state: SimState,
  _actorId: string,
  _clauseId: string,
  _proposedText: string,
  _intent: ConstitutionalAmendmentIntent,
  _commandId: string | null,
): { amendment: ConstitutionalAmendment; events: SimEvent[] } | { error: CommandError } {
  return {
    error: reject(
      "STRUCTURED_CONSTITUTIONAL_AMENDMENT_REQUIRED",
      "Constitutional text must be amended through structured alternatives with gameplay effects.",
    ),
  };
}

export function proposeConstitutionalPackage(
  world: KernelWorld,
  state: SimState,
  actorId: string,
  changes: ReadonlyArray<{
    subjectId: string;
    alternativeId: string;
    designatedPartyId?: string | null;
  }>,
  commandId: string | null,
): { amendment: ConstitutionalAmendment; events: SimEvent[] } | { error: CommandError } {
  if (!isFederalMp(world, state, actorId)) return { error: reject("NOT_ASSEMBLY_MEMBER", actorId) };
  if (changes.length < 1 || changes.length > 8) {
    return { error: reject("INVALID_AMENDMENT_PACKAGE", "package must contain 1–8 changes") };
  }
  const packageChanges: ConstitutionalPackageChange[] = [];
  const seenSubjects = new Set<string>();
  const order = ensureOrder(state);
  for (const change of changes) {
    if (seenSubjects.has(change.subjectId)) {
      return { error: reject("DUPLICATE_AMENDMENT_SUBJECT", change.subjectId) };
    }
    seenSubjects.add(change.subjectId);
    const subject = constitutionSubjectById(change.subjectId);
    if (!subject) return { error: reject("UNKNOWN_AMENDMENT_SUBJECT", change.subjectId) };
    // B: hard_core entrenchment — block proposals targeting protected core articles
    if (order.entrenchment === "hard_core" && isEntrenchedArticle(subject.articleId)) {
      return {
        error: reject(
          "ENTRENCHED_ARTICLE_BLOCKED",
          `Entrenchment (hard_core) prohibits amending ${subject.articleId} (${subject.subject}). These provisions are constitutionally unamendable.`,
        ),
      };
    }
    const alt = constitutionAlternative(change.subjectId, change.alternativeId);
    if (!alt) return { error: reject("UNKNOWN_AMENDMENT_ALTERNATIVE", change.alternativeId) };
    const currentText =
      currentConstitutionalClauseText(world, state, subject.targetClauseId) ??
      documentClause(world, subject.targetClauseId)?.clause.text ??
      "";
    // Current constitution is baseline — proposing identical text is not an amendment.
    // Restoring founding text after a prior amendment is a valid change.
    if (alt.proposedClauseText === currentText) {
      return { error: reject("NO_POLICY_CHANGE", change.subjectId) };
    }
    if (alt.orderPatch?.partySystem === "single_legal_party") {
      const designated = change.designatedPartyId?.trim() || null;
      if (!designated) {
        return {
          error: reject(
            "DESIGNATED_PARTY_REQUIRED",
            "single_legal_party requires designatedPartyId",
          ),
        };
      }
      const knownParty =
        Boolean(world.partyDefinitions[designated]) ||
        Boolean(state.dynamicParties?.[designated]) ||
        Boolean(state.partyStates[designated]);
      if (!knownParty) {
        return { error: reject("UNKNOWN_PARTY", designated) };
      }
    }
    packageChanges.push({
      subjectId: subject.id,
      alternativeId: alt.id,
      clauseId: subject.targetClauseId,
      currentText,
      proposedText: alt.proposedClauseText,
      ...(alt.orderPatch?.partySystem === "single_legal_party"
        ? { designatedPartyId: change.designatedPartyId!.trim() }
        : {}),
    });
  }
  const open = Object.values(state.provincialRuntime.constitutionalAmendments).some((amendment) =>
    ["proposed", "ratifying"].includes(amendment.status),
  );
  if (open) return { error: reject("AMENDMENT_ALREADY_PENDING", "package") };
  const id = `CAMEND_${String(Object.keys(state.provincialRuntime.constitutionalAmendments).length + 1).padStart(4, "0")}`;
  const titles = packageChanges.map((change) => {
    const subject = constitutionSubjectById(change.subjectId)!;
    const alt = constitutionAlternative(change.subjectId, change.alternativeId)!;
    return `${subject.subject}: ${alt.label}`;
  });
  const primary = packageChanges[0]!;
  const primaryAlt = constitutionAlternative(primary.subjectId, primary.alternativeId)!;
  const primaryRule = primaryAlt.rulePatch
    ? (Object.keys(primaryAlt.rulePatch)[0] as ConstitutionalRuleId | undefined)
    : undefined;
  const amendment: ConstitutionalAmendment = {
    id,
    title:
      packageChanges.length === 1
        ? titles[0]!
        : `Constitutional package (${packageChanges.length} changes)`,
    summary: titles.join("; "),
    sponsorId: actorId,
    proposedDate: state.currentDate,
    ruleId: primaryRule ?? null,
    proposedValue:
      primaryRule && primaryAlt.rulePatch?.[primaryRule] != null
        ? primaryAlt.rulePatch[primaryRule]!
        : null,
    documentClauseId: primary.clauseId,
    currentText: primary.currentText,
    proposedText: primary.proposedText,
    packageChanges,
    intent: "alter_office_terms",
    runtimeEffect: "modeled_rule",
    politicalDifficulty: 0.72,
    proposalTrigger:
      actorId === state.playerPoliticianId ? "player_sponsorship" : "reform_movement",
    politicalImpetus: 0.55,
    status: "proposed",
    assemblyVoteId: null,
    assemblyVotes: {},
    assemblyYes: 0,
    ratificationDeadline: null,
    provincialVoteIds: {},
    ratifiedProvinceIds: [],
    rejectedProvinceIds: [],
    enactedDate: null,
  };
  state.provincialRuntime.constitutionalAmendments[id] = amendment;
  return {
    amendment,
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "CONSTITUTIONAL_AMENDMENT_PROPOSED",
        importance: 0.9,
        visibility: "public",
        actorIds: [actorId],
        entityIds: [id, ...packageChanges.map((change) => change.clauseId)],
        payload: {
          amendmentId: id,
          packageSize: packageChanges.length,
          subjects: packageChanges.map((change) => change.subjectId),
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

function ensureConstitutionalOrder(state: SimState) {
  if (!state.provincialRuntime.constitutionalOrder) {
    state.provincialRuntime.constitutionalOrder = emptyConstitutionalOrder();
  }
  return state.provincialRuntime.constitutionalOrder;
}

export function applyRatifiedAmendmentEffects(
  state: SimState,
  amendment: ConstitutionalAmendment,
): void {
  const order = ensureConstitutionalOrder(state);
  if (amendment.ruleId && amendment.proposedValue != null) {
    const rule = state.provincialRuntime.constitutionalRules[amendment.ruleId];
    if (rule) {
      rule.value = amendment.proposedValue;
      rule.amendedDate = state.currentDate;
      rule.sourceAmendmentId = amendment.id;
    }
  }
  if (amendment.documentClauseId && amendment.proposedText) {
    order.clauseTexts[amendment.documentClauseId] = amendment.proposedText;
  }
  for (const change of amendment.packageChanges ?? []) {
    order.clauseTexts[change.clauseId] = change.proposedText;
    const alt = constitutionAlternative(change.subjectId, change.alternativeId);
    if (!alt) continue;
    if (alt.orderPatch) Object.assign(order, alt.orderPatch);
    if (alt.rulePatch) {
      for (const [ruleId, value] of Object.entries(alt.rulePatch) as Array<
        [ConstitutionalRuleId, number]
      >) {
        const rule = state.provincialRuntime.constitutionalRules[ruleId];
        if (rule && typeof value === "number") {
          rule.value = value;
          rule.amendedDate = state.currentDate;
          rule.sourceAmendmentId = amendment.id;
        }
      }
    }
    applyAlternativeGameplayEffects(state, alt);
    if (alt.orderPatch?.partySystem === "single_legal_party") {
      const designated = change.designatedPartyId?.trim() || null;
      order.soleLegalPartyId = designated;
    }
    if (alt.orderPatch?.cabinetFormation === "presidential_choice") {
      order.cabinetHasAssemblyConfidence = false;
      order.cabinetNeedsConfidence = false;
    }
  }
  if (order.partySystem !== "single_legal_party") {
    order.soleLegalPartyId = null;
  }
  order.lastAmendedDate = state.currentDate;
}

export function assemblyVotesRequired(state: SimState, coreArticle = false): number {
  const { assemblyFraction } = amendmentThresholds(ensureConstitutionalOrder(state), coreArticle);
  return Math.ceil(420 * assemblyFraction);
}

export function provincesRequiredForRatification(state: SimState): number {
  return amendmentThresholds(ensureConstitutionalOrder(state)).provincesRequired;
}

export function castConstitutionalAssemblyVote(
  world: KernelWorld,
  state: SimState,
  actorId: string,
  amendmentId: string,
  choice: "yes" | "no" | "abstain",
): { error?: CommandError } {
  if (actorId !== state.playerPoliticianId)
    return { error: reject("PLAYER_AUTONOMY", "Only the player stores their constitutional vote") };
  if (!isFederalMp(world, state, actorId)) return { error: reject("NOT_ASSEMBLY_MEMBER", actorId) };
  const amendment = state.provincialRuntime.constitutionalAmendments[amendmentId];
  if (!amendment || amendment.status !== "proposed")
    return { error: reject("AMENDMENT_NOT_PENDING", amendmentId) };
  amendment.assemblyVotes[actorId] = choice;
  return {};
}

export function castConstitutionalRatificationVote(
  state: SimState,
  actorId: string,
  amendmentId: string,
  choice: "yes" | "no" | "abstain",
): { error?: CommandError } {
  if (actorId !== state.playerPoliticianId)
    return { error: reject("PLAYER_AUTONOMY", "Only the player stores their ratification vote") };
  const amendment = state.provincialRuntime.constitutionalAmendments[amendmentId];
  if (!amendment || amendment.status !== "ratifying")
    return { error: reject("AMENDMENT_NOT_RATIFYING", amendmentId) };
  const row = provincialLegislatorForPolitician(state, actorId);
  if (!row || row.serviceEndDate != null)
    return { error: reject("NOT_PROVINCIAL_LEGISLATOR", actorId) };
  const memberId = row.id;
  const assembly = state.provincialRuntime.assemblies[row.provinceId];
  if (!assembly?.memberIds.includes(memberId))
    return { error: reject("NOT_PROVINCIAL_LEGISLATOR", actorId) };
  const key = `pending:${amendmentId}:${row.provinceId}:${memberId}`;
  state.provincialRuntime.votes[key] = {
    id: key,
    provinceId: row.provinceId,
    subjectKind: "constitutional_ratification",
    subjectId: amendmentId,
    date: state.currentDate,
    votes: { [memberId]: choice },
    yes: choice === "yes" ? 1 : 0,
    no: choice === "no" ? 1 : 0,
    abstain: choice === "abstain" ? 1 : 0,
    passed: false,
  };
  return {};
}

function federalVote(
  world: KernelWorld,
  state: SimState,
  amendment: ConstitutionalAmendment,
): void {
  const members = currentAssemblyMemberIds(world, state);
  let yes = 0;
  for (const id of members) {
    let choice = amendment.assemblyVotes[id];
    if (!choice) {
      if (id === state.playerPoliticianId) choice = "abstain";
      else {
        const score = constitutionalSupportScore(world, state, amendment, id);
        choice = score >= 0.045 ? "yes" : score <= -0.055 ? "no" : "abstain";
      }
      amendment.assemblyVotes[id] = choice;
    }
    if (choice === "yes") yes += 1;
  }
  amendment.assemblyYes = yes;
  amendment.assemblyVoteId = `CAVOTE_${amendment.id}`;
  // Determine if any package change targets a core entrenched article
  const packageTouchesCore = (amendment.packageChanges ?? []).some((c) => {
    const subject = constitutionSubjectById(c.subjectId);
    return subject && isEntrenchedArticle(subject.articleId);
  });
  const documentTouchesCore = amendment.documentClauseId
    ? CONSTITUTION_CHANGE_SUBJECTS.some(
        (subject) =>
          subject.targetClauseId === amendment.documentClauseId &&
          isEntrenchedArticle(subject.articleId),
      )
    : false;
  const touchesCore = packageTouchesCore || documentTouchesCore;
  const required = assemblyVotesRequired(state, touchesCore);
  if (yes >= required) {
    const order = ensureConstitutionalOrder(state);
    // B: election_interlock — core amendments need an intervening election before finalization
    if (touchesCore && order.entrenchment === "election_interlock") {
      amendment.status = "ratifying";
      amendment.ratificationDeadline = null;
      const pending = order.pendingInterlockAmendmentIds ?? [];
      if (!pending.includes(amendment.id)) pending.push(amendment.id);
      order.pendingInterlockAmendmentIds = pending;
    } else {
      const provincesNeeded = provincesRequiredForRatification(state);
      if (
        referendumRequiredForAmendments(state) ||
        (touchesCore && order.entrenchment === "referendum_core")
      ) {
        amendment.status = "ratifying";
        amendment.ratificationDeadline = null;
        const pending = order.pendingReferendumAmendmentIds ?? [];
        if (!pending.includes(amendment.id)) pending.push(amendment.id);
        order.pendingReferendumAmendmentIds = pending;
      } else if (provincesNeeded <= 0) {
        amendment.status = "ratified";
        amendment.enactedDate = state.currentDate;
        applyRatifiedAmendmentEffects(state, amendment);
        amendment.ratificationDeadline = null;
      } else {
        amendment.status = "ratifying";
        amendment.ratificationDeadline = null;
      }
    }
  } else {
    amendment.status = "assembly_failed";
  }
}

function ratificationVote(
  world: KernelWorld,
  state: SimState,
  amendment: ConstitutionalAmendment,
  provinceId: string,
): ProvincialVote | null {
  const assembly = state.provincialRuntime.assemblies[provinceId];
  if (!assembly || assembly.memberIds.length === 0) return null;
  const votes: ProvincialVote["votes"] = {};
  let yes = 0;
  let no = 0;
  let abstain = 0;
  for (const memberId of assembly.memberIds) {
    const pendingKey = `pending:${amendment.id}:${provinceId}:${memberId}`;
    const pending = state.provincialRuntime.votes[pendingKey]?.votes[memberId];
    const score = constitutionalSupportScore(world, state, amendment, memberId, provinceId);
    const choice =
      pending ??
      (memberId === state.playerPoliticianId
        ? "abstain"
        : score >= 0.035
          ? "yes"
          : score <= -0.05
            ? "no"
            : "abstain");
    votes[memberId] = choice;
    if (choice === "yes") yes += 1;
    else if (choice === "no") no += 1;
    else abstain += 1;
    delete state.provincialRuntime.votes[pendingKey];
  }
  const id = `RATIFY_${amendment.id}_${provinceId}`;
  const passed = yes > no;
  const vote: ProvincialVote = {
    id,
    provinceId,
    subjectKind: "constitutional_ratification",
    subjectId: amendment.id,
    date: state.currentDate,
    votes,
    yes,
    no,
    abstain,
    passed,
  };
  state.provincialRuntime.votes[id] = vote;
  return vote;
}

export function processConstitutionalAmendmentsMonth(
  world: KernelWorld,
  state: SimState,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];

  // B: election_interlock — release pending amendments after an intervening national election
  const order = ensureConstitutionalOrder(state);
  const pendingInterlock = order.pendingInterlockAmendmentIds ?? [];
  if (pendingInterlock.length > 0) {
    // Check if a national election (presidential or assembly) resolved after the amendment was proposed
    const electionCompleted = Object.values(state.elections).some(
      (e) =>
        (e.type === "presidential" || e.type === "assembly") &&
        e.status === "resolved" &&
        pendingInterlock.some((aid) => {
          const amendment = state.provincialRuntime.constitutionalAmendments[aid];
          return amendment && e.date > amendment.proposedDate;
        }),
    );
    if (electionCompleted) {
      for (const aid of [...pendingInterlock]) {
        const amendment = state.provincialRuntime.constitutionalAmendments[aid];
        if (!amendment || amendment.status !== "ratifying") continue;
        // Proceed to provincial ratification or referendum
        const provincesNeeded = provincesRequiredForRatification(state);
        if (referendumRequiredForAmendments(state)) {
          const refPending = order.pendingReferendumAmendmentIds ?? [];
          if (!refPending.includes(aid)) refPending.push(aid);
          order.pendingReferendumAmendmentIds = refPending;
        } else if (provincesNeeded <= 0) {
          amendment.status = "ratified";
          amendment.enactedDate = state.currentDate;
          applyRatifiedAmendmentEffects(state, amendment);
          events.push(
            pushHistory(state, {
              date: state.currentDate,
              type: "CONSTITUTIONAL_AMENDMENT_RATIFIED",
              importance: 1,
              visibility: "public",
              actorIds: [amendment.sponsorId],
              entityIds: [amendment.id],
              payload: { amendmentId: amendment.id, stage: "post_election_interlock" },
              sourceScheduledEventId: null,
              sourceCommandId: commandId,
            }),
          );
        }
        // Remove from interlock pending list
        const idx = pendingInterlock.indexOf(aid);
        if (idx >= 0) pendingInterlock.splice(idx, 1);
      }
      order.pendingInterlockAmendmentIds = pendingInterlock;
    }
  }

  const hasOpen = Object.values(state.provincialRuntime.constitutionalAmendments).some(
    (amendment) => ["proposed", "ratifying"].includes(amendment.status),
  );
  const prior = Object.values(state.provincialRuntime.constitutionalAmendments).sort(
    (a, b) => b.proposedDate.localeCompare(a.proposedDate) || b.id.localeCompare(a.id),
  )[0];
  const cooldownSatisfied = !prior || monthsSince(state.currentDate, prior.proposedDate) >= 96;
  if (
    !hasOpen &&
    cooldownSatisfied &&
    monthNumber(state.currentDate) - monthNumber(state.scenarioStartDate) >= 48
  ) {
    const possibilities = CONSTITUTIONAL_RULE_IDS.flatMap((ruleId) => {
      const current = state.provincialRuntime.constitutionalRules[ruleId]?.value;
      return LEGAL_VALUES[ruleId]
        .filter((value) => Math.abs(value - (current ?? value)) > 0.000001)
        .map((proposedValue) => ({
          ruleId,
          proposedValue,
          context: constitutionalProposalImpetus(world, state, ruleId, proposedValue),
        }));
    }).sort(
      (a, b) =>
        b.context.score - a.context.score ||
        a.ruleId.localeCompare(b.ruleId) ||
        a.proposedValue - b.proposedValue,
    );
    const proposal = possibilities[0];
    // Closeout tune (no quotas): gate 0.40 (was 0.48); chance (score-0.36)*0.09
    // capped at 0.045 (was (score-0.44)*0.035 capped 0.018). High-impetus months
    // can sponsor; calm months still usually stay quiet.
    if (proposal && proposal.context.score >= NPC_CONSTITUTIONAL_SPONSORSHIP_SCORE_GATE) {
      const chance = npcConstitutionalSponsorshipChance(proposal.context.score);
      const gate =
        (stableHash(
          `${state.rng.masterSeed}:${state.currentDate}:${proposal.ruleId}:${proposal.proposedValue}:proposal`,
        ) %
          10000) /
        10000;
      if (gate < chance) {
        const draft: ConstitutionalAmendment = {
          id: "PROSPECTIVE",
          title: "Prospective amendment",
          summary: "Prospective amendment",
          sponsorId: "",
          proposedDate: state.currentDate,
          ruleId: proposal.ruleId,
          proposedValue: proposal.proposedValue,
          intent: ruleIntent(state, proposal.ruleId, proposal.proposedValue),
          runtimeEffect: "modeled_rule",
          proposalTrigger: proposal.context.trigger,
          politicalImpetus: proposal.context.score,
          status: "proposed",
          assemblyVoteId: null,
          assemblyVotes: {},
          assemblyYes: 0,
          ratificationDeadline: null,
          provincialVoteIds: {},
          ratifiedProvinceIds: [],
          rejectedProvinceIds: [],
          enactedDate: null,
        };
        const sponsorId = currentAssemblyMemberIds(world, state)
          .filter((id) => id !== state.playerPoliticianId)
          .sort(
            (a, b) =>
              constitutionalSupportScore(world, state, { ...draft, sponsorId: b }, b) -
                constitutionalSupportScore(world, state, { ...draft, sponsorId: a }, a) ||
              a.localeCompare(b),
          )[0];
        if (
          sponsorId &&
          constitutionalSupportScore(world, state, { ...draft, sponsorId }, sponsorId) > 0.05
        ) {
          const proposed = proposeConstitutionalAmendment(
            world,
            state,
            sponsorId,
            proposal.ruleId,
            proposal.proposedValue,
            commandId,
            proposal.context,
          );
          if (!("error" in proposed)) events.push(...proposed.events);
        }
      }
    }
  }
  for (const amendment of Object.values(state.provincialRuntime.constitutionalAmendments).sort(
    (a, b) => a.id.localeCompare(b.id),
  )) {
    if (
      amendment.status === "proposed" &&
      compareIsoDate(state.currentDate, addMonths(amendment.proposedDate, 1)) >= 0
    ) {
      federalVote(world, state, amendment);
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type:
            amendment.assemblyYes >= assemblyVotesRequired(state)
              ? "CONSTITUTIONAL_AMENDMENT_SENT_TO_PROVINCES"
              : "CONSTITUTIONAL_AMENDMENT_FAILED",
          importance: 0.88,
          visibility: "public",
          actorIds: [amendment.sponsorId],
          entityIds: [amendment.id],
          payload: {
            amendmentId: amendment.id,
            assemblyYes: amendment.assemblyYes,
            required: assemblyVotesRequired(state),
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
    if (amendment.status !== "ratifying") continue;
    if (referendumRequiredForAmendments(state) && provincesRequiredForRatification(state) <= 0) {
      if (amendment.referendumHeldDate == null) {
        // National referendum: rough popular support from Assembly yes-share + competition metrics.
        const members = Math.max(1, currentAssemblyMemberIds(world, state).length);
        const yesShare = amendment.assemblyYes / members;
        const competition =
          state.provincialRuntime.constitutionalOrder?.orderMetrics?.politicalCompetition ?? 0;
        const support = Math.max(0.15, Math.min(0.85, yesShare * 0.7 + 0.25 + competition * 0.01));
        const electorate = 10_000_000;
        const turnoutRate = 0.62;
        const totalVoters = Math.round(electorate * turnoutRate);
        amendment.referendumYes = Math.round(totalVoters * support);
        amendment.referendumNo = totalVoters - amendment.referendumYes;
        amendment.referendumHeldDate = state.currentDate;
        const passed = amendment.referendumYes > amendment.referendumNo;
        if (passed) {
          amendment.status = "ratified";
          amendment.enactedDate = state.currentDate;
          applyRatifiedAmendmentEffects(state, amendment);
        } else {
          amendment.status = "failed";
        }
        const yesTotal = amendment.referendumYes;
        const noTotal = amendment.referendumNo;
        const totalCast = yesTotal + noTotal;
        const order = ensureConstitutionalOrder(state);
        order.pendingReferendumAmendmentIds = (order.pendingReferendumAmendmentIds ?? []).filter(
          (id) => id !== amendment.id,
        );
        events.push(
          pushHistory(state, {
            date: state.currentDate,
            type: "REFERENDUM_RESOLVED",
            importance: 1,
            visibility: "public",
            actorIds: [amendment.sponsorId],
            entityIds: [amendment.id],
            payload: {
              amendmentId: amendment.id,
              question: amendment.title,
              yesShare: totalCast > 0 ? Math.round((yesTotal / totalCast) * 10000) / 10000 : 0,
              noShare: totalCast > 0 ? Math.round((noTotal / totalCast) * 10000) / 10000 : 0,
              turnout: Math.round(turnoutRate * 10000) / 10000,
              result: passed ? "passed" : "failed",
              referendumYes: yesTotal,
              referendumNo: noTotal,
              stage: "simplified_national_referendum",
              packageSize: amendment.packageChanges?.length ?? 0,
            },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        );
        events.push(
          pushHistory(state, {
            date: state.currentDate,
            type: passed ? "CONSTITUTIONAL_AMENDMENT_RATIFIED" : "CONSTITUTIONAL_AMENDMENT_FAILED",
            importance: 1,
            visibility: "public",
            actorIds: [amendment.sponsorId],
            entityIds: [amendment.id],
            payload: {
              amendmentId: amendment.id,
              stage: "national_referendum",
              referendumYes: yesTotal,
              referendumNo: noTotal,
              packageSize: amendment.packageChanges?.length ?? 0,
            },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        );
      }
      continue;
    }
    const unvoted = world.provinceIds
      .filter((provinceId) => !amendment.provincialVoteIds[provinceId])
      .sort(
        (a, b) =>
          stableHash(`${amendment.id}:ratification-order:${a}`) -
            stableHash(`${amendment.id}:ratification-order:${b}`) || a.localeCompare(b),
      );
    for (const provinceId of unvoted.slice(0, 3)) {
      const vote = ratificationVote(world, state, amendment, provinceId);
      if (!vote) continue;
      amendment.provincialVoteIds[provinceId] = vote.id;
      (vote.passed ? amendment.ratifiedProvinceIds : amendment.rejectedProvinceIds).push(
        provinceId,
      );
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "CONSTITUTIONAL_AMENDMENT_PROVINCIAL_VOTE",
          importance: 0.5,
          visibility: "public",
          actorIds: [],
          entityIds: [amendment.id, provinceId, vote.id],
          payload: {
            amendmentId: amendment.id,
            provinceId,
            yes: vote.yes,
            no: vote.no,
            abstain: vote.abstain,
            ratified: vote.passed,
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
    const provincesNeeded = provincesRequiredForRatification(state);
    if (provincesNeeded > 0 && amendment.ratifiedProvinceIds.length >= provincesNeeded) {
      amendment.status = "ratified";
      amendment.enactedDate = state.currentDate;
      applyRatifiedAmendmentEffects(state, amendment);
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "CONSTITUTIONAL_AMENDMENT_RATIFIED",
          importance: 1,
          visibility: "public",
          actorIds: [amendment.sponsorId],
          entityIds: [
            amendment.id,
            ...(amendment.ruleId
              ? [amendment.ruleId]
              : amendment.documentClauseId
                ? [amendment.documentClauseId]
                : []),
          ],
          payload: {
            amendmentId: amendment.id,
            ...(amendment.ruleId
              ? { ruleId: amendment.ruleId, value: amendment.proposedValue ?? 0 }
              : { clauseId: amendment.documentClauseId ?? "unrecorded" }),
            packageSize: amendment.packageChanges?.length ?? 0,
            partySystem: state.provincialRuntime.constitutionalOrder.partySystem,
            ratifyingProvinces: amendment.ratifiedProvinceIds.length,
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    } else if (
      provincesNeeded > 0 &&
      (unvoted.length === 0 ||
        (amendment.ratificationDeadline &&
          compareIsoDate(state.currentDate, amendment.ratificationDeadline) >= 0))
    ) {
      amendment.status = "failed";
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "CONSTITUTIONAL_AMENDMENT_FAILED",
          importance: 0.82,
          visibility: "public",
          actorIds: [amendment.sponsorId],
          entityIds: [amendment.id],
          payload: {
            amendmentId: amendment.id,
            stage: "provincial_ratification",
            ratifyingProvinces: amendment.ratifiedProvinceIds.length,
            required: provincesRequiredForRatification(state),
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
  }
  return events;
}
