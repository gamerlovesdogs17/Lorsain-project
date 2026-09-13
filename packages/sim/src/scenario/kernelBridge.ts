import type { ScenarioDocument } from "@lorsain/scenario";
import type { ContentBundle } from "@lorsain/content-loader";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "../world.js";
import {
  terenaElectoralFromBundle,
  terenaPartyFields,
  terenaWorldFieldsFromBundle,
} from "../terena-party-input.js";
import type { KernelWorld } from "../types.js";
import { buildMiniPlayableWorldFromScenario } from "./miniWorldBuilder.js";

export type ScenarioWorldBuildOptions = {
  /** Required when contentEmbed.kind is content_bundle_ref (Terena host bundle). */
  terenaBundle?: ContentBundle;
};

export function buildKernelWorldFromContentInput(input: TerenaKernelInput): KernelWorld {
  return buildTerenaKernelWorld(input);
}

export function buildKernelWorldFromTerenaBundle(bundle: ContentBundle): KernelWorld {
  return buildKernelWorldFromContentInput({
    contentVersion: bundle.manifest.content_version,
    scenario: bundle.content.scenario,
    figures: bundle.content.starting_figures.figures,
    issues: bundle.content.terena_issues.issues.map((i: { id: string; dimension: string }) => ({
      id: i.id,
      dimension: i.dimension,
    })),
    offices: bundle.content.terena_offices.offices,
    economy2028: bundle.content.terena_economy_2028,
    constitution: bundle.content.terena_constitution,
    administrations: bundle.content.terena_presidential_administrations.administrations,
    ...terenaPartyFields({
      parties: bundle.content.terena_parties.parties,
      nominationRules: bundle.content.terena_nomination_rules.rules,
      provinceFeatures: bundle.content.terena_provinces.features,
      constituencyFeatures: bundle.content.terena_constituencies.features,
    } as never),
    presidentialEligibility: { rules: bundle.presidentialEligibility.rules },
    ...terenaElectoralFromBundle(bundle as never),
    ...terenaWorldFieldsFromBundle(bundle as never),
    organizations: bundle.content.terena_organizations.organizations,
    mediaOutlets: bundle.content.terena_media.outlets,
  } as unknown as TerenaKernelInput);
}

export function applyScenarioProvenance(world: KernelWorld, doc: ScenarioDocument): KernelWorld {
  return {
    ...world,
    scenarioId: doc.scenarioId,
    scenarioName: doc.name,
    scenarioFormatVersion: doc.formatVersion,
    countryName: doc.countryName,
    scenarioStartDate: doc.startDate as KernelWorld["scenarioStartDate"],
  };
}

export function buildKernelWorldFromScenarioDocument(
  doc: ScenarioDocument,
  options: ScenarioWorldBuildOptions = {},
): KernelWorld {
  const embed = doc.contentEmbed;
  if (embed.kind === "kernel_input") {
    const world = buildKernelWorldFromContentInput(embed.kernelInput as TerenaKernelInput);
    return applyScenarioProvenance(world, doc);
  }
  if (embed.kind === "content_bundle_ref") {
    if (!options.terenaBundle) {
      throw new Error("content_bundle_ref embed requires terenaBundle in build options");
    }
    const world = buildKernelWorldFromTerenaBundle(options.terenaBundle);
    return applyScenarioProvenance(world, doc);
  }
  return buildMiniPlayableWorldFromScenario(doc);
}
