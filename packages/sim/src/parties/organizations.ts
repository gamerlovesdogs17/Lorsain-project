import type { KernelWorld } from "../types.js";
import type { ProvincialPartyOrganization } from "./types.js";

export function provincialOrgId(partyId: string, provinceId: string): string {
  return `PORG:${partyId}:${provinceId}`;
}

export function parseProvincialOrgId(id: string): { partyId: string; provinceId: string } | null {
  if (!id.startsWith("PORG:")) return null;
  const rest = id.slice("PORG:".length);
  const colon = rest.lastIndexOf(":");
  if (colon <= 0 || colon === rest.length - 1) return null;
  return { partyId: rest.slice(0, colon), provinceId: rest.slice(colon + 1) };
}

export function buildProvincialPartyOrganizations(
  partyIds: readonly string[],
  provinceIds: readonly string[],
): Record<string, ProvincialPartyOrganization> {
  const out: Record<string, ProvincialPartyOrganization> = {};
  for (const partyId of [...partyIds].sort()) {
    for (const provinceId of [...provinceIds].sort()) {
      const id = provincialOrgId(partyId, provinceId);
      out[id] = { id, partyId, provinceId, status: "active" };
    }
  }
  return out;
}

export function resolveProvincialOrganization(
  world: KernelWorld,
  organizationId: string,
): ProvincialPartyOrganization | null {
  return world.provincialPartyOrganizations[organizationId] ?? null;
}
