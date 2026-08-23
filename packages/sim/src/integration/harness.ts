import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContentBundleFromRepo } from "@lorsain/content-loader/node";
import { createSimulation, restoreSimulation, type Simulation } from "../engine.js";
import { jsonClone } from "../hash.js";
import { occupyingTerms, officesOfKind } from "../offices.js";
import { currentAssemblyMemberIds } from "../legislature/state.js";
import { currentPresidentialAuthorityId, deriveCabinet } from "../executive/state.js";
import { currentCourtJudgeIds } from "../courts/state.js";
import { buildTerenaKernelWorld, type TerenaKernelInput } from "../world.js";
import {
  terenaElectoralFromBundle,
  terenaPartyFields,
  terenaWorldFieldsFromBundle,
} from "../terena-party-input.js";
import type { Command, KernelWorld, SimState } from "../types.js";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");

export function loadTerenaWorld(): KernelWorld {
  const bundle = loadContentBundleFromRepo(repoRoot);
  const input = {
    contentVersion: bundle.manifest.content_version,
    scenario: jsonClone(bundle.content.scenario),
    figures: bundle.content.starting_figures.figures,
    issues: bundle.content.terena_issues.issues.map((i: { id: string; dimension: string }) => ({
      id: i.id,
      dimension: i.dimension,
    })),
    offices: bundle.content.terena_offices.offices,
    constitution: jsonClone(bundle.content.terena_constitution),
    administrations: bundle.content.terena_presidential_administrations.administrations,
    ...terenaPartyFields({
      parties: bundle.content.terena_parties.parties,
      nominationRules: bundle.content.terena_nomination_rules.rules,
      provinceFeatures: bundle.content.terena_provinces.features,
      constituencyFeatures: bundle.content.terena_constituencies.features,
    }),
    presidentialEligibility: { rules: bundle.presidentialEligibility.rules },
    ...terenaElectoralFromBundle(bundle),
    ...terenaWorldFieldsFromBundle(bundle),
  } satisfies TerenaKernelInput;
  return buildTerenaKernelWorld(input);
}

export function expectOk(sim: Simulation, command: Command) {
  const r = sim.executeCommand(command);
  if (!r.ok) throw new Error(`${command.type} failed: ${r.error.code}: ${r.error.message}`);
  return r;
}

/** Advance turns, resolving presidential and assembly election interrupts. */
export function advanceIntegrated(sim: Simulation, turns: number, stopOn?: string): string | null {
  for (let i = 0; i < turns; i++) {
    const r = sim.executeCommand({ type: "ADVANCE_TURN" });
    if (!r.ok) throw new Error(`ADVANCE_TURN failed: ${r.error.code}: ${r.error.message}`);
    if (!r.interrupt) continue;
    if (stopOn && r.interrupt.code === stopOn) return r.interrupt.code;
    if (r.interrupt.code === "PRESIDENTIAL_ELECTION_DUE") {
      expectOk(sim, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
      expectOk(sim, { type: "RESUME_TURN" });
      continue;
    }
    if (r.interrupt.code === "ASSEMBLY_ELECTION_DUE") {
      expectOk(sim, { type: "RESOLVE_ASSEMBLY_ELECTION" });
      expectOk(sim, { type: "RESUME_TURN" });
      continue;
    }
    if (!r.interrupt.requiresResolution) {
      expectOk(sim, { type: "ACKNOWLEDGE_INTERRUPT" });
      expectOk(sim, { type: "RESUME_TURN" });
      continue;
    }
    if (r.interrupt.resolutionStatus === "resolved") {
      expectOk(sim, { type: "RESUME_TURN" });
      continue;
    }
    throw new Error(`unexpected domain interrupt ${r.interrupt.code}`);
  }
  return null;
}

export type CatastrophicInvariantFailure = { code: string; message: string };

export function assertCatastrophicInvariants(
  world: KernelWorld,
  state: SimState,
): CatastrophicInvariantFailure[] {
  const failures: CatastrophicInvariantFailure[] = [];
  const mps = currentAssemblyMemberIds(world, state);
  const authorized = world.legislativeConstitution.assemblySeatCount;
  if (mps.length !== authorized) {
    failures.push({
      code: "ASM_SEAT_COUNT",
      message: `sitting Assembly ${mps.length} != authorized ${authorized}`,
    });
  }
  const president = currentPresidentialAuthorityId(world, state);
  if (!president) {
    failures.push({ code: "NO_PRESIDENT", message: "no presidential authority" });
  }
  const presidents = occupyingTerms(state, "OFFICE_PRESIDENT").filter(
    (t) => t.holdingKind === "substantive" && t.status === "active",
  );
  if (presidents.length > 1) {
    failures.push({ code: "TWO_PRESIDENTS", message: `${presidents.length} substantive presidents` });
  }
  if (!state.politicians[state.playerPoliticianId]) {
    failures.push({ code: "PLAYER_MISSING", message: state.playerPoliticianId });
  }
  const foreignCountries = Object.keys(state.foreignAffairsRuntime.countries ?? {}).length;
  if (foreignCountries !== 48) {
    failures.push({
      code: "FOREIGN_COUNTRY_COUNT",
      message: `foreign countries ${foreignCountries} != 48`,
    });
  }
  const cabinet = deriveCabinet(world, state);
  if (cabinet.length !== 12) {
    failures.push({ code: "CABINET_SIZE", message: `cabinet ${cabinet.length} != 12` });
  }
  for (const partyId of Object.keys(world.partyDefinitions).sort()) {
    const def = world.partyDefinitions[partyId];
    if (!def || def.organizationType !== "membership_party") continue;
    const ps = state.partyStates[partyId];
    if (!ps?.leaderId) {
      failures.push({ code: "NO_PARTY_LEADER", message: partyId });
      continue;
    }
    const leader = state.politicians[ps.leaderId];
    if (!leader?.alive || leader.retired) {
      failures.push({ code: "DEAD_PARTY_LEADER", message: `${partyId}:${ps.leaderId}` });
    }
  }
  const indices = state.economyRuntime.national;
  for (const [k, v] of Object.entries(indices)) {
    if (typeof v === "number" && !Number.isFinite(v)) {
      failures.push({ code: "NAN_ECONOMY", message: `${k}=${v}` });
    }
  }
  const judges = currentCourtJudgeIds(world, state);
  const courtSeats = officesOfKind(world, "constitutional_court_justice").length;
  if (judges.length === 0 && courtSeats > 0) {
    failures.push({ code: "EMPTY_COURT", message: "no sitting constitutional justices" });
  }
  if (state.pendingInterrupt?.requiresResolution && state.pendingInterrupt.resolutionStatus === "unresolved") {
    // Allowed mid-interrupt; harness should not call this during open blocks unless intended.
  }
  return failures;
}

export async function runDeterministicHorizon(args: {
  playerPoliticianId: string;
  seed: string;
  months: number;
  checkpoints?: IsoLike[];
}): {
  hashes: Record<string, string>;
  finalHash: string;
  reloadHash: string;
  invariantFailures: CatastrophicInvariantFailure[];
  dates: string[];
} {
  const world = loadTerenaWorld();
  const continuous = createSimulation({
    world,
    playerPoliticianId: args.playerPoliticianId,
    seed: args.seed,
  });
  const withReloads = createSimulation({
    world,
    playerPoliticianId: args.playerPoliticianId,
    seed: args.seed,
  });

  const hashes: Record<string, string> = {};
  const dates: string[] = [];
  const checkpoints = new Set(args.checkpoints ?? []);

  let reloadSim = withReloads;
  for (let i = 0; i < args.months; i++) {
    advanceIntegrated(continuous, 1);
    advanceIntegrated(reloadSim, 1);
    const date = continuous.getSnapshot().currentDate;
    dates.push(date);
    if (checkpoints.has(date) || i === args.months - 1) {
      hashes[date] = continuous.hashState();
      const save = reloadSim.serializeSave();
      reloadSim = restoreSimulation(save, world);
      if (reloadSim.hashState() !== continuous.hashState()) {
        throw new Error(`reload hash drift at ${date}`);
      }
    }
    if (i % 2 === 1) await new Promise<void>((resolveYield) => setTimeout(resolveYield, 0));
  }

  const invariantFailures = assertCatastrophicInvariants(world, continuous.getSnapshot());
  return {
    hashes,
    finalHash: continuous.hashState(),
    reloadHash: reloadSim.hashState(),
    invariantFailures,
    dates,
  };
}

type IsoLike = string;
