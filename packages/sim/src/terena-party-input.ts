import type { TerenaKernelInput } from "./world.js";
import {
  terenaElectoralFields,
  type AssemblyTurnoutConstituencyInput,
  type PollsterInput,
  type VoterBlocConstituencyInput,
} from "./elections/content.js";

type GeoFeature = { properties: Record<string, unknown> };

export type CompactAssemblyElection = NonNullable<TerenaKernelInput["assemblyElection"]>;

type RawAssemblyConstituency = {
  constituency_id: string;
  candidates: Array<{ id: string; party_id?: string | null }>;
  result?: { firstPreferences?: Record<string, string> };
};

export function compactAssemblyElectionFromRaw(raw: {
  constituencies: RawAssemblyConstituency[];
}): CompactAssemblyElection {
  return {
    constituencies: raw.constituencies.map((c) => ({
      constituencyId: c.constituency_id,
      candidates: c.candidates.map((x) => ({ id: x.id, partyId: x.party_id ?? null })),
      firstPreferences: c.result?.firstPreferences ?? {},
    })),
  };
}

export function terenaPartyFields(args: {
  parties: NonNullable<TerenaKernelInput["parties"]>;
  nominationRules: NonNullable<TerenaKernelInput["nominationRules"]>;
  provinceFeatures: GeoFeature[];
  constituencyFeatures: GeoFeature[];
  assemblyElection?: CompactAssemblyElection;
}): Pick<
  TerenaKernelInput,
  "parties" | "nominationRules" | "provinces" | "constituencies" | "assemblyElection"
> {
  const fields: Pick<
    TerenaKernelInput,
    "parties" | "nominationRules" | "provinces" | "constituencies" | "assemblyElection"
  > = {
    parties: args.parties,
    nominationRules: args.nominationRules,
    provinces: args.provinceFeatures.map((f) => String(f.properties.id)).sort(),
    constituencies: args.constituencyFeatures.map((f) => {
      const shares = (f.properties.province_population_shares ?? []) as Array<{
        province_id: string;
        share: number;
      }>;
      return {
        id: String(f.properties.id),
        provinceShares: shares.map((s) => ({ provinceId: s.province_id, share: s.share })),
      };
    }),
  };
  if (args.assemblyElection) fields.assemblyElection = args.assemblyElection;
  return fields;
}

export function terenaWorldFieldsFromBundle(bundle: {
  content: {
    world_countries: { countries: NonNullable<TerenaKernelInput["worldCountries"]> };
    world_institutions: { institutions: NonNullable<TerenaKernelInput["worldInstitutions"]> };
    world_leaders: { leaders: NonNullable<TerenaKernelInput["worldLeaders"]> };
  };
}): Pick<TerenaKernelInput, "worldCountries" | "worldInstitutions" | "worldLeaders"> {
  return {
    worldCountries: bundle.content.world_countries.countries ?? [],
    worldInstitutions: bundle.content.world_institutions.institutions ?? [],
    worldLeaders: bundle.content.world_leaders.leaders ?? [],
  };
}

export function terenaElectoralFromBundle(bundle: {
  voterBlocs: { constituencies: VoterBlocConstituencyInput[] };
  pollsters: { pollsters: PollsterInput[] };
  content: {
    terena_issues: { issues: Array<{ id: string; dimension: string }> };
    terena_constituencies: { features: GeoFeature[] };
  };
  assemblyElection2026: { constituencies: AssemblyTurnoutConstituencyInput[] };
}): ReturnType<typeof terenaElectoralFields> {
  return terenaElectoralFields({
    voterBlocs: bundle.voterBlocs.constituencies,
    pollsters: bundle.pollsters.pollsters,
    issues: bundle.content.terena_issues.issues.map((i) => ({
      id: i.id,
      dimension: i.dimension,
    })),
    constituencyFeatures: bundle.content.terena_constituencies.features,
    assemblyTurnout: bundle.assemblyElection2026.constituencies,
  });
}
