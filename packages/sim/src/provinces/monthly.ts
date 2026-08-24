import { addMonths, compareIsoDate } from "../calendar.js";
import { monthStart } from "../campaigns/effects.js";
import { ensureCandidateStanding } from "../elections/standing.js";
import type { RngService } from "../rng.js";
import { pushHistory } from "../scheduler.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { processGubernatorialCalendar } from "./elections.js";
import { currentGovernorId, resetProvinceActionPoints } from "./state.js";
import type { ProvincialPressure } from "./types.js";
import { processProvincialAssembliesMonth } from "./assemblies.js";
import { processConstitutionalAmendmentsMonth } from "./constitutional.js";

function clampIndex(value: number): number {
  return Math.max(80, Math.min(120, value));
}

function pressureForProvince(
  state: SimState,
  provinceId: string,
  rng: RngService,
): ProvincialPressure | null {
  const economy = state.economyRuntime.provinces[provinceId];
  if (!economy) return null;
  let kind: ProvincialPressure["kind"] | null = null;
  let title = "";
  let severity = 0;
  if (economy.housingIndex < 94) {
    kind = "housing_strain";
    title = "Housing pressure reaches provincial services";
    severity = Math.min(1, (96 - economy.housingIndex) / 12);
  } else if (economy.employmentIndex < 94) {
    kind = "employment_loss";
    title = "Employment losses demand a provincial response";
    severity = Math.min(1, (96 - economy.employmentIndex) / 12);
  } else if (economy.conditionsIndex < 95) {
    kind = "service_disruption";
    title = "Local services face mounting strain";
    severity = Math.min(1, (97 - economy.conditionsIndex) / 12);
  } else if (rng.float01("flavor") < 0.008) {
    kind = "transport_disruption";
    title = "Transport disruption tests provincial coordination";
    severity = 0.25 + rng.float01("flavor") * 0.25;
  }
  if (!kind) return null;
  const id = `PROVP_${provinceId}_${state.currentDate.slice(0, 7).replace("-", "")}`;
  return {
    id,
    provinceId,
    kind,
    title,
    openedDate: state.currentDate,
    severity,
    status: "open",
    respondedDate: null,
    response: null,
  };
}

function updateProvince(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  provinceId: string,
  commandId: string,
): SimEvent[] {
  const province = state.provincialRuntime.provinces[provinceId];
  const economy = state.economyRuntime.provinces[provinceId];
  if (!province || !economy) return [];
  resetProvinceActionPoints(state, provinceId);
  province.politicalCapital = Math.min(1, province.politicalCapital + 0.025);
  const momentum = province.investmentMomentum;
  economy.conditionsIndex = clampIndex(
    economy.conditionsIndex + momentum.transport * 0.08 + momentum.schools * 0.025 + momentum.hospitals * 0.025,
  );
  economy.employmentIndex = clampIndex(
    economy.employmentIndex + momentum.transport * 0.045 + momentum.housing * 0.025,
  );
  economy.housingIndex = clampIndex(economy.housingIndex + momentum.housing * 0.1);
  for (const focus of Object.keys(momentum) as Array<keyof typeof momentum>) {
    momentum[focus] *= 0.94;
  }
  const governorId = currentGovernorId(world, state, provinceId);
  if (governorId) {
    const economicSignal =
      ((economy.conditionsIndex - 100) + (economy.employmentIndex - 100) * 0.7) / 170;
    province.publicStanding = Math.max(
      -1,
      Math.min(1, province.publicStanding * 0.995 + Math.max(-0.012, Math.min(0.012, economicSignal))),
    );
    const standing = ensureCandidateStanding(world, state, governorId);
    standing.favorability = Math.max(
      -1,
      Math.min(1, standing.favorability + Math.max(-0.006, Math.min(0.006, economicSignal))),
    );
  }
  if (province.activePressureId) {
    const active = state.provincialRuntime.pressures[province.activePressureId];
    if (
      active?.status === "responded" &&
      active.respondedDate &&
      compareIsoDate(state.currentDate, addMonths(active.respondedDate, 3)) >= 0
    ) {
      active.status = "subsided";
      province.activePressureId = null;
    }
  }
  if (!province.activePressureId) {
    const pressure = pressureForProvince(state, provinceId, rng);
    if (pressure && !state.provincialRuntime.pressures[pressure.id]) {
      state.provincialRuntime.pressures[pressure.id] = pressure;
      province.activePressureId = pressure.id;
      return [
        pushHistory(state, {
          date: state.currentDate,
          type: "PROVINCIAL_PRESSURE_OPENED",
          importance: 0.52,
          visibility: "public",
          actorIds: governorId ? [governorId] : [],
          entityIds: [provinceId, pressure.id],
          payload: { provinceId, pressureId: pressure.id, kind: pressure.kind },
          sourceScheduledEventId: null,
          sourceCommandId: commandId,
        }),
      ];
    }
  }
  return [];
}

export function processProvincialMonth(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const month = monthStart(state.currentDate);
  if (state.provincialRuntime.lastMonthProcessed === month) return [];
  const events: SimEvent[] = [];
  for (const provinceId of world.provinceIds) {
    events.push(...updateProvince(state, world, rng, provinceId, commandId));
  }
  events.push(...processProvincialAssembliesMonth(world, state, rng, commandId));
  events.push(...processConstitutionalAmendmentsMonth(world, state, commandId));
  events.push(...processGubernatorialCalendar(state, world, rng, commandId));
  state.provincialRuntime.lastMonthProcessed = month;
  return events;
}
