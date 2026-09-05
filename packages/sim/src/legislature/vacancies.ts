import { compare, parseRational } from "@lorsain/election-math";
import { assumeOffice, canAssumeOffice, occupyingTerms, officesOfKind } from "../offices.js";
import { pushHistory } from "../scheduler.js";
import type { KernelOffice, KernelWorld, SimEvent, SimState } from "../types.js";
import type { AssemblyConstituencyResult, ElectionState } from "../elections/types.js";

function assemblySourceForOffice(
  state: SimState,
  office: KernelOffice,
): { election: ElectionState; result: AssemblyConstituencyResult; endDate: string } | null {
  if (!office.constituencyId) return null;
  const terms = Object.values(state.officeTerms)
    .filter((term) => term.officeId === office.id && term.sourceElectionId != null)
    .sort(
      (a, b) =>
        (b.startDate ?? "0000-00-00").localeCompare(a.startDate ?? "0000-00-00") ||
        b.id.localeCompare(a.id),
    );
  for (const term of terms) {
    const election = state.elections[term.sourceElectionId!];
    const result = election?.assembly?.constituencyResults[office.constituencyId];
    const endDate = term.endDate;
    if (election?.type === "assembly" && election.status === "resolved" && result && endDate) {
      return { election, result, endDate };
    }
  }
  return null;
}

function archivalParty(result: AssemblyConstituencyResult, politicianId: string): string {
  return result.partyByCandidate[politicianId] ?? "independent";
}

function missingSeatParties(
  result: AssemblyConstituencyResult,
  currentHolderIds: readonly string[],
): string[] {
  const required = new Map<string, number>();
  const present = new Map<string, number>();
  for (const id of result.electedIds) {
    const party = archivalParty(result, id);
    required.set(party, (required.get(party) ?? 0) + 1);
  }
  for (const id of currentHolderIds) {
    const party = archivalParty(result, id);
    present.set(party, (present.get(party) ?? 0) + 1);
  }
  const missing: string[] = [];
  for (const [party, seats] of [...required.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (let i = present.get(party) ?? 0; i < seats; i += 1) missing.push(party);
  }
  return missing;
}

function firstPreferenceCompare(result: AssemblyConstituencyResult, a: string, b: string): number {
  const av = parseRational(result.firstPreferences[a] ?? "0/1");
  const bv = parseRational(result.firstPreferences[b] ?? "0/1");
  return compare(bv, av) || a.localeCompare(b);
}

/**
 * Fill midterm Assembly vacancies by a deterministic countback from the last
 * certified constituency field.  V1 preserves the vacated seat's election-day
 * party where an eligible candidate remains, then falls back to the strongest
 * eligible unelected candidate.  No new contest, voter support, or hidden
 * information is fabricated.
 */
export function reconcileAssemblyVacancies(
  state: SimState,
  world: KernelWorld,
  commandId: string | null,
): SimEvent[] {
  const events: SimEvent[] = [];
  const activeAssemblyMembers = new Set(
    officesOfKind(world, "assembly_member")
      .flatMap((office) => occupyingTerms(state, office.id))
      .map((term) => term.holderId),
  );

  for (const office of officesOfKind(world, "assembly_member").sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const holders = occupyingTerms(state, office.id);
    if (holders.length >= office.capacity) continue;
    const source = assemblySourceForOffice(state, office);
    if (!source || !office.constituencyId) continue;

    const previouslyServed = new Set(
      Object.values(state.officeTerms)
        .filter(
          (term) => term.officeId === office.id && term.sourceElectionId === source.election.id,
        )
        .map((term) => term.holderId),
    );
    const currentIds = holders.map((term) => term.holderId);
    const missingParties = missingSeatParties(source.result, currentIds);
    const eligible = source.result.candidateIds
      .filter((id) => id !== state.playerPoliticianId)
      .filter((id) => !previouslyServed.has(id) && !activeAssemblyMembers.has(id))
      .filter((id) => {
        const politician = state.politicians[id];
        return (
          politician?.alive === true &&
          !politician.retired &&
          canAssumeOffice(state, world, office.id, id, "substantive") == null
        );
      })
      .sort((a, b) => firstPreferenceCompare(source.result, a, b));

    while (occupyingTerms(state, office.id).length < office.capacity && eligible.length > 0) {
      const preferredParty = missingParties.shift() ?? null;
      const partyIndex =
        preferredParty == null
          ? -1
          : eligible.findIndex((id) => archivalParty(source.result, id) === preferredParty);
      const replacementId = eligible.splice(partyIndex >= 0 ? partyIndex : 0, 1)[0]!;
      const assumed = assumeOffice(state, world, {
        officeId: office.id,
        holderId: replacementId,
        date: state.currentDate,
        accessionReason: "assembly_countback",
        holdingKind: "substantive",
        endDate: source.endDate,
        startKnown: true,
        sourceElectionId: source.election.id,
      });
      if ("error" in assumed) continue;
      activeAssemblyMembers.add(replacementId);
      previouslyServed.add(replacementId);
      events.push(
        pushHistory(state, {
          date: state.currentDate,
          type: "ASSEMBLY_CASUAL_VACANCY_FILLED",
          importance: 0.62,
          visibility: "public",
          actorIds: [replacementId],
          entityIds: [office.id, office.constituencyId, source.election.id],
          payload: {
            constituencyId: office.constituencyId,
            electionId: source.election.id,
            method: "countback",
            partyId: source.result.partyByCandidate[replacementId] ?? null,
          },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      );
    }
  }
  return events;
}
