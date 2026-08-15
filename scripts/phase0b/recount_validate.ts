/**
 * Reload the 2026 Assembly archive and recount every constituency with countStv.
 * Legal lots replay from archived lot draw sequences — never from a fresh generation RNG.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  countStv,
  type BallotGroupInput,
  type LotArchive,
  type Uint32Source,
} from "../../packages/election-math/src/index.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const ARCHIVE = join(ROOT, "data/terena_election_assembly_2026.json");

function failRng(): Uint32Source {
  return {
    nextUint32(): number {
      throw new Error("unexpected lot draw during recount_validate");
    },
  };
}

/** Replay archived rejection-sampled lot draws in order. */
function archiveLotRng(lots: LotArchive[]): Uint32Source {
  const draws = lots.flatMap((l) => l.draws);
  let i = 0;
  return {
    nextUint32(): number {
      if (i >= draws.length) {
        throw new Error(`archived lot draws exhausted at index ${i}`);
      }
      return draws[i++]!;
    },
  };
}

function extractLots(result: {
  steps?: Array<{ tieResolution?: { lot?: LotArchive } }>;
}): LotArchive[] {
  const lots: LotArchive[] = [];
  for (const step of result.steps ?? []) {
    if (step.tieResolution?.lot) lots.push(step.tieResolution.lot);
  }
  return lots;
}

function sameSet(a: string[], b: string[]): boolean {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

type ArchiveRow = {
  constituency_id: string;
  seats: number;
  candidates: { id: string }[];
  ballots: BallotGroupInput[];
  result: {
    elected: string[];
    steps?: Array<{ tieResolution?: { lot?: LotArchive } }>;
  };
};

function main(): void {
  const archive = JSON.parse(readFileSync(ARCHIVE, "utf8")) as {
    constituencies: ArchiveRow[];
    national_party_seats: Record<string, number>;
  };

  let ok = 0;
  let lotsUsed = 0;
  for (const row of archive.constituencies) {
    const input = {
      candidateIds: row.candidates.map((c) => c.id),
      seats: row.seats,
      ballots: row.ballots,
    };
    const archivedLots = extractLots(row.result);
    let result;
    try {
      result = countStv(input, {
        rng: archivedLots.length ? archiveLotRng(archivedLots) : failRng(),
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes("unexpected lot")) {
        if (!archivedLots.length) {
          throw new Error(
            `${row.constituency_id}: recount required a legal lot but archive has no lot records`,
          );
        }
        lotsUsed += 1;
        result = countStv(input, { rng: archiveLotRng(archivedLots) });
      } else {
        throw e;
      }
    }
    if (archivedLots.length) lotsUsed += 1;
    const archived = row.result.elected;
    if (!sameSet(result.elected, archived)) {
      throw new Error(
        `${row.constituency_id}: recount elected [${result.elected.join(",")}] != archive [${archived.join(",")}]`,
      );
    }
    ok++;
  }
  console.log(
    `Recounted ${ok}/${archive.constituencies.length} constituencies successfully (lots replayed: ${lotsUsed}).`,
  );
  console.log("National party seats:", archive.national_party_seats);
}

main();
