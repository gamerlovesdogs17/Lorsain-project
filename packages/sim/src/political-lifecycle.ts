import { ageOnDate, getAgentProfile } from "./agents/profile.js";
import { activeTermsForPolitician, endTerm, occupyingTerms } from "./offices.js";
import { applyRetirementOrDeathVacancies } from "./parties/membership.js";
import { pushHistory } from "./scheduler.js";
import { applyPresidentialVacancy } from "./succession.js";
import type { KernelWorld, SimEvent, SimState } from "./types.js";

export type PoliticalExitKind = "death" | "retirement";

function stableFraction(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x1_0000_0000;
}

function annualDeathProbability(age: number): number {
  if (age >= 100) return 1;
  if (age >= 90) return Math.min(0.55, 0.04 + (age - 90) * 0.045);
  if (age >= 80) return 0.008 + (age - 80) * 0.004;
  if (age >= 70) return 0.0015 + (age - 70) * 0.0006;
  return 0;
}

function annualRetirementProbability(age: number, inclination: number): number {
  if (age >= 80) return 1;
  if (age >= 74) return Math.min(0.96, 0.34 + (age - 74) * 0.09 + inclination * 0.16);
  return 0;
}

function protectedFromMidtermExit(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
): boolean {
  return activeTermsForPolitician(state, politicianId).some((term) => {
    const kind = world.offices[term.officeId]?.kind;
    return kind === "assembly_member" || kind === "governor";
  });
}

function hasLiveFiledCandidacy(state: SimState, politicianId: string): boolean {
  const national = Object.values(state.elections).some((election) => {
    if (election.status === "resolved" || election.status === "cancelled") return false;
    const candidate = election.candidates[politicianId];
    if (candidate && !candidate.withdrawn) return true;
    return election.assembly?.candidacies[politicianId]?.status === "filed";
  });
  if (national) return true;
  const gubernatorial = Object.values(state.provincialRuntime.elections).some((election) => {
    if (election.status === "assumed") return false;
    return Boolean(
      election.candidates[politicianId] && !election.candidates[politicianId]!.withdrawn,
    );
  });
  if (gubernatorial) return true;
  return Object.values(state.provincialRuntime.assemblyElections).some(
    (election) => election.status === "filing_open" && election.candidateIds.includes(politicianId),
  );
}

/**
 * Apply a political-career exit through the same office, succession, party,
 * contest, and candidacy cleanup path used by developer commands.
 */
export function applyPoliticianExit(
  state: SimState,
  world: KernelWorld,
  politicianId: string,
  kind: PoliticalExitKind,
  commandId: string | null,
): SimEvent[] {
  const politician = state.politicians[politicianId];
  if (!politician) return [];
  if (kind === "death" && !politician.alive) return [];
  if (kind === "retirement" && politician.retired) return [];

  if (kind === "death") politician.alive = false;
  else politician.retired = true;

  const events: SimEvent[] = [
    pushHistory(state, {
      date: state.currentDate,
      type: kind === "death" ? "POLITICIAN_DIED" : "POLITICIAN_RETIRED",
      importance: kind === "death" ? 1 : 0.85,
      visibility: "public",
      actorIds: [politicianId],
      entityIds: [politicianId],
      payload: {},
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  ];

  const wasPresident = occupyingTerms(state, "OFFICE_PRESIDENT").some(
    (term) => term.holderId === politicianId,
  );
  if (wasPresident) {
    const succession = applyPresidentialVacancy(state, world, {
      reason: kind,
      date: state.currentDate,
      commandId: commandId ?? "SYSTEM_POLITICAL_LIFECYCLE",
    });
    if (!succession.error) events.push(...succession.events);
  }

  for (const term of activeTermsForPolitician(state, politicianId)) {
    const ended = endTerm(state, term.id, state.currentDate, kind);
    if (!ended) continue;
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "OFFICE_TERM_ENDED",
        importance: 0.72,
        visibility: "public",
        actorIds: [politicianId],
        entityIds: [ended.officeId, ended.id],
        payload: { reason: kind, holdingKind: ended.holdingKind },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }
  events.push(...applyRetirementOrDeathVacancies(state, world, politicianId, commandId));
  return events;
}

/**
 * Annual NPC lifecycle review. Stable hashes keep outcomes deterministic and
 * avoid consuming a gameplay RNG stream merely because telemetry or UI paths
 * were added. The active player is deliberately excluded.
 */
export function processPoliticalLifecycleMonth(
  state: SimState,
  world: KernelWorld,
  commandId: string | null,
): SimEvent[] {
  if (state.currentDate.slice(5, 7) !== "01") return [];
  if (
    state.history.some(
      (event) => event.type === "POLITICAL_LIFECYCLE_REVIEWED" && event.date === state.currentDate,
    )
  ) {
    return [];
  }
  const year = Number(state.currentDate.slice(0, 4));
  const events: SimEvent[] = [];
  for (const politicianId of Object.keys(state.politicians).sort()) {
    if (politicianId === state.playerPoliticianId) continue;
    const politician = state.politicians[politicianId];
    // Retirement ends an electoral career, not a life. Retired NPCs remain in
    // the public record and continue through the ordinary mortality review.
    if (!politician?.alive) continue;
    const profile = getAgentProfile(world, state, politicianId);
    const age = ageOnDate(profile?.birthDate ?? null, state.currentDate);
    if (age == null || age < 18) continue;

    // Assembly and gubernatorial vacancies need their own electoral procedure;
    // those incumbents leave at election transitions instead of disappearing
    // between counts. Other offices already have succession/appointment paths.
    if (protectedFromMidtermExit(state, world, politicianId)) continue;

    const deathProbability = annualDeathProbability(age);
    if (
      deathProbability > 0 &&
      stableFraction(`${politicianId}:${year}:death`) < deathProbability
    ) {
      events.push(...applyPoliticianExit(state, world, politicianId, "death", commandId));
      continue;
    }

    // Voluntary retirement is considered only after substantive public office
    // has ended. This prevents an unmodeled vacancy while still renewing the
    // challenger, party, and former-officeholder pools.
    if (politician.retired || activeTermsForPolitician(state, politicianId).length > 0) continue;
    // Filing is itself an affirmative commitment to finish the race. A living
    // candidate may retire after the election, but not silently between the
    // filing window and count.
    if (hasLiveFiledCandidacy(state, politicianId)) continue;
    const retirementProbability = annualRetirementProbability(
      age,
      profile?.traits.retirementInclination ?? 0.5,
    );
    if (
      retirementProbability > 0 &&
      stableFraction(`${politicianId}:${year}:retirement`) < retirementProbability
    ) {
      events.push(...applyPoliticianExit(state, world, politicianId, "retirement", commandId));
    }
  }
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "POLITICAL_LIFECYCLE_REVIEWED",
      importance: 0,
      visibility: "system",
      actorIds: [],
      entityIds: [],
      payload: {
        retired: events.filter((event) => event.type === "POLITICIAN_RETIRED").length,
        died: events.filter((event) => event.type === "POLITICIAN_DIED").length,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  return events;
}
