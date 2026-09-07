/**
 * Phase 14 — Governor / National Assembly party nomination contests.
 *
 * Reuses PartyContest + NominationRuleDefinition machinery (declare → qualify →
 * IRV/plurality resolve). Presidential nominations remain the full calendar path;
 * this module opens short officeNomination contests keyed by
 * (partyId, electionId, office) when a gubernatorial or assembly race is open
 * and the party has a non-"none" nomination rule.
 *
 * Known gaps (documented for follow-up):
 * - Assembly constituency assignment still follows assembly-cycle allocation;
 *   nomination winners are synced as sole party candidates nationally but may
 *   share a constituency field with soft NPC fillers until allocation rebuild.
 * - No separate "committee ballot" engine beyond closed_member_rcv / convention methods.
 * - Player self-file during filing_open for nomination-required parties remains soft
 *   (allowed) until a nomination contest resolves and withdraws co-partisans.
 */
import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { pushHistory } from "../scheduler.js";
import { createCampaignRecord } from "../campaigns/state.js";
import { attachNominationMethodMetadata } from "../campaigns/nominations.js";
import {
  createPartyContest,
  declareCandidacy,
  openPartyContest,
  resolvePartyContest,
} from "./contests.js";
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
    candidateSource,
  };
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

/**
 * Ensure one planned/open office nomination contest per membership party for an
 * open gubernatorial or assembly election.
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
    partyIds?: string[];
    maxCandidatesPerParty?: number;
    commandId?: string | null;
  },
): { contests: PartyContest[]; events: SimEvent[] } {
  const existing = officeNominationContestsForElection(state, args.electionId, args.officeKind);
  if (existing.length > 0) return { contests: existing, events: [] };

  const events: SimEvent[] = [];
  const contests: PartyContest[] = [];
  const partyIds = (
    args.partyIds ?? [...membershipPartyIds(world), ...Object.keys(state.dynamicParties)]
  )
    .filter((id, index, all) => all.indexOf(id) === index)
    .sort();
  const maxCandidates = args.maxCandidatesPerParty ?? 4;

  for (const partyId of partyIds) {
    if (!partyAllowsNomination(world, state, partyId)) continue;
    const created = createPartyContest(
      state,
      world,
      {
        type: contestTypeForKind(args.officeKind),
        partyId,
        metadata: {
          officeKind: args.officeKind,
          electionId: args.electionId,
          electionDate: args.electionDate,
          partyId,
          provinceId: args.provinceId ?? null,
          constituencyId: args.constituencyId ?? null,
          candidateSource: "runtime_politics",
        },
      },
      args.commandId ?? null,
    );
    if ("error" in created) continue;
    contests.push(created.contest);
    events.push(...created.events);

    for (const politicianId of seedDeclaredEntries(state, partyId, maxCandidates)) {
      const declared = declareCandidacy(
        state,
        world,
        created.contest.id,
        politicianId,
        args.commandId ?? null,
      );
      if ("error" in declared) {
        // Soft-seed: mark exploring entry when declare fails eligibility edge cases.
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
  }

  return {
    contests: officeNominationContestsForElection(state, args.electionId, args.officeKind),
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

    // Single candidate → plurality by acclamation (mark qualified then resolve).
    if (declared.length === 1) {
      for (const entry of declared) entry.status = "qualified";
    }

    const resolved = resolvePartyContest(state, world, current.id, rng, commandId);
    if ("error" in resolved) continue;
    events.push(...resolved.events);
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
  const winner = contest.winnerId;

  if (meta.officeKind === "gubernatorial") {
    const election = state.provincialRuntime.elections[meta.electionId];
    if (
      election &&
      election.status !== "resolved" &&
      election.status !== "assumed" &&
      election.status !== "field_finalized"
    ) {
      // Withdraw co-partisan filings so the nominee is the party's sole candidate.
      for (const cand of Object.values(election.candidates)) {
        if (cand.partyId === contest.partyId && cand.politicianId !== winner && !cand.withdrawn) {
          cand.withdrawn = true;
        }
      }
      election.candidates[winner] = {
        politicianId: winner,
        partyId: contest.partyId,
        filedDate: contest.resolvedDate ?? state.currentDate,
        incumbent: election.incumbentId === winner,
        source: winner === state.playerPoliticianId ? "player" : "npc",
        withdrawn: false,
        sourceContestId: contest.id,
      };
      if (election.status === "planned") election.status = "filing_open";

      const existingCampaign = Object.values(state.campaignRuntime.campaigns).find(
        (c) =>
          c.politicianId === winner &&
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
          politicianId: winner,
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
      // Withdraw co-partisans so nomination winner is sole party candidate.
      for (const cand of Object.values(election.candidates)) {
        if (cand.partyId === contest.partyId && cand.politicianId !== winner && !cand.withdrawn) {
          cand.withdrawn = true;
        }
      }
      const cycle = election.assembly;
      if (cycle) {
        for (const candidacy of Object.values(cycle.candidacies)) {
          if (
            candidacy.partyId === contest.partyId &&
            candidacy.politicianId !== winner &&
            candidacy.status !== "withdrawn"
          ) {
            candidacy.status = "withdrawn";
          }
        }
      }

      election.candidates[winner] = {
        politicianId: winner,
        partyId: contest.partyId,
        sourceContestId: contest.id,
        filedDate: contest.resolvedDate ?? state.currentDate,
        publicIdeology: null,
        withdrawn: false,
        independentQualified: false,
      };
      if (election.status === "planned") election.status = "field_open";

      if (cycle && meta.constituencyId) {
        cycle.candidacies[winner] = {
          politicianId: winner,
          constituencyId: meta.constituencyId,
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
        existingCampaign.metadata.nominationWinner = true;
        existingCampaign.metadata.sourceContestId = contest.id;
        attachNominationMethodMetadata(world, state, existingCampaign);
      } else {
        const camp = createCampaignRecord(state, world, {
          politicianId: winner,
          type: "assembly",
          contestId: contest.id,
          electionId: election.id,
          constituencyId: meta.constituencyId ?? null,
          status: "active",
          metadata: {
            nominationWinner: true,
            sourceContestId: contest.id,
          },
        });
        attachNominationMethodMetadata(world, state, camp);
      }
    }
  }

  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "OFFICE_NOMINATION_WINNER_SYNCED",
      importance: 0.55,
      visibility: "public",
      actorIds: [winner],
      entityIds: [contest.partyId, meta.electionId, contestId],
      payload: {
        contestId,
        electionId: meta.electionId,
        officeKind: meta.officeKind,
        partyId: contest.partyId,
        winnerId: winner,
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
 * Assembly path: when assembly filing is open and no contests exist yet, create them.
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
    // Resolve in the same month once filing is open (short contest window).
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
    const existing = officeNominationContestsForElection(state, election.id, "assembly");
    if (existing.length === 0) {
      const ensured = ensureOfficeNominationContests(state, world, {
        officeKind: "assembly",
        electionId: election.id,
        electionDate: election.date,
        commandId,
      });
      events.push(...ensured.events);
    }
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
