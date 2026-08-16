import type { RngService } from "../rng.js";
import type { KernelWorld } from "../types.js";
import { clamp01, TURNOUT } from "./policy.js";
import type { ConstituencyElectorate, PublicCandidateFacts, TurnoutRecord } from "./types.js";

/**
 * Eligible/registered pool:
 *   registered_2028 = population_now * (registered_2026 / population_2026)
 * Population is canonical geography; 2026 supplies the registration ratio only.
 */
export function registeredElectorate(electorate: ConstituencyElectorate): number {
  const pop2026 = electorate.turnout2026.totalPopulation;
  const ratio = pop2026 > 0 ? electorate.turnout2026.registeredElectorate / pop2026 : 0.75;
  return Math.max(1, Math.round(electorate.population * ratio));
}

function gauss01(rng: RngService): number {
  const u1 = Math.max(1e-12, rng.float01("campaigns"));
  const u2 = rng.float01("campaigns");
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function constituencyTurnout(
  world: KernelWorld,
  constituencyId: string,
  candidates: readonly PublicCandidateFacts[],
  kind: "presidential" | "assembly",
  rng: RngService | null,
): TurnoutRecord {
  const el = world.constituencyElectorate[constituencyId];
  if (!el) {
    throw new Error(`missing constituency electorate ${constituencyId}`);
  }
  const registered = registeredElectorate(el);
  const ids = world.voterBlocIdsByConstituency[constituencyId] ?? [];
  let prop = 0;
  let w = 0;
  for (const bid of ids) {
    const bloc = world.voterBlocs[bid];
    if (!bloc) continue;
    prop += bloc.weight * bloc.turnoutPropensity;
    w += bloc.weight;
  }
  const meanProp = w > 0 ? prop / w : el.turnout2026.turnoutRate;
  const enthusiasm =
    candidates.length === 0
      ? 0
      : candidates.reduce((a, c) => a + c.standing.enthusiasm, 0) / candidates.length;
  const importance =
    kind === "presidential" ? TURNOUT.importancePresidential : TURNOUT.importanceAssembly;
  const noise = rng ? gauss01(rng) * TURNOUT.dayNoiseAmp : 0;
  const rate = clamp01(
    meanProp * TURNOUT.propensityWeight +
      el.turnout2026.turnoutRate * TURNOUT.historicalWeight +
      importance +
      enthusiasm * TURNOUT.enthusiasmScale +
      noise,
  );
  const clamped = Math.min(TURNOUT.maxRate, Math.max(TURNOUT.minRate, rate));
  const ballotsCast = Math.max(0, Math.round(registered * clamped));
  const histInvalidRate =
    el.turnout2026.ballotsCast > 0
      ? el.turnout2026.invalidOrBlank / el.turnout2026.ballotsCast
      : 0.012;
  const invalidNoise = rng ? gauss01(rng) * TURNOUT.invalidNoiseAmp : 0;
  const invalidRate = Math.min(
    TURNOUT.maxInvalidRate,
    Math.max(TURNOUT.minInvalidRate, histInvalidRate + invalidNoise),
  );
  let invalidOrBlank = Math.round(ballotsCast * invalidRate);
  if (invalidOrBlank >= ballotsCast && ballotsCast > 0) invalidOrBlank = ballotsCast - 1;
  if (invalidOrBlank < 0) invalidOrBlank = 0;
  const validVoteValue = ballotsCast - invalidOrBlank;
  return {
    registeredElectorate: registered,
    ballotsCast,
    invalidOrBlank,
    validVoteValue,
    turnoutRate: registered > 0 ? ballotsCast / registered : 0,
  };
}

export function mergeTurnout(records: TurnoutRecord[]): TurnoutRecord {
  const registeredElectorateSum = records.reduce((a, r) => a + r.registeredElectorate, 0);
  const ballotsCast = records.reduce((a, r) => a + r.ballotsCast, 0);
  const invalidOrBlank = records.reduce((a, r) => a + r.invalidOrBlank, 0);
  const validVoteValue = records.reduce((a, r) => a + r.validVoteValue, 0);
  return {
    registeredElectorate: registeredElectorateSum,
    ballotsCast,
    invalidOrBlank,
    validVoteValue,
    turnoutRate: registeredElectorateSum > 0 ? ballotsCast / registeredElectorateSum : 0,
  };
}
