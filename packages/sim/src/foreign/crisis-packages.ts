import type { BilateralRelation, ForeignCountryRuntime } from "./types.js";

/** Domestic reaction bucket used by `domesticPolitics.ts` — not a headline reskin. */
export type CrisisDomesticReaction =
  | "trade"
  | "sanctions"
  | "defense"
  | "rights"
  | "migration"
  | "energy"
  | "technology";

export type CrisisEscalationProfile = {
  /** Multipliers on stage-transition roll thresholds (higher = slower escalation). */
  latentIncidentThreshold: number;
  incidentActiveThreshold: number;
  activeConflictThreshold: number;
  deescalateBias: number;
  domesticReaction: CrisisDomesticReaction;
  /** Optional metadata for history payloads. */
  packageId: string;
};

const PACKAGES: Record<string, CrisisEscalationProfile> = {
  "sanctions dispute": {
    packageId: "sanctions_spiral",
    latentIncidentThreshold: 1.15,
    incidentActiveThreshold: 1.1,
    activeConflictThreshold: 1.25,
    deescalateBias: 0.92,
    domesticReaction: "sanctions",
  },
  "trade dispute": {
    packageId: "trade_retaliation",
    latentIncidentThreshold: 0.85,
    incidentActiveThreshold: 0.9,
    activeConflictThreshold: 1.35,
    deescalateBias: 1.05,
    domesticReaction: "trade",
  },
  "energy supply dispute": {
    packageId: "energy_shock",
    latentIncidentThreshold: 0.95,
    incidentActiveThreshold: 1.05,
    activeConflictThreshold: 1.2,
    deescalateBias: 0.88,
    domesticReaction: "energy",
  },
  "maritime resource dispute": {
    packageId: "maritime_access",
    latentIncidentThreshold: 0.9,
    incidentActiveThreshold: 0.95,
    activeConflictThreshold: 0.85,
    deescalateBias: 0.95,
    domesticReaction: "defense",
  },
  "cyber and espionage dispute": {
    packageId: "cyber_escalation",
    latentIncidentThreshold: 1.05,
    incidentActiveThreshold: 1.15,
    activeConflictThreshold: 1.4,
    deescalateBias: 1.08,
    domesticReaction: "technology",
  },
  "migration corridor strain": {
    packageId: "migration_pressure",
    latentIncidentThreshold: 1.0,
    incidentActiveThreshold: 1.0,
    activeConflictThreshold: 1.5,
    deescalateBias: 1.02,
    domesticReaction: "migration",
  },
  "humanitarian access dispute": {
    packageId: "humanitarian_corridor",
    latentIncidentThreshold: 1.2,
    incidentActiveThreshold: 1.25,
    activeConflictThreshold: 1.55,
    deescalateBias: 1.12,
    domesticReaction: "rights",
  },
  "technology export control dispute": {
    packageId: "export_controls",
    latentIncidentThreshold: 1.08,
    incidentActiveThreshold: 1.12,
    activeConflictThreshold: 1.3,
    deescalateBias: 1.04,
    domesticReaction: "technology",
  },
  "border tension": {
    packageId: "border_flashpoint",
    latentIncidentThreshold: 0.88,
    incidentActiveThreshold: 0.92,
    activeConflictThreshold: 0.9,
    deescalateBias: 0.98,
    domesticReaction: "defense",
  },
  "military posturing": {
    packageId: "force_posturing",
    latentIncidentThreshold: 0.82,
    incidentActiveThreshold: 0.85,
    activeConflictThreshold: 0.75,
    deescalateBias: 0.9,
    domesticReaction: "defense",
  },
  "security standoff": {
    packageId: "security_standoff",
    latentIncidentThreshold: 0.95,
    incidentActiveThreshold: 0.98,
    activeConflictThreshold: 0.95,
    deescalateBias: 1.0,
    domesticReaction: "defense",
  },
  "alliance consultation strain": {
    packageId: "alliance_strain",
    latentIncidentThreshold: 1.1,
    incidentActiveThreshold: 1.15,
    activeConflictThreshold: 1.45,
    deescalateBias: 1.06,
    domesticReaction: "defense",
  },
  "diplomatic confrontation": {
    packageId: "diplomatic_fracture",
    latentIncidentThreshold: 1.05,
    incidentActiveThreshold: 1.08,
    activeConflictThreshold: 1.25,
    deescalateBias: 1.03,
    domesticReaction: "rights",
  },
};

const DEFAULT_PROFILE: CrisisEscalationProfile = {
  packageId: "generic_diplomatic",
  latentIncidentThreshold: 1,
  incidentActiveThreshold: 1,
  activeConflictThreshold: 1,
  deescalateBias: 1,
  domesticReaction: "defense",
};

export function crisisEscalationProfile(narrativeTitle: string | undefined): CrisisEscalationProfile {
  if (!narrativeTitle) return DEFAULT_PROFILE;
  const key = narrativeTitle.trim().toLowerCase();
  return PACKAGES[key] ?? DEFAULT_PROFILE;
}

export function crisisDomesticReactionTheme(narrativeTitle: string | undefined): CrisisDomesticReaction {
  return crisisEscalationProfile(narrativeTitle).domesticReaction;
}

/** Scale a uniform [0,1) roll against a baseline threshold using the profile multiplier. */
export function scaledCrisisThreshold(base: number, multiplier: number): number {
  return Math.max(0.005, Math.min(0.995, base * multiplier));
}

export function pickEnergySupplyDispute(
  rel: BilateralRelation,
  aRuntime: ForeignCountryRuntime,
  bRuntime: ForeignCountryRuntime,
): boolean {
  return (
    rel.economicTies > 0.45 &&
    rel.trust < 0.45 &&
    (aRuntime.capabilities.economic > 0.5 || bRuntime.capabilities.economic > 0.5)
  );
}

export function pickCyberDispute(aRuntime: ForeignCountryRuntime, bRuntime: ForeignCountryRuntime): boolean {
  return aRuntime.capabilities.cyber >= 0.55 || bRuntime.capabilities.cyber >= 0.55;
}

export function pickMigrationCorridorStrain(
  rel: BilateralRelation,
  aRuntime: ForeignCountryRuntime,
  bRuntime: ForeignCountryRuntime,
  neighbors: boolean,
): boolean {
  return (
    neighbors &&
    (aRuntime.domesticPressure > 0.45 || bRuntime.domesticPressure > 0.45) &&
    rel.general < 10
  );
}

export function pickHumanitarianAccess(
  aRuntime: ForeignCountryRuntime,
  bRuntime: ForeignCountryRuntime,
): boolean {
  return (
    aRuntime.strategicGoals.includes("secure_alliance") ||
    bRuntime.strategicGoals.includes("secure_alliance") ||
    aRuntime.domesticPressure > 0.55
  );
}

export function pickTechExportControls(hasSanctions: boolean, rel: BilateralRelation): boolean {
  return hasSanctions && rel.economicTies > 0.25 && rel.general > -40;
}

export function pickMaritimeResourceDispute(
  aRuntime: ForeignCountryRuntime,
  bRuntime: ForeignCountryRuntime,
): boolean {
  return (
    (aRuntime.strategicGoals.includes("maritime_access") ||
      bRuntime.strategicGoals.includes("maritime_access") ||
      aRuntime.capabilities.naval >= 0.5 ||
      bRuntime.capabilities.naval >= 0.5) &&
    aRuntime.capabilities.naval + bRuntime.capabilities.naval >= 0.85
  );
}
