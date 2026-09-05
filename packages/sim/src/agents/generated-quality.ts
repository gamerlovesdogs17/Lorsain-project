import { ageOnDate } from "./profile.js";
import { generatedNameConcentration } from "./names.js";
import { hashCanonical } from "../hash.js";
import type { KernelWorld, SimState } from "../types.js";

export type GeneratedPersonQualityIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  personIds: string[];
};

export type GeneratedPersonQualityReport = {
  peopleChecked: number;
  errors: GeneratedPersonQualityIssue[];
  warnings: GeneratedPersonQualityIssue[];
  largestFirstNameShare: number;
  largestFamilyNameShare: number;
};

/** Developer-facing audit; no hidden profile values are exposed to player UI. */
export function auditGeneratedPersonQuality(
  world: KernelWorld,
  state: SimState,
): GeneratedPersonQualityReport {
  const originalIds = new Set(world.politicians.map((row) => row.id));
  const generated = Object.values(state.politicians).filter((row) => !originalIds.has(row.id));
  const lightweight = Object.values(state.provincialRuntime.legislators).filter(
    (row) => row.fullPoliticianId == null,
  );
  const legal = Object.values(state.constitutionalRuntime.legalCareerPool).filter(
    (row) => row.fullPoliticianId == null,
  );
  const all = [
    ...generated.map((row) => ({
      id: row.id,
      name: row.displayName ?? row.id,
      description: row.description ?? "",
    })),
    ...lightweight.map((row) => ({
      id: row.id,
      name: row.displayName,
      description: row.description,
    })),
    ...legal.map((row) => ({ id: row.id, name: row.displayName, description: row.description })),
  ];
  const errors: GeneratedPersonQualityIssue[] = [];
  const warnings: GeneratedPersonQualityIssue[] = [];
  const report = (issue: GeneratedPersonQualityIssue) =>
    (issue.severity === "error" ? errors : warnings).push(issue);

  const byName = new Map<string, string[]>();
  const byDescription = new Map<string, string[]>();
  for (const row of all) {
    const names = byName.get(row.name) ?? [];
    names.push(row.id);
    byName.set(row.name, names);
    if (row.description.trim()) {
      const biographies = byDescription.get(row.description.trim()) ?? [];
      biographies.push(row.id);
      byDescription.set(row.description.trim(), biographies);
    }
  }
  for (const [name, ids] of byName) {
    if (ids.length > 1)
      report({
        severity: "error",
        code: "DUPLICATE_FULL_NAME",
        message: name,
        personIds: ids.sort(),
      });
  }
  for (const [description, ids] of byDescription) {
    if (ids.length > 1)
      report({
        severity: "error",
        code: "DUPLICATE_BIOGRAPHY",
        message: description,
        personIds: ids.sort(),
      });
  }

  for (const politician of generated) {
    const profile = state.generatedAgentProfiles[politician.id];
    const deathDate = politician.alive
      ? null
      : (state.history
          .filter(
            (event) => event.type === "POLITICIAN_DIED" && event.actorIds.includes(politician.id),
          )
          .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0]?.date ??
        null);
    const age = ageOnDate(profile?.birthDate ?? null, deathDate ?? state.currentDate);
    const hasOfficeHistory = Object.values(state.officeTerms).some(
      (term) => term.holderId === politician.id,
    );
    const hasElectionHistory = Object.values(state.elections).some(
      (election) =>
        Boolean(election.candidates[politician.id]) ||
        Object.values(election.assembly?.constituencyFields ?? {}).some((field) =>
          field.candidateIds.includes(politician.id),
        ),
    );
    if (age != null && (age < 18 || age > 105)) {
      report({
        severity: "error",
        code: "IMPOSSIBLE_GENERATED_AGE",
        message: `${politician.id}:${age}`,
        personIds: [politician.id],
      });
    } else if (age != null && age >= 90 && !hasOfficeHistory && !hasElectionHistory) {
      report({
        severity: "warning",
        code: "ELDERLY_FIRST_TIME_GENERATED_FIGURE",
        message: `${politician.id}:${age}`,
        personIds: [politician.id],
      });
    }
    const faction = politician.factionId ? world.factionDefinitions[politician.factionId] : null;
    if (faction && faction.partyId !== politician.partyId) {
      report({
        severity: "error",
        code: "MALFORMED_PARTY_FACTION",
        message: politician.id,
        personIds: [politician.id],
      });
    }
    const linked = Object.values(state.provincialRuntime.legislators).find(
      (row) => row.fullPoliticianId === politician.id,
    );
    if (linked && linked.provinceId !== politician.homeProvinceId) {
      report({
        severity: "error",
        code: "PROVINCE_HOME_MISMATCH",
        message: politician.id,
        personIds: [politician.id, linked.id],
      });
    }
  }
  for (const row of legal) {
    const birthYear = Number(row.birthDate.slice(0, 4));
    if (row.careerStartYear < birthYear + 20 || row.yearsExperience < 0) {
      report({
        severity: "error",
        code: "IMPOSSIBLE_LEGAL_CAREER",
        message: row.id,
        personIds: [row.id],
      });
    }
  }

  const profileHashes = new Map<string, string[]>();
  for (const [politicianId, profile] of Object.entries(state.generatedAgentProfiles)) {
    const comparable = { ...profile, politicianId: "generated" };
    const hash = hashCanonical(comparable);
    const ids = profileHashes.get(hash) ?? [];
    ids.push(politicianId);
    profileHashes.set(hash, ids);
  }
  for (const ids of profileHashes.values()) {
    if (ids.length > 1)
      report({
        severity: "warning",
        code: "IDENTICAL_GENERATED_PROFILE",
        message: ids.join(","),
        personIds: ids.sort(),
      });
  }

  const concentration = generatedNameConcentration(all.map((row) => row.name));
  if (all.length >= 40 && concentration.largestFamilyNameShare > 0.08) {
    report({
      severity: "warning",
      code: "FAMILY_NAME_CONCENTRATION",
      message: concentration.largestFamilyNameShare.toFixed(4),
      personIds: [],
    });
  }
  if (all.length >= 40 && concentration.largestFirstNameShare > 0.08) {
    report({
      severity: "warning",
      code: "FIRST_NAME_CONCENTRATION",
      message: concentration.largestFirstNameShare.toFixed(4),
      personIds: [],
    });
  }

  return {
    peopleChecked: all.length,
    errors,
    warnings,
    largestFirstNameShare: concentration.largestFirstNameShare,
    largestFamilyNameShare: concentration.largestFamilyNameShare,
  };
}
