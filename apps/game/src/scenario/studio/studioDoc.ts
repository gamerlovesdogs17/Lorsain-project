import type {
  ScenarioDocument,
  ScenarioForeignCountrySection,
  ScenarioLawSection,
  ScenarioPoliticianSection,
} from "@lorsain/scenario";

type ScenarioConstitutionSection = NonNullable<
  ScenarioDocument["contentSections"]["constitution"]
>;

export function politicians(doc: ScenarioDocument): ScenarioPoliticianSection[] {
  return doc.contentSections.people?.politicians ?? [];
}

export function withPoliticians(
  doc: ScenarioDocument,
  list: ScenarioPoliticianSection[],
): ScenarioDocument {
  return {
    ...doc,
    contentSections: {
      ...doc.contentSections,
      people: { politicians: list },
    },
  };
}

export function foreignCountries(doc: ScenarioDocument): ScenarioForeignCountrySection[] {
  return (
    doc.contentSections.foreign?.countries ??
    doc.contentSections.foreignCountries ??
    []
  );
}

export function withForeignCountries(
  doc: ScenarioDocument,
  countries: ScenarioForeignCountrySection[],
): ScenarioDocument {
  return {
    ...doc,
    contentSections: {
      ...doc.contentSections,
      foreign: { ...(doc.contentSections.foreign ?? {}), countries },
      foreignCountries: countries,
    },
  };
}

export function startingLaws(doc: ScenarioDocument): ScenarioLawSection[] {
  return doc.contentSections.laws?.startingLaws ?? [];
}

export function withStartingLaws(doc: ScenarioDocument, laws: ScenarioLawSection[]): ScenarioDocument {
  return {
    ...doc,
    contentSections: {
      ...doc.contentSections,
      laws: { startingLaws: laws },
    },
  };
}

export function mapGovFormUiToSchema(
  form: "presidential" | "parliamentary" | "semi_presidential",
): "presidential" | "parliamentary" | "semi" {
  if (form === "semi_presidential") return "semi";
  return form;
}

type ConstitutionPatch = {
  [K in keyof ScenarioConstitutionSection]?: ScenarioConstitutionSection[K] | undefined;
};

export function mergeConstitution(doc: ScenarioDocument, patch: ConstitutionPatch): ScenarioDocument {
  const constitution: ScenarioConstitutionSection = { ...(doc.contentSections.constitution ?? {}) };
  for (const key of Object.keys(patch) as (keyof ScenarioConstitutionSection)[]) {
    const val = patch[key];
    if (val === undefined) delete constitution[key];
    else constitution[key] = val as never;
  }
  return { ...doc, contentSections: { ...doc.contentSections, constitution } };
}

export function mapGovFormSchemaToUi(
  form: "presidential" | "parliamentary" | "semi" | undefined,
): "presidential" | "parliamentary" | "semi_presidential" {
  if (form === "semi") return "semi_presidential";
  return form ?? "presidential";
}
