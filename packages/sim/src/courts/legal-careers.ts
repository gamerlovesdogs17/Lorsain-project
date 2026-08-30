import { formatIsoDate } from "../calendar.js";
import { getAgentProfile, syntheticAgentProfile } from "../agents/profile.js";
import { selectGeneratedPublicName } from "../agents/names.js";
import type { AgentProfile } from "../agents/profile.js";
import type { KernelWorld, SimState } from "../types.js";
import type { LegalCareerCandidate } from "./types.js";

export const EXPLICIT_LEGAL_CAREER_ROLES = new Set([
  "constitutional_court_justice",
  "constitutional_court_judge",
  "chief_justice",
  "judge",
  "appellate_judge",
  "lower_court_judge",
  "prosecutor",
  "prosecutor_then_judge",
  "public_defender",
  "public_defender_then_judge",
  "constitutional_lawyer",
  "legal_academic",
  "senior_lawyer",
  "practicing_lawyer",
  "private_counsel_then_judge",
  "senior_government_legal_counsel",
  "justice_ministry_legal_official",
]);

const GENERATED_LEGAL_ROLES = [
  "appellate_judge",
  "lower_court_judge",
  "prosecutor",
  "public_defender",
  "constitutional_lawyer",
  "legal_academic",
  "practicing_lawyer",
  "senior_government_legal_counsel",
] as const;

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function hasExplicitLegalCareer(profile: AgentProfile | null | undefined): boolean {
  return Boolean(profile?.roleTypes.some((role) => EXPLICIT_LEGAL_CAREER_ROLES.has(role)));
}

export function explicitLegalCareerLabel(profile: AgentProfile | null | undefined): string | null {
  const roles = profile?.roleTypes ?? [];
  if (roles.some((role) => role.includes("constitutional_court") || role === "chief_justice")) return "Constitutional Court justice";
  if (roles.some((role) => role.includes("appellate"))) return "Appellate judge";
  if (roles.some((role) => role.includes("judge"))) return "Judge";
  if (roles.some((role) => role.includes("prosecut"))) return "Prosecutor";
  if (roles.some((role) => role.includes("defender"))) return "Public defender";
  if (roles.some((role) => role.includes("academic"))) return "Legal academic";
  if (roles.some((role) => role.includes("government_legal") || role.includes("justice_ministry"))) return "Senior government legal counsel";
  if (roles.some((role) => role.includes("constitutional_lawyer"))) return "Constitutional lawyer";
  if (roles.some((role) => role.includes("lawyer") || role.includes("counsel"))) return "Practicing lawyer";
  return null;
}

function nextOrdinal(state: SimState): number {
  let highest = 0;
  for (const id of Object.keys(state.constitutionalRuntime.legalCareerPool)) {
    const match = /^LCAREER_(\d+)$/.exec(id);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}

function candidateName(state: SimState, ordinal: number): string {
  const existing = [
    ...Object.values(state.politicians).map((row) => row.displayName ?? ""),
    ...Object.values(state.provincialRuntime.legislators).map((row) => row.displayName),
    ...Object.values(state.constitutionalRuntime.legalCareerPool).map((row) => row.displayName),
  ];
  return selectGeneratedPublicName(existing, `legal-career:${ordinal}`);
}

function partyAndFaction(world: KernelWorld, salt: string): { partyId: string | null; factionId: string | null } {
  const parties = Object.keys(world.partyDefinitions).filter((id) => id !== world.independentAggregatePartyId).sort();
  if (parties.length === 0 || stableHash(`${salt}:nonpartisan`) % 5 === 0) return { partyId: null, factionId: null };
  const partyId = parties[stableHash(`${salt}:party`) % parties.length]!;
  const factions = (world.partyDefinitions[partyId]?.factionIds ?? []).filter((id) => world.factionDefinitions[id]?.partyId === partyId).sort();
  return { partyId, factionId: factions[stableHash(`${salt}:faction`) % Math.max(1, factions.length)] ?? null };
}

function careerDescription(name: string, role: typeof GENERATED_LEGAL_ROLES[number], salt: string): string {
  const family = name.split(" ").at(-1) ?? name;
  const copy: Record<typeof GENERATED_LEGAL_ROLES[number], [string, string]> = {
    appellate_judge: [`${family} serves on a provincial appellate bench and has written extensively on administrative procedure.`, `${name} is an appellate judge whose docket has centered on public law and constitutional procedure.`],
    lower_court_judge: [`${family} is a trial judge with a substantial record in public-law cases.`, `${name} serves on a lower court and is known for careful written rulings in disputes involving public bodies.`],
    prosecutor: [`${family} is a senior prosecutor whose practice includes corruption and public-integrity cases.`, `${name} built a legal career prosecuting complex financial and public-integrity cases.`],
    public_defender: [`${family} is a veteran public defender with a civil-liberties and appellate practice.`, `${name} has spent much of a legal career in public defense and appellate advocacy.`],
    constitutional_lawyer: [`${family} practices constitutional and administrative law before national and provincial courts.`, `${name} represents public bodies and private clients in constitutional litigation.`],
    legal_academic: [`${family} teaches constitutional law and publishes on institutions and civil rights.`, `${name} is a legal scholar whose work examines constitutional structure and civil rights.`],
    practicing_lawyer: [`${family} is a senior practicing lawyer with extensive litigation and public-law experience.`, `${name} has a long litigation practice spanning commercial disputes and public law.`],
    senior_government_legal_counsel: [`${family} is a senior government legal counsel specializing in legislation and constitutional review.`, `${name} advises government on legislation, administrative procedure, and constitutional risk.`],
  };
  return copy[role][stableHash(`${salt}:description`) % 2]!;
}

/** Maintain a lightweight, named legal profession without weakening qualification rules. */
export function ensureRenewableLegalPool(world: KernelWorld, state: SimState, target = 18): LegalCareerCandidate[] {
  const currentYear = Number(state.currentDate.slice(0, 4));
  const qualifiedFull = Object.values(state.politicians).filter((politician) => {
    if (!politician.alive || politician.retired) return false;
    const profile = getAgentProfile(world, state, politician.id);
    const birthYear = profile?.birthDate ? Number(profile.birthDate.slice(0, 4)) : null;
    return hasExplicitLegalCareer(profile) && (birthYear == null || currentYear - birthYear < 76);
  }).length;
  const viableLightweight = Object.values(state.constitutionalRuntime.legalCareerPool).filter(
    (row) => row.fullPoliticianId == null && currentYear - Number(row.birthDate.slice(0, 4)) < 76,
  ).length;
  const needed = Math.max(0, target - qualifiedFull - viableLightweight);
  const created: LegalCareerCandidate[] = [];
  let ordinal = nextOrdinal(state);
  for (let index = 0; index < needed; index += 1, ordinal += 1) {
    const id = `LCAREER_${String(ordinal).padStart(6, "0")}`;
    const role = GENERATED_LEGAL_ROLES[stableHash(`${id}:role`) % GENERATED_LEGAL_ROLES.length]!;
    const name = candidateName(state, ordinal);
    const age = 38 + (stableHash(`${id}:age`) % 25);
    const birthMonth = 1 + (stableHash(`${id}:month`) % 12);
    const birthDay = 1 + (stableHash(`${id}:day`) % 28);
    const birthYear = currentYear - age;
    const careerStartYear = birthYear + 24 + (stableHash(`${id}:career-start`) % 4);
    const provinceId = world.provinceIds[stableHash(`${id}:province`) % world.provinceIds.length]!;
    const membership = partyAndFaction(world, id);
    const row: LegalCareerCandidate = {
      id,
      displayName: name,
      description: careerDescription(name, role, id),
      birthDate: formatIsoDate(birthYear, birthMonth, birthDay),
      provinceId,
      partyId: membership.partyId,
      factionId: membership.factionId,
      careerRole: role,
      careerStartYear,
      yearsExperience: currentYear - careerStartYear,
      fullPoliticianId: null,
    };
    state.constitutionalRuntime.legalCareerPool[id] = row;
    created.push(row);
  }
  return created;
}

export function materializeLegalCandidates(world: KernelWorld, state: SimState, minimumAvailable = 8): string[] {
  ensureRenewableLegalPool(world, state);
  const currentYear = Number(state.currentDate.slice(0, 4));
  const disqualified = new Set<string>();
  const formerJudges = new Set<string>();
  for (const term of Object.values(state.officeTerms)) {
    const kind = world.offices[term.officeId]?.kind;
    if ((term.status === "active" || term.status === "suspended") && (kind === "military" || kind === "constitutional_court_justice")) {
      disqualified.add(term.holderId);
    }
    if (term.holdingKind === "substantive" && kind === "constitutional_court_justice") formerJudges.add(term.holderId);
  }
  const availableFull = Object.values(state.politicians).filter((politician) => {
    const profile = getAgentProfile(world, state, politician.id);
    const age = profile?.birthDate ? currentYear - Number(profile.birthDate.slice(0, 4)) : 50;
    return politician.alive && !politician.retired && !disqualified.has(politician.id) &&
      (world.courtConstitution.renewable || !formerJudges.has(politician.id)) &&
      age >= 35 && age < 76 && hasExplicitLegalCareer(profile);
  }).length;
  const needed = Math.max(0, minimumAvailable - availableFull);
  const rows = Object.values(state.constitutionalRuntime.legalCareerPool)
    .filter((row) => row.fullPoliticianId == null)
    .sort((a, b) => b.yearsExperience - a.yearsExperience || a.id.localeCompare(b.id))
    .slice(0, needed);
  const ids: string[] = [];
  for (const row of rows) {
    const politicianId = `POL_${row.id}`;
    state.politicians[politicianId] = {
      id: politicianId,
      alive: true,
      retired: false,
      partyId: row.partyId,
      factionId: row.factionId,
      homeProvinceId: row.provinceId,
      displayName: row.displayName,
      description: row.description,
    };
    const ideology = row.partyId ? world.partyPublicIdeology[row.partyId] : undefined;
    const profile = syntheticAgentProfile(politicianId, {
      birthDate: row.birthDate,
      roleTypes: [row.careerRole, "legal_professional"],
      issueSalience: Object.fromEntries(world.issueIds.map((issueId) => [issueId, 0.3 + (stableHash(`${row.id}:${issueId}`) % 51) / 100])),
      ...(ideology ? { ideology } : {}),
    });
    profile.skills.legislation = 0.58 + (stableHash(`${row.id}:legislation`) % 31) / 100;
    profile.skills.negotiation = 0.48 + (stableHash(`${row.id}:negotiation`) % 36) / 100;
    profile.traits.institutionalism = 0.58 + (stableHash(`${row.id}:institutionalism`) % 33) / 100;
    state.generatedAgentProfiles[politicianId] = profile;
    row.fullPoliticianId = politicianId;
    ids.push(politicianId);
  }
  return ids;
}
