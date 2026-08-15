import type { Constituency, PartyId } from "./shared.ts";
import { PARTY_IDS } from "./shared.ts";

/** Relative party strength priors by province — aligned to TERENA_COUNTRY_BIBLE. */
export const PROV_PRIORS: Record<string, Record<PartyId, number>> = {
  FDV: {
    PARTY_CR: 34,
    PARTY_LAB: 20,
    PARTY_GRN: 18,
    PARTY_NU: 12,
    PARTY_PM: 6,
    PARTY_RL: 4,
    PARTY_IND: 6,
  },
  P01: {
    PARTY_CR: 28,
    PARTY_GRN: 26,
    PARTY_LAB: 18,
    PARTY_NU: 12,
    PARTY_RL: 6,
    PARTY_PM: 4,
    PARTY_IND: 6,
  }, // Solenne
  P02: {
    PARTY_CR: 26,
    PARTY_NU: 24,
    PARTY_LAB: 20,
    PARTY_GRN: 12,
    PARTY_RL: 6,
    PARTY_PM: 6,
    PARTY_IND: 6,
  }, // Norval
  P03: {
    PARTY_LAB: 24,
    PARTY_NU: 24,
    PARTY_CR: 22,
    PARTY_GRN: 10,
    PARTY_RL: 8,
    PARTY_PM: 6,
    PARTY_IND: 6,
  }, // Varelia swing
  P04: {
    PARTY_LAB: 24,
    PARTY_NU: 24,
    PARTY_RL: 22,
    PARTY_CR: 12,
    PARTY_PM: 8,
    PARTY_GRN: 5,
    PARTY_IND: 5,
  }, // Galar
  P05: {
    PARTY_NU: 40,
    PARTY_RL: 16,
    PARTY_LAB: 14,
    PARTY_PM: 10,
    PARTY_CR: 10,
    PARTY_GRN: 5,
    PARTY_IND: 5,
  }, // Southmark
  P06: {
    PARTY_CR: 28,
    PARTY_LAB: 26,
    PARTY_NU: 16,
    PARTY_GRN: 12,
    PARTY_RL: 6,
    PARTY_PM: 6,
    PARTY_IND: 6,
  }, // Veyra
  P07: {
    PARTY_CR: 26,
    PARTY_LAB: 24,
    PARTY_NU: 22,
    PARTY_GRN: 10,
    PARTY_RL: 6,
    PARTY_PM: 6,
    PARTY_IND: 6,
  }, // Rethvale
  P08: {
    PARTY_CR: 30,
    PARTY_NU: 22,
    PARTY_LAB: 16,
    PARTY_GRN: 12,
    PARTY_RL: 6,
    PARTY_PM: 6,
    PARTY_IND: 8,
  }, // Eastbay
  P09: {
    PARTY_LAB: 40,
    PARTY_PM: 14,
    PARTY_NU: 16,
    PARTY_CR: 12,
    PARTY_GRN: 8,
    PARTY_RL: 5,
    PARTY_IND: 5,
  }, // Aurel
  P10: {
    PARTY_CR: 30,
    PARTY_NU: 28,
    PARTY_LAB: 16,
    PARTY_GRN: 10,
    PARTY_RL: 6,
    PARTY_PM: 5,
    PARTY_IND: 5,
  }, // Eastridge
  P11: {
    PARTY_CR: 32,
    PARTY_LAB: 20,
    PARTY_GRN: 16,
    PARTY_NU: 14,
    PARTY_RL: 6,
    PARTY_PM: 6,
    PARTY_IND: 6,
  }, // Shorren — CR-led corridor
  P12: {
    PARTY_LAB: 42,
    PARTY_NU: 16,
    PARTY_PM: 14,
    PARTY_CR: 10,
    PARTY_GRN: 8,
    PARTY_RL: 5,
    PARTY_IND: 5,
  }, // Darsen
  P13: {
    PARTY_NU: 28,
    PARTY_CR: 24,
    PARTY_LAB: 18,
    PARTY_PM: 10,
    PARTY_RL: 8,
    PARTY_GRN: 6,
    PARTY_IND: 6,
  }, // Karsen — NU/CR, not LAB-first
  P14: {
    PARTY_CR: 30,
    PARTY_GRN: 26,
    PARTY_LAB: 18,
    PARTY_NU: 10,
    PARTY_RL: 6,
    PARTY_PM: 5,
    PARTY_IND: 5,
  }, // Arven — educated liberal
  P15: {
    PARTY_LAB: 22,
    PARTY_NU: 20,
    PARTY_CR: 18,
    PARTY_RL: 14,
    PARTY_GRN: 10,
    PARTY_PM: 8,
    PARTY_IND: 8,
  }, // Lyrden mixed
  P16: {
    PARTY_RL: 38,
    PARTY_NU: 16,
    PARTY_LAB: 16,
    PARTY_CR: 10,
    PARTY_PM: 8,
    PARTY_GRN: 6,
    PARTY_IND: 6,
  }, // Miren
  P17: {
    PARTY_PM: 30,
    PARTY_LAB: 20,
    PARTY_NU: 18,
    PARTY_RL: 14,
    PARTY_CR: 8,
    PARTY_GRN: 5,
    PARTY_IND: 5,
  }, // Caldria
  P18: {
    PARTY_NU: 32,
    PARTY_LAB: 20,
    PARTY_RL: 16,
    PARTY_PM: 12,
    PARTY_CR: 10,
    PARTY_GRN: 5,
    PARTY_IND: 5,
  }, // Northmarch
  P19: {
    PARTY_RL: 30,
    PARTY_IND: 18,
    PARTY_NU: 20,
    PARTY_LAB: 14,
    PARTY_PM: 8,
    PARTY_CR: 6,
    PARTY_GRN: 4,
  }, // Kintal
  P20: {
    PARTY_RL: 32,
    PARTY_IND: 20,
    PARTY_NU: 18,
    PARTY_LAB: 12,
    PARTY_CR: 8,
    PARTY_PM: 6,
    PARTY_GRN: 4,
  }, // Shuma
};

export type ArchetypeId =
  | "industrial_working_class"
  | "union_household"
  | "public_sector_professional"
  | "private_professional"
  | "young_urban_educated"
  | "renter_precariat"
  | "suburban_homeowner"
  | "small_business"
  | "agricultural"
  | "maritime_trade"
  | "culturally_conservative_rural"
  | "green_progressives";

export const ARCHETYPE_IDS: readonly ArchetypeId[] = [
  "industrial_working_class",
  "union_household",
  "public_sector_professional",
  "private_professional",
  "young_urban_educated",
  "renter_precariat",
  "suburban_homeowner",
  "small_business",
  "agricultural",
  "maritime_trade",
  "culturally_conservative_rural",
  "green_progressives",
] as const;

/** Relative archetype prevalence by province (unnormalized). */
export const PROV_ARCHETYPES: Record<string, Partial<Record<ArchetypeId, number>>> = {
  FDV: {
    public_sector_professional: 22,
    young_urban_educated: 16,
    renter_precariat: 14,
    private_professional: 14,
    green_progressives: 12,
    suburban_homeowner: 8,
    small_business: 6,
    union_household: 4,
    industrial_working_class: 4,
  },
  P01: {
    maritime_trade: 18,
    young_urban_educated: 16,
    green_progressives: 14,
    private_professional: 14,
    renter_precariat: 10,
    public_sector_professional: 8,
    small_business: 8,
    suburban_homeowner: 6,
    industrial_working_class: 4,
    union_household: 2,
  },
  P02: {
    private_professional: 16,
    public_sector_professional: 14,
    young_urban_educated: 12,
    suburban_homeowner: 14,
    small_business: 10,
    green_progressives: 8,
    union_household: 8,
    industrial_working_class: 8,
    renter_precariat: 6,
    agricultural: 4,
  },
  P03: {
    suburban_homeowner: 16,
    small_business: 12,
    industrial_working_class: 12,
    private_professional: 10,
    union_household: 10,
    public_sector_professional: 8,
    agricultural: 8,
    young_urban_educated: 8,
    renter_precariat: 6,
    culturally_conservative_rural: 6,
    green_progressives: 4,
  },
  P04: {
    agricultural: 16,
    small_business: 14,
    industrial_working_class: 12,
    suburban_homeowner: 12,
    culturally_conservative_rural: 10,
    union_household: 10,
    private_professional: 8,
    public_sector_professional: 6,
    young_urban_educated: 6,
    green_progressives: 4,
    maritime_trade: 2,
  },
  P05: {
    agricultural: 24,
    culturally_conservative_rural: 18,
    small_business: 16,
    suburban_homeowner: 10,
    industrial_working_class: 8,
    maritime_trade: 6,
    union_household: 6,
    private_professional: 4,
    public_sector_professional: 4,
    young_urban_educated: 2,
    green_progressives: 2,
  },
  P06: {
    renter_precariat: 18,
    public_sector_professional: 16,
    private_professional: 14,
    young_urban_educated: 12,
    suburban_homeowner: 12,
    small_business: 8,
    green_progressives: 8,
    union_household: 6,
    industrial_working_class: 6,
  },
  P07: {
    suburban_homeowner: 20,
    private_professional: 16,
    public_sector_professional: 14,
    small_business: 12,
    young_urban_educated: 10,
    renter_precariat: 8,
    green_progressives: 6,
    union_household: 6,
    industrial_working_class: 4,
    agricultural: 4,
  },
  P08: {
    maritime_trade: 18,
    private_professional: 18,
    suburban_homeowner: 14,
    small_business: 12,
    public_sector_professional: 10,
    young_urban_educated: 8,
    green_progressives: 6,
    renter_precariat: 6,
    industrial_working_class: 4,
    union_household: 4,
  },
  P09: {
    industrial_working_class: 22,
    union_household: 20,
    culturally_conservative_rural: 8,
    small_business: 10,
    suburban_homeowner: 8,
    public_sector_professional: 8,
    private_professional: 6,
    renter_precariat: 8,
    agricultural: 4,
    young_urban_educated: 4,
    green_progressives: 2,
  },
  P10: {
    private_professional: 18,
    suburban_homeowner: 16,
    maritime_trade: 14,
    small_business: 14,
    public_sector_professional: 10,
    young_urban_educated: 8,
    green_progressives: 6,
    industrial_working_class: 6,
    union_household: 4,
    renter_precariat: 4,
  },
  P11: {
    private_professional: 20,
    maritime_trade: 16,
    young_urban_educated: 14,
    public_sector_professional: 12,
    green_progressives: 10,
    renter_precariat: 10,
    suburban_homeowner: 8,
    small_business: 6,
    union_household: 2,
    industrial_working_class: 2,
  },
  P12: {
    industrial_working_class: 24,
    union_household: 22,
    small_business: 10,
    culturally_conservative_rural: 8,
    suburban_homeowner: 8,
    public_sector_professional: 8,
    private_professional: 6,
    renter_precariat: 6,
    agricultural: 4,
    young_urban_educated: 2,
    green_progressives: 2,
  },
  P13: {
    industrial_working_class: 14,
    small_business: 14,
    suburban_homeowner: 12,
    private_professional: 12,
    culturally_conservative_rural: 10,
    union_household: 10,
    agricultural: 8,
    public_sector_professional: 8,
    young_urban_educated: 6,
    green_progressives: 4,
    renter_precariat: 2,
  },
  P14: {
    young_urban_educated: 22,
    private_professional: 18,
    green_progressives: 16,
    public_sector_professional: 14,
    renter_precariat: 10,
    suburban_homeowner: 8,
    small_business: 6,
    union_household: 4,
    industrial_working_class: 2,
  },
  P15: {
    suburban_homeowner: 14,
    small_business: 12,
    industrial_working_class: 12,
    private_professional: 10,
    agricultural: 10,
    union_household: 10,
    public_sector_professional: 8,
    young_urban_educated: 8,
    culturally_conservative_rural: 6,
    green_progressives: 5,
    renter_precariat: 5,
  },
  P16: {
    maritime_trade: 22,
    agricultural: 14,
    culturally_conservative_rural: 12,
    small_business: 12,
    industrial_working_class: 10,
    suburban_homeowner: 8,
    union_household: 6,
    private_professional: 6,
    public_sector_professional: 4,
    young_urban_educated: 4,
    green_progressives: 2,
  },
  P17: {
    industrial_working_class: 20,
    culturally_conservative_rural: 14,
    union_household: 12,
    small_business: 12,
    agricultural: 10,
    suburban_homeowner: 8,
    renter_precariat: 8,
    private_professional: 6,
    public_sector_professional: 4,
    maritime_trade: 4,
    young_urban_educated: 2,
  },
  P18: {
    culturally_conservative_rural: 18,
    agricultural: 14,
    industrial_working_class: 12,
    small_business: 12,
    suburban_homeowner: 10,
    union_household: 8,
    maritime_trade: 6,
    private_professional: 6,
    public_sector_professional: 6,
    young_urban_educated: 4,
    green_progressives: 2,
    renter_precariat: 2,
  },
  P19: {
    maritime_trade: 24,
    agricultural: 16,
    culturally_conservative_rural: 14,
    small_business: 14,
    industrial_working_class: 8,
    suburban_homeowner: 6,
    union_household: 6,
    private_professional: 4,
    public_sector_professional: 4,
    young_urban_educated: 2,
    green_progressives: 2,
  },
  P20: {
    maritime_trade: 26,
    culturally_conservative_rural: 16,
    agricultural: 14,
    small_business: 14,
    industrial_working_class: 8,
    suburban_homeowner: 6,
    union_household: 4,
    private_professional: 4,
    public_sector_professional: 4,
    young_urban_educated: 2,
    green_progressives: 2,
  },
};

export function blendedPriors(c: Constituency): Record<PartyId, number> {
  const out = Object.fromEntries(PARTY_IDS.map((p) => [p, 0])) as Record<PartyId, number>;
  for (const share of c.province_population_shares) {
    const prior = PROV_PRIORS[share.province_id] ?? PROV_PRIORS.P03!;
    for (const pid of PARTY_IDS) {
      out[pid] += prior[pid] * share.share;
    }
  }
  return out;
}

export function blendedArchetypes(c: Constituency): Record<ArchetypeId, number> {
  const out = Object.fromEntries(ARCHETYPE_IDS.map((a) => [a, 0])) as Record<ArchetypeId, number>;
  for (const share of c.province_population_shares) {
    const prior = PROV_ARCHETYPES[share.province_id] ?? PROV_ARCHETYPES.P03!;
    for (const a of ARCHETYPE_IDS) {
      out[a] += (prior[a] ?? 0) * share.share;
    }
  }
  return out;
}

export function normalizeRecord<K extends string>(rec: Record<K, number>): Record<K, number> {
  const sum = Object.values(rec).reduce((a, b) => a + (b as number), 0);
  if (sum <= 0) throw new Error("normalizeRecord empty");
  const out = { ...rec };
  for (const k of Object.keys(out) as K[]) out[k] = out[k]! / sum;
  return out;
}

export function partyAffinityMatrix(): Record<PartyId, PartyId[]> {
  return {
    PARTY_LAB: [
      "PARTY_LAB",
      "PARTY_GRN",
      "PARTY_CR",
      "PARTY_PM",
      "PARTY_RL",
      "PARTY_IND",
      "PARTY_NU",
    ],
    PARTY_NU: [
      "PARTY_NU",
      "PARTY_CR",
      "PARTY_RL",
      "PARTY_PM",
      "PARTY_IND",
      "PARTY_LAB",
      "PARTY_GRN",
    ],
    PARTY_CR: [
      "PARTY_CR",
      "PARTY_GRN",
      "PARTY_LAB",
      "PARTY_NU",
      "PARTY_IND",
      "PARTY_RL",
      "PARTY_PM",
    ],
    PARTY_GRN: [
      "PARTY_GRN",
      "PARTY_CR",
      "PARTY_LAB",
      "PARTY_IND",
      "PARTY_RL",
      "PARTY_NU",
      "PARTY_PM",
    ],
    PARTY_RL: [
      "PARTY_RL",
      "PARTY_NU",
      "PARTY_IND",
      "PARTY_LAB",
      "PARTY_CR",
      "PARTY_PM",
      "PARTY_GRN",
    ],
    PARTY_PM: [
      "PARTY_PM",
      "PARTY_NU",
      "PARTY_LAB",
      "PARTY_RL",
      "PARTY_IND",
      "PARTY_CR",
      "PARTY_GRN",
    ],
    PARTY_IND: [
      "PARTY_IND",
      "PARTY_CR",
      "PARTY_RL",
      "PARTY_NU",
      "PARTY_LAB",
      "PARTY_GRN",
      "PARTY_PM",
    ],
  };
}
