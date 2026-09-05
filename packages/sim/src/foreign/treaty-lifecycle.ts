import { addMonths } from "../calendar.js";
import type { IsoDate } from "../calendar.js";
import type { KernelWorld, SimEvent, SimState } from "../types.js";
import { pushHistory } from "../scheduler.js";
import { getBilateralRelation } from "./state.js";
import { recordTreatyRejectionCooldown } from "./treaty-identity.js";
import { activeConflicts } from "./conflicts.js";
import type { TreatyKind, TreatyRecord } from "./types.js";

const HARD_TO_ABANDON: TreatyKind[] = ["collective_security", "mutual_defense"];

function membersAtWar(state: SimState, memberIds: string[]): boolean {
  for (const conflict of activeConflicts(state.foreignAffairsRuntime)) {
    const belligerents = new Set(conflict.belligerentIds);
    const involved = memberIds.filter((m) => belligerents.has(m));
    if (involved.length >= 2) return true;
  }
  return false;
}

function bilateralBreakdown(state: SimState, aId: string, bId: string): boolean {
  const rel = getBilateralRelation(state.foreignAffairsRuntime, aId, bId);
  if (!rel) return false;
  return rel.general < -65 && rel.securityTension > 0.75;
}

function terminateTreaty(
  state: SimState,
  treaty: TreatyRecord,
  date: IsoDate,
  reason: string,
  commandId: string,
): SimEvent {
  treaty.status = "terminated";
  treaty.ratificationStatus =
    treaty.ratificationStatus === "ratified" ? "ratified" : "not_required";
  treaty.metadata = { ...treaty.metadata, terminationReason: reason, terminatedDate: date };
  recordTreatyRejectionCooldown(state.foreignAffairsRuntime, treaty, date, 24);
  return pushHistory(state, {
    date,
    type: "TREATY_TERMINATED",
    importance: HARD_TO_ABANDON.includes(treaty.kind) ? 0.82 : 0.68,
    visibility: "public",
    actorIds: treaty.memberIds,
    entityIds: [treaty.id],
    payload: { treatyId: treaty.id, reason, kind: treaty.kind },
    sourceScheduledEventId: null,
    sourceCommandId: commandId,
  });
}

export function processTreatyLifecycleMonth(
  world: KernelWorld,
  state: SimState,
  date: IsoDate,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  void world;

  for (const treaty of Object.values(state.foreignAffairsRuntime.treaties).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (treaty.status !== "active") continue;

    if (membersAtWar(state, treaty.memberIds)) {
      if (HARD_TO_ABANDON.includes(treaty.kind)) {
        treaty.status = "suspended";
        treaty.metadata = {
          ...treaty.metadata,
          suspendedReason: "war_between_members",
          suspendedDate: date,
        };
        events.push(
          pushHistory(state, {
            date,
            type: "TREATY_SUSPENDED",
            importance: 0.75,
            visibility: "public",
            actorIds: treaty.memberIds,
            entityIds: [treaty.id],
            payload: { treatyId: treaty.id, reason: "war_between_members" },
            sourceScheduledEventId: null,
            sourceCommandId: commandId,
          }),
        );
      } else {
        events.push(terminateTreaty(state, treaty, date, "war_between_parties", commandId));
      }
      continue;
    }

    if (treaty.kind === "trade" && treaty.memberIds.length === 2) {
      const [a, b] = treaty.memberIds;
      if (a && b && bilateralBreakdown(state, a, b)) {
        if (treaty.signedDate && addMonths(treaty.signedDate, 36) < date) {
          events.push(terminateTreaty(state, treaty, date, "diplomatic_breakdown", commandId));
        }
      }
    }

    if (treaty.kind === "non_aggression" && treaty.memberIds.length === 2) {
      const [a, b] = treaty.memberIds;
      if (a && b && bilateralBreakdown(state, a, b)) {
        events.push(terminateTreaty(state, treaty, date, "serious_breach", commandId));
      }
    }

    if (
      (treaty.kind === "mutual_defense" ||
        treaty.kind === "collective_security" ||
        treaty.kind === "sanctions_coordination") &&
      treaty.memberIds.length >= 2
    ) {
      // Hard alliances: only after prolonged collapse + long tenure, not monthly churn.
      let collapsePairs = 0;
      for (let i = 0; i < treaty.memberIds.length; i += 1) {
        for (let j = i + 1; j < treaty.memberIds.length; j += 1) {
          if (bilateralBreakdown(state, treaty.memberIds[i]!, treaty.memberIds[j]!)) {
            collapsePairs += 1;
          }
        }
      }
      const aged =
        treaty.signedDate != null &&
        addMonths(treaty.signedDate, treaty.kind === "collective_security" ? 120 : 72) < date;
      if (aged && collapsePairs > 0) {
        events.push(
          terminateTreaty(state, treaty, date, "formal_withdrawal_after_breakdown", commandId),
        );
      }
    }
  }

  for (const treaty of Object.values(state.foreignAffairsRuntime.treaties)) {
    if (treaty.status !== "suspended") continue;
    if (!membersAtWar(state, treaty.memberIds)) {
      treaty.status = "active";
      delete treaty.metadata.suspendedReason;
      delete treaty.metadata.suspendedDate;
    }
  }

  return events;
}
