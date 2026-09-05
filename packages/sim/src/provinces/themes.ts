import type { ProvincialBillSubject } from "./types.js";

export const PROVINCE_THEME_IDS = [
  "capital_metro",
  "industrial_corridor",
  "agrarian_heartland",
  "coastal_trade_hub",
  "resource_hinterland",
  "university_belt",
  "border_province",
] as const;
export type ProvinceThemeId = (typeof PROVINCE_THEME_IDS)[number];

export type ProvinceTheme = {
  id: ProvinceThemeId;
  label: string;
  description: string;
  preferredSubjects: ProvincialBillSubject[];
};

export const PROVINCE_THEMES: Record<ProvinceThemeId, ProvinceTheme> = {
  capital_metro: {
    id: "capital_metro",
    label: "Capital Metro",
    description: "A dense urban centre anchoring national government and services.",
    preferredSubjects: ["policing_public_safety", "social_services", "utilities_infrastructure"],
  },
  industrial_corridor: {
    id: "industrial_corridor",
    label: "Industrial Corridor",
    description: "A manufacturing and industrial heartland with strong labour traditions.",
    preferredSubjects: ["labor_standards", "environmental_regulation", "economic_development"],
  },
  agrarian_heartland: {
    id: "agrarian_heartland",
    label: "Agrarian Heartland",
    description: "Fertile agricultural land with rural communities dependent on farming.",
    preferredSubjects: ["agricultural_support", "transport_service", "utilities_infrastructure"],
  },
  coastal_trade_hub: {
    id: "coastal_trade_hub",
    label: "Coastal Trade Hub",
    description: "A port and trade-oriented province with maritime economic links.",
    preferredSubjects: ["transport_service", "economic_development", "utilities_infrastructure"],
  },
  resource_hinterland: {
    id: "resource_hinterland",
    label: "Resource Hinterland",
    description: "A sparsely populated region reliant on resource extraction industries.",
    preferredSubjects: [
      "environmental_regulation",
      "utilities_infrastructure",
      "economic_development",
    ],
  },
  university_belt: {
    id: "university_belt",
    label: "University Belt",
    description: "A knowledge-economy province anchored by higher education and research.",
    preferredSubjects: ["school_capacity", "social_services", "economic_development"],
  },
  border_province: {
    id: "border_province",
    label: "Border Province",
    description: "A frontier region with cross-border movement and security considerations.",
    preferredSubjects: ["policing_public_safety", "transport_service", "labor_standards"],
  },
};

/**
 * Explicit theme assignments for known Terena province IDs.
 * Unmapped provinces fall back to a hash-based assignment.
 */
const PROVINCE_THEME_MAP: Partial<Record<string, ProvinceThemeId>> = {
  FDV: "capital_metro",
  P01: "coastal_trade_hub", // Solenne — small coastal province
  P02: "border_province", // Norval — northern border
  P03: "industrial_corridor", // Varelia — large industrial
  P04: "agrarian_heartland", // Galar
  P05: "industrial_corridor", // Southmark — largest metro-industrial
  P06: "resource_hinterland", // Veyra — small, remote
  P07: "agrarian_heartland", // Rethvale
  P08: "coastal_trade_hub", // Eastbay
  P09: "university_belt", // Aurel — largest population, metro
  P10: "industrial_corridor", // Eastridge
  P11: "coastal_trade_hub", // Shorren
  P12: "industrial_corridor", // Darsen
  P13: "resource_hinterland", // Karsen
  P14: "resource_hinterland", // Arven — tiny
  P15: "agrarian_heartland", // Lyrden
  P16: "university_belt", // Miren
  P17: "industrial_corridor", // Caldria
  P18: "border_province", // Northmarch
  P19: "resource_hinterland", // Kintal — very small
  P20: "resource_hinterland", // Shuma — tiny
};

function hashProvinceId(provinceId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < provinceId.length; i += 1) {
    hash ^= provinceId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Returns the theme ID for a province, using explicit map or deterministic hash. */
export function provinceThemeId(provinceId: string): ProvinceThemeId {
  const mapped = PROVINCE_THEME_MAP[provinceId];
  if (mapped) return mapped;
  return PROVINCE_THEME_IDS[hashProvinceId(provinceId) % PROVINCE_THEME_IDS.length]!;
}

/** Returns the human-readable theme label for a province. */
export function provinceThemeLabel(provinceId: string): string {
  return PROVINCE_THEMES[provinceThemeId(provinceId)].label;
}

/** Returns the preferred bill subjects for a province based on its theme. */
export function preferredBillSubjects(provinceId: string): ProvincialBillSubject[] {
  return PROVINCE_THEMES[provinceThemeId(provinceId)].preferredSubjects;
}
