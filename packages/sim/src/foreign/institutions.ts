import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { pushHistory } from "../scheduler.js";
import { TERENA_WORLD_ID } from "./types.js";
import { getBilateralRelation } from "./state.js";
import { deterrenceModifier } from "./treaty-effects.js";
import { activeConflicts } from "./conflicts.js";
import { publicActiveCrises } from "./crises.js";
import { adjustRelation } from "./relations.js";

function securityCouncilVetoIds(world: KernelWorld): Set<string> {
  const wa = world.worldInstitutions.INT_WA;
  if (wa?.securityCouncilVetoIds.length) return new Set(wa.securityCouncilVetoIds);
  return new Set(["W24", "W28", "W37", "W40"]);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function processDcConsultations(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const runtime = state.foreignAffairsRuntime;

  for (const conflict of Object.values(runtime.conflicts)) {
    if (conflict.endedDate) continue;
    const victimId = conflict.belligerentIds.find((id) => id !== conflict.aggressorId);
    if (!victimId || !conflict.aggressorId) continue;

    const victim = runtime.countries[victimId];
    if (!victim?.institutionIds.includes("INT_DC")) continue;

    const dcTreaty = Object.values(runtime.treaties).find(
      (t) =>
        t.status === "active" &&
        t.kind === "collective_security" &&
        t.metadata.institutionId === "INT_DC",
    );
    if (!dcTreaty) continue;

    const deterrence = deterrenceModifier(runtime, conflict.aggressorId, victimId);
    if (rng.float01("foreign-affairs") > 0.15 + deterrence) continue;

    const rel = getBilateralRelation(runtime, conflict.aggressorId, victimId);
    if (rel) {
      adjustRelation(rel, { securityTension: -0.02, general: 2 });
      rel.lastUpdated = state.currentDate;
    }

    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "ALLIANCE_CONSULTATION",
        importance: 0.78,
        visibility: "public",
        actorIds: dcTreaty.memberIds.filter((m) => m !== conflict.aggressorId),
        entityIds: ["INT_DC", conflict.id],
        payload: {
          institutionId: "INT_DC",
          article: 6,
          conflictId: conflict.id,
          aggressorId: conflict.aggressorId,
          victimId,
          deterrence,
        },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  void world;
  return events;
}

function processWorldAssembly(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const inst = state.foreignAffairsRuntime.institutionRuntime;
  const conflicts = activeConflicts(state.foreignAffairsRuntime);
  const crises = publicActiveCrises(state.foreignAffairsRuntime).filter((c) => c.intensity > 0.55);

  if (conflicts.length === 0 && crises.length === 0) return events;
  if (rng.float01("foreign-affairs") > 0.18) return events;

  const focusConflict = conflicts.sort((a, b) => b.intensity - a.intensity)[0];
  const focusCrisis = crises.sort((a, b) => b.intensity - a.intensity)[0];
  const focusId = focusConflict?.id ?? focusCrisis?.id ?? null;
  if (!focusId) return events;

  const vetoPowers = securityCouncilVetoIds(world);
  const vetoActor =
    focusConflict?.belligerentIds.find((id) => vetoPowers.has(id)) ??
    focusCrisis?.participantIds.find((id) => vetoPowers.has(id)) ??
    null;
  const vetoBlocked =
    vetoActor != null && focusConflict != null && rng.float01("foreign-affairs") < 0.55;

  let outcome: string;
  if (vetoBlocked) outcome = "resolution_vetoed";
  else if (focusConflict) {
    outcome = rng.float01("foreign-affairs") < 0.4 ? "mediation_request" : "condemnation";
  } else outcome = "debate_resolution";

  if (!vetoBlocked && focusConflict) {
    if (outcome === "mediation_request") {
      focusConflict.intensity = clamp01(focusConflict.intensity - 0.04);
      focusConflict.politicalCost = clamp01(focusConflict.politicalCost + 0.02);
      for (let i = 0; i < focusConflict.belligerentIds.length; i += 1) {
        for (let j = i + 1; j < focusConflict.belligerentIds.length; j += 1) {
          const rel = getBilateralRelation(
            state.foreignAffairsRuntime,
            focusConflict.belligerentIds[i]!,
            focusConflict.belligerentIds[j]!,
          );
          if (rel) {
            adjustRelation(rel, { securityTension: -0.03, general: 3 });
            rel.lastUpdated = state.currentDate;
          }
        }
      }
    } else if (outcome === "condemnation" && focusConflict.aggressorId) {
      for (const other of focusConflict.belligerentIds) {
        if (other === focusConflict.aggressorId) continue;
        const rel = getBilateralRelation(
          state.foreignAffairsRuntime,
          focusConflict.aggressorId,
          other,
        );
        if (rel) {
          adjustRelation(rel, { general: -4, trust: -0.02 });
          rel.lastUpdated = state.currentDate;
        }
      }
    }
  } else if (!vetoBlocked && focusCrisis) {
    focusCrisis.intensity = clamp01(focusCrisis.intensity - 0.03);
  }

  inst.waActions += 1;
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "WORLD_ASSEMBLY_ACTION",
      importance: vetoBlocked ? 0.72 : 0.65,
      visibility: "public",
      actorIds: ["INT_WA"],
      entityIds: [focusId],
      payload: {
        institutionId: "INT_WA",
        outcome,
        vetoBlocked,
        vetoActorId: vetoBlocked ? vetoActor : null,
        focusConflictId: focusConflict?.id ?? null,
        focusCrisisId: focusCrisis?.id ?? null,
      },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );

  return events;
}

function processLtoDisputes(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const inst = state.foreignAffairsRuntime.institutionRuntime;
  const runtime = state.foreignAffairsRuntime;

  for (const dispute of Object.values(inst.ltoDisputes)) {
    if (dispute.stage === "ruling" || dispute.stage === "failed" || dispute.stage === "settled") {
      continue;
    }
    if (rng.float01("foreign-affairs") > 0.35) continue;
    if (dispute.stage === "filed") dispute.stage = "consultation";
    else if (dispute.stage === "consultation") {
      dispute.stage = rng.float01("foreign-affairs") < 0.55 ? "settled" : "ruling";
    }
    dispute.lastUpdate = state.currentDate;
    if (dispute.stage === "settled") {
      const rel = getBilateralRelation(runtime, dispute.partyA, dispute.partyB);
      if (rel) {
        rel.economicTies = Math.min(1, rel.economicTies + 0.05);
        adjustRelation(rel, { general: 4 });
        rel.lastUpdated = state.currentDate;
      }
    } else if (dispute.stage === "ruling" && rng.float01("foreign-affairs") < 0.3) {
      dispute.stage = "failed";
      const rel = getBilateralRelation(runtime, dispute.partyA, dispute.partyB);
      if (rel) {
        adjustRelation(rel, { general: -3, economicTies: -0.02 });
        rel.lastUpdated = state.currentDate;
      }
    }
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "LTO_DISPUTE_UPDATE",
        importance: 0.58,
        visibility: "public",
        actorIds: ["INT_LTO"],
        entityIds: [dispute.id, dispute.partyA, dispute.partyB],
        payload: { disputeId: dispute.id, stage: dispute.stage },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  if (Object.keys(inst.ltoDisputes).length >= 3) return events;
  if (rng.float01("foreign-affairs") > 0.12) return events;

  // Prefer sanctions between LTO members; otherwise elevated trade friction among LTO pairs.
  for (const sanction of Object.values(runtime.sanctions)) {
    if (!sanction.active || sanction.scope === "targeted") continue;
    const a = runtime.countries[sanction.imposerId];
    const b = runtime.countries[sanction.targetId];
    if (!a?.institutionIds.includes("INT_LTO") || !b?.institutionIds.includes("INT_LTO")) continue;
    const disputeId = `LTO${String(Object.keys(inst.ltoDisputes).length + 1).padStart(4, "0")}`;
    inst.ltoDisputes[disputeId] = {
      id: disputeId,
      partyA: sanction.imposerId,
      partyB: sanction.targetId,
      stage: "filed",
      startedDate: state.currentDate,
      lastUpdate: state.currentDate,
    };
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "LTO_DISPUTE_FILED",
        importance: 0.6,
        visibility: "public",
        actorIds: ["INT_LTO"],
        entityIds: [disputeId, sanction.imposerId, sanction.targetId],
        payload: { disputeId, cause: "trade_sanctions" },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
    return events;
  }

  const ltoIds = Object.keys(runtime.countries)
    .filter((id) => runtime.countries[id]?.institutionIds.includes("INT_LTO"))
    .sort();
  const tensePairs: Array<[string, string]> = [];
  for (let i = 0; i < ltoIds.length; i += 1) {
    for (let j = i + 1; j < ltoIds.length; j += 1) {
      const partyA = ltoIds[i]!;
      const partyB = ltoIds[j]!;
      const rel = getBilateralRelation(runtime, partyA, partyB);
      if (!rel || rel.economicTies > 0.35 || rel.general > -15) continue;
      tensePairs.push([partyA, partyB]);
    }
  }
  if (tensePairs.length > 0 && rng.float01("foreign-affairs") < 0.25) {
    const pick = tensePairs[Math.floor(rng.float01("foreign-affairs") * tensePairs.length)]!;
    const [partyA, partyB] = pick;
    const disputeId = `LTO${String(Object.keys(inst.ltoDisputes).length + 1).padStart(4, "0")}`;
    inst.ltoDisputes[disputeId] = {
      id: disputeId,
      partyA,
      partyB,
      stage: "filed",
      startedDate: state.currentDate,
      lastUpdate: state.currentDate,
    };
    events.push(
      pushHistory(state, {
        date: state.currentDate,
        type: "LTO_DISPUTE_FILED",
        importance: 0.58,
        visibility: "public",
        actorIds: ["INT_LTO"],
        entityIds: [disputeId, partyA, partyB],
        payload: { disputeId, cause: "market_access_friction" },
        sourceScheduledEventId: null,
        sourceCommandId: commandId,
      }),
    );
  }

  void world;
  return events;
}

function processCscActions(state: SimState, rng: RngService, commandId: string): SimEvent[] {
  const events: SimEvent[] = [];
  const runtime = state.foreignAffairsRuntime;
  const inst = runtime.institutionRuntime;
  const cscMembers = Object.values(runtime.countries).filter((c) =>
    c.institutionIds.includes("INT_CSC"),
  );
  if (cscMembers.length < 2 || rng.float01("foreign-affairs") > 0.1) return events;

  const crisis = publicActiveCrises(runtime).find((c) =>
    c.participantIds.some((id) => runtime.countries[id]?.institutionIds.includes("INT_CSC")),
  );
  if (!crisis) return events;

  const cscIds = crisis.participantIds.filter((id) =>
    runtime.countries[id]?.institutionIds.includes("INT_CSC"),
  );
  for (let i = 0; i < cscIds.length; i += 1) {
    for (let j = i + 1; j < cscIds.length; j += 1) {
      const rel = getBilateralRelation(runtime, cscIds[i]!, cscIds[j]!);
      if (rel) {
        adjustRelation(rel, { general: 2, trust: 0.01 });
        rel.lastUpdated = state.currentDate;
      }
    }
  }
  crisis.intensity = clamp01(crisis.intensity - 0.02);

  inst.cscActions += 1;
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "CSC_DIPLOMATIC_ACTION",
      importance: 0.55,
      visibility: "public",
      actorIds: ["INT_CSC"],
      entityIds: [crisis.id],
      payload: { institutionId: "INT_CSC", crisisId: crisis.id, action: "bloc_coordination" },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  return events;
}

function processNafMediation(state: SimState, rng: RngService, commandId: string): SimEvent[] {
  const events: SimEvent[] = [];
  const runtime = state.foreignAffairsRuntime;
  const inst = runtime.institutionRuntime;
  if (rng.float01("foreign-affairs") > 0.08) return events;

  const crisis = publicActiveCrises(runtime).find(
    (c) =>
      c.stage === "active" &&
      c.participantIds.some((id) => runtime.countries[id]?.institutionIds.includes("INT_NAF")),
  );
  if (!crisis) return events;

  crisis.intensity = clamp01(crisis.intensity - 0.035);
  if (crisis.focalPairKey) {
    const rel = runtime.bilateralRelations[crisis.focalPairKey];
    if (rel) {
      adjustRelation(rel, { securityTension: -0.025, general: 2 });
      rel.lastUpdated = state.currentDate;
    }
  }

  inst.nafMediations += 1;
  events.push(
    pushHistory(state, {
      date: state.currentDate,
      type: "NAF_MEDIATION",
      importance: 0.52,
      visibility: "public",
      actorIds: ["INT_NAF"],
      entityIds: [crisis.id],
      payload: { institutionId: "INT_NAF", crisisId: crisis.id, action: "neutral_mediation" },
      sourceScheduledEventId: null,
      sourceCommandId: commandId,
    }),
  );
  return events;
}

export function processInstitutionsMonth(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  return [
    ...processDcConsultations(world, state, rng, commandId),
    ...processWorldAssembly(world, state, rng, commandId),
    ...processLtoDisputes(world, state, rng, commandId),
    ...processCscActions(state, rng, commandId),
    ...processNafMediation(state, rng, commandId),
  ];
}

export function dcMemberIds(runtime: SimState["foreignAffairsRuntime"]): string[] {
  const treaty = Object.values(runtime.treaties).find(
    (t) =>
      t.status === "active" &&
      t.kind === "collective_security" &&
      t.metadata.institutionId === "INT_DC",
  );
  return treaty?.memberIds.filter((m) => m !== TERENA_WORLD_ID) ?? [];
}

export function bilateralDcTension(
  runtime: SimState["foreignAffairsRuntime"],
  aId: string,
  bId: string,
): number {
  const rel = getBilateralRelation(runtime, aId, bId);
  return rel?.securityTension ?? 0.15;
}

export function institutionMemberCount(world: KernelWorld, institutionId: string): number {
  return world.worldInstitutions[institutionId]?.memberCountryIds.length ?? 0;
}

export function isSecurityCouncilVetoPower(world: KernelWorld, countryId: string): boolean {
  return securityCouncilVetoIds(world).has(countryId);
}
