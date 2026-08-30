import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContentBundleFromRepo } from "../../../content-loader/src/node.js";
import { createSimulation, restoreSimulation, type Simulation } from "../engine.js";
import { jsonClone } from "../hash.js";
import { compareIsoDate } from "../calendar.js";
import { occupyingTerms, officesAreIncompatible, officesOfKind } from "../offices.js";
import { currentAssemblyMemberIds, currentSpeakerId } from "../legislature/state.js";
import { currentPresidentialAuthorityId, deriveCabinet } from "../executive/state.js";
import { currentCourtJudgeIds } from "../courts/state.js";
import { governorOfficeForProvince } from "../provinces/state.js";
import { provincialAssemblySeatCount } from "../provinces/assemblies.js";
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
    economy2028: jsonClone(bundle.content.terena_economy_2028),
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
    organizations: bundle.content.terena_organizations.organizations,
    mediaOutlets: bundle.content.terena_media.outlets,
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
    if (r.interrupt.code === "PRESIDENTIAL_ASSUMPTION_DUE") {
      expectOk(sim, { type: "RESOLVE_PRESIDENTIAL_ASSUMPTION" });
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
export type StrictV1InvariantFailure = { code: string; message: string };

export function assertCatastrophicInvariants(
  world: KernelWorld,
  state: SimState,
): CatastrophicInvariantFailure[] {
  const failures: CatastrophicInvariantFailure[] = [];
  const mps = currentAssemblyMemberIds(world, state);
  const authorized = world.legislativeConstitution.assemblySeatCount;
  const catastrophicAssemblyFloor = Math.ceil(authorized * 0.9);
  if (mps.length > authorized || mps.length < catastrophicAssemblyFloor) {
    failures.push({
      code: "ASM_SEAT_COUNT",
      message: `sitting Assembly ${mps.length} outside operational range ${catastrophicAssemblyFloor}-${authorized}`,
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

/**
 * Release-level institutional checks. Catastrophic checks answer whether the
 * simulation can continue; these checks answer whether every modeled v1
 * institution is actually coherent at the sampled date.
 */
export function assertStrictV1Invariants(
  world: KernelWorld,
  state: SimState,
): StrictV1InvariantFailure[] {
  const failures: StrictV1InvariantFailure[] = [];
  const add = (code: string, message: string) => failures.push({ code, message });

  const authorityTerms = officesOfKind(world, "president").flatMap((office) =>
    occupyingTerms(state, office.id).filter((term) => term.status === "active"),
  );
  if (authorityTerms.length !== 1) add("PRESIDENTIAL_AUTHORITY_COUNT", `${authorityTerms.length} active presidential authorities`);
  for (const term of authorityTerms) {
    const holder = state.politicians[term.holderId];
    if (!holder?.alive || holder.retired) add("INVALID_PRESIDENTIAL_AUTHORITY", term.holderId);
  }

  const mps = currentAssemblyMemberIds(world, state);
  if (mps.length !== world.legislativeConstitution.assemblySeatCount) {
    add("ASM_STRICT_SEAT_COUNT", `${mps.length} != ${world.legislativeConstitution.assemblySeatCount}`);
  }
  const speakerId = currentSpeakerId(world, state);
  if (!speakerId || !mps.includes(speakerId)) add("INVALID_SPEAKER", speakerId ?? "vacant");

  const governorHolders = new Set<string>();
  for (const provinceId of world.provinceIds) {
    const office = governorOfficeForProvince(world, provinceId);
    if (!office) {
      add("MISSING_GOVERNOR_OFFICE", provinceId);
      continue;
    }
    const terms = occupyingTerms(state, office.id);
    if (terms.length > 1) add("DUPLICATE_GOVERNOR_OFFICE", `${provinceId}:${terms.length}`);
    if (terms.length === 0) {
      const vacancy = state.provincialRuntime.governorVacancies[provinceId];
      if (!vacancy || vacancy.provinceId !== provinceId || vacancy.status !== "vacant") {
        add("UNMODELED_GOVERNOR_VACANCY", provinceId);
      }
      continue;
    }
    const term = terms[0]!;
    const holder = state.politicians[term.holderId];
    if (!holder?.alive || holder.retired) add("INVALID_GOVERNOR_HOLDER", `${provinceId}:${term.holderId}`);
    if (governorHolders.has(term.holderId)) add("DUPLICATE_GOVERNOR_PERSON", term.holderId);
    governorHolders.add(term.holderId);
    if (term.endDate && compareIsoDate(state.currentDate, term.endDate) > 0) {
      add("EXPIRED_GOVERNOR_TERM", `${provinceId}:${term.endDate}`);
    }
    if (state.provincialRuntime.governorVacancies[provinceId]) add("OCCUPIED_GOVERNOR_MARKED_VACANT", provinceId);
  }

  if (Object.keys(state.provincialRuntime.assemblies).length !== world.provinceIds.length) {
    add("PROVINCIAL_ASSEMBLY_COVERAGE", `${Object.keys(state.provincialRuntime.assemblies).length} != ${world.provinceIds.length}`);
  }
  for (const provinceId of world.provinceIds) {
    const assembly = state.provincialRuntime.assemblies[provinceId];
    if (!assembly) continue;
    const expected = provincialAssemblySeatCount(world, provinceId);
    if (assembly.seatCount !== expected || assembly.memberIds.length !== expected || new Set(assembly.memberIds).size !== expected) {
      add("PROVINCIAL_ASSEMBLY_SEATS", `${provinceId}:${assembly.seatCount}/${assembly.memberIds.length}/${expected}`);
    }
    const members = new Set(assembly.memberIds);
    if (!assembly.presidingOfficerId || !members.has(assembly.presidingOfficerId)) {
      add("INVALID_PROVINCIAL_SPEAKER", provinceId);
    }
    for (const [partyId, leadership] of Object.entries(assembly.partyLeadership)) {
      if (!leadership.floorLeaderId || !members.has(leadership.floorLeaderId)) {
        add("INVALID_PROVINCIAL_FLOOR_LEADER", `${provinceId}:${partyId}`);
      }
      if (!leadership.whipId || !members.has(leadership.whipId)) {
        add("INVALID_PROVINCIAL_WHIP", `${provinceId}:${partyId}`);
      }
    }
  }

  for (const partyId of Object.keys(world.partyDefinitions).sort()) {
    const definition = world.partyDefinitions[partyId];
    if (definition?.organizationType !== "membership_party") continue;
    const party = state.partyStates[partyId];
    if (party?.status === "leadership_vacant") {
      if (party.leaderId != null) add("PARTY_VACANCY_HAS_HOLDER", partyId);
      continue;
    }
    const leader = party?.leaderId ? state.politicians[party.leaderId] : null;
    if (!leader?.alive || leader.retired) add("INVALID_PARTY_LEADER", `${partyId}:${party?.leaderId ?? "vacant"}`);
  }
  for (const [factionId, faction] of Object.entries(state.factionStates)) {
    if (faction.status !== "active") continue;
    const chair = faction.chairId ? state.politicians[faction.chairId] : null;
    if (!chair?.alive || chair.retired) add("INVALID_FACTION_CHAIR", `${factionId}:${faction.chairId ?? "vacant"}`);
  }

  for (const office of officesOfKind(world, "constitutional_court_justice")) {
    const terms = occupyingTerms(state, office.id);
    if (terms.length > 1) add("DUPLICATE_COURT_SEAT", `${office.id}:${terms.length}`);
    for (const term of terms) {
      const holder = state.politicians[term.holderId];
      if (!holder?.alive || holder.retired) add("INVALID_COURT_HOLDER", `${office.id}:${term.holderId}`);
    }
  }
  const cabinetHolders = new Set<string>();
  for (const ministry of deriveCabinet(world, state)) {
    if (!ministry.holderId) continue; // An empty portfolio is a visible vacancy, not a broken reference.
    const holder = state.politicians[ministry.holderId];
    if (!holder?.alive || holder.retired) add("INVALID_MINISTER", `${ministry.officeId}:${ministry.holderId}`);
    if (cabinetHolders.has(ministry.holderId)) add("DUPLICATE_MINISTER", ministry.holderId);
    cabinetHolders.add(ministry.holderId);
  }

  for (const election of Object.values(state.elections)) {
    if (election.status !== "resolved") continue;
    for (const winnerId of election.winnerIds) {
      const inField = election.type === "assembly"
        ? Object.values(election.assembly?.constituencyFields ?? {}).some((field) => field.candidateIds.includes(winnerId))
        : Boolean(election.candidates[winnerId]);
      if (!inField) add("NATIONAL_WINNER_NOT_IN_FIELD", `${election.id}:${winnerId}`);
    }
  }
  for (const election of Object.values(state.provincialRuntime.elections)) {
    if ((election.status === "resolved" || election.status === "assumed") &&
      (!election.winnerId || !election.candidates[election.winnerId])) {
      add("GOVERNOR_WINNER_NOT_IN_FIELD", election.id);
    }
  }

  const occupyingByHolder = new Map<string, Array<(typeof state.officeTerms)[string]>>();
  for (const term of Object.values(state.officeTerms)) {
    if (term.status !== "active" && term.status !== "suspended") continue;
    const holder = state.politicians[term.holderId];
    if (!holder?.alive || holder.retired) add("DEAD_OR_RETIRED_OFFICEHOLDER", `${term.officeId}:${term.holderId}`);
    if (term.holdingKind !== "substantive") continue;
    const rows = occupyingByHolder.get(term.holderId) ?? [];
    rows.push(term);
    occupyingByHolder.set(term.holderId, rows);
  }
  for (const [holderId, terms] of occupyingByHolder) {
    for (let left = 0; left < terms.length; left += 1) {
      for (let right = left + 1; right < terms.length; right += 1) {
        const a = world.offices[terms[left]!.officeId];
        const b = world.offices[terms[right]!.officeId];
        if (a && b && officesAreIncompatible(a, b)) add("INCOMPATIBLE_OVERLAPPING_OFFICES", `${holderId}:${a.kind}+${b.kind}`);
      }
    }
  }

  for (const [key, value] of Object.entries(state.economyRuntime.national)) {
    if (typeof value === "number" && !Number.isFinite(value)) add("STRICT_NAN_ECONOMY", `${key}=${value}`);
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
