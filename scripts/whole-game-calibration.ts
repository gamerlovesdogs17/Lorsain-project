/**
 * Phase 11.3 whole-game numerical balance / long-run calibration harness.
 *
 * Uses the integration harness (loadTerenaWorld, advanceIntegrated,
 * assertCatastrophicInvariants). Telemetry samples public state/history only —
 * it does not draw from gameplay RNG streams.
 *
 * Acceptance target: 100 seeds × 600 months.
 * Local/CI smoke: WHOLE_GAME_SMOKE=1 or --smoke → 3 × 24.
 * Overrides: WHOLE_GAME_SEEDS, WHOLE_GAME_MONTHS.
 *
 * Run:
 *   pnpm calibrate:whole-game
 *   pnpm calibrate:whole-game:smoke
 *   WHOLE_GAME_SEEDS=5 WHOLE_GAME_MONTHS=60 pnpm calibrate:whole-game
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createSimulation, restoreSimulation, type Simulation } from "../packages/sim/src/engine.js";
import {
  advanceIntegrated,
  assertCatastrophicInvariants,
  loadTerenaWorld,
  type CatastrophicInvariantFailure,
} from "../packages/sim/src/integration/harness.js";
import type { IrvResult } from "../packages/election-math/src/irv.js";
import type { KernelWorld, SimState } from "../packages/sim/src/types.js";
import type { ElectionState } from "../packages/sim/src/elections/types.js";

const ACCEPTANCE_SEEDS = 100;
const ACCEPTANCE_MONTHS = 600;
const SMOKE_SEEDS = 3;
const SMOKE_MONTHS = 24;
const PLAYER_ID = "NPC146";
const CAREER_SAMPLE_SIZE = 24;
const SAVE_SIZE_MONTHS = [0, 120, 300, 600] as const;

const smoke =
  process.env.WHOLE_GAME_SMOKE === "1" ||
  process.argv.includes("--smoke") ||
  process.argv.includes("-s");

function numericFlag(name: string): number | null {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=", 2)[1];
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

const skipDeterminism = process.argv.includes("--skip-determinism");
const childMode = process.argv.includes("--calibration-child");

const seeds = Number(
  numericFlag("seeds") ??
    process.env.WHOLE_GAME_SEEDS ??
    (smoke ? SMOKE_SEEDS : ACCEPTANCE_SEEDS),
);
const months = Number(
  numericFlag("months") ??
    process.env.WHOLE_GAME_MONTHS ??
    (smoke ? SMOKE_MONTHS : ACCEPTANCE_MONTHS),
);
const seedStart = numericFlag("seed-start") ?? 0;
const parallel = Math.max(1, Math.floor(numericFlag("parallel") ?? 1));

if (!Number.isFinite(seeds) || seeds < 1) {
  throw new Error(`Invalid WHOLE_GAME_SEEDS: ${process.env.WHOLE_GAME_SEEDS}`);
}
if (!Number.isFinite(months) || months < 1) {
  throw new Error(`Invalid WHOLE_GAME_MONTHS: ${process.env.WHOLE_GAME_MONTHS}`);
}

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outFlag = process.argv.find((arg) => arg.startsWith("--out="))?.slice("--out=".length);
const outPath = outFlag
  ? resolve(outFlag)
  : resolve(repoRoot, "docs/qa/phase11_3/whole_game_calibration.json");

type NationalSnap = {
  outputIndex: number;
  employmentIndex: number;
  priceIndex: number;
  housingIndex: number;
  confidenceIndex: number;
};

type PresidentialRaceTelemetry = {
  electionId: string;
  date: string;
  nomineeCount: number;
  partiesWithoutNominee: number;
  winnerId: string | null;
  winnerPartyId: string | null;
  marginFinalRound: number | null;
  incumbentRetained: boolean | null;
};

type AssemblyRaceTelemetry = {
  electionId: string;
  date: string;
  seatShiftHalf: number;
  uncontestedConstituencies: number;
  constituencyCount: number;
  representedParties: number;
  turnoutRate: number | null;
};

type GovernorRaceTelemetry = {
  electionId: string;
  provinceId: string;
  date: string;
  winnerId: string | null;
  incumbentRetained: boolean | null;
  margin: number | null;
  candidateCount: number;
};

type CareerTransition = {
  politicianId: string;
  officeId: string;
  officeKind: string | null;
  startDate: string | null;
  endedDate: string | null;
  accessionReason: string | null;
  endedReason: string | null;
  status: string;
};

type RunTelemetry = {
  seed: string;
  seedIndex: number;
  monthsRequested: number;
  monthsCompleted: number;
  finalDate: string | null;
  finalHash: string | null;
  error: string | null;
  catastrophicFailures: CatastrophicInvariantFailure[];
  catastrophicFailureCount: number;
  presidential: PresidentialRaceTelemetry[];
  assembly: AssemblyRaceTelemetry[];
  governors: GovernorRaceTelemetry[];
  economy: {
    start: NationalSnap;
    end: NationalSnap | null;
    delta: Partial<NationalSnap> | null;
    outputSignChanges: number;
    outputDirectionChanges: number;
  };
  regionalEconomy: {
    provinceCount: number;
    rankingChurn: number;
    top5Start: string[];
    top5End: string[];
  };
  legislative: {
    billsIntroduced: number;
    billsEnactedOrSigned: number;
    billsReturnedByPresident: number;
    billsByStatus: Record<string, number>;
    historyIntroduced: number;
    historySigned: number;
  };
  institutions: {
    provincialSeats: number;
    provincialSeatMin: number;
    provincialSeatMax: number;
    provincialElections: number;
    provincialLeadershipElections: number;
    provincialBillsIntroduced: number;
    provincialBillsPassed: number;
    provincialBillsSigned: number;
    provincialVetoes: number;
    provincialOverrides: number;
    provincialVotes: number;
    provincialLegislators: number;
    provincialPromotions: number;
    generatedNationalPoliticians: number;
    partyLeadershipContests: number;
    factionChairContests: number;
    partyContestsResolved: number;
    caucusContests: number;
    caucusContestsResolved: number;
    constitutionalProposed: number;
    constitutionalAssemblyPassed: number;
    constitutionalRatified: number;
    constitutionalFailed: number;
    courtDecisions: number;
    federalProvincialCases: number;
    organizationActions: number;
    organizationEndorsements: number;
    organizationRelationships: number;
    candidateShortageEvents: number;
  };
  careers: {
    sampleSize: number;
    politicianIds: string[];
    termsObserved: number;
    transitions: CareerTransition[];
  };
  foreign: {
    crisesTotal: number;
    crisesCreated: number;
    crisesSettled: number;
    conflictsStarted: number;
    conflictsEnded: number;
    conflictsActive: number;
    treatiesTotal: number;
    treatiesActive: number;
    treatiesProposed: number;
    treatiesRatified: number;
    treatiesTerminated: number;
  };
  performance: {
    turnSamples: number;
    medianTurnMs: number;
    p95TurnMs: number;
    maxTurnMs: number;
  };
  saveGrowth: Array<{ month: number; date: string; bytes: number }>;
};

function seedLabel(index: number): string {
  return `P113-WG-${String(index).padStart(3, "0")}`;
}

function summarize(values: number[]) {
  if (values.length === 0) {
    return { n: 0, min: 0, median: 0, p95: 0, max: 0, mean: 0, sum: 0 };
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const pick = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))] ?? 0;
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    min: sorted[0]!,
    median: pick(0.5),
    p95: pick(0.95),
    max: sorted.at(-1)!,
    mean: sum / sorted.length,
    sum,
  };
}

function nationalSnap(state: SimState): NationalSnap {
  const n = state.economyRuntime.national;
  return {
    outputIndex: n.outputIndex,
    employmentIndex: n.employmentIndex,
    priceIndex: n.priceIndex,
    housingIndex: n.housingIndex,
    confidenceIndex: n.confidenceIndex,
  };
}

function provinceRanking(state: SimState): string[] {
  return Object.entries(state.economyRuntime.provinces)
    .map(([id, row]) => ({ id, v: row.conditionsIndex }))
    .sort((a, b) => b.v - a.v || a.id.localeCompare(b.id))
    .map((row) => row.id);
}

/** Spearman footrule / n — 0 = identical ranking, 1 = maximally shuffled. */
function rankingChurn(start: string[], end: string[]): number {
  if (start.length === 0) return 0;
  const endRank = new Map(end.map((id, index) => [id, index]));
  let distance = 0;
  for (let index = 0; index < start.length; index += 1) {
    const other = endRank.get(start[index]!);
    if (other == null) continue;
    distance += Math.abs(index - other);
  }
  const maxDistance = (start.length * start.length) / 2;
  return maxDistance > 0 ? distance / maxDistance : 0;
}

function parseRational(value: string | number | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.length === 0) return Number.NaN;
  const [num, den] = value.split("/");
  const n = Number(num);
  const d = den == null || den === "" ? 1 : Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return Number.NaN;
  return n / d;
}

function irvFinalMargin(archive: IrvResult | null | undefined): number | null {
  if (!archive?.rounds?.length) return null;
  const elect = [...archive.rounds].reverse().find((round) => round.action === "elect");
  if (!elect?.electedId) return null;
  const totals = elect.totalsBefore;
  const winner = parseRational(totals[elect.electedId]);
  const others = Object.entries(totals)
    .filter(([id]) => id !== elect.electedId)
    .map(([, value]) => parseRational(value))
    .filter((value) => Number.isFinite(value));
  const runner = others.length ? Math.max(...others) : 0;
  const denom = parseRational(elect.continuingDenominator);
  if (!Number.isFinite(winner) || !Number.isFinite(denom) || denom <= 0) return null;
  return (winner - runner) / denom;
}

function partySeatShiftHalf(election: ElectionState): number {
  const assembly = election.assembly;
  if (!assembly) return 0;
  const partyIds = new Set([
    ...Object.keys(assembly.previousPartySeatTotals),
    ...Object.keys(assembly.partySeatTotals),
  ]);
  const raw = [...partyIds].reduce(
    (sum, partyId) =>
      sum +
      Math.abs(
        (assembly.partySeatTotals[partyId] ?? 0) -
          (assembly.previousPartySeatTotals[partyId] ?? 0),
      ),
    0,
  );
  return raw / 2;
}

function countUncontested(election: ElectionState): {
  uncontested: number;
  constituencies: number;
} {
  const fields = Object.values(election.assembly?.constituencyFields ?? {});
  const uncontested = fields.filter((field) => field.candidateIds.length === field.magnitude)
    .length;
  return { uncontested, constituencies: fields.length };
}

function presidentialTelemetry(state: SimState): PresidentialRaceTelemetry[] {
  return Object.values(state.elections)
    .filter((election) => election.type === "presidential" && election.status === "resolved")
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((election) => {
      const winnerId = election.winnerIds[0] ?? null;
      const winnerPartyId =
        winnerId != null ? (election.candidates[winnerId]?.partyId ?? null) : null;
      const archive =
        election.countArchive && election.countArchive.method === "irv"
          ? (election.countArchive as IrvResult)
          : null;
      const incumbentRetained =
        winnerId == null
          ? null
          : Object.values(state.officeTerms).some(
              (term) =>
                term.holderId === winnerId &&
                term.officeId === "OFFICE_PRESIDENT" &&
                term.holdingKind === "substantive" &&
                term.startDate != null &&
                term.startDate < election.date,
            );
      return {
        electionId: election.id,
        date: election.date,
        nomineeCount: Object.values(election.candidates).filter((c) => !c.withdrawn).length,
        partiesWithoutNominee: election.partiesWithoutNominee.length,
        winnerId,
        winnerPartyId,
        marginFinalRound: irvFinalMargin(archive),
        incumbentRetained,
      };
    });
}

function assemblyTelemetry(state: SimState): AssemblyRaceTelemetry[] {
  return Object.values(state.elections)
    .filter((election) => election.type === "assembly" && election.status === "resolved")
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((election) => {
      const { uncontested, constituencies } = countUncontested(election);
      const representedParties = Object.values(election.assembly?.partySeatTotals ?? {}).filter(
        (seats) => seats > 0,
      ).length;
      return {
        electionId: election.id,
        date: election.date,
        seatShiftHalf: partySeatShiftHalf(election),
        uncontestedConstituencies: uncontested,
        constituencyCount: constituencies,
        representedParties,
        turnoutRate: election.turnout?.turnoutRate ?? null,
      };
    });
}

function governorTelemetry(state: SimState): GovernorRaceTelemetry[] {
  return Object.values(state.provincialRuntime.elections)
    .filter((election) => election.status === "resolved" || election.status === "assumed")
    .sort((a, b) => a.date.localeCompare(b.date) || a.provinceId.localeCompare(b.provinceId))
    .map((election) => {
      const shares = Object.entries(election.voteShares).sort((a, b) => b[1] - a[1]);
      const margin =
        shares.length >= 2 ? shares[0]![1] - shares[1]![1] : shares.length === 1 ? 1 : null;
      return {
        electionId: election.id,
        provinceId: election.provinceId,
        date: election.date,
        winnerId: election.winnerId,
        incumbentRetained:
          election.winnerId != null && election.incumbentId != null
            ? election.winnerId === election.incumbentId
            : null,
        margin,
        candidateCount: Object.keys(election.candidates).length,
      };
    });
}

function legislativeTelemetry(state: SimState) {
  const bills = Object.values(state.legislatureRuntime.bills);
  const billsByStatus: Record<string, number> = {};
  for (const bill of bills) {
    billsByStatus[bill.status] = (billsByStatus[bill.status] ?? 0) + 1;
  }
  const historyIntroduced = state.history.filter((e) => e.type === "BILL_INTRODUCED").length;
  const historySigned = state.history.filter((e) => e.type === "BILL_SIGNED").length;
  return {
    billsIntroduced: bills.filter((b) => b.introducedDate != null).length,
    billsEnactedOrSigned: bills.filter(
      (b) => b.status === "signed" || b.status === "enacted" || b.status === "repassed",
    ).length,
    billsReturnedByPresident: bills.filter(
      (b) =>
        b.status === "returned_by_president" ||
        b.presidentialDisposition === "returned" ||
        b.status === "repassage_failed",
    ).length,
    billsByStatus,
    historyIntroduced,
    historySigned,
  };
}

function institutionTelemetry(world: KernelWorld, state: SimState): RunTelemetry["institutions"] {
  const eventCount = (type: string) => state.history.filter((event) => event.type === type).length;
  const assemblies = Object.values(state.provincialRuntime.assemblies);
  const seatCounts = assemblies.map((assembly) => assembly.seatCount);
  const partyContests = Object.values(state.partyContests);
  const caucusContests = Object.values(state.legislatureRuntime.caucusContests);
  const amendments = Object.values(state.provincialRuntime.constitutionalAmendments);
  const organizations = Object.values(state.organizationRuntime.actors);
  const worldPoliticians = new Set(world.politicians.map((politician) => politician.id));
  return {
    provincialSeats: seatCounts.reduce((sum, seats) => sum + seats, 0),
    provincialSeatMin: seatCounts.length ? Math.min(...seatCounts) : 0,
    provincialSeatMax: seatCounts.length ? Math.max(...seatCounts) : 0,
    provincialElections: Object.values(state.provincialRuntime.assemblyElections).filter((election) => election.status === "resolved").length,
    provincialLeadershipElections: assemblies.reduce((sum, assembly) => sum + (assembly.leadershipHistory?.length ?? 0), 0),
    provincialBillsIntroduced: eventCount("PROVINCIAL_BILL_INTRODUCED") + eventCount("GOVERNOR_PROVINCIAL_BILL_PROPOSED"),
    provincialBillsPassed: eventCount("PROVINCIAL_BILL_VOTE"),
    provincialBillsSigned: eventCount("PROVINCIAL_BILL_SIGNED"),
    provincialVetoes: eventCount("PROVINCIAL_BILL_VETOED"),
    provincialOverrides: eventCount("PROVINCIAL_VETO_OVERRIDDEN"),
    provincialVotes: Object.values(state.provincialRuntime.votes).filter((vote) => !vote.id.startsWith("pending:")).length,
    provincialLegislators: Object.keys(state.provincialRuntime.legislators).length,
    provincialPromotions: Object.keys(state.provincialRuntime.promotions).length,
    generatedNationalPoliticians: Object.keys(state.politicians).filter((id) => !worldPoliticians.has(id)).length,
    partyLeadershipContests: partyContests.filter((contest) => contest.type === "party_leadership").length,
    factionChairContests: partyContests.filter((contest) => contest.type === "faction_chair").length,
    partyContestsResolved: partyContests.filter((contest) => contest.status === "resolved").length,
    caucusContests: caucusContests.length,
    caucusContestsResolved: caucusContests.filter((contest) => contest.status === "resolved").length,
    constitutionalProposed: amendments.length,
    constitutionalAssemblyPassed: amendments.filter((amendment) => ["ratifying", "ratified"].includes(amendment.status)).length,
    constitutionalRatified: amendments.filter((amendment) => amendment.status === "ratified").length,
    constitutionalFailed: amendments.filter((amendment) => ["assembly_failed", "failed"].includes(amendment.status)).length,
    courtDecisions: Object.keys(state.constitutionalRuntime.courtDecisions).length,
    federalProvincialCases: Object.values(state.constitutionalRuntime.courtCases).filter((courtCase) => courtCase.caseType === "FEDERAL_PROVINCIAL_DISPUTE").length,
    organizationActions: organizations.reduce((sum, organization) => sum + organization.recentActions.length, 0),
    organizationEndorsements: organizations.reduce((sum, organization) => sum + organization.endorsements.length, 0),
    organizationRelationships: organizations.reduce((sum, organization) => sum + Object.keys(organization.relationships).length, 0),
    candidateShortageEvents: state.history.filter((event) => /CANDIDATE_SHORTAGE|INSUFFICIENT_CANDIDATES/.test(event.type)).length,
  };
}

function foreignTelemetry(state: SimState) {
  const runtime = state.foreignAffairsRuntime;
  const crises = Object.values(runtime.crises);
  const history = state.history;
  return {
    crisesTotal: crises.length,
    crisesCreated: crises.filter((c) => c.metadata.preexisting !== true).length,
    crisesSettled: crises.filter((c) => c.stage === "settled").length,
    conflictsStarted: history.filter((e) => e.type === "INTERNATIONAL_CONFLICT_STARTED").length,
    conflictsEnded: history.filter((e) => e.type === "INTERNATIONAL_CONFLICT_ENDED").length,
    conflictsActive: Object.values(runtime.conflicts).filter((c) => !c.endedDate).length,
    treatiesTotal: Object.keys(runtime.treaties).length,
    treatiesActive: Object.values(runtime.treaties).filter((t) => t.status === "active").length,
    treatiesProposed: history.filter((e) => e.type === "TREATY_PROPOSED").length,
    treatiesRatified: history.filter((e) => e.type === "TREATY_RATIFIED").length,
    treatiesTerminated: history.filter((e) => e.type === "TREATY_TERMINATED").length,
  };
}

function careerTelemetry(
  world: KernelWorld,
  state: SimState,
  sampleIds: string[],
): RunTelemetry["careers"] {
  const sample = new Set(sampleIds);
  const transitions: CareerTransition[] = [];
  for (const term of Object.values(state.officeTerms)) {
    if (!sample.has(term.holderId)) continue;
    transitions.push({
      politicianId: term.holderId,
      officeId: term.officeId,
      officeKind: world.offices[term.officeId]?.kind ?? null,
      startDate: term.startDate,
      endedDate: term.endedDate,
      accessionReason: term.accessionReason,
      endedReason: term.endedReason,
      status: term.status,
    });
  }
  transitions.sort(
    (a, b) =>
      a.politicianId.localeCompare(b.politicianId) ||
      (a.startDate ?? "").localeCompare(b.startDate ?? "") ||
      a.officeId.localeCompare(b.officeId),
  );
  return {
    sampleSize: sampleIds.length,
    politicianIds: sampleIds,
    termsObserved: transitions.length,
    transitions,
  };
}

function pickCareerSample(state: SimState): string[] {
  return Object.keys(state.politicians)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, CAREER_SAMPLE_SIZE);
}

function saveBytes(sim: Simulation): number {
  return Buffer.byteLength(JSON.stringify(sim.serializeSave()), "utf8");
}

function shouldCaptureSave(month: number): boolean {
  if (month === 0) return true;
  if (month === months) return true;
  return SAVE_SIZE_MONTHS.includes(month as (typeof SAVE_SIZE_MONTHS)[number]);
}

/** Cycle indicators from a full-horizon series of public national output readings. */
function cycleFromOutputSeries(series: number[]): {
  outputSignChanges: number;
  outputDirectionChanges: number;
} {
  if (series.length < 2) return { outputSignChanges: 0, outputDirectionChanges: 0 };
  const deltas: number[] = [];
  for (let i = 1; i < series.length; i += 1) {
    deltas.push(series[i]! - series[i - 1]!);
  }
  let signChanges = 0;
  let directionChanges = 0;
  for (let i = 1; i < deltas.length; i += 1) {
    const prev = Math.sign(deltas[i - 1]!);
    const next = Math.sign(deltas[i]!);
    if (prev !== 0 && next !== 0 && prev !== next) {
      signChanges += 1;
      directionChanges += 1;
    } else if (prev !== next) {
      directionChanges += 1;
    }
  }
  return { outputSignChanges: signChanges, outputDirectionChanges: directionChanges };
}

function runOneSeed(args: {
  world: KernelWorld;
  seed: string;
  seedIndex: number;
  careerSample: string[];
}): RunTelemetry {
  const { world, seed, seedIndex, careerSample } = args;
  const sim = createSimulation({ world, playerPoliticianId: PLAYER_ID, seed });
  const startState = sim.getSnapshot();
  const startEconomy = nationalSnap(startState);
  const startRanking = provinceRanking(startState);
  const turnMs: number[] = [];
  const saveGrowth: RunTelemetry["saveGrowth"] = [];

  saveGrowth.push({ month: 0, date: startState.currentDate, bytes: saveBytes(sim) });

  let monthsCompleted = 0;
  let error: string | null = null;
  const outputSeries: number[] = [startEconomy.outputIndex];

  try {
    for (let month = 1; month <= months; month += 1) {
      const t0 = performance.now();
      advanceIntegrated(sim, 1);
      turnMs.push(performance.now() - t0);
      monthsCompleted = month;

      const snap = sim.getSnapshot();
      outputSeries.push(snap.economyRuntime.national.outputIndex);

      if (shouldCaptureSave(month)) {
        saveGrowth.push({
          month,
          date: snap.currentDate,
          bytes: saveBytes(sim),
        });
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const endState = (() => {
    try {
      return sim.getSnapshot();
    } catch {
      return null;
    }
  })();

  const catastrophicFailures = endState
    ? assertCatastrophicInvariants(world, endState)
    : [{ code: "NO_SNAPSHOT", message: error ?? "simulation ended without snapshot" }];

  const endEconomy = endState ? nationalSnap(endState) : null;
  const endRanking = endState ? provinceRanking(endState) : startRanking;
  const cycle = cycleFromOutputSeries(outputSeries);

  const perf = summarize(turnMs);

  return {
    seed,
    seedIndex,
    monthsRequested: months,
    monthsCompleted,
    finalDate: endState?.currentDate ?? null,
    finalHash: (() => {
      try {
        return sim.hashState();
      } catch {
        return null;
      }
    })(),
    error,
    catastrophicFailures,
    catastrophicFailureCount: catastrophicFailures.length,
    presidential: endState ? presidentialTelemetry(endState) : [],
    assembly: endState ? assemblyTelemetry(endState) : [],
    governors: endState ? governorTelemetry(endState) : [],
    economy: {
      start: startEconomy,
      end: endEconomy,
      delta: endEconomy
        ? {
            outputIndex: endEconomy.outputIndex - startEconomy.outputIndex,
            employmentIndex: endEconomy.employmentIndex - startEconomy.employmentIndex,
            priceIndex: endEconomy.priceIndex - startEconomy.priceIndex,
            housingIndex: endEconomy.housingIndex - startEconomy.housingIndex,
            confidenceIndex: endEconomy.confidenceIndex - startEconomy.confidenceIndex,
          }
        : null,
      outputSignChanges: cycle.outputSignChanges,
      outputDirectionChanges: cycle.outputDirectionChanges,
    },
    regionalEconomy: {
      provinceCount: startRanking.length,
      rankingChurn: rankingChurn(startRanking, endRanking),
      top5Start: startRanking.slice(0, 5),
      top5End: endRanking.slice(0, 5),
    },
    legislative: endState
      ? legislativeTelemetry(endState)
      : {
          billsIntroduced: 0,
          billsEnactedOrSigned: 0,
          billsReturnedByPresident: 0,
          billsByStatus: {},
          historyIntroduced: 0,
          historySigned: 0,
        },
    institutions: endState
      ? institutionTelemetry(world, endState)
      : {
          provincialSeats: 0,
          provincialSeatMin: 0,
          provincialSeatMax: 0,
          provincialElections: 0,
          provincialLeadershipElections: 0,
          provincialBillsIntroduced: 0,
          provincialBillsPassed: 0,
          provincialBillsSigned: 0,
          provincialVetoes: 0,
          provincialOverrides: 0,
          provincialVotes: 0,
          provincialLegislators: 0,
          provincialPromotions: 0,
          generatedNationalPoliticians: 0,
          partyLeadershipContests: 0,
          factionChairContests: 0,
          partyContestsResolved: 0,
          caucusContests: 0,
          caucusContestsResolved: 0,
          constitutionalProposed: 0,
          constitutionalAssemblyPassed: 0,
          constitutionalRatified: 0,
          constitutionalFailed: 0,
          courtDecisions: 0,
          federalProvincialCases: 0,
          organizationActions: 0,
          organizationEndorsements: 0,
          organizationRelationships: 0,
          candidateShortageEvents: 0,
        },
    careers: endState
      ? careerTelemetry(world, endState, careerSample)
      : { sampleSize: careerSample.length, politicianIds: careerSample, termsObserved: 0, transitions: [] },
    foreign: endState
      ? foreignTelemetry(endState)
      : {
          crisesTotal: 0,
          crisesCreated: 0,
          crisesSettled: 0,
          conflictsStarted: 0,
          conflictsEnded: 0,
          conflictsActive: 0,
          treatiesTotal: 0,
          treatiesActive: 0,
          treatiesProposed: 0,
          treatiesRatified: 0,
          treatiesTerminated: 0,
        },
    performance: {
      turnSamples: turnMs.length,
      medianTurnMs: Number(perf.median.toFixed(3)),
      p95TurnMs: Number(perf.p95.toFixed(3)),
      maxTurnMs: Number(perf.max.toFixed(3)),
    },
    saveGrowth,
  };
}

function runDeterminismChecks(world: KernelWorld): {
  seed: string;
  dualRunMatch: boolean;
  hashA: string | null;
  hashB: string | null;
  reloadMatch: boolean;
  reloadHashContinuous: string | null;
  reloadHashRestored: string | null;
  error: string | null;
} {
  const seed = seedLabel(0);
  let error: string | null = null;
  try {
    const a = createSimulation({ world, playerPoliticianId: PLAYER_ID, seed });
    const b = createSimulation({ world, playerPoliticianId: PLAYER_ID, seed });
    advanceIntegrated(a, months);
    advanceIntegrated(b, months);
    const hashA = a.hashState();
    const hashB = b.hashState();
    const dualRunMatch = hashA === hashB;

    const continuous = createSimulation({ world, playerPoliticianId: PLAYER_ID, seed });
    const midMonths = Math.max(1, Math.floor(months / 2));
    advanceIntegrated(continuous, midMonths);
    const midSave = continuous.serializeSave();
    const restored = restoreSimulation(midSave, world);
    if (restored.hashState() !== continuous.hashState()) {
      return {
        seed,
        dualRunMatch,
        hashA,
        hashB,
        reloadMatch: false,
        reloadHashContinuous: continuous.hashState(),
        reloadHashRestored: restored.hashState(),
        error: "reload hash mismatch at midpoint",
      };
    }
    const remaining = months - midMonths;
    advanceIntegrated(continuous, remaining);
    advanceIntegrated(restored, remaining);
    const reloadHashContinuous = continuous.hashState();
    const reloadHashRestored = restored.hashState();
    return {
      seed,
      dualRunMatch,
      hashA,
      hashB,
      reloadMatch: reloadHashContinuous === reloadHashRestored,
      reloadHashContinuous,
      reloadHashRestored,
      error: null,
    };
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    return {
      seed,
      dualRunMatch: false,
      hashA: null,
      hashB: null,
      reloadMatch: false,
      reloadHashContinuous: null,
      reloadHashRestored: null,
      error,
    };
  }
}

function aggregateRuns(runs: RunTelemetry[]) {
  const catastrophicTotal = runs.reduce((sum, run) => sum + run.catastrophicFailureCount, 0);
  const catastrophicByCode: Record<string, number> = {};
  for (const run of runs) {
    for (const failure of run.catastrophicFailures) {
      catastrophicByCode[failure.code] = (catastrophicByCode[failure.code] ?? 0) + 1;
    }
  }
  // Pre–June 2030 horizons often report ASM_SEAT_COUNT (vacant seats before the
  // first national Assembly cycle seats). Do not weaken the invariant — surface it.
  const asmSeatOnly =
    Object.keys(catastrophicByCode).length === 1 && catastrophicByCode.ASM_SEAT_COUNT != null;
  const earlyHorizonAsmNote =
    months < 30 && asmSeatOnly
      ? "ASM_SEAT_COUNT alone at <30 months is a known early-horizon seating gap before the first Assembly election; re-check at ≥36 months / full 600."
      : null;

  const winnersByParty: Record<string, number> = {};
  let presidentialRaces = 0;
  let incumbentRetained = 0;
  let incumbentKnown = 0;
  const margins: number[] = [];
  for (const run of runs) {
    for (const race of run.presidential) {
      presidentialRaces += 1;
      const party = race.winnerPartyId ?? "independent_or_unknown";
      winnersByParty[party] = (winnersByParty[party] ?? 0) + 1;
      if (race.incumbentRetained != null) {
        incumbentKnown += 1;
        if (race.incumbentRetained) incumbentRetained += 1;
      }
      if (race.marginFinalRound != null) margins.push(race.marginFinalRound);
    }
  }

  const seatShifts = runs.flatMap((run) => run.assembly.map((a) => a.seatShiftHalf));
  const uncontested = runs.flatMap((run) => run.assembly.map((a) => a.uncontestedConstituencies));
  const govMargins = runs.flatMap((run) =>
    run.governors.map((g) => g.margin).filter((m): m is number => m != null),
  );
  const govIncumbent = runs.flatMap((run) => run.governors.map((g) => g.incumbentRetained));
  const outputDeltas = runs
    .map((run) => run.economy.delta?.outputIndex)
    .filter((v): v is number => v != null);
  const rankingChurns = runs.map((run) => run.regionalEconomy.rankingChurn);
  const medianTurn = runs.map((run) => run.performance.medianTurnMs);
  const p95Turn = runs.map((run) => run.performance.p95TurnMs);
  const finalSaveBytes = runs
    .map((run) => run.saveGrowth.at(-1)?.bytes)
    .filter((v): v is number => v != null);

  return {
    runsCompleted: runs.filter((r) => r.error == null && r.monthsCompleted === months).length,
    runsWithErrors: runs.filter((r) => r.error != null).length,
    catastrophic: {
      totalFailures: catastrophicTotal,
      meanPerRun: catastrophicTotal / Math.max(1, runs.length),
      byCode: catastrophicByCode,
      nearZero: catastrophicTotal === 0,
      earlyHorizonAsmNote,
    },
    presidential: {
      races: presidentialRaces,
      winnersByParty,
      incumbentRetentionRate: incumbentKnown > 0 ? incumbentRetained / incumbentKnown : null,
      marginFinalRound: summarize(margins),
    },
    assembly: {
      races: seatShifts.length,
      seatShiftHalf: summarize(seatShifts),
      uncontestedConstituencies: summarize(uncontested),
    },
    governors: {
      races: runs.reduce((sum, run) => sum + run.governors.length, 0),
      margin: summarize(govMargins),
      incumbentRetentionRate: (() => {
        const known = govIncumbent.filter((v) => v != null);
        if (known.length === 0) return null;
        return known.filter((v) => v === true).length / known.length;
      })(),
    },
    economy: {
      outputDelta: summarize(outputDeltas),
      meanOutputSignChanges: summarize(runs.map((r) => r.economy.outputSignChanges)),
      meanOutputDirectionChanges: summarize(runs.map((r) => r.economy.outputDirectionChanges)),
    },
    regionalEconomy: {
      rankingChurn: summarize(rankingChurns),
    },
    legislative: {
      billsIntroduced: summarize(runs.map((r) => r.legislative.billsIntroduced)),
      billsEnactedOrSigned: summarize(runs.map((r) => r.legislative.billsEnactedOrSigned)),
      billsReturnedByPresident: summarize(runs.map((r) => r.legislative.billsReturnedByPresident)),
    },
    institutions: {
      provincialSeats: summarize(runs.map((r) => r.institutions.provincialSeats)),
      provincialElections: summarize(runs.map((r) => r.institutions.provincialElections)),
      provincialLeadershipElections: summarize(runs.map((r) => r.institutions.provincialLeadershipElections)),
      provincialBillsIntroduced: summarize(runs.map((r) => r.institutions.provincialBillsIntroduced)),
      provincialBillsSigned: summarize(runs.map((r) => r.institutions.provincialBillsSigned)),
      provincialVetoes: summarize(runs.map((r) => r.institutions.provincialVetoes)),
      provincialOverrides: summarize(runs.map((r) => r.institutions.provincialOverrides)),
      provincialLegislators: summarize(runs.map((r) => r.institutions.provincialLegislators)),
      provincialPromotions: summarize(runs.map((r) => r.institutions.provincialPromotions)),
      generatedNationalPoliticians: summarize(runs.map((r) => r.institutions.generatedNationalPoliticians)),
      partyLeadershipContests: summarize(runs.map((r) => r.institutions.partyLeadershipContests)),
      factionChairContests: summarize(runs.map((r) => r.institutions.factionChairContests)),
      caucusContests: summarize(runs.map((r) => r.institutions.caucusContests)),
      constitutionalProposed: summarize(runs.map((r) => r.institutions.constitutionalProposed)),
      constitutionalRatified: summarize(runs.map((r) => r.institutions.constitutionalRatified)),
      courtDecisions: summarize(runs.map((r) => r.institutions.courtDecisions)),
      organizationActions: summarize(runs.map((r) => r.institutions.organizationActions)),
      organizationRelationships: summarize(runs.map((r) => r.institutions.organizationRelationships)),
      candidateShortageEvents: summarize(runs.map((r) => r.institutions.candidateShortageEvents)),
    },
    foreign: {
      crisesCreated: summarize(runs.map((r) => r.foreign.crisesCreated)),
      conflictsStarted: summarize(runs.map((r) => r.foreign.conflictsStarted)),
      treatiesActive: summarize(runs.map((r) => r.foreign.treatiesActive)),
      treatiesRatified: summarize(runs.map((r) => r.foreign.treatiesRatified)),
    },
    performance: {
      medianTurnMs: summarize(medianTurn),
      p95TurnMs: summarize(p95Turn),
    },
    saveGrowth: {
      finalBytes: summarize(finalSaveBytes),
    },
  };
}

function printConsoleSummary(payload: {
  meta: Record<string, unknown>;
  aggregate: ReturnType<typeof aggregateRuns>;
  determinism: ReturnType<typeof runDeterminismChecks>;
}): void {
  const { meta, aggregate, determinism } = payload;
  console.log("");
  console.log("=== Phase 11.3 whole-game calibration ===");
  console.log(
    `mode=${meta.smoke ? "smoke" : "acceptance-scale"} seeds=${meta.seeds} months=${meta.months} (acceptance ${ACCEPTANCE_SEEDS}×${ACCEPTANCE_MONTHS})`,
  );
  console.log(
    `completed=${aggregate.runsCompleted}/${meta.seeds} errors=${aggregate.runsWithErrors} catastrophic=${aggregate.catastrophic.totalFailures} (nearZero=${aggregate.catastrophic.nearZero})`,
  );
  if (aggregate.catastrophic.earlyHorizonAsmNote) {
    console.log(`note: ${aggregate.catastrophic.earlyHorizonAsmNote}`);
  }
  console.log(
    `presidential races=${aggregate.presidential.races} incumbentRetention=${aggregate.presidential.incumbentRetentionRate ?? "n/a"}`,
  );
  console.log(
    `assembly races=${aggregate.assembly.races} seatShift med=${aggregate.assembly.seatShiftHalf.median.toFixed(1)} uncontested med=${aggregate.assembly.uncontestedConstituencies.median.toFixed(1)}`,
  );
  console.log(
    `governors races=${aggregate.governors.races} incumbentRetention=${aggregate.governors.incumbentRetentionRate ?? "n/a"}`,
  );
  console.log(
    `economy outputΔ med=${aggregate.economy.outputDelta.median.toFixed(2)} signChanges med=${aggregate.economy.meanOutputSignChanges.median.toFixed(1)} rankingChurn med=${aggregate.regionalEconomy.rankingChurn.median.toFixed(3)}`,
  );
  console.log(
    `legislative introduced med=${aggregate.legislative.billsIntroduced.median.toFixed(0)} enacted/signed med=${aggregate.legislative.billsEnactedOrSigned.median.toFixed(0)} returned med=${aggregate.legislative.billsReturnedByPresident.median.toFixed(0)}`,
  );
  console.log(
    `institutions provincialSeats=${aggregate.institutions.provincialSeats.median.toFixed(0)} provincialElections med=${aggregate.institutions.provincialElections.median.toFixed(0)} leadership med=${aggregate.institutions.provincialLeadershipElections.median.toFixed(0)} bills med=${aggregate.institutions.provincialBillsIntroduced.median.toFixed(0)} promotions med=${aggregate.institutions.provincialPromotions.median.toFixed(0)} shortages=${aggregate.institutions.candidateShortageEvents.sum.toFixed(0)}`,
  );
  console.log(
    `leadership party med=${aggregate.institutions.partyLeadershipContests.median.toFixed(0)} faction med=${aggregate.institutions.factionChairContests.median.toFixed(0)} caucus med=${aggregate.institutions.caucusContests.median.toFixed(0)} amendments adopted=${aggregate.institutions.constitutionalRatified.sum.toFixed(0)}`,
  );
  console.log(
    `foreign crisesCreated med=${aggregate.foreign.crisesCreated.median.toFixed(1)} conflictsStarted med=${aggregate.foreign.conflictsStarted.median.toFixed(1)} treatiesActive med=${aggregate.foreign.treatiesActive.median.toFixed(1)}`,
  );
  console.log(
    `perf medianTurnMs med=${aggregate.performance.medianTurnMs.median.toFixed(2)} p95TurnMs med=${aggregate.performance.p95TurnMs.median.toFixed(2)} saveFinalBytes med=${aggregate.saveGrowth.finalBytes.median.toFixed(0)}`,
  );
  console.log(
    `determinism seed=${determinism.seed} dualRunMatch=${determinism.dualRunMatch} reloadMatch=${determinism.reloadMatch}${determinism.error ? ` error=${determinism.error}` : ""}`,
  );
  console.log(`wrote ${outPath}`);
  console.log("");
}

async function main(): Promise<void> {
  if (parallel > 1 && !childMode && seeds > 1) {
    await runParallelCalibration();
    return;
  }
  console.log(
    `Whole-game calibration starting: seeds=${seeds} months=${months} seedStart=${seedStart} smoke=${smoke} player=${PLAYER_ID}`,
  );
  const world = loadTerenaWorld();
  const probe = createSimulation({
    world,
    playerPoliticianId: PLAYER_ID,
    seed: seedLabel(seedStart),
  });
  const careerSample = pickCareerSample(probe.getSnapshot());

  const runs: RunTelemetry[] = [];
  for (let index = 0; index < seeds; index += 1) {
    const absoluteIndex = seedStart + index;
    const seed = seedLabel(absoluteIndex);
    process.stdout.write(`  seed ${seed} (${index + 1}/${seeds})… `);
    const started = performance.now();
    const run = runOneSeed({ world, seed, seedIndex: absoluteIndex, careerSample });
    const elapsedSec = ((performance.now() - started) / 1000).toFixed(1);
    console.log(
      `${run.monthsCompleted}/${months}m hash=${run.finalHash?.slice(0, 8) ?? "n/a"} cat=${run.catastrophicFailureCount} ${elapsedSec}s${run.error ? ` ERR ${run.error}` : ""}`,
    );
    runs.push(run);
    if (index % 2 === 1) {
      await new Promise<void>((resolveYield) => setTimeout(resolveYield, 0));
    }
  }

  if (!skipDeterminism) console.log("  running determinism checks (seed 0 dual + reload)…");
  const determinism = skipDeterminism
    ? {
        seed: seedLabel(0),
        dualRunMatch: false,
        hashA: null,
        hashB: null,
        reloadMatch: false,
        reloadHashContinuous: null,
        reloadHashRestored: null,
        error: "skipped by --skip-determinism",
      }
    : runDeterminismChecks(world);
  const aggregate = aggregateRuns(runs);

  const payload = {
    meta: {
      phase: "11.3",
      harness: "whole-game-calibration",
      generatedAt: new Date().toISOString(),
      smoke,
      seeds,
      months,
      seedStart,
      parallel: childMode ? 1 : parallel,
      acceptanceTarget: { seeds: ACCEPTANCE_SEEDS, months: ACCEPTANCE_MONTHS },
      playerPoliticianId: PLAYER_ID,
      contentVersion: probe.getSnapshot().contentVersion,
      env: {
        WHOLE_GAME_SEEDS: process.env.WHOLE_GAME_SEEDS ?? null,
        WHOLE_GAME_MONTHS: process.env.WHOLE_GAME_MONTHS ?? null,
        WHOLE_GAME_SMOKE: process.env.WHOLE_GAME_SMOKE ?? null,
      },
    },
    aggregate,
    determinism,
    runs,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  printConsoleSummary({ meta: payload.meta, aggregate, determinism });
}

async function runParallelCalibration(): Promise<void> {
  const workerCount = Math.min(parallel, seeds);
  const tempDir = mkdtempSync(join(tmpdir(), "lorsain-whole-game-"));
  console.log(
    `Whole-game calibration starting in parallel: seeds=${seeds} months=${months} workers=${workerCount} player=${PLAYER_ID}`,
  );
  const jobs: Array<Promise<string>> = [];
  let assigned = 0;
  for (let worker = 0; worker < workerCount; worker += 1) {
    const count = Math.floor(seeds / workerCount) + (worker < seeds % workerCount ? 1 : 0);
    const start = seedStart + assigned;
    assigned += count;
    const chunkPath = join(tempDir, `chunk-${String(worker).padStart(2, "0")}.json`);
    const childArgs = [
      ...process.execArgv,
      fileURLToPath(import.meta.url),
      `--seeds=${count}`,
      `--months=${months}`,
      `--seed-start=${start}`,
      `--out=${chunkPath}`,
      "--skip-determinism",
      "--calibration-child",
    ];
    jobs.push(new Promise<string>((resolveJob, rejectJob) => {
      const child = spawn(process.execPath, childArgs, { stdio: "inherit", windowsHide: true });
      child.on("error", rejectJob);
      child.on("exit", (code) => {
        if (code === 0) resolveJob(chunkPath);
        else rejectJob(new Error(`Calibration worker ${worker} exited with code ${code ?? "unknown"}`));
      });
    }));
  }

  try {
    const chunkPaths = await Promise.all(jobs);
    const runs = chunkPaths.flatMap((chunkPath) => {
      const payload = JSON.parse(readFileSync(chunkPath, "utf8")) as { runs?: RunTelemetry[] };
      return payload.runs ?? [];
    }).sort((a, b) => a.seedIndex - b.seedIndex);
    if (runs.length !== seeds) {
      throw new Error(`Parallel calibration returned ${runs.length} runs for ${seeds} requested seeds`);
    }
    const world = loadTerenaWorld();
    const probe = createSimulation({ world, playerPoliticianId: PLAYER_ID, seed: seedLabel(seedStart) });
    console.log("  running determinism checks (seed 0 dual + reload)…");
    const determinism = skipDeterminism
      ? {
          seed: seedLabel(seedStart),
          dualRunMatch: false,
          hashA: null,
          hashB: null,
          reloadMatch: false,
          reloadHashContinuous: null,
          reloadHashRestored: null,
          error: "skipped by --skip-determinism",
        }
      : runDeterminismChecks(world);
    const aggregate = aggregateRuns(runs);
    const meta = {
      phase: "11.3",
      harness: "whole-game-calibration",
      generatedAt: new Date().toISOString(),
      smoke,
      seeds,
      months,
      seedStart,
      parallel: workerCount,
      acceptanceTarget: { seeds: ACCEPTANCE_SEEDS, months: ACCEPTANCE_MONTHS },
      playerPoliticianId: PLAYER_ID,
      contentVersion: probe.getSnapshot().contentVersion,
      env: {
        WHOLE_GAME_SEEDS: process.env.WHOLE_GAME_SEEDS ?? null,
        WHOLE_GAME_MONTHS: process.env.WHOLE_GAME_MONTHS ?? null,
        WHOLE_GAME_SMOKE: process.env.WHOLE_GAME_SMOKE ?? null,
      },
    };
    const payload = { meta, aggregate, determinism, runs };
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    printConsoleSummary({ meta, aggregate, determinism });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
