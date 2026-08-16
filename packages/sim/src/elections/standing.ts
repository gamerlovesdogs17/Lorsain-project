import { publicPoliticianFacts } from "../agents/profile.js";
import type { CommandError, KernelWorld, SimState } from "../types.js";
import { clamp01, clampUnit, STANDING_INIT } from "./policy.js";
import type { CandidateStanding } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

export function defaultStanding(politicianId: string): CandidateStanding {
  return {
    politicianId,
    nameRecognition: STANDING_INIT.baseRecognition,
    favorability: STANDING_INIT.baseFavorability,
    enthusiasm: STANDING_INIT.baseEnthusiasm,
    momentum: STANDING_INIT.baseMomentum,
  };
}

function deriveDefaultStanding(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): CandidateStanding {
  const facts = publicPoliticianFacts(world, state, politicianId);
  const standing = defaultStanding(politicianId);
  if (!facts) return standing;
  const kinds = new Set(facts.officeKinds);
  if (kinds.has("president")) {
    standing.nameRecognition = Math.max(
      standing.nameRecognition,
      STANDING_INIT.presidentRecognition,
    );
    standing.favorability += STANDING_INIT.presidentFavorability;
    standing.enthusiasm = Math.max(standing.enthusiasm, 0.28);
  }
  if (kinds.has("minister")) {
    standing.nameRecognition = Math.max(
      standing.nameRecognition,
      STANDING_INIT.ministerRecognition,
    );
  }
  if (kinds.has("governor")) {
    standing.nameRecognition = Math.max(
      standing.nameRecognition,
      STANDING_INIT.governorRecognition,
    );
  }
  if (kinds.has("assembly_member")) {
    standing.nameRecognition = Math.max(standing.nameRecognition, STANDING_INIT.mpRecognition);
  }
  if (facts.partyLeaderOf) {
    standing.nameRecognition = Math.max(
      standing.nameRecognition,
      STANDING_INIT.partyLeaderRecognition,
    );
    standing.favorability += 0.06;
  }
  if (facts.factionChairOf) {
    standing.nameRecognition = Math.max(
      standing.nameRecognition,
      STANDING_INIT.factionChairRecognition,
    );
  }
  const profile = world.agentProfiles[politicianId];
  const seed = profile?.presidentialStatus;
  const bump =
    seed === "frontrunner"
      ? STANDING_INIT.presidentialFrontrunner
      : seed === "likely"
        ? STANDING_INIT.presidentialLikely
        : seed === "possible"
          ? STANDING_INIT.presidentialPossible
          : seed === "exploring"
            ? STANDING_INIT.presidentialExploring
            : null;
  if (bump) {
    standing.nameRecognition = Math.max(standing.nameRecognition, bump.recognition);
    standing.favorability += bump.favorability;
    standing.enthusiasm = Math.max(standing.enthusiasm, bump.enthusiasm);
    standing.momentum += bump.momentum;
  }
  standing.nameRecognition = clamp01(standing.nameRecognition);
  standing.favorability = clampUnit(standing.favorability);
  standing.enthusiasm = clamp01(standing.enthusiasm);
  standing.momentum = clampUnit(standing.momentum);
  return standing;
}

/**
 * Pure public standing accessor. Same deterministic default as materialization,
 * but never writes SimState.
 */
export function candidateStandingOrDefault(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): CandidateStanding {
  const existing = state.candidateStanding[politicianId];
  if (existing) return existing;
  return deriveDefaultStanding(world, state, politicianId);
}

/**
 * Persist public standing. Explicit commands/domain operations only.
 */
export function ensureCandidateStanding(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): CandidateStanding {
  const existing = state.candidateStanding[politicianId];
  if (existing) return existing;
  const standing = deriveDefaultStanding(world, state, politicianId);
  state.candidateStanding[politicianId] = standing;
  return standing;
}

export function standingMutationError(
  patch: Partial<Omit<CandidateStanding, "politicianId">>,
): CommandError | null {
  const checks: Array<[string, unknown, number, number]> = [
    ["nameRecognition", patch.nameRecognition, 0, 1],
    ["favorability", patch.favorability, -1, 1],
    ["enthusiasm", patch.enthusiasm, 0, 1],
    ["momentum", patch.momentum, -1, 1],
  ];
  for (const [name, value, lo, hi] of checks) {
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < lo || value > hi) {
      return reject("INVALID_STANDING", `${name} must be a finite number in [${lo}, ${hi}]`);
    }
  }
  return null;
}

export function setCandidateStanding(
  state: SimState,
  politicianId: string,
  patch: Partial<Omit<CandidateStanding, "politicianId">>,
): CandidateStanding | { error: CommandError } {
  const err = standingMutationError(patch);
  if (err) return { error: err };
  const cur = state.candidateStanding[politicianId] ?? defaultStanding(politicianId);
  const next: CandidateStanding = {
    politicianId,
    nameRecognition: patch.nameRecognition ?? cur.nameRecognition,
    favorability: patch.favorability ?? cur.favorability,
    enthusiasm: patch.enthusiasm ?? cur.enthusiasm,
    momentum: patch.momentum ?? cur.momentum,
  };
  state.candidateStanding[politicianId] = next;
  return next;
}
