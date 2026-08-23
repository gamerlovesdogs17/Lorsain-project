import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContentBundleFromRepo } from "../packages/content-loader/src/node.js";
import { createSimulation } from "../packages/sim/src/engine.js";
import { jsonClone } from "../packages/sim/src/hash.js";
import {
  buildTerenaKernelWorld,
  type TerenaKernelInput,
} from "../packages/sim/src/world.js";
import {
  terenaElectoralFromBundle,
  terenaPartyFields,
  terenaWorldFieldsFromBundle,
} from "../packages/sim/src/terena-party-input.js";
import { createRngService } from "../packages/sim/src/rng.js";
import { currentAssemblyMemberIds } from "../packages/sim/src/legislature/state.js";
import {
  finalizeAssemblyFieldsIfDue,
  openAssemblyFilingIfDue,
} from "../packages/sim/src/elections/assembly-cycle.js";
import {
  buildAssemblyConstituencyField,
  resolveAssemblyElection,
} from "../packages/sim/src/elections/assembly-national.js";
import { resolveAssemblyConstituency } from "../packages/sim/src/elections/assembly.js";
import { CANONICAL_ASSEMBLY_ELECTION_ID } from "../packages/sim/src/elections/types.js";

type Sample = {
  seed: string;
  fieldGenerationMs: number;
  oneConstituencyMs: number;
  resolutionMs: number;
  persistenceSerializationMs: number;
  candidates: number;
  candidatesPerSeat: number;
  uncontestedConstituencies: number;
  incumbentCandidates: number;
  incumbentWinners: number;
  challengerWinners: number;
  incumbentReelectionRate: number;
  partySeatChange: number;
  turnout: number;
  representedParties: number;
};

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function summarize(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    min: Number((sorted[0] ?? 0).toFixed(3)),
    mean: Number(mean(values).toFixed(3)),
    median: Number((sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(3)),
    max: Number((sorted.at(-1) ?? 0).toFixed(3)),
  };
}

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const bundle = loadContentBundleFromRepo(repoRoot);
const world = buildTerenaKernelWorld({
  contentVersion: bundle.manifest.content_version,
  scenario: jsonClone(bundle.content.scenario),
  figures: bundle.content.starting_figures.figures,
  issues: bundle.content.terena_issues.issues.map((issue: { id: string; dimension: string }) => ({
    id: issue.id,
    dimension: issue.dimension,
  })),
  offices: bundle.content.terena_offices.offices,
  constitution: jsonClone(bundle.content.terena_constitution),
  administrations: bundle.content.terena_presidential_administrations.administrations,
  ...terenaPartyFields({
    parties: bundle.content.terena_parties.parties,
    nominationRules: bundle.content.terena_nomination_rules.rules,
    provinceFeatures: bundle.content.terena_provinces.features,
    constituencyFeatures: bundle.content.terena_constituencies.features,
  }),
  presidentialEligibility: { rules: bundle.presidentialEligibility.rules },
  ...terenaElectoralFromBundle(bundle),
  ...terenaWorldFieldsFromBundle(bundle),
} satisfies TerenaKernelInput);
const samples: Sample[] = [];
for (let index = 1; index <= 20; index += 1) {
  const seed = `P11-ASM-CAL-${String(index).padStart(2, "0")}`;
  const simulation = createSimulation({ world, playerPoliticianId: "NPC146", seed });
  const state = simulation.serializeSave().simulation;
  const election = state.elections[CANONICAL_ASSEMBLY_ELECTION_ID]!;
  const priorIncumbents = new Set(currentAssemblyMemberIds(world, state));

  state.currentDate = "2029-11-01";
  const fieldStart = performance.now();
  openAssemblyFilingIfDue(state, world, election, "CMD-CALIBRATE-FIELD");
  const fieldGenerationMs = performance.now() - fieldStart;
  state.currentDate = "2030-04-01";
  finalizeAssemblyFieldsIfDue(state, world, election, "CMD-CALIBRATE-FINALIZE");

  const fields = Object.values(election.assembly!.constituencyFields);
  const candidates = fields.reduce((sum, field) => sum + field.candidateIds.length, 0);
  const uncontestedConstituencies = fields.filter(
    (field) => field.candidateIds.length === field.magnitude,
  ).length;
  const incumbentCandidates = Object.values(election.assembly!.candidacies).filter(
    (candidate) => candidate.incumbent && candidate.status === "filed",
  ).length;

  state.currentDate = election.date;
  const firstField = fields.slice().sort((a, b) => a.constituencyId.localeCompare(b.constituencyId))[0]!;
  const field = buildAssemblyConstituencyField(
    state,
    world,
    firstField.constituencyId,
    "OFFICE-CALIBRATION",
  );
  if ("error" in field) throw new Error(`${field.error.code}: ${field.error.message}`);
  const constituencyStart = performance.now();
  const oneResult = resolveAssemblyConstituency(
    world,
    state,
    createRngService(`${seed}-ONE-CONSTITUENCY`),
    {
      constituencyId: firstField.constituencyId,
      candidateIds: field.candidateIds,
      partyByCandidate: field.partyByCandidate,
      ideologyById: field.ideologyById,
    },
  );
  if ("error" in oneResult) throw new Error(`${oneResult.error.code}: ${oneResult.error.message}`);
  const oneConstituencyMs = performance.now() - constituencyStart;

  const resolutionStart = performance.now();
  const resolved = resolveAssemblyElection(state, world, createRngService(seed), {
    electionId: election.id,
    scheduledEventId: "SEV-CALIBRATION",
    commandId: "CMD-CALIBRATION",
  });
  if ("error" in resolved) throw new Error(`${resolved.error.code}: ${resolved.error.message}`);
  const resolutionMs = performance.now() - resolutionStart;
  const persistenceStart = performance.now();
  JSON.stringify(election.assembly!.constituencyResults);
  const persistenceSerializationMs = performance.now() - persistenceStart;

  const incumbentWinners = election.winnerIds.filter((id) => priorIncumbents.has(id)).length;
  const partyIds = new Set([
    ...Object.keys(election.assembly!.previousPartySeatTotals),
    ...Object.keys(election.assembly!.partySeatTotals),
  ]);
  const partySeatChange =
    [...partyIds].reduce(
      (sum, partyId) =>
        sum +
        Math.abs(
          (election.assembly!.partySeatTotals[partyId] ?? 0) -
            (election.assembly!.previousPartySeatTotals[partyId] ?? 0),
        ),
      0,
    ) / 2;
  samples.push({
    seed,
    fieldGenerationMs,
    oneConstituencyMs,
    resolutionMs,
    persistenceSerializationMs,
    candidates,
    candidatesPerSeat: candidates / 420,
    uncontestedConstituencies,
    incumbentCandidates,
    incumbentWinners,
    challengerWinners: 420 - incumbentWinners,
    incumbentReelectionRate: incumbentCandidates > 0 ? incumbentWinners / incumbentCandidates : 0,
    partySeatChange,
    turnout: election.turnout?.turnoutRate ?? 0,
    representedParties: Object.values(election.assembly!.partySeatTotals).filter((seats) => seats > 0)
      .length,
  });
}

const summary = {
  seeds: samples.length,
  candidates: summarize(samples.map((sample) => sample.candidates)),
  candidatesPerSeat: summarize(samples.map((sample) => sample.candidatesPerSeat)),
  uncontestedConstituencies: summarize(
    samples.map((sample) => sample.uncontestedConstituencies),
  ),
  incumbentCandidates: summarize(samples.map((sample) => sample.incumbentCandidates)),
  incumbentWinners: summarize(samples.map((sample) => sample.incumbentWinners)),
  challengerWinners: summarize(samples.map((sample) => sample.challengerWinners)),
  incumbentReelectionRate: summarize(samples.map((sample) => sample.incumbentReelectionRate)),
  partySeatChange: summarize(samples.map((sample) => sample.partySeatChange)),
  turnout: summarize(samples.map((sample) => sample.turnout)),
  representedParties: summarize(samples.map((sample) => sample.representedParties)),
  timingsMs: {
    fieldGeneration: summarize(samples.map((sample) => sample.fieldGenerationMs)),
    oneConstituency: summarize(samples.map((sample) => sample.oneConstituencyMs)),
    fullResolution: summarize(samples.map((sample) => sample.resolutionMs)),
    resultSerialization: summarize(samples.map((sample) => sample.persistenceSerializationMs)),
  },
};

console.log(JSON.stringify({ assemblyCalibration: summary, samples }, null, 2));
