import type { SimState } from "../types.js";
import { monthStart } from "../campaigns/effects.js";
import type { IsoDate } from "../calendar.js";
import { TERENA_WORLD_ID } from "./types.js";
import { treatyIdentityKey } from "./treaty-identity.js";
import { getBilateralRelation } from "./state.js";
import { applyTradeToRelation } from "./trade.js";

export function applyActiveTreatyEffects(state: SimState, date: string): void {
  const month = monthStart(date as IsoDate);
  if (state.foreignAffairsRuntime.treatyEffectsAppliedMonth !== month) {
    state.foreignAffairsRuntime.treatyEffectsAppliedMonth = month;
    state.foreignAffairsRuntime.treatyEffectsAppliedKeys = {};
  }
  const applied = state.foreignAffairsRuntime.treatyEffectsAppliedKeys;
  for (const treaty of Object.values(state.foreignAffairsRuntime.treaties).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (treaty.status !== "active") continue;
    const identity = treatyIdentityKey(treaty.kind, treaty.memberIds);
    if (applied[identity]) continue;
    applied[identity] = true;

    if (treaty.kind === "trade" && treaty.memberIds.length >= 2) {
      for (let i = 0; i < treaty.memberIds.length; i += 1) {
        for (let j = i + 1; j < treaty.memberIds.length; j += 1) {
          applyTradeToRelation(state.foreignAffairsRuntime, treaty.memberIds[i]!, treaty.memberIds[j]!, 0.002);
          const rel = getBilateralRelation(
            state.foreignAffairsRuntime,
            treaty.memberIds[i]!,
            treaty.memberIds[j]!,
          );
          if (rel) rel.lastUpdated = date as import("../calendar.js").IsoDate;
        }
      }
    }
    if (treaty.kind === "non_aggression" && treaty.memberIds.length >= 2) {
      for (let i = 0; i < treaty.memberIds.length; i += 1) {
        for (let j = i + 1; j < treaty.memberIds.length; j += 1) {
          const rel = getBilateralRelation(
            state.foreignAffairsRuntime,
            treaty.memberIds[i]!,
            treaty.memberIds[j]!,
          );
          if (rel) {
            rel.securityTension = Math.max(0, rel.securityTension - 0.004);
            rel.lastUpdated = date as import("../calendar.js").IsoDate;
          }
        }
      }
    }
  }
}

export function deterrenceModifier(
  runtime: SimState["foreignAffairsRuntime"],
  aId: string,
  bId: string,
): number {
  let modifier = 0;
  for (const treaty of Object.values(runtime.treaties)) {
    if (treaty.status !== "active") continue;
    if (treaty.kind !== "mutual_defense" && treaty.kind !== "collective_security") continue;
    const members = new Set(treaty.memberIds);
    if (members.has(aId) && members.has(bId)) {
      modifier += treaty.kind === "collective_security" ? 0.15 : 0.1;
    } else if (members.has(aId) || members.has(bId)) {
      const ally = members.has(aId) ? aId : bId;
      const other = ally === aId ? bId : aId;
      const allyAllies = treaty.memberIds.filter((m) => m !== other);
      if (allyAllies.some((m) => members.has(m))) modifier += 0.05;
    }
  }
  return Math.min(0.25, modifier);
}

export function terenaTreatyRequiresAssembly(kind: string): boolean {
  return kind !== "trade";
}

export function isTerenaTreatyMember(memberIds: string[]): boolean {
  return memberIds.includes(TERENA_WORLD_ID);
}
