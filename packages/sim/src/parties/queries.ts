import { officesOfKind, occupyingTerms } from "../offices.js";
import type { KernelWorld, SimState } from "../types.js";
import { INDEPENDENT_AGGREGATE_ID } from "./policy.js";
import type { DynamicPartyDefinition, PartyDefinition } from "./types.js";

export function membershipPartyIds(world: KernelWorld): string[] {
  return Object.keys(world.partyDefinitions).sort();
}

export function resolvePartyDefinition(
  world: KernelWorld,
  state: SimState,
  partyId: string,
): PartyDefinition | DynamicPartyDefinition | null {
  return world.partyDefinitions[partyId] ?? state.dynamicParties[partyId] ?? null;
}

export function isJoinablePartyId(world: KernelWorld, state: SimState, partyId: string): boolean {
  if (partyId === INDEPENDENT_AGGREGATE_ID || partyId === world.independentAggregatePartyId) {
    return false;
  }
  return resolvePartyDefinition(world, state, partyId) != null;
}

export function partyMembers(state: SimState, partyId: string): string[] {
  const out: string[] = [];
  for (const p of Object.values(state.politicians)) {
    if (p.partyId === partyId && p.alive && !p.retired) out.push(p.id);
  }
  return out.sort();
}

export function factionMembers(state: SimState, factionId: string): string[] {
  const out: string[] = [];
  for (const p of Object.values(state.politicians)) {
    if (p.factionId === factionId && p.alive && !p.retired) out.push(p.id);
  }
  return out.sort();
}

export function assemblyCaucus(world: KernelWorld, state: SimState, partyId: string): string[] {
  const asm = new Set(officesOfKind(world, "assembly_member").map((o) => o.id));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const officeId of asm) {
    for (const term of occupyingTerms(state, officeId)) {
      const pol = state.politicians[term.holderId];
      if (!pol || pol.partyId !== partyId || !pol.alive || pol.retired) continue;
      if (seen.has(pol.id)) continue;
      seen.add(pol.id);
      out.push(pol.id);
    }
  }
  return out.sort();
}

export function factionAssemblyCaucus(
  world: KernelWorld,
  state: SimState,
  factionId: string,
): string[] {
  const asm = new Set(officesOfKind(world, "assembly_member").map((o) => o.id));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const officeId of asm) {
    for (const term of occupyingTerms(state, officeId)) {
      const pol = state.politicians[term.holderId];
      if (!pol || pol.factionId !== factionId || !pol.alive || pol.retired) continue;
      if (seen.has(pol.id)) continue;
      seen.add(pol.id);
      out.push(pol.id);
    }
  }
  return out.sort();
}

export function meanLoyalty(
  world: KernelWorld,
  state: SimState,
  memberIds: readonly string[],
  key: "partyLoyalty" | "factionLoyalty",
): number {
  if (memberIds.length === 0) return 0.5;
  let sum = 0;
  for (const id of memberIds) {
    const profile = world.agentProfiles[id] ?? state.generatedAgentProfiles[id];
    const over = state.agentProfileOverrides[id]?.traits?.[key];
    sum += over ?? profile?.traits[key] ?? 0.5;
  }
  return sum / memberIds.length;
}
