import type { TerenaKernelInput } from "./world.js";

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
