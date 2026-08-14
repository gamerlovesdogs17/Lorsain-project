import { z } from "zod";

export const ContentVersionSchema = z.string().min(1);

export const ManifestSchema = z.object({
  content_version: ContentVersionSchema,
  scenario_id: z.string(),
  authoritative: z.record(z.string()),
  derived_or_reference: z.record(z.string()),
  stable_id_contracts: z.record(z.string()),
});

export const WorldCountrySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    map_path_id: z.string(),
    neighbor_ids: z.array(z.string()),
    alignment_ids: z.array(z.string()),
    population: z.number().optional(),
    population_millions: z.number().optional(),
  })
  .passthrough();

export const WorldCountriesFileSchema = z
  .object({
    countries: z.array(WorldCountrySchema),
    content_version: z.string().optional(),
  })
  .passthrough();

export const WorldInstitutionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    founded: z.number().int().optional(),
  })
  .passthrough();

export const WorldInstitutionsFileSchema = z
  .object({
    institutions: z.array(WorldInstitutionSchema),
    content_version: z.string().optional(),
  })
  .passthrough();

export const PartyFactionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    share: z.number(),
    party_id: z.string(),
  })
  .passthrough();

export const PartySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    assembly_seats: z.number().int(),
    nomination_rule_id: z.string(),
    factions: z.array(PartyFactionSchema).default([]),
  })
  .passthrough();

export const PartiesFileSchema = z
  .object({
    parties: z.array(PartySchema),
    content_version: z.string().optional(),
  })
  .passthrough();

export const NominationRuleSchema = z
  .object({
    id: z.string(),
    party_id: z.string(),
    method: z.string(),
  })
  .passthrough();

export const NominationRulesFileSchema = z
  .object({
    content_version: z.string().optional(),
    rules: z.array(NominationRuleSchema),
  })
  .passthrough();

export const ConstitutionFileSchema = z
  .object({
    country_id: z.literal("TER"),
    content_version: z.string().optional(),
    president: z
      .object({
        term_years: z.number().int(),
        term_limit: z.number().int(),
        election: z.string(),
      })
      .passthrough(),
    assembly: z
      .object({
        seats: z.literal(420),
        constituencies: z.literal(48),
        election: z.string(),
      })
      .passthrough(),
    constitutional_court: z
      .object({
        judges: z.literal(9),
      })
      .passthrough(),
  })
  .passthrough();

export const IssueSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    dimension: z.string(),
  })
  .passthrough();

export const IssuesFileSchema = z
  .object({
    issues: z.array(IssueSchema),
    content_version: z.string().optional(),
  })
  .passthrough();

export const OrganizationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    issues: z.array(z.string()),
    lean_party_ids: z.array(z.string()).default([]),
  })
  .passthrough();

export const OrganizationsFileSchema = z
  .object({
    organizations: z.array(OrganizationSchema),
    content_version: z.string().optional(),
  })
  .passthrough();

export const MediaOutletSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    ideology: z.number(),
    factual_reputation: z.number(),
  })
  .passthrough();

export const MediaFileSchema = z
  .object({
    outlets: z.array(MediaOutletSchema),
    content_version: z.string().optional(),
  })
  .passthrough();

export const ScenarioFileSchema = z
  .object({
    id: z.string(),
    date: z.string(),
    content_version: z.string().optional(),
    country_id: z.literal("TER"),
    world_country_id: z.literal("W41"),
    president_id: z.string(),
    speaker_id: z.string(),
    assembly: z
      .object({
        party_seats: z.record(z.number()),
      })
      .passthrough(),
  })
  .passthrough();

export const FigureRoleSchema = z
  .object({
    type: z.string(),
    jurisdiction_id: z.string().optional(),
  })
  .passthrough();

export const StartingFigureSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    party_id: z.string().nullable().optional(),
    faction_id: z.string().nullable().optional(),
    home_province_id: z.string(),
    roles: z.array(FigureRoleSchema).default([]),
  })
  .passthrough();

export const StartingFiguresFileSchema = z
  .object({
    figures: z.array(StartingFigureSchema),
    content_version: z.string().optional(),
    canonical_seed: z.string().optional(),
  })
  .passthrough();

export const CitySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    province_id: z.string(),
    map_marker_id: z.string().optional(),
  })
  .passthrough();

export const CitiesFileSchema = z
  .object({
    cities: z.array(CitySchema),
    content_version: z.string().optional(),
  })
  .passthrough();

export const ProvincePopulationShareSchema = z
  .object({
    province_id: z.string(),
    share: z.number().finite().nonnegative(),
  })
  .passthrough();

export const ProvincePropertiesSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    population: z.number().finite().nonnegative(),
    country_id: z.string().optional(),
    svg_path_id: z.string().optional(),
  })
  .passthrough();

export const ConstituencyPropertiesSchema = z
  .object({
    id: z.string(),
    seats: z.number().int().positive(),
    population: z.number().finite().nonnegative(),
    plurality_province_id: z.string(),
    province_population_shares: z.array(ProvincePopulationShareSchema),
    crosses_province_boundaries: z.boolean(),
    svg_path_id: z.string().optional(),
  })
  .passthrough();

export const GeoFeatureSchema = z
  .object({
    type: z.literal("Feature"),
    properties: z.record(z.unknown()),
    geometry: z.unknown(),
  })
  .passthrough();

export const GeoJsonFeatureCollectionSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(GeoFeatureSchema),
    content_version: z.string().optional(),
  })
  .passthrough();

export const ProvincesGeoJsonSchema = GeoJsonFeatureCollectionSchema;
export const ConstituenciesGeoJsonSchema = GeoJsonFeatureCollectionSchema;

export const CrosswalkFileSchema = z
  .object({
    content_version: z.string().optional(),
    states: z.record(z.unknown()).optional(),
    terena: z
      .object({
        source_state_id: z.literal(41).optional(),
        world_country_id: z.literal("W41"),
        domestic_country_id: z.literal("TER"),
        domestic_svg_country_id: z.literal("TERENA"),
        province_crosswalk: z
          .record(
            z
              .object({
                id: z.string(),
                name: z.string().optional(),
                azgaar: z.string().optional(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const ElectoralCountingSchema = z
  .object({
    content_version: z.string().optional(),
    assembly_stv: z
      .object({
        quota: z.literal("droop"),
        surplus_transfer: z.literal("weighted_inclusive_gregory"),
      })
      .passthrough(),
    presidential_rcv: z
      .object({
        method: z.literal("irv"),
      })
      .passthrough(),
  })
  .passthrough();

export const PresidentialEligibilitySchema = z
  .object({
    content_version: z.string().optional(),
    status: z.enum(["draft_defaults_pending_content_approval", "approved"]),
    rules: z
      .object({
        minimum_age: z.number().int(),
        citizenship: z.string(),
        residency: z.string(),
        term_limit_elected: z.number().int(),
        incompatible_offices_while_serving_as_president: z.array(z.string()),
        may_campaign_while_holding: z.record(z.boolean()).optional(),
        vacate_incompatible_office: z.string().optional(),
        disqualifications_to_run: z.array(z.string()),
        party_nomination: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type Manifest = z.infer<typeof ManifestSchema>;
export type WorldCountriesFile = z.infer<typeof WorldCountriesFileSchema>;
export type WorldInstitutionsFile = z.infer<typeof WorldInstitutionsFileSchema>;
export type PartiesFile = z.infer<typeof PartiesFileSchema>;
export type NominationRulesFile = z.infer<typeof NominationRulesFileSchema>;
export type ConstitutionFile = z.infer<typeof ConstitutionFileSchema>;
export type IssuesFile = z.infer<typeof IssuesFileSchema>;
export type OrganizationsFile = z.infer<typeof OrganizationsFileSchema>;
export type MediaFile = z.infer<typeof MediaFileSchema>;
export type ScenarioFile = z.infer<typeof ScenarioFileSchema>;
export type StartingFiguresFile = z.infer<typeof StartingFiguresFileSchema>;
export type CitiesFile = z.infer<typeof CitiesFileSchema>;
export type CrosswalkFile = z.infer<typeof CrosswalkFileSchema>;
export type ElectoralCountingFile = z.infer<typeof ElectoralCountingSchema>;
export type PresidentialEligibilityFile = z.infer<typeof PresidentialEligibilitySchema>;
export type GeoJsonFeatureCollection = z.infer<typeof GeoJsonFeatureCollectionSchema>;
