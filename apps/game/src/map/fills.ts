import type { KernelWorld, SimState } from "@lorsain/sim";
import { partyColor } from "../presentation.js";
import type { PreparedPath } from "@lorsain/map";
import type { MapMode } from "./TerenaMap.js";

/** Sitting MP party is public office occupancy — never latent voter support. */
export function constituencySittingPartyId(
  world: KernelWorld,
  snap: SimState,
  constituencyId: string,
): string | null {
  for (const term of Object.values(snap.officeTerms)) {
    if (term.status !== "active" && term.status !== "suspended") continue;
    if (world.offices[term.officeId]?.constituencyId !== constituencyId) continue;
    return snap.politicians[term.holderId]?.partyId ?? null;
  }
  return null;
}

export function latestPublicPoll(snap: SimState): (typeof snap.polls)[string] | undefined {
  const polls = Object.values(snap.polls).sort((a, b) =>
    a.publicationDate < b.publicationDate ? 1 : a.publicationDate > b.publicationDate ? -1 : 0,
  );
  return polls[0] ?? undefined;
}

export function mapFillFor(
  mode: MapMode,
  world: KernelWorld,
  snap: SimState,
  feature: PreparedPath,
  kind: "province" | "constituency",
  campaignOrg?: Record<string, number>,
): string {
  if (mode === "economy" && kind === "province") {
    const idx = snap.economyRuntime.provinces[feature.id]?.conditionsIndex ?? 100;
    const t = Math.max(0, Math.min(1, (idx - 90) / 20));
    return `hsl(152, 22%, ${86 - t * 20}%)`;
  }
  if (mode === "campaign" && kind === "constituency" && campaignOrg) {
    const org = campaignOrg[feature.id] ?? 0;
    const t = Math.max(0, Math.min(1, org));
    return `rgba(31, 58, 95, ${0.08 + t * 0.45})`;
  }
  if ((mode === "political" || mode === "election") && kind === "constituency") {
    return partyColor(world, constituencySittingPartyId(world, snap, feature.id));
  }
  if (mode === "organizations" && kind === "province") {
    return "#e8eee8";
  }
  return kind === "province" ? "#e7efe6" : "transparent";
}
