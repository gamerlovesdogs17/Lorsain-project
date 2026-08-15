import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRngService, type RngService } from "../../packages/sim/src/index.ts";
import type { Uint32Source } from "../../packages/election-math/src/index.ts";

export const CONTENT_VERSION = "0.3.0-predev";
export const CANON_SEED = "TERENA-2028-CANON-01";
export const GENERATION_STREAM = "generation" as const;

export const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
export const DATA = join(ROOT, "data");
export const DOCS = join(ROOT, "docs");

export const PARTY_IDS = [
  "PARTY_LAB",
  "PARTY_NU",
  "PARTY_CR",
  "PARTY_GRN",
  "PARTY_RL",
  "PARTY_PM",
  "PARTY_IND",
] as const;

export type PartyId = (typeof PARTY_IDS)[number];

export const SEAT_TARGETS: Record<PartyId, number> = {
  PARTY_LAB: 128,
  PARTY_NU: 110,
  PARTY_CR: 69,
  PARTY_GRN: 41,
  PARTY_RL: 35,
  PARTY_PM: 29,
  PARTY_IND: 8,
};

export const PARTY_META: Record<
  PartyId,
  { name: string; short: string; factions: { id: string; name: string; share: number }[] }
> = {
  PARTY_LAB: {
    name: "Labour Party",
    short: "LAB",
    factions: [
      { id: "FAC_LAB_SD", name: "Social Democratic Caucus", share: 0.38 },
      { id: "FAC_LAB_LEFT", name: "Workers’ Left", share: 0.19 },
      { id: "FAC_LAB_WORK", name: "Workers’ Bloc", share: 0.25 },
      { id: "FAC_LAB_REFORM", name: "Reform Labour", share: 0.18 },
    ],
  },
  PARTY_NU: {
    name: "National Union",
    short: "NU",
    factions: [
      { id: "FAC_NU_ONE", name: "One Nation Caucus", share: 0.43 },
      { id: "FAC_NU_MARKET", name: "Market Conservatives", share: 0.32 },
      { id: "FAC_NU_NAT", name: "National Conservatives", share: 0.25 },
    ],
  },
  PARTY_CR: {
    name: "Civic Reform Party",
    short: "CR",
    factions: [
      { id: "FAC_CR_LIB", name: "Liberal Reform Caucus", share: 0.52 },
      { id: "FAC_CR_MOD", name: "Civic Moderates", share: 0.48 },
    ],
  },
  PARTY_GRN: {
    name: "Green Alliance",
    short: "GRN",
    factions: [
      { id: "FAC_GRN_MAIN", name: "Green Mainstream", share: 0.63 },
      { id: "FAC_GRN_ECO", name: "Eco-Social Wing", share: 0.37 },
    ],
  },
  PARTY_RL: {
    name: "Regional League",
    short: "RL",
    factions: [
      { id: "FAC_RL_AUTO", name: "Provincial Autonomists", share: 0.55 },
      { id: "FAC_RL_COOP", name: "Agrarian Cooperative Wing", share: 0.45 },
    ],
  },
  PARTY_PM: {
    name: "People’s Movement",
    short: "PM",
    factions: [
      { id: "FAC_PM_NAT", name: "National Populists", share: 0.58 },
      { id: "FAC_PM_ECON", name: "Economic Nationalists", share: 0.42 },
    ],
  },
  PARTY_IND: {
    name: "Independent",
    short: "IND",
    factions: [],
  },
};

export const ISSUE_IDS = [
  "ISS_LABOR",
  "ISS_WELFARE",
  "ISS_OWNERSHIP",
  "ISS_TRADE",
  "ISS_HOUSING",
  "ISS_CLIMATE",
  "ISS_LIBERTY",
  "ISS_IMMIGRATION",
  "ISS_POLICING",
  "ISS_DECENT",
  "ISS_EXEC",
  "ISS_REFORM",
  "ISS_CONCORD",
  "ISS_VASKARA",
  "ISS_DEFENSE",
] as const;

export type Constituency = {
  id: string;
  seats: number;
  population: number;
  plurality_province_id: string;
  plurality_province_name: string;
  province_population_shares: { province_id: string; share: number }[];
};

export type Province = {
  id: string;
  name: string;
  population: number;
};

export type Ideology = {
  economic: number;
  social: number;
  authority: number;
  green: number;
  nationalism: number;
  globalism: number;
};

export type Traits = {
  ambition: number;
  integrity: number;
  ego: number;
  riskTolerance: number;
  sociability: number;
  pragmatism: number;
  institutionalism: number;
  partyLoyalty: number;
  factionLoyalty: number;
  retirementInclination: number;
};

export type Skills = {
  campaigning: number;
  fundraising: number;
  legislation: number;
  administration: number;
  media: number;
  negotiation: number;
};

export type FigureRole = Record<string, unknown>;

export type Figure = {
  id: string;
  name: string;
  party: string | null;
  faction: string | null;
  office: string;
  home: string;
  notes: string;
  party_id: PartyId | null;
  faction_id: string | null;
  home_province_id: string;
  birth_date: string;
  roles: FigureRole[];
  sex: "F" | "M" | "X";
  ideology: Ideology;
  traits: Traits;
  skills: Skills;
  issue_salience: Record<string, number>;
  ai_tier: "rich" | "standard" | "light";
  background: string;
  display_summary: string;
  constituency_id?: string;
  first_elected_year?: number;
  presidential_status?: string;
  court?: {
    seat_index: number;
    chief: boolean;
    appointed: string;
    term_ends: string;
    appointing_president?: string;
    legal_philosophy?: string;
  };
};

export function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8")) as T;
}

export function writeJson(absPath: string, data: unknown): void {
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function createGenerationRng(): RngService {
  return createRngService(CANON_SEED);
}

export function asUint32Source(rng: RngService): Uint32Source {
  return {
    nextUint32(): number {
      return rng.uint32(GENERATION_STREAM);
    },
  };
}

export function float01(rng: RngService): number {
  return rng.float01(GENERATION_STREAM);
}

export function intRange(rng: RngService, min: number, maxInclusive: number): number {
  if (maxInclusive < min) throw new Error("intRange bad bounds");
  const span = maxInclusive - min + 1;
  return min + (rng.uint32(GENERATION_STREAM) % span);
}

export function pick<T>(rng: RngService, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick empty");
  return items[intRange(rng, 0, items.length - 1)]!;
}

export function shuffleInPlace<T>(rng: RngService, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = intRange(rng, 0, i);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function clampUnit(n: number): number {
  return Math.max(-1, Math.min(1, n));
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function npcId(n: number): string {
  return `NPC${String(n).padStart(3, "0")}`;
}

export function loadConstituencies(): Constituency[] {
  const geo = loadJson<{
    constituencies: Constituency[];
  }>("data/terena_geography.json");
  return geo.constituencies.map((c) => ({
    id: c.id,
    seats: c.seats,
    population: c.population,
    plurality_province_id: c.plurality_province_id,
    plurality_province_name: c.plurality_province_name,
    province_population_shares: c.province_population_shares,
  }));
}

export function loadProvinces(): Province[] {
  const geo = loadJson<{ provinces: Province[] }>("data/terena_geography.json");
  return geo.provinces.map((p) => ({ id: p.id, name: p.name, population: p.population }));
}

/** Age in full years on asOfDate (YYYY-MM-DD), typically 2028-01-01. */
export function ageOnDate(birthDate: string, asOfDate = "2028-01-01"): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ay, am, ad] = asOfDate.split("-").map(Number);
  let age = ay! - by!;
  if (am! < bm! || (am === bm && ad! < bd!)) age -= 1;
  return age;
}

/** @deprecated Use ageOnDate — year-difference is not authoritative age. */
export function simpleAge(birthDate: string, asOfYear = 2028): number {
  return ageOnDate(birthDate, `${asOfYear}-01-01`);
}
