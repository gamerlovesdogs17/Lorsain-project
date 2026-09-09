/**
 * Assembly office-nomination integrity checks (constituency multi-nominee model).
 *
 * Detects: duplicate candidates, dead on ballot, orphan nomination winners,
 * co-partisan fillers alongside nominees, and stale nomination contests.
 */
import type { KernelWorld, SimState } from "../types.js";
import {
  isOfficeNominationContestType,
  officeNominationContestsForElection,
  officeNominationCycleMetadata,
  officeNominationWinnerIds,
  partyRequiresOfficeNomination,
} from "./officeNominations.js";

export type NominationIntegrityCode =
  | "duplicate_candidate"
  | "dead_on_ballot"
  | "orphan_nomination"
  | "filler_with_nominee"
  | "stale_contest";

export type NominationIntegrityIssue = {
  code: NominationIntegrityCode;
  electionId: string;
  message: string;
  politicianId?: string;
  partyId?: string;
  constituencyId?: string;
  contestId?: string;
};

/**
 * Audit assembly nomination / field integrity for one election (or all assembly elections).
 */
export function auditAssemblyNominationIntegrity(
  state: SimState,
  world: KernelWorld,
  electionId?: string,
): NominationIntegrityIssue[] {
  const issues: NominationIntegrityIssue[] = [];
  const elections = Object.values(state.elections).filter((e) => {
    if (e.type !== "assembly") return false;
    if (electionId && e.id !== electionId) return false;
    return true;
  });

  for (const election of elections) {
    const cycle = election.assembly;
    if (!cycle) continue;
    const historical = election.status === "resolved" || election.status === "cancelled";

    const seenPolitician = new Map<string, string>();
    for (const field of Object.values(cycle.constituencyFields)) {
      for (const politicianId of field.candidateIds) {
        const prior = seenPolitician.get(politicianId);
        if (prior && prior !== field.constituencyId) {
          issues.push({
            code: "duplicate_candidate",
            electionId: election.id,
            politicianId,
            constituencyId: field.constituencyId,
            message: `${politicianId} appears on ${prior} and ${field.constituencyId}`,
          });
        } else {
          seenPolitician.set(politicianId, field.constituencyId);
        }

        // Historical ballots may list people who later died; only live fields are errors.
        if (historical) continue;
        const pol = state.politicians[politicianId];
        if (!pol || !pol.alive || pol.retired) {
          issues.push({
            code: "dead_on_ballot",
            electionId: election.id,
            politicianId,
            constituencyId: field.constituencyId,
            message: `${politicianId} is dead/retired/missing but remains on ${field.constituencyId}`,
          });
        }
      }
    }

    if (historical) continue;

    const contests = officeNominationContestsForElection(state, election.id, "assembly");
    const nomineeKeys = new Set<string>();
    for (const contest of contests) {
      const meta = officeNominationCycleMetadata(contest);
      if (!meta?.constituencyId) continue;
      if (contest.status !== "resolved") continue;
      const winners = officeNominationWinnerIds(contest);
      for (const winnerId of winners) {
        nomineeKeys.add(`${contest.partyId}::${meta.constituencyId}::${winnerId}`);
        const candidacy = cycle.candidacies[winnerId];
        const onField =
          candidacy?.status === "filed" && candidacy.constituencyId === meta.constituencyId;
        const listed = (cycle.constituencyFields[meta.constituencyId]?.candidateIds ?? []).includes(
          winnerId,
        );
        if (!onField && !listed && election.status !== "resolved" && !election.fieldFinalized) {
          if (cycle.constituencyFields[meta.constituencyId]) {
            issues.push({
              code: "orphan_nomination",
              electionId: election.id,
              politicianId: winnerId,
              partyId: contest.partyId,
              constituencyId: meta.constituencyId,
              contestId: contest.id,
              message: `nomination winner ${winnerId} missing from ${meta.constituencyId} field`,
            });
          }
        }
      }
    }

    for (const candidacy of Object.values(cycle.candidacies)) {
      if (candidacy.status !== "filed" || !candidacy.partyId) continue;
      if (!partyRequiresOfficeNomination(world, state, candidacy.partyId)) continue;
      const sourceContestId = election.candidates[candidacy.politicianId]?.sourceContestId ?? null;
      const isNominee = sourceContestId
        ? (() => {
            const contest = state.partyContests[sourceContestId];
            if (!contest || !isOfficeNominationContestType(contest.type)) return false;
            return officeNominationWinnerIds(contest).includes(candidacy.politicianId);
          })()
        : nomineeKeys.has(
            `${candidacy.partyId}::${candidacy.constituencyId}::${candidacy.politicianId}`,
          );
      if (isNominee) continue;

      const partyHasNominee = [...nomineeKeys].some((key) =>
        key.startsWith(`${candidacy.partyId}::${candidacy.constituencyId}::`),
      );
      if (partyHasNominee) {
        issues.push({
          code: "filler_with_nominee",
          electionId: election.id,
          politicianId: candidacy.politicianId,
          partyId: candidacy.partyId,
          constituencyId: candidacy.constituencyId,
          message: `co-partisan filler ${candidacy.politicianId} on ${candidacy.constituencyId} while nominees exist`,
        });
      }
    }

    const electionClosed =
      election.status === "resolved" || election.status === "cancelled" || election.fieldFinalized;
    for (const contest of contests) {
      if (contest.status === "resolved" || contest.status === "cancelled") continue;
      if (electionClosed) {
        issues.push({
          code: "stale_contest",
          electionId: election.id,
          contestId: contest.id,
          partyId: contest.partyId,
          message: `open nomination contest ${contest.id} after election field closed`,
        });
      }
      const meta = officeNominationCycleMetadata(contest);
      if (meta && meta.electionId !== election.id) {
        issues.push({
          code: "stale_contest",
          electionId: election.id,
          contestId: contest.id,
          message: `contest ${contest.id} electionId mismatch`,
        });
      }
    }
  }

  return issues.sort(
    (a, b) =>
      a.code.localeCompare(b.code) ||
      a.electionId.localeCompare(b.electionId) ||
      (a.contestId ?? "").localeCompare(b.contestId ?? "") ||
      (a.politicianId ?? "").localeCompare(b.politicianId ?? ""),
  );
}
