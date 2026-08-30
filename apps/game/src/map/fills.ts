import type { KernelWorld, SimState } from "@lorsain/sim";
import { partyColor } from "../presentation.js";
import type { PreparedPath } from "@lorsain/map";
import type { MapMode } from "./TerenaMap.js";

/** Neutral fill for exact sitting-seat ties. Sitting representation only — not voter support. */
export const CONSTITUENCY_TIE_FILL = "#cfc9bd";

export type ConstituencySeatShare = {
  partyId: string | null;
  seats: number;
};

function sittingAssemblyTermsForConstituency(
  world: KernelWorld,
  snap: SimState,
  constituencyId: string,
): Array<{ holderId: string; partyId: string | null }> {
  const out: Array<{ holderId: string; partyId: string | null }> = [];
  for (const term of Object.values(snap.officeTerms)) {
    if (term.status !== "active" && term.status !== "suspended") continue;
    const office = world.offices[term.officeId];
    if (office?.kind !== "assembly_member") continue;
    if (office.constituencyId !== constituencyId) continue;
    const pol = snap.politicians[term.holderId];
    if (!pol?.alive || pol.retired) continue;
    out.push({ holderId: term.holderId, partyId: pol.partyId ?? null });
  }
  out.sort((a, b) => a.holderId.localeCompare(b.holderId));
  return out;
}

/** Public sitting-seat counts by party within a multi-member constituency. */
export function constituencySittingSeatBreakdown(
  world: KernelWorld,
  snap: SimState,
  constituencyId: string,
): ConstituencySeatShare[] {
  const counts = new Map<string, number>();
  for (const row of sittingAssemblyTermsForConstituency(world, snap, constituencyId)) {
    const key = row.partyId ?? "none";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, seats]) => ({ partyId: key === "none" ? null : key, seats }))
    .sort((a, b) => {
      if (b.seats !== a.seats) return b.seats - a.seats;
      return (a.partyId ?? "").localeCompare(b.partyId ?? "");
    });
}

/**
 * Plurality sitting party for map coloring.
 * Exact ties return `"tie"` so the map uses a neutral fill rather than an arbitrary first MP.
 */
export function constituencySittingPluralityPartyId(
  world: KernelWorld,
  snap: SimState,
  constituencyId: string,
): string | null | "tie" {
  const rows = constituencySittingSeatBreakdown(world, snap, constituencyId);
  if (rows.length === 0) return null;
  if (rows.length >= 2 && rows[0]!.seats === rows[1]!.seats) return "tie";
  return rows[0]!.partyId;
}

/** Sitting MP plurality party is public office occupancy — never latent voter support. */
export function constituencySittingPartyId(
  world: KernelWorld,
  snap: SimState,
  constituencyId: string,
): string | null {
  const plurality = constituencySittingPluralityPartyId(world, snap, constituencyId);
  if (plurality === "tie") return null;
  return plurality;
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
  campaignProvinceOrg?: Record<string, number>,
  electionId?: string | null,
): string {
  if (mode === "economy" && kind === "province") {
    const idx = snap.economyRuntime.provinces[feature.id]?.conditionsIndex;
    if (idx == null) return "#dedbd3";
    const t = Math.max(0, Math.min(1, (idx - 90) / 20));
    return `hsl(152, 22%, ${86 - t * 20}%)`;
  }
  if (mode === "campaign" && kind === "constituency" && campaignOrg) {
    const org = campaignOrg[feature.id] ?? 0;
    const t = Math.max(0, Math.min(1, org));
    return `rgba(31, 58, 95, ${0.08 + t * 0.45})`;
  }
  if (mode === "campaign" && kind === "province" && campaignProvinceOrg) {
    const org = campaignProvinceOrg[feature.id] ?? 0;
    const t = Math.max(0, Math.min(1, org));
    return `hsl(216, 34%, ${91 - t * 35}%)`;
  }
  if (mode === "political" && kind === "constituency") {
    const plurality = constituencySittingPluralityPartyId(world, snap, feature.id);
    if (plurality === "tie") return CONSTITUENCY_TIE_FILL;
    return partyColor(world, plurality);
  }
  if (mode === "election") {
    const provincial = electionId ? snap.provincialRuntime.elections[electionId] : null;
    if (kind === "province" && provincial) {
      const race = Object.values(snap.provincialRuntime.elections).find((candidate) => candidate.provinceId === feature.id && candidate.date.slice(0, 4) === provincial.date.slice(0, 4));
      const winner = race?.winnerId;
      return winner ? partyColor(world, race.candidates[winner]?.partyId ?? null) : "#dedbd3";
    }
    const provincialAssembly = electionId ? snap.provincialRuntime.assemblyElections[electionId] : null;
    if (kind === "province" && provincialAssembly) {
      const race = Object.values(snap.provincialRuntime.assemblyElections).find((candidate) => candidate.provinceId === feature.id && candidate.date.slice(0, 4) === provincialAssembly.date.slice(0, 4));
      if (race?.status !== "resolved") return "#dedbd3";
      const ranked = Object.entries(race.partySeats).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      if (ranked.length > 1 && ranked[0]![1] === ranked[1]![1]) return CONSTITUENCY_TIE_FILL;
      return partyColor(world, ranked[0]?.[0] ?? null);
    }
    if (kind === "constituency") {
      const selected = electionId ? snap.elections[electionId] : undefined;
      const election = selected ?? Object.values(snap.elections)
        .filter((candidate) => candidate.type === "assembly" && candidate.geographyKind === "national")
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      const result = election?.assembly?.constituencyResults[feature.id];
      if (result) {
        const seats = new Map<string, number>();
        for (const winnerId of result.electedIds) {
          const partyId = result.partyByCandidate[winnerId] ?? "none";
          seats.set(partyId, (seats.get(partyId) ?? 0) + 1);
        }
        const ranked = [...seats.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        if (ranked.length > 1 && ranked[0]![1] === ranked[1]![1]) return CONSTITUENCY_TIE_FILL;
        return partyColor(world, ranked[0]?.[0] === "none" ? null : ranked[0]?.[0] ?? null);
      }
      const polls = Object.values(snap.polls)
        .filter((poll) => poll.electionId === election?.id && poll.constituencyId === feature.id)
        .sort((a, b) => b.publicationDate.localeCompare(a.publicationDate));
      const leaders = polls[0]?.firstPreference.slice().sort((a, b) => b.share - a.share);
      if (leaders?.length) {
        if (leaders.length > 1 && Math.abs(leaders[0]!.share - leaders[1]!.share) < 0.000001) return CONSTITUENCY_TIE_FILL;
        return partyColor(world, leaders[0]!.partyId);
      }
      return "#dedbd3";
    }
  }
  return kind === "province" ? "#e7efe6" : "none";
}
