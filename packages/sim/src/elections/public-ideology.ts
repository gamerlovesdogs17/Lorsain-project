import { emptyIdeology } from "../agents/profile.js";
import { IDEOLOGY_AXES } from "../agents/types.js";
import type { KernelWorld, PoliticianRuntime, SimState } from "../types.js";
import { PUBLIC_FACTION_BLEND } from "./policy.js";
import type { IdeologyVector } from "./types.js";

function averageIdeology(
  ids: readonly string[],
  ideologyOf: (id: string) => IdeologyVector | null,
): IdeologyVector {
  const mean = emptyIdeology();
  let n = 0;
  for (const id of ids) {
    const vec = ideologyOf(id);
    if (!vec) continue;
    n += 1;
    for (const axis of IDEOLOGY_AXES) mean[axis] += vec[axis];
  }
  if (n === 0) return mean;
  for (const axis of IDEOLOGY_AXES) mean[axis] /= n;
  return mean;
}

/**
 * Deterministic public institutional ideology from starting membership + starting
 * profiles. Called at KernelWorld construction; never re-averaged from live hidden
 * AgentProfile values during play.
 */
export function snapshotInstitutionalPublicIdeology(args: {
  politicians: readonly PoliticianRuntime[];
  agentProfiles: KernelWorld["agentProfiles"];
  partyIds: readonly string[];
  factionIds: readonly string[];
}): {
  partyPublicIdeology: Record<string, IdeologyVector>;
  factionPublicIdeology: Record<string, IdeologyVector>;
} {
  const ideologyOf = (id: string): IdeologyVector | null =>
    args.agentProfiles[id]?.ideology ?? null;
  const partyPublicIdeology: Record<string, IdeologyVector> = {};
  for (const partyId of args.partyIds) {
    const members = args.politicians.filter((p) => p.partyId === partyId).map((p) => p.id);
    partyPublicIdeology[partyId] = averageIdeology(members, ideologyOf);
  }
  const factionPublicIdeology: Record<string, IdeologyVector> = {};
  for (const factionId of args.factionIds) {
    const members = args.politicians.filter((p) => p.factionId === factionId).map((p) => p.id);
    factionPublicIdeology[factionId] = averageIdeology(members, ideologyOf);
  }
  return { partyPublicIdeology, factionPublicIdeology };
}

export function applyInstitutionalPublicIdeology(world: KernelWorld): void {
  const snap = snapshotInstitutionalPublicIdeology({
    politicians: world.politicians,
    agentProfiles: world.agentProfiles,
    partyIds: Object.keys(world.partyDefinitions),
    factionIds: Object.keys(world.factionDefinitions),
  });
  world.partyPublicIdeology = snap.partyPublicIdeology;
  world.factionPublicIdeology = snap.factionPublicIdeology;
}

function blend(a: IdeologyVector, b: IdeologyVector, t: number): IdeologyVector {
  const out = emptyIdeology();
  for (const axis of IDEOLOGY_AXES) out[axis] = (1 - t) * a[axis] + t * b[axis];
  return out;
}

export function publicPartyIdeologyBaseline(
  world: KernelWorld,
  state: SimState,
  partyId: string,
): IdeologyVector | null {
  const direct = world.partyPublicIdeology[partyId];
  if (direct) return direct;
  const dyn = state.dynamicParties[partyId];
  if (!dyn) return null;
  const origin = world.partyPublicIdeology[dyn.originPartyId] ?? emptyIdeology();
  if (dyn.originFactionId && world.factionPublicIdeology[dyn.originFactionId]) {
    return blend(origin, world.factionPublicIdeology[dyn.originFactionId]!, PUBLIC_FACTION_BLEND);
  }
  return origin;
}

export function publicFactionIdeologyBaseline(
  world: KernelWorld,
  factionId: string,
): IdeologyVector | null {
  return world.factionPublicIdeology[factionId] ?? null;
}
