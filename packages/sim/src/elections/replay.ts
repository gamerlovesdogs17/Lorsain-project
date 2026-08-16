import {
  countIrv,
  countStv,
  serializeCountResult,
  type IrvResult,
  type StvResult,
} from "@lorsain/election-math";
import type { ElectionState } from "./types.js";

function lotDrawsFromArchive(archive: IrvResult | StvResult): number[] {
  if (archive.method === "irv") {
    return archive.rounds.flatMap((r) => r.tieResolution?.lot?.draws ?? []);
  }
  return archive.steps.flatMap((s) => s.tieResolution?.lot?.draws ?? []);
}

export function replayElectionCount(election: ElectionState): IrvResult | StvResult {
  if (!election.countInput || !election.countArchive) {
    throw new Error(`election ${election.id} has no count archive`);
  }
  const draws = lotDrawsFromArchive(election.countArchive);
  let i = 0;
  const rng = {
    nextUint32(): number {
      if (i >= draws.length) throw new Error(`election ${election.id} lot archive exhausted`);
      return draws[i++]!;
    },
  };
  if (election.type === "presidential") {
    return countIrv(
      { candidateIds: election.countInput.candidateIds, ballots: election.countInput.ballots },
      { rng },
    );
  }
  const seats = election.countInput.seats ?? election.seats;
  return countStv(
    {
      candidateIds: election.countInput.candidateIds,
      seats,
      ballots: election.countInput.ballots,
    },
    { rng },
  );
}

export function electionReplayError(election: ElectionState): string | null {
  if (election.status !== "resolved") return null;
  if (!election.countInput || !election.countArchive) {
    return `resolved election ${election.id} missing count archive`;
  }
  try {
    const replayed = replayElectionCount(election);
    if (serializeCountResult(replayed) !== serializeCountResult(election.countArchive)) {
      return `election ${election.id} archive does not replay`;
    }
  } catch (e) {
    return `election ${election.id} replay failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  return null;
}
