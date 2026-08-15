import type { RngService } from "../../packages/sim/src/index.ts";
import {
  ARCHETYPE_IDS,
  blendedArchetypes,
  blendedPriors,
  normalizeRecord,
  type ArchetypeId,
} from "./geography.ts";
import {
  ISSUE_IDS,
  type Constituency,
  type Ideology,
  type PartyId,
  clamp01,
  clampUnit,
  float01,
  round3,
} from "./shared.ts";

export type ArchetypeProfile = {
  id: ArchetypeId;
  ideology: Ideology;
  issue_boosts: Partial<Record<(typeof ISSUE_IDS)[number], number>>;
  /** Baseline party affinity weights (unnormalized). */
  party_affinity: Partial<Record<PartyId, number>>;
};

export const ARCHETYPE_PROFILES: Record<ArchetypeId, ArchetypeProfile> = {
  industrial_working_class: {
    id: "industrial_working_class",
    ideology: {
      economic: 0.4,
      social: 0.05,
      authority: 0.1,
      green: -0.05,
      nationalism: 0.1,
      globalism: -0.15,
    },
    issue_boosts: { ISS_LABOR: 0.8, ISS_WELFARE: 0.65, ISS_OWNERSHIP: 0.55, ISS_TRADE: 0.5 },
    party_affinity: {
      PARTY_LAB: 45,
      PARTY_PM: 18,
      PARTY_NU: 14,
      PARTY_RL: 8,
      PARTY_CR: 8,
      PARTY_GRN: 4,
      PARTY_IND: 3,
    },
  },
  union_household: {
    id: "union_household",
    ideology: {
      economic: 0.5,
      social: 0.15,
      authority: 0.05,
      green: 0.1,
      nationalism: 0.0,
      globalism: -0.05,
    },
    issue_boosts: { ISS_LABOR: 0.85, ISS_WELFARE: 0.7, ISS_HOUSING: 0.5 },
    party_affinity: {
      PARTY_LAB: 55,
      PARTY_PM: 15,
      PARTY_GRN: 8,
      PARTY_CR: 8,
      PARTY_NU: 7,
      PARTY_RL: 4,
      PARTY_IND: 3,
    },
  },
  public_sector_professional: {
    id: "public_sector_professional",
    ideology: {
      economic: 0.25,
      social: 0.35,
      authority: -0.15,
      green: 0.25,
      nationalism: -0.15,
      globalism: 0.25,
    },
    issue_boosts: { ISS_WELFARE: 0.65, ISS_REFORM: 0.55, ISS_HOUSING: 0.5, ISS_EXEC: 0.45 },
    party_affinity: {
      PARTY_LAB: 32,
      PARTY_CR: 28,
      PARTY_GRN: 20,
      PARTY_NU: 8,
      PARTY_IND: 5,
      PARTY_RL: 4,
      PARTY_PM: 3,
    },
  },
  private_professional: {
    id: "private_professional",
    ideology: {
      economic: -0.15,
      social: 0.35,
      authority: -0.2,
      green: 0.15,
      nationalism: -0.15,
      globalism: 0.4,
    },
    issue_boosts: { ISS_TRADE: 0.55, ISS_REFORM: 0.5, ISS_LIBERTY: 0.55, ISS_HOUSING: 0.45 },
    party_affinity: {
      PARTY_CR: 40,
      PARTY_NU: 18,
      PARTY_GRN: 16,
      PARTY_LAB: 12,
      PARTY_IND: 6,
      PARTY_RL: 5,
      PARTY_PM: 3,
    },
  },
  young_urban_educated: {
    id: "young_urban_educated",
    ideology: {
      economic: 0.25,
      social: 0.55,
      authority: -0.35,
      green: 0.45,
      nationalism: -0.3,
      globalism: 0.4,
    },
    issue_boosts: { ISS_HOUSING: 0.75, ISS_CLIMATE: 0.7, ISS_LIBERTY: 0.65, ISS_REFORM: 0.5 },
    party_affinity: {
      PARTY_GRN: 34,
      PARTY_CR: 28,
      PARTY_LAB: 22,
      PARTY_IND: 6,
      PARTY_RL: 4,
      PARTY_NU: 4,
      PARTY_PM: 2,
    },
  },
  renter_precariat: {
    id: "renter_precariat",
    ideology: {
      economic: 0.45,
      social: 0.3,
      authority: -0.1,
      green: 0.2,
      nationalism: -0.05,
      globalism: 0.1,
    },
    issue_boosts: { ISS_HOUSING: 0.85, ISS_WELFARE: 0.7, ISS_LABOR: 0.6 },
    party_affinity: {
      PARTY_LAB: 38,
      PARTY_GRN: 24,
      PARTY_CR: 14,
      PARTY_PM: 10,
      PARTY_IND: 6,
      PARTY_NU: 5,
      PARTY_RL: 3,
    },
  },
  suburban_homeowner: {
    id: "suburban_homeowner",
    ideology: {
      economic: -0.2,
      social: 0.05,
      authority: 0.1,
      green: 0.0,
      nationalism: 0.1,
      globalism: 0.05,
    },
    issue_boosts: { ISS_POLICING: 0.55, ISS_HOUSING: 0.45, ISS_TRADE: 0.4, ISS_REFORM: 0.35 },
    party_affinity: {
      PARTY_NU: 34,
      PARTY_CR: 28,
      PARTY_LAB: 16,
      PARTY_RL: 8,
      PARTY_IND: 6,
      PARTY_GRN: 5,
      PARTY_PM: 3,
    },
  },
  small_business: {
    id: "small_business",
    ideology: {
      economic: -0.3,
      social: 0.0,
      authority: 0.05,
      green: -0.05,
      nationalism: 0.1,
      globalism: 0.05,
    },
    issue_boosts: { ISS_TRADE: 0.55, ISS_OWNERSHIP: 0.5, ISS_REFORM: 0.4 },
    party_affinity: {
      PARTY_NU: 32,
      PARTY_CR: 28,
      PARTY_RL: 16,
      PARTY_LAB: 10,
      PARTY_IND: 6,
      PARTY_PM: 5,
      PARTY_GRN: 3,
    },
  },
  agricultural: {
    id: "agricultural",
    ideology: {
      economic: -0.05,
      social: -0.1,
      authority: 0.05,
      green: 0.1,
      nationalism: 0.2,
      globalism: -0.2,
    },
    issue_boosts: { ISS_DECENT: 0.7, ISS_TRADE: 0.55, ISS_CLIMATE: 0.35 },
    party_affinity: {
      PARTY_RL: 36,
      PARTY_NU: 28,
      PARTY_LAB: 12,
      PARTY_IND: 8,
      PARTY_PM: 6,
      PARTY_CR: 6,
      PARTY_GRN: 4,
    },
  },
  maritime_trade: {
    id: "maritime_trade",
    ideology: {
      economic: -0.1,
      social: 0.2,
      authority: 0.0,
      green: 0.1,
      nationalism: 0.05,
      globalism: 0.3,
    },
    issue_boosts: { ISS_TRADE: 0.7, ISS_DEFENSE: 0.45, ISS_DECENT: 0.4 },
    party_affinity: {
      PARTY_CR: 30,
      PARTY_NU: 22,
      PARTY_RL: 18,
      PARTY_LAB: 12,
      PARTY_IND: 8,
      PARTY_GRN: 6,
      PARTY_PM: 4,
    },
  },
  culturally_conservative_rural: {
    id: "culturally_conservative_rural",
    ideology: {
      economic: 0.05,
      social: -0.4,
      authority: 0.35,
      green: -0.25,
      nationalism: 0.4,
      globalism: -0.35,
    },
    issue_boosts: { ISS_IMMIGRATION: 0.7, ISS_POLICING: 0.65, ISS_DECENT: 0.5, ISS_VASKARA: 0.45 },
    party_affinity: {
      PARTY_NU: 34,
      PARTY_PM: 24,
      PARTY_RL: 22,
      PARTY_IND: 8,
      PARTY_LAB: 7,
      PARTY_CR: 4,
      PARTY_GRN: 1,
    },
  },
  green_progressives: {
    id: "green_progressives",
    ideology: {
      economic: 0.35,
      social: 0.55,
      authority: -0.3,
      green: 0.8,
      nationalism: -0.35,
      globalism: 0.35,
    },
    issue_boosts: { ISS_CLIMATE: 0.9, ISS_LIBERTY: 0.6, ISS_HOUSING: 0.55, ISS_REFORM: 0.5 },
    party_affinity: {
      PARTY_GRN: 50,
      PARTY_CR: 22,
      PARTY_LAB: 18,
      PARTY_IND: 5,
      PARTY_RL: 3,
      PARTY_NU: 1,
      PARTY_PM: 1,
    },
  },
};

function bell(rng: RngService, mean: number, spread = 0.12): number {
  const u = (float01(rng) + float01(rng) + float01(rng)) / 3;
  return clamp01(mean + (u - 0.5) * 2 * spread);
}

export function archetypeIdeology(
  rng: RngService,
  arch: ArchetypeId,
  regionalPull?: Ideology,
): Ideology {
  const base = ARCHETYPE_PROFILES[arch].ideology;
  const j = () => (float01(rng) - 0.5) * 0.28;
  const pull = regionalPull ?? {
    economic: 0,
    social: 0,
    authority: 0,
    green: 0,
    nationalism: 0,
    globalism: 0,
  };
  return {
    economic: round3(clampUnit(base.economic + pull.economic * 0.15 + j())),
    social: round3(clampUnit(base.social + pull.social * 0.15 + j())),
    authority: round3(clampUnit(base.authority + pull.authority * 0.15 + j())),
    green: round3(clampUnit(base.green + pull.green * 0.15 + j())),
    nationalism: round3(clampUnit(base.nationalism + pull.nationalism * 0.15 + j())),
    globalism: round3(clampUnit(base.globalism + pull.globalism * 0.15 + j())),
  };
}

export function archetypeSalience(rng: RngService, arch: ArchetypeId): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ISSUE_IDS) out[id] = round3(bell(rng, 0.38, 0.22));
  const boosts = ARCHETYPE_PROFILES[arch].issue_boosts;
  for (const [k, v] of Object.entries(boosts)) {
    if (k in out || ISSUE_IDS.includes(k as (typeof ISSUE_IDS)[number])) {
      out[k] = round3(bell(rng, v as number, 0.1));
    }
  }
  return out;
}

/** Blend archetype affinity with local geography into party_habit (sums ~1). */
export function partyHabitForBloc(
  rng: RngService,
  arch: ArchetypeId,
  localParty: Record<PartyId, number>,
  historicalFp?: Record<PartyId, number>,
): Record<string, number> {
  const base = ARCHETYPE_PROFILES[arch].party_affinity;
  const keys: PartyId[] = [
    "PARTY_LAB",
    "PARTY_NU",
    "PARTY_CR",
    "PARTY_GRN",
    "PARTY_RL",
    "PARTY_PM",
    "PARTY_IND",
  ];
  const raw: Record<string, number> = {};
  for (const p of keys) {
    const a = (base[p] ?? 1) / 100;
    const g = localParty[p] ?? 0.1;
    const h = historicalFp?.[p] ?? g;
    // Habit = archetype-led, geography-tempered, lightly historical — not seat-rank cycling
    raw[p] = a * 0.55 + g * 0.25 + h * 0.15 + float01(rng) * 0.05;
  }
  const norm = normalizeRecord(raw as Record<PartyId, number>);
  const out: Record<string, number> = {};
  for (const p of keys) out[p] = Math.round(norm[p]! * 1e6) / 1e6;
  // renormalize float noise
  const s = Object.values(out).reduce((a, b) => a + b, 0);
  for (const p of keys) out[p] = out[p]! / s;
  return out;
}

export type VoterBlocRow = {
  id: string;
  archetype: ArchetypeId;
  weight: number;
  turnout_propensity: number;
  party_habit: Record<string, number>;
  ideology: Ideology;
  issue_salience: Record<string, number>;
};

export function buildConstituencyBlocs(args: {
  constituency: Constituency;
  rng: RngService;
  historicalFpShares?: Record<PartyId, number>;
}): VoterBlocRow[] {
  const c = args.constituency;
  const archWeights = normalizeRecord(blendedArchetypes(c));
  const localParty = normalizeRecord(blendedPriors(c));
  // Keep archetypes with meaningful weight; one row per archetype
  const entries = ARCHETYPE_IDS.map((a) => ({ a, w: archWeights[a] }))
    .filter((x) => x.w >= 0.025)
    .sort((x, y) => y.w - x.w || x.a.localeCompare(y.a));

  // Ensure at least 8 blocs by relaxing threshold if needed
  let picked = entries;
  if (picked.length < 8) {
    picked = ARCHETYPE_IDS.map((a) => ({ a, w: archWeights[a] })).sort(
      (x, y) => y.w - x.w || x.a.localeCompare(y.a),
    );
  }
  // Cap at 14
  picked = picked.slice(0, 14);

  // Local deterministic variation
  const varied = picked.map((x) => ({
    a: x.a,
    w: x.w * (0.85 + float01(args.rng) * 0.3),
  }));
  const sumW = varied.reduce((s, x) => s + x.w, 0);

  return varied.map((x, i) => {
    const weight = x.w / sumW;
    return {
      id: `${c.id}_B${String(i + 1).padStart(2, "0")}`,
      archetype: x.a,
      weight: Math.round(weight * 1e12) / 1e12,
      turnout_propensity: round3(bell(args.rng, 0.62, 0.2)),
      party_habit: partyHabitForBloc(args.rng, x.a, localParty, args.historicalFpShares),
      ideology: archetypeIdeology(args.rng, x.a),
      issue_salience: archetypeSalience(args.rng, x.a),
    };
  });
}

/** Semantic sanity: return warning strings for absurd habits. */
export function archetypeHabitWarnings(arch: ArchetypeId, habit: Record<string, number>): string[] {
  const ranked = Object.entries(habit).sort((a, b) => b[1]! - a[1]!);
  const top = ranked[0]?.[0];
  const top2 = ranked.slice(0, 2).map((x) => x[0]);
  const warnings: string[] = [];
  if (arch === "green_progressives") {
    if (top === "PARTY_PM" || top === "PARTY_NU") {
      warnings.push("green_progressives leading habit PM/NU");
    }
    if (top2.includes("PARTY_PM") && top2.includes("PARTY_NU")) {
      warnings.push("green_progressives top-2 are PM/NU");
    }
  }
  if (arch === "culturally_conservative_rural" && top === "PARTY_GRN") {
    warnings.push("culturally_conservative_rural leading habit GRN");
  }
  if (arch === "union_household" && (habit.PARTY_LAB ?? 0) < 0.2) {
    warnings.push("union_household weak Labour habit");
  }
  if (arch === "agricultural" && (habit.PARTY_RL ?? 0) + (habit.PARTY_NU ?? 0) < 0.3) {
    warnings.push("agricultural weak RL/NU habit");
  }
  return warnings;
}
