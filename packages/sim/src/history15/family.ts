import { ensurePoliticsRuntime } from "../politics/state.js";
import type { PartyFamilyLink } from "../politics/types.js";
import type { SimState } from "../types.js";

/** All family-tree links involving a party (from politicsRuntime.partyFamilyHistory). */
export function partyFamilyLinksFor(state: SimState, partyId: string): PartyFamilyLink[] {
  const runtime = ensurePoliticsRuntime(state);
  return runtime.partyFamilyHistory.filter(
    (link) => link.partyId === partyId || link.relatedPartyId === partyId,
  );
}

/** Direct parents / sources recorded for a party (split_from / formed related). */
export function partyFamilyParents(state: SimState, partyId: string): PartyFamilyLink[] {
  return partyFamilyLinksFor(state, partyId).filter(
    (link) =>
      link.partyId === partyId &&
      (link.event === "split_from" || link.event === "formed") &&
      link.relatedPartyId != null,
  );
}

/** Direct children / successors recorded from a party. */
export function partyFamilyChildren(state: SimState, partyId: string): PartyFamilyLink[] {
  const runtime = ensurePoliticsRuntime(state);
  return runtime.partyFamilyHistory.filter(
    (link) =>
      link.relatedPartyId === partyId &&
      (link.event === "split_from" || link.event === "formed" || link.event === "merged_into"),
  );
}

/** Flat chronological family history for UI timelines. */
export function partyFamilyTimeline(state: SimState, partyId?: string): PartyFamilyLink[] {
  const runtime = ensurePoliticsRuntime(state);
  const rows = partyId
    ? runtime.partyFamilyHistory.filter(
        (link) => link.partyId === partyId || link.relatedPartyId === partyId,
      )
    : [...runtime.partyFamilyHistory];
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.partyId.localeCompare(b.partyId));
}
