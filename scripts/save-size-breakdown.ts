/** Measure long-save growth and identify persisted-state hotspots without retaining a raw save. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSimulation, restoreSimulation } from "../packages/sim/src/engine.js";
import { advanceIntegrated, loadTerenaWorld } from "../packages/sim/src/integration/harness.js";
import type { SimState } from "../packages/sim/src/types.js";

function numericFlag(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=", 2)[1];
  const value = raw == null ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid --${name}`);
  return Math.floor(value);
}

function stringFlag(name: string, fallback: string): string {
  return (
    process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
  );
}

function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function sortedSizes(entries: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(entries)
      .map(([key, value]) => [key, bytes(value)] as const)
      .sort((a, b) => b[1] - a[1]),
  );
}

function conceptualBreakdown(state: SimState): Record<string, number> {
  return sortedSizes({
    nationalElections: state.elections,
    provincialLegislators: state.provincialRuntime.legislators,
    provincialElections: {
      governors: state.provincialRuntime.elections,
      assemblies: state.provincialRuntime.assemblyElections,
    },
    federalRollCalls: state.legislatureRuntime.legislativeVotes,
    provincialRollCalls: state.provincialRuntime.votes,
    federalBillsLawsAndAmendments: {
      bills: state.legislatureRuntime.bills,
      laws: state.legislatureRuntime.enactedLaws,
      amendments: state.legislatureRuntime.amendments,
    },
    provincialBills: state.provincialRuntime.bills,
    partyAndCaucusContests: {
      party: state.partyContests,
      caucus: state.legislatureRuntime.caucusContests,
      leadership: state.legislatureRuntime.caucusLeadership,
    },
    provincialAssembliesAndLeadership: state.provincialRuntime.assemblies,
    nationalPoliticians: state.politicians,
    relationshipsBeliefsAndMemories: {
      relationships: state.relationships,
      beliefs: state.beliefs,
      memories: state.memories,
      goals: state.goals,
    },
    court: state.constitutionalRuntime,
    news: state.mediaRuntime,
    historyEvents: state.history,
    campaigns: state.campaignRuntime,
    foreignAffairs: state.foreignAffairsRuntime,
    organizations: state.organizationRuntime,
    economy: state.economyRuntime,
  });
}

function nationalElectionBreakdown(state: SimState): Record<string, unknown> {
  return Object.fromEntries(
    Object.values(state.elections)
      .map((election) => {
        const assembly = election.assembly;
        const resultRows = Object.values(assembly?.constituencyResults ?? {});
        return [
          election.id,
          {
            totalBytes: bytes(election),
            type: election.type,
            date: election.date,
            status: election.status,
            candidatesBytes: bytes(election.candidates),
            countInputBytes: bytes(election.countInput),
            countArchiveBytes: bytes(election.countArchive),
            assemblyCandidaciesBytes: bytes(assembly?.candidacies ?? {}),
            assemblyFieldsBytes: bytes(assembly?.constituencyFields ?? {}),
            assemblyResultsBytes: bytes(assembly?.constituencyResults ?? {}),
            assemblyResultArchivesBytes: resultRows.reduce(
              (sum, result) => sum + bytes(result.countArchive),
              0,
            ),
            assemblyResultFirstPreferencesBytes: resultRows.reduce(
              (sum, result) => sum + bytes(result.firstPreferences),
              0,
            ),
          },
        ] as const;
      })
      .sort(([, a], [, b]) => b.totalBytes - a.totalBytes),
  );
}

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const months = numericFlag("months", 600);
const seedIndex = numericFlag("seed", 0);
const output = resolve(stringFlag("output", "docs/qa/phase11_3/save_size_breakdown.json"));
const requested = stringFlag("checkpoints", "0,120,300,600")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 0 && value <= months);
const checkpoints = [...new Set([0, ...requested, months])].sort((a, b) => a - b);
const seed = `P113-WG-${String(seedIndex).padStart(3, "0")}`;
const world = loadTerenaWorld();
const sim = createSimulation({ world, playerPoliticianId: "NPC146", seed });
const samples: Array<Record<string, unknown>> = [];
let at = 0;

for (const checkpoint of checkpoints) {
  if (checkpoint > at) advanceIntegrated(sim, checkpoint - at);
  at = checkpoint;
  const serializeStart = performance.now();
  const save = sim.serializeSave();
  const serializeMs = performance.now() - serializeStart;
  const stringifyStart = performance.now();
  const totalBytes = bytes(save);
  const stringifyMs = performance.now() - stringifyStart;
  const restoreStart = performance.now();
  const restored = restoreSimulation(save, world);
  const restoreMs = performance.now() - restoreStart;
  const hashMatches = restored.hashState() === sim.hashState();
  samples.push({
    month: checkpoint,
    date: save.simulation.currentDate,
    totalBytes,
    serializeMs: Number(serializeMs.toFixed(2)),
    stringifyMs: Number(stringifyMs.toFixed(2)),
    restoreMs: Number(restoreMs.toFixed(2)),
    hashMatches,
    conceptualBytes: conceptualBreakdown(save.simulation),
    topLevelBytes: sortedSizes(save.simulation as unknown as Record<string, unknown>),
    nationalElectionBytes: nationalElectionBreakdown(save.simulation),
  });
  console.log(
    `${checkpoint}m ${save.simulation.currentDate}: ${(totalBytes / 1_048_576).toFixed(2)} MiB, restore ${restoreMs.toFixed(0)}ms, hash=${hashMatches}`,
  );
}

const payload = {
  generatedAt: new Date().toISOString(),
  seed,
  months,
  samples,
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`wrote ${output.replace(`${repoRoot}\\`, "")}`);
