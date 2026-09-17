/**
 * Public judicial reputation — imperfect, player-facing labels.
 * Distinct from hidden ideology vectors used in Court vote mechanics.
 * Sitting justices remain formally nonpartisan (no Party membership).
 */
import { getAgentProfile } from "../agents/profile.js";
import type { KernelWorld, SimState } from "../types.js";
import { currentCourtJudgeIds, deriveCourtBench } from "./state.js";

export const PUBLIC_JUDICIAL_REPUTATIONS = [
  "institutionalist",
  "difficult_to_place",
  "centre_left_legal",
  "conservative_legal",
  "civil_libertarian",
  "executive_deference",
] as const;

export type PublicJudicialReputation = (typeof PUBLIC_JUDICIAL_REPUTATIONS)[number];

export const PUBLIC_JUDICIAL_REPUTATION_LABELS: Record<PublicJudicialReputation, string> = {
  institutionalist: "Institutionalist",
  difficult_to_place: "Difficult to place",
  centre_left_legal: "Centre-left legal reputation",
  conservative_legal: "Conservative legal reputation",
  civil_libertarian: "Civil-libertarian reputation",
  executive_deference: "Executive-deference reputation",
};

export type CourtJusticeRecord = {
  politicianId: string;
  seatIndex: number;
  chief: boolean;
  appointed: string;
  termEnds: string;
  legalPhilosophy: string;
  appointingPresidentId: string | null;
  appointingAdministrationId: string | null;
  priorPath: string | null;
  priorOffices: string[];
  pathSummary: string | null;
  publicReputation?: PublicJudicialReputation;
};

/**
 * Canonical Terena opening bench public reputations.
 * Target mix: ~5 institutional/unclassified · ~2 centre-left/progressive · ~2 conservative.
 * IDs match data/terena_starting_figures.json Court seats 0–8.
 */
export const TERENA_STARTING_PUBLIC_JUDICIAL_REPUTATION: Record<string, PublicJudicialReputation> =
  {
    NPC020: "institutionalist", // Chief Elian Mora
    NPC991: "difficult_to_place", // Vespa Narev — publicly hard to place despite textualism
    NPC992: "institutionalist", // Fedor Havel — pragmatic balancer
    NPC993: "institutionalist", // Elian Pavlic — institutional presentation; progressive path muted
    NPC997: "difficult_to_place", // Belma Kerrin
    NPC994: "centre_left_legal", // Zlata Nerath
    NPC996: "civil_libertarian", // Sonia Selvik
    NPC995: "conservative_legal", // Milaia Vlahovic
    NPC998: "executive_deference", // Klara Wex — public right / executive lean
  };

/** @deprecated Prefer TERENA_STARTING_PUBLIC_JUDICIAL_REPUTATION */
export const CANONICAL_STARTING_BENCH_REPUTATION = TERENA_STARTING_PUBLIC_JUDICIAL_REPUTATION;

function leanFromIdeology(authority: number, economic: number, social: number): number {
  return authority * 0.45 + economic * 0.35 - social * 0.2;
}

function courtRecord(world: KernelWorld, politicianId: string): CourtJusticeRecord | null {
  return world.courtJusticeRecords?.[politicianId] ?? null;
}

/**
 * Public reputation for a justice. Canonical starters use authored labels;
 * others derive coarsely from known career + ideology without exposing floats.
 */
export function publicJudicialReputation(
  world: KernelWorld,
  state: SimState,
  judgeId: string,
): PublicJudicialReputation {
  const authored = TERENA_STARTING_PUBLIC_JUDICIAL_REPUTATION[judgeId];
  if (authored) return authored;

  const record = courtRecord(world, judgeId);
  if (record?.publicReputation) return record.publicReputation;

  const profile = getAgentProfile(world, state, judgeId);
  if (!profile) return "difficult_to_place";

  const roles = profile.roleTypes ?? [];
  const authority = profile.ideology.authority ?? 0;
  const economic = profile.ideology.economic ?? 0;
  const social = profile.ideology.social ?? 0;
  const lean = leanFromIdeology(authority, economic, social);

  if (record?.legalPhilosophy === "rights_expansive") return "civil_libertarian";
  if (record?.legalPhilosophy === "originalist" || record?.legalPhilosophy === "textualist") {
    return lean >= 0 ? "conservative_legal" : "difficult_to_place";
  }
  if (
    record?.legalPhilosophy === "institutionalist" ||
    record?.legalPhilosophy === "proceduralist"
  ) {
    return "institutionalist";
  }

  if (roles.some((r) => r.includes("defender") || r.includes("civil"))) {
    if (lean < -0.08) return "civil_libertarian";
  }
  if (Math.abs(lean) < 0.08) {
    return roles.some((r) => r.includes("academic") || r.includes("appellate"))
      ? "institutionalist"
      : "difficult_to_place";
  }
  if (lean <= -0.12) return social > 0.05 ? "centre_left_legal" : "civil_libertarian";
  if (lean >= 0.12) return authority > 0.08 ? "executive_deference" : "conservative_legal";
  return "difficult_to_place";
}

export function publicJudicialReputationLabel(
  world: KernelWorld,
  state: SimState,
  judgeId: string,
): string {
  return PUBLIC_JUDICIAL_REPUTATION_LABELS[publicJudicialReputation(world, state, judgeId)];
}

export function benchPublicReputationBalance(
  world: KernelWorld,
  state: SimState,
): {
  institutionalOrUnclassified: number;
  publiclyLeaning: number;
  centreLeftLeaning: number;
  conservativeLeaning: number;
  byReputation: Record<PublicJudicialReputation, number>;
  judgeIds: string[];
  qualitativeSummary: string;
} {
  const byReputation = Object.fromEntries(
    PUBLIC_JUDICIAL_REPUTATIONS.map((id) => [id, 0]),
  ) as Record<PublicJudicialReputation, number>;
  const judgeIds: string[] = [];
  for (const seat of deriveCourtBench(world, state)) {
    if (!seat.holderId) continue;
    judgeIds.push(seat.holderId);
    const rep = publicJudicialReputation(world, state, seat.holderId);
    byReputation[rep] += 1;
  }
  const institutionalOrUnclassified =
    byReputation.institutionalist + byReputation.difficult_to_place;
  const centreLeftLeaning = byReputation.centre_left_legal + byReputation.civil_libertarian;
  const conservativeLeaning = byReputation.conservative_legal + byReputation.executive_deference;
  const publiclyLeaning = judgeIds.length - institutionalOrUnclassified;
  let qualitativeSummary =
    "The bench is widely described as institutionally cautious, with limited public ideological sorting.";
  if (centreLeftLeaning >= 2 && conservativeLeaning >= 2) {
    qualitativeSummary =
      "Public commentary notes a mixed jurisprudential balance: a nonpartisan core with recognisable progressive and conservative legal reputations.";
  } else if (centreLeftLeaning >= conservativeLeaning + 2) {
    qualitativeSummary =
      "Outside observers tend to read the Court as leaning centre-left in public legal reputation.";
  } else if (conservativeLeaning >= centreLeftLeaning + 2) {
    qualitativeSummary =
      "Outside observers tend to read the Court as leaning conservative in public legal reputation.";
  }
  return {
    institutionalOrUnclassified,
    publiclyLeaning,
    centreLeftLeaning,
    conservativeLeaning,
    byReputation,
    judgeIds,
    qualitativeSummary,
  };
}

/** Alias used by overview UI. */
export function benchPublicJurisprudentialBalance(world: KernelWorld, state: SimState) {
  return benchPublicReputationBalance(world, state);
}

/** CSS tone hint for bench cards — never the sole information channel. */
export function publicJudicialReputationTone(
  reputation: PublicJudicialReputation,
): "institutionalist" | "leaning-left" | "leaning-right" {
  if (reputation === "centre_left_legal" || reputation === "civil_libertarian") {
    return "leaning-left";
  }
  if (reputation === "conservative_legal" || reputation === "executive_deference") {
    return "leaning-right";
  }
  return "institutionalist";
}

export type PublicReputationBucket = "institutionalist_or_unclear" | "centre_left" | "conservative";

export function publicReputationBucket(rep: PublicJudicialReputation): PublicReputationBucket {
  if (rep === "centre_left_legal" || rep === "civil_libertarian") return "centre_left";
  if (rep === "conservative_legal" || rep === "executive_deference") return "conservative";
  return "institutionalist_or_unclear";
}

/** Sitting justices must not carry Party membership. */
export function assertFormalJudicialNonpartisanship(world: KernelWorld, state: SimState): string[] {
  const violations: string[] = [];
  for (const seat of deriveCourtBench(world, state)) {
    if (!seat.holderId) continue;
    const partyId = state.politicians[seat.holderId]?.partyId ?? null;
    if (partyId) {
      violations.push(`${seat.holderId} holds Party ${partyId} while sitting as justice`);
    }
  }
  return violations;
}

export function sittingJusticesPartyMembershipViolations(
  world: KernelWorld,
  state: SimState,
): string[] {
  return assertFormalJudicialNonpartisanship(world, state);
}

export function appointingAuthorityLabel(
  world: KernelWorld,
  state: SimState,
  judgeId: string,
): string {
  const record = courtRecord(world, judgeId);
  if (record?.appointingPresidentId) {
    const name = state.politicians[record.appointingPresidentId]?.displayName;
    return name ? `President ${name}` : "Presidential appointment";
  }
  if (record?.appointingAdministrationId) {
    return "Pre-Velic administration";
  }
  for (const nom of Object.values(state.constitutionalRuntime.nominations)) {
    if (nom.nomineeId === judgeId && nom.status === "confirmed" && nom.nominatorId) {
      const name = state.politicians[nom.nominatorId]?.displayName;
      return name ? `Nominated by ${name}` : "Presidential nomination";
    }
  }
  return "Appointment record unavailable";
}

export function justiceTenureSummary(
  world: KernelWorld,
  state: SimState,
  judgeId: string,
): { appointed: string | null; termEnds: string | null; yearsOnBench: number | null } {
  const seat = deriveCourtBench(world, state).find((s) => s.holderId === judgeId);
  const record = courtRecord(world, judgeId);
  const appointed = record?.appointed ?? null;
  const termEnds = seat?.termEndDate ?? record?.termEnds ?? null;
  let yearsOnBench: number | null = null;
  if (appointed) {
    const startY = Number(appointed.slice(0, 4));
    const nowY = Number(state.currentDate.slice(0, 4));
    if (Number.isFinite(startY) && Number.isFinite(nowY)) yearsOnBench = Math.max(0, nowY - startY);
  }
  return { appointed, termEnds, yearsOnBench };
}

export function notableJurisprudenceBlurb(
  world: KernelWorld,
  state: SimState,
  judgeId: string,
): string {
  const record = courtRecord(world, judgeId);
  if (record?.pathSummary) return record.pathSummary;
  const profile = getAgentProfile(world, state, judgeId);
  const label = publicJudicialReputationLabel(world, state, judgeId);
  if (profile?.roleTypes.some((r) => r.includes("appellate"))) {
    return `Appellate public-law record; publicly described as ${label}.`;
  }
  return `Public legal reputation: ${label}.`;
}

export type JusticeRulingRecord = {
  decisionId: string;
  caseId: string;
  date: string;
  disposition: string;
  side: "majority" | "dissent" | "nonparticipation";
  question: string;
};

export function justiceSignificantRulings(
  state: SimState,
  judgeId: string,
  limit = 6,
): JusticeRulingRecord[] {
  const out: JusticeRulingRecord[] = [];
  for (const d of Object.values(state.constitutionalRuntime.courtDecisions)) {
    const vote = d.votes[judgeId];
    if (!vote) continue;
    const majority: "uphold" | "invalidate" = d.disposition === "UPHOLD" ? "uphold" : "invalidate";
    let side: JusticeRulingRecord["side"] = "nonparticipation";
    if (vote === "nonparticipation") side = "nonparticipation";
    else if (vote === majority) side = "majority";
    else side = "dissent";
    out.push({
      decisionId: d.id,
      caseId: d.caseId,
      date: d.decisionDate,
      disposition: d.disposition,
      side,
      question: d.constitutionalQuestion,
    });
  }
  return out
    .sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : a.decisionId < b.decisionId ? -1 : 1,
    )
    .slice(0, limit);
}

/**
 * Public politicization debate snapshot — salience / recent coverage, not a monthly crisis.
 */
export function courtPoliticizationDebate(
  world: KernelWorld,
  state: SimState,
): {
  issueId: string | null;
  issueName: string;
  salience: number;
  visible: boolean;
  summary: string;
} {
  const issueId = world.issueIds.includes("ISS_COURTS")
    ? "ISS_COURTS"
    : world.issueIds.includes("ISS_REFORM")
      ? "ISS_REFORM"
      : world.issueIds.includes("ISS_EXEC")
        ? "ISS_EXEC"
        : null;
  const climate =
    issueId != null ? Math.abs(state.electoralEnvironment?.issueClimateShift?.[issueId] ?? 0) : 0;
  const recentCourtStories = Object.values(state.mediaRuntime?.stories ?? {})
    .filter(
      (s) =>
        s.category === "courts" ||
        (issueId != null && (s.issueIds ?? []).includes(issueId)) ||
        (s.issueIds ?? []).includes("ISS_COURTS"),
    )
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 3);
  const recentCourtDecisions = state.history.filter((e) => e.type === "COURT_DECISION").slice(-4);
  const salience = Math.min(1, 0.28 + climate * 4 + recentCourtStories.length * 0.08);
  const visible =
    climate >= 0.04 || recentCourtStories.length > 0 || recentCourtDecisions.length >= 3;
  const issueName =
    issueId === "ISS_COURTS"
      ? "Judicial independence and Court politicization"
      : issueId === "ISS_REFORM"
        ? "Institutional reform"
        : issueId === "ISS_EXEC"
          ? "Executive power"
          : "Constitutional politics";
  let summary =
    "Parties treat the Constitutional Court as a formal nonpartisan institution; public debate about politicization remains muted.";
  if (visible && salience >= 0.55) {
    summary =
      "Judicial appointments and landmark rulings have become a recurring theme in party rhetoric and civic commentary on Court independence.";
  } else if (visible) {
    summary =
      "Occasional news cycles and civic groups raise the politicization of judicial appointments, without treating it as a permanent crisis.";
  }
  return { issueId, issueName, salience, visible, summary };
}

export function synthesizeCaseFacts(
  state: SimState,
  caseId: string,
): {
  parties: string;
  legalQuestion: string;
  facts: string;
  challengedLaw: string | null;
  constitutionalRule: string;
  precedent: string | null;
  stage: string;
} {
  const courtCase = state.constitutionalRuntime.courtCases[caseId];
  if (!courtCase) {
    return {
      parties: "—",
      legalQuestion: "—",
      facts: "—",
      challengedLaw: null,
      constitutionalRule: "—",
      precedent: null,
      stage: "—",
    };
  }
  const petitioner = state.politicians[courtCase.petitionerId]?.displayName ?? "Petitioner";
  const respondent = state.politicians[courtCase.respondentId]?.displayName ?? "Respondent";
  let challengedLaw: string | null = null;
  if (courtCase.challengedKind === "law") {
    challengedLaw =
      state.legislatureRuntime.enactedLaws[courtCase.challengedId]?.title ?? courtCase.challengedId;
  } else if (courtCase.challengedId) {
    challengedLaw = `${courtCase.challengedKind.replace(/_/g, " ")} ${courtCase.challengedId}`;
  }
  const facts =
    typeof courtCase.metadata.facts === "string"
      ? courtCase.metadata.facts
      : `Filed ${courtCase.filedDate} as a ${courtCase.caseType
          .replace(/_/g, " ")
          .toLowerCase()} challenging ${
          challengedLaw ?? "the contested public act"
        }. The Court is asked to apply the ${courtCase.constitutionalRule.replace(/_/g, " ")} framework.`;
  const prior = Object.values(state.constitutionalRuntime.precedents)
    .filter(
      (p) =>
        p.constitutionalRule === courtCase.constitutionalRule &&
        p.caseType === courtCase.caseType &&
        p.decisionDate < (courtCase.decisionDate ?? state.currentDate),
    )
    .sort((a, b) => (a.decisionDate < b.decisionDate ? 1 : -1))[0];
  return {
    parties: `${petitioner} v. ${respondent}`,
    legalQuestion: courtCase.constitutionalQuestion,
    facts,
    challengedLaw,
    constitutionalRule: courtCase.constitutionalRule.replace(/_/g, " "),
    precedent: prior
      ? `${prior.disposition} (${prior.decisionDate}) on similar ${prior.constitutionalRule.replace(/_/g, " ")}`
      : null,
    stage: courtCase.status.replace(/_/g, " "),
  };
}

/** Build content-derived justice records from starting figures (world construction). */
export function courtJusticeRecordsFromFigures(
  figures: Array<{
    id: string;
    court?: {
      seat_index?: number;
      chief?: boolean;
      appointed?: string;
      term_ends?: string;
      legal_philosophy?: string;
      appointing_president?: string;
      appointing_administration?: string;
      legal_career?: {
        prior_path?: string;
        prior_offices?: string[];
        path_summary?: string;
      };
      public_reputation?: string;
    } | null;
  }>,
): Record<string, CourtJusticeRecord> {
  const out: Record<string, CourtJusticeRecord> = {};
  for (const f of figures) {
    const c = f.court;
    if (!c || c.seat_index == null || !c.appointed || !c.term_ends) continue;
    const pub = c.public_reputation;
    const publicReputation =
      pub && (PUBLIC_JUDICIAL_REPUTATIONS as readonly string[]).includes(pub)
        ? (pub as PublicJudicialReputation)
        : undefined;
    out[f.id] = {
      politicianId: f.id,
      seatIndex: c.seat_index,
      chief: c.chief === true,
      appointed: c.appointed,
      termEnds: c.term_ends,
      legalPhilosophy: c.legal_philosophy ?? "institutionalist",
      appointingPresidentId: c.appointing_president ?? null,
      appointingAdministrationId: c.appointing_administration ?? null,
      priorPath: c.legal_career?.prior_path ?? null,
      priorOffices: [...(c.legal_career?.prior_offices ?? [])],
      pathSummary: c.legal_career?.path_summary ?? null,
      ...(publicReputation ? { publicReputation } : {}),
    };
  }
  return out;
}

export function currentBenchJudgeIds(world: KernelWorld, state: SimState): string[] {
  return currentCourtJudgeIds(world, state);
}
