import { buildDecisionActorContext } from "../agents/context.js";
import { chooseDecision, emptySignals, type DecisionOption } from "../agents/decisions.js";
import { goalsOwnedBy } from "../agents/goals.js";
import { getAgentProfile } from "../agents/profile.js";
import type { KernelWorld, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { pollAverage } from "../elections/polls.js";
import { WITHDRAW } from "./policy.js";
import { campaignMonthsRemaining, contestPollShare, constituenciesInProvince } from "./actions.js";
import { ownSkill, ownTrait, standingPublicScore } from "./effects.js";
import { nominationQualificationNeed } from "./qualification.js";
import {
  presidentialInterestScore,
  presidentialNominationCycleMetadata,
} from "../parties/state.js";
import { activeRaceCampaigns } from "./race.js";
import type { CampaignState } from "./types.js";

function goalImpacts(state: SimState, actorId: string, career: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of goalsOwnedBy(state, actorId).filter((x) => x.status === "active")) {
    if (
      g.type === "seek_office" ||
      g.type === "career_advancement" ||
      g.type === "increase_influence"
    )
      out[g.id] = career;
    else if (g.type === "advance_party" || g.type === "advance_faction") out[g.id] = career * 0.4;
  }
  return out;
}

export function campaignDecisionOptions(
  world: KernelWorld,
  state: SimState,
  campaign: CampaignState,
): DecisionOption[] {
  const id = campaign.politicianId;
  const home = world.politicianHomeProvince[id] ?? null;
  const homeConst = home
    ? constituenciesInProvince(world, home)
        .slice()
        .sort((a, b) => {
          const ae = world.constituencyElectorate[a]!;
          const be = world.constituencyElectorate[b]!;
          const as = ae.provincePopulationShares.find((row) => row.provinceId === home)?.share ?? 0;
          const bs = be.provincePopulationShares.find((row) => row.provinceId === home)?.share ?? 0;
          return be.population * bs - ae.population * as || a.localeCompare(b);
        })[0]
    : Object.entries(world.constituencyElectorate)
        .sort(([, a], [, b]) => b.population - a.population)[0]?.[0];
  const rivals = activeRaceCampaigns(state, campaign);
  const leader = rivals.slice().sort((a, b) => {
    const sa = standingPublicScore(world, state, b.politicianId);
    const sb = standingPublicScore(world, state, a.politicianId);
    if (sa !== sb) return sa - sb;
    return a.politicianId < b.politicianId ? -1 : 1;
  })[0]?.politicianId;
  const issueSalience = getAgentProfile(world, state, id)?.issueSalience ?? {};
  const issueId = world.issueIds
    .slice()
    .sort((a, b) => (issueSalience[b] ?? 0) - (issueSalience[a] ?? 0) || a.localeCompare(b))[0] ?? null;
  const opts: DecisionOption[] = [
    {
      optionId: "FUNDRAISE",
      actionType: "CAMPAIGN_FUNDRAISE",
      targetIds: [],
      uncertainty: 0.15,
      signals: emptySignals({
        careerBenefit: 0.35,
        pragmaticEffectiveness: campaign.cashOnHand < 20_000 ? 0.7 : 0.25,
        risk: 0.08,
      }),
      goalImpacts: goalImpacts(state, id, 0.25),
      metadata: { campaignId: campaign.id },
    },
    {
      optionId: "VISIT_HOME",
      actionType: "CAMPAIGN_VISIT",
      targetIds: [],
      uncertainty: 0.2,
      signals: emptySignals({
        careerBenefit: 0.3,
        partyAlignment: 0.2,
        pragmaticEffectiveness: 0.35,
        risk: 0.1,
      }),
      goalImpacts: goalImpacts(state, id, 0.3),
      metadata: {
        campaignId: campaign.id,
        geography: home
          ? { kind: "province", id: home }
          : { kind: "constituency", id: homeConst ?? null },
      },
    },
    {
      optionId: "ORGANIZE",
      actionType: "CAMPAIGN_ORGANIZE",
      targetIds: [],
      uncertainty: 0.18,
      signals: emptySignals({ careerBenefit: 0.22, pragmaticEffectiveness: 0.4, risk: 0.08 }),
      goalImpacts: goalImpacts(state, id, 0.2),
      metadata: {
        campaignId: campaign.id,
        geography: home
          ? { kind: "province", id: home }
          : { kind: "constituency", id: homeConst ?? null },
      },
    },
    {
      optionId: "AD_POSITIVE",
      actionType: "CAMPAIGN_ADVERTISE",
      targetIds: [],
      uncertainty: 0.22,
      signals: emptySignals({
        careerBenefit: 0.28,
        pragmaticEffectiveness: campaign.cashOnHand > 8_000 ? 0.45 : -0.2,
        risk: 0.12,
      }),
      goalImpacts: goalImpacts(state, id, 0.28),
      metadata: {
        campaignId: campaign.id,
        spend: Math.min(campaign.cashOnHand, 25_000),
        messageType: "positive",
        geography: { kind: "national", id: null },
      },
    },
    {
      optionId: "MESSAGE",
      actionType: "CAMPAIGN_MESSAGE",
      targetIds: [],
      uncertainty: 0.16,
      signals: emptySignals({ careerBenefit: 0.2, institutionalAlignment: 0.15, risk: 0.08 }),
      goalImpacts: goalImpacts(state, id, 0.18),
      metadata: { campaignId: campaign.id, issueId },
    },
    {
      optionId: "PREPARE_DEBATE",
      actionType: "CAMPAIGN_PREPARE_DEBATE",
      targetIds: [],
      uncertainty: 0.12,
      signals: emptySignals({ careerBenefit: 0.18, pragmaticEffectiveness: 0.3, risk: 0.05 }),
      goalImpacts: goalImpacts(state, id, 0.15),
      metadata: { campaignId: campaign.id },
    },
  ];
  const monthsRemaining = campaignMonthsRemaining(state, campaign);
  const campaignProvince = typeof campaign.metadata.provinceId === "string" ? campaign.metadata.provinceId : null;
  const gotvGeography = campaign.type === "assembly" && campaign.constituencyId
    ? { kind: "constituency" as const, id: campaign.constituencyId }
    : { kind: "province" as const, id: campaignProvince ?? home };
  const gotvOrganization = gotvGeography.kind === "constituency" && gotvGeography.id
    ? campaign.organizationByConstituency[gotvGeography.id] ?? 0
    : gotvGeography.id
      ? campaign.organizationByProvince[gotvGeography.id] ?? 0
      : 0;
  if (monthsRemaining != null && monthsRemaining >= 0 && monthsRemaining <= 1 && gotvGeography.id && gotvOrganization >= 0.12) {
    opts.push({
      optionId: `GOTV:${gotvGeography.kind}:${gotvGeography.id}`,
      actionType: "CAMPAIGN_GOTV",
      targetIds: [],
      uncertainty: 0.1,
      signals: emptySignals({
        careerBenefit: 0.42,
        pragmaticEffectiveness: 0.75 + gotvOrganization * 0.2,
        risk: 0.05,
      }),
      goalImpacts: goalImpacts(state, id, 0.35),
      metadata: { campaignId: campaign.id, geography: gotvGeography },
    });
  }
  if (leader) {
    opts.push({
      optionId: `ATTACK:${leader}`,
      actionType: "CAMPAIGN_ATTACK",
      targetIds: [leader],
      uncertainty: 0.35,
      signals: emptySignals({
        careerBenefit: 0.25,
        risk: 0.45,
        integrityAlignment: -0.15,
        pragmaticEffectiveness: 0.2,
      }),
      goalImpacts: goalImpacts(state, id, 0.22),
      metadata: { campaignId: campaign.id, targetPoliticianId: leader },
    });
    opts.push({
      optionId: `AD_CONTRAST:${leader}`,
      actionType: "CAMPAIGN_ADVERTISE",
      targetIds: [leader],
      uncertainty: 0.28,
      signals: emptySignals({
        careerBenefit: 0.26,
        pragmaticEffectiveness: campaign.cashOnHand > 8_000 ? 0.4 : -0.2,
        risk: 0.22,
      }),
      goalImpacts: goalImpacts(state, id, 0.24),
      metadata: {
        campaignId: campaign.id,
        spend: Math.min(campaign.cashOnHand, 25_000),
        messageType: "contrast",
        geography: { kind: "national", id: null },
        targetPoliticianId: leader,
      },
    });
  }
  const need = nominationQualificationNeed(world, state, campaign);
  if (need === "member" || need === "provincial") {
    opts.push({
      optionId: "SEEK_NOMINATION_SUPPORT",
      actionType: "CAMPAIGN_SEEK_NOMINATION_SUPPORT",
      targetIds: [],
      uncertainty: 0.22,
      signals: emptySignals({
        careerBenefit: 0.55,
        partyAlignment: 0.4,
        pragmaticEffectiveness: 0.85,
        risk: 0.08,
      }),
      goalImpacts: goalImpacts(state, id, 0.45),
      metadata: { campaignId: campaign.id },
    });
  }
  if (campaign.contestId && (need === "caucus" || need === "orgs")) {
    opts.push({
      optionId: "SEEK_ENDORSEMENT",
      actionType: "CAMPAIGN_SEEK_ENDORSEMENT",
      targetIds: [],
      uncertainty: 0.22,
      signals: emptySignals({
        partyAlignment: 0.55,
        factionAlignment: 0.3,
        careerBenefit: 0.6,
        pragmaticEffectiveness: 0.88,
        risk: 0.12,
      }),
      goalImpacts: goalImpacts(state, id, 0.5),
      metadata: { campaignId: campaign.id },
    });
  }
  opts.push({
    optionId: "WITHDRAW",
    actionType: "WITHDRAW_CAMPAIGN",
    targetIds: [],
    uncertainty: 0.2,
    signals: emptySignals({
      careerBenefit: -0.35,
      pragmaticEffectiveness: 0.15,
      risk: 0.2,
      statusBenefit: -0.4,
    }),
    goalImpacts: goalImpacts(state, id, -0.4),
    metadata: { campaignId: campaign.id },
  });
  return opts.map((o) => {
    const cashNeed = campaign.cashOnHand < 12_000 ? 0.25 : 0;
    if (o.optionId === "FUNDRAISE") {
      return {
        ...o,
        signals: {
          ...o.signals,
          pragmaticEffectiveness: Math.min(1, o.signals.pragmaticEffectiveness + cashNeed),
        },
      };
    }
    return o;
  });
}

export function chooseCampaignAction(
  world: KernelWorld,
  state: SimState,
  campaign: CampaignState,
  rng: RngService,
): DecisionOption | null {
  if (campaign.politicianId === state.playerPoliticianId) return null;
  const options = campaignDecisionOptions(world, state, campaign);
  const profile = getAgentProfile(world, state, campaign.politicianId);
  if (!profile) return null;
  const risk = ownTrait(world, state, campaign.politicianId, "riskTolerance");
  const ambition = ownTrait(world, state, campaign.politicianId, "ambition");
  const pragmatism = ownTrait(world, state, campaign.politicianId, "pragmatism");
  const fundraisingSkill = ownSkill(world, state, campaign.politicianId, "fundraising");
  const campaigningSkill = ownSkill(world, state, campaign.politicianId, "campaigning");
  const mediaSkill = ownSkill(world, state, campaign.politicianId, "media");
  const tuned = options.map((o) => {
    let career = o.signals.careerBenefit;
    let prag = o.signals.pragmaticEffectiveness;
    let r = o.signals.risk;
    if (o.actionType === "CAMPAIGN_FUNDRAISE") prag += fundraisingSkill * 0.2;
    if (o.actionType === "CAMPAIGN_VISIT" || o.actionType === "CAMPAIGN_ORGANIZE") {
      prag += campaigningSkill * 0.2;
    }
    if (
      o.actionType === "CAMPAIGN_ADVERTISE" ||
      o.actionType === "CAMPAIGN_MESSAGE" ||
      o.actionType === "CAMPAIGN_PREPARE_DEBATE"
    ) {
      prag += mediaSkill * 0.2;
    }
    if (o.actionType === "CAMPAIGN_ATTACK") r = Math.min(1, r + (1 - risk) * 0.2);
    if (
      o.actionType === "CAMPAIGN_SEEK_NOMINATION_SUPPORT" ||
      o.actionType === "CAMPAIGN_SEEK_ENDORSEMENT"
    ) {
      prag += campaigningSkill * 0.15;
    }
    if (o.actionType === "WITHDRAW_CAMPAIGN") {
      career -= ambition * 0.4;
      prag += pragmatism * 0.15;
    }
    return {
      ...o,
      signals: {
        ...o.signals,
        careerBenefit: Math.max(-1, Math.min(1, career)),
        pragmaticEffectiveness: Math.max(-1, Math.min(1, prag)),
        risk: Math.max(0, Math.min(1, r)),
      },
    };
  });
  return tuned
    .map((option) => ({
      option,
      score:
        option.signals.careerBenefit * (0.35 + ambition * 0.35) +
        option.signals.pragmaticEffectiveness * (0.3 + pragmatism * 0.35) +
        option.signals.partyAlignment * profile.traits.partyLoyalty * 0.25 +
        option.signals.factionAlignment * profile.traits.factionLoyalty * 0.18 +
        option.signals.institutionalAlignment * profile.traits.institutionalism * 0.18 +
        option.signals.statusBenefit * profile.traits.ego * 0.16 -
        option.signals.risk * (1 - risk) * 0.32 +
        (rng.float01("npc-decisions") - 0.5) * option.uncertainty * 0.3,
    }))
    .sort((a, b) => b.score - a.score || a.option.optionId.localeCompare(b.option.optionId))[0]?.option ?? null;
}

export function chooseDeclare(
  world: KernelWorld,
  state: SimState,
  politicianId: string,
  contestId: string,
  rng: RngService,
): boolean {
  if (politicianId === state.playerPoliticianId) return false;
  const profile = buildDecisionActorContext(world, state, politicianId, []);
  const contest = state.partyContests[contestId];
  const cycle = contest ? presidentialNominationCycleMetadata(contest) : null;
  const status = profile.profile.presidentialStatus;
  const ambition = profile.profile.traits.ambition;
  const runtimeInterest = cycle
    ? presidentialInterestScore(state, world, politicianId, cycle.electionDate)
    : 0;
  const prior =
    cycle?.candidateSource === "runtime_politics"
      ? Math.max(0.2, Math.min(0.9, 0.2 + runtimeInterest))
      : status === "frontrunner"
        ? 0.85
        : status === "likely"
          ? 0.7
          : status === "possible"
            ? 0.45
            : 0.22;
  if (
    cycle?.candidateSource === "runtime_politics" &&
    contest?.entries[politicianId]?.status === "exploring" &&
    runtimeInterest >= 0.48
  ) {
    return true;
  }
  const options: DecisionOption[] = [
    {
      optionId: "DECLARE",
      actionType: "DECLARE_CAMPAIGN",
      targetIds: [],
      uncertainty: 0.2,
      signals: emptySignals({
        careerBenefit: 0.4 + ambition * 0.3,
        statusBenefit: prior,
        pragmaticEffectiveness: prior,
        risk: 0.25,
      }),
      goalImpacts: goalImpacts(state, politicianId, 0.5),
      metadata: { contestId },
    },
    {
      optionId: "WAIT",
      actionType: "WAIT",
      targetIds: [],
      uncertainty: 0.1,
      signals: emptySignals({
        careerBenefit: 0.05,
        pragmaticEffectiveness: 0.2,
        risk: 0.05,
        institutionalAlignment: 0.1,
      }),
      goalImpacts: {},
      metadata: { contestId },
    },
  ];
  const chosen = chooseDecision(options, profile, rng).chosen;
  return chosen?.optionId === "DECLARE";
}

export function shouldConsiderWithdraw(
  world: KernelWorld,
  state: SimState,
  campaign: CampaignState,
): boolean {
  const ego = ownTrait(world, state, campaign.politicianId, "ego");
  const ambition = ownTrait(world, state, campaign.politicianId, "ambition");
  const poll = campaign.electionId
    ? (pollAverage(state, state.currentDate, { electionId: campaign.electionId })[
        campaign.politicianId
      ] ?? 0)
    : contestPollShare(state, campaign.contestId, campaign.politicianId);
  const standing = standingPublicScore(world, state, campaign.politicianId);
  if (campaign.cashOnHand < WITHDRAW.cashFloor && standing < 0.25 && poll < WITHDRAW.pollHopeless) {
    return ego < 0.7 && ambition < 0.85;
  }
  if (poll > 0 && poll < WITHDRAW.pollHopeless && standing < 0.22) return ego < 0.55;
  return false;
}
