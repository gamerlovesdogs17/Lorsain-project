import {
  CitiesFileSchema,
  ConstitutionFileSchema,
  ConstituenciesGeoJsonSchema,
  ConstituencyPropertiesSchema,
  CrosswalkFileSchema,
  ElectoralCountingSchema,
  IssuesFileSchema,
  ManifestSchema,
  MediaFileSchema,
  NominationRulesFileSchema,
  OrganizationsFileSchema,
  PartiesFileSchema,
  PresidentialEligibilitySchema,
  ProvincePropertiesSchema,
  ProvincesGeoJsonSchema,
  ScenarioFileSchema,
  StartingFiguresFileSchema,
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
  /**
   * Pending eligibility draft (reference only). Not final gameplay law until status=approved
   * and promoted to authoritative content.
   */
  pendingPresidentialEligibility?: PresidentialEligibilityFile;
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
    "presidential_eligibility_pending",
  ]) {
    if (!(key in manifest.derived_or_reference)) {
      error(`manifest.derived_or_reference missing key: ${key}`);
    }
  }
  if ("presidential_eligibility" in manifest.authoritative) {
    error(
      "presidential_eligibility must not be authoritative while draft; use derived_or_reference.presidential_eligibility_pending",
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
  let pendingEligibility: PresidentialEligibilityFile | undefined;

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
    checkVersion("terena_provinces", (provinces as { content_version?: string }).content_version);
    checkVersion(
      "terena_constituencies",
      (constituencies as { content_version?: string }).content_version,
    );

    const pendingRel = manifest.derived_or_reference.presidential_eligibility_pending;
    if (pendingRel && reader.exists(pendingRel)) {
      pendingEligibility = PresidentialEligibilitySchema.parse(
        parseJson(reader.readText(pendingRel), pendingRel),
      );
      if (pendingEligibility.status === "approved") {
        warn(
          "presidential eligibility is approved but still listed as pending/reference — promote to authoritative after content approval workflow",
        );
      }
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
    ...(pendingEligibility
      ? { pendingPresidentialEligibility: deepFreeze(pendingEligibility) }
      : {}),
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
