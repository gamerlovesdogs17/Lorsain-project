import { getAgentProfile } from "../agents/profile.js";
import { getRelationship } from "../agents/relationships.js";
import { goalsOwnedBy } from "../agents/goals.js";
import type { KernelWorld, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import type { LegislativeVoteChoice } from "../legislature/types.js";
import { currentAssemblyMemberIds, currentPresidentialAuthorityId } from "../legislature/state.js";
import type {
  CourtCase,
  ImpeachmentProceeding,
  JudicialVoteChoice,
  PrecedentRecord,
} from "./types.js";
import { similarPrecedent } from "./procedure.js";
import { hasExplicitLegalCareer } from "./legal-careers.js";

export function chooseJudicialVote(
  world: KernelWorld,
  state: SimState,
  judgeId: string,
  courtCase: CourtCase,
  rng: RngService,
  resolvedPrecedent?: PrecedentRecord | null,
): JudicialVoteChoice {
  if (judgeId === state.playerPoliticianId) return "nonparticipation";
  const profile = getAgentProfile(world, state, judgeId);
  const institutionalism = profile?.traits.institutionalism ?? 0.5;
  const pragmatism = profile?.traits.pragmatism ?? 0.5;
  const independence = 1 - (profile?.traits.partyLoyalty ?? 0.5) * 0.35;
  const ideology = ((profile?.ideology.authority ?? 0) + (profile?.ideology.economic ?? 0)) / 2;
  const precedent =
    resolvedPrecedent === undefined ? similarPrecedent(state, courtCase) : resolvedPrecedent;
  let score = courtCase.meritsLean * 1.15;
  score -= (institutionalism - 0.5) * 0.7;
  if (precedent) {
    score += precedent.disposition === "INVALIDATE" ? 0.42 : -0.42;
  }
  score += ideology * courtCase.meritsLean * 0.28;
  score += (pragmatism - 0.5) * courtCase.meritsLean * 0.12;
  const relPetitioner = getRelationship(state, judgeId, courtCase.petitionerId, state.currentDate);
  const relRespondent = getRelationship(state, judgeId, courtCase.respondentId, state.currentDate);
  const pressure =
    ((relPetitioner?.affinity ?? 0) - (relRespondent?.affinity ?? 0)) * 0.08 * (1 - independence);
  score += pressure;
  const judge = state.politicians[judgeId];
  const petitioner = state.politicians[courtCase.petitionerId];
  if (judge?.partyId && petitioner?.partyId && judge.partyId === petitioner.partyId) {
    score += 0.06 * (profile?.traits.partyLoyalty ?? 0.5) * 0.15;
  }
  score += (rng.float01("npc-decisions") - 0.5) * 0.18;
  return score > 0.08 ? "invalidate" : "uphold";
}

export function chooseConfirmationVote(
  world: KernelWorld,
  state: SimState,
  mpId: string,
  nomineeId: string,
  rng: RngService,
): LegislativeVoteChoice {
  if (mpId === state.playerPoliticianId) return "abstain";
  const mp = state.politicians[mpId];
  const nominee = state.politicians[nomineeId];
  if (!mp || !nominee) return "abstain";
  const profile = getAgentProfile(world, state, mpId);
  const nomineeProfile = getAgentProfile(world, state, nomineeId);
  const sameParty = mp.partyId && nominee.partyId && mp.partyId === nominee.partyId ? 1 : 0;
  const crossParty = mp.partyId && nominee.partyId && mp.partyId !== nominee.partyId ? 1 : 0;
  const nonpartisanNominee = nominee.partyId == null ? 1 : 0;
  const standing = state.candidateStanding[nomineeId]?.favorability ?? 0;
  const rel = getRelationship(state, mpId, nomineeId, state.currentDate);
  const institutionalism = profile?.traits.institutionalism ?? 0.5;
  const legalQualification = nomineeProfile
    ? nomineeProfile.skills.legislation * 0.5 +
      nomineeProfile.traits.institutionalism * 0.35 +
      nomineeProfile.skills.negotiation * 0.15
    : 0.62;
  const score =
    0.08 +
    sameParty * 0.32 +
    nonpartisanNominee * 0.18 -
    crossParty * 0.06 +
    (legalQualification - 0.55) * 0.55 +
    standing * 0.1 +
    (rel?.affinity ?? 0) * 0.08 +
    institutionalism * 0.16 +
    (rng.float01("npc-decisions") - 0.5) * 0.12;
  if (score > 0.1) return "yes";
  if (score < -0.06) return "no";
  return rng.float01("npc-decisions") > 0.42 ? "yes" : "abstain";
}

export function chooseImpeachmentVote(
  world: KernelWorld,
  state: SimState,
  mpId: string,
  proceeding: ImpeachmentProceeding,
  rng: RngService,
): LegislativeVoteChoice {
  if (mpId === state.playerPoliticianId) return "abstain";
  const mp = state.politicians[mpId];
  const target = state.politicians[proceeding.targetId];
  if (!mp || !target) return "abstain";
  const profile = getAgentProfile(world, state, mpId);
  const sameParty = mp.partyId && target.partyId && mp.partyId === target.partyId ? 1 : 0;
  const institutionalism = profile?.traits.institutionalism ?? 0.5;
  const pragmatism = profile?.traits.pragmatism ?? 0.5;
  const standing = state.candidateStanding[proceeding.targetId]?.favorability ?? 0;
  const rel = getRelationship(state, mpId, proceeding.targetId, state.currentDate);
  const evidence = proceeding.evidenceStrength;
  const severity = proceeding.severity;
  const publicInfo = proceeding.basisId ? 0.08 : 0;
  const categoryContext =
    proceeding.grounds === "treason"
      ? (evidence - 0.45) * 0.04
      : proceeding.grounds === "serious_public_corruption"
        ? (evidence - 0.4) * 0.03
        : 0;
  const score =
    evidence * 0.55 +
    severity * 0.28 +
    publicInfo +
    (institutionalism - 0.4) * 0.32 +
    (pragmatism - 0.5) * 0.08 +
    categoryContext -
    sameParty * 0.48 -
    standing * 0.18 -
    (rel?.affinity ?? 0) * 0.12 +
    (rng.float01("npc-decisions") - 0.5) * 0.1;
  if (score > 0.2) return "yes";
  if (score < -0.05) return "no";
  return "abstain";
}

export function chooseRecallReferralVote(
  world: KernelWorld,
  state: SimState,
  mpId: string,
  targetId: string,
  rng: RngService,
): LegislativeVoteChoice {
  if (mpId === state.playerPoliticianId) return "abstain";
  const mp = state.politicians[mpId];
  const target = state.politicians[targetId];
  if (!mp || !target) return "abstain";
  const sameParty = mp.partyId && target.partyId && mp.partyId === target.partyId ? 1 : 0;
  const standing = state.candidateStanding[targetId]?.favorability ?? 0;
  const profile = getAgentProfile(world, state, mpId);
  const score =
    -sameParty * 0.5 -
    standing * 0.3 +
    (1 - (profile?.traits.partyLoyalty ?? 0.5)) * 0.1 +
    (rng.float01("npc-decisions") - 0.5) * 0.14;
  if (score > 0.08) return "yes";
  if (score < -0.12) return "no";
  return "abstain";
}

export function chooseJudgeNominee(
  world: KernelWorld,
  state: SimState,
  presidentId: string,
  seatOfficeId: string,
  rng: RngService,
): string | null {
  if (presidentId === state.playerPoliticianId) return null;
  const president = state.politicians[presidentId];
  if (!president) return null;
  const own = getAgentProfile(world, state, presidentId);
  const mps = new Set(currentAssemblyMemberIds(world, state));
  const partySeats = new Map<string, number>();
  for (const id of mps) {
    const partyId = state.politicians[id]?.partyId;
    if (partyId) partySeats.set(partyId, (partySeats.get(partyId) ?? 0) + 1);
  }
  const activeDisqualifications = new Set<string>();
  const formerJudges = new Set<string>();
  for (const term of Object.values(state.officeTerms)) {
    const kind = world.offices[term.officeId]?.kind;
    if (
      (term.status === "active" || term.status === "suspended") &&
      (kind === "military" || kind === "constitutional_court_justice")
    ) {
      activeDisqualifications.add(term.holderId);
    }
    if (term.holdingKind === "substantive" && kind === "constitutional_court_justice") {
      formerJudges.add(term.holderId);
    }
  }
  const currentYear = Number(state.currentDate.slice(0, 4));
  const legallyEligible = (id: string): boolean => {
    if (activeDisqualifications.has(id)) return false;
    if (world.courtConstitution.renewable === false && formerJudges.has(id)) return false;
    const profile = getAgentProfile(world, state, id);
    if (!profile) return false;
    const birthYear = profile.birthDate ? Number(profile.birthDate.slice(0, 4)) : null;
    if (birthYear && currentYear - birthYear < 35) return false;
    return hasExplicitLegalCareer(profile);
  };
  const candidates = Object.values(state.politicians)
    .filter((p) => p.alive && !p.retired && p.id !== presidentId)
    .filter((p) => p.id !== state.playerPoliticianId)
    .filter((p) => legallyEligible(p.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (candidates.length === 0) return null;
  const goals = goalsOwnedBy(state, presidentId).filter((g) => g.status === "active");
  const goalBoost = goals.some((g) => g.type === "career_advancement") ? 0.05 : 0;
  const scored = candidates.map((p) => {
    const pub = p.partyId ? world.partyPublicIdeology[p.partyId] : null;
    const ideologyFit =
      pub && own
        ? 1 -
          (Math.abs(pub.economic - own.ideology.economic) +
            Math.abs(pub.authority - own.ideology.authority)) /
            2
        : 0.4;
    const standing = state.candidateStanding[p.id]?.favorability ?? 0;
    const rel = getRelationship(state, presidentId, p.id, state.currentDate);
    const sameParty = p.partyId && p.partyId === president.partyId ? 1 : 0;
    let viable = 0.4;
    if (p.partyId) {
      viable = mps.size > 0 ? (partySeats.get(p.partyId) ?? 0) / mps.size : 0.4;
    }
    const noise = rng.float01("npc-decisions") * 0.12;
    return {
      id: p.id,
      score:
        ideologyFit * 0.28 +
        (standing + 1) * 0.12 +
        ((rel?.respect ?? 0) + 1) * 0.08 +
        sameParty * 0.18 +
        viable * 0.22 +
        (own?.traits.institutionalism ?? 0.5) * 0.08 +
        goalBoost +
        noise,
    };
  });
  scored.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  return scored[0]?.id ?? null;
}

export function npcShouldFileLawReview(
  world: KernelWorld,
  state: SimState,
  actorId: string,
  rng: RngService,
): boolean {
  if (actorId === state.playerPoliticianId) return false;
  if (currentPresidentialAuthorityId(world, state) === actorId) return false;
  return rng.float01("npc-decisions") < 0.08;
}
