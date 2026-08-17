import { occupyingTerms } from "@lorsain/sim";
import type { KernelWorld, SimState } from "@lorsain/sim";
import {
  currentAssemblyMemberIds,
  currentPresidentialAuthorityId,
  currentSpeakerId,
  deriveCabinet,
} from "@lorsain/sim";

export function politicianName(figures: Map<string, { name: string }>, id: string): string {
  return figures.get(id)?.name ?? id;
}

export function partyName(world: KernelWorld, partyId: string | null): string {
  if (!partyId) return "Independent";
  return world.partyDefinitions[partyId]?.name ?? partyId;
}

export function qualitativeStanding(n: number | undefined): string {
  if (n == null) return "unknown";
  if (n >= 0.7) return "high";
  if (n >= 0.5) return "solid";
  if (n >= 0.35) return "mixed";
  return "weak";
}

export function playerOffices(world: KernelWorld, state: SimState, id: string): string[] {
  const titles: string[] = [];
  for (const term of Object.values(state.officeTerms)) {
    if (term.holderId !== id) continue;
    if (term.status !== "active" && term.status !== "suspended") continue;
    const office = world.offices[term.officeId];
    if (!office) continue;
    const acting = term.holdingKind === "acting" ? " (acting)" : "";
    titles.push(`${office.title}${acting}`);
  }
  return titles;
}

export function isMp(world: KernelWorld, state: SimState, id: string): boolean {
  return currentAssemblyMemberIds(world, state).includes(id);
}

export function isSpeaker(world: KernelWorld, state: SimState, id: string): boolean {
  return currentSpeakerId(world, state) === id;
}

export function isPresident(world: KernelWorld, state: SimState, id: string): boolean {
  return currentPresidentialAuthorityId(world, state) === id;
}

export function playerCampaign(state: SimState) {
  return Object.values(state.campaignRuntime.campaigns).find(
    (c) =>
      c.politicianId === state.playerPoliticianId &&
      (c.status === "active" || c.status === "exploring"),
  );
}

export function cabinet(world: KernelWorld, state: SimState) {
  return deriveCabinet(world, state);
}

export function holdersOfKind(world: KernelWorld, state: SimState, officeId: string): string[] {
  return occupyingTerms(state, officeId)
    .filter((t) => t.status === "active")
    .map((t) => t.holderId);
}
