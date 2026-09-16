import { SCENARIO_FORMAT, SCENARIO_FORMAT_VERSION } from "./constants.js";
import type {
  ScenarioContentEmbed,
  ScenarioContentSections,
  ScenarioDocument,
  AssemblySystemId,
  GovernmentFormId,
  ThresholdPresetId,
  ScenarioPartySection,
  ScenarioProvinceSection,
  ScenarioConstituencySection,
  ScenarioPoliticianSection,
  ScenarioGovernmentSection,
  ScenarioElectionsSection,
  ScenarioLawSection,
  ScenarioOrganizationSection,
  ScenarioForeignCountrySection,
  ScenarioForeignRelationSection,
  ScenarioForeignTreatySection,
  ScenarioForeignCrisisSection,
} from "./types.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function strArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.map((x) => String(x));
}

/** Drop `undefined` values so optional props satisfy exactOptionalPropertyTypes. */
function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as T;
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const val = obj[key];
    if (val !== undefined) out[key] = val as T[keyof T];
  }
  return out;
}

function parseThresholdPreset(v: unknown): ThresholdPresetId | undefined {
  if (
    v === "simple_majority" ||
    v === "three_fifths" ||
    v === "two_thirds" ||
    v === "three_quarters" ||
    v === "custom"
  ) {
    return v;
  }
  return undefined;
}

function parseGovernmentForm(v: unknown): GovernmentFormId | undefined {
  if (v === "presidential" || v === "parliamentary" || v === "semi") return v;
  return undefined;
}

function parseAssemblySystem(v: unknown): AssemblySystemId | undefined {
  if (v === "stv" || v === "fptp" || v === "closed_list_pr" || v === "mixed_member") return v;
  return undefined;
}

function parseContentSections(raw: unknown): ScenarioContentSections {
  if (!isRecord(raw)) return {};
  const out: ScenarioContentSections = {};
  if (isRecord(raw.overview)) {
    out.overview = {
      ...(typeof raw.overview.tagline === "string" ? { tagline: raw.overview.tagline } : {}),
      ...(typeof raw.overview.foundingYear === "number"
        ? { foundingYear: raw.overview.foundingYear }
        : {}),
    };
  }
  if (isRecord(raw.constitution)) {
    const c = raw.constitution;
    const constitution: ScenarioContentSections["constitution"] = {};
    const gf = parseGovernmentForm(c.governmentForm);
    if (gf) constitution.governmentForm = gf;
    const seats = num(c.assemblySeats);
    if (seats != null) constitution.assemblySeats = seats;
    const maj = num(c.assemblyAbsoluteMajority);
    if (maj != null) constitution.assemblyAbsoluteMajority = maj;
    const majPreset = parseThresholdPreset(c.assemblyAbsoluteMajorityPreset);
    if (majPreset) constitution.assemblyAbsoluteMajorityPreset = majPreset;
    const judges = num(c.courtJudges);
    if (judges != null) constitution.courtJudges = judges;
    const termYears = num(c.courtTermYears);
    if (termYears != null) constitution.courtTermYears = termYears;
    const censure = num(c.ministerialCensureFraction);
    if (censure != null) constitution.ministerialCensureFraction = censure;
    const censurePreset = parseThresholdPreset(c.ministerialCensurePreset);
    if (censurePreset) constitution.ministerialCensurePreset = censurePreset;
    const reviewDays = num(c.regulationReviewDays);
    if (reviewDays != null) constitution.regulationReviewDays = reviewDays;
    out.constitution = constitution;
  }
  if (Array.isArray(raw.parties)) {
    out.parties = raw.parties.filter(isRecord).map((p) => {
      const ideologyLabel =
        typeof p.ideologyLabel === "string"
          ? p.ideologyLabel
          : typeof p.ideology === "string"
            ? p.ideology
            : "";
      const platformSummary =
        typeof p.platformSummary === "string"
          ? p.platformSummary
          : typeof p.platform === "string"
            ? p.platform
            : undefined;
      return omitUndefined({
        id: str(p.id),
        name: str(p.name),
        abbreviation: str(p.abbreviation ?? p.short),
        ideology: ideologyLabel,
        ideologyLabel,
        leaderId: str(p.leaderId ?? p.leader_id),
        color:
          p.color === null || typeof p.color === "string" ? (p.color as string | null) : undefined,
        seatCount: num(p.seatCount),
        platformSummary,
        caucuses: Array.isArray(p.caucuses)
          ? p.caucuses.filter(isRecord).map((c) =>
              omitUndefined({
                id: str(c.id),
                name: str(c.name),
                leaderId: typeof c.leaderId === "string" ? c.leaderId : undefined,
                supportShare: num(c.supportShare),
              }),
            )
          : undefined,
      }) as ScenarioPartySection;
    });
  }
  if (isRecord(raw.geography)) {
    out.geography = {};
    if (Array.isArray(raw.geography.provinces)) {
      out.geography.provinces = raw.geography.provinces.filter(isRecord).map(
        (p) =>
          omitUndefined({
            id: str(p.id),
            name: str(p.name),
            population: num(p.population),
            economy: typeof p.economy === "string" ? p.economy : undefined,
            urbanization: typeof p.urbanization === "string" ? p.urbanization : undefined,
            characteristics: strArray(p.characteristics),
          }) as ScenarioProvinceSection,
      );
    }
    if (Array.isArray(raw.geography.constituencies)) {
      out.geography.constituencies = raw.geography.constituencies.filter(isRecord).map(
        (c) =>
          omitUndefined({
            id: str(c.id),
            name: str(c.name),
            provinceId: str(c.provinceId),
            seats: num(c.seats) ?? 0,
            population: num(c.population),
          }) as ScenarioConstituencySection,
      );
    }
  }
  if (isRecord(raw.people) && Array.isArray(raw.people.politicians)) {
    out.people = {
      politicians: raw.people.politicians.filter(isRecord).map(
        (p) =>
          omitUndefined({
            id: str(p.id),
            name: str(p.name),
            partyId: p.partyId === null || typeof p.partyId === "string" ? p.partyId : undefined,
            provinceId:
              p.provinceId === null || typeof p.provinceId === "string" ? p.provinceId : undefined,
            birthYear: num(p.birthYear),
            background: typeof p.background === "string" ? p.background : undefined,
            traits: strArray(p.traits),
            ideology: typeof p.ideology === "string" ? p.ideology : undefined,
            office: typeof p.office === "string" ? p.office : undefined,
          }) as ScenarioPoliticianSection,
      ),
    };
  }
  if (isRecord(raw.government)) {
    const g = raw.government;
    out.government = omitUndefined({
      presidentId:
        g.presidentId === null || typeof g.presidentId === "string"
          ? (g.presidentId as string | null)
          : undefined,
      headOfGovernmentId:
        g.headOfGovernmentId === null || typeof g.headOfGovernmentId === "string"
          ? (g.headOfGovernmentId as string | null)
          : undefined,
      cabinet: Array.isArray(g.cabinet)
        ? g.cabinet.filter(isRecord).map((c) => ({
            ministryId: str(c.ministryId),
            holderId: str(c.holderId),
          }))
        : undefined,
      coalitionPartyIds:
        strArray(g.coalitionPartyIds) ??
        (Array.isArray(g.coalitionPartyIds) ? g.coalitionPartyIds.map((x) => str(x)) : undefined),
    }) as ScenarioGovernmentSection;
  }
  if (isRecord(raw.elections)) {
    const e = raw.elections;
    out.elections = omitUndefined({
      assemblySystem: parseAssemblySystem(e.assemblySystem),
      presidentialMode: typeof e.presidentialMode === "string" ? e.presidentialMode : undefined,
      presidentialIntervalYears: num(e.presidentialIntervalYears),
      assemblyIntervalYears: num(e.assemblyIntervalYears),
      nominationRuleLabels: isRecord(e.nominationRuleLabels)
        ? Object.fromEntries(Object.entries(e.nominationRuleLabels).map(([k, v]) => [k, str(v)]))
        : undefined,
      nextAssemblyElectionDate: isIsoDate(e.nextAssemblyElectionDate)
        ? e.nextAssemblyElectionDate
        : undefined,
      nextPresidentialElectionDate: isIsoDate(e.nextPresidentialElectionDate)
        ? e.nextPresidentialElectionDate
        : undefined,
    }) as ScenarioElectionsSection;
  }
  if (isRecord(raw.laws) && Array.isArray(raw.laws.startingLaws)) {
    out.laws = {
      startingLaws: raw.laws.startingLaws.filter(isRecord).map(
        (l) =>
          omitUndefined({
            id: str(l.id),
            title: str(l.title),
            policyItems: strArray(l.policyItems),
            catalogRef: typeof l.catalogRef === "string" ? l.catalogRef : undefined,
          }) as ScenarioLawSection,
      ),
    };
  }
  if (Array.isArray(raw.organizations)) {
    out.organizations = raw.organizations.filter(isRecord).map(
      (o) =>
        omitUndefined({
          id: str(o.id),
          name: str(o.name),
          type: str(o.type),
          issues: strArray(o.issues) ?? [],
          scope: typeof o.scope === "string" ? o.scope : undefined,
        }) as ScenarioOrganizationSection,
    );
  }
  const parseForeignCountry = (c: Record<string, unknown>): ScenarioForeignCountrySection =>
    omitUndefined({
      id: str(c.id),
      name: str(c.name),
      region: typeof c.region === "string" ? c.region : undefined,
      relation: num(c.relation),
      leaderName: typeof c.leaderName === "string" ? c.leaderName : undefined,
    }) as ScenarioForeignCountrySection;
  if (Array.isArray(raw.foreignCountries)) {
    out.foreignCountries = raw.foreignCountries.filter(isRecord).map(parseForeignCountry);
  }
  if (isRecord(raw.foreign)) {
    out.foreign = {};
    if (Array.isArray(raw.foreign.countries)) {
      out.foreign.countries = raw.foreign.countries.filter(isRecord).map(parseForeignCountry);
    }
    if (Array.isArray(raw.foreign.relations)) {
      out.foreign.relations = raw.foreign.relations.filter(isRecord).map(
        (r) =>
          omitUndefined({
            a: str(r.a),
            b: str(r.b),
            diplomatic: num(r.diplomatic),
            trade: num(r.trade),
            security: num(r.security),
          }) as ScenarioForeignRelationSection,
      );
    }
    if (Array.isArray(raw.foreign.treaties)) {
      out.foreign.treaties = raw.foreign.treaties.filter(isRecord).map(
        (t) =>
          omitUndefined({
            id: str(t.id),
            title: str(t.title),
            kind: typeof t.kind === "string" ? t.kind : undefined,
            partyCountryIds:
              strArray(t.partyCountryIds) ??
              (Array.isArray(t.partyCountryIds) ? t.partyCountryIds.map((x) => str(x)) : undefined),
          }) as ScenarioForeignTreatySection,
      );
    }
    if (Array.isArray(raw.foreign.crises)) {
      out.foreign.crises = raw.foreign.crises.filter(isRecord).map(
        (c) =>
          omitUndefined({
            id: str(c.id),
            title: str(c.title),
            stage: typeof c.stage === "string" ? c.stage : undefined,
            involvedCountryIds:
              strArray(c.involvedCountryIds) ??
              (Array.isArray(c.involvedCountryIds)
                ? c.involvedCountryIds.map((x) => str(x))
                : undefined),
          }) as ScenarioForeignCrisisSection,
      );
    }
  }
  if (!out.foreign?.countries?.length && out.foreignCountries?.length) {
    out.foreign = { ...(out.foreign ?? {}), countries: out.foreignCountries };
  }
  if (Array.isArray(raw.contentPacks)) {
    out.contentPacks = raw.contentPacks.filter(isRecord).map((p) => ({
      packId: str(p.packId),
      version: str(p.version),
    }));
  }
  if (isRecord(raw.world)) {
    out.world = omitUndefined({
      assemblySeats: num(raw.world.assemblySeats),
      courtJudges: num(raw.world.courtJudges),
      jurisdictionId:
        typeof raw.world.jurisdictionId === "string" ? raw.world.jurisdictionId : undefined,
    }) as NonNullable<ScenarioContentSections["world"]>;
  }
  return out;
}

function parseContentEmbed(raw: unknown): ScenarioContentEmbed {
  if (!isRecord(raw) || typeof raw.kind !== "string") {
    return { kind: "mini_playable_v1" };
  }
  if (raw.kind === "kernel_input" && isRecord(raw.kernelInput)) {
    return { kind: "kernel_input", kernelInput: raw.kernelInput };
  }
  if (raw.kind === "content_bundle_ref") {
    return {
      kind: "content_bundle_ref",
      ...(typeof raw.bundleLabel === "string" ? { bundleLabel: raw.bundleLabel } : {}),
    };
  }
  return { kind: "mini_playable_v1" };
}

export function parseScenarioDocument(raw: unknown): ScenarioDocument {
  if (!isRecord(raw)) {
    throw new Error("Scenario document must be a JSON object");
  }
  const format = raw.format;
  if (format !== SCENARIO_FORMAT) {
    throw new Error(`Unsupported scenario format ${String(format)}`);
  }
  const formatVersion = raw.formatVersion;
  if (formatVersion !== SCENARIO_FORMAT_VERSION) {
    throw new Error(`Unsupported scenario formatVersion ${String(formatVersion)}`);
  }
  if (typeof raw.scenarioId !== "string" || raw.scenarioId.length === 0) {
    throw new Error("scenarioId is required");
  }
  if (typeof raw.name !== "string" || raw.name.length === 0) {
    throw new Error("name is required");
  }
  if (!isIsoDate(raw.startDate)) {
    throw new Error("startDate must be YYYY-MM-DD");
  }
  if (typeof raw.countryName !== "string" || raw.countryName.length === 0) {
    throw new Error("countryName is required");
  }
  const doc: ScenarioDocument = {
    format: SCENARIO_FORMAT,
    formatVersion: SCENARIO_FORMAT_VERSION,
    scenarioId: raw.scenarioId,
    name: raw.name,
    startDate: raw.startDate,
    countryName: raw.countryName,
    contentSections: parseContentSections(raw.contentSections),
    contentEmbed: parseContentEmbed(raw.contentEmbed),
  };
  if (typeof raw.description === "string") doc.description = raw.description;
  if (typeof raw.author === "string") doc.author = raw.author;
  if (typeof raw.gameVersion === "string") doc.gameVersion = raw.gameVersion;
  return doc;
}

export function serializeScenarioDocument(doc: ScenarioDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
