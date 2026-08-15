import {
  AssemblyElection2026Schema,
  CitiesFileSchema,
  ConstitutionFileSchema,
  ConstituenciesGeoJsonSchema,
  ConstituencyPropertiesSchema,
  CrosswalkFileSchema,
  ElectoralCountingSchema,
  HistoricalCandidates2026Schema,
  IssuesFileSchema,
  ManifestSchema,
  MediaFileSchema,
  NominationRulesFileSchema,
  OrganizationsFileSchema,
  PartiesFileSchema,
  PollstersFileSchema,
  PresidentialAdministrationsFileSchema,
  PresidentialEligibilitySchema,
  ProvincePropertiesSchema,
  ProvincesGeoJsonSchema,
  ScenarioFileSchema,
  StartingFiguresFileSchema,
  VoterBlocsFileSchema,
  WorldCountriesFileSchema,
  WorldInstitutionsFileSchema,
  type CitiesFile,
  type ConstitutionFile,
  type CrosswalkFile,
  type ElectoralCountingFile,
  type GeoJsonFeatureCollection,
  type IssuesFile,
  type Manifest,
  type MediaFile,
  type NominationRulesFile,
  type OrganizationsFile,
  type PartiesFile,
  type PresidentialEligibilityFile,
  type ScenarioFile,
  type StartingFiguresFile,
  type WorldCountriesFile,
  type WorldInstitutionsFile,
} from "@lorsain/content-schema";

export type ValidationIssue = { level: "error" | "warning"; message: string };

export type ValidationReport = {
  contentVersion: string;
  ok: boolean;
  issues: ValidationIssue[];
  summary: string;
};

export type ContentIndex = {
  hasWorldCountryId(id: string): boolean;
  hasProvinceId(id: string): boolean;
  hasConstituencyId(id: string): boolean;
  hasCityId(id: string): boolean;
  hasPartyId(id: string): boolean;
  hasFactionId(id: string): boolean;
  hasFigureId(id: string): boolean;
  hasIssueId(id: string): boolean;
  hasInstitutionId(id: string): boolean;
  worldCountryIds(): readonly string[];
  provinceIds(): readonly string[];
  constituencyIds(): readonly string[];
  cityIds(): readonly string[];
  partyIds(): readonly string[];
  factionIds(): readonly string[];
  figureIds(): readonly string[];
};

export type ParsedAuthoritativeContent = {
  world_countries: WorldCountriesFile;
  world_institutions: WorldInstitutionsFile;
  terena_constitution: ConstitutionFile;
  terena_parties: PartiesFile;
  terena_nomination_rules: NominationRulesFile;
  terena_provinces: GeoJsonFeatureCollection;
  terena_constituencies: GeoJsonFeatureCollection;
  terena_cities: CitiesFile;
  terena_issues: IssuesFile;
  terena_organizations: OrganizationsFile;
  terena_media: MediaFile;
  starting_figures: StartingFiguresFile;
  scenario: ScenarioFile;
  canonical_crosswalk: CrosswalkFile;
  terena_electoral_counting: ElectoralCountingFile;
  world_svg: string;
  terena_svg: string;
};

export type ContentBundle = {
  root: string;
  manifest: Manifest;
  content: ParsedAuthoritativeContent;
  index: ContentIndex;
  /** Canonical presidential eligibility (Phase 0b authoritative). */
  presidentialEligibility: PresidentialEligibilityFile;
};

export type ContentFileReader = {
  readText(relativePath: string): string;
  exists(relativePath: string): boolean;
};

function extractSvgIds(svgText: string): Set<string> {
  const ids = new Set<string>();
  const re = /\bid="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svgText)) !== null) {
    ids.add(m[1]!);
  }
  return ids;
}

function uniqueIds(values: string[], label: string, error: (m: string) => void): void {
  const seen = new Set<string>();
  for (const id of values) {
    if (seen.has(id)) error(`duplicate ${label} ID: ${id}`);
    seen.add(id);
  }
}

function createIndex(sets: {
  world: readonly string[];
  provinces: readonly string[];
  constituencies: readonly string[];
  cities: readonly string[];
  parties: readonly string[];
  factions: readonly string[];
  figures: readonly string[];
  issues: readonly string[];
  institutions: readonly string[];
}): ContentIndex {
  const world = new Set(sets.world);
  const provinces = new Set(sets.provinces);
  const constituencies = new Set(sets.constituencies);
  const cities = new Set(sets.cities);
  const parties = new Set(sets.parties);
  const factions = new Set(sets.factions);
  const figures = new Set(sets.figures);
  const issues = new Set(sets.issues);
  const institutions = new Set(sets.institutions);

  const freezeList = <T>(xs: readonly T[]): readonly T[] => Object.freeze([...xs]);

  return Object.freeze({
    hasWorldCountryId: (id: string) => world.has(id),
    hasProvinceId: (id: string) => provinces.has(id),
    hasConstituencyId: (id: string) => constituencies.has(id),
    hasCityId: (id: string) => cities.has(id),
    hasPartyId: (id: string) => parties.has(id),
    hasFactionId: (id: string) => factions.has(id),
    hasFigureId: (id: string) => figures.has(id),
    hasIssueId: (id: string) => issues.has(id),
    hasInstitutionId: (id: string) => institutions.has(id),
    worldCountryIds: () => freezeList(sets.world),
    provinceIds: () => freezeList(sets.provinces),
    constituencyIds: () => freezeList(sets.constituencies),
    cityIds: () => freezeList(sets.cities),
    partyIds: () => freezeList(sets.parties),
    factionIds: () => freezeList(sets.factions),
    figureIds: () => freezeList(sets.figures),
  });
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function parseJson(text: string, path: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${path}: invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Pure content validation + ContentBundle construction.
 * No node:* imports — callers supply a ContentFileReader.
 */
export function validateAndLoadContent(
  rootLabel: string,
  reader: ContentFileReader,
): { report: ValidationReport; bundle?: ContentBundle } {
  const issues: ValidationIssue[] = [];
  const error = (message: string) => issues.push({ level: "error", message });
  const warn = (message: string) => issues.push({ level: "warning", message });

  const manifestPath = "data/content_manifest.json";
  if (!reader.exists(manifestPath)) {
    error(`missing manifest: ${manifestPath}`);
    return {
      report: {
        contentVersion: "unknown",
        ok: false,
        issues,
        summary: "missing manifest",
      },
    };
  }

  let manifest: Manifest;
  try {
    manifest = ManifestSchema.parse(parseJson(reader.readText(manifestPath), manifestPath));
  } catch (e) {
    error(`manifest parse failed: ${e instanceof Error ? e.message : String(e)}`);
    return {
      report: {
        contentVersion: "unknown",
        ok: false,
        issues,
        summary: "manifest parse failed",
      },
    };
  }

  const requiredAuth = [
    "world_countries",
    "world_institutions",
    "terena_constitution",
    "terena_parties",
    "terena_nomination_rules",
    "terena_provinces",
    "terena_constituencies",
    "terena_cities",
    "terena_issues",
    "terena_organizations",
    "terena_media",
    "starting_figures",
    "scenario",
    "canonical_crosswalk",
    "terena_electoral_counting",
    "presidential_eligibility",
    "terena_election_assembly_2026",
    "terena_historical_candidates_2026",
    "terena_voter_blocs_2028",
    "terena_pollsters",
    "world_svg",
    "terena_svg",
  ] as const;

  for (const key of requiredAuth) {
    if (!(key in manifest.authoritative)) error(`manifest.authoritative missing key: ${key}`);
  }
  for (const key of [
    "world_history_timeline",
    "terena_history_timeline",
    "terena_geography",
    "terena_presidential_administrations",
  ]) {
    if (!(key in manifest.derived_or_reference)) {
      error(`manifest.derived_or_reference missing key: ${key}`);
    }
  }
  if ("presidential_eligibility_pending" in manifest.derived_or_reference) {
    error(
      "presidential_eligibility_pending must be removed after Phase 0b; use authoritative.presidential_eligibility",
    );
  }

  for (const [key, rel] of Object.entries(manifest.authoritative)) {
    if (!reader.exists(rel)) error(`authoritative path missing for ${key}: ${rel}`);
  }
  for (const [key, rel] of Object.entries(manifest.derived_or_reference)) {
    if (!reader.exists(rel)) error(`derived_or_reference path missing for ${key}: ${rel}`);
  }

  const readAuthJson = (key: (typeof requiredAuth)[number]): unknown => {
    const rel = manifest.authoritative[key]!;
    return parseJson(reader.readText(rel), rel);
  };

  const checkVersion = (label: string, contentVersion: string | undefined, required = true) => {
    if (contentVersion === undefined || contentVersion === "") {
      if (required) error(`${label} missing required content_version`);
      return;
    }
    if (contentVersion !== manifest.content_version) {
      error(`${label} content_version ${contentVersion} != manifest ${manifest.content_version}`);
    }
  };

  let world: WorldCountriesFile;
  let institutions: WorldInstitutionsFile;
  let constitution: ConstitutionFile;
  let parties: PartiesFile;
  let noms: NominationRulesFile;
  let provinces: GeoJsonFeatureCollection;
  let constituencies: GeoJsonFeatureCollection;
  let cities: CitiesFile;
  let issuesFile: IssuesFile;
  let orgs: OrganizationsFile;
  let media: MediaFile;
  let figures: StartingFiguresFile;
  let scenario: ScenarioFile;
  let crosswalk: CrosswalkFile;
  let counting: ElectoralCountingFile;
  let worldSvg: string;
  let terenaSvg: string;
  let eligibility: PresidentialEligibilityFile;
  let election2026: ReturnType<typeof AssemblyElection2026Schema.parse>;
  let historicalCandidates: ReturnType<typeof HistoricalCandidates2026Schema.parse>;
  let voterBlocs: ReturnType<typeof VoterBlocsFileSchema.parse>;
  let pollsters: ReturnType<typeof PollstersFileSchema.parse>;

  try {
    world = WorldCountriesFileSchema.parse(readAuthJson("world_countries"));
    institutions = WorldInstitutionsFileSchema.parse(readAuthJson("world_institutions"));
    constitution = ConstitutionFileSchema.parse(readAuthJson("terena_constitution"));
    parties = PartiesFileSchema.parse(readAuthJson("terena_parties"));
    noms = NominationRulesFileSchema.parse(readAuthJson("terena_nomination_rules"));
    provinces = ProvincesGeoJsonSchema.parse(readAuthJson("terena_provinces"));
    constituencies = ConstituenciesGeoJsonSchema.parse(readAuthJson("terena_constituencies"));
    cities = CitiesFileSchema.parse(readAuthJson("terena_cities"));
    issuesFile = IssuesFileSchema.parse(readAuthJson("terena_issues"));
    orgs = OrganizationsFileSchema.parse(readAuthJson("terena_organizations"));
    media = MediaFileSchema.parse(readAuthJson("terena_media"));
    figures = StartingFiguresFileSchema.parse(readAuthJson("starting_figures"));
    scenario = ScenarioFileSchema.parse(readAuthJson("scenario"));
    crosswalk = CrosswalkFileSchema.parse(readAuthJson("canonical_crosswalk"));
    counting = ElectoralCountingSchema.parse(readAuthJson("terena_electoral_counting"));
    eligibility = PresidentialEligibilitySchema.parse(
      parseJson(
        reader.readText(manifest.authoritative.presidential_eligibility!),
        manifest.authoritative.presidential_eligibility!,
      ),
    );
    election2026 = AssemblyElection2026Schema.parse(
      parseJson(
        reader.readText(manifest.authoritative.terena_election_assembly_2026!),
        manifest.authoritative.terena_election_assembly_2026!,
      ),
    );
    historicalCandidates = HistoricalCandidates2026Schema.parse(
      parseJson(
        reader.readText(manifest.authoritative.terena_historical_candidates_2026!),
        manifest.authoritative.terena_historical_candidates_2026!,
      ),
    );
    voterBlocs = VoterBlocsFileSchema.parse(
      parseJson(
        reader.readText(manifest.authoritative.terena_voter_blocs_2028!),
        manifest.authoritative.terena_voter_blocs_2028!,
      ),
    );
    pollsters = PollstersFileSchema.parse(
      parseJson(
        reader.readText(manifest.authoritative.terena_pollsters!),
        manifest.authoritative.terena_pollsters!,
      ),
    );
    worldSvg = reader.readText(manifest.authoritative.world_svg!);
    terenaSvg = reader.readText(manifest.authoritative.terena_svg!);

    checkVersion("world_countries", world.content_version);
    checkVersion("world_institutions", institutions.content_version);
    checkVersion("terena_constitution", constitution.content_version);
    checkVersion("terena_parties", parties.content_version);
    checkVersion("terena_nomination_rules", noms.content_version);
    checkVersion("terena_cities", cities.content_version);
    checkVersion("terena_issues", issuesFile.content_version);
    checkVersion("terena_organizations", orgs.content_version);
    checkVersion("terena_media", media.content_version);
    checkVersion("starting_figures", figures.content_version);
    checkVersion("scenario", scenario.content_version);
    checkVersion("canonical_crosswalk", crosswalk.content_version);
    checkVersion("terena_electoral_counting", counting.content_version);
    checkVersion("presidential_eligibility", eligibility.content_version);
    checkVersion("terena_election_assembly_2026", election2026.content_version);
    checkVersion("terena_historical_candidates_2026", historicalCandidates.content_version);
    checkVersion("terena_voter_blocs_2028", voterBlocs.content_version);
    checkVersion("terena_pollsters", pollsters.content_version);
    checkVersion("terena_provinces", (provinces as { content_version?: string }).content_version);
    checkVersion(
      "terena_constituencies",
      (constituencies as { content_version?: string }).content_version,
    );

    if (eligibility.status !== "approved") {
      error("presidential_eligibility.status must be approved for Phase 0b");
    }
    if (eligibility.rules.minimum_age !== 35) {
      error("presidential minimum_age must be 35");
    }
  } catch (e) {
    error(`schema/parse failure: ${e instanceof Error ? e.message : String(e)}`);
    return {
      report: {
        contentVersion: manifest.content_version,
        ok: false,
        issues,
        summary: "schema/parse failure",
      },
    };
  }

  // Province/constituency property parsing (strict schemas — no unchecked casts)
  const provinceProps = provinces.features
    .map((f, i) => {
      try {
        return ProvincePropertiesSchema.parse(f.properties);
      } catch (e) {
        error(
          `province feature[${i}] properties invalid: ${e instanceof Error ? e.message : String(e)}`,
        );
        return null;
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const consProps = constituencies.features
    .map((f, i) => {
      try {
        return ConstituencyPropertiesSchema.parse(f.properties);
      } catch (e) {
        error(
          `constituency feature[${i}] properties invalid: ${e instanceof Error ? e.message : String(e)}`,
        );
        return null;
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (world.countries.length !== 48) error(`expected 48 countries, got ${world.countries.length}`);
  if (provinces.features.length !== 21)
    error(`expected 21 admin units, got ${provinces.features.length}`);
  if (constituencies.features.length !== 48) {
    error(`expected 48 constituencies, got ${constituencies.features.length}`);
  }

  uniqueIds(
    world.countries.map((c) => c.id),
    "world country",
    error,
  );
  uniqueIds(
    institutions.institutions.map((i) => i.id),
    "world institution",
    error,
  );
  uniqueIds(
    parties.parties.map((p) => p.id),
    "party",
    error,
  );
  uniqueIds(
    parties.parties.flatMap((p) => p.factions.map((f) => f.id)),
    "faction",
    error,
  );
  uniqueIds(
    noms.rules.map((r) => r.id),
    "nomination-rule",
    error,
  );
  uniqueIds(
    figures.figures.map((f) => f.id),
    "politician",
    error,
  );
  uniqueIds(
    issuesFile.issues.map((i) => i.id),
    "issue",
    error,
  );
  uniqueIds(
    orgs.organizations.map((o) => o.id),
    "organization",
    error,
  );
  uniqueIds(
    media.outlets.map((o) => o.id),
    "media",
    error,
  );
  uniqueIds(
    provinceProps.map((p) => p.id),
    "province",
    error,
  );
  uniqueIds(
    consProps.map((p) => p.id),
    "constituency",
    error,
  );
  uniqueIds(
    cities.cities.map((c) => c.id),
    "city",
    error,
  );

  const provincePop = provinceProps.reduce((s, p) => s + p.population, 0);
  const consPop = consProps.reduce((s, p) => s + p.population, 0);
  const consSeats = consProps.reduce((s, p) => s + p.seats, 0);
  const partySeats = parties.parties.reduce((s, p) => s + p.assembly_seats, 0);
  const scenarioSeats = Object.values(scenario.assembly.party_seats).reduce((a, b) => a + b, 0);
  if (provincePop !== 72_000_000) error(`province population sum ${provincePop} != 72000000`);
  if (consPop !== 72_000_000) error(`constituency population sum ${consPop} != 72000000`);
  if (consSeats !== 420) error(`constituency seats sum ${consSeats} != 420`);
  if (partySeats !== 420) error(`party seats sum ${partySeats} != 420`);
  if (scenarioSeats !== 420) error(`scenario seats sum ${scenarioSeats} != 420`);

  const institutionIds = new Set(institutions.institutions.map((i) => i.id));
  const worldIds = new Set(world.countries.map((c) => c.id));
  const byWorld = new Map(world.countries.map((c) => [c.id, c]));
  for (const c of world.countries) {
    if (c.map_path_id !== c.id) error(`${c.id}: map_path_id mismatch`);
    for (const a of c.alignment_ids) {
      if (!institutionIds.has(a)) error(`${c.id}: unknown alignment_id ${a}`);
    }
    for (const n of c.neighbor_ids) {
      if (!worldIds.has(n)) error(`${c.id}: unknown neighbor ${n}`);
      const other = byWorld.get(n);
      if (other && !other.neighbor_ids.includes(c.id)) {
        error(`neighbor relation asymmetric: ${c.id} -> ${n}`);
      }
    }
  }

  const partyIds = new Set(parties.parties.map((p) => p.id));
  const nomById = new Map(noms.rules.map((r) => [r.id, r]));
  const factionIds = new Set(parties.parties.flatMap((p) => p.factions.map((f) => f.id)));
  const provIds = new Set(provinceProps.map((p) => p.id));
  const expectedProvinces = [
    "FDV",
    ...Array.from({ length: 20 }, (_, i) => `P${String(i + 1).padStart(2, "0")}`),
  ];
  for (const id of expectedProvinces) {
    if (!provIds.has(id)) error(`missing expected province id ${id}`);
  }
  for (const p of provinceProps) {
    if (!Number.isFinite(p.population) || p.population < 0) {
      error(`${p.id}: population must be finite and >= 0`);
    }
    if (p.svg_path_id !== undefined && p.svg_path_id !== p.id) {
      error(`${p.id}: svg_path_id ${p.svg_path_id} must match id`);
    }
  }
  const issueIds = new Set(issuesFile.issues.map((i) => i.id));
  const figureIds = new Set(figures.figures.map((f) => f.id));

  for (const rule of noms.rules) {
    if (!partyIds.has(rule.party_id)) error(`${rule.id}: unknown party_id ${rule.party_id}`);
  }
  for (const p of parties.parties) {
    const rule = nomById.get(p.nomination_rule_id);
    if (!rule) error(`${p.id}: missing nomination rule ${p.nomination_rule_id}`);
    else if (rule.party_id !== p.id) {
      error(`${p.id}: nomination rule ${rule.id} belongs to ${rule.party_id}`);
    }
    if (p.factions.length) {
      const share = p.factions.reduce((s, f) => s + f.share, 0);
      if (Math.abs(share - 1) > 1e-9) error(`${p.id}: faction shares sum to ${share}`);
    }
    for (const f of p.factions) {
      if (f.party_id !== p.id) error(`${f.id}: party_id mismatch`);
    }
  }

  const scenarioPartyKeys = Object.keys(scenario.assembly.party_seats).sort();
  const canonicalPartyKeys = [...partyIds].sort();
  if (scenarioPartyKeys.join(",") !== canonicalPartyKeys.join(",")) {
    error(
      `scenario party_seats keys [${scenarioPartyKeys.join(",")}] != parties [${canonicalPartyKeys.join(",")}]`,
    );
  }

  if (!figureIds.has(scenario.president_id)) error("scenario president missing from figures");
  if (!figureIds.has(scenario.speaker_id)) error("scenario speaker missing from figures");

  for (const f of figures.figures) {
    if (f.party_id != null && !partyIds.has(f.party_id)) {
      error(`${f.id}: unknown party_id ${f.party_id}`);
    }
    if (f.faction_id != null && !factionIds.has(f.faction_id)) {
      error(`${f.id}: unknown faction_id ${f.faction_id}`);
    }
    if (!provIds.has(f.home_province_id)) {
      error(`${f.id}: unknown home_province_id ${f.home_province_id}`);
    }
  }

  for (const o of orgs.organizations) {
    for (const iid of o.issues) {
      if (!issueIds.has(iid)) error(`${o.id}: unknown issue ${iid}`);
    }
    for (const pid of o.lean_party_ids) {
      if (!partyIds.has(pid)) error(`${o.id}: unknown lean party ${pid}`);
    }
  }

  for (const city of cities.cities) {
    if (!provIds.has(city.province_id)) error(`${city.id}: unknown province ${city.province_id}`);
  }

  if (crosswalk.terena.world_country_id !== "W41") error("crosswalk world_country_id must be W41");
  if (crosswalk.terena.domestic_country_id !== "TER")
    error("crosswalk domestic_country_id must be TER");
  if (crosswalk.terena.domestic_svg_country_id !== "TERENA") {
    error("crosswalk domestic_svg_country_id must be TERENA");
  }
  const cw = crosswalk as {
    terena: {
      source_state_id?: number;
      province_crosswalk?: Record<string, { id?: string }>;
      world_country_id: string;
      domestic_country_id: string;
      domestic_svg_country_id: string;
    };
    states?: Record<string, unknown>;
  };
  if (cw.terena.source_state_id !== 41) {
    error(`crosswalk terena.source_state_id must be 41, got ${String(cw.terena.source_state_id)}`);
  }
  if (!cw.states || !("41" in cw.states)) {
    error("crosswalk states missing source state key 41");
  }
  // Any Wxx identity referenced in crosswalk must exist in W01–W48
  const walkJson = JSON.stringify(crosswalk);
  for (const m of walkJson.matchAll(/\bW(\d{2})\b/g)) {
    const id = `W${m[1]}`;
    const n = Number(m[1]);
    if (n < 1 || n > 48 || !worldIds.has(id)) {
      error(`crosswalk references nonexistent world identity ${id}`);
    }
  }
  const provinceCw = cw.terena.province_crosswalk ?? {};
  const cwProvinceIds = new Set(
    Object.values(provinceCw)
      .map((v) => v.id)
      .filter((id): id is string => typeof id === "string"),
  );
  for (const id of expectedProvinces) {
    if (!cwProvinceIds.has(id)) error(`crosswalk province_crosswalk missing ${id}`);
  }
  for (const id of cwProvinceIds) {
    if (!expectedProvinces.includes(id)) {
      error(`crosswalk province_crosswalk has unexpected province id ${id}`);
    }
  }
  if (constitution.assembly.seats !== 420) error("constitution assembly seats must be 420");
  void counting;

  let cross = 0;
  for (const p of consProps) {
    const cid = p.id;
    if (!Number.isFinite(p.population) || p.population < 0) {
      error(`${cid}: population must be finite and >= 0`);
    }
    if (!Number.isInteger(p.seats) || p.seats <= 0) {
      error(`${cid}: seats must be a positive integer`);
    }
    if (p.svg_path_id !== undefined && p.svg_path_id !== p.id) {
      error(`${cid}: svg_path_id ${p.svg_path_id} must match id`);
    }
    const shares = p.province_population_shares;
    if (!provIds.has(p.plurality_province_id)) {
      error(`${cid}: bad plurality_province_id`);
    }
    if (!shares.length) error(`${cid}: missing province_population_shares`);
    let total = 0;
    for (const x of shares) {
      if (!provIds.has(x.province_id)) {
        error(`${cid}: share references unknown province ${x.province_id}`);
      }
      if (!Number.isFinite(x.share) || x.share < 0) {
        error(`${cid}: share for ${x.province_id} must be finite and >= 0`);
      }
      total += x.share;
    }
    if (Math.abs(total - 1) > 1e-4) error(`${cid}: province shares sum to ${total}`);
    if (shares.length) {
      const topShare = Math.max(...shares.map((x) => x.share));
      const stored = shares.find((x) => x.province_id === p.plurality_province_id)?.share ?? 0;
      if (Math.abs(stored - topShare) > 1e-6) {
        error(`${cid}: plurality province does not have top population share`);
      }
      if (p.crosses_province_boundaries !== shares.length > 1) {
        error(`${cid}: crosses_province_boundaries mismatch`);
      }
      if (p.crosses_province_boundaries) cross += 1;
    }
  }

  const worldSvgIds = extractSvgIds(worldSvg);
  const terenaSvgIds = extractSvgIds(terenaSvg);
  for (let i = 1; i <= 48; i++) {
    const id = `W${String(i).padStart(2, "0")}`;
    if (!worldSvgIds.has(id)) error(`world SVG missing ${id}`);
  }
  if (!terenaSvgIds.has("TERENA")) error("Terena SVG missing TERENA outline");
  if (!terenaSvgIds.has("FDV")) error("Terena SVG missing FDV");
  for (let i = 1; i <= 20; i++) {
    const id = `P${String(i).padStart(2, "0")}`;
    if (!terenaSvgIds.has(id)) error(`Terena SVG missing ${id}`);
  }
  for (let i = 1; i <= 48; i++) {
    const id = `C${String(i).padStart(3, "0")}`;
    if (!terenaSvgIds.has(id)) error(`Terena SVG missing ${id}`);
  }
  for (let i = 1; i <= 18; i++) {
    const id = `CITY${String(i).padStart(2, "0")}`;
    if (!terenaSvgIds.has(id)) error(`Terena SVG missing ${id}`);
  }

  // Phase 0b roster / office / electorate invariants
  {
    const mps = figures.figures.filter((f) =>
      (f.roles ?? []).some((r) => r.type === "assembly_member"),
    );
    if (mps.length !== 420) error(`expected 420 Assembly members, got ${mps.length}`);
    const mpPartyCounts: Record<string, number> = {};
    const mpByConst: Record<string, number> = {};
    const mpIds = new Set<string>();
    for (const f of mps) {
      mpIds.add(f.id);
      const pid = f.party_id ?? "PARTY_IND";
      mpPartyCounts[pid] = (mpPartyCounts[pid] ?? 0) + 1;
      const mpRole = f.roles.find((r) => r.type === "assembly_member") as
        { constituency_id?: string } | undefined;
      const cid = mpRole?.constituency_id ?? "";
      if (!cid) error(`${f.id}: MP missing constituency_id`);
      else {
        mpByConst[cid] = (mpByConst[cid] ?? 0) + 1;
        if (!consProps.some((c) => c.id === cid)) error(`${f.id}: unknown constituency ${cid}`);
      }
    }
    const expectedSeats: Record<string, number> = {
      PARTY_LAB: 128,
      PARTY_NU: 110,
      PARTY_CR: 69,
      PARTY_GRN: 41,
      PARTY_RL: 35,
      PARTY_PM: 29,
      PARTY_IND: 8,
    };
    for (const [pid, n] of Object.entries(expectedSeats)) {
      if ((mpPartyCounts[pid] ?? 0) !== n) {
        error(`MP party total ${pid}=${mpPartyCounts[pid] ?? 0} != ${n}`);
      }
    }
    for (const c of consProps) {
      if ((mpByConst[c.id] ?? 0) !== c.seats) {
        error(`${c.id}: MP count ${mpByConst[c.id] ?? 0} != seats ${c.seats}`);
      }
    }
    const governors = figures.figures.filter((f) =>
      (f.roles ?? []).some((r) => r.type === "governor"),
    );
    if (governors.length !== 21) error(`expected 21 governors, got ${governors.length}`);
    for (const g of governors) {
      if ((g.roles ?? []).some((r) => r.type === "assembly_member")) {
        error(`${g.id}: governor cannot also be Assembly member`);
      }
    }
    const judges = figures.figures.filter((f) =>
      (f.roles ?? []).some(
        (r) => r.type === "constitutional_court_judge" || r.type === "chief_justice",
      ),
    );
    if (judges.length !== 9) error(`expected 9 court judges, got ${judges.length}`);
    const chiefs = figures.figures.filter((f) =>
      (f.roles ?? []).some((r) => r.type === "chief_justice"),
    );
    if (chiefs.length !== 1 || chiefs[0]?.id !== "NPC020") {
      error("Chief Justice must be exactly NPC020");
    }
    for (const j of judges) {
      if (j.party_id != null) {
        error(`${j.id}: sitting Constitutional Court judge must not have active party_id`);
      }
      if ((j.roles ?? []).some((r) => r.type === "assembly_member")) {
        error(`${j.id}: judge cannot also be Assembly member`);
      }
      const court = (j as { court?: { appointed?: string; term_ends?: string } }).court;
      if (!court?.appointed || !court.term_ends) {
        error(`${j.id}: missing court appointment/term_ends`);
      } else {
        const [ay, am, ad] = court.appointed.split("-").map(Number);
        const [ey, em, ed] = court.term_ends.split("-").map(Number);
        if (ey! - ay! !== 12 || am !== em || ad !== ed) {
          error(
            `${j.id}: court term must be exactly 12 years same month/day (${court.appointed} → ${court.term_ends})`,
          );
        }
      }
    }

    // Age must not be an authoritative competing field
    for (const f of figures.figures) {
      if ("age" in f && (f as { age?: unknown }).age !== undefined) {
        error(`${f.id}: remove authoritative age; derive from birth_date`);
      }
      const birth = f.birth_date;
      if (birth) {
        const [by, bm, bd] = birth.split("-").map(Number);
        let age = 2028 - by!;
        if (1 < bm! || (1 === bm && 1 < bd!)) age -= 1;
        if (age < 18 || age > 95) warn(`${f.id}: unusual age ${age} on 2028-01-01`);
        const first = (f as { first_elected_year?: number }).first_elected_year;
        if (first !== undefined && first < by! + 21) {
          error(`${f.id}: first_elected_year ${first} before age 21 (born ${birth})`);
        }
      }
    }

    const mara = figures.figures.find((f) => f.id === "NPC001");
    if (mara) {
      const ps = (mara as { presidential_status?: string }).presidential_status;
      if (ps && ps !== "term_limited_incumbent" && ps !== "ineligible") {
        error(`NPC001 presidential_status must be term-limited/ineligible, got ${ps}`);
      }
      if ((mara as { campaign_status?: string }).campaign_status) {
        error("NPC001 must not have campaign_status while term-limited");
      }
    }

    // Cross-province MP homes should not be ~100% plurality province
    {
      let cross = 0;
      let outsidePlural = 0;
      for (const f of mps) {
        const mpRole = f.roles.find((r) => r.type === "assembly_member") as
          { constituency_id?: string } | undefined;
        const cid = mpRole?.constituency_id;
        const cons = consProps.find((c) => c.id === cid);
        if (!cons || cons.province_population_shares.length <= 1) continue;
        cross += 1;
        if (f.home_province_id !== cons.plurality_province_id) outsidePlural += 1;
        const allowed = new Set(cons.province_population_shares.map((s) => s.province_id));
        if (!allowed.has(f.home_province_id)) {
          error(`${f.id}: home ${f.home_province_id} not in ${cid} province shares`);
        }
      }
      if (cross > 50 && outsidePlural / cross < 0.05) {
        error(
          `cross-province MP homes almost entirely plurality province (${outsidePlural}/${cross})`,
        );
      }
    }

    // STV archive must not be trivially engineered
    {
      let elim = 0;
      let firstCount = 0;
      for (const row of election2026.constituencies ?? []) {
        const result = (
          row as {
            result?: {
              eliminated?: string[];
              elected?: string[];
              quota?: string;
              firstPreferences?: Record<string, string>;
              steps?: { action: string }[];
            };
          }
        ).result;
        if (!result) continue;
        elim += result.eliminated?.length ?? 0;
        const quotaSer = result.quota ?? "0/1";
        const [qn, qd] = quotaSer.split("/").map(Number);
        const quota = (qn ?? 0) / (qd || 1);
        for (const id of result.elected ?? []) {
          const fpSer = result.firstPreferences?.[id] ?? "0/1";
          const [fn, fd] = fpSer.split("/").map(Number);
          const fp = (fn ?? 0) / (fd || 1);
          if (fp + 1e-9 >= quota) firstCount += 1;
        }
      }
      if (elim < 30) error(`2026 archive too few eliminations nationally: ${elim}`);
      if (firstCount >= 420) error("2026 archive: all winners elected on first prefs (engineered)");
      if (firstCount === 0) warn("2026 archive: zero first-count elected (unusual)");
    }

    if (figures.figures.length < 500 || figures.figures.length > 550) {
      warn(`roster size ${figures.figures.length} outside 500–550 target band`);
    }

    const electionCons = election2026.constituencies ?? [];
    if (electionCons.length !== 48) {
      error(`2026 election must have 48 constituencies, got ${electionCons.length}`);
    }
    const nationalSeats = (election2026 as { national_party_seats?: Record<string, number> })
      .national_party_seats;
    if (nationalSeats) {
      for (const [pid, n] of Object.entries(expectedSeats)) {
        if ((nationalSeats[pid] ?? 0) !== n) {
          error(`2026 national_party_seats ${pid}=${nationalSeats[pid] ?? 0} != ${n}`);
        }
      }
    } else {
      error("2026 election missing national_party_seats");
    }
    const electedIds = new Set<string>();
    for (const row of electionCons) {
      const cid = String((row as { constituency_id?: string }).constituency_id ?? "");
      const seats = Number((row as { seats?: number }).seats ?? 0);
      const elected = ((row as { result?: { elected?: string[] } }).result?.elected ??
        []) as string[];
      const consMeta = consProps.find((c) => c.id === cid);
      if (!consMeta) error(`2026 archive unknown constituency ${cid}`);
      else if (seats !== consMeta.seats) {
        error(`2026 ${cid}: seats ${seats} != geo ${consMeta.seats}`);
      }
      if (elected.length !== seats) {
        error(`2026 ${cid}: elected ${elected.length} != seats ${seats}`);
      }
      for (const id of elected) {
        if (electedIds.has(id)) error(`2026 duplicate elected ID ${id}`);
        electedIds.add(id);
        if (!mpIds.has(id)) error(`2026 winner ${id} is not a 2028 Assembly member`);
      }
    }
    if (electedIds.size !== 420) {
      error(`2026 elected unique winners ${electedIds.size} != 420`);
    }
    for (const id of mpIds) {
      if (!electedIds.has(id)) error(`2028 MP ${id} missing from 2026 winners`);
    }

    // Every election candidate resolves to exactly one persistent identity
    {
      const histById = new Map(historicalCandidates.candidates.map((c) => [c.id, c] as const));
      const figById = new Map(figures.figures.map((f) => [f.id, f] as const));
      const seenCand = new Set<string>();
      for (const row of electionCons) {
        for (const cand of (row as { candidates?: Array<Record<string, unknown>> }).candidates ??
          []) {
          const id = String(cand.id ?? "");
          const kind = String(cand.kind ?? "");
          const name = String(cand.name ?? "");
          if (!id) {
            error("2026 candidate missing id");
            continue;
          }
          if (seenCand.has(id)) error(`2026 duplicate candidate id ${id}`);
          seenCand.add(id);
          if (/\d/.test(name)) error(`2026 candidate name contains digit: ${name}`);
          if (kind === "politician") {
            const fig = figById.get(id);
            if (!fig) error(`2026 politician candidate ${id} missing from starting_figures`);
            else {
              if (fig.name !== name) error(`${id}: election name != figure name`);
              const ep = (cand.party_id as string | null) ?? null;
              const fp = fig.party_id ?? null;
              if (ep !== fp && !(ep === "PARTY_IND" && fp === null)) {
                error(`${id}: election party ${ep} != figure party ${fp}`);
              }
            }
            if (histById.has(id)) error(`${id}: cannot be both politician and historical`);
          } else if (kind === "historical") {
            const hc = histById.get(id);
            if (!hc) error(`2026 historical candidate ${id} missing from historical file`);
            else {
              if (hc.name !== name) error(`${id}: election name != historical name`);
              if (electedIds.has(id)) error(`historical ${id} is elected (must be politician)`);
            }
            if (figById.has(id)) error(`${id}: historical id also in starting_figures`);
          } else {
            error(`2026 candidate ${id} has invalid kind ${kind}`);
          }
        }
      }
      for (const hc of historicalCandidates.candidates) {
        if (!seenCand.has(hc.id)) {
          error(`historical candidate ${hc.id} not present in 2026 election`);
        }
        if (/\d/.test(hc.name)) error(`historical name contains digit: ${hc.name}`);
      }
    }

    // Text / name sanity across figures
    for (const f of figures.figures) {
      if (/\d/.test(f.name)) error(`${f.id}: name contains digit`);
      const blob = `${f.name}|${f.office}|${f.notes}|${f.party ?? ""}|${f.faction ?? ""}|${f.display_summary}`;
      if (blob.includes("???") || blob.includes("\uFFFD")) {
        error(`${f.id}: text corruption (??? or replacement char)`);
      }
    }

    // Court philosophy + appointing authority + legal career
    const adminRel = manifest.derived_or_reference.terena_presidential_administrations;
    const administrations = PresidentialAdministrationsFileSchema.parse(
      parseJson(reader.readText(adminRel!), adminRel!),
    );
    checkVersion("terena_presidential_administrations", administrations.content_version, false);
    const adminIds = new Set(administrations.administrations.map((a) => a.id));
    const figureIdSet = new Set(figures.figures.map((f) => f.id));
    const CREDIBLE_LEGAL_PATHS = new Set([
      "appellate_judge",
      "lower_court_judge",
      "constitutional_lawyer",
      "public_law_attorney",
      "justice_ministry_official",
      "legal_academic",
      "prosecutor_then_judge",
      "public_defender_then_judge",
      "private_counsel_then_judge",
    ]);
    for (const j of judges) {
      if (j.faction_id != null) {
        error(`${j.id}: sitting Constitutional Court judge must not have faction_id`);
      }
      const court = j as {
        background?: string;
        traits?: { partyLoyalty?: number; factionLoyalty?: number; institutionalism?: number };
        court?: {
          legal_philosophy?: string;
          appointing_president?: string;
          appointing_administration?: string;
          legal_career?: {
            prior_path?: string;
            prior_offices?: string[];
            path_summary?: string;
          };
        };
      };
      const c = court.court;
      if (!c?.legal_philosophy) error(`${j.id}: missing legal_philosophy`);
      if (!c?.appointing_president && !c?.appointing_administration) {
        error(`${j.id}: missing appointing authority`);
      }
      if (c?.appointing_president && !figureIdSet.has(c.appointing_president)) {
        error(`${j.id}: appointing_president ${c.appointing_president} unresolved`);
      }
      if (c?.appointing_administration && !adminIds.has(c.appointing_administration)) {
        error(`${j.id}: appointing_administration ${c.appointing_administration} unresolved`);
      }
      const career = c?.legal_career;
      if (!career?.prior_path || !CREDIBLE_LEGAL_PATHS.has(career.prior_path)) {
        error(`${j.id}: missing credible legal_career.prior_path`);
      }
      if (!career?.prior_offices?.length || !career.path_summary) {
        error(`${j.id}: legal_career needs prior_offices and path_summary`);
      }
      if (court.background && court.background !== "law") {
        error(`${j.id}: court justice background should be law (got ${court.background})`);
      }
      const pl = court.traits?.partyLoyalty ?? 1;
      const fl = court.traits?.factionLoyalty ?? 1;
      const inst = court.traits?.institutionalism ?? 0;
      if (pl > 0.2) error(`${j.id}: court partyLoyalty ${pl} too high for nonpartisan justice`);
      if (fl > 0.15) error(`${j.id}: court factionLoyalty ${fl} too high for nonpartisan justice`);
      if (inst < 0.65) error(`${j.id}: court institutionalism ${inst} too low`);
    }

    // PARTY_IND is an electoral aggregate, never individual membership
    for (const f of figures.figures) {
      if (f.party_id === "PARTY_IND") {
        error(`${f.id}: individual figures must not use PARTY_IND membership (use party_id null)`);
      }
      const traits = (f as { traits?: { partyLoyalty?: number; factionLoyalty?: number } }).traits;
      if (!traits) continue;
      const authored = /^NPC0(0[1-9]|1[0-9]|2[0-9]|30)$/.test(f.id) || f.id === "NPC020";
      if (authored) continue;
      if (f.party_id == null) {
        if ((traits.partyLoyalty ?? 1) > 0.2 || (traits.factionLoyalty ?? 1) > 0.15) {
          error(
            `${f.id}: unaffiliated figure loyalty too high (party=${traits.partyLoyalty}, faction=${traits.factionLoyalty})`,
          );
        }
      } else if (f.faction_id == null && (traits.factionLoyalty ?? 1) > 0.15) {
        error(`${f.id}: factionLoyalty too high without faction_id`);
      }
    }
    for (const p of parties.parties) {
      const ot = (p as { organization_type?: string }).organization_type;
      if (p.id === "PARTY_IND") {
        if (ot !== "independent_aggregate") {
          error("PARTY_IND must have organization_type independent_aggregate");
        }
      } else if (ot !== "membership_party") {
        error(`${p.id}: membership parties must use organization_type membership_party`);
      }
    }

    // Every recognized faction has exactly one current faction_chair
    {
      const allFactions = parties.parties.flatMap((p) =>
        p.factions.map((f) => ({ ...f, party_id: p.id })),
      );
      const chairByFaction = new Map<string, string>();
      for (const f of figures.figures) {
        for (const role of f.roles ?? []) {
          if (role.type !== "faction_chair") continue;
          const fid = (role as { faction_id?: string }).faction_id ?? f.faction_id ?? "";
          if (!fid) {
            error(`${f.id}: faction_chair missing faction_id`);
            continue;
          }
          if (chairByFaction.has(fid)) {
            error(`faction ${fid} has multiple chairs (${chairByFaction.get(fid)}, ${f.id})`);
          }
          chairByFaction.set(fid, f.id);
          const facMeta = allFactions.find((x) => x.id === fid);
          if (!facMeta) error(`${f.id}: faction_chair for unknown faction ${fid}`);
          else {
            if (f.party_id !== facMeta.party_id) {
              error(`${f.id}: faction chair party ${f.party_id} != ${facMeta.party_id}`);
            }
            if (f.faction_id !== fid) {
              error(`${f.id}: faction chair must belong to ${fid}`);
            }
            if (!(f.roles ?? []).some((r) => r.type === "assembly_member")) {
              warn(`${f.id}: faction chair ${fid} is not an Assembly member`);
            }
          }
        }
      }
      for (const fac of allFactions) {
        if (!chairByFaction.has(fac.id)) {
          error(`faction ${fac.id} has no faction_chair`);
        }
      }
    }

    // Pollster house effects must be centered vote-share-point offsets
    for (const p of pollsters.pollsters) {
      const he = (p as { house_effects?: Record<string, unknown> }).house_effects;
      if (!he) continue;
      const byParty = (he.by_party ?? he) as Record<string, number>;
      if (he.unit && he.unit !== "vote_share_points") {
        warn(`pollster ${p.id}: unexpected house_effects.unit ${String(he.unit)}`);
      }
      const vals = Object.values(byParty).filter((v) => typeof v === "number") as number[];
      const sum = vals.reduce((a, b) => a + b, 0);
      if (Math.abs(sum) > 0.02) {
        error(`pollster ${p.id}: house_effects not centered (sum=${sum})`);
      }
    }

    // Turnout consistency when present
    for (const row of electionCons) {
      const t = (
        row as {
          turnout?: {
            ballots_cast?: number;
            invalid_or_blank?: number;
            valid_vote_value?: string | number;
          };
          total_valid?: string;
        }
      ).turnout;
      if (!t) continue;
      const validNum =
        typeof t.valid_vote_value === "string"
          ? Number(t.valid_vote_value.split("/")[0])
          : Number(t.valid_vote_value);
      if (
        t.ballots_cast !== undefined &&
        t.invalid_or_blank !== undefined &&
        t.ballots_cast !== validNum + t.invalid_or_blank
      ) {
        error(
          `${(row as { constituency_id?: string }).constituency_id}: ballots_cast != valid+invalid`,
        );
      }
    }

    const blocCons = voterBlocs.constituencies ?? [];
    if (blocCons.length !== 48) {
      error(`voter blocs must cover 48 constituencies, got ${blocCons.length}`);
    }
    const issueIdSet = new Set(issuesFile.issues.map((i) => i.id));
    const partyIdSet = new Set(parties.parties.map((p) => p.id));
    for (const row of blocCons) {
      const cid = row.constituency_id;
      if (!consProps.some((c) => c.id === cid)) error(`voter bloc unknown constituency ${cid}`);
      const sum = row.blocs.reduce((a, b) => a + b.weight, 0);
      if (Math.abs(sum - 1) > 1e-6) error(`${cid}: bloc weights sum to ${sum}`);
      for (const b of row.blocs) {
        const habit = (b as { party_habit?: Record<string, number> }).party_habit;
        if (habit) {
          for (const pid of Object.keys(habit)) {
            if (pid !== "PARTY_IND" && !partyIdSet.has(pid)) {
              error(`${cid}/${b.id}: unknown party_habit ${pid}`);
            }
          }
        }
        const salience = (b as { issue_salience?: Record<string, number> }).issue_salience;
        if (salience) {
          for (const iid of Object.keys(salience)) {
            if (!issueIdSet.has(iid)) error(`${cid}/${b.id}: unknown issue ${iid}`);
          }
        }
      }
    }

    uniqueIds(
      pollsters.pollsters.map((p) => p.id),
      "pollster",
      error,
    );
    if (pollsters.pollsters.length < 8 || pollsters.pollsters.length > 16) {
      warn(`pollster count ${pollsters.pollsters.length} outside expected 8–12 (+regional) band`);
    }

    uniqueIds(
      historicalCandidates.candidates.map((c) => c.id),
      "historical candidate",
      error,
    );
  }

  const index = createIndex({
    world: world.countries.map((c) => c.id),
    provinces: provinceProps.map((p) => p.id),
    constituencies: consProps.map((p) => p.id),
    cities: cities.cities.map((c) => c.id),
    parties: parties.parties.map((p) => p.id),
    factions: parties.parties.flatMap((p) => p.factions.map((f) => f.id)),
    figures: figures.figures.map((f) => f.id),
    issues: issuesFile.issues.map((i) => i.id),
    institutions: institutions.institutions.map((i) => i.id),
  });

  const errors = issues.filter((i) => i.level === "error");
  const summary = `Content version: ${manifest.content_version}; countries=${world.countries.length}; admin=${provinces.features.length}; constituencies=${constituencies.features.length}; figures=${figures.figures.length}; cross-province=${cross}/48`;
  const report: ValidationReport = {
    contentVersion: manifest.content_version,
    ok: errors.length === 0,
    issues,
    summary,
  };

  if (!report.ok) return { report };

  const content: ParsedAuthoritativeContent = deepFreeze({
    world_countries: world,
    world_institutions: institutions,
    terena_constitution: constitution,
    terena_parties: parties,
    terena_nomination_rules: noms,
    terena_provinces: provinces,
    terena_constituencies: constituencies,
    terena_cities: cities,
    terena_issues: issuesFile,
    terena_organizations: orgs,
    terena_media: media,
    starting_figures: figures,
    scenario,
    canonical_crosswalk: crosswalk,
    terena_electoral_counting: counting,
    world_svg: worldSvg,
    terena_svg: terenaSvg,
  });

  const bundle: ContentBundle = Object.freeze({
    root: rootLabel,
    manifest: deepFreeze(manifest),
    content,
    index,
    presidentialEligibility: deepFreeze(eligibility),
  });

  return { report, bundle };
}

export function validateCanonicalContent(
  rootLabel: string,
  reader: ContentFileReader,
): ValidationReport {
  return validateAndLoadContent(rootLabel, reader).report;
}

export function buildContentBundle(rootLabel: string, reader: ContentFileReader): ContentBundle {
  const { report, bundle } = validateAndLoadContent(rootLabel, reader);
  if (!bundle || !report.ok) {
    const msgs = report.issues
      .filter((i) => i.level === "error")
      .map((i) => i.message)
      .join("\n");
    throw new Error(`Canonical content validation failed:\n${msgs}`);
  }
  return bundle;
}
