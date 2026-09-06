import { monthStart } from "../campaigns/effects.js";
import type { RngService } from "../rng.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { processCareerDecisionsMonth } from "./careers.js";
import { processOpenSeatRecruitmentMonth } from "./recruitment.js";
import { enhanceLeadershipContestsMonth } from "./leadership.js";
import { processCaucusAgendaMonth } from "./caucusAgenda.js";
import { processPlatformReviewMonth } from "./platforms.js";
import { processPartyLifecycleMonth } from "./lifecycle.js";
import { processPoliticalMemoryMonth } from "./memory.js";
import { processCabinetReshuffleMonth } from "./cabinet.js";
import { processOrganizationPoliticsMonth } from "./organizations.js";
import { processCoalitionMonth } from "./coalitions.js";
import { ensurePoliticsRuntime, resetPoliticsMonthCounters } from "./state.js";

/**
 * Orchestrates Phase 12 political agency for one month.
 * Cooldowns and AS activity caps live in the submodules / runtime counters.
 *
 * Engine placement: after party institutions, before organizations
 * (agency uses party contests/platforms, then org scorecards feed org month).
 */
export function processPoliticalAgencyMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const runtime = ensurePoliticsRuntime(state);
  const month = monthStart(state.currentDate);
  if (runtime.lastAgencyMonth === month) return [];

  resetPoliticsMonthCounters(runtime);
  const events: SimEvent[] = [];

  events.push(...processPlatformReviewMonth(world, state, commandId));
  events.push(...processCoalitionMonth(world, state, commandId));
  events.push(...processOpenSeatRecruitmentMonth(world, state, rng, commandId));
  events.push(...processCareerDecisionsMonth(world, state, rng, commandId));
  events.push(...enhanceLeadershipContestsMonth(world, state, rng, commandId));
  events.push(...processCaucusAgendaMonth(world, state, commandId));
  events.push(...processCabinetReshuffleMonth(world, state, rng, commandId));
  events.push(...processPartyLifecycleMonth(world, state, rng, commandId));
  events.push(...processPoliticalMemoryMonth(world, state));
  events.push(...processOrganizationPoliticsMonth(world, state, rng, commandId));

  runtime.lastAgencyMonth = month;
  return events;
}
