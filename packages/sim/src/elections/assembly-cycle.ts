import {
  addMonths,
  compareIsoDate,
  formatIsoDate,
  parseIsoDate,
  type IsoDate,
} from "../calendar.js";
import { getAgentProfile, ageOnDate } from "../agents/profile.js";
import { activeTermsForPolitician, occupyingTerms, officesOfKind } from "../offices.js";
import { recruitFederalAssemblyClass } from "../provinces/assemblies.js";
import { pushHistory } from "../scheduler.js";
import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import { emptyIdeology } from "../agents/profile.js";
import { standingPublicScore } from "../campaigns/effects.js";
import { partyAllowedUnderConstitution } from "../parties/state.js";
import { assemblyElectionMode } from "../provinces/constitutionGameplay.js";
import type {
  AssemblyCandidacy,
  AssemblyConstituencyField,
  AssemblyElectionCycle,
  AssemblyEmergencySelection,
  ElectionCandidate,
  ElectionState,
} from "./types.js";
import {
  buildAssemblyEmergencySelection,
  partyAllowsAutomaticIncumbentRenomination,
  partyAllowsEmergencyAssemblyNomination,
  partyEmergencySelectionDefaults,
  partyRequiresOfficeNomination,
} from "../parties/officeNominations.js";

export const ASSEMBLY_FILING_CALENDAR = {
  openMonthsBeforeElection: 6,
  deadlineMonthsBeforeElection: 1,
} as const;

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function monthStart(date: IsoDate): IsoDate {
  const { year, month } = parseIsoDate(date);
  return formatIsoDate(year, month, 1);
}

export function assemblyFilingDates(electionDate: IsoDate): {
  open: IsoDate;
  deadline: IsoDate;
} {
  return {
    open: monthStart(addMonths(electionDate, -ASSEMBLY_FILING_CALENDAR.openMonthsBeforeElection)),
    deadline: monthStart(
      addMonths(electionDate, -ASSEMBLY_FILING_CALENDAR.deadlineMonthsBeforeElection),
    ),
  };
}

function stableHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const ASSEMBLY_FIELD_RESERVE_TARGET = 4;
const ASSEMBLY_FIELD_MINIMUM_RESERVE = 3;

function publicIdeologyForIndependent(
  world: KernelWorld,
  politicianId: string,
): NonNullable<ElectionCandidate["publicIdeology"]> {
  const profile = world.agentProfiles[politicianId];
  return profile?.ideology ? { ...emptyIdeology(), ...profile.ideology } : emptyIdeology();
}

function assemblyOfficeByConstituency(world: KernelWorld): Map<string, string> {
  const map = new Map<string, string>();
  for (const office of officesOfKind(world, "assembly_member")) {
    if (office.constituencyId) map.set(office.constituencyId, office.id);
  }
  return map;
}

export function incumbentAssemblyConstituency(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
): string | null {
  for (const term of activeTermsForPolitician(state, politicianId)) {
    const office = world.offices[term.officeId];
    if (office?.kind === "assembly_member" && office.constituencyId) {
      return office.constituencyId;
    }
  }
  return null;
}

export function assemblyCandidateEligibilityError(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
  constituencyId: string,
): CommandError | null {
  const pol = state.politicians[politicianId];
  if (!pol) return reject("UNKNOWN_POLITICIAN", politicianId);
  if (!pol.alive || pol.retired) return reject("INELIGIBLE", politicianId);
  if (!world.constituencyElectorate[constituencyId]) {
    return reject("INVALID_GEOGRAPHY", constituencyId);
  }
  if (
    pol.partyId === world.independentAggregatePartyId ||
    (pol.partyId != null &&
      !world.partyDefinitions[pol.partyId] &&
      !state.dynamicParties[pol.partyId])
  ) {
    return reject("INVALID_PARTY", String(pol.partyId));
  }
  const incumbent = incumbentAssemblyConstituency(state, world, politicianId);
  if (incumbent && incumbent !== constituencyId) {
    return reject("INVALID_GEOGRAPHY", "an incumbent may only file in the sitting constituency");
  }
  for (const term of activeTermsForPolitician(state, politicianId)) {
    const kind = world.offices[term.officeId]?.kind;
    if (kind === "president" || kind === "governor" || kind === "constitutional_court_justice") {
      return reject("INELIGIBLE", `${politicianId} currently holds incompatible office ${kind}`);
    }
  }
  return null;
}

function npcIncumbentRuns(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
  electionDate: IsoDate,
): boolean {
  const profile = getAgentProfile(world, state, politicianId);
  if (!profile) return false;
  const age = ageOnDate(profile.birthDate, electionDate) ?? 55;
  const standing = standingPublicScore(world, state, politicianId);
  const score =
    0.56 +
    profile.traits.ambition * 0.16 +
    (1 - profile.traits.retirementInclination) * 0.18 +
    profile.skills.campaigning * 0.08 +
    standing * 0.08 -
    Math.max(0, age - 76) * 0.018;
  return score >= 0.66;
}

function currentPartySeatTotals(state: SimState, world: KernelWorld): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const office of officesOfKind(world, "assembly_member")) {
    for (const term of occupyingTerms(state, office.id)) {
      const partyId = state.politicians[term.holderId]?.partyId ?? "independent";
      totals[partyId] = (totals[partyId] ?? 0) + 1;
    }
  }
  return totals;
}

export function ensureAssemblyElectionCycle(
  state: SimState,
  world: KernelWorld,
  election: ElectionState,
): AssemblyElectionCycle {
  if (election.assembly) {
    election.assembly.electoralMethod = assemblyElectionMode(state);
    return election.assembly;
  }
  const dates = assemblyFilingDates(election.date);
  election.assembly = {
    filingStatus: "planned",
    filingOpenDate: dates.open,
    filingDeadlineDate: dates.deadline,
    decisions: {},
    candidacies: {},
    constituencyFields: {},
    constituencyResults: {},
    previousPartySeatTotals: currentPartySeatTotals(state, world),
    partySeatTotals: {},
    electoralMethod: assemblyElectionMode(state),
  };
  return election.assembly;
}

function candidateQuality(state: SimState, world: KernelWorld, politicianId: string): number {
  const profile = getAgentProfile(world, state, politicianId);
  const standing = standingPublicScore(world, state, politicianId);
  const leadership =
    Object.values(state.partyStates).some((party) => party.leaderId === politicianId) ||
    Object.values(state.factionStates).some((faction) => faction.chairId === politicianId)
      ? 1
      : 0;
  return (
    standing * 0.48 +
    (profile?.skills.campaigning ?? 0.4) * 0.24 +
    (profile?.traits.ambition ?? 0.5) * 0.18 +
    leadership * 0.1
  );
}

function localFit(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
  constituencyId: string,
): number {
  const home =
    state.politicians[politicianId]?.homeProvinceId ?? world.politicianHomeProvince[politicianId];
  if (!home) return 0;
  return (
    world.constituencyElectorate[constituencyId]?.provincePopulationShares.find(
      (share) => share.provinceId === home,
    )?.share ?? 0
  );
}

function candidacyFor(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
  constituencyId: string,
  filedDate: IsoDate,
  source: AssemblyCandidacy["source"],
  emergencySelection?: AssemblyEmergencySelection,
): AssemblyCandidacy {
  const partyId = state.politicians[politicianId]?.partyId ?? null;
  const normalizedParty = partyId === world.independentAggregatePartyId ? null : partyId;
  return {
    politicianId,
    constituencyId,
    partyId: normalizedParty,
    filedDate,
    source,
    incumbent: incumbentAssemblyConstituency(state, world, politicianId) === constituencyId,
    status: "filed",
    ...(emergencySelection ? { emergencySelection } : {}),
  };
}

function eligibleNpcChallengers(
  state: SimState,
  world: KernelWorld,
  incumbentIds: ReadonlySet<string>,
): string[] {
  const constituencyIds = Object.keys(world.constituencyElectorate).sort();
  if (constituencyIds.length === 0) return [];
  return Object.keys(state.politicians)
    .filter((id) => id !== state.playerPoliticianId && !incumbentIds.has(id))
    .filter((id) =>
      constituencyIds.some(
        (constituencyId) => !assemblyCandidateEligibilityError(state, world, id, constituencyId),
      ),
    )
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Count the people who will actually be available to the national filing
 * allocation. Raw living-politician totals are misleading because sitting
 * Presidents, Governors and justices are incompatible, while incumbents who
 * have decided not to run are intentionally absent from the challenger pool.
 */
function availableAssemblyCandidateIds(
  state: SimState,
  world: KernelWorld,
  election: ElectionState,
): Set<string> {
  const constituencyIds = Object.keys(world.constituencyElectorate);
  const officeByConstituency = assemblyOfficeByConstituency(world);
  const incumbentById = new Map<string, string>();
  for (const constituencyId of constituencyIds) {
    const officeId = officeByConstituency.get(constituencyId);
    if (!officeId) continue;
    for (const term of occupyingTerms(state, officeId)) {
      incumbentById.set(term.holderId, constituencyId);
    }
  }

  const available = new Set<string>();
  for (const candidacy of Object.values(
    ensureAssemblyElectionCycle(state, world, election).candidacies,
  )) {
    if (
      candidacy.status === "filed" &&
      !assemblyCandidateEligibilityError(
        state,
        world,
        candidacy.politicianId,
        candidacy.constituencyId,
      )
    ) {
      available.add(candidacy.politicianId);
    }
  }
  for (const [politicianId, constituencyId] of incumbentById) {
    if (politicianId === state.playerPoliticianId) continue;
    if (assemblyCandidateEligibilityError(state, world, politicianId, constituencyId)) continue;
    if (npcIncumbentRuns(state, world, politicianId, election.date)) available.add(politicianId);
  }
  for (const politicianId of eligibleNpcChallengers(state, world, new Set(incumbentById.keys()))) {
    available.add(politicianId);
  }
  return available;
}

type EmergencyNominationSelection = AssemblyEmergencySelection;

type Allocation = {
  candidacies: Record<string, AssemblyCandidacy>;
  fields: Record<string, AssemblyConstituencyField>;
  emergencySelections: EmergencyNominationSelection[];
};

function buildAssemblyNomineeIndex(state: SimState, electionId: string): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const contest of Object.values(state.partyContests)) {
    if (contest.status !== "resolved") continue;
    const meta = contest.metadata as {
      officeKind?: string;
      electionId?: string;
      constituencyId?: string;
      winnerIds?: unknown;
      winnerId?: unknown;
    };
    if (meta.officeKind !== "assembly" || meta.electionId !== electionId) continue;
    const constituencyId = meta.constituencyId;
    if (!constituencyId) continue;
    const key = `${contest.partyId}::${constituencyId}`;
    const winners: string[] = [];
    if (Array.isArray(meta.winnerIds)) {
      for (const id of meta.winnerIds) {
        if (typeof id === "string" && id && !winners.includes(id)) winners.push(id);
      }
    }
    if (winners.length === 0 && typeof meta.winnerId === "string" && meta.winnerId) {
      winners.push(meta.winnerId);
    } else if (
      typeof contest.winnerId === "string" &&
      contest.winnerId &&
      !winners.includes(contest.winnerId)
    ) {
      winners.push(contest.winnerId);
    }
    if (winners.length === 0) continue;
    const existing = index.get(key) ?? [];
    for (const id of winners) {
      if (!existing.includes(id)) existing.push(id);
    }
    index.set(key, existing);
  }
  return index;
}

/**
 * Deterministic national allocation. The input constituency order is ignored;
 * stable election-scoped hashing breaks ties without favoring C001 first.
 *
 * Nomination-required parties with valid nominees for a constituency are not
 * auto-filled there. When magnitude is still short, parties that allow emergency
 * nomination may place co-partisans only with an explicit emergency selection
 * record — never as silent fillers.
 */
export function allocateAssemblyCandidateFields(
  state: SimState,
  world: KernelWorld,
  election: ElectionState,
  requestedConstituencyIds: readonly string[] = Object.keys(world.constituencyElectorate),
): Allocation | { error: CommandError } {
  const cycle = ensureAssemblyElectionCycle(state, world, election);
  const constituencyIds = [...new Set(requestedConstituencyIds)]
    .filter((id) => Boolean(world.constituencyElectorate[id]))
    .sort((a, b) => {
      const ha = stableHash(`${election.id}:${a}`);
      const hb = stableHash(`${election.id}:${b}`);
      return ha - hb || a.localeCompare(b);
    });
  if (constituencyIds.length !== Object.keys(world.constituencyElectorate).length) {
    return { error: reject("INVALID_GEOGRAPHY", "allocation must include every constituency") };
  }

  const nomineeIndex = buildAssemblyNomineeIndex(state, election.id);
  const nomineesFor = (partyId: string | null | undefined, constituencyId: string): string[] => {
    if (!partyId) return [];
    return nomineeIndex.get(`${partyId}::${constituencyId}`) ?? [];
  };
  const hasNomineesFor = (partyId: string | null | undefined, constituencyId: string): boolean =>
    nomineesFor(partyId, constituencyId).length > 0;

  const incumbentById = new Map<string, string>();
  const officeByConstituency = assemblyOfficeByConstituency(world);
  for (const constituencyId of constituencyIds) {
    const officeId = officeByConstituency.get(constituencyId);
    if (!officeId) return { error: reject("MISSING_OFFICE", constituencyId) };
    for (const term of occupyingTerms(state, officeId)) {
      incumbentById.set(term.holderId, constituencyId);
    }
  }

  const candidacies: Record<string, AssemblyCandidacy> = {};
  // A filed candidacy is a public legal fact, not an allocation suggestion.
  // Preserve every valid filed geography and allocate only around it.
  for (const existing of Object.values(cycle.candidacies).sort((a, b) =>
    a.politicianId.localeCompare(b.politicianId),
  )) {
    if (existing.status !== "filed") continue;
    const holder = state.politicians[existing.politicianId];
    if (!holder?.alive || holder.retired) continue;
    if (
      assemblyCandidateEligibilityError(
        state,
        world,
        existing.politicianId,
        existing.constituencyId,
      )
    ) {
      continue;
    }
    const preserved: AssemblyCandidacy = { ...existing };
    if (
      preserved.partyId &&
      partyRequiresOfficeNomination(world, state, preserved.partyId) &&
      partyAllowsAutomaticIncumbentRenomination(world, state, preserved.partyId) &&
      !preserved.emergencySelection &&
      preserved.incumbent
    ) {
      preserved.emergencySelection = buildAssemblyEmergencySelection({
        politicianId: preserved.politicianId,
        partyId: preserved.partyId,
        constituencyId: preserved.constituencyId,
        date: preserved.filedDate,
        authority: "automatic_incumbent",
        reason: "Automatic incumbent renomination under party assembly selection rules",
        selectionMethod: "incumbent_renomination",
      });
    }
    candidacies[existing.politicianId] = preserved;
  }

  for (const [politicianId, constituencyId] of [...incumbentById.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (politicianId === state.playerPoliticianId) continue;
    if (candidacies[politicianId]) continue;
    if (assemblyCandidateEligibilityError(state, world, politicianId, constituencyId)) continue;
    if (!npcIncumbentRuns(state, world, politicianId, election.date)) continue;
    const partyId = state.politicians[politicianId]?.partyId ?? null;
    const normalizedParty = partyId === world.independentAggregatePartyId ? null : partyId;
    if (
      normalizedParty &&
      partyRequiresOfficeNomination(world, state, normalizedParty) &&
      !partyAllowsAutomaticIncumbentRenomination(world, state, normalizedParty)
    ) {
      // Nomination-required parties without automatic renomination must win a
      // contested selection (or authorized emergency) — do not auto-file.
      continue;
    }
    const incumbentSelection =
      normalizedParty &&
      partyRequiresOfficeNomination(world, state, normalizedParty) &&
      partyAllowsAutomaticIncumbentRenomination(world, state, normalizedParty)
        ? buildAssemblyEmergencySelection({
            politicianId,
            partyId: normalizedParty,
            constituencyId,
            date: cycle.filingOpenDate,
            authority: "automatic_incumbent",
            reason: "Automatic incumbent renomination under party assembly selection rules",
            selectionMethod: "incumbent_renomination",
          })
        : undefined;
    candidacies[politicianId] = candidacyFor(
      state,
      world,
      politicianId,
      constituencyId,
      cycle.filingOpenDate,
      "npc",
      incumbentSelection,
    );
  }

  // Ensure resolved constituency nomination slates are on the field before auto-fill.
  for (const [key, winners] of [...nomineeIndex.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const constituencyId = key.split("::")[1]!;
    if (!world.constituencyElectorate[constituencyId]) continue;
    for (const winner of winners) {
      if (candidacies[winner]) continue;
      if (assemblyCandidateEligibilityError(state, world, winner, constituencyId)) continue;
      candidacies[winner] = candidacyFor(
        state,
        world,
        winner,
        constituencyId,
        cycle.filingOpenDate,
        winner === state.playerPoliticianId ? "player" : "npc",
      );
    }
  }

  const byConstituency = new Map<string, string[]>();
  for (const id of constituencyIds) byConstituency.set(id, []);
  for (const candidacy of Object.values(candidacies)) {
    byConstituency.get(candidacy.constituencyId)?.push(candidacy.politicianId);
  }

  const challengerPool = eligibleNpcChallengers(state, world, new Set(incumbentById.keys())).filter(
    (politicianId) => !candidacies[politicianId],
  );
  const unassigned = new Set(challengerPool);
  const candidateMetrics = new Map<
    string,
    { quality: number; partyId: string | null; localFitByConstituency: Map<string, number> }
  >();
  for (const politicianId of challengerPool) {
    const rawPartyId = state.politicians[politicianId]?.partyId ?? null;
    const partyId = rawPartyId === world.independentAggregatePartyId ? null : rawPartyId;
    candidateMetrics.set(politicianId, {
      quality: candidateQuality(state, world, politicianId),
      partyId,
      localFitByConstituency: new Map(
        constituencyIds.map((constituencyId) => [
          constituencyId,
          localFit(state, world, politicianId, constituencyId),
        ]),
      ),
    });
  }
  const targetFor = (cid: string): number =>
    world.constituencyElectorate[cid]!.seats + ASSEMBLY_FIELD_MINIMUM_RESERVE;
  const stretchFor = (cid: string): number =>
    world.constituencyElectorate[cid]!.seats + ASSEMBLY_FIELD_RESERVE_TARGET;

  const emergencySelections: EmergencyNominationSelection[] = [];

  const choosePair = (
    stretch: boolean,
    allowEmergencyNominationFill: boolean,
  ): { politicianId: string; constituencyId: string; emergency: boolean } | null => {
    let best: {
      politicianId: string;
      constituencyId: string;
      score: number;
      tie: number;
      emergency: boolean;
    } | null = null;
    for (const constituencyId of constituencyIds) {
      const ids = byConstituency.get(constituencyId)!;
      const target = stretch ? stretchFor(constituencyId) : targetFor(constituencyId);
      const deficit = target - ids.length;
      if (deficit <= 0) continue;
      const parties = new Set(ids.map((id) => candidacies[id]?.partyId ?? null));
      for (const politicianId of unassigned) {
        const metrics = candidateMetrics.get(politicianId)!;
        const requiresNom = partyRequiresOfficeNomination(world, state, metrics.partyId);
        const allowsEmergency = partyAllowsEmergencyAssemblyNomination(
          world,
          state,
          metrics.partyId,
        );
        const hasNominees = hasNomineesFor(metrics.partyId, constituencyId);
        // Ordinary auto-field skips nomination-required parties that already have a slate.
        // Emergency magnitude fills may place co-partisans only when rules allow and only
        // with an explicit emergency selection record (never silent fillers).
        if (requiresNom && hasNominees && !allowEmergencyNominationFill) continue;
        const emergency =
          requiresNom && (!hasNominees || (allowEmergencyNominationFill && hasNominees));
        if (emergency && !allowEmergencyNominationFill) continue;
        if (emergency && !allowsEmergency) continue;
        const score =
          deficit * 100 +
          (metrics.localFitByConstituency.get(constituencyId) ?? 0) * 12 +
          (parties.has(metrics.partyId) ? 0 : 1.2) +
          metrics.quality * 2 -
          (emergency ? (hasNominees ? 55 : 40) : 0);
        const tie = stableHash(`${election.id}:${politicianId}:${constituencyId}`);
        if (!best || score > best.score || (score === best.score && tie < best.tie)) {
          best = { politicianId, constituencyId, score, tie, emergency };
        }
      }
    }
    return best
      ? {
          politicianId: best.politicianId,
          constituencyId: best.constituencyId,
          emergency: best.emergency,
        }
      : null;
  };

  const assignPicked = (picked: {
    politicianId: string;
    constituencyId: string;
    emergency: boolean;
  }): void => {
    unassigned.delete(picked.politicianId);
    const partyIdRaw = candidateMetrics.get(picked.politicianId)?.partyId ?? null;
    const partyId =
      partyIdRaw === world.independentAggregatePartyId || partyIdRaw == null ? null : partyIdRaw;
    let emergencySelection: AssemblyEmergencySelection | undefined;
    if (picked.emergency && partyId) {
      const hasNominees = hasNomineesFor(partyId, picked.constituencyId);
      const defaults = partyEmergencySelectionDefaults(world, state, partyId);
      emergencySelection = buildAssemblyEmergencySelection({
        politicianId: picked.politicianId,
        partyId,
        constituencyId: picked.constituencyId,
        date: state.currentDate,
        authority: defaults.authority,
        reason: hasNominees
          ? "Minimum field target unmet after nominee slate; authorized emergency nomination"
          : "Field short of magnitude/reserve after formal selection; authorized emergency nomination",
        selectionMethod: defaults.method,
      });
      emergencySelections.push(emergencySelection);
    }
    candidacies[picked.politicianId] = candidacyFor(
      state,
      world,
      picked.politicianId,
      picked.constituencyId,
      cycle.filingOpenDate,
      "npc",
      emergencySelection,
    );
    byConstituency.get(picked.constituencyId)!.push(picked.politicianId);
  };

  for (const stretch of [false, true]) {
    while (unassigned.size > 0) {
      const picked = choosePair(stretch, false);
      if (!picked) break;
      assignPicked(picked);
    }
  }

  // Ordinary fallback still prefers non-nomination-required parties.
  while (unassigned.size > 0) {
    const politicianId = [...unassigned]
      .filter(
        (id) => !partyRequiresOfficeNomination(world, state, candidateMetrics.get(id)?.partyId),
      )
      .sort(
        (a, b) =>
          stableHash(`${election.id}:fallback:${a}`) - stableHash(`${election.id}:fallback:${b}`),
      )[0];
    if (!politicianId) break;
    const constituencyId = constituencyIds.slice().sort((a, b) => {
      const da = byConstituency.get(a)!.length / world.constituencyElectorate[a]!.seats;
      const db = byConstituency.get(b)!.length / world.constituencyElectorate[b]!.seats;
      return (
        da - db ||
        (candidateMetrics.get(politicianId)?.localFitByConstituency.get(b) ?? 0) -
          (candidateMetrics.get(politicianId)?.localFitByConstituency.get(a) ?? 0) ||
        stableHash(`${election.id}:${politicianId}:${a}`) -
          stableHash(`${election.id}:${politicianId}:${b}`)
      );
    })[0]!;
    assignPicked({ politicianId, constituencyId, emergency: false });
  }

  // Emergency: nomination-required members when a constituency is still short of the
  // minimum field target (magnitude + reserve) AND party rules allow emergency nomination.
  // Always attach an explicit selection record — never silent fillers.
  const shortConstituencies = () =>
    constituencyIds.filter((cid) => byConstituency.get(cid)!.length < targetFor(cid));
  while (unassigned.size > 0 && shortConstituencies().length > 0) {
    const picked = choosePair(true, true);
    if (!picked) break;
    // Force emergency onto a short constituency when possible.
    const short = shortConstituencies();
    const constituencyId = short.includes(picked.constituencyId)
      ? picked.constituencyId
      : short.slice().sort((a, b) => {
          const da = byConstituency.get(a)!.length / world.constituencyElectorate[a]!.seats;
          const db = byConstituency.get(b)!.length / world.constituencyElectorate[b]!.seats;
          return (
            da - db ||
            stableHash(`${election.id}:emerg:${picked.politicianId}:${a}`) -
              stableHash(`${election.id}:emerg:${picked.politicianId}:${b}`)
          );
        })[0]!;
    const requiresNom = partyRequiresOfficeNomination(
      world,
      state,
      candidateMetrics.get(picked.politicianId)?.partyId,
    );
    const allowsEmergency = partyAllowsEmergencyAssemblyNomination(
      world,
      state,
      candidateMetrics.get(picked.politicianId)?.partyId,
    );
    if (requiresNom && !allowsEmergency) {
      unassigned.delete(picked.politicianId);
      continue;
    }
    assignPicked({
      politicianId: picked.politicianId,
      constituencyId,
      emergency: Boolean(requiresNom),
    });
  }

  // Remaining pool fills reserves. Never silent-fill nomination-required parties —
  // without a nomination contest or magnitude emergency they contest fewer seats.
  while (unassigned.size > 0) {
    const politicianId = [...unassigned]
      .filter(
        (id) => !partyRequiresOfficeNomination(world, state, candidateMetrics.get(id)?.partyId),
      )
      .sort(
        (a, b) =>
          stableHash(`${election.id}:leftover:${a}`) - stableHash(`${election.id}:leftover:${b}`),
      )[0];
    if (!politicianId) break;
    const metrics = candidateMetrics.get(politicianId)!;
    const constituencyId = constituencyIds.slice().sort((a, b) => {
      const da = byConstituency.get(a)!.length / world.constituencyElectorate[a]!.seats;
      const db = byConstituency.get(b)!.length / world.constituencyElectorate[b]!.seats;
      return (
        da - db ||
        (metrics.localFitByConstituency.get(b) ?? 0) -
          (metrics.localFitByConstituency.get(a) ?? 0) ||
        stableHash(`${election.id}:${politicianId}:${a}`) -
          stableHash(`${election.id}:${politicianId}:${b}`)
      );
    })[0];
    if (!constituencyId) {
      unassigned.delete(politicianId);
      continue;
    }
    assignPicked({ politicianId, constituencyId, emergency: false });
  }

  // Drop remaining nomination-required pool members rather than inventing silent fillers.
  for (const politicianId of [...unassigned]) {
    if (partyRequiresOfficeNomination(world, state, candidateMetrics.get(politicianId)?.partyId)) {
      unassigned.delete(politicianId);
    }
  }

  const fields: Record<string, AssemblyConstituencyField> = {};
  for (const constituencyId of constituencyIds.slice().sort()) {
    const magnitude = world.constituencyElectorate[constituencyId]!.seats;
    const candidateIds = byConstituency.get(constituencyId)!.slice().sort();
    if (candidateIds.length < magnitude) {
      return {
        error: reject(
          "INSUFFICIENT_CANDIDATES",
          `${constituencyId}: ${candidateIds.length} candidates for ${magnitude} seats`,
        ),
      };
    }
    fields[constituencyId] = {
      constituencyId,
      magnitude,
      candidateIds,
      finalizedDate: cycle.filingStatus === "closed" ? cycle.filingDeadlineDate : null,
    };
  }
  return { candidacies, fields, emergencySelections };
}

function syncElectionCandidates(
  state: SimState,
  world: KernelWorld,
  election: ElectionState,
): void {
  const cycle = election.assembly;
  if (!cycle) return;
  const priorSource = new Map<string, string | null>();
  for (const [pid, cand] of Object.entries(election.candidates)) {
    priorSource.set(pid, cand.sourceContestId);
  }
  election.candidates = {};
  for (const candidacy of Object.values(cycle.candidacies).sort((a, b) =>
    a.politicianId.localeCompare(b.politicianId),
  )) {
    election.candidates[candidacy.politicianId] = {
      politicianId: candidacy.politicianId,
      partyId: candidacy.partyId,
      sourceContestId: priorSource.get(candidacy.politicianId) ?? null,
      filedDate: candidacy.filedDate,
      publicIdeology:
        candidacy.partyId == null
          ? publicIdeologyForIndependent(world, candidacy.politicianId)
          : null,
      withdrawn: candidacy.status === "withdrawn",
      independentQualified: candidacy.partyId == null,
      ...(candidacy.emergencySelection ? { emergencySelection: true } : {}),
    };
  }

  const emergencyRows = Object.values(cycle.candidacies)
    .filter((c) => c.emergencySelection && c.status === "filed")
    .map((c) => c.emergencySelection!)
    .sort(
      (a, b) =>
        a.politicianId.localeCompare(b.politicianId) ||
        a.constituencyId.localeCompare(b.constituencyId),
    );
  if (emergencyRows.length > 0) {
    election.metadata = {
      ...election.metadata,
      assemblyEmergencyNominations: emergencyRows,
    };
  } else if ("assemblyEmergencyNominations" in election.metadata) {
    const { assemblyEmergencyNominations: _drop, ...rest } = election.metadata;
    election.metadata = rest;
  }
}

function rebuildAssemblyAllocation(
  state: SimState,
  world: KernelWorld,
  election: ElectionState,
  commandId: string | null = null,
): CommandError | null {
  const allocated = allocateAssemblyCandidateFields(state, world, election);
  if ("error" in allocated) return allocated.error;
  election.assembly!.candidacies = allocated.candidacies;
  election.assembly!.constituencyFields = allocated.fields;
  syncElectionCandidates(state, world, election);
  if (allocated.emergencySelections.length > 0) {
    pushHistory(state, {
      date: state.currentDate,
      type: "ASSEMBLY_EMERGENCY_NOMINATION",
      importance: 0.8,
      visibility: "public",
      actorIds: allocated.emergencySelections.map((row) => row.politicianId).slice(0, 12),
      entityIds: [election.id],
      payload: {
        electionId: election.id,
        count: allocated.emergencySelections.length,
        selections: allocated.emergencySelections.slice(0, 40),
        message:
          "Explicit committee/local emergency nominations filled assembly seats short of magnitude after formal selection.",
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    });
  }
  return null;
}

export function currentAssemblyElectionForFiling(state: SimState): ElectionState | null {
  return (
    Object.values(state.elections)
      .filter(
        (e) =>
          e.type === "assembly" &&
          e.geographyKind === "national" &&
          e.status !== "resolved" &&
          e.status !== "cancelled" &&
          compareIsoDate(e.date, state.currentDate) >= 0,
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0] ?? null
  );
}

export function openAssemblyFilingIfDue(
  state: SimState,
  world: KernelWorld,
  election: ElectionState,
  commandId: string,
): SimEvent[] {
  const cycle = ensureAssemblyElectionCycle(state, world, election);
  if (
    cycle.filingStatus !== "planned" ||
    compareIsoDate(state.currentDate, cycle.filingOpenDate) < 0
  ) {
    return [];
  }
  cycle.filingStatus = "open";
  election.status = "field_open";
  // Recruit before the public field is allocated. Every constituency should
  // have a real reserve beyond the seats, and the count must be
  // based on actually eligible/running people rather than all living figures.
  const fieldTarget = Object.values(world.constituencyElectorate).reduce(
    (sum, row) => sum + row.seats + ASSEMBLY_FIELD_RESERVE_TARGET,
    0,
  );
  const availableBeforeRecruitment = availableAssemblyCandidateIds(state, world, election).size;
  const promoted = recruitFederalAssemblyClass(
    world,
    state,
    election.id,
    Math.max(0, fieldTarget - availableBeforeRecruitment),
  );
  const err = rebuildAssemblyAllocation(state, world, election, commandId);
  if (err) throw new Error(`${err.code}: ${err.message}`);
  return [
    pushHistory(state, {
      date: state.currentDate,
      type: "ASSEMBLY_FILING_OPENED",
      importance: 0.65,
      visibility: "public",
      actorIds: [],
      entityIds: [election.id],
      payload: {
        electionId: election.id,
        electionDate: election.date,
        filingDeadlineDate: cycle.filingDeadlineDate,
        recruitedFromProvincialPolitics: promoted.length,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
}

export function fileAssemblyCandidacy(
  state: SimState,
  world: KernelWorld,
  args: { electionId: string; politicianId: string; constituencyId: string },
  commandId: string | null,
): { events: SimEvent[]; candidacy: AssemblyCandidacy } | { error: CommandError } {
  const election = state.elections[args.electionId];
  if (!election || election.type !== "assembly" || election.geographyKind !== "national") {
    return { error: reject("INVALID_ELECTION", args.electionId) };
  }
  const cycle = ensureAssemblyElectionCycle(state, world, election);
  if (
    cycle.filingStatus !== "open" ||
    compareIsoDate(state.currentDate, cycle.filingDeadlineDate) >= 0
  ) {
    return { error: reject("FILING_CLOSED", election.id) };
  }
  const eligibility = assemblyCandidateEligibilityError(
    state,
    world,
    args.politicianId,
    args.constituencyId,
  );
  if (eligibility) return { error: eligibility };
  const pol = state.politicians[args.politicianId];
  if (!partyAllowedUnderConstitution(state, pol?.partyId ?? null)) {
    return {
      error: reject(
        "PARTY_CONSTITUTIONALLY_BARRED",
        `${pol?.partyId ?? "independent"} is not legal under the current Constitution`,
      ),
    };
  }
  if (cycle.decisions[args.politicianId]?.decision === "declined") {
    return { error: reject("ALREADY_DECLINED", args.politicianId) };
  }
  if (cycle.candidacies[args.politicianId]?.status === "filed") {
    return { error: reject("ALREADY_FILED", args.politicianId) };
  }
  const candidacy = candidacyFor(
    state,
    world,
    args.politicianId,
    args.constituencyId,
    state.currentDate,
    args.politicianId === state.playerPoliticianId ? "player" : "npc",
  );
  cycle.candidacies[args.politicianId] = candidacy;
  cycle.decisions[args.politicianId] = {
    politicianId: args.politicianId,
    decision: "filed",
    decidedDate: state.currentDate,
  };
  const err = rebuildAssemblyAllocation(state, world, election, commandId);
  if (err) return { error: err };
  return {
    candidacy: election.assembly!.candidacies[args.politicianId]!,
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "ASSEMBLY_CANDIDACY_FILED",
        importance: 0.6,
        visibility: "public",
        actorIds: [args.politicianId],
        entityIds: [election.id, args.constituencyId],
        payload: { electionId: election.id, constituencyId: args.constituencyId },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function declineAssemblyCandidacy(
  state: SimState,
  world: KernelWorld,
  args: { electionId: string; politicianId: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const election = state.elections[args.electionId];
  if (!election || election.type !== "assembly" || election.geographyKind !== "national") {
    return { error: reject("INVALID_ELECTION", args.electionId) };
  }
  const cycle = ensureAssemblyElectionCycle(state, world, election);
  if (
    cycle.filingStatus !== "open" ||
    compareIsoDate(state.currentDate, cycle.filingDeadlineDate) >= 0
  ) {
    return { error: reject("FILING_CLOSED", election.id) };
  }
  if (cycle.candidacies[args.politicianId]?.status === "filed") {
    return { error: reject("ALREADY_FILED", args.politicianId) };
  }
  cycle.decisions[args.politicianId] = {
    politicianId: args.politicianId,
    decision: "declined",
    decidedDate: state.currentDate,
  };
  delete cycle.candidacies[args.politicianId];
  // Declining changes only the player's decision. Existing filed candidates
  // must not be passed through a fresh national allocation.
  return {
    events: [
      pushHistory(state, {
        date: state.currentDate,
        type: "ASSEMBLY_CANDIDACY_DECLINED",
        importance: 0.35,
        visibility: "system",
        actorIds: [args.politicianId],
        entityIds: [election.id],
        payload: { electionId: election.id },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    ],
  };
}

export function withdrawAssemblyCandidacy(
  state: SimState,
  electionId: string,
  politicianId: string,
): void {
  const election = state.elections[electionId];
  const candidacy = election?.assembly?.candidacies[politicianId];
  if (!election || !candidacy) return;
  candidacy.status = "withdrawn";
  if (election.candidates[politicianId]) election.candidates[politicianId]!.withdrawn = true;
  const field = election.assembly!.constituencyFields[candidacy.constituencyId];
  if (field) field.candidateIds = field.candidateIds.filter((id) => id !== politicianId);
}

export function finalizeAssemblyFieldsIfDue(
  state: SimState,
  world: KernelWorld,
  election: ElectionState,
  commandId: string,
): SimEvent[] {
  const cycle = ensureAssemblyElectionCycle(state, world, election);
  if (
    cycle.filingStatus !== "open" ||
    compareIsoDate(state.currentDate, cycle.filingDeadlineDate) < 0
  ) {
    return [];
  }
  const incomplete = Object.entries(world.constituencyElectorate).some(
    ([constituencyId, electorate]) =>
      (cycle.constituencyFields[constituencyId]?.candidateIds.length ?? 0) <
      electorate.seats + ASSEMBLY_FIELD_MINIMUM_RESERVE,
  );
  if (incomplete) {
    // Death or another modeled withdrawal can occur after filing opens. The
    // deadline is the last lawful point to promote an already-existing
    // provincial politician; never wait until election resolution to patch a
    // field. Recompute from actual live filings and restore the same reserve.
    const fieldTarget = Object.values(world.constituencyElectorate).reduce(
      (sum, row) => sum + row.seats + ASSEMBLY_FIELD_RESERVE_TARGET,
      0,
    );
    const available = availableAssemblyCandidateIds(state, world, election).size;
    recruitFederalAssemblyClass(world, state, election.id, Math.max(0, fieldTarget - available));
    const err = rebuildAssemblyAllocation(state, world, election, commandId);
    if (err) throw new Error(`${err.code}: ${err.message}`);
  }
  if (!cycle.decisions[state.playerPoliticianId]) {
    cycle.decisions[state.playerPoliticianId] = {
      politicianId: state.playerPoliticianId,
      decision: "declined",
      decidedDate: state.currentDate,
    };
  }
  cycle.filingStatus = "closed";
  for (const field of Object.values(cycle.constituencyFields)) {
    field.finalizedDate = state.currentDate;
  }
  election.fieldFinalized = true;
  election.status = "field_finalized";
  return [
    pushHistory(state, {
      date: state.currentDate,
      type: "ASSEMBLY_FIELD_FINALIZED",
      importance: 0.7,
      visibility: "public",
      actorIds: [],
      entityIds: [election.id],
      payload: {
        electionId: election.id,
        candidates: Object.values(cycle.constituencyFields).reduce(
          (sum, field) => sum + field.candidateIds.length,
          0,
        ),
        constituencies: Object.keys(cycle.constituencyFields).length,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];
}

export function processAssemblyFilingCalendar(
  state: SimState,
  world: KernelWorld,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  // Small election-only fixtures intentionally have no Assembly institution.
  // A real Assembly calendar requires an authorized chamber before filing can open.
  if (world.legislativeConstitution.assemblySeatCount <= 0) return events;
  const elections = Object.values(state.elections)
    .filter(
      (e) =>
        e.type === "assembly" &&
        e.geographyKind === "national" &&
        e.status !== "resolved" &&
        e.status !== "cancelled" &&
        compareIsoDate(e.date, state.currentDate) >= 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const election = elections[0];
  if (!election) return events;
  events.push(...openAssemblyFilingIfDue(state, world, election, commandId));
  events.push(...finalizeAssemblyFieldsIfDue(state, world, election, commandId));
  return events;
}
