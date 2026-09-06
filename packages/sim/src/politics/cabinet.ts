import { addMonths } from "../calendar.js";
import { appointMinister, dismissMinister } from "../executive/procedure.js";
import { chooseMinisterAppointment } from "../executive/decisions.js";
import {
  currentMinisterHolderId,
  currentPresidentialAuthorityId,
  ministerOfficeIds,
} from "../executive/state.js";
import { getAgentProfile } from "../agents/profile.js";
import { pushHistory } from "../scheduler.js";
import type { RngService } from "../rng.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { activeCoalition } from "./coalitions.js";
import { ensurePoliticsRuntime } from "./state.js";
import {
  AS_CABINET_RESHUFFLE_COOLDOWN_MONTHS,
  AS_MAX_CABINET_RESHUFFLES_PER_YEAR,
  type CabinetReshuffleReason,
} from "./types.js";

function pickReshuffleReason(
  world: KernelWorld,
  state: SimState,
  incumbent: string,
  rng: RngService,
): CabinetReshuffleReason | null {
  const runtime = ensurePoliticsRuntime(state);
  if (runtime.metadata.forceCabinetReshuffle === true) return "forced_fixture";

  const coalition = activeCoalition(state);
  const profile = getAgentProfile(world, state, incumbent);
  const admin = profile?.skills.administration ?? 0.5;
  const upcomingPres = Object.values(state.elections).some(
    (e) =>
      e.type === "presidential" &&
      e.status !== "resolved" &&
      e.status !== "cancelled" &&
      e.date >= state.currentDate &&
      e.date.slice(0, 7) <= addMonths(state.currentDate, 8).slice(0, 7),
  );
  const factionPressure = Object.values(state.factionStates).some(
    (f) =>
      f.status === "active" &&
      f.partyId === state.politicians[incumbent]?.partyId &&
      f.cohesion < 0.4,
  );

  const reasons: Array<{ reason: CabinetReshuffleReason; weight: number }> = [];
  if (admin < 0.42) reasons.push({ reason: "poor_performance", weight: 0.45 });
  if (coalition) {
    const shares = coalition.cabinetShares;
    const party = state.politicians[incumbent]?.partyId;
    if (party && (shares[party] ?? 0) < 0.15) {
      reasons.push({ reason: "coalition_balance", weight: 0.4 });
    } else if (party && !coalition.partyIds.includes(party)) {
      reasons.push({ reason: "coalition_balance", weight: 0.55 });
    }
  }
  if (factionPressure) reasons.push({ reason: "faction_pressure", weight: 0.35 });
  if (upcomingPres) reasons.push({ reason: "upcoming_election", weight: 0.3 });

  if (reasons.length === 0) return null;
  const total = reasons.reduce((s, r) => s + r.weight, 0);
  let roll = rng.float01("npc-decisions") * total;
  for (const row of reasons.sort((a, b) => a.reason.localeCompare(b.reason))) {
    roll -= row.weight;
    if (roll <= 0) return row.reason;
  }
  return reasons[0]!.reason;
}

/**
 * Occasional NPC president reshuffle driven by political context (not pure RNG).
 */
export function processCabinetReshuffleMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const runtime = ensurePoliticsRuntime(state);
  const president = currentPresidentialAuthorityId(world, state);
  if (!president || president === state.playerPoliticianId) return [];

  const year = Number(state.currentDate.slice(0, 4));
  if (runtime.cabinetReshuffleYear !== year) {
    runtime.cabinetReshuffleYear = year;
    runtime.cabinetReshufflesThisYear = 0;
  }
  if (runtime.cabinetReshufflesThisYear >= AS_MAX_CABINET_RESHUFFLES_PER_YEAR) return [];
  if (
    runtime.lastCabinetReshuffleDate &&
    addMonths(runtime.lastCabinetReshuffleDate, AS_CABINET_RESHUFFLE_COOLDOWN_MONTHS) >
      state.currentDate
  ) {
    return [];
  }

  const filled = ministerOfficeIds(world).filter(
    (id) => currentMinisterHolderId(world, state, id) != null,
  );
  if (filled.length < 4) return [];

  const force = runtime.metadata.forceCabinetReshuffle === true;
  const officeId = filled.sort()[Math.floor(rng.float01("npc-decisions") * filled.length)]!;
  const incumbent = currentMinisterHolderId(world, state, officeId);
  if (!incumbent) return [];

  const reason = pickReshuffleReason(world, state, incumbent, rng);
  if (!reason) return [];
  if (!force && reason !== "forced_fixture" && rng.float01("npc-decisions") > 0.55) return [];
  if (force) delete runtime.metadata.forceCabinetReshuffle;

  const events: SimEvent[] = [];
  const dismissed = dismissMinister(world, state, { actorId: president, officeId }, commandId);
  if ("error" in dismissed) return [];
  events.push(...dismissed.events);

  let replacement: string | null = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const pick = chooseMinisterAppointment(world, state, president, officeId, rng);
    if (pick && pick !== incumbent) {
      replacement = pick;
      break;
    }
  }
  if (!replacement) {
    const restore = appointMinister(
      world,
      state,
      { actorId: president, officeId, politicianId: incumbent },
      commandId,
    );
    if (!("error" in restore)) events.push(...restore.events);
    return events;
  }

  const appointed = appointMinister(
    world,
    state,
    { actorId: president, officeId, politicianId: replacement },
    commandId,
  );
  if ("error" in appointed) {
    const restore = appointMinister(
      world,
      state,
      { actorId: president, officeId, politicianId: incumbent },
      commandId,
    );
    if (!("error" in restore)) events.push(...restore.events);
    return events;
  }
  events.push(...appointed.events);

  runtime.cabinetReshufflesThisYear += 1;
  runtime.lastCabinetReshuffleDate = state.currentDate;

  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "CABINET_RESHUFFLE",
      importance: 0.75,
      visibility: "public",
      actorIds: [president, incumbent, replacement],
      entityIds: [officeId],
      payload: {
        officeId,
        previousHolderId: incumbent,
        newHolderId: replacement,
        reason,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );

  return events;
}
