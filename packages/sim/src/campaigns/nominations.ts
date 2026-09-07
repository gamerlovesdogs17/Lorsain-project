/**
 * Light nomination-method helper for Campaigns/Elections 2.0.
 *
 * Presidential nominations already run through PartyContest + NominationRuleDefinition.
 * Gubernatorial and Assembly campaigns are general candidacies (no separate primary
 * engine here). This module documents each party's nomination method from content
 * rules and attaches `metadata.nominationMethod` so HQ/UI can display it without
 * inventing filing calendars or rewriting election engines.
 */
import type { KernelWorld, SimState } from "../types.js";
import { isNominationMethod, type NominationMethod } from "../parties/types.js";
import type { CampaignState, CampaignType } from "./types.js";

/** Human-readable labels for party nomination methods (documentary; not math). */
export const NOMINATION_METHOD_LABELS: Record<NominationMethod, string> = {
  weighted_ranked_choice: "Weighted member / union ranked ballot",
  closed_member_rcv: "Closed member ranked-choice ballot",
  registered_supporter_rcv: "Registered-supporter ranked-choice ballot",
  transferable_convention: "Transferable convention ballot",
  weighted_provincial_delegates: "Weighted provincial delegate ballot",
  direct_member_rcv: "Direct member ranked-choice ballot",
  member_rcv: "Member ranked-choice ballot",
  caucus_rcv: "Caucus ranked-choice ballot",
  none: "No party nomination process",
};

export function nominationMethodLabel(method: NominationMethod | null | undefined): string {
  if (!method) return "Nomination method not recorded";
  return NOMINATION_METHOD_LABELS[method] ?? method.replaceAll("_", " ");
}

/** Resolve the party's content nomination rule method, if any. */
export function partyNominationMethod(
  world: KernelWorld,
  partyId: string | null | undefined,
  state?: Pick<SimState, "dynamicParties"> | null,
): NominationMethod | null {
  if (!partyId) return null;
  const def = world.partyDefinitions[partyId] ?? null;
  const dyn = state?.dynamicParties?.[partyId] ?? null;
  const ruleId = def?.nominationRuleId ?? dyn?.nominationRuleId ?? null;
  if (!ruleId) return null;
  const rule = world.nominationRules[ruleId];
  if (!rule || !isNominationMethod(rule.method)) return null;
  return rule.method;
}

/**
 * Prefer contest rule (presidential nomination), then campaign metadata, then
 * the politician's party nomination rule.
 */
export function nominationMethodForCampaign(
  world: KernelWorld,
  state: SimState,
  campaign: CampaignState,
): NominationMethod | null {
  if (campaign.contestId) {
    const contest = state.partyContests[campaign.contestId];
    if (contest?.ruleId) {
      const rule = world.nominationRules[contest.ruleId];
      if (rule && isNominationMethod(rule.method)) return rule.method;
    }
  }
  const raw = campaign.metadata.nominationMethod;
  if (typeof raw === "string" && isNominationMethod(raw)) return raw;
  const partyId = state.politicians[campaign.politicianId]?.partyId ?? null;
  return partyNominationMethod(world, partyId, state);
}

/**
 * Attach documentary nominationMethod metadata when missing.
 * Safe for gubernatorial / assembly / presidential campaigns; no engine rewrite.
 */
export function attachNominationMethodMetadata(
  world: KernelWorld,
  state: SimState,
  campaign: CampaignState,
): NominationMethod | null {
  const existing = campaign.metadata.nominationMethod;
  if (typeof existing === "string" && isNominationMethod(existing)) return existing;
  const method = nominationMethodForCampaign(world, state, campaign);
  if (!method) return null;
  campaign.metadata.nominationMethod = method;
  return method;
}

/** Campaign types that should carry nominationMethod metadata when known. */
export function campaignUsesNominationMetadata(type: CampaignType): boolean {
  return (
    type === "presidential_nomination" ||
    type === "gubernatorial" ||
    type === "assembly" ||
    type === "provincial_assembly" ||
    type === "presidential_general"
  );
}
