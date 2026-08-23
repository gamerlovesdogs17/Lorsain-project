import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import { activeTermsForPolitician } from "../offices.js";
import { pushHistory } from "../scheduler.js";
import { addInvestmentMomentum, currentGovernorId, resetProvinceActionPoints } from "./state.js";
import type { ProvincialActionRecord, ProvincialInvestment, ProvincialPriority } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function recordAction(
  state: SimState,
  actorId: string,
  provinceId: string,
  kind: ProvincialActionRecord["kind"],
  focus: string,
  direction: number,
  commandId: string | null,
): { action: ProvincialActionRecord; event: SimEvent } {
  const id = `PROVACT_${String(Object.keys(state.provincialRuntime.actions).length + 1).padStart(6, "0")}`;
  const action: ProvincialActionRecord = {
    id,
    date: state.currentDate,
    provinceId,
    actorId,
    kind,
    focus,
    direction,
  };
  state.provincialRuntime.actions[id] = action;
  const province = state.provincialRuntime.provinces[provinceId];
  if (province) province.recentActionIds = [...province.recentActionIds.slice(-7), id];
  const event = pushHistory(state, {
    date: state.currentDate,
    type: `PROVINCIAL_${kind.toUpperCase()}`,
    importance: 0.48,
    visibility: "public",
    actorIds: [actorId],
    entityIds: [provinceId, id],
    payload: { provinceId, actionId: id, focus, direction },
    sourceScheduledEventId: null,
    sourceCommandId: commandId,
  });
  return { action, event };
}

function usedMonthlyRoleAction(
  state: SimState,
  actorId: string,
  kind: "ministry_advice" | "civic_priority",
): boolean {
  const month = state.currentDate.slice(0, 7);
  return Object.values(state.provincialRuntime.actions).some(
    (action) =>
      action.actorId === actorId &&
      action.kind === kind &&
      action.date.slice(0, 7) === month,
  );
}

function requireGovernor(
  world: KernelWorld,
  state: SimState,
  actorId: string,
  provinceId: string,
): CommandError | null {
  if (currentGovernorId(world, state, provinceId) !== actorId) {
    return reject("NOT_PROVINCIAL_GOVERNOR", `${actorId} does not govern ${provinceId}`);
  }
  resetProvinceActionPoints(state, provinceId);
  const province = state.provincialRuntime.provinces[provinceId];
  if (!province) return reject("UNKNOWN_PROVINCE", provinceId);
  if (province.actionPointsRemaining < 1) {
    return reject("NO_PROVINCIAL_ACTIONS", "No governor actions remain this month");
  }
  return null;
}

function spendAction(state: SimState, provinceId: string): void {
  state.provincialRuntime.provinces[provinceId]!.actionPointsRemaining -= 1;
}

export function setProvincialPriority(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; provinceId: string; priority: ProvincialPriority },
  commandId: string | null,
) {
  const error = requireGovernor(world, state, args.actorId, args.provinceId);
  if (error) return { error };
  const province = state.provincialRuntime.provinces[args.provinceId]!;
  if (province.administrativePriority === args.priority) {
    return { error: reject("NO_POLICY_CHANGE", `${args.priority} is already the priority`) };
  }
  spendAction(state, args.provinceId);
  province.administrativePriority = args.priority;
  province.politicalCapital = Math.max(0, province.politicalCapital - 0.04);
  const recorded = recordAction(
    state,
    args.actorId,
    args.provinceId,
    "priority",
    args.priority,
    1,
    commandId,
  );
  return { action: recorded.action, events: [recorded.event] };
}

export function directProvincialInvestment(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; provinceId: string; focus: ProvincialInvestment },
  commandId: string | null,
) {
  const error = requireGovernor(world, state, args.actorId, args.provinceId);
  if (error) return { error };
  const province = state.provincialRuntime.provinces[args.provinceId]!;
  if (province.politicalCapital < 0.12) {
    return { error: reject("INSUFFICIENT_POLITICAL_CAPITAL", "Provincial capacity is committed") };
  }
  spendAction(state, args.provinceId);
  province.investmentEmphasis = args.focus;
  province.politicalCapital = Math.max(0, province.politicalCapital - 0.12);
  addInvestmentMomentum(province, args.focus, 0.2);
  const economy = state.economyRuntime.provinces[args.provinceId];
  if (economy) {
    economy.conditionsIndex += 0.08;
    if (args.focus === "housing") economy.housingIndex += 0.12;
    if (args.focus === "transport") economy.employmentIndex += 0.05;
  }
  const recorded = recordAction(
    state,
    args.actorId,
    args.provinceId,
    "investment",
    args.focus,
    1,
    commandId,
  );
  return { action: recorded.action, events: [recorded.event] };
}

export function takeProvincialFederalPosition(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; provinceId: string; issueId: string; direction: -1 | 1 },
  commandId: string | null,
) {
  const error = requireGovernor(world, state, args.actorId, args.provinceId);
  if (error) return { error };
  if (!world.issueIds.includes(args.issueId)) return { error: reject("UNKNOWN_ISSUE", args.issueId) };
  spendAction(state, args.provinceId);
  const province = state.provincialRuntime.provinces[args.provinceId]!;
  province.federalRelationship = Math.max(
    -1,
    Math.min(1, province.federalRelationship + args.direction * 0.07),
  );
  province.publicStanding = Math.max(-1, Math.min(1, province.publicStanding + 0.01));
  const recorded = recordAction(
    state,
    args.actorId,
    args.provinceId,
    "federal_position",
    args.issueId,
    args.direction,
    commandId,
  );
  return { action: recorded.action, events: [recorded.event] };
}

export function respondProvincialPressure(
  world: KernelWorld,
  state: SimState,
  args: {
    actorId: string;
    provinceId: string;
    pressureId: string;
    response: "mobilize" | "coordinate" | "request_federal_support";
  },
  commandId: string | null,
) {
  const error = requireGovernor(world, state, args.actorId, args.provinceId);
  if (error) return { error };
  const pressure = state.provincialRuntime.pressures[args.pressureId];
  if (!pressure || pressure.provinceId !== args.provinceId || pressure.status !== "open") {
    return { error: reject("INVALID_PROVINCIAL_PRESSURE", args.pressureId) };
  }
  spendAction(state, args.provinceId);
  pressure.status = "responded";
  pressure.respondedDate = state.currentDate;
  pressure.response = args.response;
  const province = state.provincialRuntime.provinces[args.provinceId]!;
  province.activePressureId = null;
  province.publicStanding = Math.min(1, province.publicStanding + 0.025);
  if (args.response === "request_federal_support") {
    province.federalRelationship = Math.min(1, province.federalRelationship + 0.04);
  }
  const recorded = recordAction(
    state,
    args.actorId,
    args.provinceId,
    "pressure_response",
    args.response,
    1,
    commandId,
  );
  return { action: recorded.action, events: [recorded.event] };
}

function heldOfficeOfKind(
  world: KernelWorld,
  state: SimState,
  actorId: string,
  kind: string,
) {
  return activeTermsForPolitician(state, actorId)
    .map((term) => world.offices[term.officeId])
    .find((office) => office?.kind === kind);
}

export function adviseMinistryPriority(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; issueId: string },
  commandId: string | null,
) {
  const office = heldOfficeOfKind(world, state, args.actorId, "minister");
  if (!office) return { error: reject("NOT_A_MINISTER", args.actorId) };
  if (!world.issueIds.includes(args.issueId)) return { error: reject("UNKNOWN_ISSUE", args.issueId) };
  if (usedMonthlyRoleAction(state, args.actorId, "ministry_advice")) {
    return { error: reject("MONTHLY_ROLE_ACTION_USED", "Ministry advice has already been submitted this month") };
  }
  const home = world.politicianHomeProvince[args.actorId];
  if (!home || !state.provincialRuntime.provinces[home]) {
    return { error: reject("UNKNOWN_PROVINCE", `${args.actorId} has no recorded home province`) };
  }
  const recorded = recordAction(
    state,
    args.actorId,
    home,
    "ministry_advice",
    args.issueId,
    1,
    commandId,
  );
  recorded.event.payload.portfolio = office.portfolio;
  return { action: recorded.action, events: [recorded.event] };
}

export function setMayorCivicPriority(
  world: KernelWorld,
  state: SimState,
  args: { actorId: string; priority: "housing" | "transport" | "services" },
  commandId: string | null,
) {
  const office = heldOfficeOfKind(world, state, args.actorId, "mayor");
  if (!office) return { error: reject("NOT_A_MAYOR", args.actorId) };
  if (usedMonthlyRoleAction(state, args.actorId, "civic_priority")) {
    return { error: reject("MONTHLY_ROLE_ACTION_USED", "A civic priority has already been set this month") };
  }
  const provinceId = office.jurisdictionId;
  if (!state.provincialRuntime.provinces[provinceId]) {
    return { error: reject("UNKNOWN_PROVINCE", provinceId) };
  }
  const recorded = recordAction(
    state,
    args.actorId,
    provinceId,
    "civic_priority",
    args.priority,
    1,
    commandId,
  );
  return { action: recorded.action, events: [recorded.event] };
}
