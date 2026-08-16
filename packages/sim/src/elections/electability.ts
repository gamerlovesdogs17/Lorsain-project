import type { KernelWorld, SimState } from "../types.js";
import { SELECTOR_ELECTABILITY } from "./policy.js";
import { contestPollAverage } from "./polls.js";
import { candidateStandingOrDefault } from "./standing.js";
import type { PartyContestType } from "../parties/types.js";

/** Modest public electability for selectorates. Never latent support. */
export function publicElectabilitySignal(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  contestType?: PartyContestType,
  contestId?: string | null,
): number {
  const standing = candidateStandingOrDefault(world, state, politicianId);
  const standingScore =
    standing.nameRecognition * 0.35 +
    ((standing.favorability + 1) / 2) * 0.45 +
    standing.enthusiasm * 0.2;
  let pollShare = 0;
  if (contestType === "presidential_nomination" && contestId) {
    pollShare = contestPollAverage(state, state.currentDate, contestId)[politicianId] ?? 0;
  }
  return (
    standingScore * SELECTOR_ELECTABILITY.standing + pollShare * SELECTOR_ELECTABILITY.pollShare
  );
}
