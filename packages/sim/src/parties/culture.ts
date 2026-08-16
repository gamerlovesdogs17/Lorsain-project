import { IDEOLOGY_AXES } from "../agents/types.js";
import { getAgentProfile } from "../agents/profile.js";
import type { KernelWorld, SimState } from "../types.js";
import { partyMembers } from "./queries.js";
import type { PublicPartyCulture } from "./types.js";

/**
 * Public aggregate party culture. Individual hidden traits/skills are averaged
 * across many members so a single politician's private vector is not recoverable.
 */
export function publicPartyCulture(
  world: KernelWorld,
  state: SimState,
  partyId: string,
): PublicPartyCulture {
  const members = partyMembers(state, partyId);
  const meanIdeology: Record<string, number> = {};
  for (const axis of IDEOLOGY_AXES) meanIdeology[axis] = 0;
  if (members.length === 0) {
    return { partyId, memberCount: 0, meanIdeology };
  }
  for (const id of members) {
    const profile = getAgentProfile(world, state, id);
    if (!profile) continue;
    for (const axis of IDEOLOGY_AXES) {
      meanIdeology[axis] = (meanIdeology[axis] ?? 0) + profile.ideology[axis];
    }
  }
  for (const axis of IDEOLOGY_AXES) {
    meanIdeology[axis] = (meanIdeology[axis] ?? 0) / members.length;
  }
  return { partyId, memberCount: members.length, meanIdeology };
}

export function partyCultureCompatibility(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  partyId: string,
): number {
  const profile = getAgentProfile(world, state, politicianId);
  const culture = publicPartyCulture(world, state, partyId);
  if (!profile || culture.memberCount === 0) return 0;
  let acc = 0;
  for (const axis of IDEOLOGY_AXES) {
    acc += 1 - Math.abs(profile.ideology[axis] - (culture.meanIdeology[axis] ?? 0)) / 2;
  }
  return acc / IDEOLOGY_AXES.length;
}
