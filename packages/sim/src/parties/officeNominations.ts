/**
 * Phase 14 — Governor / National Assembly party nomination contests.
 *
 * Reuses PartyContest + NominationRuleDefinition machinery (declare → qualify →
 * IRV/plurality resolve). Presidential nominations remain the full calendar path;
 * this module opens short officeNomination contests when a gubernatorial or
 * assembly race is open and the party has a non-"none" nomination rule.
 *
 * Assembly unit = (partyId, electionId, constituencyId) with multi-nominee
 * slates via metadata.nominationSlots + metadata.winnerIds (winnerId = first).
 * Gubernatorial remains province-keyed (one contest per party per election).
 */
import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { pushHistory } from "../scheduler.js";
import { createCampaignRecord } from "../campaigns/state.js";
import { attachNominationMethodMetadata } from "../campaigns/nominations.js";
import { officesOfKind, occupyingTerms } from "../offices.js";
import {
  createPartyContest,
  declareCandidacy,
  openPartyContest,
  resolvePartyContest,
} from "./contests.js";
import { resolveContestCount } from "./nominations.js";
import { membershipPartyIds, partyMembers, resolvePartyDefinition } from "./queries.js";
import { INDEPENDENT_AGGREGATE_ID } from "./policy.js";
import type { PartyContest, PartyContestType } from "./types.js";
import { emptyQualificationEvidence } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

export type OfficeNominationKind = "gubernatorial" | "assembly";

export type OfficeNominationCycleMetadata = {
  officeKind: OfficeNominationKind;
  electionId: string;
  electionDate: string;
  partyId: string;
  provinceId?: string;
  constituencyId?: string;
  nominationSlots?: number;
  candidateSource: "scenario_start" | "runtime_politics";
};

export function isOfficeNominationContestType(
  type: PartyContestType | string,
): type is "gubernatorial_nomination" | "assembly_nomination" {
  return type === "gubernatorial_nomination" || type === "assembly_nomination";
}

export function officeNominationCycleMetadata(
  contest: PartyContest,
): OfficeNominationCycleMetadata | null {
  if (!isOfficeNominationContestType(contest.type)) return null;
  const electionId = contest.metadata.electionId;
  const electionDate = contest.metadata.electionDate;
  const partyId = contest.metadata.partyId;
  const officeKind = contest.metadata.officeKind;
  const candidateSource = contest.metadata.candidateSource;
  if (
    typeof electionId !== "string" ||
    typeof electionDate !== "string" ||
    typeof partyId !== "string" ||
    (officeKind !== "gubernatorial" && officeKind !== "assembly") ||
    (candidateSource !== "scenario_start" && candidateSource !== "runtime_politics")
  ) {
    return null;
  }
  const nominationSlots =
    typeof contest.metadata.nominationSlots === "number" &&
    Number.isFinite(contest.metadata.nominationSlots)
      ? Math.max(1, Math.floor(contest.metadata.nominationSlots))
      : undefined;
  return {
    officeKind,
    electionId,
    electionDate,
    partyId,
    ...(typeof contest.metadata.provinceId === "string"
      ? { provinceId: contest.metadata.provinceId }
      : {}),
    ...(typeof contest.metadata.constituencyId === "string"
      ? { constituencyId: contest.metadata.constituencyId }
      : {}),
    ...(nominationSlots != null ? { nominationSlots } : {}),
    candidateSource,
  };
}

/** Resolved nominee slate; falls back to winnerId for legacy single-winner contests. */
export function officeNominationWinnerIds(contest: PartyContest): string[] {
  const raw = contest.metadata.winnerIds;
  if (Array.isArray(raw) && raw.length > 0 && raw.every((id) => typeof id === "string")) {
    return [...new Set(raw as string[])];
  }
  return contest.winnerId ? [contest.winnerId] : [];
}

export function officeNominationContestKey(
  partyId: string,
  electionId: string,
  constituencyId: string | null | undefined,
): string {
  return `${partyId}::${electionId}::${constituencyId ?? ""}`;
}

export function officeNominationContestsForElection(
  state: SimState,
  electionId: string,
  officeKind?: OfficeNominationKind,
): PartyContest[] {
  return Object.values(state.partyContests)
    .filter((contest) => {
      if (!isOfficeNominationContestType(contest.type)) return false;
      const meta = officeNominationCycleMetadata(contest);
      if (!meta || meta.electionId !== electionId) return false;
      if (officeKind && meta.officeKind !== officeKind) return false;
      return true;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function contestTypeForKind(kind: OfficeNominationKind): PartyContestType {
  return kind === "gubernatorial" ? "gubernatorial_nomination" : "assembly_nomination";
}

/** True when party rules demand a nomination contest for gubernatorial/assembly offices. */
export function partyRequiresOfficeNomination(
  world: KernelWorld,
  state: SimState,
  partyId: string | null | undefined,
): boolean {
  if (!partyId) return false;
  if (partyId === INDEPENDENT_AGGREGATE_ID || partyId === world.independentAggregatePartyId) {
    return false;
  }
  const def = resolvePartyDefinition(world, state, partyId);
  if (!def?.nominationRuleId) return false;
  const rule = world.nominationRules[def.nominationRuleId];
  if (!rule || rule.method === "none") return false;
  return true;
}

function partyAllowsNomination(world: KernelWorld, state: SimState, partyId: string): boolean {
  return partyRequiresOfficeNomination(world, state, partyId);
}

function seedDeclaredEntries(state: SimState, partyId: string, maxCandidates: number): string[] {
  const members = partyMembers(state, partyId);
  const scored = members
    .map((id) => {
      const standing = state.candidateStanding[id];
      const score =
        (standing?.nameRecognition ?? 0.2) * 0.5 +
        ((standing?.favorability ?? 0) + 1) / 4 +
        (standing?.momentum ?? 0) * 0.1;
      return { id, score };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, maxCandidates).map((row) => row.id);
}

function partyIncumbentConstituencyIds(
  state: SimState,
  world: KernelWorld,
  partyId: string,
): Set<string> {
  const out = new Set<string>();
  for (const office of officesOfKind(world, "assembly_member")) {
    if (!office.constituencyId) continue;
    for (const term of occupyingTerms(state, office.id)) {
      if (state.politicians[term.holderId]?.partyId === partyId) {
        out.add(office.constituencyId);
      }
    }
  }
  return out;
}

function partySeatShareForElection(
  state: SimState,
  world: KernelWorld,
  electionId: string,
  partyId: string,
): number {
  const election = state.elections[electionId];
  const totals =
    election?.assembly?.previousPartySeatTotals &&
    Object.keys(election.assembly.previousPartySeatTotals).length > 0
      ? election.assembly.previousPartySeatTotals
      : (() => {
          const live: Record<string, number> = {};
          for (const office of officesOfKind(world, "assembly_member")) {
            for (const term of occupyingTerms(state, office.id)) {
              const pid = state.politicians[term.holderId]?.partyId ?? "independent";
              live[pid] = (live[pid] ?? 0) + 1;
            }
          }
          return live;
        })();
  const partySeats = totals[partyId] ?? 0;
  const totalSeats = Object.values(totals).reduce((sum, n) => sum + n, 0);
  const chamber = world.legislativeConstitution.assemblySeatCount || totalSeats;
  return partySeats / Math.max(1, totalSeats || chamber);
}

/** Slots to nominate for a constituency: 1..magnitude from expected seats. */
export function assemblyNominationSlots(
  state: SimState,
  world: KernelWorld,
  args: { electionId: string; partyId: string; constituencyId: string },
): number {
  const magnitude = Math.max(1, world.constituencyElectorate[args.constituencyId]?.seats ?? 1);
  const share = partySeatShareForElection(state, world, args.electionId, args.partyId);
  const expected = share * magnitude;
  const incumbents = partyIncumbentConstituencyIds(state, world, args.partyId).has(
    args.constituencyId,
  )
    ? 1
    : 0;
  const rounded = Math.max(incumbents, Math.round(expected), expected >= 0.35 ? 1 : 0);
  return Math.max(1, Math.min(magnitude, rounded || 1));
}

/**
 * Constituencies a party should open nomination contests for: incumbents plus
 * seats with meaningful expected strength, capped near expected seat haul.
 */
export function assemblyConstituenciesWorthContesting(
  state: SimState,
  world: KernelWorld,
  electionId: string,
  partyId: string,
): string[] {
  const constituencyIds = Object.keys(world.constituencyElectorate).sort();
  if (constituencyIds.length === 0) return [];
  const incumbents = partyIncumbentConstituencyIds(state, world, partyId);
  const share = partySeatShareForElection(state, world, electionId, partyId);
  const election = state.elections[electionId];
  const partySeats =
    election?.assembly?.previousPartySeatTotals?.[partyId] ??
    Math.round(share * (world.legislativeConstitution.assemblySeatCount || constituencyIds.length));

  const scored = constituencyIds.map((constituencyId) => {
    const magnitude = world.constituencyElectorate[constituencyId]!.seats;
    const expected = share * magnitude;
    const incumbentBonus = incumbents.has(constituencyId) ? 2 : 0;
    return {
      constituencyId,
      score: expected + incumbentBonus,
      expected,
      incumbent: incumbents.has(constituencyId),
    };
  });
  scored.sort((a, b) => b.score - a.score || a.constituencyId.localeCompare(b.constituencyId));

  const target = Math.max(
    incumbents.size,
    Math.min(
      constituencyIds.length,
      Math.max(
        share >= 0.02 ? Math.ceil(Math.max(partySeats, 1) * 1.2) : incumbents.size,
        scored.filter((row) => row.incumbent || row.expected >= 0.35).length,
      ),
    ),
  );

  const selected = new Set<string>();
  for (const row of scored) {
    if (row.incumbent || row.expected >= 0.35) selected.add(row.constituencyId);
  }
  for (const row of scored) {
    if (selected.size >= target) break;
    selected.add(row.constituencyId);
  }
  return [...selected].sort();
}

/** Active nomination winners for a party on one constituency field. */
export function assemblyNomineesForConstituency(
  state: SimState,
  electionId: string,
  partyId: string,
  constituencyId: string,
): string[] {
  const winners: string[] = [];
  for (const contest of officeNominationContestsForElection(state, electionId, "assembly")) {
    if (contest.partyId !== partyId || contest.status !== "resolved") continue;
    const meta = officeNominationCycleMetadata(contest);
    if (!meta || meta.constituencyId !== constituencyId) continue;
    for (const id of officeNominationWinnerIds(contest)) {
      if (!winners.includes(id)) winners.push(id);
    }
  }
  return winners;
}

function seedAssemblyEntries(
  state: SimState,
  world: KernelWorld,
  partyId: string,
  constituencyId: string,
  maxCandidates: number,
): string[] {
  const preferred: string[] = [];
  for (const office of officesOfKind(world, "assembly_member")) {
    if (office.constituencyId !== constituencyId) continue;
    for (const term of occupyingTerms(state, office.id)) {
      if (state.politicians[term.holderId]?.partyId === partyId) {
        preferred.push(term.holderId);
      }
    }
  }
  const rest = seedDeclaredEntries(state, partyId, maxCandidates * 2).filter(
    (id) => !preferred.includes(id),
  );
  return [...preferred, ...rest].slice(0, maxCandidates);
}

function createSeededOfficeContest(
  state: SimState,
  world: KernelWorld,
  args: {
    officeKind: OfficeNominationKind;
    electionId: string;
    electionDate: string;
    partyId: string;
    provinceId?: string;
    constituencyId?: string;
    nominationSlots?: number;
    maxCandidates: number;
    commandId?: string | null;
  },
): { contest: PartyContest; events: SimEvent[] } | null {
  const slots = args.nominationSlots ?? 1;
  const created = createPartyContest(
    state,
    world,
    {
      type: contestTypeForKind(args.officeKind),
      partyId: args.partyId,
      metadata: {
        officeKind: args.officeKind,
        electionId: args.electionId,
        electionDate: args.electionDate,
        partyId: args.partyId,
        provinceId: args.provinceId ?? null,
        constituencyId: args.constituencyId ?? null,
        nominationSlots: slots,
        winnerIds: [],
        candidateSource: "runtime_politics",
      },
    },
    args.commandId ?? null,
  );
  if ("error" in created) return null;
  const events: SimEvent[] = [...created.events];
  const seedCount = Math.max(args.maxCandidates, slots + 1);
  const seeds =
    args.officeKind === "assembly" && args.constituencyId
      ? seedAssemblyEntries(state, world, args.partyId, args.constituencyId, seedCount)
      : seedDeclaredEntries(state, args.partyId, seedCount);
  for (const politicianId of seeds) {
    const declared = declareCandidacy(
      state,
      world,
      created.contest.id,
      politicianId,
      args.commandId ?? null,
    );
    if ("error" in declared) {
      created.contest.entries[politicianId] = {
        politicianId,
        status: "declared",
        declaredDate: state.currentDate,
        qualificationEvidence: emptyQualificationEvidence(),
        seedPresidentialStatus: null,
      };
    } else {
      events.push(...declared.events);
    }
  }
  return { contest: created.contest, events };
}

/**
 * Ensure office nomination contests for an open gubernatorial or assembly election.
 * Assembly: one contest per (party, election, constituency) worth contesting.
 * Gubernatorial: one contest per party (province-keyed); early-returns if any exist.
 */
export function ensureOfficeNominationContests(
  state: SimState,
  world: KernelWorld,
  args: {
    officeKind: OfficeNominationKind;
    electionId: string;
    electionDate: string;
    provinceId?: string;
    constituencyId?: string;
    constituencyIds?: string[];
    partyIds?: string[];
    maxCandidatesPerParty?: number;
    commandId?: string | null;
  },
): { contests: PartyContest[]; events: SimEvent[] } {
  const existing = officeNominationContestsForElection(state, args.electionId, args.officeKind);
  if (args.officeKind === "gubernatorial" && existing.length > 0) {
    return { contests: existing, events: [] };
  }

  const events: SimEvent[] = [];
  const partyIds = (
    args.partyIds ?? [...membershipPartyIds(world), ...Object.keys(state.dynamicParties)]
  )
    .filter((id, index, all) => all.indexOf(id) === index)
    .sort();
  const maxCandidates = args.maxCandidatesPerParty ?? 4;

  if (args.officeKind === "gubernatorial") {
    for (const partyId of partyIds) {
      if (!partyAllowsNomination(world, state, partyId)) continue;
      const created = createSeededOfficeContest(state, world, {
        officeKind: "gubernatorial",
        electionId: args.electionId,
        electionDate: args.electionDate,
        partyId,
        ...(args.provinceId != null ? { provinceId: args.provinceId } : {}),
        nominationSlots: 1,
        maxCandidates,
        ...(args.commandId !== undefined ? { commandId: args.commandId } : {}),
      });
      if (created) events.push(...created.events);
    }
    return {
      contests: officeNominationContestsForElection(state, args.electionId, "gubernatorial"),
      events,
    };
  }

  const existingKeys = new Set(
    existing.map((contest) => {
      const meta = officeNominationCycleMetadata(contest);
      return officeNominationContestKey(
        contest.partyId,
        args.electionId,
        meta?.constituencyId ?? null,
      );
    }),
  );

  for (const partyId of partyIds) {
    if (!partyAllowsNomination(world, state, partyId)) continue;
    const targets =
      args.constituencyIds?.slice().sort() ??
      (args.constituencyId
        ? [args.constituencyId]
        : assemblyConstituenciesWorthContesting(state, world, args.electionId, partyId));
    for (const constituencyId of targets) {
      if (!world.constituencyElectorate[constituencyId]) continue;
      const key = officeNominationContestKey(partyId, args.electionId, constituencyId);
      if (existingKeys.has(key)) continue;
      const slots = assemblyNominationSlots(state, world, {
        electionId: args.electionId,
        partyId,
        constituencyId,
      });
      const created = createSeededOfficeContest(state, world, {
        officeKind: "assembly",
        electionId: args.electionId,
        electionDate: args.electionDate,
        partyId,
        constituencyId,
        nominationSlots: slots,
        maxCandidates,
        ...(args.commandId !== undefined ? { commandId: args.commandId } : {}),
      });
      if (created) {
        existingKeys.add(key);
        events.push(...created.events);
      }
    }
  }

  return {
    contests: officeNominationContestsForElection(state, args.electionId, "assembly"),
    events,
  };
}

/** Open planned office nomination contests for an election. */
export function openOfficeNominationContests(
  state: SimState,
  electionId: string,
  officeKind: OfficeNominationKind,
  commandId: string | null,
): SimEvent[] {
  const events: SimEvent[] = [];
  for (const contest of officeNominationContestsForElection(state, electionId, officeKind)) {
    if (contest.status !== "planned") continue;
    const opened = openPartyContest(state, contest.id, commandId);
    if (!("error" in opened)) events.push(...opened.events);
  }
  return events;
}

/**
 * After the primary IRV resolve, fill remaining nomination slots by sequential IRV
 * (remove winners and re-count). Stores metadata.winnerIds; keeps winnerId = first.
 */
function fillAdditionalNominationWinners(
  state: SimState,
  world: KernelWorld,
  contestId: string,
  rng: RngService,
  slots: number,
): string[] {
  const contest = state.partyContests[contestId];
  if (!contest || !contest.winnerId) return [];
  const winners = [contest.winnerId];
  if (slots <= 1) {
    contest.metadata.winnerIds = winners;
    contest.metadata.nominationSlots = slots;
    return winners;
  }

  const originalStatuses = new Map(
    Object.values(contest.entries).map((entry) => [entry.politicianId, entry.status] as const),
  );
  const originallyCounted = new Set(contest.countInput?.candidateIds ?? [contest.winnerId]);

  while (winners.length < slots) {
    for (const entry of Object.values(contest.entries)) {
      if (winners.includes(entry.politicianId)) {
        entry.status = "withdrawn";
      } else if (originallyCounted.has(entry.politicianId)) {
        entry.status = "qualified";
      }
    }
    const remaining = Object.values(contest.entries).filter((e) => e.status === "qualified");
    if (remaining.length === 0) break;
    if (remaining.length === 1) {
      winners.push(remaining[0]!.politicianId);
      break;
    }
    const counted = resolveContestCount(world, state, contest, rng);
    if ("error" in counted) break;
    const next = counted.archive.elected;
    if (!next || winners.includes(next)) break;
    winners.push(next);
  }

  for (const entry of Object.values(contest.entries)) {
    const prior = originalStatuses.get(entry.politicianId);
    if (entry.politicianId === winners[0]) {
      entry.status = "winner";
    } else if (originallyCounted.has(entry.politicianId)) {
      entry.status = "eliminated";
    } else if (prior) {
      entry.status = prior;
    }
  }
  // Subsequent slate members stay "eliminated" on the contest record (compat with
  // single-winner PartyContest validation) but are listed in metadata.winnerIds.
  contest.metadata.winnerIds = winners;
  contest.metadata.nominationSlots = slots;
  return winners;
}

/**
 * Resolve open office nomination contests (plurality / RCV via resolvePartyContest)
 * and sync winners onto the election field + campaign metadata.
 */
export function resolveOfficeNominationContests(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  electionId: string,
  officeKind: OfficeNominationKind,
  commandId: string | null,
): SimEvent[] {
  const events: SimEvent[] = [];
  for (const contest of officeNominationContestsForElection(state, electionId, officeKind)) {
    const live = state.partyContests[contest.id];
    if (!live || live.status === "resolved" || live.status === "cancelled") continue;
    if (live.status === "planned") {
      const opened = openPartyContest(state, live.id, commandId);
      if (!("error" in opened)) events.push(...opened.events);
    }
    const current = state.partyContests[contest.id];
    if (!current || current.status === "resolved" || current.status === "cancelled") continue;

    const declared = Object.values(current.entries).filter(
      (e) => e.status === "declared" || e.status === "qualified" || e.status === "exploring",
    );
    if (declared.length === 0) continue;

    if (declared.length === 1) {
      for (const entry of declared) entry.status = "qualified";
    }

    const resolved = resolvePartyContest(state, world, current.id, rng, commandId);
    if ("error" in resolved) continue;
    events.push(...resolved.events);

    const meta = officeNominationCycleMetadata(current);
    const slots =
      meta?.nominationSlots ??
      (typeof current.metadata.nominationSlots === "number"
        ? Math.max(1, Math.floor(current.metadata.nominationSlots))
        : 1);
    fillAdditionalNominationWinners(state, world, current.id, rng, slots);

    const synced = syncOfficeNominationWinnerToElection(state, world, current.id, commandId);
    if (!("error" in synced)) events.push(...synced.events);
  }
  return events;
}

export function syncOfficeNominationWinnerToElection(
  state: SimState,
  world: KernelWorld,
  contestId: string,
  commandId: string | null = null,
): { events: SimEvent[] } | { error: CommandError } {
  const contest = state.partyContests[contestId];
  if (!contest || !isOfficeNominationContestType(contest.type) || contest.status !== "resolved") {
    return { error: reject("INVALID_CONTEST", contestId) };
  }
  if (!contest.winnerId) return { error: reject("INVALID_CONTEST", "no winner") };
  const meta = officeNominationCycleMetadata(contest);
  if (!meta) return { error: reject("INVALID_CONTEST", "missing office nomination metadata") };

  const events: SimEvent[] = [];
  const winners = officeNominationWinnerIds(contest);
  const winnerSet = new Set(winners);
  const primary = winners[0] ?? contest.winnerId;

  if (meta.officeKind === "gubernatorial") {
    const election = state.provincialRuntime.elections[meta.electionId];
    if (
      election &&
      election.status !== "resolved" &&
      election.status !== "assumed" &&
      election.status !== "field_finalized"
    ) {
      for (const cand of Object.values(election.candidates)) {
        if (
          cand.partyId === contest.partyId &&
          !winnerSet.has(cand.politicianId) &&
          !cand.withdrawn
        ) {
          cand.withdrawn = true;
        }
      }
      for (const winner of winners) {
        election.candidates[winner] = {
          politicianId: winner,
          partyId: contest.partyId,
          filedDate: contest.resolvedDate ?? state.currentDate,
          incumbent: election.incumbentId === winner,
          source: winner === state.playerPoliticianId ? "player" : "npc",
          withdrawn: false,
          sourceContestId: contest.id,
        };
      }
      if (election.status === "planned") election.status = "filing_open";

      const existingCampaign = Object.values(state.campaignRuntime.campaigns).find(
        (c) =>
          c.politicianId === primary &&
          c.type === "gubernatorial" &&
          (c.electionId === election.id || c.metadata.provinceId === election.provinceId) &&
          (c.status === "active" || c.status === "exploring"),
      );
      if (existingCampaign) {
        existingCampaign.contestId = contest.id;
        existingCampaign.electionId = election.id;
        existingCampaign.metadata.nominationWinner = true;
        existingCampaign.metadata.sourceContestId = contest.id;
        attachNominationMethodMetadata(world, state, existingCampaign);
      } else {
        const camp = createCampaignRecord(state, world, {
          politicianId: primary,
          type: "gubernatorial",
          contestId: contest.id,
          electionId: election.id,
          status: "active",
          metadata: {
            provinceId: election.provinceId,
            nominationWinner: true,
            sourceContestId: contest.id,
          },
        });
        attachNominationMethodMetadata(world, state, camp);
      }
    }
  } else {
    const election = state.elections[meta.electionId];
    if (
      election &&
      election.type === "assembly" &&
      !election.fieldFinalized &&
      election.status !== "resolved" &&
      election.status !== "cancelled"
    ) {
      const cycle = election.assembly;
      const constituencyId = meta.constituencyId ?? null;

      if (cycle && constituencyId) {
        for (const candidacy of Object.values(cycle.candidacies)) {
          if (
            candidacy.partyId === contest.partyId &&
            candidacy.constituencyId === constituencyId &&
            !winnerSet.has(candidacy.politicianId) &&
            candidacy.status !== "withdrawn"
          ) {
            candidacy.status = "withdrawn";
            if (election.candidates[candidacy.politicianId]) {
              election.candidates[candidacy.politicianId]!.withdrawn = true;
            }
            const field = cycle.constituencyFields[constituencyId];
            if (field) {
              field.candidateIds = field.candidateIds.filter((id) => id !== candidacy.politicianId);
            }
          }
        }
      } else {
        for (const cand of Object.values(election.candidates)) {
          if (
            cand.partyId === contest.partyId &&
            !winnerSet.has(cand.politicianId) &&
            !cand.withdrawn
          ) {
            cand.withdrawn = true;
          }
        }
        if (cycle) {
          for (const candidacy of Object.values(cycle.candidacies)) {
            if (
              candidacy.partyId === contest.partyId &&
              !winnerSet.has(candidacy.politicianId) &&
              candidacy.status !== "withdrawn"
            ) {
              candidacy.status = "withdrawn";
            }
          }
        }
      }

      for (const winner of winners) {
        election.candidates[winner] = {
          politicianId: winner,
          partyId: contest.partyId,
          sourceContestId: contest.id,
          filedDate: contest.resolvedDate ?? state.currentDate,
          publicIdeology: null,
          withdrawn: false,
          independentQualified: false,
        };
        if (cycle && constituencyId) {
          cycle.candidacies[winner] = {
            politicianId: winner,
            constituencyId,
            partyId: contest.partyId,
            filedDate: contest.resolvedDate ?? state.currentDate,
            source: winner === state.playerPoliticianId ? "player" : "npc",
            incumbent: false,
            status: "filed",
          };
          cycle.decisions[winner] = {
            politicianId: winner,
            decision: "filed",
            decidedDate: contest.resolvedDate ?? state.currentDate,
          };
          const field = cycle.constituencyFields[constituencyId];
          if (field && !field.candidateIds.includes(winner)) {
            field.candidateIds = [...field.candidateIds, winner].sort();
          }
        }

        const existingCampaign = Object.values(state.campaignRuntime.campaigns).find(
          (c) =>
            c.politicianId === winner &&
            c.type === "assembly" &&
            c.electionId === election.id &&
            (c.status === "active" || c.status === "exploring"),
        );
        if (existingCampaign) {
          existingCampaign.contestId = contest.id;
          existingCampaign.constituencyId = constituencyId;
          existingCampaign.metadata.nominationWinner = true;
          existingCampaign.metadata.sourceContestId = contest.id;
          attachNominationMethodMetadata(world, state, existingCampaign);
        } else {
          const camp = createCampaignRecord(state, world, {
            politicianId: winner,
            type: "assembly",
            contestId: contest.id,
            electionId: election.id,
            constituencyId,
            status: "active",
            metadata: {
              nominationWinner: true,
              sourceContestId: contest.id,
            },
          });
          attachNominationMethodMetadata(world, state, camp);
        }
      }
      if (election.status === "planned") election.status = "field_open";
    }
  }

  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "OFFICE_NOMINATION_WINNER_SYNCED",
      importance: 0.55,
      visibility: "public",
      actorIds: winners.slice(0, 8),
      entityIds: [contest.partyId, meta.electionId, contestId],
      payload: {
        contestId,
        electionId: meta.electionId,
        officeKind: meta.officeKind,
        partyId: contest.partyId,
        winnerId: primary,
        winnerIds: winners,
        constituencyId: meta.constituencyId ?? null,
        nominationSlots: meta.nominationSlots ?? winners.length,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );

  return { events };
}

/**
 * Light monthly hook: when gubernatorial filing is open, ensure + open + resolve
 * short party nomination contests for parties that require nomination.
 * Assembly path: ensure missing constituency contests, then resolve.
 */
export function processOfficeNominationsMonth(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];

  for (const election of Object.values(state.provincialRuntime.elections)) {
    if (election.status !== "filing_open") continue;
    const existing = officeNominationContestsForElection(state, election.id, "gubernatorial");
    if (existing.length === 0) {
      const ensured = ensureOfficeNominationContests(state, world, {
        officeKind: "gubernatorial",
        electionId: election.id,
        electionDate: election.date,
        provinceId: election.provinceId,
        commandId,
      });
      events.push(...ensured.events);
    }
    const openOrPlanned = officeNominationContestsForElection(state, election.id, "gubernatorial");
    const unresolved = openOrPlanned.filter(
      (c) => c.status !== "resolved" && c.status !== "cancelled",
    );
    if (unresolved.length === 0) continue;
    events.push(
      ...resolveOfficeNominationContests(
        state,
        world,
        rng,
        election.id,
        "gubernatorial",
        commandId,
      ),
    );
  }

  for (const election of Object.values(state.elections)) {
    if (election.type !== "assembly") continue;
    if (
      election.fieldFinalized ||
      election.status === "resolved" ||
      election.status === "cancelled"
    )
      continue;
    const filingOpen =
      election.assembly?.filingStatus === "open" || election.status === "field_open";
    if (!filingOpen) continue;
    const ensured = ensureOfficeNominationContests(state, world, {
      officeKind: "assembly",
      electionId: election.id,
      electionDate: election.date,
      commandId,
    });
    events.push(...ensured.events);
    const unresolved = officeNominationContestsForElection(state, election.id, "assembly").filter(
      (c) => c.status !== "resolved" && c.status !== "cancelled",
    );
    if (unresolved.length === 0) continue;
    events.push(
      ...resolveOfficeNominationContests(state, world, rng, election.id, "assembly", commandId),
    );
  }

  return events;
}
