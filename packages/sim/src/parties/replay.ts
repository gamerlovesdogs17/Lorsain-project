import {
  countIrv,
  serializeCountResult,
  type IrvResult,
  type Uint32Source,
} from "@lorsain/election-math";
import type { PartyContest } from "./types.js";

export function rngFromArchivedLots(archive: IrvResult): Uint32Source {
  const draws = archive.rounds.flatMap((r) => r.tieResolution?.lot?.draws ?? []);
  let i = 0;
  return {
    nextUint32() {
      if (i >= draws.length) {
        throw new Error("archived legal-lot draws exhausted");
      }
      return draws[i++]!;
    },
  };
}

export function replayContestCount(contest: PartyContest): IrvResult {
  const input = contest.countInput;
  const archive = contest.countArchive;
  if (!input || !archive) {
    throw new Error(`contest ${contest.id} has no archived count input`);
  }
  return countIrv(
    { candidateIds: input.candidateIds, ballots: input.ballots },
    { rng: rngFromArchivedLots(archive) },
  );
}

export function contestCountReplayError(contest: PartyContest): string | null {
  if (!contest.countInput || !contest.countArchive) {
    return `contest ${contest.id} missing countInput/countArchive`;
  }
  try {
    const replayed = replayContestCount(contest);
    if (serializeCountResult(replayed) !== serializeCountResult(contest.countArchive)) {
      return `contest ${contest.id} archived IRV result does not replay`;
    }
  } catch (e) {
    return `contest ${contest.id} IRV replay failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  return null;
}
