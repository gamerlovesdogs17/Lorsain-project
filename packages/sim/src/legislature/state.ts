import { padId } from "../scheduler.js";
import { officesOfKind, occupyingTerms } from "../offices.js";
import type { KernelWorld, SimState } from "../types.js";
import { COMMITTEE_IDS, COMMITTEE_DIMENSIONS, emptyLegislatureRuntime } from "./types.js";
import type { CommitteeState, LegislatureRuntime } from "./types.js";
import { COMMITTEE_NAMES, LEGISLATURE } from "./policy.js";

export function currentAssemblyMemberIds(world: KernelWorld, state: SimState): string[] {
  const officeIds = new Set(officesOfKind(world, "assembly_member").map((o) => o.id));
  const ids = new Set<string>();
  for (const term of Object.values(state.officeTerms)) {
    if (term.status !== "active" && term.status !== "suspended") continue;
    if (!officeIds.has(term.officeId)) continue;
    const pol = state.politicians[term.holderId];
    if (!pol?.alive || pol.retired) continue;
    ids.add(term.holderId);
  }
  return [...ids].sort();
}

export function currentSpeakerId(world: KernelWorld, state: SimState): string | null {
  const speakerOffice = officesOfKind(world, "speaker")[0];
  if (!speakerOffice) return null;
  const terms = occupyingTerms(state, speakerOffice.id).filter((t) => t.status === "active");
  return terms[0]?.holderId ?? null;
}

export function currentPresidentId(world: KernelWorld, state: SimState): string | null {
  const office = officesOfKind(world, "president")[0];
  if (!office) return null;
  const terms = occupyingTerms(state, office.id).filter(
    (t) => t.status === "active" && t.holdingKind === "substantive",
  );
  return terms[0]?.holderId ?? null;
}

export function mpConstituencyId(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
): string | null {
  for (const term of Object.values(state.officeTerms)) {
    if (term.holderId !== politicianId) continue;
    if (term.status !== "active" && term.status !== "suspended") continue;
    const office = world.offices[term.officeId];
    if (office?.kind === "assembly_member") return office.constituencyId;
  }
  return null;
}

export function allocateBillId(state: SimState): string {
  return padId("BILL", state.counters.nextBillId++);
}

export function allocateAmendmentId(state: SimState): string {
  return padId("AMD", state.counters.nextAmendmentId++);
}

export function allocateLegislativeVoteId(state: SimState): string {
  return padId("LVOTE", state.counters.nextLegislativeVoteId++);
}

export function allocateLawId(state: SimState): string {
  return padId("LAW", state.counters.nextLawId++);
}

function largestRemainder(shares: number[], total: number): number[] {
  if (shares.length === 0 || total <= 0) return shares.map(() => 0);
  const sum = shares.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const even = Math.floor(total / shares.length);
    const out = shares.map(() => even);
    let used = even * shares.length;
    let i = 0;
    while (used < total) {
      out[i % out.length]! += 1;
      used += 1;
      i += 1;
    }
    return out;
  }
  const scaled = shares.map((s) => (s / sum) * total);
  const floors = scaled.map((x) => Math.floor(x));
  let used = floors.reduce((a, b) => a + b, 0);
  const order = scaled
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  let k = 0;
  while (used < total && k < order.length) {
    floors[order[k]!.i]! += 1;
    used += 1;
    k += 1;
  }
  return floors;
}

export function seedCommitteesIfNeeded(world: KernelWorld, state: SimState): void {
  if (Object.keys(state.legislatureRuntime.committees).length > 0) return;
  const mps = currentAssemblyMemberIds(world, state);
  if (mps.length === 0) return;
  const size = Math.min(
    LEGISLATURE.committeeSizeMax,
    Math.max(
      LEGISLATURE.committeeSizeMin,
      Math.floor(mps.length / 5) || LEGISLATURE.committeeSizeMin,
    ),
  );
  const byParty = new Map<string, string[]>();
  for (const id of mps) {
    const party = state.politicians[id]?.partyId ?? "_none";
    const list = byParty.get(party) ?? [];
    list.push(id);
    byParty.set(party, list);
  }
  for (const list of byParty.values()) {
    list.sort((a, b) => {
      const fa = state.politicians[a]?.factionId ?? "";
      const fb = state.politicians[b]?.factionId ?? "";
      if (fa !== fb) return fa < fb ? -1 : 1;
      return a < b ? -1 : 1;
    });
  }
  const parties = [...byParty.keys()].sort();
  const partyShares = parties.map((p) => byParty.get(p)!.length);
  const quotas = largestRemainder(partyShares, size);
  const assigned = new Set<string>();
  const committees: Record<string, CommitteeState> = {};
  for (const cid of COMMITTEE_IDS) {
    const members: string[] = [];
    const cursors = parties.map(() => 0);
    for (let p = 0; p < parties.length; p++) {
      const party = parties[p]!;
      const pool = byParty.get(party)!;
      const want = quotas[p]!;
      let got = 0;
      while (got < want && cursors[p]! < pool.length) {
        const id = pool[cursors[p]!]!;
        cursors[p]! += 1;
        if (assigned.has(id) && mps.length >= size * COMMITTEE_IDS.length) continue;
        members.push(id);
        assigned.add(id);
        got += 1;
      }
    }
    members.sort();
    committees[cid] = {
      id: cid,
      name: COMMITTEE_NAMES[cid],
      dimension: COMMITTEE_DIMENSIONS[cid],
      memberIds: members,
    };
  }
  const player = state.playerPoliticianId;
  if (
    mps.includes(player) &&
    ![...Object.values(committees)].some((c) => c.memberIds.includes(player))
  ) {
    const host = committees.COMMITTEE_INSTITUTIONAL!;
    if (!host.memberIds.includes(player)) {
      if (host.memberIds.length >= size) host.memberIds.pop();
      host.memberIds.push(player);
      host.memberIds.sort();
    }
  }
  state.legislatureRuntime.committees = committees;
}

export { emptyLegislatureRuntime };
export type { LegislatureRuntime };
