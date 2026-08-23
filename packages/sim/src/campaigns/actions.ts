import type { CommandError, KernelWorld, SimEvent, SimState } from "../types.js";
import type { JsonObject } from "../json.js";
import type { RngService } from "../rng.js";
import { pushHistory } from "../scheduler.js";
import {
  declareCandidacy,
  setQualificationEvidence,
  withdrawCandidacy,
} from "../parties/contests.js";
import { activeEndorsementsForContest, endorseCandidate } from "../parties/endorsements.js";
import { chooseEndorsement } from "../parties/decisions.js";
import { provincialOrgId, resolveProvincialOrganization } from "../parties/organizations.js";
import { assemblyCaucus } from "../parties/queries.js";
import { contestSelectorMethod } from "../parties/selectorates.js";
import { isDeclaredContestCandidate } from "../parties/lifecycle.js";
import { candidateStandingOrDefault } from "../elections/standing.js";
import { withdrawUnresolvedCandidacy } from "../elections/field.js";
import { withdrawAssemblyCandidacy } from "../elections/assembly-cycle.js";
import { contestPollAverage, pollAverage } from "../elections/polls.js";
import { presidentialNominationCycleMetadata } from "../parties/state.js";
import { AD_SPEND, FIELD, FUNDRAISING, QUALIFICATION, STANDING_DELTA } from "./policy.js";
import { nominationQualificationNeed } from "./qualification.js";
import {
  advertiseTargetError,
  campaignGeographyError,
  campaignMessageTypeError,
  isAliveRaceRival,
  politiciansAreActiveRaceRivals,
} from "./race.js";
import {
  activeCampaignFor,
  addCash,
  createCampaignRecord,
  ensureActionPoints,
  spendActionPoint,
  spendCash,
} from "./state.js";
import {
  applyStandingDelta,
  diminishingScale,
  officeProminence,
  ownSkill,
  pushEffect,
  standingPublicScore,
} from "./effects.js";
import type {
  CampaignGeography,
  CampaignMessageType,
  CampaignState,
  CampaignType,
} from "./types.js";

function reject(code: string, message: string): CommandError {
  return { code, message };
}

function gauss01(rng: RngService): number {
  const u1 = Math.max(1e-12, rng.float01("campaigns"));
  const u2 = rng.float01("campaigns");
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function event(
  state: SimState,
  type: string,
  actorIds: string[],
  entityIds: string[],
  payload: JsonObject,
  commandId: string | null,
  importance = 0.4,
): SimEvent {
  return pushHistory(state, {
    date: state.currentDate,
    type,
    importance,
    visibility: "public",
    actorIds,
    entityIds,
    payload,
    sourceScheduledEventId: null,
    sourceCommandId: commandId,
  });
}

function requireActiveCampaign(
  state: SimState,
  campaignId: string,
): CampaignState | { error: CommandError } {
  const c = state.campaignRuntime.campaigns[campaignId];
  if (!c) return { error: reject("UNKNOWN_CAMPAIGN", campaignId) };
  if (c.status !== "active" && c.status !== "exploring") {
    return { error: reject("CAMPAIGN_INACTIVE", `${campaignId} is ${c.status}`) };
  }
  return c;
}

function requireActor(
  state: SimState,
  campaign: CampaignState,
  actorId: string | undefined,
): CommandError | null {
  if (actorId && actorId !== campaign.politicianId) {
    return reject("WRONG_ACTOR", "only the candidate may execute this campaign action");
  }
  return null;
}

export function declareCampaign(
  state: SimState,
  world: KernelWorld,
  args: {
    politicianId: string;
    type: CampaignType;
    contestId?: string | null;
    electionId?: string | null;
    constituencyId?: string | null;
  },
  commandId: string | null,
): { campaign: CampaignState; events: SimEvent[] } | { error: CommandError } {
  const pol = state.politicians[args.politicianId];
  if (!pol) return { error: reject("UNKNOWN_POLITICIAN", args.politicianId) };
  if (!pol.alive || pol.retired) return { error: reject("INELIGIBLE", args.politicianId) };
  const existing = activeCampaignFor(state, args.politicianId, args.type);
  if (existing) return { error: reject("ALREADY_CAMPAIGNING", existing.id) };

  if (args.type === "presidential_nomination") {
    const contestId = args.contestId;
    if (!contestId || !state.partyContests[contestId]) {
      return { error: reject("INVALID_CONTEST", String(contestId)) };
    }
    const contest = state.partyContests[contestId]!;
    if (contest.type !== "presidential_nomination") {
      return { error: reject("INVALID_CONTEST", "not a presidential nomination") };
    }
    const cycle = presidentialNominationCycleMetadata(contest);
    if (cycle?.candidateSource === "runtime_politics" && contest.status === "planned") {
      return { error: reject("CONTEST_NOT_OPEN", "the nomination contest has not opened") };
    }
    const declared = declareCandidacy(state, world, contestId, args.politicianId, commandId);
    if ("error" in declared) return declared;
    const campaign = createCampaignRecord(state, world, {
      politicianId: args.politicianId,
      type: args.type,
      contestId,
      status: "active",
    });
    const events = [
      ...declared.events,
      event(
        state,
        "CAMPAIGN_LAUNCHED",
        [args.politicianId],
        [campaign.id, contestId],
        { campaignId: campaign.id, type: args.type, contestId },
        commandId,
        0.7,
      ),
    ];
    return { campaign, events };
  }

  if (args.type === "presidential_general") {
    const election = args.electionId
      ? state.elections[args.electionId]
      : Object.values(state.elections)
          .filter(
            (e) =>
              e.type === "presidential" &&
              e.status !== "resolved" &&
              e.status !== "cancelled",
          )
          .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0];
    const electionId = election?.id ?? String(args.electionId ?? "presidential");
    if (!election || election.type !== "presidential") {
      return { error: reject("INVALID_ELECTION", electionId) };
    }
    const cand = election.candidates[args.politicianId];
    if (!cand || cand.withdrawn) {
      return { error: reject("NOT_A_CANDIDATE", args.politicianId) };
    }
    const campaign = createCampaignRecord(state, world, {
      politicianId: args.politicianId,
      type: args.type,
      electionId,
      contestId: cand.sourceContestId,
      status: "active",
    });
    return {
      campaign,
      events: [
        event(
          state,
          "CAMPAIGN_LAUNCHED",
          [args.politicianId],
          [campaign.id, electionId],
          { campaignId: campaign.id, type: args.type, electionId },
          commandId,
          0.7,
        ),
      ],
    };
  }

  if (args.type === "gubernatorial") {
    const election = args.electionId
      ? state.provincialRuntime.elections[args.electionId]
      : Object.values(state.provincialRuntime.elections)
          .filter(
            (candidate) =>
              candidate.candidates[args.politicianId] &&
              candidate.status !== "resolved" &&
              candidate.status !== "assumed",
          )
          .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0];
    if (!election) return { error: reject("INVALID_ELECTION", String(args.electionId ?? "governor")) };
    const candidacy = election.candidates[args.politicianId];
    if (!candidacy || candidacy.withdrawn) {
      return { error: reject("NOT_A_CANDIDATE", args.politicianId) };
    }
    const campaign = createCampaignRecord(state, world, {
      politicianId: args.politicianId,
      type: "gubernatorial",
      electionId: election.id,
      status: "active",
      metadata: { provinceId: election.provinceId },
    });
    return {
      campaign,
      events: [
        event(
          state,
          "CAMPAIGN_LAUNCHED",
          [args.politicianId],
          [campaign.id, election.id, election.provinceId],
          {
            campaignId: campaign.id,
            type: "gubernatorial",
            electionId: election.id,
            provinceId: election.provinceId,
          },
          commandId,
          0.62,
        ),
      ],
    };
  }

  const election = args.electionId
    ? state.elections[args.electionId]
    : Object.values(state.elections)
        .filter(
          (e) =>
            e.type === "assembly" &&
            e.geographyKind === "national" &&
            e.assembly?.candidacies[args.politicianId]?.status === "filed" &&
            e.status !== "resolved" &&
            e.status !== "cancelled",
        )
        .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0];
  if (!election || election.type !== "assembly" || election.geographyKind !== "national") {
    return { error: reject("INVALID_ELECTION", String(args.electionId ?? "assembly")) };
  }
  const candidacy = election.assembly?.candidacies[args.politicianId];
  if (!candidacy || candidacy.status !== "filed") {
    return { error: reject("NOT_A_CANDIDATE", args.politicianId) };
  }
  if (args.constituencyId && args.constituencyId !== candidacy.constituencyId) {
    return { error: reject("INVALID_GEOGRAPHY", args.constituencyId) };
  }
  const campaign = createCampaignRecord(state, world, {
    politicianId: args.politicianId,
    type: "assembly",
    electionId: election.id,
    constituencyId: candidacy.constituencyId,
    status: "active",
  });
  return {
    campaign,
    events: [
      event(
        state,
        "CAMPAIGN_LAUNCHED",
        [args.politicianId],
        [campaign.id, election.id, candidacy.constituencyId],
        {
          campaignId: campaign.id,
          type: "assembly",
          electionId: election.id,
          constituencyId: candidacy.constituencyId,
        },
        commandId,
        0.55,
      ),
    ],
  };
}

export function ensureCampaignForDeclaredCandidacy(
  state: SimState,
  world: KernelWorld,
  contestId: string,
  politicianId: string,
  commandId: string | null,
): SimEvent[] {
  if (activeCampaignFor(state, politicianId, "presidential_nomination")) return [];
  const contest = state.partyContests[contestId];
  if (!contest || contest.type !== "presidential_nomination") return [];
  const campaign = createCampaignRecord(state, world, {
    politicianId,
    type: "presidential_nomination",
    contestId,
    status: "active",
  });
  return [
    event(
      state,
      "CAMPAIGN_LAUNCHED",
      [politicianId],
      [campaign.id, contestId],
      { campaignId: campaign.id, type: "presidential_nomination", contestId },
      commandId,
      0.7,
    ),
  ];
}

function beginAction(
  world: KernelWorld,
  state: SimState,
  campaignId: string,
  actorId: string | undefined,
): CampaignState | { error: CommandError } {
  const campaign = requireActiveCampaign(state, campaignId);
  if ("error" in campaign) return campaign;
  const actorErr = requireActor(state, campaign, actorId);
  if (actorErr) return { error: actorErr };
  ensureActionPoints(world, state, campaign);
  const ap = spendActionPoint(campaign);
  if (ap) return { error: ap };
  return campaign;
}

export function campaignFundraise(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  args: { campaignId: string; actorId?: string },
  commandId: string | null,
): { events: SimEvent[]; raised: number } | { error: CommandError } {
  const campaign = beginAction(world, state, args.campaignId, args.actorId);
  if ("error" in campaign) return campaign;
  const id = campaign.politicianId;
  const standing = candidateStandingOrDefault(world, state, id);
  const skill = ownSkill(world, state, id, "fundraising");
  const pollShare = nominationOrElectionPollShare(state, campaign);
  const endorseBoost = activeEndorsementBoost(state, campaign);
  const scale =
    FUNDRAISING.base *
    (0.55 + ((standing.favorability + 1) / 2) * FUNDRAISING.standingWeight) *
    (0.45 + skill * FUNDRAISING.skillWeight) *
    (0.5 + campaign.fundraisingCapacity * FUNDRAISING.capacityWeight) *
    (0.75 + officeProminence(world, state, id) * FUNDRAISING.officeWeight) *
    (0.85 + pollShare * FUNDRAISING.pollWeight) *
    (1 + endorseBoost * FUNDRAISING.endorsementWeight);
  const noise = 1 + gauss01(rng) * FUNDRAISING.noiseAmp;
  const raised = Math.max(FUNDRAISING.base * 0.15, Math.round(scale * noise));
  addCash(campaign, raised);
  campaign.fundraisingCapacity = Math.min(1, campaign.fundraisingCapacity + 0.04);
  applyStandingDelta(world, state, id, { momentum: STANDING_DELTA.momentumFromAction * 0.4 });
  pushEffect(campaign, {
    date: state.currentDate,
    kind: "fundraise",
    geographyId: null,
    targetId: null,
    magnitude: raised,
  });
  return {
    raised,
    events: [
      event(
        state,
        "FUNDRAISING_PUSH",
        [id],
        [campaign.id],
        { campaignId: campaign.id, raised, cashOnHand: campaign.cashOnHand },
        commandId,
      ),
    ],
  };
}

function nominationOrElectionPollShare(state: SimState, campaign: CampaignState): number {
  if (campaign.electionId) {
    return (
      pollAverage(state, state.currentDate, { electionId: campaign.electionId })[
        campaign.politicianId
      ] ?? 0
    );
  }
  return contestPollShare(state, campaign.contestId, campaign.politicianId);
}

export function contestPollShare(
  state: SimState,
  contestId: string | null,
  politicianId: string,
): number {
  if (!contestId) return 0;
  return contestPollAverage(state, state.currentDate, contestId)[politicianId] ?? 0;
}

function activeEndorsementBoost(state: SimState, campaign: CampaignState): number {
  if (!campaign.contestId) return 0;
  let n = 0;
  for (const e of Object.values(state.endorsements)) {
    if (e.contestId !== campaign.contestId || e.targetId !== campaign.politicianId) continue;
    if (e.status !== "active") continue;
    n += 1;
  }
  return Math.min(1, n * 0.12);
}

export function constituenciesInProvince(world: KernelWorld, provinceId: string): string[] {
  return Object.entries(world.constituencyElectorate)
    .filter(([, el]) => el.provincePopulationShares.some((s) => s.provinceId === provinceId))
    .map(([id]) => id)
    .sort();
}

function resolveVisitTargets(world: KernelWorld, geo: CampaignGeography): string[] {
  if (geo.kind === "constituency" && geo.id && world.constituencyElectorate[geo.id]) {
    return [geo.id];
  }
  if (geo.kind === "province" && geo.id) return constituenciesInProvince(world, geo.id);
  return Object.keys(world.constituencyElectorate).sort();
}

function provincePopulation(world: KernelWorld, provinceId: string): number {
  return Object.values(world.constituencyElectorate).reduce((sum, electorate) => {
    const share =
      electorate.provincePopulationShares.find((row) => row.provinceId === provinceId)?.share ?? 0;
    return sum + electorate.population * share;
  }, 0);
}

function provinceShare(world: KernelWorld, constituencyId: string, provinceId: string): number {
  return (
    world.constituencyElectorate[constituencyId]?.provincePopulationShares.find(
      (row) => row.provinceId === provinceId,
    )?.share ?? 0
  );
}

function addProvinceOrganization(campaign: CampaignState, provinceId: string, gain: number): void {
  const previous = campaign.organizationByProvince[provinceId] ?? 0;
  campaign.organizationByProvince[provinceId] = Math.min(1, previous + gain);
}

function addConstituencyOrganization(
  campaign: CampaignState,
  constituencyId: string,
  gain: number,
): void {
  const previous = campaign.organizationByConstituency[constituencyId] ?? 0;
  campaign.organizationByConstituency[constituencyId] = Math.min(1, previous + gain);
}

export function campaignVisit(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  args: { campaignId: string; geography: CampaignGeography; actorId?: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const existing = requireActiveCampaign(state, args.campaignId);
  if ("error" in existing) return existing;
  const actorErr = requireActor(state, existing, args.actorId);
  if (actorErr) return { error: actorErr };
  const geoErr = campaignGeographyError(world, args.geography);
  if (geoErr) return { error: geoErr };
  const campaign = beginAction(world, state, args.campaignId, args.actorId);
  if ("error" in campaign) return campaign;
  const targets = resolveVisitTargets(world, args.geography);
  if (targets.length === 0) return { error: reject("INVALID_GEOGRAPHY", "no visit targets") };
  const skill = ownSkill(world, state, campaign.politicianId, "campaigning");
  const home = world.politicianHomeProvince[campaign.politicianId];
  const key = `visit:${args.geography.kind}:${args.geography.id ?? "n"}`;
  const dim = diminishingScale(campaign, key, state.currentDate);
  const noise = 1 + gauss01(rng) * 0.06;
  const mag =
    STANDING_DELTA.visit *
    (0.55 + skill * 0.5) *
    (0.7 + campaign.fieldOrganization * 0.4) *
    dim *
    noise;
  applyStandingDelta(world, state, campaign.politicianId, {
    nameRecognition: mag * 0.45,
    enthusiasm: mag * 0.7,
    favorability: mag * 0.35,
    momentum: STANDING_DELTA.momentumFromAction * dim,
  });
  const constituencyPopulations = targets.map(
    (cid) => world.constituencyElectorate[cid]?.population ?? 0,
  );
  const maxPopulation = Math.max(1, ...constituencyPopulations);
  if (args.geography.kind === "national") {
    const provincePops = world.provinceIds.map((provinceId) => provincePopulation(world, provinceId));
    const maxProvincePopulation = Math.max(1, ...provincePops);
    for (const provinceId of world.provinceIds) {
      const reach = Math.sqrt(provincePopulation(world, provinceId) / maxProvincePopulation);
      addProvinceOrganization(campaign, provinceId, FIELD.visitOrgGain * dim * (0.12 + reach * 0.1));
    }
    for (const cid of targets) {
      const reach = Math.sqrt((world.constituencyElectorate[cid]?.population ?? 0) / maxPopulation);
      addConstituencyOrganization(campaign, cid, FIELD.visitOrgGain * dim * (0.035 + reach * 0.035));
    }
  } else if (args.geography.kind === "province" && args.geography.id) {
    const provinceId = args.geography.id;
    const local = home === provinceId ? 1.15 : 1;
    addProvinceOrganization(campaign, provinceId, FIELD.visitOrgGain * dim * 0.8 * local);
    for (const cid of targets) {
      const share = provinceShare(world, cid, provinceId);
      const reach = Math.sqrt((world.constituencyElectorate[cid]?.population ?? 0) / maxPopulation);
      addConstituencyOrganization(
        campaign,
        cid,
        FIELD.visitOrgGain * local * dim * share * (0.4 + reach * 0.35),
      );
    }
  } else {
    for (const cid of targets) {
      addConstituencyOrganization(campaign, cid, FIELD.visitOrgGain * dim);
      for (const row of world.constituencyElectorate[cid]?.provincePopulationShares ?? []) {
        addProvinceOrganization(campaign, row.provinceId, FIELD.visitOrgGain * dim * row.share * 0.25);
      }
    }
  }
  campaign.fieldOrganization = Math.min(1, campaign.fieldOrganization + 0.03 * dim);
  pushEffect(campaign, {
    date: state.currentDate,
    kind: key,
    geographyId: args.geography.id,
    targetId: null,
    magnitude: mag,
  });
  return {
    events: [
      event(
        state,
        "CAMPAIGN_VISIT",
        [campaign.politicianId],
        [campaign.id],
        {
          campaignId: campaign.id,
          geography: args.geography,
          effect: mag,
        },
        commandId,
      ),
    ],
  };
}

export function campaignOrganize(
  world: KernelWorld,
  state: SimState,
  args: {
    campaignId: string;
    constituencyId?: string;
    geography?: CampaignGeography;
    actorId?: string;
  },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const existing = requireActiveCampaign(state, args.campaignId);
  if ("error" in existing) return existing;
  const actorErr = requireActor(state, existing, args.actorId);
  if (actorErr) return { error: actorErr };
  const geography: CampaignGeography = args.geography ?? {
    kind: "constituency",
    id: args.constituencyId ?? null,
  };
  const geoErr = campaignGeographyError(world, geography);
  if (geoErr || geography.kind === "national") {
    return { error: geoErr ?? reject("INVALID_GEOGRAPHY", "organizing requires a province or constituency") };
  }
  const campaign = beginAction(world, state, args.campaignId, args.actorId);
  if ("error" in campaign) return campaign;
  const key = `organize:${geography.kind}:${geography.id}`;
  const dim = diminishingScale(campaign, key, state.currentDate);
  const skill = ownSkill(world, state, campaign.politicianId, "campaigning");
  const gain = FIELD.organizeGain * (0.5 + skill * 0.5) * dim;
  if (geography.kind === "province" && geography.id) {
    addProvinceOrganization(campaign, geography.id, gain);
    const targets = constituenciesInProvince(world, geography.id);
    const maxPopulation = Math.max(
      1,
      ...targets.map((cid) => world.constituencyElectorate[cid]?.population ?? 0),
    );
    for (const cid of targets) {
      const share = provinceShare(world, cid, geography.id);
      const reach = Math.sqrt((world.constituencyElectorate[cid]?.population ?? 0) / maxPopulation);
      addConstituencyOrganization(campaign, cid, gain * share * (0.22 + reach * 0.23));
    }
  } else if (geography.id) {
    addConstituencyOrganization(campaign, geography.id, gain);
    for (const row of world.constituencyElectorate[geography.id]?.provincePopulationShares ?? []) {
      addProvinceOrganization(campaign, row.provinceId, gain * row.share * 0.22);
    }
  }
  campaign.fieldOrganization = Math.min(1, campaign.fieldOrganization + gain * 0.35);
  applyStandingDelta(world, state, campaign.politicianId, {
    enthusiasm: STANDING_DELTA.organize * dim,
  });
  pushEffect(campaign, {
    date: state.currentDate,
    kind: key,
    geographyId: geography.id,
    targetId: null,
    magnitude: gain,
  });
  return {
    events: [
      event(
        state,
        "FIELD_ORGANIZED",
        [campaign.politicianId],
        [campaign.id],
        { campaignId: campaign.id, geography, gain },
        commandId,
        0.3,
      ),
    ],
  };
}

export function campaignAdvertise(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  args: {
    campaignId: string;
    spend: number;
    messageType: CampaignMessageType;
    geography: CampaignGeography;
    targetPoliticianId?: string | null;
    issueId?: string | null;
    actorId?: string;
  },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  if (!Number.isInteger(args.spend) || args.spend < AD_SPEND.min) {
    return { error: reject("INVALID_SPEND", "ad spend must be a positive integer") };
  }
  const existing = requireActiveCampaign(state, args.campaignId);
  if ("error" in existing) return existing;
  const actorErr = requireActor(state, existing, args.actorId);
  if (actorErr) return { error: actorErr };
  const typeErr = campaignMessageTypeError(args.messageType);
  if (typeErr) return { error: typeErr };
  const geoErr = campaignGeographyError(world, args.geography);
  if (geoErr) return { error: geoErr };
  if (args.issueId && world.issueIds.length > 0 && !world.issueIds.includes(args.issueId)) {
    return { error: reject("UNKNOWN_ISSUE", args.issueId) };
  }
  const targetErr = advertiseTargetError(
    state,
    existing,
    args.messageType,
    args.targetPoliticianId,
  );
  if (targetErr) return { error: targetErr };
  const campaign = beginAction(world, state, args.campaignId, args.actorId);
  if ("error" in campaign) return campaign;
  const spent = spendCash(campaign, args.spend);
  if (spent) {
    campaign.actionPointsRemaining += 1;
    return { error: spent };
  }
  const skill = ownSkill(world, state, campaign.politicianId, "media");
  const sat = 1 - Math.exp(-AD_SPEND.k * (args.spend / AD_SPEND.ref));
  const key = `ad:${args.geography.kind}:${args.geography.id ?? "n"}:${args.messageType}`;
  const dim = diminishingScale(campaign, key, state.currentDate);
  const mag =
    STANDING_DELTA.ad *
    sat *
    (0.5 + skill * 0.5) *
    (0.75 + campaign.mediaCapacity * 0.4) *
    dim *
    (1 + gauss01(rng) * 0.05);
  if (args.messageType === "negative" && args.targetPoliticianId) {
    applyStandingDelta(world, state, args.targetPoliticianId, {
      favorability: -mag * 0.85,
    });
    applyStandingDelta(world, state, campaign.politicianId, {
      momentum: mag * 0.25,
      favorability: -mag * 0.15,
    });
  } else if (args.messageType === "contrast" && args.targetPoliticianId) {
    applyStandingDelta(world, state, campaign.politicianId, {
      favorability: mag * 0.45,
      momentum: mag * 0.3,
    });
    applyStandingDelta(world, state, args.targetPoliticianId, { favorability: -mag * 0.4 });
  } else {
    applyStandingDelta(world, state, campaign.politicianId, {
      nameRecognition: mag * 0.7,
      favorability: mag * 0.5,
      enthusiasm: mag * 0.35,
      momentum: STANDING_DELTA.momentumFromAction * dim,
    });
  }
  campaign.mediaCapacity = Math.min(1, campaign.mediaCapacity + 0.03 * dim);
  pushEffect(campaign, {
    date: state.currentDate,
    kind: key,
    geographyId: args.geography.id,
    targetId: args.targetPoliticianId ?? null,
    magnitude: mag,
  });
  return {
    events: [
      event(
        state,
        "AD_CAMPAIGN",
        [campaign.politicianId],
        [campaign.id],
        {
          campaignId: campaign.id,
          spend: args.spend,
          messageType: args.messageType,
          geography: args.geography,
          effect: mag,
        },
        commandId,
      ),
    ],
  };
}

export function campaignMessage(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  args: {
    campaignId: string;
    issueId?: string | null;
    actorId?: string;
  },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const existing = requireActiveCampaign(state, args.campaignId);
  if ("error" in existing) return existing;
  const actorErr = requireActor(state, existing, args.actorId);
  if (actorErr) return { error: actorErr };
  if (args.issueId && world.issueIds.length > 0 && !world.issueIds.includes(args.issueId)) {
    return { error: reject("UNKNOWN_ISSUE", args.issueId) };
  }
  const campaign = beginAction(world, state, args.campaignId, args.actorId);
  if ("error" in campaign) return campaign;
  const skill = ownSkill(world, state, campaign.politicianId, "media");
  const key = `message:${args.issueId ?? "general"}`;
  const dim = diminishingScale(campaign, key, state.currentDate);
  const mag = STANDING_DELTA.message * (0.5 + skill * 0.5) * dim * (1 + gauss01(rng) * 0.04);
  applyStandingDelta(world, state, campaign.politicianId, {
    favorability: mag * 0.7,
    enthusiasm: mag * 0.5,
    momentum: STANDING_DELTA.momentumFromAction * 0.6 * dim,
  });
  pushEffect(campaign, {
    date: state.currentDate,
    kind: key,
    geographyId: null,
    targetId: null,
    magnitude: mag,
  });
  return {
    events: [
      event(
        state,
        "CAMPAIGN_MESSAGE",
        [campaign.politicianId],
        [campaign.id],
        { campaignId: campaign.id, issueId: args.issueId ?? null, effect: mag },
        commandId,
        0.35,
      ),
    ],
  };
}

export function campaignAttack(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  args: {
    campaignId: string;
    targetPoliticianId: string;
    issueId?: string | null;
    actorId?: string;
  },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const existing = requireActiveCampaign(state, args.campaignId);
  if ("error" in existing) return existing;
  const actorErr = requireActor(state, existing, args.actorId);
  if (actorErr) return { error: actorErr };
  if (!state.politicians[args.targetPoliticianId]) {
    return { error: reject("UNKNOWN_POLITICIAN", args.targetPoliticianId) };
  }
  if (args.targetPoliticianId === existing.politicianId) {
    return { error: reject("INVALID_TARGET", "cannot attack self") };
  }
  if (!isAliveRaceRival(state, existing, args.targetPoliticianId)) {
    return {
      error: reject("INVALID_TARGET", `${args.targetPoliticianId} is not a rival in this race`),
    };
  }
  if (args.issueId && world.issueIds.length > 0 && !world.issueIds.includes(args.issueId)) {
    return { error: reject("UNKNOWN_ISSUE", args.issueId) };
  }
  const campaign = beginAction(world, state, args.campaignId, args.actorId);
  if ("error" in campaign) return campaign;
  const attacker = candidateStandingOrDefault(world, state, campaign.politicianId);
  const target = candidateStandingOrDefault(world, state, args.targetPoliticianId);
  const media = ownSkill(world, state, campaign.politicianId, "media");
  const key = `attack:${args.targetPoliticianId}`;
  const dim = diminishingScale(campaign, key, state.currentDate);
  const roll = rng.float01("campaigns");
  const attackerStrength = ((attacker.favorability + 1) / 2) * 0.5 + media * 0.5;
  const targetVuln = target.nameRecognition * 0.4 + (1 - (target.favorability + 1) / 2) * 0.6;
  const backfire = roll > 0.62 + attackerStrength * 0.25 - 0.1;
  const mag = STANDING_DELTA.attack * dim * (0.55 + attackerStrength);
  if (backfire) {
    applyStandingDelta(world, state, campaign.politicianId, {
      favorability: -STANDING_DELTA.backlash * (0.7 + (1 - attackerStrength)),
      momentum: -0.01,
    });
  } else {
    applyStandingDelta(world, state, args.targetPoliticianId, {
      favorability: -mag * (0.6 + targetVuln * 0.4),
    });
    applyStandingDelta(world, state, campaign.politicianId, {
      momentum: mag * 0.35,
    });
  }
  pushEffect(campaign, {
    date: state.currentDate,
    kind: key,
    geographyId: null,
    targetId: args.targetPoliticianId,
    magnitude: backfire ? -mag : mag,
  });
  return {
    events: [
      event(
        state,
        "CAMPAIGN_ATTACK",
        [campaign.politicianId, args.targetPoliticianId],
        [campaign.id],
        {
          campaignId: campaign.id,
          targetPoliticianId: args.targetPoliticianId,
          issueId: args.issueId ?? null,
          backfire,
          effect: mag,
        },
        commandId,
        0.5,
      ),
    ],
  };
}

export function campaignSeekEndorsement(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  args: { campaignId: string; endorserId?: string; actorId?: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const existing = requireActiveCampaign(state, args.campaignId);
  if ("error" in existing) return existing;
  const actorErr = requireActor(state, existing, args.actorId);
  if (actorErr) return { error: actorErr };
  if (!existing.contestId) {
    return { error: reject("INVALID_CONTEST", "endorsements require a nomination contest") };
  }
  const contest = state.partyContests[existing.contestId];
  if (!contest) return { error: reject("INVALID_CONTEST", existing.contestId) };
  if (args.endorserId === state.playerPoliticianId) {
    return { error: reject("PLAYER_AUTONOMY", "player must endorse explicitly") };
  }
  const method = contestSelectorMethod(contest, world);
  const takenPoliticians = new Set(
    activeEndorsementsForContest(state, contest.id)
      .filter((e) => e.endorserType === "politician" && e.status === "active")
      .map((e) => e.endorserId),
  );
  const takenOrgs = new Set(
    activeEndorsementsForContest(state, contest.id)
      .filter((e) => e.endorserType === "provincial_organization" && e.status === "active")
      .map((e) => e.endorserId),
  );
  const caucusPool = assemblyCaucus(world, state, contest.partyId)
    .filter(
      (id) =>
        id !== existing.politicianId &&
        id !== state.playerPoliticianId &&
        !takenPoliticians.has(id) &&
        state.politicians[id]?.alive &&
        !state.politicians[id]?.retired &&
        !isDeclaredContestCandidate(contest, id) &&
        !politiciansAreActiveRaceRivals(state, id, existing.politicianId),
    )
    .sort();
  const orgPool = world.provinceIds
    .slice()
    .sort()
    .map((provinceId) => provincialOrgId(contest.partyId, provinceId))
    .filter((id) => {
      if (takenOrgs.has(id)) return false;
      const org = resolveProvincialOrganization(world, id);
      return !!org && org.status === "active" && org.partyId === contest.partyId;
    });

  type Ask = { endorserType: "politician" | "provincial_organization"; endorserId: string };
  const asks: Ask[] = [];
  if (args.endorserId) {
    if (args.endorserId === existing.politicianId) {
      return { error: reject("INVALID_TARGET", "cannot seek own endorsement") };
    }
    const org = resolveProvincialOrganization(world, args.endorserId);
    if (org) asks.push({ endorserType: "provincial_organization", endorserId: args.endorserId });
    else if (state.politicians[args.endorserId]) {
      if (
        isDeclaredContestCandidate(contest, args.endorserId) ||
        politiciansAreActiveRaceRivals(state, args.endorserId, existing.politicianId)
      ) {
        return {
          error: reject(
            "ACTIVE_RIVAL",
            `${args.endorserId} cannot endorse a rival while remaining an active candidate in the same race`,
          ),
        };
      }
      asks.push({ endorserType: "politician", endorserId: args.endorserId });
    } else {
      return { error: reject("NO_ENDORSER", args.endorserId) };
    }
  } else if (method === "direct_member_rcv") {
    const orgId = orgPool[0];
    if (!orgId) return { error: reject("NO_ENDORSER", "no unused provincial organization") };
    asks.push({ endorserType: "provincial_organization", endorserId: orgId });
  } else if (method === "closed_member_rcv") {
    for (const id of caucusPool.slice(0, QUALIFICATION.nuBatch)) {
      asks.push({ endorserType: "politician", endorserId: id });
    }
  } else {
    const id = caucusPool[0];
    if (id) asks.push({ endorserType: "politician", endorserId: id });
  }
  if (asks.length === 0) return { error: reject("NO_ENDORSER", "no available endorser") };

  const campaign = beginAction(world, state, args.campaignId, args.actorId);
  if ("error" in campaign) return campaign;
  const events: SimEvent[] = [];
  let received = 0;
  for (const ask of asks) {
    if (ask.endorserId === state.playerPoliticianId) continue;
    if (ask.endorserType === "politician") {
      const chosen = chooseEndorsement(
        world,
        state,
        ask.endorserId,
        contest.id,
        [campaign.politicianId],
        rng,
      );
      if (chosen !== campaign.politicianId) {
        events.push(
          event(
            state,
            "ENDORSEMENT_DECLINED",
            [ask.endorserId, campaign.politicianId],
            [campaign.id, contest.id],
            { campaignId: campaign.id, endorserId: ask.endorserId },
            commandId,
            0.2,
          ),
        );
        continue;
      }
    }
    const made = endorseCandidate(
      state,
      world,
      {
        endorserType: ask.endorserType,
        endorserId: ask.endorserId,
        targetId: campaign.politicianId,
        contestId: contest.id,
      },
      commandId,
    );
    if ("error" in made) continue;
    received += 1;
    events.push(...made.events);
    events.push(
      event(
        state,
        "ENDORSEMENT_RECEIVED",
        [ask.endorserId, campaign.politicianId],
        [campaign.id, contest.id],
        { campaignId: campaign.id, endorserId: ask.endorserId },
        commandId,
        0.55,
      ),
    );
  }
  if (received > 0) {
    applyStandingDelta(world, state, campaign.politicianId, {
      favorability: STANDING_DELTA.endorsement,
      nameRecognition: STANDING_DELTA.endorsement * 0.4,
      momentum: STANDING_DELTA.momentumFromAction,
    });
  }
  return { events };
}

export function campaignSeekNominationSupport(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  args: { campaignId: string; actorId?: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const existing = requireActiveCampaign(state, args.campaignId);
  if ("error" in existing) return existing;
  const actorErr = requireActor(state, existing, args.actorId);
  if (actorErr) return { error: actorErr };
  const need = nominationQualificationNeed(world, state, existing);
  if (need !== "member" && need !== "provincial") {
    return { error: reject("QUALIFICATION_NOT_NEEDED", "no member/provincial milestone remains") };
  }
  const contestId = existing.contestId;
  if (!contestId) return { error: reject("INVALID_CONTEST", "nomination contest required") };
  const campaign = beginAction(world, state, args.campaignId, args.actorId);
  if ("error" in campaign) return campaign;
  const standing = standingPublicScore(world, state, campaign.politicianId);
  const skill = ownSkill(world, state, campaign.politicianId, "campaigning");
  const chance = Math.max(
    0.08,
    Math.min(
      0.92,
      QUALIFICATION.milestoneBase +
        standing * QUALIFICATION.standingWeight +
        skill * QUALIFICATION.skillWeight,
    ),
  );
  const success = rng.float01("campaigns") < chance;
  if (success) {
    const patch =
      need === "member"
        ? { memberNominationRequirementSatisfied: true }
        : { provincialSupportRequirementSatisfied: true };
    setQualificationEvidence(state, contestId, campaign.politicianId, patch);
    applyStandingDelta(world, state, campaign.politicianId, {
      enthusiasm: STANDING_DELTA.endorsement * 0.6,
      momentum: STANDING_DELTA.momentumFromAction * 0.5,
    });
  }
  return {
    events: [
      event(
        state,
        "NOMINATION_SUPPORT_SOUGHT",
        [campaign.politicianId],
        [campaign.id, contestId],
        { campaignId: campaign.id, need, success },
        commandId,
        0.45,
      ),
    ],
  };
}

export function campaignPrepareDebate(
  world: KernelWorld,
  state: SimState,
  args: { campaignId: string; actorId?: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const campaign = beginAction(world, state, args.campaignId, args.actorId);
  if ("error" in campaign) return campaign;
  const skill = ownSkill(world, state, campaign.politicianId, "media");
  campaign.debatePrep = Math.min(1, campaign.debatePrep + 0.28 + skill * 0.12);
  return {
    events: [
      event(
        state,
        "DEBATE_PREPARED",
        [campaign.politicianId],
        [campaign.id],
        { campaignId: campaign.id, debatePrep: campaign.debatePrep },
        commandId,
        0.25,
      ),
    ],
  };
}

export function withdrawCampaign(
  world: KernelWorld,
  state: SimState,
  args: { campaignId: string; actorId?: string },
  commandId: string | null,
): { events: SimEvent[] } | { error: CommandError } {
  const campaign = requireActiveCampaign(state, args.campaignId);
  if ("error" in campaign) return campaign;
  const actorErr = requireActor(state, campaign, args.actorId);
  if (actorErr) return { error: actorErr };
  campaign.status = "withdrawn";
  campaign.endedDate = state.currentDate;
  const events: SimEvent[] = [];
  if (campaign.contestId) {
    const w = withdrawCandidacy(state, campaign.contestId, campaign.politicianId, commandId);
    if (!("error" in w)) events.push(...w.events);
  }
  if (campaign.electionId) {
    const el = state.elections[campaign.electionId];
    if (
      el &&
      (el.status === "planned" || el.status === "field_open" || el.status === "field_finalized")
    ) {
      withdrawUnresolvedCandidacy(el, campaign.politicianId);
      if (campaign.type === "assembly") {
        withdrawAssemblyCandidacy(state, campaign.electionId, campaign.politicianId);
      }
    }
  }
  if (campaign.type === "gubernatorial" && campaign.electionId) {
    const election = state.provincialRuntime.elections[campaign.electionId];
    const candidacy = election?.candidates[campaign.politicianId];
    if (candidacy && election?.status !== "resolved" && election?.status !== "assumed") {
      candidacy.withdrawn = true;
    }
  }
  events.push(
    event(
      state,
      "CAMPAIGN_WITHDRAWN",
      [campaign.politicianId],
      [campaign.id],
      { campaignId: campaign.id, type: campaign.type },
      commandId,
      0.65,
    ),
  );
  return { events };
}

export function reconcileCampaignsAfterCandidacyWithdrawal(
  state: SimState,
  contestId: string,
  politicianId: string,
  commandId: string | null,
): SimEvent[] {
  const events: SimEvent[] = [];
  for (const campaign of Object.values(state.campaignRuntime.campaigns)) {
    if (campaign.contestId !== contestId || campaign.politicianId !== politicianId) continue;
    if (campaign.status !== "active" && campaign.status !== "exploring") continue;
    campaign.status = "withdrawn";
    campaign.endedDate = state.currentDate;
    events.push(
      event(
        state,
        "CAMPAIGN_WITHDRAWN",
        [politicianId],
        [campaign.id],
        { campaignId: campaign.id, type: campaign.type, reason: "candidacy_withdrawn" },
        commandId,
        0.65,
      ),
    );
  }
  return events;
}

export function transitionNominationToGeneral(
  state: SimState,
  world: KernelWorld,
  contestId: string,
  commandId: string | null,
): SimEvent[] {
  const contest = state.partyContests[contestId];
  if (!contest || contest.type !== "presidential_nomination" || contest.status !== "resolved") {
    return [];
  }
  const events: SimEvent[] = [];
  const cycle = presidentialNominationCycleMetadata(contest);
  const election = cycle ? state.elections[cycle.electionId] : undefined;
  for (const campaign of Object.values(state.campaignRuntime.campaigns)) {
    if (campaign.contestId !== contestId || campaign.type !== "presidential_nomination") continue;
    if (campaign.status !== "active" && campaign.status !== "exploring") continue;
    if (contest.winnerId === campaign.politicianId && election) {
      campaign.status = "won";
      campaign.endedDate = state.currentDate;
      const general = createCampaignRecord(state, world, {
        politicianId: campaign.politicianId,
        type: "presidential_general",
        electionId: election.id,
        contestId,
        predecessorCampaignId: campaign.id,
        cashOnHand: campaign.cashOnHand,
        totalRaised: campaign.totalRaised,
        totalSpent: campaign.totalSpent,
        fundraisingCapacity: campaign.fundraisingCapacity,
        fieldOrganization: campaign.fieldOrganization,
        mediaCapacity: campaign.mediaCapacity,
        organizationByConstituency: { ...campaign.organizationByConstituency },
        organizationByProvince: Object.fromEntries(
          Object.entries(campaign.organizationByProvince).map(([id, value]) => [id, value * 0.72]),
        ),
        status: "active",
      });
      events.push(
        event(
          state,
          "CAMPAIGN_LAUNCHED",
          [campaign.politicianId],
          [general.id, election.id],
          {
            campaignId: general.id,
            type: "presidential_general",
            predecessorCampaignId: campaign.id,
            electionId: election.id,
          },
          commandId,
          0.75,
        ),
      );
    } else {
      campaign.status = "lost";
      campaign.endedDate = state.currentDate;
    }
  }
  return events;
}

export function closeGeneralCampaigns(state: SimState, electionId: string, winnerId: string): void {
  for (const campaign of Object.values(state.campaignRuntime.campaigns)) {
    if (campaign.electionId !== electionId || campaign.type !== "presidential_general") continue;
    if (campaign.status !== "active") continue;
    campaign.status = campaign.politicianId === winnerId ? "won" : "lost";
    campaign.endedDate = state.currentDate;
  }
}

export function closeAssemblyCampaigns(
  state: SimState,
  electionId: string,
  winnerIds: readonly string[],
): void {
  const winners = new Set(winnerIds);
  for (const campaign of Object.values(state.campaignRuntime.campaigns)) {
    if (campaign.electionId !== electionId || campaign.type !== "assembly") continue;
    if (campaign.status === "withdrawn") continue;
    if (campaign.status !== "active" && campaign.status !== "exploring") continue;
    campaign.status = winners.has(campaign.politicianId) ? "won" : "lost";
    campaign.endedDate = state.currentDate;
  }
}
