import { evaluatePresidentialEligibility } from "../parties/eligibility.js";
import { partyAllowedUnderConstitution } from "../parties/state.js";
import { membershipPartyIds, resolvePartyDefinition } from "../parties/queries.js";
import { IDEOLOGY_AXES } from "../agents/types.js";
import type { CommandError, KernelWorld, SimState } from "../types.js";
import type { ElectionCandidate, ElectionState, IdeologyVector } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

export function isMembershipPartyId(
  world: KernelWorld,
  state: SimState,
  partyId: string | null,
): boolean {
  if (!partyId) return false;
  if (partyId === world.independentAggregatePartyId) return false;
  return resolvePartyDefinition(world, state, partyId) != null;
}

export function electionAcceptsCandidates(election: ElectionState): boolean {
  if (election.status === "resolved" || election.status === "cancelled") return false;
  if (election.fieldFinalized) return false;
  return (
    election.status === "planned" ||
    election.status === "field_open" ||
    election.status === "field_finalized"
  );
}

export function nominationProvenanceError(
  state: SimState,
  world: KernelWorld,
  candidate: ElectionCandidate,
  election: ElectionState,
): CommandError | null {
  if (election.type !== "presidential") return null;
  if (!isMembershipPartyId(world, state, candidate.partyId) || !candidate.partyId) return null;
  if (!candidate.sourceContestId) {
    return reject(
      "NOMINATION_PROVENANCE_REQUIRED",
      `${candidate.politicianId} membership-party nominee requires sourceContestId`,
    );
  }
  const contest = state.partyContests[candidate.sourceContestId];
  if (!contest) {
    return reject("INVALID_SOURCE_CONTEST", candidate.sourceContestId);
  }
  if (contest.type !== "presidential_nomination") {
    return reject("INVALID_SOURCE_CONTEST", `${contest.id} is not a presidential nomination`);
  }
  if (contest.partyId !== candidate.partyId) {
    return reject("INVALID_SOURCE_CONTEST", `${contest.id} party mismatch`);
  }
  if (contest.status !== "resolved" || contest.winnerId !== candidate.politicianId) {
    return reject(
      "INVALID_SOURCE_CONTEST",
      `${contest.id} winner is not ${candidate.politicianId}`,
    );
  }
  return null;
}

export function independentCandidateError(
  candidate: ElectionCandidate,
  world: KernelWorld,
): CommandError | null {
  if (candidate.partyId === world.independentAggregatePartyId) {
    return reject(
      "INDEPENDENT_PARTY_ID",
      "independent candidates must have partyId null, not PARTY_IND membership",
    );
  }
  if (candidate.partyId != null) return null;
  if (!candidate.publicIdeology) {
    return reject("PUBLIC_POSITION_REQUIRED", candidate.politicianId);
  }
  for (const axis of IDEOLOGY_AXES) {
    const v = candidate.publicIdeology[axis as keyof IdeologyVector];
    if (typeof v !== "number" || !Number.isFinite(v) || v < -1 || v > 1) {
      return reject("INVALID_PUBLIC_IDEOLOGY", `${candidate.politicianId}.${axis}`);
    }
  }
  if (!candidate.independentQualified) {
    return reject(
      "INDEPENDENT_QUALIFICATION_REQUIRED",
      `${candidate.politicianId} lacks explicit independent qualification evidence`,
    );
  }
  return null;
}

function duplicatePartyNomineeError(
  election: ElectionState,
  candidate: ElectionCandidate,
): CommandError | null {
  if (!candidate.partyId || candidate.withdrawn) return null;
  const other = Object.values(election.candidates).find(
    (c) =>
      !c.withdrawn && c.politicianId !== candidate.politicianId && c.partyId === candidate.partyId,
  );
  if (other) {
    return reject(
      "DUPLICATE_PARTY_NOMINEE",
      `${candidate.partyId} already has active candidate ${other.politicianId}`,
    );
  }
  return null;
}

export function addElectionCandidate(
  state: SimState,
  world: KernelWorld,
  electionId: string,
  candidate: ElectionCandidate,
  opts?: { syntheticFixture?: boolean },
): { election: ElectionState } | { error: CommandError } {
  const election = state.elections[electionId];
  if (!election) return { error: reject("INVALID_ELECTION", electionId) };
  if (
    election.fieldFinalized ||
    election.status === "resolved" ||
    election.status === "cancelled"
  ) {
    return { error: reject("FIELD_FINALIZED", electionId) };
  }
  const pol = state.politicians[candidate.politicianId];
  if (!pol) return { error: reject("UNKNOWN_POLITICIAN", candidate.politicianId) };
  if (!pol.alive) return { error: reject("POLITICIAN_DEAD", candidate.politicianId) };
  if (pol.retired) return { error: reject("POLITICIAN_RETIRED", candidate.politicianId) };
  const existing = election.candidates[candidate.politicianId];
  if (existing && !existing.withdrawn) {
    return { error: reject("DUPLICATE_CANDIDACY", candidate.politicianId) };
  }
  if (candidate.partyId === world.independentAggregatePartyId) {
    return { error: reject("INDEPENDENT_PARTY_ID", "PARTY_IND is not a membership party") };
  }
  if (election.type === "presidential") {
    const elig = evaluatePresidentialEligibility(
      world,
      state,
      candidate.politicianId,
      election.date,
    );
    if (!elig.eligible) {
      return {
        error: reject(
          "INELIGIBLE_CANDIDATE",
          `${candidate.politicianId}: ${elig.reasons.join("; ")}`,
        ),
      };
    }
  }
  if (!partyAllowedUnderConstitution(state, candidate.partyId ?? pol.partyId)) {
    return {
      error: reject(
        "PARTY_CONSTITUTIONALLY_BARRED",
        `${candidate.partyId ?? pol.partyId ?? "independent"} is not legal under the current Constitution`,
      ),
    };
  }
  if (!opts?.syntheticFixture) {
    const prov = nominationProvenanceError(state, world, candidate, election);
    if (prov) return { error: prov };
    const ind = independentCandidateError(candidate, world);
    if (ind) return { error: ind };
    if (candidate.partyId != null && candidate.partyId !== pol.partyId) {
      return {
        error: reject(
          "PARTY_MISMATCH",
          `${candidate.politicianId} election party ${candidate.partyId} != membership ${pol.partyId}`,
        ),
      };
    }
    if (candidate.partyId == null && pol.partyId != null) {
      return {
        error: reject(
          "PARTY_MISMATCH",
          `${candidate.politicianId} is a party member and cannot file as independent`,
        ),
      };
    }
  }
  const dup = duplicatePartyNomineeError(election, candidate);
  if (dup) return { error: dup };
  election.candidates[candidate.politicianId] = candidate;
  if (election.status === "planned") election.status = "field_open";
  return { election };
}

export function addIndependentCandidate(
  state: SimState,
  world: KernelWorld,
  electionId: string,
  candidate: ElectionCandidate,
): { error?: CommandError } {
  if (candidate.partyId != null) {
    return { error: reject("INDEPENDENT_PARTY_ID", "independent candidate partyId must be null") };
  }
  const out = addElectionCandidate(state, world, electionId, candidate);
  return "error" in out ? { error: out.error } : {};
}

export function withdrawUnresolvedCandidacy(election: ElectionState, politicianId: string): void {
  const c = election.candidates[politicianId];
  if (!c || c.withdrawn) return;
  c.withdrawn = true;
}

export function reconcileUnresolvedElectionCandidacies(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): void {
  const pol = state.politicians[politicianId];
  for (const election of Object.values(state.elections)) {
    if (election.status === "resolved" || election.status === "cancelled") continue;
    const c = election.candidates[politicianId];
    if (!c || c.withdrawn) continue;
    let withdraw = false;
    if (!pol || !pol.alive || pol.retired) withdraw = true;
    else if (election.type === "presidential") {
      const elig = evaluatePresidentialEligibility(world, state, politicianId, election.date);
      if (!elig.eligible) withdraw = true;
    }
    if (c.partyId != null && pol?.partyId !== c.partyId) withdraw = true;
    if (c.partyId == null && pol?.partyId != null) withdraw = true;
    if (withdraw) withdrawUnresolvedCandidacy(election, politicianId);
  }
}

export function partiesWithoutNominee(world: KernelWorld, election: ElectionState): string[] {
  const missing: string[] = [];
  for (const partyId of membershipPartyIds(world)) {
    const has = Object.values(election.candidates).some(
      (c) => !c.withdrawn && c.partyId === partyId,
    );
    if (!has) missing.push(partyId);
  }
  return missing;
}

export function finalizedFieldError(
  state: SimState,
  world: KernelWorld,
  election: ElectionState,
): CommandError | null {
  const live = Object.values(election.candidates).filter((c) => !c.withdrawn);
  if (live.length < 2) {
    return reject("INSUFFICIENT_CANDIDATES", "need at least two candidates");
  }
  const seenParty = new Set<string>();
  for (const c of live) {
    const pol = state.politicians[c.politicianId];
    if (!pol?.alive || pol.retired) {
      return reject("INELIGIBLE_CANDIDATE", c.politicianId);
    }
    if (election.type === "presidential") {
      const elig = evaluatePresidentialEligibility(world, state, c.politicianId, election.date);
      if (!elig.eligible) {
        return reject("INELIGIBLE_CANDIDATE", `${c.politicianId}: ${elig.reasons.join("; ")}`);
      }
    }
    const prov = nominationProvenanceError(state, world, c, election);
    if (prov) return prov;
    const ind = independentCandidateError(c, world);
    if (ind) return ind;
    if (c.partyId) {
      if (seenParty.has(c.partyId)) {
        return reject("DUPLICATE_PARTY_NOMINEE", c.partyId);
      }
      seenParty.add(c.partyId);
    }
  }
  return null;
}

export function activeElectionCandidateIds(election: ElectionState): string[] {
  return Object.values(election.candidates)
    .filter((c) => !c.withdrawn)
    .map((c) => c.politicianId)
    .sort();
}
