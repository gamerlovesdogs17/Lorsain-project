import { countIrv, type BallotGroupInput, type IrvResult } from "@lorsain/election-math";
import type { CommandError, KernelWorld, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { activeEndorsementsForContest } from "./endorsements.js";
import { politicianEligibleForContest } from "./lifecycle.js";
import { resolveProvincialOrganization } from "./organizations.js";
import { assemblyCaucus } from "./queries.js";
import {
  contestSelectorMethod,
  rankCandidatesForGroup,
  selectorateForRule,
} from "./selectorates.js";
import type { ContestCountInput, PartyContest, SelectorGroup } from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function electionsRng(rng: RngService): { nextUint32(): number } {
  return { nextUint32: () => rng.uint32("elections") };
}

function distinctPmProvincialOrgs(
  world: KernelWorld,
  state: SimState,
  contest: PartyContest,
  targetId: string,
): Set<string> {
  const orgs = new Set<string>();
  const provinces = new Set<string>();
  for (const e of activeEndorsementsForContest(state, contest.id)) {
    if (e.targetId !== targetId || e.endorserType !== "provincial_organization") continue;
    const org = resolveProvincialOrganization(world, e.endorserId);
    if (!org || org.status !== "active" || org.partyId !== contest.partyId) continue;
    if (!world.provinceIds.includes(org.provinceId)) continue;
    if (provinces.has(org.provinceId)) continue;
    provinces.add(org.provinceId);
    orgs.add(org.id);
  }
  return orgs;
}

export function applyQualification(
  world: KernelWorld,
  state: SimState,
  contest: PartyContest,
): CommandError | null {
  const rule = world.nominationRules[contest.ruleId];
  const method = contestSelectorMethod(contest, world);
  for (const entry of Object.values(contest.entries)) {
    if (entry.status === "withdrawn" || entry.status === "eliminated" || entry.status === "winner")
      continue;
    if (entry.status === "potential" || entry.status === "exploring") continue;
    const ineligible = politicianEligibleForContest(world, state, contest, entry.politicianId);
    if (ineligible) {
      entry.status = "withdrawn";
      continue;
    }
    let qualified = entry.status === "declared" || entry.status === "qualified";
    if (contest.type !== "presidential_nomination") {
      if (qualified) entry.status = "qualified";
      continue;
    }
    if (method === "closed_member_rcv") {
      const frac = rule?.assemblyCaucusEndorsementFraction ?? 0.15;
      const caucus = assemblyCaucus(world, state, contest.partyId);
      if (caucus.length === 0) return reject("INVALID_CONTEST", "empty assembly caucus");
      const needed = Math.ceil(frac * caucus.length);
      const got = activeEndorsementsForContest(state, contest.id).filter(
        (e) =>
          e.targetId === entry.politicianId &&
          e.endorserType === "politician" &&
          e.status === "active" &&
          caucus.includes(e.endorserId),
      ).length;
      qualified = got >= needed;
    } else if (method === "direct_member_rcv") {
      const min = rule?.provincialOrganizationEndorsementsMin ?? 4;
      qualified = distinctPmProvincialOrgs(world, state, contest, entry.politicianId).size >= min;
    } else if (method === "weighted_ranked_choice") {
      qualified =
        qualified &&
        (entry.qualificationEvidence.memberNominationRequirementSatisfied ||
          !rule?.memberNominationsRequired);
    } else if (method === "transferable_convention") {
      qualified =
        qualified &&
        (entry.qualificationEvidence.memberNominationRequirementSatisfied ||
          !rule?.memberNominationThresholdRequired);
    } else if (method === "weighted_provincial_delegates") {
      qualified =
        qualified &&
        (entry.qualificationEvidence.provincialSupportRequirementSatisfied ||
          !rule?.provincialNominationSupportRequired);
    } else if (method === "registered_supporter_rcv") {
      qualified = entry.status === "declared" || entry.status === "qualified";
    }
    if (qualified) entry.status = "qualified";
    else if (entry.status === "qualified") entry.status = "declared";
  }
  return null;
}

export function countableCandidateIds(
  world: KernelWorld,
  state: SimState,
  contest: PartyContest,
): string[] {
  return Object.values(contest.entries)
    .filter((e) => {
      if (e.status !== "qualified") return false;
      return politicianEligibleForContest(world, state, contest, e.politicianId) == null;
    })
    .map((e) => e.politicianId)
    .sort();
}

export function resolveContestCount(
  world: KernelWorld,
  state: SimState,
  contest: PartyContest,
  rng: RngService,
):
  | { archive: IrvResult; countInput: ContestCountInput; selectorSummary: SelectorGroup[] }
  | { error: CommandError } {
  const candidates = countableCandidateIds(world, state, contest);
  if (candidates.length < 1) return { error: reject("INVALID_CONTEST", "no qualified candidates") };
  const groups = selectorateForRule(world, state, contest);
  if (groups.length === 0) {
    return { error: reject("EMPTY_SELECTORATE", "no legitimate selectors") };
  }
  const ballots: BallotGroupInput[] = groups.map((g) => ({
    id: g.id,
    rankings: rankCandidatesForGroup(world, state, contest, g, candidates, rng),
    weight: g.weight,
  }));
  const countInput: ContestCountInput = {
    candidateIds: candidates,
    ballots: ballots.map((b, i) => ({
      id: b.id ?? `ballot:${i}`,
      weight: b.weight,
      rankings: b.rankings,
    })),
  };
  const archive = countIrv({ candidateIds: candidates, ballots }, { rng: electionsRng(rng) });
  return { archive, countInput, selectorSummary: groups };
}
