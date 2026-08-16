import type { KernelWorld, SimState } from "../types.js";
import { activeEndorsementsForContest } from "../parties/endorsements.js";
import { resolveProvincialOrganization } from "../parties/organizations.js";
import { assemblyCaucus } from "../parties/queries.js";
import { contestSelectorMethod } from "../parties/selectorates.js";
import type { CampaignState } from "./types.js";

export type QualificationNeed = "member" | "provincial" | "caucus" | "orgs";

function distinctPmProvinces(
  world: KernelWorld,
  state: SimState,
  contestId: string,
  partyId: string,
  politicianId: string,
): number {
  const provinces = new Set<string>();
  for (const e of activeEndorsementsForContest(state, contestId)) {
    if (e.targetId !== politicianId || e.endorserType !== "provincial_organization") continue;
    const org = resolveProvincialOrganization(world, e.endorserId);
    if (!org || org.status !== "active" || org.partyId !== partyId) continue;
    if (!world.provinceIds.includes(org.provinceId)) continue;
    provinces.add(org.provinceId);
  }
  return provinces.size;
}

/** Remaining canonical qualification gap for a live nomination campaign, or null. */
export function nominationQualificationNeed(
  world: KernelWorld,
  state: SimState,
  campaign: CampaignState,
): QualificationNeed | null {
  if (campaign.type !== "presidential_nomination" || !campaign.contestId) return null;
  const contest = state.partyContests[campaign.contestId];
  if (!contest || contest.type !== "presidential_nomination") return null;
  if (contest.status === "resolved" || contest.status === "cancelled") return null;
  const entry = contest.entries[campaign.politicianId];
  if (!entry || entry.status === "withdrawn" || entry.status === "eliminated") return null;
  const method = contestSelectorMethod(contest, world);
  const rule = world.nominationRules[contest.ruleId];
  if (method === "weighted_ranked_choice") {
    if (!rule?.memberNominationsRequired) return null;
    return entry.qualificationEvidence.memberNominationRequirementSatisfied ? null : "member";
  }
  if (method === "transferable_convention") {
    if (!rule?.memberNominationThresholdRequired) return null;
    return entry.qualificationEvidence.memberNominationRequirementSatisfied ? null : "member";
  }
  if (method === "weighted_provincial_delegates") {
    if (!rule?.provincialNominationSupportRequired) return null;
    return entry.qualificationEvidence.provincialSupportRequirementSatisfied ? null : "provincial";
  }
  if (method === "closed_member_rcv") {
    const frac = rule?.assemblyCaucusEndorsementFraction ?? 0.15;
    const caucus = assemblyCaucus(world, state, contest.partyId);
    const needed = Math.ceil(frac * caucus.length);
    if (needed <= 0) return null;
    const got = activeEndorsementsForContest(state, contest.id).filter(
      (e) =>
        e.targetId === campaign.politicianId &&
        e.endorserType === "politician" &&
        e.status === "active" &&
        caucus.includes(e.endorserId),
    ).length;
    return got >= needed ? null : "caucus";
  }
  if (method === "direct_member_rcv") {
    const min = rule?.provincialOrganizationEndorsementsMin ?? 4;
    if (min <= 0) return null;
    const got = distinctPmProvinces(
      world,
      state,
      contest.id,
      contest.partyId,
      campaign.politicianId,
    );
    return got >= min ? null : "orgs";
  }
  return null;
}
