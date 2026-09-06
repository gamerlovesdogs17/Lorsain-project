import { addMonths } from "../calendar.js";
import { appointMinister, dismissMinister } from "../executive/procedure.js";
import { chooseMinisterAppointment } from "../executive/decisions.js";
import {
  currentMinisterHolderId,
  currentPresidentialAuthorityId,
  ministerOfficeIds,
} from "../executive/state.js";
import { pushHistory } from "../scheduler.js";
import type { RngService } from "../rng.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { ensurePoliticsRuntime } from "./state.js";
import {
  AS_CABINET_RESHUFFLE_COOLDOWN_MONTHS,
  AS_MAX_CABINET_RESHUFFLES_PER_YEAR,
} from "./types.js";

/**
 * Occasional NPC president reshuffle (not only vacancy fill); records History.
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

  // Rare: ~6% monthly when cabinet is full (tests may force via metadata).
  const filled = ministerOfficeIds(world).filter(
    (id) => currentMinisterHolderId(world, state, id) != null,
  );
  if (filled.length < 4) return [];
  const force = runtime.metadata.forceCabinetReshuffle === true;
  if (!force && rng.float01("npc-decisions") > 0.06) return [];
  if (force) delete runtime.metadata.forceCabinetReshuffle;

  const officeId = filled.sort()[Math.floor(rng.float01("npc-decisions") * filled.length)]!;
  const incumbent = currentMinisterHolderId(world, state, officeId);
  if (!incumbent) return [];

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
    // Restore incumbent if no alternative candidate exists.
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
        reason: "npc_presidential_reshuffle",
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );

  return events;
}
