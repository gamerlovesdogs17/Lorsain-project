import { getAgentProfile } from "../agents/profile.js";
import type { KernelWorld, SimState } from "../types.js";
import { billPolicyFit, factionStance, partyStance } from "./recommendations.js";
import { currentAssemblyMemberIds } from "./state.js";
import { WHIP_STRENGTH_PRESSURE, type WhipStrength } from "./types.js";
import { whipPersuasionBonusFor } from "./caucus.js";

export type WhipEstimate = {
  billId: string;
  likelyYes: number;
  likelyNo: number;
  uncertain: number;
  yesRange: [number, number];
  noRange: [number, number];
};

/** Imperfect public whip estimate. Never the exact future NPC ballot. */
export function whipEstimate(
  world: KernelWorld,
  state: SimState,
  billId: string,
): WhipEstimate | null {
  const bill = state.legislatureRuntime.bills[billId];
  if (!bill) return null;
  const mps = currentAssemblyMemberIds(world, state);
  let likelyYes = 0;
  let likelyNo = 0;
  let uncertain = 0;
  for (const id of mps) {
    if (id === state.playerPoliticianId) {
      uncertain += 1;
      continue;
    }
    const pol = state.politicians[id];
    const fit = billPolicyFit(world, state, id, bill);
    const party = partyStance(state, pol?.partyId ?? null, bill.id);
    const faction = factionStance(state, pol?.factionId ?? null, bill.id);
    const profile = getAgentProfile(world, state, id);
    const loyalty = profile?.traits.partyLoyalty ?? 0.5;
    const whipRaw = pol?.partyId
      ? state.legislatureRuntime.caucusLeadership[pol.partyId]?.whipStrengths?.[bill.id]
      : undefined;
    const whipStrength: WhipStrength =
      whipRaw === "recommended" ||
      whipRaw === "party_line" ||
      whipRaw === "critical" ||
      whipRaw === "free"
        ? whipRaw
        : "free";
    const whipPressure = WHIP_STRENGTH_PRESSURE[whipStrength];
    const partyPush = party === "support" ? 1 : party === "oppose" ? -1 : 0;
    const factionPush = faction === "support" ? 1 : faction === "oppose" ? -1 : 0;
    const floorPush = partyPush !== 0 ? partyPush : factionPush;
    let score = fit;
    if (party === "support") score += 0.25 * loyalty;
    if (party === "oppose") score -= 0.25 * loyalty;
    if (faction === "support") score += 0.12;
    if (faction === "oppose") score -= 0.12;
    score += floorPush * whipPressure * 0.35;
    score += floorPush * whipPersuasionBonusFor(state, bill.id, id) * 0.5;
    if (score > 0.18) likelyYes += 1;
    else if (score < -0.18) likelyNo += 1;
    else uncertain += 1;
  }
  return {
    billId,
    likelyYes,
    likelyNo,
    uncertain,
    yesRange: [Math.max(0, likelyYes - 8), likelyYes + uncertain],
    noRange: [Math.max(0, likelyNo - 8), likelyNo + uncertain],
  };
}
