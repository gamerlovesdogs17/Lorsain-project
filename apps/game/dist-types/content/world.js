import { buildTerenaKernelWorld, terenaElectoralFromBundle, terenaPartyFields, terenaWorldFieldsFromBundle, } from "@lorsain/sim";
export function kernelWorldFromBundle(bundle) {
    return buildTerenaKernelWorld({
        contentVersion: bundle.manifest.content_version,
        scenario: bundle.content.scenario,
        figures: bundle.content.starting_figures.figures,
        issues: bundle.content.terena_issues.issues.map((i) => ({
            id: i.id,
            dimension: i.dimension,
        })),
        offices: bundle.content.terena_offices.offices,
        constitution: bundle.content.terena_constitution,
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
        organizations: bundle.content.terena_organizations.organizations,
        mediaOutlets: bundle.content.terena_media.outlets,
    });
}
//# sourceMappingURL=world.js.map