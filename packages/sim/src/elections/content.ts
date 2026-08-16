import { parseRational } from "@lorsain/election-math";
import { IDEOLOGY_AXES } from "../agents/types.js";
import {
  BLOC_WEIGHT_TOLERANCE,
  HOUSE_EFFECT_CENTER_TOLERANCE,
  ISSUE_DIMENSION_AXES,
  PROVINCE_SHARE_SUM_TOLERANCE,
} from "./policy.js";
import type {
  ConstituencyElectorate,
  ElectorateKernelSlice,
  PollsterDefinition,
  TurnoutBaseline2026,
  VoterBlocDefinition,
} from "./types.js";

export type VoterBlocConstituencyInput = {
  constituency_id: string;
  province_population_shares?: Array<{ province_id: string; share: number }>;
  blocs: Array<{
    id: string;
    archetype: string;
    weight: number;
    turnout_propensity: number;
    party_habit: Record<string, number>;
    ideology: Record<string, number>;
    issue_salience: Record<string, number>;
  }>;
};

export type PollsterInput = {
  id: string;
  name: string;
  scope: string;
  method: string;
  sample_size_range: [number, number] | number[];
  quality: number;
  house_effects: {
    unit: string;
    centered: boolean;
    by_party: Record<string, number>;
  };
  cadence: string;
};

export type IssueDimensionInput = { id: string; dimension: string };

export type ConstituencyGeoInput = {
  id: string;
  population: number;
  seats: number;
  provinceShares: Array<{ provinceId: string; share: number }>;
};

export type AssemblyTurnoutConstituencyInput = {
  constituency_id: string;
  seats?: number;
  turnout: {
    total_population: number;
    registered_electorate: number;
    ballots_cast: number;
    turnout_rate: number;
    invalid_or_blank: number;
    valid_vote_value: string | number;
  };
};

function finiteIn(n: unknown, lo: number, hi: number): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
}

function ideologyFromRaw(
  raw: Record<string, number>,
  blocId: string,
): VoterBlocDefinition["ideology"] {
  const out = {
    economic: 0,
    social: 0,
    authority: 0,
    green: 0,
    nationalism: 0,
    globalism: 0,
  };
  for (const axis of IDEOLOGY_AXES) {
    const v = raw[axis];
    if (!finiteIn(v, -1, 1)) {
      throw new Error(`voter bloc ${blocId} ideology.${axis} out of range`);
    }
    out[axis] = v;
  }
  return out;
}

/**
 * Compact 2026 participation priors only. Historical STV ballot groups are not ingested.
 */
export function compactTurnoutBaselines(
  constituencies: AssemblyTurnoutConstituencyInput[],
): Record<string, TurnoutBaseline2026> {
  const out: Record<string, TurnoutBaseline2026> = {};
  for (const c of constituencies) {
    const t = c.turnout;
    const validRaw = t.valid_vote_value;
    let valid: number;
    if (typeof validRaw === "number") {
      if (!Number.isInteger(validRaw) || validRaw < 0) {
        throw new Error(`invalid 2026 valid_vote_value for ${c.constituency_id}`);
      }
      valid = validRaw;
    } else {
      const parsed = parseRational(String(validRaw));
      if (parsed.den !== 1n || parsed.num < 0n) {
        throw new Error(
          `2026 valid_vote_value for ${c.constituency_id} must be a nonnegative integer rational`,
        );
      }
      valid = Number(parsed.num);
    }
    out[c.constituency_id] = {
      totalPopulation: t.total_population,
      registeredElectorate: t.registered_electorate,
      ballotsCast: t.ballots_cast,
      turnoutRate: t.turnout_rate,
      invalidOrBlank: t.invalid_or_blank,
      validVoteValue: valid,
    };
  }
  return out;
}

export function emptyElectorateKernelSlice(): ElectorateKernelSlice {
  return {
    voterBlocs: {},
    voterBlocIdsByConstituency: {},
    constituencyElectorate: {},
    pollsters: {},
    issueDimensions: {},
  };
}

export function buildElectorateKernelSlice(args: {
  voterBlocs?: VoterBlocConstituencyInput[];
  pollsters?: PollsterInput[];
  issues?: IssueDimensionInput[];
  constituencies?: ConstituencyGeoInput[];
  turnout2026?: Record<string, TurnoutBaseline2026>;
  partyIds: readonly string[];
  issueIds: readonly string[];
  provinceIds: readonly string[];
}): ElectorateKernelSlice {
  if (!args.voterBlocs?.length) return emptyElectorateKernelSlice();
  const partySet = new Set(args.partyIds);
  const issueSet = new Set(args.issueIds);
  const provinceSet = new Set(args.provinceIds);
  const geoById = new Map((args.constituencies ?? []).map((c) => [c.id, c]));
  const issueDimensions: Record<string, string> = {};
  for (const iss of args.issues ?? []) {
    if (!issueSet.has(iss.id) && args.issueIds.length > 0) {
      throw new Error(`issue dimension for unknown issue ${iss.id}`);
    }
    if (typeof iss.dimension !== "string" || iss.dimension.length === 0) {
      throw new Error(`issue ${iss.id} missing dimension`);
    }
    if (!(iss.dimension in ISSUE_DIMENSION_AXES)) {
      throw new Error(`issue ${iss.id} unrecognized dimension ${iss.dimension}`);
    }
    issueDimensions[iss.id] = iss.dimension;
  }

  const voterBlocs: Record<string, VoterBlocDefinition> = {};
  const voterBlocIdsByConstituency: Record<string, string[]> = {};
  const constituencyElectorate: Record<string, ConstituencyElectorate> = {};
  const seenConst = new Set<string>();

  for (const row of args.voterBlocs) {
    const cid = row.constituency_id;
    if (seenConst.has(cid)) throw new Error(`duplicate voter-bloc constituency ${cid}`);
    seenConst.add(cid);
    const geo = geoById.get(cid);
    if (!geo) throw new Error(`voter blocs for unknown constituency ${cid}`);
    const shares =
      row.province_population_shares?.map((s) => ({
        provinceId: s.province_id,
        share: s.share,
      })) ?? geo.provinceShares;
    let shareSum = 0;
    for (const s of shares) {
      if (!provinceSet.has(s.provinceId) && args.provinceIds.length > 0) {
        throw new Error(`bloc constituency ${cid} unknown province ${s.provinceId}`);
      }
      if (!finiteIn(s.share, 0, 1.0000001)) {
        throw new Error(`constituency ${cid} province share for ${s.provinceId} out of range`);
      }
      shareSum += s.share;
    }
    if (shares.length > 0 && Math.abs(shareSum - 1) > PROVINCE_SHARE_SUM_TOLERANCE) {
      throw new Error(`constituency ${cid} province_population_shares sum to ${shareSum}`);
    }
    const baseline = args.turnout2026?.[cid];
    if (!baseline) throw new Error(`missing 2026 turnout baseline for ${cid}`);
    constituencyElectorate[cid] = {
      constituencyId: cid,
      population: geo.population,
      seats: geo.seats,
      provincePopulationShares: shares,
      turnout2026: baseline,
    };
    let wsum = 0;
    const ids: string[] = [];
    for (const b of row.blocs) {
      if (voterBlocs[b.id]) throw new Error(`duplicate voter bloc id ${b.id}`);
      if (!finiteIn(b.weight, 0, 1.0000001)) {
        throw new Error(`bloc ${b.id} weight out of range`);
      }
      if (!finiteIn(b.turnout_propensity, 0, 1)) {
        throw new Error(`bloc ${b.id} turnout_propensity out of range`);
      }
      wsum += b.weight;
      let habitSum = 0;
      for (const [pid, hv] of Object.entries(b.party_habit)) {
        if (!partySet.has(pid)) throw new Error(`bloc ${b.id} unknown party_habit ${pid}`);
        if (!finiteIn(hv, 0, 1.0000001)) {
          throw new Error(`bloc ${b.id} party_habit ${pid} out of range`);
        }
        habitSum += hv;
      }
      if (Math.abs(habitSum - 1) > 1e-6) {
        throw new Error(`bloc ${b.id} party_habit does not sum to 1`);
      }
      for (const iid of Object.keys(b.issue_salience)) {
        if (!issueSet.has(iid) && args.issueIds.length > 0) {
          throw new Error(`bloc ${b.id} unknown issue ${iid}`);
        }
        if (!finiteIn(b.issue_salience[iid], 0, 1)) {
          throw new Error(`bloc ${b.id} issue_salience ${iid} out of range`);
        }
      }
      voterBlocs[b.id] = {
        id: b.id,
        constituencyId: cid,
        archetype: b.archetype,
        weight: b.weight,
        turnoutPropensity: b.turnout_propensity,
        partyHabit: { ...b.party_habit },
        ideology: ideologyFromRaw(b.ideology, b.id),
        issueSalience: { ...b.issue_salience },
      };
      ids.push(b.id);
    }
    if (Math.abs(wsum - 1) > BLOC_WEIGHT_TOLERANCE) {
      throw new Error(`constituency ${cid} bloc weights sum to ${wsum}`);
    }
    voterBlocIdsByConstituency[cid] = ids.sort();
  }

  if (geoById.size > 0 && seenConst.size !== geoById.size) {
    throw new Error(
      `voter blocs cover ${seenConst.size} constituencies, geography has ${geoById.size}`,
    );
  }

  const pollsters: Record<string, PollsterDefinition> = {};
  for (const p of args.pollsters ?? []) {
    if (pollsters[p.id]) throw new Error(`duplicate pollster ${p.id}`);
    const lo = p.sample_size_range[0];
    const hi = p.sample_size_range[1];
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 1 || hi < lo) {
      throw new Error(`pollster ${p.id} invalid sample_size_range`);
    }
    if (!finiteIn(p.quality, 0, 1)) throw new Error(`pollster ${p.id} quality`);
    if (p.house_effects.unit !== "vote_share_points") {
      throw new Error(`pollster ${p.id} house_effects.unit must be vote_share_points`);
    }
    let houseSum = 0;
    for (const [pid, effect] of Object.entries(p.house_effects.by_party)) {
      if (!partySet.has(pid) && args.partyIds.length > 0) {
        throw new Error(`pollster ${p.id} unknown house-effect party ${pid}`);
      }
      if (typeof effect !== "number" || !Number.isFinite(effect)) {
        throw new Error(`pollster ${p.id} house effect for ${pid} is not finite`);
      }
      houseSum += effect;
    }
    if (p.house_effects.centered === true && Math.abs(houseSum) > HOUSE_EFFECT_CENTER_TOLERANCE) {
      throw new Error(`pollster ${p.id} centered house effects sum to ${houseSum}`);
    }
    pollsters[p.id] = {
      id: p.id,
      name: p.name,
      scope: p.scope,
      method: p.method,
      sampleSizeMin: lo,
      sampleSizeMax: hi,
      quality: p.quality,
      houseEffectsUnit: "vote_share_points",
      houseEffectsCentered: p.house_effects.centered === true,
      houseEffectsByParty: { ...p.house_effects.by_party },
      cadence: p.cadence,
    };
  }

  return {
    voterBlocs,
    voterBlocIdsByConstituency,
    constituencyElectorate,
    pollsters,
    issueDimensions,
  };
}

export function terenaElectoralFields(args: {
  voterBlocs: VoterBlocConstituencyInput[];
  pollsters: PollsterInput[];
  issues: IssueDimensionInput[];
  constituencyFeatures: Array<{ properties: Record<string, unknown> }>;
  assemblyTurnout: AssemblyTurnoutConstituencyInput[];
}): {
  voterBlocs: VoterBlocConstituencyInput[];
  pollsters: PollsterInput[];
  issueDimensions: IssueDimensionInput[];
  constituencyGeo: ConstituencyGeoInput[];
  turnout2026: Record<string, TurnoutBaseline2026>;
} {
  return {
    voterBlocs: args.voterBlocs,
    pollsters: args.pollsters,
    issueDimensions: args.issues,
    constituencyGeo: args.constituencyFeatures.map((f) => {
      const shares = (f.properties.province_population_shares ?? []) as Array<{
        province_id: string;
        share: number;
      }>;
      return {
        id: String(f.properties.id),
        population: Number(f.properties.population),
        seats: Number(f.properties.seats),
        provinceShares: shares.map((s) => ({ provinceId: s.province_id, share: s.share })),
      };
    }),
    turnout2026: compactTurnoutBaselines(args.assemblyTurnout),
  };
}
