import { addMonths } from "../packages/sim/src/calendar.js";
import { createSimulation } from "../packages/sim/src/engine.js";
import { processEconomyMonth } from "../packages/sim/src/economy/monthly.js";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "../packages/sim/src/world.js";
import {
  terenaElectoralFromBundle,
  terenaPartyFields,
  terenaWorldFieldsFromBundle,
} from "../packages/sim/src/terena-party-input.js";
import { createRngService } from "../packages/sim/src/rng.js";

const seeds = Number(process.env.ECONOMY_CAL_SEEDS ?? 12);
const months = 48;
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const bundle = loadContentBundleFromRepo(repoRoot);
const world = buildTerenaKernelWorld({
  contentVersion: bundle.manifest.content_version,
  scenario: structuredClone(bundle.content.scenario),
  figures: bundle.content.starting_figures.figures,
  issues: bundle.content.terena_issues.issues.map((issue: { id: string; dimension: string }) => ({
    id: issue.id,
    dimension: issue.dimension,
  })),
  economy2028: bundle.content.terena_economy_2028,
  offices: bundle.content.terena_offices.offices,
  constitution: structuredClone(bundle.content.terena_constitution),
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
const president = world.startingTerms.find(
  (term) => world.offices[term.officeId]?.kind === "president",
)!.holderId;

function range(values: number[]) {
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    spread: Math.max(...values) - Math.min(...values),
  };
}

const runs = [];
for (let index = 0; index < seeds; index++) {
  const seed = `P112-ECON-${String(index + 1).padStart(2, "0")}`;
  const sim = createSimulation({ world, playerPoliticianId: president, seed });
  const state = sim.serializeSave().simulation;
  const rng = createRngService(seed);
  const start = { ...state.economyRuntime.national };
  const startProvinceRange = range(
    Object.values(state.economyRuntime.provinces).map((row) => row.conditionsIndex),
  );
  const startSectorRange = range(
    Object.values(state.economyRuntime.sectors).map((row) => row.conditionsIndex),
  );
  let yearOne = start;
  let maxProvinceSpread = startProvinceRange.spread;
  let boundHits = 0;
  const outputChanges: number[] = [];
  for (let month = 1; month <= months; month++) {
    const before = state.economyRuntime.national.outputIndex;
    state.currentDate = addMonths(state.scenarioStartDate, month);
    processEconomyMonth(state, world, rng, `CAL_ECON_${month}`);
    outputChanges.push(state.economyRuntime.national.outputIndex - before);
    if (month === 12) yearOne = { ...state.economyRuntime.national };
    const provinceSpread = range(
      Object.values(state.economyRuntime.provinces).map((row) => row.conditionsIndex),
    ).spread;
    maxProvinceSpread = Math.max(maxProvinceSpread, provinceSpread);
    const visible = [
      state.economyRuntime.national.outputIndex,
      state.economyRuntime.national.employmentIndex,
      state.economyRuntime.national.priceIndex,
      state.economyRuntime.national.realWageIndex,
      state.economyRuntime.national.housingIndex,
      state.economyRuntime.national.confidenceIndex,
      ...Object.values(state.economyRuntime.provinces).flatMap((row) => [
        row.conditionsIndex,
        row.employmentIndex,
        row.housingIndex,
      ]),
      ...Object.values(state.economyRuntime.sectors).map((row) => row.conditionsIndex),
    ];
    boundHits += visible.filter((value) => value <= 40.0001 || value >= 159.9999).length;
  }
  const final = { ...state.economyRuntime.national };
  const signChanges = outputChanges
    .slice(1)
    .filter((value, at) => Math.sign(value) !== Math.sign(outputChanges[at]!)).length;
  runs.push({
    seed,
    start,
    startProvinceRange,
    startSectorRange,
    yearOne,
    yearOneOutputChange: yearOne.outputIndex - start.outputIndex,
    yearFour: final,
    yearFourOutputChange: final.outputIndex - start.outputIndex,
    finalProvinceRange: range(
      Object.values(state.economyRuntime.provinces).map((row) => row.conditionsIndex),
    ),
    maxProvinceSpread,
    shocks: state.history.filter((event) => event.type === "ECONOMIC_SHOCK").length,
    boundHits,
    averageMonthlyOutputMove:
      outputChanges.reduce((sum, value) => sum + Math.abs(value), 0) / outputChanges.length,
    outputDirectionChanges: signChanges,
  });
}

console.log(
  JSON.stringify(
    {
      economyCalibration: {
        seeds,
        months,
        canonicalStartingNational: runs[0]?.start,
        canonicalStartingProvinceRange: runs[0]?.startProvinceRange,
        canonicalStartingSectorRange: runs[0]?.startSectorRange,
        oneYearOutputChangeRange: range(runs.map((run) => run.yearOneOutputChange)),
        fourYearOutputChangeRange: range(runs.map((run) => run.yearFourOutputChange)),
        largestRegionalSpread: Math.max(...runs.map((run) => run.maxProvinceSpread)),
        shocks: runs.reduce((sum, run) => sum + run.shocks, 0),
        boundHits: runs.reduce((sum, run) => sum + run.boundHits, 0),
        averageMonthlyOutputMove:
          runs.reduce((sum, run) => sum + run.averageMonthlyOutputMove, 0) / runs.length,
        averageDirectionChanges:
          runs.reduce((sum, run) => sum + run.outputDirectionChanges, 0) / runs.length,
      },
      runs,
    },
    null,
    2,
  ),
);
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContentBundleFromRepo } from "../packages/content-loader/src/node.js";
