import { campaignOrganize, campaignVisit } from "../packages/sim/src/campaigns/actions.js";
import { applyOrganizationMaintenance } from "../packages/sim/src/campaigns/monthly.js";
import { createCampaignRecord } from "../packages/sim/src/campaigns/state.js";
import { createSimulation } from "../packages/sim/src/engine.js";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "../packages/sim/src/world.js";
import { terenaElectoralFromBundle, terenaPartyFields, terenaWorldFieldsFromBundle } from "../packages/sim/src/terena-party-input.js";
import { createRngService } from "../packages/sim/src/rng.js";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const bundle = loadContentBundleFromRepo(repoRoot);
const world = buildTerenaKernelWorld({
  contentVersion: bundle.manifest.content_version,
  scenario: structuredClone(bundle.content.scenario),
  figures: bundle.content.starting_figures.figures,
  issues: bundle.content.terena_issues.issues.map((issue: { id: string; dimension: string }) => ({ id: issue.id, dimension: issue.dimension })),
  economy2028: bundle.content.terena_economy_2028,
  offices: bundle.content.terena_offices.offices,
  constitution: structuredClone(bundle.content.terena_constitution),
  administrations: bundle.content.terena_presidential_administrations.administrations,
  ...terenaPartyFields({ parties: bundle.content.terena_parties.parties, nominationRules: bundle.content.terena_nomination_rules.rules, provinceFeatures: bundle.content.terena_provinces.features, constituencyFeatures: bundle.content.terena_constituencies.features }),
  presidentialEligibility: { rules: bundle.presidentialEligibility.rules },
  ...terenaElectoralFromBundle(bundle),
  ...terenaWorldFieldsFromBundle(bundle),
} satisfies TerenaKernelInput);
const politicianId = world.startingTerms.find((term) => world.offices[term.officeId]?.kind === "president")!.holderId;
const state = createSimulation({ world, playerPoliticianId: politicianId, seed: "P112-CAMPAIGN-GEO" }).serializeSave().simulation;
const campaign = createCampaignRecord(state, world, {
  politicianId,
  type: "presidential_general",
  electionId: "ELEC_PRES_2028",
  cashOnHand: 500_000,
});
campaign.actionPointsRemaining = 20;
const rng = createRngService("P112-CAMPAIGN-GEO");
const national = campaignVisit(world, state, rng, { campaignId: campaign.id, actorId: politicianId, geography: { kind: "national", id: null } }, "CAL_NATIONAL");
if ("error" in national) throw new Error(national.error.message);
const sortedIds = Object.keys(world.constituencyElectorate).sort();
const firstFourAverage = sortedIds.slice(0, 4).reduce((sum, id) => sum + (campaign.organizationByConstituency[id] ?? 0), 0) / 4;
const laterAverage = sortedIds.slice(4).reduce((sum, id) => sum + (campaign.organizationByConstituency[id] ?? 0), 0) / Math.max(1, sortedIds.length - 4);
const provinceId = world.provinceIds[Math.floor(world.provinceIds.length / 2)]!;
const beforeProvince = { ...campaign.organizationByProvince };
const province = campaignOrganize(world, state, { campaignId: campaign.id, actorId: politicianId, geography: { kind: "province", id: provinceId } }, "CAL_PROVINCE");
if ("error" in province) throw new Error(province.error.message);
campaign.actionPointsRemaining = 20;
const constituencyId = sortedIds[Math.floor(sortedIds.length / 2)]!;
const beforeConstituency = campaign.organizationByConstituency[constituencyId] ?? 0;
const constituency = campaignOrganize(world, state, { campaignId: campaign.id, actorId: politicianId, geography: { kind: "constituency", id: constituencyId } }, "CAL_CONSTITUENCY");
if ("error" in constituency) throw new Error(constituency.error.message);
const beforeDecay = campaign.organizationByConstituency[constituencyId] ?? 0;
for (let month = 0; month < 12; month++) applyOrganizationMaintenance(campaign);

console.log(JSON.stringify({ campaignGeographyCalibration: {
  nationalConstituenciesReached: sortedIds.filter((id) => (campaign.organizationByConstituency[id] ?? 0) > 0).length,
  nationalProvincesReached: world.provinceIds.filter((id) => (beforeProvince[id] ?? 0) > 0).length,
  firstFourAverageAfterNational: firstFourAverage,
  laterAverageAfterNational: laterAverage,
  nationalActionOnlyFirstFour: sortedIds.slice(4).every((id) => (campaign.organizationByConstituency[id] ?? 0) === 0),
  provinceAction: { provinceId, gain: (campaign.organizationByProvince[provinceId] ?? 0) - (beforeProvince[provinceId] ?? 0) },
  constituencyAction: { constituencyId, gain: beforeDecay - beforeConstituency },
  twelveMonthPersistence: { before: beforeDecay, after: campaign.organizationByConstituency[constituencyId] ?? 0 },
  allProvinceOrganization: campaign.organizationByProvince,
  constituencyRange: {
    min: Math.min(...Object.values(campaign.organizationByConstituency)),
    max: Math.max(...Object.values(campaign.organizationByConstituency)),
  },
}}, null, 2));
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContentBundleFromRepo } from "../packages/content-loader/src/node.js";
