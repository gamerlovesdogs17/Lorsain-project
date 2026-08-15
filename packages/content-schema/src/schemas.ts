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
    organization_type: z.enum(["membership_party", "independent_aggregate"]).optional(),
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

export const IsoDateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const WeekdayNameSchema = z.enum([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);

export const ConstitutionCalendarSchema = z
  .object({
    id: z.string().min(1),
    interval_years: z.number().int().positive(),
    month: z.number().int().min(1).max(12),
    nth_weekday: z.number().int().min(1).max(5),
    weekday: WeekdayNameSchema,
    anchor_year: z.number().int(),
    assumption_of_office: z
      .object({
        month: z.number().int().min(1).max(12),
        day: z.number().int().min(1).max(31),
        year_offset_from_election: z.number().int().min(0).max(1),
      })
      .passthrough(),
  })
  .passthrough();

export const PresidentialVacancyRuleSchema = z
  .object({
    id: z.string().min(1),
    acting_succession_office_ids: z.array(z.string().min(1)).min(1),
    special_election: z
      .object({
        required_if_more_than_days_before_regular_election: z.number().int().positive(),
        must_occur_within_days_of_vacancy: z.number().int().positive(),
        method: z.string().min(1),
        calendar_does_not_reset: z.boolean(),
      })
      .passthrough(),
    term_limit_treatment: z
      .object({
        normal_elected_term_years: z.number().int().positive(),
        special_remainder_counts_as_elected_term_if_more_than_half_normal: z.boolean(),
        acting_service_never_counts: z.boolean(),
      })
      .passthrough(),
    president_elect_before_assumption: z
      .object({
        applies_after_certified_election_before_assumption: z.boolean(),
        president_elect_becomes_acting_within_days: z.number().int().positive(),
        regular_term_still_begins_on_assumption_date: z.boolean(),
        pre_assumption_acting_does_not_count_as_separate_term: z.boolean(),
      })
      .passthrough(),
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
    calendars: z.object({
      CALENDAR_PRESIDENTIAL_REGULAR: ConstitutionCalendarSchema,
      CALENDAR_ASSEMBLY_REGULAR: ConstitutionCalendarSchema,
    }),
    presidential_vacancy: PresidentialVacancyRuleSchema,
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
        next_election: IsoDateStringSchema.optional(),
        election_date: IsoDateStringSchema.optional(),
        term_start: IsoDateStringSchema.optional(),
        term_end: IsoDateStringSchema.optional(),
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
        must_resign_before_candidacy_filing: z.array(z.string()).optional(),
        disqualifications_to_run: z.array(z.string()),
        party_nomination: z.string().optional(),
        age_measured_on: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const AssemblyElection2026Schema = z
  .object({
    content_version: z.string().optional(),
    election_id: z.string(),
    election_date: z.string(),
    method: z.literal("stv"),
    constituencies: z.array(z.record(z.unknown())),
  })
  .passthrough();

export const VoterBlocsFileSchema = z
  .object({
    content_version: z.string().optional(),
    scenario_id: z.string().optional(),
    constituencies: z.array(
      z
        .object({
          constituency_id: z.string(),
          blocs: z.array(
            z
              .object({
                id: z.string(),
                weight: z.number().finite().nonnegative(),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const PollstersFileSchema = z
  .object({
    content_version: z.string().optional(),
    pollsters: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const HistoricalCandidates2026Schema = z
  .object({
    content_version: z.string().optional(),
    candidates: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          constituency_id: z.string(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const PresidentialAdministrationSchema = z
  .object({
    id: z.string().min(1),
    president_name: z.string().min(1),
    president_person_id: z.string().min(1),
    party_id: z.string().min(1),
    elected: IsoDateStringSchema,
    term_start: IsoDateStringSchema,
    term_end: IsoDateStringSchema,
    preceded_by_administration_id: z.string().min(1).optional(),
    succeeded_by_administration_id: z.string().min(1).optional(),
    succeeded_by_president_id: z.string().min(1).optional(),
    status: z.string().optional(),
  })
  .passthrough();

export const PresidentialAdministrationsFileSchema = z
  .object({
    content_version: z.string().optional(),
    administrations: z.array(PresidentialAdministrationSchema),
    historical_persons: z
      .array(
        z
          .object({
            id: z.string(),
            name: z.string(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const OfficeKindSchema = z.enum([
  "president",
  "assembly_member",
  "speaker",
  "governor",
  "constitutional_court_justice",
  "minister",
  "mayor",
]);

export const OfficeDefinitionSchema = z
  .object({
    id: z.string().min(1),
    kind: OfficeKindSchema,
    title: z.string().min(1),
    jurisdiction_id: z.string().min(1),
    capacity: z.number().int().positive(),
    selection: z
      .object({
        method: z.string().min(1),
      })
      .passthrough(),
    term: z.object({}).passthrough(),
    constituency_id: z.string().min(1).optional(),
    province_id: z.string().min(1).optional(),
    city_id: z.string().min(1).optional(),
    seat_index: z.number().int().min(0).optional(),
    portfolio: z.string().min(1).optional(),
    incompatible_with_kinds: z.array(z.string()).optional(),
    may_coexist_with_kinds: z.array(z.string()).optional(),
    requires_holder_kinds: z.array(z.string()).optional(),
    suspend_when_acting_president: z.boolean().optional(),
    acting_allowed: z.boolean().optional(),
    no_party_membership_while_serving: z.boolean().optional(),
    vacancy_rule_id: z.string().optional(),
  })
  .passthrough()
  .superRefine((o, ctx) => {
    if (o.kind === "assembly_member" && !o.constituency_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "assembly_member requires constituency_id",
      });
    }
    if (o.kind === "governor" && !o.province_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "governor requires province_id",
      });
    }
    if (o.kind === "mayor" && !o.city_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mayor requires city_id",
      });
    }
    if (o.kind === "constitutional_court_justice" && o.seat_index == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "constitutional_court_justice requires seat_index",
      });
    }
    if (o.kind === "minister" && !o.portfolio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "minister requires portfolio",
      });
    }
  });

export const OfficesFileSchema = z
  .object({
    content_version: z.string().optional(),
    offices: z.array(OfficeDefinitionSchema),
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
export type AssemblyElection2026File = z.infer<typeof AssemblyElection2026Schema>;
export type VoterBlocsFile = z.infer<typeof VoterBlocsFileSchema>;
export type PollstersFile = z.infer<typeof PollstersFileSchema>;
export type HistoricalCandidates2026File = z.infer<typeof HistoricalCandidates2026Schema>;
export type PresidentialAdministrationsFile = z.infer<typeof PresidentialAdministrationsFileSchema>;
export type OfficesFile = z.infer<typeof OfficesFileSchema>;
export type GeoJsonFeatureCollection = z.infer<typeof GeoJsonFeatureCollectionSchema>;
